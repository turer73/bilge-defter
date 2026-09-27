"""Read-only v65 publication assertions; no user identity or notes."""
from pathlib import Path
source = Path(__file__).with_name('verify-publication-v64.py').read_text().replace("'v64'", "'v65'")
exec(compile(source, __file__, 'exec'))
