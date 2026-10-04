"""Read-only v74/v75 origin verification. No identity or notebook access."""
import hashlib
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root, port, version = Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
assert version in {'v74', 'v75'}


def get(path, headers=None):
    try:
        with urlopen(Request(f'http://127.0.0.1:{port}' + path,
                     headers={'Host': 'defter.bilgearena.com', **(headers or {})}), timeout=15) as response:
            return response.status, response.read(), response.headers
    except HTTPError as error:
        return error.code, error.read(), error.headers


count = 0
for line in (root / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    code, body, headers = get('/' + name)
    assert code == 200 and hashlib.sha256(body).hexdigest() == digest, name
    assert 'no-store' in headers.get('Cache-Control', ''), name
    count += 1
assert count == 238
assert json.loads(get('/release.json')[1]) == {'version': version}
manifest = json.loads(get('/offline-assets.json')[1])
assert manifest['version'] == version and len(manifest['files']) == 235
for asset in manifest['files']:
    name = asset['path']
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == asset['sha256']
routes = ['/api/v1/bilge-defter/pdf-tools/status', '/api/v1/bilge-defter/admin/members',
          '/api/v1/bilge-defter/backup', '/api/v1/bilge-defter/dictionaries',
          '/api/v1/bilge-defter/dictionaries/tdk-gts-v12/search?q=kalp',
          '/library/', '/library/api/catalog', '/library/api/saved']
for route in routes:
    for token in ['', 'invalid-test-token']:
        time.sleep(.2)
        code, body, _ = get(route, {'Cf-Access-Jwt-Assertion': token})
        assert code == 401, (route, code)
        assert isinstance(json.loads(body), dict)
for route in ['/classroom.env', '/SHA256SUMS', '/tests/browser_server.py',
              '/health', '/api/test-login', '/library/healthz']:
    time.sleep(.2)
    assert get(route)[0] == 404, route
print(json.dumps({'version': version, 'http_hashes': count, 'offline_assets': 235,
                  'auth_rejections': 16, 'private_paths_blocked': 6}))
