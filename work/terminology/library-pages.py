"""Read-only page count for the dictionary: for every concept, the English label or alias that
the library's own search matches on most pages (library-pilot/server.py: normalize, first 8
tokens, ALIASES, every token as a word prefix; ties keep the earlier term, label first), and
those pages per book. Reads library-terms.json on stdin,
checks each book's pages.json against its receipt, prints library-pages.json.
Run on the library host: python3 library-pages.py < library-terms.json > library-pages.json"""
import hashlib, json, re, sys, unicodedata
from pathlib import Path

SOURCES = Path('/opt/bilge-defter-library-v1/sources')
ALIASES = {'kalp': 'heart', 'akciger': 'lung', 'bobrek': 'kidney', 'beyin': 'brain',
           'kas': 'muscle', 'kemik': 'bone', 'hucre': 'cell', 'sinir': 'nerve',
           'noron': 'neuron', 'kan': 'blood', 'solunum': 'respiratory',
           'dolasim': 'circulation', 'homeostaz': 'homeostasis', 'doku': 'tissue'}

def normalize(text):
    text = text.lower().replace('ı', 'i')
    return ''.join(c for c in unicodedata.normalize('NFKD', text) if not unicodedata.combining(c))

raw = sys.stdin.buffer.read()
terms = json.loads(raw)
books, counts = {}, {}
for folder in sorted(p for p in SOURCES.iterdir() if (p / 'pages.json').exists()):
    data = (folder / 'pages.json').read_bytes()
    receipt = json.loads((folder / 'receipt.json').read_text(encoding='utf-8'))
    digest = hashlib.sha256(data).hexdigest()
    assert digest == receipt['index_sha256'], folder.name
    pages = json.loads(data)
    books[folder.name] = {'pages_sha256': digest, 'pages': len(pages), 'pdf_sha256': receipt['sha256']}
    counts[folder.name] = [normalize(p['text']) for p in pages]
out = {'method': 'Pages the library search matches for a term: every token (first 8, library aliases applied) found as a word prefix. Per concept the English label or alias with most pages (label wins ties). Counts, not text.',
       'terms_sha256': hashlib.sha256(raw).hexdigest(), 'books': books, 'pages': {}}

def matches(term):
    tokens = [ALIASES.get(x, x) for x in re.findall(r'[a-z0-9]+', normalize(term))[:8]]
    pats = [re.compile(r'\b' + re.escape(x) + r'\w*') for x in tokens]
    return {k: (sum(1 for text in texts if all(p.search(text) for p in pats)) if pats else 0) for k, texts in counts.items()}

for t in terms:
    best = None
    for term in t['terms']:
        found = matches(term)
        if best is None or sum(found.values()) > sum(best[1].values()):
            best = (term, found)
    out['pages'][t['id']] = {'term': best[0], 'books': best[1]}
json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
sys.stdout.write('\n')
