import copy
import unittest
from ocr_benchmark import score, distance, normalize


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.book = {'samples': [{'id': 's1', 'writer': 'w1', 'split': 'acceptance', 'consent': True, 'reference': 'İnsan vücudu'}]}
        self.run = {'engine': 'synthetic', 'version': 'test', 'model_hash': 'a'*64,
                    'predictions': [{'id': 's1', 'text': 'İnsan vücudu', 'latency_ms': 10}]}

    def test_exact(self):
        r = score(self.book, self.run)
        self.assertEqual(r['summary']['cer'], 0)
        self.assertEqual(r['acceptance'], 'not_decided')

    def test_turkish_not_folded(self):
        self.assertNotEqual(normalize('ı'), normalize('i'))
        self.assertNotEqual(normalize('İ'), normalize('I'))
        self.assertEqual(normalize('s\u0327'), 'ş')

    def test_blank_failure_counts(self):
        self.run['predictions'][0]['text'] = ''
        self.assertEqual(score(self.book, self.run)['summary']['wer'], 1)

    def test_missing_duplicate_extra_predictions(self):
        for predictions in ([], self.run['predictions']*2, [{'id': 'unknown', 'text': '', 'latency_ms': 0}]):
            with self.assertRaises(ValueError):
                score(self.book, self.run | {'predictions': predictions})

    def test_consent_empty_and_leakage(self):
        for patch in ({'consent': False}, {'reference': ''}):
            book = copy.deepcopy(self.book);book['samples'][0].update(patch)
            with self.assertRaises(ValueError):score(book, self.run)
        book = copy.deepcopy(self.book);book['samples'].append(book['samples'][0] | {'id': 's2', 'split': 'tuning'})
        with self.assertRaises(ValueError):score(book, self.run)
        with self.assertRaises(ValueError):score({'samples': []}, self.run)

    def test_latency_validation(self):
        for t in (-1, float('nan'), float('inf'), True, '10'):
            run = copy.deepcopy(self.run);run['predictions'][0]['latency_ms'] = t
            with self.assertRaises(ValueError):score(self.book, run)

    def test_insertions_can_exceed_one(self):
        self.book['samples'][0]['reference'] = 'a'
        self.run['predictions'][0]['text'] = 'a b c d'
        self.assertGreater(score(self.book, self.run)['summary']['cer'], 1)
        self.assertEqual(distance('abc', 'adc'), 1)

    def test_model_identity_required(self):
        with self.assertRaises(ValueError):score(self.book, self.run | {'model_hash': 'unknown'})


if __name__ == '__main__':unittest.main()
