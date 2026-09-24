"""Approval registry. Identity comes only from a verified Access JWT, never a form."""
import os
import re
import sqlite3
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException


def now():
    return datetime.now(UTC).isoformat()


def admins():
    owners = {s.strip().lower() for s in os.environ.get("BILGE_DEFTER_ADMIN_EMAILS", "").split(",") if s.strip()}
    if len(owners) > 2:
        raise HTTPException(503, "Ucretsiz sinif yapilandirmasi en fazla iki yonetici kabul eder")
    return owners


def student_limit():
    try:
        limit = int(os.environ.get("BILGE_DEFTER_MAX_STUDENTS", "48"))
    except ValueError as exc:
        raise HTTPException(503, "Ogrenci siniri gecersiz") from exc
    if not 1 <= limit <= 48:
        raise HTTPException(503, "Ucretsiz sinif ogrenci siniri 1 ile 48 arasinda olmali")
    return limit


def invitation_only():
    return os.environ.get("BILGE_DEFTER_REGISTRATION_MODE", "invitation") != "application"


def capacity(db):
    owners = admins()
    placeholders = ",".join("?" for _ in owners)
    count = db.execute(f"SELECT COUNT(*) FROM bilge_defter_members WHERE status='approved' AND email NOT IN ({placeholders})", tuple(owners)).fetchone()[0]
    listed = db.execute(f"SELECT COUNT(*) FROM bilge_defter_members WHERE email NOT IN ({placeholders})", tuple(owners)).fetchone()[0]
    return {"approved_students": count, "listed_students": listed, "student_limit": student_limit(), "reserved_admins": 2,
            "cloudflare_seats_verified": False}


def connect(path):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS bilge_defter_members (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
        created_at TEXT NOT NULL, changed_at TEXT NOT NULL, changed_by TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS bilge_defter_member_audit (
        id INTEGER PRIMARY KEY, actor TEXT NOT NULL, member_id TEXT NOT NULL,
        old_status TEXT, new_status TEXT NOT NULL, at TEXT NOT NULL)""")
    db.commit()
    return db


def member(path, email, register=False):
    email = email.lower()
    owners = admins()
    if not owners:
        raise HTTPException(503, "Yonetici hesabi yapilandirilmadi")
    student_limit()  # Fail closed for invalid free-plan configuration.
    db = connect(path)
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM bilge_defter_members WHERE email=?", (email,)).fetchone()
        if row is None and register and email not in owners and invitation_only():
            raise HTTPException(403, "Bu e-posta listede yok. Yöneticiniz öğrenci hesabını eklemeli.")
        if row is None and (register or email in owners):
            stamp, member_id = now(), str(uuid.uuid4())
            status = "approved" if email in owners else "pending"
            db.execute("INSERT INTO bilge_defter_members VALUES (?,?,?,?,?,?)", (member_id, email, status, stamp, stamp, email))
            db.execute("INSERT INTO bilge_defter_member_audit(actor,member_id,old_status,new_status,at) VALUES(?,?,NULL,?,?)", (email, member_id, status, stamp))
            row = db.execute("SELECT * FROM bilge_defter_members WHERE email=?", (email,)).fetchone()
        db.commit()
        result = dict(row) if row else {"id": None, "email": email, "status": "unregistered"}
        result["role"] = "admin" if email in owners else "student"
        if email in owners:
            result["status"] = "approved"
        return result
    finally:
        db.close()


def require(path, email):
    result = member(path, email)
    if result["status"] != "approved":
        raise HTTPException(403, "Hesap onayi gerekli veya erisim askiya alindi")
    return result


def require_admin(path, email):
    result = require(path, email)
    if result["role"] != "admin":
        raise HTTPException(403, "Yonetici yetkisi gerekli")
    return result


def listing(path, email, offset=0):
    require_admin(path, email)
    db = connect(path)
    try:
        rows = db.execute("SELECT id,email,status,created_at,changed_at FROM bilge_defter_members ORDER BY created_at,id LIMIT 100 OFFSET ?", (offset,)).fetchall()
        return {"members": [{**dict(r), "role": "admin" if r["email"] in admins() else "student"} for r in rows], "next_offset": offset + 100 if len(rows) == 100 else None, "capacity": capacity(db)}
    finally:
        db.close()


def add_student(path, actor, email):
    require_admin(path, actor)
    email = email.strip().lower()
    if len(email) > 254 or "*" in email or not re.fullmatch(r"[a-z0-9.!#$%&'+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}", email):
        raise HTTPException(422, "Geçerli tek bir öğrenci e-postası yazın.")
    if email in admins():
        raise HTTPException(422, "Bu adres zaten yönetici hesabıdır.")
    db = connect(path)
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM bilge_defter_members WHERE email=?", (email,)).fetchone()
        created = row is None
        if created:
            quota = capacity(db)
            if quota["listed_students"] >= quota["student_limit"]:
                raise HTTPException(422, "48 kişilik öğrenci listesi dolu. Yeni adres eklenmedi. Cloudflare kotası denetlenmeden yer açılmaz.")
            member_id, stamp = str(uuid.uuid4()), now()
            db.execute("INSERT INTO bilge_defter_members VALUES(?,?,?,?,?,?)", (member_id,email,"pending",stamp,stamp,actor))
            db.execute("INSERT INTO bilge_defter_member_audit(actor,member_id,old_status,new_status,at) VALUES(?,?,NULL,?,?)", (actor,member_id,"pending",stamp))
            row = db.execute("SELECT * FROM bilge_defter_members WHERE email=?", (email,)).fetchone()
        db.commit()
        return {"member": {key: row[key] for key in ("id","email","status")}, "created": created,
                "edge_access": "not_verified", "detail": "Listeye kaydedildi. Uygulama onayı ve Cloudflare giriş izni ayrı işlemlerdir; e-posta gönderilmedi."}
    finally:
        db.close()


def allowlist(path, actor):
    require_admin(path, actor)
    db = connect(path)
    try:
        rows = db.execute("SELECT email FROM bilge_defter_members WHERE status='approved'").fetchall()
        emails = sorted(admins() | {row["email"] for row in rows})
        if len(set(emails) - admins()) > student_limit() or len(emails) > 50:
            raise HTTPException(422, "Liste ücretsiz kapasiteyi aşıyor; dışa aktarılmadı.")
        return {"emails": emails, "edge_access": "not_verified", "detail": "Yalnız liste taslağıdır. Cloudflare ayarları değiştirilmedi."}
    finally:
        db.close()


def decide(path, email, member_id, status):
    require_admin(path, email)
    if status not in {"approved", "rejected", "suspended"}:
        raise HTTPException(400, "Gecersiz uyelik durumu")
    db = connect(path)
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM bilge_defter_members WHERE id=?", (member_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Hesap bulunamadi")
        if row["email"] in admins():
            raise HTTPException(409, "Yonetici yetkisi yalniz sunucu yapilandirmasindan degistirilir")
        if status == "approved" and row["status"] != "approved":
            quota = capacity(db)
            if quota["approved_students"] >= quota["student_limit"]:
                raise HTTPException(422, "Öğrenci kontenjanı dolu. Yeni öğrenci onaylanmadı; mevcut hesaplar değişmedi.")
        stamp = now()
        db.execute("UPDATE bilge_defter_members SET status=?,changed_at=?,changed_by=? WHERE id=?", (status, stamp, email, member_id))
        db.execute("INSERT INTO bilge_defter_member_audit(actor,member_id,old_status,new_status,at) VALUES(?,?,?,?,?)", (email, member_id, row["status"], status, stamp))
        db.commit()
        return {"id": member_id, "status": status}
    finally:
        db.close()
