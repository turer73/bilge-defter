"""Actual nginx/auth/worker acceptance; isolated synthetic identities only.

This module, tests and fixture never enter the production image. The converter
is unchanged. No real account JWT, mailbox, notebook or student deck is used.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_release_proxy_v73 as previous

previous.HEADERS = HEADERS = Path('/tmp/v75-synthetic-headers.json')
BASE = '/api/v1/bilge-defter'


def check():
    import httpx
    from test_accounts_cas import payload
    from test_presentations import deck
    headers = json.loads(HEADERS.read_text())
    checks = {}
    with httpx.Client(base_url='http://bilge-defter-invited-web-preview-v75',
                      timeout=100, trust_env=False) as client:
        def req(method, path, **kwargs):
            time.sleep(.55)  # Existing nginx rate limit remains in force.
            return client.request(method, BASE + path, **kwargs)
        get = lambda path, h: req('GET', path, headers=h)
        post = lambda path, h, **kw: req('POST', path, headers=h, **kw)
        assert get('/backup', headers['first']).status_code == 404
        assert post('/backup', {**headers['first'], 'If-None-Match': '*'}, json=payload()).status_code == 200
        first = get('/backup', headers['first'])
        assert first.json()['ciphertext'] == payload()['ciphertext']
        tag = first.headers['ETag']
        assert get('/backup', {**headers['first'], 'If-None-Match': tag}).status_code == 304
        assert get('/backup', headers['second']).status_code == 404
        assert get('/backup', {}).status_code == 401
        assert post('/backup', {**headers['first'], 'If-Match': tag}, json=payload(b'second')).status_code == 200
        assert get('/backup/previous', headers['first']).json()['ciphertext'] == payload()['ciphertext']
        assert get('/backup/previous', headers['second']).status_code == 404
        assert get('/backup/previous', {}).status_code == 401
        checks['sync_account_isolation_previous_copy'] = True
        assert sum(d['count'] for d in get('/dictionaries', headers['first']).json()['dictionaries']) == 146532
        assert get('/dictionaries/tdk-gts-v12/search?q=kalp', headers['first']).json()['results']
        checks['dictionary_records'] = 146532
        path, status = '/pdf-tools/convert', '/pdf-tools/status'
        assert get(status, {}).status_code == 401
        assert get(status, headers['pending']).status_code == 403
        available = get(status, headers['first']).json()
        assert available['available'] is True and available['max_slides'] == 100
        consent = {**headers['first'], 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                   'X-Bilge-Pdf-Consent': '1'}
        assert post(path, headers['first'], content=b'bad').status_code == 400
        assert post(path, {**consent, 'Origin': 'https://evil.example'}, content=b'bad').status_code == 403
        assert post(path, {**consent, 'X-Bilge-Account': 'wrong'}, content=b'bad').status_code == 409
        assert post(path, consent, content=b'bad').status_code == 415
        over = post(path, consent, content=deck(slides=101))
        assert over.status_code == 422
        assert over.json() == {'detail': {'code': 'presentation_slide_limit', 'max_slides': 100, 'actual_slides': 101}}
        assert post(path, consent, content=b'x' * (20 * 1024 * 1024 + 1)).status_code == 413
        medium = post(path, consent, content=b'x' * (9 * 1024 * 1024))
        assert medium.status_code == 415 and medium.headers['content-type'].startswith('application/json')
        assert post('/backup', headers['first'], content=b'x' * (9 * 1024 * 1024)).status_code == 413
        checks['auth_consent_csrf_limits'] = True
        data = Path('/srv/tests/fixtures/page-limit-100.pptx').read_bytes()
        started = time.monotonic()
        converted = post(path, consent, content=data)
        assert converted.status_code == 200, converted.status_code
        assert converted.headers['content-type'].startswith('application/pdf')
        assert converted.content.startswith(b'%PDF-') and b'%%EOF' in converted.content[-1024:]
        assert converted.headers['X-Bilge-Pdf-Result'] == 'converted'
        assert 'no-store' in converted.headers['Cache-Control']
        # LibreOffice writes ordinary page dictionaries. Independently open with
        # pypdf/PDF.js outside this container before activation as a second check.
        count = len(re.findall(rb'/Type\s*/Page\b', converted.content))
        assert count == 100, count
        Path('/tmp/page-limit-100.pdf').write_bytes(converted.content)
        assert get(status, headers['first']).json()['available'] is True
        checks.update({'max_slides': 100, 'rejected_slides': 101, 'converted_pages': count,
                       'fixture_sha256': hashlib.sha256(data).hexdigest(),
                       'pdf_sha256': hashlib.sha256(converted.content).hexdigest(),
                       'conversion_seconds': round(time.monotonic() - started, 3)})
    print(json.dumps({'passed': True, 'synthetic_accounts_only': True, **checks}))


if __name__ == '__main__':
    {'serve': previous.serve, 'check': check}[sys.argv[1]]()
