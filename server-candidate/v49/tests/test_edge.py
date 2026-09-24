import copy
import json
import httpx
import pytest
from app.api import bilge_defter_edge as edge
from app.api import bilge_defter as bd
from test_accounts_cas import env, owner_headers, approved, headers, BASE, OWNER, STUDENT


@pytest.fixture
def cloud(env, monkeypatch, tmp_path):
    monkeypatch.setenv("BILGE_DEFTER_EDGE_SYNC", "1")
    token=tmp_path/"token";token.write_text("synthetic-test-token")
    for name,value in {"ACCOUNT":"account", "APP":"app", "POLICY":"policy", "IDP":"idp", "TOKEN_FILE":str(token)}.items():
        monkeypatch.setenv("BILGE_DEFTER_CF_"+name,value)
    monkeypatch.setenv("BILGE_DEFTER_ACCESS_AUD","test-aud")
    state={"policy":{"id":"policy","name":"classroom","decision":"allow","include":[{"email":{"email":OWNER}}],"exclude":[],"require":[],"precedence":1},"users":[],"puts":[],"extra":False,"failed":False,"bad_readback":False,"free":True}
    def handler(request):
        assert request.url.host=="api.cloudflare.com"
        assert request.headers["Authorization"]=="Bearer synthetic-test-token"
        route=request.url.path
        if state["failed"]:return httpx.Response(403,json={"success":False})
        if route.endswith("/access/apps/app"):
            result={"id":"app","domain":"defter.bilgearena.com","type":"self_hosted","aud":"test-aud","allowed_idps":["idp"]}
        elif route.endswith("/policies/policy"):
            assert request.method=="PUT"
            state["puts"].append(json.loads(request.content))
            if not state["bad_readback"]:state["policy"].update(json.loads(request.content))
            result=state["policy"]
        elif route.endswith("/policies"):
            result=[copy.deepcopy(state["policy"])]
            if state["extra"]:result.append({"decision":"bypass"})
        elif route.endswith("/subscriptions"):
            result=[{"rate_plan":{"id":"teams_free" if state["free"] else "paid"},"price":0,"component_values":[{"name":"users","value":50}]}]
        elif route.endswith("/access/users"):
            return httpx.Response(200,json={"success":True,"result":state["users"],"result_info":{"total_pages":1}})
        else:raise AssertionError(route)
        return httpx.Response(200,json={"success":True,"result":result})
    real_client=httpx.Client
    monkeypatch.setattr(edge.httpx,"Client",lambda **kwargs:real_client(transport=httpx.MockTransport(handler),**kwargs))
    return state


def add(env,email=STUDENT):
    return env[0].post(BASE+"/admin/students",headers=owner_headers(env),json={"email":email}).json()["member"]


def decide(env,member,status):
    return env[0].post(BASE+"/admin/members/"+member["id"],headers=owner_headers(env),json={"status":status})


def test_approval_and_suspension_reconcile_only_target_policy(env,cloud):
    member=add(env)
    assert cloud["puts"]==[]
    result=decide(env,member,"approved")
    assert result.status_code==200 and result.json()["edge"]["state"]=="verified"
    assert cloud["puts"][0]["include"]==[{"email":{"email":OWNER}},{"email":{"email":STUDENT}}]
    listing=env[0].get(BASE+"/admin/members",headers=owner_headers(env)).json()
    assert listing["edge"]["state"]=="verified" and "emails" not in listing["edge"]
    assert decide(env,member,"suspended").json()["edge"]["state"]=="verified"
    assert cloud["puts"][-1]["include"]==[{"email":{"email":OWNER}}]
    assert env[0].get(BASE+"/backup",headers=headers(env,STUDENT,member["id"])).status_code==403


@pytest.mark.parametrize("fault",["failed","extra","bad_readback"])
def test_failure_never_claims_ready_and_keeps_application_decision(env,cloud,fault):
    member=add(env);cloud[fault]=True
    result=decide(env,member,"approved").json()
    assert result["status"]=="approved" and result["edge"]["state"]=="pending"
    if fault!="bad_readback":assert not cloud["puts"]
    cloud[fault]=False
    assert env[0].post(BASE+"/admin/access-sync",headers=owner_headers(env)).json()["state"]=="verified"


@pytest.mark.parametrize("fault",["everyone","unknown_email","require","approval_required"])
def test_unexpected_policy_is_never_overwritten(env,cloud,fault):
    member=add(env)
    if fault=="everyone":cloud["policy"]["include"]=[{"everyone":{}}]
    elif fault=="unknown_email":cloud["policy"]["include"].append({"email":{"email":"unrelated@example.com"}})
    elif fault=="require":cloud["policy"]["require"]=[{"ip":{"ip":"1.2.3.4"}}]
    else:cloud["policy"][fault]=True
    assert decide(env,member,"approved").json()["edge"]["state"]=="pending"
    assert not cloud["puts"]


def test_whole_organization_quota_blocks_add_but_allows_revocation(env,cloud):
    member=add(env)
    cloud["users"]=[{"email":f"other{i}@example.com","access_seat":True} for i in range(49)]
    assert decide(env,member,"approved").json()["edge"]["state"]=="pending"
    assert not cloud["puts"]
    cloud["policy"]["include"].append({"email":{"email":STUDENT}})
    assert decide(env,member,"suspended").json()["edge"]["state"]=="verified"
    assert cloud["puts"][-1]["include"]==[{"email":{"email":OWNER}}]


def test_unverified_free_plan_blocks_write(env,cloud):
    cloud["free"]=False
    assert decide(env,add(env),"approved").json()["edge"]["state"]=="pending"
    assert not cloud["puts"]


def test_student_cannot_sync_external_permissions(env,cloud):
    member=add(env);decide(env,member,"approved")
    assert env[0].post(BASE+"/admin/access-sync",headers=headers(env,STUDENT,member["id"])).status_code==403


def test_revocation_blocks_local_access_even_when_cloudflare_is_unavailable(env,cloud):
    member=add(env);decide(env,member,"approved");cloud["failed"]=True
    assert decide(env,member,"suspended").json()["edge"]["state"]=="pending"
    assert env[0].get(BASE+"/backup",headers=headers(env,STUDENT,member["id"])).status_code==403
