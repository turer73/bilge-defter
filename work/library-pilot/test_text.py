import copy,unittest
from html import escape
from unittest.mock import patch
from server import load_books
from textview import render_text
from test_hosted import Handler,A,B

class TextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.books=load_books()
    def test_each_source_exact_text_and_attribution(self):
        for b in self.books.values():
            p=next(p for p in b['page_data'] if len(p['text'])>100)
            html=render_text(b,p['page'],A)
            for value in [p['text'],b['authors'],b['license'],b['url'],b['license_url']]:self.assertIn(escape(value),html)
            self.assertIn('<html lang="en">',html);self.assertIn('translate="yes"',html)
    def test_unsafe_extracted_text_is_escaped(self):
        b=copy.deepcopy(next(iter(self.books.values())));b['page_data'][0]['text']='<script>alert(1)</script><img src=x onerror=alert(1)>'
        html=render_text(b,1,A);self.assertEqual(html.count('<script'),1);self.assertNotIn('<img',html);self.assertIn('&lt;script&gt;',html)
        self.assertIn('<script defer src="../../quote.js?account='+A+'"></script>',html)
    def test_blank_text_explains_no_ocr(self):
        b=copy.deepcopy(next(iter(self.books.values())));b['page_data'][0]['text']=' '
        html=render_text(b,1,A);self.assertIn('id="emptyText"',html);self.assertNotIn('id="sourceText"',html)
    def test_page_boundaries(self):
        b=next(iter(self.books.values()))
        for n in [0,-1,True,len(b['page_data'])+1]:
            with self.assertRaises(ValueError):render_text(b,n,A)
        self.assertNotIn('← Önceki sayfa',render_text(b,1,A))
        self.assertNotIn('Sonraki sayfa →',render_text(b,len(b['page_data']),A))
    def test_metadata_and_no_external_translation(self):
        html=render_text(self.books['msu-neuroscience'],14,A)
        self.assertIn('source=msu-neuroscience&amp;page=14',html)
        self.assertIn('account='+A,html);self.assertIn('PDF sayfası 14',html)
        self.assertEqual(html.count('<script'),1);self.assertNotIn('translate.google',html)
        self.assertIn('klinik',html.lower());self.assertIn('sağlayıcısına',html)
    def test_hosted_success_and_account_binding(self):
        h=Handler('/read/msu-neuroscience/14?account='+A);h.headers.pop('X-Library-Account');h.books=self.books
        with patch('hosted.verified_identity',return_value=A):h.do_GET()
        self.assertEqual(h.result[0],200);self.assertIn('id="sourceText"',h.result[1])
        h=Handler('/read/msu-neuroscience/14?account='+B);h.headers.pop('X-Library-Account')
        with patch('hosted.verified_identity',return_value=A):h.do_GET()
        self.assertEqual(h.result[0],409)
    def test_hosted_missing_and_revoked(self):
        for path in ['/read/msu-neuroscience/14','/read/msu-neuroscience/14?account='+A]:
            h=Handler(path);h.headers.pop('X-Library-Account');h.books=self.books
            with patch('hosted.verified_identity',side_effect=PermissionError('expired')):h.do_GET()
            self.assertEqual(h.result[0],401)
    def test_quote_script_requires_matching_account(self):
        for account,expected in [(A,200),(B,409),('',409)]:
            h=Handler('/quote.js?account='+account);h.headers.pop('X-Library-Account')
            with patch('hosted.verified_identity',return_value=A):h.do_GET()
            self.assertEqual(h.result[0],expected)
        h=Handler('/quote.js?account='+A)
        with patch('hosted.verified_identity',side_effect=PermissionError('revoked')):h.do_GET()
        self.assertEqual(h.result[0],401)
    def test_hosted_invalid_source_and_page(self):
        for path in ['/read/missing/1','/read/msu-neuroscience/0','/read/msu-neuroscience/999999']:
            h=Handler(path);h.books=self.books
            with patch('hosted.verified_identity',return_value=A):h.do_GET()
            self.assertEqual(h.result[0],400)

if __name__=='__main__':unittest.main(verbosity=2)
