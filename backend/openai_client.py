"""backend/openai_client.py — OpenAI 客戶端工具

使用範例（在任何 router 中）：
    from backend.openai_client import get_openai_client

    client = get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "你好"}],
        max_tokens=200,
    )
    text = response.choices[0].message.content
"""
import os

from openai import OpenAI


def get_openai_client() -> OpenAI:
    """回傳以 OPENAI_API_KEY 初始化的 OpenAI 客戶端。"""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY 未設定，請在 .env 中填入金鑰")
    org_id = os.getenv("OPENAI_ORG_ID", "") or None
    return OpenAI(api_key=api_key, organization=org_id)


def is_openai_configured() -> bool:
    """檢查 OPENAI_API_KEY 是否已設定。"""
    return bool(os.getenv("OPENAI_API_KEY", "").strip())
