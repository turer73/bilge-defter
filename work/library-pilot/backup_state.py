"""Consistent bookmark snapshots. No row contents in logs; refuse overwrite.

BACKUP: python backup_state.py source.sqlite new-backup.sqlite
VERIFY: python backup_state.py --verify backup.sqlite
Restore only with the library stopped: verify, restore to a NEW file, then use
the explicit reviewed replacement procedure. Never copy an active SQLite main
file without its WAL. An on-host copy does NOT protect against host disk loss.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3


def read_only(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)


def verify(path):
    with closing(read_only(path)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Bookmark database integrity failed')
        columns = [r[1] for r in db.execute('PRAGMA table_info(bookmarks)')]
        if columns != ['account', 'source', 'page']:
            raise ValueError('Unexpected bookmark schema')
        count = db.execute('SELECT count(*) FROM bookmarks').fetchone()[0]
    with Path(path).open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'integrity': 'ok', 'records': count, 'sha256': digest}


def backup(source, destination):
    source, destination = Path(source).resolve(), Path(destination).absolute()
    if source == destination:
        raise ValueError('Backup must be a different new file')
    # Exclusive creation also refuses existing symlinks. No replace/unlink of a
    # pre-existing destination on failure. Parent permissions remain operator-owned.
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with closing(read_only(source)) as src, closing(sqlite3.connect(destination)) as dest:
            src.backup(dest, pages=128, sleep=0.05)
            dest.execute('PRAGMA journal_mode=DELETE')
        return verify(destination)
    except Exception:
        # Only the exact file exclusively created above is task-owned.
        destination.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('source')
    parser.add_argument('destination', nargs='?')
    args = parser.parse_args()
    if args.verify:
        if args.destination: parser.error('verify accepts only one file')
        result = verify(args.source)
    else:
        if not args.destination: parser.error('new destination required')
        result = backup(args.source, args.destination)
    print(json.dumps(result))
