"""Root-only bounded worker preparation; no existing service changes.

Run after deploy-v73.py prepare. Source and dependency IDs are receipt-pinned.
The worker has no network, host ports, user documents, credentials or Docker socket.
"""
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time

ROOT = Path('/opt/bilge-defter-classroom-v73')
NAME = 'bd-pptx-v73-worker'
spec = importlib.util.spec_from_file_location('release73', ROOT / 'deploy-v73.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
b = r.b


class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(str(ROOT / 'socket/worker.sock'))


def inspect_worker():
    c = b.inspect(NAME)
    assert c and c['Config']['Labels'].get('bilge.release') == 'v73'
    h = c['HostConfig']
    assert h['NetworkMode'] == 'none' and not h.get('PortBindings')
    assert h['ReadonlyRootfs'] and not h['Privileged'] and c['Config']['User'] == '1000:10001'
    assert h['Memory'] == h['MemorySwap'] == 2 * 1024**3 and h['NanoCpus'] == 10**9
    assert h['PidsLimit'] == 160 and h['CapDrop'] == ['ALL']
    assert 'no-new-privileges:true' in h['SecurityOpt']
    assert h['Tmpfs'] == {'/tmp': 'rw,noexec,nosuid,nodev,size=384m,uid=1000,gid=10001,mode=0700'}
    assert [(m['Source'],m['Destination'],m['RW']) for m in c['Mounts']] == [(str(ROOT / 'socket'),'/run/bilge-pdf',True)]
    net = json.loads(b.run('docker','exec',NAME,'/usr/bin/python3','-c',
        "import json,os;print(json.dumps(os.listdir('/sys/class/net')))"))
    assert net == ['lo']
    return c


def request(data=None):
    c = UnixHTTP('localhost', timeout=60)
    started = time.monotonic()
    try:
        if data is None:
            c.request('GET', '/health')
        else:
            c.request('POST','/convert',body=data,headers={'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'})
        response = c.getresponse()
        body = response.read(20 * 1024 * 1024 + 1)
        assert len(body) <= 20 * 1024 * 1024
        return response.status, body, round(time.monotonic() - started, 3)
    finally:
        c.close()


def build():
    receipt = r.package()
    r.old(); r.unchanged()
    assert b.inspect(NAME) is None and not (ROOT / 'socket').exists()
    base = json.loads(b.run('docker','image','inspect','bilge-defter-pdf-v53:pdf-worker'))[0]['Id']
    assert base == receipt['worker_base']
    for path in (ROOT / 'worker').rglob('*'):
        os.utime(path, None)
    with (ROOT / 'worker-build.log').open('x') as log:
        result = subprocess.run(['docker','build','--network=none','--pull=false','--no-cache',
            '-t','bilge-defter-pptx:v73',str(ROOT / 'worker')],stdout=log,stderr=subprocess.STDOUT,timeout=180)
    assert result.returncode == 0, 'Worker build failed'
    image = json.loads(b.run('docker','image','inspect','bilge-defter-pptx:v73'))[0]['Id']
    expected = b.sha(ROOT / 'worker/pptx_worker.py')
    digest = b.run('docker','run','--rm','--network=none','--entrypoint','/usr/bin/python3',image,'-c',
        "import hashlib;print(hashlib.sha256(open('/srv/pptx_worker.py','rb').read()).hexdigest())")
    assert digest == expected
    # Linux process-group tests run with synthetic programs and no documents/network.
    output = b.run('docker','run','--rm','--network=none','--read-only','--user','1000:10001',
        '--tmpfs','/tmp:rw,size=64m,mode=1777','--memory','384m','--cpus','1','--pids-limit','80',
        '--cap-drop','ALL','--security-opt','no-new-privileges:true',
        '--mount','type=bind,src=' + str(ROOT / 'worker') + ',dst=/tests,readonly',
        '--entrypoint','python',receipt['base_images']['bilge-defter-accounts:v57-verify'],
        '-m','pytest','-q','/tests','-p','no:cacheprovider',timeout=180)
    (ROOT / 'worker-tests.txt').write_text(output)
    assert 'passed' in output and not any(x in output for x in ('failed','skipped','ERROR'))
    sockdir = ROOT / 'socket'
    sockdir.mkdir(mode=0o750)
    os.chown(sockdir,1000,10001)
    b.run('docker','create','--name',NAME,'--label','bilge.release=v73','--network','none',
          '--user','1000:10001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true',
          '--memory','2g','--memory-swap','2g','--cpus','1','--pids-limit','160',
          '--ulimit','nofile=1024:1024','--restart','unless-stopped','--log-driver','none',
          '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=384m,uid=1000,gid=10001,mode=0700',
          '--mount','type=bind,src=' + str(sockdir) + ',dst=/run/bilge-pdf',image)
    b.run('docker','start',NAME)
    for _ in range(40):
        try:
            if request()[0] == 200:
                break
        except (OSError,http.client.HTTPException):
            pass
        time.sleep(.5)
    else:
        raise RuntimeError('Worker health failed')
    c = inspect_worker()
    r.old(); r.unchanged()
    (ROOT / 'worker-build.json').write_text(json.dumps({'source':receipt['commit'],'worker_id':c['Id'],
        'image':image,'code_sha256':expected,'tests_passed':True,'isolation':True}))
    print(json.dumps({'worker_created':True,'tests':output.splitlines()[-1],'image':image,'isolation':True}))


def accept():
    receipt = r.package(); r.old(); r.unchanged()
    c = inspect_worker()
    build = json.loads((ROOT / 'worker-build.json').read_text())
    assert build['worker_id'] == c['Id'] and build['source'] == receipt['commit']
    fixtures = json.loads((ROOT / 'acceptance/receipt.json').read_text())['files']
    result = {}
    for name in ('native-chart.pptx','lumen-integumentary-original.pptx','native-chart.pptx'):
        data = (ROOT / 'acceptance' / name).read_bytes()
        assert hashlib.sha256(data).hexdigest() == fixtures[name]
        status, pdf, elapsed = request(data)
        assert status == 200 and pdf.startswith(b'%PDF-') and b'%%EOF' in pdf[-1024:]
        (ROOT / 'acceptance' / (name + '.pdf')).write_bytes(pdf)
        result[name] = {'seconds':elapsed,'bytes':len(pdf),'sha256':hashlib.sha256(pdf).hexdigest()}
    status, _, _ = request(b'not an office file')
    assert status != 200
    assert request((ROOT / 'acceptance/native-chart.pptx').read_bytes())[0] == 200
    result['bad_then_good'] = True
    # Exercise the installed LibreOffice, not a mocked subprocess. Pause only
    # this owned container's job group so the real fixed deadline must kill it.
    stop_code = """import os,signal,json
found=[]
for pid in os.listdir('/proc'):
 if pid.isdigit():
  try:
   if open('/proc/'+pid+'/comm').read().strip()=='soffice.bin':
    group=os.getpgid(int(pid));os.killpg(group,signal.SIGSTOP);found.append(int(pid))
  except (FileNotFoundError,ProcessLookupError): pass
print(json.dumps(found))"""
    clean_code = """import os,json
from pathlib import Path
live=[]
for pid in os.listdir('/proc'):
 if pid.isdigit():
  try:
   if open('/proc/'+pid+'/comm').read().strip() in ('soffice.bin','oosplash'):live.append(pid)
  except FileNotFoundError:pass
print(json.dumps({'processes':live,'jobs':list(p.name for p in Path('/tmp/bilge-pdf-jobs').iterdir())}))"""

    def pause_job():
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            found = json.loads(b.run('docker','exec',NAME,'/usr/bin/python3','-c',stop_code))
            if found:
                return found
            time.sleep(.03)
        raise RuntimeError('Could not intercept real LibreOffice job')

    def assert_clean():
        state = json.loads(b.run('docker','exec',NAME,'/usr/bin/python3','-c',clean_code))
        assert state == {'processes':[],'jobs':[]}, state

    slow_data = (ROOT / 'acceptance/lumen-integumentary-original.pptx').read_bytes()
    outcomes = []
    thread = threading.Thread(target=lambda: outcomes.append(request(slow_data)))
    thread.start()
    pause_job()
    assert request((ROOT / 'acceptance/native-chart.pptx').read_bytes())[0] == 429
    thread.join(55)
    assert not thread.is_alive() and outcomes and outcomes[0][0] == 504
    assert 44 <= outcomes[0][2] <= 52
    assert_clean()
    assert request((ROOT / 'acceptance/native-chart.pptx').read_bytes())[0] == 200
    result['real_timeout_seconds'] = outcomes[0][2]
    result['busy_then_retry'] = True

    client = UnixHTTP('localhost',timeout=60)
    client.request('POST','/convert',body=slow_data,headers={'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'})
    pause_job()
    start = time.monotonic()
    client.close()
    while True:
        try:
            assert_clean()
            break
        except AssertionError:
            assert time.monotonic() - start < 5, 'Cancellation failed to clean real job'
            time.sleep(.1)
    result['real_cancel_seconds'] = round(time.monotonic() - start,3)
    assert request((ROOT / 'acceptance/native-chart.pptx').read_bytes())[0] == 200

    # A hard restart leaves a stale UDS pathname on the bind mount. The new
    # process must own its lock, remove only that dead socket, and recover.
    assert b.inspect(NAME)['Id'] == c['Id']
    b.run('docker','kill','--signal','KILL',NAME)
    b.run('docker','start',NAME)
    for _ in range(40):
        try:
            if request()[0] == 200:
                break
        except (OSError,http.client.HTTPException):
            pass
        time.sleep(.25)
    else:
        raise RuntimeError('Worker did not recover after hard restart')
    assert b.inspect(NAME)['Id'] == c['Id']
    assert request((ROOT / 'acceptance/native-chart.pptx').read_bytes())[0] == 200
    assert_clean()
    result['hard_restart_recovered'] = True
    r.old(); r.unchanged()
    proof = {**build,'acceptance':True,'conversions':result}
    (ROOT / 'worker-proof.json').write_text(json.dumps(proof,indent=2))
    print(json.dumps(proof))


if __name__ == '__main__':
    assert os.geteuid() == 0 and ROOT.resolve() == ROOT and not ROOT.is_symlink()
    {'build':build,'accept':accept}[sys.argv[1]]()
