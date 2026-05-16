"""
backend/ml/clap.py — CLAP 音訊模型載入、音訊提取、推論
Bug 1 修復：_extract_audio_av 回傳 tuple，必須拆包
Bug 2 修復：部分載入失敗時清除所有狀態
Bug 3 修復：用 threading.Lock 取代 boolean flag
"""
import threading

_clap_model = None
_clap_processor = None
_clap_lock = threading.Lock()

# ── 中文聲音關鍵字 → 英文 CLAP 查詢 ──────────────────────
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

_SOUND_ACTION_MAP: dict = {
    "🏠 室內環境音": "前往戶外自然環境拍攝",
    "🚗 交通噪音":   "遠離道路，尋找較安靜的自然場景",
    "👥 人群聲":     "選擇人少的時段或偏遠地點拍攝",
    "💨 收音風噪":   "調整拍攝方向以減少風噪，或使用遮風罩",
    "🎵 音樂聲":     "關閉背景音樂，讓自然聲音更突出",
}


def _load_clap_model() -> bool:
    global _clap_model, _clap_processor
    with _clap_lock:
        if _clap_model is not None:
            return True
        try:
            from transformers import ClapModel, ClapProcessor
            print("⏳ 載入 CLAP 音訊模型（laion/clap-htsat-unfused，~615MB）…")
            model     = ClapModel.from_pretrained("laion/clap-htsat-unfused")
            processor = ClapProcessor.from_pretrained("laion/clap-htsat-unfused")
            model.eval()
            # 全部成功後才賦值，避免狀態不一致
            _clap_model     = model
            _clap_processor = processor
            print("✅ CLAP 音訊模型就緒")
            return True
        except Exception as e:
            print(f"⚠️  CLAP 模型載入失敗：{e}")
            # Bug 2 fix：確保所有狀態歸零
            _clap_model     = None
            _clap_processor = None
            return False


def is_ready() -> bool:
    return _clap_model is not None


def is_loading() -> bool:
    return _clap_lock.locked()


def _extract_audio_av(video_path: str):
    """
    使用 PyAV 從影片提取音訊，輸出 48kHz mono float32 numpy array。
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
                        chunks.append(rf.to_ndarray())
        for rf in resampler.resample(None):
            chunks.append(rf.to_ndarray())
        if not chunks:
            return None, None
        audio = np.concatenate(chunks, axis=1).squeeze(0).astype(np.float32)
        return audio, 48000
    except Exception as e:
        print(f"Audio extraction error: {e}")
        return None, None


def detect_audio_keywords(description: str) -> list:
    matched = []
    for kw, (en_query, zh_label) in _AUDIO_KEYWORD_MAP.items():
        if kw in description:
            if en_query and (en_query, zh_label) not in matched:
                matched.append((en_query, zh_label))
    return matched


def run_clap_analysis(audio_np, audio_keywords: list) -> dict:
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

        audio_emb = F.normalize(audio_emb, dim=-1)
        text_emb  = F.normalize(text_emb,  dim=-1)
        sims = (audio_emb @ text_emb.T).squeeze(0).cpu().numpy()

        n_exp = len(expected_queries)
        exp_sims = sims[:n_exp]
        raw_audio_score = float(exp_sims.mean()) if n_exp > 0 else 0.0

        score_pct = int(min(100, max(0, (raw_audio_score - 0.10) / (0.30 - 0.10) * 100)))

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


def run_audio_inference(video_path: str, audio_keywords: list):
    """Bug 1 fix：正確拆包 _extract_audio_av 回傳的 tuple。"""
    # Bug 1 fix: 拆包 tuple (array, sample_rate)
    audio_np, sr = _extract_audio_av(video_path)
    if audio_np is None:
        return None
    return run_clap_analysis(audio_np, audio_keywords)
