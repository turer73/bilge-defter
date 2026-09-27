"""Loopback-only library pilot. Does not mount or alter the live Bilge Defter app."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, unquote
from prepare import HERE, DATA, CATALOG, ACCEPTED, sha
from textview import render_text

PORT = 8766
ORIGIN = f'http://127.0.0.1:{PORT}'
ALIASES = {'kalp': 'heart', 'akciger': 'lung', 'bobrek': 'kidney', 'beyin': 'brain',
           'kas': 'muscle', 'kemik': 'bone', 'hucre': 'cell', 'sinir': 'nerve',
           'noron': 'neuron', 'kan': 'blood', 'solunum': 'respiratory',
           'dolasim': 'circulation', 'homeostaz': 'homeostasis', 'doku': 'tissue'}
LOCK = threading.Lock()
RENDER_LOCK = threading.Lock()
CACHE = Path(os.environ.get('LIBRARY_CACHE', str(DATA / 'rendered')))

def normalize(text):
    text = text.lower().replace('ı', 'i')
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))

def load_books():
    books = {}
    for s in CATALOG['sources']:
        folder = DATA / s['id']
        r = json.loads((folder / 'receipt.json').read_text(encoding='utf-8'))
        if r['sha256'] != ACCEPTED[s['id']]['sha256'] or sha(folder / 'publisher.html') != r['publisher_evidence_sha256']:
            raise ValueError('Source license review / publisher evidence mismatch')
        if sha(folder / 'original.pdf') != r['sha256'] or sha(folder / 'pages.json') != r['index_sha256']:
            raise ValueError('Library integrity check failed: ' + s['id'])
        pages = json.loads((folder / 'pages.json').read_text(encoding='utf-8'))
        books[s['id']] = {**s, 'license_pdf_page': ACCEPTED[s['id']]['license_pdf_page'], 'receipt': r, 'page_data': pages,
                         'normalized': [normalize(p['text']) for p in pages]}
    return books

def search(books, query, source=''):
    if len(query) > 120 or (source and source not in books):
        raise ValueError('Invalid search')
    tokens = re.findall(r'[a-z0-9]+', normalize(query))[:8]
    expanded = [ALIASES.get(t, t) for t in tokens]
    if not expanded:
        return {'query': query, 'searched': '', 'results': []}
    results = []
    for key, book in books.items():
        if source and key != source:
            continue
        matches = []
        for p, text in zip(book['page_data'], book['normalized']):
            if all(re.search(r'\b' + re.escape(t) + r'\w*', text) for t in expanded):
                pos = text.find(expanded[0])
                start = max(0, pos - 65)
                score = sum(min(20, len(re.findall(r'\b' + re.escape(t) + r'\w*', text))) for t in expanded)
                matches.append({'id': key, 'title': book['title'], 'page': p['page'], 'label': p['label'],
                                'snippet': p['text'][start:start+240], 'score': score})
        results.extend(sorted(matches, key=lambda x: (-x['score'], x['page']))[:5])
    return {'query': query, 'searched': ' '.join(expanded), 'results': sorted(results, key=lambda x: -x['score'])[:25]}

def read_saved():
    path = DATA / 'saved.json'
    if not path.exists():
        return []
    records = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(records, list):
        raise ValueError('Invalid saved data')
    return records

class Handler(BaseHTTPRequestHandler):
    books = {}
    def log_message(self, *_):
        pass  # No search terms or reading history in logs.

    def reply(self, data, kind='application/json', status=200, download=None):
        file_path = data if isinstance(data, Path) else None
        if kind == 'application/json':
            data = json.dumps(data, ensure_ascii=False).encode()
        elif isinstance(data, str):
            data = data.encode()
        self.send_response(status)
        self.send_header('Content-Type', kind + ('; charset=utf-8' if kind.startswith(('text/', 'application/json')) else ''))
        self.send_header('Content-Length', str(file_path.stat().st_size if file_path else len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        if download:
            self.send_header('Content-Disposition', f'attachment; filename="{download}"')
        self.end_headers()
        try:
            if file_path:
                with file_path.open('rb') as source:
                    while chunk := source.read(128 * 1024):
                        self.wfile.write(chunk)
            else:
                self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def trusted(self):
        return self.headers.get('Host') == f'127.0.0.1:{PORT}' and self.headers.get('Origin', ORIGIN) == ORIGIN

    def do_GET(self):
        if not self.trusted():
            return self.reply({'error': 'Local origin only'}, status=403)
        url = urlsplit(self.path)
        path = unquote(url.path)
        try:
            if path in ('/', '/app.js', '/quote.js', '/style.css'):
                name = 'index.html' if path == '/' else path[1:]
                kind = {'index.html': 'text/html', 'app.js': 'text/javascript', 'quote.js': 'text/javascript', 'style.css': 'text/css'}[name]
                return self.reply((HERE / name).read_bytes(), kind)
            if path == '/favicon.ico':
                return self.reply(b'', 'image/x-icon', 204)
            if path == '/api/catalog':
                return self.reply([{k: v for k, v in b.items() if k not in ('page_data', 'normalized')} for b in self.books.values()])
            if path == '/api/session':
                return self.reply({'id': 'local', 'hosted': False})
            if path == '/api/saved':
                with LOCK:
                    return self.reply(read_saved())
            if path == '/api/search':
                q = parse_qs(url.query)
                return self.reply(search(self.books, q.get('q', [''])[0], q.get('source', [''])[0]))
            match = re.fullmatch(r'/read/([a-z0-9-]+)/([0-9]+)', path)
            if match:
                key, n = match.group(1), int(match.group(2))
                if key not in self.books:
                    return self.reply({'error': 'Invalid source'}, status=400)
                return self.reply(render_text(self.books[key], n, getattr(self, 'account', 'local')), 'text/html')
            match = re.fullmatch(r'/page/([a-z0-9-]+)/([0-9]+)\.png', path)
            if match:
                key, n = match.group(1), int(match.group(2))
                if key not in self.books or not 1 <= n <= self.books[key]['receipt']['pages']:
                    return self.reply({'error': 'Invalid page'}, status=400)
                cache = CACHE
                cache.mkdir(exist_ok=True)
                target = cache / f'{key}-{n}.png'
                if not RENDER_LOCK.acquire(blocking=False):
                    return self.reply({'error': 'Bir sayfa hazırlanıyor. Biraz sonra yeniden deneyin.'}, status=429)
                try:
                    if not target.exists():
                        if len(list(cache.glob('*.png'))) >= 30:
                            # Only generated previews inside this exact cache folder are evicted.
                            min(cache.glob('*.png'), key=lambda p: p.stat().st_mtime).unlink()
                        subprocess.run([shutil.which('pdftoppm'), '-f', str(n), '-l', str(n), '-singlefile', '-scale-to', '1600', '-png', str(DATA / key / 'original.pdf'), str(target.with_suffix(''))], check=True, timeout=35, capture_output=True)
                    data = target.read_bytes()
                finally:
                    RENDER_LOCK.release()
                return self.reply(data, 'image/png')
            match = re.fullmatch(r'/pdf/([a-z0-9-]+)\.pdf', path)
            if match and match.group(1) in self.books:
                # Explicit user download, not part of an app/offline precache.
                key = match.group(1)
                return self.reply(DATA / key / 'original.pdf', 'application/pdf', download=key+'.pdf')
            return self.reply({'error': 'Not found'}, status=404)
        except ValueError:
            return self.reply({'error': 'Geçersiz istek veya kayıt verisi.'}, status=400)
        except Exception:
            return self.reply({'error': 'Yerel kaynak açılamadı; dosyaları yeniden doğrulayın.'}, status=500)

    def do_POST(self):
        if not self.trusted() or self.headers.get('X-Library-Pilot') != '1' or self.path != '/api/saved':
            return self.reply({'error': 'Forbidden'}, status=403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 1 <= length <= 1024 or self.headers.get('Content-Type') != 'application/json':
                return self.reply({'error': 'Invalid body'}, status=400)
            item = json.loads(self.rfile.read(length))
            key, page = item.get('id'), item.get('page')
            if key not in self.books or type(page) is not int or not 1 <= page <= self.books[key]['receipt']['pages']:
                return self.reply({'error': 'Invalid source/page'}, status=400)
            item = {'id': key, 'page': page}
            with LOCK:
                saved = read_saved()
                if item not in saved:
                    if len(saved) >= 500:
                        return self.reply({'error': '500 kayıt sınırına ulaşıldı.'}, status=409)
                    saved.append(item)
                    temp = DATA / 'saved.json.tmp'
                    temp.write_text(json.dumps(saved), encoding='utf-8')
                    os.replace(temp, DATA / 'saved.json')
            return self.reply({'saved': item, 'count': len(saved)})
        except (ValueError, AttributeError, TypeError):
            return self.reply({'error': 'Invalid body'}, status=400)
        except OSError:
            return self.reply({'error': 'Kayıt yazılamadı.'}, status=500)

if __name__ == '__main__':
    Handler.books = load_books()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Local library pilot: {ORIGIN} ({len(Handler.books)} verified originals)', flush=True)
    server.serve_forever()
