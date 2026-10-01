"""
Bilge Defter kimlik, sifreli yedek ve push bildirim API'si.

Davetli adreste (defter.bilgearena.com) Cloudflare Access JWT'sini dogrular.
Yedek uclari YALNIZ dogrulanmis Access kimligiyle calisir; ozel adresten gelen
istekler fail-closed 401 alir. Sunucu yalniz sifreli yigin saklar; duz metin
not verisi asla alinmaz ve depolanmaz. Push bildirimi yalniz "yeni yedek var"
zaman damgasini tasir; icerik sifreli kalir.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
import secrets
import subprocess
import struct
import threading
import zlib
import time
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from httpx import Client
from jose import jwt
from jose.exceptions import JWTError
from pydantic import BaseModel
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from app.core.config import read_env_var
from app.db.data_layer import MEMORY_DB, get_conn
from app.api import bilge_defter_access as members
from app.api import bilge_defter_store as backup_store
from app.api import bilge_defter_edge as edge
ACCESS_TEAM = read_env_var("BILGE_DEFTER_ACCESS_TEAM")
ACCESS_AUD = read_env_var("BILGE_DEFTER_ACCESS_AUD")
VAPID_PRIVATE_KEY = read_env_var("BILGE_DEFTER_VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = read_env_var("BILGE_DEFTER_VAPID_PUBLIC_KEY")
VAPID_FILE = "/opt/linux-ai-server/data/bilge_defter_vapid.json"
VAPID_MAILTO = "mailto:bilge@bilgearena.com"

def account_guard(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = os.environ.get("BILGE_DEFTER_ORIGIN", "https://defter.bilgearena.com")
        if request.headers.get("origin") != origin or request.headers.get("x-bilge-request") != "1":
            raise HTTPException(403, "Gecersiz istek kaynagi")
    if request.url.path.endswith(("/whoami", "/registration")):
        return
    identity = _require_access(request.headers.get("cf-access-jwt-assertion"))
    if request.headers.get("x-bilge-account") != identity["id"]:
        raise HTTPException(409, "Hesap degisti; uygulamayi yeniden acin")
    if request.url.path.endswith(("/vapid-key", "/push-subscription")):
        raise HTTPException(503, "Sinif pilotunda push bildirimleri kapali")


router = APIRouter(prefix="/api/v1/bilge-defter", tags=["bilge-defter"], dependencies=[Depends(account_guard)])

_certs_cache: dict = {"keys": [], "fetched": 0.0}
_CERTS_TTL = 3600.0
MAX_BACKUP_BYTES = 5 * 1024 * 1024
_B64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
KDF_ALLOWED = {"pbkdf2-sha256-250000"}


def _db_path() -> str:
    return os.environ.get("BILGE_DEFTER_DB") or MEMORY_DB


def _fetch_certs() -> list[dict]:
    if (
        _certs_cache["fetched"]
        and time.time() - _certs_cache["fetched"] < _CERTS_TTL
        and _certs_cache["keys"]
    ):
        return _certs_cache["keys"]
    if not ACCESS_TEAM:
        raise HTTPException(status_code=503, detail="Sunucu kimlik yapilandirmasi eksik (ACCESS_TEAM)")
    url = f"https://{ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs"
    with Client(timeout=10) as client:
        response = client.get(url)
        response.raise_for_status()
    keys = response.json().get("keys", [])
    if not keys:
        raise HTTPException(status_code=503, detail="Cloudflare Access anahtari alinamadi")
    _certs_cache["keys"] = keys
    _certs_cache["fetched"] = time.time()
    return keys


def _verify_access(assertion: str) -> dict:
    if not ACCESS_TEAM or not ACCESS_AUD:
        raise HTTPException(status_code=503, detail="Sunucu kimlik yapilandirmasi eksik")
    try:
        kid = jwt.get_unverified_header(assertion).get("kid")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Gecersiz Access belirteci") from exc
    keys = _fetch_certs()
    key = next((k for k in keys if k.get("kid") == kid), None)
    if key is None:
        _certs_cache["fetched"] = 0.0
        key = next((k for k in _fetch_certs() if k.get("kid") == kid), None)
    if key is None:
        raise HTTPException(status_code=401, detail="Access imzalama anahtari bulunamadi")
    issuer = f"https://{ACCESS_TEAM}.cloudflareaccess.com"
    try:
        claims = jwt.decode(assertion, key, algorithms=["RS256"], audience=ACCESS_AUD, issuer=issuer,
                            options={"require_exp": True, "require_aud": True, "require_iss": True, "require_sub": True})
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Access belirteci dogrulanamadi") from exc
    email = claims.get("email")
    if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=401, detail="Access belirtecinde e-posta yok")
    return {"type": "access", "email": email.lower()}


def _require_access(assertion: str | None) -> dict:
    if not assertion:
        raise HTTPException(status_code=401, detail="Yedek islemleri yalniz dogrulanmis davetli kimlikle yapilir")
    identity = _verify_access(assertion)
    return {**identity, **members.require(_db_path(), identity["email"])}


def _record_user(email: str) -> None:
    now = datetime.now(UTC).replace(tzinfo=None).isoformat(timespec="seconds")
    db = get_conn(_db_path())
    try:
        db.execute(
            """CREATE TABLE IF NOT EXISTS bilge_defter_users (
                email TEXT PRIMARY KEY,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL)"""
        )
        db.execute(
            """INSERT INTO bilge_defter_users (email, first_seen, last_seen)
               VALUES (?, ?, ?)
               ON CONFLICT(email) DO UPDATE SET last_seen=excluded.last_seen""",
            (email, now, now),
        )
        db.commit()
    finally:
        db.close()


@router.get("/whoami")
def whoami(
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
):
    """Kimlik bilgisi: Access JWT varsa dogrulanmis e-posta, yoksa cihaz kimligi."""
    if cf_access_jwt_assertion:
        identity = _verify_access(cf_access_jwt_assertion)
        account = members.member(_db_path(), identity["email"])
        return {
            "identity": {**identity, **{key: account[key] for key in ("id", "status", "role")}},
            "account_protocol": "approval-v1",
            "registration_mode": "invitation" if members.invitation_only() else "application",
            "sync": {"status": "approved" if account["status"] == "approved" else "locked", "detail": "Yedekler hesaba ozel ve sifrelidir; onay gereklidir."},
        }
    return {
        "identity": {"type": "device", "name": "ozel-adres"},
        "sync": {"status": "devre-disi", "detail": "Esitleme yalniz davetli adreste planlaniyor."},
    }


@router.post("/registration")
def register(cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion")):
    if not cf_access_jwt_assertion:
        raise HTTPException(401, "E-posta girisi gerekli")
    identity = _verify_access(cf_access_jwt_assertion)
    result = members.member(_db_path(), identity["email"], register=True)
    return {"identity": {**identity, **{key: result[key] for key in ("id", "status", "role")}}, "account_protocol": "approval-v1"}


@router.get("/admin/members")
def list_members(offset: int = 0, cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion")):
    identity = _require_access(cf_access_jwt_assertion)
    if offset < 0 or offset > 100000:
        raise HTTPException(400, "Gecersiz sayfa")
    result = members.listing(_db_path(), identity["email"], offset)
    db = members.connect(_db_path())
    try:
        result["edge"] = edge.status(db)
    finally:
        db.close()
    return result


class MembershipDecision(BaseModel):
    status: str


class StudentEmail(BaseModel):
    email: str


@router.post("/admin/students")
def add_student(body: StudentEmail, cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion")):
    identity = _require_access(cf_access_jwt_assertion)
    return members.add_student(_db_path(), identity["email"], body.email)


@router.get("/admin/allowlist")
def export_allowlist(cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion")):
    identity = _require_access(cf_access_jwt_assertion)
    return members.allowlist(_db_path(), identity["email"])


@router.post("/admin/members/{member_id}")
def decide_member(member_id: str, body: MembershipDecision,
                  cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion")):
    identity = _require_access(cf_access_jwt_assertion)
    result = members.decide(_db_path(), identity["email"], member_id, body.status)
    result["edge"] = edge.reconcile(_db_path(), identity["email"])
    return result


@router.post("/admin/access-sync")
def sync_access(cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion")):
    identity = _require_access(cf_access_jwt_assertion)
    return edge.reconcile(_db_path(), identity["email"])


class BackupUpload(BaseModel):
    ciphertext: str
    iv: str
    salt: str
    kdf: str
    updated_at: str
    device_id: str | None = None


def _vapid_keys() -> tuple[str, str]:
    """(public, private) VAPID anahtarlari; env yoksa dosyada tutar/uretilir."""
    global VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY
    if VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY:
        return VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
    try:
        data = json.loads(Path(VAPID_FILE).read_text(encoding="utf-8"))
        if data.get("private") and data.get("public"):
            return str(data["public"]), str(data["private"])
    except Exception:
        pass
    from cryptography.hazmat.primitives import serialization

    vapid = Vapid()
    vapid.generate_keys()
    pub_raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    priv_raw = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()
    private = base64.urlsafe_b64encode(priv_raw).rstrip(b"=").decode()
    Path(VAPID_FILE).parent.mkdir(parents=True, exist_ok=True)
    Path(VAPID_FILE).write_text(
        json.dumps({"public": public, "private": private}),
        encoding="utf-8",
    )
    Path(VAPID_FILE).chmod(0o600)
    return public, private


def _ensure_push_table(db) -> None:
    db.execute(
        """CREATE TABLE IF NOT EXISTS bilge_defter_push_subscriptions (
            email TEXT NOT NULL,
            device_id TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (email, device_id))"""
    )


def _notify_other_devices(email: str, exclude_device: str, event_ts: str) -> None:
    # Existing push endpoint validation accepts arbitrary HTTPS hosts. Do not
    # activate this network-sending path for the class rollout until hardened.
    return
    db = get_conn(_db_path())
    rows = []
    try:
        _ensure_push_table(db)
        rows = db.execute(
            "SELECT device_id, endpoint, p256dh, auth FROM bilge_defter_push_subscriptions WHERE email=? AND device_id!=?",
            (email, exclude_device),
        ).fetchall()
    finally:
        db.close()
    if not rows:
        return
    public, private = _vapid_keys()
    payload = json.dumps(
        {"title": "Bilge Defter güncellendi", "body": "Başka bir cihazdan yeni yedek geldi.", "ts": event_ts}
    )
    for row in rows:
        sub = {"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}}
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=private,
                vapid_claims={"sub": VAPID_MAILTO},
                ttl=86400,
            )
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status in (404, 410):
                db = get_conn(_db_path())
                try:
                    db.execute(
                        "DELETE FROM bilge_defter_push_subscriptions WHERE email=? AND endpoint=?",
                        (email, row["endpoint"]),
                    )
                    db.commit()
                finally:
                    db.close()
        except Exception:
            continue


@router.get("/vapid-key")
def vapid_key(
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
):
    """Push aboneligi icin genel VAPID anahtari."""
    _require_access(cf_access_jwt_assertion)
    public, _ = _vapid_keys()
    return {"public_key": public}


class PushSubscriptionBody(BaseModel):
    device_id: str
    subscription: dict


@router.post("/push-subscription")
def push_subscription(
    body: PushSubscriptionBody,
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
):
    """Cihazin push aboneligini kaydet (kullanici basina cihaz basina tek)."""
    identity = _require_access(cf_access_jwt_assertion)
    device_id = (body.device_id or "").strip()
    if not device_id or len(device_id) > 128:
        raise HTTPException(status_code=400, detail="device_id gecersiz")
    sub = body.subscription or {}
    endpoint = sub.get("endpoint")
    keys = sub.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if (
        not isinstance(endpoint, str)
        or not endpoint.startswith("https://")
        or len(endpoint) > 2000
        or not _B64_RE.match(p256dh or "")
        or not _B64_RE.match(auth or "")
        or len(p256dh or "") > 512
        or len(auth or "") > 128
    ):
        raise HTTPException(status_code=400, detail="Push aboneligi gecersiz")
    now = datetime.now(UTC).replace(tzinfo=None).isoformat(timespec="seconds")
    db = get_conn(_db_path())
    try:
        _ensure_push_table(db)
        db.execute(
            """INSERT INTO bilge_defter_push_subscriptions
               (email, device_id, endpoint, p256dh, auth, created_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(email, device_id) DO UPDATE SET
                 endpoint=excluded.endpoint, p256dh=excluded.p256dh,
                 auth=excluded.auth""",
            (identity["email"], device_id, endpoint, p256dh, auth, now),
        )
        db.commit()
    finally:
        db.close()
    return {"status": "ok"}


def _decode_b64(field: str, value: str, max_len: int) -> bytes:
    if not _B64_RE.match(value or ""):
        raise HTTPException(status_code=400, detail=f"{field} gecersiz base64")
    try:
        raw = base64.b64decode(value + "==")
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field} cozulemedi") from exc
    if len(raw) > max_len:
        raise HTTPException(status_code=400, detail=f"{field} siniri asti")
    return raw


def _ensure_backup_table(db) -> None:
    db.execute(
        """CREATE TABLE IF NOT EXISTS bilge_defter_backups (
            email TEXT PRIMARY KEY,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            salt TEXT NOT NULL,
            kdf TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            stored_at TEXT NOT NULL)"""
    )


@router.post("/backup")
def upload_backup(
    body: BackupUpload,
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
    if_match: str | None = Header(default=None, alias="If-Match"),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
):
    """Sifreli yedek yigini sakla (kullanici basina en son tek kopya)."""
    identity = _require_access(cf_access_jwt_assertion)
    email = identity["email"]
    if body.kdf not in KDF_ALLOWED:
        raise HTTPException(status_code=400, detail="Desteklenmeyen anahtar turetme yontemi")
    ciphertext = _decode_b64("ciphertext", body.ciphertext, MAX_BACKUP_BYTES * 2)
    iv_raw = _decode_b64("iv", body.iv, 32)
    salt_raw = _decode_b64("salt", body.salt, 32)
    if len(ciphertext) > MAX_BACKUP_BYTES:
        raise HTTPException(status_code=413, detail="Yedek 5 MB sinirini asti")
    if len(iv_raw) != 12:
        raise HTTPException(status_code=400, detail="iv 12 bayt olmali")
    if len(salt_raw) != 16:
        raise HTTPException(status_code=400, detail="salt 16 bayt olmali")
    if not body.updated_at or len(body.updated_at) > 40:
        raise HTTPException(status_code=400, detail="updated_at gecersiz")
    now = datetime.now(UTC).replace(tzinfo=None).isoformat(timespec="seconds")
    db = get_conn(_db_path())
    try:
        _ensure_backup_table(db)
        headers = backup_store.write(db, email, body, now, if_match, if_none_match)
    finally:
        db.close()
    # A notification failure must not disguise an already committed backup as failed.
    notified = False  # Class pilot polls; push is intentionally disabled.
    return JSONResponse({"status": "ok", "bytes": len(ciphertext), "stored_at": now, "notified": notified}, headers=headers)


@router.get("/backup")
def get_backup(
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
):
    """Kullanicinin en son sifreli yedegini dondur; yoksa 404."""
    identity = _require_access(cf_access_jwt_assertion)
    db = get_conn(_db_path())
    try:
        _ensure_backup_table(db)
        data, headers = backup_store.read(db, identity["email"], if_none_match)
    finally:
        db.close()
    if data is None:
        return Response(status_code=304, headers=headers)
    return JSONResponse(data, headers=headers)


@router.get("/backup/previous")
def get_previous_backup(
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
):
    """The encrypted copy the latest upload replaced (one generation); 404 if none."""
    identity = _require_access(cf_access_jwt_assertion)
    db = get_conn(_db_path())
    try:
        _ensure_backup_table(db)
        data, headers = backup_store.read_previous(db, identity["email"])
    finally:
        db.close()
    return JSONResponse(data, headers=headers)

class OcrRequest(BaseModel):
    image: str


OCR_MAX_BYTES = 2 * 1024 * 1024
OCR_MAX_PIXELS = 4_000_000
# One production worker is configured. Each worker may run at most two decoders.
_ocr_slots = threading.BoundedSemaphore(2)


@router.post("/ocr")
def ocr(
    body: OcrRequest,
    cf_access_jwt_assertion: str | None = Header(default=None, alias="Cf-Access-Jwt-Assertion"),
):
    """Acik kullanici eylemiyle gelen cizim goruntusunu yerel tesseract ile tanir.

    Goruntu sunucuda SAKLANMAZ; istek bitince bellekten dusar. Yalniz PNG
    kabul edilir; 2 MB sinir. Not verisi (sifreli yedek) ile iliskisizdir.
    """
    _require_access(cf_access_jwt_assertion)
    if not _B64_RE.match(body.image or "") or len(body.image or "") > OCR_MAX_BYTES * 2:
        raise HTTPException(status_code=400, detail="Gorsel base64 gecersiz")
    try:
        raw = base64.b64decode(body.image, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(400, "Gorsel base64 gecersiz") from exc
    if len(raw) > OCR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Gorsel 2 MB sinirini asti")
    if len(raw) < 33 or not raw.startswith(b"\x89PNG\r\n\x1a\n") or raw[8:16] != b"\x00\x00\x00\x0dIHDR":
        raise HTTPException(status_code=400, detail="Yalniz PNG gorsel kabul edilir")
    width, height = struct.unpack(">II", raw[16:24])
    if zlib.crc32(raw[12:29]) != struct.unpack(">I", raw[29:33])[0]:
        raise HTTPException(400, "PNG basligi gecersiz")
    if not width or not height or width > 2000 or height > 2000 or width * height > OCR_MAX_PIXELS:
        raise HTTPException(413, "Tanima gorseli en fazla 2000 x 2000 piksel olabilir")
    if not _ocr_slots.acquire(blocking=False):
        raise HTTPException(429, "Tanima su anda mesgul. Biraz sonra tekrar deneyin.", headers={"Retry-After": "5"})
    try:
        proc = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", "tur", "--psm", "6"],
            input=raw,
            capture_output=True,
            timeout=30,
            env={**os.environ, "OMP_THREAD_LIMIT": "1"},
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=422, detail="Tanima zaman asimina ugradi") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Tanima altyapisi kurulu degil") from exc
    finally:
        _ocr_slots.release()
    if proc.returncode != 0:
        raise HTTPException(status_code=422, detail="Tanima basarisiz oldu")
    text = proc.stdout.decode("utf-8", "replace").strip()
    if len(text) > 10000:
        raise HTTPException(422, "Sonuc cok uzun. Daha kucuk bir yazi bolumu secin.")
    return {"text": text}
