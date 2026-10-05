"""Offline release-safety tests; no Docker, SSH, network or production writes."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deployment_v75_under_test', Path(__file__).with_name('deploy-v75.py'))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'v75'
        self.root.mkdir()
        self.prior = Path(self.temp.name) / 'v73'
        self.bridge = Path(self.temp.name) / 'v74'
        self.prior.mkdir(); self.bridge.mkdir()
        self.floor = Path(self.temp.name) / 'minimum-reader.json'
        self.patches = [patch.object(d, 'ROOT', self.root), patch.object(d.b, 'ROOT', self.root),
                        patch.object(d, 'PRIOR', self.prior), patch.object(d, 'BRIDGE', self.bridge),
                        patch.object(d, 'FLOOR', self.floor)]
        for item in self.patches:
            item.start()
        (self.root / 'private').mkdir()
        self.value = {'package': 'v75', 'commit': 'a' * 40,
                      'prior': {'version': 'v73', 'api_version': 'v73', 'nginx_sha256': digest(b'nginx'),
                                'ui_manifest_sha256': 'b' * 64, 'api_image': 'sha256:' + '3' * 64},
                      'bridge': {'version': 'v74', 'ui_manifest_sha256': ''},
                      'worker': {'name': d.WORKER, 'socket': str(self.prior / 'socket'),
                                 'id': 'c' * 64, 'image': 'sha256:' + '4' * 64},
                      'acceptance_fixture': {'synthetic_only': True, 'slides': 100, 'sha256': 'f' * 64},
                      'files': {}}
        self.file('classroom-nginx.conf', b'nginx')
        self.file('api-baseline.json', b'{}')
        self.file('deploy-v75.py', b'# pinned code\n')
        self.file('api/Dockerfile', b'FROM pinned\n')
        for folder, version in [('ui', 'v75'), ('bridge-ui', 'v74')]:
            content = json.dumps({'version': version}).encode()
            self.file(folder + '/release.json', content)
            manifest = (digest(content) + '  release.json\n').encode()
            self.file(folder + '/SHA256SUMS', manifest)
        self.value['bridge']['ui_manifest_sha256'] = self.value['files']['bridge-ui/SHA256SUMS']
        self.save_receipt()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def file(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        self.value['files'][name] = digest(content)

    def save_receipt(self):
        (self.root / 'source-receipt.json').write_text(json.dumps(self.value))

    def json(self, name, content):
        (self.root / name).write_text(json.dumps(content))

    def api(self):
        return {'Id': '1' * 64, 'Name': '/' + d.b.API, 'Image': self.value['prior']['api_image'],
                'State': {'Running': True, 'StartedAt': 'now'},
                'Config': {'Env': ['PATH=/usr/bin', 'BILGE_DEFTER_DICT_DB=/dictionaries/bilge_defter_dictionary.db',
                                   'BILGE_DEFTER_EDGE_SYNC=1', 'AUTH_SECRET=do-not-log', 'BILGE_DEFTER_PDF_ENABLED=1'],
                           'Cmd': ['uvicorn', 'app.main:app', '--workers', '1'], 'Entrypoint': None,
                           'User': '10001:10001', 'WorkingDir': '/srv'},
                'Mounts': [{'Type': 'bind', 'Source': source, 'Destination': destination, 'RW': rw}
                           for source, destination, rw in [('/private/data', '/data', True),
                              ('/private/secrets', '/run/bilge-secrets', False), ('/dictionary', '/dictionaries', False),
                              (str(self.prior / 'socket'), d.SOCKET_DEST, False)]],
                'HostConfig': {'ReadonlyRootfs': True, 'Privileged': False, 'RestartPolicy': {'Name': 'unless-stopped'},
                               'Memory': 1024**3, 'PidsLimit': 100, 'NanoCpus': 10**9,
                               'CapDrop': ['ALL'], 'CapAdd': [], 'SecurityOpt': ['no-new-privileges:true'],
                               'Tmpfs': {'/tmp': 'rw,size=128m'}, 'LogConfig': {'Type': 'none'}, 'PortBindings': {}},
                'NetworkSettings': {'Networks': {'bilge-defter-classroom': {}}}}

    def test_package_hashes_and_immutable_source(self):
        self.assertEqual(d.package()['commit'], 'a' * 40)
        self.value['commit'] = 'master'; self.save_receipt()
        with self.assertRaisesRegex(RuntimeError, 'non-immutable'):
            d.package()

    def test_package_modified_source_rejected(self):
        (self.root / 'deploy-v75.py').write_text('changed')
        with self.assertRaisesRegex(RuntimeError, 'hash mismatch'):
            d.package()

    def test_package_wrong_bridge_hash_rejected(self):
        self.value['bridge']['ui_manifest_sha256'] = 'f' * 64; self.save_receipt()
        with self.assertRaisesRegex(RuntimeError, 'Bridge manifest'):
            d.package()

    def test_package_path_traversal_rejected(self):
        self.value['files']['../outside'] = 'f' * 64; self.save_receipt()
        with self.assertRaisesRegex(RuntimeError, 'Unsafe package path'):
            d.package()

    def test_bridge_assets_must_also_be_source_pinned(self):
        del self.value['files']['bridge-ui/release.json']; self.save_receipt()
        with self.assertRaisesRegex(RuntimeError, 'UI not pinned'):
            d.package()

    def test_floor_durable_and_exclusive(self):
        d.mark_floor()
        self.assertEqual(d.floor()['minimum_reader'], 'v74')
        with self.assertRaisesRegex(RuntimeError, 'already begun'):
            d.mark_floor()
        self.assertTrue(self.floor.exists())

    def test_floor_missing_rejected_for_rollback(self):
        with self.assertRaisesRegex(RuntimeError, 'floor is missing'):
            d.floor()

    def test_different_receipt_floor_rejected(self):
        d.mark_floor()
        self.value['commit'] = 'e' * 40; self.save_receipt()
        with self.assertRaisesRegex(RuntimeError, 'different source/receipt'):
            d.floor(allow_absent=True)

    def test_stale_lower_or_higher_floor_rejected(self):
        for version in ('v73', 'v75', 'v80'):
            self.floor.write_text(json.dumps({**d.binding(), 'minimum_reader': version, 'release': 'v75',
                'bridge_manifest_sha256': self.value['bridge']['ui_manifest_sha256']}))
            with self.assertRaisesRegex(RuntimeError, 'stale reader'):
                d.floor()

    def test_receipt_byte_change_invalidates_proof(self):
        proof = d.binding()
        with (self.root / 'source-receipt.json').open('a') as out:
            out.write('\n')
        with self.assertRaisesRegex(RuntimeError, 'different source/receipt'):
            d.bound(proof)

    def test_runtime_exact_environment_and_socket_preserved(self):
        original = self.api()
        d.runtime_contract(copy.deepcopy(original), original)
        changed = copy.deepcopy(original)
        changed['Config']['Env'].append('OTHER=1')
        with self.assertRaisesRegex(RuntimeError, 'environment changed'):
            d.runtime_contract(changed, original)

    def test_duplicate_env_cannot_be_hidden_by_dictionary(self):
        changed = self.api(); changed['Config']['Env'].append('PATH=/usr/bin')
        with self.assertRaisesRegex(RuntimeError, 'Duplicate environment'):
            d.runtime_contract(changed, self.api())

    def test_duplicate_mount_cannot_be_hidden_by_dictionary(self):
        changed = self.api(); changed['Mounts'].append(copy.deepcopy(changed['Mounts'][-1]))
        with self.assertRaisesRegex(RuntimeError, 'Duplicate mount'):
            d.runtime_contract(changed, self.api())

    def test_changed_or_writable_socket_rejected(self):
        for field, value in [('RW', True), ('Source', str(self.root / 'socket'))]:
            changed = self.api(); changed['Mounts'][-1][field] = value
            with self.assertRaisesRegex(RuntimeError, 'mount changed'):
                d.runtime_contract(changed, self.api())

    def clone_commands(self, preview=False, rehearsal=False):
        original = self.api()
        self.json('private/' + d.b.API + '.json', original)
        self.json('images.json', {'accounts': 'sha256:' + '5' * 64, 'verify': 'sha256:' + '6' * 64})
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            if args[:2] == ('docker', 'create'):
                env_path = args[args.index('--env-file') + 1]
                self.clone_env = Path(env_path).read_text().splitlines()
                return '7' * 64
            return ''
        with patch.object(d.b, 'inspect', return_value=None), patch.object(d.b, 'run', side_effect=run):
            d.clone(d.b.API + '-test', d.b.API, preview=preview,
                    prior_api=rehearsal, rehearsal_data=self.root / 'isolated-db' if rehearsal else None)
        return next(c for c in calls if c[:2] == ('docker', 'create'))

    def test_clone_no_duplicate_socket_mount_or_env(self):
        args = self.clone_commands()
        mounts = [arg for arg in args if arg.startswith('type=bind,')]
        self.assertEqual(len(mounts), 4)
        self.assertEqual(sum(',dst=/run/bilge-pdf' in m for m in mounts), 1)
        self.assertIn('type=bind,src=' + str(self.prior / 'socket') + ',dst=/run/bilge-pdf,readonly', mounts)
        self.assertEqual(d.env_map(self.clone_env), d.env_map(self.api()['Config']['Env']))
        self.assertNotIn('AUTH_SECRET=do-not-log', args)

    def test_preview_never_mounts_live_db_or_secret(self):
        # b57 creates/chowns preview state; chown is Linux-only, mocked here.
        with patch.object(d.b.os, 'chown', create=True):
            args = self.clone_commands(preview=True)
        self.assertFalse(any('src=/private/' in arg for arg in args))
        self.assertFalse(any('AUTH_SECRET' in item for item in self.clone_env))
        self.assertIn('/srv/tests/test_release_proxy_v75.py', args)
        self.assertIn('sha256:' + '6' * 64, args)

    def test_rehearsal_uses_copy_prior_image_no_secret_no_sync(self):
        args = self.clone_commands(rehearsal=True)
        self.assertFalse(any('src=/private/' in arg for arg in args))
        self.assertIn(self.value['prior']['api_image'], args)
        self.assertEqual(d.env_map(self.clone_env)['BILGE_DEFTER_EDGE_SYNC'], '0')
        self.assertIn('type=bind,src=' + str(self.root / 'isolated-db') + ',dst=/data', args)

    def activation_fixture(self):
        api = self.api()
        web = {'Id': '2' * 64, 'Name': '/' + d.b.WEB, 'State': {'Running': True}}
        state = {d.b.API: api, d.b.WEB: web}
        self.json('private/' + d.b.API + '.json', api)
        self.json('private/' + d.b.WEB + '.json', {'Id': '0' * 64})
        self.json('bridge-proof.json', {**d.binding(), 'web_id': web['Id'], 'api_id': api['Id']})
        self.json('private/' + d.b.WEB + '.created.json', {**d.binding(), 'id': web['Id']})
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            if args[:2] == ('docker', 'rename'):
                need_name, target = args[2:]
                self.assertNotIn(target, state)
                state[target] = state.pop(need_name)
            elif args[:2] == ('docker', 'stop'):
                state[args[2]]['State']['Running'] = False
            elif args[:2] == ('docker', 'start'):
                state[args[2]]['State']['Running'] = True
            return ''
        return state, calls, run

    def test_partial_activation_failure_never_restores_v73_reader_or_db(self):
        state, calls, run = self.activation_fixture()
        def fail_clone(name, source, **kwargs):
            self.assertEqual(d.floor()['minimum_reader'], 'v74')  # written BEFORE creation
            new = copy.deepcopy(self.api()); new['Id'] = '9' * 64
            state[name] = new
            d.remember_created(name, new['Id'])
            raise RuntimeError('simulate new API start failure')
        paths = []
        with patch.object(d, 'preflight_proofs'), patch.object(d, 'bridge_live'), patch.object(d, 'package'), \
             patch.object(d, 'bridge_files'), patch.object(d, 'unchanged'), patch.object(d, 'worker_ok'), \
             patch.object(d, 'current_link'), patch.object(d, 'verify', return_value={'ok': True}), \
             patch.object(d, 'point', side_effect=paths.append), patch.object(d, 'health'), \
             patch.object(d, 'clone', side_effect=fail_clone), \
             patch.object(d.b, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d.b, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'simulate new API'):
                d.activate()
        self.assertEqual(state[d.b.API]['Id'], '1' * 64)
        self.assertEqual(state[d.b.WEB]['Id'], '2' * 64)
        self.assertEqual(paths, [self.bridge / 'ui'])
        self.assertTrue(self.floor.exists())
        self.assertFalse(any('cp' in command or 'snapshot' in command for command in calls))

    def test_partial_rename_failure_keeps_bridge_and_api(self):
        state, calls, run = self.activation_fixture()
        def fail_once(*args, **kwargs):
            if args == ('docker', 'rename', d.b.API, d.b.API + '-rollback-v75'):
                raise RuntimeError('simulate interrupted rename')
            return run(*args, **kwargs)
        paths = []
        with patch.object(d, 'preflight_proofs'), patch.object(d, 'bridge_live'), patch.object(d, 'package'), \
             patch.object(d, 'bridge_files'), patch.object(d, 'unchanged'), patch.object(d, 'worker_ok'), \
             patch.object(d, 'current_link'), patch.object(d, 'verify', return_value={}), patch.object(d, 'point', side_effect=paths.append), \
             patch.object(d, 'health'), patch.object(d.b, 'inspect', side_effect=lambda name: state.get(name)), \
             patch.object(d.b, 'run', side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, 'interrupted rename'):
                d.activate()
        self.assertEqual(state[d.b.API]['Id'], '1' * 64)
        self.assertEqual(state[d.b.WEB]['Id'], '2' * 64)
        self.assertEqual(paths, [self.bridge / 'ui'])

    def test_unknown_live_identity_refused_before_stopping_any_service(self):
        state, calls, run = self.activation_fixture()
        d.mark_floor()
        state[d.b.WEB + '-rollback-v75'] = state.pop(d.b.WEB)
        state[d.b.WEB] = {'Id': 'f' * 64, 'State': {'Running': True}}
        with patch.object(d, 'package'), patch.object(d, 'bridge_files'), patch.object(d, 'unchanged'), \
             patch.object(d, 'worker_ok'), patch.object(d, 'current_link'), \
             patch.object(d.b, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d.b, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'Unowned replacement'):
                d.rollback()
        self.assertEqual(calls, [])

    def test_wrong_retained_identity_refused(self):
        state, calls, run = self.activation_fixture()
        d.mark_floor()
        state[d.b.API + '-rollback-v75'] = {'Id': 'f' * 64}
        with patch.object(d, 'package'), patch.object(d, 'bridge_files'), patch.object(d, 'unchanged'), \
             patch.object(d, 'worker_ok'), patch.object(d, 'current_link'), \
             patch.object(d.b, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d.b, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'Wrong retained'):
                d.rollback()
        self.assertEqual(calls, [])

    def test_point_cannot_lower_floor_to_v73(self):
        d.mark_floor()
        with patch.object(d, 'current_link'):
            with self.assertRaisesRegex(RuntimeError, 'below v74'):
                d.point(self.prior / 'ui')

    def test_offhost_receipt_is_source_bound_not_just_matching_hash(self):
        bound = {**d.binding(), 'api_image': 'a', 'verify_image': 'v', 'worker': {},
                 'api_tests_passed': True, 'proxy': {'passed': True, 'pdf_sha256': 'p' * 64, 'fixture_sha256': 'f' * 64}}
        self.json('stage-proof.json', bound)
        self.json('images.json', {'accounts': 'a', 'verify': 'v'})
        self.json('page-count-proof.json', {**d.binding(), 'pages': 100, 'unique_markers': 100,
                                           'pdf_sha256': 'p' * 64, 'fixture_sha256': 'f' * 64})
        self.json('rehearsal-proof.json', {**d.binding(), 'accounts': {'version': 'v73', 'database': 'ok'},
                                         'live_data_mounted': False, 'data_restored': False})
        backup = {'source': 'e' * 40, 'receipt_sha256': d.binding()['receipt_sha256'], 'accounts': '123'}
        self.json('private/backup-receipt.json', backup); self.json('offhost-backups.json', backup)
        with patch.object(d, 'package'), patch.object(d, 'bridge_files'), patch.object(d, 'unchanged'), \
             patch.object(d, 'worker_ok', return_value={}):
            with self.assertRaisesRegex(RuntimeError, 'different source/receipt'):
                d.preflight_proofs()

    def test_wrong_pdf_page_count_proof_rejected(self):
        self.json('stage-proof.json', {**d.binding(), 'api_image': 'a', 'verify_image': 'v', 'worker': {},
                  'api_tests_passed': True, 'proxy': {'passed': True, 'pdf_sha256': 'a' * 64, 'fixture_sha256': 'f' * 64}})
        self.json('images.json', {'accounts': 'a', 'verify': 'v'})
        for pages, markers, sha in [(99, 100, 'a' * 64), (100, 99, 'a' * 64), (100, 100, 'b' * 64)]:
            self.json('page-count-proof.json', {**d.binding(), 'pages': pages, 'unique_markers': markers,
                                               'pdf_sha256': sha, 'fixture_sha256': 'f' * 64})
            with patch.object(d, 'package'), patch.object(d, 'bridge_files'), patch.object(d, 'unchanged'), \
                 patch.object(d, 'worker_ok', return_value={}):
                with self.assertRaisesRegex(RuntimeError, 'Independent PDF page-count'):
                    d.preflight_proofs()

    def test_rehearsal_web_points_only_to_rehearsal_api(self):
        api = self.api()
        web = copy.deepcopy(api)
        web['Image'] = d.b.WEBIMAGE
        web['Mounts'] = [
            {'Type': 'bind', 'Source': str(self.prior / 'ui'), 'Destination': '/usr/share/nginx/html', 'RW': False},
            {'Type': 'bind', 'Source': str(self.prior / 'classroom-nginx.conf'), 'Destination': '/etc/nginx/conf.d/default.conf', 'RW': False}]
        self.json('private/' + d.b.WEB + '.json', web)
        self.json('images.json', {'accounts': 'a', 'verify': 'v'})
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            return '7' * 64 if args[:2] == ('docker', 'create') else ''
        with patch.object(d.b, 'inspect', return_value=None), patch.object(d.b, 'run', side_effect=run):
            d.clone(d.b.WEB + '-rehearsal-v75', d.b.WEB, bridge_web=True, port=d.REHEARSAL_PORT, rehearsal_web=True)
        creation = next(c for c in calls if c[:2] == ('docker', 'create'))
        self.assertIn('type=bind,src=' + str(self.root / 'rehearsal-nginx.conf') + ',dst=/etc/nginx/conf.d/default.conf,readonly', creation)
        self.assertIn('127.0.0.1:18806:80', creation)


if __name__ == '__main__':
    unittest.main()
