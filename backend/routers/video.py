"""backend/routers/video.py — 影片 AI 分析、Wikipedia RAG、ai-describe"""
import asyncio
import os

import httpx
from fastapi import APIRouter, HTTPException

from backend import database as db
from backend.ml import clip, clap
from backend.models import VideoDescribeRequest

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")

# ── Wikipedia RAG 快取 ──────────────────────────────────────
_wiki_cache: dict = {}


async def _fetch_wikipedia_summary(location_name: str) -> str:
    """
    用逐步縮短策略搜尋中文維基百科，回傳摘要（最多 300 字）。
    搜尋順序：完整名稱 → 移除最後一個詞 → … → 放棄回傳 ""
    結果快取避免重複請求。
    """
    import re as _re

    def _candidates(name: str):
        name = _re.sub(r'(攝影機|鏡頭|即時|直播|監視|Camera|cam)\S*$', '', name, flags=_re.IGNORECASE).strip()
        yield name
        for _ in range(3):
            shorter = _re.sub(r'[一-鿿\w]{2,4}$', '', name).strip()
            if not shorter or shorter == name:
                break
            name = shorter
            yield name

    async with httpx.AsyncClient(timeout=5.0) as client:
        for query in _candidates(location_name):
            if not query:
                continue
            if query in _wiki_cache:
                return _wiki_cache[query]
            try:
                search_resp = await client.get(
                    "https://zh.wikipedia.org/w/api.php",
                    params={"action": "query", "list": "search", "srsearch": query,
                            "format": "json", "utf8": 1, "srlimit": 1}
                )
                results = search_resp.json().get("query", {}).get("search", [])
                if not results:
                    _wiki_cache[query] = ""
                    continue
                title = results[0]["title"]
                summary_resp = await client.get(
                    f"https://zh.wikipedia.org/api/rest_v1/page/summary/{title}"
                )
                if summary_resp.status_code != 200:
                    _wiki_cache[query] = ""
                    continue
                extract = summary_resp.json().get("extract", "")
                summary = extract[:300].strip()
                _wiki_cache[query] = summary
                if summary:
                    print(f"[WIKI RAG] '{location_name}' → '{title}' ({len(summary)}字)")
                    return summary
            except Exception as e:
                print(f"[WIKI RAG] 查詢失敗 '{query}': {e}")
                continue

    _wiki_cache[location_name] = ""
    return ""


@router.post("/api/video/ai-describe")
async def video_ai_describe(req: VideoDescribeRequest):
    """用 Claude Haiku + Wikipedia RAG 介紹景點或分析影像畫面"""
    try:
        from backend.openai_client import get_openai_client
        client = get_openai_client()

        wiki_summary = await _fetch_wikipedia_summary(req.location_name) if req.location_name else ""
        wiki_block = f"\n\n【維基百科資料】\n{wiki_summary}" if wiki_summary else ""

        if req.image_base64:
            prompt = f"""你是一位溫暖的旅遊導覽員，正在為一位住院的病患介紹眼前的影像。
地點名稱：{req.location_name or "未知地點"}{wiki_block}

請根據上方資料與圖片中的實際畫面，用繁體中文寫一段生動、療癒的景點介紹（80-120字）。
要求：
1. 結合維基百科的背景知識與畫面中的真實景色
2. 語氣溫暖，讓病患感到身臨其境
3. 結尾加一句鼓勵病患的話

只輸出介紹正文，不要加前綴說明。"""
            img_data = req.image_base64
            if "," in img_data:
                img_data = img_data.split(",", 1)[1]
            message = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=256,
                messages=[{"role": "user", "content": [
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/jpeg;base64,{img_data}"
                    }},
                    {"type": "text", "text": prompt}
                ]}]
            )
        else:
            prompt = f"""你是一位溫暖的旅遊導覽員，正在為一位住院的病患介紹一個景點。
景點名稱：{req.location_name or "美麗的地方"}
補充資訊：{req.context or ""}{wiki_block}

請用繁體中文寫一段生動、療癒的景點介紹（80-120字）。
要求：
1. 優先根據維基百科資料介紹這個地方的特色與歷史
2. 語氣溫暖，讓病患感到身臨其境、放鬆心情
3. 結尾加一句鼓勵病患的話

只輸出介紹正文，不要加前綴說明。"""
            message = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}]
            )

        return {
            "success": True,
            "description": message.choices[0].message.content.strip(),
            "wiki_found": bool(wiki_summary),
        }
    except Exception as e:
        print(f"[AI-DESCRIBE ERROR] {type(e).__name__}: {e}")
        loc = req.location_name or "這個地方"
        return {
            "success": True,
            "description": f"您正在觀看{loc}的即時影像。這裡風景優美，空氣清新，希望這片美景能讓您心情愉快、早日康復！",
            "fallback": True,
        }


@router.get("/api/video/model-status")
def video_model_status():
    """回傳 CLIP / CLAP 模型是否就緒"""
    return {
        "clip_ready":   clip.is_ready(),
        "clip_loading": clip.is_loading(),
        "clap_ready":   clap.is_ready(),
        "clap_loading": clap.is_loading(),
        # legacy field kept for front-end compatibility
        "ready":        clip.is_ready(),
        "loading":      clip.is_loading(),
    }


def _generate_dynamic_suggestions(
    description: str,
    visual_score: int,
    audio_result: dict | None,
) -> list:
    """根據 AI 分析結果生成針對性建議。"""
    suggestions = []

    if audio_result and audio_result.get("score_pct", -1) >= 0:
        a_score = audio_result["score_pct"]
        expected  = audio_result.get("expected_labels", [])
        detected  = audio_result.get("detected_sounds", [])
        top_detected = detected[0]["label"] if detected else "未知聲音"
        top_expected = expected[0] if expected else "目標聲音"

        if a_score < 90:
            action = clap._SOUND_ACTION_MAP.get(top_detected, "調整拍攝環境以凸顯目標聲音")
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


@router.get("/api/video/analyze/{task_id}")
async def analyze_video_content(task_id: str):
    """
    CLIP + CLAP 影片內容與病患描述相似度分析。
    視覺：取樣 10 幀 → CLIP 餘弦相似度 top-3 均值 → 0~100 分
    音訊：CLAP 音訊 vs 中文關鍵字（有關鍵字時計入分數；無關鍵字時純偵測）
    綜合分數：有音訊時 0.6 * visual + 0.4 * audio；否則純視覺。
    """
    try:
        task = db.get_task(task_id)
    except Exception:
        from backend import fake_db as fdb
        task = next((t for t in fdb.CROWD_TASKS if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")

    video_url = task.get("video_url", "")
    if not video_url:
        raise HTTPException(status_code=400, detail="影片尚未上傳")

    description = task.get("description", "").strip()
    if not description:
        return {"score_pct": 50, "label": "無描述可比對", "level": "warn", "ready": False}

    # ── 判斷影片來源：本地上傳 or YouTube ──────────────────
    yt_temp_path: str | None = None
    if "youtube-nocookie.com/embed/" in video_url:
        vid = video_url.split("/embed/")[-1].split("?")[0]
        temp_base = os.path.join(UPLOAD_DIR, f"yt_{vid}")
        existing = next(
            (p for ext in (".mp4", ".webm", ".mkv")
             if os.path.exists(p := temp_base + ext)),
            None
        )
        if existing:
            video_path = existing
            yt_temp_path = existing
        else:
            try:
                import yt_dlp  # type: ignore
            except ImportError:
                return {"score_pct": -1,
                        "label": "yt-dlp 未安裝（請執行 uv add yt-dlp）",
                        "level": "bad", "ready": False}
            ydl_opts = {
                "format": "best[height<=480][ext=mp4]/best[height<=480]/best[ext=mp4]/best",
                "outtmpl": temp_base + ".%(ext)s",
                "quiet": True,
                "no_warnings": True,
            }
            try:
                def _download():
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f"https://www.youtube.com/watch?v={vid}"])
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _download)
            except Exception as e:
                return {"score_pct": -1,
                        "label": f"YouTube 影片下載失敗：{e}",
                        "level": "bad", "ready": False}
            downloaded = next(
                (p for ext in (".mp4", ".webm", ".mkv")
                 if os.path.exists(p := temp_base + ext)),
                None
            )
            if not downloaded:
                return {"score_pct": -1, "label": "YouTube 影片下載後找不到檔案", "level": "bad", "ready": False}
            video_path = downloaded
            yt_temp_path = downloaded
    else:
        video_path = os.path.join(UPLOAD_DIR, os.path.basename(video_url))
        if not os.path.exists(video_path):
            raise HTTPException(status_code=404, detail="影片檔案不存在")

    # ── 等待 CLIP 模型就緒（最多 60 秒）──────────────────────
    if not clip.is_ready():
        for _ in range(60):
            await asyncio.sleep(1)
            if clip.is_ready():
                break
        if not clip.is_ready():
            if clip.is_loading():
                return {"score_pct": -1, "label": "模型載入中，請稍後重試", "level": "warn", "ready": False}
            loop = asyncio.get_event_loop()
            ok = await loop.run_in_executor(None, clip._load_clip_models)
            if not ok:
                return {
                    "score_pct": -1,
                    "label": "模型未安裝（請執行 uv add sentence-transformers opencv-python）",
                    "level": "bad",
                    "ready": False,
                }

    try:
        import numpy as np

        # ── 1. 視覺 CLIP 推論 ──────────────────────────────────
        loop = asyncio.get_event_loop()
        vis_result = await loop.run_in_executor(
            None, clip.run_visual_inference, video_path, description
        )

        if vis_result is None:
            return {"score_pct": 0, "label": "無法取樣影片幀", "level": "bad", "ready": True}

        raw_visual, n_frames = vis_result
        visual_pct = int(min(100, max(0, (raw_visual - 0.12) / (0.32 - 0.12) * 100)))

        # ── 2. 音訊 CLAP 分析 ──────────────────────────────────
        audio_keywords = clap.detect_audio_keywords(description)
        has_audio = bool(audio_keywords)
        audio_result: dict | None = None

        if not clap.is_ready():
            wait_secs = 90 if has_audio else 15
            for _ in range(wait_secs):
                await asyncio.sleep(1)
                if clap.is_ready():
                    break

        if clap.is_ready():
            audio_result = await loop.run_in_executor(
                None, clap.run_audio_inference, video_path, audio_keywords
            )

        # ── 3. 計算綜合分數 ────────────────────────────────────
        if has_audio and audio_result and audio_result.get("score_pct", -1) >= 0:
            audio_pct = audio_result["score_pct"]
            score_pct = int(0.6 * visual_pct + 0.4 * audio_pct)
        else:
            audio_pct = None
            score_pct = visual_pct

        # ── 4. 標籤 ────────────────────────────────────────────
        if score_pct >= 70:
            label, level = "高度符合", "good"
        elif score_pct >= 40:
            label, level = "部分符合", "warn"
        else:
            label, level = "內容偏離，建議重拍", "bad"

        # ── 5. 建議 ────────────────────────────────────────────
        suggestions = _generate_dynamic_suggestions(description, visual_pct, audio_result)

        resp: dict = {
            "score_pct":          score_pct,
            "visual_score_pct":   visual_pct,
            "raw_score":          round(raw_visual, 4),
            "label":              label,
            "level":              level,
            "description":        description,
            "frames_sampled":     n_frames,
            "has_audio_analysis": has_audio and audio_result is not None,
            "detect_only":        (not has_audio) and audio_result is not None,
            "ready":              True,
        }

        if audio_result is not None:
            if has_audio:
                resp["audio_score_pct"] = audio_result.get("score_pct", -1)
                resp["audio_label"]     = audio_result.get("label", "")
                resp["audio_level"]     = audio_result.get("level", "warn")
            else:
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
    finally:
        if yt_temp_path and os.path.exists(yt_temp_path):
            try:
                os.remove(yt_temp_path)
            except OSError:
                pass
