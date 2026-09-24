"""Narrow reconciler for one Access application. Never changes plans or seats.

SQLite keeps application authorization authoritative on revocation. A failed
external write is reported as pending, never as a successful invitation.
"""
import json
import os
import threading
from pathlib import Path

import httpx
from fastapi import HTTPException
from app.api import bilge_defter_access as members

_lock = threading.Lock()  # Production service deliberately runs one worker.


def enabled():
    return os.environ.get("BILGE_DEFTER_EDGE_SYNC") == "1"


def _settings():
    values = {k: os.environ.get("BILGE_DEFTER_CF_" + k, "") for k in ("ACCOUNT", "APP", "POLICY", "IDP", "TOKEN_FILE")}
    if not all(values.values()):
        raise HTTPException(503, "Giriş izni bağlantısı yapılandırılmadı.")
    return values


def _desired(db):
    return sorted(members.admins() | {r[0] for r in db.execute("SELECT email FROM bilge_defter_members WHERE status='approved'")})


def _table(db):
    db.execute("CREATE TABLE IF NOT EXISTS bilge_defter_edge_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)")
    db.commit()


def status(db):
    _table(db)
    row = db.execute("SELECT payload FROM bilge_defter_edge_state WHERE id=1").fetchone()
    info = json.loads(row[0]) if row else {"state": "not_verified", "detail": "Giriş izinleri henüz doğrulanmadı."}
    if info.get("state") == "verified" and info.get("emails") != _desired(db):
        info = {"state": "pending", "detail": "Onay listesi değişti; giriş izinleri yeniden uygulanmalı."}
    return {k: v for k, v in info.items() if k != "emails"}


def _save(path, info):
    db = members.connect(path)
    try:
        _table(db)
        db.execute("INSERT INTO bilge_defter_edge_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", (json.dumps(info),))
        db.commit()
    finally:
        db.close()


def _api(client, method, route, body=None):
    try:
        response = client.request(method, route, json=body)
        data = response.json()
        if response.status_code >= 400 or data.get("success") is not True:
            raise ValueError()
        return data
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Cloudflare işlemi doğrulanamadı. Uygulama kararı korundu; giriş iznini yeniden denetleyin.") from None


def _emails(policy, config, known):
    if policy.get("id") != config["POLICY"] or policy.get("decision") != "allow" or policy.get("exclude") or policy.get("require") or policy.get("reusable"):
        raise HTTPException(503, "Giriş kuralı beklenen dar e-posta listesi değil; değiştirilmedi.")
    if any(policy.get(k) for k in ("approval_required", "approval_groups", "isolation_required", "purpose_justification_required", "session_duration")):
        raise HTTPException(503, "Giriş kuralında ek güvenlik koşulu var; değiştirilmedi.")
    emails = []
    for rule in policy.get("include", []):
        if set(rule) != {"email"} or set(rule["email"]) != {"email"}:
            raise HTTPException(503, "Giriş kuralında farklı koşul var; değiştirilmedi.")
        emails.append(rule["email"]["email"].lower())
    if not emails or len(emails) != len(set(emails)) or not set(emails) <= known or not members.admins() <= set(emails):
        raise HTTPException(503, "Giriş listesi beklenmedik şekilde değişmiş; otomatik yazma durduruldu.")
    return sorted(emails)


def reconcile(path, actor):
    members.require_admin(path, actor)
    if not enabled():
        return {"state": "not_configured", "detail": "Otomatik giriş izni henüz etkin değil."}
    if not _lock.acquire(blocking=False):
        return {"state": "pending", "detail": "Başka bir izin işlemi sürüyor; yeniden denetleyin."}
    try:
        config = _settings()
        try:
            token = Path(config["TOKEN_FILE"]).read_text().strip()
        except OSError:
            raise HTTPException(503, "Giriş izni anahtarı okunamadı.") from None
        if not token:
            raise HTTPException(503, "Giriş izni anahtarı boş.")
        base = "https://api.cloudflare.com/client/v4/accounts/" + config["ACCOUNT"] + "/"
        with httpx.Client(base_url=base, headers={"Authorization": "Bearer " + token}, timeout=10, follow_redirects=False, trust_env=False) as client:
            for attempt in range(3):
                db = members.connect(path)
                try:
                    desired = _desired(db)
                    known = members.admins() | {r[0] for r in db.execute("SELECT email FROM bilge_defter_members")}
                finally:
                    db.close()
                if len(set(desired)-members.admins()) > members.student_limit() or len(desired) > 50:
                    raise HTTPException(422, "Onaylı liste ücretsiz kontenjanı aşıyor.")
                app_route = "access/apps/" + config["APP"]
                app = _api(client, "GET", app_route)["result"]
                if app.get("id") != config["APP"] or app.get("domain") != "defter.bilgearena.com" or app.get("type") != "self_hosted" or app.get("aud") != os.environ.get("BILGE_DEFTER_ACCESS_AUD") or app.get("allowed_idps") != [config["IDP"]]:
                    raise HTTPException(503, "Uygulama kimlik düzeni değişmiş; izin yazılmadı.")
                policies = _api(client, "GET", app_route + "/policies")["result"]
                if len(policies) != 1:
                    raise HTTPException(503, "Beklenmeyen ek giriş kuralı var; izin yazılmadı.")
                policy = policies[0]
                current = _emails(policy, config, known)
                subscriptions = _api(client, "GET", "subscriptions")["result"]
                plans = [p for p in subscriptions if p.get("rate_plan", {}).get("id") == "teams_free"]
                if len(plans) != 1 or plans[0].get("price") != 0 or not any(v.get("name") == "users" and v.get("value") == 50 for v in plans[0].get("component_values", [])):
                    raise HTTPException(503, "Ücretsiz 50 kullanıcı planı doğrulanamadı; izin yazılmadı.")
                occupied = set()
                for page in range(1, 11):
                    users = _api(client, "GET", f"access/users?per_page=100&page={page}")
                    for user in users["result"]:
                        if user.get("access_seat") or user.get("gateway_seat"):
                            if not user.get("email"):
                                raise HTTPException(503, "Kullanıcı kotası doğrulanamadı.")
                            occupied.add(user["email"].lower())
                    if page >= users.get("result_info", {}).get("total_pages", 999):
                        break
                else:
                    raise HTTPException(503, "Kullanıcı kotasının tamamı okunamadı.")
                # Removing access remains possible even when another app has consumed seats.
                if set(desired)-set(current) and len(occupied | set(desired)) > 50:
                    raise HTTPException(422, "Kuruluş kotasında yeterli ücretsiz yer yok; yeni giriş izni açılmadı.")
                if current != desired:
                    payload = {k: policy[k] for k in ("name", "decision", "precedence", "exclude", "require") if k in policy}
                    payload["include"] = [{"email": {"email": email}} for email in desired]
                    _api(client, "PUT", app_route + "/policies/" + config["POLICY"], payload)
                checked = _api(client, "GET", app_route + "/policies")["result"]
                if len(checked) != 1 or _emails(checked[0], config, known) != desired:
                    raise HTTPException(503, "Giriş kuralı yazıldıktan sonra doğrulanamadı; yeniden denetleyin.")
                db = members.connect(path)
                try:
                    unchanged = _desired(db) == desired
                finally:
                    db.close()
                if unchanged:
                    info = {"state": "verified", "emails": desired, "checked_at": members.now(), "seats_observed": len(occupied), "allowed": len(desired), "detail": "Onaylı giriş listesi Cloudflare üzerinde doğrulandı. Öğrenci bağlantıyı açıp e-posta koduyla giriş yapabilir."}
                    _save(path, info)
                    return {k: v for k, v in info.items() if k != "emails"}
            raise HTTPException(503, "Liste işlem sırasında değişti; izinleri yeniden denetleyin.")
    except HTTPException as exc:
        info = {"state": "pending", "detail": exc.detail}
        _save(path, info)
        return info
    except Exception:
        info = {"state": "pending", "detail": "Giriş izni tamamlanamadı. Uygulama kararı korundu; yeniden denetleyin."}
        _save(path, info)
        return info
    finally:
        _lock.release()
