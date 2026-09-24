"""Read-only origin acceptance; never supply identity or access user content."""
import argparse
import hashlib
import json
import urllib.request
import urllib.error
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('root')
parser.add_argument('port', type=int)
args = parser.parse_args()
root = Path(args.root)
base = f'http://127.0.0.1:{args.port}'
count = 0
for line in (root / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    assert '..' not in Path(name).parts and not name.startswith('/')
    with urllib.request.urlopen(urllib.request.Request(base+'/'+name, headers={'Host':'defter.bilgearena.com'}), timeout=15) as response:
        assert 'no-store' in response.headers.get('Cache-Control',''), name
        assert hashlib.sha256(response.read()).hexdigest() == digest, name
    count += 1
assert count == 235
assert json.loads((root/'release.json').read_text())['version'] == 'v52'
manifest = json.loads((root/'offline-assets.json').read_text())
assert manifest['version'] == 'v52' and len(manifest['files']) == 232
assert not any(f['path'].startswith('auth-continue') for f in manifest['files'])
for endpoint in ('/api/v1/bilge-defter/admin/members','/api/v1/bilge-defter/backup'):
    try:
        urllib.request.urlopen(base+endpoint, timeout=15)
        raise AssertionError('Unauthenticated API accepted')
    except urllib.error.HTTPError as e:
        assert e.code == 401, (endpoint,e.code)
for endpoint in ('/classroom.env','/SHA256SUMS','/tests/browser_server.py','/health','/api/test-login'):
    try:
        urllib.request.urlopen(base+endpoint, timeout=15)
        raise AssertionError('Private path exposed')
    except urllib.error.HTTPError as e:
        assert e.code == 404, (endpoint,e.code)
print(json.dumps({'version':'v52','http_hashes_verified':count,'auth_return_no_store':True,'offline_assets':232,'unauthenticated_rejected':2,'private_paths_blocked':5}))
