"""Allowlisted v58 payload: committed source only, no account service or data."""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'outputs/v58-release'
OUT.mkdir(parents=True, exist_ok=True)
COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
def git(path):
    return subprocess.check_output(['git', 'show', f'{COMMIT}:{path}'], cwd=ROOT)
paths = {}
for name in ['server.py', 'prepare.py', 'hosted.py', 'healthcheck.py', 'backup_state.py', 'textview.py', 'quote.js', 'catalog.json', 'accepted-sources.json', 'app.js', 'index.html', 'style.css']:
    paths['library/'+name] = git('work/library-pilot/'+name)
for name in ['deploy-v57.py', 'deploy-v58.py', 'verify-publication-v57.py', 'verify-publication-v58.py']:
    paths[name] = git('work/'+name)
ui = ROOT/'work/bilge-defter-invited-v58'
assert hashlib.sha256((ui/'SHA256SUMS').read_bytes()).hexdigest() == 'e39aa2e0087a62bb9bf4fa1cb4821efa59f232c7e459d3cc419801868fd21c4b'
# The built invited profile is pinned to the tested hash. Its template must be
# exactly the committed one, and build provenance records that same tree.
for name in ['index.html', 'sw.js', 'offline-assets.json', 'release.json', 'SHA256SUMS']:
    assert (ROOT/'work/bilge-defter-test'/name).read_bytes() == git('work/bilge-defter-test/'+name)
for line in (ui/'SHA256SUMS').read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    data = (ui/name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == digest
    paths['ui/'+name] = data
paths['ui/SHA256SUMS'] = (ui/'SHA256SUMS').read_bytes()
receipt = {'commit': COMMIT, 'package': 'v58', 'files': {name: hashlib.sha256(data).hexdigest() for name, data in paths.items()}}
paths['source-receipt.json'] = json.dumps(receipt, indent=2).encode()
with tarfile.open(OUT/'payload.tar.gz', 'w:gz') as archive:
    for name, data in paths.items():
        info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
(OUT/'source-receipt.json').write_bytes(paths['source-receipt.json'])
print(json.dumps({'commit': COMMIT, 'files': len(paths), 'payload_sha256': hashlib.sha256((OUT/'payload.tar.gz').read_bytes()).hexdigest()}))
