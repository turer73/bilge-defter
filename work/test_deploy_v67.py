"""Offline checks for deploy-v67 rollback: the v66 tests against the v67 script (fake Docker)."""
import pathlib
import unittest

_src = pathlib.Path(__file__).with_name('test_deploy_v66.py').read_text(encoding='utf-8')
_src = _src.replace('v66', 'v67').replace('v65', 'v66')
exec(compile(_src, str(pathlib.Path(__file__).with_name('test_deploy_v66.py')), 'exec'))

if __name__ == '__main__':
    unittest.main()
