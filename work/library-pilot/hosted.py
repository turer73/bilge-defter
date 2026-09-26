"""Invited pilot: authentication delegated ONLY to the existing signed-JWT account API.
No Access bypass, token persistence, account DB mount, registration, or user-supplied upstream.
"""
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from contextlib import closing
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qs
from http.server import ThreadingHTTPServer
from server import Handler, load_books

ORIGIN = 'https://defter.bilgearena.com'
UPSTREAM = 'http://bilge-defter-accounts:8080/api/v1/bilge-defter/whoami'
STATE = Path(os.environ.get('LIBRARY_STATE', '/state'))
UUID = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def verified_identity(assertion):
    if not assertion or len(assertion) > 16000:
        raise PermissionError('E-posta ile giriş gerekli.')
    request = Request(UPSTREAM, headers={'Cf-Access-Jwt-Assertion': assertion})
    # Never forward a cookie, user-selected URL or proxy setting.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=10) as r:
            if r.status != 200 or 'application/json' not in r.headers.get('Content-Type', ''):
                raise PermissionError('Hesap doğrulanamadı.')
            body = json.loads(r.read(65537))
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise PermissionError('E-posta oturumunu yenileyin.') from None
        raise RuntimeError('Hesap servisine ulaşılamadı.') from None
    identity = body.get('identity', {})
    if (body.get('account_protocol') != 'approval-v1' or identity.get('type') != 'access'
            or identity.get('status') != 'approved' or not UUID.fullmatch(str(identity.get('id', '')))):
        raise PermissionError('Onaylı Bilge Defter hesabı gerekli.')
    return identity['id']

def connect():
    db = sqlite3.connect(STATE / 'bookmarks.sqlite3', timeout=5)
    db.execute('CREATE TABLE IF NOT EXISTS bookmarks (account TEXT NOT NULL, source TEXT NOT NULL, page INTEGER NOT NULL, PRIMARY KEY(account,source,page))')
    return db

def saved(account, item=None):
    with closing(connect()) as db, db:
        if item:
            db.execute('BEGIN IMMEDIATE')
            count = db.execute('SELECT count(*) FROM bookmarks WHERE account=?', (account,)).fetchone()[0]
            exists = db.execute('SELECT 1 FROM bookmarks WHERE account=? AND source=? AND page=?', (account,item['id'],item['page'])).fetchone()
            if count >= 500 and not exists:
                raise ValueError('500 kayıt sınırına ulaşıldı.')
            db.execute('INSERT OR IGNORE INTO bookmarks VALUES (?,?,?)', (account,item['id'],item['page']))
        rows = db.execute('SELECT source,page FROM bookmarks WHERE account=? ORDER BY rowid', (account,)).fetchall()
    db.close()
    return [{'id': row[0], 'page': row[1]} for row in rows]

class InvitedHandler(Handler):
    def setup(self):
        super().setup()
        self.connection.settimeout(45)

    def trusted(self):
        return (self.headers.get('Host') == 'defter.bilgearena.com'
                and self.headers.get('Origin', ORIGIN) == ORIGIN)

    def authorize(self):
        if not self.trusted():
            self.reply({'error': 'Geçersiz istek kaynağı.'}, status=403)
            return False
        try:
            self.account = verified_identity(self.headers.get('Cf-Access-Jwt-Assertion'))
            path = urlsplit(self.path)
            if path.path == '/api/session' or path.path in ('/', '/app.js', '/style.css', '/favicon.ico'):
                return True
            expected = self.headers.get('X-Library-Account') or parse_qs(path.query).get('account', [''])[0]
            if expected != self.account:
                self.reply({'error': 'Hesap değişti. Sayfayı yeniden açın.'}, status=409)
                return False
            return True
        except PermissionError as exc:
            self.reply({'error': str(exc)}, status=401)
        except Exception:
            self.reply({'error': 'Hesap şu anda doğrulanamıyor. Daha sonra yeniden deneyin.'}, status=503)
        return False

    def do_GET(self):
        if not self.authorize():
            return
        path = urlsplit(self.path).path
        if path == '/api/session':
            return self.reply({'id': self.account, 'hosted': True})
        if path == '/api/saved':
            try:
                return self.reply(saved(self.account))
            except Exception:
                return self.reply({'error': 'Kayıt listesi okunamadı.'}, status=503)
        return super().do_GET()

    def do_POST(self):
        if not self.authorize():
            return
        if self.headers.get('Origin') != ORIGIN or self.headers.get('X-Library-Pilot') != '1' or self.path != '/api/saved':
            return self.reply({'error': 'Geçersiz kayıt isteği.'}, status=403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 1 <= length <= 1024 or self.headers.get('Content-Type') != 'application/json':
                raise ValueError('Geçersiz kayıt.')
            item = json.loads(self.rfile.read(length))
            key, page = item.get('id'), item.get('page')
            if not isinstance(key,str) or key not in self.books or type(page) is not int or not 1 <= page <= self.books[key]['receipt']['pages']:
                raise ValueError('Geçersiz kaynak veya sayfa.')
            rows = saved(self.account, {'id': key, 'page': page})
            return self.reply({'saved': {'id': key, 'page': page}, 'count':len(rows)})
        except (ValueError, TypeError, AttributeError):
            return self.reply({'error':'Geçersiz kayıt veya 500 kayıt sınırı.'}, status=400)
        except Exception:
            return self.reply({'error':'Kayıt yazılamadı. Daha sonra yeniden deneyin.'}, status=503)

class BoundedServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16
    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(12)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b'HTTP/1.0 503 Busy\r\nContent-Length: 0\r\n\r\n')
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

if __name__ == '__main__':
    InvitedHandler.books = load_books()
    STATE.mkdir(exist_ok=True)
    db = connect(); db.close()
    print('Invited library v1 ready; approved account verification required per request.', flush=True)
    BoundedServer(('0.0.0.0',8080), InvitedHandler).serve_forever()
