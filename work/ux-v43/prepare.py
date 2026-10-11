#!/usr/bin/env python3
"""Build an isolated UI candidate from a complete, verified v43 distribution.
No in-place patching, Git writes, deployment, or browser-data access.
"""
import argparse
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path, PurePosixPath

BASE_COMMIT = 'eaa8fae9c243e02b0d9fff2f3b0702379b26a6c6'
EXPECTED = {
    'index.html': '6423c312fc551006a6d624d458e89b54f77a855b',
    'pwa.js': 'd56311ef8bbeb8631ab0189f81f86b163f9e4147',
    'sw.js': '387425e39808308db77cdd75dfdc4c5e97c17ff6',
    'ui-workspace.js': '26767850b2107e56628f50e93208d1d6f85b865e',
}
ASSETS = ('ux-button-theme.js', 'ux-button-theme.css', 'ux-workspace.js', 'ux-workspace.css')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def safe_path(name):
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError('Invalid asset path')
    path = PurePosixPath(name)
    if path.is_absolute() or any(p in ('..', '.') for p in name.split('/')) or ':' in name:
        raise ValueError('Unsafe asset path: ' + name)
    if str(path) != name:
        raise ValueError('Non-canonical asset path: ' + name)
    return name


def verified_sources(source):
    source = source.resolve(strict=True)
    manifest = json.loads((source / 'offline-assets.json').read_text(encoding='utf-8'))
    release = json.loads((source / 'release.json').read_text(encoding='utf-8'))
    if manifest.get('version') != 'v43' or release.get('version') != 'v43':
        raise ValueError('This adapter targets v43 only; no downgrade is allowed.')
    if not isinstance(manifest.get('files'), list) or not manifest['files']:
        raise ValueError('Empty offline manifest')
    data, errors = {}, []
    for entry in manifest['files']:
        name = safe_path(entry['path'])
        if name in data or name in ('offline-assets.json', 'SHA256SUMS'):
            raise ValueError('Duplicate or self-referential manifest entry: ' + name)
        file = source / name
        if not re.fullmatch(r'[0-9a-f]{64}', entry.get('sha256', '')):
            raise ValueError('Invalid checksum: ' + name)
        if not file.is_file():
            errors.append('MISSING ' + name)
            continue
        if file.is_symlink() or not file.resolve().is_relative_to(source):
            raise ValueError('Symlink/escaped asset refused: ' + name)
        raw = file.read_bytes()
        if sha256(raw) != entry['sha256']:
            errors.append('HASH MISMATCH ' + name)
        data[name] = raw
    for name in ('ui.css', *EXPECTED):
        if name not in data:
            errors.append('REQUIRED ' + name)
    for name, digest in EXPECTED.items():
        if name in data and git_blob(data[name]) != digest:
            errors.append('NOT PINNED v43 ' + name)
    # Some historical manifests did not include every late-loaded module.
    # Require them explicitly; never emit a candidate with broken script references.
    index = data.get('index.html', b'').decode('utf-8')
    local_refs = re.findall(r'<script\b[^>]*\bsrc="([^"?#]+)(?:[?#][^"]*)?"', index)
    for name in local_refs:
        if '://' in name or name.startswith('//'):
            continue
        name = safe_path(name.removeprefix('./'))
        if name not in data:
            errors.append('UNMANIFESTED SCRIPT ' + name)
    if errors:
        raise ValueError('Release preflight failed; no output written:\n' + '\n'.join(errors))
    return data


def candidate(data, version):
    if not re.fullmatch(r'v[1-9][0-9]*', version) or int(version[1:]) <= 43:
        raise ValueError('Use a new release number greater than v43.')
    output = dict(data)
    index = output['index.html'].decode('utf-8')
    if 'ux-workspace.js' in index:
        raise ValueError('Adapter already installed')
    badge = '<span class="badge">v43</span>'
    anchor = '<script src="ui-workspace.js"></script>'
    if index.count(badge) != 1 or index.count(anchor) != 1 or index.count('</head>') != 1:
        raise ValueError('Unexpected v43 HTML layout; original source unchanged.')
    index = index.replace(badge, f'<span class="badge">{version}</span>')
    index = index.replace('</head>', '<link rel="stylesheet" href="ux-button-theme.css">\n<link rel="stylesheet" href="ux-workspace.css">\n</head>')
    index = index.replace(anchor, anchor + '\n<script src="ux-button-theme.js"></script>\n<script src="ux-workspace.js"></script>')
    output['index.html'] = index.encode('utf-8')
    worker = output['sw.js'].decode('utf-8')
    worker, count = re.subn(r"\bconst\s+VERSION\s*=\s*(['\"])v43\1", "const VERSION='" + version + "'", worker)
    if count != 1:
        raise ValueError('Unexpected service worker version declaration')
    output['sw.js'] = worker.encode('utf-8')
    release = json.loads(output['release.json'])
    release['version'] = version
    output['release.json'] = json.dumps(release, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    for name in ASSETS:
        output[name] = (Path(__file__).parent / 'assets' / name).read_bytes()
    manifest = {'version': version, 'files': [{'path': name, 'sha256': sha256(raw)} for name, raw in sorted(output.items())]}
    output['offline-assets.json'] = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    output['SHA256SUMS'] = ''.join(sha256(raw) + '  ' + name + '\n' for name, raw in sorted(output.items())).encode('utf-8')
    # Preserve login detection, silent update checks, storage and every original module.
    for name, raw in data.items():
        if name not in ('index.html', 'sw.js', 'release.json') and output[name] != raw:
            raise AssertionError('Unexpected engine modification: ' + name)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Complete v43 work/bilge-defter-test directory')
    parser.add_argument('--check', action='store_true', help='Read-only integrity check')
    parser.add_argument('--output', type=Path, help='New, non-existent candidate directory')
    parser.add_argument('--version', default='v44')
    args = parser.parse_args()
    try:
        data = verified_sources(args.source)
        if args.check:
            print(f'PASS: {len(data)} assets verified. No files changed.')
            return 0
        if args.output is None:
            parser.error('Use --check or --output NEW_DIRECTORY')
        destination = args.output.resolve()
        source = args.source.resolve()
        if destination.exists() or destination == source or destination.is_relative_to(source):
            raise ValueError('Output must be new and outside the original application directory.')
        output = candidate(data, args.version)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.bilge-ux-', dir=destination.parent) as temp:
            stage = Path(temp) / 'candidate'
            stage.mkdir()
            for name, raw in output.items():
                file = stage / safe_path(name)
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(raw)
            # Directory rename fails if the destination was populated concurrently.
            if destination.exists():
                raise ValueError('Output appeared during preparation; refusing replacement.')
            stage.rename(destination)
        print(f'Created {args.version} candidate: {destination}. Original v43 unchanged. NOT DEPLOYED.')
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
