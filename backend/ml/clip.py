"""
backend/ml/clip.py — CLIP 圖像模型載入、幀取樣、推論
Bug 2 修復：部分載入失敗時清除所有狀態
Bug 3 修復：用 threading.Lock 取代 boolean flag
"""
import threading

_clip_img_model = None
_clip_txt_model = None
_clip_util = None
_clip_lock = threading.Lock()


def _load_clip_models() -> bool:
    """載入 CLIP 圖像模型 + 多語言文字模型（首次呼叫下載，之後快取）"""
    global _clip_img_model, _clip_txt_model, _clip_util
    with _clip_lock:
        if _clip_img_model is not None:
            return True
        try:
            from sentence_transformers import SentenceTransformer, util as st_util
            print("⏳ 載入 CLIP 圖像模型（clip-ViT-B-32）…")
            img_model = SentenceTransformer("clip-ViT-B-32")
            print("⏳ 載入多語言文字模型（clip-ViT-B-32-multilingual-v1）…")
            txt_model = SentenceTransformer(
                "sentence-transformers/clip-ViT-B-32-multilingual-v1"
            )
            # 全部載入成功後才賦值，避免狀態不一致
            _clip_img_model = img_model
            _clip_txt_model = txt_model
            _clip_util = st_util
            print("✅ CLIP 模型就緒")
            return True
        except Exception as e:
            print(f"⚠️  CLIP 模型載入失敗：{e}")
            # Bug 2 fix：確保所有狀態歸零
            _clip_img_model = None
            _clip_txt_model = None
            _clip_util = None
            return False


def is_ready() -> bool:
    return _clip_img_model is not None


def is_loading() -> bool:
    return _clip_lock.locked()


def _is_sharp(frame_bgr, threshold: float = 40.0) -> bool:
    import cv2
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return cv2.Laplacian(gray, cv2.CV_64F).var() >= threshold


def _sample_frames_pil(video_path: str, n: int = 20):
    """
    從影片取樣最多 n 幀，回傳 PIL Image 列表。
    策略：均勻取樣 n*3 個候選幀，過濾模糊幀後取前 n 清晰幀。
    """
    try:
        import cv2
        from PIL import Image
        import numpy as np

        cap = cv2.VideoCapture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps   = cap.get(cv2.CAP_PROP_FPS) or 30
        candidates = []

        if total > 5:
            start   = max(0, int(total * 0.05))
            end     = min(total - 1, int(total * 0.95))
            indices = np.linspace(start, end, min(n * 3, total), dtype=int)
            for idx in indices:
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                ret, frame = cap.read()
                if ret:
                    candidates.append(frame)
        else:
            sample_every = max(1, int(fps / 3))
            fc = 0
            while len(candidates) < n * 3:
                ret, frame = cap.read()
                if not ret:
                    break
                if fc % sample_every == 0:
                    candidates.append(frame)
                fc += 1

        cap.release()

        sharp = [f for f in candidates if _is_sharp(f)]
        selected = sharp[:n] if len(sharp) >= n // 2 else candidates[:n]
        return [Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)) for f in selected]
    except Exception as e:
        print(f"Frame sampling error: {e}")
        return []


def run_visual_inference(video_path: str, description: str):
    """回傳 (raw_score: float, n_frames: int) 或 None。"""
    import numpy as np
    frames = _sample_frames_pil(video_path, n=10)
    if not frames:
        return None
    img_embs = _clip_img_model.encode(frames, batch_size=10, convert_to_tensor=True)
    txt_emb  = _clip_txt_model.encode(description, convert_to_tensor=True)
    scores   = _clip_util.cos_sim(txt_emb, img_embs)[0].cpu().numpy()
    k = min(3, len(scores))
    return float(np.sort(scores)[::-1][:k].mean()), len(frames)
