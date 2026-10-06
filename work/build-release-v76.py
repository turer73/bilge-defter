"""Build one immutable, web-only v76 payload. Never packages notebooks or API code."""
import base64
import gzip
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/direct-pptx-release-v76/package'
PRIOR_UI = '52fc08547724935d63718d0b092e39221171565facd8d77d748e68cfa30a0c8f'
PRIOR_NGINX = '644511c8b1da01f7afb3d08483babab22192070c210936d1108eb0b12fc42ed1'
WEB_IMAGE = 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'
SCRIPTS = ['deploy-v76.py', 'verify-publication-v76.py']
PPTX_FILES = {'host.js', 'host.css', 'model.js', 'store.js', 'renderer-bridge.js', 'renderer-frame.html', 'NOTICES.txt'}
BEGIN = '  # BEGIN v76 direct-pptx exact routes\n'
END = '  # END v76 direct-pptx exact routes\n'


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Frame(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.csp, self.scripts, self.active = [], [], False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            self.csp.append(attrs.get('content'))
        if tag == 'script':
            need(not attrs and not self.active, 'Frame must contain inline classic scripts only')
            self.scripts.append('')
            self.active = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.scripts[-1] += data


def frame_csp(frame, provenance):
    parser = Frame()
    parser.feed(frame.decode('utf-8'))
    need(not parser.active and len(parser.scripts) == 2 and len(parser.csp) == 1, 'Incomplete frame scripts/CSP')
    hashes = ['sha256-' + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() for s in parser.scripts]
    csp = "default-src 'none'; script-src " + ' '.join("'" + value + "'" for value in hashes) + "; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; font-src data: blob:; media-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
    need(parser.csp == [csp], 'Frame CSP is not exactly the two script hashes and deny-network policy')
    need(provenance.get('frameHtmlSha256') == sha(frame) and provenance.get('csp') == csp and
         provenance.get('runtimeIntegrity') == hashes[0] and provenance.get('frameIntegrity') == hashes[1],
         'Frame provenance mismatch')
    return csp


def derive_nginx(original, csp):
    need(sha(original) == PRIOR_NGINX, 'Canonical nginx differs from reviewed v75 baseline')
    text = original.decode('utf-8')
    need(BEGIN not in text and text.count('  location / { return 404; }') == 1, 'Unexpected nginx route structure')
    need('"' not in csp and '$' not in csp and '\n' not in csp and '\r' not in csp, 'Unsafe CSP')
    lines = [BEGIN,
        '  location = /pptx-workspace.js { try_files $uri =404; }\n']
    for name in sorted(PPTX_FILES - {'renderer-frame.html'}):
        lines.append('  location = /pptx/' + name + ' { try_files $uri =404; }\n')
    lines.extend([
        '  location = /pptx/renderer-frame.html {\n',
        '    try_files $uri =404;\n',
        # Defining a local header replaces nginx parent add_header inheritance.
        '    add_header X-Content-Type-Options nosniff always;\n',
        '    add_header Referrer-Policy no-referrer always;\n',
        '    add_header Cache-Control "private, no-store, no-transform" always;\n',
        '    add_header Content-Security-Policy "' + csp + '" always;\n',
        '  }\n', END])
    block = ''.join(lines)
    updated = text.replace('  location / { return 404; }', block + '  location / { return 404; }').encode()
    need(updated.replace(block.encode(), b'', 1) == original, 'Nginx auth/proxy/rate-limit bytes changed')
    return updated


def build():
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    need(re.fullmatch('[0-9a-f]{40}', commit), 'Immutable Git commit required')
    scope = ['work/bilge-defter-test', 'work/pptx-pilot', 'work/build-invited.cjs',
             'tools/prepare-pptx-pilot.cjs', 'work/classroom-nginx.conf',
             'work/build-release-v76.py', 'work/test_deploy_v76.py', 'docs/RELEASE_V76.md'] + ['work/' + s for s in SCRIPTS]
    need(not subprocess.check_output(['git', 'status', '--porcelain', '--'] + scope, cwd=ROOT).strip(),
         'Commit release sources before packaging')

    def git(name):
        return subprocess.check_output(['git', 'show', commit + ':' + name], cwd=ROOT)

    paths = {name: git('work/' + name) for name in SCRIPTS}
    ui = ROOT / 'work/bilge-defter-invited-v76'
    sums = (ui / 'SHA256SUMS').read_bytes()
    names = set()
    for line in sums.decode().splitlines():
        digest, name = line.split(maxsplit=1)
        need(not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name and ':' not in name,
             'Unsafe UI path')
        need(name not in names and name != 'SHA256SUMS', 'Duplicate/self UI manifest entry')
        names.add(name)
        data = (ui / name).read_bytes()
        need(sha(data) == digest and data == git('work/bilge-defter-test/' + name), 'UI differs from committed source: ' + name)
        paths['ui/' + name] = data
    need({n.removeprefix('pptx/') for n in names if n.startswith('pptx/')} == PPTX_FILES,
         'PPTX public files must be exactly the six production assets and license notices')
    need('pptx-workspace.js' in names, 'Missing PPTX entry integration')
    need(json.loads(paths['ui/release.json']) == {'version': 'v76'}, 'Wrong UI version')
    offline = json.loads(paths['ui/offline-assets.json'])
    need(len({item['path'] for item in offline['files']}) == len(offline['files']), 'Duplicate offline asset')
    need(offline['version'] == 'v76' and {'pptx/' + n for n in PPTX_FILES} | {'pptx-workspace.js'} <=
         {item['path'] for item in offline['files']}, 'PPTX assets missing from offline package')
    for item in offline['files']:
        need(item['path'] in names and item['sha256'] == sha(paths['ui/' + item['path']]), 'Offline asset mismatch')
    paths['ui/SHA256SUMS'] = sums
    provenance = json.loads(git('work/pptx-pilot/vendor/PROVENANCE.json'))
    csp = frame_csp(paths['ui/pptx/renderer-frame.html'], provenance)
    paths['classroom-nginx.conf'] = derive_nginx(git('work/classroom-nginx.conf'), csp)
    receipt = {'package': 'v76', 'commit': commit, 'scope': 'web-only',
               'prior': {'version': 'v75', 'ui_manifest_sha256': PRIOR_UI, 'nginx_sha256': PRIOR_NGINX},
               'web_image': WEB_IMAGE, 'ui_manifest_sha256': sha(sums), 'frame_csp': csp,
               'frame_sha256': provenance['frameHtmlSha256'], 'files': {name: sha(data) for name, data in paths.items()}}
    paths['source-receipt.json'] = (json.dumps(receipt, indent=2, sort_keys=True) + '\n').encode()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ('payload.tar.gz', 'source-receipt.json'):
        need(not (OUT / name).exists(), 'Output exists; use a fresh reviewed package directory')
    with (OUT / 'payload.tar.gz').open('xb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped, tarfile.open(fileobj=zipped, mode='w') as archive:
        for name, data in sorted(paths.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o644, 0
            archive.addfile(info, io.BytesIO(data))
    (OUT / 'source-receipt.json').write_bytes(paths['source-receipt.json'])
    print(json.dumps({'commit': commit, 'scope': 'web-only', 'files': len(paths), 'ui_files': len(names),
                      'payload_sha256': sha((OUT / 'payload.tar.gz').read_bytes()), 'output': str(OUT)}))


if __name__ == '__main__':
    build()
