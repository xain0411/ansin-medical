"""backend/ws_manager.py — WebSocket 連線管理器"""
import json as _json
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id -> list[WebSocket]（同一帳號可能多個分頁）
        self._conns: dict[str, list[WebSocket]] = {}
        # user_id -> role info cache（避免每次推播都查 DB）
        self._roles: dict[str, dict] = {}

    async def connect(self, user_id: str, ws: WebSocket, role: str = "",
                      doctor_type: str = ""):
        await ws.accept()
        self._conns.setdefault(user_id, []).append(ws)
        self._roles[user_id] = {"role": role, "doctor_type": doctor_type}

    def disconnect(self, user_id: str, ws: WebSocket):
        lst = self._conns.get(user_id, [])
        if ws in lst:
            lst.remove(ws)
        if not lst:
            self._conns.pop(user_id, None)

    async def push(self, user_id: str, event: dict):
        payload = _json.dumps(event, ensure_ascii=False)
        for ws in list(self._conns.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def push_role(self, role: str, event: dict):
        """推播給某角色的所有在線用戶。
        role 可為 nurse / patient / crowd，
        或醫生的 doctor_type：attending / resident。
        """
        payload = _json.dumps(event, ensure_ascii=False)
        for uid, conns in list(self._conns.items()):
            info = self._roles.get(uid, {})
            matched = (
                info.get("role") == role
                or (info.get("role") == "doctor" and info.get("doctor_type") == role)
            )
            if not matched:
                # fallback：從 DB 查詢角色
                try:
                    from backend import database as _db
                    u = _db.get_user(uid) or {}
                    matched = (u.get("role") == role) or (
                        u.get("role") == "doctor" and u.get("doctor_type") == role
                    )
                    if matched:
                        self._roles[uid] = {
                            "role": u.get("role", ""),
                            "doctor_type": u.get("doctor_type", ""),
                        }
                except Exception:
                    pass
            if matched:
                for ws in list(conns):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        pass


ws_mgr = ConnectionManager()
