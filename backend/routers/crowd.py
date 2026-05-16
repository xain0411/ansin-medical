"""
backend/routers/crowd.py
任務、上傳、積分、排行榜、好友、聊天、通知
"""
import os
import shutil
import uuid
from datetime import datetime as _dt
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from backend import database as db
from backend import state
from backend.models import (
    SpotRequest, YoutubeSubmitRequest, PointsRequest, FinalizePointsRequest,
)
from urllib.parse import urlparse, parse_qs
import re as _re

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── 獎勵等級 ──────────────────────────────────────────
REWARD_TIERS = [
    {"threshold": 200,  "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券",  "icon": "☕",  "id": "reward_711"},
    {"threshold": 1000, "store": "星巴克",     "item": "中杯星冰樂兌換券",    "icon": "🌟", "id": "reward_sbux"},
    {"threshold": 3000, "store": "Uber Eats",  "item": "NT$150 折扣碼",       "icon": "🎁",  "id": "reward_uber"},
]

_WEEK_REWARDS = [
    {"rank": 1, "store": "星巴克",    "item": "中杯星冰樂兌換券",  "icon": "🌟"},
    {"rank": 2, "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券", "icon": "☕"},
    {"rank": 3, "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券", "icon": "☕"},
]
_MONTH_REWARDS = [
    {"rank": 1, "store": "Uber Eats", "item": "NT$150 折扣碼",     "icon": "🎁"},
    {"rank": 2, "store": "星巴克",    "item": "中杯星冰樂兌換券",  "icon": "🌟"},
    {"rank": 3, "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券", "icon": "☕"},
]

# ── YouTube 安全驗證 ──────────────────────────────────
_YT_ALLOWED_DOMAINS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}
_YT_VIDEO_ID_RE = _re.compile(r'^[A-Za-z0-9_-]{11}$')


def _extract_youtube_id(url: str):
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme not in ("https", "http"):
            return None
        if parsed.netloc.lower() not in _YT_ALLOWED_DOMAINS:
            return None
        domain = parsed.netloc.lower().lstrip("www.")
        if domain == "youtu.be":
            vid = parsed.path.lstrip("/").split("?")[0]
        else:
            params = parse_qs(parsed.query)
            vid_list = params.get("v", [])
            if not vid_list:
                return None
            vid = vid_list[0]
        return vid if _YT_VIDEO_ID_RE.match(vid) else None
    except Exception:
        return None


def _get_all_tasks():
    try:
        return db.get_all_tasks()
    except Exception:
        import fake_db as fdb
        return list(fdb.CROWD_TASKS)


def _get_task(task_id: str):
    try:
        return db.get_task(task_id)
    except Exception:
        import fake_db as fdb
        return next((t for t in fdb.CROWD_TASKS if t["id"] == task_id), None)


def _update_task(task_id: str, **kwargs):
    try:
        db.update_task(task_id, **kwargs)
    except Exception:
        import fake_db as fdb
        t = next((t for t in fdb.CROWD_TASKS if t["id"] == task_id), None)
        if t:
            t.update(kwargs)


def _get_stats(user_id: str):
    try:
        return db.get_stats(user_id) or {"completed": 0, "points": 0, "week_points": 0, "month_points": 0}
    except Exception:
        import fake_db as fdb
        return fdb.CROWD_STATS.get(user_id, {"completed": 0, "points": 0, "week_points": 0, "month_points": 0})


def _get_all_stats():
    try:
        return db.get_all_stats()
    except Exception:
        import fake_db as fdb
        return dict(fdb.CROWD_STATS)


def _increment_stats(user_id: str, points: int = 0, completed: int = 0,
                     week_points: int = 0, month_points: int = 0):
    try:
        db.increment_stats(user_id, points=points, completed=completed,
                           week_points=week_points, month_points=month_points)
    except Exception:
        import fake_db as fdb
        s = fdb.CROWD_STATS.setdefault(user_id, {"completed": 0, "points": 0,
                                                   "week_points": 0, "month_points": 0})
        s["points"]       = s.get("points", 0) + points
        s["completed"]    = s.get("completed", 0) + completed
        s["week_points"]  = s.get("week_points", 0) + week_points
        s["month_points"] = s.get("month_points", 0) + month_points


def _get_user(user_id: str):
    try:
        return db.get_user(user_id) or {}
    except Exception:
        import fake_db as fdb
        return fdb.USERS.get(user_id, {})


# ════════════════════════════════════════════════
# 任務端點
# ════════════════════════════════════════════════

@router.post("/api/spot-request")
def create_spot_request(req: SpotRequest):
    tasks = _get_all_tasks()
    task_id = f"task_{len(tasks)+1:03d}"
    new_task = {
        "id": task_id, "location": req.location, "description": req.description,
        "points": 200, "bonus": False,
        "requested_by": f"{req.requested_by}號病房",
        "status": "open", "lat": req.lat, "lng": req.lng,
    }
    try:
        db.create_task(task_id, "general", req.description, "open", 200, extra=new_task)
    except Exception:
        import fake_db as fdb
        fdb.CROWD_TASKS.append(new_task)
    return {"success": True, "task": new_task}


@router.get("/api/crowd/videos")
def get_crowd_videos():
    tasks = _get_all_tasks()
    videos = [t for t in tasks
              if t.get("status") == "completed"
              and t.get("video_url")
              and t.get("lat")
              and t.get("lng")]
    return {"videos": videos}


@router.get("/api/crowd/tasks")
def get_crowd_tasks(patient_id: str = "", status: str = ""):
    tasks = _get_all_tasks()
    if status:
        status_list = [s.strip() for s in status.split(",")]
        filtered = [t for t in tasks if t.get("status") in status_list]
    else:
        filtered = [t for t in tasks if t.get("status") in ("open", "in_progress")]
    return {"tasks": filtered}


@router.get("/api/crowd/tasks/{task_id}")
def get_single_task(task_id: str):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    return {"task": task}


@router.post("/api/crowd/tasks/{task_id}/complete")
def complete_task(task_id: str):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    _update_task(task_id, status="completed")
    return {"success": True, "points_earned": task.get("points", 0)}


@router.post("/api/crowd/upload")
async def upload_video(
    task_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Form(default="crowd_001"),
):
    allowed = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"不支援的檔案格式：{ext}")
    save_name = f"{task_id}_{uuid.uuid4().hex[:8]}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    video_url = f"/uploads/{save_name}"

    task = _get_task(task_id)
    base_points = 0
    if task:
        new_status = "review" if task.get("task_type") == "prescription" else "pending_ai"
        _update_task(task_id, status=new_status, video_url=video_url,
                     uploader_id=user_id,
                     submitted_at=_dt.now().strftime("%Y/%m/%d %H:%M"),
                     patient_notif_read=False)
        base_points = task.get("points", 200)

    _increment_stats(user_id, completed=1)
    stats = _get_stats(user_id)
    return {
        "success": True, "video_url": video_url, "filename": save_name,
        "points_earned": 0, "base_points": base_points,
        "total_points": stats.get("points", 0), "task_id": task_id,
        "milestone_reward": None, "week_rank": 0, "month_rank": 0,
        "week_points": stats.get("week_points", 0),
        "month_points": stats.get("month_points", 0),
    }


@router.post("/api/crowd/submit-youtube")
def submit_youtube_link(req: YoutubeSubmitRequest):
    vid = _extract_youtube_id(req.youtube_url)
    if not vid:
        raise HTTPException(400, "連結無效：僅接受 youtube.com 或 youtu.be 的影片連結")
    task = _get_task(req.task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    if task["status"] != "open":
        raise HTTPException(400, "此任務目前無法提交")
    embed_url = f"https://www.youtube-nocookie.com/embed/{vid}"
    new_status = "review" if task.get("task_type") == "prescription" else "pending_ai"
    _update_task(req.task_id, status=new_status, video_url=embed_url,
                 youtube_vid=vid, uploader_id=req.user_id,
                 submitted_at=_dt.now().strftime("%Y/%m/%d %H:%M"),
                 patient_notif_read=False)
    _increment_stats(req.user_id, completed=1)
    return {"success": True, "points_earned": 0,
            "base_points": task.get("points", 200),
            "embed_url": embed_url, "youtube_vid": vid}


# ════════════════════════════════════════════════
# 積分
# ════════════════════════════════════════════════

@router.get("/api/crowd/stats/{user_id}")
def get_crowd_stats(user_id: str):
    stats = _get_stats(user_id)
    tasks = _get_all_tasks()
    in_progress = sum(1 for t in tasks if t.get("status") == "in_progress")
    if in_progress == 0:
        in_progress = sum(1 for t in tasks if t.get("status") == "open")
    try:
        all_msgs = db.get_all_messages()
        total_msgs   = len(all_msgs)
        replied_msgs = sum(1 for m in all_msgs if m.get("replied"))
    except Exception:
        import fake_db as fdb
        total_msgs   = len(fdb.MESSAGES)
        replied_msgs = sum(1 for m in fdb.MESSAGES if m.get("replied"))
    satisfaction = round((replied_msgs / total_msgs) * 100) if total_msgs > 0 else 95
    satisfaction = max(70, min(99, satisfaction))
    return {
        "completed":       stats.get("completed", 0),
        "week_completed":  stats.get("week_completed", 0),
        "month_completed": stats.get("month_completed", 0),
        "in_progress":     in_progress, "satisfaction": satisfaction,
        "points":          stats.get("points", 0),
        "week_points":     stats.get("week_points", 0),
        "month_points":    stats.get("month_points", 0),
        "week_streak":     stats.get("week_streak", 0),
        "month_streak":    stats.get("month_streak", 0),
    }


@router.post("/api/crowd/stats/{user_id}/points")
def add_points(user_id: str, req: PointsRequest):
    _increment_stats(user_id, points=req.points)
    stats = _get_stats(user_id)
    return {"success": True, "total_points": stats.get("points", 0)}


@router.post("/api/crowd/finalize_points/{task_id}")
def finalize_points(task_id: str, req: FinalizePointsRequest):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    base_points = task.get("points", 200)
    score_pct   = max(0, min(100, req.score_pct))
    points_earned = base_points if score_pct >= 70 else int(score_pct / 70 * base_points)

    if task.get("status") == "pending_ai":
        _update_task(task_id, status="completed",
                     ai_score_pct=score_pct, points_awarded=points_earned)

    prev_stats = _get_stats(req.user_id)
    prev_total = prev_stats.get("points", 0)
    _increment_stats(req.user_id, points=points_earned,
                     week_points=points_earned, month_points=points_earned)
    new_stats = _get_stats(req.user_id)
    new_total  = new_stats.get("points", 0)

    all_stats = _get_all_stats()
    week_rank  = 1 + sum(1 for uid, s in all_stats.items()
                         if uid != req.user_id and s.get("week_points", 0) > new_stats.get("week_points", 0))
    month_rank = 1 + sum(1 for uid, s in all_stats.items()
                         if uid != req.user_id and s.get("month_points", 0) > new_stats.get("month_points", 0))
    milestone_reward = None
    for tier in REWARD_TIERS:
        if prev_total < tier["threshold"] <= new_total:
            milestone_reward = tier
            break
    return {
        "success": True, "points_earned": points_earned, "base_points": base_points,
        "score_pct": score_pct, "total_points": new_total,
        "milestone_reward": milestone_reward, "week_rank": week_rank,
        "month_rank": month_rank, "week_points": new_stats.get("week_points", 0),
        "month_points": new_stats.get("month_points", 0),
    }


# ════════════════════════════════════════════════
# 排行榜
# ════════════════════════════════════════════════

@router.get("/api/leaderboard/{period}")
def get_leaderboard(period: str):
    key_map = {"weekly": "week_points", "monthly": "month_points", "alltime": "points"}
    key = key_map.get(period, "points")
    all_stats = _get_all_stats()
    try:
        users = db.get_all_users()
    except Exception:
        import fake_db as fdb
        users = fdb.USERS
    rows = []
    for uid, s in all_stats.items():
        u = users.get(uid, {})
        rows.append({
            "user_id": uid, "name": u.get("name", uid),
            "points": s.get(key, 0), "total_points": s.get("points", 0),
            "week_streak": s.get("week_streak", 0), "month_streak": s.get("month_streak", 0),
        })
    rows.sort(key=lambda x: x["points"], reverse=True)
    reward_map = {"weekly": _WEEK_REWARDS, "monthly": _MONTH_REWARDS}
    rewards_list = reward_map.get(period, [])
    for i, row in enumerate(rows):
        row["rank"] = i + 1
        row["reward"] = next((r for r in rewards_list if r["rank"] == i + 1), None)
    return {"period": period, "entries": rows[:10]}


@router.get("/api/leaderboard/rewards/{user_id}")
def get_user_rewards(user_id: str):
    rewards = state.LEADERBOARD_REWARDS.get(user_id, [])
    return {"user_id": user_id, "rewards": rewards}


@router.get("/api/crowd/rewards")
def get_rewards():
    return {"rewards": REWARD_TIERS}


@router.post("/api/crowd/redeem/{user_id}/{reward_id}")
def redeem_reward(user_id: str, reward_id: str):
    stats = _get_stats(user_id)
    if not stats:
        raise HTTPException(404, "用戶不存在")
    tier = next((r for r in REWARD_TIERS if r["id"] == reward_id), None)
    if not tier:
        raise HTTPException(404, "獎勵不存在")
    if stats.get("points", 0) < tier["threshold"]:
        raise HTTPException(400, f"積分不足，需要 {tier['threshold']} 點")
    key = f"{user_id}_{reward_id}"
    if key not in state.REDEEMED:
        import random, string
        code = "-".join("".join(random.choices(string.ascii_uppercase + string.digits, k=4)) for _ in range(3))
        _n = _dt.now()
        state.REDEEMED[key] = {
            "code": code, "store": tier["store"], "item": tier["item"], "icon": tier["icon"],
            "issued_at": f"{_n.year}/{_n.month}/{_n.day}", "expires": "2026/12/31",
        }
    return {"success": True, "reward": state.REDEEMED[key]}


# ════════════════════════════════════════════════
# 志工影響力回饋
# ════════════════════════════════════════════════

@router.post("/api/crowd/thank/{task_id}")
def thank_volunteer(task_id: str, patient_id: str = ""):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    thanks_count = task.get("thanks_count", 0) + 1
    _update_task(task_id, thanks_count=thanks_count)
    uploader = task.get("uploader_id", "crowd_001")
    _increment_stats(uploader, points=10)
    patient = _get_user(patient_id)
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")
    state.RATINGS.append({
        "id": f"thank_{task_id}_{len(state.RATINGS)}",
        "task_id": task_id, "patient_id": patient_id,
        "patient_name": patient.get("name", "病患"),
        "uploader_id": uploader,
        "stars": 0, "message_text": "💝 病患向你表達了感謝！",
        "voice_url": None, "timestamp": ts, "read": False, "is_thank": True,
    })
    return {"success": True, "thanks_count": thanks_count}


@router.post("/api/crowd/like/{task_id}")
def like_video(task_id: str, patient_id: str = ""):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    likes = task.get("likes_count", 0) + 1
    _update_task(task_id, likes_count=likes)
    uploader = task.get("uploader_id", "crowd_001")
    _increment_stats(uploader, points=5)
    patient = _get_user(patient_id)
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")
    state.RATINGS.append({
        "id": f"like_{task_id}_{len(state.RATINGS)}",
        "task_id": task_id, "patient_id": patient_id,
        "patient_name": patient.get("name", "病患"),
        "uploader_id": uploader, "stars": 0, "message_text": "",
        "voice_url": None, "timestamp": ts, "read": False, "notif_type": "like",
    })
    return {"success": True, "likes_count": likes}


@router.post("/api/crowd/feedback")
async def send_feedback(
    task_id: str = Form(...),
    patient_id: str = Form(default=""),
    message: str = Form(default=""),
    voice: Optional[UploadFile] = File(default=None),
    photo: Optional[UploadFile] = File(default=None),
):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    uploader = task.get("uploader_id", "crowd_001")
    patient = _get_user(patient_id)
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")

    voice_url = None
    if voice and voice.filename:
        ext = os.path.splitext(voice.filename)[-1].lower() or ".webm"
        fname = f"fb_voice_{uuid.uuid4().hex[:8]}{ext}"
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
            shutil.copyfileobj(voice.file, f)
        voice_url = f"/uploads/{fname}"

    photo_url = None
    if photo and photo.filename:
        ext = os.path.splitext(photo.filename)[-1].lower() or ".jpg"
        fname = f"fb_photo_{uuid.uuid4().hex[:8]}{ext}"
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
            shutil.copyfileobj(photo.file, f)
        photo_url = f"/uploads/{fname}"

    fb_id = f"fb_{task_id}_{uuid.uuid4().hex[:6]}"
    state.RATINGS.append({
        "id": fb_id, "task_id": task_id, "patient_id": patient_id,
        "patient_name": patient.get("name", "病患"), "uploader_id": uploader,
        "stars": 0, "message_text": message, "voice_url": voice_url,
        "photo_url": photo_url, "timestamp": ts, "read": False, "notif_type": "feedback",
    })
    return {"success": True, "feedback_id": fb_id}


@router.post("/api/crowd/rate")
async def rate_video(body: dict):
    task_id    = body.get("task_id", "")
    patient_id = body.get("patient_id", "")
    stars      = int(body.get("stars", 5))
    message    = body.get("message_text", "").strip()
    add_friend = bool(body.get("add_friend", False))

    task = _get_task(task_id)
    if not task:
        raise HTTPException(404, "任務不存在")
    uploader_id  = task.get("uploader_id", "")
    patient      = _get_user(patient_id)
    patient_name = patient.get("name", "病患")
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")

    rate_id = f"rate_{len(state.RATINGS)+1:03d}"
    state.RATINGS.append({
        "id": rate_id, "task_id": task_id,
        "patient_id": patient_id, "patient_name": patient_name,
        "uploader_id": uploader_id, "stars": stars, "message_text": message,
        "voice_url": None, "timestamp": ts, "read": False,
    })

    if uploader_id:
        uploader_ratings = [r for r in state.RATINGS if r.get("uploader_id") == uploader_id and r.get("stars", 0) > 0]
        if uploader_ratings:
            avg = sum(r["stars"] for r in uploader_ratings) / len(uploader_ratings)
            _increment_stats(uploader_id, points=stars * 10,
                             week_points=stars * 10, month_points=stars * 10)

    freq_id = None
    if add_friend and uploader_id:
        try:
            already = db.are_friends(patient_id, uploader_id)
        except Exception:
            import fake_db as fdb
            already = any(
                (fs["user1_id"] == patient_id and fs["user2_id"] == uploader_id) or
                (fs["user1_id"] == uploader_id and fs["user2_id"] == patient_id)
                for fs in fdb.FRIENDSHIPS
            )
        pending_req = any(
            r.get("from_id") == patient_id and r.get("to_id") == uploader_id
            and r.get("status") == "pending"
            for r in state.FRIEND_REQUEST_CACHE
        )
        if not already and not pending_req:
            freq_id = f"freq_{len(state.FRIEND_REQUEST_CACHE)+1:03d}"
            state.FRIEND_REQUEST_CACHE.append({
                "id": freq_id, "from_id": patient_id,
                "from_name": f"{patient_name}（病患）",
                "to_id": uploader_id,
                "message": message or "希望成為朋友！",
                "status": "pending", "timestamp": ts,
            })
            try:
                db.create_friend_request(patient_id, uploader_id, ts)
            except Exception:
                import fake_db as fdb
                fdb.FRIEND_REQUESTS.append({
                    "id": freq_id, "from_id": patient_id,
                    "from_name": f"{patient_name}（病患）", "to_id": uploader_id,
                    "message": message or "希望成為朋友！",
                    "status": "pending", "timestamp": ts,
                })

    if task and task.get("status") in ("review", "completed"):
        _update_task(task_id, status="adopted")

    return {"ok": True, "rate_id": rate_id, "freq_id": freq_id}


@router.post("/api/crowd/rate/{rate_id}/voice")
async def attach_rating_voice(rate_id: str, file: UploadFile = File(...)):
    allowed = {".webm", ".ogg", ".mp3", ".m4a", ".wav"}
    ext = os.path.splitext(file.filename or "audio.webm")[-1].lower() or ".webm"
    if ext not in allowed:
        ext = ".webm"
    save_name = f"voice_{rate_id}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    voice_url = f"/uploads/{save_name}"
    rate = next((r for r in state.RATINGS if r["id"] == rate_id), None)
    if rate:
        rate["voice_url"] = voice_url
    return {"ok": True, "voice_url": voice_url}


# ════════════════════════════════════════════════
# 通知
# ════════════════════════════════════════════════

@router.get("/api/notifications/{user_id}")
def get_notifications(user_id: str):
    try:
        user = db.get_user(user_id) or {}
    except Exception:
        import fake_db as fdb
        user = fdb.USERS.get(user_id, {})

    notifs = []

    # 群眾端：評分／感謝／回饋
    for r in state.RATINGS:
        if r.get("uploader_id") == user_id:
            ntype = r.get("notif_type", "thank" if r.get("is_thank") else "rating")
            notif = {
                "id": r["id"], "type": ntype,
                "from_name": r.get("patient_name", "病患"),
                "timestamp": r["timestamp"], "read": r.get("read", False),
            }
            if ntype == "rating":
                notif["stars"] = r.get("stars", 5)
                notif["message"] = r.get("message_text", "")
                notif["voice_url"] = r.get("voice_url")
            elif ntype == "feedback":
                notif["message"] = r.get("message_text", "")
                notif["voice_url"] = r.get("voice_url")
                notif["photo_url"] = r.get("photo_url")
            notifs.append(notif)

    # 好友申請
    for fr in state.FRIEND_REQUEST_CACHE:
        if fr.get("to_id") == user_id and fr.get("status") == "pending":
            notifs.append({
                "id": fr["id"], "type": "friend_request",
                "from_id": fr.get("from_id"), "from_name": fr.get("from_name"),
                "message": fr.get("message", ""), "timestamp": fr["timestamp"], "read": False,
            })

    # 病患端
    if user.get("role") == "patient":
        try:
            all_msgs = db.get_messages_by_patient(user_id)
        except Exception:
            import fake_db as fdb
            all_msgs = [m for m in fdb.MESSAGES if m["patient_id"] == user_id]
        for msg in all_msgs:
            if msg.get("replied") and msg.get("reply_text"):
                role = msg.get("reply_by_role", msg.get("reply_by", "attending"))
                notifs.append({
                    "id": f"msg_{msg['id']}", "type": "doctor_reply",
                    "reply_by_role": role,
                    "message_preview": (msg.get("text") or msg.get("content", ""))[:30],
                    "reply_text": msg.get("reply_text", ""),
                    "timestamp": msg.get("timestamp", ""),
                    "read": msg.get("patient_read", False),
                })
        for eta in state.ETA_NOTICES:
            if eta["patient_id"] == user_id:
                notifs.append({
                    "id": eta["id"], "type": "eta_notice",
                    "eta": eta["eta"], "doctor_name": eta.get("doctor_name", "醫師"),
                    "timestamp": eta["timestamp"], "read": eta.get("read", False),
                })
        patient_bed = user.get("bed", "")
        tasks = _get_all_tasks()
        for task in tasks:
            if task.get("status") not in ("review", "adopted", "pending_ai", "completed"):
                continue
            if not (task.get("video_url") or task.get("youtube_vid")):
                continue
            is_for_patient = (
                task.get("patient_id") == user_id
                or (patient_bed and patient_bed in task.get("requested_by", ""))
            )
            if not is_for_patient:
                continue
            uploader_id = task.get("uploader_id", "")
            uploader_name = _get_user(uploader_id).get("name", "志工")
            video_url = task.get("video_url")
            if not video_url and task.get("youtube_vid"):
                video_url = f"https://www.youtube-nocookie.com/embed/{task['youtube_vid']}"
            notifs.append({
                "id": f"upload_{task['id']}", "type": "task_upload",
                "location": task.get("location", ""),
                "description": task.get("description", ""),
                "video_url": video_url, "uploader_name": uploader_name,
                "timestamp": task.get("submitted_at", task.get("created_at", "")),
                "read": task.get("patient_notif_read", False),
            })

    def _parse_ts(ts):
        if not ts:
            return _dt.min
        try:
            parts = ts.split(' ')
            d = [int(v) for v in parts[0].split('/')]
            t = [int(v) for v in parts[1].split(':')] if len(parts) > 1 else [0, 0]
            return _dt(d[0], d[1], d[2], t[0], t[1])
        except Exception:
            return _dt.min

    notifs.sort(key=lambda x: _parse_ts(x.get("timestamp") or ""), reverse=True)
    notifs = [n for n in notifs if n["id"] not in state.DELETED_NOTIF_IDS]
    try:
        unread_chat = db.count_unread_chat(user_id)
    except Exception:
        import fake_db as fdb
        unread_chat = sum(1 for m in fdb.CHAT_MESSAGES
                         if m["to_id"] == user_id and not m.get("read", False))
    return {"notifications": notifs, "unread_chat": unread_chat,
            "unread_total": sum(1 for n in notifs if not n.get("read")) + unread_chat}


@router.delete("/api/notifications/{notif_id}")
def delete_notif(notif_id: str):
    state.DELETED_NOTIF_IDS.add(notif_id)
    return {"ok": True}


@router.post("/api/notifications/{notif_id}/read")
def mark_notif_read(notif_id: str):
    for r in state.RATINGS:
        if r["id"] == notif_id:
            r["read"] = True
    if notif_id.startswith("msg_"):
        try:
            msg_id = int(notif_id[4:])
            db.update_message_extra(msg_id, patient_read=True)
        except Exception:
            import fake_db as fdb
            for m in fdb.MESSAGES:
                if m["id"] == int(notif_id[4:]):
                    m["patient_read"] = True
    elif notif_id.startswith("upload_"):
        task_id = notif_id[7:]
        _update_task(task_id, patient_notif_read=True)
    for eta in state.ETA_NOTICES:
        if eta["id"] == notif_id:
            eta["read"] = True
    return {"ok": True}


# ════════════════════════════════════════════════
# 好友
# ════════════════════════════════════════════════

@router.post("/api/friend/respond")
async def respond_friend(body: dict):
    req_id = body.get("request_id", "")
    action = body.get("action", "")
    req = next((r for r in state.FRIEND_REQUEST_CACHE if r["id"] == req_id), None)
    if not req:
        raise HTTPException(404, "申請不存在")
    req["status"] = "accepted" if action == "accept" else "declined"
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")
    if action == "accept":
        try:
            rows = db.get_friend_requests(req["to_id"])
            db_req = next((r for r in rows if r["user_id"] == req["from_id"]), None)
            if db_req:
                db.respond_friend_request(db_req["id"], "accept", ts)
        except Exception:
            import fake_db as fdb
            fs_id = f"fs_{len(fdb.FRIENDSHIPS)+1:03d}"
            fdb.FRIENDSHIPS.append({
                "id": fs_id, "user1_id": req["from_id"], "user2_id": req["to_id"],
                "since": ts,
            })
    return {"ok": True, "status": req["status"]}


@router.get("/api/friend/list/{user_id}")
def get_friend_list(user_id: str):
    try:
        friends_data = db.get_friends(user_id)
        friends = []
        for fd in friends_data:
            fid = fd["friend_id"]
            u = _get_user(fid)
            friends.append({
                "id": fid, "name": u.get("name", fid),
                "role": u.get("role", ""), "since": fd["since"], "unread": 0,
            })
    except Exception:
        import fake_db as fdb
        friends = []
        for fs in fdb.FRIENDSHIPS:
            fid = None
            if fs["user1_id"] == user_id:
                fid = fs["user2_id"]
            elif fs["user2_id"] == user_id:
                fid = fs["user1_id"]
            if fid:
                u = fdb.USERS.get(fid, {})
                friends.append({
                    "id": fid, "name": u.get("name", fid),
                    "role": u.get("role", ""), "since": fs["since"], "unread": 0,
                })
    return {"friends": friends}


# ════════════════════════════════════════════════
# 聊天
# ════════════════════════════════════════════════

@router.get("/api/chat/{user_id}/{other_id}")
def get_chat(user_id: str, other_id: str):
    try:
        msgs = db.get_chat(user_id, other_id)
    except Exception:
        import fake_db as fdb
        msgs = [m for m in fdb.CHAT_MESSAGES
                if (m["from_id"] == user_id and m["to_id"] == other_id)
                or (m["from_id"] == other_id and m["to_id"] == user_id)]

        def _ts_key(ts):
            for fmt in ("%Y/%m/%d %H:%M", "%Y/%m/%d"):
                try: return _dt.strptime(ts, fmt)
                except: pass
            return ts
        msgs.sort(key=lambda m: _ts_key(m["timestamp"]))
    return {"messages": msgs}


@router.post("/api/chat/send")
async def send_chat(body: dict):
    from_id = body.get("from_id", "")
    to_id   = body.get("to_id", "")
    text    = body.get("text", "").strip()
    if not from_id or not to_id or not text:
        raise HTTPException(400, "缺少必要欄位")
    try:
        is_friend = db.are_friends(from_id, to_id)
    except Exception:
        import fake_db as fdb
        is_friend = any(
            (fs["user1_id"] == from_id and fs["user2_id"] == to_id) or
            (fs["user1_id"] == to_id and fs["user2_id"] == from_id)
            for fs in fdb.FRIENDSHIPS
        )
    if not is_friend:
        raise HTTPException(403, "尚未成為好友")
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")
    try:
        msg_id = db.create_chat_message(from_id, to_id, text, ts)
        msg = {"id": msg_id, "from_id": from_id, "to_id": to_id, "text": text,
               "voice_url": None, "timestamp": ts, "read": False}
    except Exception:
        import fake_db as fdb
        msg_id = f"cm_{len(fdb.CHAT_MESSAGES)+1:03d}"
        msg = {"id": msg_id, "from_id": from_id, "to_id": to_id,
               "text": text, "voice_url": None, "timestamp": ts, "read": False}
        fdb.CHAT_MESSAGES.append(msg)
    return {"ok": True, "message": msg}


@router.post("/api/chat/voice")
async def send_chat_voice(
    from_id: str = Form(...),
    to_id: str   = Form(...),
    file: UploadFile = File(...),
):
    try:
        is_friend = db.are_friends(from_id, to_id)
    except Exception:
        import fake_db as fdb
        is_friend = any(
            (fs["user1_id"] == from_id and fs["user2_id"] == to_id) or
            (fs["user1_id"] == to_id and fs["user2_id"] == from_id)
            for fs in fdb.FRIENDSHIPS
        )
    if not is_friend:
        raise HTTPException(403, "尚未成為好友")
    ext = os.path.splitext(file.filename or "audio.webm")[-1].lower() or ".webm"
    save_name = f"chat_{from_id}_{_dt.now().strftime('%Y%m%d%H%M%S')}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    voice_url = f"/uploads/{save_name}"
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")
    try:
        msg_id = db.create_chat_message(from_id, to_id, "🎙 語音訊息", ts)
        msg = {"id": msg_id, "from_id": from_id, "to_id": to_id,
               "text": "🎙 語音訊息", "voice_url": voice_url, "timestamp": ts, "read": False}
    except Exception:
        import fake_db as fdb
        msg_id = f"cm_{len(fdb.CHAT_MESSAGES)+1:03d}"
        msg = {"id": msg_id, "from_id": from_id, "to_id": to_id,
               "text": "🎙 語音訊息", "voice_url": voice_url, "timestamp": ts, "read": False}
        fdb.CHAT_MESSAGES.append(msg)
    return {"ok": True, "message": msg}
