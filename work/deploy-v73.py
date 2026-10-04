"""Pinned v73 web/accounts release; isolated PPTX worker reached over a read-only UDS mount.

Reuse the reviewed v68 health and v57 clone/snapshot primitives. No account schema,
auth, library, dictionary, Access or tunnel changes. Rollback restores web v72 and
accounts v68, never the database. The network-none worker is left running on rollback.
All modes run as root; never print container inspect, environment or real identities.
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
ROOT = Path('/opt/bilge-defter-classroom-v73')
PRIOR = Path('/opt/bilge-defter-classroom-v72')
OLD_CONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
WORKER = 'bd-pptx-v73-worker'
SOCKET_DEST = '/run/bilge-pdf'
REHEARSAL_PORT = 18806
spec = importlib.util.spec_from_file_location('v68_helpers', Path(__file__).with_name('deploy-v68.py'))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
b = h.b
h.ROOT = b.ROOT = ROOT
h.PRIOR = b.PRIOR = PRIOR
NAMES = [b.WEB, b.API]
SUFFIXES = ['-preview-v73', '-rollback-v73', '-failed-v73', '-rehearsal-v73']
PDF_ENV = {
    'BILGE_DEFTER_PDF_ENABLED': '1',
    'BILGE_DEFTER_PDF_USAGE_VERIFIED': '1',
    'BILGE_DEFTER_PDF_ISOLATION_VERIFIED': '1',
    'BILGE_DEFTER_PDF_URL': 'http://bilge-pptx-worker',
}
PAYLOAD = {'deploy-v57.py', 'deploy-v68.py', 'deploy-v73.py', 'prepare-v73.py', 'classroom-nginx.conf',
           'verify-publication-v57.py', 'verify-publication-v64.py', 'verify-publication-v73.py',
           'api-baseline.json', 'source-receipt.json'}
need = h.need
health = h.health
docker_healthy = h.docker_healthy


def protected():
    excluded = set(NAMES + [n + s for n in NAMES for s in SUFFIXES] + [WORKER])
    result = []
    for ident in b.run('docker', 'ps', '-aq').split():
        c = b.inspect(ident)
        if c['Name'].lstrip('/') not in excluded:
            result.append([c['Name'], c['Id'], c['State']['Status'], c['State']['StartedAt']])
    return {'containers': sorted(result), 'main_pid': b.run('systemctl', 'show', 'linux-ai-server', '-p', 'MainPID', '--value')}


def unchanged():
    need(protected() == b.load('protected.json'), 'Unrelated runtime changed; stop and review')


def receipt():
    value = json.loads((ROOT / 'source-receipt.json').read_text())
    need(value['package'] == 'v73', 'Wrong release package')
    need(value['prior']['api_version'] == 'v68', 'Wrong prior accounts version')
    return value


def package():
    value = receipt()
    for name, digest in value['files'].items():
        path = ROOT / name
        need(path.resolve().is_relative_to(ROOT) and b.sha(path) == digest, 'Package hash mismatch: ' + name)
    need('classroom-nginx.conf' in value['files'], 'Nginx config is not pinned')
    return value


def old():
    pins = receipt()['prior']
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() == PRIOR / 'ui', 'Not live v72')
    need(b.sha(PRIOR / 'ui/SHA256SUMS') == pins['ui_manifest_sha256'], 'Prior UI manifest drift')
    need(b.sha(PRIOR / 'classroom-nginx.conf') == OLD_CONF, 'Prior nginx config drift')
    for name, image in [(b.WEB, b.WEBIMAGE), (b.API, pins['api_image'])]:
        c = b.inspect(name)
        need(c and c['State']['Running'] and c['Image'] == image, 'Prior runtime mismatch: ' + name)
        if (ROOT / 'private' / (name + '.json')).exists():
            need(c['Id'] == b.load(name + '.json')['Id'], 'Runtime changed since prepare: ' + name)
    need({m['Destination']: m['Source'] for m in b.inspect(b.WEB)['Mounts']} == {
        '/usr/share/nginx/html': str(PRIOR / 'ui'),
        '/etc/nginx/conf.d/default.conf': str(PRIOR / 'classroom-nginx.conf')}, 'Prior web mounts changed')
    health(b.API, 'v68')


def prepare():
    # receipt is delivered beside the tar before prepare, so prior pins can be checked first.
    old()
    need(not (ROOT / 'private').exists(), 'Already prepared; never overwrite snapshots')
    for name in NAMES:
        for suffix in SUFFIXES:
            need(b.inspect(name + suffix) is None, 'Conflicting release container')
    for port in (18800, REHEARSAL_PORT):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
    original = (ROOT / 'source-receipt.json').read_bytes()
    with tarfile.open(ROOT / 'payload.tar.gz') as archive:
        for member in archive.getmembers():
            need(member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts,
                 'Unsafe payload entry')
            need(member.name.startswith(('ui/', 'api/', 'worker/')) or member.name in PAYLOAD, 'Unexpected payload entry')
        archive.extractall(ROOT, filter='data')
    need((ROOT / 'source-receipt.json').read_bytes() == original, 'Payload receipt differs from bootstrap receipt')
    package()
    (ROOT / 'private').mkdir(mode=0o700)
    os.chown(ROOT / 'private', 1000, 1000)  # protected off-host backup by the SSH operator
    b.private_json(ROOT / 'private/protected.json', protected())
    for name in NAMES:
        b.private_json(ROOT / 'private' / (name + '.json'), b.inspect(name))
    actual = json.loads(b.run('docker', 'exec', b.API, 'python', '-c',
        "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes().replace(b'\\r\\n',b'\\n')).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
    need(actual == json.loads((ROOT / 'api-baseline.json').read_text()), 'Prior API differs from reviewed baseline')
    api = b.inspect(b.API)
    mounts = {m['Destination']: m for m in api['Mounts']}
    need(set(mounts) == {'/data', '/run/bilge-secrets', '/dictionaries'}, 'Unexpected prior API mounts')
    cmd = api['Config'].get('Cmd') or []
    need('--workers' in cmd and cmd[cmd.index('--workers') + 1] == '1', 'Exactly one API worker required')
    digest = b.snapshot(Path(mounts['/data']['Source']) / 'bilge-defter.sqlite', ROOT / 'private/accounts.sqlite')
    b.private_json(ROOT / 'private/backup-receipt.json', {'accounts': digest})
    old(); unchanged()
    print(json.dumps({'prepared': True, 'source': receipt()['commit'], 'backup_sha256': digest}))


def pdf_env(values):
    # Change only these four fields; all auth/database/edge-sync values are preserved.
    return [v for v in values if v.split('=', 1)[0] not in PDF_ENV] + [k + '=' + v for k, v in PDF_ENV.items()]


def clone(name, source, preview=False, prior=False, port=None, rehearsal_data=None):
    original_run, original_load = b.run, b.load
    snapshot = original_load(source + '.json')
    images = json.loads((ROOT / 'images.json').read_text())
    dictionary = next((m['Source'] for m in snapshot['Mounts'] if m['Destination'] == '/dictionaries'), None)

    def load(filename):
        if filename != source + '.json':
            return original_load(filename)
        c = copy.deepcopy(snapshot)
        if source == b.API:
            c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/dictionaries']
            if preview or rehearsal_data:
                c['Mounts'] = [m for m in c['Mounts'] if m['Destination'] != '/run/bilge-secrets']
            if preview and not prior:
                c['Config']['Env'] = [e for e in c['Config'].get('Env', []) if e.split('=', 1)[0] in
                    ['PATH', 'LANG', 'PYTHON_VERSION', 'PYTHON_SHA256', 'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED']]
                c['Config']['Cmd'] = ['python', '/srv/tests/test_release_proxy_v73.py', 'serve']
            if not prior:
                c['Config']['Env'] = pdf_env(c['Config'].get('Env', []))
                c['Mounts'].append({'Type': 'bind', 'Source': str(ROOT / 'socket'), 'Destination': SOCKET_DEST, 'RW': False})
            if rehearsal_data:
                c['Config']['Env'] = [e for e in c['Config'].get('Env', []) if not e.startswith('BILGE_DEFTER_EDGE_SYNC=')] + ['BILGE_DEFTER_EDGE_SYNC=0']
        return c

    def run(*args, **kwargs):
        args = list(args)
        if args[:2] == ['docker', 'create']:
            args[2:2] = h.health_args(source)
            if source == b.API:
                need(dictionary is not None, 'Dictionary snapshot missing')
                args = [a.replace(f'src={ROOT}/dictionary,', 'src=' + dictionary + ',') for a in args]
                if prior:
                    args = [snapshot['Image'] if a == images['accounts'] else a for a in args]
                elif preview:
                    args = [images['verify'] if a == images['accounts'] else a for a in args]
                if rehearsal_data:
                    live = next(m['Source'] for m in snapshot['Mounts'] if m['Destination'] == '/data')
                    args = [a.replace('src=' + live + ',', 'src=' + str(rehearsal_data) + ',') for a in args]
                    need(any(a.startswith('type=bind,src=' + str(rehearsal_data) + ',dst=/data') for a in args), 'Rehearsal DB not redirected')
                    need(not any(a.startswith('type=bind,src=' + live + ',') for a in args), 'Live data remains mounted')
            if source == b.WEB and prior:
                args = [a.replace('src=' + str(ROOT / 'ui') + ',', 'src=' + str(PRIOR / 'ui') + ',').replace(
                    'src=' + str(ROOT / 'classroom-nginx.conf') + ',', 'src=' + str(PRIOR / 'classroom-nginx.conf') + ',') for a in args]
                need(any(a.startswith('type=bind,src=' + str(PRIOR / 'ui') + ',') for a in args), 'Prior UI not redirected')
            if port is not None:
                need(args.count('127.0.0.1:18790:80') == 1, 'Unexpected web port')
                args[args.index('127.0.0.1:18790:80')] = f'127.0.0.1:{port}:80'
            if port is not None or rehearsal_data:
                args[args.index('--restart') + 1] = 'no'
        return original_run(*args, **kwargs)

    b.run, b.load = run, load
    try:
        b.clone(name, source, preview)
    finally:
        b.run, b.load = original_run, original_load


def worker_ok():
    proof = json.loads((ROOT / 'worker-proof.json').read_text())
    need(proof['source'] == receipt()['commit'], 'Worker proof source mismatch')
    need(all(proof.get(k) is True for k in ['isolation', 'acceptance', 'tests_passed']), 'Worker acceptance incomplete')
    worker = b.inspect(WORKER)
    need(worker and worker['Id'] == proof['worker_id'] and worker['State']['Running'], 'Worker changed or stopped')
    need(worker['HostConfig']['NetworkMode'] == 'none' and not worker['HostConfig'].get('PortBindings'), 'Worker has a network or ports')
    need(worker['HostConfig']['ReadonlyRootfs'] and worker['Config']['User'] == '1000:10001', 'Worker sandbox mismatch')
    host = worker['HostConfig']
    need(not host.get('Privileged') and 'ALL' in (host.get('CapDrop') or []), 'Worker capabilities unsafe')
    need(any(value.startswith('no-new-privileges') for value in (host.get('SecurityOpt') or [])), 'Worker privilege guard missing')
    need(host.get('Memory', 0) > 0 and host.get('NanoCpus', 0) > 0 and host.get('PidsLimit', 0) > 0, 'Worker resource limits missing')
    binds = [m for m in worker['Mounts'] if m['Type'] == 'bind']
    need(len(binds) == 1 and binds[0]['Source'] == str(ROOT / 'socket') and binds[0]['Destination'] == SOCKET_DEST,
         'Worker has unexpected bind mounts')
    need((ROOT / 'socket/worker.sock').is_socket(), 'Worker socket is missing')
    return proof


def verify(port=18790):
    return json.loads(b.run('python3', str(ROOT / 'verify-publication-v73.py'), str(ROOT / 'ui'), str(port), timeout=120))


def verify_prior(port=18790):
    return json.loads(b.run('python3', str(PRIOR / 'verify-publication-v72.py'), str(PRIOR / 'ui'), str(port), timeout=120))


def copy_fixture(fixture):
    # docker cp rejects a read-only root even for this existing tmpfs mount.
    # Stream only reviewed fixtures through the unprivileged process, keeping
    # read-only root, exact /tmp destination, exclusive create and hash check.
    need(fixture.name in {'native-chart.pptx', 'lumen-integumentary-original.pptx'}, 'Unexpected fixture name')
    data = fixture.read_bytes()
    need(0 < len(data) <= 20 * 1024 * 1024, 'Fixture exceeds bounded upload')
    code = "import hashlib,pathlib,sys;data=sys.stdin.buffer.read(20*1024*1024+1);assert 0<len(data)<=20*1024*1024;p=pathlib.Path('/tmp')/sys.argv[1];f=p.open('xb');f.write(data);f.close();print(hashlib.sha256(p.read_bytes()).hexdigest())"
    copied = subprocess.run(['docker', 'exec', '-i', b.API + '-preview-v73', 'python', '-c', code, fixture.name],
                            input=data, capture_output=True, timeout=30)
    need(copied.returncode == 0 and copied.stdout.decode().strip() == b.sha(fixture), 'Fixture tmpfs copy/hash failed')


def stage():
    old(); value = package(); unchanged(); worker = worker_ok()
    need(value.get('base_images'), 'Pinned dependency base images missing')
    for tag, digest in value['base_images'].items():
        need(json.loads(b.run('docker', 'image', 'inspect', tag))[0]['Id'] == digest, 'Dependency image drift')
    for path in (ROOT / 'api').rglob('*'):
        os.utime(path, None)
    images = {}
    for target, key in [('production', 'accounts'), ('verify', 'verify')]:
        with (ROOT / ('build-' + target + '.log')).open('x') as output:
            result = subprocess.run(['docker', 'build', '--pull=false', '--no-cache', '--network=none', '--target', target,
                '-t', 'bilge-defter-accounts:v73-' + target, str(ROOT / 'api')], stdout=output, stderr=subprocess.STDOUT, timeout=300)
        need(result.returncode == 0, 'Image build failed; inspect bounded log')
        images[key] = json.loads(b.run('docker', 'image', 'inspect', 'bilge-defter-accounts:v73-' + target))[0]['Id']
    (ROOT / 'images.json').write_text(json.dumps(images))
    expected = {str(p.relative_to(ROOT / 'api')): b.sha(p) for p in (ROOT / 'api/app').rglob('*.py')}
    for image in images.values():
        actual = json.loads(b.run('docker', 'run', '--rm', '--network=none', '--entrypoint', 'python', image, '-c',
            "import hashlib,json,pathlib;print(json.dumps({str(p.relative_to('/srv')):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/srv/app').rglob('*.py')}))"))
        need(actual == expected, 'Built API source differs from committed payload')
    dictionary = next(m['Source'] for m in b.load(b.API + '.json')['Mounts'] if m['Destination'] == '/dictionaries')
    output = b.run('docker', 'run', '--rm', '--network=none', '--read-only', '--tmpfs', '/tmp:rw,size=128m,mode=1777',
        '--memory', '768m', '--cpus', '1.5', '--pids-limit', '100', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
        '--mount', 'type=bind,src=' + dictionary + ',dst=/dictionaries,readonly', images['verify'], timeout=240)
    (ROOT / 'api-tests.txt').write_text(output)
    need(re.search(r'\b[1-9][0-9]* passed\b', output) and not re.search(r'\b[1-9][0-9]* (failed|errors?)\b', output), 'API test proof missing')
    config = (ROOT / 'classroom-nginx.conf').read_text().replace(b.API + ':8080', b.API + '-preview-v73:8080')
    (ROOT / 'preview-nginx.conf').write_text(config)
    clone(b.API + '-preview-v73', b.API, preview=True)
    health(b.API + '-preview-v73', 'v73')
    clone(b.WEB + '-preview-v73', b.WEB, preview=True)
    web = verify(18800)
    fixture_hashes = json.loads((ROOT / 'acceptance/receipt.json').read_text())['files']
    need(set(fixture_hashes) == {'native-chart.pptx', 'lumen-integumentary-original.pptx'}, 'Unexpected acceptance fixtures')
    for name, digest in fixture_hashes.items():
        fixture = ROOT / 'acceptance' / name
        need(b.sha(fixture) == digest, 'Acceptance fixture hash mismatch')
        copy_fixture(fixture)
    proxy = json.loads(b.run('docker', 'exec', b.API + '-preview-v73', 'python', '/srv/tests/test_release_proxy_v73.py', 'check', timeout=240))
    need(proxy.get('passed') is True, 'Independent nginx/auth/conversion acceptance missing')
    docker_healthy(b.API + '-preview-v73'); docker_healthy(b.WEB + '-preview-v73')
    old(); unchanged(); worker_ok()
    result = {'source': value['commit'], 'web': web, 'api_tests_passed': True, 'proxy': proxy, 'worker': worker, 'api_image': images['accounts']}
    (ROOT / 'stage-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


def rehearse():
    need((ROOT / 'private/accounts.sqlite').is_file(), 'Prepare first')
    before = protected()
    for name in NAMES:
        need(b.inspect(name + '-rehearsal-v73') is None, 'Rehearsal container already exists')
    data = ROOT / 'rehearsal-data'
    need(not data.exists(), 'Rehearsal data already exists')
    data.mkdir(mode=0o700)
    shutil.copy2(ROOT / 'private/accounts.sqlite', data / 'bilge-defter.sqlite')
    for path in (data, data / 'bilge-defter.sqlite'):
        os.chown(path, 10001, 10001)
    try:
        clone(b.API + '-rehearsal-v73', b.API, prior=True, rehearsal_data=data)
        health(b.API + '-rehearsal-v73', 'v68')
        rows = b.run('docker', 'exec', b.API + '-rehearsal-v73', 'python', '-c',
            "import sqlite3;c=sqlite3.connect('file:/data/bilge-defter.sqlite?mode=ro',uri=True);print(c.execute('pragma quick_check').fetchone()[0],c.execute('select count(*) from bilge_defter_members').fetchone()[0])")
        need(rows.startswith('ok '), 'Prior accounts cannot open copied DB')
        clone(b.WEB + '-rehearsal-v73', b.WEB, prior=True, port=REHEARSAL_PORT)
        web = verify_prior(REHEARSAL_PORT)
        docker_healthy(b.API + '-rehearsal-v73'); docker_healthy(b.WEB + '-rehearsal-v73')
    finally:
        for name in [b.WEB, b.API]:
            if b.inspect(name + '-rehearsal-v73'):
                b.run('docker', 'stop', name + '-rehearsal-v73')
                b.run('docker', 'rm', name + '-rehearsal-v73')
        need(data.resolve().parent == ROOT.resolve() and data.name == 'rehearsal-data', 'Unsafe rehearsal cleanup')
        shutil.rmtree(data)
    need(before == protected(), 'Unrelated runtime changed during rehearsal')
    result = {'source': receipt()['commit'], 'web': web, 'accounts': {'version': 'v68', 'database': 'ok', 'members': int(rows.split()[1])},
              'live_data_mounted': False, 'secrets_mounted': False, 'data_restored': False}
    (ROOT / 'rehearsal-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


def point(path):
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'], 'Unexpected current link')
    temp = b.CURRENT.parent / '.current-v73'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary link exists')
    temp.symlink_to(path)
    temp.replace(b.CURRENT)


def rollback():
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [ROOT / 'ui', PRIOR / 'ui'], 'Rollback refuses unrelated live release')
    for name in NAMES:
        snapshot = b.load(name + '.json')
        retained = b.inspect(name + '-rollback-v73')
        need(retained is None or retained['Id'] == snapshot['Id'], 'Wrong rollback container: ' + name)
        need(b.inspect(name + '-failed-v73') is None, 'Failed container already exists: ' + name)
    before = protected()
    # Stop new web before replacing its upstream. Startup order remains accounts then web.
    web = b.inspect(b.WEB)
    if web and web['Id'] != b.load(b.WEB + '.json')['Id']:
        b.run('docker', 'stop', b.WEB)
    sources = {}
    for name in [b.API, b.WEB]:
        snapshot = b.load(name + '.json')
        retained, current = b.inspect(name + '-rollback-v73'), b.inspect(name)
        if current and current['Id'] != snapshot['Id']:
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name + '-failed-v73')
            current = None
        if current is None:
            if retained:
                b.run('docker', 'rename', name + '-rollback-v73', name)
                b.run('docker', 'start', name)
                sources[name] = 'retained container'
            else:
                clone(name, name, prior=True)
                sources[name] = 'recreated from snapshot'
        else:
            b.run('docker', 'start', name)
            sources[name] = 'prior container already present'
        if name == b.API:
            health(b.API, 'v68')
    point(PRIOR / 'ui')
    proof = verify_prior()
    need(before == protected(), 'Unrelated runtime changed during rollback')
    print(json.dumps({'rollback': {'web': 'v72', 'accounts': 'v68'}, 'source': sources, 'proof': proof,
                      'data_restored': False, 'isolated_worker': 'left running; no prior API connection'}))


def runtime_contract(current, previous):
    expected = sorted((m['Source'], m['Destination'], m['RW']) for m in previous['Mounts'])
    expected.append((str(ROOT / 'socket'), SOCKET_DEST, False))
    actual = sorted((m['Source'], m['Destination'], m['RW']) for m in current['Mounts'])
    need(actual == sorted(expected), 'Unexpected accounts mount delta')
    def env_map(values):
        result = dict(value.split('=', 1) for value in values)
        need(len(result) == len(values), 'Duplicate environment key')
        return result
    need(env_map(current['Config']['Env']) == env_map(pdf_env(previous['Config']['Env'])), 'Unexpected accounts environment delta')
    need(current['Config']['Cmd'] == previous['Config']['Cmd'], 'API process command changed')


def activate():
    old(); value = package(); unchanged(); worker = worker_ok()
    proof = json.loads((ROOT / 'stage-proof.json').read_text())
    images = json.loads((ROOT / 'images.json').read_text())
    need(proof['source'] == value['commit'] and proof['api_image'] == images['accounts'], 'Staged source/image changed')
    need(proof.get('api_tests_passed') is True and proof['proxy'].get('passed') is True and proof['worker'] == worker, 'Acceptance proof incomplete')
    rehearsal = json.loads((ROOT / 'rehearsal-proof.json').read_text())
    need(rehearsal['source'] == value['commit'] and rehearsal['accounts']['database'] == 'ok', 'Rollback rehearsal missing')
    need(json.loads((ROOT / 'offhost-backups.json').read_text()) == b.load('backup-receipt.json'), 'Independent backup verification missing')
    verify(18800)
    for name in NAMES:
        need(b.inspect(name + '-rollback-v73') is None and b.inspect(name + '-failed-v73') is None, 'Cutover name exists')
        need(b.inspect(name)['Id'] == b.load(name + '.json')['Id'], 'Live identity changed')
    try:
        for name in NAMES:
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name + '-rollback-v73')
        clone(b.API, b.API)
        health(b.API, 'v73')
        runtime_contract(b.inspect(b.API), b.load(b.API + '.json'))
        clone(b.WEB, b.WEB)
        web = verify()
        point(ROOT / 'ui'); unchanged(); worker_ok()
        docker_healthy(b.API); docker_healthy(b.WEB)
    except BaseException:
        rollback()
        raise
    for name in NAMES:
        b.run('docker', 'stop', name + '-preview-v73')
    result = {'published': 'v73', 'source': value['commit'], 'web': web, 'accounts': 'v73',
              'auth_data_library_unchanged': True, 'actual_device_acceptance': False,
              'rollback': 'sudo python3 -B ' + str(ROOT / 'deploy-v73.py') + ' rollback'}
    (ROOT / 'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Root and canonical release path required')
    {'prepare': prepare, 'stage': stage, 'rehearse': rehearse, 'activate': activate,
     'rollback': rollback, 'verify': lambda: print(json.dumps(verify()))}[sys.argv[1]]()
