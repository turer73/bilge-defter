"""Offline checks for deploy-v72 (fake Docker; no network, no production access).

Covers: rollback refuses before touching anything when the live release is not v72/v71 or a
retained identity is wrong; rollback restores the retained v71 web container; rollback rebuilds a
removed v71 web container from the snapshot with the prior files and the health check; the
rehearsal runs on a loopback port and is removed; the new web container gets the health check and
the new files; the accounts container is never touched.
"""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy72', Path(__file__).with_name('deploy-v72.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
b = r.b


def snapshots(root):
    host = {'ReadonlyRootfs': True, 'Privileged': False, 'RestartPolicy': {'Name': 'unless-stopped'},
            'Memory': 134217728, 'PidsLimit': 100, 'NanoCpus': 500000000, 'CapDrop': ['ALL'],
            'SecurityOpt': ['no-new-privileges:true'], 'Tmpfs': {'/tmp': 'rw'}}
    web = {'Id': 'v71-web', 'Image': b.WEBIMAGE, 'NetworkSettings': {'Networks': {'bilge-defter-classroom': {}}}, 'HostConfig': dict(host),
           'Config': {'Env': ['SAFE=1'], 'User': '', 'WorkingDir': '', 'Entrypoint': ['/docker-entrypoint.sh'], 'Cmd': ['nginx', '-g', 'daemon off;']},
           'Mounts': [{'Type': 'bind', 'Source': str(root / 'v71/ui'), 'Destination': '/usr/share/nginx/html', 'RW': False},
                      {'Type': 'bind', 'Source': str(root / 'v71/classroom-nginx.conf'), 'Destination': '/etc/nginx/conf.d/default.conf', 'RW': False}]}
    return {b.WEB + '.json': web}


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


class Deploy72(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / 'v72/private').mkdir(parents=True)
        self.saved = (r.ROOT, r.PRIOR, b.ROOT, b.PRIOR, b.CURRENT)
        r.ROOT = b.ROOT = root / 'v72'
        r.PRIOR = b.PRIOR = root / 'v71'
        self.root = root
        self.snaps = snapshots(root)
        self.docker, self.calls, self.created = {}, [], []
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
                self.created.append(args)
                self.docker[name] = {'Id': 'created-' + name, 'running': False}
            elif args[:3] == ['docker', 'inspect', '-f']:
                return 'healthy'
            return ''

        self.patches = [patch.object(b, 'inspect', inspect), patch.object(b, 'run', run),
                        patch.object(b, 'load', lambda name: self.snaps[name]),
                        patch.object(r, 'protected', lambda: {'same': True}),
                        patch.object(r, 'point', lambda path: self.calls.append(['point', str(path)])),
                        patch.object(r, 'verify_prior', lambda port=18790: {'port': port}),
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

    def touched_accounts(self):
        return [c for c in self.calls if b.API in c]

    def test_rollback_refuses_when_live_release_is_another(self):
        self.link.target = self.root / 'v67/ui'
        self.docker = {b.WEB: {'Id': 'v72-web', 'running': True}}
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rollback_refuses_wrong_identity_before_touching_live(self):
        self.docker = {b.WEB: {'Id': 'v72-web', 'running': True}, b.WEB + '-rollback-v72': {'Id': 'something-else', 'running': False}}
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rollback_restores_retained_web(self):
        self.docker = {b.WEB: {'Id': 'v72-web', 'running': True}, b.WEB + '-rollback-v72': {'Id': 'v71-web', 'running': False}}
        r.rollback()
        self.assertEqual(self.docker[b.WEB]['Id'], 'v71-web')
        self.assertTrue(self.docker[b.WEB]['running'])
        self.assertEqual(self.docker[b.WEB + '-failed-v72']['Id'], 'v72-web')
        self.assertIn(['point', str(r.PRIOR / 'ui')], self.calls)
        self.assertEqual(self.created, [])
        self.assertEqual(self.touched_accounts(), [])

    def test_rollback_rebuilds_removed_web_from_snapshot(self):
        self.docker = {b.WEB: {'Id': 'v72-web', 'running': True}}
        r.rollback()
        web = self.create_for(b.WEB)
        self.assertIn('type=bind,src=' + str(r.PRIOR / 'ui') + ',dst=/usr/share/nginx/html,readonly', web)
        self.assertIn('type=bind,src=' + str(r.PRIOR / 'classroom-nginx.conf') + ',dst=/etc/nginx/conf.d/default.conf,readonly', web)
        self.assertNotIn(str(r.ROOT / 'ui'), ' '.join(web))
        self.assertIn('127.0.0.1:18790:80', web)
        self.assertEqual(web[web.index('--restart') + 1], 'unless-stopped')
        self.assertIn('release.json', web[web.index('--health-cmd') + 1])
        self.assertIn(['docker', 'start', b.WEB], self.calls)
        self.assertEqual(self.touched_accounts(), [])

    def test_rehearsal_uses_loopback_and_is_removed(self):
        self.docker = {b.WEB: {'Id': 'v71-web', 'running': True}}
        (r.ROOT / 'private' / (b.WEB + '.json')).write_text('{}')
        with patch.object(Path, 'write_text', lambda self, text, **k: None):
            r.rehearse()
        web = self.create_for(b.WEB + '-rehearsal-v72')
        self.assertIn('127.0.0.1:18806:80', web)
        self.assertEqual(web[web.index('--restart') + 1], 'no')
        self.assertIn('type=bind,src=' + str(r.PRIOR / 'ui') + ',dst=/usr/share/nginx/html,readonly', web)
        self.assertNotIn(b.WEB + '-rehearsal-v72', self.docker)
        self.assertEqual(self.docker[b.WEB]['Id'], 'v71-web')
        self.assertEqual(self.touched_accounts(), [])

    def test_new_web_gets_health_check_and_new_files(self):
        self.docker = {}
        r.clone(b.WEB)
        web = self.create_for(b.WEB)
        self.assertIn('release.json', web[web.index('--health-cmd') + 1])
        self.assertIn('type=bind,src=' + str(r.ROOT / 'ui') + ',dst=/usr/share/nginx/html,readonly', web)
        self.assertIn('127.0.0.1:18790:80', web)


if __name__ == '__main__':
    unittest.main()
