import base64
from concurrent.futures import ThreadPoolExecutor
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt
from app.api import bilge_defter as bd

BASE = "/api/v1/bilge-defter"
OWNER, STUDENT, SECOND = "owner@example.com", "student@example.com", "second@example.com"
ORIGIN = "https://defter.bilgearena.com"

@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("BILGE_DEFTER_DB", str(tmp_path / "isolated.db"))
    monkeypatch.setenv("BILGE_DEFTER_ADMIN_EMAILS", OWNER)
    monkeypatch.setenv("BILGE_DEFTER_ORIGIN", ORIGIN)
    monkeypatch.setenv("BILGE_DEFTER_MAX_STUDENTS", "48")
    monkeypatch.setenv("BILGE_DEFTER_REGISTRATION_MODE", "application")
    monkeypatch.setenv("BILGE_DEFTER_EDGE_SYNC", "0")
    monkeypatch.setattr(bd, "ACCESS_TEAM", "test-team")
    monkeypatch.setattr(bd, "ACCESS_AUD", "test-aud")
    monkeypatch.setattr(bd, "_notify_other_devices", lambda *args: None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub = key.public_key().public_numbers()
    encode = lambda x: base64.urlsafe_b64encode(x.to_bytes((x.bit_length()+7)//8, "big")).rstrip(b"=").decode()
    monkeypatch.setattr(bd, "_fetch_certs", lambda: [{"kid": "test", "kty": "RSA", "alg": "RS256", "n": encode(pub.n), "e": encode(pub.e)}])
    app = FastAPI(); app.include_router(bd.router)
    with TestClient(app) as client:
        yield client, key

def headers(env, email=STUDENT, account=None, claims=None):
    data = {"email": email, "sub": "id-"+email, "aud": "test-aud", "iss": "https://test-team.cloudflareaccess.com", "exp": 4102444800}
    data.update(claims or {})
    for key in list(data):
        if data[key] is None: del data[key]
    token = jwt.encode(data, env[1], algorithm="RS256", headers={"kid": "test"})
    return {"Cf-Access-Jwt-Assertion": token, "Origin": ORIGIN, "X-Bilge-Request": "1", **({"X-Bilge-Account": account} if account else {})}

def owner_headers(env):
    account = env[0].get(BASE+"/whoami", headers=headers(env, OWNER)).json()["identity"]
    return headers(env, OWNER, account["id"])

def approved(env, email=STUDENT):
    account = env[0].post(BASE+"/registration", headers=headers(env, email)).json()["identity"]
    response = env[0].post(BASE+"/admin/members/"+account["id"], headers=owner_headers(env), json={"status": "approved"})
    assert response.status_code == 200
    return headers(env, email, account["id"])

def payload(value=b"encrypted notebook"):
    encode = lambda x: base64.b64encode(x).decode()
    return {"ciphertext": encode(value), "iv": encode(b"i"*12), "salt": encode(b"s"*16), "kdf": "pbkdf2-sha256-250000", "updated_at": "2026-09-23T12:00:00Z"}

def test_registration_requires_email_auth(env):
    assert env[0].post(BASE+"/registration", headers={"Origin": ORIGIN, "X-Bilge-Request": "1"}).status_code == 401

def test_signup_is_pending_and_idempotent(env):
    a=env[0].post(BASE+"/registration", headers=headers(env), json={"role":"admin","status":"approved"})
    b=env[0].post(BASE+"/registration", headers=headers(env))
    assert a.json()==b.json()
    assert a.json()["identity"]["status"]=="pending"
    assert a.json()["identity"]["role"]=="student"

@pytest.mark.parametrize("path,method",[("/backup","get"),("/backup","post"),("/ocr","post"),("/vapid-key","get"),("/push-subscription","post"),("/admin/members","get")])
def test_pending_cannot_use_protected_endpoints(env,path,method):
    env[0].post(BASE+"/registration",headers=headers(env))
    assert getattr(env[0],method)(BASE+path,headers=headers(env)).status_code==403

def test_approved_student_cannot_admin(env):
    h=approved(env)
    assert env[0].get(BASE+"/admin/members",headers=h).status_code==403
    assert env[0].post(BASE+"/admin/members/anything",headers=h,json={"status":"approved"}).status_code==403

def test_suspend_and_reject_remain_denied(env):
    h=approved(env)
    for status in ["suspended","rejected"]:
        assert env[0].post(BASE+"/admin/members/"+h["X-Bilge-Account"],headers=owner_headers(env),json={"status":status}).status_code==200
        assert env[0].get(BASE+"/backup",headers=h).status_code==403
        assert env[0].post(BASE+"/registration",headers=headers(env)).json()["identity"]["status"]==status

def test_owner_is_not_first_signup_and_missing_config_fails(env,monkeypatch):
    monkeypatch.delenv("BILGE_DEFTER_ADMIN_EMAILS")
    assert env[0].post(BASE+"/registration",headers=headers(env)).status_code==503

@pytest.mark.parametrize("claims",[{"exp":None},{"exp":1},{"aud":"other"},{"iss":"https://other"},{"sub":None},{"email":23}])
def test_jwt_required_claims(env,claims):
    assert env[0].get(BASE+"/whoami",headers=headers(env,claims=claims)).status_code==401

def test_forged_header_rejected(env):
    assert env[0].get(BASE+"/backup",headers={"Cf-Access-Authenticated-User-Email":OWNER}).status_code==401

def test_csrf_and_account_switch_guard(env):
    h=approved(env)
    assert env[0].post(BASE+"/backup",headers={**h,"Origin":"https://evil.example"},json=payload()).status_code==403
    assert env[0].post(BASE+"/backup",headers={k:v for k,v in h.items() if k!="X-Bilge-Request"},json=payload()).status_code==403
    assert env[0].get(BASE+"/backup",headers={**h,"X-Bilge-Account":"another-account"}).status_code==409

def test_cas_create_update_stale_and_legacy_denial(env):
    h=approved(env);c=env[0]
    missing=c.get(BASE+"/backup",headers=h)
    assert missing.status_code==404 and missing.headers["X-Bilge-Sync-Protocol"]=="cas-v1"
    assert c.post(BASE+"/backup",headers=h,json=payload()).status_code==428
    first=c.post(BASE+"/backup",headers={**h,"If-None-Match":"*"},json=payload())
    assert first.status_code==200
    tag=first.headers["ETag"]
    assert c.post(BASE+"/backup",headers={**h,"If-None-Match":"*"},json=payload(b"wrong")).status_code==412
    second=c.post(BASE+"/backup",headers={**h,"If-Match":tag},json=payload(b"new"))
    assert second.status_code==200 and second.headers["ETag"]!=tag
    assert c.post(BASE+"/backup",headers={**h,"If-Match":tag},json=payload(b"stale")).status_code==412
    assert c.get(BASE+"/backup",headers=h).json()["ciphertext"]==payload(b"new")["ciphertext"]

def test_accounts_cannot_read_each_other(env):
    a,b=approved(env),approved(env,SECOND);c=env[0]
    assert c.post(BASE+"/backup",headers={**a,"If-None-Match":"*"},json=payload()).status_code==200
    assert c.get(BASE+"/backup",headers=b).status_code==404
    assert c.get(BASE+"/backup",headers={**b,"X-Bilge-Account":a["X-Bilge-Account"]}).status_code==409

def test_concurrent_create_and_update_only_one_wins(env):
    h=approved(env);c=env[0]
    def post(i,condition): return c.post(BASE+"/backup",headers={**h,**condition},json=payload(str(i).encode()))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda i:post(i,{"If-None-Match":"*"}),range(2)))
    assert sorted(r.status_code for r in results)==[200,412]
    tag=c.get(BASE+"/backup",headers=h).headers["ETag"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda i:post(i,{"If-Match":tag}),range(2)))
    assert sorted(r.status_code for r in results)==[200,412]

def test_legacy_backup_preserved_and_can_be_conditionally_upgraded(env):
    h=approved(env);db=bd.get_conn(bd._db_path());bd._ensure_backup_table(db)
    p=payload();db.execute("INSERT INTO bilge_defter_backups VALUES(?,?,?,?,?,?,?)",(STUDENT,p["ciphertext"],p["iv"],p["salt"],p["kdf"],p["updated_at"],"legacy"));db.commit();db.close()
    r=env[0].get(BASE+"/backup",headers=h);assert r.status_code==200 and r.json()["stored_at"]=="legacy"
    assert env[0].post(BASE+"/backup",headers={**h,"If-Match":r.headers["ETag"]},json=payload(b"upgraded")).status_code==200

def test_notify_failure_does_not_report_saved_backup_as_failed(env,monkeypatch):
    h=approved(env)
    def fail(*args):raise RuntimeError("synthetic push failure")
    monkeypatch.setattr(bd,"_notify_other_devices",fail)
    r=env[0].post(BASE+"/backup",headers={**h,"If-None-Match":"*"},json=payload())
    assert r.status_code==200 and r.json()["notified"] is False

def test_admin_list_excludes_note_data(env):
    approved(env)
    r=env[0].get(BASE+"/admin/members",headers=owner_headers(env))
    assert r.status_code==200 and "ciphertext" not in r.text
    assert r.headers["cache-control"]=="no-store"

def test_push_disabled_for_class_pilot(env):
    h=approved(env)
    assert env[0].get(BASE+"/vapid-key",headers=h).status_code==503
    assert env[0].post(BASE+"/push-subscription",headers=h,json={"device_id":"test","subscription":{"endpoint":"https://127.0.0.1"}}).status_code==503

def test_two_configured_admins_can_manage_but_not_revoke_each_other(env, monkeypatch):
    other_owner="other-owner@example.com"
    monkeypatch.setenv("BILGE_DEFTER_ADMIN_EMAILS", OWNER+","+other_owner)
    c=env[0]
    identities=[c.get(BASE+"/whoami",headers=headers(env,email)).json()["identity"] for email in (OWNER,other_owner)]
    assert identities[0]["id"]!=identities[1]["id"]
    for identity in identities:
        assert identity["role"]=="admin" and identity["status"]=="approved"
    student=c.post(BASE+"/registration",headers=headers(env)).json()["identity"]
    assert student["role"]=="student" and student["status"]=="pending"
    for actor,target in [(identities[0],identities[1]),(identities[1],identities[0])]:
        h=headers(env,actor["email"],actor["id"])
        assert c.get(BASE+"/admin/members",headers=h).status_code==200
        assert c.post(BASE+"/admin/members/"+student["id"],headers=h,json={"status":"approved"}).status_code==200
        assert c.post(BASE+"/admin/members/"+target["id"],headers=h,json={"status":"suspended"}).status_code==409

def seed_approved_students(env, count):
    owner_headers(env)
    db=bd.get_conn(bd._db_path())
    db.executemany("INSERT INTO bilge_defter_members VALUES(?,?,?,?,?,?)",[(f"seed-{i}",f"seed-{i}@example.com","approved","test","test",OWNER) for i in range(count)])
    db.commit();db.close()

def test_48_students_limit_is_atomic_and_existing_approval_is_idempotent(env):
    seed_approved_students(env,47)
    c=env[0];owner=owner_headers(env)
    ids=[c.post(BASE+"/registration",headers=headers(env,email)).json()["identity"]["id"] for email in (STUDENT,SECOND)]
    def approve(member_id):return c.post(BASE+"/admin/members/"+member_id,headers=owner,json={"status":"approved"})
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(approve,ids))
    assert sorted(r.status_code for r in results)==[200,422]
    winning_id=ids[next(i for i,r in enumerate(results) if r.status_code==200)]
    assert approve(winning_id).status_code==200
    listing=c.get(BASE+"/admin/members",headers=owner).json()
    assert listing["capacity"]=={"approved_students":48,"listed_students":49,"student_limit":48,"reserved_admins":2,"cloudflare_seats_verified":False}

def test_suspension_releases_only_application_slot(env):
    seed_approved_students(env,48);c=env[0];owner=owner_headers(env)
    member=c.post(BASE+"/registration",headers=headers(env)).json()["identity"]
    endpoint=BASE+"/admin/members/"+member["id"]
    assert c.post(endpoint,headers=owner,json={"status":"approved"}).status_code==422
    assert c.post(BASE+"/admin/members/seed-0",headers=owner,json={"status":"suspended"}).status_code==200
    assert c.post(endpoint,headers=owner,json={"status":"approved"}).status_code==200
    assert c.get(BASE+"/admin/members",headers=owner).json()["capacity"]["cloudflare_seats_verified"] is False

@pytest.mark.parametrize("value",["0","49","-1","bad"])
def test_invalid_student_limit_fails_closed(env,monkeypatch,value):
    monkeypatch.setenv("BILGE_DEFTER_MAX_STUDENTS",value)
    assert env[0].get(BASE+"/whoami",headers=headers(env,OWNER)).status_code==503

def test_third_admin_fails_closed(env,monkeypatch):
    monkeypatch.setenv("BILGE_DEFTER_ADMIN_EMAILS",OWNER+",second-admin@example.com,third-admin@example.com")
    assert env[0].get(BASE+"/whoami",headers=headers(env,OWNER)).status_code==503


def test_manual_add_normalizes_deduplicates_and_preserves_status(env):
    c=env[0];owner=owner_headers(env)
    first=c.post(BASE+"/admin/students",headers=owner,json={"email":" Student@Example.com "})
    assert first.status_code==200
    data=first.json();assert data["created"] is True and data["edge_access"]=="not_verified"
    assert data["member"]["email"]==STUDENT and data["member"]["status"]=="pending"
    endpoint=BASE+"/admin/members/"+data["member"]["id"]
    for state in ["pending","approved","suspended","rejected"]:
        if state!="pending":assert c.post(endpoint,headers=owner,json={"status":state}).status_code==200
        again=c.post(BASE+"/admin/students",headers=owner,json={"email":STUDENT}).json()
        assert again["created"] is False and again["member"]["status"]==state
        assert again["member"]["id"]==data["member"]["id"]
    assert c.get(BASE+"/admin/members",headers=owner).json()["capacity"]["listed_students"]==1


@pytest.mark.parametrize("email",["", "*", "*@example.com", "bad", "x@example.com,y@example.com", "x@example.com\ny@example.com", "x"*250+"@example.com",OWNER])
def test_manual_add_rejects_invalid_or_admin_address(env,email):
    assert env[0].post(BASE+"/admin/students",headers=owner_headers(env),json={"email":email}).status_code==422


def test_student_cannot_add_or_export_roster(env):
    h=approved(env);c=env[0]
    assert c.post(BASE+"/admin/students",headers=h,json={"email":SECOND}).status_code==403
    assert c.get(BASE+"/admin/allowlist",headers=h).status_code==403


def test_invitation_only_default_blocks_self_registration(env,monkeypatch):
    monkeypatch.delenv("BILGE_DEFTER_REGISTRATION_MODE")
    c=env[0];h=headers(env)
    info=c.get(BASE+"/whoami",headers=h).json()
    assert info["registration_mode"]=="invitation" and info["identity"]["status"]=="unregistered"
    assert c.post(BASE+"/registration",headers=h).status_code==403
    owner=owner_headers(env)
    added=c.post(BASE+"/admin/students",headers=owner,json={"email":STUDENT}).json()["member"]
    assert c.post(BASE+"/registration",headers=h).json()["identity"]["status"]=="pending"
    assert c.get(BASE+"/backup",headers=headers(env,STUDENT,added["id"])).status_code==403
    assert c.post(BASE+"/admin/members/"+added["id"],headers=owner,json={"status":"approved"}).status_code==200
    assert c.get(BASE+"/whoami",headers=h).json()["identity"]["id"]==added["id"]
    assert c.get(BASE+"/backup",headers=headers(env,STUDENT,added["id"])).status_code==404


def test_last_manual_roster_slot_is_atomic_and_suspension_does_not_free_it(env):
    seed_approved_students(env,47);c=env[0];owner=owner_headers(env)
    def add(email):return c.post(BASE+"/admin/students",headers=owner,json={"email":email})
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(add,[STUDENT,SECOND]))
    assert sorted(r.status_code for r in results)==[200,422]
    winner=next(r.json()["member"] for r in results if r.status_code==200)
    assert add(winner["email"]).status_code==200
    for state in ["suspended","rejected"]:
        assert c.post(BASE+"/admin/members/"+winner["id"],headers=owner,json={"status":state}).status_code==200
        assert add("another@example.com").status_code==422
    cap=c.get(BASE+"/admin/members",headers=owner).json()["capacity"]
    assert cap["listed_students"]==48 and cap["approved_students"]==47


def test_export_is_approved_only_includes_unvisited_admin_and_has_no_edge_claim(env,monkeypatch):
    monkeypatch.setenv("BILGE_DEFTER_ADMIN_EMAILS",OWNER+",other-owner@example.com")
    c=env[0];owner=owner_headers(env)
    first=c.post(BASE+"/admin/students",headers=owner,json={"email":STUDENT}).json()["member"]
    c.post(BASE+"/admin/students",headers=owner,json={"email":SECOND})
    endpoint=BASE+"/admin/members/"+first["id"]
    assert c.post(endpoint,headers=owner,json={"status":"approved"}).status_code==200
    result=c.get(BASE+"/admin/allowlist",headers=owner)
    assert result.status_code==200 and result.headers["cache-control"]=="no-store"
    assert result.json()["emails"]==sorted([OWNER,"other-owner@example.com",STUDENT])
    assert result.json()["edge_access"]=="not_verified"
    for state in ["suspended","rejected"]:
        c.post(endpoint,headers=owner,json={"status":state})
        assert STUDENT not in c.get(BASE+"/admin/allowlist",headers=owner).json()["emails"]


def test_classroom_burst_fifty_manual_additions_never_exceed_48(env):
    c=env[0];owner=owner_headers(env)
    def add(i):return c.post(BASE+"/admin/students",headers=owner,json={"email":f"load-{i}@example.com"})
    with ThreadPoolExecutor(max_workers=10) as pool:results=list(pool.map(add,range(50)))
    assert sum(r.status_code==200 for r in results)==48
    assert sum(r.status_code==422 for r in results)==2
    assert c.get(BASE+"/admin/members",headers=owner).json()["capacity"]["listed_students"]==48
