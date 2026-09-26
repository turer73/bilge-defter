"""Explicit allowlist bundle: no local bookmark/test data, credentials or app release assets."""
import hashlib
import json
from pathlib import Path
import tarfile
from prepare import HERE, ROOT, DATA, CATALOG
from server import load_books

OUT=ROOT/'outputs/library-pilot-release'
FILES=['server.py','prepare.py','hosted.py','textview.py','quote.js','catalog.json','accepted-sources.json','app.js','index.html','style.css','test_hosted.py']
if __name__=='__main__':
    load_books()
    OUT.mkdir(exist_ok=True)
    paths={f'code/{name}':HERE/name for name in FILES}
    for s in CATALOG['sources']:
        for name in ['original.pdf','pages.json','publisher.html','receipt.json']:
            paths[f'sources/{s["id"]}/{name}']=DATA/s['id']/name
    manifest={}
    with tarfile.open(OUT/'bundle.tar','w') as archive:
        for name,path in paths.items():
            with path.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
            manifest[name]=digest
            archive.add(path,arcname=name,recursive=False)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'files':len(manifest),'bytes':(OUT/'bundle.tar').stat().st_size}))
