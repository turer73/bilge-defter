"""Web-only v77 -> v78 release. API, library, converter and databases never change.

Run only an operator-approved mode as root. Secrets in Docker inspect remain in
private/0600 files; command errors do not print arguments, stderr or environment.
Rollback retains and restarts the exact prepared v77 web; it never restores DBs.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tarfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True
ROOT = Path('/opt/bilge-defter-classroom-v78')
PRIOR = Path('/opt/bilge-defter-classroom-v77')
CURRENT = Path('/opt/bilge-defter-invited/current')
FLOOR = CURRENT.parent / 'minimum-reader.json'
WEB = 'bilge-defter-invited-web'
PREVIEW = WEB + '-preview-v78'
RETAINED = WEB + '-rollback-v78'
FAILED = WEB + '-failed-v78'
PREVIEW_PORT = 18809
LIVE_PORT = 18790
PRIOR_UI = 'faf16c238f8e390c1a87ce4358b3e1eca517fcf7db01614c5e439d8aa73de25e'
PRIOR_NGINX = '7051abd3685f6bbe1d15bceca043e80725149e87b8407f46552dc5a0deededad'
PRIOR_CSP = "default-src 'none'; script-src 'sha256-z9OR4xNSFORF44QvSzMziHgkzq1jwp8Av+1t1p1XL80=' 'sha256-Vco7maN7ZBn3FJUbsVQkWBpQcI2u2XtuXWJoJuXqo18='; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; font-src data: blob:; media-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
PRIOR_FRAME = '97579fbec1a3c9b4f475ea739cf08418e554bbb508b71ab7ca63696e5562d18f'
WEB_IMAGE = 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'
WEB_CAP_ADD = frozenset({'CAP_CHOWN', 'CAP_SETGID', 'CAP_SETUID'})
PPTX_FILES = {'host.js', 'host.css', 'model.js', 'store.js', 'renderer-bridge.js', 'renderer-frame.html', 'NOTICES.txt'}
PAYLOAD = {'source-receipt.json', 'classroom-nginx.conf', 'deploy-v78.py', 'verify-publication-v78.py'}


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def run(*args, timeout=90):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    need(result.returncode == 0, f'{args[0]} failed with exit {result.returncode}; inspect locally without publishing secrets')
    return result.stdout.strip()


def inspect(name):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, timeout=20)
    if result.returncode:
        need('no such' in result.stderr.lower(), 'Docker inspect failed')
        return None
    return json.loads(result.stdout)[0]


def write_json(path, value, private=False):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private else 0o644)
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(value, output, indent=2, sort_keys=True)
        output.flush()
        os.fsync(output.fileno())
    if os.name != 'nt':
        if private:
            os.chown(path, 1000, 1000)
        fd = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def private(name):
    return read_json(ROOT / 'private' / name)


def safe_path(name):
    return bool(name) and not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name and ':' not in name


def regular(path, root):
    need(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), 'Unsafe file path')
    for parent in path.parents:
        if parent == root:
            break
        need(not parent.is_symlink(), 'Symlink parent rejected')


def receipt():
    value = read_json(ROOT / 'source-receipt.json')
    need(value.get('package') == 'v78' and value.get('scope') == 'web-only' and
         re.fullmatch('[0-9a-f]{40}', value.get('commit', '')), 'Wrong release or non-immutable source')
    need(value.get('prior') == {'version': 'v77', 'ui_manifest_sha256': PRIOR_UI, 'nginx_sha256': PRIOR_NGINX} and
         value.get('web_image') == WEB_IMAGE, 'Wrong prior baseline or web image')
    return value


def binding():
    return {'source': receipt()['commit'], 'receipt_sha256': sha(ROOT / 'source-receipt.json')}


def bound(value):
    need(all(value.get(key) == expected for key, expected in binding().items()), 'Proof belongs to another source/receipt')
    return value


def nginx_block(csp):
    need(csp.startswith("default-src 'none'; script-src 'sha256-") and
         "; connect-src 'none';" in csp and "; worker-src 'none';" in csp and
         '"' not in csp and '$' not in csp and '\n' not in csp and '\r' not in csp,
         'Unsafe frame CSP')
    # Existing v76 markers stay: v78 preserves the entire v77 nginx config.
    expected = b'  # BEGIN v76 direct-pptx exact routes\n'
    expected += b'  location = /pptx-workspace.js { try_files $uri =404; }\n'
    for name in sorted(PPTX_FILES - {'renderer-frame.html'}):
        expected += ('  location = /pptx/' + name + ' { try_files $uri =404; }\n').encode()
    expected += ('  location = /pptx/renderer-frame.html {\n    try_files $uri =404;\n'
                 '    add_header X-Content-Type-Options nosniff always;\n'
                 '    add_header Referrer-Policy no-referrer always;\n'
                 '    add_header Cache-Control "private, no-store, no-transform" always;\n'
                 '    add_header Content-Security-Policy "' + csp + '" always;\n  }\n'
                 '  # END v76 direct-pptx exact routes\n').encode()
    return expected


def package():
    value = receipt()
    files = value.get('files', {})
    need({'ui/SHA256SUMS', 'ui/release.json', 'ui/pptx-workspace.js', 'classroom-nginx.conf',
          'deploy-v78.py', 'verify-publication-v78.py'} <= files.keys(), 'Incomplete web package')
    for name, digest in files.items():
        need(safe_path(name) and (name.startswith('ui/') or name in PAYLOAD - {'source-receipt.json'}), 'Unsafe/unexpected package path')
        path = ROOT / name
        regular(path, ROOT)
        need(re.fullmatch('[0-9a-f]{64}', digest) and sha(path) == digest, 'Package hash mismatch: ' + name)
    need(sha(ROOT / 'ui/SHA256SUMS') == value.get('ui_manifest_sha256'), 'UI manifest changed')
    names = set()
    for line in (ROOT / 'ui/SHA256SUMS').read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        need(safe_path(name) and name not in names and name != 'SHA256SUMS', 'Unsafe/duplicate UI manifest')
        names.add(name)
        need(files.get('ui/' + name) == digest, 'UI asset not receipt-bound')
    need({n.removeprefix('ui/') for n in files if n.startswith('ui/')} == names | {'SHA256SUMS'}, 'Unmanifested UI file')
    actual = {p.relative_to(ROOT / 'ui').as_posix() for p in (ROOT / 'ui').rglob('*') if p.is_file() or p.is_symlink()}
    need(actual == names | {'SHA256SUMS'}, 'Unexpected file in published UI directory')
    need({n.removeprefix('pptx/') for n in names if n.startswith('pptx/')} == PPTX_FILES, 'PPTX route file set changed')
    need(read_json(ROOT / 'ui/release.json') == {'version': 'v78'}, 'Wrong web version')
    need(files['ui/pptx/renderer-frame.html'] == value.get('frame_sha256'), 'Frame not provenance-bound')
    original = (PRIOR / 'classroom-nginx.conf').read_bytes()
    need(hashlib.sha256(original).hexdigest() == PRIOR_NGINX, 'Live prior nginx baseline changed')
    config = (ROOT / 'classroom-nginx.conf').read_bytes()
    begin, end = b'  # BEGIN v76 direct-pptx exact routes\n', b'  # END v76 direct-pptx exact routes\n'
    need(config.count(begin) == config.count(end) == 1, 'Missing unique narrow nginx block')
    prefix, rest = config.split(begin)
    block, suffix = rest.split(end)
    need(original.count(begin) == original.count(end) == 1, 'Prior nginx block missing or duplicated')
    old_prefix, old_rest = original.split(begin)
    old_block, old_suffix = old_rest.split(end)
    need(prefix == old_prefix and suffix == old_suffix, 'Existing nginx auth/proxy/rate-limit bytes changed')
    need(begin + old_block + end == nginx_block(PRIOR_CSP), 'Prior nginx route/CSP baseline changed')
    need(begin + block + end == nginx_block(value.get('frame_csp', '')), 'Nginx change exceeds exact static routes/CSP')
    need(value.get('frame_csp') == PRIOR_CSP and value.get('frame_sha256') == PRIOR_FRAME,
         'v78 renderer frame/CSP differs from v77')
    need(config == original, 'v78 nginx must remain byte-identical to v77')
    return value


def floor_ok():
    regular(FLOOR, FLOOR.parent)
    marker = read_json(FLOOR)
    need(marker.get('release') == 'v75' and marker.get('minimum_reader') == 'v74', 'Reader compatibility marker changed')
    if (ROOT / 'private/protected.json').exists():
        need(sha(FLOOR) == private('protected.json')['floor_sha256'], 'Reader floor bytes changed')


def protected():
    result = []
    for ident in run('docker', 'ps', '-aq').split():
        container = inspect(ident)
        if container['Name'].lstrip('/') in {WEB, PREVIEW, RETAINED, FAILED}:
            continue
        # A compact digest proves config/mount/identity equality without exposing secrets.
        contract = {k: container.get(k) for k in ('Id', 'Image', 'Config', 'HostConfig', 'Mounts')}
        # Docker inspect does not promise Mounts list order. Preserve every
        # record/field (including duplicates), canonicalizing only that order.
        need(isinstance(contract['Mounts'], list), 'Unexpected Docker mount representation')
        contract['Mounts'] = sorted(contract['Mounts'], key=lambda mount:
            (mount.get('Destination', ''), json.dumps(mount, sort_keys=True)))
        result.append([container['Name'], container['Id'], container['State']['Status'], container['State']['StartedAt'],
                       container['State'].get('Health', {}).get('Status'),
                       hashlib.sha256(json.dumps(contract, sort_keys=True).encode()).hexdigest()])
    return {'containers': sorted(result), 'main_pid': run('systemctl', 'show', 'linux-ai-server', '-p', 'MainPID', '--value'),
            'floor_sha256': sha(FLOOR)}


def unchanged():
    floor_ok()
    need(protected() == private('protected.json'), 'Unrelated runtime/API/library/worker or reader floor changed')


def current_link(allowed):
    need(CURRENT.is_symlink() and CURRENT.resolve() in allowed, 'Unrelated current release; refuse mutation')


def web_contract(container, source):
    need(container and container['Image'] == WEB_IMAGE, 'Web image changed')
    mounts = {m['Destination']: m for m in container['Mounts'] if m['Type'] != 'tmpfs'}
    need(len(mounts) == len([m for m in container['Mounts'] if m['Type'] != 'tmpfs']) and
         set(mounts) == {'/usr/share/nginx/html', '/etc/nginx/conf.d/default.conf'}, 'Unexpected web mounts')
    for dest, rel in [('/usr/share/nginx/html', 'ui'), ('/etc/nginx/conf.d/default.conf', 'classroom-nginx.conf')]:
        m = mounts[dest]
        need(m['Type'] == 'bind' and m['Source'] == str(source / rel) and not m['RW'], 'Wrong or writable web mount')
    h = container['HostConfig']
    need(set(container['NetworkSettings']['Networks']) == {'bilge-defter-classroom'} and
         h['ReadonlyRootfs'] and not h['Privileged'] and not h.get('Devices') and not h.get('DeviceRequests') and
         not h.get('Binds') and not h.get('VolumesFrom'), 'Unexpected web host privilege/network contract')
    # Measured live v77 nginx baseline: drop ALL, then retain exactly these
    # three entrypoint capabilities. Neither broaden nor silently remove them.
    caps = h.get('CapAdd') or []
    need(len(caps) == len(WEB_CAP_ADD) and set(caps) == WEB_CAP_ADD, 'Web added capability baseline changed')
    need(h.get('PortBindings') == {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': str(LIVE_PORT)}]}, 'Live web port drift')
    need('ALL' in (h.get('CapDrop') or []) and any(v.startswith('no-new-privileges') for v in h.get('SecurityOpt') or []),
         'Web privilege guard missing')


def prior_files():
    need(sha(PRIOR / 'ui/SHA256SUMS') == PRIOR_UI and sha(PRIOR / 'classroom-nginx.conf') == PRIOR_NGINX,
         'Retained v77 files changed')
    for line in (PRIOR / 'ui/SHA256SUMS').read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        need(safe_path(name), 'Unsafe old manifest')
        regular(PRIOR / 'ui' / name, PRIOR)
        need(sha(PRIOR / 'ui' / name) == digest, 'Retained v77 asset changed')


def old():
    current_link([PRIOR / 'ui'])
    floor_ok(); prior_files()
    c = inspect(WEB)
    web_contract(c, PRIOR)
    need(c['State']['Running'], 'Prior web is not running')
    if (ROOT / 'private/web.json').exists():
        need(c['Id'] == private('web.json')['Id'], 'Prior web replaced since prepare')


def verify(port=LIVE_PORT, version='v78'):
    folder = ROOT / 'ui' if version == 'v78' else PRIOR / 'ui'
    return json.loads(run('python3', str(ROOT / 'verify-publication-v78.py'), str(folder), str(port), version, timeout=180))


def verify_prior():
    """Recovery verification has no executable/content dependency on damaged v78 files."""
    def get(path, token=None):
        headers = {'Host': 'defter.bilgearena.com'}
        if token is not None:
            headers['Cf-Access-Jwt-Assertion'] = token
        try:
            with urlopen(Request(f'http://127.0.0.1:{LIVE_PORT}' + path, headers=headers), timeout=15) as response:
                return response.status, response.read(), response.headers
        except HTTPError as error:
            with error:
                return error.code, error.read(), error.headers

    count = 0
    for line in (PRIOR / 'ui/SHA256SUMS').read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        need(safe_path(name), 'Unsafe prior HTTP path')
        code, body, headers = get('/' + name)
        need(code == 200 and hashlib.sha256(body).hexdigest() == digest, 'Restored v77 HTTP body mismatch: ' + name)
        need('no-store' in headers.get('Cache-Control', '') and headers.get('X-Content-Type-Options') == 'nosniff',
             'Restored v77 response safeguards missing')
        if name == 'pptx/renderer-frame.html':
            need(headers.get('Content-Security-Policy') == PRIOR_CSP and
                 'text/html' in headers.get('Content-Type', ''), 'Restored v77 frame CSP/MIME mismatch')
        count += 1
    need(json.loads(get('/release.json')[1]) == {'version': 'v77'}, 'Restored web version mismatch')
    routes = ['/api/v1/bilge-defter/pdf-tools/status', '/api/v1/bilge-defter/admin/members',
              '/api/v1/bilge-defter/backup', '/api/v1/bilge-defter/dictionaries',
              '/api/v1/bilge-defter/dictionaries/tdk-gts-v12/search?q=kalp',
              '/library/', '/library/api/catalog', '/library/api/saved']
    rejections = 0
    for route in routes:
        for token in ('', 'invalid-test-token'):
            time.sleep(.3)
            code, body, _ = get(route, token)
            need(code == 401 and isinstance(json.loads(body), dict), 'Restored anonymous gate changed: ' + route)
            rejections += 1
    return {'version': 'v77', 'http_hashes': count, 'auth_rejections': rejections,
            'independent_of_candidate_files': True, 'student_data_accessed': False}


def runtime_report():
    """Compare unrelated services for reporting, never veto owned-web recovery."""
    try:
        expected, actual = private('protected.json'), protected()
        before = {row[0]: row[1:] for row in expected['containers']}
        after = {row[0]: row[1:] for row in actual['containers']}
        fields = ('id', 'status', 'started_at', 'health', 'contract')
        changes = []
        for name in sorted(set(before) | set(after)):
            if name not in before:
                changed = ['appeared']
            elif name not in after:
                changed = ['missing']
            else:
                changed = [field for i, field in enumerate(fields) if before[name][i] != after[name][i]]
            if changed:
                changes.append({'name': name, 'changed': changed})
        return {'verified': True, 'unchanged': expected == actual, 'containers': changes,
                'main_pid_changed': expected['main_pid'] != actual['main_pid'],
                'reader_floor_changed': expected['floor_sha256'] != actual['floor_sha256']}
    except Exception:
        # Do not print inspect/env or a command error. The recovery target remains separately guarded.
        return {'verified': False, 'unchanged': None, 'error': 'Unrelated runtime comparison unavailable'}


def extract_payload():
    initial = (ROOT / 'source-receipt.json').read_bytes()
    files = receipt()['files']
    with tarfile.open(ROOT / 'payload.tar.gz') as archive:
        members = archive.getmembers()
        need(len(members) <= 1000 and sum(m.size for m in members) <= 64 * 1024**2 and
             all(0 <= m.size <= 32 * 1024**2 for m in members), 'Payload extraction budget exceeded')
        need(len(members) == len({m.name for m in members}), 'Duplicate tar paths')
        need({m.name for m in members} == set(files) | {'source-receipt.json'}, 'Tar/receipt file set mismatch')
        for member in members:
            need(member.isfile() and safe_path(member.name) and
                 (member.name.startswith('ui/') or member.name in PAYLOAD), 'Unsafe payload entry')
            target = ROOT / member.name
            need(not target.is_symlink(), 'Symlink extraction target rejected')
            for parent in target.parents:
                if parent == ROOT:
                    break
                need(not parent.is_symlink(), 'Symlink extraction parent rejected')
        archive.extractall(ROOT, filter='data')
    need((ROOT / 'source-receipt.json').read_bytes() == initial, 'Bootstrap receipt changed')
    package()


def prepare():
    old()
    need(not (ROOT / 'private').exists(), 'Already prepared; private evidence is immutable')
    for name in (PREVIEW, RETAINED, FAILED):
        need(inspect(name) is None, 'Conflicting v78 container name')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', PREVIEW_PORT))
    extract_payload()
    secret = ROOT / 'private'
    secret.mkdir(mode=0o700)
    os.chown(secret, 1000, 1000)
    write_json(secret / 'protected.json', protected(), True)
    write_json(secret / 'web.json', inspect(WEB), True)
    # No account/notes DB copied or opened. The web filesystem is immutable static code.
    backup = secret / 'prior-web.tar.gz'
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output:
        with tarfile.open(fileobj=output, mode='w:gz') as archive:
            names = ['ui/' + line.split(maxsplit=1)[1] for line in (PRIOR / 'ui/SHA256SUMS').read_text().splitlines()]
            for name in sorted(names + ['ui/SHA256SUMS', 'classroom-nginx.conf']):
                archive.add(PRIOR / name, arcname=name, recursive=False)
            archive.add(FLOOR, arcname='minimum-reader.json', recursive=False)
        output.flush()
        os.fsync(output.fileno())
    os.chown(backup, 1000, 1000)
    proof = {**binding(), 'web_backup_sha256': sha(backup), 'web_inspect_sha256': sha(secret / 'web.json'),
             'protected_sha256': sha(secret / 'protected.json'), 'database_copied': False}
    write_json(secret / 'backup-receipt.json', proof, True)
    old(); unchanged()
    print(json.dumps({'prepared': True, **proof, 'offhost_copy_required': True}))


def backup_ok():
    original = bound(private('backup-receipt.json'))
    need(bound(read_json(ROOT / 'offhost-backups.json')) == original, 'Off-host web backup receipt missing/mismatched')
    for name, field in [('prior-web.tar.gz', 'web_backup_sha256'), ('web.json', 'web_inspect_sha256'),
                        ('protected.json', 'protected_sha256')]:
        need(sha(ROOT / 'private' / name) == original[field], 'Private web backup changed')


def created_path(name):
    need(name in {WEB, PREVIEW}, 'Unexpected created container name')
    return ROOT / 'private' / (name + '.created.json')


def known_created(name, container):
    need(container and created_path(name).is_file() and bound(read_json(created_path(name)))['id'] == container['Id'],
         'Unowned replacement container; refuse stop or rename')


def clone_web(name, port):
    need(name in {WEB, PREVIEW} and port == (LIVE_PORT if name == WEB else PREVIEW_PORT), 'Invalid web target')
    need(inspect(name) is None and not created_path(name).exists(), 'Web target/proof already exists')
    snapshot = private('web.json')
    web_contract(snapshot, PRIOR)
    host, config = snapshot['HostConfig'], snapshot['Config']
    args = ['docker', 'create', '--name', name, '--network', 'bilge-defter-classroom', '--read-only',
            '--restart', 'no' if name == PREVIEW else host['RestartPolicy']['Name'],
            '--memory', str(host['Memory']), '--pids-limit', str(host['PidsLimit'])]
    if host.get('NanoCpus'):
        args += ['--cpus', str(host['NanoCpus'] / 1e9)]
    if config.get('User'):
        args += ['--user', config['User']]
    if config.get('WorkingDir'):
        args += ['-w', config['WorkingDir']]
    for cap in host.get('CapDrop') or []:
        args += ['--cap-drop', cap]
    for cap in host.get('CapAdd') or []:
        args += ['--cap-add', cap]
    for option in host.get('SecurityOpt') or []:
        args += ['--security-opt', option]
    for dest, options in (host.get('Tmpfs') or {}).items():
        args += ['--tmpfs', dest + ':' + options]
    log = host.get('LogConfig') or {}
    if log.get('Type'):
        args += ['--log-driver', log['Type']]
    for key, value in log.get('Config', {}).items():
        args += ['--log-opt', key + '=' + value]
    for key, value in (config.get('Labels') or {}).items():
        args += ['--label', key + '=' + value]
    env = config.get('Env') or []
    need(all('=' in e and '\n' not in e and '\r' not in e for e in env) and
         len({e.split('=', 1)[0] for e in env}) == len(env), 'Invalid web environment')
    envpath = ROOT / 'private' / (name + '.env')
    fd = os.open(envpath, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(env) + '\n')
    args += ['--env-file', str(envpath), '-p', f'127.0.0.1:{port}:80',
             '--mount', f'type=bind,src={ROOT}/ui,dst=/usr/share/nginx/html,readonly',
             '--mount', f'type=bind,src={ROOT}/classroom-nginx.conf,dst=/etc/nginx/conf.d/default.conf,readonly',
             '--health-cmd', 'curl -fsS -o /dev/null http://127.0.0.1/release.json || exit 1',
             '--health-interval', '30s', '--health-timeout', '5s', '--health-retries', '3', '--health-start-period', '15s']
    entry = config.get('Entrypoint') or []
    if entry:
        args += ['--entrypoint', entry[0]]
    args += [snapshot['Image']] + entry[1:] + (config.get('Cmd') or [])
    try:
        ident = run(*args)
        need(re.fullmatch('[0-9a-f]{64}', ident), 'Docker did not return immutable web ID')
        write_json(created_path(name), {**binding(), 'id': ident}, True)
    finally:
        envpath.unlink()
    run('docker', 'start', name)
    run('docker', 'exec', name, 'nginx', '-t')


def healthy(name):
    for _ in range(30):
        value = inspect(name)
        if value and value['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Web health did not become ready')


def stage():
    old(); package(); unchanged(); backup_ok()
    need(not (ROOT / 'stage-proof.json').exists(), 'Stage proof exists; refuse replacement')
    try:
        clone_web(PREVIEW, PREVIEW_PORT)
        healthy(PREVIEW)
        web = verify(PREVIEW_PORT)
        old(); unchanged()
        write_json(ROOT / 'stage-proof.json', {**binding(), 'web': web, 'preview_id': inspect(PREVIEW)['Id'],
                                             'production_web_changed': False, 'database_accessed': False})
    except BaseException:
        preview = inspect(PREVIEW)
        if preview:
            known_created(PREVIEW, preview)
            if preview['State']['Running']:
                run('docker', 'stop', PREVIEW)
        raise
    print(json.dumps(read_json(ROOT / 'stage-proof.json')))


def point(path):
    need(path in {ROOT / 'ui', PRIOR / 'ui'}, 'Cannot point below v77')
    current_link([ROOT / 'ui', PRIOR / 'ui']); floor_ok()
    temp = CURRENT.parent / '.current-v78'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary link already exists')
    temp.symlink_to(path)
    temp.replace(CURRENT)


def rollback():
    # A corrupt candidate or unrelated restart may be WHY recovery is needed.
    # Authenticate the receipt/snapshots, but do not require candidate assets or
    # unrelated-service equality before restoring our exact retained v77 web.
    receipt(); backup_ok(); current_link([ROOT / 'ui', PRIOR / 'ui']); floor_ok(); prior_files()
    saved = private('web.json')
    web_contract(saved, PRIOR)
    retained, current = inspect(RETAINED), inspect(WEB)
    need(inspect(FAILED) is None, 'Failed-web evidence already exists; manual review required')
    need(retained is None or retained['Id'] == saved['Id'], 'Wrong retained v77 web identity')
    if current and current['Id'] != saved['Id']:
        known_created(WEB, current)
        need(retained and retained['Id'] == saved['Id'], 'Retained v77 web missing; refuse stopping live web')
    need(retained or (current and current['Id'] == saved['Id']), 'Prepared v77 web unavailable')
    web_contract(retained if retained else current, PRIOR)
    before = runtime_report()
    # All identity checks above precede the first mutation.
    if current and current['Id'] != saved['Id']:
        if current['State']['Running']:
            run('docker', 'stop', WEB)
        run('docker', 'rename', WEB, FAILED)
        current = None
    if current is None:
        run('docker', 'rename', RETAINED, WEB)
    need(inspect(WEB)['Id'] == saved['Id'], 'Recovered web identity mismatch')
    if not inspect(WEB)['State']['Running']:
        run('docker', 'start', WEB)
    point(PRIOR / 'ui')
    verification_error = None
    try:
        proof = verify_prior()
    except Exception as error:
        verification_error = error
        proof = {'version': 'v77', 'verified': False, 'error': 'Restored web HTTP verification failed'}
    after = runtime_report()
    result = {**binding(), 'rollback': 'v77', 'web': proof, 'database_restored': False,
              'other_services_unchanged': after['unchanged'],
              'unrelated_runtime_before': before, 'unrelated_runtime_after': after}
    write_json(ROOT / 'rollback-proof.json', result)
    print(json.dumps(result))
    if verification_error:
        raise RuntimeError('Prepared v77 web restored, but HTTP verification failed; inspect recovery proof') from verification_error


def activate():
    old(); package(); unchanged(); backup_ok()
    need(not (ROOT / 'activation-started.json').exists(), 'Activation already attempted; use recovery')
    proof = bound(read_json(ROOT / 'stage-proof.json'))
    preview = inspect(PREVIEW)
    known_created(PREVIEW, preview)
    need(preview['Id'] == proof['preview_id'] and preview['State']['Running'], 'Staged preview identity/state changed')
    verify(PREVIEW_PORT)
    for name in (RETAINED, FAILED):
        need(inspect(name) is None, 'Cutover target already exists')
    write_json(ROOT / 'activation-started.json', binding())
    try:
        run('docker', 'stop', WEB)
        run('docker', 'rename', WEB, RETAINED)
        clone_web(WEB, LIVE_PORT)
        healthy(WEB)
        web = verify(LIVE_PORT)
        point(ROOT / 'ui'); unchanged()
    except BaseException:
        rollback()
        raise
    known_created(PREVIEW, inspect(PREVIEW))
    run('docker', 'stop', PREVIEW)
    result = {**binding(), 'published': 'v78', 'web': web, 'scope': 'web-only',
              'api_library_worker_unchanged': True, 'database_changed': False, 'actual_device_acceptance': False,
              'rollback': 'sudo python3 -B ' + str(ROOT / 'deploy-v78.py') + ' rollback'}
    write_json(ROOT / 'live-proof.json', result)
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink(), 'Root and canonical release directory required')
    modes = {'prepare': prepare, 'stage': stage, 'activate': activate, 'rollback': rollback,
             'verify': lambda: print(json.dumps(verify()))}
    need(len(sys.argv) == 2 and sys.argv[1] in modes, 'Choose prepare, stage, activate, verify or rollback')
    modes[sys.argv[1]]()
