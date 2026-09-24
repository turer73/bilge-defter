"""Private Bilge Defter database. No central memory database dependency."""
import os
import sqlite3

MEMORY_DB = os.environ.get("BILGE_DEFTER_DB", "/data/bilge-defter.sqlite")


def get_conn(path):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    return db
