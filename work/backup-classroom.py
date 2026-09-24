"""Online SQLite backup and restore verification; emits only counts/hash."""
import argparse
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path


def backup(source,target):
    source=Path(source).resolve(strict=True);target=Path(target).resolve()
    if target.exists() or source==target:raise ValueError("Backup target must be new")
    src=sqlite3.connect(source.as_uri()+"?mode=ro",uri=True,timeout=15)
    dst=sqlite3.connect(target)
    try:
        src.backup(dst)
        if dst.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise ValueError("Backup integrity failed")
        # Reopening a copy verifies independent restore, not only backup return code.
        with closing(sqlite3.connect(":memory:")) as restored:
            dst.backup(restored)
            if restored.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise ValueError("Restore integrity failed")
            count=restored.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        return {"restored_tables":count,"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"restore_verified":True}
    finally:src.close();dst.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("source");parser.add_argument("target")
    args=parser.parse_args();print(json.dumps(backup(args.source,args.target)))
