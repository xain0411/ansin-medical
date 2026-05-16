"""
backend/routers/camera.py
Twipcam 即時攝影機、Windy webcams（含 TTL 快取修復）、cam-proxy、地圖景點、療癒頻道
"""
import asyncio
import math
import os
import time
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()

# ── Twipcam ──────────────────────────────────────────
TWIPCAM_LIST_URL = "https://www.twipcam.com/api/v1/cam-list.json"
_cam_cache: dict = {}
_full_cam_list: list = []

PRESET_LOCATIONS = [
    {"name": "台北市",     "lat": 25.0478, "lon": 121.5319, "category": "城市"},
    {"name": "新北市",     "lat": 25.0169, "lon": 121.4627, "category": "城市"},
    {"name": "台中市",     "lat": 24.1477, "lon": 120.6736, "category": "城市"},
    {"name": "台南市",     "lat": 22.9999, "lon": 120.2269, "category": "城市"},
    {"name": "高雄市",     "lat": 22.6273, "lon": 120.3014, "category": "城市"},
    {"name": "陽明山國家公園", "lat": 25.1667, "lon": 121.5500, "category": "山林"},
    {"name": "太魯閣國家公園", "lat": 24.1425, "lon": 121.4778, "category": "山林"},
    {"name": "阿里山",     "lat": 23.5084, "lon": 120.8023, "category": "山林"},
    {"name": "合歡山",     "lat": 24.1417, "lon": 121.2833, "category": "山林"},
    {"name": "司馬庫斯",   "lat": 24.6000, "lon": 121.3667, "category": "山林"},
    {"name": "觀霧",       "lat": 24.5333, "lon": 121.0667, "category": "山林"},
    {"name": "南投縣",     "lat": 23.8400, "lon": 120.9900, "category": "山林"},
    {"name": "日月潭",     "lat": 23.8655, "lon": 120.9147, "category": "湖泊"},
    {"name": "翠峰湖",     "lat": 24.5667, "lon": 121.4333, "category": "湖泊"},
    {"name": "嘉明湖",     "lat": 23.2833, "lon": 121.0167, "category": "湖泊"},
    {"name": "墾丁",       "lat": 21.9387, "lon": 120.8419, "category": "海岸"},
    {"name": "東北角",     "lat": 25.1206, "lon": 121.8750, "category": "海岸"},
    {"name": "基隆港",     "lat": 25.1276, "lon": 121.7391, "category": "海岸"},
    {"name": "宜蘭南方澳", "lat": 24.5833, "lon": 121.8333, "category": "海岸"},
    {"name": "花蓮港",     "lat": 23.9960, "lon": 121.6018, "category": "海岸"},
    {"name": "台東成功港", "lat": 23.0833, "lon": 121.3667, "category": "海岸"},
    {"name": "澎湖縣",     "lat": 23.5711, "lon": 119.5793, "category": "海岸"},
    {"name": "綠島",       "lat": 22.6667, "lon": 121.4833, "category": "海岸"},
    {"name": "池上稻田",   "lat": 23.1167, "lon": 121.2167, "category": "農林漁牧"},
    {"name": "富里鄉",     "lat": 23.3000, "lon": 121.2833, "category": "農林漁牧"},
    {"name": "桃園埤塘",   "lat": 24.9936, "lon": 121.3010, "category": "農林漁牧"},
    {"name": "彰化沿海",   "lat": 24.0681, "lon": 120.5418, "category": "農林漁牧"},
    {"name": "台南官田",   "lat": 23.1500, "lon": 120.3333, "category": "農林漁牧"},
    {"name": "大安森林公園",   "lat": 25.0297, "lon": 121.5356, "category": "公園"},
    {"name": "台北植物園",     "lat": 25.0333, "lon": 121.5083, "category": "公園"},
    {"name": "高雄都會公園",   "lat": 22.7000, "lon": 120.3000, "category": "公園"},
]

THERAPEUTIC_CHANNELS: List[dict] = [
    {"id": "tc_001", "category": "森林", "name": "4K深林鳥鳴 · 8小時",
     "description": "4K畫質・知更鳥與黑鸝輪番歌唱，置身英國古老森林晨曦",
     "embed_url": "https://www.youtube-nocookie.com/embed/FxAgAyZYXJ8?autoplay=1",
     "thumbnail": "🌿", "lat": 51.5074, "lng": -0.1278, "source": "youtube"},
    {"id": "tc_002", "category": "森林", "name": "亞馬遜雨林自然聲",
     "description": "巴西亞馬遜熱帶雨林，蟲鳴鳥叫聲不絕於耳",
     "embed_url": "https://www.youtube-nocookie.com/embed/ydYDqZQpim8?autoplay=1",
     "thumbnail": "🌳", "lat": -3.4653, "lng": -62.2159, "source": "youtube"},
    {"id": "tc_003", "category": "森林", "name": "台灣山林自然聲音",
     "description": "台灣深山林間，溪流鳥鳴輕風，最純粹的自然療癒",
     "embed_url": "https://www.youtube-nocookie.com/embed/BHACKCNDMW8?autoplay=1",
     "thumbnail": "🌲", "lat": 23.6978, "lng": 120.9605, "source": "youtube"},
    {"id": "tc_004", "category": "海洋", "name": "最療癒海浪聲",
     "description": "溫柔海浪輕拍沙灘，適合入眠、讀書、放空的最佳白噪音",
     "embed_url": "https://www.youtube-nocookie.com/embed/vPhg6sc1Mk4?autoplay=1",
     "thumbnail": "🌊", "lat": 25.0375, "lng": 121.5637, "source": "youtube"},
    {"id": "tc_005", "category": "海洋", "name": "11小時 4K深海珍稀生物",
     "description": "11小時 4K畫質・罕見多彩深海生物悠游，搭配療癒輕音樂",
     "embed_url": "https://www.youtube-nocookie.com/embed/G52dUQLxPzg?autoplay=1",
     "thumbnail": "🐟", "lat": 21.3069, "lng": -157.8583, "source": "youtube"},
    {"id": "tc_006", "category": "海洋", "name": "海浪與海鷗聲 8小時",
     "description": "遠洋海浪與海鷗鳴叫交織，彷彿身在無人海灘",
     "embed_url": "https://www.youtube-nocookie.com/embed/bn9F19Hi1Lk?autoplay=1",
     "thumbnail": "🏖️", "lat": 22.6273, "lng": 120.3014, "source": "youtube"},
    {"id": "tc_007", "category": "農村", "name": "日本 4K 風景紀錄片",
     "description": "京都古道、富士山腳、農村四季，配上療癒輕音樂",
     "embed_url": "https://www.youtube-nocookie.com/embed/D48T0wNm96w?autoplay=1",
     "thumbnail": "🗻", "lat": 35.3607, "lng": 138.7274, "source": "youtube"},
    {"id": "tc_008", "category": "農村", "name": "雨天農村白噪音",
     "description": "細雨打在農舍屋頂與稻葉的聲音，最溫柔的療癒",
     "embed_url": "https://www.youtube-nocookie.com/embed/q76bMs-NwRk?autoplay=1",
     "thumbnail": "🌧️", "lat": 23.1167, "lng": 121.2167, "source": "youtube"},
    {"id": "tc_009", "category": "鳥類", "name": "4K美麗鳥類 · 8小時",
     "description": "4K畫質・美國華盛頓州各種珍稀野鳥近距離觀察，無音樂純自然聲",
     "embed_url": "https://www.youtube-nocookie.com/embed/rV_ERKtNyNA?autoplay=1",
     "thumbnail": "🐦", "lat": 47.7511, "lng": -120.7401, "source": "youtube"},
    {"id": "tc_010", "category": "鳥類", "name": "日本奧大山・北谷澤溪流",
     "description": "日本清澈山溪與翠綠植物，流水聲舒緩疲憊身心",
     "embed_url": "https://www.youtube-nocookie.com/embed/lKfK71JsjZY?autoplay=1",
     "thumbnail": "💧", "lat": 35.3667, "lng": 133.5500, "source": "youtube"},
]


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat/2)**2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


async def _fetch_full_cam_list() -> list:
    global _full_cam_list
    if _full_cam_list:
        return _full_cam_list
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(TWIPCAM_LIST_URL)
        resp.raise_for_status()
        data = resp.json()
        _full_cam_list = data if isinstance(data, list) else []
        for cam in _full_cam_list:
            if cam.get("id") and cam.get("cam_url"):
                _cam_cache[cam["id"]] = cam["cam_url"]
        return _full_cam_list


@router.get("/api/map/pins")
def get_map_pins():
    try:
        import fake_db as fdb
        return {"pins": fdb.MAP_PINS}
    except Exception:
        return {"pins": []}


@router.get("/api/map/pins/{pin_id}")
def get_pin_detail(pin_id: str):
    try:
        import fake_db as fdb
        pin = next((p for p in fdb.MAP_PINS if p["id"] == pin_id), None)
    except Exception:
        pin = None
    if not pin:
        raise HTTPException(404, "地標不存在")
    return pin


@router.get("/api/therapeutic-channels")
def get_therapeutic_channels():
    return {"channels": THERAPEUTIC_CHANNELS, "total": len(THERAPEUTIC_CHANNELS)}


@router.get("/api/twipcam/nearby")
async def get_nearby_cameras(lat: float = 25.0330, lon: float = 121.5654, limit: int = 20):
    try:
        all_cams = await _fetch_full_cam_list()
        cams_with_dist = []
        for cam in all_cams:
            if cam.get("lat") and cam.get("lon"):
                dist = _haversine_km(lat, lon, cam["lat"], cam["lon"])
                cams_with_dist.append({**cam, "_dist_km": dist})
        cams_with_dist.sort(key=lambda c: c["_dist_km"])
        result = cams_with_dist[:limit]
        return {"cameras": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(502, f"Twipcam API 無回應：{e}")


@router.get("/api/twipcam/presets")
async def get_preset_cameras():
    try:
        all_cams = await _fetch_full_cam_list()
    except Exception as e:
        raise HTTPException(502, f"Twipcam cam-list.json 無回應：{e}")
    result = []
    seen_ids: set = set()
    for loc in PRESET_LOCATIONS:
        cams_with_dist = []
        for cam in all_cams:
            if cam.get("lat") and cam.get("lon") and cam.get("id") not in seen_ids:
                dist = _haversine_km(loc["lat"], loc["lon"], cam["lat"], cam["lon"])
                cams_with_dist.append({**cam, "_dist_km": dist, "region": loc["name"]})
        cams_with_dist.sort(key=lambda c: c["_dist_km"])
        for cam in cams_with_dist[:6]:
            seen_ids.add(cam["id"])
            result.append(cam)
    return {"cameras": result, "total": len(result)}


# ── Windy（TTL 快取修復）────────────────────────────────

WINDY_API_KEY = os.environ.get("WINDY_API_KEY", "")
_WINDY_TTL = 3600  # 1 小時
_windy_cache: dict = {}  # cache_key -> {"data": [...], "expires_at": float}

_WINDY_SEARCH_LOCATIONS = [
    {"name": "東京",   "lat": 35.6762, "lon": 139.6503, "radius": 80},
    {"name": "京都",   "lat": 35.0116, "lon": 135.7681, "radius": 50},
    {"name": "大阪",   "lat": 34.6937, "lon": 135.5023, "radius": 50},
    {"name": "首爾",   "lat": 37.5665, "lon": 126.9780, "radius": 60},
    {"name": "峇里島", "lat": -8.3405, "lon": 115.0920, "radius": 80},
    {"name": "新加坡", "lat":  1.3521, "lon": 103.8198, "radius": 50},
    {"name": "香港",   "lat": 22.3193, "lon": 114.1694, "radius": 40},
    {"name": "富士山", "lat": 35.3606, "lon": 138.7274, "radius": 40},
    {"name": "沖繩",   "lat": 26.2124, "lon": 127.6809, "radius": 60},
    {"name": "台灣",   "lat": 23.6978, "lon": 120.9605, "radius": 300},
]


async def _fetch_windy_nearby(client, lat, lon, radius, limit=15) -> list:
    try:
        resp = await client.get(
            "https://api.windy.com/webcams/api/v3/webcams",
            headers={"x-windy-api-key": WINDY_API_KEY},
            params={"nearby": f"{lat},{lon},{radius}", "limit": limit,
                    "include": "location,player", "orderby": "popularity"}
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception:
        return []
    cameras = []
    for wc in data.get("webcams", []):
        loc    = wc.get("location", {})
        player = wc.get("player", {})
        live_obj = player.get("live") or {}
        day_obj  = player.get("day")  or {}
        if isinstance(live_obj, str): live_obj = {"embed": live_obj}
        if isinstance(day_obj,  str): day_obj  = {"embed": day_obj}
        embed = live_obj.get("embed") or day_obj.get("embed") or ""
        if not embed:
            continue
        cameras.append({
            "id":        f"windy_{wc['webcamId']}",
            "name":      wc.get("title", str(wc["webcamId"])),
            "lat":       loc.get("latitude"),
            "lon":       loc.get("longitude"),
            "city":      loc.get("city", ""),
            "country":   loc.get("country", ""),
            "source":    "windy",
            "embed_url": embed,
            "is_live":   bool(live_obj.get("embed")),
        })
    return cameras


@router.get("/api/windy/webcams")
async def get_windy_webcams(lat: Optional[float] = None, lon: Optional[float] = None,
                             radius: int = 100, limit: int = 15):
    if not WINDY_API_KEY:
        return {"cameras": [], "message": "Windy API Key 未設定"}

    if lat is not None and lon is not None:
        search_locs = [{"lat": lat, "lon": lon, "radius": radius}]
        cache_key = f"{lat:.1f}_{lon:.1f}_{radius}"
    else:
        search_locs = _WINDY_SEARCH_LOCATIONS
        cache_key = "preset_multi"

    # TTL 快取修復：檢查是否過期
    entry = _windy_cache.get(cache_key)
    if entry and time.time() < entry["expires_at"]:
        return {"cameras": entry["data"]}

    all_cameras = []
    seen_ids: set = set()
    async with httpx.AsyncClient(timeout=20.0) as client:
        tasks = [_fetch_windy_nearby(client, loc["lat"], loc["lon"],
                                     loc.get("radius", 100), limit)
                 for loc in search_locs]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, list):
            for cam in result:
                if cam["id"] not in seen_ids and cam["lat"] and cam["lon"]:
                    seen_ids.add(cam["id"])
                    all_cameras.append(cam)

    # 儲存帶 TTL 的快取
    _windy_cache[cache_key] = {
        "data": all_cameras,
        "expires_at": time.time() + _WINDY_TTL,
    }
    print(f"[WINDY] 共載入 {len(all_cameras)} 個景觀攝影機")
    return {"cameras": all_cameras}


@router.get("/api/windy/debug")
async def windy_debug():
    if not WINDY_API_KEY:
        return {"error": "no key"}
    tests = [
        ("nearby_query", "https://api.windy.com/webcams/api/v3/webcams",
         {"nearby": "35.6762,139.6503,80", "limit": 3, "include": "location,player"}),
        ("nearby_path",  "https://api.windy.com/webcams/api/v3/webcams/nearby/35.6762/139.6503/80",
         {"limit": 3, "include": "location,player"}),
        ("list_all",     "https://api.windy.com/webcams/api/v3/webcams",
         {"limit": 3, "include": "location,player"}),
    ]
    results = {}
    async with httpx.AsyncClient(timeout=15.0) as client:
        for name, url, params in tests:
            try:
                resp = await client.get(url, headers={"x-windy-api-key": WINDY_API_KEY}, params=params)
                ct = resp.headers.get("content-type", "")
                results[name] = {"status": resp.status_code,
                                 "body": resp.json() if "json" in ct else resp.text[:300]}
            except Exception as e:
                results[name] = {"error": str(e)}
    return results


@router.get("/api/cam-proxy/{cam_id}")
async def cam_proxy(cam_id: str):
    cam_url = _cam_cache.get(cam_id)
    if not cam_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(TWIPCAM_LIST_URL)
                resp.raise_for_status()
                for cam in (resp.json() if isinstance(resp.json(), list) else []):
                    if cam.get("id") == cam_id:
                        cam_url = cam.get("cam_url")
                        _cam_cache[cam_id] = cam_url
                        break
        except Exception:
            pass
    if not cam_url:
        raise HTTPException(404, "攝影機不存在或 URL 未知")

    try:
        async with httpx.AsyncClient(timeout=10.0) as probe:
            head_resp = await probe.head(cam_url)
            upstream_ct = head_resp.headers.get("content-type", "")
    except Exception:
        upstream_ct = ""

    if not upstream_ct:
        upstream_ct = "image/jpeg" if (cam_url.endswith(".jpg") or "snapshot" in cam_url) \
                      else "multipart/x-mixed-replace; boundary=myboundary"

    async def stream_mjpeg():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "GET", cam_url,
                    timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0),
                    headers={"User-Agent": "Mozilla/5.0"},
                ) as r:
                    if "snapshot" in cam_url or cam_url.endswith(".jpg"):
                        boundary = b"--myboundary"
                        while True:
                            try:
                                snap = await client.get(cam_url, timeout=5.0)
                                data = snap.content
                                yield boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + data + b"\r\n"
                            except Exception:
                                break
                            await asyncio.sleep(2)
                    else:
                        async for chunk in r.aiter_bytes(8192):
                            yield chunk
        except Exception:
            return

    final_ct = upstream_ct if upstream_ct else "multipart/x-mixed-replace; boundary=myboundary"
    return StreamingResponse(stream_mjpeg(), media_type=final_ct)
