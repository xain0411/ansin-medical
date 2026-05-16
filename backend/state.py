"""
backend/state.py — 執行期共享 in-memory 狀態
這些狀態重啟後從 DB 重建（transient lists），
或本身就是純 transient（ETA、情緒警報、評分）。
"""
from typing import List

# ── 待回覆 / 已完成病患（從 messages 表重建）──────────
PENDING_PATIENTS: List[dict] = []
DONE_PATIENTS: List[dict] = []

# ── 醫師預計回覆時間通知（transient）──────────────────
ETA_NOTICES: List[dict] = []

# ── 微表情情緒警報（transient）────────────────────────
EMOTION_ALERTS: List[dict] = []

# ── 病患評分紀錄（transient）──────────────────────────
RATINGS: List[dict] = []

# ── 兌換紀錄（transient）──────────────────────────────
REDEEMED: dict = {}

# ── 已刪除通知 ID（transient）─────────────────────────
DELETED_NOTIF_IDS: set = set()

# ── 好友申請詳細資料 cache（pending, 含 from_name/message）
FRIEND_REQUEST_CACHE: List[dict] = []

# ── 排行榜獎勵紀錄（seed from fake_db）────────────────
LEADERBOARD_REWARDS: dict = {}


def seed_from_fake_db():
    """啟動時從 fake_db 讀取種子狀態（只影響 in-memory transient 資料）。"""
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    try:
        import fake_db as fdb
        PENDING_PATIENTS.extend(fdb.PENDING_PATIENTS)
        DONE_PATIENTS.extend(fdb.DONE_PATIENTS)
        LEADERBOARD_REWARDS.update(fdb.LEADERBOARD_REWARDS)
        FRIEND_REQUEST_CACHE.extend(fdb.FRIEND_REQUESTS)
        RATINGS.extend(getattr(fdb, "RATINGS", []))
    except Exception as e:
        print(f"[STATE] seed_from_fake_db 失敗：{e}")
