"""Web-only v64 publication (live FIPAT TA2 reference link); nginx whitelist unchanged from v63.

Reuses the committed v57 container cloning/security helpers. Library and accounts are
not restarted; the library keeps its v58 code directory. No data migration or restore;
the stopped v63 web container is retained for rollback.
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
b.ROOT = Path('/opt/bilge-defter-classroom-v64')
b.PRIOR = Path('/opt/bilge-defter-classroom-v63')
b.NAMES = [b.WEB]
b.HASH = '7db781b5391eddd2aba12dfafb13c3a3a572737c62643e84d653d50832cb0fff'
b.OLDHASH = 'd592864d4367ae8647a2ee6fc7f6fea7f04ed14ce56be37674cdca564cd602e6'
OLDCONF = '3f3ef2ae4982758cfaafa659835aec6e03bd2e2edeceddb81378ecabaad389cf'
b.CONFHASH = OLDCONF
LIBDIR = Path('/opt/bilge-defter-classroom-v58/library')
SUFFIXES = ['-preview-v64', '-rollback-v64', '-failed-v64']
PAYLOAD = {'deploy-v57.py', 'deploy-v64.py', 'verify-publication-v57.py', 'verify-publication-v64.py', 'classroom-nginx.conf', 'source-receipt.json'}


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
    assert b.CURRENT.resolve() == b.PRIOR/'ui'
    assert b.sha(b.PRIOR/'ui/SHA256SUMS') == b.OLDHASH
    assert b.sha(b.PRIOR/'classroom-nginx.conf') == OLDCONF
    web = b.inspect(b.WEB)
    assert web and web['State']['Running'] and web['Image'] == b.WEBIMAGE
    mounts = {m['Destination']: m['Source'] for m in web['Mounts']}
    assert mounts.get('/usr/share/nginx/html') == str(b.PRIOR/'ui')
    assert mounts.get('/etc/nginx/conf.d/default.conf') == str(b.PRIOR/'classroom-nginx.conf')
    if (b.ROOT/'private'/f'{b.WEB}.json').exists():
        assert web['Id'] == b.load(b.WEB+'.json')['Id']
    lib = b.inspect(b.LIB)
    assert lib and lib['State']['Running'] and lib['State']['Health']['Status'] == 'healthy'
    assert {m['Destination']: m['Source'] for m in lib['Mounts']}.get('/srv/library') == str(LIBDIR)


def prepare():
    old()
    assert not (b.ROOT/'private').exists()
    for suffix in SUFFIXES:
        assert b.inspect(b.WEB+suffix) is None
    (b.ROOT/'private').mkdir(mode=0o700)
    b.private_json(b.ROOT/'private/protected.json', protected())
    b.private_json(b.ROOT/'private'/f'{b.WEB}.json', b.inspect(b.WEB))
    with tarfile.open(b.ROOT/'payload.tar.gz') as archive:
        for m in archive.getmembers():
            assert m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
            assert m.name.startswith('ui/') or m.name in PAYLOAD, m.name
        archive.extractall(b.ROOT, filter='data')
    receipt = b.package()
    old()
    b.unchanged()
    print(json.dumps({'prepared': True, 'package': b.HASH, 'source': receipt['commit'], 'nginx': b.CONFHASH, 'library': 'unchanged'}))


def verify(port):
    return json.loads(b.run('python3', str(b.ROOT/'verify-publication-v64.py'), str(b.ROOT/'ui'), str(port), timeout=120))


def stage():
    old(); b.package(); b.unchanged()
    # The preview serves the new bytes against the live, unchanged API and library;
    # its checks send only unauthenticated or invalid-token requests.
    (b.ROOT/'preview-nginx.conf').write_bytes((b.ROOT/'classroom-nginx.conf').read_bytes())
    b.clone(b.WEB+'-preview-v64', b.WEB, True)
    proof = verify(18800)
    old(); b.unchanged()
    (b.ROOT/'stage-proof.json').write_text(json.dumps({'package': b.HASH, 'verification': proof}))
    print(json.dumps(proof))


def point(path):
    assert b.CURRENT.is_symlink() and b.CURRENT.resolve() in [b.PRIOR/'ui', b.ROOT/'ui']
    temp = b.CURRENT.parent/'.current-v64'
    assert not temp.exists() and not temp.is_symlink()
    temp.symlink_to(path); temp.replace(b.CURRENT)


def rollback():
    before = protected()
    prior = b.inspect(b.WEB+'-rollback-v64')
    if prior:
        assert prior['Id'] == b.load(b.WEB+'.json')['Id']
        current = b.inspect(b.WEB)
        if current:
            assert current['Id'] != prior['Id'] and b.inspect(b.WEB+'-failed-v64') is None
            b.run('docker', 'stop', b.WEB)
            b.run('docker', 'rename', b.WEB, b.WEB+'-failed-v64')
        b.run('docker', 'rename', b.WEB+'-rollback-v64', b.WEB)
    assert b.inspect(b.WEB)['Id'] == b.load(b.WEB+'.json')['Id']
    b.run('docker', 'start', b.WEB)
    point(b.PRIOR/'ui')
    proof = json.loads(b.run('python3', str(b.PRIOR/'verify-publication-v63.py'), str(b.PRIOR/'ui'), '18790', timeout=120))
    assert before == protected()
    print(json.dumps({'rollback': 'v63', 'verification': proof, 'data_restored': False}))


def activate():
    old(); receipt = b.package(); b.unchanged()
    assert json.loads((b.ROOT/'stage-proof.json').read_text())['package'] == b.HASH
    verify(18800)
    assert b.inspect(b.WEB+'-rollback-v64') is None and b.inspect(b.WEB+'-failed-v64') is None
    try:
        assert b.inspect(b.WEB)['Id'] == b.load(b.WEB+'.json')['Id']
        b.run('docker', 'stop', b.WEB)
        b.run('docker', 'rename', b.WEB, b.WEB+'-rollback-v64')
        b.clone(b.WEB, b.WEB)
        proof = verify(18790)
        point(b.ROOT/'ui'); b.unchanged()
    except BaseException:
        rollback(); raise
    b.run('docker', 'stop', b.WEB+'-preview-v64')
    result = {'published': 'v64', 'package': b.HASH, 'source': receipt['commit'], 'nginx': b.CONFHASH, 'verification': proof,
              'library_code': str(LIBDIR), 'library_health': b.inspect(b.LIB)['State']['Health']['Status'],
              'accounts_library_and_other_services_unchanged': True, 'actual_ipad_tested': False,
              'rollback': 'sudo python3 '+str(b.ROOT/'deploy-v64.py')+' rollback'}
    (b.ROOT/'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    assert os.geteuid() == 0 and b.ROOT.resolve() == b.ROOT and not b.ROOT.is_symlink()
    {'prepare': prepare, 'stage': stage, 'activate': activate, 'rollback': rollback,
     'verify': lambda: print(json.dumps(verify(18790)))}[sys.argv[1]]()
