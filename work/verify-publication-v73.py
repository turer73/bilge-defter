"""Read-only v73 origin checks; no real identity, upload or notebook contents."""
from pathlib import Path

source = Path(__file__).with_name('verify-publication-v57.py').read_text()
for old, new, count in [("'v57'", "'v73'", 3), ('assert count==237', 'assert count==238', 1),
                        ("len(manifest['files'])==234", "len(manifest['files'])==235", 1),
                        ("'offline_assets':234", "'offline_assets':235", 1),
                        ("'auth_rejections':14", "'auth_rejections':16", 1),
                        ("routes=['/api/v1/bilge-defter/admin/members'", "routes=['/api/v1/bilge-defter/pdf-tools/status','/api/v1/bilge-defter/admin/members'", 1)]:
    assert source.count(old) == count, old
    source = source.replace(old, new)
exec(compile(source, __file__, 'exec'))
