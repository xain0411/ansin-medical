# Backend 重構設計文件

**日期：** 2026-04-26  
**範圍：** 安心醫伴系統後端重構  
**目標：** 修復安全漏洞、導入 SQLite 持久化、模組化 main.py、修復 ML 模型 bug

---

## 一、問題清單

| # | 問題 | 嚴重度 |
|---|------|--------|
| 1 | OTP 明文洩漏於 API response | 高 |
| 2 | 全用 in-memory dict，重啟即消失 | 高 |
| 3 | Message ID 用 max+1 手算，並發時碰撞 | 中 |
| 4 | 佇列只進不出，無限成長 | 中 |
| 5 | CLAP `_extract_audio_av` 回傳 tuple 未拆包 | 中 |
| 6 | CLIP/CLAP 模型部分載入後狀態不一致 | 中 |
| 7 | CLIP/CLAP 模型載入用 boolean flag 而非 Lock | 低 |
| 8 | Windy 相機快取永不過期 | 低 |
| 9 | main.py 3265 行，無模組化 | 低 |

---

## 二、目錄結構（目標）

```
backend/
├── main.py           # app 初始化 + router 掛載（~50行）
├── database.py       # SQLite 連線、建表、seed 測試資料、CRUD helpers
├── models.py         # 所有 Pydantic request/response models
├── ws_manager.py     # WebSocket 連線管理
├── routers/
│   ├── auth.py       # 登入、OTP 驗證、密碼重設
│   ├── messages.py   # 病患訊息、triage、護士/醫生 reply
│   ├── crowd.py      # 任務、上傳、積分、排行榜、友誼、聊天
│   ├── camera.py     # Twipcam、Windy（TTL 快取）、cam-proxy
│   └── video.py      # /analyze 端點
└── ml/
    ├── __init__.py
    ├── clip.py       # CLIP 模型載入、幀取樣、推論
    └── clap.py       # CLAP 模型載入、音訊提取、推論
```

現有 `fake_db.py` 保留，僅作為 seed 資料來源，不再作為 runtime 資料儲存。

---

## 三、SQLite 設計

### 3.1 連線設定（database.py）

- 資料庫檔案：`backend/data/ansin.db`
- 使用 Python 內建 `sqlite3`，不引入 ORM
- 每個請求建立連線（使用 `contextlib.contextmanager`），thread-safe
- 啟動時執行 `CREATE TABLE IF NOT EXISTS` + seed（DB 為空時）

### 3.2 表結構

**users**
```sql
CREATE TABLE IF NOT EXISTS users (
    user_id     TEXT PRIMARY KEY,
    name        TEXT,
    role        TEXT,
    hospital    TEXT,
    bed         TEXT,
    phone       TEXT,
    password    TEXT,
    otp         TEXT,
    otp_expires INTEGER,  -- Unix timestamp
    care_team   TEXT,     -- JSON array
    extra       TEXT      -- JSON（其餘欄位）
);
```

**messages**
```sql
CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT,
    bed         TEXT,
    content     TEXT,
    emotion     TEXT,
    ttas_level  INTEGER,
    replied     INTEGER DEFAULT 0,
    reply_text  TEXT,
    reply_by    TEXT,
    timestamp   TEXT,
    extra       TEXT  -- JSON（audit_log 等）
);
```

**queues**（合併 NURSE_QUEUE / RESIDENT_QUEUE / ATTENDING_QUEUE）
```sql
CREATE TABLE IF NOT EXISTS queues (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_type  TEXT,   -- 'nurse' | 'resident' | 'attending'
    message_id  INTEGER,
    patient_id  TEXT,
    bed         TEXT,
    processed   INTEGER DEFAULT 0,  -- 0=待處理, 1=已處理
    created_at  TEXT
);
```

**crowd_tasks**
```sql
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
    extra        TEXT  -- JSON
);
```

**crowd_stats**
```sql
CREATE TABLE IF NOT EXISTS crowd_stats (
    user_id      TEXT PRIMARY KEY,
    completed    INTEGER DEFAULT 0,
    points       INTEGER DEFAULT 0,
    week_points  INTEGER DEFAULT 0,
    month_points INTEGER DEFAULT 0
);
```

**notifications**
```sql
CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT,
    type       TEXT,
    content    TEXT,  -- JSON
    read       INTEGER DEFAULT 0,
    created_at TEXT
);
```

**friends**
```sql
CREATE TABLE IF NOT EXISTS friends (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT,
    friend_id  TEXT,
    status     TEXT,  -- 'pending' | 'accepted'
    created_at TEXT
);
```

**chat_messages**
```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    TEXT,
    to_id      TEXT,
    content    TEXT,
    timestamp  TEXT
);
```

**prescriptions**
```sql
CREATE TABLE IF NOT EXISTS prescriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id  TEXT,
    doctor_id   TEXT,
    visual_type TEXT,
    description TEXT,
    task_id     TEXT,
    created_at  TEXT,
    extra       TEXT  -- JSON
);
```

**rewards**
```sql
CREATE TABLE IF NOT EXISTS rewards (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    points_cost INTEGER,
    extra       TEXT  -- JSON
);
```

> **Note：** `leaderboard` 不需獨立表，由 `crowd_stats` 的 `week_points`/`month_points` 排序計算。

### 3.3 ID 碰撞修復

所有需要數字 ID 的表改用 `INTEGER PRIMARY KEY AUTOINCREMENT`，由 SQLite 保證唯一性，完全移除手動 `max(all_ids) + 1` 邏輯。

---

## 四、各問題修復細節

### 4.1 OTP 修復（routers/auth.py）

**現況：**
```python
return {"success": True, "otp": otp, "masked_phone": masked_phone}
```

**修復後：**
```python
# OTP 只存進 users 表的 otp + otp_expires 欄位
# response 不包含 otp
return {"success": True, "masked_phone": masked_phone}
```

`POST /api/auth/reset-password` 從 DB 查詢 OTP 並驗證是否過期（有效期 10 分鐘）。

### 4.2 佇列清理（database.py + routers/messages.py）

- queues 表新增 `processed INTEGER DEFAULT 0`
- 查詢待處理訊息：`WHERE processed = 0`
- 醫生/護士回覆後：`UPDATE queues SET processed = 1 WHERE message_id = ?`
- 保留所有記錄可供後續查閱

### 4.3 Windy 快取 TTL（routers/camera.py）

```python
# 快取結構改為
_windy_cache[key] = {
    "data": [...],
    "expires_at": time.time() + 3600  # 1 小時
}

# 讀取時
entry = _windy_cache.get(key)
if entry and time.time() < entry["expires_at"]:
    return {"cameras": entry["data"]}
# 否則重新抓取
```

---

## 五、ML 模型修復（ml/clip.py、ml/clap.py）

### 5.1 CLAP tuple 未拆包（Bug 1）

```python
# 修復前（bug）
audio_np = _extract_audio_av(video_path)   # 回傳 (array, rate)
if audio_np is None:                        # 永遠 False

# 修復後
audio_np, sr = _extract_audio_av(video_path)
if audio_np is None:
    return None
```

### 5.2 模型部分載入後狀態不一致（Bug 2）

```python
# except 區塊重設所有模型變數
except Exception as e:
    _clip_img_model = None   # 確保下次重試
    _clip_txt_model = None
    _clip_util = None
    _clip_loading = False
    return False
```

### 5.3 threading.Lock 取代 boolean flag（Bug 3）

```python
_clip_lock = threading.Lock()

def _load_clip_models():
    global _clip_img_model, _clip_txt_model, _clip_util
    with _clip_lock:
        if _clip_img_model is not None:
            return True
        # ... 載入邏輯
```

---

## 六、模組切分範圍

| 模組 | 搬移內容 |
|------|---------|
| `ws_manager.py` | `ConnectionManager` class、`ws_mgr` instance |
| `models.py` | 所有 `BaseModel` subclass（LoginRequest、MessageRequest 等）|
| `routers/auth.py` | `/api/login`、`/api/auth/*` |
| `routers/messages.py` | `/api/messages/*`、`/api/triage`、`/api/doctor/*`、`/api/nurse/*`、`/api/patient/*`、`/ws/{user_id}` |
| `routers/crowd.py` | `/api/crowd/*`、`/api/leaderboard/*`、`/api/friend/*`、`/api/chat/*`、`/api/notifications/*` |
| `routers/camera.py` | `/api/twipcam/*`、`/api/windy/*`、`/api/cam-proxy/*`、`/api/map/*`、`/api/therapeutic-channels` |
| `routers/video.py` | `/api/video/*` |
| `ml/clip.py` | `_load_clip_models`、`_sample_frames_pil`、`_is_sharp`、`_clip_*` globals |
| `ml/clap.py` | `_load_clap_model`、`_extract_audio_av`、`_run_clap_analysis`、`_clap_*` globals |

---

## 七、不在本次範圍內

- 身份驗證仍為 demo 模式（任意密碼可登入）— 為競賽展示保留
- CORS 設定不變
- 前端不做改動
- 不引入 SQLAlchemy 或 Alembic

---

## 八、驗收條件

1. 伺服器啟動後 `backend/data/ansin.db` 自動建立並 seed 測試資料
2. `POST /api/auth/forgot-password` response 不含 `otp` 欄位
3. `POST /api/auth/reset-password` 可正確驗證 OTP 並拒絕過期 OTP
4. 重啟伺服器後資料仍存在
5. `/api/video/analyze/{task_id}` 音訊分析不再因 tuple 未拆包而報錯
6. `GET /api/windy/webcams` 第二次呼叫在 1 小時內使用快取
7. 所有現有 API 端點行為不變（功能回歸）
