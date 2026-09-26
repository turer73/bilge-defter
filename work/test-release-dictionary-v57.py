"""Release-only test: real readonly dictionary, synthetic signed user and DB."""
import hashlib
from pathlib import Path
from test_accounts_cas import env, approved, BASE
from app.api import bilge_dictionary as dictionary

def test_mounted_dictionary_signed_synthetic_account(env, monkeypatch):
    path=Path('/dictionaries/bilge_defter_dictionary.db')
    before=hashlib.sha256(path.read_bytes()).hexdigest()
    monkeypatch.setenv('BILGE_DEFTER_DICT_DB',str(path))
    client=env[0];client.app.include_router(dictionary.router);headers=approved(env)
    response=client.get(BASE+'/dictionaries',headers=headers)
    assert response.status_code==200
    counts={d['id']:d['count'] for d in response.json()['dictionaries']}
    assert counts=={'tdk-gts-v12':98995,'wikdict-en-tr':47537}
    for name,q in [('tdk-gts-v12','kalp'),('wikdict-en-tr','heart')]:
        r=client.get(BASE+f'/dictionaries/{name}/search',params={'q':q},headers=headers)
        assert r.status_code==200 and 0<len(r.json()['results'])<=25
        assert all(set(x)=={'term','def'} for x in r.json()['results'])
    assert hashlib.sha256(path.read_bytes()).hexdigest()==before
