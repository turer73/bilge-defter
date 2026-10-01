"""Offline checks for deploy-v68 (fake Docker; no network, no production access).

Covers: rollback refuses before touching anything when the live release is not v68/v67; rollback
restores retained containers accounts-first; rollback rebuilds removed containers from the
snapshots (prior image, original data/secrets mounts, prior web files); the accounts rehearsal
uses a copy of the database, no secrets and no Cloudflare sync; new containers get health checks.
"""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy68', Path(__file__).with_name('deploy-v68.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
b = r.b
NEW_API_IMAGE, VERIFY_IMAGE = 'sha256:new-accounts', 'sha256:verify'


def snapshots(root):
    host = {'ReadonlyRootfs': True, 'Privileged': False, 'RestartPolicy': {'Name': 'unless-stopped'},
            'Memory': 134217728, 'PidsLimit': 100, 'NanoCpus': 500000000, 'CapDrop': ['ALL'],
            'SecurityOpt': ['no-new-privileges:true'], 'Tmpfs': {'/tmp': 'rw'}}
    net = {'Networks': {'bilge-defter-classroom': {}}}
    web = {'Id': 'v67-web', 'Image': b.WEBIMAGE, 'NetworkSettings': net, 'HostConfig': dict(host),
           'Config': {'Env': ['SAFE=1'], 'User': '', 'WorkingDir': '', 'Entrypoint': ['/docker-entrypoint.sh'], 'Cmd': ['nginx', '-g', 'daemon off;']},
           'Mounts': [{'Type': 'bind', 'Source': str(root / 'v67/ui'), 'Destination': '/usr/share/nginx/html', 'RW': False},
                      {'Type': 'bind', 'Source': str(root / 'v67/classroom-nginx.conf'), 'Destination': '/etc/nginx/conf.d/default.conf', 'RW': False}]}
    api = {'Id': 'v65-api', 'Image': r.OLD_API, 'NetworkSettings': net, 'HostConfig': dict(host),
           'Config': {'Env': ['BILGE_DEFTER_EDGE_SYNC=1', 'BILGE_DEFTER_DB=/data/bilge-defter.sqlite', 'BILGE_DEFTER_DICT_DB=/dictionaries/x.db'],
                      'User': '10001:10001', 'WorkingDir': '/srv', 'Entrypoint': None, 'Cmd': ['uvicorn', 'app.main:app']},
           'Mounts': [{'Type': 'bind', 'Source': '/opt/bilge-defter-classroom-v49/data', 'Destination': '/data', 'RW': True},
                      {'Type': 'bind', 'Source': '/opt/bilge-defter-classroom-v49/secrets', 'Destination': '/run/bilge-secrets', 'RW': False},
                      {'Type': 'bind', 'Source': '/opt/bilge-defter-classroom-v57/dictionary', 'Destination': '/dictionaries', 'RW': False}]}
    return {b.WEB + '.json': web, b.API + '.json': api}


class FakeLink:
    def __init__(self, target):
        self.target = target

    def is_symlink(self):
        return True

    def resolve(self):
        return self.target

    @property
    def parent(self):
        return Path(tempfile.gettempdir())


class Deploy68(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / 'v68/private').mkdir(parents=True)
        (root / 'v68/private/accounts.sqlite').write_bytes(b'SQLite format 3\x00fake')
        (root / 'v68/private' / (b.API + '.json')).write_text('{}')
        (root / 'v68/images.json').write_text('{"accounts": "%s", "verify": "%s"}' % (NEW_API_IMAGE, VERIFY_IMAGE))
        self.saved = (r.ROOT, r.PRIOR, b.ROOT, b.PRIOR, b.CURRENT)
        r.ROOT = b.ROOT = root / 'v68'
        r.PRIOR = b.PRIOR = root / 'v67'
        self.root = root
        self.snaps = snapshots(root)
        self.docker, self.calls, self.created, self.envs = {}, [], [], {}
        self.link = FakeLink(r.ROOT / 'ui')
        b.CURRENT = self.link

        def inspect(name):
            return self.docker.get(name)

        def run(*args, **kwargs):
            args = list(args)
            self.calls.append(args)
            if args[:2] == ['docker', 'stop']:
                self.docker[args[2]]['running'] = False
            elif args[:2] == ['docker', 'start']:
                self.docker[args[2]]['running'] = True
            elif args[:2] == ['docker', 'rename']:
                self.docker[args[3]] = self.docker.pop(args[2])
            elif args[:2] == ['docker', 'rm']:
                self.docker.pop(args[2])
            elif args[:2] == ['docker', 'create']:
                name = args[args.index('--name') + 1]
                env = args[args.index('--env-file') + 1]
                self.envs[name] = Path(env).read_text()
                self.created.append(args)
                self.docker[name] = {'Id': 'created-' + name, 'running': False}
            elif args[:2] == ['docker', 'exec']:
                return 'ok 2' if 'sqlite3' in ' '.join(args) else ''
            elif args[:3] == ['docker', 'inspect', '-f']:
                return 'healthy'
            return ''

        self.patches = [patch.object(b, 'inspect', inspect), patch.object(b, 'run', run),
                        patch.object(b, 'load', lambda name: self.snaps[name]),
                        patch.object(r, 'protected', lambda: {'same': True}),
                        patch.object(r, 'point', lambda path: self.calls.append(['point', str(path)])),
                        patch.object(r, 'health', lambda name, v: self.calls.append(['health', name, v])),
                        patch.object(r, 'verify_prior', lambda port=18790: {'port': port}),
                        patch.object(r.os, 'chown', lambda *a: None, create=True),
                        patch.object(r.time, 'sleep', lambda s: None)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        r.ROOT, r.PRIOR, b.ROOT, b.PRIOR, b.CURRENT = self.saved
        self.tmp.cleanup()

    def create_for(self, name):
        return next(a for a in self.created if a[a.index('--name') + 1] == name)

    def test_rollback_refuses_when_live_release_is_another(self):
        self.link.target = self.root / 'v66/ui'
        self.docker = {b.WEB: {'Id': 'v68-web', 'running': True}, b.API: {'Id': 'v68-api', 'running': True}}
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rollback_refuses_wrong_identity_before_touching_live(self):
        self.docker = {b.WEB: {'Id': 'v68-web', 'running': True}, b.API: {'Id': 'v68-api', 'running': True},
                       b.API + '-rollback-v68': {'Id': 'something-else', 'running': False}}
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rollback_restores_retained_containers_accounts_first(self):
        self.docker = {b.WEB: {'Id': 'v68-web', 'running': True}, b.API: {'Id': 'v68-api', 'running': True},
                       b.WEB + '-rollback-v68': {'Id': 'v67-web', 'running': False},
                       b.API + '-rollback-v68': {'Id': 'v65-api', 'running': False}}
        r.rollback()
        self.assertEqual(self.docker[b.API]['Id'], 'v65-api')
        self.assertEqual(self.docker[b.WEB]['Id'], 'v67-web')
        self.assertEqual(self.docker[b.API + '-failed-v68']['Id'], 'v68-api')
        order = [c for c in self.calls if c[:2] == ['docker', 'start']]
        self.assertEqual(order, [['docker', 'start', b.API], ['docker', 'start', b.WEB]])
        self.assertIn(['health', b.API, 'v65'], self.calls)
        self.assertIn(['point', str(r.PRIOR / 'ui')], self.calls)
        self.assertEqual(self.created, [])

    def test_rollback_rebuilds_removed_containers_from_snapshots(self):
        self.docker = {b.WEB: {'Id': 'v68-web', 'running': True}, b.API: {'Id': 'v68-api', 'running': True}}
        r.rollback()
        api = self.create_for(b.API)
        self.assertIn(r.OLD_API, api)
        self.assertNotIn(NEW_API_IMAGE, api)
        self.assertIn('type=bind,src=/opt/bilge-defter-classroom-v49/data,dst=/data', api)
        self.assertIn('type=bind,src=/opt/bilge-defter-classroom-v49/secrets,dst=/run/bilge-secrets,readonly', api)
        self.assertIn('type=bind,src=/opt/bilge-defter-classroom-v57/dictionary,dst=/dictionaries,readonly', api)
        self.assertEqual(api[api.index('--restart') + 1], 'unless-stopped')
        self.assertIn('--health-cmd', api)
        self.assertIn('BILGE_DEFTER_EDGE_SYNC=1', self.envs[b.API])
        web = self.create_for(b.WEB)
        self.assertIn('type=bind,src=' + str(r.PRIOR / 'ui') + ',dst=/usr/share/nginx/html,readonly', web)
        self.assertNotIn(str(r.ROOT / 'ui'), ' '.join(web))
        self.assertIn('127.0.0.1:18790:80', web)
        self.assertIn('--health-cmd', web)

    def test_rehearsal_never_touches_live_data_or_secrets(self):
        self.docker = {b.WEB: {'Id': 'v67-web', 'running': True}, b.API: {'Id': 'v65-api', 'running': True}}
        with patch.object(Path, 'write_text', lambda self, text, **k: None):
            r.rehearse()
        api = self.create_for(b.API + '-rehearsal-v68')
        joined = ' '.join(api)
        self.assertIn('type=bind,src=' + str(r.ROOT / 'rehearsal-data') + ',dst=/data', api)
        self.assertNotIn('/opt/bilge-defter-classroom-v49/data', joined)
        self.assertNotIn('/run/bilge-secrets', joined)
        self.assertIn(r.OLD_API, api)
        self.assertEqual(api[api.index('--restart') + 1], 'no')
        self.assertIn('BILGE_DEFTER_EDGE_SYNC=0', self.envs[b.API + '-rehearsal-v68'])
        self.assertNotIn('BILGE_DEFTER_EDGE_SYNC=1', self.envs[b.API + '-rehearsal-v68'])
        web = self.create_for(b.WEB + '-rehearsal-v68')
        self.assertIn('127.0.0.1:18806:80', web)
        self.assertNotIn(b.API + '-rehearsal-v68', self.docker)
        self.assertNotIn(b.WEB + '-rehearsal-v68', self.docker)
        self.assertFalse((r.ROOT / 'rehearsal-data').exists())
        self.assertEqual(self.docker[b.API]['Id'], 'v65-api')

    def test_new_release_containers_get_health_checks_and_new_image(self):
        self.docker = {}
        r.clone(b.API, b.API)
        r.clone(b.WEB, b.WEB)
        api, web = self.create_for(b.API), self.create_for(b.WEB)
        self.assertIn(NEW_API_IMAGE, api)
        self.assertIn('/health', api[api.index('--health-cmd') + 1])
        self.assertIn('release.json', web[web.index('--health-cmd') + 1])
        self.assertIn('type=bind,src=' + str(r.ROOT / 'ui') + ',dst=/usr/share/nginx/html,readonly', web)


if __name__ == '__main__':
    unittest.main()
