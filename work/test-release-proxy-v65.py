"""Synthetic identities ONLY in isolated verify image, never production entrypoint.

serve creates temporary accounts and an in-memory test signing key. check exercises
the unchanged nginx config through its preview API upstream. No student DB/secrets.
"""
import json
import os
from pathlib import Path
import sys
import tempfile

# Direct execution sets sys.path to /srv/tests; pytest normally adds /srv for us.
# This path adjustment is confined to the isolated verify-image test harness.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

HEADERS = Path('/tmp/v65-synthetic-headers.json')
BASE = '/api/v1/bilge-defter'


def serve():
    import pytest
    import uvicorn
    from test_accounts_cas import env, approved, SECOND
    from app.main import app
    with tempfile.TemporaryDirectory(prefix='v65-proxy-') as folder:
        mp = pytest.MonkeyPatch()
        fixture = env.__wrapped__(Path(folder), mp)
        values = next(fixture)
        try:
            h = approved(values)
            second = approved(values, SECOND)
            # env fixture patches only this isolated process; production app and
            # nginx use their actual routes and middleware without test endpoints.
            fd = os.open(HEADERS, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump({'first': h, 'second': second}, stream)
            uvicorn.run(app, host='0.0.0.0', port=8080, access_log=False, log_level='warning')
        finally:
            fixture.close()
            mp.undo()


def check():
    import httpx
    from test_accounts_cas import payload
    h = json.loads(HEADERS.read_text())
    with httpx.Client(base_url='http://bilge-defter-invited-web-preview-v65', timeout=15, trust_env=False) as c:
        get = lambda path, headers: c.get(BASE + path, headers=headers)
        assert get('/backup', h['first']).status_code == 404
        put = c.post(BASE + '/backup', headers={**h['first'], 'If-None-Match': '*'}, json=payload())
        assert put.status_code == 200
        initial = get('/backup', h['first'])
        assert initial.status_code == 200 and initial.json()['ciphertext'] == payload()['ciphertext']
        tag = initial.headers['ETag']
        unchanged = get('/backup', {**h['first'], 'If-None-Match': tag})
        assert unchanged.status_code == 304 and unchanged.content == b''
        assert unchanged.headers['ETag'] == tag and unchanged.headers['X-Bilge-Sync-Protocol'] == 'cas-v1'
        assert 'no-store' in unchanged.headers['Cache-Control']
        assert get('/backup', {**h['first'], 'If-None-Match': '"stale"'}).status_code == 200
        assert get('/backup', {**h['second'], 'If-None-Match': tag}).status_code == 404
        assert get('/backup', {'If-None-Match': tag}).status_code == 401
        assert get('/backup', {**h['first'], 'X-Bilge-Account': 'wrong', 'If-None-Match': tag}).status_code == 409
        dictionaries = get('/dictionaries', h['first'])
        assert dictionaries.status_code == 200
        assert sum(d['count'] for d in dictionaries.json()['dictionaries']) == 146532
        found = get('/dictionaries/tdk-gts-v12/search?q=kalp', h['first'])
        assert found.status_code == 200 and 0 < len(found.json()['results']) <= 25
    print(json.dumps({'nginx_conditional_get': True, 'account_isolation': True,
                      'dictionary_records': 146532, 'synthetic_accounts_only': True}))


if __name__ == '__main__':
    {'serve': serve, 'check': check}[sys.argv[1]]()
