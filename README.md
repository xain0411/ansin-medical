# 智慧醫療陪伴系統
### AnSin Medical Companion System

> 以生物心理社會模型為設計基礎，整合 AI 輔助醫病溝通、群眾協作視覺療癒處方與邊緣運算生理情緒監測，為住院病患提供全方位的心理照護支持。

---

## 系統簡介

「智慧醫療陪伴系統」針對住院病患長期面臨的醫病溝通不足、心理療癒資源匱乏與情緒狀態難以量化等問題，設計病患、醫生、群眾志工三端協作平台，透過以下三大核心功能形成完整的住院心理照護閉環：

- **醫聲相伴**：Claude AI 輔助醫病雙向溝通，支援同理心語句溫暖轉譯與語音播報
- **任意視界**：群眾協作視覺療癒處方，以 CLIP 跨模態模型驗證影片內容符合度
- **生理監測**：Nuvoton M55M1 邊緣運算執行微表情辨識，結合 EDA 膚電感測即時量化情緒狀態

---

## 技術架構

```
ansin-medical/
├── backend/
│   ├── main.py          # FastAPI 主程式（RESTful API 路由）
│   └── data_manager.py  # 資料管理模組
├── frontend/
│   ├── index.html       # 單頁應用主頁面
│   ├── css/
│   │   └── style.css    # 響應式介面樣式
│   └── js/
│       ├── api.js       # API 呼叫封裝層
│       └── app.js       # 前端邏輯與互動
├── pyproject.toml       # uv 套件設定
└── README.md
```

---

## 環境需求

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) 套件管理工具
- Anthropic API Key（Claude AI 功能）
- Google Maps API Key（地圖與景點功能）

---

## 快速啟動

### 1. 安裝 uv

```bash
# macOS / Linux / Git Bash
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
pip install uv
```

### 2. 安裝依賴

```bash
cd ansin-medical
uv sync
```

### 3. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入以下金鑰：

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 4. 啟動伺服器

```bash
uv run uvicorn backend.main:app --reload --port 8000
```

### 5. 開啟瀏覽器

```
http://localhost:8000
```

---

## 示範帳號

| 角色 | 帳號 | 密碼 |
|------|------|------|
| 病患 | patient_503B | 123456 |
| 醫生 | doctor_001 | 123456 |
| 群眾志工 | crowd_001 | 123456 |

---

## API 文件

啟動後可於瀏覽器開啟 Swagger UI 自動生成的互動式 API 文件：

```
http://localhost:8000/docs
```

---

## 主要依賴套件

| 套件 | 版本 | 用途 |
|------|------|------|
| FastAPI | 0.135.1 | RESTful API 框架 |
| Uvicorn | 0.41.0 | ASGI 伺服器 |
| Anthropic SDK | 0.84.0 | Claude AI 串接 |
| sentence-transformers | 5.2.3 | CLIP 語意模型 |
| OpenCV | 4.13.0 | 影片影像處理 |
| Pillow | 12.1.1 | 影像格式轉換 |
| PyAV | 16.1.0 | 影片音訊解碼 |

---

## 開源平台

- **GitHub**：程式碼託管與版本控制
- **Hugging Face**：`clip-ViT-B-32`、`clip-ViT-B-32-multilingual-v1` 模型來源

---

## 參考文獻

- Ulrich, R. S. (1984). View through a window may influence recovery from surgery. *Science*, 224(4647), 420–421.
- Engel, G. L. (1977). The need for a new medical model: A challenge for biomedicine. *Science*, 196(4286), 129–136.
- World Health Organization. (2022). *World mental health report: Transforming mental health for all*.
