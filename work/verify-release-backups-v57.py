"""Verify off-host SQLite snapshots and restore to NEW files. Never print rows."""
import hashlib,json,sqlite3,sys
from pathlib import Path
from contextlib import closing

root=Path(sys.argv[1]).resolve()
receipt=json.loads((root/'backup-receipt.json').read_text())
for label,digest in receipt.items():
    assert label in ['accounts','bookmarks']
    source=root/(label+'.sqlite');dest=root/(label+'-restore-check.sqlite')
    assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
    assert not dest.exists()
    with dest.open('xb'):pass
    with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src, closing(sqlite3.connect(dest)) as out:
        src.backup(out)
        assert out.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert not out.execute('PRAGMA foreign_key_check').fetchall()
        # Compare complete restored database content without displaying it.
        assert list(src.iterdump())==list(out.iterdump())
    print(label+': hash, integrity and complete restore match')
print(json.dumps(receipt))
