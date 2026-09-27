import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import hosted
import backup_state
from test_hosted import Handler


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patch = patch.object(hosted, 'STATE', self.root); self.patch.start()
        db = hosted.connect(); db.close()

    def tearDown(self):
        self.patch.stop(); self.tmp.cleanup()

    def test_wal_backup_restores_both_accounts_without_changing_source(self):
        src = self.root/'bookmarks.sqlite3'
        db=sqlite3.connect(src)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute("INSERT INTO bookmarks VALUES ('account-A','book-a',1)")
            db.execute("INSERT INTO bookmarks VALUES ('account-B','book-b',4)"); db.commit()
            saved=self.root/'backup.sqlite';result=backup_state.backup(src,saved)
            self.assertEqual(result['records'],2)
            restored=self.root/'restored.sqlite';self.assertEqual(backup_state.backup(saved,restored)['records'],2)
            with closing(sqlite3.connect(restored)) as check:
                self.assertEqual(check.execute('SELECT * FROM bookmarks ORDER BY account').fetchall(),[('account-A','book-a',1),('account-B','book-b',4)])
            self.assertEqual(db.execute('SELECT count(*) FROM bookmarks').fetchone()[0],2)
        finally:db.close()

    def test_backup_refuses_overwrite_and_same_path(self):
        src=self.root/'bookmarks.sqlite3';dest=self.root/'existing';dest.write_bytes(b'keep')
        with self.assertRaises(FileExistsError):backup_state.backup(src,dest)
        self.assertEqual(dest.read_bytes(),b'keep')
        with self.assertRaises(ValueError):backup_state.backup(src,src)

    def test_missing_source_does_not_create_source_or_leave_empty_backup(self):
        src=self.root/'missing';dest=self.root/'new'
        with self.assertRaises(sqlite3.Error):backup_state.backup(src,dest)
        self.assertFalse(src.exists());self.assertFalse(dest.exists())

    def test_invalid_schema_rejected(self):
        wrong=self.root/'wrong';sqlite3.connect(wrong).close()
        with self.assertRaises(ValueError):backup_state.verify(wrong)

    def health(self, client='127.0.0.1', host='127.0.0.1:8080'):
        h=Handler('/healthz');h.client_address=(client,1234);h.headers['Host']=host
        h.do_GET();return h.result

    def test_local_health_and_proxy_denial(self):
        self.assertEqual(self.health(),(200,{'status':'ok','service':'bilge-defter-library'}))
        self.assertEqual(self.health('172.18.0.5','defter.bilgearena.com')[0],404)
        self.assertEqual(self.health('127.0.0.1','defter.bilgearena.com')[0],404)

    def test_health_fails_when_database_or_books_missing(self):
        (self.root/'bookmarks.sqlite3').unlink()
        self.assertEqual(self.health()[0],503)
        self.assertFalse((self.root/'bookmarks.sqlite3').exists())
        db=hosted.connect();db.close()
        h=Handler('/healthz');h.client_address=('127.0.0.1',1);h.headers['Host']='127.0.0.1:8080';h.books={};h.do_GET()
        self.assertEqual(h.result[0],503)


if __name__ == '__main__':unittest.main()
