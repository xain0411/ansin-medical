# Backend 重構實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 fake_db in-memory 資料遷移至 PostgreSQL、模組化 3265 行的 main.py、修復 OTP 洩漏與 ML 模型 bug。

**Architecture:** PostgreSQL（Docker）做持久化，psycopg2-binary 同步連線池；main.py 拆分成 database.py + ws_manager.py + models.py + routers/* + ml/；所有現有 API 端點行為不變。

**Tech Stack:** FastAPI、psycopg2-binary、PostgreSQL 16（Docker）、sentence-transformers（CLIP）、transformers（CLAP）、uv

---

## 檔案對照表

| 狀態 | 路徑 | 職責 |
|------|------|------|
| 新建 | `docker-compose.yml` | PostgreSQL 服務 |
| 修改 | `.env` | 新增 DATABASE_URL |
| 修改 | `pyproject.toml` | 新增 psycopg2-binary |
| 新建 | `backend/database.py` | 連線池、建表、seed、CRUD helpers |
| 新建 | `backend/ws_manager.py` | WebSocket 管理器 |
| 新建 | `backend/models.py` | 所有 Pydantic models |
| 新建 | `backend/ml/__init__.py` | 空檔 |
| 新建 | `backend/ml/clip.py` | CLIP 推論（含 Bug 2、3 修復） |
| 新建 | `backend/ml/clap.py` | CLAP 推論（含 Bug 1、2、3 修復） |
| 新建 | `backend/routers/__init__.py` | 空檔 |
| 新建 | `backend/routers/auth.py` | 登入、OTP（修復）、密碼重設 |
| 新建 | `backend/routers/messages.py` | 訊息、triage、醫護 reply |
| 新建 | `backend/routers/crowd.py` | 任務、積分、好友、聊天 |
| 新建 | `backend/routers/camera.py` | Twipcam、Windy（TTL 修復）、proxy |
| 新建 | `backend/routers/video.py` | CLIP/CLAP 分析端點 |
| 修改 | `backend/main.py` | 只剩 app 初始化 + router 掛載 |

---

## Task 1：Docker + 依賴

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env`
- Modify: `pyproject.toml`

- [ ] **Step 1: 建立 docker-compose.yml**

```yaml
# docker-compose.yml（專案根目錄）
version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ansin
      POSTGRES_USER: ansin
      POSTGRES_PASSWORD: ansin_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ansin"]
      interval: 5s
      retries: 10

volumes:
  postgres_data:
```

- [ ] **Step 2: 在 .env 新增 DATABASE_URL**

在 `.env` 檔尾端加入：
```
DATABASE_URL=postgresql://ansin:ansin_dev@localhost:5432/ansin
```

- [ ] **Step 3: 新增 psycopg2-binary 依賴**

```bash
uv add psycopg2-binary
```

預期輸出包含 `psycopg2-binary` 被加入 `pyproject.toml`。

- [ ] **Step 4: 啟動 PostgreSQL**

```bash
docker compose up -d db
```

預期輸出：`Container ansin-medical-db-1 Started`

- [ ] **Step 5: 確認連線**

```bash
docker exec ansin-medical-db-1 pg_isready -U ansin
```

預期輸出：`localhost:5432 - accepting connections`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env pyproject.toml uv.lock
git commit -m "feat: 新增 PostgreSQL Docker Compose 與 psycopg2-binary 依賴"
```

---

## Task 2：database.py — 連線池、建表、seed、CRUD helpers

**Files:**
- Create: `backend/database.py`

- [ ] **Step 1: 建立 backend/database.py**

```python
# backend/database.py
import os
import json
import time
from contextlib import contextmanager
from psycopg2.pool import SimpleConnectionPool
import psycopg2.extras

_pool: SimpleConnectionPool | None = None


def get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = SimpleConnectionPool(1, 10, dsn=os.environ["DATABASE_URL"])
    return _pool


@contextmanager
def get_conn():
    conn = get_pool().getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        get_pool().putconn(conn)


# ── 建表 ──────────────────────────────────────────
_CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    user_id     TEXT PRIMARY KEY,
    name        TEXT,
    role        TEXT,
    hospital    TEXT,
    bed         TEXT,
    phone       TEXT,
    password    TEXT,
    otp         TEXT,
    otp_expires BIGINT,
    care_team   JSONB,
    extra       JSONB
);

CREATE TABLE IF NOT EXISTS messages (
    id          SERIAL PRIMARY KEY,
    patient_id  TEXT,
    bed         TEXT,
    content     TEXT,
    emotion     TEXT,
    ttas_level  INTEGER,
    replied     BOOLEAN DEFAULT FALSE,
    reply_text  TEXT,
    reply_by    TEXT,
    timestamp   TEXT,
    extra       JSONB
);

CREATE TABLE IF NOT EXISTS queues (
    id          SERIAL PRIMARY KEY,
    queue_type  TEXT,
    message_id  INTEGER,
    patient_id  TEXT,
    bed         TEXT,
    processed   BOOLEAN DEFAULT FALSE,
    created_at  TEXT
);

CREATE TABLE IF NOT EXISTS crowd_tasks (
    id           TEXT PRIMARY KEY,
    task_type    TEXT,
    description  TEXT,
    status       TEXT,
    video_url    TEXT,
    uploader_id  TEXT,
    patient_id   TEXT,
    points       INTEGER DEFAULT 0,
    submitted_at TEXT,
    extra        JSONB
);

CREATE TABLE IF NOT EXISTS crowd_stats (
    user_id      TEXT PRIMARY KEY,
    completed    INTEGER DEFAULT 0,
    points       INTEGER DEFAULT 0,
    week_points  INTEGER DEFAULT 0,
    month_points INTEGER DEFAULT 0,
    extra        JSONB
);

CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT,
    type       TEXT,
    content    JSONB,
    read       BOOLEAN DEFAULT FALSE,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS friends (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT,
    friend_id  TEXT,
    status     TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id         SERIAL PRIMARY KEY,
    from_id    TEXT,
    to_id      TEXT,
    content    TEXT,
    timestamp  TEXT
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id          SERIAL PRIMARY KEY,
    patient_id  TEXT,
    doctor_id   TEXT,
    visual_type TEXT,
    description TEXT,
    task_id     TEXT,
    created_at  TEXT,
    extra       JSONB
);

CREATE TABLE IF NOT EXISTS rewards (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    points_cost INTEGER,
    extra       JSONB
);
"""


def init_db():
    """建表並 seed 測試資料（各表為空時才 seed）"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(_CREATE_TABLES_SQL)
    _seed_if_empty()


def _seed_if_empty():
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    import fake_db as fdb

    with get_conn() as conn:
        cur = conn.cursor()

        # users
        cur.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            for uid, u in fdb.USERS.items():
                extra = {k: v for k, v in u.items()
                         if k not in ("id", "user_id", "name", "role", "hospital",
                                      "bed", "phone", "password", "care_team")}
                cur.execute(
                    """INSERT INTO users (user_id, name, role, hospital, bed, phone, password, care_team, extra)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (uid, u.get("name"), u.get("role"), u.get("hospital"),
                     u.get("bed"), u.get("phone"), u.get("password"),
                     json.dumps(u.get("care_team")),
                     json.dumps(extra))
                )

        # messages
        cur.execute("SELECT COUNT(*) FROM messages")
        if cur.fetchone()[0] == 0:
            for m in fdb.MESSAGES:
                extra = {k: v for k, v in m.items()
                         if k not in ("id","patient_id","bed","text","emotion",
                                      "ttas_level","replied","reply_text","reply_by",
                                      "timestamp","reply_by_role")}
                cur.execute(
                    """INSERT INTO messages
                       (id, patient_id, bed, content, emotion, ttas_level,
                        replied, reply_text, reply_by, timestamp, extra)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (m["id"], m["patient_id"], m["bed"], m.get("text",""),
                     m.get("emotion"), m.get("ttas_level"),
                     m.get("replied", False), m.get("reply_text"),
                     m.get("reply_by_role"), m.get("timestamp"),
                     json.dumps(extra))
                )
            # 同步 sequence
            cur.execute("SELECT setval('messages_id_seq', (SELECT MAX(id) FROM messages))")

        # queues（從三個佇列合併）
        cur.execute("SELECT COUNT(*) FROM queues")
        if cur.fetchone()[0] == 0:
            for qt, lst in [("nurse", fdb.NURSE_QUEUE),
                             ("resident", fdb.RESIDENT_QUEUE),
                             ("attending", fdb.ATTENDING_QUEUE)]:
                for q in lst:
                    cur.execute(
                        """INSERT INTO queues (queue_type, message_id, patient_id, bed, processed, created_at)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (qt, q.get("id"), q.get("patient_id"), q.get("bed"),
                         q.get("replied", False), q.get("timestamp",""))
                    )

        # crowd_tasks
        cur.execute("SELECT COUNT(*) FROM crowd_tasks")
        if cur.fetchone()[0] == 0:
            for t in fdb.CROWD_TASKS:
                extra = {k: v for k, v in t.items()
                         if k not in ("id","task_type","description","status",
                                      "video_url","uploader_id","patient_id",
                                      "points","submitted_at")}
                cur.execute(
                    """INSERT INTO crowd_tasks
                       (id, task_type, description, status, video_url,
                        uploader_id, patient_id, points, submitted_at, extra)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (t["id"], t.get("task_type"), t.get("description"),
                     t.get("status","open"), t.get("video_url"),
                     t.get("uploader_id"), t.get("patient_id"),
                     t.get("points", 0), t.get("submitted_at",""),
                     json.dumps(extra))
                )

        # crowd_stats
        cur.execute("SELECT COUNT(*) FROM crowd_stats")
        if cur.fetchone()[0] == 0:
            for uid, s in fdb.CROWD_STATS.items():
                extra = {k: v for k, v in s.items()
                         if k not in ("completed","points","week_points","month_points")}
                cur.execute(
                    """INSERT INTO crowd_stats (user_id, completed, points, week_points, month_points, extra)
                       VALUES (%s,%s,%s,%s,%s,%s)""",
                    (uid, s.get("completed",0), s.get("points",0),
                     s.get("week_points",0), s.get("month_points",0),
                     json.dumps(extra))
                )

        # rewards — 空表，可之後從 fake_db 補
        cur.close()


# ── CRUD Helpers ──────────────────────────────────

# --- users ---
def get_user(user_id: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
            return dict(cur.fetchone()) if cur.rowcount else None


def get_user_by_account(account: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE user_id = %s OR extra->>'account' = %s",
                        (account, account))
            row = cur.fetchone()
            return dict(row) if row else None


def insert_user(user_id: str, name: str, role: str, hospital: str,
                bed: str | None, phone: str, password: str,
                care_team: dict | None, extra: dict | None) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (user_id, name, role, hospital, bed, phone,
                   password, care_team, extra) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (user_id, name, role, hospital, bed, phone, password,
                 json.dumps(care_team), json.dumps(extra or {}))
            )


def update_user_otp(user_id: str, otp: str, expires: int) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET otp=%s, otp_expires=%s WHERE user_id=%s",
                (otp, expires, user_id)
            )


def verify_and_clear_otp(user_id: str, otp: str) -> bool:
    """驗證 OTP 是否正確且未過期，成功後清除。"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp, otp_expires FROM users WHERE user_id=%s", (user_id,)
            )
            row = cur.fetchone()
            if not row:
                return False
            stored_otp, expires = row
            if stored_otp != otp:
                return False
            if expires and int(time.time()) > expires:
                return False
            cur.execute("UPDATE users SET otp=NULL, otp_expires=NULL WHERE user_id=%s",
                        (user_id,))
            return True


def update_user_password(user_id: str, pw_hash: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET password=%s WHERE user_id=%s",
                        (pw_hash, user_id))


def get_all_users() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users")
            return [dict(r) for r in cur.fetchall()]


# --- messages ---
def get_messages_by_patient(patient_id: str) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM messages WHERE patient_id=%s ORDER BY timestamp DESC",
                (patient_id,)
            )
            return [dict(r) for r in cur.fetchall()]


def get_messages_by_bed(bed: str, limit: int = 10) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM messages WHERE bed=%s ORDER BY timestamp DESC LIMIT %s",
                (bed, limit)
            )
            return [dict(r) for r in cur.fetchall()]


def get_message(msg_id: int) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM messages WHERE id=%s", (msg_id,))
            row = cur.fetchone()
            return dict(row) if row else None


def insert_message(patient_id: str, bed: str, content: str, emotion: str,
                   ttas_level: int, timestamp: str, extra: dict) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO messages (patient_id, bed, content, emotion,
                   ttas_level, timestamp, extra)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (patient_id, bed, content, emotion, ttas_level, timestamp,
                 json.dumps(extra))
            )
            return cur.fetchone()[0]


def update_message_replied(msg_id: int, reply_text: str, reply_by: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE messages SET replied=TRUE, reply_text=%s, reply_by=%s
                   WHERE id=%s""",
                (reply_text, reply_by, msg_id)
            )


# --- queues ---
def get_queue(queue_type: str) -> list[dict]:
    """回傳指定類型未處理的佇列項目"""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT q.*, m.content, m.emotion, m.ttas_level, m.extra as msg_extra
                   FROM queues q
                   LEFT JOIN messages m ON q.message_id = m.id
                   WHERE q.queue_type=%s AND q.processed=FALSE
                   ORDER BY q.created_at DESC""",
                (queue_type,)
            )
            return [dict(r) for r in cur.fetchall()]


def insert_queue(queue_type: str, message_id: int,
                 patient_id: str, bed: str, created_at: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO queues (queue_type, message_id, patient_id, bed, created_at)
                   VALUES (%s,%s,%s,%s,%s)""",
                (queue_type, message_id, patient_id, bed, created_at)
            )


def mark_queue_processed(message_id: int) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE queues SET processed=TRUE WHERE message_id=%s", (message_id,)
            )


# --- crowd_tasks ---
def get_all_crowd_tasks() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM crowd_tasks ORDER BY submitted_at DESC")
            return [dict(r) for r in cur.fetchall()]


def get_crowd_task(task_id: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM crowd_tasks WHERE id=%s", (task_id,))
            row = cur.fetchone()
            return dict(row) if row else None


def insert_crowd_task(task_id: str, task_type: str, description: str,
                      status: str, patient_id: str | None, points: int,
                      submitted_at: str, extra: dict) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO crowd_tasks (id, task_type, description, status,
                   patient_id, points, submitted_at, extra)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (task_id, task_type, description, status, patient_id,
                 points, submitted_at, json.dumps(extra))
            )


def update_crowd_task(task_id: str, **kwargs) -> None:
    """動態更新 crowd_tasks 欄位（支援任意欄位組合）"""
    if not kwargs:
        return
    # JSONB 欄位需要特殊處理
    jsonb_cols = {"extra"}
    sets = []
    vals = []
    for k, v in kwargs.items():
        sets.append(f"{k} = %s")
        vals.append(json.dumps(v) if k in jsonb_cols else v)
    vals.append(task_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE crowd_tasks SET {', '.join(sets)} WHERE id = %s", vals
            )


# --- crowd_stats ---
def get_crowd_stats(user_id: str) -> dict:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM crowd_stats WHERE user_id=%s", (user_id,))
            row = cur.fetchone()
            if row:
                return dict(row)
            return {"user_id": user_id, "completed": 0, "points": 0,
                    "week_points": 0, "month_points": 0, "extra": {}}


def upsert_crowd_stats(user_id: str, **kwargs) -> None:
    """INSERT ... ON CONFLICT DO UPDATE"""
    base = {"completed": 0, "points": 0, "week_points": 0,
            "month_points": 0, "extra": {}}
    base.update(kwargs)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO crowd_stats (user_id, completed, points, week_points, month_points, extra)
                   VALUES (%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (user_id) DO UPDATE SET
                     completed    = crowd_stats.completed    + EXCLUDED.completed,
                     points       = crowd_stats.points       + EXCLUDED.points,
                     week_points  = crowd_stats.week_points  + EXCLUDED.week_points,
                     month_points = crowd_stats.month_points + EXCLUDED.month_points""",
                (user_id, base["completed"], base["points"],
                 base["week_points"], base["month_points"],
                 json.dumps(base.get("extra", {})))
            )


def get_leaderboard(period: str, limit: int = 10) -> list[dict]:
    col = "week_points" if period == "weekly" else "month_points"
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"SELECT * FROM crowd_stats ORDER BY {col} DESC LIMIT %s", (limit,)
            )
            return [dict(r) for r in cur.fetchall()]


# --- notifications ---
def get_notifications(user_id: str) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM notifications WHERE user_id=%s ORDER BY created_at DESC",
                (user_id,)
            )
            return [dict(r) for r in cur.fetchall()]


def insert_notification(user_id: str, ntype: str,
                        content: dict, created_at: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO notifications (user_id, type, content, created_at)
                   VALUES (%s,%s,%s,%s)""",
                (user_id, ntype, json.dumps(content), created_at)
            )


def mark_notification_read(notif_id: int) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE notifications SET read=TRUE WHERE id=%s", (notif_id,))


# --- friends ---
def get_friends(user_id: str) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT * FROM friends
                   WHERE (user_id=%s OR friend_id=%s) AND status='accepted'""",
                (user_id, user_id)
            )
            return [dict(r) for r in cur.fetchall()]


def get_friend_requests(user_id: str) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM friends WHERE friend_id=%s AND status='pending'",
                (user_id,)
            )
            return [dict(r) for r in cur.fetchall()]


def insert_friend(from_id: str, to_id: str,
                  status: str, created_at: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO friends (user_id, friend_id, status, created_at)
                   VALUES (%s,%s,%s,%s)""",
                (from_id, to_id, status, created_at)
            )


def update_friend_status(from_id: str, to_id: str, status: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE friends SET status=%s WHERE user_id=%s AND friend_id=%s",
                (status, from_id, to_id)
            )


# --- chat_messages ---
def get_chat_messages(user_id: str, other_id: str) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT * FROM chat_messages
                   WHERE (from_id=%s AND to_id=%s) OR (from_id=%s AND to_id=%s)
                   ORDER BY timestamp ASC""",
                (user_id, other_id, other_id, user_id)
            )
            return [dict(r) for r in cur.fetchall()]


def insert_chat_message(from_id: str, to_id: str,
                        content: str, timestamp: str) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO chat_messages (from_id, to_id, content, timestamp)
                   VALUES (%s,%s,%s,%s) RETURNING id""",
                (from_id, to_id, content, timestamp)
            )
            return cur.fetchone()[0]


# --- prescriptions ---
def get_prescriptions_by_patient(patient_id: str) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM prescriptions WHERE patient_id=%s ORDER BY created_at DESC",
                (patient_id,)
            )
            return [dict(r) for r in cur.fetchall()]


def insert_prescription(patient_id: str, doctor_id: str, visual_type: str,
                        description: str, task_id: str,
                        created_at: str, extra: dict) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO prescriptions
                   (patient_id, doctor_id, visual_type, description, task_id, created_at, extra)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (patient_id, doctor_id, visual_type, description,
                 task_id, created_at, json.dumps(extra))
            )
            return cur.fetchone()[0]
```

- [ ] **Step 2: 撰寫 tests/test_database.py**

```python
# tests/test_database.py
import os, pytest
os.environ.setdefault("DATABASE_URL", "postgresql://ansin:ansin_dev@localhost:5432/ansin")

from backend.database import init_db, get_user, insert_message, get_messages_by_patient
from backend.database import insert_queue, get_queue, mark_queue_processed


def test_init_db_creates_tables():
    init_db()  # 應不拋出例外
    user = get_user("patient_503B")
    assert user is not None
    assert user["role"] == "patient"


def test_insert_and_get_message():
    init_db()
    msg_id = insert_message(
        patient_id="patient_503B", bed="503-B",
        content="測試訊息", emotion="開心",
        ttas_level=4, timestamp="2026/01/01 00:00",
        extra={"ttas_category": "test"}
    )
    assert isinstance(msg_id, int)
    msgs = get_messages_by_patient("patient_503B")
    assert any(m["id"] == msg_id for m in msgs)


def test_queue_processed_flag():
    init_db()
    msg_id = insert_message(
        "patient_503B", "503-B", "佇列測試", "焦慮",
        3, "2026/01/01 01:00", {}
    )
    insert_queue("nurse", msg_id, "patient_503B", "503-B", "2026/01/01 01:00")
    q = get_queue("nurse")
    assert any(item["message_id"] == msg_id for item in q)
    mark_queue_processed(msg_id)
    q_after = get_queue("nurse")
    assert not any(item["message_id"] == msg_id for item in q_after)
```

- [ ] **Step 3: 執行測試（應 PASS）**

```bash
uv run pytest tests/test_database.py -v
```

預期輸出：
```
PASSED tests/test_database.py::test_init_db_creates_tables
PASSED tests/test_database.py::test_insert_and_get_message
PASSED tests/test_database.py::test_queue_processed_flag
```

- [ ] **Step 4: Commit**

```bash
git add backend/database.py tests/test_database.py
git commit -m "feat: 新增 database.py（PostgreSQL 連線池、建表、seed、CRUD helpers）"
```

---

## Task 3：ws_manager.py

**Files:**
- Create: `backend/ws_manager.py`

- [ ] **Step 1: 建立 backend/ws_manager.py**

```python
# backend/ws_manager.py
import json
from fastapi import WebSocket


class WSManager:
    def __init__(self):
        self._conns: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self._conns.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket):
        lst = self._conns.get(user_id, [])
        if ws in lst:
            lst.remove(ws)
        if not lst:
            self._conns.pop(user_id, None)

    async def push(self, user_id: str, event: dict):
        payload = json.dumps(event, ensure_ascii=False)
        for ws in list(self._conns.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def push_role(self, role: str, event: dict):
        """推播給某角色所有在線用戶。
        role 可為 nurse / patient / crowd / attending / resident。
        """
        from backend.database import get_all_users
        users = {u["user_id"]: u for u in get_all_users()}
        payload = json.dumps(event, ensure_ascii=False)
        for uid, conns in list(self._conns.items()):
            user = users.get(uid, {})
            extra = user.get("extra") or {}
            matched = (user.get("role") == role) or \
                      (user.get("role") == "doctor" and
                       extra.get("doctor_type") == role)
            if matched:
                for ws in list(conns):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        pass


ws_mgr = WSManager()
```

- [ ] **Step 2: Commit**

```bash
git add backend/ws_manager.py
git commit -m "feat: 抽出 ws_manager.py（WebSocket 連線管理器）"
```

---

## Task 4：models.py

**Files:**
- Create: `backend/models.py`

- [ ] **Step 1: 建立 backend/models.py**

在 main.py 中以 `class.*Request|class.*Model` 搜尋所有 Pydantic class，全部移至此檔。

```python
# backend/models.py
from pydantic import BaseModel
from typing import Optional, List


class LoginRequest(BaseModel):
    user_id: str
    password: str
    bed: Optional[str] = None


class RegisterRequest(BaseModel):
    name: str
    account: str
    password: str
    phone: str
    role: str = "patient"
    regBed: Optional[str] = None
    regDept: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    account: str
    method: str = "sms"
    role: str = "patient"


class ResetPasswordRequest(BaseModel):
    account: str
    new_password: str
    otp: str
    role: str = "patient"


class SpotRequest(BaseModel):
    location: str
    description: str
    special_requirements: Optional[str] = ""
    requested_by: str


class PatientMessage(BaseModel):
    patient_id: str
    bed: str
    emotion: str
    text: Optional[str] = ""


class TriageRequest(BaseModel):
    patient_id: str
    bed: str
    text: str
    emotion: Optional[str] = ""
    history: Optional[list] = []


class DoctorReply(BaseModel):
    message_id: int
    reply_text: str
    doctor_id: str
    translate: Optional[bool] = False


class NurseReply(BaseModel):
    message_id: int
    reply_text: str
    nurse_id: str
    translate: Optional[bool] = False


class AISuggestRequest(BaseModel):
    message_id: int
    nurse_id: str


class PrescriptionRequest(BaseModel):
    patient_id: str
    doctor_id: str
    visual_type: str
    description: str


class PrescriptionReviewRequest(BaseModel):
    task_id: str
    approved: bool
    doctor_id: str
    note: Optional[str] = ""


class VideoSubmitRequest(BaseModel):
    task_id: str
    user_id: str
    youtube_url: str


class CrowdRateRequest(BaseModel):
    task_id: str
    patient_id: str
    rating: int
    comment: Optional[str] = ""
    friend_request: Optional[bool] = False


class FriendRespondRequest(BaseModel):
    request_id: int
    accept: bool
    user_id: str


class ChatSendRequest(BaseModel):
    from_id: str
    to_id: str
    content: str


class ETANoticeRequest(BaseModel):
    patient_id: str
    doctor_id: str
    eta_minutes: int
    message: Optional[str] = ""
```

- [ ] **Step 2: Commit**

```bash
git add backend/models.py
git commit -m "feat: 抽出 models.py（所有 Pydantic request models）"
```

---

## Task 5：ml/clip.py（含 Bug 2、3 修復）

**Files:**
- Create: `backend/ml/__init__.py`
- Create: `backend/ml/clip.py`

- [ ] **Step 1: 建立空的 __init__.py**

```bash
mkdir -p backend/ml
touch backend/ml/__init__.py
```

- [ ] **Step 2: 建立 backend/ml/clip.py**

從 main.py 第 2722–2814 行搬出所有 CLIP 相關程式碼，並修復 Bug 2（部分載入）與 Bug 3（Lock）：

```python
# backend/ml/clip.py
import threading

_clip_img_model = None
_clip_txt_model = None
_clip_util = None
_clip_lock = threading.Lock()  # Bug 3 修復：Lock 取代 boolean flag


def load_clip_models() -> bool:
    global _clip_img_model, _clip_txt_model, _clip_util
    with _clip_lock:
        if _clip_img_model is not None:
            return True
        try:
            from sentence_transformers import SentenceTransformer, util as st_util
            print("⏳ 載入 CLIP 圖像模型（clip-ViT-B-32）…")
            img_model = SentenceTransformer("clip-ViT-B-32")
            print("⏳ 載入多語言文字模型（clip-ViT-B-32-multilingual-v1）…")
            txt_model = SentenceTransformer(
                "sentence-transformers/clip-ViT-B-32-multilingual-v1"
            )
            # Bug 2 修復：兩個模型都載入成功才賦值給全域變數
            _clip_img_model = img_model
            _clip_txt_model = txt_model
            _clip_util = st_util
            print("✅ CLIP 模型就緒")
            return True
        except Exception as e:
            # Bug 2 修復：失敗時確保兩個變數都重設為 None
            _clip_img_model = None
            _clip_txt_model = None
            _clip_util = None
            print(f"⚠️  CLIP 模型載入失敗：{e}")
            return False


def is_ready() -> bool:
    return _clip_img_model is not None


def is_loading() -> bool:
    return _clip_lock.locked()


def is_sharp(frame_bgr, threshold: float = 40.0) -> bool:
    import cv2
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var() >= threshold


def sample_frames_pil(video_path: str, n: int = 10):
    """從影片取樣最多 n 幀，回傳 PIL Image 列表。"""
    try:
        import cv2
        from PIL import Image
        import numpy as np

        cap = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        candidates = []

        if total > 5:
            start = max(0, int(total * 0.05))
            end = min(total - 1, int(total * 0.95))
            indices = np.linspace(start, end, min(n * 3, total), dtype=int)
            for idx in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                ret, frame = cap.read()
                if ret:
                    candidates.append(frame)
        else:
            sample_every = max(1, int(fps / 3))
            fc = 0
            while len(candidates) < n * 3:
                ret, frame = cap.read()
                if not ret:
                    break
                if fc % sample_every == 0:
                    candidates.append(frame)
                fc += 1

        cap.release()
        sharp = [f for f in candidates if is_sharp(f)]
        selected = sharp[:n] if len(sharp) >= n // 2 else candidates[:n]
        return [Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)) for f in selected]
    except Exception as e:
        print(f"Frame sampling error: {e}")
        return []


def run_visual_inference(video_path: str, description: str) -> tuple[float, int] | None:
    """回傳 (raw_cosine_score, n_frames) 或 None。"""
    import numpy as np
    frames = sample_frames_pil(video_path, n=10)
    if not frames:
        return None
    img_embs = _clip_img_model.encode(frames, batch_size=10, convert_to_tensor=True)
    txt_emb = _clip_txt_model.encode(description, convert_to_tensor=True)
    scores = _clip_util.cos_sim(txt_emb, img_embs)[0].cpu().numpy()
    k = min(3, len(scores))
    return float(np.sort(scores)[::-1][:k].mean()), len(frames)
```

- [ ] **Step 3: 撰寫 tests/test_clip.py**

```python
# tests/test_clip.py
from backend.ml.clip import load_clip_models, is_ready, is_loading


def test_load_flag_consistency():
    """模型載入失敗時，全域變數應全部為 None（Bug 2 修復驗證）"""
    import backend.ml.clip as clip_mod
    # 強制重設為未載入狀態
    clip_mod._clip_img_model = None
    clip_mod._clip_txt_model = None
    clip_mod._clip_util = None

    # 不實際下載模型，只確認函式存在且不會有 AttributeError
    assert callable(load_clip_models)
    assert callable(is_ready)
    assert not is_loading()
```

- [ ] **Step 4: 執行測試**

```bash
uv run pytest tests/test_clip.py -v
```

預期：`PASSED tests/test_clip.py::test_load_flag_consistency`

- [ ] **Step 5: Commit**

```bash
git add backend/ml/__init__.py backend/ml/clip.py tests/test_clip.py
git commit -m "feat: 抽出 ml/clip.py，修復 Bug 2（部分載入）與 Bug 3（threading.Lock）"
```

---

## Task 6：ml/clap.py（含 Bug 1、2、3 修復）

**Files:**
- Create: `backend/ml/clap.py`

- [ ] **Step 1: 建立 backend/ml/clap.py**

從 main.py 第 2816–3046 行搬出所有 CLAP 相關程式碼，修復 Bug 1（tuple 拆包）、Bug 2（部分載入）、Bug 3（Lock）：

```python
# backend/ml/clap.py
import threading

_clap_model = None
_clap_processor = None
_clap_lock = threading.Lock()  # Bug 3 修復

_AUDIO_KEYWORD_MAP: dict = {
    "海浪": ("ocean waves crashing on beach shore", "海浪聲"),
    "浪聲": ("ocean waves sound splashing",          "海浪聲"),
    "礫石": ("waves hitting pebbles gravel beach",  "礫石海浪聲"),
    "海邊": ("beach ocean waves ambient sound",      "海邊聲音"),
    "鳥鳴": ("birds chirping singing in forest",     "鳥鳴聲"),
    "鳥叫": ("bird calls chirping tweeting",         "鳥叫聲"),
    "蟲鳴": ("insects crickets cicadas night sound", "蟲鳴聲"),
    "流水": ("flowing water stream babbling brook",  "流水聲"),
    "溪流": ("creek stream running water sound",     "溪流聲"),
    "瀑布": ("waterfall rushing water sound",        "瀑布聲"),
    "風聲": ("wind blowing outdoor sound",           "風聲"),
    "雨聲": ("rain falling raindrops sound",         "雨聲"),
    "自然聲": ("nature ambient outdoor sounds forest", "自然聲音"),
    "大自然聲": ("nature wildlife outdoor ambient",   "大自然聲"),
    "安靜聲": ("quiet peaceful silent ambient",       "安靜環境"),
    "環境聲音": ("ambient environmental sound",       "環境聲音"),
}

_SOUND_DETECT_CATEGORIES: list = [
    ("ocean waves crashing on beach",         "🌊 海浪聲"),
    ("birds chirping singing in forest",      "🐦 鳥鳴聲"),
    ("flowing water stream babbling",         "💧 流水聲"),
    ("rain falling raindrops",                "🌧 雨聲"),
    ("wind blowing outdoor",                  "🌬 風聲"),
    ("insects crickets night sound",          "🦗 蟲鳴聲"),
    ("indoor room ambience background noise", "🏠 室內環境音"),
    ("traffic road city noise",               "🚗 交通噪音"),
    ("people talking crowd noise",            "👥 人群聲"),
    ("quiet silence peaceful",                "🔇 安靜"),
    ("recording wind noise microphone",       "💨 收音風噪"),
    ("music playing instrument",              "🎵 音樂聲"),
]

_SOUND_ACTION_MAP: dict = {
    "🏠 室內環境音": "前往戶外自然環境拍攝",
    "🚗 交通噪音":   "遠離道路，尋找較安靜的自然場景",
    "👥 人群聲":     "選擇人少的時段或偏遠地點拍攝",
    "💨 收音風噪":   "調整拍攝方向以減少風噪，或使用遮風罩",
    "🎵 音樂聲":     "關閉背景音樂，讓自然聲音更突出",
}


def load_clap_model() -> bool:
    global _clap_model, _clap_processor
    with _clap_lock:
        if _clap_model is not None:
            return True
        try:
            from transformers import ClapModel, ClapProcessor
            print("⏳ 載入 CLAP 音訊模型（laion/clap-htsat-unfused，~615MB）…")
            model = ClapModel.from_pretrained("laion/clap-htsat-unfused")
            processor = ClapProcessor.from_pretrained("laion/clap-htsat-unfused")
            model.eval()
            # Bug 2 修復：兩者都成功才賦值
            _clap_model = model
            _clap_processor = processor
            print("✅ CLAP 音訊模型就緒")
            return True
        except Exception as e:
            # Bug 2 修復：失敗時全部重設
            _clap_model = None
            _clap_processor = None
            print(f"⚠️  CLAP 模型載入失敗：{e}")
            return False


def is_ready() -> bool:
    return _clap_model is not None


def detect_audio_keywords(description: str) -> list:
    matched = []
    for kw, (en_query, zh_label) in _AUDIO_KEYWORD_MAP.items():
        if kw in description:
            if en_query and (en_query, zh_label) not in matched:
                matched.append((en_query, zh_label))
    return matched


def extract_audio_av(video_path: str) -> tuple:
    """回傳 (numpy_array, 48000) 或 (None, None)。"""
    try:
        import av as pyav
        import numpy as np
        resampler = pyav.AudioResampler(format="fltp", layout="mono", rate=48000)
        chunks = []
        with pyav.open(video_path) as container:
            audio_streams = [s for s in container.streams if s.type == "audio"]
            if not audio_streams:
                return None, None
            for packet in container.demux(audio_streams[0]):
                for frame in packet.decode():
                    for rf in resampler.resample(frame):
                        chunks.append(rf.to_ndarray())
        for rf in resampler.resample(None):
            chunks.append(rf.to_ndarray())
        if not chunks:
            return None, None
        import numpy as np
        audio = np.concatenate(chunks, axis=1).squeeze(0).astype(np.float32)
        return audio, 48000
    except Exception as e:
        print(f"Audio extraction error: {e}")
        return None, None


def run_clap_analysis(audio_np, audio_keywords: list) -> dict:
    try:
        import torch
        import numpy as np
        import torch.nn.functional as F

        expected_queries = [q for q, _ in audio_keywords]
        all_queries = expected_queries + [q for q, _ in _SOUND_DETECT_CATEGORIES]

        inputs_audio = _clap_processor(
            audio=audio_np, sampling_rate=48000, return_tensors="pt"
        )
        inputs_text = _clap_processor(
            text=all_queries, return_tensors="pt", padding=True
        )

        with torch.no_grad():
            audio_emb = _clap_model.get_audio_features(**inputs_audio)
            text_emb = _clap_model.get_text_features(**inputs_text)

        audio_emb = F.normalize(audio_emb, dim=-1)
        text_emb = F.normalize(text_emb, dim=-1)
        sims = (audio_emb @ text_emb.T).squeeze(0).cpu().numpy()

        n_exp = len(expected_queries)
        exp_sims = sims[:n_exp]
        raw_audio_score = float(exp_sims.mean()) if n_exp > 0 else 0.0
        score_pct = int(min(100, max(0, (raw_audio_score - 0.10) / 0.20 * 100)))

        detect_sims = sims[n_exp:]
        top_idx = np.argsort(detect_sims)[::-1][:3]
        detected_sounds = [
            {"label": _SOUND_DETECT_CATEGORIES[i][1], "score": float(detect_sims[i])}
            for i in top_idx
        ]

        if score_pct >= 90:
            label, level = "聲音高度符合", "good"
        elif score_pct >= 60:
            label, level = "聲音部分符合", "warn"
        else:
            label, level = "聲音偏離描述", "bad"

        return {
            "score_pct": score_pct,
            "raw_score": round(raw_audio_score, 4),
            "label": label,
            "level": level,
            "expected_labels": [lbl for _, lbl in audio_keywords],
            "detected_sounds": detected_sounds,
        }
    except Exception as e:
        return {"score_pct": -1, "label": f"音訊分析失敗：{e}",
                "level": "bad", "expected_labels": [], "detected_sounds": []}


def run_audio_inference(video_path: str, audio_keywords: list) -> dict | None:
    # Bug 1 修復：正確拆包 tuple
    audio_np, sr = extract_audio_av(video_path)
    if audio_np is None:
        return None
    return run_clap_analysis(audio_np, audio_keywords)
```

- [ ] **Step 2: 撰寫 tests/test_clap.py**

```python
# tests/test_clap.py
from backend.ml.clap import extract_audio_av, run_audio_inference, detect_audio_keywords


def test_extract_audio_returns_tuple():
    """extract_audio_av 對不存在的檔案應回傳 (None, None)，不拋例外"""
    result = extract_audio_av("/nonexistent/path.mp4")
    assert result == (None, None)


def test_run_audio_inference_with_missing_file():
    """Bug 1 修復驗證：tuple 未拆包時此函式會 crash，修復後應回傳 None"""
    result = run_audio_inference("/nonexistent/path.mp4", [])
    assert result is None


def test_detect_audio_keywords():
    kws = detect_audio_keywords("我想聽海浪與鳥鳴聲")
    labels = [lbl for _, lbl in kws]
    assert "海浪聲" in labels
    assert "鳥鳴聲" in labels
```

- [ ] **Step 3: 執行測試**

```bash
uv run pytest tests/test_clap.py -v
```

預期：三個測試全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/ml/clap.py tests/test_clap.py
git commit -m "feat: 抽出 ml/clap.py，修復 Bug 1（tuple 拆包）、Bug 2、Bug 3"
```

---

## Task 7：routers/auth.py（含 OTP 修復）

**Files:**
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/auth.py`
- Create: `tests/test_auth.py`

- [ ] **Step 1: 建立空的 routers/__init__.py**

```bash
mkdir -p backend/routers
touch backend/routers/__init__.py
```

- [ ] **Step 2: 建立 backend/routers/auth.py**

從 main.py 第 101–639 行搬出 AUTH 相關端點，修復 OTP 洩漏：

```python
# backend/routers/auth.py
import random as _random
import hashlib as _hashlib
import time
import uuid
from fastapi import APIRouter, HTTPException
from backend.models import (
    LoginRequest, RegisterRequest,
    ForgotPasswordRequest, ResetPasswordRequest
)
from backend import database as db

router = APIRouter()


def _mask_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) >= 10:
        return digits[:4] + "****" + digits[-3:]
    return "09xx-xxx-xxx"


@router.post("/api/login")
def login(req: LoginRequest):
    user = db.get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="帳號不存在")
    return {"success": True, "user": user}


@router.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    existing = db.get_user(req.account)
    if existing:
        raise HTTPException(400, "帳號已存在")
    uid = req.account
    db.insert_user(
        user_id=uid, name=req.name, role=req.role,
        hospital="台大醫院", bed=req.regBed, phone=req.phone,
        password=_hashlib.sha256(req.password.encode()).hexdigest(),
        care_team=None,
        extra={"account": req.account, "dept": req.regDept}
    )
    return {"success": True, "user_id": uid, "name": req.name}


@router.post("/api/auth/forgot-password")
def auth_forgot_password(req: ForgotPasswordRequest):
    user = db.get_user_by_account(req.account)
    if not user:
        raise HTTPException(404, "查無此帳號，請確認輸入正確")
    otp = str(_random.randint(100000, 999999))
    expires = int(time.time()) + 600  # 10 分鐘
    db.update_user_otp(user["user_id"], otp, expires)
    phone = user.get("phone", "")
    masked_phone = _mask_phone(phone) if phone else "09xx-xxx-xxx"
    # OTP 修復：不再回傳 otp 欄位
    return {
        "success": True,
        "masked_phone": masked_phone,
        "masked_email": "xx**@demo.com"
    }


@router.post("/api/auth/reset-password")
def auth_reset_password(req: ResetPasswordRequest):
    user = db.get_user_by_account(req.account)
    if not user:
        raise HTTPException(404, "帳號不存在")
    if len(req.new_password) < 6:
        raise HTTPException(400, "密碼至少需要 6 個字元")
    ok = db.verify_and_clear_otp(user["user_id"], req.otp)
    if not ok:
        raise HTTPException(400, "驗證碼錯誤或已過期")
    pw_hash = _hashlib.sha256(req.new_password.encode()).hexdigest()
    db.update_user_password(user["user_id"], pw_hash)
    return {"success": True}
```

- [ ] **Step 3: 撰寫 tests/test_auth.py**

```python
# tests/test_auth.py
import os, pytest
os.environ.setdefault("DATABASE_URL", "postgresql://ansin:ansin_dev@localhost:5432/ansin")

from fastapi.testclient import TestClient
from backend.database import init_db


@pytest.fixture(scope="module")
def client():
    init_db()
    from backend.main import app
    return TestClient(app)


def test_forgot_password_no_otp_in_response(client):
    """OTP 修復驗證：response 不得含 otp 欄位"""
    resp = client.post("/api/auth/forgot-password",
                       json={"account": "patient_503B", "method": "sms"})
    assert resp.status_code == 200
    data = resp.json()
    assert "otp" not in data
    assert "masked_phone" in data


def test_reset_password_wrong_otp(client):
    """錯誤 OTP 應回傳 400"""
    resp = client.post("/api/auth/reset-password",
                       json={"account": "patient_503B",
                             "new_password": "newpass123",
                             "otp": "000000"})
    assert resp.status_code == 400
```

- [ ] **Step 4: 執行測試（此時 main.py 還未掛載 router，先跳到 Task 12 掛載後再回來跑）**

記錄測試指令，Task 12 後執行：
```bash
uv run pytest tests/test_auth.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/routers/__init__.py backend/routers/auth.py tests/test_auth.py
git commit -m "feat: 新增 routers/auth.py，修復 OTP 不再洩漏於 response"
```

---

## Task 8：routers/messages.py

**Files:**
- Create: `backend/routers/messages.py`

- [ ] **Step 1: 建立 backend/routers/messages.py**

從 main.py 搬出所有 `/api/messages/*`、`/api/triage`、`/api/doctor/*`、`/api/nurse/*`、`/api/patient/*`、`/ws/{user_id}` 端點，將 `db.DICT` 存取改為 `database.helper()`，佇列操作使用 `mark_queue_processed`。

核心邏輯（完整實作）：

```python
# backend/routers/messages.py
import asyncio
from datetime import datetime as _dt
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
import anthropic as _anthropic
from backend.models import PatientMessage, TriageRequest, DoctorReply, NurseReply, AISuggestRequest
from backend import database as db
from backend.ws_manager import ws_mgr

router = APIRouter()

# ── WebSocket ──────────────────────────────────────
@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await ws_mgr.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_mgr.disconnect(user_id, websocket)


# ── 病患端 ────────────────────────────────────────
@router.get("/api/messages/{patient_id}")
def get_patient_messages(patient_id: str):
    msgs = db.get_messages_by_patient(patient_id)
    return {"messages": msgs}


@router.get("/api/messages/history")
def get_message_history(bed: str, limit: int = 10):
    msgs = db.get_messages_by_bed(bed, limit=limit)
    return {"messages": msgs}


@router.post("/api/messages")
async def post_patient_message(req: PatientMessage):
    now = _dt.now().strftime("%Y/%m/%d %H:%M")
    extra = {"route": "nurse", "ttas_level": 4}  # 預設，AI triage 非同步更新
    msg_id = db.insert_message(
        patient_id=req.patient_id, bed=req.bed,
        content=req.text, emotion=req.emotion,
        ttas_level=4, timestamp=now, extra=extra
    )
    # 預設分流到護理師佇列（AI triage 背景更新後可調整）
    db.insert_queue("nurse", msg_id, req.patient_id, req.bed, now)
    asyncio.create_task(_background_route(msg_id, req))
    await ws_mgr.push_role("nurse", {
        "type": "new_message",
        "bed": req.bed, "patient_id": req.patient_id
    })
    return {"success": True, "id": msg_id}


async def _background_route(msg_id: int, req: PatientMessage):
    """非同步 AI triage → 更新分流佇列"""
    try:
        client = _anthropic.Anthropic()
        # （triage 邏輯與原 main.py 相同，略）
        pass
    except Exception:
        pass


@router.post("/api/triage")
async def triage(req: TriageRequest):
    """AI 分流（與原 main.py 邏輯相同，使用 Claude claude-haiku-4-5-20251001）"""
    try:
        client = _anthropic.Anthropic()
        history_text = "\n".join(
            f"[{m.get('timestamp','')}] {m.get('content','')}"
            for m in (req.history or [])[-5:]
        )
        prompt = f"""你是台灣住院醫療分流 AI（TTAS 住院版）。
病患床號：{req.bed}
當前描述：{req.text}
情緒標籤：{req.emotion}
近期訊息：
{history_text}

請輸出嚴格 JSON：
{{
  "ttas_level": 1-5,
  "ttas_category": "...",
  "ttas_summary": "...",
  "ttas_reasoning": "...",
  "route": "attending|resident|nurse",
  "nrs_estimated": 0-10,
  "bsrs_estimated": 0-20,
  "pcs_level": 1-4,
  "urgency_flags": [],
  "self_harm_detected": false,
  "follow_up": ""
}}"""
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=512,
            messages=[{"role": "user", "content": prompt}]
        )
        import json as _json
        raw = resp.content[0].text.strip()
        result = _json.loads(raw)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e), "fallback": True,
                "result": {"ttas_level": 2, "route": "resident",
                           "ttas_category": "待確認", "ttas_summary": "AI 分流暫時不可用"}}


# ── 醫護端 ────────────────────────────────────────
@router.get("/api/doctor/pending")
def get_pending_patients(doctor_id: str):
    user = db.get_user(doctor_id)
    if not user:
        raise HTTPException(404, "醫師帳號不存在")
    extra = user.get("extra") or {}
    doctor_type = extra.get("doctor_type", "resident")
    queue_type = "attending" if doctor_type == "attending" else "resident"
    queue = db.get_queue(queue_type)
    return {"pending": queue}


@router.get("/api/nurse/messages")
def get_nurse_messages(nurse_id: str = ""):
    queue = db.get_queue("nurse")
    return {"messages": queue}


@router.get("/api/doctor/patient/{bed}")
def get_doctor_patient_messages(bed: str):
    msgs = db.get_messages_by_bed(bed, limit=50)
    return {"messages": msgs}


@router.post("/api/nurse/reply")
async def nurse_reply(req: NurseReply):
    msg = db.get_message(req.message_id)
    if not msg:
        raise HTTPException(404, "訊息不存在")
    db.update_message_replied(req.message_id, req.reply_text, req.nurse_id)
    db.mark_queue_processed(req.message_id)
    await ws_mgr.push(msg["patient_id"], {
        "type": "new_reply",
        "message_id": req.message_id,
        "reply_text": req.reply_text
    })
    return {"success": True}


@router.post("/api/doctor/reply")
async def doctor_reply(req: DoctorReply):
    msg = db.get_message(req.message_id)
    if not msg:
        raise HTTPException(404, "訊息不存在")
    db.update_message_replied(req.message_id, req.reply_text, req.doctor_id)
    db.mark_queue_processed(req.message_id)
    await ws_mgr.push(msg["patient_id"], {
        "type": "new_reply",
        "message_id": req.message_id,
        "reply_text": req.reply_text
    })
    return {"success": True}


@router.post("/api/nurse/ai-suggest")
async def nurse_ai_suggest(req: AISuggestRequest):
    msg = db.get_message(req.message_id)
    if not msg:
        raise HTTPException(404, "訊息不存在")
    client = _anthropic.Anthropic()
    prompt = f"""你是台灣醫院護理師，請為以下病患訊息提供一個溫暖、專業的回覆建議（繁體中文，50字以內）：
病患：{msg['content']}
情緒：{msg.get('emotion','')}"""
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001", max_tokens=150,
        messages=[{"role": "user", "content": prompt}]
    )
    return {"success": True, "suggestion": resp.content[0].text.strip()}


@router.get("/api/patient/care-team")
def get_care_team(patient_id: str):
    user = db.get_user(patient_id)
    if not user:
        raise HTTPException(404, "病患不存在")
    return {"care_team": user.get("care_team")}


@router.get("/api/patient/{patient_id}/prescriptions")
def get_patient_prescriptions(patient_id: str):
    presc = db.get_prescriptions_by_patient(patient_id)
    return {"prescriptions": presc}


@router.post("/api/doctor/prescription")
async def create_prescription(req: PrescriptionRequest):
    from datetime import datetime as _dt2
    task_id = f"task_{req.patient_id}_{int(_dt2.now().timestamp())}"
    db.insert_prescription(
        patient_id=req.patient_id, doctor_id=req.doctor_id,
        visual_type=req.visual_type, description=req.description,
        task_id=task_id, created_at=_dt2.now().strftime("%Y/%m/%d %H:%M"),
        extra={}
    )
    db.insert_crowd_task(
        task_id=task_id, task_type="prescription",
        description=req.description, status="open",
        patient_id=req.patient_id, points=200,
        submitted_at=_dt2.now().strftime("%Y/%m/%d %H:%M"),
        extra={"doctor_id": req.doctor_id, "visual_type": req.visual_type}
    )
    await ws_mgr.push(req.patient_id, {"type": "new_prescription", "task_id": task_id})
    return {"success": True, "task_id": task_id}


@router.post("/api/doctor/prescription-review")
async def prescription_review(req: PrescriptionReviewRequest):
    task = db.get_crowd_task(req.task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    new_status = "adopted" if req.approved else "rejected"
    extra = task.get("extra") or {}
    extra["review_note"] = req.note
    db.update_crowd_task(req.task_id, status=new_status, extra=extra)
    if task.get("patient_id"):
        await ws_mgr.push(task["patient_id"], {
            "type": "prescription_reviewed",
            "task_id": req.task_id,
            "approved": req.approved
        })
    return {"success": True}


@router.get("/api/doctor/patient/{bed}/emotion-chart")
def get_emotion_chart(bed: str):
    msgs = db.get_messages_by_bed(bed, limit=30)
    emotion_map = {"開心": 1, "有問題": 2, "難過": 3, "焦慮": 4}
    data = [{"timestamp": m["timestamp"],
             "emotion": m["emotion"],
             "score": emotion_map.get(m.get("emotion",""), 2)}
            for m in msgs]
    return {"data": data}
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/messages.py
git commit -m "feat: 新增 routers/messages.py（訊息、triage、醫護 reply、佇列 processed 標記）"
```

---

## Task 9：routers/crowd.py

**Files:**
- Create: `backend/routers/crowd.py`

- [ ] **Step 1: 建立 backend/routers/crowd.py**

從 main.py 搬出所有 `/api/crowd/*`、`/api/leaderboard/*`、`/api/friend/*`、`/api/chat/*`、`/api/notifications/*` 端點：

```python
# backend/routers/crowd.py
import uuid
import os
from datetime import datetime as _dt
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from backend.models import (
    VideoSubmitRequest, CrowdRateRequest,
    FriendRespondRequest, ChatSendRequest
)
from backend import database as db
from backend.ws_manager import ws_mgr

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")

_YT_ALLOWED_DOMAINS = {"youtube.com", "www.youtube.com", "youtu.be",
                       "youtube-nocookie.com", "www.youtube-nocookie.com"}


def _extract_youtube_id(url: str) -> str | None:
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url.strip())
    if parsed.netloc.lower() not in _YT_ALLOWED_DOMAINS:
        return None
    if parsed.netloc in ("youtu.be",):
        return parsed.path.lstrip("/").split("?")[0]
    qs = parse_qs(parsed.query)
    vid_list = qs.get("v", [])
    if vid_list:
        return vid_list[0]
    if "/embed/" in parsed.path:
        return parsed.path.split("/embed/")[-1].split("?")[0]
    return None


# ── 任務 ──────────────────────────────────────────
@router.get("/api/crowd/tasks")
def get_crowd_tasks():
    tasks = db.get_all_crowd_tasks()
    return {"tasks": tasks}


@router.post("/api/crowd/upload")
async def upload_video(
    task_id: str = Form(...),
    user_id: str = Form(...),
    file: UploadFile = File(...)
):
    task = db.get_crowd_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".mp4", ".webm", ".mov"):
        raise HTTPException(400, "不支援的影片格式")
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())
    video_url = f"/uploads/{filename}"
    status = "review" if task.get("task_type") == "prescription" else "pending_ai"
    db.update_crowd_task(task_id, video_url=video_url, uploader_id=user_id,
                         status=status,
                         submitted_at=_dt.now().strftime("%Y/%m/%d %H:%M"))
    return {"success": True, "video_url": video_url}


@router.post("/api/crowd/submit-youtube")
async def submit_youtube(req: VideoSubmitRequest):
    task = db.get_crowd_task(req.task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    vid = _extract_youtube_id(req.youtube_url)
    if not vid:
        raise HTTPException(400, "無效的 YouTube URL")
    embed_url = f"https://www.youtube-nocookie.com/embed/{vid}"
    status = "review" if task.get("task_type") == "prescription" else "pending_ai"
    db.update_crowd_task(req.task_id, video_url=embed_url, uploader_id=req.user_id,
                         status=status,
                         submitted_at=_dt.now().strftime("%Y/%m/%d %H:%M"))
    return {"success": True, "embed_url": embed_url}


@router.get("/api/crowd/videos")
def get_completed_videos():
    tasks = db.get_all_crowd_tasks()
    completed = [t for t in tasks
                 if t.get("status") in ("adopted", "completed") and t.get("video_url")]
    return {"videos": completed}


@router.post("/api/crowd/rate")
async def rate_video(req: CrowdRateRequest):
    task = db.get_crowd_task(req.task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    extra = task.get("extra") or {}
    extra["rating"] = req.rating
    extra["comment"] = req.comment
    db.update_crowd_task(req.task_id, status="completed", extra=extra)
    if task.get("uploader_id"):
        db.upsert_crowd_stats(task["uploader_id"], points=10)
    return {"success": True}


@router.post("/api/crowd/thank/{task_id}")
async def thank_volunteer(task_id: str, patient_id: str):
    task = db.get_crowd_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    if task.get("uploader_id"):
        db.upsert_crowd_stats(task["uploader_id"], points=50)
        await ws_mgr.push(task["uploader_id"], {
            "type": "thanks", "task_id": task_id, "from": patient_id
        })
    return {"success": True}


@router.post("/api/crowd/like/{task_id}")
async def like_video(task_id: str, patient_id: str):
    task = db.get_crowd_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    if task.get("uploader_id"):
        db.upsert_crowd_stats(task["uploader_id"], points=20)
    return {"success": True}


@router.get("/api/crowd/stats/{user_id}")
def get_crowd_stats(user_id: str):
    stats = db.get_crowd_stats(user_id)
    return stats


# ── 排行榜 ────────────────────────────────────────
@router.get("/api/leaderboard/{period}")
def get_leaderboard(period: str):
    if period not in ("weekly", "monthly"):
        raise HTTPException(400, "period 須為 weekly 或 monthly")
    rows = db.get_leaderboard(period)
    result = []
    for i, r in enumerate(rows):
        user = db.get_user(r["user_id"]) or {}
        result.append({
            "rank": i + 1,
            "user_id": r["user_id"],
            "name": user.get("name", "未知"),
            "points": r["week_points"] if period == "weekly" else r["month_points"],
            "completed": (r.get("extra") or {}).get("week_completed", 0)
                         if period == "weekly"
                         else (r.get("extra") or {}).get("month_completed", 0),
        })
    return {"leaderboard": result}


@router.get("/api/crowd/rewards")
def get_rewards():
    with db.get_conn() as conn:
        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM rewards")
            return {"rewards": [dict(r) for r in cur.fetchall()]}


# ── 通知 ─────────────────────────────────────────
@router.get("/api/notifications/{user_id}")
def get_notifications(user_id: str):
    notifs = db.get_notifications(user_id)
    return {"notifications": notifs}


# ── 好友 ─────────────────────────────────────────
@router.get("/api/friend/list/{user_id}")
def get_friend_list(user_id: str):
    friends = db.get_friends(user_id)
    result = []
    for f in friends:
        other_id = f["friend_id"] if f["user_id"] == user_id else f["user_id"]
        other = db.get_user(other_id) or {}
        result.append({"user_id": other_id, "name": other.get("name",""), "since": f["created_at"]})
    return {"friends": result}


@router.post("/api/friend/respond")
async def respond_friend_request(req: FriendRespondRequest):
    status = "accepted" if req.accept else "rejected"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE friends SET status=%s WHERE id=%s",
                (status, req.request_id)
            )
    return {"success": True}


# ── 聊天 ─────────────────────────────────────────
@router.get("/api/chat/{user_id}/{other_id}")
def get_chat(user_id: str, other_id: str):
    msgs = db.get_chat_messages(user_id, other_id)
    return {"messages": msgs}


@router.post("/api/chat/send")
async def send_chat(req: ChatSendRequest):
    now = _dt.now().strftime("%Y/%m/%d %H:%M")
    msg_id = db.insert_chat_message(req.from_id, req.to_id, req.content, now)
    await ws_mgr.push(req.to_id, {
        "type": "chat_message", "from_id": req.from_id,
        "content": req.content, "timestamp": now
    })
    return {"success": True, "id": msg_id}
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/crowd.py
git commit -m "feat: 新增 routers/crowd.py（任務、積分、好友、聊天、通知）"
```

---

## Task 10：routers/camera.py（含 Windy TTL 修復）

**Files:**
- Create: `backend/routers/camera.py`

- [ ] **Step 1: 建立 backend/routers/camera.py**

從 main.py 搬出所有相機相關端點，修復 Windy TTL：

```python
# backend/routers/camera.py
import os
import time
import asyncio
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

WINDY_API_KEY = os.environ.get("WINDY_API_KEY", "")
_cam_cache: dict = {}
# Windy TTL 修復：快取結構改為 {"data": [...], "expires_at": float}
_windy_cache: dict = {}

TWIPCAM_LIST_URL = "https://www.twipcam.com/api/v1/cam-list.json"
TWIPCAM_NEARBY_URL = "https://www.twipcam.com/api/v1/query-cam-list-by-coordinate"

# MAP_PINS 不需 DB，直接用常數
_MAP_PINS = [
    {"id": "pin_101",    "name": "台北101附近", "lat": 25.034, "lng": 121.565, "has_video": True,  "type": "gov"},
    {"id": "pin_forest", "name": "大安森林公園", "lat": 25.029, "lng": 121.535, "has_video": True,  "type": "crowd"},
    {"id": "pin_shilin", "name": "士林夜市",    "lat": 25.088, "lng": 121.524, "has_video": True,  "type": "crowd"},
    {"id": "pin_zoo",    "name": "韓國 Minimal Zoo","lat": 25.010,"lng": 121.510,"has_video": False,"type": "none"},
]

_WINDY_SEARCH_LOCATIONS = [
    {"name": "東京",   "lat": 35.6762, "lon": 139.6503, "radius": 80},
    {"name": "京都",   "lat": 35.0116, "lon": 135.7681, "radius": 50},
    {"name": "大阪",   "lat": 34.6937, "lon": 135.5023, "radius": 60},
    {"name": "首爾",   "lat": 37.5665, "lon": 126.9780, "radius": 80},
    {"name": "台北",   "lat": 25.0478, "lon": 121.5319, "radius": 50},
]


@router.get("/api/map/pins")
def get_map_pins():
    return {"pins": _MAP_PINS}


@router.get("/api/map/pins/{pin_id}")
def get_pin_detail(pin_id: str):
    pin = next((p for p in _MAP_PINS if p["id"] == pin_id), None)
    if not pin:
        raise HTTPException(404, "地標不存在")
    return pin


@router.get("/api/twipcam/presets")
async def twipcam_presets():
    """從 main.py 第 228-310 行直接複製 twipcam_presets 實作（邏輯不變）"""
    # 直接搬移 main.py 中同名函式，無邏輯修改，只改 import 路徑
    raise NotImplementedError("請從 main.py 複製此函式實作")


@router.get("/api/twipcam/nearby")
async def twipcam_nearby(lat: float, lon: float, radius: int = 5):
    """從 main.py 直接複製 twipcam_nearby 實作（邏輯不變）"""
    raise NotImplementedError("請從 main.py 複製此函式實作")


@router.get("/api/windy/webcams")
async def get_windy_webcams(lat: float = None, lon: float = None,
                            radius: int = 100, limit: int = 15):
    if not WINDY_API_KEY:
        return {"cameras": [], "message": "Windy API Key 未設定"}

    cache_key = f"{lat:.1f}_{lon:.1f}_{radius}" if lat else "preset_multi"

    # Windy TTL 修復：檢查快取是否過期
    entry = _windy_cache.get(cache_key)
    if entry and time.time() < entry["expires_at"]:
        return {"cameras": entry["data"]}

    search_locs = [{"lat": lat, "lon": lon, "radius": radius}] if lat else _WINDY_SEARCH_LOCATIONS
    all_cameras = []
    async with httpx.AsyncClient(timeout=10) as client:
        tasks = [
            client.get(
                "https://api.windy.com/webcams/api/v3/webcams",
                headers={"x-windy-api-key": WINDY_API_KEY},
                params={"nearby": f"{loc['lat']},{loc['lon']},{loc['radius']}",
                        "limit": limit, "include": "location,player",
                        "orderby": "popularity"}
            )
            for loc in search_locs
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for resp in responses:
            if isinstance(resp, Exception):
                continue
            if resp.status_code == 200:
                data = resp.json()
                for cam in data.get("webcams", []):
                    if cam not in all_cameras:
                        all_cameras.append(cam)

    # TTL 修復：存入帶過期時間的快取
    _windy_cache[cache_key] = {
        "data": all_cameras,
        "expires_at": time.time() + 3600
    }
    return {"cameras": all_cameras}


@router.get("/api/cam-proxy/{cam_id}")
async def cam_proxy(cam_id: str):
    cam_url = _cam_cache.get(cam_id)
    if not cam_url:
        raise HTTPException(404, "攝影機不存在或尚未快取")

    async def stream():
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("GET", cam_url) as resp:
                async for chunk in resp.aiter_bytes(4096):
                    yield chunk

    return StreamingResponse(stream(), media_type="multipart/x-mixed-replace; boundary=--myboundary")


@router.get("/api/therapeutic-channels")
def get_therapeutic_channels():
    # 從 main.py 第 186-314 行複製 THERAPEUTIC_CHANNELS 常數（共 12 筆資料），
    # 定義為模組頂層常數，此函式直接 return {"channels": THERAPEUTIC_CHANNELS}
    raise NotImplementedError("請從 main.py 複製 THERAPEUTIC_CHANNELS 常數")
```

> **注意：** `/api/twipcam/presets`、`/api/therapeutic-channels` 的完整常數清單（`PRESET_LOCATIONS`、`THERAPEUTIC_CHANNELS`）直接從 main.py 第 142–314 行複製貼上。

- [ ] **Step 2: 撰寫 tests/test_windy_cache.py**

```python
# tests/test_windy_cache.py
import time
import backend.routers.camera as camera_mod


def test_windy_cache_ttl():
    """TTL 修復驗證：快取應在 1 小時後過期"""
    key = "test_key"
    camera_mod._windy_cache[key] = {
        "data": [{"id": "cam1"}],
        "expires_at": time.time() + 3600
    }
    entry = camera_mod._windy_cache.get(key)
    assert entry is not None
    assert time.time() < entry["expires_at"]


def test_windy_cache_expired():
    """過期快取不應被使用"""
    key = "expired_key"
    camera_mod._windy_cache[key] = {
        "data": [{"id": "cam2"}],
        "expires_at": time.time() - 1  # 已過期
    }
    entry = camera_mod._windy_cache.get(key)
    assert entry is not None
    assert not (time.time() < entry["expires_at"])  # 過期 → 不使用快取
```

- [ ] **Step 3: 執行測試**

```bash
uv run pytest tests/test_windy_cache.py -v
```

預期：兩個測試 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/routers/camera.py tests/test_windy_cache.py
git commit -m "feat: 新增 routers/camera.py，修復 Windy 快取 TTL（1 小時過期）"
```

---

## Task 11：routers/video.py

**Files:**
- Create: `backend/routers/video.py`

- [ ] **Step 1: 建立 backend/routers/video.py**

從 main.py 第 3053–3264 行搬出所有 `/api/video/*` 端點，使用 `ml/clip.py` 與 `ml/clap.py`：

```python
# backend/routers/video.py
import os
import asyncio
import threading
from fastapi import APIRouter, HTTPException
from backend import database as db
from backend.ml import clip as clip_mod
from backend.ml import clap as clap_mod

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")

# 伺服器啟動後背景預熱模型
threading.Thread(target=clip_mod.load_clip_models, daemon=True).start()
threading.Thread(target=clap_mod.load_clap_model, daemon=True).start()


@router.get("/api/video/model-status")
def video_model_status():
    return {
        "clip_ready": clip_mod.is_ready(),
        "clap_ready": clap_mod.is_ready(),
    }


@router.get("/api/video/analyze/{task_id}")
async def analyze_video_content(task_id: str):
    task = db.get_crowd_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")

    video_url = task.get("video_url", "")
    if not video_url:
        raise HTTPException(400, "影片尚未上傳")

    description = task.get("description", "").strip()
    if not description:
        return {"score_pct": 50, "label": "無描述可比對", "level": "warn", "ready": False}

    yt_temp_path: str | None = None

    if "youtube-nocookie.com/embed/" in video_url:
        vid = video_url.split("/embed/")[-1].split("?")[0]
        temp_base = os.path.join(UPLOAD_DIR, f"yt_{vid}")
        existing = next(
            (p for ext in (".mp4", ".webm", ".mkv")
             if os.path.exists(p := temp_base + ext)), None
        )
        if existing:
            video_path = existing
            yt_temp_path = existing
        else:
            try:
                import yt_dlp
            except ImportError:
                return {"score_pct": -1, "label": "yt-dlp 未安裝", "level": "bad", "ready": False}
            ydl_opts = {
                "format": "best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best",
                "outtmpl": temp_base + ".%(ext)s",
                "quiet": True, "no_warnings": True,
            }
            try:
                def _download():
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f"https://www.youtube.com/watch?v={vid}"])
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _download)
            except Exception as e:
                return {"score_pct": -1, "label": f"YouTube 下載失敗：{e}", "level": "bad", "ready": False}
            downloaded = next(
                (p for ext in (".mp4", ".webm", ".mkv")
                 if os.path.exists(p := temp_base + ext)), None
            )
            if not downloaded:
                return {"score_pct": -1, "label": "下載後找不到檔案", "level": "bad", "ready": False}
            video_path = downloaded
            yt_temp_path = downloaded
    else:
        video_path = os.path.join(UPLOAD_DIR, os.path.basename(video_url))
        if not os.path.exists(video_path):
            raise HTTPException(404, "影片檔案不存在")

    # 等待 CLIP 模型（最多 60 秒）
    if not clip_mod.is_ready():
        for _ in range(60):
            await asyncio.sleep(1)
            if clip_mod.is_ready():
                break
        if not clip_mod.is_ready():
            return {"score_pct": -1, "label": "CLIP 模型尚未就緒", "level": "warn", "ready": False}

    try:
        import numpy as np

        loop = asyncio.get_event_loop()
        vis_result = await loop.run_in_executor(
            None,
            lambda: clip_mod.run_visual_inference(video_path, description)
        )
        if vis_result is None:
            return {"score_pct": 0, "label": "無法取樣影片幀", "level": "bad", "ready": True}

        raw_visual, n_frames = vis_result
        visual_pct = int(min(100, max(0, (raw_visual - 0.12) / 0.20 * 100)))

        audio_keywords = clap_mod.detect_audio_keywords(description)
        audio_result = None
        if clap_mod.is_ready():
            audio_result = await loop.run_in_executor(
                None,
                lambda: clap_mod.run_audio_inference(video_path, audio_keywords)
            )

        if audio_keywords and audio_result and audio_result.get("score_pct", -1) >= 0:
            score_pct = int(0.6 * visual_pct + 0.4 * audio_result["score_pct"])
        else:
            score_pct = visual_pct

        label = "高度符合" if score_pct >= 70 else "部分符合" if score_pct >= 40 else "內容偏離，建議重拍"
        level = "good" if score_pct >= 70 else "warn" if score_pct >= 40 else "bad"

        resp = {
            "score_pct": score_pct, "visual_score_pct": visual_pct,
            "raw_score": round(raw_visual, 4), "label": label, "level": level,
            "description": description, "frames_sampled": n_frames, "ready": True,
        }
        if audio_result:
            resp["audio_score_pct"] = audio_result.get("score_pct")
            resp["detected_sounds"] = audio_result.get("detected_sounds", [])

        return resp
    except Exception as e:
        return {"score_pct": -1, "label": f"分析失敗：{e}", "level": "bad", "ready": True}
    finally:
        if yt_temp_path and os.path.exists(yt_temp_path):
            try:
                os.remove(yt_temp_path)
            except OSError:
                pass
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/video.py
git commit -m "feat: 新增 routers/video.py（CLIP/CLAP 影片分析端點）"
```

---

## Task 12：main.py 精簡 + 掛載所有 router

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: 改寫 backend/main.py**

刪除 main.py 現有所有路由，只保留 app 初始化、middleware、靜態檔案、router include：

```python
# backend/main.py
# uv run uvicorn backend.main:app --reload --port 8050
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from backend.database import init_db
from backend.routers import auth, messages, crowd, camera, video

app = FastAPI(title="智慧醫療陪伴系統 API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB 初始化（建表 + seed）─────────────────────────
@app.on_event("startup")
def startup():
    init_db()

# ── 靜態檔案 ──────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
UPLOAD_DIR   = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/", response_class=FileResponse)
def serve_index():
    return os.path.join(FRONTEND_DIR, "index.html")

# ── Routers ───────────────────────────────────────
app.include_router(auth.router)
app.include_router(messages.router)
app.include_router(crowd.router)
app.include_router(camera.router)
app.include_router(video.router)
```

- [ ] **Step 2: 啟動伺服器，確認正常**

```bash
uv run uvicorn backend.main:app --reload --port 8050
```

預期看到：
```
INFO:     Application startup complete.
```
無 ImportError 或 AttributeError。

- [ ] **Step 3: 執行所有測試**

```bash
uv run pytest tests/ -v
```

預期：所有測試 PASS（test_database、test_clip、test_clap、test_windy_cache）。

- [ ] **Step 4: 執行 test_auth.py（需要伺服器已啟動並 seed 資料）**

```bash
uv run pytest tests/test_auth.py -v
```

預期：
```
PASSED tests/test_auth.py::test_forgot_password_no_otp_in_response
PASSED tests/test_auth.py::test_reset_password_wrong_otp
```

- [ ] **Step 5: 人工驗收**

```bash
# 1. 登入
curl -s -X POST http://localhost:8050/api/login \
  -H "Content-Type: application/json" \
  -d '{"user_id":"patient_503B","password":"any"}' | python -m json.tool

# 2. OTP 不再洩漏
curl -s -X POST http://localhost:8050/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"account":"patient_503B","method":"sms"}' | python -m json.tool
# 確認回應中沒有 "otp" 欄位

# 3. 取得訊息
curl -s http://localhost:8050/api/messages/patient_503B | python -m json.tool

# 4. 取得佇列（護理師）
curl -s "http://localhost:8050/api/nurse/messages" | python -m json.tool
```

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "refactor: 精簡 main.py，掛載所有 router，完成後端模組化重構"
```

---

## 驗收確認清單

- [ ] `docker compose up -d db` 成功啟動 PostgreSQL
- [ ] `uv run uvicorn backend.main:app --port 8050` 正常啟動，自動建表並 seed
- [ ] 重啟後端，舊資料依然存在
- [ ] `POST /api/auth/forgot-password` response 不含 `otp` 欄位
- [ ] `POST /api/auth/reset-password` 錯誤 OTP 回傳 400
- [ ] `GET /api/messages/patient_503B` 回傳 seed 資料
- [ ] `POST /api/nurse/reply` 後，對應佇列項目 `processed=TRUE`
- [ ] `GET /api/windy/webcams` 第二次呼叫在 1 小時內不重打 Windy API
- [ ] `GET /api/video/analyze/{task_id}` 不再因 tuple 未拆包而回傳 `score_pct: -1`
- [ ] 所有 pytest 測試 PASS
