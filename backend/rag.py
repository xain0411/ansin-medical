"""backend/rag.py — 真正的 RAG：pgvector 向量檢索增強生成

流程：
  1. init_rag_table()   — 啟動時建立 rag_chunks 資料表與 pgvector extension
  2. index_all_documents() — 讀取 RAG資料庫/*.txt，分塊 → embed → 存入 DB
  3. retrieve(query, role) — embed query → cosine 相似度搜尋 → 回傳最相關片段
"""
from __future__ import annotations

import os

from backend.database import get_conn
from backend.openai_client import get_openai_client, is_openai_configured

_RAG_DIR = os.path.join(os.path.dirname(__file__), "..", "RAG資料庫")
_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIMS = 1536
_CHUNK_SIZE = 400
_CHUNK_OVERLAP = 80
_TOP_K = 4

# 資料夾名稱 → role key
_FOLDER_TO_ROLE: dict[str, str] = {
    "護理師": "nurse",
    "住院醫師": "resident",
    "主治醫師": "attending",
}

_FALLBACKS = {
    "nurse": "護理師可獨立處理：生命徵象監測、傷口換藥、給藥、術後照護、衛教指導。需轉介醫師：新症狀、藥物調整、診斷需求。",
    "resident": "住院醫師可在主治指導下：一般醫療諮詢、常規藥物調整、初步評估。需上報主治：診斷不確定、病情惡化、高風險決策。",
    "attending": "主治醫師負責：最終診斷、複雜病情評估、手術評估、跨科會診、出院計劃、危急病情第一責任人。",
}


# ── 文字分塊 ─────────────────────────────────────────────────

def _chunk_text(text: str) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = start + _CHUNK_SIZE
        chunk = text[start:end].strip()
        if len(chunk) > 50:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - _CHUNK_OVERLAP
    return chunks


# ── Embedding ────────────────────────────────────────────────

def _embed(texts: list[str]) -> list[list[float]]:
    client = get_openai_client()
    resp = client.embeddings.create(model=_EMBED_MODEL, input=texts)
    return [item.embedding for item in resp.data]


def _vec_str(emb: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in emb) + "]"


# ── 初始化資料表 ──────────────────────────────────────────────

def init_rag_table():
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS rag_chunks (
                    id         SERIAL PRIMARY KEY,
                    role       TEXT NOT NULL,
                    source     TEXT NOT NULL,
                    chunk_idx  INTEGER NOT NULL,
                    chunk_text TEXT NOT NULL,
                    embedding  vector({_EMBED_DIMS})
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS rag_chunks_role_idx ON rag_chunks (role)"
            )
        print("[RAG] rag_chunks 資料表初始化完成")
    except Exception as e:
        print(f"[RAG] 初始化失敗：{e}")


# ── 索引所有文件 ──────────────────────────────────────────────

def _chunk_count() -> int:
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM rag_chunks")
            return cur.fetchone()[0]
    except Exception:
        return 0


def index_all_documents(force: bool = False):
    """讀取 RAG資料庫 內所有 .txt，分塊 embed 後存入 rag_chunks。"""
    if not is_openai_configured():
        print("[RAG] OPENAI_API_KEY 未設定，跳過向量索引")
        return

    existing = _chunk_count()
    if not force and existing > 0:
        print(f"[RAG] 已有 {existing} 個 chunk，跳過索引（傳 force=True 可重建）")
        return

    if force:
        try:
            with get_conn() as conn:
                conn.cursor().execute("DELETE FROM rag_chunks")
            print("[RAG] 已清除舊 chunk，重新索引")
        except Exception as e:
            print(f"[RAG] 清除失敗：{e}")
            return

    total = 0
    for folder_name, role_key in _FOLDER_TO_ROLE.items():
        folder = os.path.join(_RAG_DIR, folder_name)
        if not os.path.isdir(folder):
            continue
        for fname in sorted(os.listdir(folder)):
            if not fname.lower().endswith(".txt"):
                continue
            fpath = os.path.join(folder, fname)
            try:
                with open(fpath, encoding="utf-8") as f:
                    text = f.read().strip()
            except Exception as e:
                print(f"[RAG] 讀檔失敗 {fpath}: {e}")
                continue

            chunks = _chunk_text(text)
            source = fname.replace(".txt", "")
            batch_size = 50

            for i in range(0, len(chunks), batch_size):
                batch = chunks[i : i + batch_size]
                try:
                    embeddings = _embed(batch)
                except Exception as e:
                    print(f"[RAG] embed 失敗 {source}: {e}")
                    continue

                with get_conn() as conn:
                    cur = conn.cursor()
                    for j, (chunk, emb) in enumerate(zip(batch, embeddings)):
                        cur.execute(
                            """INSERT INTO rag_chunks
                               (role, source, chunk_idx, chunk_text, embedding)
                               VALUES (%s, %s, %s, %s, %s::vector)""",
                            (role_key, source, i + j, chunk, _vec_str(emb)),
                        )
                total += len(batch)
                print(f"[RAG] {source} ({role_key}) {i + len(batch)}/{len(chunks)} chunks")

    print(f"[RAG] 索引完成，共 {total} 個 chunks")


# ── 向量檢索 ──────────────────────────────────────────────────

def retrieve(query: str, role: str, top_k: int = _TOP_K) -> str:
    """Embed query，用 cosine 距離找最相關的 top_k 個法規片段。"""
    if not is_openai_configured() or not query.strip():
        return _FALLBACKS.get(role, "")

    try:
        emb = _embed([query])[0]
        vec = _vec_str(emb)
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """SELECT source, chunk_text
                   FROM rag_chunks
                   WHERE role = %s
                   ORDER BY embedding <=> %s::vector
                   LIMIT %s""",
                (role, vec, top_k),
            )
            rows = cur.fetchall()

        if not rows:
            return _FALLBACKS.get(role, "")

        return "\n\n".join(f"【{src}】\n{text}" for src, text in rows)

    except Exception as e:
        print(f"[RAG] retrieve 失敗：{e}")
        return _FALLBACKS.get(role, "")
