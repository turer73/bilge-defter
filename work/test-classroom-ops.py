import importlib.util
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path


def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+".py"));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod


with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);source=root/"source.sqlite";target=root/"target.sqlite"
    with closing(sqlite3.connect(source)) as db:
        db.execute("CREATE TABLE private_other_app(secret TEXT)");db.execute("INSERT INTO private_other_app VALUES('synthetic-unrelated')")
        db.execute("CREATE TABLE bilge_defter_backups(email TEXT PRIMARY KEY,ciphertext TEXT,iv TEXT,salt TEXT,kdf TEXT,updated_at TEXT,stored_at TEXT)")
        db.execute("INSERT INTO bilge_defter_backups VALUES('x@example.com','encrypted','iv','salt','kdf','date','date')")
        db.commit()
    before=source.read_bytes();migration=module("migrate-classroom");result=migration.migrate(source,target)
    assert result["encrypted_backups_copied"]==1 and source.read_bytes()==before
    with closing(sqlite3.connect(target)) as db:assert db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()==[("bilge_defter_backups",)]
    print("PASS Migration copies only encrypted backup table and leaves source unchanged")
    try:migration.migrate(source,target);raise AssertionError("overwrote existing target")
    except ValueError as e:assert "nonempty" in str(e)
    print("PASS Nonempty destination cannot be overwritten")
    result=module("backup-classroom").backup(target,root/"backup.sqlite")
    assert result["restore_verified"] and result["restored_tables"]==1
    print("PASS Online backup independently restores with integrity check")
