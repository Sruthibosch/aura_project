"""Self-contained vector store: FAISS holds embeddings, SQLite holds chunk text/metadata."""
from pathlib import Path
import sqlite3

import numpy as np
import faiss

STORE_DIR = Path(__file__).resolve().parent / 'vector_store_data'
INDEX_PATH = STORE_DIR / 'index.faiss'
METADATA_DB_PATH = STORE_DIR / 'metadata.db'
EMBEDDING_DIM = 1536


def _connect_metadata_db():
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(METADATA_DB_PATH))
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        '''
    )
    return conn


def _load_index():
    if INDEX_PATH.exists():
        return faiss.read_index(str(INDEX_PATH))
    return faiss.IndexIDMap(faiss.IndexFlatIP(EMBEDDING_DIM))


def _save_index(index):
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_PATH))


def _normalize(vector):
    arr = np.array(vector, dtype='float32')
    norm = np.linalg.norm(arr)
    if norm == 0:
        return arr
    return arr / norm


def add_chunk(document_id: int, chunk_index: int, chunk_text: str, vector) -> int:
    """Persists chunk text to SQLite and its embedding to FAISS, keyed by the same row id."""
    conn = _connect_metadata_db()
    try:
        cursor = conn.execute(
            'INSERT INTO chunks (document_id, chunk_index, chunk_text) VALUES (?, ?, ?)',
            (document_id, chunk_index, chunk_text),
        )
        chunk_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()

    index = _load_index()
    normalized = _normalize(vector).reshape(1, -1)
    index.add_with_ids(normalized, np.array([chunk_id], dtype='int64'))
    _save_index(index)
    return chunk_id


def search(query_vector, k: int = 4, document_id: int | None = None):
    """Returns up to k {id, document_id, chunk_text, score} matches, optionally scoped to a document."""
    index = _load_index()
    if index.ntotal == 0:
        return []

    # Widen the search when scoping to a single document since a flat index has no metadata filter.
    fetch_k = k * 5 if document_id is not None else k
    fetch_k = min(fetch_k, index.ntotal)

    normalized_query = _normalize(query_vector).reshape(1, -1)
    scores, ids = index.search(normalized_query, fetch_k)

    candidate_ids = [int(chunk_id) for chunk_id in ids[0] if chunk_id != -1]
    if not candidate_ids:
        return []

    conn = _connect_metadata_db()
    try:
        placeholders = ','.join('?' for _ in candidate_ids)
        rows = conn.execute(
            f'SELECT id, document_id, chunk_text FROM chunks WHERE id IN ({placeholders})',
            candidate_ids,
        ).fetchall()
    finally:
        conn.close()

    metadata_by_id = {row[0]: {'document_id': row[1], 'chunk_text': row[2]} for row in rows}
    score_by_id = {int(chunk_id): float(score) for chunk_id, score in zip(ids[0], scores[0]) if chunk_id != -1}

    results = []
    for chunk_id in candidate_ids:
        meta = metadata_by_id.get(chunk_id)
        if not meta:
            continue
        if document_id is not None and meta['document_id'] != document_id:
            continue
        results.append(
            {
                'id': chunk_id,
                'document_id': meta['document_id'],
                'chunk_text': meta['chunk_text'],
                'score': score_by_id.get(chunk_id, 0.0),
            }
        )
        if len(results) >= k:
            break

    return results
