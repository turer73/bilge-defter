"""Pinned web-only v70 release: reads notebooks whose PDF and inserted images are stored apart
(asset keys), keeps those keys on save, stores new photo-like PDF pages as JPEG when clearly smaller.
Writing new assets stays off (next release). Accounts v68, library, nginx whitelist, data, auth, DNS
and Access are unchanged.

The web container is created with the same Docker health check as v68/v69. Rollback checks the live release
first (v70 or v69 only), then restores the retained v69 web container or rebuilds it from the
prepared snapshot; `rehearse` proves that rebuild on a loopback port without touching the live web.
prepare/stage/rehearse/activate/verify/rollback run as root. Never print inspect or env.
"""
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import tarfile
import time

sys.dont_write_bytecode = True
ROOT = Path('/opt/bilge-defter-classroom-v70')
PRIOR = Path('/opt/bilge-defter-classroom-v69')
CONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
OLDHASH = '95e9ca5103987fe0740e1119387be85a0955eee87e46fd9b482e6ab6e6b24e55'  # v69 SHA256SUMS (live, measured)
API_IMAGES = Path('/opt/bilge-defter-classroom-v68/images.json')  # accounts image built by the v68 release
API_VERSION = 'v68'
spec = importlib.util.spec_from_file_location('release_base', Path(__file__).with_name('deploy-v57.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
b.ROOT, b.PRIOR = ROOT, PRIOR
NAMES = [b.WEB]
SUFFIXES = ['-preview-v70', '-rollback-v70', '-failed-v70', '-rehearsal-v70']
REHEARSAL_PORT = 18806
PAYLOAD = {'deploy-v57.py', 'deploy-v70.py', 'verify-publication-v57.py', 'verify-publication-v64.py',
           'verify-publication-v70.py', 'classroom-nginx.conf', 'source-receipt.json'}
# Same health check as the v69 web container (the static release file through nginx).
HEALTH = ['--health-cmd', 'curl -fsS -o /dev/null http://127.0.0.1/release.json || exit 1',
          '--health-interval', '30s', '--health-timeout', '5s', '--health-retries', '3', '--health-start-period', '15s']


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def protected():
    # The accounts container is protected here: a web-only release must not change it.
    excluded = set(NAMES + [n + s for n in NAMES for s in SUFFIXES])
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
    need(receipt['package'] == 'v70', 'Wrong package')
    for name, digest in receipt['files'].items():
        path = ROOT / name
        need(path.resolve().is_relative_to(ROOT) and b.sha(path) == digest, 'Package hash mismatch: ' + name)
    need(b.sha(ROOT / 'classroom-nginx.conf') == CONF, 'Nginx config changed')
    return receipt


def api_ok():
    api = b.inspect(b.API)
    image = json.loads(API_IMAGES.read_text())['accounts']
    need(api and api['State']['Running'] and api['Image'] == image, 'Accounts is not the running v68 image')
    need(b.run('docker', 'inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{end}}', b.API) == 'healthy', 'Accounts not healthy')


def old():
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() == PRIOR / 'ui', 'Not live v69')
    need(b.sha(PRIOR / 'ui/SHA256SUMS') == OLDHASH, 'Old web manifest changed')
    need(b.sha(PRIOR / 'classroom-nginx.conf') == CONF, 'Old nginx config changed')
    web = b.inspect(b.WEB)
    need(web and web['State']['Running'] and web['Image'] == b.WEBIMAGE, 'Live web mismatch')
    if (ROOT / 'private' / (b.WEB + '.json')).exists():
        need(web['Id'] == b.load(b.WEB + '.json')['Id'], 'Web container changed during preparation')
    need({m['Destination']: m['Source'] for m in web['Mounts']} == {
        '/usr/share/nginx/html': str(PRIOR / 'ui'), '/etc/nginx/conf.d/default.conf': str(PRIOR / 'classroom-nginx.conf')}, 'Old web mount mismatch')
    api_ok()


def prepare():
    old()
    need(not (ROOT / 'private').exists(), 'Already prepared; do not overwrite snapshots')
    for suffix in SUFFIXES:
        need(b.inspect(b.WEB + suffix) is None, 'Conflicting container ' + suffix)
    for port in (18800, REHEARSAL_PORT):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    with tarfile.open(ROOT / 'payload.tar.gz') as archive:
        for m in archive.getmembers():
            need(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts, 'Unsafe payload path')
            need(m.name.startswith('ui/') or m.name in PAYLOAD, 'Unexpected payload file ' + m.name)
        archive.extractall(ROOT, filter='data')
    receipt = package()
    (ROOT / 'private').mkdir(mode=0o700)
    b.private_json(ROOT / 'private/protected.json', protected())
    b.private_json(ROOT / 'private' / (b.WEB + '.json'), b.inspect(b.WEB))
    old(); unchanged()
    print(json.dumps({'prepared': True, 'source': receipt['commit'], 'nginx': CONF, 'accounts_library_data': 'unchanged'}))


def clone(name, source=None, preview=False, prior=False, port=None):
    """Create the web container from the prepared snapshot of the live one, with the health check.
    prior=True serves the v69 files (rollback, rehearsal); port moves it to a loopback port."""
    original_run = b.run
    ui, conf = str(ROOT / 'ui'), str(ROOT / 'classroom-nginx.conf')

    def run(*args, **kwargs):
        args = list(args)
        if args[:2] == ['docker', 'create']:
            args[2:2] = HEALTH
            if prior:
                args = [a.replace('src=' + ui + ',', 'src=' + str(PRIOR / 'ui') + ',').replace('src=' + conf + ',', 'src=' + str(PRIOR / 'classroom-nginx.conf') + ',') for a in args]
                need(any(a.startswith('type=bind,src=' + str(PRIOR / 'ui') + ',') for a in args), 'Prior ui mount not rewritten')
                need(any(a.startswith('type=bind,src=' + str(PRIOR / 'classroom-nginx.conf') + ',') for a in args), 'Prior nginx mount not rewritten')
            if port is not None:
                need(args.count('127.0.0.1:18790:80') == 1, 'Unexpected web port')
                args[args.index('127.0.0.1:18790:80')] = f'127.0.0.1:{port}:80'
                args[args.index('--restart') + 1] = 'no'
        return original_run(*args, **kwargs)

    b.run = run
    try:
        b.clone(name, b.WEB, preview)
    finally:
        b.run = original_run


def docker_healthy(name, timeout=90):
    for _ in range(timeout // 3):
        if b.run('docker', 'inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{end}}', name) == 'healthy':
            return True
        time.sleep(3)
    raise RuntimeError('Docker health check did not become healthy: ' + name)


def verify(port=18790):
    return json.loads(b.run('python3', str(ROOT / 'verify-publication-v70.py'), str(ROOT / 'ui'), str(port), timeout=120))


def verify_prior(port=18790):
    return json.loads(b.run('python3', str(PRIOR / 'verify-publication-v69.py'), str(PRIOR / 'ui'), str(port), timeout=120))


def stage():
    old(); package(); unchanged()
    # The preview serves the new bytes against the live, unchanged accounts API and library;
    # its checks send only unauthenticated or invalid-token requests.
    (ROOT / 'preview-nginx.conf').write_bytes((ROOT / 'classroom-nginx.conf').read_bytes())
    clone(b.WEB + '-preview-v70', preview=True)
    web = verify(18800)
    docker_healthy(b.WEB + '-preview-v70')
    old(); unchanged()
    result = {'source': package()['commit'], 'web': web, 'docker_health': 'healthy', 'accounts': API_VERSION + ' unchanged'}
    (ROOT / 'stage-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


def rehearse():
    """Rebuild the v69 web from the snapshot on loopback 18806, verify it, remove it. Live untouched."""
    need((ROOT / 'private' / (b.WEB + '.json')).exists(), 'Prepare first')
    need(b.inspect(b.WEB + '-rehearsal-v70') is None, 'Rehearsal container exists')
    before = protected()
    try:
        clone(b.WEB + '-rehearsal-v70', prior=True, port=REHEARSAL_PORT)
        proof = verify_prior(REHEARSAL_PORT)
        docker_healthy(b.WEB + '-rehearsal-v70')
    finally:
        if b.inspect(b.WEB + '-rehearsal-v70'):
            b.run('docker', 'stop', b.WEB + '-rehearsal-v70')
            b.run('docker', 'rm', b.WEB + '-rehearsal-v70')
    need(before == protected(), 'Unrelated runtime changed during rehearsal')
    (ROOT / 'rehearsal-proof.json').write_text(json.dumps({'recreated': 'v69 web', 'port': REHEARSAL_PORT, 'verification': proof}, indent=2))
    print(json.dumps({'recreated': 'v69 web', 'verification': proof, 'removed': True}))


def point(path):
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'], 'Unexpected current link')
    temp = b.CURRENT.parent / '.current-v70'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary link already exists')
    temp.symlink_to(path)
    temp.replace(b.CURRENT)


def rollback():
    # Preflight before touching anything: live link is v70 or v69, the retained container is the
    # prepared one (or missing, then rebuilt from the snapshot), and no failed container exists.
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'],
         'Live release is neither v70 nor v69; run the rollback of the live release first')
    snapshot = b.load(b.WEB + '.json')
    prior, current = b.inspect(b.WEB + '-rollback-v70'), b.inspect(b.WEB)
    need(prior is None or prior['Id'] == snapshot['Id'], 'Rollback container is not the prepared v69 web')
    need(b.inspect(b.WEB + '-failed-v70') is None, 'Failed container already exists')
    before = protected()
    if current and current['Id'] != snapshot['Id']:
        b.run('docker', 'stop', b.WEB)
        b.run('docker', 'rename', b.WEB, b.WEB + '-failed-v70')
        current = None
    if current is None:
        if prior:
            b.run('docker', 'rename', b.WEB + '-rollback-v70', b.WEB)
            b.run('docker', 'start', b.WEB)
            source = 'retained container'
        else:
            clone(b.WEB, prior=True)
            source = 'recreated from snapshot'
    else:
        b.run('docker', 'start', b.WEB)
        source = 'live container was still v69'
    point(PRIOR / 'ui')
    proof = verify_prior(18790)
    need(before == protected(), 'Unrelated runtime changed during rollback')
    print(json.dumps({'rollback': 'v69 web', 'accounts': API_VERSION + ' unchanged', 'source': source, 'verification': proof, 'data_restored': False}))


def activate():
    old(); receipt = package(); unchanged()
    need(json.loads((ROOT / 'stage-proof.json').read_text())['source'] == receipt['commit'], 'Stage source mismatch')
    need(json.loads((ROOT / 'rehearsal-proof.json').read_text())['recreated'] == 'v69 web', 'Rollback rehearsal missing')
    verify(18800)
    need(b.inspect(b.WEB + '-rollback-v70') is None and b.inspect(b.WEB + '-failed-v70') is None, 'Cutover target already exists')
    try:
        need(b.inspect(b.WEB)['Id'] == b.load(b.WEB + '.json')['Id'], 'Live web changed since prepare')
        b.run('docker', 'stop', b.WEB)
        b.run('docker', 'rename', b.WEB, b.WEB + '-rollback-v70')
        clone(b.WEB)
        proof = verify()
        point(ROOT / 'ui'); unchanged()
        docker_healthy(b.WEB)
    except BaseException:
        rollback()
        raise
    b.run('docker', 'stop', b.WEB + '-preview-v70')
    result = {'published': 'v70', 'source': receipt['commit'], 'web': proof, 'docker_health': 'healthy',
              'accounts': API_VERSION + ' unchanged', 'other_services_unchanged': True,
              'rollback': 'sudo python3 -B ' + str(ROOT / 'deploy-v70.py') + ' rollback',
              'actual_device_acceptance': False}
    (ROOT / 'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Root and canonical release path required')
    {'prepare': prepare, 'stage': stage, 'rehearse': rehearse, 'activate': activate, 'rollback': rollback,
     'verify': lambda: print(json.dumps(verify()))}[sys.argv[1]]()
