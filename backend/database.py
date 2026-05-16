"""
backend/database.py — PostgreSQL 連線池、建表、seed、CRUD helpers
啟動方式：docker compose up -d db
"""
from __future__ import annotations

import os
import json
import time
from contextlib import contextmanager
from typing import Optional

try:
    import psycopg2
    from psycopg2.pool import SimpleConnectionPool
    _PSYCOPG2_AVAILABLE = True
except ImportError:
    _PSYCOPG2_AVAILABLE = False

_pool: "SimpleConnectionPool | None" = None


def _get_pool() -> "SimpleConnectionPool":
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL", "")
        if not dsn:
            raise RuntimeError("DATABASE_URL 環境變數未設定")
        _pool = SimpleConnectionPool(1, 10, dsn=dsn)
    return _pool


@contextmanager
def get_conn():
    conn = _get_pool().getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _get_pool().putconn(conn)


# ══════════════════════════════════════════════════════════════
# DDL：建立所有資料表（若不存在）
# ══════════════════════════════════════════════════════════════
_DDL = """
CREATE EXTENSION IF NOT EXISTS vector;

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
    month_points INTEGER DEFAULT 0
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
"""


def init_db():
    """建立資料表並 seed 測試資料（各表為空時）。"""
    if not _PSYCOPG2_AVAILABLE:
        print("[DB] psycopg2 未安裝，跳過 PostgreSQL 初始化")
        return False
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(_DDL)
        _seed_if_empty()
        print("[DB] PostgreSQL 初始化完成")
        return True
    except Exception as e:
        print(f"[DB] 初始化失敗：{e}（將使用 in-memory 模式）")
        return False


def _seed_if_empty():
    """若 users 表為空，從 fake_db 匯入種子資料。"""
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    import fake_db as fdb  # noqa

    with get_conn() as conn:
        cur = conn.cursor()

        # users
        cur.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            for uid, u in fdb.USERS.items():
                cur.execute(
                    """INSERT INTO users
                       (user_id, name, role, hospital, bed, phone, care_team, extra)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT DO NOTHING""",
                    (
                        uid,
                        u.get("name"),
                        u.get("role"),
                        u.get("hospital"),
                        u.get("bed"),
                        u.get("phone"),
                        json.dumps(u.get("care_team"), ensure_ascii=False) if u.get("care_team") else None,
                        json.dumps({k: v for k, v in u.items()
                                    if k not in ("user_id","name","role","hospital","bed","phone","care_team")},
                                   ensure_ascii=False),
                    ),
                )

        # messages
        cur.execute("SELECT COUNT(*) FROM messages")
        if cur.fetchone()[0] == 0:
            for m in fdb.MESSAGES:
                extra = {k: v for k, v in m.items()
                         if k not in ("id","patient_id","bed","text","emotion",
                                      "ttas_level","replied","reply_text","timestamp")}
                cur.execute(
                    """INSERT INTO messages
                       (patient_id, bed, content, emotion, ttas_level,
                        replied, reply_text, reply_by, timestamp, extra)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        m["patient_id"], m["bed"], m.get("text",""),
                        m.get("emotion"), m.get("ttas_level",3),
                        m.get("replied", False), m.get("reply_text"),
                        m.get("reply_by_role"), m.get("timestamp"),
                        json.dumps(extra, ensure_ascii=False),
                    ),
                )

        # queues
        cur.execute("SELECT COUNT(*) FROM queues")
        if cur.fetchone()[0] == 0:
            for qt, items in [("nurse", fdb.NURSE_QUEUE),
                               ("resident", fdb.RESIDENT_QUEUE),
                               ("attending", fdb.ATTENDING_QUEUE)]:
                for q in items:
                    cur.execute(
                        """INSERT INTO queues
                           (queue_type, message_id, patient_id, bed, processed, created_at)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (qt, q["id"], q.get("patient_id"), q.get("bed"),
                         q.get("replied", False), q.get("timestamp")),
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
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT DO NOTHING""",
                    (
                        t["id"], t.get("task_type","general"),
                        t.get("description",""), t.get("status","open"),
                        t.get("video_url"), t.get("uploader_id"),
                        t.get("patient_id"), t.get("points",0),
                        t.get("submitted_at"), json.dumps(extra, ensure_ascii=False),
                    ),
                )

        # crowd_stats
        cur.execute("SELECT COUNT(*) FROM crowd_stats")
        if cur.fetchone()[0] == 0:
            for uid, s in fdb.CROWD_STATS.items():
                cur.execute(
                    """INSERT INTO crowd_stats
                       (user_id, completed, points, week_points, month_points)
                       VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT DO NOTHING""",
                    (uid, s.get("completed",0), s.get("points",0),
                     s.get("week_points",0), s.get("month_points",0)),
                )

        # friends (friendships)
        cur.execute("SELECT COUNT(*) FROM friends")
        if cur.fetchone()[0] == 0:
            for fs in fdb.FRIENDSHIPS:
                cur.execute(
                    "INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (%s,%s,%s,%s)",
                    (fs["user1_id"], fs["user2_id"], "accepted", fs.get("since")),
                )
            for fr in fdb.FRIEND_REQUESTS:
                if fr.get("status") == "pending":
                    cur.execute(
                        "INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (%s,%s,%s,%s)",
                        (fr["from_id"], fr["to_id"], "pending", fr.get("timestamp")),
                    )

        # chat_messages
        cur.execute("SELECT COUNT(*) FROM chat_messages")
        if cur.fetchone()[0] == 0:
            for cm in fdb.CHAT_MESSAGES:
                cur.execute(
                    "INSERT INTO chat_messages (from_id, to_id, content, timestamp) VALUES (%s,%s,%s,%s)",
                    (cm["from_id"], cm["to_id"], cm.get("text",""), cm.get("timestamp")),
                )


# ══════════════════════════════════════════════════════════════
# CRUD — users
# ══════════════════════════════════════════════════════════════

def get_user(user_id: str) -> Optional[dict]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        cols = [d[0] for d in cur.description]
        u = dict(zip(cols, row))
        if u.get("care_team") and isinstance(u["care_team"], str):
            u["care_team"] = json.loads(u["care_team"])
        if u.get("extra") and isinstance(u["extra"], str):
            u["extra"] = json.loads(u["extra"])
        result = {"id": u["user_id"], **u}
        if isinstance(u.get("extra"), dict):
            result.update(u["extra"])
        return result


def get_all_users() -> dict:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users")
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
        result = {}
        for row in rows:
            u = dict(zip(cols, row))
            uid = u["user_id"]
            if u.get("care_team") and isinstance(u["care_team"], str):
                u["care_team"] = json.loads(u["care_team"])
            extra = {}
            if u.get("extra") and isinstance(u["extra"], str):
                extra = json.loads(u["extra"])
            elif isinstance(u.get("extra"), dict):
                extra = u["extra"]
            entry = {"id": uid, **u, **extra}
            result[uid] = entry
        return result


def create_user(user_id: str, name: str, role: str, phone: str, password: str,
                bed: str = "", hospital: str = "", extra: dict = None):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO users (user_id, name, role, hospital, bed, phone, password, extra)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (user_id, name, role, hospital, bed, phone, password,
             json.dumps(extra or {}, ensure_ascii=False)),
        )


def set_user_otp(user_id: str, otp: str, expires: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET otp=%s, otp_expires=%s WHERE user_id=%s",
            (otp, expires, user_id),
        )


def verify_and_clear_otp(user_id: str, otp: str) -> bool:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT otp, otp_expires FROM users WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return False
        stored_otp, expires = row
        if stored_otp != otp:
            return False
        if expires and int(time.time()) > expires:
            return False
        cur.execute("UPDATE users SET otp=NULL, otp_expires=NULL WHERE user_id=%s", (user_id,))
        return True


def update_user_password(user_id: str, pw_hash: str):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET password=%s WHERE user_id=%s", (pw_hash, user_id))


# ══════════════════════════════════════════════════════════════
# CRUD — messages
# ══════════════════════════════════════════════════════════════

def _row_to_message(row, cols) -> dict:
    m = dict(zip(cols, row))
    extra = {}
    if m.get("extra"):
        extra = m["extra"] if isinstance(m["extra"], dict) else json.loads(m["extra"])
    result = {
        "id": m["id"], "patient_id": m["patient_id"], "bed": m["bed"],
        "text": m["content"], "emotion": m["emotion"],
        "ttas_level": m["ttas_level"], "replied": m["replied"],
        "reply_text": m["reply_text"], "reply_by_role": m["reply_by"],
        "timestamp": m["timestamp"],
        **extra,
    }
    return result


def get_messages_by_patient(patient_id: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM messages WHERE patient_id=%s ORDER BY timestamp DESC",
            (patient_id,),
        )
        cols = [d[0] for d in cur.description]
        return [_row_to_message(r, cols) for r in cur.fetchall()]


def get_messages_by_bed(bed: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM messages WHERE bed=%s ORDER BY timestamp", (bed,))
        cols = [d[0] for d in cur.description]
        return [_row_to_message(r, cols) for r in cur.fetchall()]


def get_all_messages() -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM messages ORDER BY id")
        cols = [d[0] for d in cur.description]
        return [_row_to_message(r, cols) for r in cur.fetchall()]


def create_message(patient_id: str, bed: str, content: str, emotion: str,
                   ttas_level: int, timestamp: str, extra: dict = None) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO messages
               (patient_id, bed, content, emotion, ttas_level, replied,
                reply_text, reply_by, timestamp, extra)
               VALUES (%s,%s,%s,%s,%s,FALSE,NULL,NULL,%s,%s)
               RETURNING id""",
            (patient_id, bed, content, emotion, ttas_level, timestamp,
             json.dumps(extra or {}, ensure_ascii=False)),
        )
        return cur.fetchone()[0]


def update_message_reply(msg_id: int, reply_text: str, reply_by: str, extra_update: dict = None):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE messages SET replied=TRUE, reply_text=%s, reply_by=%s WHERE id=%s",
            (reply_text, reply_by, msg_id),
        )
        if extra_update:
            cur.execute("SELECT extra FROM messages WHERE id=%s", (msg_id,))
            row = cur.fetchone()
            extra = {}
            if row and row[0]:
                extra = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            extra.update(extra_update)
            cur.execute("UPDATE messages SET extra=%s WHERE id=%s",
                        (json.dumps(extra, ensure_ascii=False), msg_id))


def update_message_extra(msg_id: int, **kwargs):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT extra FROM messages WHERE id=%s", (msg_id,))
        row = cur.fetchone()
        extra = {}
        if row and row[0]:
            extra = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        extra.update(kwargs)
        cur.execute("UPDATE messages SET extra=%s WHERE id=%s",
                    (json.dumps(extra, ensure_ascii=False), msg_id))


# ══════════════════════════════════════════════════════════════
# CRUD — queues
# ══════════════════════════════════════════════════════════════

def get_queue(queue_type: str) -> list:
    """取得未處理的佇列項目，並 JOIN messages 取得完整訊息資料。"""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT q.id AS q_id, q.queue_type, q.message_id, q.patient_id,
                      q.bed, q.processed, q.created_at,
                      m.content, m.emotion, m.ttas_level, m.replied,
                      m.reply_text, m.reply_by, m.timestamp, m.extra
               FROM queues q
               LEFT JOIN messages m ON m.id = q.message_id
               WHERE q.queue_type=%s AND q.processed=FALSE
               ORDER BY m.ttas_level, m.timestamp""",
            (queue_type,),
        )
        rows = cur.fetchall()
        results = []
        for row in rows:
            extra = {}
            if row[14]:
                extra = row[14] if isinstance(row[14], dict) else json.loads(row[14])
            results.append({
                "id": row[2],  # message_id as id for compatibility
                "queue_id": row[0],
                "patient_id": row[3],
                "bed": row[4],
                "text": row[7],
                "emotion": row[8],
                "ttas_level": row[9],
                "replied": row[10],
                "reply_text": row[11],
                "timestamp": row[13],
                **extra,
            })
        return results


def add_to_queue(queue_type: str, message_id: int, patient_id: str,
                 bed: str, created_at: str):
    with get_conn() as conn:
        cur = conn.cursor()
        # avoid duplicate
        cur.execute(
            "SELECT id FROM queues WHERE queue_type=%s AND message_id=%s",
            (queue_type, message_id),
        )
        if cur.fetchone():
            return
        cur.execute(
            """INSERT INTO queues (queue_type, message_id, patient_id, bed, processed, created_at)
               VALUES (%s,%s,%s,%s,FALSE,%s)""",
            (queue_type, message_id, patient_id, bed, created_at),
        )


def mark_queue_processed(message_id: int, queue_type: str = None):
    with get_conn() as conn:
        cur = conn.cursor()
        if queue_type:
            cur.execute(
                "UPDATE queues SET processed=TRUE WHERE message_id=%s AND queue_type=%s",
                (message_id, queue_type),
            )
        else:
            cur.execute(
                "UPDATE queues SET processed=TRUE WHERE message_id=%s",
                (message_id,),
            )


# ══════════════════════════════════════════════════════════════
# CRUD — crowd_tasks
# ══════════════════════════════════════════════════════════════

def _row_to_task(row, cols) -> dict:
    t = dict(zip(cols, row))
    extra = {}
    if t.get("extra"):
        extra = t["extra"] if isinstance(t["extra"], dict) else json.loads(t["extra"])
    result = {**extra, "id": t["id"], "task_type": t["task_type"],
              "description": t["description"], "status": t["status"],
              "video_url": t["video_url"], "uploader_id": t["uploader_id"],
              "patient_id": t["patient_id"], "points": t["points"],
              "submitted_at": t["submitted_at"]}
    return result


def get_all_tasks() -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM crowd_tasks ORDER BY id")
        cols = [d[0] for d in cur.description]
        return [_row_to_task(r, cols) for r in cur.fetchall()]


def get_task(task_id: str) -> Optional[dict]:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM crowd_tasks WHERE id=%s", (task_id,))
        row = cur.fetchone()
        if not row:
            return None
        cols = [d[0] for d in cur.description]
        return _row_to_task(row, cols)


def create_task(task_id: str, task_type: str, description: str, status: str,
                points: int, extra: dict = None) -> str:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO crowd_tasks
               (id, task_type, description, status, points, extra)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (task_id, task_type, description, status, points,
             json.dumps(extra or {}, ensure_ascii=False)),
        )
    return task_id


def update_task(task_id: str, **kwargs):
    """Update arbitrary task fields. Unrecognized keys go into extra."""
    known = {"task_type","description","status","video_url","uploader_id",
             "patient_id","points","submitted_at"}
    direct = {k: v for k, v in kwargs.items() if k in known}
    extra_updates = {k: v for k, v in kwargs.items() if k not in known}

    with get_conn() as conn:
        cur = conn.cursor()
        if direct:
            sets = ", ".join(f"{k}=%s" for k in direct)
            cur.execute(
                f"UPDATE crowd_tasks SET {sets} WHERE id=%s",
                (*direct.values(), task_id),
            )
        if extra_updates:
            cur.execute("SELECT extra FROM crowd_tasks WHERE id=%s", (task_id,))
            row = cur.fetchone()
            extra = {}
            if row and row[0]:
                extra = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            extra.update(extra_updates)
            cur.execute("UPDATE crowd_tasks SET extra=%s WHERE id=%s",
                        (json.dumps(extra, ensure_ascii=False), task_id))


# ══════════════════════════════════════════════════════════════
# CRUD — crowd_stats
# ══════════════════════════════════════════════════════════════

def get_stats(user_id: str) -> dict:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM crowd_stats WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return {"completed": 0, "points": 0, "week_points": 0, "month_points": 0}
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))


def get_all_stats() -> dict:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM crowd_stats")
        cols = [d[0] for d in cur.description]
        return {row[0]: dict(zip(cols, row)) for row in cur.fetchall()}


def upsert_stats(user_id: str, **kwargs):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM crowd_stats WHERE user_id=%s", (user_id,))
        if cur.fetchone():
            if kwargs:
                sets = ", ".join(f"{k}=%s" for k in kwargs)
                cur.execute(
                    f"UPDATE crowd_stats SET {sets} WHERE user_id=%s",
                    (*kwargs.values(), user_id),
                )
        else:
            fields = ["user_id"] + list(kwargs.keys())
            values = [user_id] + list(kwargs.values())
            cur.execute(
                f"INSERT INTO crowd_stats ({','.join(fields)}) VALUES ({','.join(['%s']*len(fields))})",
                values,
            )


def increment_stats(user_id: str, points: int = 0, completed: int = 0,
                    week_points: int = 0, month_points: int = 0):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM crowd_stats WHERE user_id=%s", (user_id,))
        if cur.fetchone():
            cur.execute(
                """UPDATE crowd_stats SET
                   points = points + %s,
                   completed = completed + %s,
                   week_points = week_points + %s,
                   month_points = month_points + %s
                   WHERE user_id=%s""",
                (points, completed, week_points, month_points, user_id),
            )
        else:
            cur.execute(
                """INSERT INTO crowd_stats (user_id, points, completed, week_points, month_points)
                   VALUES (%s,%s,%s,%s,%s)""",
                (user_id, points, completed, week_points, month_points),
            )


# ══════════════════════════════════════════════════════════════
# CRUD — friends
# ══════════════════════════════════════════════════════════════

def get_friends(user_id: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT user_id, friend_id, status, created_at FROM friends
               WHERE (user_id=%s OR friend_id=%s) AND status='accepted'""",
            (user_id, user_id),
        )
        friends = []
        for row in cur.fetchall():
            fid = row[1] if row[0] == user_id else row[0]
            friends.append({"friend_id": fid, "status": row[2], "since": row[3]})
        return friends


def get_friend_requests(to_id: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, user_id, friend_id, status, created_at FROM friends WHERE friend_id=%s AND status='pending'",
            (to_id,),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def create_friend_request(from_id: str, to_id: str, created_at: str):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM friends WHERE user_id=%s AND friend_id=%s",
            (from_id, to_id),
        )
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (%s,%s,'pending',%s)",
                (from_id, to_id, created_at),
            )


def respond_friend_request(request_id: int, action: str, created_at: str):
    with get_conn() as conn:
        cur = conn.cursor()
        new_status = "accepted" if action == "accept" else "declined"
        cur.execute("UPDATE friends SET status=%s WHERE id=%s", (new_status, request_id))
        if action == "accept":
            cur.execute(
                "SELECT user_id, friend_id FROM friends WHERE id=%s", (request_id,)
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (%s,%s,'accepted',%s)",
                    (row[1], row[0], created_at),
                )


def are_friends(user1: str, user2: str) -> bool:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT id FROM friends
               WHERE ((user_id=%s AND friend_id=%s) OR (user_id=%s AND friend_id=%s))
               AND status='accepted'""",
            (user1, user2, user2, user1),
        )
        return cur.fetchone() is not None


# ══════════════════════════════════════════════════════════════
# CRUD — chat_messages
# ══════════════════════════════════════════════════════════════

def get_chat(user_id: str, other_id: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, from_id, to_id, content, timestamp FROM chat_messages
               WHERE (from_id=%s AND to_id=%s) OR (from_id=%s AND to_id=%s)
               ORDER BY timestamp""",
            (user_id, other_id, other_id, user_id),
        )
        rows = cur.fetchall()
        return [{"id": r[0], "from_id": r[1], "to_id": r[2],
                 "text": r[3], "timestamp": r[4]} for r in rows]


def create_chat_message(from_id: str, to_id: str, content: str, timestamp: str) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO chat_messages (from_id, to_id, content, timestamp) VALUES (%s,%s,%s,%s) RETURNING id",
            (from_id, to_id, content, timestamp),
        )
        return cur.fetchone()[0]


def count_unread_chat(to_id: str) -> int:
    """Count chat messages not yet read. Uses extra field workaround."""
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM chat_messages WHERE to_id=%s", (to_id,))
        return cur.fetchone()[0]


# ══════════════════════════════════════════════════════════════
# CRUD — prescriptions
# ══════════════════════════════════════════════════════════════

def get_prescriptions_by_bed(bed: str) -> list:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM prescriptions WHERE extra::text LIKE %s ORDER BY created_at",
            (f"%{bed}%",),
        )
        cols = [d[0] for d in cur.description]
        results = []
        for row in cur.fetchall():
            p = dict(zip(cols, row))
            extra = p.get("extra", {})
            if isinstance(extra, str):
                extra = json.loads(extra)
            results.append({**extra, "id": p["id"], "patient_id": p["patient_id"],
                             "doctor_id": p["doctor_id"], "visual_type": p["visual_type"],
                             "description": p["description"], "task_id": p["task_id"],
                             "created_at": p["created_at"]})
        return results


def create_prescription(patient_id: str, doctor_id: str, visual_type: str,
                        description: str, task_id: str, created_at: str,
                        extra: dict = None):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO prescriptions
               (patient_id, doctor_id, visual_type, description, task_id, created_at, extra)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (patient_id, doctor_id, visual_type, description, task_id, created_at,
             json.dumps(extra or {}, ensure_ascii=False)),
        )
