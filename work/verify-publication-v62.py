"""Same read-only origin assertions as v57, against v62 bytes/version (238 files, 235 offline)."""
from pathlib import Path

source = Path(__file__).with_name('verify-publication-v57.py').read_text()
for old, new, count in [("'v57'", "'v62'", 3), ('assert count==237', 'assert count==238', 1),
                        ("len(manifest['files'])==234", "len(manifest['files'])==235", 1),
                        ("'offline_assets':234", "'offline_assets':235", 1)]:
    assert source.count(old) == count, old
    source = source.replace(old, new)
exec(compile(source, __file__, 'exec'))
