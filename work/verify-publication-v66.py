"""Read-only v66 publication assertions (web only; 238 files, 235 offline); no user identity or notes."""
from pathlib import Path
source = Path(__file__).with_name('verify-publication-v64.py').read_text()
assert source.count("'v64'") == 1
source = source.replace("'v64'", "'v66'")
exec(compile(source, __file__, 'exec'))
