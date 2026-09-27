"""Web/library-only v58 publication. Accounts and all unrelated runtimes protected.

Reuses the committed v57 container cloning/security helpers, not its release flow.
No database migration or data restore; stopped v57 containers are retained.
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
b.ROOT = Path('/opt/bilge-defter-classroom-v58')
b.PRIOR = Path('/opt/bilge-defter-classroom-v57')
b.NAMES = [b.WEB, b.LIB]
b.HASH = 'e39aa2e0087a62bb9bf4fa1cb4821efa59f232c7e459d3cc419801868fd21c4b'
b.OLDHASH = 'e5db524782bea09f10ffcd917ec8be238c6dd5c9af826a8eabca0aeb3c7cd411'

def protected():
    excluded = set(b.NAMES + [n+s for n in b.NAMES for s in ['-preview-v58', '-rollback-v58', '-failed-v58']])
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
    assert b.sha(b.PRIOR/'classroom-nginx.conf') == b.CONFHASH
    receipt = json.loads((b.PRIOR/'source-receipt.json').read_text())
    for name, digest in receipt['files'].items():
        if name.startswith('library/'):
            assert b.sha(b.PRIOR/name) == digest, name
    for name, image in [(b.WEB, b.WEBIMAGE), (b.LIB, b.LIBIMAGE)]:
        c = b.inspect(name)
        assert c and c['State']['Running'] and c['Image'] == image
        mounts = {m['Destination']: m['Source'] for m in c['Mounts']}
        destination = '/usr/share/nginx/html' if name == b.WEB else '/srv/library'
        assert mounts[destination] == str(b.PRIOR/('ui' if name == b.WEB else 'library'))
        if (b.ROOT/'private'/f'{name}.json').exists():
            assert c['Id'] == b.load(name+'.json')['Id']
    assert b.inspect(b.LIB)['State']['Health']['Status'] == 'healthy'

def prepare():
    old()
    assert not (b.ROOT/'private').exists()
    for name in b.NAMES:
        for suffix in ['-preview-v58', '-rollback-v58', '-failed-v58']:
            assert b.inspect(name+suffix) is None
    (b.ROOT/'private').mkdir(mode=0o700)
    b.private_json(b.ROOT/'private/protected.json', protected())
    for name in b.NAMES:
        b.private_json(b.ROOT/'private'/f'{name}.json', b.inspect(name))
    (b.ROOT/'classroom-nginx.conf').write_bytes((b.PRIOR/'classroom-nginx.conf').read_bytes())
    with tarfile.open(b.ROOT/'payload.tar.gz') as archive:
        for m in archive.getmembers():
            assert m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
        archive.extractall(b.ROOT, filter='data')
    receipt = b.package()
    previous = json.loads((b.PRIOR/'source-receipt.json').read_text())
    changed = sorted(name for name in receipt['files'] if name.startswith('library/') and receipt['files'][name] != previous['files'][name])
    assert changed == ['library/index.html', 'library/style.css', 'library/textview.py'], changed
    # Read-only SQLite backup; live bookmark state is never replaced.
    digest = b.snapshot(b.LIBROOT/'state/bookmarks.sqlite3', b.ROOT/'private/bookmarks.sqlite')
    old()
    b.unchanged()
    print(json.dumps({'prepared': True, 'package': b.HASH, 'library_changes': changed, 'bookmark_backup': digest}))

def verify(port):
    return json.loads(b.run('python3', str(b.ROOT/'verify-publication-v58.py'), str(b.ROOT/'ui'), str(port), timeout=120))

def stage():
    old(); b.package(); b.unchanged()
    text = (b.ROOT/'classroom-nginx.conf').read_text().replace(b.LIB+':8080', b.LIB+'-preview-v58:8080')
    assert b.API+'-preview' not in text
    (b.ROOT/'preview-nginx.conf').write_text(text)
    for name in [b.LIB, b.WEB]:
        b.clone(name+'-preview-v58', name, True)
    b.await_health(b.LIB+'-preview-v58')
    proof = verify(18800)
    old(); b.unchanged()
    (b.ROOT/'stage-proof.json').write_text(json.dumps({'package': b.HASH, 'verification': proof}))
    print(json.dumps(proof))

def point(path):
    assert b.CURRENT.is_symlink() and b.CURRENT.resolve() in [b.PRIOR/'ui', b.ROOT/'ui']
    temp = b.CURRENT.parent/'.current-v58'
    assert not temp.exists() and not temp.is_symlink()
    temp.symlink_to(path); temp.replace(b.CURRENT)

def rollback():
    before = protected()
    for name in [b.WEB, b.LIB]:
        prior = b.inspect(name+'-rollback-v58')
        if prior:
            assert prior['Id'] == b.load(name+'.json')['Id']
            current = b.inspect(name)
            if current:
                assert current['Id'] != prior['Id'] and b.inspect(name+'-failed-v58') is None
                b.run('docker', 'stop', name)
                b.run('docker', 'rename', name, name+'-failed-v58')
            b.run('docker', 'rename', name+'-rollback-v58', name)
    for name in [b.LIB, b.WEB]:
        assert b.inspect(name)['Id'] == b.load(name+'.json')['Id']
        b.run('docker', 'start', name)
    point(b.PRIOR/'ui'); b.await_health(b.LIB)
    proof = json.loads(b.run('python3', str(b.PRIOR/'verify-publication-v57.py'), str(b.PRIOR/'ui'), '18790', timeout=120))
    assert before == protected()
    print(json.dumps({'rollback': 'v57', 'verification': proof, 'data_restored': False}))

def activate():
    old(); b.package(); b.unchanged()
    assert json.loads((b.ROOT/'stage-proof.json').read_text())['package'] == b.HASH
    verify(18800)
    for name in b.NAMES:
        assert b.inspect(name+'-rollback-v58') is None and b.inspect(name+'-failed-v58') is None
    try:
        for name in [b.WEB, b.LIB]:
            assert b.inspect(name)['Id'] == b.load(name+'.json')['Id']
            b.run('docker', 'stop', name)
            b.run('docker', 'rename', name, name+'-rollback-v58')
        for name in [b.LIB, b.WEB]:
            b.clone(name, name)
        b.await_health(b.LIB)
        proof = verify(18790)
        point(b.ROOT/'ui'); b.unchanged()
        before = {m['Destination']: (m['Source'], m['RW']) for m in b.load(b.LIB+'.json')['Mounts'] if m['Destination'] in ['/state', '/sources']}
        after = {m['Destination']: (m['Source'], m['RW']) for m in b.inspect(b.LIB)['Mounts'] if m['Destination'] in before}
        assert before == after
    except BaseException:
        rollback(); raise
    for name in b.NAMES:
        b.run('docker', 'stop', name+'-preview-v58')
    result = {'published': 'v58', 'package': b.HASH, 'source': b.package()['commit'], 'verification': proof,
              'library_health': b.inspect(b.LIB)['State']['Health']['Status'], 'accounts_and_other_services_unchanged': True,
              'actual_ipad_tested': False, 'rollback': 'sudo python3 '+str(b.ROOT/'deploy-v58.py')+' rollback'}
    (b.ROOT/'live-proof.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))

if __name__ == '__main__':
    assert os.geteuid() == 0 and b.ROOT.resolve() == b.ROOT and not b.ROOT.is_symlink()
    {'prepare': prepare, 'stage': stage, 'activate': activate, 'rollback': rollback, 'verify': lambda: print(json.dumps(verify(18790)))}[sys.argv[1]]()
