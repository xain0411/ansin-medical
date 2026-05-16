# backend/fake_db.py — 系統資料管理模組
# 所有假資料集中在這裡，方便之後換成真實資料庫

from typing import List, Dict

# ── 使用者 ──────────────────────────────────────────────
USERS: Dict[str, dict] = {
    # ── 病患（care_team 由入院時護理師設定，模擬無需 HIS 整合）──
    "patient_510C": {
        "id": "patient_510C", "role": "patient", "name": "林俊宏",
        "bed": "510-C", "hospital": "台北總院",
        "care_team": {
            "attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "骨科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "骨科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"},
        }
    },
    "patient_503B": {
        "id": "patient_503B", "role": "patient", "name": "王小明",
        "bed": "503-B", "hospital": "台北總院",
        "care_team": {
            "attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "骨科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "骨科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"},
        }
    },
    "patient_504A": {
        "id": "patient_504A", "role": "patient", "name": "陳美玲",
        "bed": "504-A", "hospital": "台北總院",
        "care_team": {
            "attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "骨科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "骨科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"},
        }
    },
    # 住院醫師 (resident)
    "doctor_001":   {"id": "doctor_001",   "role": "doctor",  "doctor_type": "resident",  "name": "林醫師",     "dept": "骨科", "hospital": "台北總院"},
    "doctor_002":   {"id": "doctor_002",   "role": "doctor",  "doctor_type": "resident",  "name": "陳醫師",     "dept": "外科", "hospital": "台中分院"},
    # 主治醫師 (attending)
    "doctor_003":   {"id": "doctor_003",   "role": "doctor",  "doctor_type": "attending", "name": "李醫師",     "dept": "骨科", "hospital": "高雄分院"},
    "doctor_004":   {"id": "doctor_004",   "role": "doctor",  "doctor_type": "attending", "name": "王主治醫師", "dept": "骨科", "hospital": "台北總院"},
    "crowd_001":    {"id": "crowd_001",    "role": "crowd",   "name": "張大志", "points": 2610},
    "crowd_002":    {"id": "crowd_002",    "role": "crowd",   "name": "李志明", "points": 3890},
    "crowd_003":    {"id": "crowd_003",    "role": "crowd",   "name": "陳小芬", "points": 1560},
    "crowd_004":    {"id": "crowd_004",    "role": "crowd",   "name": "王建國", "points": 820},
    "crowd_005":    {"id": "crowd_005",    "role": "crowd",   "name": "林美惠", "points": 5200},
    "crowd_006":    {"id": "crowd_006",    "role": "crowd",   "name": "黃俊豪", "points": 980},
    "crowd_007":    {"id": "crowd_007",    "role": "crowd",   "name": "吳雅婷", "points": 4100},
    "nurse_001":    {"id": "nurse_001",    "role": "nurse",   "name": "李護理師", "hospital": "台北總院"},
    "nurse_002":    {"id": "nurse_002",    "role": "nurse",   "name": "王護理師", "hospital": "台中分院"},
}

# ── 分流佇列（AI 分流後分配至對應角色）──────────────
# L1→主治醫師 L2→住院醫師 L3/L4→護理師
NURSE_QUEUE: List[dict] = [
    {"id": 4, "bed": "504-A", "patient_id": "patient_504A", "text": "發炎的情況有沒有好轉？我還是覺得很不舒服",
     "ttas_level": 3, "ttas_category": "常規護理", "route": "nurse", "timestamp": "2026/1/2 10:49"},
    {"id": 6, "bed": "506-B", "patient_id": "patient_506B", "text": "換藥時間到了，護理師可以來幫我換嗎？",
     "ttas_level": 3, "ttas_category": "常規護理", "route": "nurse", "timestamp": "2026/1/1 08:20"},
    {"id": 7, "bed": "509-C", "patient_id": "patient_509C", "text": "我想要多一條毯子，有點冷",
     "ttas_level": 4, "ttas_category": "生活協助", "route": "nurse", "timestamp": "2025/12/30 14:10"},
    # 503-B 王小明（L5 飲食詢問，DEMO 預設）
    {"id": 13, "bed": "503-B", "patient_id": "patient_503B", "text": "護理師，我今天想吃什麼比較好？",
     "ttas_level": 5, "ttas_category": "生活協助", "ttas_summary": "術後飲食詢問，非緊急",
     "route": "nurse", "timestamp": "2026/3/26 12:10",
     "nrs_estimated": 1, "bsrs_estimated": 3, "pcs_level": 4,
     "urgency_flags": [], "self_harm_detected": False,
     "ttas_reasoning": "飲食詢問屬 L5 非緊急生活協助，護理師提供飲食衛教即可。",
     "emotion": "開心", "replied": False, "nurse_seen": False},
]
RESIDENT_QUEUE: List[dict] = [
    {"id": 8, "bed": "510-C", "patient_id": "patient_510C", "text": "我胸口很悶，呼吸有點喘，請醫師來評估",
     "ttas_level": 2, "ttas_category": "緊急醫療", "route": "resident", "timestamp": "2025/12/29 16:45"},
]
ATTENDING_QUEUE: List[dict] = []

# ── 病患狀態訊息（醫聲相伴）──────────────────────────
MESSAGES: List[dict] = [
    {"id": 1, "patient_id": "patient_503B", "bed": "503-B", "emotion": "焦慮",
     "text": "醫生，我今天早上的頭很暈，還有點想吐，請問這是怎麼回事啊？",
     "timestamp": "2026/1/4 09:31", "replied": True,
     "reply_text": "您好，頭暈想吐可能與姿勢性低血壓或耳前庭有關，已安排今日會診，請先臥床休息，有任何不適請再告知。",
     "ttas_level": 3, "ttas_category": "常規護理", "ttas_summary": "頭暈想吐，已知症狀",
     "route": "resident",
     "nrs_estimated": 4, "bsrs_estimated": 6, "pcs_level": 2,
     "urgency_flags": ["pain_attention"],
     "self_harm_detected": False,
     "ttas_reasoning": "頭暈合併噁心，NRS 4/10 屬中度不適，BSRS 6 分有輕度焦慮，無立即生命危險，PCS L2 由住院醫師評估。",
     "reply_by_role": "resident",
     "audit_log": []},
    {"id": 2, "patient_id": "patient_503B", "bed": "503-B", "emotion": "開心",
     "text": "今天病情有好轉，感謝醫生！",
     "timestamp": "2026/1/4 13:19", "replied": True,
     "reply_text": "很高興您的狀況有改善！請繼續好好休息，有任何需要隨時告訴護理站。",
     "ttas_level": 5, "ttas_category": "生活協助", "ttas_summary": "正向回饋，非緊急",
     "route": "nurse",
     "nrs_estimated": 1, "bsrs_estimated": 2, "pcs_level": 4,
     "urgency_flags": [],
     "self_harm_detected": False,
     "ttas_reasoning": "病患表達好轉，疼痛程度極低 NRS 1，心理狀態良好 BSRS 2，PCS L4 由護理師追蹤即可。",
     "reply_by_role": "nurse",
     "audit_log": []},
    {"id": 3, "patient_id": "patient_503B", "bed": "503-B", "emotion": "有問題",
     "text": "可以開始做復健了嗎？",
     "timestamp": "2026/1/3 12:15", "replied": True,
     "reply_text": "根據您目前的恢復狀況，明天可以開始輕度復健，復健師會來說明注意事項。",
     "ttas_level": 4, "ttas_category": "常規護理", "ttas_summary": "詢問復健時機，次緊急",
     "route": "nurse",
     "nrs_estimated": 2, "bsrs_estimated": 4, "pcs_level": 3,
     "urgency_flags": [],
     "self_harm_detected": False,
     "ttas_reasoning": "詢問復健安排，NRS 2 疼痛輕微，BSRS 4 情緒穩定，PCS L3 適合護理師協調安排。",
     "reply_by_role": "nurse",
     "audit_log": []},
    {"id": 4, "patient_id": "patient_504A", "bed": "504-A", "emotion": "難過",
     "text": "發炎的情況有沒有好轉？我還是覺得很不舒服",
     "timestamp": "2026/1/2 10:49", "replied": False, "reply_text": None,
     "ttas_level": 3, "ttas_category": "常規護理", "ttas_summary": "詢問發炎狀況，持續不適",
     "route": "resident",
     "nrs_estimated": 5, "bsrs_estimated": 9, "pcs_level": 2,
     "urgency_flags": ["pain_attention", "bsrs_attention"],
     "self_harm_detected": False,
     "ttas_reasoning": "持續不適且情緒低落，NRS 5 中度疼痛，BSRS 9 超過注意閾值（≥6），PCS L2 需住院醫師複評，心理支持建議。",
     "audit_log": []},
    {"id": 5, "patient_id": "patient_503B", "bed": "503-B", "emotion": "有問題",
     "text": "今天照完X光，結果什麼時候出來？",
     "timestamp": "2026/1/1 15:22", "replied": True,
     "reply_text": "X光結果明天上午會出來，醫師巡房時會跟您詳細說明，請放心休息。",
     "ttas_level": 5, "ttas_category": "生活協助", "ttas_summary": "詢問檢查結果，非緊急",
     "route": "nurse",
     "nrs_estimated": 1, "bsrs_estimated": 3, "pcs_level": 4,
     "urgency_flags": [],
     "self_harm_detected": False,
     "ttas_reasoning": "行政性詢問，無身體不適描述，NRS 1，BSRS 3，PCS L4 護理師回覆即可。",
     "reply_by_role": "nurse",
     "audit_log": []},
    # 510-C 林俊宏（L2 危急 → 主治醫師）
    {"id": 11, "patient_id": "patient_510C", "bed": "510-C", "emotion": "難過",
     "text": "我胸口很悶，呼吸有點喘，請醫師來評估",
     "timestamp": "2025/12/29 16:45", "replied": False, "reply_text": None,
     "ttas_level": 2, "ttas_category": "緊急醫療", "ttas_summary": "胸悶呼吸不順，需醫師立即評估",
     "route": "attending",
     "nrs_estimated": 7, "bsrs_estimated": 11, "pcs_level": 1,
     "urgency_flags": ["pain_attention", "bsrs_attention"],
     "self_harm_detected": False,
     "ttas_reasoning": "胸悶合併呼吸困難，屬 L2 危急。NRS 7 重度疼痛，BSRS 11 心理壓力明顯，PCS L1 需主治醫師立即到場評估，排除心肺急症。",
     "audit_log": []},
    # 503-B 王小明（L2 危急 → 主治醫師，DEMO 預設訊息）
    {"id": 12, "patient_id": "patient_503B", "bed": "503-B", "emotion": "難過",
     "text": "醫生我骨盆很痛，呼吸也有點喘",
     "timestamp": "2026/3/26 12:05", "replied": False, "reply_text": None,
     "ttas_level": 2, "ttas_category": "緊急醫療", "ttas_summary": "骨盆劇痛合併呼吸困難，疑似術後急性併發症",
     "route": "attending",
     "nrs_estimated": 8, "bsrs_estimated": 11, "pcs_level": 1,
     "urgency_flags": ["pain_attention", "bsrs_attention"],
     "self_harm_detected": False,
     "ttas_reasoning": "骨盆疼痛合併呼吸喘，屬 L2 危急。NRS 8 重度疼痛，BSRS 11 心理壓力明顯，PCS L1 需主治醫師立即評估，排除肺栓塞等術後急性併發症。",
     "audit_log": []},
    # 503-B 王小明（L5 非緊急 → 護理師，DEMO 飲食詢問預設訊息）
    {"id": 13, "patient_id": "patient_503B", "bed": "503-B", "emotion": "開心",
     "text": "護理師，我今天想吃什麼比較好？",
     "timestamp": "2026/3/26 12:10", "replied": False, "reply_text": None,
     "ttas_level": 5, "ttas_category": "生活協助", "ttas_summary": "術後飲食詢問，非緊急",
     "route": "nurse",
     "nrs_estimated": 1, "bsrs_estimated": 3, "pcs_level": 4,
     "urgency_flags": [],
     "self_harm_detected": False,
     "ttas_reasoning": "飲食詢問屬 L5 非緊急生活協助。NRS 1 無明顯疼痛，BSRS 3 情緒穩定，PCS L4 護理師提供飲食衛教即可，無需醫師介入。",
     "audit_log": []},
]

# ── 待回覆病患清單（醫生端）─────────────────────────
# 503-B、510-C、504-A 共享同一照護團隊
_CT_TAIPEI_ORTHO = {"attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "骨科"},
                    "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "骨科"},
                    "nurse":     {"id": "nurse_001",  "name": "李護理師"}}
_CT_503B = _CT_TAIPEI_ORTHO
_CT_510C = _CT_TAIPEI_ORTHO
_CT_504A = _CT_TAIPEI_ORTHO
_CT_506B = {"attending": {"id": "doctor_002", "name": "陳醫師",     "dept": "外科"},
            "resident":  {"id": "doctor_002", "name": "陳醫師",     "dept": "外科"},
            "nurse":     {"id": "nurse_002",  "name": "王護理師"}}
_CT_509C = {"attending": {"id": "doctor_003", "name": "李醫師",     "dept": "骨科"},
            "resident":  {"id": "doctor_003", "name": "李醫師",     "dept": "骨科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"}}

PENDING_PATIENTS = [
    # L2 → 主治醫師（王主治 doctor_004）DEMO 預設訊息
    {"bed": "503-B", "patient_name": "王小明",  "latest_emotion": "難過",   "unread": 1, "hospital": "台北總院", "timestamp": "2026/3/26 12:05", "latest_ttas_level": 2, "latest_route": "attending", "latest_message": "醫生我骨盆很痛，呼吸也有點喘",                 "care_team": _CT_503B},
    # L3 → 住院醫師（林醫師 doctor_001）
    {"bed": "504-A", "patient_name": "陳美玲",  "latest_emotion": "難過",   "unread": 1, "hospital": "台北總院", "timestamp": "2026/1/2 10:49",  "latest_ttas_level": 3, "latest_route": "resident",  "latest_message": "發炎的情況有沒有好轉？我還是覺得很不舒服",     "care_team": _CT_504A},
    # L3 護理技術 → 護理師
    {"bed": "506-B", "patient_name": "李志強",  "latest_emotion": "有問題", "unread": 2, "hospital": "台中分院", "timestamp": "2026/1/1 08:20",  "latest_ttas_level": 3, "latest_route": "nurse",     "latest_message": "換藥時間到了，護理師可以來幫我換嗎？",         "care_team": _CT_506B},
    # L4 → 護理師
    {"bed": "509-C", "patient_name": "黃淑芬",  "latest_emotion": "焦慮",   "unread": 1, "hospital": "高雄分院", "timestamp": "2025/12/30 14:10", "latest_ttas_level": 4, "latest_route": "nurse",     "latest_message": "我想要多一條毯子，有點冷",                     "care_team": _CT_509C},
]
DONE_PATIENTS = [
    {"bed": "510-C", "patient_name": "林俊宏",  "latest_emotion": "難過", "unread": 0, "hospital": "台北總院", "timestamp": "2025/12/29 16:45", "latest_ttas_level": 2, "latest_route": "attending", "latest_message": "我胸口很悶，呼吸有點喘，請醫師來評估", "care_team": _CT_510C},
    {"bed": "503-A", "patient_name": "趙雅婷", "latest_emotion": "開心", "unread": 0, "hospital": "台北總院", "timestamp": "2026/1/3 10:00"},
    {"bed": "506-C", "patient_name": "吳建志", "latest_emotion": "開心", "unread": 0, "hospital": "台中分院", "timestamp": "2026/1/1 11:30"},
]

# ── 地圖景點（任意視界）──────────────────────────────
MAP_PINS = [
    {"id": "pin_101",    "name": "台北101附近", "lat": 25.034, "lng": 121.565, "has_video": True,  "type": "gov"},
    {"id": "pin_forest", "name": "大安森林公園", "lat": 25.029, "lng": 121.535, "has_video": True,  "type": "crowd"},
    {"id": "pin_shilin", "name": "士林夜市",    "lat": 25.088, "lng": 121.524, "has_video": True,  "type": "crowd"},
    {"id": "pin_zoo",    "name": "韓國 Minimal Zoo", "lat": 25.010, "lng": 121.510, "has_video": False, "type": "none"},
]

# ── 群眾任務列表 ──────────────────────────────────────
CROWD_TASKS = [
    # task_type: "prescription" = 視覺處方任務（需醫生審核）
    #            "general"      = 一般志工任務（直接完成）
    {"id": "task_001", "location": "韓國 Minimal Zoo", "description": "企鵝在冰上的動態影像，要有行進感",
     "points": 350, "bonus": True,  "requested_by": "503-B號病房", "status": "open", "task_type": "prescription"},
    {"id": "task_002", "location": "花蓮七星潭",       "description": "海浪拍打礫石灘的聲音與畫面",
     "points": 280, "bonus": True,  "requested_by": "504-A號病房", "status": "open", "task_type": "prescription"},
    {"id": "task_003", "location": "陽明山竹子湖",     "description": "海芋花田步道行走影片",
     "points": 150, "bonus": False, "requested_by": "506-B號病房", "status": "open", "task_type": "general"},
    {"id": "task_004", "location": "台北信義區夜景",   "description": "101附近夜間街景，含人群活動",
     "points": 120, "bonus": False, "requested_by": "509-C號病房", "status": "open", "task_type": "general"},
    # ── 已完成任務（Demo：病患可觀看並評分）──────────────
    {"id": "task_demo_01", "location": "大安森林公園", "description": "公園春日花海步道，清晨鳥鳴聲",
     "points": 280, "bonus": True, "requested_by": "503-B號病房", "status": "adopted",
     "task_type": "prescription",
     "video_url": "https://www.w3schools.com/html/mov_bbb.mp4",
     "lat": 25.029, "lng": 121.535, "uploader_id": "crowd_001"},
    {"id": "task_demo_02", "location": "士林夜市",     "description": "夜市人潮與小吃攤的熱鬧場景",
     "points": 150, "bonus": False, "requested_by": "504-A號病房", "status": "completed",
     "task_type": "general",
     "video_url": "https://www.w3schools.com/html/mov_bbb.mp4",
     "lat": 25.088, "lng": 121.524, "uploader_id": "crowd_002"},
    # ── Demo：待醫生審核的視覺處方影片 ──────────────────
    {"id": "task_demo_03", "location": "淡水老街",     "description": "夕陽下的淡水河景與老街人文",
     "points": 200, "bonus": False, "requested_by": "503-B號病房", "status": "review",
     "task_type": "prescription",
     "video_url": "https://www.w3schools.com/html/mov_bbb.mp4",
     "lat": 25.170, "lng": 121.438, "uploader_id": "crowd_001",
     "patient_id": "patient_503B", "doctor_id": "doctor_001"},
]

# ── 群眾貢獻統計 ──────────────────────────────────────
# week_points / month_points：本周/本月累積（不影響總積分，定期重置）
# week_streak：連續奪冠周數（0=未曾奪冠）
CROWD_STATS = {
    "crowd_001": {"completed": 23, "points": 2610, "week_points": 450,  "month_points": 1850, "week_streak": 2,  "month_streak": 0, "week_completed": 3,  "month_completed": 11},
    "crowd_002": {"completed": 31, "points": 3890, "week_points": 580,  "month_points": 2340, "week_streak": 4,  "month_streak": 1, "week_completed": 4,  "month_completed": 14},
    "crowd_003": {"completed": 15, "points": 1560, "week_points": 380,  "month_points": 1200, "week_streak": 0,  "month_streak": 0, "week_completed": 2,  "month_completed": 7},
    "crowd_004": {"completed":  8, "points":  820, "week_points": 270,  "month_points":  650, "week_streak": 0,  "month_streak": 0, "week_completed": 2,  "month_completed": 4},
    "crowd_005": {"completed": 42, "points": 5200, "week_points": 120,  "month_points":  890, "week_streak": 0,  "month_streak": 0, "week_completed": 1,  "month_completed": 6},
    "crowd_006": {"completed": 12, "points":  980, "week_points": 310,  "month_points":  980, "week_streak": 0,  "month_streak": 0, "week_completed": 2,  "month_completed": 6},
    "crowd_007": {"completed": 35, "points": 4100, "week_points": 490,  "month_points": 2010, "week_streak": 1,  "month_streak": 0, "week_completed": 3,  "month_completed": 15},
}

# ── 排行榜獎勵紀錄 ─────────────────────────────────────
# 格式：{ user_id: [{"period":"2026-W10","rank":1,"store":"星巴克",...}, ...] }
LEADERBOARD_REWARDS: Dict[str, list] = {
    "crowd_002": [
        {"period": "2026-W09", "rank": 1, "store": "星巴克",    "item": "中杯星冰樂兌換券",  "icon": "🌟", "type": "weekly"},
        {"period": "2026-W08", "rank": 1, "store": "星巴克",    "item": "中杯星冰樂兌換券",  "icon": "🌟", "type": "weekly"},
        {"period": "2026-W07", "rank": 1, "store": "星巴克",    "item": "中杯星冰樂兌換券",  "icon": "🌟", "type": "weekly"},
        {"period": "2026-W06", "rank": 1, "store": "星巴克",    "item": "中杯星冰樂兌換券",  "icon": "🌟", "type": "weekly"},
        {"period": "2026-02",  "rank": 1, "store": "Uber Eats", "item": "NT$150 折扣碼",     "icon": "🎁", "type": "monthly"},
    ],
    "crowd_001": [
        {"period": "2026-W09", "rank": 2, "store": "7-ELEVEN",  "item": "大杯美式咖啡兌換券", "icon": "☕", "type": "weekly"},
    ],
}

# ── 病患評分紀錄 ───────────────────────────────────────
RATINGS: List[dict] = []

# ── 好友申請 ──────────────────────────────────────────
FRIEND_REQUESTS: List[dict] = [
    {
        "id": "freq_demo_01",
        "from_id": "patient_504A",
        "from_name": "陳美玲（病患）",
        "to_id": "crowd_002",
        "message": "謝謝你的拍攝，影片太美了，希望能成為好友！",
        "status": "pending",
        "timestamp": "2026/01/05 15:10",
    },
]

# ── 好友關係 ──────────────────────────────────────────
FRIENDSHIPS: List[dict] = [
    {
        "id": "fs_demo_01",
        "user1_id": "patient_503B",
        "user2_id": "crowd_001",
        "since": "2026/01/01 10:00",
    },
]

# ── 聊天訊息 ──────────────────────────────────────────
CHAT_MESSAGES: List[dict] = [
    {
        "id": "cm_001",
        "from_id": "patient_503B",
        "to_id": "crowd_001",
        "text": "你好！謝謝你上週幫我拍的影片，看到那麼美的景色讓我好開心！",
        "voice_url": None,
        "timestamp": "2026/01/04 09:15",
        "read": True,
    },
    {
        "id": "cm_002",
        "from_id": "crowd_001",
        "to_id": "patient_503B",
        "text": "你好！很高興影片能讓你開心，希望你早日康復！我下週還會去拍更多好看的地方 😊",
        "voice_url": None,
        "timestamp": "2026/01/04 10:30",
        "read": True,
    },
    {
        "id": "cm_003",
        "from_id": "patient_503B",
        "to_id": "crowd_001",
        "text": "太感謝了！如果有機會，能幫我拍一下陽明山的風景嗎？醫生說看自然景觀對我的恢復很有幫助。",
        "voice_url": None,
        "timestamp": "2026/01/04 11:00",
        "read": True,
    },
    {
        "id": "cm_004",
        "from_id": "crowd_001",
        "to_id": "patient_503B",
        "text": "沒問題！我這週末就去陽明山，會把最美的花季拍給你看！",
        "voice_url": None,
        "timestamp": "2026/01/04 11:45",
        "read": False,
    },
]

# ── 醫師預計回覆時間通知 ────────────────────────────────
ETA_NOTICES: List[dict] = []

# ── 已刪除通知 ID 集合 ─────────────────────────────────
DELETED_NOTIF_IDS: set = set()

# ── 微表情情緒警報（M55M1 板子偵測）──────────────────
EMOTION_ALERTS: List[dict] = []
