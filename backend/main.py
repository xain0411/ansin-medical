# uv run uvicorn backend.main:app --reload --port 8000
# uv run uvicorn backend.main:app --reload --port 8000 --host 0.0.0.0


# backend/main.py
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os, sys, httpx, shutil, uuid, threading, asyncio, re
from urllib.parse import urlparse, parse_qs
from datetime import datetime
import anthropic as _anthropic

sys.path.insert(0, os.path.dirname(__file__))
import fake_db as db

app = FastAPI(title="智慧醫療陪伴系統 API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 靜態檔案（前端）──────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
UPLOAD_DIR   = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/", response_class=FileResponse)
def serve_index():
    return os.path.join(FRONTEND_DIR, "index.html")


# ════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════
class LoginRequest(BaseModel):
    user_id: str
    password: str
    bed: Optional[str] = None

@app.post("/api/login")
def login(req: LoginRequest):
    """登入（假資料版：任何密碼都接受）"""
    user = db.USERS.get(req.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="帳號不存在")
    return {"success": True, "user": user}


# ════════════════════════════════════════════════
# 任意視界 - 地圖景點（fake_db 舊版，保持相容）
# ════════════════════════════════════════════════
@app.get("/api/map/pins")
def get_map_pins():
    """取得所有地圖地標"""
    return {"pins": db.MAP_PINS}

@app.get("/api/map/pins/{pin_id}")
def get_pin_detail(pin_id: str):
    """取得單一地標詳情"""
    pin = next((p for p in db.MAP_PINS if p["id"] == pin_id), None)
    if not pin:
        raise HTTPException(status_code=404, detail="地標不存在")
    return pin


# ════════════════════════════════════════════════
# 任意視界 - Twipcam 即時攝影機（真實 API）
# ════════════════════════════════════════════════

# 內建 cam_url 對照表（由後端快取，避免每次查 twipcam）
_cam_cache: dict = {}          # cam_id -> cam_url

TWIPCAM_LIST_URL = "https://www.twipcam.com/api/v1/cam-list.json"
TWIPCAM_NEARBY_URL = "https://www.twipcam.com/api/v1/query-cam-list-by-coordinate"

# 台灣各城市中心座標（用於從全量清單中篩選各地攝影機）
PRESET_LOCATIONS = [
    # ── 城市 ──
    {"name": "台北市",     "lat": 25.0478, "lon": 121.5319, "category": "城市"},
    {"name": "新北市",     "lat": 25.0169, "lon": 121.4627, "category": "城市"},
    {"name": "台中市",     "lat": 24.1477, "lon": 120.6736, "category": "城市"},
    {"name": "台南市",     "lat": 22.9999, "lon": 120.2269, "category": "城市"},
    {"name": "高雄市",     "lat": 22.6273, "lon": 120.3014, "category": "城市"},
    # ── 山林 ──
    {"name": "陽明山國家公園", "lat": 25.1667, "lon": 121.5500, "category": "山林"},
    {"name": "太魯閣國家公園", "lat": 24.1425, "lon": 121.4778, "category": "山林"},
    {"name": "阿里山",     "lat": 23.5084, "lon": 120.8023, "category": "山林"},
    {"name": "合歡山",     "lat": 24.1417, "lon": 121.2833, "category": "山林"},
    {"name": "司馬庫斯",   "lat": 24.6000, "lon": 121.3667, "category": "山林"},
    {"name": "觀霧",       "lat": 24.5333, "lon": 121.0667, "category": "山林"},
    {"name": "南投縣",     "lat": 23.8400, "lon": 120.9900, "category": "山林"},
    # ── 湖泊溪流 ──
    {"name": "日月潭",     "lat": 23.8655, "lon": 120.9147, "category": "湖泊"},
    {"name": "翠峰湖",     "lat": 24.5667, "lon": 121.4333, "category": "湖泊"},
    {"name": "嘉明湖",     "lat": 23.2833, "lon": 121.0167, "category": "湖泊"},
    # ── 海岸 ──
    {"name": "墾丁",       "lat": 21.9387, "lon": 120.8419, "category": "海岸"},
    {"name": "東北角",     "lat": 25.1206, "lon": 121.8750, "category": "海岸"},
    {"name": "基隆港",     "lat": 25.1276, "lon": 121.7391, "category": "海岸"},
    {"name": "宜蘭南方澳", "lat": 24.5833, "lon": 121.8333, "category": "海岸"},
    {"name": "花蓮港",     "lat": 23.9960, "lon": 121.6018, "category": "海岸"},
    {"name": "台東成功港", "lat": 23.0833, "lon": 121.3667, "category": "海岸"},
    {"name": "澎湖縣",     "lat": 23.5711, "lon": 119.5793, "category": "海岸"},
    {"name": "綠島",       "lat": 22.6667, "lon": 121.4833, "category": "海岸"},
    # ── 農林漁牧 ──
    {"name": "池上稻田",   "lat": 23.1167, "lon": 121.2167, "category": "農林漁牧"},
    {"name": "富里鄉",     "lat": 23.3000, "lon": 121.2833, "category": "農林漁牧"},
    {"name": "桃園埤塘",   "lat": 24.9936, "lon": 121.3010, "category": "農林漁牧"},
    {"name": "彰化沿海",   "lat": 24.0681, "lon": 120.5418, "category": "農林漁牧"},
    {"name": "台南官田",   "lat": 23.1500, "lon": 120.3333, "category": "農林漁牧"},
    # ── 公園地標 ──
    {"name": "大安森林公園",   "lat": 25.0297, "lon": 121.5356, "category": "公園"},
    {"name": "台北植物園",     "lat": 25.0333, "lon": 121.5083, "category": "公園"},
    {"name": "高雄都會公園",   "lat": 22.7000, "lon": 120.3000, "category": "公園"},
]

# ── 療癒精選（YouTube 直播 / 公開自然頻道）──────────────────────
# embed_url 使用 youtube-nocookie.com 保護隱私
THERAPEUTIC_CHANNELS: List[dict] = [
    # ── 大自然（森林）── 3 部確認可播放
    {
        "id": "tc_001", "category": "森林",
        "name": "4K深林鳥鳴 · 8小時",
        "description": "4K畫質・知更鳥與黑鸝輪番歌唱，置身英國古老森林晨曦",
        "embed_url": "https://www.youtube-nocookie.com/embed/FxAgAyZYXJ8?autoplay=1",
        "thumbnail": "🌿", "lat": 51.5074, "lng": -0.1278, "source": "youtube"
    },
    {
        "id": "tc_002", "category": "森林",
        "name": "亞馬遜雨林自然聲",
        "description": "巴西亞馬遜熱帶雨林，蟲鳴鳥叫聲不絕於耳",
        "embed_url": "https://www.youtube-nocookie.com/embed/ydYDqZQpim8?autoplay=1",
        "thumbnail": "🌳", "lat": -3.4653, "lng": -62.2159, "source": "youtube"
    },
    {
        "id": "tc_003", "category": "森林",
        "name": "台灣山林自然聲音",
        "description": "台灣深山林間，溪流鳥鳴輕風，最純粹的自然療癒",
        "embed_url": "https://www.youtube-nocookie.com/embed/BHACKCNDMW8?autoplay=1",
        "thumbnail": "🌲", "lat": 23.6978, "lng": 120.9605, "source": "youtube"
    },
    # ── 海洋 ── 3 部
    {
        "id": "tc_004", "category": "海洋",
        "name": "最療癒海浪聲",
        "description": "溫柔海浪輕拍沙灘，適合入眠、讀書、放空的最佳白噪音",
        "embed_url": "https://www.youtube-nocookie.com/embed/vPhg6sc1Mk4?autoplay=1",
        "thumbnail": "🌊", "lat": 25.0375, "lng": 121.5637, "source": "youtube"
    },
    {
        "id": "tc_005", "category": "海洋",
        "name": "11小時 4K深海珍稀生物",
        "description": "11小時 4K畫質・罕見多彩深海生物悠游，搭配療癒輕音樂",
        "embed_url": "https://www.youtube-nocookie.com/embed/G52dUQLxPzg?autoplay=1",
        "thumbnail": "🐟", "lat": 21.3069, "lng": -157.8583, "source": "youtube"
    },
    {
        "id": "tc_006", "category": "海洋",
        "name": "海浪與海鷗聲 8小時",
        "description": "遠洋海浪與海鷗鳴叫交織，彷彿身在無人海灘",
        "embed_url": "https://www.youtube-nocookie.com/embed/bn9F19Hi1Lk?autoplay=1",
        "thumbnail": "🏖️", "lat": 22.6273, "lng": 120.3014, "source": "youtube"
    },
    # ── 農林牧 ── 2 部
    {
        "id": "tc_007", "category": "農村",
        "name": "日本 4K 風景紀錄片",
        "description": "京都古道、富士山腳、農村四季，配上療癒輕音樂",
        "embed_url": "https://www.youtube-nocookie.com/embed/D48T0wNm96w?autoplay=1",
        "thumbnail": "🗻", "lat": 35.3607, "lng": 138.7274, "source": "youtube"
    },
    {
        "id": "tc_008", "category": "農村",
        "name": "雨天農村白噪音",
        "description": "細雨打在農舍屋頂與稻葉的聲音，最溫柔的療癒",
        "embed_url": "https://www.youtube-nocookie.com/embed/q76bMs-NwRk?autoplay=1",
        "thumbnail": "🌧️", "lat": 23.1167, "lng": 121.2167, "source": "youtube"
    },
    # ── 生態 ── 2 部
    {
        "id": "tc_009", "category": "鳥類",
        "name": "4K美麗鳥類 · 8小時",
        "description": "4K畫質・美國華盛頓州各種珍稀野鳥近距離觀察，無音樂純自然聲",
        "embed_url": "https://www.youtube-nocookie.com/embed/rV_ERKtNyNA?autoplay=1",
        "thumbnail": "🐦", "lat": 47.7511, "lng": -120.7401, "source": "youtube"
    },
    {
        "id": "tc_010", "category": "鳥類",
        "name": "日本奧大山・北谷澤溪流",
        "description": "日本清澈山溪與翠綠植物，流水聲舒緩疲憊身心",
        "embed_url": "https://www.youtube-nocookie.com/embed/lKfK71JsjZY?autoplay=1",
        "thumbnail": "💧", "lat": 35.3667, "lng": 133.5500, "source": "youtube"
    },
]

def _haversine_km(lat1, lon1, lat2, lon2):
    """計算兩點之間的地理距離（公里）"""
    import math
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# 全量攝影機清單快取（啟動後只取一次）
_full_cam_list: list = []

async def _fetch_full_cam_list() -> list:
    global _full_cam_list
    if _full_cam_list:
        return _full_cam_list
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(TWIPCAM_LIST_URL)
        resp.raise_for_status()
        data = resp.json()
        _full_cam_list = data if isinstance(data, list) else []
        # 同時放入 cam_url 快取
        for cam in _full_cam_list:
            if cam.get("id") and cam.get("cam_url"):
                _cam_cache[cam["id"]] = cam["cam_url"]
        return _full_cam_list


@app.get("/api/twipcam/nearby")
async def get_nearby_cameras(lat: float = 25.0330, lon: float = 121.5654, limit: int = 20):
    """查詢附近 Twipcam 攝影機（從全量清單依距離排序）"""
    try:
        all_cams = await _fetch_full_cam_list()
        # 計算距離並排序
        cams_with_dist = []
        for cam in all_cams:
            if cam.get("lat") and cam.get("lon"):
                dist = _haversine_km(lat, lon, cam["lat"], cam["lon"])
                cams_with_dist.append({**cam, "_dist_km": dist})
        cams_with_dist.sort(key=lambda c: c["_dist_km"])
        result = cams_with_dist[:limit]
        return {"cameras": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twipcam API 無回應：{e}")


@app.get("/api/therapeutic-channels")
def get_therapeutic_channels():
    """回傳療癒精選頻道清單（YouTube 直播等大自然影像）"""
    return {"channels": THERAPEUTIC_CHANNELS, "total": len(THERAPEUTIC_CHANNELS)}


@app.get("/api/twipcam/presets")
async def get_preset_cameras():
    """
    從多個台灣城市預設座標篩選攝影機，整合回傳供攝影機清單使用。
    使用 cam-list.json 全量清單並按距離篩選，每城市取最近 6 台。
    """
    try:
        all_cams = await _fetch_full_cam_list()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twipcam cam-list.json 無回應：{e}")

    result = []
    seen_ids = set()

    for loc in PRESET_LOCATIONS:
        # 計算距離
        cams_with_dist = []
        for cam in all_cams:
            if cam.get("lat") and cam.get("lon") and cam.get("id") not in seen_ids:
                dist = _haversine_km(loc["lat"], loc["lon"], cam["lat"], cam["lon"])
                cams_with_dist.append({**cam, "_dist_km": dist, "region": loc["name"]})
        cams_with_dist.sort(key=lambda c: c["_dist_km"])
        for cam in cams_with_dist[:6]:
            seen_ids.add(cam["id"])
            result.append(cam)

    return {"cameras": result, "total": len(result)}


@app.get("/api/cam-proxy/{cam_id}")
async def cam_proxy(cam_id: str):
    """
    MJPEG 串流 Proxy。
    解決攝影機伺服器的 CORS 限制：後端轉發 MJPEG bytes 給前端。
    關鍵修正：轉發上游真實 Content-Type（含正確的 boundary）。
    """
    cam_url = _cam_cache.get(cam_id)
    if not cam_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(TWIPCAM_LIST_URL)
                resp.raise_for_status()
                full_list = resp.json()
                for cam in (full_list if isinstance(full_list, list) else []):
                    if cam.get("id") == cam_id:
                        cam_url = cam.get("cam_url")
                        _cam_cache[cam_id] = cam_url
                        break
        except Exception:
            pass

    if not cam_url:
        raise HTTPException(status_code=404, detail="攝影機不存在或 URL 未知")

    # 先獲取上游的真實 Content-Type
    try:
        async with httpx.AsyncClient(timeout=10.0) as probe:
            head_resp = await probe.head(cam_url)
            upstream_ct = head_resp.headers.get("content-type", "")
    except Exception:
        upstream_ct = ""

    # 如果 HEAD 沒有 content-type，從 URL 推斷
    if not upstream_ct:
        if cam_url.endswith(".jpg") or "snapshot" in cam_url:
            upstream_ct = "image/jpeg"
        else:
            upstream_ct = "multipart/x-mixed-replace; boundary=myboundary"

    async def stream_mjpeg():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "GET", cam_url,
                    timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0),
                    headers={"User-Agent": "Mozilla/5.0"},
                ) as r:
                    # 若為靜態圖片，每 2 秒輪詢（直接回此小均以 multipart wrapping）
                    if "snapshot" in cam_url or cam_url.endswith(".jpg"):
                        # snapshot 格式：輪詢嵌入 multipart
                        import asyncio
                        boundary = b"--myboundary"
                        while True:
                            try:
                                snap = await client.get(cam_url, timeout=5.0)
                                data = snap.content
                                yield boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + data + b"\r\n"
                            except Exception:
                                break
                            await asyncio.sleep(2)
                    else:
                        # 真實 MJPEG 串流：直接轉發
                        async for chunk in r.aiter_bytes(8192):
                            yield chunk
        except Exception:
            return

    # 使用上游真實 content-type——這才對的列 boundary 匹配
    final_ct = upstream_ct if upstream_ct else "multipart/x-mixed-replace; boundary=myboundary"
    return StreamingResponse(stream_mjpeg(), media_type=final_ct)


# ════════════════════════════════════════════════
# 認證：註冊 / 忘記密碼 / 重設密碼
# ════════════════════════════════════════════════
import random as _random
import hashlib as _hashlib

_OTP_STORE: dict = {}   # account → {"otp": str, "new_password": str}

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
    method: str = "sms"   # "sms" | "email"
    role: str = "patient"

class ResetPasswordRequest(BaseModel):
    account: str
    new_password: str
    otp: str
    role: str = "patient"

def _mask_phone(phone: str) -> str:
    p = phone.replace("-","").replace(" ","")
    return p[:4] + "****" + p[-3:] if len(p) >= 7 else "09xx-xxx-xxx"

@app.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    """帳號註冊（Demo：帳號不重複即可建立）"""
    if len(req.account) < 6 or not re.match(r'^[A-Za-z0-9_]+$', req.account):
        raise HTTPException(400, "帳號格式不正確")
    if len(req.password) < 6:
        raise HTTPException(400, "密碼至少需要 6 個字元")
    # 檢查帳號是否已存在
    if req.account in db.USERS or any(
        u.get("account") == req.account for u in db.USERS.values()
    ):
        raise HTTPException(409, "此帳號已被使用，請更換帳號")
    # 建立新使用者（Demo：存入 USERS）
    uid = req.account
    pw_hash = _hashlib.sha256(req.password.encode()).hexdigest()
    db.USERS[uid] = {
        "id": uid, "account": req.account, "name": req.name,
        "phone": req.phone, "role": req.role,
        "pw_hash": pw_hash,
        "bed": req.regBed or "",
        "department": req.regDept or "",
        "hospital": "台大醫院",
    }
    return {"success": True, "user_id": uid, "name": req.name}

@app.post("/api/auth/forgot-password")
def auth_forgot_password(req: ForgotPasswordRequest):
    """忘記密碼：驗證帳號並產生 OTP（Demo：OTP 固定為 6 碼數字，直接回傳）"""
    user = db.USERS.get(req.account)
    if not user:
        # 嘗試以帳號欄位搜尋
        user = next((u for u in db.USERS.values() if u.get("account") == req.account), None)
    if not user:
        raise HTTPException(404, "查無此帳號，請確認輸入正確")
    otp = str(_random.randint(100000, 999999))
    _OTP_STORE[req.account] = {"otp": otp}
    phone = user.get("phone", "")
    masked_phone = _mask_phone(phone) if phone else "09xx-xxx-xxx"
    # Demo：直接在回應中夾帶 OTP（實際系統應透過簡訊/信箱發送）
    return {
        "success": True,
        "otp": otp,          # Demo 用，正式環境應移除
        "masked_phone": masked_phone,
        "masked_email": "xx**@demo.com"
    }

@app.post("/api/auth/reset-password")
def auth_reset_password(req: ResetPasswordRequest):
    """驗證 OTP 並更新密碼"""
    stored = _OTP_STORE.get(req.account)
    if not stored or stored.get("otp") != req.otp:
        raise HTTPException(400, "驗證碼錯誤或已過期")
    user = db.USERS.get(req.account) or next(
        (u for u in db.USERS.values() if u.get("account") == req.account), None
    )
    if not user:
        raise HTTPException(404, "帳號不存在")
    if len(req.new_password) < 6:
        raise HTTPException(400, "密碼至少需要 6 個字元")
    user["pw_hash"] = _hashlib.sha256(req.new_password.encode()).hexdigest()
    _OTP_STORE.pop(req.account, None)
    return {"success": True}


# ════════════════════════════════════════════════
# 任意視界 - 景點請求
# ════════════════════════════════════════════════
class SpotRequest(BaseModel):
    location: str
    description: str
    special_requirements: Optional[str] = ""
    requested_by: str   # bed number
    lat: Optional[float] = None
    lng: Optional[float] = None

@app.post("/api/spot-request")
def create_spot_request(req: SpotRequest):
    """病患發出景點拍攝請求"""
    new_task = {
        "id": f"task_{len(db.CROWD_TASKS)+1:03d}",
        "location": req.location,
        "description": req.description,
        "points": 200,
        "bonus": False,
        "requested_by": f"{req.requested_by}號病房",
        "status": "open",
        "lat": req.lat,
        "lng": req.lng,
    }
    db.CROWD_TASKS.append(new_task)
    return {"success": True, "task": new_task}

@app.get("/api/crowd/videos")
def get_crowd_videos():
    """取得群眾已完成上傳的影片 (有座標者)"""
    videos = [
        t for t in db.CROWD_TASKS
        if t.get("status") == "completed" and t.get("video_url") and t.get("lat") and t.get("lng")
    ]
    return {"videos": videos}


# ════════════════════════════════════════════════
# 醫聲相伴 - 病患端
# ════════════════════════════════════════════════
@app.get("/api/doctors")
def get_doctors():
    """取得所有醫生清單"""
    doctors = [u for u in db.USERS.values() if u.get("role") == "doctor"]
    return {"doctors": doctors}

@app.get("/api/messages/{patient_id}")
def get_patient_messages(patient_id: str):
    """取得病患的訊息歷史"""
    msgs = [m for m in db.MESSAGES if m["patient_id"] == patient_id]
    msgs_sorted = sorted(msgs, key=lambda x: x["timestamp"], reverse=True)
    return {"messages": msgs_sorted}

class PatientMessage(BaseModel):
    patient_id: str
    bed: str
    emotion: str
    text: Optional[str] = ""
    doctor_id: Optional[str] = None
    # AI 情緒分析結果（由前端 Transformers.js 推論後上傳）
    sentiment: Optional[str] = None        # "positive" | "neutral" | "negative"
    sentiment_score: Optional[float] = None

@app.post("/api/messages")
def send_patient_message(msg: PatientMessage):
    """病患傳送狀態／留言（含 AI 情緒）"""
    _n = datetime.now()
    ts = f"{_n.year}/{_n.month}/{_n.day} {_n.hour:02d}:{_n.minute:02d}"
    user = db.USERS.get(msg.patient_id, {})
    new_msg = {
        "id": len(db.MESSAGES) + 1,
        "patient_id": msg.patient_id,
        "bed": msg.bed,
        "emotion": msg.emotion,
        "text": msg.text or f"[{msg.emotion}]",
        "doctor_id": msg.doctor_id,
        "timestamp": ts,
        "replied": False,
        "reply_text": None,
        "sentiment": msg.sentiment,
        "sentiment_score": msg.sentiment_score,
    }
    db.MESSAGES.append(new_msg)
    pending = next((p for p in db.PENDING_PATIENTS if p["bed"] == msg.bed), None)
    if pending:
        pending["unread"] += 1
        pending["latest_emotion"] = msg.emotion
        pending["timestamp"] = ts
        # AI 情緒自動升級優先標記：高信心負面情緒 → 自動標黃；已有紅色則不降級
        if msg.sentiment == "negative" and (msg.sentiment_score or 0) >= 0.80:
            if pending.get("star_color") == "none":
                pending["star_color"] = "yellow"
        # 記錄最新 AI 情緒供醫生端顯示
        pending["ai_sentiment"]       = msg.sentiment
        pending["ai_sentiment_score"] = msg.sentiment_score
    else:
        # 新病患：初始化並套用 AI 情緒
        auto_color = "yellow" if (
            msg.sentiment == "negative" and (msg.sentiment_score or 0) >= 0.80
        ) else "none"
        db.PENDING_PATIENTS.append({
            "bed": msg.bed,
            "patient_name": user.get("name", "病患"),
            "latest_emotion": msg.emotion,
            "unread": 1,
            "hospital": user.get("hospital", ""),
            "timestamp": ts,
            "star_color": auto_color,
            "ai_sentiment": msg.sentiment,
            "ai_sentiment_score": msg.sentiment_score,
        })
    return {"success": True, "message": new_msg}


# ════════════════════════════════════════════════
# 醫聲相伴 - 醫生端
# ════════════════════════════════════════════════
@app.get("/api/doctor/pending")
def get_pending_patients(hospital: Optional[str] = None):
    """醫生端：待回覆病患清單"""
    pending = db.PENDING_PATIENTS
    done = db.DONE_PATIENTS
    
    if hospital:
        pending = [p for p in pending if p.get("hospital") == hospital]
        done = [p for p in done if p.get("hospital") == hospital]
        
    # 計算虛擬統計數據
    total_served = len(done) + len(pending)
    urgent_cases = sum(1 for p in pending if p.get("star_color") == "red")
    avg_hr = 2 if total_served < 5 else 4
    avg_min = 15 if total_served < 5 else 30
    
    stats = {
        "total_served": total_served,
        "avg_wait_time": f"{avg_hr} 小時 {avg_min} 分",
        "urgent_cases": urgent_cases
    }

    return {
        "pending": pending,
        "done": done,
        "stats": stats
    }

class StarToggleRequest(BaseModel):
    star_color: str

@app.post("/api/doctor/pending/{bed}/star")
def toggle_patient_star(bed: str, req: StarToggleRequest):
    """醫生端：切換病房請求的星號顏色"""
    # 嘗試在 pending 中找
    patient = next((p for p in db.PENDING_PATIENTS if p["bed"] == bed), None)
    # 如果 pending 找不到，嘗試在 done 中找
    if not patient:
         patient = next((p for p in db.DONE_PATIENTS if p["bed"] == bed), None)
         
    if not patient:
        raise HTTPException(status_code=404, detail="找不到該病患")
        
    patient["star_color"] = req.star_color
    return {"success": True, "star_color": req.star_color}

@app.get("/api/doctor/patient/{bed}")
def get_patient_by_bed(bed: str):
    """醫生端：取得特定病房的訊息"""
    msgs = [m for m in db.MESSAGES if m["bed"] == bed]
    msgs_sorted = sorted(msgs, key=lambda x: x["timestamp"], reverse=True)
    return {"bed": bed, "messages": msgs_sorted}

# ── 情緒分數對照表 ────────────────────────────────────
_EMOTION_SCORE = {"開心": 5, "有問題": 3, "難過": 2, "焦慮": 1}

@app.get("/api/doctor/patient/{bed}/emotion-chart")
def get_emotion_chart(bed: str):
    """病患情緒趨勢圖資料（含 AI 情緒 + 醫生回覆標記）"""
    msgs = [m for m in db.MESSAGES if m["bed"] == bed]
    msgs_sorted = sorted(msgs, key=lambda x: x.get("timestamp", ""))
    points = []
    for m in msgs_sorted:
        points.append({
            "date":          m.get("timestamp", ""),
            "emotion":       m.get("emotion", ""),
            "score":         _EMOTION_SCORE.get(m.get("emotion", ""), 3),
            "replied":       m.get("replied", False),
            "text_preview":  (m.get("text") or "")[:25],
            "sentiment":     m.get("sentiment"),
            "sentiment_score": m.get("sentiment_score"),
        })
    # 計算趨勢：最後3筆平均 vs 前3筆平均
    trend = "stable"
    if len(points) >= 4:
        old_avg = sum(p["score"] for p in points[:len(points)//2]) / (len(points)//2)
        new_avg = sum(p["score"] for p in points[len(points)//2:]) / (len(points) - len(points)//2)
        if new_avg > old_avg + 0.5:   trend = "improving"
        elif new_avg < old_avg - 0.5: trend = "declining"
    return {"bed": bed, "points": points, "trend": trend}

# ── 邊緣運算生理感測數據（M55M1 + EDA）─────────────────────────────────
import random as _rnd_bio
_BIO_SEED = {}  # 每個 bed 固定一組隨機種子，讓同一病患每次刷新結果一致

@app.get("/api/doctor/patient/{bed}/biometric")
def get_biometric(bed: str):
    """
    回傳由 Nuvoton M55M1 邊緣運算模組推送的微表情分析結果
    與 EDA 膚電感測器即時數據（Demo 模擬值，實際部署時替換為硬體推送資料）
    """
    # 以 bed 為 seed 讓數值穩定（Demo 用）
    seed = _BIO_SEED.setdefault(bed, hash(bed) & 0xFFFF)
    rnd = _rnd_bio.Random(seed)

    # ── 微表情分析（M55M1 YOLO + face_landmark_attention）──
    expr_labels = ["平靜", "喜悅", "壓抑", "焦慮", "不適"]
    expr_weights = [0.30, 0.20, 0.20, 0.20, 0.10]
    expr = rnd.choices(expr_labels, weights=expr_weights, k=1)[0]
    expr_conf = round(rnd.uniform(0.72, 0.97), 2)
    landmarks_quality = round(rnd.uniform(0.80, 0.99), 2)  # 468點網格品質分數
    eye_openness   = round(rnd.uniform(0.3, 1.0), 2)  # 眼睛開合度
    brow_furrow    = round(rnd.uniform(0.0, 0.8), 2)  # 眉頭皺縮度
    lip_tension    = round(rnd.uniform(0.0, 0.7), 2)  # 嘴唇張力

    # ── EDA 膚電感測分析 ──
    eda_emotions   = ["平靜", "輕度緊張", "中度緊張", "高度緊張"]
    eda_weights    = [0.25, 0.30, 0.30, 0.15]
    eda_state      = rnd.choices(eda_emotions, weights=eda_weights, k=1)[0]
    eda_baseline   = round(rnd.uniform(2.0, 8.0), 2)   # µS 皮膚電導基線
    eda_peak       = round(eda_baseline + rnd.uniform(0.5, 4.0), 2)
    eda_responses  = rnd.randint(0, 8)                  # 近5分鐘反應次數
    eda_amplitude  = round(rnd.uniform(0.3, 3.5), 2)   # 平均反應振幅 µS
    eda_recovery   = round(rnd.uniform(2.0, 15.0), 1)  # 平均恢復時間 秒
    signal_quality = round(rnd.uniform(0.70, 0.99), 2) # 訊號品質（LSTM-CNN判斷）

    # 綜合警示等級（供醫生快速判讀）
    alert = "正常"
    if eda_state in ["高度緊張"] or expr in ["壓抑", "焦慮", "不適"]:
        alert = "需關注"
    if eda_state == "高度緊張" and expr in ["壓抑", "焦慮"]:
        alert = "高度警示"

    return {
        "bed": bed,
        "updated_at": datetime.now().strftime("%H:%M"),
        "alert_level": alert,
        "micro_expression": {
            "label": expr,
            "confidence": expr_conf,
            "landmarks_quality": landmarks_quality,
            "eye_openness": eye_openness,
            "brow_furrow": brow_furrow,
            "lip_tension": lip_tension,
        },
        "eda": {
            "state": eda_state,
            "baseline_uS": eda_baseline,
            "peak_uS": eda_peak,
            "response_count_5min": eda_responses,
            "avg_amplitude_uS": eda_amplitude,
            "avg_recovery_sec": eda_recovery,
            "signal_quality": signal_quality,
        }
    }


# ── 視覺處方系統 ─────────────────────────────────────
if not hasattr(db, "PRESCRIPTIONS"):
    db.PRESCRIPTIONS = []

class PrescriptionRequest(BaseModel):
    bed: str
    patient_name: str
    visual_type: str       # nature | city | hometown | familiar
    location_hint: str
    doctor_note: str
    doctor_id: Optional[str] = None

_VISUAL_LABELS = {
    "nature":    ("自然風景", "🌿"),
    "city":      ("城市街景", "🏙️"),
    "hometown":  ("家鄉風貌", "🏡"),
    "familiar":  ("熟悉場所", "☕"),
}

@app.post("/api/doctor/prescription")
def create_prescription(req: PrescriptionRequest):
    """醫生開立視覺處方 → 自動建立高優先群眾任務"""
    label, icon = _VISUAL_LABELS.get(req.visual_type, ("視覺療法", "🏥"))
    task_id = f"rx_{len(db.CROWD_TASKS)+1:03d}"
    _n = datetime.now()
    ts = f"{_n.year}/{_n.month}/{_n.day} {_n.hour:02d}:{_n.minute:02d}"
    new_task = {
        "id":            task_id,
        "location":      req.location_hint or f"{label}（{req.bed}處方）",
        "description":   req.doctor_note or f"醫生為{req.bed}號病房開立視覺處方：{label}",
        "points":        400,
        "bonus":         True,
        "requested_by":  f"{req.bed}號病房",
        "status":        "open",
        "task_type":      "prescription",
        "is_prescription": True,
        "visual_type":   req.visual_type,
        "visual_icon":   icon,
        "doctor_note":   req.doctor_note,
    }
    db.CROWD_TASKS.append(new_task)
    db.PRESCRIPTIONS.append({
        "id":           task_id,
        "bed":          req.bed,
        "patient_name": req.patient_name,
        "visual_type":  req.visual_type,
        "visual_label": label,
        "visual_icon":  icon,
        "location_hint": req.location_hint,
        "doctor_note":  req.doctor_note,
        "doctor_id":    req.doctor_id,
        "timestamp":    ts,
        "status":       "pending",
        "task_id":      task_id,
    })
    return {"success": True, "task_id": task_id, "task": new_task}

@app.get("/api/patient/{patient_id}/prescriptions")
def get_patient_prescriptions(patient_id: str):
    """病患端：查看醫生開立的視覺處方"""
    user = db.USERS.get(patient_id, {})
    bed  = user.get("bed", "")
    rxs  = [p for p in db.PRESCRIPTIONS if p["bed"] == bed]
    return {"prescriptions": rxs}


@app.get("/api/doctor/prescription-reviews")
def get_prescription_reviews():
    """醫生端：取得所有待審核的視覺處方影片"""
    pending = [
        t for t in db.CROWD_TASKS
        if t.get("task_type") == "prescription"
        and t.get("status") == "review"
        and t.get("video_url")
    ]
    return {"tasks": pending}


class PrescriptionReviewRequest(BaseModel):
    task_id: str
    action: str   # "approve" | "reject"
    doctor_id: str = "doctor_001"
    reject_reason: str = ""


@app.post("/api/doctor/prescription-review")
def review_prescription_video(req: PrescriptionReviewRequest):
    """醫生審核視覺處方影片：approve → adopted；reject → rejected"""
    task = next((t for t in db.CROWD_TASKS if t["id"] == req.task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")
    if task.get("task_type") != "prescription":
        raise HTTPException(status_code=400, detail="此任務非視覺處方任務")
    if req.action == "approve":
        task["status"] = "adopted"
        # 同步更新 PRESCRIPTIONS 狀態
        rx = next((p for p in db.PRESCRIPTIONS if p.get("task_id") == req.task_id), None)
        if rx:
            rx["status"] = "fulfilled"
    elif req.action == "reject":
        # 退回 → 重置回 open，讓任務重新出現在任務列表
        task["status"] = "open"
        task["last_reject_reason"] = req.reject_reason or "未符合處方要求，請重新拍攝"
        task.pop("video_url", None)
        task.pop("youtube_vid", None)
        task.pop("uploader_id", None)
    else:
        raise HTTPException(status_code=400, detail="action 必須為 approve 或 reject")
    return {"success": True, "new_status": task["status"]}

# ── YouTube 連結安全驗證 ──────────────────────────────
_YT_ALLOWED_DOMAINS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}
_YT_VIDEO_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')

def _extract_youtube_id(url: str):
    """
    只允許 YouTube 正式網域的影片連結，並驗證 video ID 格式（11碼英數字）。
    防止釣魚連結：非 youtube.com / youtu.be 網域一律拒絕。
    回傳 video ID 字串，或 None（不合法時）。
    """
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme not in ("https", "http"):
            return None
        domain = parsed.netloc.lower().lstrip("www.")
        # 只接受 youtube.com 與 youtu.be，其他仿冒網域全部拒絕
        if parsed.netloc.lower() not in _YT_ALLOWED_DOMAINS:
            return None
        if domain == "youtu.be":
            vid = parsed.path.lstrip("/").split("?")[0]
        else:
            params = parse_qs(parsed.query)
            vid_list = params.get("v", [])
            if not vid_list:
                return None
            vid = vid_list[0]
        # video ID 必須恰好 11 碼英數字或 - _（YouTube 規格）
        if not _YT_VIDEO_ID_RE.match(vid):
            return None
        return vid
    except Exception:
        return None


class YoutubeSubmitRequest(BaseModel):
    task_id: str
    youtube_url: str
    user_id: str = "crowd_001"


@app.post("/api/crowd/submit-youtube")
def submit_youtube_link(req: YoutubeSubmitRequest):
    """
    志工以 YouTube 連結提交視覺處方或一般任務。
    安全機制：
      1. 只允許 youtube.com / youtu.be 官方網域
      2. video ID 嚴格驗證為 11 碼英數字，防止 XSS / 注入
      3. 儲存為 youtube-nocookie.com embed URL，保護隱私且不含追蹤 cookie
    """
    vid = _extract_youtube_id(req.youtube_url)
    if not vid:
        raise HTTPException(
            status_code=400,
            detail="連結無效：僅接受 youtube.com 或 youtu.be 的影片連結"
        )

    task = next((t for t in db.CROWD_TASKS if t["id"] == req.task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")
    if task["status"] != "open":
        raise HTTPException(status_code=400, detail="此任務目前無法提交")

    # 使用 youtube-nocookie.com，保護隱私、防追蹤
    embed_url = f"https://www.youtube-nocookie.com/embed/{vid}"
    if task.get("task_type") == "prescription":
        task["status"] = "review"
    else:
        task["status"] = "completed"
    task["video_url"] = embed_url
    task["youtube_vid"] = vid
    task["uploader_id"] = req.user_id

    points_earned = task.get("points", 200)
    stats = db.CROWD_STATS.setdefault(req.user_id, {
        "completed": 0, "points": 0,
        "week_points": 0, "month_points": 0,
        "week_streak": 0, "month_streak": 0
    })
    stats["points"]      += points_earned
    stats["week_points"]  = stats.get("week_points", 0) + points_earned
    stats["month_points"] = stats.get("month_points", 0) + points_earned
    stats["completed"]   += 1

    return {"success": True, "points_earned": points_earned, "embed_url": embed_url, "youtube_vid": vid}


# ── 志工影響力回饋 ────────────────────────────────────
@app.post("/api/crowd/thank/{task_id}")
def thank_volunteer(task_id: str, patient_id: str = ""):
    """病患對完成的任務表達感謝 → 增加志工影響力分數（patient_id 保留供未來使用）"""
    task = next((t for t in db.CROWD_TASKS if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")
    task.setdefault("thanks_count", 0)
    task["thanks_count"] += 1
    # 回饋給志工（找到上傳者的 stats，加 10 bonux points）
    uploader = task.get("uploader_id", "crowd_001")
    stats = db.CROWD_STATS.get(uploader)
    if stats:
        stats["points"] = stats.get("points", 0) + 10
        stats.setdefault("thanks_received", 0)
        stats["thanks_received"] += 1
    return {"success": True, "thanks_count": task["thanks_count"]}


# ══ 評分 / 好友 / 聊天 系統 ════════════════════════════════

@app.post("/api/crowd/rate")
async def rate_video(body: dict):
    """病患對群眾上傳的影片給予評分、留言，並可選擇申請加好友"""
    from datetime import datetime as _dt
    task_id     = body.get("task_id", "")
    patient_id  = body.get("patient_id", "")
    stars       = int(body.get("stars", 5))
    message     = body.get("message_text", "").strip()
    add_friend  = bool(body.get("add_friend", False))

    task = next((t for t in db.CROWD_TASKS if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")

    uploader_id  = task.get("uploader_id", "")
    patient      = db.USERS.get(patient_id, {})
    patient_name = patient.get("name", "病患")
    ts = _dt.now().strftime("%Y/%m/%d %H:%M")

    rate_id = f"rate_{len(db.RATINGS)+1:03d}"
    db.RATINGS.append({
        "id": rate_id, "task_id": task_id,
        "patient_id": patient_id, "patient_name": patient_name,
        "uploader_id": uploader_id,
        "stars": stars, "message_text": message,
        "voice_url": None, "timestamp": ts, "read": False,
    })

    # 更新滿意度（以星級均值計算）
    if uploader_id and uploader_id in db.CROWD_STATS:
        uploader_ratings = [r for r in db.RATINGS if r["uploader_id"] == uploader_id]
        avg = sum(r["stars"] for r in uploader_ratings) / len(uploader_ratings)
        db.CROWD_STATS[uploader_id]["satisfaction"] = int(avg / 5 * 100)
        # 每次被評分也給志工 bonus
        bonus = stars * 10
        db.CROWD_STATS[uploader_id]["points"]       += bonus
        db.CROWD_STATS[uploader_id]["week_points"]   = db.CROWD_STATS[uploader_id].get("week_points", 0) + bonus
        db.CROWD_STATS[uploader_id]["month_points"]  = db.CROWD_STATS[uploader_id].get("month_points", 0) + bonus

    freq_id = None
    if add_friend and uploader_id:
        # 若已是好友則不重複申請
        already = any(
            (fs["user1_id"] == patient_id and fs["user2_id"] == uploader_id) or
            (fs["user1_id"] == uploader_id and fs["user2_id"] == patient_id)
            for fs in db.FRIENDSHIPS
        )
        pending = any(
            r["from_id"] == patient_id and r["to_id"] == uploader_id and r["status"] == "pending"
            for r in db.FRIEND_REQUESTS
        )
        if not already and not pending:
            freq_id = f"freq_{len(db.FRIEND_REQUESTS)+1:03d}"
            db.FRIEND_REQUESTS.append({
                "id": freq_id, "from_id": patient_id,
                "from_name": f"{patient_name}（病患）",
                "to_id": uploader_id,
                "message": message or "希望成為朋友！",
                "status": "pending", "timestamp": ts,
            })

    # 若病患評分 → 標記任務為已採用
    rated_task = next((t for t in db.CROWD_TASKS if t["id"] == body.get("task_id", "")), None)
    if rated_task and rated_task.get("status") in ("review", "completed"):
        rated_task["status"] = "adopted"

    return {"ok": True, "rate_id": rate_id, "freq_id": freq_id}


@app.post("/api/crowd/rate/{rate_id}/voice")
async def attach_rating_voice(rate_id: str, file: UploadFile = File(...)):
    """上傳語音留言並附加到評分紀錄"""
    allowed = {".webm", ".ogg", ".mp3", ".m4a", ".wav"}
    ext = os.path.splitext(file.filename or "audio.webm")[-1].lower() or ".webm"
    if ext not in allowed:
        ext = ".webm"
    save_name = f"voice_{rate_id}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    voice_url = f"/uploads/{save_name}"
    rate = next((r for r in db.RATINGS if r["id"] == rate_id), None)
    if rate:
        rate["voice_url"] = voice_url
    return {"ok": True, "voice_url": voice_url}


@app.get("/api/notifications/{user_id}")
def get_notifications(user_id: str):
    """取得用戶的通知（收到的評分、好友申請、醫師回覆、任務上傳）及未讀聊天數"""
    notifs = []
    user = db.USERS.get(user_id, {})

    # ── 群眾端：收到的病患評分 ──
    for r in db.RATINGS:
        if r["uploader_id"] == user_id:
            notifs.append({
                "id": r["id"], "type": "rating",
                "from_name": r["patient_name"], "stars": r["stars"],
                "message": r["message_text"], "voice_url": r.get("voice_url"),
                "timestamp": r["timestamp"], "read": r.get("read", False),
            })

    # ── 好友申請（所有角色） ──
    for fr in db.FRIEND_REQUESTS:
        if fr["to_id"] == user_id and fr["status"] == "pending":
            notifs.append({
                "id": fr["id"], "type": "friend_request",
                "from_id": fr["from_id"], "from_name": fr["from_name"],
                "message": fr.get("message", ""), "timestamp": fr["timestamp"], "read": False,
            })

    # ── 病患端專屬通知 ──
    if user.get("role") == "patient":
        patient_bed = user.get("bed", "")
        bed_str = f"{patient_bed}號病房"

        # 醫師回覆通知
        for msg in db.MESSAGES:
            if msg["patient_id"] == user_id and msg.get("replied") and msg.get("reply_text"):
                notifs.append({
                    "id": f"msg_{msg['id']}",
                    "type": "doctor_reply",
                    "message_preview": (msg.get("text") or "")[:30],
                    "reply_text": msg.get("reply_text", ""),
                    "timestamp": msg.get("timestamp", ""),
                    "read": msg.get("patient_read", False),
                })

        # 任務影片上傳通知（指定親友拍攝 / 視覺處方）
        for task in db.CROWD_TASKS:
            if (task.get("requested_by") == bed_str
                    and task.get("status") in ("completed", "review", "adopted")
                    and task.get("video_url")):
                uploader = db.USERS.get(task.get("uploader_id", ""), {})
                notifs.append({
                    "id": f"task_{task['id']}",
                    "type": "task_upload",
                    "location": task.get("location", ""),
                    "uploader_name": uploader.get("name", "志工"),
                    "video_url": task.get("video_url", ""),
                    "is_prescription": task.get("task_type") == "prescription",
                    "timestamp": task.get("timestamp") or task.get("created_at", ""),
                    "read": task.get("patient_read", False),
                })

        # 心願達成通知
        for wish in db.WISHLISTS:
            if wish["patient_id"] == user_id and wish.get("fulfilled") and wish.get("fulfilled_video_url"):
                fulfiller = db.USERS.get(wish.get("fulfilled_by", ""), {})
                notifs.append({
                    "id": f"wish_{wish['id']}",
                    "type": "wish_fulfilled",
                    "place_name": wish.get("place_name", ""),
                    "fulfiller_name": fulfiller.get("name", "志工"),
                    "video_url": wish.get("fulfilled_video_url", ""),
                    "timestamp": wish.get("fulfilled_at", ""),
                    "read": wish.get("patient_read", False),
                })

    notifs.sort(key=lambda x: x["timestamp"] or "", reverse=True)
    unread_chat = sum(
        1 for m in db.CHAT_MESSAGES if m["to_id"] == user_id and not m.get("read", False)
    )
    return {"notifications": notifs, "unread_chat": unread_chat,
            "unread_total": sum(1 for n in notifs if not n.get("read")) + unread_chat}


@app.post("/api/notifications/{notif_id}/read")
def mark_notif_read(notif_id: str):
    # 群眾端：評分通知
    for r in db.RATINGS:
        if r["id"] == notif_id:
            r["read"] = True
    # 病患端：醫師回覆通知 (msg_{id})
    if notif_id.startswith("msg_"):
        try:
            msg_id = int(notif_id[4:])
            for m in db.MESSAGES:
                if m["id"] == msg_id:
                    m["patient_read"] = True
        except ValueError:
            pass
    # 病患端：任務影片通知 (task_{id})
    elif notif_id.startswith("task_"):
        task_id = notif_id[5:]
        for t in db.CROWD_TASKS:
            if t["id"] == task_id:
                t["patient_read"] = True
    # 病患端：心願達成通知 (wish_{id})
    elif notif_id.startswith("wish_"):
        wish_id = notif_id[5:]
        for w in db.WISHLISTS:
            if w["id"] == wish_id:
                w["patient_read"] = True
    return {"ok": True}


@app.post("/api/friend/respond")
async def respond_friend(body: dict):
    """接受或拒絕好友申請"""
    from datetime import datetime as _dt
    req_id = body.get("request_id", "")
    action = body.get("action", "")   # "accept" or "decline"
    req = next((r for r in db.FRIEND_REQUESTS if r["id"] == req_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="申請不存在")
    req["status"] = "accepted" if action == "accept" else "declined"
    if action == "accept":
        fs_id = f"fs_{len(db.FRIENDSHIPS)+1:03d}"
        db.FRIENDSHIPS.append({
            "id": fs_id, "user1_id": req["from_id"], "user2_id": req["to_id"],
            "since": _dt.now().strftime("%Y/%m/%d %H:%M"),
        })
    return {"ok": True, "status": req["status"]}


@app.get("/api/friend/list/{user_id}")
def get_friend_list(user_id: str):
    friends = []
    for fs in db.FRIENDSHIPS:
        fid = None
        if fs["user1_id"] == user_id:
            fid = fs["user2_id"]
        elif fs["user2_id"] == user_id:
            fid = fs["user1_id"]
        if fid:
            u = db.USERS.get(fid, {})
            unread = sum(
                1 for m in db.CHAT_MESSAGES
                if m["from_id"] == fid and m["to_id"] == user_id and not m.get("read", False)
            )
            friends.append({
                "id": fid, "name": u.get("name", fid),
                "role": u.get("role", ""), "since": fs["since"], "unread": unread,
            })
    return {"friends": friends}


@app.get("/api/chat/{user_id}/{other_id}")
def get_chat(user_id: str, other_id: str):
    msgs = [
        m for m in db.CHAT_MESSAGES
        if (m["from_id"] == user_id and m["to_id"] == other_id) or
           (m["from_id"] == other_id and m["to_id"] == user_id)
    ]
    def _ts_key(ts: str):
        from datetime import datetime as _dtp
        for fmt in ("%Y/%m/%d %H:%M", "%Y/%m/%d"):
            try: return _dtp.strptime(ts, fmt)
            except: pass
        return ts  # fallback: raw string
    msgs.sort(key=lambda m: _ts_key(m["timestamp"]))
    for m in db.CHAT_MESSAGES:
        if m["from_id"] == other_id and m["to_id"] == user_id:
            m["read"] = True
    return {"messages": msgs}


@app.post("/api/chat/send")
async def send_chat(body: dict):
    """發送文字訊息（需已是好友）"""
    from datetime import datetime as _dt
    from_id = body.get("from_id", "")
    to_id   = body.get("to_id", "")
    text    = body.get("text", "").strip()
    if not from_id or not to_id or not text:
        raise HTTPException(status_code=400, detail="缺少必要欄位")
    is_friend = any(
        (fs["user1_id"] == from_id and fs["user2_id"] == to_id) or
        (fs["user1_id"] == to_id and fs["user2_id"] == from_id)
        for fs in db.FRIENDSHIPS
    )
    if not is_friend:
        raise HTTPException(status_code=403, detail="尚未成為好友")
    msg_id = f"cm_{len(db.CHAT_MESSAGES)+1:03d}"
    msg = {
        "id": msg_id, "from_id": from_id, "to_id": to_id,
        "text": text, "voice_url": None,
        "timestamp": _dt.now().strftime("%Y/%m/%d %H:%M"), "read": False,
    }
    db.CHAT_MESSAGES.append(msg)
    return {"ok": True, "message": msg}


@app.post("/api/chat/voice")
async def send_chat_voice(
    from_id: str = Form(...),
    to_id: str = Form(...),
    file: UploadFile = File(...),
):
    """發送語音訊息（需已是好友）"""
    from datetime import datetime as _dt
    is_friend = any(
        (fs["user1_id"] == from_id and fs["user2_id"] == to_id) or
        (fs["user1_id"] == to_id and fs["user2_id"] == from_id)
        for fs in db.FRIENDSHIPS
    )
    if not is_friend:
        raise HTTPException(status_code=403, detail="尚未成為好友")
    ext = os.path.splitext(file.filename or "audio.webm")[-1].lower() or ".webm"
    save_name = f"chat_{from_id}_{_dt.now().strftime('%Y%m%d%H%M%S')}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    voice_url = f"/uploads/{save_name}"
    msg_id = f"cm_{len(db.CHAT_MESSAGES)+1:03d}"
    msg = {
        "id": msg_id, "from_id": from_id, "to_id": to_id,
        "text": "🎙 語音訊息", "voice_url": voice_url,
        "timestamp": _dt.now().strftime("%Y/%m/%d %H:%M"), "read": False,
    }
    db.CHAT_MESSAGES.append(msg)
    return {"ok": True, "message": msg}


class AIReplyRequest(BaseModel):
    message_id: int
    patient_name: str = ""
    patient_emotion: str = ""
    patient_text: str = ""

@app.post("/api/doctor/ai-preview")
async def doctor_ai_preview(req: AIReplyRequest):
    """用 Claude AI 為醫生生成回覆草稿（醫生可修改後送出）"""
    prompt = f"""你是一位溫暖、有耐心的醫生助理，正在協助醫生回覆住院病患的訊息。

病患資訊：
- 姓名：{req.patient_name or "病患"}
- 目前心情：{req.patient_emotion or "未知"}
- 病患說的話：{req.patient_text or "（無內容）"}

請以醫生的第一人稱，用繁體中文寫一段溫暖、專業的回覆（100字以內）。
要求：
1. 先回應病患的情緒與感受
2. 給予醫療上的簡短說明或安慰
3. 結尾鼓勵病患，讓他感到被關心
4. 語氣自然親切，不要過於制式

只輸出回覆正文，不要加任何前綴或說明。"""

    try:
        client = _anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}]
        )
        reply_text = message.content[0].text.strip()
        return {"success": True, "ai_reply": reply_text}
    except Exception as e:
        print(f"[AI-PREVIEW ERROR] {type(e).__name__}: {e}")
        # Fallback: template-based reply
        emotion_map = {"難過": "我了解您現在心情不好", "焦慮": "請不要太擔心", "開心": "很高興聽到您的好消息", "有問題": "感謝您提出這個問題"}
        opener = emotion_map.get(req.patient_emotion, "您好")
        fallback = f"{opener}，{req.patient_text[:20] + '...' if len(req.patient_text) > 20 else req.patient_text}的問題我已了解。我們會持續關注您的狀況，如有任何不適請隨時告訴護理師。💙"
        return {"success": True, "ai_reply": fallback, "fallback": True, "error": str(e)}


class VideoDescribeRequest(BaseModel):
    location_name: str = ""
    context: str = ""
    image_base64: str = ""   # base64 JPEG frame (optional)

@app.post("/api/video/ai-describe")
async def video_ai_describe(req: VideoDescribeRequest):
    """用 Claude Haiku 介紹景點或分析影像畫面"""
    try:
        client = _anthropic.Anthropic()
        if req.image_base64:
            # 有擷圖 → 視覺分析
            prompt = f"""你是一位溫暖的旅遊導覽員，正在為一位住院的病患介紹眼前的影像。
地點名稱：{req.location_name or "未知地點"}

請根據圖片中的實際畫面，用繁體中文寫一段生動、療癒的景點介紹（80-120字）。
要求：
1. 描述畫面中看到的景色、氛圍
2. 語氣溫暖，讓病患感到身臨其境
3. 結尾可加一句鼓勵的話

只輸出介紹正文，不要加前綴說明。"""
            import base64 as _b64
            img_data = req.image_base64
            if "," in img_data:
                img_data = img_data.split(",", 1)[1]
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": img_data
                    }},
                    {"type": "text", "text": prompt}
                ]}]
            )
        else:
            # 無擷圖（直播 iframe CORS 限制）→ 用地名生成介紹
            prompt = f"""你是一位溫暖的旅遊導覽員，正在為一位住院的病患介紹一個景點。
景點名稱：{req.location_name or "美麗的地方"}
補充資訊：{req.context or ""}

請用繁體中文寫一段生動、療癒的景點介紹（80-120字）。
要求：
1. 描述這個地方的特色景色與氛圍
2. 語氣溫暖，讓病患感到身臨其境、放鬆心情
3. 結尾加一句鼓勵病患的話

只輸出介紹正文，不要加前綴說明。"""
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}]
            )
        return {"success": True, "description": message.content[0].text.strip()}
    except Exception as e:
        print(f"[AI-DESCRIBE ERROR] {type(e).__name__}: {e}")
        loc = req.location_name or "這個地方"
        return {
            "success": True,
            "description": f"您正在觀看{loc}的即時影像。這裡風景優美，空氣清新，希望這片美景能讓您心情愉快、早日康復！",
            "fallback": True
        }


class DoctorReply(BaseModel):
    message_id: int
    reply_text: str

@app.post("/api/doctor/reply")
def doctor_reply(reply: DoctorReply):
    """醫生回覆病患（模擬 LLM 重構）"""
    msg = next((m for m in db.MESSAGES if m["id"] == reply.message_id), None)
    if not msg:
        raise HTTPException(status_code=404, detail="訊息不存在")
    llm_text = f"您好！{reply.reply_text} 如有任何不適，請隨時告訴護理師，我們都在這裡陪您。💙"
    msg["replied"] = True
    msg["reply_text"] = llm_text
    bed = msg["bed"]
    unreplied = [m for m in db.MESSAGES if m["bed"] == bed and not m["replied"]]
    if not unreplied:
        db.PENDING_PATIENTS[:] = [p for p in db.PENDING_PATIENTS if p["bed"] != bed]
        done = next((p for p in db.DONE_PATIENTS if p["bed"] == bed), None)
        if not done:
            patient_user = db.USERS.get(msg.get("patient_id", ""), {})
            db.DONE_PATIENTS.append({
                "bed": bed,
                "patient_name": patient_user.get("name", "病患"),
                "latest_emotion": "✅",
                "unread": 0,
                "hospital": patient_user.get("hospital", ""),
                "timestamp": msg.get("timestamp", ""),
                "star_color": "none",
            })
    return {"success": True, "llm_reply": llm_text}

# ════════════════════════════════════════════════
# 微表情情緒警報（M55M1 邊緣 AI 板）
# ════════════════════════════════════════════════
class EmotionAlertIn(BaseModel):
    patient_id: str
    bed: str
    hospital: str = ""
    emotion: str          # "sad" | "anxious" | "angry" | "neutral" | "happy"
    emotion_label: str    # 繁體中文標籤
    confidence: float
    doctor_id: str = ""

@app.post("/api/emotion/detect")
def receive_emotion_alert(alert: EmotionAlertIn):
    """M55M1 板子偵測到非開心情緒後呼叫此端點"""
    # 只在非開心時產生警報
    if alert.emotion in ("happy", "neutral"):
        return {"success": True, "alert_created": False}
    patient_user = db.USERS.get(alert.patient_id, {})
    doctor_id = alert.doctor_id or "doctor_001"  # 預設主治醫師
    from datetime import datetime as _dt
    new_alert = {
        "id": f"alert_{uuid.uuid4().hex[:8]}",
        "patient_id": alert.patient_id,
        "patient_name": patient_user.get("name", alert.bed + "病患"),
        "bed": alert.bed,
        "hospital": alert.hospital or patient_user.get("hospital", ""),
        "emotion": alert.emotion,
        "emotion_label": alert.emotion_label,
        "confidence": round(alert.confidence, 3),
        "timestamp": _dt.now().strftime("%Y/%m/%d %H:%M"),
        "doctor_id": doctor_id,
        "acknowledged": False,
    }
    db.EMOTION_ALERTS.append(new_alert)
    return {"success": True, "alert_created": True, "alert_id": new_alert["id"]}

@app.get("/api/emotion/alerts/{doctor_id}")
def get_emotion_alerts(doctor_id: str, limit: int = 20):
    """醫生端：取得待確認的情緒警報"""
    alerts = [a for a in db.EMOTION_ALERTS if a.get("doctor_id") == doctor_id and not a.get("acknowledged")]
    alerts = sorted(alerts, key=lambda a: a["timestamp"], reverse=True)[:limit]
    return {"alerts": alerts, "unread": len(alerts)}

@app.post("/api/emotion/alerts/{alert_id}/ack")
def ack_emotion_alert(alert_id: str):
    """醫生確認已看到情緒警報"""
    alert = next((a for a in db.EMOTION_ALERTS if a["id"] == alert_id), None)
    if not alert:
        raise HTTPException(status_code=404, detail="警報不存在")
    alert["acknowledged"] = True
    return {"success": True}


class LLMRecommendDeptRequest(BaseModel):
    raw_text: str

@app.post("/api/llm/recommend-dept")
def llm_recommend_dept(req: LLMRecommendDeptRequest):
    """Claude AI 根據病患自然語言描述，判斷最適合的就診科別"""
    _DEPT_MAP = {
        "骨科":   "doctor_003",
        "外科":   "doctor_002",
        "內科":   "doctor_001",
        "神經科": "doctor_001",
        "心臟科": "doctor_001",
        "胸腔科": "doctor_001",
        "腸胃科": "doctor_001",
        "泌尿科": "doctor_002",
        "皮膚科": "doctor_002",
        "耳鼻喉科": "doctor_002",
        "眼科":   "doctor_002",
        "婦產科": "doctor_003",
        "精神科": "doctor_001",
    }
    try:
        client = _anthropic.Anthropic()
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=80,
            system=(
                "你是台灣醫院的智慧分診助理。根據病患描述的症狀，"
                "只需回答最適合的科別名稱（如「內科」「骨科」「外科」等），"
                "不要加任何其他解釋，只輸出科別名稱。"
            ),
            messages=[{"role": "user", "content": req.raw_text}]
        )
        dept_raw = resp.content[0].text.strip().replace("科別：", "").strip()
        # 取第一個中文詞作為科別
        import re as _re
        match = _re.search(r'[\u4e00-\u9fa5]{2,5}科', dept_raw)
        dept = match.group(0) if match else "內科"
    except Exception:
        # fallback to keyword
        text = req.raw_text
        if any(k in text for k in ["骨", "關節", "扭", "斷", "摔", "腰"]):
            dept = "骨科"
        elif any(k in text for k in ["刀", "傷口", "拆線", "手術"]):
            dept = "外科"
        elif any(k in text for k in ["頭暈", "頭痛", "麻", "抖", "昏"]):
            dept = "神經科"
        elif any(k in text for k in ["心", "胸悶", "心跳", "心臟"]):
            dept = "心臟科"
        else:
            dept = "內科"
    doc_id = _DEPT_MAP.get(dept, "doctor_001")
    return {"department": dept, "doctor_id": doc_id}

class LLMRewriteRequest(BaseModel):
    raw_text: str

@app.post("/api/llm/rewrite")
def llm_rewrite(req: LLMRewriteRequest):
    """模擬 LLM 語意重構"""
    rewrites = {
        "頭暈": "關於您提到頭暈和不適的感覺，這是術後常見的恢復反應，不需要太擔心喔。我們已安排今天下午進一步檢查，請好好休息。💙",
        "發燒": "您目前的體溫偏高是身體在對抗感染的正常反應，我們已調整用藥，請多補充水分並好好休息。💙",
        "復健": "根據您目前的恢復狀況，可以開始輕度復健了！復健師明天會來說明注意事項，請放心。💙",
    }
    for keyword, response in rewrites.items():
        if keyword in req.raw_text:
            return {"rewritten": response}
    return {
        "rewritten": f"感謝您的留言。關於您提到的狀況，{req.raw_text}——我們會密切關注您的恢復情況，有任何問題都可以隨時告訴我們。💙"
    }


class EmpathyRewriteRequest(BaseModel):
    raw_text: str
    patient_emotion: Optional[str] = ""

@app.post("/api/llm/empathy-rewrite")
def llm_empathy_rewrite(req: EmpathyRewriteRequest):
    """使用 Claude AI 將醫師的專業回覆轉譯為更具同理心與易讀性的溫暖語句"""
    try:
        client = _anthropic.Anthropic()
        emotion_hint = f"（病患目前情緒：{req.patient_emotion}）" if req.patient_emotion else ""
        prompt = (
            f"你是一位醫院的溫暖溝通助理。請將以下醫師的專業回覆，"
            f"改寫為更具同理心、溫暖、易讀的語句，讓病患感受到被關心與支持。"
            f"保留所有醫療資訊，但使用更平易近人的語言，並適當加入關懷語氣。"
            f"語言請用繁體中文。{emotion_hint}\n\n"
            f"醫師原文：{req.raw_text}\n\n"
            f"請直接輸出改寫後的內容，不要加任何前綴說明。"
        )
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"success": True, "rewritten": message.content[0].text.strip()}
    except Exception as e:
        print(f"[EMPATHY-REWRITE ERROR] {type(e).__name__}: {e}")
        return {
            "success": True,
            "rewritten": f"您好！感謝您的告知。{req.raw_text} 請放心，我們會一直陪伴您度過這段時間，如有任何不適，請隨時讓護理師知道。💙",
            "fallback": True
        }


# ════════════════════════════════════════════════
# 群眾端
# ════════════════════════════════════════════════
@app.get("/api/crowd/tasks")
def get_crowd_tasks(patient_id: str = "", status: str = ""):
    """群眾端：任務列表（只顯示 open + review 狀態，也可指定 patient_id + status）"""
    if status:
        status_list = [s.strip() for s in status.split(",")]
        filtered = [t for t in db.CROWD_TASKS if t.get("status") in status_list]
    else:
        filtered = [t for t in db.CROWD_TASKS if t.get("status") in ("open", "review", "in_progress")]
    return {"tasks": filtered}

@app.get("/api/crowd/stats/{user_id}")
def get_crowd_stats(user_id: str):
    """群眾端：個人貢獻統計（動態計算）"""
    stats = db.CROWD_STATS.setdefault(user_id, {
        "completed": 0, "points": 0
    })

    # ── 進行中：任務庫中 status == "in_progress" 的數量
    in_progress = sum(1 for t in db.CROWD_TASKS if t.get("status") == "in_progress")
    # 若全部都被 demo 模式重置為 open，用 open 任務數代替（代表「等待志工」的任務）
    if in_progress == 0:
        in_progress = sum(1 for t in db.CROWD_TASKS if t.get("status") == "open")

    # ── 滿意度：已回覆訊息 / 總訊息 * 100（醫生回覆代表病患滿意）
    total_msgs   = len(db.MESSAGES)
    replied_msgs = sum(1 for m in db.MESSAGES if m.get("replied") is True)
    if total_msgs > 0:
        satisfaction = round((replied_msgs / total_msgs) * 100)
        satisfaction = max(70, min(99, satisfaction))  # 下限 70%，上限 99%
    else:
        satisfaction = 95  # 預設值（無訊息時）

    return {
        "completed":         stats.get("completed", 0),
        "week_completed":    stats.get("week_completed", 0),
        "month_completed":   stats.get("month_completed", 0),
        "in_progress":       in_progress,
        "satisfaction":      satisfaction,
        "points":            stats.get("points", 0),
        "week_points":       stats.get("week_points", 0),
        "month_points":      stats.get("month_points", 0),
        "week_streak":       stats.get("week_streak", 0),
        "month_streak":      stats.get("month_streak", 0),
    }

@app.post("/api/crowd/tasks/{task_id}/complete")
def complete_task(task_id: str):
    """群眾完成任務（模擬）"""
    task = next((t for t in db.CROWD_TASKS if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")
    task["status"] = "completed"
    return {"success": True, "points_earned": task["points"]}

@app.post("/api/crowd/upload")
async def upload_video(
    task_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Form(default="crowd_001"),
):
    """
    群眾上傳影片。
    接受 .mp4 / .mov / .avi / .webm。
    回傳影片 URL 供前端播放與查看。
    """
    allowed = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
    ext = os.path.splitext(file.filename or "")[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"不支援的檔案格式：{ext}")

    # 使用 uuid 避免檔名衝突
    save_name = f"{task_id}_{uuid.uuid4().hex[:8]}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 標記任務完成並加分
    task = next((t for t in db.CROWD_TASKS if t["id"] == task_id), None)
    points_earned = 0
    if task:
        # 視覺處方任務 → 等待醫生審核；一般任務 → 直接完成
        if task.get("task_type") == "prescription":
            task["status"] = "review"
        else:
            task["status"] = "completed"
        task["video_url"] = f"/uploads/{save_name}"
        task["uploader_id"] = user_id
        points_earned = task.get("points", 200)

    video_url = f"/uploads/{save_name}"

    # 累計用戶積分（依登入帳號區分）
    stats = db.CROWD_STATS.setdefault(user_id, {"completed": 0, "points": 0, "week_points": 0, "month_points": 0, "week_streak": 0, "month_streak": 0})
    stats["points"]       += points_earned
    stats["week_points"]   = stats.get("week_points", 0) + points_earned
    stats["month_points"]  = stats.get("month_points", 0) + points_earned
    stats["completed"]    += 1
    new_total = stats["points"]

    # 判斷排行榜名次（上傳後即時計算）
    key_week = "week_points"
    week_rank = 1 + sum(1 for uid, s in db.CROWD_STATS.items() if uid != user_id and s.get(key_week, 0) > stats[key_week])
    month_rank = 1 + sum(1 for uid, s in db.CROWD_STATS.items() if uid != user_id and s.get("month_points", 0) > stats["month_points"])

    # 判斷是否達到兌換門檻
    REWARD_TIERS = [
        {"threshold": 200,  "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券",  "icon": "☕"},
        {"threshold": 1000, "store": "星巴克",     "item": "中杯星冰樂兌換券",    "icon": "🌟"},
        {"threshold": 3000, "store": "Uber Eats",  "item": "NT$150 折扣碼",       "icon": "🎁"},
    ]
    milestone_reward = None
    for tier in REWARD_TIERS:
        prev = new_total - points_earned
        if prev < tier["threshold"] <= new_total:
            milestone_reward = tier
            break

    return {
        "success": True,
        "video_url": video_url,
        "filename": save_name,
        "points_earned": points_earned,
        "total_points": new_total,
        "task_id": task_id,
        "milestone_reward": milestone_reward,
        "week_rank": week_rank,
        "month_rank": month_rank,
        "week_points": stats["week_points"],
        "month_points": stats["month_points"],
    }


# ── 積分更新（手動測試用） ──────────────────────────────
class PointsRequest(BaseModel):
    points: int
    reason: str = ""

@app.post("/api/crowd/stats/{user_id}/points")
def add_points(user_id: str, req: PointsRequest):
    """增加用戶積分"""
    stats = db.CROWD_STATS.setdefault(user_id, {"completed": 0, "in_progress": 0, "satisfaction": 0, "points": 0})
    stats["points"] += req.points
    return {"success": True, "total_points": stats["points"]}


# ════════════════════════════════════════════════
# 排行榜（競賽積分制）
# ════════════════════════════════════════════════
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

@app.get("/api/leaderboard/{period}")
def get_leaderboard(period: str):
    """
    排行榜。period = weekly | monthly | alltime
    依據各自積分排序，回傳含獎勵資訊的 top-10 名單。
    """
    key_map = {"weekly": "week_points", "monthly": "month_points", "alltime": "points"}
    key = key_map.get(period, "points")
    reward_map = {"weekly": _WEEK_REWARDS, "monthly": _MONTH_REWARDS}

    rows = []
    for uid, s in db.CROWD_STATS.items():
        user = db.USERS.get(uid, {})
        rows.append({
            "user_id":     uid,
            "name":        user.get("name", uid),
            "points":      s.get(key, 0),
            "total_points":s.get("points", 0),
            "week_streak": s.get("week_streak", 0),
            "month_streak":s.get("month_streak", 0),
        })
    rows.sort(key=lambda x: x["points"], reverse=True)

    rewards_list = reward_map.get(period, [])
    for i, row in enumerate(rows):
        row["rank"] = i + 1
        rw = next((r for r in rewards_list if r["rank"] == i + 1), None)
        row["reward"] = rw  # None if outside top-3

    return {"period": period, "entries": rows[:10]}


@app.get("/api/leaderboard/rewards/{user_id}")
def get_user_rewards(user_id: str):
    """回傳使用者歷史獲得的排行獎勵"""
    rewards = db.LEADERBOARD_REWARDS.get(user_id, [])
    return {"user_id": user_id, "rewards": rewards}


# ── 獎勵列表 ──────────────────────────────────────────
REWARD_TIERS = [
    {"threshold": 200,  "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券",  "icon": "☕",  "id": "reward_711"},
    {"threshold": 1000, "store": "星巴克",     "item": "中杯星冰樂兌換券",    "icon": "🌟", "id": "reward_sbux"},
    {"threshold": 3000, "store": "Uber Eats",  "item": "NT$150 折扣碼",       "icon": "🎁",  "id": "reward_uber"},
]

# 已兌換紀錄（in-memory, demo用）
_redeemed: dict = {}

@app.get("/api/crowd/rewards")
def get_rewards():
    return {"rewards": REWARD_TIERS}

@app.post("/api/crowd/redeem/{user_id}/{reward_id}")
def redeem_reward(user_id: str, reward_id: str):
    """兌換獎勵 — 回傳兌換碼（模擬）"""
    stats = db.CROWD_STATS.get(user_id)
    if not stats:
        raise HTTPException(status_code=404, detail="用戶不存在")

    tier = next((r for r in REWARD_TIERS if r["id"] == reward_id), None)
    if not tier:
        raise HTTPException(status_code=404, detail="獎勵不存在")

    if stats["points"] < tier["threshold"]:
        raise HTTPException(status_code=400, detail=f"積分不足，需要 {tier['threshold']} 點")

    # 生成模擬兌換碼
    key = f"{user_id}_{reward_id}"
    if key not in _redeemed:
        import random, string
        code = "-".join("".join(random.choices(string.ascii_uppercase + string.digits, k=4)) for _ in range(3))
        _n = datetime.now()
        _redeemed[key] = {
            "code": code,
            "store": tier["store"],
            "item": tier["item"],
            "icon": tier["icon"],
            "issued_at": f"{_n.year}/{_n.month}/{_n.day}",
            "expires": "2026/12/31",
        }

    return {"success": True, "reward": _redeemed[key]}


# ════════════════════════════════════════════════
# CLIP 影片內容比對（sentence-transformers）
# ════════════════════════════════════════════════
_clip_img_model = None
_clip_txt_model = None
_clip_util = None
_clip_loading = False


def _load_clip_models():
    """載入 CLIP 圖像模型 + 多語言文字模型（首次呼叫下載，之後快取）"""
    global _clip_img_model, _clip_txt_model, _clip_util, _clip_loading
    if _clip_img_model is not None:
        return True
    if _clip_loading:
        return False
    _clip_loading = True
    try:
        from sentence_transformers import SentenceTransformer, util as st_util
        print("⏳ 載入 CLIP 圖像模型（clip-ViT-B-32）…")
        _clip_img_model = SentenceTransformer("clip-ViT-B-32")
        print("⏳ 載入多語言文字模型（clip-ViT-B-32-multilingual-v1）…")
        _clip_txt_model = SentenceTransformer(
            "sentence-transformers/clip-ViT-B-32-multilingual-v1"
        )
        _clip_util = st_util
        _clip_loading = False
        print("✅ CLIP 模型就緒")
        return True
    except Exception as e:
        print(f"⚠️  CLIP 模型載入失敗：{e}")
        _clip_loading = False
        return False


def _sample_frames_pil(video_path: str, n: int = 10):
    """
    從影片均勻取樣 n 幀，回傳 PIL Image 列表。
    支援 MP4 / WebM（含 MediaRecorder 錄製的 WebM）：
    - 有 frame_count → seeking 模式（快）
    - frame_count = 0 → sequential 模式（WebM 等無 index 容器）
    """
    try:
        import cv2
        from PIL import Image
        import numpy as np

        cap = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30
        frames = []

        if total > 5:
            # ── seeking 模式（MP4 等有完整 index 的格式）
            start   = max(0, int(total * 0.05))
            end     = min(total - 1, int(total * 0.95))
            indices = np.linspace(start, end, min(n, total), dtype=int)
            for idx in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                ret, frame = cap.read()
                if ret:
                    frames.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
        else:
            # ── sequential 模式（WebM MediaRecorder 無 frame_count）
            sample_every = max(1, int(fps / 3))   # ~3 fps 取樣
            fc = 0
            while len(frames) < n * 3:            # 多讀一些再截取
                ret, frame = cap.read()
                if not ret:
                    break
                if fc % sample_every == 0:
                    frames.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
                fc += 1
            # 均勻取 n 幀
            if len(frames) > n:
                step = len(frames) / n
                frames = [frames[int(i * step)] for i in range(n)]

        cap.release()
        return frames
    except Exception as e:
        print(f"Frame sampling error: {e}")
        return []


# ════════════════════════════════════════════════
# CLAP 音訊內容比對（laion/clap-htsat-unfused）
# ════════════════════════════════════════════════
# ── 中文聲音關鍵字 → 英文 CLAP 查詢（CLAP 僅支援英文）──────────────────────
_AUDIO_KEYWORD_MAP: dict = {
    "海浪": ("ocean waves crashing on beach shore",   "海浪聲"),
    "浪聲": ("ocean waves sound splashing",            "海浪聲"),
    "礫石": ("waves hitting pebbles gravel beach",    "礫石海浪聲"),
    "海邊": ("beach ocean waves ambient sound",        "海邊聲音"),
    "鳥鳴": ("birds chirping singing in forest",       "鳥鳴聲"),
    "鳥叫": ("bird calls chirping tweeting",           "鳥叫聲"),
    "蟲鳴": ("insects crickets cicadas night sound",   "蟲鳴聲"),
    "流水": ("flowing water stream babbling brook",    "流水聲"),
    "溪流": ("creek stream running water sound",       "溪流聲"),
    "瀑布": ("waterfall rushing water sound",          "瀑布聲"),
    "風聲": ("wind blowing outdoor sound",             "風聲"),
    "雨聲": ("rain falling raindrops sound",           "雨聲"),
    "自然聲": ("nature ambient outdoor sounds forest",  "自然聲音"),
    "大自然聲": ("nature wildlife outdoor ambient",    "大自然聲"),
    "安靜聲": ("quiet peaceful silent ambient",        "安靜環境"),
    "環境聲音": ("ambient environmental sound",        "環境聲音"),
}

# ── 用於偵測影片中實際聲音的分類集（英文查詢 → 中文標籤）──────────────────
_SOUND_DETECT_CATEGORIES: list = [
    ("ocean waves crashing on beach",             "🌊 海浪聲"),
    ("birds chirping singing in forest",          "🐦 鳥鳴聲"),
    ("flowing water stream babbling",             "💧 流水聲"),
    ("rain falling raindrops",                    "🌧 雨聲"),
    ("wind blowing outdoor",                      "🌬 風聲"),
    ("insects crickets night sound",              "🦗 蟲鳴聲"),
    ("indoor room ambience background noise",     "🏠 室內環境音"),
    ("traffic road city noise",                   "🚗 交通噪音"),
    ("people talking crowd noise",                "👥 人群聲"),
    ("quiet silence peaceful",                    "🔇 安靜"),
    ("recording wind noise microphone",           "💨 收音風噪"),
    ("music playing instrument",                  "🎵 音樂聲"),
]

# ── 聲音不匹配時的建議動作（detected_label_key → action 中文）───────────────
_SOUND_ACTION_MAP: dict = {
    "🏠 室內環境音": "前往戶外自然環境拍攝",
    "🚗 交通噪音":   "遠離道路，尋找較安靜的自然場景",
    "👥 人群聲":     "選擇人少的時段或偏遠地點拍攝",
    "💨 收音風噪":   "調整拍攝方向以減少風噪，或使用遮風罩",
    "🎵 音樂聲":     "關閉背景音樂，讓自然聲音更突出",
}

_clap_model = None
_clap_processor = None
_clap_loading = False


def _load_clap_model():
    global _clap_model, _clap_processor, _clap_loading
    if _clap_model is not None:
        return True
    if _clap_loading:
        return False
    _clap_loading = True
    try:
        from transformers import ClapModel, ClapProcessor
        print("⏳ 載入 CLAP 音訊模型（laion/clap-htsat-unfused，~615MB）…")
        _clap_model     = ClapModel.from_pretrained("laion/clap-htsat-unfused")
        _clap_processor = ClapProcessor.from_pretrained("laion/clap-htsat-unfused")
        _clap_model.eval()
        _clap_loading = False
        print("✅ CLAP 音訊模型就緒")
        return True
    except Exception as e:
        print(f"⚠️  CLAP 模型載入失敗：{e}")
        _clap_loading = False
        return False


def _extract_audio_av(video_path: str):
    """
    使用 PyAV 從影片提取音訊，輸出 48kHz mono float32 numpy array。
    支援 WebM/Opus（MediaRecorder 錄製）與 MP4/AAC。
    回傳 (numpy_array, 48000) 或 (None, None)。
    """
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
                        chunks.append(rf.to_ndarray())  # shape: [1, N]
        # flush resampler
        for rf in resampler.resample(None):
            chunks.append(rf.to_ndarray())
        if not chunks:
            return None, None
        audio = np.concatenate(chunks, axis=1).squeeze(0).astype(np.float32)
        return audio, 48000
    except Exception as e:
        print(f"Audio extraction error: {e}")
        return None, None


def _detect_audio_keywords(description: str) -> list:
    """偵測描述中的聲音關鍵字，回傳 [(english_query, chinese_label), ...]"""
    matched = []
    for kw, (en_query, zh_label) in _AUDIO_KEYWORD_MAP.items():
        if kw in description:
            if en_query and (en_query, zh_label) not in matched:
                matched.append((en_query, zh_label))
    return matched


def _run_clap_analysis(audio_np, audio_keywords: list) -> dict:
    """
    使用 CLAP 計算：
    1. 音訊 vs 期望聲音 → 符合度分數
    2. 音訊 vs 所有分類 → 偵測影片中實際聲音
    回傳 { score_pct, label, level, expected_labels, detected_sounds }
    """
    try:
        import torch
        import numpy as np
        import torch.nn.functional as F

        # 期望聲音文字嵌入
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
            text_emb  = _clap_model.get_text_features(**inputs_text)

        audio_emb = F.normalize(audio_emb, dim=-1)   # [1, 512]
        text_emb  = F.normalize(text_emb,  dim=-1)   # [N, 512]
        sims = (audio_emb @ text_emb.T).squeeze(0).cpu().numpy()  # [N]

        # 期望聲音平均符合度
        n_exp = len(expected_queries)
        exp_sims = sims[:n_exp]
        raw_audio_score = float(exp_sims.mean()) if n_exp > 0 else 0.0

        # 正規化（CLAP cosine sim 0.12~0.30 範圍）
        score_pct = int(min(100, max(0, (raw_audio_score - 0.10) / (0.30 - 0.10) * 100)))

        # 偵測到的聲音（取前3高分）
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
            "score_pct":       score_pct,
            "raw_score":       round(raw_audio_score, 4),
            "label":           label,
            "level":           level,
            "expected_labels": [lbl for _, lbl in audio_keywords],
            "detected_sounds": detected_sounds,
        }
    except Exception as e:
        return {"score_pct": -1, "label": f"音訊分析失敗：{e}", "level": "bad",
                "expected_labels": [], "detected_sounds": []}


def _generate_dynamic_suggestions(
    description: str,
    visual_score: int,
    audio_result: dict | None,
) -> list:
    """
    根據 AI 分析結果生成針對性建議（非寫死，基於實際偵測聲音與視覺分數）。
    threshold: 視覺+音訊皆需達90%，否則給建議。
    """
    suggestions = []

    # ── 音訊建議（最高優先）──────────────────────────────────
    if audio_result and audio_result.get("score_pct", -1) >= 0:
        a_score = audio_result["score_pct"]
        expected = audio_result.get("expected_labels", [])
        detected  = audio_result.get("detected_sounds", [])
        top_detected = detected[0]["label"] if detected else "未知聲音"
        top_expected = expected[0] if expected else "目標聲音"

        if a_score < 90:
            # 動態：根據偵測到的聲音類型給建議
            action = _SOUND_ACTION_MAP.get(top_detected, "調整拍攝環境以凸顯目標聲音")
            if a_score < 50:
                suggestions.append(
                    f"🎧 音訊偵測到「{top_detected}」，與描述期望的「{top_expected}」"
                    f"差距較大（符合度 {a_score}%），建議{action}。"
                )
            else:
                suggestions.append(
                    f"🎧 音訊以「{top_detected}」為主，「{top_expected}」不夠突出"
                    f"（符合度 {a_score}%），{action}可提升效果。"
                )

    # ── 視覺建議 ───────────────────────────────────────────
    if visual_score < 90:
        if visual_score < 50:
            suggestions.append(
                f"📷 畫面內容符合度偏低（{visual_score}%），建議依描述「{description[:20]}…」"
                f"調整拍攝場景，例如更接近核心景物或更換地點。"
            )
        else:
            suggestions.append(
                f"📷 畫面符合度尚可（{visual_score}%），可試著讓畫面主體更貼近描述，"
                f"減少無關背景的占比以提升辨識度。"
            )

    return suggestions


# 伺服器啟動後在背景執行模型預熱（避免第一次請求等太久）
threading.Thread(target=_load_clip_models, daemon=True).start()
threading.Thread(target=_load_clap_model,  daemon=True).start()


@app.get("/api/video/model-status")
def video_model_status():
    """回傳 CLIP 模型是否就緒"""
    return {
        "ready": _clip_img_model is not None,
        "loading": _clip_loading,
    }


@app.get("/api/video/analyze/{task_id}")
async def analyze_video_content(task_id: str):
    """
    CLIP 影片內容與病患描述相似度分析。
    - 取樣 10 幀 → 圖像嵌入
    - 病患需求描述 → 多語言文字嵌入（支援繁體中文）
    - 餘弦相似度 top-3 均值 → 正規化為 0~100 分
    """
    task = next((t for t in db.CROWD_TASKS if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")

    video_url = task.get("video_url", "")
    if not video_url:
        raise HTTPException(status_code=400, detail="影片尚未上傳")

    description = task.get("description", "").strip()
    if not description:
        return {"score_pct": 50, "label": "無描述可比對", "level": "warn", "ready": False}

    video_path = os.path.join(UPLOAD_DIR, os.path.basename(video_url))
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="影片檔案不存在")

    # 若模型還在載入中，等待最多 60 秒
    if _clip_img_model is None:
        for _ in range(60):
            await asyncio.sleep(1)
            if _clip_img_model is not None:
                break
        if _clip_img_model is None:
            if _clip_loading:
                return {"score_pct": -1, "label": "模型載入中，請稍後重試", "level": "warn", "ready": False}
            # 未安裝：嘗試同步載入一次
            loop = asyncio.get_event_loop()
            ok = await loop.run_in_executor(None, _load_clip_models)
            if not ok:
                return {
                    "score_pct": -1,
                    "label": "模型未安裝（請執行 uv add sentence-transformers opencv-python）",
                    "level": "bad",
                    "ready": False,
                }

    try:
        import numpy as np

        # ── 1. 視覺 CLIP 推論 ────────────────────────────────────
        def _run_visual_inference():
            frames = _sample_frames_pil(video_path, n=10)
            if not frames:
                return None
            img_embs = _clip_img_model.encode(frames, batch_size=10, convert_to_tensor=True)
            txt_emb  = _clip_txt_model.encode(description, convert_to_tensor=True)
            scores   = _clip_util.cos_sim(txt_emb, img_embs)[0].cpu().numpy()
            k = min(3, len(scores))
            return float(np.sort(scores)[::-1][:k].mean()), len(frames)

        loop = asyncio.get_event_loop()
        vis_result = await loop.run_in_executor(None, _run_visual_inference)

        if vis_result is None:
            return {"score_pct": 0, "label": "無法取樣影片幀", "level": "bad", "ready": True}

        raw_visual, n_frames = vis_result
        visual_pct = int(min(100, max(0, (raw_visual - 0.12) / (0.32 - 0.12) * 100)))

        # ── 2. 音頻 CLAP 分析（有關鍵字 → 計入分數；無關鍵字 → 只偵測聲音）────────
        audio_keywords = _detect_audio_keywords(description)
        has_audio = bool(audio_keywords)
        audio_result: dict | None = None

        # 無論有無關鍵字，CLAP 模型就緒時都執行聲音偵測（最多等 15 秒）
        if _clap_model is None:
            wait_secs = 90 if has_audio else 15
            for _ in range(wait_secs):
                await asyncio.sleep(1)
                if _clap_model is not None:
                    break

        if _clap_model is not None:
            def _run_audio_inference():
                audio_np = _extract_audio_av(video_path)
                if audio_np is None:
                    return None
                return _run_clap_analysis(audio_np, audio_keywords)

            audio_result = await loop.run_in_executor(None, _run_audio_inference)

        # ── 3. 計算綜合分數 ─────────────────────────────────────
        if has_audio and audio_result and audio_result.get("score_pct", -1) >= 0:
            audio_pct = audio_result["score_pct"]
            score_pct = int(0.6 * visual_pct + 0.4 * audio_pct)
        else:
            audio_pct = None
            score_pct = visual_pct

        # ── 4. 標籤 ─────────────────────────────────────────────
        if score_pct >= 70:
            label, level = "高度符合", "good"
        elif score_pct >= 40:
            label, level = "部分符合", "warn"
        else:
            label, level = "內容偏離，建議重拍", "bad"

        # ── 5. 建議（AI 動態生成）────────────────────────────────
        suggestions = _generate_dynamic_suggestions(description, visual_pct, audio_result)

        resp: dict = {
            "score_pct": score_pct,
            "visual_score_pct": visual_pct,
            "raw_score": round(raw_visual, 4),
            "label": label,
            "level": level,
            "description": description,
            "frames_sampled": n_frames,
            # has_audio_analysis=True → 有關鍵字且有分數；detect_only=True → 無關鍵字但有聲音偵測
            "has_audio_analysis": has_audio and audio_result is not None,
            "detect_only": (not has_audio) and audio_result is not None,
            "ready": True,
        }

        if audio_result is not None:
            if has_audio:
                resp["audio_score_pct"] = audio_result.get("score_pct", -1)
                resp["audio_label"]     = audio_result.get("label", "")
                resp["audio_level"]     = audio_result.get("level", "warn")
            else:
                # 無關鍵字：不顯示符合度分數，只顯示偵測結果
                resp["audio_score_pct"] = None
                resp["audio_label"]     = "環境聲偵測"
                resp["audio_level"]     = "info"
            resp["detected_sounds"] = audio_result.get("detected_sounds", [])
        else:
            resp["audio_score_pct"] = None
            resp["audio_label"]     = "CLAP 模型尚未就緒" if has_audio else None
            resp["audio_level"]     = "warn" if has_audio else None
            resp["detected_sounds"] = []

        if suggestions:
            resp["suggestions"] = suggestions

        return resp

    except Exception as e:
        return {"score_pct": -1, "label": f"分析失敗：{str(e)}", "level": "bad", "ready": True}


# ════════════════════════════════════════════════
# 病患心願清單
# ════════════════════════════════════════════════

class WishlistAddRequest(BaseModel):
    patient_id: str
    patient_name: str
    patient_bed: str
    place_name: str
    description: Optional[str] = ""

class WishlistClaimRequest(BaseModel):
    crowd_id: str

@app.get("/api/wishlist/all")
def get_all_wishlists():
    """取得所有未完成心願（給志工看）"""
    pending = [w for w in db.WISHLISTS if not w["fulfilled"]]
    return {"wishlists": pending}

@app.get("/api/wishlist/{patient_id}")
def get_patient_wishlist(patient_id: str):
    """取得指定病患的所有心願"""
    wishes = [w for w in db.WISHLISTS if w["patient_id"] == patient_id]
    return {"wishlists": wishes}

@app.post("/api/wishlist")
def add_wishlist(req: WishlistAddRequest):
    """新增心願"""
    now = datetime.now().strftime("%Y/%m/%d %H:%M")
    new_wish = {
        "id": f"wish_{uuid.uuid4().hex[:8]}",
        "patient_id": req.patient_id,
        "patient_name": req.patient_name,
        "patient_bed": req.patient_bed,
        "place_name": req.place_name,
        "description": req.description or "",
        "created_at": now,
        "fulfilled": False,
        "claimed_by": None,
    }
    db.WISHLISTS.append(new_wish)
    return {"success": True, "wish": new_wish}

@app.delete("/api/wishlist/{wish_id}")
def delete_wishlist(wish_id: str):
    """刪除心願"""
    wish = next((w for w in db.WISHLISTS if w["id"] == wish_id), None)
    if not wish:
        raise HTTPException(status_code=404, detail="心願不存在")
    if wish.get("claimed_by"):
        raise HTTPException(status_code=400, detail="已被認領的心願無法刪除")
    db.WISHLISTS.remove(wish)
    return {"success": True}

@app.post("/api/wishlist/{wish_id}/claim")
def claim_wishlist(wish_id: str, req: WishlistClaimRequest):
    """志工認領心願"""
    wish = next((w for w in db.WISHLISTS if w["id"] == wish_id), None)
    if not wish:
        raise HTTPException(status_code=404, detail="心願不存在")
    if wish.get("claimed_by"):
        raise HTTPException(status_code=400, detail="此心願已被認領")
    wish["claimed_by"] = req.crowd_id
    return {"success": True, "wish": wish}


@app.post("/api/wishlist/{wish_id}/pre-voice")
async def upload_wish_pre_voice(
    wish_id: str,
    crowd_id: str = Form(...),
    file: UploadFile = File(...),
):
    """志工認領心願後，出發前錄音傳給病患"""
    wish = next((w for w in db.WISHLISTS if w["id"] == wish_id), None)
    if not wish:
        raise HTTPException(status_code=404, detail="心願不存在")
    ext = os.path.splitext(file.filename or "audio.webm")[-1].lower() or ".webm"
    save_name = f"wish_pre_{wish_id}_{uuid.uuid4().hex[:6]}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    wish["pre_voice_url"] = f"/uploads/{save_name}"
    wish["pre_voice_by"] = crowd_id
    return {"ok": True, "pre_voice_url": wish["pre_voice_url"]}


@app.post("/api/wishlist/{wish_id}/fulfill")
async def fulfill_wish(
    wish_id: str,
    crowd_id: str = Form(...),
    file: UploadFile = File(...),
):
    """志工上傳心願成果影片，標記心願完成"""
    wish = next((w for w in db.WISHLISTS if w["id"] == wish_id), None)
    if not wish:
        raise HTTPException(status_code=404, detail="心願不存在")
    ext = os.path.splitext(file.filename or "video.mp4")[-1].lower() or ".mp4"
    save_name = f"wish_fulfill_{wish_id}_{uuid.uuid4().hex[:6]}{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    wish["fulfilled"] = True
    wish["fulfilled_by"] = crowd_id
    wish["fulfilled_at"] = datetime.now().strftime("%Y/%m/%d %H:%M")
    wish["fulfilled_video_url"] = f"/uploads/{save_name}"
    # 給志工加分
    stats = db.CROWD_STATS.setdefault(crowd_id, {"completed": 0, "points": 0, "week_points": 0, "month_points": 0, "week_streak": 0, "month_streak": 0})
    bonus = 200
    stats["points"] += bonus
    stats["week_points"] = stats.get("week_points", 0) + bonus
    stats["month_points"] = stats.get("month_points", 0) + bonus
    stats["completed"] = stats.get("completed", 0) + 1
    return {"ok": True, "video_url": wish["fulfilled_video_url"]}
