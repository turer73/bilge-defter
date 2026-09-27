"""Offline safety checks; no Docker, network or production access."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('repair-v64-rollback.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def web():
    return {'Image': r.IMAGE, 'Config': {'Env': ['SAFE=1'], 'Cmd': ['nginx']},
            'HostConfig': {'ReadonlyRootfs': True, 'Privileged': False, 'AutoRemove': False,
                'NetworkMode': 'bilge-defter-classroom', 'Memory': 134217728,
                'NanoCpus': 500000000, 'PidsLimit': 100, 'CapDrop': ['ALL'],
                'SecurityOpt': ['no-new-privileges:true'],
                'PortBindings': {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18790'}]}},
            'Mounts': [{'Type': 'bind', 'Source': str(r.PRIOR / 'ui'),
                        'Destination': '/usr/share/nginx/html', 'RW': False},
                       {'Type': 'bind', 'Source': str(r.PRIOR / 'classroom-nginx.conf'),
                        'Destination': '/etc/nginx/conf.d/default.conf', 'RW': False}]}


class Safety(unittest.TestCase):
    def test_expected_web(self):
        r.validate_web(web(), r.PRIOR)

    def test_reject_unsafe_flags(self):
        for key, value in [('ReadonlyRootfs', False), ('Privileged', True), ('AutoRemove', True),
                           ('Memory', 0), ('PidsLimit', 0), ('CapDrop', [])]:
            c = web()
            c['HostConfig'][key] = value
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                r.validate_web(c, r.PRIOR)

    def test_reject_writable_and_extra_mount(self):
        c = web()
        c['Mounts'][0]['RW'] = True
        with self.assertRaises(RuntimeError):
            r.validate_web(c, r.PRIOR)
        c = web()
        c['Mounts'].append({'Type': 'bind', 'Source': '/data', 'Destination': '/data', 'RW': False})
        with self.assertRaises(RuntimeError):
            r.validate_web(c, r.PRIOR)

    def test_reject_wrong_release(self):
        with self.assertRaises(RuntimeError):
            r.validate_web(web(), r.LIVE)

    def test_loopback_only(self):
        c = web()
        self.assertTrue(r.ports(c, 18790))
        self.assertFalse(r.ports(c, 18805))
        c['HostConfig']['PortBindings']['80/tcp'][0]['HostIp'] = '0.0.0.0'
        self.assertFalse(r.ports(c, 18790))

    def test_clone_target_allowlist_before_docker(self):
        with patch.object(r, 'inspect') as inspect:
            with self.assertRaises(RuntimeError):
                r.create_web(web(), r.WEB, 18790)
            inspect.assert_not_called()

    def test_existing_container_not_overwritten(self):
        with patch.object(r, 'inspect', return_value=web()), patch.object(r, 'run') as run:
            with self.assertRaises(RuntimeError):
                r.create_web(web(), r.BACK, 18790)
            run.assert_not_called()

    def test_signature_preserves_environment_and_security(self):
        c = web()
        other = copy.deepcopy(c)
        other['Config']['Env'] = ['SAFE=2']
        self.assertNotEqual(r.signature(c), r.signature(other))
        other = copy.deepcopy(c)
        other['HostConfig']['SecurityOpt'] = []
        self.assertNotEqual(r.signature(c), r.signature(other))

    def test_cutover_requires_explicit_flag(self):
        with patch.object(r, 'check') as check:
            with self.assertRaises(RuntimeError):
                r.rollback('')
            check.assert_not_called()

    def test_cutover_preflight_failure_never_runs_command(self):
        with patch.object(r, 'check', side_effect=RuntimeError('stale')), patch.object(r, 'run') as run:
            with self.assertRaises(RuntimeError):
                r.rollback('--confirm-v64-to-v63')
            run.assert_not_called()

    def test_records_never_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'proof.json'
            r.write_new(file, {'first': True})
            with self.assertRaises(FileExistsError):
                r.write_new(file, {'first': False})
            self.assertEqual(r.load(file), {'first': True})


if __name__ == '__main__':
    unittest.main()
