"""backend/routers/auth.py — 登入、OTP 驗證、密碼重設"""
import hashlib
import random
import re
import time

from fastapi import APIRouter, HTTPException
from backend.models import (
    LoginRequest, RegisterRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
)
from backend import database as db

router = APIRouter()


def _mask_phone(phone: str) -> str:
    p = phone.replace("-", "").replace(" ", "")
    return p[:4] + "****" + p[-3:] if len(p) >= 7 else "09xx-xxx-xxx"


@router.post("/api/login")
def login(req: LoginRequest):
    """登入（Demo：任何密碼都接受）"""
    try:
        user = db.get_user(req.user_id)
    except Exception:
        # DB 不可用時 fallback 到 fake_db
        import fake_db as fdb
        user = fdb.USERS.get(req.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="帳號不存在")
    return {"success": True, "user": user}


@router.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    """帳號註冊（Demo：帳號不重複即可建立）"""
    if len(req.account) < 6 or not re.match(r'^[A-Za-z0-9_]+$', req.account):
        raise HTTPException(400, "帳號格式不正確")
    if len(req.password) < 6:
        raise HTTPException(400, "密碼至少需要 6 個字元")
    try:
        existing = db.get_user(req.account)
    except Exception:
        import fake_db as fdb
        existing = fdb.USERS.get(req.account)
    if existing:
        raise HTTPException(409, "此帳號已被使用，請更換帳號")
    pw_hash = hashlib.sha256(req.password.encode()).hexdigest()
    try:
        db.create_user(
            user_id=req.account,
            name=req.name,
            role=req.role,
            phone=req.phone,
            password=pw_hash,
            bed=req.regBed or "",
            hospital="台大醫院",
            extra={"account": req.account, "department": req.regDept or ""},
        )
    except Exception as e:
        raise HTTPException(500, f"建立帳號失敗：{e}")
    return {"success": True, "user_id": req.account, "name": req.name}


@router.post("/api/auth/forgot-password")
def auth_forgot_password(req: ForgotPasswordRequest):
    """忘記密碼：驗證帳號並產生 OTP。OTP 存入 DB，不在 response 中回傳。"""
    try:
        user = db.get_user(req.account)
    except Exception:
        import fake_db as fdb
        user = fdb.USERS.get(req.account)
    if not user:
        raise HTTPException(404, "查無此帳號，請確認輸入正確")

    otp = str(random.randint(100000, 999999))
    expires = int(time.time()) + 600  # 10 分鐘
    try:
        db.set_user_otp(req.account, otp, expires)
    except Exception:
        # DB 不可用：繼續但不持久化 OTP（Demo fallback）
        pass

    phone = user.get("phone", "")
    masked_phone = _mask_phone(phone) if phone else "09xx-xxx-xxx"

    # OTP 不再包含在 response（安全修復）
    return {
        "success": True,
        "masked_phone": masked_phone,
        "masked_email": "xx**@demo.com",
    }


@router.post("/api/auth/reset-password")
def auth_reset_password(req: ResetPasswordRequest):
    """驗證 OTP 並更新密碼"""
    if len(req.new_password) < 6:
        raise HTTPException(400, "密碼至少需要 6 個字元")
    try:
        ok = db.verify_and_clear_otp(req.account, req.otp)
    except Exception:
        raise HTTPException(500, "驗證碼驗證失敗，請重試")
    if not ok:
        raise HTTPException(400, "驗證碼錯誤或已過期")
    pw_hash = hashlib.sha256(req.new_password.encode()).hexdigest()
    try:
        db.update_user_password(req.account, pw_hash)
    except Exception as e:
        raise HTTPException(500, f"密碼更新失敗：{e}")
    return {"success": True}
