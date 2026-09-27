"""Same read-only origin assertions as v57, against v58 bytes/version."""
from pathlib import Path

source = Path(__file__).with_name('verify-publication-v57.py').read_text()
assert source.count("'v57'") == 3
exec(compile(source.replace("'v57'", "'v58'"), __file__, 'exec'))
