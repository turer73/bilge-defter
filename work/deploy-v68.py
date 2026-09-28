"""Pinned v68 web + accounts release: previous encrypted copy per account, Docker health checks,
rollback that checks the live release first and can rebuild removed containers, and a rehearsal
of the accounts rollback that never touches live data. No library, auth, DNS or Access changes.

prepare/stage/rehearse/activate/verify/rollback run as root. Never print inspect or env.
Synthetic signing keys and fixture code exist only in the preview verify image.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tarfile
import time

sys.dont_write_bytecode = True
ROOT = Path('/opt/bilge-defter-classroom-v68')
PRIOR = Path('/opt/bilge-defter-classroom-v67')
OLD_API = 'sha256:6a72734d5b1b4ecc6bceb27543374076f95810d546ca44cd1535953a1437b19a'  # accounts v65-production
PRIOR_API_VERSION = 'v65'
BASES = {'bilge-defter-accounts:v57-production': 'sha256:f69cead9ed2e146c88bc46462fdbce7ae264d6338cd40ca00786320486dc2fb8',
         'bilge-defter-accounts:v57-verify': 'sha256:31b03c912a19bf500feb6181349a5c905501576bfcb18a2a395efaec5b1a71ec'}
CONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
OLDHASH = 'bdc4b8ebb20c3dfab1da32b72eaf1a723a75c1faa897f72631035134e140c608'  # v67 SHA256SUMS
API_TESTS = '83 passed'
spec = importlib.util.spec_from_file_location('release_base', Path(__file__).with_name('deploy-v57.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
b.ROOT, b.PRIOR = ROOT, PRIOR
NAMES = [b.WEB, b.API]
SUFFIXES = ['-preview-v68', '-rollback-v68', '-failed-v68', '-rehearsal-v68']
REHEARSAL_PORT = 18806
# Docker health checks for the containers this release creates (INCELEME B1). Web: the static
# release file through nginx; accounts: /health inside the container.
HEALTH = {
    b.WEB: ['--health-cmd', 'curl -fsS -o /dev/null http://127.0.0.1/release.json || exit 1'],
    b.API: ['--health-cmd', "python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3)\""],
}
HEALTH_TIMING = ['--health-interval', '30s', '--health-timeout', '5s', '--health-retries', '3', '--health-start-period', '15s']


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def protected():
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
    need(receipt['package'] == 'v68', 'Wrong package')
    for name, digest in receipt['files'].items():
        path = ROOT / name
        need(path.resolve().is_relative_to(ROOT) and b.sha(path) == digest, 'Package hash mismatch: ' + name)
    need(b.sha(ROOT / 'classroom-nginx.conf') == CONF, 'Nginx config changed')
    return receipt


def old():
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() == PRIOR / 'ui', 'Not live v67')
    need(b.sha(PRIOR / 'ui/SHA256SUMS') == OLDHASH, 'Old web manifest changed')
    for name, image in [(b.WEB, b.WEBIMAGE), (b.API, OLD_API)]:
        c = b.inspect(name)
        need(c and c['State']['Running'] and c['Image'] == image, 'Live runtime mismatch: ' + name)
        if (ROOT / 'private' / (name + '.json')).exists():
            need(c['Id'] == b.load(name + '.json')['Id'], 'Container changed during preparation')
    web_mounts = {m['Destination']: m['Source'] for m in b.inspect(b.WEB)['Mounts']}
    need(web_mounts == {'/usr/share/nginx/html': str(PRIOR / 'ui'),
                        '/etc/nginx/conf.d/default.conf': str(PRIOR / 'classroom-nginx.conf')}, 'Old web mount mismatch')


def prepare():
    old()
    need(not (ROOT / 'private').exists(), 'Already prepared; do not overwrite snapshots')
    for name in NAMES:
        for suffix in SUFFIXES:
            need(b.inspect(name + suffix) is None, 'Conflicting container')
    for port in (18800, REHEARSAL_PORT):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    with tarfile.open(ROOT / 'payload.tar.gz') as archive:
        for m in archive.getmembers():
            need(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts, 'Unsafe payload path')
            need(m.name.startswith(('ui/', 'api/')) or m.name in {
                'deploy-v57.py', 'deploy-v68.py', 'verify-publication-v57.py', 'verify-publication-v64.py',
                'verify-publication-v68.py', 'classroom-nginx.conf', 'api-baseline.json', 'source-receipt.json'},
                'Unexpected payload file')
        archive.extractall(ROOT, filter='data')
    package()
    (ROOT / 'private').mkdir(mode=0o700)
    b.private_json(ROOT / 'private/protected.json', protected())
    for name in NAMES:
        b.private_json(ROOT / 'private' / (name + '.json'), b.inspect(name))
    # The live API must equal the reviewed v65 source (normalize Git CRLF).
    hashes = json.loads(b.run('docker', 'exec', b.API, 'python', '-c',
        "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
    need(hashes == json.loads((ROOT / 'api-baseline.json').read_text()), 'Live API differs from reviewed baseline')
    mounts = {m['Destination']: m for m in b.inspect(b.API)['Mounts']}
    need(set(mounts) == {'/data', '/run/bilge-secrets', '/dictionaries'}, 'Unexpected API data mounts')
    backup = b.snapshot(Path(mounts['/data']['Source']) / 'bilge-defter.sqlite', ROOT / 'private/accounts.sqlite')
    b.private_json(ROOT / 'private/backup-receipt.json', {'accounts': backup})
    old(); unchanged()
    print(json.dumps({'prepared': True, 'backup_sha256': backup, 'source': package()['commit']}))


def health_args(source):
    return HEALTH[source] + HEALTH_TIMING


def clone(name, source, preview=False, prior=False, port=None, rehearsal_data=None):
    """Create a web/accounts container from the prepared snapshot of the live container.

    New release (prior=False): new ui/conf and the new accounts image. Prior release (prior=True):
    the prior web files and the snapshot's own image, for rollback and rehearsal. rehearsal_data
    replaces /data with a copy and removes the secrets mount and Cloudflare sync.
    """
    original_run, original_load = b.run, b.load
    snapshot = original_load(source + '.json')
    dictionary = next((m['Source'] for m in snapshot['Mounts'] if m['Destination'] == '/dictionaries'), None)
    images = json.loads((ROOT / 'images.json').read_text()) if (ROOT / 'images.json').exists() else {}
    ui, conf = str(ROOT / 'ui'), str(ROOT / 'classroom-nginx.conf')

    def load(filename):
        if filename != source + '.json':
            return original_load(filename)
        c = copy.deepcopy(snapshot)
        if source == b.API:
            # Base helper adds one dictionary mount. Preserve the existing source.
            c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/dictionaries']
            if (preview and not prior) or rehearsal_data:
                c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/run/bilge-secrets']
            if preview and not prior:
                c['Config']['Env'] = [e for e in c['Config'].get('Env', []) if
                                     e.split('=', 1)[0] in ['PATH', 'LANG', 'PYTHON_VERSION', 'PYTHON_SHA256',
                                                           'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED']]
                c['Config']['Cmd'] = ['python', '/srv/tests/test_release_proxy_v68.py', 'serve']
            if rehearsal_data:
                c['Config']['Env'] = [e for e in c['Config'].get('Env', []) if not e.startswith('BILGE_DEFTER_EDGE_SYNC=')] + ['BILGE_DEFTER_EDGE_SYNC=0']
        return c

    def run(*args, **kwargs):
        args = list(args)
        if args[:2] == ['docker', 'create']:
            args[2:2] = health_args(source)
            if source == b.API:
                need(dictionary is not None, 'Dictionary mount missing')
                # Same text the base helper writes (f'{ROOT}/dictionary').
                args = [a.replace(f'src={ROOT}/dictionary,', 'src=' + dictionary + ',') for a in args]
                if prior:
                    args = [snapshot['Image'] if a == images.get('accounts') else a for a in args]
                elif preview:
                    args = [images['verify'] if a == images['accounts'] else a for a in args]
                if rehearsal_data:
                    data_src = next(m['Source'] for m in snapshot['Mounts'] if m['Destination'] == '/data')
                    args = [a.replace('src=' + data_src + ',', 'src=' + str(rehearsal_data) + ',') for a in args]
                    need(any(a.startswith('type=bind,src=' + str(rehearsal_data) + ',dst=/data') for a in args), 'Rehearsal data not rewritten')
                    need(not any(a.startswith('type=bind,') and data_src in a for a in args), 'Live data still mounted')
            if source == b.WEB and prior:
                args = [a.replace('src=' + ui + ',', 'src=' + str(PRIOR / 'ui') + ',').replace('src=' + conf + ',', 'src=' + str(PRIOR / 'classroom-nginx.conf') + ',') for a in args]
                need(any(a.startswith('type=bind,src=' + str(PRIOR / 'ui') + ',') for a in args), 'Prior ui mount not rewritten')
            if port is not None:
                need(args.count('127.0.0.1:18790:80') == 1, 'Unexpected web port')
                args[args.index('127.0.0.1:18790:80')] = f'127.0.0.1:{port}:80'
            if port is not None or rehearsal_data:
                args[args.index('--restart') + 1] = 'no'
        return original_run(*args, **kwargs)

    if prior and source == b.API:
        need(images.get('accounts'), 'images.json needed to rebuild the prior accounts container')
    b.run, b.load = run, load
    try:
        b.clone(name, source, preview)
    finally:
        b.run, b.load = original_run, original_load


def health(name, expected):
    for _ in range(30):
        p = subprocess.run(['docker', 'exec', name, 'python', '-c',
            "import urllib.request,json;print(json.loads(urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=2).read())['version'])"],
            capture_output=True, text=True)
        if p.returncode == 0 and p.stdout.strip() == expected:
            return
        time.sleep(1)
    raise RuntimeError('API health failed: ' + name)


def docker_healthy(name, timeout=90):
    for _ in range(timeout // 3):
        status = b.run('docker', 'inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{end}}', name)
        if status == 'healthy':
            return True
        time.sleep(3)
    raise RuntimeError('Docker health check did not become healthy: ' + name)


def verify(port=18790):
    return json.loads(b.run('python3', str(ROOT / 'verify-publication-v68.py'), str(ROOT / 'ui'), str(port), timeout=120))


def verify_prior(port=18790):
    return json.loads(b.run('python3', str(PRIOR / 'verify-publication-v67.py'), str(PRIOR / 'ui'), str(port), timeout=120))


def stage():
    old(); package(); unchanged()
    for tag, expected in BASES.items():
        need(json.loads(b.run('docker', 'image', 'inspect', tag))[0]['Id'] == expected, 'Dependency base drift')
    # Payload files are extracted with mtime 0. BuildKit transfers the build context incrementally
    # by size and mtime, so a same-size edit (v65 -> v68 in main.py) was taken from an earlier
    # context and the image carried old code. Fresh mtimes, no cache, and a byte check below.
    for path in (ROOT / 'api').rglob('*'):
        os.utime(path, None)
    for target in ['production', 'verify']:
        with (ROOT / ('build-' + target + '.log')).open('x') as output:
            result = subprocess.run(['docker', 'build', '--pull=false', '--no-cache', '--network=none', '--target', target,
                '-t', 'bilge-defter-accounts:v68-' + target, str(ROOT / 'api')], stdout=output, stderr=subprocess.STDOUT, timeout=300)
        need(result.returncode == 0, 'Image build failed; see bounded build log')
    images = {key: json.loads(b.run('docker', 'image', 'inspect', 'bilge-defter-accounts:v68-' + target))[0]['Id']
              for key, target in [('accounts', 'production'), ('verify', 'verify')]}
    (ROOT / 'images.json').write_text(json.dumps(images))
    # Every application file inside both images must equal the payload byte for byte.
    expected = {str(p.relative_to(ROOT / 'api')): b.sha(p) for p in (ROOT / 'api' / 'app').rglob('*.py')}
    for key in ('accounts', 'verify'):
        inside = json.loads(b.run('docker', 'run', '--rm', '--network=none', '--entrypoint', 'python', images[key], '-c',
            "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
        need(inside == expected, 'Built image differs from the payload: ' + key)
    dictionary = next(m['Source'] for m in b.load(b.API + '.json')['Mounts'] if m['Destination'] == '/dictionaries')
    output = b.run('docker', 'run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,size=128m,mode=1777',
        '--memory', '768m', '--cpus', '1.5', '--pids-limit', '100', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--mount', 'type=bind,src=' + dictionary + ',dst=/dictionaries,readonly',
        images['verify'], timeout=180)
    (ROOT / 'api-tests.txt').write_text(output)
    need(API_TESTS in output, 'API release tests failed')
    config = (ROOT / 'classroom-nginx.conf').read_text().replace(b.API + ':8080', b.API + '-preview-v68:8080')
    (ROOT / 'preview-nginx.conf').write_text(config)
    clone(b.API + '-preview-v68', b.API, preview=True)
    health(b.API + '-preview-v68', 'v68')
    clone(b.WEB + '-preview-v68', b.WEB, preview=True)
    web = verify(18800)
    proxy = json.loads(b.run('docker', 'exec', b.API + '-preview-v68', 'python', '/srv/tests/test_release_proxy_v68.py', 'check'))
    docker_healthy(b.WEB + '-preview-v68'); docker_healthy(b.API + '-preview-v68')
    old(); unchanged()
    result = {'source': package()['commit'], 'web': web, 'api_tests': API_TESTS, 'proxy': proxy, 'docker_health': 'healthy'}
    (ROOT / 'stage-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


def rehearse():
    """Rebuild the prior web (v67, loopback 18806) and prior accounts (v65, copy of the prepared DB
    snapshot, no secrets, no Cloudflare sync) from the snapshots, prove them, remove them."""
    need((ROOT / 'private' / (b.API + '.json')).exists() and (ROOT / 'images.json').exists(), 'Prepare and stage first')
    for name in NAMES:
        need(b.inspect(name + '-rehearsal-v68') is None, 'Rehearsal container exists')
    before = protected()
    data = ROOT / 'rehearsal-data'
    need(not data.exists(), 'Rehearsal data exists; remove it after review')
    data.mkdir(mode=0o700)
    shutil.copy2(ROOT / 'private/accounts.sqlite', data / 'bilge-defter.sqlite')
    for path in (data, data / 'bilge-defter.sqlite'):
        os.chown(path, 10001, 10001)
    result = {}
    try:
        clone(b.WEB + '-rehearsal-v68', b.WEB, prior=True, port=REHEARSAL_PORT)
        result['web'] = verify_prior(REHEARSAL_PORT)
        clone(b.API + '-rehearsal-v68', b.API, prior=True, rehearsal_data=data)
        health(b.API + '-rehearsal-v68', PRIOR_API_VERSION)
        rows = b.run('docker', 'exec', b.API + '-rehearsal-v68', 'python', '-c',
            "import sqlite3;c=sqlite3.connect('file:/data/bilge-defter.sqlite?mode=ro',uri=True);print(c.execute('pragma quick_check').fetchone()[0],c.execute('select count(*) from bilge_defter_members').fetchone()[0])")
        need(rows.startswith('ok '), 'Rehearsal accounts database unreadable')
        result['accounts'] = {'version': PRIOR_API_VERSION, 'database': 'ok', 'members': int(rows.split()[1]),
                              'live_data_mounted': False, 'secrets_mounted': False, 'edge_sync': 0}
        docker_healthy(b.WEB + '-rehearsal-v68'); docker_healthy(b.API + '-rehearsal-v68')
    finally:
        for name in NAMES:
            if b.inspect(name + '-rehearsal-v68'):
                b.run('docker', 'stop', name + '-rehearsal-v68')
                b.run('docker', 'rm', name + '-rehearsal-v68')
        shutil.rmtree(data, ignore_errors=True)
    need(before == protected(), 'Unrelated runtime changed during rehearsal')
    (ROOT / 'rehearsal-proof.json').write_text(json.dumps({'recreated': ['v67 web', 'v65 accounts'], **result}, indent=2))
    print(json.dumps({'recreated': ['v67 web', 'v65 accounts'], **result, 'removed': True}))


def point(path):
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'], 'Unexpected current link')
    temp = b.CURRENT.parent / '.current-v68'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary link already exists')
    temp.symlink_to(path)
    temp.replace(b.CURRENT)


def rollback():
    # Preflight everything before touching the live release (INCELEME B2): the live link must be
    # this release or its prior, every rollback identity must be the prepared one (or missing, in
    # which case it is rebuilt from the snapshot), and no failed container may exist.
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'],
         'Live release is neither v68 nor v67; run the rollback of the live release first')
    for name in NAMES:
        snapshot = b.load(name + '.json')
        prior = b.inspect(name + '-rollback-v68')
        need(prior is None or prior['Id'] == snapshot['Id'], 'Rollback container is not the prepared one: ' + name)
        need(b.inspect(name + '-failed-v68') is None, 'Failed container already exists: ' + name)
    before = protected()
    sources = {}
    # Accounts first: nginx resolves its upstream when it starts.
    for name in [b.API, b.WEB]:
        snapshot = b.load(name + '.json')
        prior, current = b.inspect(name + '-rollback-v68'), b.inspect(name)
        if current and current['Id'] != snapshot['Id']:
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name + '-failed-v68')
            current = None
        if current is None:
            if prior:
                b.run('docker', 'rename', name + '-rollback-v68', name)
                b.run('docker', 'start', name)
                sources[name] = 'retained container'
            else:
                clone(name, name, prior=True)
                sources[name] = 'recreated from snapshot'
        else:
            b.run('docker', 'start', name)
            sources[name] = 'live container was still the prior release'
        if name == b.API:
            health(b.API, PRIOR_API_VERSION)
    point(PRIOR / 'ui')
    proof = verify_prior(18790)
    need(before == protected(), 'Unrelated runtime changed during rollback')
    print(json.dumps({'rollback': {'web': 'v67', 'accounts': PRIOR_API_VERSION}, 'source': sources, 'proof': proof, 'database_restored': False}))


def activate():
    old(); receipt = package(); unchanged()
    need(json.loads((ROOT / 'stage-proof.json').read_text())['source'] == receipt['commit'], 'Stage source mismatch')
    need(json.loads((ROOT / 'rehearsal-proof.json').read_text())['accounts']['database'] == 'ok', 'Rollback rehearsal missing')
    need(json.loads((ROOT / 'offhost-backups.json').read_text()) == b.load('backup-receipt.json'), 'Off-host backup not verified')
    verify(18800)
    for name in NAMES:
        need(b.inspect(name + '-rollback-v68') is None and b.inspect(name + '-failed-v68') is None, 'Cutover target already exists')
    try:
        for name in NAMES:
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name + '-rollback-v68')
        clone(b.API, b.API)
        health(b.API, 'v68')
        current_api, previous_api = b.inspect(b.API), b.load(b.API + '.json')
        safe_mounts = lambda c: sorted((m['Source'], m['Destination'], m['RW']) for m in c['Mounts'])
        need(safe_mounts(current_api) == safe_mounts(previous_api), 'API mounts changed')
        need(current_api['Config']['Env'] == previous_api['Config']['Env'], 'API environment changed')
        clone(b.WEB, b.WEB)
        proof = verify()
        point(ROOT / 'ui'); unchanged()
        docker_healthy(b.API); docker_healthy(b.WEB)
    except BaseException:
        rollback()
        raise
    for name in NAMES:
        b.run('docker', 'stop', name + '-preview-v68')
    result = {'published': 'v68', 'source': receipt['commit'], 'web': proof, 'api_version': 'v68',
              'docker_health': 'healthy', 'unchanged_data_mounts_and_env': True, 'other_services_unchanged': True,
              'rollback': 'sudo python3 -B ' + str(ROOT / 'deploy-v68.py') + ' rollback',
              'actual_device_acceptance': False}
    (ROOT / 'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Root and canonical release path required')
    {'prepare': prepare, 'stage': stage, 'rehearse': rehearse, 'activate': activate, 'rollback': rollback,
     'verify': lambda: print(json.dumps(verify()))}[sys.argv[1]]()
