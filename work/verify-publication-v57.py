"""Read-only origin checks. No real identity or notebook contents."""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

root, port = Path(sys.argv[1]), int(sys.argv[2])
def get(path, headers=None):
    try:
        with urlopen(Request(f'http://127.0.0.1:{port}'+path, headers={'Host':'defter.bilgearena.com', **(headers or {})}), timeout=15) as r:
            return r.status, r.read(), r.headers
    except HTTPError as e:
        return e.code, e.read(), e.headers

count=0
for line in (root/'SHA256SUMS').read_text().splitlines():
    digest,name=line.split(maxsplit=1)
    assert '..' not in Path(name).parts and not name.startswith('/')
    status,body,headers=get('/'+name)
    assert status==200 and hashlib.sha256(body).hexdigest()==digest, name
    assert 'no-store' in headers.get('Cache-Control',''),name
    count+=1
assert count==237
assert json.loads(get('/release.json')[1])=={'version':'v57'}
manifest=json.loads(get('/offline-assets.json')[1])
assert manifest['version']=='v57' and len(manifest['files'])==234
for f in manifest['files']:
    assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['sha256']
routes=['/api/v1/bilge-defter/admin/members','/api/v1/bilge-defter/backup',
        '/api/v1/bilge-defter/dictionaries','/api/v1/bilge-defter/dictionaries/tdk-gts-v12/search?q=kalp',
        '/library/','/library/api/catalog','/library/api/saved']
for route in routes:
    for token in ['', 'invalid-test-token']:
        # Respect the existing library nginx rate limit.
        time.sleep(.2)
        code,body,_=get(route,{'Cf-Access-Jwt-Assertion':token})
        assert code==401,(route,code)
        assert isinstance(json.loads(body),dict)
for route in ['/classroom.env','/SHA256SUMS','/tests/browser_server.py','/health','/api/test-login','/library/healthz']:
    time.sleep(.2)
    assert get(route)[0]==404,route
print(json.dumps({'version':'v57','http_hashes':count,'offline_assets':234,'auth_rejections':14,'private_paths_blocked':6}))
