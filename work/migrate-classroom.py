"""Copy only encrypted Bilge Defter backups from a read-only source.

Run only with the old public writer stopped. Never overwrites a nonempty target
backup table. Source contents are never printed, and source is never modified.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def migrate(source, target):
    source=Path(source).resolve(strict=True);target=Path(target).resolve()
    if source==target:raise ValueError("Source and target must differ")
    src=sqlite3.connect(source.as_uri()+"?mode=ro",uri=True,timeout=15)
    dst=sqlite3.connect(target,timeout=15)
    try:
        src.execute("BEGIN")
        if src.execute("PRAGMA quick_check").fetchone()[0]!="ok":raise ValueError("Source integrity failed")
        present=src.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bilge_defter_backups'").fetchone()
        rows=src.execute("SELECT email,ciphertext,iv,salt,kdf,updated_at,stored_at FROM bilge_defter_backups ORDER BY email").fetchall() if present else []
        dst.execute("BEGIN IMMEDIATE")
        dst.execute("CREATE TABLE IF NOT EXISTS bilge_defter_backups(email TEXT PRIMARY KEY,ciphertext TEXT NOT NULL,iv TEXT NOT NULL,salt TEXT NOT NULL,kdf TEXT NOT NULL,updated_at TEXT NOT NULL,stored_at TEXT NOT NULL)")
        if dst.execute("SELECT COUNT(*) FROM bilge_defter_backups").fetchone()[0]:raise ValueError("Target backups are nonempty; manual reconciliation required")
        dst.executemany("INSERT INTO bilge_defter_backups VALUES(?,?,?,?,?,?,?)",rows)
        copied=dst.execute("SELECT email,ciphertext,iv,salt,kdf,updated_at,stored_at FROM bilge_defter_backups ORDER BY email").fetchall()
        if copied!=rows:raise ValueError("Migration comparison failed")
        dst.commit()
        if dst.execute("PRAGMA quick_check").fetchone()[0]!="ok":raise ValueError("Target integrity failed")
        return {"encrypted_backups_copied":len(rows),"content_digest":hashlib.sha256(json.dumps(rows,separators=(",",":"),ensure_ascii=True).encode()).hexdigest(),"source_read_only":True}
    finally:
        src.close();dst.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("source");parser.add_argument("target")
    args=parser.parse_args();print(json.dumps(migrate(args.source,args.target)))
