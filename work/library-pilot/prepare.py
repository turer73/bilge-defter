"""Explicit, bounded import of the five approved publisher PDFs. No live service writes."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = Path(os.environ.get('LIBRARY_DATA', str(ROOT / 'outputs/library-pilot')))
CATALOG = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
ACCEPTED = json.loads((HERE / 'accepted-sources.json').read_text(encoding='utf-8'))['sources']
HOSTS = {urlsplit(s['url']).hostname for s in CATALOG['sources']}

class PublisherRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def validate_url(url):
    p = urlsplit(url)
    if p.scheme != 'https' or p.hostname not in HOSTS or p.port not in (None, 443) or p.username:
        raise ValueError('Unapproved publisher URL')

def download(url, target, limit):
    validate_url(url)
    # Native PowerShell HTTP client is used on this Windows workspace; urllib is rejected by publisher edge servers.
    if os.name == 'nt':
        result = subprocess.run(['pwsh', '-NoProfile', '-File', str(HERE / 'download.ps1'), '-Url', url, '-Target', str(target), '-Limit', str(limit)], capture_output=True, text=True, encoding='utf-8', timeout=340)
        if result.returncode:
            raise RuntimeError(result.stderr[-1500:])
        return json.loads(result.stdout)
    opener = build_opener(PublisherRedirects())
    started = time.monotonic()
    with opener.open(Request(url, headers={'User-Agent': 'BilgeDefter-local-educational-pilot/1.0'}), timeout=30) as r:
        size = int(r.headers.get('Content-Length', 0))
        if size > limit:
            raise ValueError('Download budget exceeded')
        total = 0
        with target.open('wb') as out:
            while chunk := r.read(1024 * 1024):
                total += len(chunk)
                if total > limit or time.monotonic() - started > 300:
                    raise ValueError('Download size/time budget exceeded')
                out.write(chunk)
        return dict(url=r.url, bytes=total, content_type=r.headers.get('Content-Type'), etag=r.headers.get('ETag'))

def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def prepare(source):
    from pypdf import PdfReader
    target = DATA / source['id']
    target.mkdir(parents=True, exist_ok=True)
    receipt_path = target / 'receipt.json'
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
        if sha(target / 'original.pdf') != receipt['sha256'] or receipt['sha256'] != ACCEPTED[source['id']]['sha256']:
            raise ValueError('Existing original hash mismatch; will not overwrite')
        if sha(target / 'pages.json') != receipt['index_sha256'] or sha(target / 'publisher.html') != receipt['publisher_evidence_sha256']:
            raise ValueError('Existing index/evidence mismatch; will not overwrite')
        print(f"Verified existing {source['id']}", flush=True)
        return receipt
    # Temporary files live on the same volume. Original bytes are never re-exported.
    with tempfile.TemporaryDirectory(prefix='import-', dir=target) as temp:
        temp = Path(temp)
        evidence = download(source['url'], temp / 'publisher.html', 4_000_000)
        evidence_text = (temp / 'publisher.html').read_text(encoding='utf-8')
        if source['license_url'] not in evidence_text:
            raise ValueError('Expected publisher license link missing; manual review required')
        result = download(source['download'], temp / 'original.pdf', source['max_bytes'])
        if sha(temp / 'original.pdf') != ACCEPTED[source['id']]['sha256']:
            raise ValueError('Publisher PDF changed since license review; manual re-review required')
        with (temp / 'original.pdf').open('rb') as f:
            if f.read(5) != b'%PDF-':
                raise ValueError('Not a PDF')
        reader = PdfReader(temp / 'original.pdf')
        if reader.is_encrypted or not 1 <= len(reader.pages) <= 3000:
            raise ValueError('Encrypted or oversized page count')
        count = len(reader.pages)
        labels = list(reader.page_labels)
        tool = shutil.which('pdftotext')
        if not tool and shutil.which('pdftoppm'):
            tool = str(Path(shutil.which('pdftoppm')).with_name('pdftotext.exe'))
        if tool and Path(tool).is_file():
            subprocess.run([tool, '-layout', '-enc', 'UTF-8', str(temp / 'original.pdf'), str(temp / 'pages.txt')], check=True, timeout=180)
            pages = (temp / 'pages.txt').read_text(encoding='utf-8').split('\f')
        else:
            pages = [p.extract_text() or '' for p in reader.pages]
        if len(pages) == count + 1 and not pages[-1].strip():
            pages.pop()
        if len(pages) != count:
            raise ValueError('Page extraction count mismatch')
        index = [{'page': n+1, 'label': labels[n], 'text': ' '.join(text.split())} for n, text in enumerate(pages)]
        (temp / 'pages.json').write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
        receipt = {**result, 'id': source['id'], 'sha256': sha(temp / 'original.pdf'),
                   'pages': count, 'downloaded_at': datetime.now(timezone.utc).isoformat(),
                   'publisher_evidence_sha256': sha(temp / 'publisher.html'), 'publisher_evidence': evidence,
                   'index_sha256': sha(temp / 'pages.json'), 'catalog_sha256': sha(HERE / 'catalog.json'),
                   'original_unchanged': True, 'blank_text_pages': sum(not p['text'] for p in index)}
        for name in ['original.pdf', 'publisher.html', 'pages.json']:
            os.replace(temp / name, target / name)
        receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
        print(f"Imported {source['id']}: {count} pages, {result['bytes']} bytes", flush=True)
        return receipt

if __name__ == '__main__':
    DATA.mkdir(parents=True, exist_ok=True)
    assert len(CATALOG['sources']) == 5
    assert sum(s['max_bytes'] for s in CATALOG['sources']) <= 500_000_000
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(prepare, CATALOG['sources']))
    (DATA / 'import-summary.json').write_text(json.dumps(receipts, indent=2), encoding='utf-8')
    print(json.dumps({'sources': len(receipts), 'bytes': sum(r['bytes'] for r in receipts), 'pages': sum(r['pages'] for r in receipts)}))
