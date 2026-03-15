# 安心醫伴新視界

## 專案結構

```
ansin-medical/
├── pyproject.toml          # uv 套件設定
├── README.md
├── backend/
│   ├── main.py             # FastAPI 主程式（所有 API 路由）
│   └── fake_db.py          # 假資料（之後換成真實 DB 只改這裡）
└── frontend/
    ├── index.html          # 主頁面（單頁應用）
    ├── css/
    │   └── style.css       # 所有樣式
    └── js/
        ├── api.js          # API 呼叫封裝層
        └── app.js          # 前端邏輯與互動
```

## 快速啟動

### 1. 安裝 uv（如果還沒有）
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. 安裝依賴
```bash
cd ansin-medical
uv sync
```

### 3. 啟動伺服器
```bash
uv run uvicorn backend.main:app --reload --port 8000
```

### 4. 開啟瀏覽器
```
http://localhost:8000
```

---

## 測試帳號

| 角色   | 帳號           | 密碼    |
|--------|----------------|---------|
| 病患   | patient_503B   | 任意    |
| 醫生   | doctor_001     | 任意    |
| 群眾   | crowd_001      | 任意    |

> 假資料版：密碼不驗證，帳號存在即可登入

---

## API 文件

啟動後開啟：http://localhost:8000/docs

---

## 未來擴充（換成真實功能）

### 接真實資料庫
修改 `backend/fake_db.py`，改成 SQLAlchemy + PostgreSQL：
```python
# 安裝
uv add sqlalchemy psycopg2-binary alembic
```

### 接真實 LLM
修改 `backend/main.py` 中 `/api/llm/rewrite` 路由：
```python
# 安裝
uv add anthropic
# 或
uv add openai
```

### 接真實 STT
```python
uv add openai-whisper
# 或使用 Google Cloud STT
```

### 接 Twipcam HLS
在前端 `frontend/js/app.js` 的 `selectPin()` 函式中，
將模擬畫面替換為真實 HLS 播放器（如 hls.js）。
