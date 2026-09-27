"""Container health command: python3 /srv/library/healthcheck.py.

Local readiness only, not proof of Cloudflare login or end-user acceptance.
"""
import json
from urllib.request import build_opener, ProxyHandler


def check():
    with build_opener(ProxyHandler({})).open('http://127.0.0.1:8080/healthz', timeout=3) as response:
        body = json.loads(response.read(1024))
        if response.status != 200 or body != {'status': 'ok', 'service': 'bilge-defter-library'}:
            raise RuntimeError('Library not ready')


if __name__ == '__main__':
    check()
