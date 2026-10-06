"""Offline release failure probes. No Docker, network, account data or remote calls."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


d = load('deploy-v76')
b = load('build-release-v76')


def digest(data):
    return hashlib.sha256(data).hexdigest()


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.root, self.prior = base / 'v76', base / 'v75'
        self.root.mkdir(); self.prior.mkdir()
        (self.root / 'private').mkdir()
        (self.prior / 'ui').mkdir()
        self.current, self.floor = base / 'current', base / 'minimum-reader.json'
        original = b'events {}\nhttp {\nserver {\n  location / { return 404; }\n}\n}\n'
        (self.prior / 'classroom-nginx.conf').write_bytes(original)
        prior_release = b'{"version":"v75"}'
        (self.prior / 'ui/release.json').write_bytes(prior_release)
        prior_sums = (digest(prior_release) + '  release.json\n').encode()
        (self.prior / 'ui/SHA256SUMS').write_bytes(prior_sums)
        self.patches = [patch.object(d, 'ROOT', self.root), patch.object(d, 'PRIOR', self.prior),
                        patch.object(d, 'CURRENT', self.current), patch.object(d, 'FLOOR', self.floor),
                        patch.object(d, 'PRIOR_UI', digest(prior_sums)), patch.object(d, 'PRIOR_NGINX', digest(original)),
                        patch.object(b, 'PRIOR_NGINX', digest(original))]
        for value in self.patches:
            value.start()
        scripts = ['window.example=1;', 'window.bridge=2;']
        hashes = ['sha256-' + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() for s in scripts]
        self.csp = "default-src 'none'; script-src " + ' '.join("'" + h + "'" for h in hashes) + "; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; font-src data: blob:; media-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"
        self.frame = ('<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="' + self.csp + '">' +
                      ''.join('<script>' + s + '</script>' for s in scripts)).encode()
        self.provenance = {'frameHtmlSha256': digest(self.frame), 'csp': self.csp,
                           'runtimeIntegrity': hashes[0], 'frameIntegrity': hashes[1]}
        self.value = {'package': 'v76', 'scope': 'web-only', 'commit': 'a' * 40, 'web_image': d.WEB_IMAGE,
                      'prior': {'version': 'v75', 'ui_manifest_sha256': d.PRIOR_UI, 'nginx_sha256': d.PRIOR_NGINX},
                      'frame_sha256': digest(self.frame), 'frame_csp': self.csp, 'files': {}}
        self.file('classroom-nginx.conf', b.derive_nginx(original, self.csp))
        self.file('deploy-v76.py', b'# deploy\n')
        self.file('verify-publication-v76.py', b'# verify\n')
        self.file('ui/release.json', b'{"version":"v76"}')
        self.file('ui/pptx-workspace.js', b'// integration\n')
        for name in d.PPTX_FILES:
            self.file('ui/pptx/' + name, self.frame if name == 'renderer-frame.html' else b'// source\n')
        self.manifest()
        self.json('private/web.json', self.web())
        self.floor.write_text(json.dumps({'release': 'v75', 'minimum_reader': 'v74'}))

    def tearDown(self):
        for value in reversed(self.patches):
            value.stop()
        self.temp.cleanup()

    def file(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.value['files'][name] = digest(data)

    def manifest(self):
        sums = ''.join(sha + '  ' + name.removeprefix('ui/') + '\n' for name, sha in sorted(self.value['files'].items())
                       if name.startswith('ui/') and name != 'ui/SHA256SUMS').encode()
        self.file('ui/SHA256SUMS', sums)
        self.value['ui_manifest_sha256'] = digest(sums)
        self.receipt()

    def receipt(self):
        self.json('source-receipt.json', self.value)

    def json(self, path, value):
        (self.root / path).write_text(json.dumps(value), encoding='utf-8')

    def web(self):
        return {'Id': '1' * 64, 'Name': '/' + d.WEB, 'Image': d.WEB_IMAGE,
                'State': {'Running': True, 'Status': 'running', 'StartedAt': 'now', 'Health': {'Status': 'healthy'}},
                'Config': {'Env': ['PATH=/usr/bin', 'SECRET=never-print'], 'Cmd': ['nginx', '-g', 'daemon off;'],
                           'Entrypoint': ['/docker-entrypoint.sh'], 'User': '101:101', 'WorkingDir': '', 'Labels': {}},
                'Mounts': [{'Type': 'bind', 'Source': str(self.prior / name), 'Destination': dest, 'RW': False}
                           for name, dest in [('ui', '/usr/share/nginx/html'), ('classroom-nginx.conf', '/etc/nginx/conf.d/default.conf')]],
                'HostConfig': {'ReadonlyRootfs': True, 'Privileged': False, 'RestartPolicy': {'Name': 'unless-stopped'},
                               'Memory': 256 * 1024**2, 'PidsLimit': 64, 'NanoCpus': 500000000,
                               'CapDrop': ['ALL'], 'CapAdd': ['CAP_CHOWN', 'CAP_SETGID', 'CAP_SETUID'], 'SecurityOpt': ['no-new-privileges:true'],
                               'Tmpfs': {'/tmp': 'rw,size=32m'}, 'LogConfig': {'Type': 'none'},
                               'PortBindings': {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18790'}]}},
                'NetworkSettings': {'Networks': {'bilge-defter-classroom': {}}}}

    def test_immutable_package_hashes(self):
        self.assertEqual(d.package()['commit'], 'a' * 40)

    def test_branch_not_immutable(self):
        self.value['commit'] = 'master'; self.receipt()
        with self.assertRaisesRegex(RuntimeError, 'non-immutable'):
            d.package()

    def test_modified_asset_rejected(self):
        (self.root / 'ui/pptx/host.js').write_text('changed')
        with self.assertRaisesRegex(RuntimeError, 'hash mismatch'):
            d.package()

    def test_path_traversal_rejected(self):
        self.value['files']['../outside'] = 'f' * 64; self.receipt()
        with self.assertRaisesRegex(RuntimeError, 'Unsafe/unexpected'):
            d.package()

    def test_api_payload_rejected(self):
        self.file('api/app.py', b'forbidden'); self.receipt()
        with self.assertRaisesRegex(RuntimeError, 'Unsafe/unexpected'):
            d.package()

    def test_unmanifested_public_file_rejected(self):
        (self.root / 'ui/test-secret.txt').write_text('private')
        with self.assertRaisesRegex(RuntimeError, 'Unexpected file'):
            d.package()

    def test_extra_pptx_vendor_source_rejected(self):
        self.file('ui/pptx/runtime.js', b'separate source'); self.manifest()
        with self.assertRaisesRegex(RuntimeError, 'route file set'):
            d.package()

    def test_changed_auth_route_even_with_updated_hash_rejected(self):
        data = (self.root / 'classroom-nginx.conf').read_bytes().replace(b'events {}', b'events { worker_connections 1; }')
        self.file('classroom-nginx.conf', data); self.receipt()
        with self.assertRaisesRegex(RuntimeError, 'auth/proxy'):
            d.package()

    def test_widened_pptx_route_rejected(self):
        data = (self.root / 'classroom-nginx.conf').read_bytes().replace(b'location = /pptx/host.js', b'location /pptx/')
        self.file('classroom-nginx.conf', data); self.receipt()
        with self.assertRaisesRegex(RuntimeError, 'exceeds exact'):
            d.package()

    def test_frame_has_two_hashes_and_no_network(self):
        self.assertEqual(b.frame_csp(self.frame, self.provenance), self.csp)

    def test_frame_changed_bytes_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'two script hashes'):
            b.frame_csp(self.frame.replace(b'example=1', b'example=3'), self.provenance)

    def test_frame_external_script_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'inline classic'):
            b.frame_csp(self.frame.replace(b'<script>', b'<script src="runtime.js">', 1), self.provenance)

    def test_frame_unsafe_inline_script_policy_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'two script hashes'):
            b.frame_csp(self.frame.replace(b"script-src ", b"script-src 'unsafe-inline' "), self.provenance)

    def test_config_only_adds_exact_routes(self):
        original = (self.prior / 'classroom-nginx.conf').read_bytes()
        result = b.derive_nginx(original, self.csp)
        prefix, rest = result.split(b.BEGIN.encode())
        _, suffix = rest.split(b.END.encode())
        self.assertEqual(prefix + suffix, original)
        self.assertIn(b'location = /pptx/NOTICES.txt', result)

    def test_receipt_change_invalidates_proofs(self):
        proof = d.binding()
        with (self.root / 'source-receipt.json').open('a') as out:
            out.write('\n')
        with self.assertRaisesRegex(RuntimeError, 'another source'):
            d.bound(proof)

    def test_writer_floor_cannot_change(self):
        self.json('private/protected.json', {'floor_sha256': d.sha(self.floor)})
        self.floor.write_text('{"release":"v75","minimum_reader":"v70"}')
        with self.assertRaisesRegex(RuntimeError, 'compatibility marker'):
            d.floor_ok()

    def test_floor_same_meaning_different_bytes_rejected(self):
        self.json('private/protected.json', {'floor_sha256': d.sha(self.floor)})
        with self.floor.open('a') as out:
            out.write('\n')
        with self.assertRaisesRegex(RuntimeError, 'floor bytes'):
            d.floor_ok()

    def test_clone_only_web_same_env_loopback_new_mounts(self):
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            if args[:2] == ('docker', 'create'):
                self.saved_env = Path(args[args.index('--env-file') + 1]).read_text()
                return '9' * 64
            return ''
        with patch.object(d, 'inspect', return_value=None), patch.object(d, 'run', side_effect=run), patch.object(d.os, 'chown', create=True):
            d.clone_web(d.PREVIEW, d.PREVIEW_PORT)
        args = calls[0]
        self.assertIn('127.0.0.1:18807:80', args)
        self.assertIn('type=bind,src=' + str(self.root) + '/ui,dst=/usr/share/nginx/html,readonly', args)
        self.assertEqual(self.saved_env, 'PATH=/usr/bin\nSECRET=never-print\n')
        self.assertNotIn('SECRET=never-print', args)
        self.assertEqual(args[args.index('--restart') + 1], 'no')
        self.assertEqual([args[i + 1] for i, value in enumerate(args) if value == '--cap-add'],
                         ['CAP_CHOWN', 'CAP_SETGID', 'CAP_SETUID'])
        self.assertEqual([args[i + 1] for i, value in enumerate(args) if value == '--cap-drop'], ['ALL'])
        self.assertTrue(all('bilge-defter-accounts' not in c for c in calls))
        self.assertFalse((self.root / 'private' / (d.PREVIEW + '.env')).exists())

    def test_clone_will_not_target_api(self):
        with self.assertRaisesRegex(RuntimeError, 'Invalid web target'):
            d.clone_web('bilge-defter-accounts', 18807)

    def test_changed_web_mount_rejected(self):
        web = self.web(); web['Mounts'][0]['RW'] = True
        with self.assertRaisesRegex(RuntimeError, 'writable web mount'):
            d.web_contract(web, self.prior)

    def test_public_binding_rejected(self):
        web = self.web(); web['HostConfig']['PortBindings']['80/tcp'][0]['HostIp'] = '0.0.0.0'
        with self.assertRaisesRegex(RuntimeError, 'port drift'):
            d.web_contract(web, self.prior)

    def test_measured_web_capabilities_exactly_accepted(self):
        web = self.web()
        d.web_contract(web, self.prior)
        web['HostConfig']['CapAdd'].reverse()
        d.web_contract(web, self.prior)

    def test_extra_web_capability_rejected(self):
        web = self.web(); web['HostConfig']['CapAdd'].append('CAP_SYS_ADMIN')
        with self.assertRaisesRegex(RuntimeError, 'capability baseline changed'):
            d.web_contract(web, self.prior)

    def test_missing_web_capability_rejected(self):
        web = self.web(); web['HostConfig']['CapAdd'].remove('CAP_CHOWN')
        with self.assertRaisesRegex(RuntimeError, 'capability baseline changed'):
            d.web_contract(web, self.prior)

    def test_duplicate_web_capability_rejected(self):
        web = self.web(); web['HostConfig']['CapAdd'].append('CAP_CHOWN')
        with self.assertRaisesRegex(RuntimeError, 'capability baseline changed'):
            d.web_contract(web, self.prior)

    def test_stage_failure_does_not_stop_production(self):
        calls = []
        state = {d.WEB: self.web()}
        def clone(name, port):
            candidate = self.web(); candidate['Id'] = '9' * 64
            state[name] = candidate
            self.json('private/' + name + '.created.json', {**d.binding(), 'id': candidate['Id']})
            raise RuntimeError('synthetic nginx stage failure')
        with patch.object(d, 'old'), patch.object(d, 'package'), patch.object(d, 'unchanged'), patch.object(d, 'backup_ok'), \
             patch.object(d, 'clone_web', side_effect=clone), patch.object(d, 'inspect', side_effect=lambda name: state.get(name)), \
             patch.object(d, 'run', side_effect=lambda *args, **kw: calls.append(args)):
            with self.assertRaisesRegex(RuntimeError, 'stage failure'):
                d.stage()
        self.assertEqual(calls, [('docker', 'stop', d.PREVIEW)])
        self.assertFalse((self.root / 'stage-proof.json').exists())

    def rollback_state(self):
        saved = self.web()
        old = copy.deepcopy(saved); old['State']['Running'] = False
        new = copy.deepcopy(saved); new['Id'] = '9' * 64
        state = {d.RETAINED: old, d.WEB: new}
        self.json('private/' + d.WEB + '.created.json', {**d.binding(), 'id': new['Id']})
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            action, name = args[1:3]
            if action == 'rename':
                self.assertNotIn(args[3], state)
                state[args[3]] = state.pop(name)
            elif action == 'stop':
                state[name]['State']['Running'] = False
            elif action == 'start':
                state[name]['State']['Running'] = True
            return ''
        return state, calls, run

    def test_rollback_exact_retained_v75_web_only(self):
        state, calls, run = self.rollback_state()
        paths = []
        with patch.object(d, 'backup_ok'), patch.object(d, 'package'), patch.object(d, 'current_link'), patch.object(d, 'unchanged'), patch.object(d, 'prior_files'), \
             patch.object(d, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d, 'run', side_effect=run), \
             patch.object(d, 'point', side_effect=paths.append), patch.object(d, 'verify_prior', return_value={'version': 'v75'}):
            d.rollback()
        self.assertEqual(state[d.WEB]['Id'], '1' * 64)
        self.assertEqual(state[d.FAILED]['Id'], '9' * 64)
        self.assertEqual(paths, [self.prior / 'ui'])
        self.assertTrue(all(c[2] in {d.WEB, d.RETAINED} for c in calls))
        self.assertFalse(json.loads((self.root / 'rollback-proof.json').read_text())['database_restored'])

    def test_rollback_unknown_new_identity_no_mutations(self):
        state, calls, run = self.rollback_state()
        state[d.WEB]['Id'] = 'f' * 64
        with patch.object(d, 'backup_ok'), patch.object(d, 'package'), patch.object(d, 'current_link'), patch.object(d, 'unchanged'), patch.object(d, 'prior_files'), \
             patch.object(d, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'Unowned replacement'):
                d.rollback()
        self.assertEqual(calls, [])

    def test_rollback_wrong_retained_identity_no_mutations(self):
        state, calls, run = self.rollback_state()
        state[d.RETAINED]['Id'] = 'f' * 64
        with patch.object(d, 'backup_ok'), patch.object(d, 'package'), patch.object(d, 'current_link'), patch.object(d, 'unchanged'), patch.object(d, 'prior_files'), \
             patch.object(d, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'Wrong retained'):
                d.rollback()
        self.assertEqual(calls, [])

    def test_missing_retained_refuses_stop_new_live(self):
        state, calls, run = self.rollback_state()
        del state[d.RETAINED]
        with patch.object(d, 'backup_ok'), patch.object(d, 'package'), patch.object(d, 'current_link'), patch.object(d, 'unchanged'), patch.object(d, 'prior_files'), \
             patch.object(d, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'Retained v75 web missing'):
                d.rollback()
        self.assertEqual(calls, [])

    def test_partial_activation_failure_restores_only_web(self):
        state, calls, run = self.rollback_state()
        state[d.WEB] = state.pop(d.RETAINED); state[d.WEB]['State']['Running'] = True
        self.json('stage-proof.json', {**d.binding(), 'preview_id': '8' * 64})
        preview = self.web(); preview['Id'] = '8' * 64
        state[d.PREVIEW] = preview
        self.json('private/' + d.PREVIEW + '.created.json', {**d.binding(), 'id': preview['Id']})
        (self.root / 'private' / (d.WEB + '.created.json')).unlink()
        def fail_clone(name, port):
            candidate = self.web(); candidate['Id'] = '9' * 64
            state[name] = candidate
            self.json('private/' + name + '.created.json', {**d.binding(), 'id': candidate['Id']})
            raise RuntimeError('synthetic web start failure')
        with patch.object(d, 'old'), patch.object(d, 'package'), patch.object(d, 'unchanged'), patch.object(d, 'backup_ok'), \
             patch.object(d, 'current_link'), patch.object(d, 'prior_files'), patch.object(d, 'point'), \
             patch.object(d, 'verify', return_value={'ok': True}), patch.object(d, 'verify_prior', return_value={'ok': True}), patch.object(d, 'clone_web', side_effect=fail_clone), \
             patch.object(d, 'inspect', side_effect=lambda name: state.get(name)), patch.object(d, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'web start failure'):
                d.activate()
        self.assertEqual(state[d.WEB]['Id'], '1' * 64)
        self.assertTrue(state[d.WEB]['State']['Running'])
        self.assertTrue(all(c[2] in {d.WEB, d.RETAINED} for c in calls))
        self.assertTrue((self.root / 'activation-started.json').exists())
        self.assertFalse((self.root / 'live-proof.json').exists())

    def test_old_rollback_target_refused_before_link_change(self):
        with self.assertRaisesRegex(RuntimeError, 'below v75'):
            d.point(self.prior.parent / 'v74/ui')

    def archive(self, extra=None, replace=None):
        with tarfile.open(self.root / 'payload.tar.gz', 'w:gz') as archive:
            for name in sorted(set(self.value['files']) | {'source-receipt.json'}):
                if replace and name == replace.name:
                    archive.addfile(replace)
                    continue
                data = (self.root / name).read_bytes()
                info = tarfile.TarInfo(name); info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
            if extra:
                archive.addfile(extra)

    def test_hash_bound_payload_extracts(self):
        self.archive()
        d.extract_payload()
        self.assertEqual(d.package()['package'], 'v76')

    def test_duplicate_tar_entry_rejected_before_extract(self):
        self.archive(extra=tarfile.TarInfo('ui/release.json'))
        with patch.object(tarfile.TarFile, 'extractall') as extract:
            with self.assertRaisesRegex(RuntimeError, 'Duplicate tar paths'):
                d.extract_payload()
        extract.assert_not_called()

    def test_symlink_tar_entry_rejected_before_extract(self):
        member = tarfile.TarInfo('ui/release.json'); member.type = tarfile.SYMTYPE; member.linkname = '/tmp/untrusted'
        self.archive(replace=member)
        with patch.object(tarfile.TarFile, 'extractall') as extract:
            with self.assertRaisesRegex(RuntimeError, 'Unsafe payload entry'):
                d.extract_payload()
        extract.assert_not_called()

    def test_unknown_tar_file_rejected_before_extract(self):
        self.archive(extra=tarfile.TarInfo('api/new-backend.py'))
        with patch.object(tarfile.TarFile, 'extractall') as extract:
            with self.assertRaisesRegex(RuntimeError, 'Tar/receipt file set'):
                d.extract_payload()
        extract.assert_not_called()

    def test_offhost_backup_is_source_bound(self):
        for name in ('prior-web.tar.gz', 'web.json', 'protected.json'):
            (self.root / 'private' / name).write_bytes(b'private backup')
        proof = {**d.binding(), 'web_backup_sha256': digest(b'private backup'), 'web_inspect_sha256': digest(b'private backup'),
                 'protected_sha256': digest(b'private backup'), 'database_copied': False}
        self.json('private/backup-receipt.json', proof)
        self.json('offhost-backups.json', proof)
        d.backup_ok()
        proof['source'] = 'b' * 40
        self.json('offhost-backups.json', proof)
        with self.assertRaisesRegex(RuntimeError, 'another source'):
            d.backup_ok()

    def test_changed_private_backup_rejected(self):
        for name in ('prior-web.tar.gz', 'web.json', 'protected.json'):
            (self.root / 'private' / name).write_bytes(b'private backup')
        proof = {**d.binding(), 'web_backup_sha256': digest(b'private backup'), 'web_inspect_sha256': digest(b'private backup'),
                 'protected_sha256': digest(b'private backup'), 'database_copied': False}
        self.json('private/backup-receipt.json', proof)
        self.json('offhost-backups.json', proof)
        (self.root / 'private/prior-web.tar.gz').write_bytes(b'corrupt backup')
        with self.assertRaisesRegex(RuntimeError, 'Private web backup changed'):
            d.backup_ok()

    def recovery_environment(self):
        """Only Docker/HTTP are simulated. Receipt, backup, floor, link and file gates run."""
        state, calls, mutate = self.rollback_state()
        accounts = self.web()
        accounts.update(Id='2' * 64, Name='/bilge-defter-accounts')
        state['bilge-defter-accounts'] = accounts
        try:
            self.current.symlink_to(self.root / 'ui', target_is_directory=True)
        except OSError as error:
            if getattr(error, 'winerror', None) != 1314:
                raise
            # Windows without Developer Mode cannot create symlinks. Model only
            # the two symlink OS primitives; current_link()/point() and all
            # trust gates still execute. Linux CI uses real filesystem links.
            links, allowed = {}, {self.current, self.current.parent / '.current-v76'}
            original_symlink, original_resolve = Path.symlink_to, Path.resolve
            original_islink, original_exists, original_replace = Path.is_symlink, Path.exists, Path.replace
            def symlink(path, target, **kwargs):
                if path not in allowed:
                    return original_symlink(path, target, **kwargs)
                if path in links:
                    raise FileExistsError(path)
                links[path] = Path(target)
            def resolve(path, *args, **kwargs):
                return links[path] if path in links else original_resolve(path, *args, **kwargs)
            def islink(path):
                return path in links or original_islink(path)
            def exists(path, *args, **kwargs):
                return original_exists(links.get(path, path), *args, **kwargs)
            def replace(path, target):
                if path not in links:
                    return original_replace(path, target)
                self.assertIn(target, allowed)
                links[target] = links.pop(path)
                return target
            for method, replacement in [('symlink_to', symlink), ('resolve', resolve), ('is_symlink', islink),
                                         ('exists', exists), ('replace', replace)]:
                value = patch.object(Path, method, replacement)
                value.start(); self.patches.append(value)
            self.current.symlink_to(self.root / 'ui', target_is_directory=True)

        def inspect(name):
            return state.get(name) or next((c for c in state.values() if c['Id'] == name), None)

        def run(*args, **kwargs):
            if args == ('docker', 'ps', '-aq'):
                return '\n'.join(c['Id'] for c in state.values())
            if args[:2] == ('systemctl', 'show'):
                return '4321'
            return mutate(*args, **kwargs)

        class Response:
            status = 200
            headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}
            def __init__(self, body):
                self.body = body
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return self.body

        def urlopen(request, **kwargs):
            name = request.full_url.split(':18790', 1)[1]
            if name.startswith(('/api/', '/library/')):
                raise HTTPError(request.full_url, 401, 'Unauthorized', {}, io.BytesIO(b'{}'))
            return Response((self.prior / 'ui' / name.lstrip('/')).read_bytes())

        with patch.object(d, 'inspect', side_effect=inspect), patch.object(d, 'run', side_effect=run):
            self.json('private/protected.json', d.protected())
        (self.root / 'private/prior-web.tar.gz').write_bytes(b'bound private web backup')
        proof = {**d.binding(), 'web_backup_sha256': d.sha(self.root / 'private/prior-web.tar.gz'),
                 'web_inspect_sha256': d.sha(self.root / 'private/web.json'),
                 'protected_sha256': d.sha(self.root / 'private/protected.json'), 'database_copied': False}
        self.json('private/backup-receipt.json', proof)
        self.json('offhost-backups.json', proof)
        return state, calls, inspect, run, urlopen

    def test_corrupt_candidate_does_not_block_real_recovery_gates(self):
        state, calls, inspect, run, urlopen = self.recovery_environment()
        # This exactly reproduces the old package()-at-rollback failure; even
        # the candidate verification script may be missing/damaged.
        (self.root / 'ui/pptx/host.js').write_bytes(b'corrupt candidate')
        (self.root / 'verify-publication-v76.py').write_bytes(b'raise RuntimeError("corrupt verifier")')
        with self.assertRaisesRegex(RuntimeError, 'Package hash mismatch'):
            d.package()
        with patch.object(d, 'inspect', side_effect=inspect), patch.object(d, 'run', side_effect=run), \
             patch.object(d, 'urlopen', side_effect=urlopen), patch.object(d.time, 'sleep'):
            d.rollback()
        self.assertEqual(state[d.WEB]['Id'], '1' * 64)
        self.assertTrue(state[d.WEB]['State']['Running'])
        self.assertEqual(self.current.resolve(), self.prior / 'ui')
        result = read(self.root / 'rollback-proof.json')
        self.assertTrue(result['web']['independent_of_candidate_files'])
        self.assertTrue(result['other_services_unchanged'])
        self.assertTrue(all(c[2] in {d.WEB, d.RETAINED} for c in calls))

    def test_unrelated_drift_reported_not_a_real_recovery_veto(self):
        state, calls, inspect, run, urlopen = self.recovery_environment()
        state['bilge-defter-accounts']['State']['StartedAt'] = 'restarted-independently'
        state['bilge-defter-accounts']['State']['Health']['Status'] = 'unhealthy'
        with patch.object(d, 'inspect', side_effect=inspect), patch.object(d, 'run', side_effect=run), \
             patch.object(d, 'urlopen', side_effect=urlopen), patch.object(d.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'Unrelated runtime'):
                d.unchanged()
            d.rollback()
        self.assertEqual(state[d.WEB]['Id'], '1' * 64)
        self.assertEqual(self.current.resolve(), self.prior / 'ui')
        result = read(self.root / 'rollback-proof.json')
        self.assertFalse(result['other_services_unchanged'])
        self.assertEqual(result['unrelated_runtime_after']['containers'],
                         [{'name': '/bilge-defter-accounts', 'changed': ['started_at', 'health']}])
        self.assertNotIn('SECRET', json.dumps(result))
        self.assertTrue(all(c[2] in {d.WEB, d.RETAINED} for c in calls))

    def test_unknown_live_identity_still_refused_by_real_recovery_gates(self):
        state, calls, inspect, run, urlopen = self.recovery_environment()
        state[d.WEB]['Id'] = 'f' * 64
        with patch.object(d, 'inspect', side_effect=inspect), patch.object(d, 'run', side_effect=run), \
             patch.object(d, 'urlopen', side_effect=urlopen), patch.object(d.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'Unowned replacement'):
                d.rollback()
        self.assertEqual(calls, [])
        self.assertEqual(state[d.WEB]['Id'], 'f' * 64)

    def protected_for(self, container):
        def run(*args, **kwargs):
            return container['Id'] if args == ('docker', 'ps', '-aq') else '4321'
        with patch.object(d, 'inspect', return_value=container), patch.object(d, 'run', side_effect=run):
            return d.protected()

    def protected_container(self):
        container = self.web()
        container.update(Id='2' * 64, Name='/bilge-defter-library-v1')
        container['Mounts'][0]['Propagation'] = 'rprivate'
        container['Mounts'][1]['Mode'] = 'ro'
        return container

    def test_mount_reordering_has_identical_runtime_fingerprint(self):
        container = self.protected_container()
        first = self.protected_for(container)
        original = copy.deepcopy(container['Mounts'])
        container['Mounts'].reverse()
        self.assertEqual(self.protected_for(container), first)
        self.assertEqual(container['Mounts'], list(reversed(original)), 'Fingerprint must not mutate inspect input')

    def test_mount_source_change_changes_runtime_fingerprint(self):
        container = self.protected_container()
        first = self.protected_for(container)
        container['Mounts'][0]['Source'] = '/different/source'
        self.assertNotEqual(self.protected_for(container), first)

    def test_mount_rw_change_changes_runtime_fingerprint(self):
        container = self.protected_container()
        first = self.protected_for(container)
        container['Mounts'][0]['RW'] = True
        self.assertNotEqual(self.protected_for(container), first)

    def test_duplicate_mount_is_not_collapsed_by_fingerprint(self):
        container = self.protected_container()
        first = self.protected_for(container)
        container['Mounts'].append(copy.deepcopy(container['Mounts'][0]))
        self.assertNotEqual(self.protected_for(container), first)
        repeated = self.protected_for(container)
        container['Mounts'].reverse()
        self.assertEqual(self.protected_for(container), repeated)

    def test_other_mount_fields_remain_in_fingerprint(self):
        container = self.protected_container()
        first = self.protected_for(container)
        container['Mounts'][0]['Propagation'] = 'rshared'
        self.assertNotEqual(self.protected_for(container), first)


def read(path):
    return json.loads(path.read_text())


if __name__ == '__main__':
    unittest.main()
