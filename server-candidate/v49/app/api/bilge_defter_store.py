"""Atomic compare-and-swap, including existing pre-CAS encrypted backups."""
import hashlib
import json
import secrets

from fastapi import HTTPException

HEADERS = {"X-Bilge-Sync-Protocol": "cas-v1", "Cache-Control": "no-store"}


def setup(db):
    db.execute("CREATE TABLE IF NOT EXISTS bilge_defter_backup_revisions(email TEXT PRIMARY KEY, revision TEXT NOT NULL)")
    # One previous generation per account: the copy a write replaced. Additive table, so an
    # older API that does not know it keeps working on the same database.
    db.execute("""CREATE TABLE IF NOT EXISTS bilge_defter_backup_previous(
        email TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, salt TEXT NOT NULL,
        kdf TEXT NOT NULL, updated_at TEXT NOT NULL, stored_at TEXT NOT NULL, replaced_at TEXT NOT NULL)""")
    db.commit()


def etag(db, email, row):
    revision = db.execute("SELECT revision FROM bilge_defter_backup_revisions WHERE email=?", (email,)).fetchone()
    token = revision["revision"] if revision else hashlib.sha256(json.dumps(dict(row), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return '"' + token + '"'


def matches_tag(condition, tag):
    # GET uses weak comparison. Write preconditions remain strong and unchanged.
    return bool(condition) and any(value.strip().removeprefix("W/") in ("*", tag) for value in condition.split(","))


def read(db, email, if_none_match=None):
    setup(db)
    db.execute("BEGIN")
    try:
        revision = db.execute("SELECT revision FROM bilge_defter_backup_revisions WHERE email=?", (email,)).fetchone()
        if revision:
            tag = '"' + revision["revision"] + '"'
            # Avoid reading the ciphertext BLOB on unchanged polls. Same transaction
            # as the fallback SELECT; authorization was checked by the route first.
            exists = db.execute("SELECT 1 FROM bilge_defter_backups WHERE email=?", (email,)).fetchone()
            if exists and matches_tag(if_none_match, tag):
                return None, {**HEADERS, "ETag": tag}
        row = db.execute("SELECT ciphertext,iv,salt,kdf,updated_at,stored_at FROM bilge_defter_backups WHERE email=?", (email,)).fetchone()
        if row is None:
            raise HTTPException(404, "Sunucuda yedek yok", headers=HEADERS)
        tag = etag(db, email, row)
        return (None if matches_tag(if_none_match, tag) else dict(row)), {**HEADERS, "ETag": tag}
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
        if row is not None:
            # Same transaction as the overwrite: the replaced copy is kept or nothing changes.
            db.execute("""INSERT INTO bilge_defter_backup_previous(email,ciphertext,iv,salt,kdf,updated_at,stored_at,replaced_at)
                VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
                ciphertext=excluded.ciphertext,iv=excluded.iv,salt=excluded.salt,kdf=excluded.kdf,
                updated_at=excluded.updated_at,stored_at=excluded.stored_at,replaced_at=excluded.replaced_at""",
                (email, row["ciphertext"], row["iv"], row["salt"], row["kdf"], row["updated_at"], row["stored_at"], stamp))
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


def read_previous(db, email):
    """The encrypted copy the latest write replaced; read-only, never a write precondition."""
    setup(db)
    row = db.execute("SELECT ciphertext,iv,salt,kdf,updated_at,stored_at,replaced_at FROM bilge_defter_backup_previous WHERE email=?", (email,)).fetchone()
    if row is None:
        raise HTTPException(404, "Sunucuda onceki yedek yok", headers=HEADERS)
    return dict(row), dict(HEADERS)
