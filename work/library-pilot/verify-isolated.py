"""Start an ephemeral loopback test server; no existing bookmark data is used."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

HERE=Path(__file__).resolve().parent
OUT=HERE.parents[1]/'outputs/v57-library'
SOURCES=Path(os.environ['LIBRARY_TEST_SOURCES']).resolve()
OUT.mkdir(parents=True,exist_ok=True)

with tempfile.TemporaryDirectory(prefix='fixture-',dir=OUT) as folder:
    data=Path(folder)
    catalog=json.loads((HERE/'catalog.json').read_text(encoding='utf-8'))
    for item in catalog['sources']:
        dest=data/item['id'];dest.mkdir()
        for name in ('original.pdf','pages.json','publisher.html','receipt.json'):
            # Read-only source payloads; generated cache and saved.json are separate.
            os.link(SOURCES/item['id']/name,dest/name)
    os.environ['LIBRARY_DATA']=str(data)
    os.environ['LIBRARY_CACHE']=str(data/'rendered')
    import server
    server.Handler.books=server.load_books()
    httpd=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
    server.PORT=httpd.server_port;server.ORIGIN=f'http://127.0.0.1:{httpd.server_port}'
    thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
    try:
        subprocess.run([os.environ.get('NODE_BINARY','node'),str(HERE/'smoke-isolated.cjs'),server.ORIGIN,str(OUT)],check=True)
        suite=unittest.defaultTestLoader.discover(str(HERE),pattern='test_*.py')
        result=unittest.TextTestRunner(verbosity=1).run(suite)
        if not result.wasSuccessful():raise SystemExit(1)
        (OUT/'proof.json').write_text(json.dumps({'tests':result.testsRun,'failures':0,'sourceData':'licensed originals','bookmarkData':'isolated synthetic','physicalDevice':False},indent=2),encoding='utf-8')
    finally:
        httpd.shutdown();httpd.server_close();thread.join(timeout=5)
