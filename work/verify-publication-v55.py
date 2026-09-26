"""Read-only v55 origin checks. No cookies or actual user data."""
import hashlib,json,sys
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root,port=Path(sys.argv[1]),int(sys.argv[2])
def get(path,headers=None):
    try:
        with urlopen(Request(f'http://127.0.0.1:{port}'+path,headers={'Host':'defter.bilgearena.com',**(headers or {})}),timeout=15) as r:return r.status,r.read(),r.headers
    except HTTPError as e:return e.code,e.read(),e.headers
count=0
for line in (root/'SHA256SUMS').read_text().splitlines():
    sha,name=line.split(maxsplit=1)
    assert '..' not in Path(name).parts and not name.startswith('/')
    code,body,headers=get('/'+name)
    assert code==200 and hashlib.sha256(body).hexdigest()==sha,name
    assert 'no-store' in headers.get('Cache-Control',''),name
    count+=1
assert count==237
assert json.loads(get('/release.json')[1])=={'version':'v55'}
manifest=json.loads(get('/offline-assets.json')[1]);assert manifest['version']=='v55' and len(manifest['files'])==234
for route in ['/api/v1/bilge-defter/admin/members','/api/v1/bilge-defter/backup','/library/','/library/api/catalog','/library/api/saved']:
    assert get(route)[0]==401,route
assert get('/library/api/session',{'Cf-Access-Jwt-Assertion':'invalid-test-token'})[0]==401
for route in ['/classroom.env','/SHA256SUMS','/tests/browser_server.py','/health','/api/test-login']:assert get(route)[0]==404,route
print(json.dumps({'version':'v55','http_hashes':count,'offline_assets':234,'unauthenticated_rejected':5,'forged_rejected':1,'private_paths_blocked':5}))
