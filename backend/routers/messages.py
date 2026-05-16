"""
backend/routers/messages.py
病患訊息、triage、護士/醫生 reply、WebSocket
"""
import asyncio
import json as _json
import os
import re

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from backend.openai_client import get_openai_client, is_openai_configured
from datetime import datetime as _dt
from typing import Optional

from backend import database as db
from backend import state
from backend.ws_manager import ws_mgr
from backend.models import (
    PatientMessage, TriageRequest, NurseSeenRequest,
    DoctorReply, EtaNoticeRequest, StarToggleRequest,
    PrescriptionRequest, PrescriptionReviewRequest,
    AIReplyRequest, EmotionAlertIn,
    LLMRecommendDeptRequest, LLMRewriteRequest, EmpathyRewriteRequest,
)

router = APIRouter()

from backend import rag as _rag

TTAS_SYSTEM_PROMPT = """你是一個專業的「住院病房醫療需求智慧分流 AI」，採用多層次評估框架，精準判斷病患訊息的緊急程度並路由給對的醫護人員。

# 評估框架（依序執行）

## 前置過濾：自傷/自殺意念（最高優先）
若偵測到以下任一情況，無論其他指標如何，立即設定 self_harm_detected=true，route="attending"：
- 「不想活」「想消失」「結束一切」「活著沒意思」「想死」「自殘」「割腕」等語意

## 第一層：TTAS 判斷（台灣急診檢傷急迫度分級量表，應用於住院情境）
- L1 復甦急救：心跳停止、無呼吸、大量出血、嚴重意識喪失 → route="attending"，不追問
- L2 危急：意識改變、劇烈胸痛、呼吸困難、急性過敏反應 → route="attending"，不追問
- L3 緊急：中度不適、新發生嘔吐/暈眩、跌倒風險、管路異常、骨折/術後部位疼痛加劇 → route="resident"，不追問
- L4 次緊急：輕微不適、慢性問題加重、需換藥等一般處置 → 進入第二層評估
- L5 非緊急：飲食詢問、環境調整、情緒支持、正向回饋 → 進入第二層評估

## 第二層：NRS + BSRS 評估（僅 L4/L5 執行）
NRS（0-10）／BSRS（0-20）路由規則：
- NRS≥7 且 BSRS≥10 → route="attending"
- NRS≥7 或 BSRS≥10 → route="resident"
- NRS 4-6 或 BSRS 6-9 → route="nurse"
- NRS≤3 且 BSRS≤5 → 進入第三層

## 第三層：PCS 判斷照護技術層級（僅 NRS≤3 且 BSRS≤5 時執行）
- PCS 1（醫療決策類）→ route="resident"
- PCS 2-4（護理/一般/環境類）→ route="nurse"

## 安全原則
語意模糊 → 保守升級

# 輸出格式（只輸出 JSON）
{
  "ttas_level": 4,
  "nrs_estimated": 5,
  "bsrs_estimated": 7,
  "pcs_level": 2,
  "route": "nurse",
  "category": "次緊急",
  "urgency_flags": [],
  "summary": "一句話描述病患需求（20字內）",
  "reasoning": "判斷理由（20字內）",
  "follow_up": "",
  "self_harm_detected": false
}"""


# ════════════════════════════════════════════════
# WebSocket
# ════════════════════════════════════════════════

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    # 取得 role 資訊供 push_role 使用
    try:
        u = db.get_user(user_id) or {}
    except Exception:
        import fake_db as fdb
        u = fdb.USERS.get(user_id, {})
    await ws_mgr.connect(user_id, websocket,
                         role=u.get("role", ""),
                         doctor_type=u.get("doctor_type", ""))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_mgr.disconnect(user_id, websocket)


# ════════════════════════════════════════════════
# 病患端
# ════════════════════════════════════════════════

@router.get("/api/doctors")
def get_doctors():
    try:
        users = db.get_all_users()
    except Exception:
        import fake_db as fdb
        users = fdb.USERS
    return {"doctors": [u for u in users.values() if u.get("role") == "doctor"]}


@router.get("/api/patient/care-team")
def get_patient_care_team(patient_id: str):
    try:
        patient = db.get_user(patient_id)
    except Exception:
        import fake_db as fdb
        patient = fdb.USERS.get(patient_id)
    if not patient or patient.get("role") != "patient":
        raise HTTPException(status_code=404, detail="病患不存在")
    return {
        "patient_name": patient.get("name"),
        "bed": patient.get("bed"),
        "care_team": patient.get("care_team", {}),
    }


@router.get("/api/messages/{patient_id}")
def get_patient_messages(patient_id: str):
    try:
        msgs = db.get_messages_by_patient(patient_id)
    except Exception:
        import fake_db as fdb
        msgs = [m for m in fdb.MESSAGES if m["patient_id"] == patient_id]
        msgs = sorted(msgs, key=lambda x: x["timestamp"], reverse=True)
    return {"messages": msgs}


@router.post("/api/messages")
async def send_patient_message(msg: PatientMessage):
    _n = _dt.now()
    ts = f"{_n.year}/{_n.month}/{_n.day} {_n.hour:02d}:{_n.minute:02d}"
    try:
        patient = db.get_user(msg.patient_id) or {}
    except Exception:
        import fake_db as fdb
        patient = fdb.USERS.get(msg.patient_id, {})

    care_team = patient.get("care_team", {})
    extra = {
        "care_team": care_team,
        "sentiment": msg.sentiment,
        "sentiment_score": msg.sentiment_score,
        "ttas_category": msg.ttas_category or "常規護理",
        "ttas_summary": msg.ttas_summary or "",
        "nrs_estimated": msg.nrs_estimated,
        "bsrs_estimated": msg.bsrs_estimated,
        "pcs_level": msg.pcs_level,
        "urgency_flags": msg.urgency_flags or [],
        "self_harm_detected": msg.self_harm_detected or False,
        "ttas_reasoning": msg.ttas_reasoning or "",
        "route": msg.route or "",
        "audit_log": [{"action": "patient_sent", "at": ts}],
        "nurse_seen": False,
    }
    try:
        new_id = db.create_message(
            patient_id=msg.patient_id,
            bed=msg.bed,
            content=msg.text or f"[{msg.emotion}]",
            emotion=msg.emotion,
            ttas_level=msg.ttas_level or 3,
            timestamp=ts,
            extra=extra,
        )
    except Exception:
        # fallback to fake_db
        import fake_db as fdb
        all_ids = ([m["id"] for m in fdb.MESSAGES] +
                   [m["id"] for m in fdb.NURSE_QUEUE] +
                   [m["id"] for m in fdb.RESIDENT_QUEUE] +
                   [m["id"] for m in fdb.ATTENDING_QUEUE])
        new_id = max(all_ids, default=0) + 1
        new_msg_fdb = {"id": new_id, "patient_id": msg.patient_id, "bed": msg.bed,
                       "emotion": msg.emotion, "text": msg.text or f"[{msg.emotion}]",
                       "care_team": care_team, "timestamp": ts, "replied": False,
                       "reply_text": None, "ttas_level": msg.ttas_level or 3,
                       **extra}
        fdb.MESSAGES.append(new_msg_fdb)

    new_msg = {"id": new_id, "patient_id": msg.patient_id, "bed": msg.bed,
               "emotion": msg.emotion, "text": msg.text or f"[{msg.emotion}]",
               "care_team": care_team, "timestamp": ts, "replied": False,
               "reply_text": None, "ttas_level": msg.ttas_level or 3, **extra}

    # 更新 PENDING_PATIENTS
    msg_text = msg.text or f"[{msg.emotion}]"
    ttas_lvl = msg.ttas_level or 3
    pending = next((p for p in state.PENDING_PATIENTS if p["bed"] == msg.bed), None)
    if pending:
        pending["unread"] += 1
        pending["latest_emotion"] = msg.emotion
        pending["timestamp"] = ts
        pending["latest_message"] = msg_text
        pending["latest_ttas_level"] = ttas_lvl
    else:
        state.PENDING_PATIENTS.append({
            "bed": msg.bed,
            "patient_name": patient.get("name", "病患"),
            "latest_emotion": msg.emotion,
            "latest_message": msg_text,
            "unread": 1,
            "hospital": patient.get("hospital", ""),
            "timestamp": ts,
            "latest_ttas_level": ttas_lvl,
            "care_team": care_team,
        })

    asyncio.create_task(_background_route(new_msg))
    return {"success": True, "message": new_msg}


async def _background_route(msg: dict):
    await asyncio.sleep(0)
    route = msg.get("route", "")
    if route not in ("nurse", "resident", "attending"):
        lvl = msg.get("ttas_level", 3)
        route = "attending" if lvl <= 2 else "resident" if lvl == 3 else "nurse"

    msg["route"] = route
    pending = next((p for p in state.PENDING_PATIENTS if p["bed"] == msg.get("bed")), None)
    if pending:
        pending["latest_route"] = route

    # 更新 DB 的 extra.route
    try:
        db.update_message_extra(msg["id"], route=route)
    except Exception:
        pass

    await ws_mgr.push_role(route, {"event": "new_message", "bed": msg.get("bed")})

    ts = msg.get("timestamp", "")
    patient_id = msg.get("patient_id", "")
    bed = msg.get("bed", "")

    if route == "nurse":
        try:
            db.add_to_queue("nurse", msg["id"], patient_id, bed, ts)
        except Exception:
            import fake_db as fdb
            if not any(n["id"] == msg["id"] for n in fdb.NURSE_QUEUE):
                fdb.NURSE_QUEUE.append(dict(msg))
        # ETA 通知
        nurse_name = (pending or {}).get("care_team", {}).get("nurse", {}).get("name", "護理師") if pending else "護理師"
        notice_id = f"eta_{bed}_{int(_dt.now().timestamp())}"
        state.ETA_NOTICES[:] = [n for n in state.ETA_NOTICES if n["patient_id"] != patient_id]
        state.ETA_NOTICES.append({
            "id": notice_id, "patient_id": patient_id, "bed": bed,
            "eta": "", "doctor_name": nurse_name,
            "timestamp": _dt.now().strftime("%Y/%m/%d %H:%M"), "read": False,
        })
        await ws_mgr.push(patient_id, {"event": "eta_notice", "doctor_name": nurse_name, "eta": ""})
    elif route == "resident":
        try:
            db.add_to_queue("resident", msg["id"], patient_id, bed, ts)
        except Exception:
            import fake_db as fdb
            if not any(n["id"] == msg["id"] for n in fdb.RESIDENT_QUEUE):
                fdb.RESIDENT_QUEUE.append(dict(msg))
    elif route == "attending":
        try:
            db.add_to_queue("attending", msg["id"], patient_id, bed, ts)
        except Exception:
            import fake_db as fdb
            if not any(n["id"] == msg["id"] for n in fdb.ATTENDING_QUEUE):
                fdb.ATTENDING_QUEUE.append(dict(msg))


# ════════════════════════════════════════════════
# TTAS 分流
# ════════════════════════════════════════════════

@router.post("/api/triage")
async def triage_message(req: TriageRequest):
    fallback_result = {
        "ttas_level": 2, "level": 2, "category": "危急",
        "summary": req.text[:30], "nrs_estimated": 0, "bsrs_estimated": 0,
        "pcs_level": 2, "route": "attending", "urgency_flags": [],
        "reasoning": "保守升級", "follow_up": "", "self_harm_detected": False,
    }
    if not is_openai_configured():
        return {"success": False, "error": "API Key 未設定", "fallback": True,
                "result": fallback_result}
    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=300,
            messages=[
                {"role": "system", "content": TTAS_SYSTEM_PROMPT},
                {"role": "user", "content": f"病患訊息：「{req.text}」"}
            ]
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"```json?\n?", "", raw).replace("```", "").strip()
        result = _json.loads(raw)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e), "fallback": True, "result": fallback_result}


# ════════════════════════════════════════════════
# 護理師端
# ════════════════════════════════════════════════

@router.get("/api/nurse/messages")
def get_nurse_messages(hospital: Optional[str] = None):
    try:
        msgs = db.get_queue("nurse")
    except Exception:
        import fake_db as fdb
        msgs = list(fdb.NURSE_QUEUE)
    if hospital:
        try:
            def _get_hosp(pid):
                u = db.get_user(pid) or {}
                return u.get("hospital", "")
        except Exception:
            import fake_db as fdb
            def _get_hosp(pid):
                return fdb.USERS.get(pid, {}).get("hospital", "")
        msgs = [m for m in msgs if _get_hosp(m.get("patient_id", "")) == hospital]
    return {"messages": sorted(msgs, key=lambda x: (x.get("ttas_level") if x.get("ttas_level") is not None else 4, x.get("timestamp") or ""))}


@router.get("/api/doctor/messages/resident")
def get_resident_messages(hospital: Optional[str] = None):
    try:
        msgs = db.get_queue("resident")
    except Exception:
        import fake_db as fdb
        msgs = list(fdb.RESIDENT_QUEUE)
    if hospital:
        try:
            def _gh(pid): return (db.get_user(pid) or {}).get("hospital", "")
        except Exception:
            import fake_db as fdb
            def _gh(pid): return fdb.USERS.get(pid, {}).get("hospital", "")
        msgs = [m for m in msgs if _gh(m.get("patient_id", "")) == hospital]
    return {"messages": sorted(msgs, key=lambda x: (x.get("ttas_level") if x.get("ttas_level") is not None else 4, x.get("timestamp") or ""))}


@router.get("/api/doctor/messages/attending")
def get_attending_messages(hospital: Optional[str] = None):
    try:
        msgs = db.get_queue("attending")
    except Exception:
        import fake_db as fdb
        msgs = list(fdb.ATTENDING_QUEUE)
    if hospital:
        try:
            def _gh2(pid): return (db.get_user(pid) or {}).get("hospital", "")
        except Exception:
            import fake_db as fdb
            def _gh2(pid): return fdb.USERS.get(pid, {}).get("hospital", "")
        msgs = [m for m in msgs if _gh2(m.get("patient_id", "")) == hospital]
    return {"messages": sorted(msgs, key=lambda x: (x.get("ttas_level") if x.get("ttas_level") is not None else 4, x.get("timestamp") or ""))}


@router.post("/api/nurse/seen")
def nurse_mark_seen(req: NurseSeenRequest):
    _n = _dt.now()
    ts = f"{_n.year}/{_n.month}/{_n.day} {_n.hour:02d}:{_n.minute:02d}"
    try:
        db.update_message_extra(req.message_id, nurse_seen=True)
    except Exception:
        import fake_db as fdb
        for nq in fdb.NURSE_QUEUE:
            if nq["id"] == req.message_id:
                nq["nurse_seen"] = True
                break
    return {"success": True}


@router.get("/api/messages/history")
def get_message_history(bed: str, limit: int = 5):
    try:
        msgs = db.get_messages_by_bed(bed)
    except Exception:
        import fake_db as fdb
        msgs = sorted([m for m in fdb.MESSAGES if m.get("bed") == bed],
                      key=lambda m: m.get("timestamp", ""))
    recent = msgs[-limit:]
    return {"messages": [
        {"text": m.get("text", m.get("content", "")),
         "reply_text": m.get("reply_text"),
         "timestamp": m.get("timestamp", ""),
         "ttas_level": m.get("ttas_level"),
         "replied": m.get("replied", False)}
        for m in recent
    ]}


@router.post("/api/nurse/ai-suggest")
async def nurse_ai_suggest(body: dict):
    msg_text      = body.get("message_text", "")
    ttas_level    = body.get("ttas_level", 3)
    ttas_category = body.get("ttas_category", "常規護理")
    ttas_summary  = body.get("ttas_summary", "")
    history       = body.get("history", [])
    if not msg_text:
        return {"success": False, "suggestion": "", "error": "訊息內容為空"}
    try:
        client = get_openai_client()
        history_ctx = ""
        if history:
            lines = []
            for h in history[-3:]:
                lines.append(f"  病患：「{h.get('text','')}」")
                if h.get("replied") and h.get("reply_text"):
                    lines.append(f"  護理師回覆：「{h.get('reply_text','')}」")
            if lines:
                history_ctx = "\n\n近期對話紀錄：\n" + "\n".join(lines)
        rag_ctx = _rag.retrieve(msg_text, "nurse")
        system_prompt = (
            f"你是護理師助理 AI，協助護理師草擬對住院病患的回覆訊息。\n\n"
            f"護理法規知識庫：\n{rag_ctx}\n\n"
            f"草稿撰寫準則：語氣溫暖親切簡短（60字以內），只回應護理師職責範圍。"
            f"只輸出回覆內容本身，不要加任何前綴。"
        )
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=200,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content":
                    f"病患訊息（TTAS Level {ttas_level}｜{ttas_category}"
                    f"{'｜' + ttas_summary if ttas_summary else ''}）：\n「{msg_text}」{history_ctx}\n\n請生成護理師回覆草稿："}
            ]
        )
        return {"success": True, "suggestion": resp.choices[0].message.content.strip()}
    except Exception as e:
        return {"success": False, "suggestion": "", "error": str(e)}


@router.post("/api/nurse/reply")
async def nurse_reply(body: dict):
    msg_id = body.get("message_id")
    reply_text = body.get("reply_text", "")
    nurse_id = body.get("nurse_id", "")
    _n = _dt.now()
    ts = f"{_n.year}/{_n.month}/{_n.day} {_n.hour:02d}:{_n.minute:02d}"
    try:
        nurse_name = (db.get_user(nurse_id) or {}).get("name", "護理師")
    except Exception:
        import fake_db as fdb
        nurse_name = fdb.USERS.get(nurse_id, {}).get("name", "護理師")

    try:
        msgs = db.get_messages_by_bed("")
        msg = next((m for m in db.get_all_messages() if m["id"] == msg_id), None)
        if not msg:
            raise HTTPException(404, "訊息不存在")
        db.update_message_reply(msg_id, reply_text, "nurse",
                                extra_update={"audit_log_nurse_reply": {"by": nurse_name, "at": ts}})
        db.mark_queue_processed(msg_id, "nurse")
        bed = msg.get("bed", "")
    except Exception:
        import fake_db as fdb
        msg = next((m for m in fdb.MESSAGES if m["id"] == msg_id), None)
        if not msg:
            raise HTTPException(404, "訊息不存在")
        msg["replied"] = True
        msg["reply_text"] = reply_text
        msg["reply_by_role"] = "nurse"
        for nq in fdb.NURSE_QUEUE:
            if nq["id"] == msg_id:
                nq["replied"] = True
                nq["reply_text"] = reply_text
                break
        bed = msg.get("bed", "")

    # 更新 PENDING_PATIENTS
    try:
        all_msgs = db.get_messages_by_bed(bed)
    except Exception:
        import fake_db as fdb
        all_msgs = [m for m in fdb.MESSAGES if m.get("bed") == bed]
    unreplied = [m for m in all_msgs if not m.get("replied")]
    if not unreplied:
        state.PENDING_PATIENTS[:] = [p for p in state.PENDING_PATIENTS if p["bed"] != bed]

    patient_id = msg.get("patient_id", "")
    asyncio.create_task(ws_mgr.push(patient_id,
        {"event": "new_reply", "role": "nurse", "nurse_name": nurse_name}))
    return {"success": True}


# ════════════════════════════════════════════════
# 醫生端
# ════════════════════════════════════════════════

@router.get("/api/doctor/pending")
def get_pending_patients(hospital: Optional[str] = None,
                         doctor_type: Optional[str] = None,
                         doctor_id: Optional[str] = None):
    pending = list(state.PENDING_PATIENTS)
    done    = list(state.DONE_PATIENTS)
    if doctor_id:
        role_key = "resident" if doctor_type == "resident" else "attending"
        def belongs(p):
            return (p.get("care_team", {}).get(role_key, {}).get("id") == doctor_id
                    and p.get("latest_route", "") == role_key)
        pending = [p for p in pending if belongs(p)]
        done    = [p for p in done    if belongs(p)]
    else:
        if doctor_type == "resident":
            pending = [p for p in pending if p.get("latest_route") == "resident"]
            done    = [p for p in done    if p.get("latest_route") == "resident"]
        elif doctor_type == "attending":
            pending = [p for p in pending if p.get("latest_route") == "attending"]
            done    = [p for p in done    if p.get("latest_route") == "attending"]
        if hospital:
            pending = [p for p in pending if p.get("hospital") == hospital]
            done    = [p for p in done    if p.get("hospital") == hospital]
    total = len(done) + len(pending)
    urgent = sum(1 for p in pending if p.get("latest_ttas_level", 3) <= 2)
    avg_hr, avg_min = (2, 15) if total < 5 else (4, 30)
    return {
        "pending": pending, "done": done,
        "stats": {"total_served": total,
                  "avg_wait_time": f"{avg_hr} 小時 {avg_min} 分",
                  "urgent_cases": urgent},
    }


@router.post("/api/doctor/pending/{bed}/star")
def toggle_patient_star(bed: str, req: StarToggleRequest):
    patient = (next((p for p in state.PENDING_PATIENTS if p["bed"] == bed), None)
               or next((p for p in state.DONE_PATIENTS if p["bed"] == bed), None))
    if not patient:
        raise HTTPException(404, "找不到該病患")
    patient["star_color"] = req.star_color
    return {"success": True, "star_color": req.star_color}


@router.get("/api/doctor/patient/{bed}")
def get_patient_by_bed(bed: str):
    try:
        msgs = db.get_messages_by_bed(bed)
    except Exception:
        import fake_db as fdb
        msgs = sorted([m for m in fdb.MESSAGES if m["bed"] == bed],
                      key=lambda x: x["timestamp"], reverse=True)
    return {"bed": bed, "messages": msgs}


_EMOTION_SCORE = {"開心": 5, "有問題": 3, "難過": 2, "焦慮": 1}


@router.get("/api/doctor/patient/{bed}/emotion-chart")
def get_emotion_chart(bed: str):
    try:
        msgs = db.get_messages_by_bed(bed)
    except Exception:
        import fake_db as fdb
        msgs = sorted([m for m in fdb.MESSAGES if m["bed"] == bed],
                      key=lambda x: x.get("timestamp", ""))
    points = [{"date": m.get("timestamp", ""), "emotion": m.get("emotion", ""),
               "score": _EMOTION_SCORE.get(m.get("emotion", ""), 3),
               "replied": m.get("replied", False),
               "text_preview": (m.get("text") or m.get("content", ""))[:25],
               "sentiment": m.get("sentiment"),
               "sentiment_score": m.get("sentiment_score")} for m in msgs]
    trend = "stable"
    if len(points) >= 4:
        h = len(points) // 2
        old_avg = sum(p["score"] for p in points[:h]) / h
        new_avg = sum(p["score"] for p in points[h:]) / (len(points) - h)
        if new_avg > old_avg + 0.5:   trend = "improving"
        elif new_avg < old_avg - 0.5: trend = "declining"
    return {"bed": bed, "points": points, "trend": trend}


_VISUAL_LABELS = {"nature": ("自然風景", "🌿"), "city": ("城市街景", "🏙️"),
                  "hometown": ("家鄉風貌", "🏡"), "familiar": ("熟悉場所", "☕")}


@router.post("/api/doctor/prescription")
def create_prescription_route(req: PrescriptionRequest):
    label, icon = _VISUAL_LABELS.get(req.visual_type, ("視覺療法", "🏥"))
    _n = _dt.now()
    ts = f"{_n.year}/{_n.month}/{_n.day} {_n.hour:02d}:{_n.minute:02d}"
    try:
        all_tasks = db.get_all_tasks()
        task_id = f"rx_{len(all_tasks)+1:03d}"
    except Exception:
        import fake_db as fdb
        task_id = f"rx_{len(fdb.CROWD_TASKS)+1:03d}"

    new_task = {
        "id": task_id, "location": req.location_hint or f"{label}（{req.bed}處方）",
        "description": req.doctor_note or f"醫生為{req.bed}號病房開立視覺處方：{label}",
        "points": 400, "bonus": True, "requested_by": f"{req.bed}號病房",
        "status": "open", "task_type": "prescription",
        "is_prescription": True, "visual_type": req.visual_type,
        "visual_icon": icon, "doctor_note": req.doctor_note,
    }
    try:
        db.create_task(task_id, "prescription",
                       new_task["description"], "open", 400, extra=new_task)
    except Exception:
        import fake_db as fdb
        fdb.CROWD_TASKS.append(new_task)
        if not hasattr(fdb, "PRESCRIPTIONS"):
            fdb.PRESCRIPTIONS = []
        fdb.PRESCRIPTIONS.append({"id": task_id, "bed": req.bed,
                                   "patient_name": req.patient_name,
                                   "visual_type": req.visual_type,
                                   "visual_label": label, "visual_icon": icon,
                                   "location_hint": req.location_hint,
                                   "doctor_note": req.doctor_note,
                                   "doctor_id": req.doctor_id,
                                   "timestamp": ts, "status": "pending",
                                   "task_id": task_id})

    try:
        patient_user = next(
            (u for u in db.get_all_users().values()
             if u.get("role") == "patient" and u.get("bed") == req.bed),
            None,
        )
        pid = patient_user["id"] if patient_user else ""
        db.create_prescription(
            patient_id=pid, doctor_id=req.doctor_id or "",
            visual_type=req.visual_type, description=req.doctor_note,
            task_id=task_id, created_at=ts,
            extra={"bed": req.bed, "patient_name": req.patient_name,
                   "visual_label": label, "visual_icon": icon,
                   "location_hint": req.location_hint, "status": "pending"},
        )
    except Exception:
        pass
    return {"success": True, "task_id": task_id, "task": new_task}


@router.get("/api/patient/{patient_id}/prescriptions")
def get_patient_prescriptions(patient_id: str):
    try:
        user = db.get_user(patient_id) or {}
        bed = user.get("bed", "")
        rxs = db.get_prescriptions_by_bed(bed)
    except Exception:
        import fake_db as fdb
        user = fdb.USERS.get(patient_id, {})
        bed = user.get("bed", "")
        rxs = [p for p in getattr(fdb, "PRESCRIPTIONS", []) if p.get("bed") == bed]
    return {"prescriptions": rxs}


@router.get("/api/doctor/prescription-reviews")
def get_prescription_reviews():
    try:
        tasks = [t for t in db.get_all_tasks()
                 if t.get("task_type") == "prescription"
                 and t.get("status") == "review"
                 and t.get("video_url")]
    except Exception:
        import fake_db as fdb
        tasks = [t for t in fdb.CROWD_TASKS
                 if t.get("task_type") == "prescription"
                 and t.get("status") == "review"
                 and t.get("video_url")]
    return {"tasks": tasks}


@router.post("/api/doctor/prescription-review")
def review_prescription_video(req: PrescriptionReviewRequest):
    try:
        task = db.get_task(req.task_id)
        if not task:
            raise HTTPException(404, "任務不存在")
        if task.get("task_type") != "prescription":
            raise HTTPException(400, "此任務非視覺處方任務")
        if req.action == "approve":
            db.update_task(req.task_id, status="adopted")
            new_status = "adopted"
        elif req.action == "reject":
            db.update_task(req.task_id, status="open",
                           last_reject_reason=req.reject_reason or "未符合處方要求，請重新拍攝",
                           video_url=None, uploader_id=None)
            new_status = "open"
        else:
            raise HTTPException(400, "action 必須為 approve 或 reject")
    except HTTPException:
        raise
    except Exception:
        import fake_db as fdb
        task = next((t for t in fdb.CROWD_TASKS if t["id"] == req.task_id), None)
        if not task:
            raise HTTPException(404, "任務不存在")
        if req.action == "approve":
            task["status"] = "adopted"
            rx = next((p for p in getattr(fdb, "PRESCRIPTIONS", [])
                        if p.get("task_id") == req.task_id), None)
            if rx:
                rx["status"] = "fulfilled"
        elif req.action == "reject":
            task["status"] = "open"
            task["last_reject_reason"] = req.reject_reason or "未符合處方要求，請重新拍攝"
            task.pop("video_url", None)
        new_status = task["status"]
    return {"success": True, "new_status": new_status}


@router.post("/api/doctor/ai-preview")
async def doctor_ai_preview(req: AIReplyRequest):
    _role = "attending" if req.doctor_type == "attending" else "resident"
    rag_ctx = _rag.retrieve(req.patient_text or "", _role)
    prompt = (
        f"你是一位溫暖、有耐心的醫生助理，正在協助醫生回覆住院病患的訊息。\n"
        f"請嚴格遵守以下醫師法規職責範疇：\n\n{rag_ctx}\n\n"
        f"病患資訊：\n- 姓名：{req.patient_name or '病患'}\n"
        f"- 目前心情：{req.patient_emotion or '未知'}\n"
        f"- 病患說的話：{req.patient_text or '（無內容）'}\n\n"
        f"請以醫生的第一人稱，用繁體中文寫一段溫暖、專業的回覆（100字以內）。\n"
        f"只輸出回覆正文，不要加任何前綴或說明。"
    )
    try:
        client = get_openai_client()
        message = client.chat.completions.create(
            model="gpt-4o-mini", max_tokens=256,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"success": True, "ai_reply": message.choices[0].message.content.strip()}
    except Exception as e:
        emotion_map = {"難過": "我了解您現在心情不好", "焦慮": "請不要太擔心",
                       "開心": "很高興聽到您的好消息", "有問題": "感謝您提出這個問題"}
        opener = emotion_map.get(req.patient_emotion, "您好")
        txt = req.patient_text[:20] + "..." if len(req.patient_text) > 20 else req.patient_text
        fallback = f"{opener}，{txt}的問題我已了解。我們會持續關注您的狀況。💙"
        return {"success": True, "ai_reply": fallback, "fallback": True, "error": str(e)}


@router.post("/api/doctor/pending/{bed}/eta")
async def set_reply_eta(bed: str, req: EtaNoticeRequest):
    try:
        users = db.get_all_users()
        patient_user = next(
            (u for u in users.values() if u.get("role") == "patient" and u.get("bed") == bed),
            None,
        )
    except Exception:
        import fake_db as fdb
        patient_user = next(
            (u for u in fdb.USERS.values() if u.get("role") == "patient" and u.get("bed") == bed),
            None,
        )
    if not patient_user:
        raise HTTPException(404, "找不到此病床病患")
    try:
        sender_name = (db.get_user(req.doctor_id) or {}).get("name", "醫護人員")
    except Exception:
        import fake_db as fdb
        sender_name = fdb.USERS.get(req.doctor_id, {}).get("name", "醫護人員")
    notice_id = f"eta_{bed}_{int(_dt.now().timestamp())}"
    state.ETA_NOTICES[:] = [n for n in state.ETA_NOTICES if n["patient_id"] != patient_user["id"]]
    state.ETA_NOTICES.append({
        "id": notice_id, "patient_id": patient_user["id"], "bed": bed,
        "eta": req.eta, "doctor_name": sender_name,
        "timestamp": _dt.now().strftime("%Y/%m/%d %H:%M"), "read": False,
    })
    await ws_mgr.push(patient_user["id"], {"event": "eta_notice", "doctor_name": sender_name, "eta": req.eta})
    return {"success": True, "patient_id": patient_user["id"]}


@router.post("/api/doctor/reply")
async def doctor_reply(reply: DoctorReply):
    try:
        msgs = db.get_all_messages()
        msg = next((m for m in msgs if m["id"] == reply.message_id), None)
    except Exception:
        import fake_db as fdb
        msg = next((m for m in fdb.MESSAGES if m["id"] == reply.message_id), None)
    if not msg:
        raise HTTPException(404, "訊息不存在")

    doctor_role = msg.get("route", "attending")
    try:
        db.update_message_reply(reply.message_id, reply.reply_text, doctor_role,
                                extra_update={"reply_eta": reply.reply_eta} if reply.reply_eta else None)
        db.mark_queue_processed(reply.message_id)
    except Exception:
        import fake_db as fdb
        m2 = next((m for m in fdb.MESSAGES if m["id"] == reply.message_id), None)
        if m2:
            m2["replied"] = True
            m2["reply_text"] = reply.reply_text
            m2["reply_by_role"] = doctor_role
            if reply.reply_eta:
                m2["reply_eta"] = reply.reply_eta

    bed = msg.get("bed", "")
    try:
        all_msgs = db.get_messages_by_bed(bed)
    except Exception:
        import fake_db as fdb
        all_msgs = [m for m in fdb.MESSAGES if m.get("bed") == bed]

    unreplied = [m for m in all_msgs if not m.get("replied")]
    pending_badge = next((p for p in state.PENDING_PATIENTS if p["bed"] == bed), None)
    if pending_badge:
        pending_badge["unread"] = len(unreplied)
    if not unreplied:
        pending_entry = next((p for p in state.PENDING_PATIENTS if p["bed"] == bed), None)
        state.PENDING_PATIENTS[:] = [p for p in state.PENDING_PATIENTS if p["bed"] != bed]
        if not any(p["bed"] == bed for p in state.DONE_PATIENTS):
            try:
                patient_user = db.get_user(msg.get("patient_id", "")) or {}
            except Exception:
                import fake_db as fdb
                patient_user = fdb.USERS.get(msg.get("patient_id", ""), {})
            state.DONE_PATIENTS.append({
                "bed": bed,
                "patient_name": patient_user.get("name", "病患"),
                "latest_emotion": "✅", "unread": 0,
                "hospital": patient_user.get("hospital", ""),
                "timestamp": msg.get("timestamp", ""),
                "care_team": (pending_entry or {}).get("care_team", {}),
                "latest_ttas_level": (pending_entry or {}).get("latest_ttas_level", 0),
                "latest_route": (pending_entry or {}).get("latest_route", ""),
            })

    patient_id = msg.get("patient_id", "")
    await ws_mgr.push(patient_id, {"event": "new_reply", "role": doctor_role})
    await ws_mgr.push_role("resident",  {"event": "pending_updated"})
    await ws_mgr.push_role("attending", {"event": "pending_updated"})
    return {"success": True}


@router.post("/api/doctor/pending/{bed}/done")
async def mark_doctor_done(bed: str):
    pending_entry = next((p for p in state.PENDING_PATIENTS if p["bed"] == bed), None)
    if not pending_entry:
        raise HTTPException(404, "找不到該病床")
    state.PENDING_PATIENTS[:] = [p for p in state.PENDING_PATIENTS if p["bed"] != bed]
    if not any(p["bed"] == bed for p in state.DONE_PATIENTS):
        state.DONE_PATIENTS.append({
            "bed": bed,
            "patient_name": pending_entry.get("patient_name", "病患"),
            "latest_emotion": "✅", "unread": 0,
            "hospital": pending_entry.get("hospital", ""),
            "timestamp": pending_entry.get("timestamp", ""),
            "care_team": pending_entry.get("care_team", {}),
            "latest_ttas_level": pending_entry.get("latest_ttas_level", 0),
            "latest_route": pending_entry.get("latest_route", ""),
        })
    await ws_mgr.push_role("resident",  {"event": "pending_updated"})
    await ws_mgr.push_role("attending", {"event": "pending_updated"})
    return {"success": True}


@router.post("/api/nurse/message/{msg_id}/done")
async def mark_nurse_done(msg_id: int):
    try:
        msgs = db.get_all_messages()
        msg = next((m for m in msgs if m["id"] == msg_id), None)
    except Exception:
        import fake_db as fdb
        msg = next((m for m in fdb.MESSAGES if m["id"] == msg_id), None)
    if not msg:
        raise HTTPException(404, "訊息不存在")
    try:
        db.update_message_reply(msg_id, msg.get("reply_text") or "（已標記完成）", "nurse")
        db.mark_queue_processed(msg_id, "nurse")
    except Exception:
        import fake_db as fdb
        m2 = next((m for m in fdb.MESSAGES if m["id"] == msg_id), None)
        if m2:
            m2["replied"] = True
            m2["reply_text"] = m2.get("reply_text") or "（已標記完成）"
    bed = msg.get("bed", "")
    try:
        all_msgs = db.get_messages_by_bed(bed)
    except Exception:
        import fake_db as fdb
        all_msgs = [m for m in fdb.MESSAGES if m.get("bed") == bed]
    if not [m for m in all_msgs if not m.get("replied")]:
        state.PENDING_PATIENTS[:] = [p for p in state.PENDING_PATIENTS if p["bed"] != bed]
    await ws_mgr.push_role("nurse", {"event": "new_message", "bed": bed})
    return {"success": True}


# ════════════════════════════════════════════════
# 微表情情緒警報
# ════════════════════════════════════════════════
import uuid as _uuid


@router.post("/api/emotion/detect")
def receive_emotion_alert(alert: EmotionAlertIn):
    if alert.emotion in ("happy", "neutral"):
        return {"success": True, "alert_created": False}
    try:
        patient_user = db.get_user(alert.patient_id) or {}
    except Exception:
        import fake_db as fdb
        patient_user = fdb.USERS.get(alert.patient_id, {})
    doctor_id = alert.doctor_id or "doctor_001"
    new_alert = {
        "id": f"alert_{_uuid.uuid4().hex[:8]}",
        "patient_id": alert.patient_id,
        "patient_name": patient_user.get("name", alert.bed + "病患"),
        "bed": alert.bed, "hospital": alert.hospital or patient_user.get("hospital", ""),
        "emotion": alert.emotion, "emotion_label": alert.emotion_label,
        "confidence": round(alert.confidence, 3),
        "timestamp": _dt.now().strftime("%Y/%m/%d %H:%M"),
        "doctor_id": doctor_id, "acknowledged": False,
    }
    state.EMOTION_ALERTS.append(new_alert)
    return {"success": True, "alert_created": True, "alert_id": new_alert["id"]}


@router.get("/api/emotion/alerts/{doctor_id}")
def get_emotion_alerts(doctor_id: str, limit: int = 20):
    alerts = sorted(
        [a for a in state.EMOTION_ALERTS
         if a.get("doctor_id") == doctor_id and not a.get("acknowledged")],
        key=lambda a: a["timestamp"], reverse=True,
    )[:limit]
    return {"alerts": alerts, "unread": len(alerts)}


@router.post("/api/emotion/alerts/{alert_id}/ack")
def ack_emotion_alert(alert_id: str):
    alert = next((a for a in state.EMOTION_ALERTS if a["id"] == alert_id), None)
    if not alert:
        raise HTTPException(404, "警報不存在")
    alert["acknowledged"] = True
    return {"success": True}


# ════════════════════════════════════════════════
# LLM 輔助端點
# ════════════════════════════════════════════════

@router.post("/api/llm/recommend-dept")
def llm_recommend_dept(req: LLMRecommendDeptRequest):
    _DEPT_MAP = {
        "骨科": "doctor_003", "外科": "doctor_002", "內科": "doctor_001",
        "神經科": "doctor_001", "心臟科": "doctor_001", "胸腔科": "doctor_001",
        "腸胃科": "doctor_001", "泌尿科": "doctor_002", "皮膚科": "doctor_002",
        "耳鼻喉科": "doctor_002", "眼科": "doctor_002",
        "婦產科": "doctor_003", "精神科": "doctor_001",
    }
    try:
        client = get_openai_client()
        resp = client.chat.completions.create(
            model="gpt-4o-mini", max_tokens=80,
            messages=[
                {"role": "system", "content": "你是台灣醫院的智慧分診助理。根據病患描述的症狀，只需回答最適合的科別名稱，不要加任何其他解釋。"},
                {"role": "user", "content": req.raw_text}
            ]
        )
        dept_raw = resp.choices[0].message.content.strip().replace("科別：", "")
        match = re.search(r'[一-龥]{2,5}科', dept_raw)
        dept = match.group(0) if match else "內科"
    except Exception:
        text = req.raw_text
        if any(k in text for k in ["骨", "關節", "扭", "斷", "腰"]):   dept = "骨科"
        elif any(k in text for k in ["刀", "傷口", "手術"]):           dept = "外科"
        elif any(k in text for k in ["頭暈", "頭痛", "昏"]):           dept = "神經科"
        elif any(k in text for k in ["心", "胸悶", "心臟"]):           dept = "心臟科"
        else:                                                           dept = "內科"
    return {"department": dept, "doctor_id": _DEPT_MAP.get(dept, "doctor_001")}


@router.post("/api/llm/rewrite")
def llm_rewrite(req: LLMRewriteRequest):
    rewrites = {
        "頭暈": "關於您提到頭暈和不適的感覺，這是術後常見的恢復反應，不需要太擔心喔。我們已安排今天下午進一步檢查，請好好休息。💙",
        "發燒": "您目前的體溫偏高是身體在對抗感染的正常反應，我們已調整用藥，請多補充水分並好好休息。💙",
        "復健": "根據您目前的恢復狀況，可以開始輕度復健了！復健師明天會來說明注意事項，請放心。💙",
    }
    for kw, resp in rewrites.items():
        if kw in req.raw_text:
            return {"rewritten": resp}
    return {"rewritten": f"感謝您的留言。關於您提到的狀況，{req.raw_text}——我們會密切關注您的恢復情況，有任何問題請隨時告訴我們。💙"}


@router.post("/api/llm/empathy-rewrite")
def llm_empathy_rewrite(req: EmpathyRewriteRequest):
    try:
        client = get_openai_client()
        emotion_hint = f"（病患目前情緒：{req.patient_emotion}）" if req.patient_emotion else ""
        history_ctx = ""
        if req.history:
            lines = []
            for h in req.history[-3:]:
                lines.append(f"  病患：「{h.get('text','')}」")
                if h.get("replied") and h.get("reply_text"):
                    lines.append(f"  回覆：「{h.get('reply_text','')}」")
            if lines:
                history_ctx = "\n\n近期病患對話紀錄（供語氣參考）：\n" + "\n".join(lines)
        prompt = (
            f"你是一位醫院的溫暖溝通助理。請將以下回覆，改寫為更具同理心、溫暖、易讀的語句。"
            f"保留所有醫療/護理資訊，使用更平易近人的語言，適當加入關懷語氣。語言請用繁體中文。"
            f"{emotion_hint}{history_ctx}\n\n原文：{req.raw_text}\n\n請直接輸出改寫後的內容，不要加任何前綴說明。"
        )
        message = client.chat.completions.create(
            model="gpt-4o-mini", max_tokens=512,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"success": True, "rewritten": message.choices[0].message.content.strip()}
    except Exception as e:
        return {"success": True,
                "rewritten": f"您好！感謝您的告知。{req.raw_text} 請放心，我們會一直陪伴您。💙",
                "fallback": True}
