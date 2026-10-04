"""Private, bounded PPTX-to-PDF worker. Linux only; stdlib, HTTP over a Unix socket.

The API validates OOXML before calling this process. This worker is a second
boundary, NOT an OOXML validator. Run with no network, a read-only root, bounded
tmpfs, resource limits, and no notebook/identity mounts. No production setting is
read from an environment variable. Tests inject callables, never environment flags.
"""
from __future__ import annotations

import ctypes
import errno
import http.client
import http.server
import os
from pathlib import Path
import select
import shutil
import signal
import socket
import socketserver
import stat
import subprocess
import sys
import tempfile
import threading
import time

MAX_BYTES = 20 * 1024 * 1024
MAX_CONNECTIONS = 4
JOB_SECONDS = 45.0
UPLOAD_SECONDS = 15.0
HEADER_SECONDS = 10.0
REAP_SECONDS = 3.0
POLL_SECONDS = 0.05
SOFFICE = Path('/usr/bin/soffice')
SOCKET_PATH = Path('/run/bilge-pdf/worker.sock')
JOBS_ROOT = Path('/tmp/bilge-pdf-jobs')
PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

# LibreOffice Office.Common/Security/Scripting schema: maximum macro security,
# unconditional macro disable, no trusted document locations, and blocked links.
# The no-network container remains mandatory; configuration is defence in depth.
# DisableActiveContent also hides native charts. Permit those after the API's
# OOXML/OLE/external-resource validator; macros and untrusted links stay blocked.
# https://github.com/LibreOffice/core/blob/master/officecfg/registry/schema/org/openoffice/Office/Common.xcs
PROFILE_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
 <item oor:path="/org.openoffice.Office.Common/Security/Scripting">
  <prop oor:name="MacroSecurityLevel" oor:op="fuse" oor:finalized="true"><value>3</value></prop>
  <prop oor:name="DisableMacrosExecution" oor:op="fuse" oor:finalized="true"><value>true</value></prop>
  <prop oor:name="DisableActiveContent" oor:op="fuse" oor:finalized="true"><value>false</value></prop>
  <prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse" oor:finalized="true"><value>true</value></prop>
  <prop oor:name="SecureURL" oor:op="fuse" oor:finalized="true"><value/></prop>
 </item>
</oor:items>
'''


class ConversionError(Exception):
    def __init__(self, status=422):
        self.status = status


class ClientDisconnected(Exception):
    pass


class CleanupError(Exception):
    """Unknown child/temporary state must make the worker unavailable."""


def become_subreaper():
    """Reap orphaned grandchildren in the killed job group, not only soffice."""
    if not sys.platform.startswith('linux'):
        raise RuntimeError('Linux is required')
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise RuntimeError('Cannot enable child reaping')


def peer_disconnected(connection):
    try:
        readable, _, exceptional = select.select([connection], [], [connection], 0)
        if exceptional:
            return True
        if readable:
            return not connection.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT)
        return False
    except (OSError, ValueError):
        return True


def stop_and_reap(process):
    """Kill the entire original group, including children after a normal exit."""
    pgid = process.pid
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except OSError as exc:
        raise CleanupError() from exc
    try:
        process.wait(timeout=REAP_SECONDS)
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise CleanupError() from exc
    deadline = time.monotonic() + REAP_SECONDS
    while True:
        # Subreaper adoption can occur just after the leader is reaped.
        try:
            while os.waitpid(-pgid, os.WNOHANG)[0]:
                pass
        except ChildProcessError:
            pass
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return
        if time.monotonic() >= deadline:
            raise CleanupError()
        time.sleep(0.01)


def office_command(binary, profile, source, output):
    return [str(binary), '-env:UserInstallation=' + profile.as_uri(), '--headless',
            '--nologo', '--nodefault', '--nofirststartwizard', '--nolockcheck',
            '--convert-to', 'pdf:impress_pdf_Export', '--outdir', str(output), str(source)]


def office_environment(job):
    # Do not give the converter API credentials, proxy settings, or the worker's
    # original environment. Fontconfig may use the image's read-only font paths.
    return {'PATH': '/usr/bin:/bin', 'HOME': str(job), 'TMPDIR': str(job),
            'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'SAL_USE_VCLPLUGIN': 'svp',
            'XDG_CACHE_HOME': str(job / 'cache'), 'XDG_CONFIG_HOME': str(job / 'config')}


def read_pdf(path):
    try:
        # fstat comes after open: a malicious FIFO would otherwise block forever
        # before its non-regular type can be rejected. Nonblocking is immaterial
        # for normal PDF files and keeps this output boundary bounded.
        descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)
                             | getattr(os, 'O_NONBLOCK', 0))
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_BYTES:
                raise ConversionError()
            data = stream.read(MAX_BYTES + 1)
    except OSError as exc:
        raise ConversionError() from exc
    if len(data) > MAX_BYTES or not data.startswith(b'%PDF-') or b'%%EOF' not in data[-1024:]:
        raise ConversionError()
    return data


class OfficeRunner:
    """Inject command/expiry callables in tests; main() always uses fixed defaults."""
    def __init__(self, jobs_root=JOBS_ROOT, binary=SOFFICE, *, command=office_command,
                 expired=None):
        self.jobs_root = Path(jobs_root)
        self.binary = Path(binary)
        self.command = command
        self.expired = expired or (lambda started: time.monotonic() - started >= JOB_SECONDS)

    def ready(self):
        return self.binary.is_file() and os.access(self.binary, os.X_OK)

    def __call__(self, data, disconnected):
        if not self.ready():
            raise ConversionError(503)
        if not 0 < len(data) <= MAX_BYTES:
            raise ConversionError(413)
        if not data.startswith(b'PK\x03\x04'):
            raise ConversionError(415)
        job = Path(tempfile.mkdtemp(prefix='job-', dir=self.jobs_root))
        process = None
        try:
            source, output, profile = job / 'document.pptx', job / 'output', job / 'profile'
            output.mkdir(mode=0o700)
            (profile / 'user').mkdir(parents=True, mode=0o700)
            (profile / 'user' / 'registrymodifications.xcu').write_text(PROFILE_XML, encoding='utf-8')
            source.write_bytes(data)
            if disconnected():
                raise ClientDisconnected()
            started = time.monotonic()
            process = subprocess.Popen(self.command(self.binary, profile, source, output),
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                cwd=job, env=office_environment(job), start_new_session=True, close_fds=True)
            while process.poll() is None:
                if disconnected():
                    raise ClientDisconnected()
                if self.expired(started):
                    raise ConversionError(504)
                time.sleep(POLL_SECONDS)
            code = process.returncode
            stop_and_reap(process)
            process = None
            if disconnected():
                raise ClientDisconnected()
            if code:
                raise ConversionError()
            return read_pdf(output / 'document.pdf')
        except OSError as exc:
            raise ConversionError(503) from exc
        finally:
            try:
                if process is not None:
                    stop_and_reap(process)
            finally:
                try:
                    shutil.rmtree(job)
                except OSError as exc:
                    raise CleanupError() from exc


class WorkerHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    server_version = 'BilgePdf'
    sys_version = ''

    def setup(self):
        self.request.settimeout(HEADER_SECONDS)
        super().setup()

    def log_message(self, *_args):
        pass  # Paths, input and exceptions never enter access logs.

    def reply(self, status, data=b'', content_type='text/plain'):
        self.close_connection = True
        try:
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            pass

    def send_error(self, code, message=None, explain=None):
        # BaseHTTPRequestHandler normally reflects arbitrary method/path text.
        self.reply(code, b'Request rejected\n')

    def do_GET(self):
        if self.path != '/health':
            self.reply(404, b'Not found\n')
        elif self.server.stopping.is_set() or self.server.unhealthy.is_set() or not self.server.ready():
            self.reply(503, b'Unavailable\n')
        else:
            self.reply(200, b'Ready\n')

    def do_POST(self):
        if self.path != '/convert':
            self.reply(404, b'Not found\n')
            return
        if self.server.stopping.is_set() or self.server.unhealthy.is_set() or not self.server.ready():
            self.reply(503, b'Unavailable\n')
            return
        lengths = self.headers.get_all('Content-Length', [])
        types = self.headers.get_all('Content-Type', [])
        if (self.headers.get_all('Transfer-Encoding') or self.headers.get_all('Content-Encoding')
                or len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit()
                or len(lengths[0]) > 12):
            self.reply(400, b'Invalid request\n')
            return
        length = int(lengths[0])
        if not 0 < length <= MAX_BYTES:
            self.reply(413, b'Invalid size\n')
            return
        if len(types) != 1 or types[0] != PPTX_TYPE:
            self.reply(415, b'Unsupported type\n')
            return
        if not self.server.job_lock.acquire(blocking=False):
            self.reply(429, b'Busy\n')
            return
        try:
            # An earlier request can fail cleanup after our first health check
            # but before this lock is acquired. Never admit a job on that stale
            # observation; unhealthy/stop are monotonic within this process.
            if (self.server.stopping.is_set() or self.server.unhealthy.is_set()
                    or not self.server.ready()):
                self.reply(503, b'Unavailable\n')
                return
            data = bytearray()
            deadline = time.monotonic() + UPLOAD_SECONDS
            while len(data) < length:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ConversionError(408)
                self.connection.settimeout(remaining)
                block = self.rfile.read1(min(65536, length - len(data)))
                if not block:
                    raise ClientDisconnected()
                data.extend(block)
            self.connection.settimeout(HEADER_SECONDS)
            result = self.server.run_job(bytes(data),
                lambda: self.server.stopping.is_set() or peer_disconnected(self.connection))
            self.reply(200, result, 'application/pdf')
        except ClientDisconnected:
            pass
        except TimeoutError:
            self.reply(408, b'Upload timed out\n')
        except ConversionError as exc:
            self.reply(exc.status, b'Conversion unavailable\n')
        except CleanupError:
            self.server.unhealthy.set()
            self.reply(503, b'Unavailable\n')
        except Exception:
            self.server.unhealthy.set()
            self.reply(503, b'Unavailable\n')
        finally:
            self.server.job_lock.release()


class WorkerServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    # This is an AF_UNIX stream server, never AF_INET. Using TCPServer's common
    # stream implementation lets pure helper tests import the module on Windows.
    address_family = getattr(socket, 'AF_UNIX', -1)
    daemon_threads = False
    request_queue_size = MAX_CONNECTIONS

    def __init__(self, path, run_job, ready):
        if not sys.platform.startswith('linux'):
            raise RuntimeError('Linux Unix sockets are required')
        self.run_job, self.ready = run_job, ready
        self.job_lock = threading.Lock()
        self.unhealthy = threading.Event()
        self.stopping = threading.Event()
        self.connections = threading.BoundedSemaphore(MAX_CONNECTIONS)
        self.active_connections = set()
        self.active_lock = threading.Lock()
        super().__init__(str(path), WorkerHandler)

    def process_request(self, request, client_address):
        if not self.connections.acquire(blocking=False):
            # No unbounded extra thread and no blocking response to a slow peer.
            self.shutdown_request(request)
            return
        with self.active_lock:
            self.active_connections.add(request)
        try:
            super().process_request(request, client_address)
        except Exception:
            with self.active_lock:
                self.active_connections.discard(request)
            self.connections.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            with self.active_lock:
                self.active_connections.discard(request)
            self.connections.release()

    def request_stop(self):
        """Called outside serve_forever's thread; cancel/reap jobs before close."""
        self.stopping.set()
        with self.active_lock:
            for connection in self.active_connections:
                try:
                    connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
        self.shutdown()

    def handle_error(self, request, client_address):
        pass


def health_check():
    """Container health check: socket/binary availability, not conversion fidelity."""
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(2)
            connection.connect(str(SOCKET_PATH))
            connection.sendall(b'GET /health HTTP/1.0\r\nHost: worker\r\n\r\n')
            response = http.client.HTTPResponse(connection)
            response.begin()
            return 0 if response.status == 200 and response.read(64) == b'Ready\n' else 1
    except (OSError, http.client.HTTPException):
        return 1


def own_socket_directory(path):
    """Hold an exclusive process lock; remove only a proven stale owned socket.

    Caller owns the returned descriptor until server shutdown. A second worker
    can neither unlink the active socket nor silently replace arbitrary files.
    """
    import fcntl  # Linux-only main; helper module remains importable on Windows.
    lock_path = path.parent / '.worker.lock'
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1:
            raise RuntimeError('Invalid worker lock')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            old = path.lstat()
        except FileNotFoundError:
            return descriptor
        if not stat.S_ISSOCK(old.st_mode) or old.st_uid != os.geteuid() or old.st_gid != os.getegid():
            raise RuntimeError('Invalid existing socket')
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
            probe.settimeout(1)
            try:
                probe.connect(str(path))
            except OSError as exc:
                if exc.errno not in {errno.ECONNREFUSED, errno.ENOENT}:
                    raise RuntimeError('Socket state is unknown') from exc
            else:
                raise RuntimeError('Socket is active')
        current = path.lstat()
        if (current.st_dev, current.st_ino) != (old.st_dev, old.st_ino):
            raise RuntimeError('Socket changed during validation')
        path.unlink()
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def main():
    if os.geteuid() != 1000 or os.getegid() != 10001:
        raise SystemExit('Worker identity is not configured')
    os.umask(0o077)
    become_subreaper()
    directory = SOCKET_PATH.parent
    info = directory.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_gid != 10001
            or info.st_uid != 1000 or stat.S_IMODE(info.st_mode) != 0o750):
        raise SystemExit('Socket directory is not configured')
    JOBS_ROOT.mkdir(mode=0o700, exist_ok=True)
    jobs_info = JOBS_ROOT.lstat()
    if (not stat.S_ISDIR(jobs_info.st_mode) or jobs_info.st_uid != 1000
            or stat.S_IMODE(jobs_info.st_mode) != 0o700 or any(JOBS_ROOT.iterdir())):
        raise SystemExit('Job directory is not clean')
    runner = OfficeRunner()
    if not runner.ready():
        raise SystemExit('Converter is unavailable')
    lock = own_socket_directory(SOCKET_PATH)
    try:
        with WorkerServer(SOCKET_PATH, runner, runner.ready) as server:
            os.chown(SOCKET_PATH, 1000, 10001)
            os.chmod(SOCKET_PATH, 0o660)
            socket_info = SOCKET_PATH.lstat()
            stop_started = threading.Event()
            def stop_signal(_signum, _frame):
                if not stop_started.is_set():
                    stop_started.set()
                    threading.Thread(target=server.request_stop, daemon=True).start()
            signal.signal(signal.SIGTERM, stop_signal)
            signal.signal(signal.SIGINT, stop_signal)
            try:
                server.serve_forever(poll_interval=0.1)
            finally:
                try:
                    current = SOCKET_PATH.lstat()
                    if (current.st_dev, current.st_ino) == (socket_info.st_dev, socket_info.st_ino):
                        SOCKET_PATH.unlink()
                except FileNotFoundError:
                    pass
    finally:
        os.close(lock)


if __name__ == '__main__':
    if sys.argv[1:] == ['health']:
        raise SystemExit(health_check())
    if sys.argv[1:]:
        raise SystemExit('Unsupported argument')
    main()
