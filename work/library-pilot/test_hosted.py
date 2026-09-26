"""Synthetic accounts only. Never creates or alters a production user."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import hosted
from prepare import CATALOG

A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'

class Response(io.BytesIO):
    status=200
    headers={'Content-Type':'application/json'}

class Handler(hosted.InvitedHandler):
    def __init__(self, path='/api/saved', account=A, method='GET', body=None):
        self.path=path
        self.headers={'Host':'defter.bilgearena.com','Origin':hosted.ORIGIN,'Cf-Access-Jwt-Assertion':account,'X-Library-Account':account,'X-Library-Pilot':'1','Content-Type':'application/json'}
        payload=json.dumps(body).encode() if body is not None else b''
        self.headers['Content-Length']=str(len(payload));self.rfile=io.BytesIO(payload)
        self.books={s['id']:{'receipt':{'pages':2000}} for s in CATALOG['sources']}
    def reply(self,data,kind='application/json',status=200,download=None):
        self.result=(status,data)

class HostedTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.old=hosted.STATE;hosted.STATE=Path(self.temp.name)
    def tearDown(self):
        hosted.STATE=self.old;self.temp.cleanup()
    def token_response(self,identity,protocol='approval-v1'):
        return Response(json.dumps({'identity':identity,'account_protocol':protocol}).encode())
    def test_empty_token_rejected_without_network(self):
        with patch('hosted.build_opener') as opener:
            with self.assertRaises(PermissionError):hosted.verified_identity('')
            opener.assert_not_called()
    def test_approved_identity_only(self):
        with patch('hosted.build_opener') as opener:
            opener.return_value.open.return_value=self.token_response({'id':A,'type':'access','status':'approved'})
            self.assertEqual(hosted.verified_identity('synthetic'),A)
            request=opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url,hosted.UPSTREAM)
            self.assertNotIn('Cookie',request.headers)
    def test_denied_identity_shapes(self):
        for status in ['pending','rejected','suspended','unregistered',None]:
            with patch('hosted.build_opener') as opener:
                opener.return_value.open.return_value=self.token_response({'id':A,'type':'access','status':status})
                with self.assertRaises(PermissionError):hosted.verified_identity('synthetic')
        for identity in [{'id':A,'type':'device','status':'approved'},{'id':'../../x','type':'access','status':'approved'}]:
            with patch('hosted.build_opener') as opener:
                opener.return_value.open.return_value=self.token_response(identity)
                with self.assertRaises(PermissionError):hosted.verified_identity('synthetic')
    def test_upstream_failure_fail_closed(self):
        h=Handler()
        with patch('hosted.verified_identity',side_effect=RuntimeError('unavailable')):h.do_GET()
        self.assertEqual(h.result[0],503)
    def test_user_isolation_persistence_duplicate(self):
        item={'id':'msu-neuroscience','page':14}
        self.assertEqual(hosted.saved(A,item),[item]);self.assertEqual(hosted.saved(B),[])
        self.assertEqual(hosted.saved(A,item),[item]);self.assertEqual(hosted.saved(A),[item])
    def test_save_cannot_target_another_account(self):
        h=Handler(body={'id':'msu-neuroscience','page':14,'account':B})
        with patch('hosted.verified_identity',return_value=A):h.do_POST()
        self.assertEqual(h.result[0],200);self.assertEqual(hosted.saved(B),[])
    def test_switched_account_blocked(self):
        h=Handler(account=A,body={'id':'msu-neuroscience','page':14})
        with patch('hosted.verified_identity',return_value=B):h.do_POST()
        self.assertEqual(h.result[0],409);self.assertEqual(hosted.saved(A),[]);self.assertEqual(hosted.saved(B),[])
    def test_origin_host_and_csrf_rejected(self):
        for header,value in [('Origin','https://evil.example'),('Host','evil.example'),('X-Library-Pilot','')]:
            h=Handler(body={'id':'msu-neuroscience','page':1});h.headers[header]=value
            with patch('hosted.verified_identity',return_value=A):h.do_POST()
            self.assertEqual(h.result[0],403)
    def test_missing_origin_rejected(self):
        h=Handler(body={'id':'msu-neuroscience','page':1});h.headers.pop('Origin')
        with patch('hosted.verified_identity',return_value=A):h.do_POST()
        self.assertEqual(h.result[0],403)
    def test_bad_body_and_bounds(self):
        for item in [[],{}, {'id':[],'page':1},{'id':'msu-neuroscience','page':True},{'id':'msu-neuroscience','page':0}]:
            h=Handler(body=item)
            with patch('hosted.verified_identity',return_value=A):h.do_POST()
            self.assertEqual(h.result[0],400)
    def test_quota_is_per_user(self):
        with hosted.connect() as db:
            db.executemany('INSERT INTO bookmarks VALUES (?,?,?)',[(A,'msu-neuroscience',p) for p in range(1,501)])
        db.close()
        with self.assertRaises(ValueError):hosted.saved(A,{'id':'msu-neuroscience','page':501})
        self.assertEqual(len(hosted.saved(B,{'id':'msu-neuroscience','page':1})),1)
    def test_download_account_binding(self):
        h=Handler('/pdf/msu-neuroscience.pdf?account='+B);h.headers.pop('X-Library-Account')
        with patch('hosted.verified_identity',return_value=A):self.assertFalse(h.authorize())
        self.assertEqual(h.result[0],409)
    def test_revoked_before_next_read(self):
        h=Handler()
        with patch('hosted.verified_identity',side_effect=PermissionError('revoked')):h.do_GET()
        self.assertEqual(h.result[0],401)

if __name__=='__main__':unittest.main(verbosity=2)
