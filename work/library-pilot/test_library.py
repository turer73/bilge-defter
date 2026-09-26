"""Read-only data/API checks apart from explicit duplicate bookmark persistence tests."""
import json
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote
from server import DATA, CATALOG, ORIGIN, load_books, search
from prepare import sha, validate_url

class LibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.books = load_books()

    def test_five_distinct_intact_originals(self):
        self.assertEqual(len(self.books), 5)
        self.assertEqual(len({b['receipt']['sha256'] for b in self.books.values()}), 5)
        self.assertLess(sum(b['receipt']['bytes'] for b in self.books.values()), 500_000_000)

    def test_page_counts_labels_and_text(self):
        for b in self.books.values():
            self.assertEqual(len(b['page_data']), b['receipt']['pages'])
            self.assertEqual([p['page'] for p in b['page_data']], list(range(1, b['receipt']['pages']+1)))
            self.assertGreater(sum(bool(p['text']) for p in b['page_data']), len(b['page_data'])*.8)

    def test_license_evidence_preserved(self):
        for b in self.books.values():
            evidence = DATA / b['id'] / 'publisher.html'
            self.assertEqual(sha(evidence), b['receipt']['publisher_evidence_sha256'])
            self.assertIn(b['license_url'], evidence.read_text(encoding='utf-8'))
            self.assertTrue(b['authors'])

    def test_turkish_mapping_to_real_original_text(self):
        result = search(self.books, 'kalp')
        self.assertEqual(result['searched'], 'heart')
        self.assertTrue(result['results'])
        for r in result['results']:
            self.assertIn('heart', self.books[r['id']]['normalized'][r['page']-1])

    def test_each_source_searchable(self):
        for key in self.books:
            results = search(self.books, 'cell', key)['results']
            self.assertTrue(results, key)
            self.assertTrue(all(r['id'] == key for r in results))

    def test_empty_and_no_match(self):
        for query in ['', '!!!', 'zzzzunfindablezzzz']:
            self.assertEqual(search(self.books, query)['results'], [])

    def test_invalid_search(self):
        with self.assertRaises(ValueError): search(self.books, 'a'*121)
        with self.assertRaises(ValueError): search(self.books, 'heart', '../secret')

    def test_unapproved_download_targets_rejected(self):
        for url in ['http://lmu.pressbooks.pub/', 'https://127.0.0.1/', 'https://example.com/', 'https://user@lmu.pressbooks.pub/']:
            with self.assertRaises(ValueError): validate_url(url)

    def get(self, path, headers=None):
        return urlopen(Request(ORIGIN+path, headers=headers or {}), timeout=45)

    def test_live_search_agrees_with_index(self):
        result = json.load(self.get('/api/search?q=kalp'))
        self.assertEqual(result, search(self.books, 'kalp'))

    def test_loopback_host_and_origin(self):
        for h in [{'Host':'evil.example'}, {'Origin':'https://evil.example'}]:
            with self.assertRaises(HTTPError) as e: self.get('/api/catalog', h)
            self.assertEqual(e.exception.code, 403)

    def test_no_unrestricted_file_server(self):
        for path in ['/catalog.json', '/../../.env', '/%2e%2e/catalog.json', '/publisher.html', '/api/other']:
            with self.assertRaises(HTTPError) as e: self.get(path)
            self.assertEqual(e.exception.code, 404)

    def test_invalid_pages(self):
        for path in ['/page/msu-neuroscience/0.png', '/page/msu-neuroscience/999999.png', '/page/no-source/1.png']:
            with self.assertRaises(HTTPError) as e: self.get(path)
            self.assertEqual(e.exception.code, 400)

    def test_page_image_is_actual_png(self):
        for key in self.books:
            response=self.get(f'/page/{key}/1.png')
            self.assertEqual(response.read(8), b'\x89PNG\r\n\x1a\n')

    def test_original_download_hash_matches_reviewed_source(self):
        import hashlib
        response = self.get('/pdf/iowa-physiology-research.pdf')
        self.assertIn('attachment', response.headers['Content-Disposition'])
        digest = hashlib.sha256()
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
        self.assertEqual(digest.hexdigest(), self.books['iowa-physiology-research']['receipt']['sha256'])

    def test_post_requires_custom_header_and_validation(self):
        for body, headers, status in [({'id':'msu-neuroscience','page':1}, {},403), ({'id':'../foo','page':1},{'X-Library-Pilot':'1'},400), ({'id':'msu-neuroscience','page':True},{'X-Library-Pilot':'1'},400)]:
            with self.assertRaises(HTTPError) as e:
                urlopen(Request(ORIGIN+'/api/saved', data=json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers}),timeout=10)
            self.assertEqual(e.exception.code,status)

if __name__ == '__main__':
    unittest.main(verbosity=2)
