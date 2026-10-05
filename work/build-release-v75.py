"""Package one committed v75 tree plus the pinned v74 reader and synthetic fixture.

Production app/UI bytes must match Git. The synthetic presentation is a separately
hash-bound acceptance input, never a student file or a production image layer.
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/page-limit-release-20261005/package'
FIXTURE = ROOT / 'outputs/page-limit-release-20261005/fixture/output/finalpage-limit-100.pptx'
BASELINE = 'd8cc025d9bcc43a08c12654a9aabc6958da9a051'
SCRIPTS = ['deploy-v57.py', 'deploy-v68.py', 'deploy-v75.py', 'verify-publication-v75.py']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build():
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    def git(name, revision=commit):
        return subprocess.check_output(['git', 'show', revision + ':' + name], cwd=ROOT)
    scope = ['work/bilge-defter-test', 'server-candidate/v49', 'work/build-invited.cjs',
             'work/prepare-v74-compat.cjs', 'work/build-release-v75.py', 'work/classroom-nginx.conf',
             'work/release-v73.Dockerfile', 'work/test-release-dictionary-v57.py',
             'work/test-release-proxy-v73.py', 'work/test-release-proxy-v75.py'] + ['work/' + name for name in SCRIPTS]
    assert not subprocess.check_output(['git', 'status', '--porcelain', '--'] + scope, cwd=ROOT).strip(), 'Commit release sources first'
    paths = {name: git('work/' + name) for name in SCRIPTS}
    paths['classroom-nginx.conf'] = git('work/classroom-nginx.conf')
    assert sha(paths['classroom-nginx.conf']) == '644511c8b1da01f7afb3d08483babab22192070c210936d1108eb0b12fc42ed1'
    for name in subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', commit,
                                        'server-candidate/v49/app', 'server-candidate/v49/tests'], cwd=ROOT, text=True).splitlines():
        paths['api/' + name.removeprefix('server-candidate/v49/')] = git(name)
    paths['api/Dockerfile'] = git('work/release-v73.Dockerfile')
    paths['api/tests/test_release_dictionary.py'] = git('work/test-release-dictionary-v57.py')
    for version in ['v73', 'v75']:
        paths['api/tests/test_release_proxy_' + version + '.py'] = git('work/test-release-proxy-' + version + '.py')
    baseline_paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASELINE,
                                            'server-candidate/v49/app'], cwd=ROOT, text=True).splitlines()
    paths['api-baseline.json'] = json.dumps({name.removeprefix('server-candidate/v49/'): sha(git(name, BASELINE).replace(b'\r\n', b'\n'))
                                           for name in baseline_paths if name.endswith('.py')}, sort_keys=True).encode()
    manifests = {}
    for version, prefix in [('v74', 'bridge-ui/'), ('v75', 'ui/')]:
        ui = ROOT / 'work' / ('bilge-defter-invited-' + version)
        assert json.loads((ui / 'release.json').read_text()) == {'version': version}
        sums = (ui / 'SHA256SUMS').read_bytes()
        manifests[version] = sha(sums)
        for line in sums.decode().splitlines():
            digest, name = line.split(maxsplit=1)
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            data = (ui / name).read_bytes()
            assert sha(data) == digest, name
            if version == 'v75':
                assert data == git('work/bilge-defter-test/' + name), name
            paths[prefix + name] = data
        paths[prefix + 'SHA256SUMS'] = sums
    assert manifests['v74'] == '932de743ac5baf5c71b9e9ec82e51361dbd15c6b2b1f16da6ebb0445b58dd566'
    assert manifests['v75'] == '52fc08547724935d63718d0b092e39221171565facd8d77d748e68cfa30a0c8f'
    fixture = FIXTURE.read_bytes()
    assert 0 < len(fixture) < 20 * 1024 * 1024
    with zipfile.ZipFile(io.BytesIO(fixture)) as archive:
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        assert len(presentation.findall('.//{http://schemas.openxmlformats.org/presentationml/2006/main}sldId')) == 100
    paths['api/tests/fixtures/page-limit-100.pptx'] = fixture
    receipt = {
        'commit': commit, 'package': 'v75', 'api_baseline': BASELINE,
        'ui_manifest_sha256': manifests['v75'],
        'prior': {'version': 'v73', 'api_version': 'v73',
                  'ui_manifest_sha256': 'c624c2fc5661100145c8ecd2841f36aadca3911e28bf5ec1da44f9eabcadd4ce',
                  'api_image': 'sha256:b916548e00837e9fac5244f3bd8a14ad773e63289c1379b1b588e9d35789c826',
                  'nginx_sha256': sha(paths['classroom-nginx.conf'])},
        'bridge': {'version': 'v74', 'base_commit': BASELINE, 'ui_manifest_sha256': manifests['v74']},
        'worker': {'name': 'bd-pptx-v73-worker',
                   'id': 'c29fce88566645b55bb979a3454baca36d68923371fac550306869448c3c220e',
                   'image': 'sha256:c7288011ccb2df31469c59aaa7398dd7d9d926647a4b3dbff78e0a672100f95c',
                   'socket': '/opt/bilge-defter-classroom-v73/socket'},
        'base_images': {'bilge-defter-accounts:v57-production': 'sha256:f69cead9ed2e146c88bc46462fdbce7ae264d6338cd40ca00786320486dc2fb8',
                        'bilge-defter-accounts:v57-verify': 'sha256:31b03c912a19bf500feb6181349a5c905501576bfcb18a2a395efaec5b1a71ec'},
        'acceptance_fixture': {'synthetic_only': True, 'slides': 100, 'sha256': sha(fixture)},
        'files': {name: sha(data) for name, data in paths.items()},
    }
    paths['source-receipt.json'] = json.dumps(receipt, indent=2).encode()
    OUT.mkdir(parents=True, exist_ok=True)
    with tarfile.open(OUT / 'payload.tar.gz', 'w:gz') as archive:
        for name, data in sorted(paths.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(data), 0o644
            archive.addfile(info, io.BytesIO(data))
    (OUT / 'source-receipt.json').write_bytes(paths['source-receipt.json'])
    print(json.dumps({'commit': commit, 'files': len(paths),
                      'payload_sha256': sha((OUT / 'payload.tar.gz').read_bytes())}))


if __name__ == '__main__':
    build()
