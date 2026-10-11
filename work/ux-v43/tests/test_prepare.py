import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).parents[1] / 'prepare.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data = {
            'index.html': b'<html><head></head><body><span class="badge">v43</span><script src="pwa.js"></script><script src="ui-workspace.js"></script></body></html>',
            'sw.js': b"const VERSION='v43';\n// no skipWaiting",
            'pwa.js': b'// login detection and daily update remain unchanged',
            'ui-workspace.js': b'// original v43 chrome',
            'ui.css': b'body{color:black}',
            'release.json': b'{"version":"v43"}',
            'vendor/sample.dat': b'EXAMPLE ONLY',
        }
        # Explicit synthetic fixture pins; not a claim to run the real v43 distribution.
        self.pins = p.EXPECTED
        p.EXPECTED = {name: p.git_blob(self.data[name]) for name in self.pins}
        self.write()

    def tearDown(self):
        p.EXPECTED = self.pins
        self.temp.cleanup()

    def write(self):
        for name, data in self.data.items():
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
        manifest = {'version': 'v43', 'files': [{'path': name, 'sha256': p.sha256(data)} for name, data in self.data.items()]}
        (self.root / 'offline-assets.json').write_text(json.dumps(manifest))

    def test_missing_styles_refuses_preflight(self):
        (self.root / 'ui.css').unlink()
        with self.assertRaisesRegex(ValueError, 'MISSING ui.css'):
            p.verified_sources(self.root)

    def test_tampered_module_refused(self):
        (self.root / 'pwa.js').write_text('other code')
        with self.assertRaisesRegex(ValueError, 'HASH MISMATCH'):
            p.verified_sources(self.root)

    def test_path_escape_refused(self):
        for name in ['../secret', '/tmp/a', 'a/../secret', 'a//b', 'C:/a', 'a\\b']:
            with self.assertRaises(ValueError):
                p.safe_path(name)

    def test_future_version_refused_as_input(self):
        (self.root / 'release.json').write_text('{"version":"v45"}')
        with self.assertRaises(ValueError):
            p.verified_sources(self.root)

    def test_downgrade_refused_as_output(self):
        for version in ['v42', 'v43', 'wrong']:
            with self.assertRaises(ValueError):
                p.candidate(self.data, version)

    def test_all_candidate_digests_match(self):
        result = p.candidate(p.verified_sources(self.root), 'v44')
        manifest = json.loads(result['offline-assets.json'])
        self.assertEqual(manifest['version'], 'v44')
        for entry in manifest['files']:
            self.assertEqual(p.sha256(result[entry['path']]), entry['sha256'])
        for line in result['SHA256SUMS'].decode().splitlines():
            digest, name = line.split('  ', 1)
            self.assertEqual(digest, p.sha256(result[name]))

    def test_original_engine_and_input_unchanged(self):
        snapshot = dict(self.data)
        result = p.candidate(self.data, 'v44')
        self.assertEqual(snapshot, self.data)
        for name in ['pwa.js', 'ui-workspace.js', 'vendor/sample.dat', 'ui.css']:
            self.assertEqual(result[name], self.data[name])
        self.assertIn(b'<span class="badge">v44</span>', result['index.html'])
        self.assertIn(b"const VERSION='v44'", result['sw.js'])

    def test_unmanifested_script_refused(self):
        self.data['index.html'] += b'<script src="missing.js"></script>'
        p.EXPECTED['index.html'] = p.git_blob(self.data['index.html'])
        self.write()
        with self.assertRaisesRegex(ValueError, 'UNMANIFESTED SCRIPT'):
            p.verified_sources(self.root)

    def test_second_install_refused(self):
        result = p.candidate(self.data, 'v44')
        with self.assertRaises(ValueError):
            p.candidate(result, 'v45')


if __name__ == '__main__':
    unittest.main(verbosity=2)
