"""Signed synthetic identities and isolated SQLite only; no production users."""
import hashlib
import sqlite3
from contextlib import closing
import pytest
from app.api import bilge_dictionary as dictionary
from test_accounts_cas import env, headers, approved, owner_headers, STUDENT, OWNER, BASE


@pytest.fixture
def setup(env, tmp_path, monkeypatch):
    target = tmp_path / 'dictionary.sqlite'
    with closing(sqlite3.connect(target)) as db, db:
        db.execute('CREATE TABLE bilge_defter_dictionaries (id TEXT PRIMARY KEY,name TEXT,source TEXT,term_count INTEGER)')
        db.execute('CREATE TABLE bilge_defter_dictionary_entries (dict_id TEXT,term TEXT,def TEXT,term_norm TEXT,def_norm TEXT)')
        db.execute("INSERT INTO bilge_defter_dictionaries VALUES ('tdk','Turkce','Synthetic test',4)")
        for term, definition in [('kalp','Yürek'), ('kalp kası','Kalp dokusu'), ('ışık','IŞIK'), ('yüzde%','Oran')]:
            db.execute('INSERT INTO bilge_defter_dictionary_entries VALUES (?,?,?,?,?)', ('tdk',term,definition,dictionary.tr_lower(term),dictionary.tr_lower(definition)))
    monkeypatch.setenv('BILGE_DEFTER_DICT_DB', str(target))
    env[0].app.include_router(dictionary.router)
    return env, target


def test_dictionary_approved_search_readonly(setup):
    env, target=setup; c=env[0]; h=approved(env); before=hashlib.sha256(target.read_bytes()).hexdigest()
    assert c.get(BASE+'/dictionaries',headers=h).json()['dictionaries'][0]['count']==4
    assert c.get(BASE+'/dictionaries/tdk/search',params={'q':'KALP'},headers=h).json()['results'][0]['term']=='kalp'
    assert c.get(BASE+'/dictionaries/tdk/search',params={'q':'IŞIK'},headers=h).json()['results'][0]['term']=='ışık'
    assert c.get(BASE+'/dictionaries/tdk/search',params={'q':'YÜREK'},headers=h).json()['results'][0]['term']=='kalp'
    assert len(c.get(BASE+'/dictionaries/tdk/search',params={'q':'kalp','limit':1},headers=h).json()['results'])==1
    assert c.get(BASE+'/dictionaries/tdk/search',params={'q':'%'},headers=h).json()['results']==[{'term':'yüzde%','def':'Oran'}]
    assert c.get(BASE+'/dictionaries/tdk/search',params={'q':"' OR 1=1 --"},headers=h).json()['results']==[]
    assert hashlib.sha256(target.read_bytes()).hexdigest()==before
    with closing(dictionary.connect()) as db:
        with pytest.raises(sqlite3.OperationalError):db.execute('DELETE FROM bilge_defter_dictionaries')


@pytest.mark.parametrize('path',['/dictionaries','/dictionaries/tdk/search?q=kalp'])
def test_dictionary_identity_gate(setup,path):
    env,_=setup; c=env[0]
    assert c.get(BASE+path).status_code==401
    assert c.get(BASE+path,headers={'Cf-Access-Authenticated-User-Email':OWNER}).status_code==401
    assert c.get(BASE+path,headers={'Cf-Access-Jwt-Assertion':'forged'}).status_code==401
    c.post(BASE+'/registration',headers=headers(env))
    assert c.get(BASE+path,headers=headers(env)).status_code==403
    h=approved(env)
    assert c.get(BASE+path,headers={**h,'X-Bilge-Account':'other-account'}).status_code==409
    assert c.get(BASE+path,headers=headers(env,claims={'exp':1})).status_code==401
    c.post(BASE+'/admin/members/'+h['X-Bilge-Account'],headers=owner_headers(env),json={'status':'suspended'})
    assert c.get(BASE+path,headers=h).status_code==403


def test_dictionary_limits_missing_and_unknown(setup,monkeypatch):
    env,target=setup; c=env[0];h=approved(env);url=BASE+'/dictionaries/tdk/search'
    for params in [{'q':'a'*121},{'q':'kalp','limit':51},{'q':'kalp','limit':0}]:assert c.get(url,params=params,headers=h).status_code==422
    assert c.get(url,params={'q':'  '},headers=h).json()=={'results':[]}
    assert c.get(BASE+'/dictionaries/unknown/search?q=kalp',headers=h).status_code==404
    missing=target.parent/'missing.sqlite';monkeypatch.setenv('BILGE_DEFTER_DICT_DB',str(missing))
    assert c.get(BASE+'/dictionaries',headers=h).status_code==503
    assert not missing.exists()
