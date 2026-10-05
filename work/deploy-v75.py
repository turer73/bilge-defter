"""Two-phase v74 reader -> v75 writer release. Never restore a database backup.

The existing v73 network-none converter is retained, not rebuilt or restarted.
Prepare/stage/rehearse touch only new release paths and preview containers. Bridge
changes only the web container. Activate durably records the v74 rollback floor
BEFORE starting either v75 service. A failed/partial activation rolls back to the
retained v74 web and v73 accounts containers, never the incompatible v73 reader.
Run only the operator-approved mode as root. Do not print inspect or environment.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tarfile

sys.dont_write_bytecode = True
ROOT = Path('/opt/bilge-defter-classroom-v75')
BRIDGE = Path('/opt/bilge-defter-classroom-v74')
PRIOR = Path('/opt/bilge-defter-classroom-v73')
FLOOR = Path('/opt/bilge-defter-invited/minimum-reader.json')
WORKER = 'bd-pptx-v73-worker'
SOCKET_DEST = '/run/bilge-pdf'
REHEARSAL_PORT = 18806
spec = importlib.util.spec_from_file_location('v75_health_helpers', Path(__file__).with_name('deploy-v68.py'))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
b = h.b
h.ROOT = b.ROOT = ROOT
h.PRIOR = b.PRIOR = PRIOR
need, health, docker_healthy = h.need, h.health, h.docker_healthy
NAMES = [b.WEB, b.API]
SUFFIXES = ['-preview-v75', '-original-v75', '-rollback-v75', '-failed-v75', '-rehearsal-v75']
PAYLOAD = {'source-receipt.json', 'api-baseline.json', 'classroom-nginx.conf',
           'deploy-v57.py', 'deploy-v68.py', 'deploy-v75.py',
           'verify-publication-v57.py', 'verify-publication-v64.py',
           'verify-publication-v73.py', 'verify-publication-v75.py'}


def write_json(path, value):
    """Exclusive and durable proof creation; never silently reuse stale evidence."""
    with path.open('x', encoding='utf-8') as out:
        json.dump(value, out, indent=2, sort_keys=True)
        out.flush()
        os.fsync(out.fileno())
    if os.name != 'nt':
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def receipt():
    value = read_json(ROOT / 'source-receipt.json')
    need(value.get('package') == 'v75' and re.fullmatch(r'[0-9a-f]{40}', value.get('commit', '')),
         'Wrong package or non-immutable source')
    need(value.get('prior', {}).get('version') == 'v73' and value['prior'].get('api_version') == 'v73', 'Wrong prior release')
    need(value.get('bridge', {}).get('version') == 'v74', 'Wrong compatibility reader')
    need(value.get('worker', {}).get('name') == WORKER and value['worker'].get('socket') == str(PRIOR / 'socket'),
         'Converter name/socket changed')
    need(re.fullmatch(r'[0-9a-f]{64}', value['worker'].get('id', '')), 'Pinned converter identity missing')
    return value


def binding():
    return {'source': receipt()['commit'], 'receipt_sha256': b.sha(ROOT / 'source-receipt.json')}


def bound(proof):
    need(all(proof.get(k) == v for k, v in binding().items()), 'Proof belongs to a different source/receipt')
    return proof


def package():
    value = receipt()
    files = value.get('files', {})
    need({'classroom-nginx.conf', 'api-baseline.json', 'deploy-v75.py', 'ui/SHA256SUMS',
          'bridge-ui/SHA256SUMS', 'api/Dockerfile'} <= files.keys(), 'Incomplete package manifest')
    for name, digest in files.items():
        path = ROOT / name
        need(not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name and
             path.resolve().is_relative_to(ROOT.resolve()) and not path.is_symlink(), 'Unsafe package path')
        need(re.fullmatch(r'[0-9a-f]{64}', digest) and path.is_file() and b.sha(path) == digest, 'Package hash mismatch: ' + name)
    need(b.sha(ROOT / 'classroom-nginx.conf') == value['prior']['nginx_sha256'], 'Nginx config must remain byte-identical')
    need(b.sha(ROOT / 'bridge-ui/SHA256SUMS') == value['bridge']['ui_manifest_sha256'], 'Bridge manifest changed')
    for folder, version in [('ui', 'v75'), ('bridge-ui', 'v74')]:
        root = ROOT / folder
        need(read_json(root / 'release.json')['version'] == version, 'Wrong UI version')
        for line in (root / 'SHA256SUMS').read_text().splitlines():
            digest, name = line.split(maxsplit=1)
            need(not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name, 'Unsafe UI manifest path')
            need(files.get(folder + '/' + name) == digest and b.sha(root / name) == digest, 'UI not pinned in source receipt')
    return value


def floor(allow_absent=False):
    if not FLOOR.exists():
        need(allow_absent, 'Reader rollback floor is missing; refuse ambiguous recovery')
        return None
    need(FLOOR.is_file() and not FLOOR.is_symlink(), 'Unsafe reader floor marker')
    proof = bound(read_json(FLOOR))
    need(proof.get('minimum_reader') == 'v74' and proof.get('release') == 'v75' and
         proof.get('bridge_manifest_sha256') == receipt()['bridge']['ui_manifest_sha256'],
         'Different/stale reader rollback floor; never lower or overwrite it')
    return proof


def mark_floor():
    need(floor(allow_absent=True) is None, 'Activation has already begun; use recovery, not a second activation')
    write_json(FLOOR, {**binding(), 'minimum_reader': 'v74', 'release': 'v75',
                      'bridge_manifest_sha256': receipt()['bridge']['ui_manifest_sha256']})


def protected():
    excluded = set(NAMES + [n + s for n in NAMES for s in SUFFIXES])
    result = []
    for ident in b.run('docker', 'ps', '-aq').split():
        c = b.inspect(ident)
        if c['Name'].lstrip('/') not in excluded:
            result.append([c['Name'], c['Id'], c['State']['Status'], c['State']['StartedAt']])
    return {'containers': sorted(result), 'main_pid': b.run('systemctl', 'show', 'linux-ai-server', '-p', 'MainPID', '--value')}


def unchanged():
    need(protected() == b.load('protected.json'), 'Unrelated runtime (including converter) changed')


def mount_map(container):
    mounts = container['Mounts']
    result = {m['Destination']: m for m in mounts}
    need(len(result) == len(mounts), 'Duplicate mount destination')
    return result


def env_map(values):
    need(all('=' in value and '\n' not in value and '\r' not in value for value in values), 'Invalid environment entry')
    result = dict(value.split('=', 1) for value in values)
    need(len(result) == len(values), 'Duplicate environment key')
    return result


def runtime_contract(current, previous):
    a, z = mount_map(current), mount_map(previous)
    need(set(a) == set(z) == {'/data', '/run/bilge-secrets', '/dictionaries', SOCKET_DEST}, 'Unexpected accounts mounts')
    for key in a:
        need(all(a[key].get(k) == z[key].get(k) for k in ('Type', 'Source', 'Destination', 'RW')), 'Accounts mount changed: ' + key)
    need(a[SOCKET_DEST]['Source'] == str(PRIOR / 'socket') and not a[SOCKET_DEST]['RW'], 'Converter socket changed or writable')
    need(env_map(current['Config']['Env']) == env_map(previous['Config']['Env']), 'Accounts environment changed')
    for key in ('Cmd', 'Entrypoint', 'User', 'WorkingDir'):
        need(current['Config'].get(key) == previous['Config'].get(key), 'Accounts process contract changed')


def worker_ok():
    pin = receipt()['worker']
    c = b.inspect(WORKER)
    need(c and c['Id'] == pin['id'] and c['Image'] == pin['image'] and c['State']['Running'], 'Converter identity/image changed')
    host = c['HostConfig']
    need(host['NetworkMode'] == 'none' and not host.get('PortBindings') and host['ReadonlyRootfs'] and
         not host.get('Privileged') and c['Config']['User'] == '1000:10001', 'Converter isolation changed')
    need('ALL' in (host.get('CapDrop') or []) and any(v.startswith('no-new-privileges') for v in host.get('SecurityOpt') or []),
         'Converter privilege guard missing')
    need(host.get('Memory') == 2 * 1024**3 and host.get('NanoCpus') == 10**9 and host.get('PidsLimit') == 160,
         'Converter resource limits changed')
    binds = [m for m in c['Mounts'] if m['Type'] == 'bind']
    need(len(binds) == 1 and binds[0]['Source'] == pin['socket'] and binds[0]['Destination'] == SOCKET_DEST,
         'Converter mount changed')
    need((Path(pin['socket']) / 'worker.sock').is_socket(), 'Existing converter socket unavailable')
    return {'id': c['Id'], 'image': c['Image'], 'started_at': c['State']['StartedAt'], 'socket': pin['socket']}


def current_link(allowed):
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in allowed, 'Unrelated live release; stop')


def check_web(container, root):
    mounts = mount_map(container)
    need(set(mounts) == {'/usr/share/nginx/html', '/etc/nginx/conf.d/default.conf'}, 'Unexpected web mounts')
    for dest, rel in [('/usr/share/nginx/html', 'ui'), ('/etc/nginx/conf.d/default.conf', 'classroom-nginx.conf')]:
        need(mounts[dest]['Source'] == str(root / rel) and not mounts[dest]['RW'], 'Wrong web source or writable mount')
    need(container['Image'] == b.WEBIMAGE, 'Web image changed')


def old():
    pin = receipt()['prior']
    need(floor(allow_absent=True) is None, 'v75 activation already began')
    current_link([PRIOR / 'ui'])
    need(b.sha(PRIOR / 'ui/SHA256SUMS') == pin['ui_manifest_sha256'] and
         b.sha(PRIOR / 'classroom-nginx.conf') == pin['nginx_sha256'], 'Prior files changed')
    for name, image in [(b.WEB, b.WEBIMAGE), (b.API, pin['api_image'])]:
        c = b.inspect(name)
        need(c and c['State']['Running'] and c['Image'] == image, 'Prior service identity/image mismatch')
        if (ROOT / 'private' / (name + '.json')).exists():
            need(c['Id'] == b.load(name + '.json')['Id'], 'Prior service replaced since snapshot')
    check_web(b.inspect(b.WEB), PRIOR)
    runtime_contract(b.inspect(b.API), b.inspect(b.API))
    health(b.API, 'v73')
    worker_ok()


def verify(version='v75', port=18790):
    folder = ROOT / 'ui' if version == 'v75' else BRIDGE / 'ui'
    return json.loads(b.run('python3', str(ROOT / 'verify-publication-v75.py'), str(folder), str(port), version, timeout=120))


def prepare():
    old()
    need(not (ROOT / 'private').exists() and not BRIDGE.exists(), 'Already prepared or bridge path exists; do not overwrite')
    for name in NAMES:
        for suffix in SUFFIXES:
            need(b.inspect(name + suffix) is None, 'Conflicting release container')
    for port in (18800, REHEARSAL_PORT):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    initial = (ROOT / 'source-receipt.json').read_bytes()
    with tarfile.open(ROOT / 'payload.tar.gz') as archive:
        members = archive.getmembers()
        need(len({m.name for m in members}) == len(members), 'Duplicate tar paths')
        for m in members:
            need(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts and '\\' not in m.name,
                 'Unsafe tar entry')
            need(m.name.startswith(('ui/', 'bridge-ui/', 'api/')) or m.name in PAYLOAD, 'Unexpected payload entry')
            need(not (ROOT / m.name).is_symlink(), 'Refuse extracting through symlink')
        need({m.name for m in members} == set(receipt()['files']) | {'source-receipt.json'}, 'Tar/receipt file-set mismatch')
        archive.extractall(ROOT, filter='data')
    need((ROOT / 'source-receipt.json').read_bytes() == initial, 'Bootstrap receipt changed')
    package()
    (ROOT / 'private').mkdir(mode=0o700)
    os.chown(ROOT / 'private', 1000, 1000)
    b.private_json(ROOT / 'private/protected.json', protected())
    for name in NAMES:
        b.private_json(ROOT / 'private' / (name + '.json'), b.inspect(name))
    source = json.loads(b.run('docker', 'exec', b.API, 'python', '-c',
        "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
    need(source == read_json(ROOT / 'api-baseline.json'), 'Live API differs from committed v73 baseline')
    api = b.inspect(b.API)
    env = env_map(api['Config']['Env'])
    need(env.get('BILGE_DEFTER_DICT_DB') == '/dictionaries/bilge_defter_dictionary.db', 'Dictionary environment baseline changed')
    cmd = api['Config'].get('Cmd') or []
    need('--workers' in cmd and cmd[cmd.index('--workers') + 1] == '1', 'Exactly one accounts worker required')
    digest = b.snapshot(Path(mount_map(api)['/data']['Source']) / 'bilge-defter.sqlite', ROOT / 'private/accounts.sqlite')
    b.private_json(ROOT / 'private/backup-receipt.json', {**binding(), 'accounts': digest})
    BRIDGE.mkdir()
    shutil.copytree(ROOT / 'bridge-ui', BRIDGE / 'ui')
    shutil.copy2(ROOT / 'classroom-nginx.conf', BRIDGE / 'classroom-nginx.conf')
    bridge_files()
    old(); unchanged()
    print(json.dumps({'prepared': True, **binding(), 'backup_sha256': digest}))


def bridge_files():
    need(BRIDGE.resolve() == BRIDGE and not BRIDGE.is_symlink(), 'Unsafe bridge directory')
    for name, digest in receipt()['files'].items():
        if name.startswith('bridge-ui/'):
            path = BRIDGE / 'ui' / name.removeprefix('bridge-ui/')
            need(path.is_file() and not path.is_symlink() and b.sha(path) == digest, 'Installed bridge differs from package')
    need(b.sha(BRIDGE / 'classroom-nginx.conf') == receipt()['prior']['nginx_sha256'], 'Bridge nginx changed')


def remember_created(name, ident):
    need(re.fullmatch(r'[0-9a-f]{64}', ident), 'Docker did not return immutable container ID')
    write_json(ROOT / 'private' / (name + '.created.json'), {'id': ident, **binding()})


def known_created(name, container):
    path = ROOT / 'private' / (name + '.created.json')
    need(path.is_file() and bound(read_json(path))['id'] == container['Id'], 'Unowned replacement container: ' + name)


def clone(name, source, preview=False, prior_api=False, bridge_web=False, port=None, rehearsal_data=None, rehearsal_web=False):
    original_run, original_load = b.run, b.load
    snapshot = original_load(source + '.json')
    dictionary = mount_map(snapshot).get('/dictionaries')
    images = read_json(ROOT / 'images.json')

    def load(filename):
        if filename != source + '.json':
            return original_load(filename)
        c = copy.deepcopy(snapshot)
        if source == b.API:
            c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/dictionaries']
            if preview or rehearsal_data:
                c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/run/bilge-secrets']
            if preview:
                keep = {'PATH', 'LANG', 'PYTHON_VERSION', 'PYTHON_SHA256', 'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED',
                        'BILGE_DEFTER_PDF_ENABLED', 'BILGE_DEFTER_PDF_USAGE_VERIFIED',
                        'BILGE_DEFTER_PDF_ISOLATION_VERIFIED', 'BILGE_DEFTER_PDF_URL'}
                c['Config']['Env'] = [e for e in c['Config']['Env'] if e.split('=', 1)[0] in keep]
                c['Config']['Cmd'] = ['python', '/srv/tests/test_release_proxy_v75.py', 'serve']
            if rehearsal_data:
                c['Config']['Env'] = [e for e in c['Config']['Env'] if not e.startswith('BILGE_DEFTER_EDGE_SYNC=')] + ['BILGE_DEFTER_EDGE_SYNC=0']
        return c

    def run(*args, **kwargs):
        args = list(args)
        creation = args[:2] == ['docker', 'create']
        if creation:
            args[2:2] = h.health_args(source)
            if source == b.API:
                need(dictionary and dictionary['Type'] == 'bind' and not dictionary['RW'], 'Dictionary mount unsafe')
                args = [a.replace(f'src={ROOT}/dictionary,', 'src=' + dictionary['Source'] + ',') for a in args]
                replacement = snapshot['Image'] if prior_api else images['verify'] if preview else images['accounts']
                args = [replacement if a == images['accounts'] else a for a in args]
                if rehearsal_data:
                    live = mount_map(snapshot)['/data']['Source']
                    args = [a.replace('src=' + live + ',', 'src=' + str(rehearsal_data) + ',') for a in args]
                    need(any(a.startswith('type=bind,src=' + str(rehearsal_data) + ',dst=/data') for a in args), 'Rehearsal data not redirected')
                    need(not any(a.startswith('type=bind,src=' + live + ',') for a in args), 'Live database still mounted')
            if source == b.WEB and bridge_web:
                args = [a.replace('src=' + str(ROOT / 'ui') + ',', 'src=' + str(BRIDGE / 'ui') + ',').replace(
                    'src=' + str(ROOT / 'classroom-nginx.conf') + ',', 'src=' + str(BRIDGE / 'classroom-nginx.conf') + ',') for a in args]
            if source == b.WEB and rehearsal_web:
                need(bridge_web and port == REHEARSAL_PORT, 'Rehearsal web must remain on isolated loopback port')
                args = [a.replace('src=' + str(BRIDGE / 'classroom-nginx.conf') + ',',
                                  'src=' + str(ROOT / 'rehearsal-nginx.conf') + ',') for a in args]
            if port is not None:
                need(args.count('127.0.0.1:18790:80') == 1, 'Unexpected web binding')
                args[args.index('127.0.0.1:18790:80')] = f'127.0.0.1:{port}:80'
            if port is not None or rehearsal_data:
                args[args.index('--restart') + 1] = 'no'
        value = original_run(*args, **kwargs)
        if creation:
            remember_created(name, value)
        return value

    b.run, b.load = run, load
    try:
        b.clone(name, source, preview)
    finally:
        b.run, b.load = original_run, original_load


def stage():
    old(); value = package(); unchanged(); worker = worker_ok(); bridge_files()
    need(value.get('base_images'), 'Pinned dependency images missing')
    for tag, digest in value['base_images'].items():
        need(json.loads(b.run('docker', 'image', 'inspect', tag))[0]['Id'] == digest, 'Dependency image drift')
    for path in (ROOT / 'api').rglob('*'):
        os.utime(path, None)
    images = {}
    for target, key in [('production', 'accounts'), ('verify', 'verify')]:
        with (ROOT / ('build-' + target + '.log')).open('x') as output:
            process = subprocess.run(['docker', 'build', '--pull=false', '--no-cache', '--network=none', '--target', target,
                '-t', 'bilge-defter-accounts:v75-' + target, str(ROOT / 'api')], stdout=output, stderr=subprocess.STDOUT, timeout=300)
        need(process.returncode == 0, 'Image build failed; inspect bounded log')
        images[key] = json.loads(b.run('docker', 'image', 'inspect', 'bilge-defter-accounts:v75-' + target))[0]['Id']
    write_json(ROOT / 'images.json', images)
    expected = {p.relative_to(ROOT / 'api').as_posix(): b.sha(p) for p in (ROOT / 'api/app').rglob('*.py')}
    for image in images.values():
        actual = json.loads(b.run('docker', 'run', '--rm', '--network=none', '--entrypoint', 'python', image, '-c',
            "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
        need(actual == expected, 'Built API source differs from immutable payload')
    dictionary = mount_map(b.load(b.API + '.json'))['/dictionaries']['Source']
    output = b.run('docker', 'run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,size=128m,mode=1777',
        '--memory', '768m', '--cpus', '1.5', '--pids-limit', '100', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
        '--mount', 'type=bind,src=' + dictionary + ',dst=/dictionaries,readonly', images['verify'], timeout=300)
    (ROOT / 'api-tests.txt').write_text(output)
    need(re.search(r'\b[1-9][0-9]* passed\b', output) and not re.search(r'\b[1-9][0-9]* (failed|errors?)\b', output), 'API tests did not pass')
    config = (ROOT / 'classroom-nginx.conf').read_text().replace(b.API + ':8080', b.API + '-preview-v75:8080')
    (ROOT / 'preview-nginx.conf').write_text(config)
    clone(b.API + '-preview-v75', b.API, preview=True)
    health(b.API + '-preview-v75', 'v75')
    clone(b.WEB + '-preview-v75', b.WEB, preview=True)
    web = verify('v75', 18800)
    proxy = json.loads(b.run('docker', 'exec', b.API + '-preview-v75', 'python', '/srv/tests/test_release_proxy_v75.py', 'check', timeout=300))
    need(proxy.get('passed') is True, 'Synthetic nginx/auth/conversion acceptance incomplete')
    docker_healthy(b.API + '-preview-v75'); docker_healthy(b.WEB + '-preview-v75')
    old(); unchanged(); need(worker_ok() == worker, 'Converter changed during tests')
    proof = {**binding(), 'api_image': images['accounts'], 'verify_image': images['verify'], 'worker': worker,
             'api_tests_passed': True, 'proxy': proxy, 'web': web}
    write_json(ROOT / 'stage-proof.json', proof)
    print(json.dumps(proof))


def rehearse():
    old(); package(); bridge_files(); unchanged()
    need((ROOT / 'private/accounts.sqlite').is_file(), 'Prepare first')
    data = ROOT / 'rehearsal-data'
    need(not data.exists(), 'Rehearsal data already exists')
    data.mkdir(mode=0o700)
    shutil.copy2(ROOT / 'private/accounts.sqlite', data / 'bilge-defter.sqlite')
    for path in (data, data / 'bilge-defter.sqlite'):
        os.chown(path, 10001, 10001)
    try:
        clone(b.API + '-rehearsal-v75', b.API, prior_api=True, rehearsal_data=data)
        health(b.API + '-rehearsal-v75', 'v73')
        rows = b.run('docker', 'exec', b.API + '-rehearsal-v75', 'python', '-c',
            "import sqlite3;c=sqlite3.connect('file:/data/bilge-defter.sqlite?mode=ro',uri=True);print(c.execute('pragma quick_check').fetchone()[0],c.execute('select count(*) from bilge_defter_members').fetchone()[0])")
        need(rows.startswith('ok '), 'Prior API cannot open copied database')
        config = (ROOT / 'classroom-nginx.conf').read_text().replace(b.API + ':8080', b.API + '-rehearsal-v75:8080')
        (ROOT / 'rehearsal-nginx.conf').write_text(config)
        clone(b.WEB + '-rehearsal-v75', b.WEB, bridge_web=True, port=REHEARSAL_PORT, rehearsal_web=True)
        web = verify('v74', REHEARSAL_PORT)
        docker_healthy(b.API + '-rehearsal-v75'); docker_healthy(b.WEB + '-rehearsal-v75')
    finally:
        for name in NAMES:
            name += '-rehearsal-v75'
            container = b.inspect(name)
            if container:
                known_created(name, container)
                b.run('docker', 'stop', name); b.run('docker', 'rm', name)
        need(data.resolve().parent == ROOT.resolve() and data.name == 'rehearsal-data', 'Unsafe rehearsal cleanup')
        shutil.rmtree(data)
    old(); unchanged()
    proof = {**binding(), 'web': web, 'accounts': {'version': 'v73', 'database': 'ok'},
             'live_data_mounted': False, 'secrets_mounted': False, 'data_restored': False}
    write_json(ROOT / 'rehearsal-proof.json', proof)
    print(json.dumps(proof))


def preflight_proofs():
    package(); bridge_files(); unchanged()
    proof = bound(read_json(ROOT / 'stage-proof.json'))
    images = read_json(ROOT / 'images.json')
    need(proof['api_image'] == images['accounts'] and proof['verify_image'] == images['verify'] and
         proof.get('api_tests_passed') is True and proof.get('proxy', {}).get('passed') is True, 'Stage proof incomplete or changed')
    need(proof['worker'] == worker_ok(), 'Converter identity changed since acceptance')
    page_count = bound(read_json(ROOT / 'page-count-proof.json'))
    fixture = receipt()['acceptance_fixture']
    need(fixture.get('synthetic_only') is True and fixture.get('slides') == 100 and
         page_count.get('pages') == 100 and page_count.get('unique_markers') == 100 and
         page_count.get('pdf_sha256') == proof['proxy'].get('pdf_sha256') and
         page_count.get('fixture_sha256') == proof['proxy'].get('fixture_sha256') == fixture.get('sha256'),
         'Independent PDF page-count/marker proof missing or not bound to tested output')
    rehearsal = bound(read_json(ROOT / 'rehearsal-proof.json'))
    need(rehearsal.get('accounts') == {'version': 'v73', 'database': 'ok'} and
         rehearsal.get('live_data_mounted') is False and rehearsal.get('data_restored') is False, 'Rollback rehearsal incomplete')
    backup = bound(b.load('backup-receipt.json'))
    need(backup == read_json(ROOT / 'offhost-backups.json') and b.sha(ROOT / 'private/accounts.sqlite') == backup['accounts'],
         'Off-host backup or local snapshot verification missing')
    verify('v75', 18800)


def point(path):
    current_link([PRIOR / 'ui', BRIDGE / 'ui', ROOT / 'ui'])
    if floor(allow_absent=True):
        need(path in [BRIDGE / 'ui', ROOT / 'ui'], 'Rollback below v74 is forbidden')
    temp = b.CURRENT.parent / '.current-v75'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary current link exists')
    temp.symlink_to(path)
    temp.replace(b.CURRENT)


def bridge():
    old(); preflight_proofs()
    name = b.WEB
    need(b.inspect(name + '-original-v75') is None, 'Original web already retained')
    try:
        b.run('docker', 'stop', name)
        b.run('docker', 'rename', name, name + '-original-v75')
        clone(name, name, bridge_web=True)
        proof = verify('v74')
        check_web(b.inspect(name), BRIDGE)
        point(BRIDGE / 'ui')
        docker_healthy(name); unchanged(); worker_ok()
        write_json(ROOT / 'bridge-proof.json', {**binding(), 'web_id': b.inspect(name)['Id'], 'web': proof,
                                               'api_id': b.inspect(b.API)['Id']})
    except BaseException:
        # No v75 writer has been started; only here is a v73 restoration safe.
        need(floor(allow_absent=True) is None, 'Floor exists: do not restore old reader')
        current = b.inspect(name)
        if current and current['Id'] != b.load(name + '.json')['Id']:
            known_created(name, current)
            b.run('docker', 'stop', name); b.run('docker', 'rename', name, name + '-failed-v75')
        retained = b.inspect(name + '-original-v75')
        if retained:
            need(retained['Id'] == b.load(name + '.json')['Id'], 'Original web identity changed')
            b.run('docker', 'rename', name + '-original-v75', name)
        b.run('docker', 'start', name)
        point(PRIOR / 'ui')
        raise
    print(json.dumps({'published': 'v74', 'api': 'v73', **binding(), 'data_restored': False}))


def bridge_live():
    current_link([BRIDGE / 'ui'])
    proof = bound(read_json(ROOT / 'bridge-proof.json'))
    web, api = b.inspect(b.WEB), b.inspect(b.API)
    need(web and web['Id'] == proof['web_id'] and web['State']['Running'], 'Bridge live identity changed')
    need(api and api['Id'] == proof['api_id'] == b.load(b.API + '.json')['Id'] and api['State']['Running'], 'Prior API identity changed')
    check_web(web, BRIDGE)
    runtime_contract(api, b.load(b.API + '.json'))
    health(b.API, 'v73')
    verify('v74')


def rollback():
    floor(); package(); bridge_files(); unchanged(); worker_ok()
    current_link([BRIDGE / 'ui', ROOT / 'ui'])
    bridge_proof = bound(read_json(ROOT / 'bridge-proof.json'))
    original = {b.API: b.load(b.API + '.json')['Id'], b.WEB: bridge_proof['web_id']}
    # Validate all identities before stopping anything. Unknown services are never replaced.
    for name in NAMES:
        retained, current = b.inspect(name + '-rollback-v75'), b.inspect(name)
        need(retained is None or retained['Id'] == original[name], 'Wrong retained rollback container')
        need(b.inspect(name + '-failed-v75') is None, 'Failed container already exists; manual review required')
        if current and current['Id'] != original[name]:
            known_created(name, current)
        need((current and current['Id'] == original[name]) or retained, 'Retained rollback identity missing; do not guess')
    web = b.inspect(b.WEB)
    if web:
        b.run('docker', 'stop', b.WEB)
    for name in [b.API, b.WEB]:
        current = b.inspect(name)
        if current and current['Id'] != original[name]:
            b.run('docker', 'stop', name); b.run('docker', 'rename', name, name + '-failed-v75')
            current = None
        if current is None:
            b.run('docker', 'rename', name + '-rollback-v75', name)
        b.run('docker', 'start', name)
        if name == b.API:
            health(name, 'v73')
            runtime_contract(b.inspect(name), b.load(name + '.json'))
    point(BRIDGE / 'ui')
    proof = verify('v74')
    unchanged(); worker_ok()
    print(json.dumps({'rollback': {'web': 'v74', 'api': 'v73'}, 'web': proof, **binding(), 'data_restored': False}))


def activate():
    preflight_proofs(); bridge_live()
    need(floor(allow_absent=True) is None, 'Activation already began; use rollback/recovery')
    for name in NAMES:
        need(b.inspect(name + '-rollback-v75') is None and b.inspect(name + '-failed-v75') is None, 'Cutover name exists')
    # b.clone's identity journal is exclusive. Preserve the bridge journal under
    # its retained name before recording the v75 container that takes its name.
    journal = ROOT / 'private' / (b.WEB + '.created.json')
    need(bound(read_json(journal))['id'] == b.inspect(b.WEB)['Id'], 'Bridge creation journal changed')
    mark_floor()
    try:
        for name in NAMES:
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name + '-rollback-v75')
        journal.rename(ROOT / 'private' / (b.WEB + '-rollback-v75.created.json'))
        clone(b.API, b.API)
        health(b.API, 'v75')
        runtime_contract(b.inspect(b.API), b.load(b.API + '.json'))
        clone(b.WEB, b.WEB)
        proof = verify('v75')
        point(ROOT / 'ui')
        docker_healthy(b.API); docker_healthy(b.WEB)
        unchanged(); worker_ok()
    except BaseException:
        rollback()
        raise
    result = {**binding(), 'published': 'v75', 'accounts': 'v75', 'web': proof,
              'minimum_reader': 'v74', 'converter': 'existing v73 unchanged',
              'data_restored': False, 'actual_device_acceptance': False,
              'rollback': 'sudo python3 -B ' + str(ROOT / 'deploy-v75.py') + ' rollback'}
    write_json(ROOT / 'live-proof.json', result)
    for name in NAMES:
        preview = b.inspect(name + '-preview-v75')
        if preview:
            known_created(name + '-preview-v75', preview)
            b.run('docker', 'stop', name + '-preview-v75')
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Root and canonical release path required')
    {'prepare': prepare, 'stage': stage, 'rehearse': rehearse, 'bridge': bridge,
     'activate': activate, 'rollback': rollback, 'verify': lambda: print(json.dumps(verify()))}[sys.argv[1]]()
