# uv run uvicorn backend.main:app --reload --port 8001
# uv run uvicorn backend.main:app --reload --port 8001 --host 0.0.0.0

"""backend/main.py — FastAPI 進入點（精簡版）"""
import os
import threading

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv(override=True)

from backend import database, state, rag
from backend.ws_manager import ws_mgr
from backend.ml import clip, clap
from backend.routers import auth, messages, crowd, camera, video

app = FastAPI(title="智慧醫療陪伴系統 API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 啟動事件 ────────────────────────────────────────────
@app.on_event("startup")
def _startup():
    database.init_db()
    state.seed_from_fake_db()
    # 背景預熱 CLIP / CLAP 模型，避免第一次請求等待過久
    threading.Thread(target=clip._load_clip_models, daemon=True).start()
    threading.Thread(target=clap._load_clap_model,  daemon=True).start()
    # 建立 pgvector 資料表並索引 RAG 文件（背景執行，不阻塞啟動）
    def _init_rag():
        rag.init_rag_table()
        rag.index_all_documents()
    threading.Thread(target=_init_rag, daemon=True).start()

# ── WebSocket ──────────────────────────────────────────
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    role: str = "",
    doctor_type: str = "",
):
    await ws_mgr.connect(user_id, websocket, role=role, doctor_type=doctor_type)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_mgr.disconnect(user_id, websocket)

# ── 靜態檔案 ────────────────────────────────────────────
_BASE = os.path.dirname(__file__)
FRONTEND_DIR = os.path.join(_BASE, "..", "frontend")
UPLOAD_DIR   = os.path.join(_BASE, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static",  StaticFiles(directory=FRONTEND_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR),   name="uploads")

@app.get("/", response_class=FileResponse)
def serve_index():
    return os.path.join(FRONTEND_DIR, "index.html")

# ── Routers ─────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(messages.router)
app.include_router(crowd.router)
app.include_router(camera.router)
app.include_router(video.router)
