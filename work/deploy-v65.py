"""Pinned v65 web/accounts release. No schema, library, auth or DNS changes.

prepare/stage/activate/verify/rollback run as root. Never print inspect or env.
Synthetic signing keys and fixture code exist only in the preview verify image.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tarfile
import time

sys.dont_write_bytecode = True
ROOT = Path('/opt/bilge-defter-classroom-v65')
PRIOR = Path('/opt/bilge-defter-classroom-v64')
OLD_API = 'sha256:f69cead9ed2e146c88bc46462fdbce7ae264d6338cd40ca00786320486dc2fb8'
VERIFY_BASE = 'sha256:31b03c912a19bf500feb6181349a5c905501576bfcb18a2a395efaec5b1a71ec'
CONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
OLDHASH = '7db781b5391eddd2aba12dfafb13c3a3a572737c62643e84d653d50832cb0fff'
spec = importlib.util.spec_from_file_location('release_base', ROOT / 'deploy-v57.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
b.ROOT, b.PRIOR = ROOT, PRIOR
NAMES = [b.WEB, b.API]


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def protected():
    excluded = set(NAMES + [n + suffix for n in NAMES for suffix in
                           ['-preview-v65', '-rollback-v65', '-failed-v65']])
    result = []
    for ident in b.run('docker', 'ps', '-aq').split():
        c = b.inspect(ident)
        if c['Name'].lstrip('/') not in excluded:
            result.append([c['Name'], c['Id'], c['State']['Status'], c['State']['StartedAt']])
    return {'containers': sorted(result), 'main_pid': b.run('systemctl', 'show', 'linux-ai-server', '-p', 'MainPID', '--value')}


def unchanged():
    need(protected() == b.load('protected.json'), 'Other runtime changed; stop and review')


def package():
    receipt = json.loads((ROOT / 'source-receipt.json').read_text())
    need(receipt['package'] == 'v65', 'Wrong package')
    for name, digest in receipt['files'].items():
        path = ROOT / name
        need(path.resolve().is_relative_to(ROOT) and b.sha(path) == digest, 'Package hash mismatch: ' + name)
    need(b.sha(ROOT / 'classroom-nginx.conf') == CONF, 'Nginx config changed')
    return receipt


def old():
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() == PRIOR / 'ui', 'Not live v64')
    need(b.sha(PRIOR / 'ui/SHA256SUMS') == OLDHASH, 'Old web manifest changed')
    for name, image in [(b.WEB, b.WEBIMAGE), (b.API, OLD_API)]:
        c = b.inspect(name)
        need(c and c['State']['Running'] and c['Image'] == image, 'Live runtime mismatch')
        if (ROOT / 'private' / (name + '.json')).exists():
            need(c['Id'] == b.load(name + '.json')['Id'], 'Container changed during preparation')
    web_mounts = {m['Destination']: m['Source'] for m in b.inspect(b.WEB)['Mounts']}
    need(web_mounts == {'/usr/share/nginx/html': str(PRIOR / 'ui'),
                        '/etc/nginx/conf.d/default.conf': str(PRIOR / 'classroom-nginx.conf')}, 'Old web mount mismatch')


def prepare():
    old()
    need(not (ROOT / 'private').exists(), 'Already prepared; do not overwrite snapshots')
    for name in NAMES:
        for suffix in ['-preview-v65', '-rollback-v65', '-failed-v65']:
            need(b.inspect(name + suffix) is None, 'Conflicting container')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 18800))
    with tarfile.open(ROOT / 'payload.tar.gz') as archive:
        for m in archive.getmembers():
            need(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts,
                 'Unsafe payload path')
            need(m.name.startswith(('ui/', 'api/')) or m.name in {
                'deploy-v57.py', 'deploy-v65.py', 'verify-publication-v57.py', 'verify-publication-v64.py',
                'verify-publication-v65.py', 'classroom-nginx.conf', 'api-baseline.json', 'source-receipt.json'},
                'Unexpected payload file')
        archive.extractall(ROOT, filter='data')
    package()
    (ROOT / 'private').mkdir(mode=0o700)
    b.private_json(ROOT / 'private/protected.json', protected())
    for name in NAMES:
        b.private_json(ROOT / 'private' / (name + '.json'), b.inspect(name))
    # Verify the current API equals the committed baseline (normalize Git CRLF).
    hashes = json.loads(b.run('docker', 'exec', b.API, 'python', '-c',
        "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
    need(hashes == json.loads((ROOT / 'api-baseline.json').read_text()), 'Live API differs from reviewed baseline')
    mounts = {m['Destination']: m for m in b.inspect(b.API)['Mounts']}
    need(set(mounts) == {'/data', '/run/bilge-secrets', '/dictionaries'}, 'Unexpected API data mounts')
    backup = b.snapshot(Path(mounts['/data']['Source']) / 'bilge-defter.sqlite', ROOT / 'private/accounts.sqlite')
    b.private_json(ROOT / 'private/backup-receipt.json', {'accounts': backup})
    old(); unchanged()
    print(json.dumps({'prepared': True, 'backup_sha256': backup, 'source': package()['commit']}))


def clone(name, source, preview=False):
    original_run, original_load = b.run, b.load
    snapshot = original_load(source + '.json')
    dictionary = next((m['Source'] for m in snapshot['Mounts'] if m['Destination'] == '/dictionaries'), None)
    images = json.loads((ROOT / 'images.json').read_text())

    def load(filename):
        if filename != source + '.json':
            return original_load(filename)
        c = copy.deepcopy(snapshot)
        if source == b.API:
            # Base helper adds one dictionary mount. Preserve the existing source,
            # never mount twice or copy the shared server DB into the new image.
            c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/dictionaries']
            if preview:
                c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/run/bilge-secrets']
                c['Config']['Env'] = [e for e in c['Config'].get('Env', []) if
                                     e.split('=', 1)[0] in ['PATH', 'LANG', 'PYTHON_VERSION', 'PYTHON_SHA256',
                                                           'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED']]
                c['Config']['Cmd'] = ['python', '/srv/tests/test_release_proxy_v65.py', 'serve']
        return c

    def run(*args, **kwargs):
        args = list(args)
        if args[:2] == ['docker', 'create']:
            if source == b.API:
                need(dictionary is not None, 'Dictionary mount missing')
                args = [a.replace('src=' + str(ROOT / 'dictionary') + ',', 'src=' + dictionary + ',') for a in args]
                if preview:
                    args = [images['verify'] if a == images['accounts'] else a for a in args]
        return original_run(*args, **kwargs)

    b.run, b.load = run, load
    try:
        b.clone(name, source, preview)
    finally:
        b.run, b.load = original_run, original_load


def health(name, expected='v65'):
    for _ in range(30):
        p = subprocess.run(['docker', 'exec', name, 'python', '-c',
            "import urllib.request,json;print(json.loads(urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=2).read())['version'])"],
            capture_output=True, text=True)
        if p.returncode == 0 and p.stdout.strip() == expected:
            return
        time.sleep(1)
    raise RuntimeError('API health failed')


def verify(port=18790):
    return json.loads(b.run('python3', str(ROOT / 'verify-publication-v65.py'), str(ROOT / 'ui'), str(port)))


def stage():
    old(); package(); unchanged()
    for tag, expected in [('bilge-defter-accounts:v57-production', OLD_API), ('bilge-defter-accounts:v57-verify', VERIFY_BASE)]:
        need(json.loads(b.run('docker', 'image', 'inspect', tag))[0]['Id'] == expected, 'Dependency base drift')
    for target in ['production', 'verify']:
        with (ROOT / ('build-' + target + '.log')).open('x') as output:
            result = subprocess.run(['docker', 'build', '--pull=false', '--network=none', '--target', target,
                '-t', 'bilge-defter-accounts:v65-' + target, str(ROOT / 'api')], stdout=output, stderr=subprocess.STDOUT, timeout=300)
        need(result.returncode == 0, 'Image build failed; see bounded build log')
    images = {key: json.loads(b.run('docker', 'image', 'inspect', 'bilge-defter-accounts:v65-' + target))[0]['Id']
              for key, target in [('accounts', 'production'), ('verify', 'verify')]}
    (ROOT / 'images.json').write_text(json.dumps(images))
    dictionary = next(m['Source'] for m in b.load(b.API + '.json')['Mounts'] if m['Destination'] == '/dictionaries')
    output = b.run('docker', 'run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,size=128m,mode=1777',
        '--memory', '768m', '--cpus', '1.5', '--pids-limit', '100', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--mount', 'type=bind,src=' + dictionary + ',dst=/dictionaries,readonly',
        images['verify'], timeout=180)
    (ROOT / 'api-tests.txt').write_text(output)
    need('79 passed' in output, 'API release tests failed')
    config = (ROOT / 'classroom-nginx.conf').read_text().replace(b.API + ':8080', b.API + '-preview-v65:8080')
    (ROOT / 'preview-nginx.conf').write_text(config)
    clone(b.API + '-preview-v65', b.API, True)
    health(b.API + '-preview-v65')
    clone(b.WEB + '-preview-v65', b.WEB, True)
    web = verify(18800)
    proxy = json.loads(b.run('docker', 'exec', b.API + '-preview-v65', 'python', '/srv/tests/test_release_proxy_v65.py', 'check'))
    old(); unchanged()
    result = {'source': package()['commit'], 'web': web, 'api_tests': 79, 'proxy': proxy}
    (ROOT / 'stage-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


def point(path):
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'], 'Unexpected current link')
    temp = b.CURRENT.parent / '.current-v65'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary link already exists')
    temp.symlink_to(path)
    temp.replace(b.CURRENT)


def rollback():
    # Preflight BOTH identities before touching the live web. Never restore a stale DB.
    for name in NAMES:
        prior, current = b.inspect(name + '-rollback-v65'), b.inspect(name)
        expected = b.load(name + '.json')['Id']
        need((prior and prior['Id'] == expected) or (current and current['Id'] == expected), 'Rollback identity missing')
        need(b.inspect(name + '-failed-v65') is None, 'Failed container already exists')
    before = protected()
    for name in NAMES:
        prior, current = b.inspect(name + '-rollback-v65'), b.inspect(name)
        if prior:
            if current:
                b.run('docker', 'stop', name)
                b.run('docker', 'rename', name, name + '-failed-v65')
            b.run('docker', 'rename', name + '-rollback-v65', name)
    b.run('docker', 'start', b.API)
    health(b.API, 'v57')
    # nginx resolves the restored API when it starts.
    b.run('docker', 'start', b.WEB)
    point(PRIOR / 'ui')
    proof = json.loads(b.run('python3', str(PRIOR / 'verify-publication-v64.py'), str(PRIOR / 'ui'), '18790'))
    need(before == protected(), 'Unrelated runtime changed during rollback')
    print(json.dumps({'rollback': 'v64', 'proof': proof, 'database_restored': False}))


def activate():
    old(); receipt = package(); unchanged()
    need(json.loads((ROOT / 'stage-proof.json').read_text())['source'] == receipt['commit'], 'Stage source mismatch')
    need(json.loads((ROOT / 'offhost-backups.json').read_text()) == b.load('backup-receipt.json'), 'Off-host backup not verified')
    verify(18800)
    for name in NAMES:
        need(b.inspect(name + '-rollback-v65') is None and b.inspect(name + '-failed-v65') is None,
             'Cutover target already exists')
    try:
        for name in NAMES:
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name + '-rollback-v65')
        clone(b.API, b.API)
        health(b.API)
        current_api, previous_api = b.inspect(b.API), b.load(b.API + '.json')
        safe_mounts = lambda c: sorted((m['Source'], m['Destination'], m['RW']) for m in c['Mounts'])
        need(safe_mounts(current_api) == safe_mounts(previous_api), 'API mounts changed')
        need(current_api['Config']['Env'] == previous_api['Config']['Env'], 'API environment changed')
        clone(b.WEB, b.WEB)
        proof = verify()
        point(ROOT / 'ui'); unchanged()
    except BaseException:
        rollback()
        raise
    for name in NAMES:
        b.run('docker', 'stop', name + '-preview-v65')
    result = {'published': 'v65', 'source': receipt['commit'], 'web': proof, 'api_version': 'v65',
              'unchanged_data_mounts_and_env': True, 'other_services_unchanged': True,
              'rollback': 'sudo python3 -B ' + str(ROOT / 'deploy-v65.py') + ' rollback',
              'actual_device_acceptance': False}
    (ROOT / 'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Root and canonical release path required')
    {'prepare': prepare, 'stage': stage, 'activate': activate, 'rollback': rollback,
     'verify': lambda: print(json.dumps(verify()))}[sys.argv[1]]()
