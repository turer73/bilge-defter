"""No credentials or user content: verify origin files, auth rejection and health."""
import argparse
import hashlib
import json
import urllib.request
import urllib.error
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("root")
parser.add_argument("port", type=int)
args = parser.parse_args()
root = Path(args.root)
base = f"http://127.0.0.1:{args.port}"
count = 0
for line in (root / "SHA256SUMS").read_text().splitlines():
    digest, relative = line.split(maxsplit=1)
    relative = relative.lstrip("*")
    assert ".." not in Path(relative).parts and not relative.startswith("/")
    request = urllib.request.Request(base + "/" + relative, headers={"Host": "defter.bilgearena.com"})
    with urllib.request.urlopen(request, timeout=15) as response:
        data = response.read()
        assert "no-store" in response.headers.get("Cache-Control", "")
    assert hashlib.sha256(data).hexdigest() == digest, relative
    count += 1
for endpoint in ("/api/v1/bilge-defter/admin/members", "/api/v1/bilge-defter/backup"):
    try:
        urllib.request.urlopen(base + endpoint, timeout=15)
        raise AssertionError("Unauthenticated API accepted")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401, (endpoint, exc.code)
for endpoint in ("/classroom.env", "/SHA256SUMS", "/tests/browser_server.py", "/health", "/api/test-login"):
    try:
        urllib.request.urlopen(base + endpoint, timeout=15)
        raise AssertionError("Private path published")
    except urllib.error.HTTPError as exc:
        assert exc.code == 404, (endpoint, exc.code)
print(json.dumps({"version": "v50", "http_hashes_verified": count, "unauthenticated_rejected": 2, "private_paths_blocked": 5}))
