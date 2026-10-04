"""Package one committed v73 source tree; no fixtures, secrets or local DBs in Git."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/pptx-release-20261005/package'
BASELINE = '728f5f8471fdb8f73016672931e2ee45662819c8'
COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
SCRIPTS = ['deploy-v57.py', 'deploy-v68.py', 'deploy-v73.py', 'prepare-v73.py',
           'verify-publication-v57.py', 'verify-publication-v64.py', 'verify-publication-v73.py']
scope = ['work/bilge-defter-test', 'server-candidate/v49', 'worker',
         'work/build-invited.cjs', 'work/classroom-nginx.conf', 'work/release-v73.Dockerfile',
         'work/test-release-proxy-v73.py', 'work/test-release-dictionary-v57.py',
         'work/build-release-v73.py'] + ['work/' + p for p in SCRIPTS]
assert not subprocess.check_output(['git', 'status', '--porcelain', '--'] + scope, cwd=ROOT).strip(), 'Commit release sources first'

def git(path, commit=COMMIT):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)

def sha(data):
    return hashlib.sha256(data).hexdigest()

paths = {name: git('work/' + name) for name in SCRIPTS}
paths['classroom-nginx.conf'] = git('work/classroom-nginx.conf')
for name in subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', COMMIT,
                                    'server-candidate/v49/app', 'server-candidate/v49/tests'], cwd=ROOT, text=True).splitlines():
    paths['api/' + name.removeprefix('server-candidate/v49/')] = git(name)
paths['api/Dockerfile'] = git('work/release-v73.Dockerfile')
paths['api/tests/test_release_dictionary.py'] = git('work/test-release-dictionary-v57.py')
paths['api/tests/test_release_proxy_v73.py'] = git('work/test-release-proxy-v73.py')
for name in ('Dockerfile', 'pptx_worker.py', 'test_pptx_worker.py'):
    paths['worker/' + name] = git('worker/' + name)
baseline_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASELINE,
                                          'server-candidate/v49/app'], cwd=ROOT, text=True).splitlines()
paths['api-baseline.json'] = json.dumps({p.removeprefix('server-candidate/v49/'): sha(git(p, BASELINE).replace(b'\r\n', b'\n'))
                                       for p in baseline_paths if p.endswith('.py')}, sort_keys=True).encode()
ui = ROOT / 'work/bilge-defter-invited-v73'
assert json.loads((ui / 'release.json').read_text()) == {'version': 'v73'}
for line in (ui / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    data = (ui / name).read_bytes()
    assert sha(data) == digest and data == git('work/bilge-defter-test/' + name), name
    paths['ui/' + name] = data
paths['ui/SHA256SUMS'] = (ui / 'SHA256SUMS').read_bytes()
receipt = {'commit': COMMIT, 'package': 'v73', 'api_baseline': BASELINE,
    'prior': {'ui_manifest_sha256': 'a602e5241d06aefa7b0f9aea2976bb81fb2ccc071fff5c816a01c812adcd93dc',
              'api_image': 'sha256:97d9c22a48e602955c634b8b9fa78114fe76ee65e061a01702b3246022c95bdf', 'api_version': 'v68'},
    'base_images': {'bilge-defter-accounts:v57-production': 'sha256:f69cead9ed2e146c88bc46462fdbce7ae264d6338cd40ca00786320486dc2fb8',
                    'bilge-defter-accounts:v57-verify': 'sha256:31b03c912a19bf500feb6181349a5c905501576bfcb18a2a395efaec5b1a71ec'},
    'worker_base': 'sha256:96eed6dc542afca240700857c633379e7d5992259903026f1f629b7a8df21359',
    'library': 'unchanged', 'files': {p: sha(data) for p, data in paths.items()}}
paths['source-receipt.json'] = json.dumps(receipt, indent=2).encode()
OUT.mkdir(parents=True, exist_ok=True)
with tarfile.open(OUT / 'payload.tar.gz', 'w:gz') as archive:
    for name, data in paths.items():
        info = tarfile.TarInfo(name)
        info.size, info.mode = len(data), 0o644
        archive.addfile(info, io.BytesIO(data))
(OUT / 'source-receipt.json').write_bytes(paths['source-receipt.json'])
print(json.dumps({'commit': COMMIT, 'files': len(paths), 'payload_sha256': sha((OUT / 'payload.tar.gz').read_bytes())}))
