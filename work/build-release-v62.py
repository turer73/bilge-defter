"""Allowlisted web-only v62 payload: committed source and nginx whitelist only; no library, accounts or data."""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HASH = '3592843ad931fae4eef005a37fe8424fb989c72143419d90b88f3fa4a93471f4'
CONFHASH = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
SCRIPTS = ['deploy-v57.py', 'deploy-v62.py', 'verify-publication-v57.py', 'verify-publication-v62.py']
OUT = ROOT/'outputs/v62-release'
OUT.mkdir(parents=True, exist_ok=True)
COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--porcelain', '--', 'work/bilge-defter-test', 'work/build-invited.cjs', 'work/classroom-nginx.conf'] + ['work/'+n for n in SCRIPTS], cwd=ROOT, text=True)
assert dirty == '', dirty


def git(path):
    return subprocess.check_output(['git', 'show', f'{COMMIT}:{path}'], cwd=ROOT)


paths = {name: git('work/'+name) for name in SCRIPTS}
paths['classroom-nginx.conf'] = git('work/classroom-nginx.conf')
assert hashlib.sha256(paths['classroom-nginx.conf']).hexdigest() == CONFHASH
ui = ROOT/'work/bilge-defter-invited-v62'
assert hashlib.sha256((ui/'SHA256SUMS').read_bytes()).hexdigest() == HASH
for line in (ui/'SHA256SUMS').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    data = (ui/name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == digest
    # Every shipped byte equals the committed source file of the same name.
    assert data == git('work/bilge-defter-test/'+name), name
    paths['ui/'+name] = data
paths['ui/SHA256SUMS'] = (ui/'SHA256SUMS').read_bytes()
receipt = {'commit': COMMIT, 'package': 'v62', 'library': 'unchanged; live code stays in /opt/bilge-defter-classroom-v58/library',
           'files': {name: hashlib.sha256(data).hexdigest() for name, data in paths.items()}}
paths['source-receipt.json'] = json.dumps(receipt, indent=2).encode()
with tarfile.open(OUT/'payload.tar.gz', 'w:gz') as archive:
    for name, data in paths.items():
        info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
(OUT/'source-receipt.json').write_bytes(paths['source-receipt.json'])
print(json.dumps({'commit': COMMIT, 'files': len(paths), 'payload_sha256': hashlib.sha256((OUT/'payload.tar.gz').read_bytes()).hexdigest()}))
