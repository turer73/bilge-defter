"""Atomic compare-and-swap, including existing pre-CAS encrypted backups."""
import hashlib
import json
import secrets

from fastapi import HTTPException

HEADERS = {"X-Bilge-Sync-Protocol": "cas-v1", "Cache-Control": "no-store"}


def setup(db):
    db.execute("CREATE TABLE IF NOT EXISTS bilge_defter_backup_revisions(email TEXT PRIMARY KEY, revision TEXT NOT NULL)")
    db.commit()


def etag(db, email, row):
    revision = db.execute("SELECT revision FROM bilge_defter_backup_revisions WHERE email=?", (email,)).fetchone()
    token = revision["revision"] if revision else hashlib.sha256(json.dumps(dict(row), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return '"' + token + '"'


def read(db, email):
    setup(db)
    db.execute("BEGIN")
    try:
        row = db.execute("SELECT ciphertext,iv,salt,kdf,updated_at,stored_at FROM bilge_defter_backups WHERE email=?", (email,)).fetchone()
        if row is None:
            raise HTTPException(404, "Sunucuda yedek yok", headers=HEADERS)
        return dict(row), {**HEADERS, "ETag": etag(db, email, row)}
    finally:
        db.rollback()


def write(db, email, body, stamp, if_match, if_none_match):
    setup(db)
    if not if_match and not if_none_match:
        raise HTTPException(428, "Once guncel surumu okuyun", headers=HEADERS)
    if (if_match and if_none_match) or (if_none_match and if_none_match != "*"):
        raise HTTPException(400, "Gecersiz surum kosulu", headers=HEADERS)
    db.execute("BEGIN IMMEDIATE")
    try:
        row = db.execute("SELECT ciphertext,iv,salt,kdf,updated_at,stored_at FROM bilge_defter_backups WHERE email=?", (email,)).fetchone()
        if (if_none_match and row is not None) or (if_match and (row is None or if_match != etag(db, email, row))):
            raise HTTPException(412, "Yedek baska cihazda degisti; tekrar okuyun", headers=HEADERS)
        token = secrets.token_hex(32)
        db.execute("""INSERT INTO bilge_defter_backups(email,ciphertext,iv,salt,kdf,updated_at,stored_at)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
            ciphertext=excluded.ciphertext,iv=excluded.iv,salt=excluded.salt,kdf=excluded.kdf,
            updated_at=excluded.updated_at,stored_at=excluded.stored_at""",
            (email, body.ciphertext, body.iv, body.salt, body.kdf, body.updated_at, stamp))
        db.execute("INSERT INTO bilge_defter_backup_revisions VALUES(?,?) ON CONFLICT(email) DO UPDATE SET revision=excluded.revision", (email, token))
        db.commit()
        return {**HEADERS, "ETag": '"' + token + '"'}
    finally:
        db.rollback()
