"""Worker tests: fake executables, real Linux process groups; no LibreOffice required."""
import http.client
import os
from pathlib import Path
import socket
import stat
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import pptx_worker as worker

PDF = b'%PDF-1.7\nsynthetic fixture\n%%EOF\n'
MAGIC = b'PK\x03\x04'
LINUX = pytest.mark.skipif(not sys.platform.startswith('linux'), reason='Linux process group / Unix socket test')


def test_fixed_limits_and_no_environment_override(monkeypatch):
    monkeypatch.setenv('JOB_SECONDS', '999999')
    monkeypatch.setenv('BILGE_PDF_TIMEOUT', '999999')
    assert worker.JOB_SECONDS == 45 and worker.MAX_BYTES == 20 * 1024 * 1024
    assert worker.MAX_CONNECTIONS == 4 and worker.UPLOAD_SECONDS == 15
    assert worker.SOCKET_PATH.as_posix() == '/run/bilge-pdf/worker.sock'


def test_profile_disables_macros_links_and_active_content():
    root = ElementTree.fromstring(worker.PROFILE_XML)
    ns = '{http://openoffice.org/2001/registry}'
    props = {p.attrib[ns + 'name']: p for p in root.iter('prop')}
    for name, value in [('MacroSecurityLevel', '3'), ('DisableMacrosExecution', 'true'),
                        ('DisableActiveContent', 'true'), ('BlockUntrustedRefererLinks', 'true')]:
        assert props[name].findtext('value') == value
        assert props[name].attrib[ns + 'finalized'] == 'true'
    assert not list(props['SecureURL'].find('value'))


def test_converter_environment_has_no_credentials_or_proxies(tmp_path, monkeypatch):
    monkeypatch.setenv('HTTPS_PROXY', 'private')
    monkeypatch.setenv('KLIPPER_MEMORY_KEY', 'private')
    env = worker.office_environment(tmp_path)
    assert 'HTTPS_PROXY' not in env and 'KLIPPER_MEMORY_KEY' not in env
    assert env['HOME'] == str(tmp_path) and env['TMPDIR'] == str(tmp_path)


@pytest.mark.parametrize('data', [b'', b'plain text', b'%PDF-missing eof', b'%PDF-' + b'x' * 1030 + b'%%EOF' + b'x' * 1030])
def test_invalid_pdf_rejected(tmp_path, data):
    path = tmp_path / 'result.pdf'
    path.write_bytes(data)
    with pytest.raises(worker.ConversionError):
        worker.read_pdf(path)


def test_bounded_pdf_and_fixed_command(tmp_path):
    path = tmp_path / 'result.pdf'
    path.write_bytes(PDF)
    assert worker.read_pdf(path) == PDF
    command = worker.office_command(Path('/usr/bin/soffice'), tmp_path / 'profile', tmp_path / 'document.pptx', tmp_path)
    assert '--headless' in command and 'pdf:impress_pdf_Export' in command
    assert all('unoconvert' not in part and 'stirling' not in part for part in command)


@pytest.fixture
def fake_binary(tmp_path):
    # Mode is selected by test input only inside this fake program, never in the
    # production worker. Descendant ignores SIGTERM to prove whole-group SIGKILL.
    script = tmp_path / 'fake-soffice'
    script.write_text('#!' + sys.executable + '\n' + r'''
import os, signal, subprocess, sys, time
from pathlib import Path
from urllib.parse import unquote, urlsplit
source = Path(sys.argv[-1])
output = Path(sys.argv[sys.argv.index('--outdir') + 1])
profile = Path(unquote(urlsplit(next(a.split('=', 1)[1] for a in sys.argv if a.startswith('-env:UserInstallation='))).path))
mode = source.read_bytes()[4:].decode()
assert 'DisableMacrosExecution' in (profile / 'user' / 'registrymodifications.xcu').read_text()
if mode in ('hang', 'linger'):
    child = subprocess.Popen([sys.executable, '-c', 'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(120)'])
    (source.parent.parent / 'child.pid').write_text(str(child.pid))
    (source.parent.parent / 'leader.pid').write_text(str(os.getpid()))
if mode == 'hang':
    time.sleep(120)
if mode == 'error':
    print('PRIVATE SECRET DOCUMENT', file=sys.stderr)
    sys.exit(2)
if mode == 'missing':
    sys.exit(0)
if mode == 'bad':
    (output / 'document.pdf').write_bytes(b'not PDF')
elif mode == 'large':
    with (output / 'document.pdf').open('wb') as f:
        f.write(b'%PDF-')
        f.truncate(20 * 1024 * 1024 + 1)
elif mode == 'fifo':
    os.mkfifo(output / 'document.pdf')
else:
    (output / 'document.pdf').write_bytes(b'%PDF-1.7\nsynthetic fixture\n%%EOF\n'.replace(b'\\n', b'\n'))
''', encoding='utf-8')
    script.chmod(0o700)
    return script


@pytest.fixture
def runner(tmp_path, fake_binary):
    if sys.platform.startswith('linux'):
        worker.become_subreaper()
    jobs = tmp_path / 'jobs'
    jobs.mkdir(mode=0o700)
    def fake_command(binary, profile, source, output):
        # Test tmpfs is deliberately noexec, like production. Execute the image's
        # real Python binary and READ the fake script; do not weaken noexec or
        # production ready()/soffice validation to make test fixtures executable.
        return [sys.executable, str(fake_binary),
                *worker.office_command(binary, profile, source, output)[1:]]
    return worker.OfficeRunner(jobs, Path(sys.executable), command=fake_command)


def jobs_empty(runner):
    assert not list(runner.jobs_root.glob('job-*'))


def processes_gone(runner):
    for name in ('child.pid', 'leader.pid'):
        pid = int((runner.jobs_root / name).read_text())
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)


@LINUX
def test_success_cleanup_and_lingering_child_killed(runner):
    assert runner(MAGIC + b'linger', lambda: False) == PDF
    jobs_empty(runner)
    processes_gone(runner)
    assert runner(MAGIC + b'ok', lambda: False) == PDF
    jobs_empty(runner)


@LINUX
@pytest.mark.parametrize('mode', ['error', 'missing', 'bad', 'large', 'fifo'])
def test_failures_cleanup_and_next_job_allowed(runner, mode, capsys):
    started = time.monotonic()
    with pytest.raises(worker.ConversionError) as exc:
        runner(MAGIC + mode.encode(), lambda: False)
    assert exc.value.status == 422
    if mode == 'fifo':
        assert time.monotonic() - started < 3
    jobs_empty(runner)
    assert runner(MAGIC + b'ok', lambda: False) == PDF
    assert 'PRIVATE' not in capsys.readouterr().err


@LINUX
def test_timeout_kills_and_reaps_process_group_then_next_job(runner):
    runner.expired = lambda start: time.monotonic() - start >= 0.4
    started = time.monotonic()
    with pytest.raises(worker.ConversionError) as exc:
        runner(MAGIC + b'hang', lambda: False)
    assert exc.value.status == 504 and time.monotonic() - started < 5
    processes_gone(runner)
    jobs_empty(runner)
    assert runner(MAGIC + b'ok', lambda: False) == PDF


@LINUX
def test_disconnect_kills_and_reaps_process_group_then_next_job(runner):
    def disconnected():
        return (runner.jobs_root / 'child.pid').exists()
    with pytest.raises(worker.ClientDisconnected):
        runner(MAGIC + b'hang', disconnected)
    processes_gone(runner)
    jobs_empty(runner)
    assert runner(MAGIC + b'ok', lambda: False) == PDF


@LINUX
def test_symlink_pdf_not_read(tmp_path):
    original, symlink = tmp_path / 'original', tmp_path / 'result.pdf'
    original.write_bytes(PDF)
    symlink.symlink_to(original)
    with pytest.raises(worker.ConversionError):
        worker.read_pdf(symlink)


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=5)
        self.path = str(path)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


@pytest.fixture
def server(tmp_path, runner):
    path = tmp_path / 'worker.sock'
    service = worker.WorkerServer(path, runner, runner.ready)
    thread = threading.Thread(target=service.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
    thread.start()
    try:
        yield service, path
    finally:
        service.shutdown()
        service.server_close()
        thread.join(timeout=3)


def request(path, body=MAGIC + b'ok', headers=None, method='POST', target='/convert'):
    connection = UnixConnection(path)
    connection.request(method, target, body, headers or {'Content-Type': worker.PPTX_TYPE})
    response = connection.getresponse()
    result = response.status, response.read(), dict(response.getheaders())
    connection.close()
    return result


@LINUX
def test_http_success_health_and_failure_retry(server, runner):
    service, path = server
    assert request(path, method='GET', target='/health')[0] == 200
    assert request(path, MAGIC + b'error')[0] == 422
    status, data, headers = request(path)
    assert status == 200 and data == PDF and headers['Content-Type'] == 'application/pdf'
    jobs_empty(runner)


@LINUX
def test_one_job_and_connection_cap(server):
    service, path = server
    assert service.job_lock.acquire(False)
    try:
        assert request(path)[0] == 429
    finally:
        service.job_lock.release()
    # The client can consume the response before the server thread executes its
    # connection-slot finally. Observe handler completion, not client timing.
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        with service.active_lock:
            if not service.active_connections:
                break
        time.sleep(.01)
    with service.active_lock:
        assert not service.active_connections
    acquired = [service.connections.acquire(False) for _ in range(worker.MAX_CONNECTIONS)]
    assert all(acquired) and not service.connections.acquire(False)
    for _ in acquired:
        service.connections.release()


@LINUX
@pytest.mark.parametrize('headers,code', [
    ({'Content-Type': 'application/pdf'}, 415),
    ({'Content-Type': worker.PPTX_TYPE, 'Content-Length': str(worker.MAX_BYTES + 1)}, 413),
    ({'Content-Type': worker.PPTX_TYPE, 'Content-Length': '0'}, 413),
    ({'Content-Type': worker.PPTX_TYPE, 'Content-Encoding': 'gzip'}, 400),
    ({'Content-Type': worker.PPTX_TYPE, 'Transfer-Encoding': 'chunked'}, 400),
])
def test_http_limits(server, headers, code):
    assert request(server[1], headers=headers)[0] == code


@LINUX
def test_http_disconnect_cancels_real_job(server, runner):
    service, path = server
    connection = UnixConnection(path)
    connection.request('POST', '/convert', MAGIC + b'hang', {'Content-Type': worker.PPTX_TYPE})
    deadline = time.monotonic() + 3
    while not (runner.jobs_root / 'child.pid').exists() and time.monotonic() < deadline:
        time.sleep(.01)
    assert (runner.jobs_root / 'child.pid').exists()
    connection.close()
    deadline = time.monotonic() + 4
    while service.job_lock.locked() and time.monotonic() < deadline:
        time.sleep(.02)
    assert not service.job_lock.locked()
    processes_gone(runner)
    jobs_empty(runner)
    assert request(path)[0] == 200


@LINUX
def test_unknown_cleanup_state_fail_closed(server):
    service, path = server
    def failed(*_args):
        raise worker.CleanupError()
    service.run_job = failed
    assert request(path)[0] == 503
    assert request(path, method='GET', target='/health')[0] == 503
    assert request(path)[0] == 503


@LINUX
def test_cleanup_failure_between_health_check_and_lock_is_fail_closed(server):
    service, path = server
    actual = service.job_lock
    calls = []
    class UnhealthyOnAcquire:
        def acquire(self, blocking=False):
            acquired = actual.acquire(blocking)
            if acquired:
                # Reproduce the preceding job's cleanup failure precisely after
                # the handler's initial health observation, before its lock.
                service.unhealthy.set()
            return acquired
        def release(self):
            actual.release()
    service.job_lock = UnhealthyOnAcquire()
    def forbidden(*_args):
        calls.append(True)
        return PDF
    service.run_job = forbidden
    assert request(path)[0] == 503
    deadline = time.monotonic() + 3
    while actual.locked() and time.monotonic() < deadline:
        time.sleep(.01)
    assert not calls and not actual.locked()


@LINUX
def test_plain_text_cannot_be_converted_as_presentation(server, runner):
    assert request(server[1], b'not an office file')[0] == 415
    jobs_empty(runner)


@LINUX
def test_stale_socket_is_removed_under_exclusive_lock(tmp_path):
    path = tmp_path / 'worker.sock'
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stale:
        stale.bind(str(path))
    descriptor = worker.own_socket_directory(path)
    try:
        assert not path.exists()
        with pytest.raises(OSError):
            worker.own_socket_directory(path)
        assert (tmp_path / '.worker.lock').is_file()
    finally:
        os.close(descriptor)
    # Restart can take the persistent lock again after the former process exits.
    descriptor = worker.own_socket_directory(path)
    os.close(descriptor)


@LINUX
def test_active_socket_cannot_be_replaced(tmp_path):
    path = tmp_path / 'worker.sock'
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as active:
        active.bind(str(path))
        active.listen(1)
        with pytest.raises(RuntimeError):
            worker.own_socket_directory(path)
        assert stat.S_ISSOCK(path.lstat().st_mode)


@LINUX
def test_socket_path_regular_file_or_symlink_never_deleted(tmp_path):
    path = tmp_path / 'worker.sock'
    path.write_bytes(b'preserve')
    with pytest.raises(RuntimeError):
        worker.own_socket_directory(path)
    assert path.read_bytes() == b'preserve'
    path.unlink()
    target = tmp_path / 'target'
    target.write_bytes(b'preserve target')
    path.symlink_to(target)
    with pytest.raises(RuntimeError):
        worker.own_socket_directory(path)
    assert path.is_symlink() and target.read_bytes() == b'preserve target'


@LINUX
def test_lock_symlink_is_not_followed(tmp_path):
    target = tmp_path / 'target'
    target.write_bytes(b'preserve')
    (tmp_path / '.worker.lock').symlink_to(target)
    with pytest.raises(OSError):
        worker.own_socket_directory(tmp_path / 'worker.sock')
    assert target.read_bytes() == b'preserve'


@LINUX
def test_worker_stop_cancels_job_before_server_closes(server, runner):
    service, path = server
    connection = UnixConnection(path)
    connection.request('POST', '/convert', MAGIC + b'hang', {'Content-Type': worker.PPTX_TYPE})
    deadline = time.monotonic() + 3
    while not (runner.jobs_root / 'child.pid').exists() and time.monotonic() < deadline:
        time.sleep(.01)
    assert (runner.jobs_root / 'child.pid').exists()
    service.request_stop()
    service.server_close()  # Must join request threads after kill/reap/cleanup.
    connection.close()
    assert not service.job_lock.locked()
    processes_gone(runner)
    jobs_empty(runner)
