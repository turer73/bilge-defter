"""Offline fake-Docker release contract tests; no network or real container changes."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy73', Path(__file__).with_name('deploy-v73.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
b = r.b


class Link:
    def __init__(self, target):
        self.target = target

    def is_symlink(self):
        return True

    def resolve(self):
        return self.target


class Deploy73(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.saved = r.ROOT, r.PRIOR, b.ROOT, b.PRIOR, b.CURRENT
        r.ROOT = b.ROOT = root / 'v73'
        r.PRIOR = b.PRIOR = root / 'v72'
        (r.ROOT / 'private').mkdir(parents=True)
        (r.ROOT / 'images.json').write_text(json.dumps({'accounts': 'new-api', 'verify': 'verify-api'}))
        self.link = Link(r.ROOT / 'ui')
        b.CURRENT = self.link
        host = {'ReadonlyRootfs': True, 'Privileged': False, 'RestartPolicy': {'Name': 'unless-stopped'},
                'Memory': 134217728, 'PidsLimit': 100, 'NanoCpus': 500000000, 'CapDrop': ['ALL'],
                'SecurityOpt': ['no-new-privileges:true'], 'Tmpfs': {'/tmp': 'rw'}}
        self.snapshots = {}
        for name, ident, image in [(b.API, 'prior-api', 'old-api'), (b.WEB, 'prior-web', b.WEBIMAGE)]:
            api = name == b.API
            self.snapshots[name + '.json'] = {
                'Id': ident, 'Image': image, 'NetworkSettings': {'Networks': {'bilge-defter-classroom': {}}},
                'HostConfig': copy.deepcopy(host), 'Config': {
                    'Env': ['AUTH=unchanged', 'BILGE_DEFTER_EDGE_SYNC=1', 'BILGE_DEFTER_DICT_DB=/dictionaries/bilge_defter_dictionary.db'],
                    'User': '10001:10001' if api else '', 'WorkingDir': '/srv' if api else '', 'Entrypoint': None,
                    'Cmd': ['uvicorn', 'app.main:app', '--workers', '1'] if api else ['nginx', '-g', 'daemon off;']},
                'Mounts': [
                    {'Type': 'bind', 'Source': '/data-original', 'Destination': '/data', 'RW': True},
                    {'Type': 'bind', 'Source': '/secrets-original', 'Destination': '/run/bilge-secrets', 'RW': False},
                    {'Type': 'bind', 'Source': '/dictionary-original', 'Destination': '/dictionaries', 'RW': False},
                ] if api else [
                    {'Type': 'bind', 'Source': str(r.PRIOR / 'ui'), 'Destination': '/usr/share/nginx/html', 'RW': False},
                    {'Type': 'bind', 'Source': str(r.PRIOR / 'classroom-nginx.conf'), 'Destination': '/etc/nginx/conf.d/default.conf', 'RW': False},
                ]}
        self.docker, self.calls, self.created, self.envs = {}, [], [], {}

        def run(*args, **kwargs):
            args = list(args)
            self.calls.append(args)
            if args[:2] == ['docker', 'create']:
                name = args[args.index('--name') + 1]
                self.created.append(args)
                self.envs[name] = Path(args[args.index('--env-file') + 1]).read_text().splitlines()
                self.docker[name] = {'Id': 'new-' + name}
            elif args[:2] == ['docker', 'rename']:
                self.docker[args[3]] = self.docker.pop(args[2])
            elif args[:2] == ['docker', 'rm']:
                self.docker.pop(args[2])
            return ''

        self.patches = [patch.object(b, 'run', run), patch.object(b, 'inspect', lambda name: self.docker.get(name)),
                        patch.object(b, 'load', lambda name: self.snapshots[name]),
                        patch.object(r, 'protected', lambda: {'unchanged': True}),
                        patch.object(r, 'health', lambda *args: None), patch.object(r, 'point', lambda path: None),
                        patch.object(r, 'verify_prior', lambda port=18790: {'version': 'v72'})]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        r.ROOT, r.PRIOR, b.ROOT, b.PRIOR, b.CURRENT = self.saved
        self.temp.cleanup()

    def created_for(self, name):
        return next(args for args in self.created if args[args.index('--name') + 1] == name)

    def test_fixture_copy_keeps_readonly_container_and_verifies_tmpfs_bytes(self):
        from subprocess import CompletedProcess
        fixture = r.ROOT / 'native-chart.pptx'
        fixture.write_bytes(b'PK synthetic')
        with patch.object(r.subprocess, 'run', return_value=CompletedProcess([], 0, (b.sha(fixture)+'\n').encode(), b'')) as run:
            r.copy_fixture(fixture)
        args, kwargs = run.call_args
        self.assertEqual(args[0][:4], ['docker', 'exec', '-i', b.API+'-preview-v73'])
        self.assertEqual(args[0][-1], 'native-chart.pptx')
        self.assertEqual(kwargs['input'], b'PK synthetic')
        self.assertNotIn('--privileged', args[0])
        with patch.object(r.subprocess, 'run', return_value=CompletedProcess([], 0, b'wrong', b'')):
            with self.assertRaises(RuntimeError): r.copy_fixture(fixture)
        with self.assertRaises(RuntimeError): r.copy_fixture(r.ROOT / 'unexpected.pptx')

    def test_new_api_adds_only_readonly_socket_and_pdf_env(self):
        r.clone(b.API, b.API)
        args = self.created_for(b.API)
        self.assertIn('new-api', args)
        self.assertIn('type=bind,src=' + str(r.ROOT / 'socket') + ',dst=/run/bilge-pdf,readonly', args)
        self.assertIn('type=bind,src=/data-original,dst=/data', args)
        self.assertIn('type=bind,src=/secrets-original,dst=/run/bilge-secrets,readonly', args)
        self.assertIn('type=bind,src=/dictionary-original,dst=/dictionaries,readonly', args)
        self.assertIn('AUTH=unchanged', self.envs[b.API])
        self.assertIn('BILGE_DEFTER_EDGE_SYNC=1', self.envs[b.API])
        self.assertEqual(sum(v.startswith('BILGE_DEFTER_PDF_') for v in self.envs[b.API]), 4)
        self.assertIn('--health-cmd', args)

    def test_prior_api_has_original_image_and_no_socket_or_pdf_gates(self):
        r.clone(b.API, b.API, prior=True)
        args = self.created_for(b.API)
        self.assertIn('old-api', args)
        self.assertNotIn('new-api', args)
        self.assertFalse(any('dst=/run/bilge-pdf' in arg for arg in args))
        self.assertFalse(any(v.startswith('BILGE_DEFTER_PDF_') for v in self.envs[b.API]))

    def test_preview_uses_fixture_image_and_no_live_data_or_secrets(self):
        with patch.object(r.os, 'chown', lambda *args: None, create=True):
            r.clone(b.API + '-preview-v73', b.API, preview=True)
        args = self.created_for(b.API + '-preview-v73')
        self.assertIn('verify-api', args)
        self.assertIn('/srv/tests/test_release_proxy_v73.py', args)
        self.assertFalse(any('/data-original' in arg or '/secrets-original' in arg for arg in args))
        self.assertNotIn('AUTH=unchanged', self.envs[b.API + '-preview-v73'])
        self.assertEqual(args[args.index('--restart') + 1], 'no')

    def test_rehearsal_api_uses_copy_no_secrets_or_edge_sync(self):
        copied = r.ROOT / 'rehearsal-data'
        r.clone(b.API + '-rehearsal-v73', b.API, prior=True, rehearsal_data=copied)
        args = self.created_for(b.API + '-rehearsal-v73')
        self.assertIn('old-api', args)
        self.assertIn('type=bind,src=' + str(copied) + ',dst=/data', args)
        self.assertFalse(any('/data-original' in arg or '/secrets-original' in arg or 'dst=/run/bilge-pdf' in arg for arg in args))
        self.assertIn('BILGE_DEFTER_EDGE_SYNC=0', self.envs[b.API + '-rehearsal-v73'])
        self.assertEqual(args[args.index('--restart') + 1], 'no')

    def test_prior_web_has_v72_mounts_and_loopback_rehearsal(self):
        r.clone(b.WEB + '-rehearsal-v73', b.WEB, prior=True, port=18806)
        args = self.created_for(b.WEB + '-rehearsal-v73')
        self.assertIn('type=bind,src=' + str(r.PRIOR / 'ui') + ',dst=/usr/share/nginx/html,readonly', args)
        self.assertIn('127.0.0.1:18806:80', args)
        self.assertEqual(args[args.index('--restart') + 1], 'no')

    def test_rollback_refuses_other_live_release_before_mutation(self):
        self.link.target = r.ROOT.parent / 'v99/ui'
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rollback_refuses_wrong_retained_identity_before_mutation(self):
        self.docker[b.API + '-rollback-v73'] = {'Id': 'unexpected'}
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rollback_restores_accounts_before_web_without_db_restore(self):
        self.docker = {b.API: {'Id': 'new-api'}, b.WEB: {'Id': 'new-web'},
                       b.API + '-rollback-v73': {'Id': 'prior-api'}, b.WEB + '-rollback-v73': {'Id': 'prior-web'}}
        r.rollback()
        starts = [args[2] for args in self.calls if args[:2] == ['docker', 'start']]
        self.assertEqual(starts, [b.API, b.WEB])
        self.assertEqual(self.docker[b.API]['Id'], 'prior-api')
        self.assertEqual(self.docker[b.WEB]['Id'], 'prior-web')
        self.assertEqual(self.created, [])

    def test_rollback_can_recreate_both_prior_containers(self):
        self.docker = {b.API: {'Id': 'new-api'}, b.WEB: {'Id': 'new-web'}}
        r.rollback()
        self.assertIn('old-api', self.created_for(b.API))
        self.assertFalse(any('dst=/run/bilge-pdf' in arg for arg in self.created_for(b.API)))
        self.assertIn('127.0.0.1:18790:80', self.created_for(b.WEB))

    def runtime_pair(self):
        previous = self.snapshots[b.API + '.json']
        current = copy.deepcopy(previous)
        current['Mounts'].append({'Source': str(r.ROOT / 'socket'), 'Destination': r.SOCKET_DEST, 'RW': False})
        current['Config']['Env'] = list(reversed(r.pdf_env(previous['Config']['Env'])))
        return current, previous

    def test_runtime_contract_accepts_order_only_env_difference(self):
        r.runtime_contract(*self.runtime_pair())

    def test_runtime_contract_rejects_auth_change(self):
        current, previous = self.runtime_pair()
        current['Config']['Env'] = [value.replace('AUTH=unchanged', 'AUTH=changed') for value in current['Config']['Env']]
        with self.assertRaises(RuntimeError):
            r.runtime_contract(current, previous)

    def test_runtime_contract_rejects_writable_socket_or_second_worker(self):
        for change in ['socket', 'workers']:
            current, previous = self.runtime_pair()
            if change == 'socket':
                current['Mounts'][-1]['RW'] = True
            else:
                current['Config']['Cmd'][-1] = '2'
            with self.assertRaises(RuntimeError):
                r.runtime_contract(current, previous)

    def test_activate_refuses_missing_proxy_acceptance_before_mutation(self):
        worker = {'source': 'candidate', 'acceptance': True}
        (r.ROOT / 'stage-proof.json').write_text(json.dumps({'source': 'candidate', 'api_image': 'new-api',
            'api_tests_passed': True, 'proxy': {'passed': False}, 'worker': worker}))
        with patch.object(r, 'old', lambda: None), patch.object(r, 'unchanged', lambda: None), \
             patch.object(r, 'package', lambda: {'commit': 'candidate'}), patch.object(r, 'worker_ok', lambda: worker):
            with self.assertRaises(RuntimeError):
                r.activate()
        self.assertEqual(self.calls, [])

    def worker_fixture(self):
        proof = {'source': 'candidate', 'worker_id': 'isolated-worker', 'isolation': True, 'acceptance': True, 'tests_passed': True}
        (r.ROOT / 'worker-proof.json').write_text(json.dumps(proof))
        self.docker[r.WORKER] = {'Id': 'isolated-worker', 'State': {'Running': True},
            'Config': {'User': '1000:10001'}, 'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True,
                'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges:true'], 'Memory': 2147483648,
                'NanoCpus': 1000000000, 'PidsLimit': 160},
            'Mounts': [{'Type': 'bind', 'Source': str(r.ROOT / 'socket'), 'Destination': r.SOCKET_DEST, 'RW': True}]}
        return proof

    def test_worker_gate_accepts_exact_isolated_runtime(self):
        proof = self.worker_fixture()
        with patch.object(r, 'receipt', lambda: {'commit': 'candidate'}), patch.object(Path, 'is_socket', lambda self: True):
            self.assertEqual(r.worker_ok(), proof)

    def test_worker_gate_rejects_network_and_extra_data_mount(self):
        for change in ['network', 'mount']:
            self.worker_fixture()
            if change == 'network':
                self.docker[r.WORKER]['HostConfig']['NetworkMode'] = 'bridge'
            else:
                self.docker[r.WORKER]['Mounts'].append({'Type': 'bind', 'Source': '/data-original', 'Destination': '/data', 'RW': False})
            with patch.object(r, 'receipt', lambda: {'commit': 'candidate'}), patch.object(Path, 'is_socket', lambda self: True):
                with self.assertRaises(RuntimeError):
                    r.worker_ok()


if __name__ == '__main__':
    unittest.main()
