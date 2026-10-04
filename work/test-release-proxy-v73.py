"""Real nginx/auth/worker acceptance using only isolated synthetic accounts.

This script and temporary signing keys never enter the production image.
Fixtures are separately staged public/synthetic documents, never student notes.
"""
import json
import os
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
HEADERS = Path('/tmp/v73-synthetic-headers.json')
BASE = '/api/v1/bilge-defter'


def serve():
    import pytest
    import uvicorn
    from test_accounts_cas import env, approved, headers, SECOND
    from app.main import app
    with tempfile.TemporaryDirectory(prefix='v73-proxy-') as folder:
        mp = pytest.MonkeyPatch()
        fixture = env.__wrapped__(Path(folder), mp)
        values = next(fixture)
        try:
            first, second = approved(values), approved(values, SECOND)
            pending = headers(values, 'pending@example.com')
            values[0].post(BASE + '/registration', headers=pending)
            fd = os.open(HEADERS, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump({'first': first, 'second': second, 'pending': pending}, stream)
            uvicorn.run(app, host='0.0.0.0', port=8080, access_log=False, log_level='warning')
        finally:
            fixture.close()
            mp.undo()


def check():
    import httpx
    from test_accounts_cas import payload
    from test_presentations import deck
    h = json.loads(HEADERS.read_text())
    checks = {}
    with httpx.Client(base_url='http://bilge-defter-invited-web-preview-v73', timeout=100, trust_env=False) as c:
        def req(method, path, **kwargs):
            # nginx per-IP allowance is 2/s. Do not mistake a flood test for auth.
            time.sleep(.55)
            return c.request(method, BASE + path, **kwargs)
        get = lambda path, headers: req('GET', path, headers=headers)
        post = lambda path, headers, **kwargs: req('POST', path, headers=headers, **kwargs)
        assert get('/backup', h['first']).status_code == 404
        assert post('/backup', {**h['first'], 'If-None-Match': '*'}, json=payload()).status_code == 200
        initial = get('/backup', h['first'])
        assert initial.json()['ciphertext'] == payload()['ciphertext']
        tag = initial.headers['ETag']
        cached = get('/backup', {**h['first'], 'If-None-Match': tag})
        assert cached.status_code == 304 and cached.content == b''
        assert get('/backup', h['second']).status_code == 404
        assert get('/backup', {}).status_code == 401
        assert post('/backup', {**h['first'], 'If-Match': tag}, json=payload(b'second')).status_code == 200
        assert get('/backup/previous', h['first']).json()['ciphertext'] == payload()['ciphertext']
        assert get('/backup/previous', h['second']).status_code == 404
        assert get('/backup/previous', {}).status_code == 401
        checks['sync_account_isolation_previous_copy'] = True
        assert sum(d['count'] for d in get('/dictionaries', h['first']).json()['dictionaries']) == 146532
        assert get('/dictionaries/tdk-gts-v12/search?q=kalp', h['first']).json()['results']
        checks['dictionary_records'] = 146532
        path = '/pdf-tools/convert'
        status = '/pdf-tools/status'
        assert get(status, {}).status_code == 401
        assert get(status, h['pending']).status_code == 403
        assert get(status, h['first']).json()['available'] is True
        consent = {**h['first'], 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'X-Bilge-Pdf-Consent': '1'}
        assert post(path, h['first'], content=b'bad').status_code == 400
        assert post(path, {**consent, 'Origin': 'https://evil.example'}, content=b'bad').status_code == 403
        assert post(path, {**consent, 'X-Bilge-Account': 'wrong'}, content=b'bad').status_code == 409
        assert post(path, consent, content=b'bad').status_code == 415
        assert post(path, consent, content=deck(slides=51)).status_code == 415
        assert post(path, consent, content=b'x' * (20 * 1024 * 1024 + 1)).status_code == 413
        # >8MiB passes narrow nginx upload exception and reaches PPTX validation.
        medium = post(path, consent, content=b'x' * (9 * 1024 * 1024))
        assert medium.status_code == 415 and medium.headers['content-type'].startswith('application/json')
        assert post('/backup', h['first'], content=b'x' * (9 * 1024 * 1024)).status_code == 413
        checks['auth_consent_csrf_limits'] = True
        timings = {}
        for label in ('native-chart', 'lumen-integumentary-original'):
            data = Path('/tmp/' + label + '.pptx').read_bytes()
            start = time.monotonic()
            response = post(path, consent, content=data)
            assert response.status_code == 200, (label, response.status_code)
            assert response.headers['content-type'].startswith('application/pdf')
            assert response.content.startswith(b'%PDF-') and b'%%EOF' in response.content[-1024:]
            assert response.headers['X-Bilge-Pdf-Result'] == 'converted'
            assert 'no-store' in response.headers['Cache-Control']
            Path('/tmp/' + label + '-v73.pdf').write_bytes(response.content)
            timings[label] = round(time.monotonic() - start, 3)
        assert get(status, h['first']).json()['available'] is True
        checks['real_worker_seconds'] = timings
    print(json.dumps({'passed': True, 'synthetic_accounts_only': True, **checks}))


if __name__ == '__main__':
    {'serve': serve, 'check': check}[sys.argv[1]]()
