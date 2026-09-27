"""Build allowlisted v65 web/accounts bytes from a single local Git commit."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'e07d52b6be3d29c4821bad45773b0e7e035538f2'
OUT = ROOT / 'outputs/v65-release'
COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
SCRIPTS = ['deploy-v57.py', 'deploy-v65.py', 'verify-publication-v57.py',
           'verify-publication-v64.py', 'verify-publication-v65.py']
scope = ['work/bilge-defter-test', 'server-candidate/v49', 'work/build-invited.cjs',
         'work/classroom-nginx.conf', 'work/release-v65.Dockerfile', 'work/test-release-proxy-v65.py',
         'work/test-release-dictionary-v57.py'] + ['work/' + s for s in SCRIPTS]
assert not subprocess.check_output(['git', 'status', '--porcelain', '--'] + scope, cwd=ROOT).strip(), 'Uncommitted release files'


def git(path, commit=COMMIT):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)


def sha(data):
    return hashlib.sha256(data).hexdigest()


paths = {name: git('work/' + name) for name in SCRIPTS}
paths['classroom-nginx.conf'] = git('work/classroom-nginx.conf')
assert sha(paths['classroom-nginx.conf']) == '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
api_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', COMMIT,
                                    'server-candidate/v49/app', 'server-candidate/v49/tests'], cwd=ROOT, text=True).splitlines()
for name in api_paths:
    paths['api/' + name.removeprefix('server-candidate/v49/')] = git(name)
paths['api/Dockerfile'] = git('work/release-v65.Dockerfile')
paths['api/tests/test_release_dictionary.py'] = git('work/test-release-dictionary-v57.py')
paths['api/tests/test_release_proxy_v65.py'] = git('work/test-release-proxy-v65.py')
baseline_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASELINE,
                                          'server-candidate/v49/app'], cwd=ROOT, text=True).splitlines()
paths['api-baseline.json'] = json.dumps({p.removeprefix('server-candidate/v49/'): sha(git(p, BASELINE).replace(b'\r\n', b'\n'))
                                       for p in baseline_paths if p.endswith('.py')}, sort_keys=True).encode()
ui = ROOT / 'work/bilge-defter-invited-v65'
assert json.loads((ui / 'release.json').read_text()) == {'version': 'v65'}
for line in (ui / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    data = (ui / name).read_bytes()
    assert sha(data) == digest and data == git('work/bilge-defter-test/' + name), name
    paths['ui/' + name] = data
paths['ui/SHA256SUMS'] = (ui / 'SHA256SUMS').read_bytes()
receipt = {'commit': COMMIT, 'package': 'v65', 'api_baseline': BASELINE,
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
