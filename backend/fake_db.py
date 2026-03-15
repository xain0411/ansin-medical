# backend/fake_db.py
# 所有假資料集中在這裡，方便之後換成真實資料庫

from typing import List, Dict

# ── 使用者 ──────────────────────────────────────────────
USERS: Dict[str, dict] = {
    "patient_503B": {"id": "patient_503B", "role": "patient", "name": "王小明", "bed": "503-B", "hospital": "台北總院"},
    "patient_504A": {"id": "patient_504A", "role": "patient", "name": "陳美玲", "bed": "504-A", "hospital": "台北總院"},
    "doctor_001":   {"id": "doctor_001",   "role": "doctor",  "name": "林醫師", "dept": "內科", "hospital": "台北總院"},
    "doctor_002":   {"id": "doctor_002",   "role": "doctor",  "name": "陳醫師", "dept": "外科", "hospital": "台中分院"},
    "doctor_003":   {"id": "doctor_003",   "role": "doctor",  "name": "李醫師", "dept": "骨科", "hospital": "高雄分院"},
    "crowd_001":    {"id": "crowd_001",    "role": "crowd",   "name": "張大志", "points": 2610},
    "crowd_002":    {"id": "crowd_002",    "role": "crowd",   "name": "李志明", "points": 3890},
    "crowd_003":    {"id": "crowd_003",    "role": "crowd",   "name": "陳小芬", "points": 1560},
    "crowd_004":    {"id": "crowd_004",    "role": "crowd",   "name": "王建國", "points": 820},
    "crowd_005":    {"id": "crowd_005",    "role": "crowd",   "name": "林美惠", "points": 5200},
    "crowd_006":    {"id": "crowd_006",    "role": "crowd",   "name": "黃俊豪", "points": 980},
    "crowd_007":    {"id": "crowd_007",    "role": "crowd",   "name": "吳雅婷", "points": 4100},
}

# ── 病患狀態訊息（醫聲相伴）──────────────────────────
MESSAGES: List[dict] = [
    {"id": 1, "patient_id": "patient_503B", "bed": "503-B", "emotion": "焦慮",
     "text": "醫生，我今天早上的頭很暈，還有點想吐，請問這是怎麼回事啊？",
     "timestamp": "2026/1/4 09:31", "replied": False, "reply_text": None},
    {"id": 2, "patient_id": "patient_503B", "bed": "503-B", "emotion": "開心",
     "text": "今天病情有好轉，感謝醫生！",
     "timestamp": "2026/1/4 13:19", "replied": True,
     "reply_text": "很高興您的狀況有改善！請繼續好好休息，明天我們會再做一次檢查確認。"},
    {"id": 3, "patient_id": "patient_503B", "bed": "503-B", "emotion": "有問題",
     "text": "可以開始做復健了嗎？",
     "timestamp": "2026/1/3 12:15", "replied": True,
     "reply_text": "根據您目前的恢復狀況，明天可以開始輕度復健，復健師會來說明注意事項。"},
    {"id": 4, "patient_id": "patient_504A", "bed": "504-A", "emotion": "難過",
     "text": "發炎的情況有沒有好轉？我還是覺得很不舒服",
     "timestamp": "2026/1/2 10:49", "replied": False, "reply_text": None},
    {"id": 5, "patient_id": "patient_503B", "bed": "503-B", "emotion": "有問題",
     "text": "今天照完X光，結果什麼時候出來？",
     "timestamp": "2026/1/1 15:22", "replied": True,
     "reply_text": "X光結果明天上午會出來，我會在巡房時跟您詳細說明。"},
]

# ── 待回覆病患清單（醫生端）─────────────────────────
PENDING_PATIENTS = [
    {"bed": "503-B", "patient_name": "王小明", "latest_emotion": "焦慮", "unread": 1, "hospital": "台北總院", "timestamp": "2026/1/4 09:31", "star_color": "red"},
    {"bed": "504-A", "patient_name": "陳美玲", "latest_emotion": "難過", "unread": 1, "hospital": "台北總院", "timestamp": "2026/1/2 10:49", "star_color": "yellow"},
    {"bed": "506-B", "patient_name": "李志強", "latest_emotion": "有問題", "unread": 2, "hospital": "台中分院", "timestamp": "2026/1/1 08:20", "star_color": "none"},
    {"bed": "509-C", "patient_name": "黃淑芬", "latest_emotion": "焦慮",  "unread": 1, "hospital": "高雄分院", "timestamp": "2025/12/30 14:10", "star_color": "none"},
    {"bed": "510-C", "patient_name": "林俊宏", "latest_emotion": "難過",  "unread": 1, "hospital": "台北總院", "timestamp": "2025/12/29 16:45", "star_color": "gray"},
]
DONE_PATIENTS = [
    {"bed": "503-A", "patient_name": "趙雅婷", "latest_emotion": "開心", "unread": 0, "hospital": "台北總院", "timestamp": "2026/1/3 10:00", "star_color": "none"},
    {"bed": "506-C", "patient_name": "吳建志", "latest_emotion": "開心", "unread": 0, "hospital": "台中分院", "timestamp": "2026/1/1 11:30", "star_color": "none"},
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
