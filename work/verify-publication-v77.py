"""Read-only, anonymous origin body verification. No student/account/notebook writes."""
import hashlib
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def verify(root, port, version='v77', frame_csp=None):
    need(version in {'v76', 'v77'} and 0 < port < 65536, 'Unsupported verification target')

    def get(path, headers=None):
        try:
            with urlopen(Request(f'http://127.0.0.1:{port}' + path,
                    headers={'Host': 'defter.bilgearena.com', **(headers or {})}), timeout=15) as response:
                return response.status, response.read(), response.headers
        except HTTPError as error:
            with error:
                return error.code, error.read(), error.headers

    count, names = 0, set()
    for line in (root / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        need(not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name and name not in names,
             'Unsafe/duplicate manifest entry')
        names.add(name)
        code, body, headers = get('/' + name)
        need(code == 200 and hashlib.sha256(body).hexdigest() == digest, 'HTTP body mismatch: ' + name)
        need('no-store' in headers.get('Cache-Control', '') and headers.get('X-Content-Type-Options') == 'nosniff',
             'Missing cache/content-type safeguards: ' + name)
        if name == 'pptx/renderer-frame.html':
            need(frame_csp and headers.get('Content-Security-Policy') == frame_csp, 'Frame HTTP CSP mismatch')
            need('text/html' in headers.get('Content-Type', ''), 'Frame MIME mismatch')
        count += 1
    need(count >= 238 and json.loads(get('/release.json')[1]) == {'version': version}, 'Wrong/incomplete release')
    manifest = json.loads(get('/offline-assets.json')[1])
    need(manifest['version'] == version, 'Wrong offline version')
    offline_names = set()
    for asset in manifest['files']:
        name = asset['path']
        need(name in names and name not in offline_names and hashlib.sha256((root / name).read_bytes()).hexdigest() == asset['sha256'],
             'Offline manifest mismatch')
        offline_names.add(name)
    if version in {'v76', 'v77'}:
        required = {'pptx/' + n for n in ('host.js', 'host.css', 'model.js', 'store.js', 'renderer-bridge.js', 'renderer-frame.html', 'NOTICES.txt')} | {'pptx-workspace.js'}
        need(required <= offline_names and {n for n in names if n.startswith('pptx/')} == required - {'pptx-workspace.js'},
             'Incomplete or overbroad PPTX publication')
    routes = ['/api/v1/bilge-defter/pdf-tools/status', '/api/v1/bilge-defter/admin/members',
              '/api/v1/bilge-defter/backup', '/api/v1/bilge-defter/dictionaries',
              '/api/v1/bilge-defter/dictionaries/tdk-gts-v12/search?q=kalp',
              '/library/', '/library/api/catalog', '/library/api/saved']
    rejections = 0
    for route in routes:
        for token in ('', 'invalid-test-token'):
            time.sleep(.3)
            code, body, _ = get(route, {'Cf-Access-Jwt-Assertion': token})
            need(code == 401 and isinstance(json.loads(body), dict), 'Anonymous gate changed: ' + route)
            rejections += 1
    blocked = ['/classroom.env', '/SHA256SUMS', '/tests/browser_server.py', '/health', '/api/test-login', '/library/healthz',
               '/pptx/', '/pptx/index.html', '/pptx/vendor/runtime.js', '/pptx/vendor/PROVENANCE.json',
               '/pptx/renderer-frame.js', '/pptx/store-tests.cjs', '/source-receipt.json', '/deploy-v76.py', '/deploy-v77.py']
    for route in blocked:
        time.sleep(.1)
        need(get(route)[0] == 404, 'Private/unpublished path exposed: ' + route)
    return {'version': version, 'http_hashes': count, 'offline_assets': len(offline_names),
            'auth_rejections': rejections, 'private_paths_blocked': len(blocked), 'student_data_accessed': False}


if __name__ == '__main__':
    root, port, version = Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    receipt = json.loads((root.parent / 'source-receipt.json').read_text())
    print(json.dumps(verify(root, port, version, receipt.get('frame_csp'))))
