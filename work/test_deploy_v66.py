"""Offline checks for deploy-v66 rollback; fake Docker, no network or production access."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy66', Path(__file__).with_name('deploy-v66.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
b = r.b


def snapshot(root):
    return {'Id': 'v65-web', 'Image': b.WEBIMAGE, 'NetworkSettings': {'Networks': {'bilge-defter-classroom': {}}},
            'Config': {'Env': ['SAFE=1'], 'User': '', 'WorkingDir': '', 'Entrypoint': ['/docker-entrypoint.sh'], 'Cmd': ['nginx', '-g', 'daemon off;']},
            'HostConfig': {'ReadonlyRootfs': True, 'Privileged': False, 'RestartPolicy': {'Name': 'unless-stopped'},
                           'Memory': 134217728, 'PidsLimit': 100, 'NanoCpus': 500000000, 'CapDrop': ['ALL'],
                           'SecurityOpt': ['no-new-privileges:true'], 'Tmpfs': {'/tmp': 'rw'}},
            'Mounts': [{'Type': 'bind', 'Source': str(root / 'v65/ui'), 'Destination': '/usr/share/nginx/html', 'RW': False},
                       {'Type': 'bind', 'Source': str(root / 'v65/classroom-nginx.conf'), 'Destination': '/etc/nginx/conf.d/default.conf', 'RW': False}]}


class Rollback(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / 'v66/private').mkdir(parents=True)
        self.saved = (b.ROOT, b.PRIOR)
        b.ROOT, b.PRIOR = root / 'v66', root / 'v65'
        self.snap = snapshot(root)
        self.docker = {}
        self.calls = []
        self.created = []

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
                self.docker[name] = {'Id': 'recreated-' + name, 'running': False}
            return ''

        self.patches = [patch.object(b, 'inspect', inspect), patch.object(b, 'run', run),
                        patch.object(b, 'load', lambda name: self.snap),
                        patch.object(r, 'protected', lambda: {'same': True}),
                        patch.object(r, 'point', lambda path: self.calls.append(['point', str(path)])),
                        patch.object(r, 'verify_prior', lambda port: {'port': port})]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        b.ROOT, b.PRIOR = self.saved
        self.tmp.cleanup()

    def test_retained_container_is_restored(self):
        self.docker = {b.WEB: {'Id': 'v66-web', 'running': True}, b.WEB + '-rollback-v66': {'Id': 'v65-web', 'running': False}}
        r.rollback()
        self.assertEqual(self.docker[b.WEB]['Id'], 'v65-web')
        self.assertTrue(self.docker[b.WEB]['running'])
        self.assertEqual(self.docker[b.WEB + '-failed-v66']['Id'], 'v66-web')
        self.assertEqual(self.created, [])
        self.assertIn(['point', str(b.PRIOR / 'ui')], self.calls)

    def test_pruned_container_is_recreated_from_snapshot(self):
        self.docker = {b.WEB: {'Id': 'v66-web', 'running': True}}
        r.rollback()
        self.assertEqual(len(self.created), 1)
        args = self.created[0]
        self.assertIn('type=bind,src=' + str(b.PRIOR / 'ui') + ',dst=/usr/share/nginx/html,readonly', args)
        self.assertIn('type=bind,src=' + str(b.PRIOR / 'classroom-nginx.conf') + ',dst=/etc/nginx/conf.d/default.conf,readonly', args)
        self.assertNotIn(str(b.ROOT / 'ui'), ' '.join(args))
        self.assertIn('127.0.0.1:18790:80', args)
        self.assertEqual(args[args.index('--restart') + 1], 'unless-stopped')
        self.assertTrue(self.docker[b.WEB]['running'])
        self.assertEqual(self.docker[b.WEB + '-failed-v66']['Id'], 'v66-web')

    def test_wrong_rollback_identity_is_refused_before_touching_live(self):
        self.docker = {b.WEB: {'Id': 'v66-web', 'running': True}, b.WEB + '-rollback-v66': {'Id': 'something-else', 'running': False}}
        with self.assertRaises(RuntimeError):
            r.rollback()
        self.assertEqual(self.calls, [])

    def test_rehearsal_uses_loopback_port_and_removes_container(self):
        (b.ROOT / 'private' / (b.WEB + '.json')).write_text('{}')
        self.docker = {b.WEB: {'Id': 'v66-web', 'running': True}}
        with patch.object(Path, 'write_text', lambda self, text: None):
            r.rehearse()
        args = self.created[0]
        self.assertIn('127.0.0.1:18806:80', args)
        self.assertNotIn('127.0.0.1:18790:80', args)
        self.assertEqual(args[args.index('--restart') + 1], 'no')
        self.assertNotIn(r.REHEARSAL, self.docker)
        self.assertEqual(self.docker[b.WEB]['Id'], 'v66-web')


if __name__ == '__main__':
    unittest.main()
