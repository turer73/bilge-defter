"""
Yayin sonrasi canli dogrulama: manifestteki TUM varliklar origin'den iner mi?
Kullanim: python work/verify-live-assets.py <origin>
Cikis kodu: 0 = hepsi indi, 1 = eksik/hatali varlik var.
"""

import json
import sys
import time
import urllib.request
import ssl

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://klipper-2.tail1ade8e.ts.net:8443").rstrip("/")
ctx = ssl.create_default_context()
with urllib.request.urlopen(BASE + "/offline-assets.json", context=ctx, timeout=30) as r:
    manifest = json.load(r)
files = manifest["files"]
fail = []
total = 0
start = time.time()
for f in files:
    try:
        with urllib.request.urlopen(BASE + "/" + f["path"], context=ctx, timeout=30) as r:
            total += len(r.read())
    except Exception as e:
        fail.append((f["path"], str(e)[:100]))
elapsed = time.time() - start
print(f"{BASE}: {len(files)-len(fail)}/{len(files)} varlik indi ({total/1024/1024:.1f} MB, {elapsed:.1f} sn)")
for path, err in fail:
    print("HATA", path, err)
sys.exit(1 if fail else 0)
