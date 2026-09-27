"""Web-only v66 publication (save worker recovery); nginx whitelist and accounts v65 unchanged.

Reuses the committed v57 container cloning/security helpers. Accounts and library are not
restarted. No data migration or restore. The stopped v65 web container is retained for
rollback; because a host cleanup (`docker system prune`) can delete stopped containers,
rollback recreates the v65 web container from the prepared snapshot when it is gone, and
`rehearse` proves that recreation on a loopback port without touching the live web.
"""
import importlib.util
import json
import os
import sys
import tarfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('base', Path(__file__).with_name('deploy-v57.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
b.ROOT = Path('/opt/bilge-defter-classroom-v66')
b.PRIOR = Path('/opt/bilge-defter-classroom-v65')
b.NAMES = [b.WEB]
b.HASH = 'fe5f594822e28c53cbe8fbd7d1741f4d436de0ec30d18e6bc8d100d4386ead92'
b.OLDHASH = '59fcbef4e3ef6594880192d483d545fabd1f2077484179178c3d3ce335fd3bfd'
OLDCONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
b.CONFHASH = OLDCONF
LIBDIR = Path('/opt/bilge-defter-classroom-v58/library')
REHEARSAL = b.WEB + '-rehearsal-v66'
SUFFIXES = ['-preview-v66', '-rollback-v66', '-failed-v66', '-rehearsal-v66']
PAYLOAD = {'deploy-v57.py', 'deploy-v66.py', 'verify-publication-v57.py', 'verify-publication-v64.py',
           'verify-publication-v66.py', 'classroom-nginx.conf', 'source-receipt.json'}


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def protected():
    excluded = {b.WEB} | {b.WEB+s for s in SUFFIXES}
    result = []
    for ident in b.run('docker', 'ps', '-aq').split():
        c = b.inspect(ident)
        if c['Name'].lstrip('/') not in excluded:
            result.append([c['Name'], c['Id'], c['State']['Status'], c['State']['StartedAt']])
    return {'containers': sorted(result), 'main_pid': b.run('systemctl', 'show', 'linux-ai-server', '-p', 'MainPID', '--value')}
b.protected = protected


def old():
    need(b.CURRENT.resolve() == b.PRIOR/'ui', 'Not live v65')
    need(b.sha(b.PRIOR/'ui/SHA256SUMS') == b.OLDHASH, 'Old web manifest changed')
    need(b.sha(b.PRIOR/'classroom-nginx.conf') == OLDCONF, 'Old nginx config changed')
    web = b.inspect(b.WEB)
    need(web and web['State']['Running'] and web['Image'] == b.WEBIMAGE, 'Live web mismatch')
    mounts = {m['Destination']: m['Source'] for m in web['Mounts']}
    need(mounts == {'/usr/share/nginx/html': str(b.PRIOR/'ui'), '/etc/nginx/conf.d/default.conf': str(b.PRIOR/'classroom-nginx.conf')}, 'Old web mount mismatch')
    if (b.ROOT/'private'/f'{b.WEB}.json').exists():
        need(web['Id'] == b.load(b.WEB+'.json')['Id'], 'Web container changed during preparation')
    api = b.inspect(b.API)
    need(api and api['State']['Running'], 'Accounts not running')
    lib = b.inspect(b.LIB)
    need(lib and lib['State']['Running'] and lib['State']['Health']['Status'] == 'healthy', 'Library not healthy')
    need({m['Destination']: m['Source'] for m in lib['Mounts']}.get('/srv/library') == str(LIBDIR), 'Library code moved')


def prepare():
    old()
    need(not (b.ROOT/'private').exists(), 'Already prepared; do not overwrite snapshots')
    for suffix in SUFFIXES:
        need(b.inspect(b.WEB+suffix) is None, 'Conflicting container '+suffix)
    (b.ROOT/'private').mkdir(mode=0o700)
    b.private_json(b.ROOT/'private/protected.json', protected())
    b.private_json(b.ROOT/'private'/f'{b.WEB}.json', b.inspect(b.WEB))
    with tarfile.open(b.ROOT/'payload.tar.gz') as archive:
        for m in archive.getmembers():
            need(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts, 'Unsafe payload path')
            need(m.name.startswith('ui/') or m.name in PAYLOAD, 'Unexpected payload file '+m.name)
        archive.extractall(b.ROOT, filter='data')
    receipt = b.package()
    old()
    b.unchanged()
    print(json.dumps({'prepared': True, 'package': b.HASH, 'source': receipt['commit'], 'nginx': b.CONFHASH, 'accounts_and_library': 'unchanged'}))


def verify(port):
    return json.loads(b.run('python3', str(b.ROOT/'verify-publication-v66.py'), str(b.ROOT/'ui'), str(port), timeout=120))


def verify_prior(port):
    return json.loads(b.run('python3', str(b.PRIOR/'verify-publication-v65.py'), str(b.PRIOR/'ui'), str(port), timeout=120))


def recreate_prior(name, port=None):
    """Create and start the v65 web container from the prepared snapshot (v65 ui and nginx conf)."""
    original_run = b.run
    ui, conf = str(b.ROOT/'ui'), str(b.ROOT/'classroom-nginx.conf')

    def run(*args, **kwargs):
        args = list(args)
        if args[:2] == ['docker', 'create']:
            args = [a.replace('src='+ui+',', 'src='+str(b.PRIOR/'ui')+',').replace('src='+conf+',', 'src='+str(b.PRIOR/'classroom-nginx.conf')+',') for a in args]
            need(any(a.startswith('type=bind,src='+str(b.PRIOR/'ui')+',') for a in args), 'Prior ui mount not rewritten')
            need(any(a.startswith('type=bind,src='+str(b.PRIOR/'classroom-nginx.conf')+',') for a in args), 'Prior nginx mount not rewritten')
            if port is not None:
                need(args.count('127.0.0.1:18790:80') == 1, 'Unexpected web port')
                args[args.index('127.0.0.1:18790:80')] = f'127.0.0.1:{port}:80'
                args[args.index('--restart')+1] = 'no'
        return original_run(*args, **kwargs)

    b.run = run
    try:
        b.clone(name, b.WEB)
    finally:
        b.run = original_run


def stage():
    old(); b.package(); b.unchanged()
    # The preview serves the new bytes against the live, unchanged accounts API and library;
    # its checks send only unauthenticated or invalid-token requests.
    (b.ROOT/'preview-nginx.conf').write_bytes((b.ROOT/'classroom-nginx.conf').read_bytes())
    b.clone(b.WEB+'-preview-v66', b.WEB, True)
    proof = verify(18800)
    old(); b.unchanged()
    (b.ROOT/'stage-proof.json').write_text(json.dumps({'package': b.HASH, 'verification': proof}))
    print(json.dumps(proof))


def rehearse():
    """Recreate v65 from the snapshot on loopback 18806, verify it, then remove it. Live untouched."""
    need((b.ROOT/'private'/f'{b.WEB}.json').exists(), 'Prepare first')
    need(b.inspect(REHEARSAL) is None, 'Rehearsal container exists')
    before = protected()
    try:
        recreate_prior(REHEARSAL, 18806)
        proof = verify_prior(18806)
    finally:
        if b.inspect(REHEARSAL):
            b.run('docker', 'stop', REHEARSAL)
            b.run('docker', 'rm', REHEARSAL)
    need(before == protected(), 'Unrelated runtime changed during rehearsal')
    (b.ROOT/'rehearsal-proof.json').write_text(json.dumps({'recreated': 'v65', 'port': 18806, 'verification': proof}))
    print(json.dumps({'recreated': 'v65', 'verification': proof, 'removed': True}))


def point(path):
    need(b.CURRENT.is_symlink() and b.CURRENT.resolve() in [b.PRIOR/'ui', b.ROOT/'ui'], 'Unexpected current link')
    temp = b.CURRENT.parent/'.current-v66'
    need(not temp.exists() and not temp.is_symlink(), 'Temporary link already exists')
    temp.symlink_to(path); temp.replace(b.CURRENT)


def rollback():
    snapshot = b.load(b.WEB+'.json')
    prior, current = b.inspect(b.WEB+'-rollback-v66'), b.inspect(b.WEB)
    need(prior is None or prior['Id'] == snapshot['Id'], 'Rollback container is not the prepared v65 web')
    need(b.inspect(b.WEB+'-failed-v66') is None, 'Failed container already exists')
    before = protected()
    if current and current['Id'] != snapshot['Id']:
        b.run('docker', 'stop', b.WEB)
        b.run('docker', 'rename', b.WEB, b.WEB+'-failed-v66')
        current = None
    if current is None:
        if prior:
            b.run('docker', 'rename', b.WEB+'-rollback-v66', b.WEB)
            b.run('docker', 'start', b.WEB)
            source = 'retained container'
        else:
            # The stopped container was removed (host cleanup); rebuild it from the snapshot.
            recreate_prior(b.WEB)
            source = 'recreated from snapshot'
    else:
        b.run('docker', 'start', b.WEB)
        source = 'live container was still v65'
    point(b.PRIOR/'ui')
    proof = verify_prior(18790)
    need(before == protected(), 'Unrelated runtime changed during rollback')
    print(json.dumps({'rollback': 'v65', 'source': source, 'verification': proof, 'data_restored': False}))


def activate():
    old(); receipt = b.package(); b.unchanged()
    need(json.loads((b.ROOT/'stage-proof.json').read_text())['package'] == b.HASH, 'Stage package mismatch')
    need(json.loads((b.ROOT/'rehearsal-proof.json').read_text())['recreated'] == 'v65', 'Rollback rehearsal missing')
    verify(18800)
    need(b.inspect(b.WEB+'-rollback-v66') is None and b.inspect(b.WEB+'-failed-v66') is None, 'Cutover target already exists')
    try:
        need(b.inspect(b.WEB)['Id'] == b.load(b.WEB+'.json')['Id'], 'Live web changed since prepare')
        b.run('docker', 'stop', b.WEB)
        b.run('docker', 'rename', b.WEB, b.WEB+'-rollback-v66')
        b.clone(b.WEB, b.WEB)
        proof = verify(18790)
        point(b.ROOT/'ui'); b.unchanged()
    except BaseException:
        rollback(); raise
    b.run('docker', 'stop', b.WEB+'-preview-v66')
    result = {'published': 'v66', 'package': b.HASH, 'source': receipt['commit'], 'nginx': b.CONFHASH, 'verification': proof,
              'library_code': str(LIBDIR), 'library_health': b.inspect(b.LIB)['State']['Health']['Status'],
              'accounts_library_and_other_services_unchanged': True, 'actual_ipad_tested': False,
              'rollback': 'sudo python3 -B '+str(b.ROOT/'deploy-v66.py')+' rollback'}
    (b.ROOT/'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    need(os.geteuid() == 0 and b.ROOT.resolve() == b.ROOT and not b.ROOT.is_symlink(), 'Root and canonical release path required')
    {'prepare': prepare, 'stage': stage, 'rehearse': rehearse, 'activate': activate, 'rollback': rollback,
     'verify': lambda: print(json.dumps(verify(18790)))}[sys.argv[1]]()
