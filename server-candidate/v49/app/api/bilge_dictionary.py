"""Bounded read-only dictionaries; same approved-account gate as notebook APIs.

Mount a consistent dictionary SQLite snapshot at /dictionaries, read-only.
Never mount the central memory DB or forward an admin key to this service.
"""
import os
from pathlib import Path
import re
import sqlite3
import time
from contextlib import closing
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.bilge_defter import account_guard

router = APIRouter(prefix='/api/v1/bilge-defter', dependencies=[Depends(account_guard)])
_TR = str.maketrans('İIĞÜŞÖÇÂÎÛ', 'iığüşöçâîû')


def tr_lower(value):
    return value.translate(_TR).lower()


def connect():
    path = Path(os.environ.get('BILGE_DEFTER_DICT_DB', '/dictionaries/bilge_defter_dictionary.db')).resolve()
    # mode=ro must fail on a missing file; it must never create an empty DB.
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=0.5)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    deadline = time.monotonic() + 0.5
    db.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    return db


@router.get('/dictionaries')
def list_dictionaries():
    try:
        with closing(connect()) as db:
            rows = db.execute('SELECT id,name,source,term_count FROM bilge_defter_dictionaries ORDER BY id LIMIT 20').fetchall()
        return {'dictionaries': [{'id': r['id'], 'name': r['name'], 'source': r['source'], 'count': r['term_count']} for r in rows]}
    except sqlite3.Error:
        raise HTTPException(503, 'Sunucu sozlugu su anda kullanilamiyor') from None


@router.get('/dictionaries/{dict_id}/search')
def search_dictionary(dict_id: str, q: str = Query(..., max_length=120), limit: int = Query(25, ge=1, le=50)):
    if not re.fullmatch(r'[a-z0-9_-]{1,40}', dict_id):
        raise HTTPException(400, 'Sozluk kimligi gecersiz')
    query = tr_lower(q.strip())
    literal = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    prefix, substring = literal + '%', '%' + literal + '%'
    try:
        with closing(connect()) as db:
            if not db.execute('SELECT 1 FROM bilge_defter_dictionaries WHERE id=?', (dict_id,)).fetchone():
                raise HTTPException(404, 'Sozluk bulunamadi')
            if not query:
                return {'results': []}
            rows = db.execute("""SELECT term, def FROM bilge_defter_dictionary_entries
                WHERE dict_id=? AND (term_norm LIKE ? ESCAPE '\\' OR term_norm LIKE ? ESCAPE '\\' OR def_norm LIKE ? ESCAPE '\\')
                ORDER BY CASE WHEN term_norm=? THEN 0 WHEN term_norm LIKE ? ESCAPE '\\' THEN 1
                              WHEN term_norm LIKE ? ESCAPE '\\' THEN 2 ELSE 3 END, term LIMIT ?""",
                (dict_id, prefix, substring, substring, query, prefix, substring, limit)).fetchall()
        return {'results': [{'term': r['term'], 'def': r['def']} for r in rows]}
    except sqlite3.Error:
        raise HTTPException(503, 'Sunucu sozlugu su anda kullanilamiyor') from None
