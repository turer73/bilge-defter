"""Rebuild v63 rollback standby without changing the v64 release or live traffic.

Run as root on Klipper. prepare creates two bounded web containers; check is
read-only apart from HTTP verification requests. rollback requires an explicit
cutover flag and is NOT part of repair/verification. Never print inspect/env.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path('/opt/bilge-defter-v64-recovery-20260927')
LIVE = Path('/opt/bilge-defter-classroom-v64')
PRIOR = Path('/opt/bilge-defter-classroom-v63')
CURRENT = Path('/opt/bilge-defter-invited/current')
WEB = 'bilge-defter-invited-web'
BACK = WEB + '-rollback-v64'
TEST = WEB + '-recovery-test-v64'
PORT = 18805
HASH64 = '7db781b5391eddd2aba12dfafb13c3a3a572737c62643e84d653d50832cb0fff'
HASH63 = 'd592864d4367ae8647a2ee6fc7f6fea7f04ed14ce56be37674cdca564cd602e6'
IMAGE = 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'
CONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(*args, timeout=120):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    # Commands may reference protected env files. Do not echo argv or stderr.
    require(result.returncode == 0, 'Command failed; exit ' + str(result.returncode))
    return result.stdout.strip()


def inspect(name):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True)
    if result.returncode:
        require('no such' in result.stderr.lower(), 'Docker inspection failed')
        return None
    return json.loads(result.stdout)[0]


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def write_new(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream, indent=2)


def packages():
    for root, expected in [(LIVE, HASH64), (PRIOR, HASH63)]:
        require(root.resolve() == root and not root.is_symlink(), 'Unexpected release path')
        require(digest(root / 'ui/SHA256SUMS') == expected, 'Manifest hash mismatch')
        receipt = load(root / 'source-receipt.json')
        for name, value in receipt['files'].items():
            path = root / name
            require(path.resolve().is_relative_to(root), 'Receipt path outside release')
            require(digest(path) == value, 'Release receipt mismatch: ' + name)
        for line in (root / 'ui/SHA256SUMS').read_text().splitlines():
            value, name = line.split(maxsplit=1)
            path = root / 'ui' / name
            require(path.resolve().is_relative_to(root / 'ui'), 'Manifest path outside UI')
            require(digest(path) == value, 'UI file mismatch: ' + name)
        require(digest(root / 'classroom-nginx.conf') == CONF, 'Nginx hash mismatch')


def mounts(c):
    return sorted((m['Source'], m['Destination'], m['RW'])
                  for m in c['Mounts'] if m['Type'] != 'tmpfs')


def validate_web(c, root):
    require(c is not None and c['Image'] == IMAGE, 'Unexpected web image')
    h = c['HostConfig']
    require(h['ReadonlyRootfs'] and not h['Privileged'] and not h['AutoRemove'], 'Unsafe web flags')
    require(h['NetworkMode'] == 'bilge-defter-classroom', 'Unexpected web network')
    require(h['Memory'] == 134217728 and h['NanoCpus'] == 500000000 and h['PidsLimit'] == 100,
            'Unexpected web resource limits')
    require(h['CapDrop'] == ['ALL'] and 'no-new-privileges:true' in h['SecurityOpt'], 'Unsafe web capabilities')
    require(mounts(c) == sorted([(str(root / 'ui'), '/usr/share/nginx/html', False),
                                (str(root / 'classroom-nginx.conf'), '/etc/nginx/conf.d/default.conf', False)]),
            'Unexpected web mounts')


def protected():
    rows = []
    for ident in run('docker', 'ps', '-aq').split():
        c = inspect(ident)
        if c['Name'].lstrip('/') not in [BACK, TEST]:
            rows.append([c['Name'], c['Id'], c['State']['Status'], c['State']['StartedAt']])
    return {'containers': sorted(rows),
            'main_pid': run('systemctl', 'show', 'linux-ai-server', '-p', 'MainPID', '--value')}


def ports(c, port):
    return c['HostConfig']['PortBindings'] == {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(port)}]}


def signature(c):
    # Ignore only generated identity/hostname and the deliberate test port.
    cfg, h = c['Config'], c['HostConfig']
    return {'image': c['Image'], 'mounts': mounts(c),
            'config': {k: cfg.get(k) for k in ['Env', 'User', 'WorkingDir', 'Entrypoint', 'Cmd', 'Healthcheck']},
            'host': {k: h.get(k) for k in ['ReadonlyRootfs', 'Privileged', 'AutoRemove', 'NetworkMode',
                       'Memory', 'MemorySwap', 'NanoCpus', 'PidsLimit', 'CapDrop', 'CapAdd', 'SecurityOpt', 'Tmpfs', 'LogConfig']}}


def create_web(snapshot, name, port):
    require((name, port) in [(TEST, PORT), (BACK, 18790)], 'Unexpected creation target')
    require(inspect(name) is None, 'Container already exists; do not overwrite')
    validate_web(snapshot, PRIOR)
    cfg, h = snapshot['Config'], snapshot['HostConfig']
    args = ['docker', 'create', '--name', name, '--network', h['NetworkMode'], '--read-only',
            '--restart', 'no', '--memory', str(h['Memory']), '--memory-swap', str(h['MemorySwap']),
            '--cpus', str(h['NanoCpus'] / 1e9), '--pids-limit', str(h['PidsLimit']),
            '-p', '127.0.0.1:' + str(port) + ':80']
    for key, flag in [('CapDrop', '--cap-drop'), ('CapAdd', '--cap-add'), ('SecurityOpt', '--security-opt')]:
        for value in h.get(key) or []:
            args += [flag, value]
    for dest, options in h['Tmpfs'].items():
        args += ['--tmpfs', dest + ':' + options]
    args += ['--log-driver', h['LogConfig']['Type']]
    for key, value in h['LogConfig']['Config'].items():
        args += ['--log-opt', key + '=' + value]
    for source, dest, rw in mounts(snapshot):
        require(not rw, 'Writable bind forbidden')
        args += ['--mount', 'type=bind,src=' + source + ',dst=' + dest + ',readonly']
    if cfg['User']:
        args += ['--user', cfg['User']]
    if cfg['WorkingDir']:
        args += ['-w', cfg['WorkingDir']]
    envfile = ROOT / 'private' / (name + '.env')
    env = cfg.get('Env') or []
    require(all('\n' not in e and '\r' not in e for e in env), 'Invalid environment record')
    fd = os.open(envfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write('\n'.join(env) + '\n')
    args += ['--env-file', str(envfile)]
    entry = cfg.get('Entrypoint') or []
    if entry:
        args += ['--entrypoint', entry[0]]
    args += [snapshot['Image']] + entry[1:] + (cfg.get('Cmd') or [])
    try:
        run(*args)
    finally:
        envfile.unlink()
    c = inspect(name)
    require(signature(c) == signature(snapshot) and ports(c, port), 'Clone configuration mismatch')
    return c


def http_verify(root, version, port):
    return json.loads(run('python3', str(root / ('verify-publication-' + version + '.py')),
                          str(root / 'ui'), str(port)))


def live_guard():
    require(CURRENT.is_symlink() and CURRENT.resolve() == LIVE / 'ui', 'Current release changed')
    c = inspect(WEB)
    validate_web(c, LIVE)
    require(c['State']['Running'] and ports(c, 18790), 'Live web is not expected v64 runtime')
    return c


def prepare():
    packages()
    live = live_guard()
    snapshot = load(LIVE / 'private' / (WEB + '.json'))
    validate_web(snapshot, PRIOR)
    require(inspect(snapshot['Id']) is None and inspect(BACK) is None and inspect(TEST) is None,
            'Rollback/test container exists; review before repair')
    require(not (ROOT / 'private').exists(), 'Recovery already initialized; use check')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', PORT))
    before = protected()
    (ROOT / 'private').mkdir(mode=0o700)
    write_new(ROOT / 'private/before.json', before)
    test = create_web(snapshot, TEST, PORT)
    proof = None
    try:
        run('docker', 'start', TEST)
        run('docker', 'exec', TEST, 'nginx', '-t')
        proof = http_verify(PRIOR, 'v63', PORT)
    finally:
        # Stop only the exact container created by this invocation. Keep it for audit.
        require(inspect(TEST)['Id'] == test['Id'], 'Test container identity changed')
        run('docker', 'stop', TEST)
    require(protected() == before and live_guard()['Id'] == live['Id'], 'Existing runtime changed')
    back = create_web(snapshot, BACK, 18790)  # Deliberately NOT started on occupied production port.
    write_new(ROOT / 'private/rollback-web.json', back)
    live_proof = http_verify(LIVE, 'v64', 18790)
    require(protected() == before, 'Existing runtime changed')
    write_new(ROOT / 'proof.json', {'source': '61b0eee7436de72608656277ae3660974adc0404',
              'script_hash': digest(__file__), 'live_id': live['Id'], 'rollback_id': back['Id'],
              'test_id': test['Id'], 'v63_http': proof, 'v64_http': live_proof,
              'live_cutover_tested': False, 'existing_runtime_unchanged': True})
    return check()


def check():
    packages()
    proof = load(ROOT / 'proof.json')
    require(digest(__file__) == proof['script_hash'], 'Recovery script changed')
    require(live_guard()['Id'] == proof['live_id'], 'Live container changed after preparation')
    back = inspect(BACK)
    require(back is not None and back['Id'] == proof['rollback_id'], 'Rollback container missing/replaced')
    validate_web(back, PRIOR)
    saved = load(ROOT / 'private/rollback-web.json')
    require(saved['Id'] == back['Id'] and signature(back) == signature(saved), 'Rollback snapshot mismatch')
    require(signature(back) == signature(load(LIVE / 'private' / (WEB + '.json'))), 'Original snapshot drift')
    require(ports(back, 18790) and not back['State']['Running'], 'Rollback must be stopped on production port')
    require(back['HostConfig']['RestartPolicy']['Name'] == 'no', 'Standby must not auto-start')
    return {'ready': True, 'target': 'v63', 'live': 'v64', 'v63_http': proof['v63_http'],
            'v64_http': http_verify(LIVE, 'v64', 18790), 'live_cutover_tested': False}


def rollback(confirm):
    require(confirm == '--confirm-v64-to-v63', 'Explicit live cutover confirmation required')
    check()  # Fail closed on stale files, identity or missing standby BEFORE stopping live web.
    spec = importlib.util.spec_from_file_location('original_v64', LIVE / 'deploy-v64.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original_load = module.b.load
    module.b.load = lambda name: (load(ROOT / 'private/rollback-web.json')
                                 if name == WEB + '.json' else original_load(name))
    # The original recorded snapshot and release receipt remain untouched.
    module.rollback()
    run('docker', 'update', '--restart', 'unless-stopped', WEB)


if __name__ == '__main__':
    require(os.geteuid() == 0, 'Root required')
    require(ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Unexpected recovery directory')
    mode = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if mode == 'rollback':
        rollback(sys.argv[2] if len(sys.argv) > 2 else '')
    else:
        require(mode in ['prepare', 'check'], 'Unknown mode')
        print(json.dumps(prepare() if mode == 'prepare' else check()))
