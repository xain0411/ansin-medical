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
            "attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "內科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "內科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"},
        }
    },
    "patient_503B": {
        "id": "patient_503B", "role": "patient", "name": "王小明",
        "bed": "503-B", "hospital": "台北總院",
        "care_team": {
            "attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "內科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "內科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"},
        }
    },
    "patient_504A": {
        "id": "patient_504A", "role": "patient", "name": "陳美玲",
        "bed": "504-A", "hospital": "台北總院",
        "care_team": {
            "attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "內科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "內科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"},
        }
    },
    # 住院醫師 (resident)
    "doctor_001":   {"id": "doctor_001",   "role": "doctor",  "doctor_type": "resident",  "name": "林醫師",     "dept": "內科", "hospital": "台北總院"},
    "doctor_002":   {"id": "doctor_002",   "role": "doctor",  "doctor_type": "resident",  "name": "陳醫師",     "dept": "外科", "hospital": "台中分院"},
    # 主治醫師 (attending)
    "doctor_003":   {"id": "doctor_003",   "role": "doctor",  "doctor_type": "attending", "name": "李醫師",     "dept": "骨科", "hospital": "高雄分院"},
    "doctor_004":   {"id": "doctor_004",   "role": "doctor",  "doctor_type": "attending", "name": "王主治醫師", "dept": "內科", "hospital": "台北總院"},
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
    {"id": 1, "bed": "503-B", "patient_id": "patient_503B", "text": "醫生，我今天早上的頭很暈，還有點想吐，請問這是怎麼回事啊？",
     "ttas_level": 3, "ttas_category": "常規護理", "route": "nurse", "timestamp": "2026/1/4 09:31"},
    {"id": 4, "bed": "504-A", "patient_id": "patient_504A", "text": "發炎的情況有沒有好轉？我還是覺得很不舒服",
     "ttas_level": 3, "ttas_category": "常規護理", "route": "nurse", "timestamp": "2026/1/2 10:49"},
    {"id": 6, "bed": "506-B", "patient_id": "patient_506B", "text": "換藥時間到了，護理師可以來幫我換嗎？",
     "ttas_level": 3, "ttas_category": "常規護理", "route": "nurse", "timestamp": "2026/1/1 08:20"},
    {"id": 7, "bed": "509-C", "patient_id": "patient_509C", "text": "我想要多一條毯子，有點冷",
     "ttas_level": 4, "ttas_category": "生活協助", "route": "nurse", "timestamp": "2025/12/30 14:10"},
]
RESIDENT_QUEUE: List[dict] = [
    {"id": 8, "bed": "510-C", "patient_id": "patient_510C", "text": "我胸口很悶，呼吸有點喘，請醫師來評估",
     "ttas_level": 2, "ttas_category": "緊急醫療", "route": "resident", "timestamp": "2025/12/29 16:45"},
]
ATTENDING_QUEUE: List[dict] = [
    {"id": 9, "bed": "503-B", "patient_id": "patient_503B", "text": "心臟痛痛的，我覺得很不舒服",
     "ttas_level": 1, "ttas_category": "立即急症", "route": "attending", "timestamp": "2026/3/20 16:39"},
]

# ── 病患狀態訊息（醫聲相伴）──────────────────────────
MESSAGES: List[dict] = [
    {"id": 1, "patient_id": "patient_503B", "bed": "503-B", "emotion": "焦慮",
     "text": "醫生，我今天早上的頭很暈，還有點想吐，請問這是怎麼回事啊？",
     "timestamp": "2026/1/4 09:31", "replied": True,
     "reply_text": "您好，頭暈想吐可能與姿勢性低血壓或耳前庭有關，已安排今日會診，請先臥床休息。",
     "ttas_level": 3, "ttas_category": "常規護理", "ttas_summary": "頭暈想吐，已知症狀",
     "pushed_to_doctor": True, "audit_log": []},
    {"id": 10, "patient_id": "patient_503B", "bed": "503-B", "emotion": "焦慮",
     "text": "心臟痛痛的，我覺得很不舒服，胸口有點喘不過氣",
     "timestamp": "2026/3/20 16:39", "replied": False, "reply_text": None,
     "ttas_level": 1, "ttas_category": "立即急症", "ttas_summary": "胸痛合併呼吸困難，需立即評估",
     "pushed_to_doctor": False, "audit_log": []},
    {"id": 2, "patient_id": "patient_503B", "bed": "503-B", "emotion": "開心",
     "text": "今天病情有好轉，感謝醫生！",
     "timestamp": "2026/1/4 13:19", "replied": True,
     "reply_text": "很高興您的狀況有改善！請繼續好好休息，明天我們會再做一次檢查確認。",
     "ttas_level": 4, "ttas_category": "生活協助", "ttas_summary": "正向回饋",
     "pushed_to_doctor": True, "audit_log": []},
    {"id": 3, "patient_id": "patient_503B", "bed": "503-B", "emotion": "有問題",
     "text": "可以開始做復健了嗎？",
     "timestamp": "2026/1/3 12:15", "replied": True,
     "reply_text": "根據您目前的恢復狀況，明天可以開始輕度復健，復健師會來說明注意事項。",
     "ttas_level": 3, "ttas_category": "常規護理", "ttas_summary": "詢問復健時機",
     "pushed_to_doctor": True, "audit_log": []},
    {"id": 4, "patient_id": "patient_504A", "bed": "504-A", "emotion": "難過",
     "text": "發炎的情況有沒有好轉？我還是覺得很不舒服",
     "timestamp": "2026/1/2 10:49", "replied": False, "reply_text": None,
     "ttas_level": 3, "ttas_category": "常規護理", "ttas_summary": "詢問發炎狀況，持續不適",
     "pushed_to_doctor": False, "audit_log": []},
    {"id": 5, "patient_id": "patient_503B", "bed": "503-B", "emotion": "有問題",
     "text": "今天照完X光，結果什麼時候出來？",
     "timestamp": "2026/1/1 15:22", "replied": True,
     "reply_text": "X光結果明天上午會出來，我會在巡房時跟您詳細說明。",
     "ttas_level": 4, "ttas_category": "生活協助", "ttas_summary": "詢問檢查結果時間",
     "pushed_to_doctor": True, "audit_log": []},
    # 510-C 林俊宏（L2 緊急醫療 → 住院醫師）
    {"id": 11, "patient_id": "patient_510C", "bed": "510-C", "emotion": "難過",
     "text": "我胸口很悶，呼吸有點喘，請醫師來評估",
     "timestamp": "2025/12/29 16:45", "replied": False, "reply_text": None,
     "ttas_level": 2, "ttas_category": "緊急醫療", "ttas_summary": "胸悶呼吸不順，需醫師評估",
     "pushed_to_doctor": True, "audit_log": []},
]

# ── 待回覆病患清單（醫生端）─────────────────────────
_CT_503B = {"attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "內科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "內科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"}}
_CT_510C = {"attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "內科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "內科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"}}
_CT_504A = {"attending": {"id": "doctor_004", "name": "王主治醫師", "dept": "內科"},
            "resident":  {"id": "doctor_001", "name": "林醫師",     "dept": "內科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"}}
_CT_506B = {"attending": {"id": "doctor_002", "name": "陳醫師",     "dept": "外科"},
            "resident":  {"id": "doctor_002", "name": "陳醫師",     "dept": "外科"},
            "nurse":     {"id": "nurse_002",  "name": "王護理師"}}
_CT_509C = {"attending": {"id": "doctor_003", "name": "李醫師",     "dept": "骨科"},
            "resident":  {"id": "doctor_003", "name": "李醫師",     "dept": "骨科"},
            "nurse":     {"id": "nurse_001",  "name": "李護理師"}}

PENDING_PATIENTS = [
    # L1 → 主治醫師（王主治醫師 doctor_004）
    {"bed": "503-B", "patient_name": "王小明",  "latest_emotion": "焦慮",   "unread": 1, "hospital": "台北總院", "timestamp": "2026/3/20 16:39",  "latest_ttas_level": 1, "latest_message": "心臟痛痛的，我覺得很不舒服，胸口有點喘不過氣", "care_team": _CT_503B},
    # L2 → 住院醫師（林醫師 doctor_001）
    {"bed": "510-C", "patient_name": "林俊宏",  "latest_emotion": "難過",   "unread": 1, "hospital": "台北總院", "timestamp": "2025/12/29 16:45", "latest_ttas_level": 2, "latest_message": "我胸口很悶，呼吸有點喘，請醫師來評估",         "care_team": _CT_510C},
    # L3 → 護理師
    {"bed": "504-A", "patient_name": "陳美玲",  "latest_emotion": "難過",   "unread": 1, "hospital": "台北總院", "timestamp": "2026/1/2 10:49",  "latest_ttas_level": 3, "latest_message": "發炎的情況有沒有好轉？我還是覺得很不舒服",     "care_team": _CT_504A},
    {"bed": "506-B", "patient_name": "李志強",  "latest_emotion": "有問題", "unread": 2, "hospital": "台中分院", "timestamp": "2026/1/1 08:20",  "latest_ttas_level": 3, "latest_message": "換藥時間到了，護理師可以來幫我換嗎？",         "care_team": _CT_506B},
    # L4 → 護理師
    {"bed": "509-C", "patient_name": "黃淑芬",  "latest_emotion": "焦慮",   "unread": 1, "hospital": "高雄分院", "timestamp": "2025/12/30 14:10", "latest_ttas_level": 4, "latest_message": "我想要多一條毯子，有點冷",                     "care_team": _CT_509C},
]
DONE_PATIENTS = [
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
RATINGS: List[dict] = [
    {
        "id": "rate_demo_01",
        "task_id": "task_demo_01",
        "patient_id": "patient_503B",
        "patient_name": "王小明",
        "uploader_id": "crowd_001",
        "stars": 5,
        "message_text": "謝謝你幫我拍了這麼美的花海！看到這些畫面讓我心情好多了，感覺自己也在那裡散步一樣。",
        "voice_url": None,
        "timestamp": "2026/01/05 14:23",
        "read": False,
    },
]

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

# ── 病患心願清單 ───────────────────────────────────────
WISHLISTS: list = [
    {
        "id": "wish_001",
        "patient_id": "patient_503B",
        "patient_name": "王小明",
        "patient_bed": "503-B號病房",
        "place_name": "陽明山竹子湖",
        "description": "想看海芋花田，聽說春天很美",
        "created_at": "2026/03/10 09:00",
        "fulfilled": False,
        "claimed_by": None,
        "pre_voice_url": None,
    },
    {
        "id": "wish_002",
        "patient_id": "patient_503B",
        "patient_name": "王小明",
        "patient_bed": "503-B號病房",
        "place_name": "台北大稻埕碼頭",
        "description": "想看黃昏夕陽打在淡水河上的景色",
        "created_at": "2026/03/12 14:30",
        "fulfilled": True,
        "claimed_by": "crowd_001",
        "fulfilled_by": "crowd_001",
        "fulfilled_at": "2026/03/13 17:45",
        "fulfilled_video_url": "https://www.w3schools.com/html/mov_bbb.mp4",
        "pre_voice_url": None,
    },
    {
        "id": "wish_003",
        "patient_id": "patient_504A",
        "patient_name": "陳美玲",
        "patient_bed": "504-A號病房",
        "place_name": "淡水老街",
        "description": "想看漁人碼頭的海邊風景",
        "created_at": "2026/03/13 10:00",
        "fulfilled": False,
        "claimed_by": None,
        "pre_voice_url": None,
    },
]

# ── 微表情情緒警報（M55M1 板子偵測）──────────────────
EMOTION_ALERTS: List[dict] = [
    {
        "id": "alert_demo_01",
        "patient_id": "patient_503B",
        "patient_name": "王小明",
        "bed": "503-B",
        "hospital": "台北總院",
        "emotion": "sad",
        "emotion_label": "難過",
        "confidence": 0.87,
        "timestamp": "2026/03/13 09:41",
        "doctor_id": "doctor_001",
        "acknowledged": False,
    },
    {
        "id": "alert_demo_02",
        "patient_id": "patient_504A",
        "patient_name": "陳美玲",
        "bed": "504-A",
        "hospital": "台北總院",
        "emotion": "anxious",
        "emotion_label": "焦慮",
        "confidence": 0.79,
        "timestamp": "2026/03/13 08:15",
        "doctor_id": "doctor_001",
        "acknowledged": False,
    },
]
