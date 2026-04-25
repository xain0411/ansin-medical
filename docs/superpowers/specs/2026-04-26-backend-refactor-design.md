# Backend 重構設計文件

**日期：** 2026-04-26  
**範圍：** 安心醫伴系統後端重構  
**目標：** 修復安全漏洞、導入 PostgreSQL 持久化（Docker Compose）、模組化 main.py、修復 ML 模型 bug

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
ansin-medical/
├── docker-compose.yml    # PostgreSQL 服務定義
├── .env                  # 新增 DATABASE_URL
└── backend/
    ├── main.py           # app 初始化 + router 掛載（~50行）
    ├── database.py       # PostgreSQL 連線池、建表、seed 測試資料、CRUD helpers
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

## 三、PostgreSQL + Docker Compose 設計

### 3.1 docker-compose.yml

```yaml
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

後端仍在本機執行（`uv run uvicorn ...`），只有 DB 跑在 Docker。
啟動指令：`docker compose up -d db`

### 3.2 環境變數（.env 新增）

```
DATABASE_URL=postgresql://ansin:ansin_dev@localhost:5432/ansin
```

### 3.3 Python 驅動（psycopg2-binary）

- 使用 `psycopg2-binary`（同步，不需重構現有 async 邏輯）
- `database.py` 建立 `SimpleConnectionPool(minconn=1, maxconn=10)`
- 使用 `contextlib.contextmanager` 封裝 `get_conn()`，用完自動歸還連線池
- 啟動時執行 `CREATE TABLE IF NOT EXISTS` + seed（各表為空時）

```python
# database.py 核心模式
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
```

### 3.4 表結構

PostgreSQL 使用 `SERIAL` 取代 AUTOINCREMENT，`JSONB` 取代 TEXT 儲存 JSON，`BOOLEAN` 取代 INTEGER 表示旗標。

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
    otp_expires BIGINT,   -- Unix timestamp
    care_team   JSONB,
    extra       JSONB
);
```

**messages**
```sql
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
```

**queues**（合併 NURSE_QUEUE / RESIDENT_QUEUE / ATTENDING_QUEUE）
```sql
CREATE TABLE IF NOT EXISTS queues (
    id          SERIAL PRIMARY KEY,
    queue_type  TEXT,      -- 'nurse' | 'resident' | 'attending'
    message_id  INTEGER,
    patient_id  TEXT,
    bed         TEXT,
    processed   BOOLEAN DEFAULT FALSE,
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
    extra        JSONB
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
    id         SERIAL PRIMARY KEY,
    user_id    TEXT,
    type       TEXT,
    content    JSONB,
    read       BOOLEAN DEFAULT FALSE,
    created_at TEXT
);
```

**friends**
```sql
CREATE TABLE IF NOT EXISTS friends (
    id         SERIAL PRIMARY KEY,
    user_id    TEXT,
    friend_id  TEXT,
    status     TEXT,   -- 'pending' | 'accepted'
    created_at TEXT
);
```

**chat_messages**
```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id         SERIAL PRIMARY KEY,
    from_id    TEXT,
    to_id      TEXT,
    content    TEXT,
    timestamp  TEXT
);
```

**prescriptions**
```sql
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
```

**rewards**
```sql
CREATE TABLE IF NOT EXISTS rewards (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    points_cost INTEGER,
    extra       JSONB
);
```

> **Note：** `leaderboard` 不需獨立表，由 `crowd_stats` 的 `week_points`/`month_points` 排序計算。

### 3.5 ID 碰撞修復

所有數字 ID 欄位改用 `SERIAL PRIMARY KEY`，由 PostgreSQL 的序列（sequence）保證唯一性，完全移除手動 `max(all_ids) + 1` 邏輯。

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

- queues 表 `processed BOOLEAN DEFAULT FALSE`
- 查詢待處理：`WHERE processed = FALSE`
- 醫生/護士回覆後：`UPDATE queues SET processed = TRUE WHERE message_id = %s`
- 保留所有記錄，可依 `processed` 欄位篩選查閱

### 4.3 Windy 快取 TTL（routers/camera.py）

```python
_windy_cache[key] = {
    "data": [...],
    "expires_at": time.time() + 3600  # 1 小時
}

entry = _windy_cache.get(key)
if entry and time.time() < entry["expires_at"]:
    return {"cameras": entry["data"]}
# 過期則重新抓取
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
except Exception as e:
    _clip_img_model = None
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

## 七、依賴套件變更

```toml
# pyproject.toml 新增
psycopg2-binary = ">=2.9"
```

---

## 八、不在本次範圍內

- 身份驗證仍為 demo 模式（任意密碼可登入）— 為競賽展示保留
- CORS 設定不變
- 前端不做改動
- 不引入 SQLAlchemy 或 Alembic

---

## 九、驗收條件

1. `docker compose up -d db` 後，PostgreSQL 在 port 5432 就緒
2. 後端啟動時自動建表並 seed 測試資料（各表為空時）
3. `POST /api/auth/forgot-password` response 不含 `otp` 欄位
4. `POST /api/auth/reset-password` 可正確驗證 OTP 並拒絕過期 OTP
5. 重啟後端後資料仍存在（DB 在 Docker volume 中持久化）
6. `/api/video/analyze/{task_id}` 音訊分析不再因 tuple 未拆包而報錯
7. `GET /api/windy/webcams` 第二次呼叫在 1 小時內使用快取，不重打 Windy API
8. 所有現有 API 端點行為不變（功能回歸）
