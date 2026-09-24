"""Offline scoring of recorded OCR outputs; never runs models or uploads notes."""
import argparse
import hashlib
import json
import math
import statistics
import unicodedata
from pathlib import Path


def normalize(text):
    if not isinstance(text, str):
        raise ValueError('Text must be a string')
    return ' '.join(unicodedata.normalize('NFC', text).split())


def distance(a, b):
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1,
                               previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def dataset(book):
    samples = book.get('samples')
    if not isinstance(samples, list) or not samples:
        raise ValueError('Nonempty samples required; no data is not zero error')
    indexed, writers = {}, {}
    for s in samples:
        if s.get('consent') is not True:
            raise ValueError('Explicit sample consent required')
        for field in ('id', 'writer', 'split'):
            if not isinstance(s.get(field), str) or not s[field].strip():
                raise ValueError('Missing '+field)
        if s['split'] not in ('tuning', 'acceptance', 'smoke'):
            raise ValueError('Unknown split')
        if s['id'] in indexed:
            raise ValueError('Duplicate sample')
        if s['writer'] in writers and writers[s['writer']] != s['split']:
            raise ValueError('Writer leakage between splits')
        if not normalize(s.get('reference')):
            raise ValueError('Empty reference requires a separate false-positive test')
        writers[s['writer']] = s['split']
        indexed[s['id']] = s
    return indexed


def aggregate(rows):
    chars = sum(r['characters'] for r in rows)
    words = sum(r['words'] for r in rows)
    times = sorted(r['latency_ms'] for r in rows)
    return {'samples': len(rows),
            'cer': sum(r['character_errors'] for r in rows) / chars,
            'wer': sum(r['word_errors'] for r in rows) / words,
            'latency_median_ms': statistics.median(times),
            'latency_p95_ms': times[math.ceil(.95 * len(times)) - 1]}


def score(book, run):
    samples = dataset(book)
    if not all(isinstance(run.get(k), str) and run[k].strip()
               for k in ('engine', 'version', 'model_hash')):
        raise ValueError('Engine, version and model hash required')
    digest = run['model_hash']
    if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('Expected lowercase SHA256 model/bundle hash')
    predictions = run.get('predictions')
    if not isinstance(predictions, list):
        raise ValueError('Predictions must be a list')
    by_id = {}
    for p in predictions:
        if p.get('id') in by_id:
            raise ValueError('Duplicate prediction')
        by_id[p.get('id')] = p
    if set(samples) != set(by_id):
        raise ValueError('Prediction IDs must exactly match samples, including failures')
    rows = []
    for identity, s in samples.items():
        p = by_id[identity]
        latency = p.get('latency_ms')
        if isinstance(latency, bool) or not isinstance(latency, (int, float)) or not math.isfinite(latency) or latency < 0:
            raise ValueError('Finite nonnegative measured latency required')
        reference, text = normalize(s['reference']), normalize(p.get('text'))
        rows.append({'id': identity, 'writer': s['writer'], 'split': s['split'],
                     'characters': len(reference), 'words': len(reference.split()),
                     'character_errors': distance(reference, text),
                     'word_errors': distance(reference.split(), text.split()),
                     'latency_ms': latency})
    return {k: run[k] for k in ('engine', 'version', 'model_hash')} | {
        'summary': aggregate(rows),
        'by_writer': {w: aggregate([r for r in rows if r['writer'] == w]) for w in sorted({r['writer'] for r in rows})},
        'by_split': {s: aggregate([r for r in rows if r['split'] == s]) for s in sorted({r['split'] for r in rows})},
        'rows': rows, 'acceptance': 'not_decided', 'physical_device': 'not_measured'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('samples', type=Path)
    parser.add_argument('runs', type=Path, nargs='+')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        raise ValueError('Refuse to overwrite an existing report')
    raw = args.samples.read_bytes()
    book = json.loads(raw)
    report = {'dataset_sha256': hashlib.sha256(raw).hexdigest(),
              'normalization': 'NFC + whitespace; case and Turkish letters preserved',
              'runs': [score(book, json.loads(p.read_bytes())) for p in args.runs]}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    print('Recorded OCR runs scored; no quality acceptance asserted.')


if __name__ == '__main__':
    main()
