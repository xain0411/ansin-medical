# 安心醫伴新視界
### AnSin Medical Companion System

> 以生物心理社會模型為設計基礎，整合 AI 輔助醫病溝通、群眾協作視覺療癒處方與邊緣運算生理情緒監測，為住院病患提供全方位的心理照護支持。

---

## 目錄

- [系統簡介](#系統簡介)
- [核心功能](#核心功能)
- [系統架構](#系統架構)
- [技術堆疊](#技術堆疊)
- [專案結構](#專案結構)
- [環境需求](#環境需求)
- [快速啟動](#啟動說明)
- [示範帳號](#示範帳號)
- [API 文件](#api-文件)
- [ML 模型說明](#ml-模型說明)
- [主要依賴套件](#主要依賴套件)
- [參考文獻](#參考文獻)

---

## 系統簡介

住院病患長期面臨三大困境：**醫病溝通不足**、**心理療癒資源匱乏**，以及**情緒狀態難以量化**。本系統針對上述問題，設計一套整合病患、醫護人員、群眾志工四端協作的全端平台，透過三大核心功能形成完整的住院心理照護閉環：

| 功能模組 | 說明 |
|---------|------|
| **醫聲相伴** | Claude AI 輔助醫病雙向溝通，支援 TTAS 急迫度智能分診、同理心語句溫暖轉譯與語音播報 |
| **任意視界** | 群眾協作視覺療癒處方，以 CLIP（影像）＋ CLAP（音訊）跨模態模型驗證影片符合度，結合積分制社群回饋 |
| **生理監測** | Nuvoton M55M1 邊緣運算執行微表情辨識，結合 EDA 膚電感測即時量化病患情緒狀態 |

---

## 核心功能

### 病患端

- 情緒選擇（開心 / 焦慮 / 難過 / 有問題）並傳送訊息給醫護人員
- 查看醫護回覆歷史與即時 ETA 通知
- 瀏覽即時戶外攝影機（Twipcam，含台灣 26 個景點）
- 觀看療癒影片頻道（森林 / 海洋 / 農村 / 降雨）
- 查看照護團隊成員（主治醫師 / 住院醫師 / 護理師）
- 向群眾志工傳達感謝，觸發積分獎勵

### 醫生端

- TTAS 分診佇列（L1–L5，依急迫度自動排序）
- 查看病患情緒、NRS 疼痛評分、BSRS 心理評分、PCS 照護複雜度
- Claude AI 建議：科別轉介、同理心回覆改寫、ETA 預估通知
- 為病患開立視覺療癒處方（指定場景類型與描述）
- WebSocket 即時接收新訊息推播

### 護理師端

- 依 TTAS 等級顯示全院訊息（🔴 L1 / 🟠 L2 / 🟡 L3 / 🟢 L4 / ⚪ L5）
- AI 建議護理回應語句（避免刺激性言語）
- 語音輸入回覆（Web Speech API）
- 依醫院篩選病患，標記已讀

### 群眾志工端

- 瀏覽開放中的視覺療癒任務（附地圖與積分）
- 上傳影片（MP4 / MOV / AVI / WebM / MKV）或 YouTube 連結
- 即時 CLIP＋CLAP 驗證回饋（顯示影像符合度與偵測到的聲音類別）
- 查看週次 / 月次排行榜及分層獎勵（Starbucks / 7-ELEVEN / Uber Eats 折扣券）
- 接收病患感謝通知，與病患建立好友關係

---

## 系統架構

```
┌─────────────────────────────────────────────────────┐
│          Frontend  (SPA: index.html)                │
│  病患端 │ 醫生端 │ 護理師端 │ 群眾志工端              │
│  WebSocket 即時通知 │ Local Storage 使用者偏好設定    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────┐
│          FastAPI Backend (main.py)                  │
│  Routers: auth │ messages │ crowd │ camera │ video  │
│  WebSocket Manager │ State Engine │ ML Pipelines    │
└──────────────────────┬──────────────────────────────┘
           ┌───────────┴───────────┐
           │                       │
┌──────────▼──────────┐  ┌────────▼────────────────┐
│ PostgreSQL 16       │  │ Transient In-Memory State│
│ 9 資料表            │  │ (ETA, 佇列, 推播快取)    │
│ (Docker Compose)    │  └─────────────────────────┘
└─────────────────────┘
```

### 分診流程

```
病患送出訊息
  → Claude AI (TTAS L1–L5 分類)
  → L1/L2 → 主治醫師佇列
  → L3    → 住院醫師佇列
  → L4/L5 → 護理師佇列
  → WebSocket 推播給對應角色
  → 醫護回覆 → WebSocket 推播給病患
```

---

## 技術堆疊

| 類別 | 技術 |
|------|------|
| **後端框架** | FastAPI 0.135.1 + Uvicorn 0.41.0 (ASGI) |
| **語言** | Python 3.11+ |
| **資料庫** | PostgreSQL 16（Docker）+ psycopg2 連線池 |
| **AI 對話** | Anthropic Claude API 0.84.0（Haiku 模型）|
| **影像語意** | sentence-transformers 5.2.3（CLIP-ViT-B-32）|
| **音訊語意** | transformers（CLAP laion/clap-htsat-unfused）|
| **影片處理** | OpenCV 4.13.0 + PyAV 16.1.0 + Pillow 12.1.1 |
| **外部 API** | Twipcam / Windy.com / Wikipedia / YouTube |
| **前端** | Vanilla HTML5 / CSS3 / ES6+ JavaScript |
| **即時通訊** | WebSocket（FastAPI 原生）|
| **套件管理** | uv |
| **容器化** | Docker Compose |

---

## 專案結構

```
ansin-medical1/
├── backend/
│   ├── main.py            # FastAPI 應用程式入口、靜態檔案服務
│   ├── models.py          # Pydantic 請求 / 回應 Schema（25+ 模型）
│   ├── database.py        # PostgreSQL CRUD + DDL（9 張資料表）
│   ├── state.py           # 記憶體暫態狀態（佇列、ETA、通知）
│   ├── ws_manager.py      # WebSocket 連線管理器（群組推播）
│   ├── fake_db.py         # 示範種子資料（14 位測試使用者）
│   ├── rag.py             # RAG 文件載入與向量檢索
│   ├── openai_client.py   # OpenAI 相容用戶端（備用 AI 推論）
│   ├── routers/
│   │   ├── auth.py        # 登入、OTP、密碼重設
│   │   ├── messages.py    # 病患訊息、分診、醫護回覆、AI 護理建議
│   │   ├── crowd.py       # 任務、上傳、排行榜、積分、兌換
│   │   ├── camera.py      # Twipcam 代理、療癒頻道、位置搜尋
│   │   └── video.py       # CLIP 驗證、AI 場景描述、Wikipedia RAG
│   ├── ml/
│   │   ├── clip.py        # CLIP 影像模型推論（視覺療癒驗證）
│   │   └── clap.py        # CLAP 音訊模型推論（音訊療癒驗證）
│   └── uploads/           # 使用者上傳影片（自動產生）
├── frontend/
│   ├── index.html         # 單頁應用（四角色畫面）
│   ├── js/
│   │   ├── app.js         # 畫面管理、WebSocket、使用者狀態、事件處理
│   │   └── api.js         # API 呼叫封裝（70+ 端點）
│   └── css/
│       └── style.css      # 設計 Token、響應式排版、無障礙樣式
├── data/
│   └── state.json         # 序列化示範狀態
├── RAG資料庫/
│   ├── 主治醫師/           # Claude AI 主治醫師參考指引
│   ├── 住院醫師/           # Claude AI 住院醫師參考指引
│   └── 護理師/             # Claude AI 護理師參考指引
├── docker-compose.yml     # PostgreSQL 16 服務設定
├── pyproject.toml         # uv 套件設定
├── uv.lock                # 依賴鎖定檔
└── .env                   # 環境變數（API 金鑰、DB URL）
```

---

## 環境需求

| 工具 | 說明 |
|------|------|
| **Python 3.11+** | 後端執行環境 |
| **[uv](https://github.com/astral-sh/uv)** | 套件管理工具 |
| **Docker** | 執行 PostgreSQL 資料庫容器（Windows 用 Docker Desktop，Linux 用 Docker Engine） |
| **Anthropic API Key** | Claude AI 功能（TTAS 分診、同理心改寫） |

> CLIP / CLAP 模型首次啟動時會自動從 Hugging Face 下載，需約 **2–3 GB** 磁碟空間，下載完成後快取於本機。

---

## 啟動說明

> **只需要一個終端機視窗。** PostgreSQL 以 `-d` 背景模式運行，FastAPI 同時提供前端靜態檔案。

### `.env` 設定

專案根目錄的 `.env` 預設內容：

```env
DATABASE_URL=postgresql://ansin:ansin_dev@localhost:5432/ansin
WINDY_API_KEY=（已填入）
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx   # 需要 Claude AI 功能時填入
```

> **注意**：若本機 port 5432 已被佔用（例如系統內建 PostgreSQL 或其他容器），請將 `docker-compose.yml` 的 ports 改為 `"5434:5432"`，並同步將 `.env` 的 `DATABASE_URL` port 改為 `5434`。

---

### Windows

```cmd
# 1. 安裝 uv（僅首次）
pip install uv

# 2. 安裝依賴（僅首次）
uv sync

# 3. 確認 Docker Desktop 已開啟，啟動資料庫
docker compose up -d db

# 4. 啟動伺服器
uv run python -m uvicorn backend.main:app --reload --port 8050
```

```
http://localhost:8050
```

```cmd
# 關閉：Ctrl+C 停止伺服器，然後
docker compose down
```

---

### Linux / macOS

```bash
# 1. 安裝 uv（僅首次）
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

# 2. 安裝依賴（僅首次）
uv sync

# 3. 啟動資料庫
docker compose up -d db

# 4. 啟動伺服器
uv run python -m uvicorn backend.main:app --reload --port 8050
```

```
http://localhost:8050
```

```bash
# 關閉：Ctrl+C 停止伺服器，然後
docker compose down
```

> 首次啟動會自動建立資料表並載入示範種子資料，CLIP / CLAP 模型在背景預熱（約 30–60 秒），不影響其他功能使用。

---

### 常見問題

| 問題 | 原因 | 解法 |
|------|------|------|
| `port 5432 already in use` | 本機 PostgreSQL 或其他容器佔用 | 停止本機 PostgreSQL（`sudo systemctl stop postgresql`），或將 `docker-compose.yml` port 改為 `5434:5432` 並更新 `.env` |
| `uv: command not found`（Linux）| 安裝後未重新載入環境 | `source $HOME/.local/bin/env` |
| AI 功能無法使用 | 未設定 `ANTHROPIC_API_KEY` | 在 `.env` 加入金鑰後重啟伺服器 |
| 影片驗證第一次很慢 | CLIP / CLAP 模型下載中 | 等待完成（約 2–3 GB），之後快取於本機 |
| `docker compose` 找不到 | 舊版 Docker | 改用 `docker-compose up -d db` |

---

## 示範帳號

| 角色 | 帳號 | 密碼 | 病床 |
|------|------|------|------|
| 病患 | patient_503B | 123456 | 503-B |
| 主治醫師 | doctor_004 | 123456 | — |
| 住院醫師 | doctor_001 | 123456 | — |
| 護理師 | nurse_001 | 123456 | — |
| 群眾志工 | crowd_001 | 123456 | — |

> 示範模式下任意密碼均可登入，所有功能皆可完整體驗。

---

## API 文件

啟動伺服器後，可於瀏覽器開啟由 FastAPI 自動產生的互動式 API 文件：

```
http://localhost:8050/docs      # Swagger UI
http://localhost:8050/redoc     # ReDoc
```

### 主要端點一覽

| 模組 | 端點 | 說明 |
|------|------|------|
| 認證 | `POST /api/login` | 使用者登入 |
| 認證 | `POST /api/auth/register` | 帳號註冊 |
| 訊息 | `POST /api/messages` | 病患送出訊息（含情緒＋分診） |
| 訊息 | `POST /api/triage` | Claude AI TTAS 分類 |
| 訊息 | `POST /api/doctor/reply` | 醫生回覆（觸發 WebSocket 推播） |
| 訊息 | `POST /api/nurse/ai-suggest` | AI 護理建議語句 |
| 群眾 | `POST /api/crowd/upload` | 上傳影片（CLIP＋CLAP 驗證）|
| 群眾 | `POST /api/crowd/submit-youtube` | 提交 YouTube 連結 |
| 群眾 | `GET /api/leaderboard/{period}` | 排行榜（weekly / monthly） |
| 攝影機 | `GET /api/twipcam/nearby` | 即時台灣攝影機 |
| 攝影機 | `GET /api/therapeutic-channels` | 療癒影片頻道清單 |
| 影片 | `POST /api/video/ai-describe` | Claude＋Wikipedia RAG 場景描述 |
| WebSocket | `WS /ws/{user_id}` | 即時雙向通訊 |

---

## ML 模型說明

### CLIP（視覺療癒驗證）

使用 `clip-ViT-B-32`（影像）與 `clip-ViT-B-32-multilingual-v1`（多語言文字）：

1. 從上傳影片均勻抽取 20 幀，過濾模糊幀（Laplacian variance）
2. 選取最清晰 10 幀進行影像嵌入
3. 計算影像向量與療癒描述文字向量的餘弦相似度
4. 取前 3 高分幀的平均值作為最終分數（0–100%）

### CLAP（音訊療癒驗證）

使用 `laion/clap-htsat-unfused`（~615 MB）：

1. 以 PyAV 從影片提取 48kHz 單聲道音訊
2. 將中文關鍵字映射為英文標籤（例如「海浪」→ `ocean waves crashing`）
3. 對 11 種自然音類別進行相似度評分（🌊 海浪 / 🐦 鳥鳴 / 💧 溪流 / 🌧️ 降雨 / 🌬️ 風聲等）
4. 回傳符合度百分比與偵測到的聲音類別清單

### 積分計算

| 符合度 | 積分比例 |
|--------|---------|
| ≥ 90% | 100%（例：350 pt） |
| 70–89% | 按比例（例：280 pt） |
| < 70% | 提示重新錄製 |

---

## 主要依賴套件

| 套件 | 版本 | 用途 |
|------|------|------|
| FastAPI | 0.135.1 | RESTful API 框架 |
| Uvicorn | 0.41.0 | ASGI 伺服器 |
| Anthropic SDK | 0.84.0 | Claude AI（TTAS 分診、同理心改寫）|
| sentence-transformers | 5.2.3 | CLIP 語意影像模型 |
| transformers | latest | CLAP 音訊語意模型 |
| OpenCV | 4.13.0 | 影片影格提取、模糊度檢測 |
| Pillow | 12.1.1 | 影像格式轉換 |
| PyAV | 16.1.0 | 影片音訊解碼（FFmpeg 封裝）|
| psycopg2 | latest | PostgreSQL 連線驅動 |

---

## 無障礙設計

- **三段字體大小**：小（22px）/ 中（26px）/ 大（30px），適合高齡或視力不佳使用者
- **高對比色彩**：符合 WCAG AA+ 標準
- **色盲安全設計**：以符號（🔴🟠🟡🟢⚪）搭配文字標示等級，不依賴色彩辨別
- **語音輸入**：護理師 / 醫師可使用瀏覽器 Web Speech API 語音回覆
- **情緒 Emoji 標記**：開心 😊 / 焦慮 😰 / 難過 😢 / 有問題 🤔

---

## 參考文獻

- Ulrich, R. S. (1984). View through a window may influence recovery from surgery. *Science*, 224(4647), 420–421.
- Engel, G. L. (1977). The need for a new medical model: A challenge for biomedicine. *Science*, 196(4286), 129–136.
- World Health Organization. (2022). *World mental health report: Transforming mental health for all*.
- Radford, A., et al. (2021). Learning transferable visual models from natural language supervision. *ICML*.
- Wu, Y., et al. (2023). Large-scale contrastive language-audio pretraining with feature fusion and keyword-to-caption augmentation. *ICASSP*.
