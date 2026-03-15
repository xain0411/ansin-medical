// frontend/js/app.js

// ── 字體大小切換系統 ───────────────────────────────
const FONT_SIZES = ['small', 'medium', 'large'];
const FONT_LABELS = { small: '小', medium: '中', large: '大' };

function applyFontSize(size) {
  document.documentElement.setAttribute('data-font-size', size);
  localStorage.setItem('ansin-font-size', size);
  // 更新所有按鈕上的文字
  document.querySelectorAll('.font-size-label').forEach(el => {
    el.textContent = `🔍點擊切換字體：${FONT_LABELS[size]}`;
  });
}

function cycleFontSize() {
  const current = document.documentElement.getAttribute('data-font-size') || 'medium';
  const idx = FONT_SIZES.indexOf(current);
  const next = FONT_SIZES[(idx + 1) % FONT_SIZES.length];
  applyFontSize(next);
  showToast(`已切換為：${FONT_LABELS[next]}字體`);
}

function buildFontBtn() {
  const btn = document.createElement('button');
  btn.className = 'font-size-btn';
  btn.title = '切換字體大小（小 / 中 / 大）';
  btn.addEventListener('click', cycleFontSize);
  btn.innerHTML = `
    <span class="font-size-label">🔍點擊切換字體：中</span>
  `;
  return btn;
}

// 在所有 topbar-right 自動注入字體按鈕
document.querySelectorAll('.topbar-right').forEach(right => {
  right.prepend(buildFontBtn());
});



// 初始化：套用儲存的字體大小，若沒有則不強制設定
const savedSize = localStorage.getItem('ansin-font-size');
if (savedSize && FONT_SIZES.includes(savedSize)) {
  applyFontSize(savedSize);
} else {
  // 保持預設 (Medium)，不主動掛載屬性以免破壞 CSS 預設
  document.querySelectorAll('.font-size-label').forEach(el => {
    el.textContent = `字 ${FONT_LABELS['medium']}`;
  });
}

// ── 全域狀態 ──────────────────────────────────────
const state = {
  currentUser: null,
  selectedEmotion: null,
  currentBed: null,       // 醫生端正在查看的病房
  currentMsgId: null,     // 醫生端正在回覆的訊息 ID
  isRecording: false,
};

// ── 工具函式 ──────────────────────────────────────
function showToast(msg, duration = 2500) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove("show"), duration);
}

function goTo(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
    window.scrollTo(0, 0);
  }
}

function showSkeleton(containerId, count = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array(count)
    .fill('<div class="skeleton"></div>')
    .join("");
}

// ── 角色選擇 ──────────────────────────────────────
document.querySelectorAll(".role-card").forEach((card) => {
  card.addEventListener("click", () => {
    const role = card.dataset.role;
    if (role === "patient") goTo("screen-login");
    else if (role === "doctor") goTo("screen-doctor-login");
    else if (role === "crowd") goTo("screen-crowd-login");
  });
});

// ── 返回按鈕 ──────────────────────────────────────
document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => goTo(btn.dataset.back));
});

// ── 共用 Modal (設定 / 個人資料) ─────────────────────────────────
document.querySelectorAll(".icon-btn").forEach((btn) => {
  if (btn.textContent.includes("⚙️")) {
    btn.addEventListener("click", () => {
      document.getElementById("settingsModal").style.display = "flex";
    });
  }
});

document.querySelectorAll(".avatar-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const user = state.currentUser || { name: '訪客', role: 'none' };
    document.getElementById("profileModalAvatar").textContent = btn.textContent;
    document.getElementById("profileModalName").textContent = user.name || '訪客';

    let desc = '請先登入';
    let statusText = '未知';
    if (user.role === 'patient') {
      desc = '病床：' + (user.bed || '未知');
      statusText = '休養中 💙';
    } else if (user.role === 'doctor') {
      desc = user.dept ? (user.dept + '醫師') : '專業醫師';
      statusText = '值班中 👨‍⚕️';
    } else if (user.role === 'crowd') {
      desc = '熱心奉獻的群眾';
      statusText = (user.points || 0) + ' 點';
    }

    document.getElementById("profileModalDesc").textContent = desc;
    document.getElementById("profileModalStatus").textContent = statusText;
    document.getElementById("profileModal").style.display = "flex";
  });
});

// ── 登入（病患）──────────────────────────────────
document.getElementById("loginBtn")?.addEventListener("click", async () => {
  const userId = document.getElementById("userId").value.trim() || "patient_503B";
  const password = document.getElementById("password").value || "123";
  const bed = document.getElementById("bedInput").value.trim();
  try {
    const data = await api.login(userId, password, bed);
    state.currentUser = data.user;
    goTo("screen-patient-home");

    // 更新病患專屬資訊與歡迎語
    const userBed = data.user.bed || bed || "503-B";
    document.getElementById("patientBedTag").textContent = userBed + "號病房";
    const welcomeNameEl = document.getElementById("welcomeName");
    if (welcomeNameEl) {
      const fullName = data.user.name || '';
      // 格式化：王小明 → 王○明
      const masked = fullName.length >= 2
        ? fullName[0] + '○' + fullName.slice(2)
        : fullName || '貴賓';
      welcomeNameEl.textContent = masked;
    }

    const dateEl = document.getElementById("currentDateDisplay");
    if (dateEl) {
      const d = new Date();
      dateEl.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
  } catch {
    showToast("⚠️ 帳號或密碼錯誤");
  }
});

// ── 登入（醫生）──────────────────────────────────
document.getElementById("doctorLoginBtn")?.addEventListener("click", async () => {
  const userId = document.getElementById("doctorUserId").value.trim() || "doctor_001";
  const password = document.getElementById("doctorPassword").value || "123";
  try {
    const data = await api.login(userId, password);
    state.currentUser = data.user;
    // 更新醫生歡迎訊息
    const welcomeEl = document.getElementById("doctorWelcomeText");
    if (welcomeEl) {
      const u = data.user;
      const fullName = u.name || '醫師';
      const masked = fullName.length >= 2
        ? fullName[0] + '○' + fullName.slice(2)
        : fullName;
      const dept = u.dept || '';
      welcomeEl.textContent = `歡迎，${dept}${masked} 醫師　|　今日待辦請求如下`;
    }
    await loadDoctorList();
    goTo("screen-doctor");
  } catch {
    showToast("⚠️ 帳號或密碼錯誤");
  }
});

// ── 登入（群眾）──────────────────────────────────
document.getElementById("crowdLoginBtn")?.addEventListener("click", async () => {
  const userId = document.getElementById("crowdUserId").value.trim() || "crowd_001";
  const password = document.getElementById("crowdPassword").value || "123";
  try {
    const data = await api.login(userId, password);
    state.currentUser = data.user;
    await loadCrowdData();
    goTo("screen-crowd");
  } catch {
    showToast("⚠️ 帳號或密碼錯誤");
  }
});


// ── 任意視界：Google Maps + Twipcam 攝影機 Marker ──────────────
let _allCameras = [];      // 全部攝影機資料
let _selectedCamId = null;    // 目前選中的攝影機 ID
let _gMap = null;    // Google Maps 實例
let _infoWindow = null;    // Google Maps InfoWindow
let _gMarkers = [];      // 所有 Marker 陣列
let _gmapReady = false;   // Maps SDK 是否已初始化
let _allCrowdVideos = [];
let _crowdVideoMarkers = [];
let _searchMarker = null;   // 搜尋結果圖釘

/**
 * Google Maps SDK 載入完成後的全局 callback（在 script src callback= 指定）
 * 初始化地圖，使用暗色主題符合介面風格
 */
window.initGoogleMap = function () {
  _gmapReady = true;
  const mapEl = document.getElementById('googleMap');
  if (!mapEl) return;

  _gMap = new google.maps.Map(mapEl, {
    center: { lat: 25.0478, lng: 121.5319 },
    zoom: 12,
    disableDefaultUI: true, // 關閉預設 UI
    styles: [
      { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
      { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
      { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
      { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
      { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#334e87' }] },
      { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#023e58' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
      { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba5' }] },
      { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
      { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#023e58' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
      { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
      { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
      { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0d5ce' }] },
      { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#023747' }] },
      { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
      { featureType: 'transit', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
      { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#3a4762' }] },
      { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#0e1626' }] },
      { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
    ],
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  _infoWindow = new google.maps.InfoWindow();

  // ── 搜尋框 Autocomplete ───────────────────────
  const searchInput = document.getElementById('mapSearchInput');
  if (searchInput) {
    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
      fields: ['geometry', 'name', 'formatted_address', 'url', 'photos'],
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;

      // 移除舊搜尋圖釘
      if (_searchMarker) {
        _searchMarker.setMap(null);
        _searchMarker = null;
      }

      const loc = place.geometry.location;

      // 放大並移動地圖
      _gMap.panTo(loc);
      _gMap.setZoom(16);

      // 建立搜尋結果圖釘（紅色水滴 + 動畫）
      _searchMarker = new google.maps.Marker({
        position: loc,
        map: _gMap,
        title: place.name,
        animation: google.maps.Animation.DROP,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 40),
        },
        zIndex: 999,
      });

      // 點擊圖釘也能重新開啟 InfoWindow
      const photoUrl = place.photos?.length
        ? place.photos[0].getUrl({ maxWidth: 400 })
        : null;
      _searchMarker.addListener('click', () => {
        openPlaceInfoWindow(place.name, place.formatted_address, place.url, photoUrl, loc, _searchMarker);
      });

      // 立即開啟 InfoWindow
      openPlaceInfoWindow(place.name, place.formatted_address, place.url, photoUrl, loc, _searchMarker);
      showMissingPopup(place.name || place.formatted_address || '此地點', loc);
      searchInput.value = '';
      searchInput.blur();
    });
  }

  // ── 共用 InfoWindow 建構函式 ──────────────────
  function buildPlaceInfoContent(name, address, url, photoUrl) {
    const photo = photoUrl
      ? `<img src="${photoUrl}" style="width:100%;height:130px;object-fit:cover;border-radius:8px 8px 0 0;display:block;margin:-4px -4px 10px -4px;width:calc(100% + 8px);" />`
      : '';
    return `
      <div style="font-family:inherit;padding:4px;max-width:240px;min-width:180px;">
        ${photo}
        <div style="font-size:1rem;font-weight:bold;margin-bottom:4px;">${name}</div>
        <div style="font-size:0.82rem;color:#555;margin-bottom:8px;line-height:1.4;">${address || ''}</div>
        ${url ? `<a href="${url}" target="_blank" style="font-size:0.78rem;color:#1a73e8;text-decoration:none;">在 Google 地圖上查看 ↗</a>` : ''}
      </div>`;
  }

  function openPlaceInfoWindow(name, address, url, photoUrl, latLng, marker = null) {
    if (_infoWindow) _infoWindow.close();
    _infoWindow = new google.maps.InfoWindow({
      content: buildPlaceInfoContent(name, address, url, photoUrl),
    });
    if (marker) {
      _infoWindow.open(_gMap, marker);
    } else {
      _infoWindow.setPosition(latLng);
      _infoWindow.open(_gMap);
    }
  }

  // ★ 地圖任意位置點擊 → 顯示 missing popup
  _gMap.addListener('click', async (e) => {
    if (e.placeId) {
      e.stop();

      const placeId = e.placeId;
      const service = new google.maps.places.PlacesService(_gMap);

      // 嘗試傳統 PlacesService（含照片）
      service.getDetails(
        { placeId: placeId, fields: ['name', 'formatted_address', 'url', 'photos'] },
        async (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            const photoUrl = place.photos?.length
              ? place.photos[0].getUrl({ maxWidth: 400 })
              : null;
            openPlaceInfoWindow(place.name, place.formatted_address, place.url, photoUrl, e.latLng);
            showMissingPopup(place.name || place.formatted_address || '此地點', e.latLng);
          } else {
            try {
              // Fallback：Places API (New) REST，加入 photos 欄位
              const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=zh-TW`, {
                headers: {
                  'X-Goog-Api-Key': 'AIzaSyA_G5S_jQxEPO0RQrI0NfDAaDoHPp74Uwk',
                  'X-Goog-FieldMask': 'id,displayName,formattedAddress,websiteUri,photos'
                }
              });

              if (res.ok) {
                const data = await res.json();
                const name = data.displayName?.text || '此地點';
                const addr = data.formattedAddress || '';
                const uri = data.websiteUri || '';
                const photo = data.photos?.[0];
                const photoUrl = photo
                  ? `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=400&key=AIzaSyA_G5S_jQxEPO0RQrI0NfDAaDoHPp74Uwk`
                  : null;
                openPlaceInfoWindow(name, addr, uri, photoUrl, e.latLng);
                showMissingPopup(name, e.latLng);
              } else {
                throw new Error('Fallback API Failed: ' + res.status);
              }
            } catch (err) {
              console.error(err);
              const latLng = e.latLng;
              const nearCam = _allCameras.reduce((best, c) => {
                const d = Math.abs(c.lat - latLng.lat()) + Math.abs(c.lon - latLng.lng());
                return (!best || d < best.d) ? { d, region: c.region } : best;
              }, null);
              showMissingPopup(nearCam?.region || '這個地點', latLng);
            }
          }
        }
      );
    } else {
      console.log('Empty Map Region Clicked');
      // 點在非 POI 的空白地圖 → 找最近的攝影機地區名
      const latLng = e.latLng;
      const nearCam = _allCameras.reduce((best, c) => {
        const d = Math.abs(c.lat - latLng.lat()) + Math.abs(c.lon - latLng.lng());
        return (!best || d < best.d) ? { d, region: c.region, name: c.name } : best;
      }, null);
      const locationName = nearCam?.region || '此地點';
      if (_infoWindow) _infoWindow.close();
      showMissingPopup(locationName, latLng);
    }
  });

  if (_allCameras.length > 0) {
    addTwipcamMarkers(_allCameras);
  }
};

/**
 * 載入 Twipcam 攝影機資料，並在 Google Maps 上加 Marker
 */
// ── 任意視界分類切換 ─────────────────────────────────────────
const _TC_CATEGORY_MAP = {
  nature: ['森林', '山景', '農村'],
  ocean:  ['海洋', '海岸'],
  farm:   ['農村', '農林牧'],
  bird:   ['鳥類', '生態'],
};
let _therapeuticChannels = [];

function stopTherapeuticIframe() {
  const iframe = document.getElementById('tcIframe');
  if (iframe) {
    // 清空 src 讓瀏覽器停止播放（包含音訊）
    iframe.src = 'about:blank';
    iframe.remove();
  }
  // 同時也確保 MJPEG img 停止
  const camImg = document.getElementById('camImg');
  if (camImg) camImg.src = '';
}

async function switchAnyviewTab(tab, btn) {
  // 更新 tab 樣式
  document.querySelectorAll('.av-cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const mapWrap  = document.getElementById('mapPanelWrap');
  const tcList   = document.getElementById('therapeuticList');

  if (tab === 'map') {
    stopTherapeuticIframe();  // 切回地圖時停止影片
    resetToPlaceholder();
    if (mapWrap) mapWrap.style.display = 'block';
    if (tcList)  tcList.style.display  = 'none';
    return;
  }

  // 顯示療癒精選
  if (mapWrap) mapWrap.style.display = 'none';
  if (tcList)  tcList.style.display  = 'flex';

  // 載入資料（只抓一次）
  if (!_therapeuticChannels.length) {
    try {
      const data = await api.getTherapeuticChannels();
      _therapeuticChannels = data.channels || [];
    } catch { _therapeuticChannels = []; }
  }

  const cats = _TC_CATEGORY_MAP[tab] || [];
  const filtered = _therapeuticChannels.filter(c => cats.includes(c.category));

  if (!filtered.length) {
    tcList.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:24px;font-size:0.82rem">暫無此分類頻道</div>`;
    return;
  }

  tcList.innerHTML = filtered.map(ch => `
    <div class="tc-card" onclick="playTherapeuticChannel('${ch.id}','${ch.name.replace(/'/g,'&apos;')}')">
      <div class="tc-card-thumb">${ch.thumbnail}</div>
      <div class="tc-card-body">
        <div class="tc-card-name">${ch.name}</div>
        <div class="tc-card-desc">${ch.description}</div>
      </div>
    </div>`).join('');
}

function playTherapeuticChannel(chId, chName) {
  const ch = _therapeuticChannels.find(c => c.id === chId);
  if (!ch) return;

  // 顯示影片區
  const placeholder = document.getElementById('camPlaceholder');
  const controls    = document.getElementById('videoControls');
  const liveBadge   = document.getElementById('videoLiveBadge');
  const liveText    = document.getElementById('videoLiveText');
  const liveLabel   = document.getElementById('videoLiveDot');

  if (placeholder) placeholder.style.display = 'none';

  // 移除舊 MJPEG img，換成 iframe
  const panel = document.querySelector('.video-panel');
  if (!panel) return;
  const oldImg    = document.getElementById('camImg');
  const oldIframe = document.getElementById('tcIframe');
  if (oldImg)    oldImg.style.display = 'none';
  if (oldIframe) oldIframe.remove();

  const iframe = document.createElement('iframe');
  iframe.id    = 'tcIframe';
  iframe.src   = ch.embed_url;
  iframe.allow = 'autoplay; fullscreen; encrypted-media';
  iframe.setAttribute('allowfullscreen', '');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#000';
  // 若 YouTube 影片已下架或私人，顯示提示
  iframe.onerror = () => {
    iframe.style.display = 'none';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1b2e;color:rgba(255,255,255,0.5);gap:10px;font-size:0.85rem;text-align:center;padding:16px';
    errDiv.innerHTML = '<div style="font-size:2.5rem">📡</div><div>此頻道目前暫時無法播放<br><span style="font-size:0.72rem;opacity:.7">請稍後再試或選擇其他頻道</span></div>';
    panel.appendChild(errDiv);
  };
  panel.insertBefore(iframe, panel.firstChild);

  if (liveBadge) { liveBadge.style.display = 'flex'; }
  if (liveText)  { liveText.textContent = `${ch.category} · 療癒精選`; }
  if (liveLabel) { liveLabel.style.background = '#2d8f61'; }
  if (controls)  { controls.style.display = 'flex'; }

  _selectedCamId = chId;
  document.getElementById('aiBubble')?.remove();

  // 更新 AI 導覽用的名稱
  const cam = { id: chId, name: chName, description: ch.description };
  _allCameras = _allCameras.filter(c => c.id !== chId);
  _allCameras.push(cam);
}

async function loadTwipcamCameras() {
  // 如果地圖尚未 ready，顯示「等待地圖」提示
  const mapEl = document.getElementById('googleMap');
  if (mapEl && !_gmapReady) {
    mapEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100%;flex-direction:column;gap:12px;
                  background:#0d1b2e;color:rgba(255,255,255,0.5);font-size:0.85rem">
        <div style="font-size:2rem;animation:pulse 1.2s infinite">🗺️</div>
        <div>Google Maps 地圖初始化中…</div>
      </div>`;
  }

  try {
    const data = await api.getTwipcamPresets();
    _allCameras = data.cameras || [];

    // 若 Maps 已 ready，立即加 Marker；否則等 initGoogleMap 呼叫
    if (_gmapReady && _gMap) {
      addTwipcamMarkers(_allCameras);
    }
  } catch (err) {
    showToast('⚠️ Twipcam 攝影機載入失敗，請確認網路');
  }
}

/**
 * 載入群眾已上傳影片的 Marker
 */
async function loadCrowdVideoMarkers() {
  try {
    const data = await api.getCrowdVideos();
    _allCrowdVideos = data.videos || [];
    if (_gmapReady && _gMap) {
      addCrowdVideoMarkers(_allCrowdVideos);
    }
  } catch (err) {
    console.warn('群眾影片載入失敗: ', err);
  }
}

function addCrowdVideoMarkers(videos) {
  if (!_gMap) return;
  _crowdVideoMarkers.forEach(m => m.setMap(null));
  _crowdVideoMarkers = [];

  const svgIcon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#f5a623" stroke="#fff" stroke-width="2"/>
        <text x="16" y="21" text-anchor="middle" font-size="16">▶️</text>
      </svg>
    `)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };

  videos.forEach(v => {
    if (!v.lat || !v.lng) return;
    const marker = new google.maps.Marker({
      position: { lat: v.lat, lng: v.lng },
      map: _gMap,
      title: v.location,
      icon: svgIcon,
      optimized: false,
    });

    marker.addListener('click', () => {
      if (_infoWindow) _infoWindow.close();
      selectCrowdVideo(v);
    });
    _crowdVideoMarkers.push(marker);
  });
}

function selectCrowdVideo(v) {
  hideMissingPopup();
  _selectedCamId = null; // not a twipcam
  const camStream = document.getElementById('camStream');
  const crowdVideoPlayer = document.getElementById('crowdVideoPlayer');
  const placeholder = document.getElementById('camPlaceholder');
  const loading = document.getElementById('camLoading');

  if (camStream) {
    camStream.style.display = 'none';
    camStream.src = '';
  }
  if (placeholder) placeholder.style.display = 'none';
  if (loading) loading.style.display = 'none';

  const youtubePlayer = document.getElementById('crowdYoutubePlayer');
  const isYoutube = v.video_url && v.video_url.includes('youtube-nocookie.com/embed');
  if (isYoutube) {
    if (crowdVideoPlayer) { crowdVideoPlayer.style.display = 'none'; crowdVideoPlayer.src = ''; crowdVideoPlayer.pause?.(); }
    if (youtubePlayer) { youtubePlayer.style.display = 'block'; youtubePlayer.style.zIndex = '5'; youtubePlayer.src = v.video_url + '?autoplay=1'; }
  } else {
    if (youtubePlayer) { youtubePlayer.style.display = 'none'; youtubePlayer.src = ''; }
    if (crowdVideoPlayer) {
      crowdVideoPlayer.style.display = 'block';
      crowdVideoPlayer.style.zIndex = '5';
      crowdVideoPlayer.src = v.video_url;
      crowdVideoPlayer.play().catch(e => console.warn('自動撥放失敗:', e));
    }
  }
  // 記錄任務 ID，顯示操作按鈕組
  _currentCrowdTaskId = v.id || v.task_id || null;
  const actionsDiv = document.getElementById('crowdVideoActions');
  if (actionsDiv) actionsDiv.style.display = 'flex';
  const thankBtn = document.getElementById('btnThankVolunteer');
  if (thankBtn) { thankBtn.disabled = false; thankBtn.textContent = '💝 感謝志工'; }

  // 顯示 Badge 與控制按鈕（群眾影片）
  const badge = document.getElementById('videoLiveBadge');
  const dot = document.getElementById('videoLiveDot');
  const txt = document.getElementById('videoLiveText');
  const controls = document.getElementById('videoControls');
  if (badge && dot && txt) {
    badge.style.display = '';
    badge.style.background = 'rgba(245,166,35,0.92)';
    badge.style.color = 'white';
    dot.style.background = 'white';
    txt.textContent = '群眾影片';
  }
  if (controls) controls.style.display = '';
  const btnClose = document.getElementById('btnCloseStream');
  const title = document.getElementById('videoPanelTitle');
  if (btnClose) btnClose.style.display = '';
  if (title) title.textContent = `▶️ ${v.location}`;
  stopGlobeAnim();
  showToast(`▶️ 正在播放：${v.location}`);
}

/**
 * 在 Google Maps 上為每台攝影機建立自訂 SVG Marker
 */
function addTwipcamMarkers(cameras) {
  if (!_gMap) return;

  // 清除舊 Marker
  _gMarkers.forEach(m => m.setMap(null));
  _gMarkers = [];

  // 自訂 SVG 攝影機圖標（亮綠色，清楚可見）
  const svgIcon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#0d1b2e" stroke="#38b27a" stroke-width="2"/>
        <text x="16" y="21" text-anchor="middle" font-size="16">📹</text>
      </svg>
    `)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };

  const bounds = new google.maps.LatLngBounds();

  cameras.forEach(cam => {
    if (!cam.lat || !cam.lon) return;

    const marker = new google.maps.Marker({
      position: { lat: cam.lat, lng: cam.lon },
      map: _gMap,
      title: cam.name || cam.id,
      icon: svgIcon,
      optimized: false,
    });

    marker.addListener('click', () => {
      if (_infoWindow) _infoWindow.close();
      selectCamera(cam);
    });

    _gMarkers.push(marker);
    bounds.extend({ lat: cam.lat, lng: cam.lon });
  });

  // 自動縮放地圖以涵蓋所有 Marker（不自動連線攝影機）
  if (_gMarkers.length > 0) {
    _gMap.fitBounds(bounds, { top: 20, right: 20, bottom: 20, left: 20 });
  }
}

function selectCamera(cam) {
  hideMissingPopup();
  _selectedCamId = cam.id;
  const camStream = document.getElementById('camStream');
  const placeholder = document.getElementById('camPlaceholder');
  const loading = document.getElementById('camLoading');
  const loadingName = document.getElementById('camLoadingName');

  // 顯示載入中狀態
  if (camStream) camStream.style.display = 'none';
  if (placeholder) placeholder.style.display = 'none';
  if (loading) loading.style.display = 'flex';
  if (loadingName) loadingName.textContent = `${cam.name || cam.id} 即時影像載入中…`;

  const ytPl = document.getElementById('crowdYoutubePlayer');
  if (ytPl) { ytPl.style.display = 'none'; ytPl.src = ''; }
  const crowdVideoPlayer = document.getElementById('crowdVideoPlayer');
  if (crowdVideoPlayer) {
    crowdVideoPlayer.style.display = 'none';
    crowdVideoPlayer.pause();
  }

  // 恢復即時影像 Badge 樣式
  const badge = document.getElementById('videoLiveBadge');
  const dot = document.getElementById('videoLiveDot');
  const txt = document.getElementById('videoLiveText');
  if (badge && dot && txt) {
    badge.style.background = 'rgba(56,178,122,0.9)';
    badge.style.color = 'white';
    dot.style.background = '#ff5555';
    txt.textContent = '即時影像';
  }

  // 建立新的 img 元素（先 clone 移除舊事件）
  const newImg = camStream ? camStream.cloneNode(false) : document.createElement('img');
  if (camStream && camStream.parentNode) {
    camStream.parentNode.replaceChild(newImg, camStream);
  }

  newImg.onload = () => {
    if (loading) loading.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    newImg.style.display = 'block';
    // 顯示 badge、控制按鈕、關閉按鈕，更新面板標題
    const badge = document.getElementById('videoLiveBadge');
    const controls = document.getElementById('videoControls');
    const btnClose = document.getElementById('btnCloseStream');
    const title = document.getElementById('videoPanelTitle');
    if (badge) badge.style.display = '';
    if (controls) controls.style.display = '';
    if (btnClose) btnClose.style.display = '';
    if (title) title.textContent = `📺 ${cam.name || cam.id}`;
    stopGlobeAnim();
    showToast(`📺 正在播放：${cam.name || cam.id}`);
  };
  newImg.onerror = () => {
    if (loading) loading.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    // 顯示連線失敗覆層，等使用者手動關閉
    const errOverlay = document.getElementById('camErrorOverlay');
    if (errOverlay) errOverlay.style.display = 'flex';
    const badge2 = document.getElementById('videoLiveBadge');
    const controls2 = document.getElementById('videoControls');
    const btnClose2 = document.getElementById('btnCloseStream');
    const title2 = document.getElementById('videoPanelTitle');
    if (badge2) badge2.style.display = 'none';
    if (controls2) controls2.style.display = 'none';
    if (btnClose2) btnClose2.style.display = 'none';   // 只用覆層內的大按鈕
    if (title2) title2.textContent = `⚠️ ${cam.name || cam.id}`;
  };
  newImg.id = 'camStream';
  newImg.alt = cam.name || cam.id;
  newImg.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
  newImg.src = api.getCamProxyUrl(cam.id);
}


let _missingLocation = "";
let _missingLatLng = null;

/**
 * 顯示底部懸浮的缺失提示卡片
 */
function showMissingPopup(name, latLng) {
  _missingLocation = name;
  _missingLatLng = latLng;
  const popup = document.getElementById("missingPopup");
  const nameEl = document.getElementById("missingLocationName");
  if (nameEl) nameEl.textContent = name;
  if (popup) popup.classList.add("show");
}

function hideMissingPopup() {
  document.getElementById("missingPopup")?.classList.remove("show");
}

// AI 導覽與靜音增強實作
document.getElementById("btnAI")?.addEventListener("click", async () => {
  const cam = _allCameras.find(c => c.id === _selectedCamId);
  const camName = cam ? cam.name : '此地點';
  const videoPanel = document.querySelector('.video-panel');

  // 建立或取得泡泡
  let bubble = document.getElementById("aiBubble");
  if (!bubble && videoPanel) {
    bubble = document.createElement("div");
    bubble.id = "aiBubble";
    bubble.style.cssText = `position:absolute;bottom:16px;left:16px;right:16px;
      background:rgba(255,255,255,0.97);color:#333;padding:12px 14px;
      border-radius:14px;font-size:0.84rem;box-shadow:0 4px 16px rgba(0,0,0,0.2);
      pointer-events:auto;z-index:30;border:1px solid rgba(78,131,255,0.2)`;
    videoPanel.appendChild(bubble);
  }
  if (!bubble) return;

  // 顯示載入中
  bubble.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <strong style="color:var(--blue-main)">🤖 AI 導覽助手</strong>
      <button onclick="document.getElementById('aiBubble').remove()"
        style="background:none;border:none;color:#aaa;font-size:1.2rem;cursor:pointer;line-height:1">✕</button>
    </div>
    <div style="color:#888;font-size:0.8rem">✨ AI 正在分析畫面，請稍候…</div>`;

  // 嘗試擷取影片畫面（群眾上傳的 <video> 元素）
  let imageBase64 = '';
  const videoEl = document.getElementById('crowdVideoPlayer') || document.querySelector('.video-panel video');
  if (videoEl && !videoEl.paused && videoEl.readyState >= 2) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = videoEl.videoWidth  || 320;
      canvas.height = videoEl.videoHeight || 180;
      canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    } catch { imageBase64 = ''; }
  }

  try {
    const res = await fetch('/api/video/ai-describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_name: camName,
        context: cam?.description || cam?.location || '',
        image_base64: imageBase64
      })
    });
    const data = await res.json();
    const desc = data.description || '無法取得介紹';
    bubble.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="color:var(--blue-main)">🤖 AI 導覽助手${data.fallback ? '' : ' ✨'}</strong>
        <button onclick="document.getElementById('aiBubble').remove()"
          style="background:none;border:none;color:#aaa;font-size:1.2rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <div style="line-height:1.55;color:#333">${desc}</div>`;
  } catch {
    bubble.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="color:var(--blue-main)">🤖 AI 導覽助手</strong>
        <button onclick="document.getElementById('aiBubble').remove()"
          style="background:none;border:none;color:#aaa;font-size:1.2rem;cursor:pointer;line-height:1">✕</button>
      </div>
      <div style="line-height:1.55">您正在觀看 <b style="color:#e85454">${camName}</b> 的即時影像。這裡風景怡人，希望能讓您心情舒暢！</div>`;
  }
});

let _isMuted = false;
document.getElementById("btnMute")?.addEventListener("click", (e) => {
  _isMuted = !_isMuted;
  const btn = e.currentTarget;
  if (_isMuted) {
    btn.innerHTML = "🔊 解除靜音";
    btn.style.background = "rgba(255,255,255,0.2)";
    showToast("🔇 已靜音");
  } else {
    btn.innerHTML = "🔇 靜音模式";
    btn.style.background = "rgba(255,255,255,0.15)";
    showToast("🔊 已解除靜音");
  }
});

// ── 景點請求 Modal ───────────────────────────────
document.getElementById("btnOpenRequest")?.addEventListener("click", () => {
  hideMissingPopup();
  document.getElementById("modalLocation").value = _missingLocation;
  document.getElementById("requestModal").classList.add("show");
});

document.getElementById("modalClose")?.addEventListener("click", () => {
  document.getElementById("requestModal").classList.remove("show");
});
document.getElementById("requestModal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget)
    document.getElementById("requestModal").classList.remove("show");
});

document.getElementById("btnSubmitRequest")?.addEventListener("click", async () => {
  // 從 input 中讀取用戶可能編輯過的地點名稱
  const finalLocation = document.getElementById("modalLocation").value.trim();
  const desc = document.getElementById("requestDesc").value.trim();
  const special = document.getElementById("requestSpecial").value.trim();
  const bed = state.currentUser?.bed || "503-B";

  if (!finalLocation) { showToast("⚠️ 請確認地點名稱"); return; }
  if (!desc) { showToast("⚠️ 請填寫拍攝內容說明"); return; }

  try {
    const lat = _missingLatLng ? _missingLatLng.lat() : null;
    const lng = _missingLatLng ? _missingLatLng.lng() : null;
    await api.createSpotRequest(finalLocation, desc, special, bed, lat, lng);
    document.getElementById("requestModal").classList.remove("show");
    showToast("✅ 請求已發送到群眾公共區！");

    // ★ 刷新群眾任務列表（讓新任務即時出現在群眾端）
    await loadCrowdData();

    // 清空輸入框
    document.getElementById("requestDesc").value = "";
    document.getElementById("requestSpecial").value = "";
  } catch {
    showToast("⚠️ 發送失敗，請稍後再試");
  }
});


// ── 醫聲相伴：病患端 ─────────────────────────────
let _allDoctors = [];

async function loadPatientMessages() {
  const patientId = state.currentUser?.id || "patient_503B";
  showSkeleton("historyList", 4);
  try {
    const [msgData, docData] = await Promise.all([
      api.getPatientMessages(patientId),
      api.getDoctors().catch(() => ({ doctors: [] }))
    ]);
    renderHistoryList(msgData.messages);

    _allDoctors = docData.doctors || [];
    const docSelect = document.getElementById("doctorSelect");
    if (docSelect) {
      docSelect.innerHTML = _allDoctors.map(d => `<option value="${d.id}">${d.dept} - ${d.name}</option>`).join("");
    }
  } catch {
    showToast("⚠️ 訊息載入失敗");
  }
}

function renderHistoryList(messages) {
  const list = document.getElementById("historyList");
  if (!messages.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;font-size:13px">尚無紀錄</div>';
    return;
  }
  // 儲存到 state 供 modal 使用
  state._patientMessages = messages;
  const emotionEmoji = { '開心': '😊', '難過': '😟', '焦慮': '😰', '有問題': '🤔' };
  list.innerHTML = messages.map((m, idx) => {
    const emo = emotionEmoji[m.emotion] || m.emotion || '';
    const preview = m.text ? (m.text.slice(0, 22) + (m.text.length > 22 ? '...' : '')) : `[${m.emotion}]`;
    return `
    <div class="history-item ${!m.replied ? 'unread' : ''}" onclick="openMsgModal(${idx})" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="history-emotion-tag">${emo}</span>
          <div class="history-text">${escHtml(preview)}</div>
        </div>
        <div style="font-size:0.68rem;margin-top:2px;${m.replied ? 'color:#38b27a' : 'color:#e67e22'}">
          ${m.replied ? '✅ 已回覆' : '⏳ 待回覆'}
        </div>
      </div>
      <div class="history-time">${(m.timestamp||'').replace(" ", "<br>")}</div>
    </div>`;
  }).join("");
}

function openMsgModal(idx) {
  const m = (state._patientMessages || [])[idx];
  if (!m) return;
  const emotionEmoji = { '開心': '😊', '難過': '😟', '焦慮': '😰', '有問題': '🤔' };
  const emo = emotionEmoji[m.emotion] || m.emotion || '';
  const modal = document.getElementById('msgDetailModal');
  if (!modal) return;
  document.getElementById('mdm-emotion').textContent = `${emo} ${m.emotion || ''}`;
  document.getElementById('mdm-time').textContent = m.timestamp || '';
  document.getElementById('mdm-text').textContent = m.text || `（${m.emotion}）`;
  const replySection = document.getElementById('mdm-reply-section');
  const replyText = document.getElementById('mdm-reply-text');
  if (m.replied && m.reply_text) {
    replyText.textContent = m.reply_text;
    replySection.style.display = 'block';
  } else {
    replySection.style.display = 'none';
  }
  // 儲存當前 msg 供朗讀使用
  modal._msgIdx = idx;
  modal.style.display = 'flex';
}

function closeMsgModal() {
  const modal = document.getElementById('msgDetailModal');
  if (modal) modal.style.display = 'none';
  window.speechSynthesis?.cancel();
}

function readMsgAloud() {
  const modal = document.getElementById('msgDetailModal');
  const idx = modal?._msgIdx;
  const m = (state._patientMessages || [])[idx];
  if (!m || !window.speechSynthesis) {
    showToast('⚠️ 此瀏覽器不支援語音朗讀');
    return;
  }
  window.speechSynthesis.cancel();
  const parts = [];
  if (m.text) parts.push(`您的留言：${m.text}`);
  if (m.replied && m.reply_text) parts.push(`醫師回覆：${m.reply_text}`);
  if (!parts.length) return;
  const utter = new SpeechSynthesisUtterance(parts.join('。'));
  utter.lang = 'zh-TW';
  utter.rate = 0.9;
  const btn = document.getElementById('mdm-read-btn');
  if (btn) { btn.textContent = '🔊 朗讀中…'; btn.disabled = true; }
  utter.onend = utter.onerror = () => {
    if (btn) { btn.textContent = '🔊 朗讀留言'; btn.disabled = false; }
  };
  window.speechSynthesis.speak(utter);
}

document.querySelectorAll(".emotion-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".emotion-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.selectedEmotion = btn.dataset.emotion;
    // 更新已選心情提示列
    const bar = document.getElementById("emotionSelectedBar");
    const txt = document.getElementById("emotionSelectedText");
    if (bar && txt) {
      txt.textContent = `已選擇：${btn.dataset.emoji || ''} ${btn.dataset.emotion}`;
      bar.style.display = 'flex';
    }
  });
});

// ══ Hugging Face Transformers.js — 情緒分析（AI 輕量化）══════════════
// 模型：Xenova/distilbert-base-multilingual-cased-sentiments-student
// 大小：~22MB (INT8 量化)，在瀏覽器內直接推論，不需伺服器
// 標籤：positive / neutral / negative

let _sentimentPipe   = null;
let _sentimentLoading = false;

async function _ensureSentimentModel(onStatus) {
  if (_sentimentPipe) return _sentimentPipe;
  if (_sentimentLoading) {
    // 等待已在進行的載入
    while (_sentimentLoading) await new Promise(r => setTimeout(r, 150));
    return _sentimentPipe;
  }
  _sentimentLoading = true;

  // 等 Transformers.js 模組就緒（ES module 非同步）
  if (!window._HFPipeline) {
    onStatus?.('🤖 Hugging Face 模型載入中，首次約需 10–20 秒…');
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 30000);
      window.addEventListener('hf-ready', () => { clearTimeout(t); resolve(); }, { once: true });
      if (window._HFPipeline) { clearTimeout(t); resolve(); }
    });
  }

  onStatus?.('🤖 AI 情緒模型初始化中…');
  _sentimentPipe = await window._HFPipeline(
    'text-classification',
    'Xenova/distilbert-base-multilingual-cased-sentiments-student',
    { quantized: true }
  );
  _sentimentLoading = false;
  onStatus?.('✅ AI 模型就緒');
  return _sentimentPipe;
}

// label 轉中文
const _SENT_MAP = {
  positive: { zh: '情緒正向', color: '#2d8f61', icon: '😊' },
  neutral:  { zh: '情緒平穩', color: '#888',    icon: '😐' },
  negative: { zh: '情緒低落', color: '#e74c3c', icon: '😟' },
};

async function runSentimentAnalysis(text) {
  const barEl  = document.getElementById('aiSentimentBar');
  const textEl = document.getElementById('aiSentimentText');
  if (!text || text.length < 3) return null;

  try {
    if (barEl) barEl.style.display = 'block';
    const pipe = await _ensureSentimentModel(msg => { if (textEl) textEl.textContent = msg; });
    if (textEl) textEl.textContent = '🤖 分析情緒中…';

    const [res] = await pipe(text, { topk: 1 });
    const label = (res.label || '').toLowerCase(); // positive | neutral | negative
    const score = Math.round((res.score || 0) * 100);
    const meta  = _SENT_MAP[label] || _SENT_MAP.neutral;

    if (textEl) {
      textEl.innerHTML = `${meta.icon} AI 偵測：<strong style="color:${meta.color}">${meta.zh}</strong>（信心 ${score}%）`;
    }
    setTimeout(() => { if (barEl) barEl.style.display = 'none'; }, 3000);
    return { label, score: res.score };
  } catch (e) {
    console.warn('Sentiment analysis error:', e);
    if (barEl) barEl.style.display = 'none';
    return null;
  }
}

// ── 送出病患訊息（含 AI 情緒分析）────────────────────
document.getElementById("btnSendMsg")?.addEventListener("click", async () => {
  const text = document.getElementById("patientMsg").value.trim();
  if (!text && !state.selectedEmotion) {
    showToast("⚠️ 請選擇心情或輸入訊息");
    return;
  }
  const emotion   = state.selectedEmotion || "有問題";
  const patientId = state.currentUser?.id  || "patient_503B";
  const bed       = state.currentUser?.bed || "503-B";
  const doctorSelect = document.getElementById("doctorSelect");
  const doctorId  = doctorSelect ? doctorSelect.value : null;

  // 先送出訊息（不等 AI），同時非同步跑情緒分析
  try {
    // 非同步執行情緒分析，不阻塞訊息送出
    const sentimentPromise = text ? runSentimentAnalysis(text) : Promise.resolve(null);

    const sentiment = await sentimentPromise;
    await api.sendPatientMessage(patientId, bed, emotion, text, doctorId, sentiment);

    document.getElementById("patientMsg").value = "";
    state.selectedEmotion = null;
    document.querySelectorAll(".emotion-btn").forEach(b => b.classList.remove("selected"));
    const bar = document.getElementById("emotionSelectedBar");
    if (bar) bar.style.display = 'none';
    showToast("✅ 訊息已傳送給醫生");
    await loadPatientMessages();
  } catch {
    showToast("⚠️ 傳送失敗");
  }
});

// ── 語音輸入 ──────────────────────────────────────
document.getElementById("btnVoiceInput")?.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("⚠️ 此瀏覽器不支援語音輸入，請使用 Chrome");
    return;
  }
  const btn = document.getElementById("btnVoiceInput");
  if (state.isRecording) return;

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  state.isRecording = true;
  btn.classList.add("recording");
  btn.title = "錄音中…";
  showToast("🎙 請說話…");

  recognition.start();

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = document.getElementById("patientMsg");
    if (input) input.value = (input.value ? input.value + ' ' : '') + transcript;
  };

  recognition.onerror = () => { showToast("⚠️ 語音辨識失敗，請再試一次"); };

  recognition.onend = () => {
    state.isRecording = false;
    btn.classList.remove("recording");
    btn.title = "語音輸入";
  };
});

document.getElementById("btnRecommendDept")?.addEventListener("click", async () => {
  const text = document.getElementById("patientMsg").value.trim();
  if (!text) {
    showToast("⚠️ 請先在輸入框填寫您的狀況，AI 才能提供建議喔！");
    return;
  }
  const btn = document.getElementById("btnRecommendDept");
  const originalText = btn.innerHTML;
  btn.innerHTML = "🤖 判斷中...";
  btn.disabled = true;

  try {
    const res = await api.recommendDept(text);
    const doctorSelect = document.getElementById("doctorSelect");
    if (doctorSelect && res.doctor_id) {
      doctorSelect.value = res.doctor_id;
      showToast(`💡 AI 判斷您剛才描述的症狀適合諮詢：${res.department}`);
    } else {
      showToast("💡 無法判斷，請手動選擇科別");
    }
  } catch (e) {
    showToast("⚠️ AI 判斷失敗");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

// ── 醫聲相伴：醫生端 ─────────────────────────────
async function loadDoctorList() {
  _lastDoctorData = null;
  showSkeleton("pendingList", 5);
  showSkeleton("doneList", 2);
  // 重置篩選器
  const hf = document.getElementById("hospitalFilter");
  const pf = document.getElementById("priorityFilter");
  if (hf) hf.value = '';
  if (pf) pf.value = '';
  try {
    const [data] = await Promise.all([
      api.getPendingPatients(),
      loadAllRxReviewStat(),
    ]);
    _lastDoctorData = data;
    renderPendingList(data.pending, data.done, data.stats);
  } catch {
    showToast("⚠️ 清單載入失敗");
  }
}

function priorityLabel(color) {
  if (color === 'red')    return '🔴 緊急';
  if (color === 'yellow') return '🟡 注意';
  return '⚪ 一般';
}

function updatePriorityCounts(pending) {
  const red    = pending.filter(p => p.star_color === 'red').length;
  const yellow = pending.filter(p => p.star_color === 'yellow').length;
  const none   = pending.filter(p => !p.star_color || p.star_color === 'none').length;
  const elR = document.getElementById('countRed');
  const elY = document.getElementById('countYellow');
  const elN = document.getElementById('countNone');
  if (elR) elR.textContent = red;
  if (elY) elY.textContent = yellow;
  if (elN) elN.textContent = none;
}

function renderPendingList(pending, done, stats) {
  const pendingEl = document.getElementById("pendingList");
  const doneEl = document.getElementById("doneList");

  // 更新儀表板數據
  if (stats) {
    const totalEl = document.getElementById("statTotal");
    const urgentEl = document.getElementById("statUrgent");
    if (totalEl) totalEl.textContent = stats.total_served;
    if (urgentEl) urgentEl.textContent = stats.urgent_cases;
  }
  // 未讀留言總數
  const totalUnread = pending.reduce((s, p) => s + (p.unread || 0), 0);
  const unreadEl = document.getElementById("statUnread");
  if (unreadEl) unreadEl.textContent = totalUnread > 0 ? totalUnread : '0';

  // 排序：依時間先後（最早留言 = 等最久 → 排最上方）
  const sorted = [...pending].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp.replace(/\//g, '-')) : 0;
    const tb = b.timestamp ? new Date(b.timestamp.replace(/\//g, '-')) : 0;
    return ta - tb;
  });

  // 更新優先等級計數
  updatePriorityCounts(pending);

  pendingEl.innerHTML = sorted.map((p) => {
    const color = p.star_color || 'none';
    const priorityClass = (color === 'red' || color === 'yellow') ? `priority-${color}` : '';
    const unreadBadge = p.unread > 0 ? `<span class="unread-badge">${p.unread}</span>` : '';

    // AI 情緒徽章（後端傳回 ai_sentiment 欄位）
    const sent = p.ai_sentiment;
    const sentScore = p.ai_sentiment_score != null ? Math.round(p.ai_sentiment_score * 100) : null;
    let aiBadge = '';
    if (sent === 'negative') {
      aiBadge = `<span class="ai-sent-badge ai-sent-neg" title="AI 偵測情緒（信心 ${sentScore}%）">
                   🤖 情緒低落${sentScore ? ` ${sentScore}%` : ''}</span>`;
    } else if (sent === 'positive') {
      aiBadge = `<span class="ai-sent-badge ai-sent-pos" title="AI 偵測情緒（信心 ${sentScore}%）">
                   🤖 情緒正向</span>`;
    }

    return `
    <div class="todo-row ${priorityClass}" data-bed="${p.bed}">
      <div style="flex:1;min-width:0;">
        <div class="todo-room">
          ${p.bed}號病房 - ${p.patient_name}
          <span class="todo-hospital">${p.hospital || '未知醫院'}</span>
          ${unreadBadge}
          ${aiBadge}
        </div>
        <div class="todo-emotion" style="display:flex; justify-content:space-between; margin-top:4px;">
           <span>${p.latest_emotion}${p.unread > 0 ? ` · 未讀 ${p.unread} 則` : ''}</span>
           <span class="todo-time">${p.timestamp || ''}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-left:12px; flex-shrink:0;">
        <button class="priority-badge ${color}" data-star="${p.bed}">${priorityLabel(color)}</button>
        <button class="view-btn">查看留言</button>
      </div>
    </div>`;
  }).join("");

  doneEl.innerHTML = done.map((p) => `
    <div class="todo-row done-row" data-bed="${p.bed}">
      <div style="flex:1;min-width:0;">
        <div class="todo-room">
          <span class="todo-done-icon">✅</span>${p.bed}號病房 - ${p.patient_name}
          <span class="todo-hospital">${p.hospital || '未知醫院'}</span>
        </div>
        <div class="todo-emotion" style="display:flex; justify-content:space-between; margin-top:4px;">
           <span>${p.latest_emotion}</span>
           <span class="todo-time">${p.timestamp || ''}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-left:12px; flex-shrink:0;">
        <button class="view-btn" style="background:#aaa">查看留言</button>
      </div>
    </div>
  `).join("");

  // 綁定點擊 (點擊卡片進入回覆)
  document.querySelectorAll(".todo-row[data-bed]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains('priority-badge')) return;
      // 從 _lastDoctorData 找到對應病患資料
      const patientRow = _lastDoctorData?.pending?.find(p => p.bed === row.dataset.bed)
        || _lastDoctorData?.done?.find(p => p.bed === row.dataset.bed)
        || null;
      openDoctorReply(row.dataset.bed, patientRow);
    });
  });

  // 綁定優先等級標籤點擊（3 等級循環：一般 → 緊急 → 注意 → 一般）
  document.querySelectorAll(".priority-badge[data-star]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const bed = btn.dataset.star;
      const colors = ['none', 'red', 'yellow'];
      const currentColor = colors.find(c => btn.classList.contains(c)) || 'none';
      const nextColor = colors[(colors.indexOf(currentColor) + 1) % colors.length];

      // 更新 UI 即時反應
      btn.classList.remove(currentColor);
      btn.classList.add(nextColor);
      btn.textContent = priorityLabel(nextColor);

      // 更新左側指示條
      const row = btn.closest('.todo-row');
      if (row) {
        row.classList.remove('priority-red', 'priority-yellow');
        if (nextColor === 'red')    row.classList.add('priority-red');
        if (nextColor === 'yellow') row.classList.add('priority-yellow');
      }

      // 更新計數
      const allBadges = [...document.querySelectorAll('#pendingList .priority-badge[data-star]')];
      const fakeList = allBadges.map(b => ({
        star_color: ['red','yellow'].find(c => b.classList.contains(c)) || 'none'
      }));
      updatePriorityCounts(fakeList);

      const toastMap = { red: '🔴 已標記為緊急', yellow: '🟡 已標記為注意', none: '⭕ 已清除標記' };
      showToast(toastMap[nextColor] || '已更新');

      try {
        await api.togglePatientStar(bed, nextColor);
      } catch {
        showToast("⚠️ 標記更新失敗，請稍後重試");
        btn.classList.remove(nextColor);
        btn.classList.add(currentColor);
        btn.textContent = priorityLabel(currentColor);
      }
    });
  });
}

// 暫存最近一次 API 資料，供前端篩選重渲染用
let _lastDoctorData = null;

function applyDoctorFilters() {
  if (!_lastDoctorData) return;
  const hospital = document.getElementById("hospitalFilter")?.value || '';
  const priority  = document.getElementById("priorityFilter")?.value  || '';

  let pending = _lastDoctorData.pending;
  let done    = _lastDoctorData.done;

  if (hospital) {
    pending = pending.filter(p => p.hospital === hospital);
    done    = done.filter(p => p.hospital === hospital);
  }
  if (priority) {
    const match = priority === 'none'
      ? p => !p.star_color || p.star_color === 'none'
      : p => p.star_color === priority;
    pending = pending.filter(match);
  }

  renderPendingList(pending, done, _lastDoctorData.stats);
}

// 監聽醫院下拉選單
document.getElementById("hospitalFilter")?.addEventListener("change", async () => {
  // 如果還沒資料，先載入
  if (!_lastDoctorData) {
    showSkeleton("pendingList", 5);
    showSkeleton("doneList", 2);
    try {
      _lastDoctorData = await api.getPendingPatients();
    } catch {
      showToast("⚠️ 清單載入失敗"); return;
    }
  }
  applyDoctorFilters();
});

// 監聽優先等級篩選
document.getElementById("priorityFilter")?.addEventListener("change", () => {
  applyDoctorFilters();
});

async function openDoctorReply(bed, patientRow) {
  state.currentBed = bed;
  document.getElementById("llmPreview").style.display = "none";
  document.getElementById("doctorReplyText").value = "";

  // 填入左側病患基本資訊（從清單 row 取得）
  const nameEl     = document.getElementById("replyPatientName");
  const roomEl     = document.getElementById("replyRoomName");
  const hospChip   = document.getElementById("replyHospitalChip");
  const emoChip    = document.getElementById("replyEmotionChip");
  const emotionEmoji = { '開心': '😊', '難過': '😟', '焦慮': '😰', '有問題': '🤔', '✅': '✅' };

  if (patientRow) {
    if (nameEl) nameEl.textContent = patientRow.patient_name || bed + '號病患';
    if (roomEl) roomEl.textContent = bed + '號病房';
    if (hospChip) hospChip.textContent = patientRow.hospital || '未知醫院';
    if (emoChip) {
      const emo = patientRow.latest_emotion || '';
      const icon = emotionEmoji[emo] || '';
      emoChip.textContent = `${icon} ${emo}`;
    }
  } else {
    if (nameEl) nameEl.textContent = bed + '號病患';
    if (roomEl) roomEl.textContent = bed + '號病房';
    if (hospChip) hospChip.textContent = '';
    if (emoChip) emoChip.textContent = '';
  }

  // 載入訊息
  const histList = document.getElementById("replyHistoryList");
  if (histList) histList.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

  try {
    const data = await api.getPatientByBed(bed);
    const msgs = data.messages || [];
    const unreplied = msgs.filter((m) => !m.replied);
    const emoBadge = document.getElementById("patientEmotionBadge");

    // 待回覆訊息（最舊的未讀）
    const firstUnread = unreplied.length > 0 ? unreplied[unreplied.length - 1] : null;
    if (firstUnread) {
      state.currentMsgId = firstUnread.id;
      document.getElementById("patientMsgBubble").textContent = firstUnread.text || `[${firstUnread.emotion}]`;
      if (emoBadge && firstUnread.emotion) {
        const emoIcon = emotionEmoji[firstUnread.emotion] || firstUnread.emotion;
        emoBadge.textContent = `病患心情：${emoIcon} ${firstUnread.emotion}`;
        emoBadge.style.display = 'inline-flex';
      }
    } else {
      document.getElementById("patientMsgBubble").textContent = "（目前無待回覆訊息）";
      if (emoBadge) emoBadge.style.display = 'none';
    }

    // 多訊息選擇器（有 2+ 則未回覆時顯示）
    const selectorRow = document.getElementById('msgSelectorRow');
    if (selectorRow) {
      if (unreplied.length > 1) {
        selectorRow.style.display = 'flex';
        selectorRow.innerHTML = unreplied.map((m, i) => {
          const emo = emotionEmoji[m.emotion] || '';
          const preview = (m.text || '').slice(0, 12);
          const isActive = i === unreplied.length - 1; // 預設最舊的
          return `<button onclick="selectDoctorMsg('${m.id}')" id="msgChip_${m.id}"
            style="padding:5px 12px;border-radius:20px;
                   border:1.5px solid ${isActive ? '#6c5ce7' : 'rgba(0,0,0,0.12)'};
                   background:${isActive ? '#6c5ce7' : '#f5f5f5'};
                   color:${isActive ? 'white' : '#555'};
                   font-size:0.75rem;font-weight:700;cursor:pointer;font-family:inherit;
                   transition:all .15s">
            ${emo} ${escHtml(preview)}…
          </button>`;
        }).join('');
      } else {
        selectorRow.style.display = 'none';
      }
    }

    // 歷史留言列表（由舊到新）
    if (histList) {
      const sorted = [...msgs].sort((a, b) =>
        new Date(a.timestamp.replace(/\//g,'-')) - new Date(b.timestamp.replace(/\//g,'-'))
      );
      state._doctorMsgsCache = sorted;  // 快取完整資料供展開 Modal 使用
      // 更新按鈕 meta
      const metaEl = document.getElementById('historyBtnMeta');
      if (metaEl) {
        const total = sorted.length;
        const unread = sorted.filter(m => !m.replied).length;
        metaEl.textContent = total
          ? `共 ${total} 則・${unread > 0 ? `${unread} 則待回覆` : '全部已回覆'}`
          : '尚無對話紀錄';
      }
    }
  } catch {
    showToast("⚠️ 載入訊息失敗");
  }
  goTo("screen-doctor-reply");
  setTimeout(() => renderEmotionChart(bed), 200);
  loadPrescriptionReviews(bed);
  loadBiometric(bed);
}

// ── 生理感測數據（M55M1 微表情 + EDA）──────────────────────────────────
// ── 歷史對話紀錄 Modal ────────────────────────────────────────────────
function openHistoryModal() {
  const msgs = state._doctorMsgsCache || [];
  const overlay = document.getElementById('historyModalOverlay');
  const modal   = document.getElementById('historyModal');
  const list    = document.getElementById('historyModalList');
  const meta    = document.getElementById('historyModalMeta');
  if (!modal) return;

  const patientName = document.getElementById('replyPatientName')?.textContent || '病患';
  const total  = msgs.length;
  const unread = msgs.filter(m => !m.replied).length;
  if (meta) meta.textContent = `${patientName} · 共 ${total} 則・${unread > 0 ? unread + ' 則待回覆' : '全部已回覆'}`;

  const emotionEmoji = { '開心':'😊','難過':'😟','焦慮':'😰','有問題':'🤔' };
  if (list) {
    if (!msgs.length) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:#aaa;font-size:0.85rem">尚無對話紀錄</div>';
    } else {
      list.innerHTML = msgs.map((m, i) => {
        const icon = emotionEmoji[m.emotion] || '';
        const replyBlock = m.replied && m.reply_text
          ? `<div style="margin-top:8px;padding:8px 12px;background:#f0f8ff;border-radius:8px;
                         border-left:3px solid #4a90d9;font-size:0.82rem;color:#333;line-height:1.5">
               <div style="font-size:0.68rem;color:#4a90d9;font-weight:700;margin-bottom:3px">↩ 醫生回覆</div>
               ${escHtml(m.reply_text)}
             </div>`
          : `<div style="margin-top:6px;font-size:0.72rem;color:#e67e22;font-weight:700">⏳ 尚未回覆</div>`;
        return `
          <div style="padding:12px 14px;border-radius:12px;margin-bottom:10px;
                      background:${m.replied ? '#fafafa' : '#fffbf0'};
                      border:1.5px solid ${m.replied ? '#eee' : '#ffe0a0'}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:1rem">${icon}</span>
                <span style="font-size:0.72rem;font-weight:700;color:#888">${m.emotion || ''}</span>
              </div>
              <span style="font-size:0.68rem;color:#bbb">${m.timestamp || ''}</span>
            </div>
            <div style="font-size:0.88rem;color:#333;line-height:1.55">${escHtml(m.text || '')}</div>
            ${replyBlock}
          </div>`;
      }).join('');
    }
  }

  overlay.style.display = 'block';
  modal.style.display   = 'flex';
}

function closeHistoryModal() {
  document.getElementById('historyModalOverlay').style.display = 'none';
  document.getElementById('historyModal').style.display        = 'none';
}

async function loadBiometric(bed) {
  const card = document.getElementById('biometricCard');
  if (!card) return;
  try {
    const data = await fetch(`/api/doctor/patient/${encodeURIComponent(bed)}/biometric`).then(r => r.json());

    // 警示標籤
    const alertBadge = document.getElementById('bioAlertBadge');
    const alertColors = { '正常': '#27ae60', '需關注': '#f39c12', '高度警示': '#e74c3c' };
    if (alertBadge) {
      alertBadge.textContent = data.alert_level;
      alertBadge.style.background = alertColors[data.alert_level] || '#aaa';
      alertBadge.style.color = 'white';
      alertBadge.style.display = '';
    }
    const updEl = document.getElementById('bioUpdatedAt');
    if (updEl) updEl.textContent = `更新 ${data.updated_at}`;

    // 微表情
    const expr = data.micro_expression;
    const exprColors = { '平靜': '#27ae60', '喜悅': '#f39c12', '壓抑': '#8e44ad', '焦慮': '#e74c3c', '不適': '#c0392b' };
    const exprEl = document.getElementById('bioExprLabel');
    if (exprEl) { exprEl.textContent = expr.label; exprEl.style.color = exprColors[expr.label] || '#333'; }
    const barEl = document.getElementById('bioExprBar');
    if (barEl) { barEl.style.width = (expr.confidence * 100) + '%'; barEl.style.background = `linear-gradient(90deg,${exprColors[expr.label] || '#667eea'},#764ba2)`; }
    const confEl = document.getElementById('bioExprConf');
    if (confEl) confEl.textContent = Math.round(expr.confidence * 100) + '%';

    const pct = v => Math.round(v * 100) + '%';
    document.getElementById('bioEye').textContent  = pct(expr.eye_openness);
    document.getElementById('bioBrow').textContent = pct(expr.brow_furrow);
    document.getElementById('bioLip').textContent  = pct(expr.lip_tension);

    // EDA
    const eda = data.eda;
    const edaStateEl = document.getElementById('bioEdaState');
    const edaColors = { '平靜': '#27ae60', '輕度緊張': '#f39c12', '中度緊張': '#e67e22', '高度緊張': '#e74c3c' };
    if (edaStateEl) {
      edaStateEl.textContent = eda.state;
      edaStateEl.style.background = (edaColors[eda.state] || '#aaa') + '22';
      edaStateEl.style.color = edaColors[eda.state] || '#333';
    }
    const sigEl = document.getElementById('bioSigQuality');
    if (sigEl) sigEl.textContent = `訊號品質 ${Math.round(eda.signal_quality * 100)}%`;

    document.getElementById('bioBaseline').textContent  = eda.baseline_uS + ' µS';
    document.getElementById('bioPeak').textContent      = eda.peak_uS + ' µS';
    document.getElementById('bioRespCount').textContent = eda.response_count_5min + ' 次';
    document.getElementById('bioRecovery').textContent  = eda.avg_recovery_sec + ' 秒';
  } catch {
    if (card) card.style.display = 'none';
  }
}

// ── 選擇要回覆的訊息 ──
function selectDoctorMsg(msgId) {
  const msgs = state._doctorMsgsCache || [];
  const msg = msgs.find(m => String(m.id) === String(msgId));
  if (!msg) return;
  state.currentMsgId = msgId;
  document.getElementById('patientMsgBubble').textContent = msg.text || `[${msg.emotion}]`;
  const emoBadge = document.getElementById('patientEmotionBadge');
  if (emoBadge) {
    if (msg.emotion) {
      const emoIcon = emotionEmoji[msg.emotion] || msg.emotion;
      emoBadge.textContent = `病患心情：${emoIcon} ${msg.emotion}`;
      emoBadge.style.display = 'inline-flex';
    } else {
      emoBadge.style.display = 'none';
    }
  }
  // 更新 chip 選中樣式
  document.querySelectorAll('#msgSelectorRow button').forEach(btn => {
    const active = btn.id === `msgChip_${msgId}`;
    btn.style.background = active ? '#6c5ce7' : '#f5f5f5';
    btn.style.color = active ? 'white' : '#555';
    btn.style.borderColor = active ? '#6c5ce7' : 'rgba(0,0,0,0.12)';
  });
  // 清除 AI 建議與輸入框
  const llmPrev = document.getElementById('llmPreview');
  if (llmPrev) llmPrev.style.display = 'none';
  const replyTxt = document.getElementById('doctorReplyText');
  if (replyTxt) replyTxt.value = '';
}

// ══ 醫生審核視覺處方影片 ══════════════════════════════════════
let _rxReviewTasks = [];

// 載入全部待審核視覺處方，更新 dashboard 統計卡
async function loadAllRxReviewStat() {
  try {
    const data = await fetch('/api/doctor/prescription-reviews').then(r => r.json());
    _rxReviewTasks = (data.tasks || []).filter(t => t.status === 'review' || !t.status || t.status === 'pending');
    const el = document.getElementById('statRxReview');
    if (el) el.textContent = String(_rxReviewTasks.length);
    // 若有待審核，讓卡片有輕微閃爍提示
    const pill = document.getElementById('statRxPill');
    if (pill) pill.style.animation = _rxReviewTasks.length > 0 ? 'rxPulse 2s infinite' : 'none';
  } catch { /* 靜默失敗 */ }
}

function openRxReviewModal() {
  const overlay  = document.getElementById('rxReviewOverlay');
  const modal    = document.getElementById('rxReviewModal');
  const subtitle = document.getElementById('rxReviewSubtitle');
  const list     = document.getElementById('rxReviewList');
  if (!modal) return;
  overlay.style.display = 'block';
  modal.style.display   = 'flex';
  if (subtitle) subtitle.textContent = _rxReviewTasks.length
    ? `共 ${_rxReviewTasks.length} 部影片待審核`
    : '目前沒有待審核的視覺處方';
  if (!list) return;
  if (!_rxReviewTasks.length) {
    list.innerHTML = '<div style="text-align:center;padding:32px 16px;color:#aaa;font-size:0.85rem">✅ 目前沒有待審核的視覺處方影片</div>';
    return;
  }
  list.innerHTML = _rxReviewTasks.map(t => {
    const isYT = !!t.youtube_vid;
    const mediaHtml = isYT
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${t.youtube_vid}"
           style="width:100%;aspect-ratio:16/9;border:none;display:block;background:#000"
           allowfullscreen loading="lazy"></iframe>`
      : `<video src="${t.video_url}" controls
           style="width:100%;max-height:180px;display:block;background:#000"></video>`;
    const patientInfo = t.patient_name
      ? `<span style="background:#e8f5e9;color:#2d8f61;font-size:0.62rem;font-weight:700;
              padding:2px 6px;border-radius:6px">👤 ${escHtml(t.patient_name)}</span>`
      : '';
    const bedInfo = t.bed
      ? `<span style="background:#e3f2fd;color:#1976d2;font-size:0.62rem;font-weight:700;
              padding:2px 6px;border-radius:6px">🛏 ${escHtml(t.bed)}</span>`
      : '';
    return `
    <div style="border:1.5px solid #fdd;border-radius:12px;overflow:hidden;background:#fff9f9;margin-bottom:12px">
      ${mediaHtml}
      <div style="padding:10px 12px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:6px">
          ${patientInfo}${bedInfo}
          <span style="font-size:0.8rem;font-weight:700;color:#555">📍 ${escHtml(t.location || '')}</span>
          ${isYT ? '<span style="background:#f00;color:white;font-size:0.6rem;font-weight:800;padding:2px 6px;border-radius:8px">YouTube</span>' : ''}
        </div>
        <div style="font-size:0.73rem;color:#888;margin-bottom:8px">${escHtml(t.description || '')}</div>
        <textarea id="rejectReason_${t.id}" placeholder="退回原因（選填，志工下次可看到）"
          style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #f5c6c6;border-radius:8px;
                 font-size:0.78rem;font-family:inherit;resize:none;min-height:40px;margin-bottom:8px;
                 display:none;outline:none"></textarea>
        <div style="display:flex;gap:8px">
          <button onclick="reviewPrescription('${t.id}','approve')"
            style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;
                   background:#2d8f61;color:white;font-weight:800;font-size:0.78rem;font-family:inherit">
            ✅ 核准採用
          </button>
          <button onclick="toggleRejectInput('${t.id}')"
            style="flex:1;padding:8px;border-radius:8px;border:none;cursor:pointer;
                   background:#e74c3c;color:white;font-weight:800;font-size:0.78rem;font-family:inherit">
            ❌ 退回重拍
          </button>
        </div>
        <div id="confirmRejectRow_${t.id}" style="display:none;margin-top:6px">
          <button onclick="confirmReject('${t.id}')"
            style="width:100%;padding:7px;border-radius:8px;border:none;cursor:pointer;
                   background:#c0392b;color:white;font-weight:800;font-size:0.78rem;font-family:inherit">
            確認退回 → 任務重新開放，病患任務列表將更新
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function closeRxReviewModal() {
  document.getElementById('rxReviewOverlay').style.display = 'none';
  document.getElementById('rxReviewModal').style.display   = 'none';
}

function toggleRejectInput(taskId) {
  const textarea = document.getElementById(`rejectReason_${taskId}`);
  const confirmRow = document.getElementById(`confirmRejectRow_${taskId}`);
  if (!textarea) return;
  const isOpen = textarea.style.display !== 'none';
  textarea.style.display = isOpen ? 'none' : 'block';
  if (confirmRow) confirmRow.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) textarea.focus();
}

async function confirmReject(taskId) {
  const textarea = document.getElementById(`rejectReason_${taskId}`);
  const reason = textarea ? textarea.value.trim() : '';
  await reviewPrescription(taskId, 'reject', reason);
}

async function reviewPrescription(taskId, action, rejectReason = '') {
  try {
    const res = await fetch('/api/doctor/prescription-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, action, reject_reason: rejectReason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(action === 'approve'
        ? '✅ 已核准，病患可以觀看了！'
        : '❌ 已退回，任務已重新開放至病患任務列表');
      closeRxReviewModal();
      await loadAllRxReviewStat();
    }
  } catch { showToast('⚠️ 操作失敗，請重試'); }
}

// ══ 情緒趨勢圖（Chart.js）══════════════════════════════════════
let _emotionChart = null;
const _EMOTION_SCORE = { '開心': 5, '有問題': 3, '難過': 2, '焦慮': 1 };
const _SCORE_COLOR  = { 5: '#2d8f61', 3: '#f5a623', 2: '#e67e22', 1: '#e74c3c' };

async function renderEmotionChart(bed) {
  const canvas = document.getElementById('emotionChartCanvas');
  if (!canvas || !window.Chart) return;

  try {
    const data = await fetch(`/api/doctor/patient/${encodeURIComponent(bed)}/emotion-chart`).then(r => r.json());
    const pts  = data.points || [];
    if (!pts.length) {
      document.getElementById('emotionChartHint').textContent = '尚無情緒記錄';
      return;
    }

    const labels = pts.map(p => p.date.slice(5, 10).replace('/', '/'));  // MM/DD
    const scores = pts.map(p => p.score);
    const pointBg = pts.map(p => _SCORE_COLOR[p.score] || '#888');
    const pointR   = pts.map(p => p.replied ? 7 : 5);

    // 趨勢徽章
    const trendEl = document.getElementById('trendBadge');
    const hint    = document.getElementById('emotionChartHint');
    if (trendEl) {
      const t = data.trend;
      trendEl.textContent  = t === 'improving' ? '📈 好轉中' : t === 'declining' ? '📉 需關注' : '➡️ 穩定';
      trendEl.style.color  = t === 'improving' ? '#2d8f61' : t === 'declining' ? '#e74c3c' : '#888';
    }
    if (hint) hint.innerHTML =
      '<svg width="10" height="10" style="vertical-align:middle"><circle cx="5" cy="5" r="5" fill="#6c5ce7"/></svg>'
      + ' <span style="font-size:0.68rem">醫師已回覆</span> &nbsp;'
      + '<svg width="7" height="7" style="vertical-align:middle"><circle cx="3.5" cy="3.5" r="3.5" fill="#6c5ce7" opacity="0.45"/></svg>'
      + ' <span style="font-size:0.68rem">未回覆</span>';

    // 銷毀舊圖
    if (_emotionChart) { _emotionChart.destroy(); _emotionChart = null; }

    _emotionChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: scores,
          borderColor: '#6c5ce7',
          backgroundColor: 'rgba(108,92,231,0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: pointBg,
          pointRadius: pointR,
          pointHoverRadius: 9,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = pts[ctx.dataIndex];
                return ` ${p.emotion}${p.replied ? ' ✓已回覆' : ''}：${p.text_preview || ''}`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 0, max: 6,
            ticks: {
              stepSize: 1,
              callback: v => ['','焦慮','難過','','有問題','','開心'][v] || ''
            },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  } catch(e) {
    console.warn('Emotion chart error:', e);
  }
}

// ══ 視覺處方系統 ══════════════════════════════════════════════
let _rxSelectedType = null;

// AI 根據情緒建議視覺類型
const _RX_AI_SUGGESTIONS = {
  '焦慮': { type: 'nature',   text: '研究顯示自然風景能顯著降低焦慮（Ulrich, 1984），建議安排山林或公園視角' },
  '難過': { type: 'hometown', text: '熟悉的家鄉景物有助於減輕思鄉引發的憂鬱情緒，建議安排病患家鄉或熟悉的街道' },
  '有問題': { type: 'city',  text: '城市街景可提供適度感官刺激，幫助轉移注意力，緩解等待焦慮' },
  '開心': { type: 'familiar', text: '病患情緒良好，可安排喜愛的熟悉場所影片強化正向情緒' },
};

function openPrescriptionModal() {
  _rxSelectedType = null;
  document.querySelectorAll('.rx-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('rxLocationInput').value = '';
  document.getElementById('rxNoteInput').value = '';

  // AI 建議：依最新情緒
  const chip = document.getElementById('replyEmotionChip');
  const emotion = chip?.textContent?.replace(/[^\u4e00-\u9fa5]/g, '').trim() || '';
  const sugg = _RX_AI_SUGGESTIONS[emotion] || { type: 'nature', text: '建議安排自然風景，有助於舒緩住院壓力' };
  document.getElementById('rxAiText').textContent = sugg.text;
  // 自動預選 AI 建議的類型
  selectRxType(sugg.type);

  document.getElementById('prescriptionModal').style.display = 'flex';
}

function closePrescriptionModal() {
  document.getElementById('prescriptionModal').style.display = 'none';
}

// ══ 面板展開放大（通用）══════════════════════════════════════
let _expandChartInstance = null;

function expandPanel(type) {
  const modal  = document.getElementById('panelExpandModal');
  const title  = document.getElementById('panelExpandTitle');
  const body   = document.getElementById('panelExpandBody');
  if (!modal || !title || !body) return;

  if (type === 'history') {
    title.textContent = '📋 完整留言記錄';
    const msgs = state._doctorMsgsCache || [];
    if (!msgs.length) {
      body.innerHTML = '<div style="padding:20px;color:#aaa">尚無留言記錄</div>';
    } else {
      const emotionEmoji = { '開心': '😊', '難過': '😟', '焦慮': '😰', '有問題': '🤔' };
      body.innerHTML = `<div style="padding:14px 18px">` + msgs.map((m, idx) => {
        const icon = emotionEmoji[m.emotion] || m.emotion || '';
        const fullText = m.text || `[${m.emotion}]`;
        const replyBlock = m.replied && m.reply_text
          ? `<div style="margin-top:6px;padding:8px 10px;background:rgba(56,178,122,0.09);
               border-left:3px solid #38b27a;border-radius:0 6px 6px 0;font-size:0.78rem;color:#2d8f61;line-height:1.5">
               <span style="font-weight:700">👨‍⚕️ 醫生回覆：</span>${escHtml(m.reply_text)}
             </div>`
          : `<div style="margin-top:5px;font-size:0.72rem;color:#e67e22;font-weight:700">⏳ 待回覆</div>`;
        return `<div style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.06)">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <span style="font-size:1.1rem;flex-shrink:0">${icon}</span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">
                <div style="font-size:0.88rem;color:#333;line-height:1.5;flex:1">${escHtml(fullText)}</div>
                <div style="font-size:0.68rem;color:#aaa;white-space:nowrap;flex-shrink:0">${m.timestamp || ''}</div>
              </div>
              ${replyBlock}
            </div>
          </div>
        </div>`;
      }).join('') + '</div>';
    }

  } else if (type === 'chart') {
    title.textContent = '📊 情緒趨勢（放大）';
    // 建立新的大圖 canvas
    body.innerHTML = `
      <div style="padding:20px">
        <canvas id="emotionChartBig"></canvas>
        <div id="emotionChartBigHint" style="font-size:0.78rem;color:#888;margin-top:8px;text-align:center"></div>
      </div>`;
    // 等 DOM 更新後重新繪製大圖
    requestAnimationFrame(() => renderEmotionChartBig());
  }

  modal.style.display = 'flex';
}

function closeExpandPanel() {
  document.getElementById('panelExpandModal').style.display = 'none';
  if (_expandChartInstance) { _expandChartInstance.destroy(); _expandChartInstance = null; }
}

// 放大版情緒趨勢圖（使用相同資料，但更大的 canvas）
async function renderEmotionChartBig() {
  const canvas = document.getElementById('emotionChartBig');
  if (!canvas || !window.Chart || !state.currentBed) return;
  try {
    const data = await fetch(`/api/doctor/patient/${encodeURIComponent(state.currentBed)}/emotion-chart`).then(r => r.json());
    const pts  = data.points || [];
    if (!pts.length) { document.getElementById('emotionChartBigHint').textContent = '尚無情緒記錄'; return; }

    const labels  = pts.map(p => p.date.replace(/\//g, '/'));
    const scores  = pts.map(p => p.score);
    const pointBg = pts.map(p => _SCORE_COLOR[p.score] || '#888');
    const pointR  = pts.map(p => p.replied ? 9 : 6);
    const hint    = document.getElementById('emotionChartBigHint');
    const trend   = data.trend;
    if (hint) hint.innerHTML =
      `趨勢：${trend === 'improving' ? '📈 好轉中' : trend === 'declining' ? '📉 需關注' : '➡️ 穩定'}
       &nbsp;｜&nbsp;
       <svg width="12" height="12" style="vertical-align:middle"><circle cx="6" cy="6" r="6" fill="#6c5ce7"/></svg>
       <span style="font-size:0.76rem"> 醫生當日已回覆</span>
       &nbsp;
       <svg width="8" height="8" style="vertical-align:middle"><circle cx="4" cy="4" r="4" fill="#6c5ce7" opacity="0.5"/></svg>
       <span style="font-size:0.76rem"> 未回覆</span>`;

    if (_expandChartInstance) { _expandChartInstance.destroy(); }
    _expandChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: scores,
          borderColor: '#6c5ce7',
          backgroundColor: 'rgba(108,92,231,0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: pointBg,
          pointRadius: pointR,
          pointHoverRadius: 12,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = pts[ctx.dataIndex];
                return ` ${p.emotion}${p.replied ? ' ✓已回覆' : ''}${p.text_preview ? '：' + p.text_preview : ''}`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 0, max: 6,
            ticks: { stepSize: 1, callback: v => ['','焦慮','難過','','有問題','','開心'][v] || '', font: { size: 13 } },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: { grid: { display: false }, ticks: { font: { size: 12 } } }
        }
      }
    });
  } catch(e) { console.warn('Big chart error:', e); }
}

function selectRxType(type) {
  _rxSelectedType = type;
  document.querySelectorAll('.rx-type-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.type === type);
  });
}

async function submitPrescription() {
  if (!_rxSelectedType) { showToast('⚠️ 請選擇視覺類型'); return; }
  const bed         = state.currentBed;
  const patientName = document.getElementById('replyPatientName')?.textContent || bed + '號病患';
  const location    = document.getElementById('rxLocationInput').value.trim();
  const note        = document.getElementById('rxNoteInput').value.trim();
  const doctorId    = state.currentUser?.id || 'doctor_001';

  try {
    const res = await fetch('/api/doctor/prescription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bed, patient_name: patientName,
        visual_type: _rxSelectedType,
        location_hint: location,
        doctor_note: note,
        doctor_id: doctorId,
      })
    }).then(r => r.json());

    closePrescriptionModal();
    showToast(`✅ 視覺處方已開立，任務已發布至群眾端（ID: ${res.task_id}）`);
  } catch {
    showToast('⚠️ 開立失敗，請稍後再試');
  }
}

// ══ 任意視界：感謝志工 ════════════════════════════════════════
let _currentCrowdTaskId = null;  // 目前正在播放的群眾任務 ID

async function thankVolunteer() {
  if (!_currentCrowdTaskId) return;
  const btn = document.getElementById('btnThankVolunteer');
  if (btn) { btn.disabled = true; btn.textContent = '💝 已感謝！'; }
  try {
    await fetch(`/api/crowd/thank/${_currentCrowdTaskId}`, { method: 'POST' });
    showToast('💝 感謝已送達！志工將收到通知並獲得 +10 點');
  } catch {
    showToast('⚠️ 感謝送出失敗');
  }
}

// ══ 病患端：載入視覺處方通知 ══════════════════════════════
let _rxPrescriptions = [];

async function loadPatientPrescription() {
  const patientId = state.currentUser?.id || 'patient_503B';
  try {
    const data = await fetch(`/api/patient/${patientId}/prescriptions`).then(r => r.json());
    _rxPrescriptions = data.prescriptions || [];
    const pending = _rxPrescriptions.filter(r => r.status === 'pending');
    // 同步更新引導列的視覺處方按鈕（已移至 anyview-guide）
    const guideBtn   = document.getElementById('btnRxPanelGuide');
    const guideBadge = document.getElementById('rxPanelBadgeGuide');
    if (guideBtn)   guideBtn.style.display   = pending.length > 0 ? 'inline-flex' : 'none';
    if (guideBadge) { guideBadge.style.display = pending.length > 0 ? 'flex' : 'none'; guideBadge.textContent = String(pending.length); }
  } catch { /* 靜默失敗 */ }
}

function openRxPanel() {
  const overlay = document.getElementById('rxPanelOverlay');
  const drawer  = document.getElementById('rxPanelDrawer');
  if (!drawer) return;
  overlay.style.display = 'block';
  drawer.style.display  = 'flex';
  const pending = _rxPrescriptions.filter(r => r.status === 'pending');
  const infoEl  = document.getElementById('rxPanelInfo');
  const subEl   = document.getElementById('rxPanelSubtitle');
  if (pending.length > 0) {
    const rx = pending[pending.length - 1];
    if (infoEl) infoEl.innerHTML = `
      <div style="font-weight:800;font-size:0.9rem;margin-bottom:4px">${rx.visual_icon || '🏥'} ${rx.visual_label}</div>
      <div style="color:#555">${rx.location_hint || '等待志工前往拍攝中'}</div>
      ${rx.notes ? `<div style="margin-top:6px;color:#777;font-size:0.78rem">📝 ${rx.notes}</div>` : ''}`;
    if (subEl) subEl.textContent = `醫師開立 · ${rx.created_at || ''}`;
  } else {
    if (infoEl) infoEl.textContent = '目前沒有待執行的視覺處方';
    if (subEl)  subEl.textContent = '';
  }
  loadPrescriptionFulfillmentVideos();
}

function closeRxPanel() {
  document.getElementById('rxPanelOverlay').style.display = 'none';
  document.getElementById('rxPanelDrawer').style.display  = 'none';
}

async function loadPrescriptionFulfillmentVideos() {
  const patientId = state.currentUser?.id || 'patient_503B';
  try {
    const data = await fetch(`/api/crowd/tasks?patient_id=${patientId}&status=review,adopted,completed`).then(r => r.json());
    const tasks = (data.tasks || []).filter(t => t.video_url && t.requested_by && t.requested_by.includes(
      (state.currentUser?.bed || '503-B')
    ));
    const list    = document.getElementById('prescriptionVideosList');
    const noVideo = document.getElementById('rxPanelNoVideo');
    if (!list) return;
    if (!tasks.length) {
      list.innerHTML = '';
      if (noVideo) noVideo.style.display = 'block';
      return;
    }
    if (noVideo) noVideo.style.display = 'none';
    list.innerHTML = tasks.map(t => `
      <div style="flex-shrink:0;width:140px;cursor:pointer;border-radius:10px;overflow:hidden;
                  background:#f0f8f5;border:1.5px solid rgba(45,143,97,0.2)"
           onclick="closeRxPanel();playCrowdVideoFromPrescription('${t.video_url}','${t.id}','${t.location}')">
        <div style="background:#2d8f61;padding:6px 8px;font-size:0.65rem;color:white;font-weight:700;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          📍 ${t.location}
        </div>
        <div style="padding:6px 8px;font-size:0.68rem;color:#555;line-height:1.4;
                    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
          ${t.description}
        </div>
        <div style="padding:3px 8px 6px;font-size:0.65rem;color:${t.status==='review'?'#856404':'#2d8f61'};font-weight:700">
          ${t.status==='review'?'⏳ 審核中':'✅ 已完成'}
        </div>
      </div>`).join('');
  } catch {}
}

function playCrowdVideoFromPrescription(videoUrl, taskId, location) {
  _currentCrowdTaskId = taskId;
  _currentCrowdLocation = location;
  const player = document.getElementById('crowdVideoPlayer');
  const placeholder = document.getElementById('camPlaceholder');
  const actions = document.getElementById('crowdVideoActions');
  if (!player) return;
  player.src = videoUrl;
  player.style.display = 'block';
  if (placeholder) placeholder.style.display = 'none';
  if (actions) { actions.style.display = 'flex'; actions.style.removeProperty('display'); setTimeout(()=>{ actions.style.display='flex'; },50); }
  document.getElementById('videoPanelTitle').textContent = `📹 ${location}`;
}

// 快速回覆模板
document.querySelectorAll(".qr-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const ta = document.getElementById("doctorReplyText");
    if (ta) ta.value = chip.dataset.text;
  });
});

document.getElementById('btnAIGenReply')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnAIGenReply');
  const msgId = state.currentMsgId;
  if (!msgId) return;
  // get patient info from current state
  const patientName = document.getElementById('replyPatientName')?.textContent || '';
  const emotion = document.getElementById('replyEmotionChip')?.textContent || '';
  const msgText = document.getElementById('patientMsgBubble')?.textContent || '';
  btn.disabled = true;
  btn.textContent = '🤖 生成中…';
  try {
    const res = await fetch('/api/doctor/ai-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: msgId,
        patient_name: patientName,
        patient_emotion: emotion,
        patient_text: msgText,
      }),
    });
    const data = await res.json();
    if (data.ai_reply) {
      document.getElementById('doctorReplyText').value = data.ai_reply;
      showToast(data.fallback ? '📝 已套用備用模板' : '🤖 AI 回覆草稿已生成，可修改後送出');
    }
  } catch {
    showToast('⚠️ AI 生成失敗，請手動輸入');
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 AI 生成回覆';
  }
});

document.getElementById("micBtn")?.addEventListener("click", () => {
  const btn = document.getElementById("micBtn");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("⚠️ 此瀏覽器不支援語音輸入，請使用 Chrome");
    return;
  }
  if (state._doctorRec) {
    // 停止錄音
    state._doctorRec.stop();
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = 'zh-TW';
  rec.continuous = false;
  rec.interimResults = false;
  state._doctorRec = rec;
  btn.classList.add("recording");
  btn.innerHTML = "⏹ 停止錄音";
  showToast("🎙 錄音中，請說話…");
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const ta = document.getElementById("doctorReplyText");
    if (ta) ta.value = (ta.value ? ta.value + ' ' : '') + text;
  };
  rec.onend = () => {
    state._doctorRec = null;
    btn.classList.remove("recording");
    btn.innerHTML = "🎙 語音錄製";
  };
  rec.onerror = () => {
    state._doctorRec = null;
    btn.classList.remove("recording");
    btn.innerHTML = "🎙 語音錄製";
    showToast("⚠️ 語音辨識失敗，請重試");
  };
  rec.start();
});

document.getElementById("btnEmpathyRewrite")?.addEventListener("click", async () => {
  const btn = document.getElementById("btnEmpathyRewrite");
  const ta = document.getElementById("doctorReplyText");
  const rawText = ta?.value.trim();
  if (!rawText) {
    showToast("⚠️ 請先輸入回覆內容再進行溫暖轉譯");
    return;
  }
  const emotion = document.getElementById("replyEmotionChip")?.textContent || '';
  btn.disabled = true;
  btn.textContent = "💝 轉譯中…";
  try {
    const data = await api.empathyRewrite(rawText, emotion);
    if (data.rewritten) {
      ta.value = data.rewritten;
      showToast(data.fallback ? "📝 已套用備用溫暖模板" : "💝 已轉譯為溫暖語句，可修改後送出");
    }
  } catch {
    showToast("⚠️ 溫暖轉譯失敗，請重試");
  } finally {
    btn.disabled = false;
    btn.textContent = "💝 溫暖轉譯";
  }
});

document.getElementById("btnSendReply")?.addEventListener("click", async () => {
  // 優先用 AI 建議（若有），否則用輸入框
  const llmText   = document.getElementById("llmText")?.textContent?.trim() || '';
  const replyText = document.getElementById("doctorReplyText").value.trim();
  const finalText = llmText || replyText;
  if (!finalText) {
    showToast("⚠️ 請輸入回覆內容");
    return;
  }
  try {
    await api.sendDoctorReply(state.currentMsgId, finalText);
    showToast("✅ 回覆已傳送給病患");
    document.getElementById("llmPreview").style.display = "none";
    state.currentMsgId = null;
    await loadDoctorList();
    setTimeout(() => goTo("screen-doctor"), 600);
  } catch {
    showToast("⚠️ 傳送失敗");
  }
});

// ── 群眾端 ───────────────────────────────────────
let _currentLbPeriod = 'weekly';
let _lbCache = {};  // { weekly: data, monthly: data, alltime: data }

async function loadCrowdData() {
  const userId = state.currentUser?.id || "crowd_001";
  try {
    const [tasksData, stats, lbData, rewardsData] = await Promise.all([
      api.getCrowdTasks(),
      api.getCrowdStats(userId),
      api.getLeaderboard(_currentLbPeriod),
      api.getUserRewards(userId),
    ]);
    renderCrowdStats(stats);
    renderCrowdTasks(tasksData.tasks);
    _lbCache[_currentLbPeriod] = lbData;
    renderLeaderboard(lbData, userId);
    renderMyRewards(rewardsData.rewards || []);
  } catch {
    showToast("⚠️ 資料載入失敗");
  }
}

async function switchLbTab(period, btn) {
  _currentLbPeriod = period;
  // 更新 tab 樣式
  document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // 更新獎勵說明
  const hint = document.getElementById('lbRewardHint');
  if (hint) {
    if (period === 'weekly')  hint.innerHTML = '<span>🥇 星巴克星冰樂</span><span>🥈 7-11 咖啡</span><span>🥉 7-11 咖啡</span>';
    if (period === 'monthly') hint.innerHTML = '<span>🥇 Uber Eats $150</span><span>🥈 星巴克星冰樂</span><span>🥉 7-11 咖啡</span>';
    if (period === 'alltime') hint.innerHTML = '<span style="color:#aaa;font-size:0.72rem">累積總積分排名，不含週期獎勵</span>';
  }
  // 從快取或重新抓取
  const userId = state.currentUser?.id || "crowd_001";
  if (_lbCache[period]) {
    renderLeaderboard(_lbCache[period], userId);
  } else {
    document.getElementById('leaderboardList').innerHTML =
      '<div class="skeleton" style="margin:4px 0;height:32px"></div>'.repeat(3);
    const data = await api.getLeaderboard(period);
    _lbCache[period] = data;
    renderLeaderboard(data, userId);
  }
}

// ── 統計面板期間切換 ─────────────────────────────
let _statsPeriod = 'alltime';
let _lastStats = null;

function switchStatsPeriod(period, btn) {
  _statsPeriod = period;
  document.querySelectorAll('.achieve-title .lb-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (_lastStats) _renderStatsByPeriod(_lastStats, period);
}

function _renderStatsByPeriod(stats, period) {
  let completed, pts;
  if (period === 'weekly') {
    completed = stats.week_completed ?? '—';
    pts       = stats.week_points  ?? 0;
  } else if (period === 'monthly') {
    completed = stats.month_completed ?? '—';
    pts       = stats.month_points    ?? 0;
  } else {
    completed = stats.completed ?? '—';
    pts       = stats.points    ?? 0;
    label     = '累積';
  }
  document.getElementById('statCompleted').textContent   = completed;
  document.getElementById('statPoints').textContent      = `🏆 ${Number(pts).toLocaleString()} 點`;
  // 進行中和滿意度與期間無關，保持不變
}

const LEVEL_TIERS = [
  { min: 0,    max: 199,  name: '🥉 青銅新手',    next: 200  },
  { min: 200,  max: 999,  name: '🥈 白銀探索者',   next: 1000 },
  { min: 1000, max: 2999, name: '🥇 黃金貢獻者',   next: 3000 },
  { min: 3000, max: Infinity, name: '💎 鑽石先鋒', next: null },
];

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function renderCrowdStats(stats) {
  _lastStats = stats;

  // 固定欄位（與期間無關）
  document.getElementById("statInProgress").textContent   = stats.in_progress;
  document.getElementById("statSatisfaction").textContent = stats.satisfaction + "%";

  // 依目前選取的期間渲染完成數 + 積分
  _renderStatsByPeriod(stats, _statsPeriod);

  const badgeRow = document.getElementById('rankBadgesRow');
  if (badgeRow) badgeRow.style.display = 'flex';

  // 等級條（永遠以累積積分為基準）
  const pts = stats.points || 0;
  const tier = LEVEL_TIERS.find(t => pts >= t.min && pts <= t.max) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
  const nameEl = document.getElementById('levelName');
  const pctEl  = document.getElementById('levelPct');
  const fillEl = document.getElementById('levelFill');
  const hintEl = document.getElementById('levelHint');
  if (nameEl) nameEl.textContent = tier.name;
  if (tier.next) {
    const pct = Math.min(100, Math.round(((pts - tier.min) / (tier.next - tier.min)) * 100));
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (hintEl) hintEl.textContent = `距下一等級 ${(tier.next - pts).toLocaleString()} 點`;
  } else {
    if (pctEl) pctEl.textContent = '滿級';
    if (fillEl) fillEl.style.width = '100%';
    if (hintEl) hintEl.textContent = '已達最高等級！';
  }
}

function renderLeaderboard(data, currentUserId) {
  const list = document.getElementById('leaderboardList');
  if (!list || !data?.entries?.length) {
    if (list) list.innerHTML = '<div style="color:#aaa;font-size:0.78rem;text-align:center;padding:12px">暫無排行資料</div>';
    return;
  }

  const userId = currentUserId || state.currentUser?.id;
  let weekBadge = '', monthBadge = '';

  list.innerHTML = data.entries.map(entry => {
    const isMe = entry.user_id === userId;
    const medal = RANK_MEDALS[entry.rank - 1] || `${entry.rank}`;
    const streak = entry.week_streak >= 2
      ? `<span class="lb-streak" title="連續蟬聯${entry.week_streak}周">🔥×${entry.week_streak}</span>` : '';
    const rewardBadge = entry.reward
      ? `<span class="lb-reward-tag">${entry.reward.icon}</span>` : '';

    // 記錄當前用戶的本周/本月名次
    if (isMe) {
      if (data.period === 'weekly')  weekBadge  = `本周 ${medal}`;
      if (data.period === 'monthly') monthBadge = `本月 ${medal}`;
    }

    return `
      <div class="lb-row ${isMe ? 'lb-row-me' : ''}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${entry.name}${isMe ? ' <span class="lb-you">我</span>' : ''}${streak}</span>
        <span class="lb-pts">${entry.points.toLocaleString()}pt</span>
        ${rewardBadge}
      </div>`;
  }).join('');

  // 更新名次徽章
  if (weekBadge)  { const el = document.getElementById('rankBadgeWeek');  if (el) { el.textContent = weekBadge;  el.style.display = ''; } }
  if (monthBadge) { const el = document.getElementById('rankBadgeMonth'); if (el) { el.textContent = monthBadge; el.style.display = ''; } }
}

function renderMyRewards(rewards) {
  const list = document.getElementById('myRewardsList');
  if (!list) return;
  if (!rewards.length) {
    list.innerHTML = '<div style="font-size:0.75rem;color:rgba(0,0,0,0.35);text-align:center;padding:8px 0">進入前3名即自動獲得獎勵</div>';
    return;
  }
  // 最新的放前面，最多顯示 5 筆
  const recent = [...rewards].reverse().slice(0, 5);
  list.innerHTML = recent.map(r => {
    const typeLabel = r.type === 'weekly' ? '周冠' : r.type === 'monthly' ? '月冠' : '特別';
    const rankMedal = RANK_MEDALS[r.rank - 1] || `#${r.rank}`;
    return `
      <div class="reward-tier-row unlocked" style="cursor:default">
        <span class="rt-icon">${r.icon}</span>
        <div class="rt-info">
          <div class="rt-name">${r.store} ${r.item}</div>
          <div class="rt-req">${r.period} ${typeLabel} ${rankMedal}</div>
        </div>
        <button class="rt-btn" onclick="showRankReward(${JSON.stringify(r).replace(/"/g, '&quot;')})">查看</button>
      </div>`;
  }).join('');
}

function showRankReward(r) {
  const titleEl    = document.getElementById('rewardModalTitle');
  const subtitleEl = document.getElementById('rewardModalSubtitle');
  const rankMedal  = RANK_MEDALS[r.rank - 1] || `#${r.rank}`;
  const typeLabel  = r.type === 'weekly' ? '周排行榜' : r.type === 'monthly' ? '月排行榜' : '排行榜';
  if (titleEl)    titleEl.textContent    = `恭喜！${typeLabel}獎勵`;
  if (subtitleEl) subtitleEl.textContent = `${r.period} ${rankMedal}`;
  document.getElementById('rgcStore').textContent  = r.store || '—';
  document.getElementById('rgcIcon').textContent   = r.icon  || '🎁';
  document.getElementById('rgcItem').textContent   = r.item  || '兌換券';
  document.getElementById('rgcCode').textContent   = r.code  || 'ANSIN-' + Math.random().toString(36).slice(2,8).toUpperCase();
  document.getElementById('rgcExpiry').textContent = `有效期限：2026/12/31`;
  document.getElementById('rewardModal').style.display = 'flex';
}

// ── 群眾端：任務列表點擊 → 開啟上傳 Modal ──────────────────
let _selectedTaskId = null;   // 群眾選中的任務 ID
let _selectedTaskData = null;   // 任務完整資料
let _modalSelectedFile = null;  // Modal 中選取的檔案

const TASK_ICONS = ['🐧', '🌊', '🌸', '🏙️', '🏡', '🌃', '🏔️', '🌅', '🌿', '💧'];
function renderCrowdTasks(tasks) {
  const list = document.getElementById('taskList');
  if (!tasks.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;font-size:0.85rem">目前無開放任務，稍後再來看看</div>';
    return;
  }
  list.innerHTML = tasks.map((t, i) => {
    const rxBadge = t.is_prescription
      ? `<span class="rx-task-badge">🏥 醫生處方</span>` : '';
    const isPrescription = t.task_type === 'prescription' || t.is_prescription;
    const statusBadge = isPrescription && t.status === 'review'
      ? `<span style="font-size:0.65rem;padding:1px 6px;background:#fff3cd;color:#856404;border-radius:8px;font-weight:700">⏳ 醫生審核中</span>`
      : isPrescription && t.status === 'adopted'
      ? `<span style="font-size:0.65rem;padding:1px 6px;background:#d4edda;color:#155724;border-radius:8px;font-weight:700">✅ 已採用</span>`
      : isPrescription && t.status === 'rejected'
      ? `<span style="font-size:0.65rem;padding:1px 6px;background:#f8d7da;color:#721c24;border-radius:8px;font-weight:700">❌ 退回重拍</span>`
      : !isPrescription && t.status === 'completed'
      ? `<span style="font-size:0.65rem;padding:1px 6px;background:#d4edda;color:#155724;border-radius:8px;font-weight:700">✅ 已完成</span>`
      : '';
    return `
    <div class="task-row ${t.is_prescription ? 'rx-task-row' : ''}" data-task-id="${t.id}"
      style="cursor:pointer;transition:all 0.15s">
      <div class="task-thumb">${t.is_prescription ? (t.visual_icon || '🏥') : TASK_ICONS[i % TASK_ICONS.length]}</div>
      <div class="task-info">
        <div class="task-loc">${t.location} ${rxBadge} ${statusBadge}</div>
        <div class="task-desc">${t.description}</div>
      </div>
      <span class="task-pts ${t.bonus ? 'bonus' : ''}">+${t.points} 點${t.bonus ? ' ★' : ''}</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.task-row[data-task-id]').forEach(row => {
    row.addEventListener('click', () => {
      const taskId = row.dataset.taskId;
      const task = tasks.find(t => t.id === taskId);
      if (task) openUploadModal(task);
    });
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(245,166,35,0.08)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });
}

// ── 上傳 Modal 函數群 ──────────────────────────────────────
function openUploadModal(task) {
  _selectedTaskId = task.id;
  _selectedTaskData = task;
  _modalSelectedFile = null;

  // 填入任務資訊
  const nameEl = document.getElementById('modalTaskName');
  const descEl = document.getElementById('modalTaskDesc');
  if (nameEl) nameEl.textContent = task.location;
  if (descEl) descEl.textContent = task.description;

  // 重置 Modal 狀態
  document.getElementById('modalUploadDefault').style.display = 'block';
  document.getElementById('modalFilePreview').style.display = 'none';
  document.getElementById('modalProgress').style.display = 'none';
  document.getElementById('modalSuccess').style.display = 'none';
  document.getElementById('btnSubmitVideo').style.display = 'none';
  hideYoutubeInput();

  // 顯示退回原因（若有）
  const rejectBanner = document.getElementById('modalRejectBanner');
  const rejectReasonEl = document.getElementById('modalRejectReason');
  if (rejectBanner && rejectReasonEl) {
    const reason = task.last_reject_reason;
    if (reason) {
      rejectReasonEl.textContent = reason;
      rejectBanner.style.display = 'block';
    } else {
      rejectBanner.style.display = 'none';
    }
  }

  // 顯示 Modal
  const modal = document.getElementById('uploadModal');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeUploadModal() {
  closeCameraCapture();  // 停止相機（若開著）
  const modal = document.getElementById('uploadModal');
  modal.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; }, 200);
  _selectedTaskId = null;
  _selectedTaskData = null;
  _modalSelectedFile = null;
  const fi = document.getElementById('videoFileInput');
  if (fi) fi.value = '';
  const preview = document.getElementById('modalVideoPreview');
  if (preview) { preview.src = ''; preview.load(); }
  // 重置上傳 Modal 狀態
  document.getElementById('modalUploadDefault').style.display  = 'block';
  document.getElementById('modalFilePreview').style.display    = 'none';
  document.getElementById('modalProgress').style.display       = 'none';
  document.getElementById('modalSuccess').style.display        = 'none';
  document.getElementById('btnSubmitVideo').style.display      = 'none';
  hideYoutubeInput();
  const urlInput = document.getElementById('youtubeUrlInput');
  if (urlInput) urlInput.value = '';
}

// ── YouTube 提交 ──────────────────────────────────────────────
function showYoutubeInput() {
  document.getElementById('modalYoutubeInput').style.display = 'block';
  document.getElementById('modalUploadDefault').style.display = 'none';
}

function hideYoutubeInput() {
  const el = document.getElementById('modalYoutubeInput');
  if (el) el.style.display = 'none';
  const def = document.getElementById('modalUploadDefault');
  if (def) def.style.display = 'block';
}

// 前端 YouTube URL 安全驗證（與後端同邏輯，雙重防護）
function _extractYoutubeId(url) {
  try {
    const u = new URL(url.trim());
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const allowed = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']);
    if (!allowed.has(u.hostname)) return null;
    let vid;
    if (u.hostname === 'youtu.be') {
      vid = u.pathname.slice(1).split('?')[0];
    } else {
      vid = u.searchParams.get('v');
    }
    if (!vid || !/^[A-Za-z0-9_-]{11}$/.test(vid)) return null;
    return vid;
  } catch { return null; }
}

async function submitYoutubeLink() {
  const urlInput = document.getElementById('youtubeUrlInput');
  const url = urlInput ? urlInput.value.trim() : '';
  if (!url) { showToast('⚠️ 請貼上 YouTube 影片連結'); return; }

  const vid = _extractYoutubeId(url);
  if (!vid) {
    showToast('❌ 連結無效：請確認為 youtube.com 或 youtu.be 的影片連結');
    return;
  }

  const btn = document.querySelector('#modalYoutubeInput button:last-child');
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

  try {
    const user = state.currentUser;
    const userId = user?.id || 'crowd_001';
    const res = await fetch('/api/crowd/submit-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: _selectedTaskId, youtube_url: url, user_id: userId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '提交失敗');

    // 切換到成功畫面（重用現有成功區塊）
    document.getElementById('modalYoutubeInput').style.display = 'none';
    document.getElementById('modalSuccess').style.display = 'block';
    document.getElementById('modalSuccessMsg').textContent =
      `YouTube 影片已提交！累積獎勵：+${data.points_earned} 點`;
    document.getElementById('clipMatchResult').style.display = 'none';
    document.getElementById('clipMatchLoading').style.display = 'none';
    // 關閉 modal 並刷新任務列表（任務提交後消失）
    setTimeout(() => {
      closeUploadModal();
      loadCrowdData();
    }, 1500);
  } catch (e) {
    showToast(`⚠️ ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ 提交 YouTube 影片'; }
  }
}

async function submitModalUpload() {
  if (!_modalSelectedFile || !_selectedTaskId) {
    showToast('⚠️ 請先選擇影片檔案');
    return;
  }

  // 行動網路上傳警告
  if (_realNetType === 'mobile' || _realNetType === 'unknown') {
    const fileMB = (_modalSelectedFile.size / 1024 / 1024).toFixed(1);
    const conn = _readConnection();
    const eff = conn?.effectiveType || '';
    if (eff === 'slow-2g' || eff === '2g' || eff === '3g') {
      showToast(`⚠️ 目前網速（${eff.toUpperCase()}）較慢，上傳 ${fileMB}MB 可能需要較長時間`);
      await new Promise(r => setTimeout(r, 1500));
    } else if (_realNetType === 'mobile') {
      showToast(`📡 行動網路上傳中（${fileMB}MB），將消耗流量`);
    }
  }
  // 切換到進度條狀態
  document.getElementById('modalUploadDefault').style.display = 'none';
  document.getElementById('modalFilePreview').style.display = 'none';
  document.getElementById('modalProgress').style.display = 'block';
  document.getElementById('btnSubmitVideo').style.display = 'none';

  try {
    const result = await api.uploadVideo(_selectedTaskId, _modalSelectedFile, (pct) => {
      document.getElementById('modalProgressBar').style.width = `${pct}%`;
      document.getElementById('modalProgressText').textContent = `上傳中… ${pct}%`;
    });

    // 成功
    document.getElementById('modalProgress').style.display = 'none';
    document.getElementById('modalSuccess').style.display = 'block';
    document.getElementById('modalSuccessMsg').textContent =
      `視訊已提交！累積獎勵：+${result.points_earned} 點`;

    showToast(`✅ 影片上傳成功！+${result.points_earned} 點`);
    const completedTaskId = result.task_id;
    _selectedTaskId = null;

    // CLIP 內容符合度分析（非同步，不擋 UI）
    runClipMatchAnalysis(completedTaskId);

    // 刷新統計與地圖
    await loadCrowdData();
    if (_gmapReady) loadCrowdVideoMarkers();

    // 里程碑獎勵
    if (result.milestone_reward) {
      const r = result.milestone_reward;
      document.getElementById('rgcStore').textContent  = r.store  || '—';
      document.getElementById('rgcIcon').textContent   = r.icon   || '🎁';
      document.getElementById('rgcItem').textContent   = r.item   || '兌換券';
      document.getElementById('rgcCode').textContent   = r.code   || '—';
      document.getElementById('rgcExpiry').textContent = r.expiry ? `有效期限：${r.expiry}` : '';
      setTimeout(() => {
        document.getElementById('rewardModal').style.display = 'flex';
      }, 800);
    }
  } catch (err) {
    document.getElementById('modalProgress').style.display = 'none';
    document.getElementById('modalUploadDefault').style.display = 'block';
    showToast(`⚠️ 上傳失敗：${err.message}`);
  }
}

// ── CLIP 影片內容符合度（後端 CLIP 推論）────────────────────────────────
async function runClipMatchAnalysis(taskId) {
  if (!taskId) return;
  const loadingEl      = document.getElementById('clipMatchLoading');
  const resultEl       = document.getElementById('clipMatchResult');
  const barEl          = document.getElementById('clipMatchBar');
  const scoreEl        = document.getElementById('clipMatchScore');
  const labelEl        = document.getElementById('clipMatchLabel');
  const descEl         = document.getElementById('clipMatchDesc');
  const audioRowEl     = document.getElementById('clipAudioRow');
  const audioBarEl     = document.getElementById('clipAudioBar');
  const audioScoreEl   = document.getElementById('clipAudioScore');
  const audioLabelEl   = document.getElementById('clipAudioLabel');
  const detectedEl     = document.getElementById('clipDetectedSounds');
  const suggestRowEl   = document.getElementById('clipSuggestionsRow');
  const suggestListEl  = document.getElementById('clipSuggestionsList');
  if (!loadingEl || !resultEl) return;

  // 重置
  if (audioRowEl)   audioRowEl.style.display   = 'none';
  if (suggestRowEl) suggestRowEl.style.display  = 'none';
  loadingEl.style.display = 'block';
  resultEl.style.display  = 'none';

  try {
    // 後端推論含 CLAP 模型等待，最多 120 秒
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const res = await fetch(`/api/video/analyze/${encodeURIComponent(taskId)}`,
      { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();

    loadingEl.style.display = 'none';

    if (data.score_pct < 0) {
      resultEl.style.display = 'block';
      barEl.style.width = '0%';
      scoreEl.textContent = '—';
      labelEl.textContent = data.label || '分析未完成';
      labelEl.style.color = '#999';
      return;
    }

    const QUALIFY_THRESHOLD = 70;
    const AUDIO_TARGET      = 90;
    const qualified = data.score_pct >= QUALIFY_THRESHOLD;
    const colorMap  = { good: '#2d8f61', warn: '#f5a623', bad: '#e74c3c' };
    const color     = colorMap[data.level] || '#666';

    // ── 綜合分數 ──
    barEl.style.width      = `${data.score_pct}%`;
    barEl.style.background = color;
    scoreEl.textContent    = `${data.score_pct}%`;
    scoreEl.style.color    = color;
    labelEl.textContent    = data.level === 'good' ? `✅ ${data.label}`
                           : data.level === 'warn' ? `⚠️ ${data.label}`
                           : `❌ ${data.label}`;
    labelEl.style.color = color;

    // 70% 閾值獎勵提示（先移除舊的，避免重複）
    resultEl.querySelectorAll('.reward-hint').forEach(el => el.remove());
    const rewardHint = qualified
      ? `<div class="reward-hint" style="margin-top:5px;font-size:0.74rem;color:#2d8f61;font-weight:700">🎁 符合內容要求，積分已完整發放！</div>`
      : `<div class="reward-hint" style="margin-top:5px;font-size:0.74rem;color:#e74c3c">需符合度 ≥70% 才計入完整積分，建議依描述重新拍攝</div>`;
    labelEl.insertAdjacentHTML('afterend', rewardHint);

    if (data.description) descEl.textContent = `比對描述：${data.description}`;

    // ── 音頻分析列 ──
    // 先清除舊的額外提示
    audioRowEl && audioRowEl.querySelectorAll('.audio-extra-hint').forEach(el => el.remove());

    if (data.has_audio_analysis && audioRowEl) {
      // 有音效關鍵字：顯示符合度分數 + 偵測結果
      const aPct   = data.audio_score_pct ?? 0;
      const aLevel = data.audio_level || 'warn';
      const aColor = colorMap[aLevel] || '#5b8dd9';
      audioBarEl.style.width      = `${Math.max(0, aPct)}%`;
      audioBarEl.style.background = aColor;
      audioScoreEl.textContent    = aPct >= 0 ? `${aPct}%` : '—';
      audioScoreEl.style.color    = aColor;
      audioLabelEl.textContent    = data.audio_label || '';
      audioLabelEl.style.color    = aColor;
      if (detectedEl && data.detected_sounds?.length) {
        const labels = data.detected_sounds.map(s => typeof s === 'object' ? s.label : s);
        detectedEl.textContent = `偵測到：${labels.join(' · ')}`;
      }
      if (aPct < AUDIO_TARGET && aPct >= 0) {
        audioLabelEl.insertAdjacentHTML('afterend',
          `<div class="audio-extra-hint" style="font-size:0.66rem;color:#e74c3c;margin-top:2px">音效建議達 ${AUDIO_TARGET}% 以上獲最佳評分</div>`);
      }
      audioRowEl.style.display = 'block';
    } else if (data.detect_only && audioRowEl && data.detected_sounds?.length) {
      // 無音效關鍵字，但 CLAP 偵測到聲音：只顯示環境聲，不顯示分數 bar
      audioBarEl.parentElement.style.display = 'none';  // 隱藏分數條
      audioScoreEl.textContent = '';
      audioLabelEl.textContent = '🔈 環境聲偵測';
      audioLabelEl.style.color = '#5b8dd9';
      const labels = data.detected_sounds.map(s => typeof s === 'object' ? s.label : s);
      if (detectedEl) detectedEl.textContent = `偵測到：${labels.join(' · ')}`;
      audioRowEl.style.display = 'block';
    } else if (audioRowEl && data.audio_label && data.has_audio_analysis !== false) {
      // CLAP 尚未就緒但有關鍵字
      audioLabelEl.textContent = data.audio_label;
      audioRowEl.style.display = 'block';
    }

    // ── 建議列表 ──
    if (suggestRowEl && suggestListEl && data.suggestions?.length) {
      suggestListEl.innerHTML = data.suggestions
        .map(s => `<li>${s}</li>`).join('');
      suggestRowEl.style.display = 'block';
    }

    resultEl.style.display = 'block';
  } catch (e) {
    loadingEl.style.display = 'none';
  }
}

// ── AI 畫面品質分析（Laplacian Variance，純 JS 輕量演算法）─────────────
function _computeLaplacianVariance(ctx, w, h) {
  // 取樣最大 320×240，避免效能問題
  const sw = Math.min(w, 320), sh = Math.min(h, 240);
  let imgData;
  try { imgData = ctx.getImageData(0, 0, sw, sh); } catch { return -1; }
  const { data } = imgData;

  // 轉灰階
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
  }

  // Laplacian kernel [0,1,0; 1,-4,1; 0,1,0] → 計算 variance
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const lap = gray[(y-1)*sw+x] + gray[(y+1)*sw+x]
                + gray[y*sw+(x-1)] + gray[y*sw+(x+1)]
                - 4 * gray[y*sw+x];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;  // variance（越大越清晰）
}

function _computeBrightness(ctx, w, h) {
  const sw = Math.min(w, 160), sh = Math.min(h, 120);
  let imgData;
  try { imgData = ctx.getImageData(0, 0, sw, sh); } catch { return -1; }
  const { data } = imgData;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
  }
  return total / (sw * sh);  // 0–255
}

// 分析單一影片幀（videoEl 必須已有資料）
async function analyzeVideoFrame(videoEl) {
  const canvas = document.getElementById('aiAnalysisCanvas') || document.createElement('canvas');
  const w = videoEl.videoWidth  || 640;
  const h = videoEl.videoHeight || 360;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);

  const blur       = _computeLaplacianVariance(ctx, w, h);
  const brightness = _computeBrightness(ctx, w, h);
  return { blur, brightness };
}

// 計算綜合分數並更新 AI 品質面板
async function runVideoQualityAnalysis(videoEl) {
  const panel = document.getElementById('aiQualityItems');
  const scoreBar = document.getElementById('aiScoreBar');
  const scoreText = document.getElementById('aiScoreText');
  if (!panel) return;

  // 跳到 10% 位置截取代表幀
  await new Promise(resolve => {
    const onSeeked = () => { videoEl.removeEventListener('seeked', onSeeked); resolve(); };
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = (videoEl.duration || 2) * 0.1;
    setTimeout(resolve, 800);  // timeout fallback
  });

  const { blur, brightness } = await analyzeVideoFrame(videoEl);

  // ── 清晰度評分（Laplacian variance：> 300 最清晰）
  const blurScore = blur < 0 ? 60 : Math.min(100, Math.round(blur / 3));
  const blurGood  = blurScore >= 60;
  const blurLabel = blurScore >= 75 ? '✅ 畫面清晰'
                  : blurScore >= 45 ? '⚠️ 畫面稍模糊，建議放慢移動'
                  : '❌ 畫面模糊，請重拍或走慢一點';

  // ── 亮度評分
  const brightnessScore = brightness < 0 ? 70
    : brightness < 30  ? 20   // 太暗
    : brightness < 60  ? 50   // 稍暗
    : brightness > 220 ? 55   // 過曝
    : brightness > 190 ? 75   // 稍亮
    : 100;                     // 正常
  const briLabel = brightness < 30  ? '❌ 畫面太暗，請補光或靠近窗邊'
                 : brightness < 60  ? '⚠️ 光線稍暗，建議補光'
                 : brightness > 220 ? '⚠️ 畫面過曝，避免對著強光'
                 : '✅ 光線良好';

  // ── 綜合分數
  const total = Math.round((blurScore * 0.6 + brightnessScore * 0.4));
  const scoreColor = total >= 75 ? '#2d8f61' : total >= 50 ? '#f5a623' : '#e74c3c';

  // ── 更新 UI
  if (scoreBar)  { scoreBar.style.width = `${total}%`; scoreBar.style.background = scoreColor; }
  if (scoreText) { scoreText.textContent = `${total}分`; scoreText.style.color = scoreColor; }

  panel.innerHTML = `
    <div class="ai-quality-item">
      <span class="ai-qi-icon">${blurGood ? '🔍' : '🌀'}</span>
      <span class="ai-qi-label">${blurLabel}</span>
      <div class="ai-qi-bar"><div class="ai-qi-fill ${blurScore>=75?'good':blurScore>=45?'warn':'bad'}"
        style="width:${blurScore}%"></div></div>
    </div>
    <div class="ai-quality-item">
      <span class="ai-qi-icon">${brightnessScore>=75?'☀️':'🌑'}</span>
      <span class="ai-qi-label">${briLabel}</span>
      <div class="ai-qi-bar"><div class="ai-qi-fill ${brightnessScore>=75?'good':brightnessScore>=45?'warn':'bad'}"
        style="width:${brightnessScore}%"></div></div>
    </div>
    ${total >= 70 ? '<div style="color:#2d8f61;font-weight:700;margin-top:4px">🎯 品質良好，可以上傳！</div>'
                  : '<div style="color:#e74c3c;font-weight:600;margin-top:4px">建議依提示調整後重新拍攝</div>'}
  `;
}

// ── 直接拍攝（相機模式）────────────────────────────────────
let _cameraStream  = null;
let _mediaRecorder = null;
let _recordedChunks = [];
let _recTimerInterval = null;
let _liveAnalysisInterval = null;

function openCameraCapture() {
  navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
    .then(stream => {
      _cameraStream = stream;
      const liveVideo = document.getElementById('cameraLivePreview');
      liveVideo.srcObject = stream;

      document.getElementById('modalUploadDefault').style.display = 'none';
      document.getElementById('cameraPreviewArea').style.display = 'block';

      // 每 1.5 秒 AI 分析畫面
      _liveAnalysisInterval = setInterval(async () => {
        if (!liveVideo.videoWidth) return;
        const canvas = document.getElementById('aiAnalysisCanvas');
        canvas.width = liveVideo.videoWidth; canvas.height = liveVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(liveVideo, 0, 0);
        const blur = _computeLaplacianVariance(ctx, canvas.width, canvas.height);
        const bri  = _computeBrightness(ctx, canvas.width, canvas.height);

        const guideEl = document.getElementById('aiLiveGuideText');
        if (!guideEl) return;
        if (bri >= 0 && bri < 30)       guideEl.textContent = '🌑 畫面太暗，請靠近光源';
        else if (bri > 220)              guideEl.textContent = '☀️ 光線過強，避免對著強光';
        else if (blur >= 0 && blur < 50) guideEl.textContent = '🌀 畫面模糊，請放慢移動或保持穩定';
        else if (blur < 150)             guideEl.textContent = '⚠️ 稍微模糊，試著放慢腳步';
        else                             guideEl.textContent = '✅ 畫面穩定清晰，可以開始錄影';
      }, 1500);
    })
    .catch(err => {
      showToast('⚠️ 無法開啟相機：' + (err.message || err));
    });
}

function startCameraRecord() {
  if (!_cameraStream) return;
  _recordedChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  _mediaRecorder = new MediaRecorder(_cameraStream, { mimeType });
  _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _recordedChunks.push(e.data); };
  _mediaRecorder.onstop = _onCameraRecordStop;
  _mediaRecorder.start(200);

  document.getElementById('btnStartRecord').style.display = 'none';
  document.getElementById('btnStopRecord').style.display = '';
  document.getElementById('recTimer').style.display = 'block';

  // 計時
  let secs = 0;
  _recTimerInterval = setInterval(() => {
    secs++;
    const m = String(Math.floor(secs/60)).padStart(1,'0');
    const s = String(secs % 60).padStart(2,'0');
    const el = document.getElementById('recTimerText');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function stopCameraRecord() {
  _mediaRecorder?.stop();
  clearInterval(_recTimerInterval);
  document.getElementById('recTimer').style.display = 'none';
  document.getElementById('btnStopRecord').style.display = 'none';
  document.getElementById('btnStartRecord').style.display = '';
}

function _onCameraRecordStop() {
  const blob = new Blob(_recordedChunks, { type: 'video/webm' });
  _modalSelectedFile = new File([blob], `ansin_${Date.now()}.webm`, { type: 'video/webm' });

  closeCameraCapture();
  // 錄完後隱藏選擇框（closeCameraCapture 會把它顯示出來，這裡蓋掉）
  document.getElementById('modalUploadDefault').style.display = 'none';

  // 顯示預覽 + 分析
  const preview = document.getElementById('modalVideoPreview');
  if (preview) preview.src = URL.createObjectURL(blob);
  const fileNameEl = document.getElementById('modalFileName');
  if (fileNameEl) fileNameEl.textContent = `📷 錄影 (${(_modalSelectedFile.size/1024/1024).toFixed(1)} MB)`;
  document.getElementById('modalFilePreview').style.display = 'block';
  document.getElementById('btnSubmitVideo').style.display = 'block';

}

function closeCameraCapture() {
  clearInterval(_liveAnalysisInterval);
  _liveAnalysisInterval = null;
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
  const liveVideo = document.getElementById('cameraLivePreview');
  if (liveVideo) { liveVideo.srcObject = null; }
  document.getElementById('cameraPreviewArea').style.display = 'none';
  document.getElementById('modalUploadDefault').style.display = 'block';
}

// file input 改變 → Modal 預覽 + AI 分析
document.getElementById('videoFileInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  _modalSelectedFile = file;

  const preview = document.getElementById('modalVideoPreview');
  const previewEl = document.getElementById('modalFilePreview');
  const fileNameEl = document.getElementById('modalFileName');
  if (preview) preview.src = URL.createObjectURL(file);
  if (fileNameEl) fileNameEl.textContent = `📎 ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
  if (previewEl) previewEl.style.display = 'block';
  document.getElementById('modalUploadDefault').style.display = 'none';
  document.getElementById('btnSubmitVideo').style.display = 'block';

});

// Modal 關閉按鈕
document.getElementById('btnCloseUpload')?.addEventListener('click', closeUploadModal);
document.getElementById('uploadModal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('uploadModal')) closeUploadModal();
});


// ── 頁面進入時自動載入資料 ────────────────────────
let _lastActiveScreen = null;
const observers = new MutationObserver(() => {
  const active = document.querySelector('.screen.active');
  if (!active) return;
  const id = active.id;
  if (id === _lastActiveScreen) return;

  // 離開任意視界時，重置所有狀態
  if (_lastActiveScreen === 'screen-anyview') {
    if (_searchMarker) { _searchMarker.setMap(null); _searchMarker = null; }
    if (_infoWindow)   { _infoWindow.close(); }
    const searchInput = document.getElementById('mapSearchInput');
    if (searchInput) searchInput.value = '';
    stopGlobeAnim();
    stopTherapeuticIframe();   // 停止療癒精選影片
    resetToPlaceholder();
  }

  _lastActiveScreen = id;
  if (id === 'screen-patient-home') startPatientFriendPoll();
  if (id === 'screen-anyview') { loadTwipcamCameras(); loadCrowdVideoMarkers(); startGlobeAnim(); loadPatientPrescription(); loadPrescriptionFulfillmentVideos(); }
  if (id === 'screen-medical') loadPatientMessages();
  if (id === 'screen-doctor') loadDoctorList();
  if (id === 'screen-crowd') { loadCrowdData(); startCrowdNotifPoll(); }
  if (id === 'screen-doctor' || id === 'screen-doctor-reply') startDoctorEmotionPoll();
});
document.querySelectorAll('.screen').forEach(s =>
  observers.observe(s, { attributes: true, attributeFilter: ['class'] })
);

// ── 重置影像面板為佔位狀態 ────────────────────────
function resetToPlaceholder() {
  // 立即清除 toast
  const t = document.getElementById('toast');
  if (t) { t.classList.remove('show'); clearTimeout(window._toastTimer); }
  const camStream = document.getElementById('camStream');
  if (camStream) { camStream.onload = null; camStream.onerror = null; camStream.src = ''; camStream.style.display = 'none'; }
  const crowdVideoPlayer = document.getElementById('crowdVideoPlayer');
  if (crowdVideoPlayer) { crowdVideoPlayer.pause(); crowdVideoPlayer.src = ''; crowdVideoPlayer.style.display = 'none'; }
  const ytPlStop = document.getElementById('crowdYoutubePlayer');
  if (ytPlStop) { ytPlStop.src = ''; ytPlStop.style.display = 'none'; }
  const placeholder = document.getElementById('camPlaceholder');
  if (placeholder) placeholder.style.display = 'flex';
  const loading = document.getElementById('camLoading');
  if (loading) loading.style.display = 'none';
  const errOverlay = document.getElementById('camErrorOverlay');
  if (errOverlay) errOverlay.style.display = 'none';
  document.getElementById('aiBubble')?.remove();
  const badge = document.getElementById('videoLiveBadge');
  const controls = document.getElementById('videoControls');
  const btnClose = document.getElementById('btnCloseStream');
  if (badge) badge.style.display = 'none';
  if (controls) controls.style.display = 'none';
  if (btnClose) btnClose.style.display = 'none';
  const actDiv = document.getElementById('crowdVideoActions');
  if (actDiv) actDiv.style.display = 'none';
  const title = document.getElementById('videoPanelTitle');
  if (title) title.textContent = '📺 選擇景點開始觀看';
  _selectedCamId = null;
  startGlobeAnim();
}

// 關閉按鈕（正常播放時）
document.getElementById('btnCloseStream')?.addEventListener('click', resetToPlaceholder);
// 關閉按鈕（連線失敗時）
document.getElementById('btnErrorClose')?.addEventListener('click', resetToPlaceholder);

// ── 地球輪播動畫 ──────────────────────────────────
const GLOBES = ['🌍', '🌎', '🌏'];
let _globeIdx = 0;
let _globeTimer = null;

function startGlobeAnim() {
  if (_globeTimer) return;
  _globeTimer = setInterval(() => {
    const el = document.getElementById('globeEmoji');
    if (!el) return;
    _globeIdx = (_globeIdx + 1) % GLOBES.length;
    el.style.transform = 'scale(0.8)';
    setTimeout(() => {
      el.textContent = GLOBES[_globeIdx];
      el.style.transform = 'scale(1)';
    }, 150);
  }, 2000);
}

function stopGlobeAnim() {
  clearInterval(_globeTimer);
  _globeTimer = null;
}

// ── 功能卡片導向 ──────────────────────────────────
document.getElementById("btnAnyView")?.addEventListener("click", () => { goTo("screen-anyview"); startGlobeAnim(); });
document.getElementById("btnMedical")?.addEventListener("click", () => goTo("screen-medical"));
document.getElementById("btnCrowd")?.addEventListener("click", () => goTo("screen-crowd"));

// ════════════════════════════════════════════════
// 認證：註冊 / 忘記密碼
// ════════════════════════════════════════════════
const _authRoleConfig = {
  patient: { icon: '😊', label: '病患端', extraId: 'regBed',  extraLabel: '床號', extraPlaceholder: '床號（如 503-B，請洽護理站）' },
  doctor:  { icon: '👨‍⚕️', label: '醫師端', extraId: 'regDept', extraLabel: '科別', extraPlaceholder: '科別（如：內科、外科）' },
  crowd:   { icon: '🙋', label: '志工/群眾端', extraId: null,  extraLabel: null,  extraPlaceholder: null }
};
let _authRole  = 'patient';
let _forgotOtp = '';

function openAuthRegister(role) {
  _authRole = role || 'patient';
  const cfg = _authRoleConfig[_authRole];
  document.getElementById('regRoleIcon').textContent    = cfg.icon;
  document.getElementById('regRoleLabel').textContent   = cfg.label + ' 帳號';
  const extraDiv = document.getElementById('regExtraField');
  extraDiv.innerHTML = cfg.extraId
    ? `<input id="${cfg.extraId}" type="text" placeholder="${cfg.extraLabel}（必填）"
        style="padding:10px 13px;border:1.5px solid #e0e0e0;border-radius:10px;
               font-size:0.9rem;font-family:inherit;outline:none;width:100%;box-sizing:border-box"/>`
    : '';
  ['regName','regAccount','regPassword','regPasswordConfirm','regPhone'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('regError').style.display  = 'none';
  document.getElementById('regStep1').style.display  = 'block';
  document.getElementById('regStep2').style.display  = 'none';
  const colors = { patient:'linear-gradient(135deg,#2d8f61,#38af7a)', doctor:'linear-gradient(135deg,#667eea,#764ba2)', crowd:'linear-gradient(135deg,#f5a623,#ffc83a)' };
  const btn = document.getElementById('regSubmitBtn');
  if (btn) btn.style.background = colors[_authRole] || colors.patient;
  document.getElementById('authRegisterModal').style.display = 'flex';
}
function closeAuthRegister() { document.getElementById('authRegisterModal').style.display = 'none'; }
function _showRegError(msg) {
  const el = document.getElementById('regError');
  el.textContent = msg; el.style.display = 'block';
}
async function submitRegister() {
  const name    = document.getElementById('regName').value.trim();
  const account = document.getElementById('regAccount').value.trim();
  const pass    = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regPasswordConfirm').value;
  const phone   = document.getElementById('regPhone').value.trim().replace(/[-\s]/g,'');
  const cfg     = _authRoleConfig[_authRole];
  const extraEl = cfg.extraId ? document.getElementById(cfg.extraId) : null;
  const extra   = extraEl ? extraEl.value.trim() : '';
  if (!name)                          return _showRegError('請輸入姓名');
  if (account.length < 6)             return _showRegError('帳號至少需要 6 個字元');
  if (!/^[A-Za-z0-9_]+$/.test(account)) return _showRegError('帳號僅可使用英文、數字、底線');
  if (pass.length < 6)                return _showRegError('密碼至少需要 6 個字元');
  if (pass !== confirm)               return _showRegError('兩次密碼輸入不一致');
  if (cfg.extraId && !extra)          return _showRegError(`請輸入${cfg.extraLabel}`);
  if (!phone)                         return _showRegError('請輸入手機號碼');
  if (!/^09\d{8}$/.test(phone))       return _showRegError('手機格式有誤（需為 09 開頭的 10 碼）');
  const btn = document.getElementById('regSubmitBtn');
  btn.disabled = true; btn.textContent = '建立中…';
  document.getElementById('regError').style.display = 'none';
  try {
    const body = { name, account, password: pass, phone, role: _authRole };
    if (cfg.extraId) body[cfg.extraId] = extra;
    const res = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '建立失敗');
    document.getElementById('regStep1').style.display = 'none';
    document.getElementById('regStep2').style.display = 'block';
    document.getElementById('regSuccessMsg').innerHTML =
      `帳號 <strong>${escHtml(account)}</strong> 已建立。<br>請記住您的帳號與密碼，並前往登入。`;
  } catch (e) { _showRegError(e.message); }
  finally { btn.disabled = false; btn.textContent = '建立帳號 →'; }
}

// ── 忘記密碼 ──────────────────────────────────────
let _forgotRole = 'patient';
function openAuthForgot(role) {
  _forgotRole = role || 'patient';
  document.getElementById('forgotRoleLabel').textContent = _authRoleConfig[_forgotRole].label + ' 密碼重設';
  ['forgotAccount','forgotCode','forgotNewPass','forgotNewPassConfirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('forgotError').style.display  = 'none';
  document.getElementById('forgotError2').style.display = 'none';
  goForgotStep1();
  document.getElementById('authForgotModal').style.display = 'flex';
}
function closeAuthForgot() { document.getElementById('authForgotModal').style.display = 'none'; }
function goForgotStep1() {
  document.getElementById('forgotStep1').style.display = 'block';
  document.getElementById('forgotStep2').style.display = 'none';
  document.getElementById('forgotStep3').style.display = 'none';
}
async function submitForgot() {
  const account = document.getElementById('forgotAccount').value.trim();
  const method  = document.querySelector('input[name="forgotMethod"]:checked')?.value || 'sms';
  const errEl   = document.getElementById('forgotError');
  errEl.style.display = 'none';
  if (!account) { errEl.textContent = '請輸入帳號'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, method, role: _forgotRole })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '查無此帳號');
    _forgotOtp = data.otp || '123456';
    const hint = method === 'sms'
      ? `已傳送 6 位驗證碼至 ${data.masked_phone || '09xx-xxxx-xxx'}（有效 10 分鐘）`
      : `已傳送重設連結至 ${data.masked_email || 'xx**@****.com'}（有效 10 分鐘）`;
    document.getElementById('forgotSentHint').textContent = '📩 ' + hint;
    document.getElementById('forgotStep1').style.display = 'none';
    document.getElementById('forgotStep2').style.display = 'block';
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}
async function confirmResetPassword() {
  const code    = document.getElementById('forgotCode').value.trim();
  const newPass = document.getElementById('forgotNewPass').value;
  const confirm = document.getElementById('forgotNewPassConfirm').value;
  const errEl   = document.getElementById('forgotError2');
  errEl.style.display = 'none';
  if (!code)               { errEl.textContent = '請輸入驗證碼';         errEl.style.display = 'block'; return; }
  if (code !== _forgotOtp) { errEl.textContent = '驗證碼錯誤，請重新確認'; errEl.style.display = 'block'; return; }
  if (newPass.length < 6)  { errEl.textContent = '新密碼至少需要 6 個字元'; errEl.style.display = 'block'; return; }
  if (newPass !== confirm)  { errEl.textContent = '兩次密碼輸入不一致';    errEl.style.display = 'block'; return; }
  try {
    const account = document.getElementById('forgotAccount').value.trim();
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, new_password: newPass, otp: code, role: _forgotRole })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '重設失敗');
    document.getElementById('forgotStep2').style.display = 'none';
    document.getElementById('forgotStep3').style.display = 'block';
  } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
}

// ── 分享 Modal ────────────────────────────────────
// ════════════════════════════════════════════════
// 病患端：指定親友協助拍攝
// ════════════════════════════════════════════════

let _patientShareMap = null;
let _patientShareMarker = null;
let _patientShareAutocomplete = null;
let _patientShareLatLng = null;
let _patientShareInfoWindow = null;

function _initPatientShareMap() {
  if (_patientShareMap || !window.google || !window.google.maps) return;
  const mapEl = document.getElementById('patientShareMap');
  if (!mapEl) return;

  _patientShareMap = new google.maps.Map(mapEl, {
    center: { lat: 25.0478, lng: 121.5319 },
    zoom: 13,
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: 'greedy'
  });
  _patientShareInfoWindow = new google.maps.InfoWindow();
  _patientShareMarker = new google.maps.Marker({
    map: _patientShareMap,
    animation: google.maps.Animation.DROP,
    icon: { url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 40) }
  });

  // 搜尋框 Autocomplete
  const locEl = document.getElementById('patientShareLocation');
  if (locEl && !_patientShareAutocomplete) {
    _patientShareAutocomplete = new google.maps.places.Autocomplete(locEl, {
      fields: ['geometry', 'name', 'formatted_address'],
      componentRestrictions: { country: 'tw' }
    });
    _patientShareAutocomplete.addListener('place_changed', () => {
      const place = _patientShareAutocomplete.getPlace();
      if (!place.geometry) return;
      const pos = place.geometry.location;
      _patientShareSetLocation(place.name || place.formatted_address, pos.lat(), pos.lng());
    });
  }

  // 地圖載入完成後隱藏 hint（顯示地圖底圖）
  google.maps.event.addListenerOnce(_patientShareMap, 'idle', () => {
    const hint = document.getElementById('patientShareMapHint');
    if (hint && !_patientShareLatLng) hint.style.display = 'none';
  });

  // 點擊地圖任意位置 → 反地理編碼取名稱
  _patientShareMap.addListener('click', async (e) => {
    const latLng = e.latLng;
    if (e.placeId) {
      e.stop();
      const svc = new google.maps.places.PlacesService(_patientShareMap);
      svc.getDetails({ placeId: e.placeId, fields: ['name', 'formatted_address', 'geometry'] }, (pl, st) => {
        if (st === google.maps.places.PlacesServiceStatus.OK && pl) {
          _patientShareSetLocation(pl.name || pl.formatted_address, latLng.lat(), latLng.lng());
        }
      });
    } else {
      // 任意空白點擊 → 反地理編碼
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: latLng }, (results, status) => {
        const name = (status === 'OK' && results[0])
          ? (results[0].address_components[0]?.long_name || results[0].formatted_address)
          : `${latLng.lat().toFixed(5)}, ${latLng.lng().toFixed(5)}`;
        _patientShareSetLocation(name, latLng.lat(), latLng.lng());
      });
    }
  });
}

function _patientShareSetLocation(name, lat, lng) {
  _patientShareLatLng = { lat, lng };
  const pos = { lat, lng };
  _patientShareMap.panTo(pos);
  _patientShareMap.setZoom(16);
  _patientShareMarker.setPosition(pos);
  const locEl = document.getElementById('patientShareLocation');
  if (locEl) locEl.value = name;
  const hint = document.getElementById('patientShareMapHint');
  if (hint) hint.style.display = 'none';
  // 底部已選地點標籤
  const placeEl = document.getElementById('patientShareSelectedPlace');
  if (placeEl) {
    placeEl.style.display = 'block';
    placeEl.textContent = `📍 已選：${name}`;
  }
  // InfoWindow
  if (_patientShareInfoWindow) {
    _patientShareInfoWindow.setContent(
      `<div style="font-family:inherit;padding:4px 6px;font-size:0.88rem;font-weight:700;max-width:200px">📍 ${name}</div>`
    );
    _patientShareInfoWindow.open(_patientShareMap, _patientShareMarker);
  }
}

function openPatientSharePanel() {
  const locEl = document.getElementById('patientShareLocation');
  const reqEl = document.getElementById('patientShareRequirements');
  if (locEl) locEl.value = '';
  if (reqEl) reqEl.value = '';
  _patientShareLatLng = null;
  const hint = document.getElementById('patientShareMapHint');
  if (hint) hint.style.display = 'flex';
  const placeEl = document.getElementById('patientShareSelectedPlace');
  if (placeEl) placeEl.style.display = 'none';
  if (_patientShareMarker) _patientShareMarker.setPosition(null);
  if (_patientShareInfoWindow) _patientShareInfoWindow.close();
  goTo('screen-patient-share');
  // 初始化地圖（首次需等畫面切換後再 init）
  setTimeout(() => {
    _initPatientShareMap();
    if (_patientShareMap) google.maps.event.trigger(_patientShareMap, 'resize');
  }, 120);
}

function closePatientSharePanel() {
  goTo('screen-patient-home');
}

function onPatientShareLocationInput(val) {
  if (!val.trim()) {
    _patientShareLatLng = null;
    const hint = document.getElementById('patientShareMapHint');
    if (hint) hint.style.display = 'flex';
    const placeEl = document.getElementById('patientShareSelectedPlace');
    if (placeEl) placeEl.style.display = 'none';
    if (_patientShareMarker) _patientShareMarker.setPosition(null);
  }
}

async function submitPatientShareRequest() {
  const locEl = document.getElementById('patientShareLocation');
  const reqEl = document.getElementById('patientShareRequirements');
  const location = locEl ? locEl.value.trim() : '';
  const description = reqEl ? reqEl.value.trim() : '';
  if (!location) { showToast('⚠️ 請輸入拍攝地點'); return; }
  const btn = document.getElementById('btnPatientShareSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '建立中…'; }
  try {
    const user = state.currentUser;
    const bed = user ? (user.bed + '號病房') : '';
    const body = { location, description: description || '自然風景', requested_by: bed };
    const data = await fetch('/api/spot-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());
    const task = data.task || { id: data.id || 'new', location, description };
    closePatientSharePanel();
    openPatientShareModal(task);
  } catch {
    showToast('⚠️ 建立失敗，請重試');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 建立請求並分享給親友'; }
  }
}


function openPatientShareModal(task) {
  const user = state.currentUser;
  const name = user ? user.name : "我";
  const hospital = user ? user.hospital || "醫院" : "醫院";
  const bed = user ? user.bed + "號病房" : "病房";
  const previewEl = document.getElementById('shareTaskPreview');
  const msgEl = document.getElementById('shareMessage');
  if (previewEl) previewEl.textContent = `📍 ${task.location}：${task.description || ''}`;
  const msg = `嗨！我是${name}，目前住在${hospital} ${bed}。\n\n我想請你幫我拍一段影片，讓我能在病房裡欣賞外面的世界 🌍\n\n📍 拍攝地點：${task.location}\n📝 拍攝內容：${task.description || '自然風景'}\n\n拍好後可以上傳到「智慧醫療陪伴系統」，任務代碼：${task.id}\n謝謝你 💙`;
  if (msgEl) msgEl.value = msg;
  document.getElementById('shareModal').style.display = 'flex';
  closePatientSharePanel();
}

let _shareTask = null;

function openShareModal(task) {
  _shareTask = task;
  const previewEl = document.getElementById('shareTaskPreview');
  const msgEl     = document.getElementById('shareMessage');
  if (previewEl) {
    previewEl.textContent = task
      ? `📍 ${task.location}：${task.description}`
      : '加入安心醫伴，用影片幫助病患看見世界！';
  }
  const defaultMsg = task
    ? `嗨！我正在使用「智慧醫療陪伴系統」，幫助病房中的病患透過影片看見外面的世界 🌍\n\n任務地點：${task.location}\n任務說明：${task.description}\n\n如果你在附近，能不能幫我錄一段影片？完成後可以獲得 ${task.points} 點獎勵喔！\n\n加入我們：http://ansin.local`
    : `嗨！我正在使用「智慧醫療陪伴系統」，幫助病房中的病患透過影片看見外面的世界 🌍\n\n每一段影片都能帶給住院病患歡樂，快來一起參與吧！\n\n加入我們：http://ansin.local`;
  if (msgEl) msgEl.value = defaultMsg;
  document.getElementById('shareModal').style.display = 'flex';
}

function closeShareModal() {
  document.getElementById('shareModal').style.display = 'none';
  _shareTask = null;
}

function _getShareMsg() {
  return document.getElementById('shareMessage')?.value || '智慧醫療陪伴系統';
}

function shareViaLine() {
  const msg = _getShareMsg();
  window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
  showToast('💬 已開啟 LINE 分享');
}

function shareViaSMS() {
  const msg = _getShareMsg();
  window.open(`sms:?body=${encodeURIComponent(msg)}`, '_blank');
  showToast('📱 已開啟簡訊');
}

function shareViaMessenger() {
  const url = `https://www.facebook.com/dialog/send?link=${encodeURIComponent('https://ansin.local')}&app_id=966242223397117&redirect_uri=${encodeURIComponent('https://ansin.local')}`;
  window.open(url, '_blank');
  showToast('💙 已開啟 Messenger 分享');
}

async function copyShareMsg() {
  const msg = _getShareMsg();
  try {
    await navigator.clipboard.writeText(msg);
    showToast('📋 訊息已複製到剪貼簿！');
  } catch {
    // fallback: select textarea
    const ta = document.getElementById('shareMessage');
    if (ta) { ta.select(); ta.setSelectionRange(0, 99999); }
    showToast('📋 訊息已複製！');
  }
}

async function nativeShare() {
  const msg = _getShareMsg();
  if (navigator.share) {
    try {
      await navigator.share({ title: '智慧醫療陪伴系統', text: msg });
    } catch (e) {
      if (e.name !== 'AbortError') showToast('⚠️ 分享取消');
    }
  } else {
    await copyShareMsg();
    showToast('📋 已複製（此裝置不支援原生分享）');
  }
}

// ── 網路切換 ──────────────────────────────────────
// ── 真實網路偵測狀態 ─────────────────────────────
let _realNetType = 'unknown';  // 'wifi' | 'mobile' | 'none' | 'unknown'

function _readConnection() {
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

function _netTypeLabel(conn) {
  // conn.type 只在 Android Chrome 可靠；桌機 Chrome 通常是空字串
  // conn.effectiveType 代表「連線品質等級」，4g 不等於行動網路
  const type = conn.type || '';
  const eff  = conn.effectiveType || '';
  const mbps = conn.downlink != null ? `${conn.downlink} Mbps` : '';
  const rtt  = conn.rtt  != null && conn.rtt > 0 ? `延遲 ${conn.rtt}ms` : '';
  const extra = [mbps, rtt].filter(Boolean).join('，');

  // ── 有 conn.type：Android / Firefox 等可靠來源 ──────
  if (type === 'wifi' || type === 'ethernet') {
    _realNetType = 'wifi';
    return `🟢 Wi-Fi${extra ? `（${extra}）` : '（連線中）'}`;
  }
  if (type === 'cellular' || type === 'wimax') {
    _realNetType = 'mobile';
    const speed = eff === '5g' ? '5G' : eff === '4g' ? '4G/LTE' : eff ? eff.toUpperCase() : '行動網路';
    return `🟡 行動網路（${speed}${extra ? `，${extra}` : ''}）`;
  }
  if (type === 'none') {
    _realNetType = 'none';
    return '🔴 無網路連線';
  }

  // ── 無 conn.type（桌機 Chrome / Edge 等）──────────
  // effectiveType 只代表速度品質，不代表連線種類，不可用來判斷 Wi-Fi vs 行動
  _realNetType = 'unknown';
  if (eff === 'slow-2g' || eff === '2g') {
    return `🔴 連線品質差（${eff.toUpperCase()}${extra ? `，${extra}` : ''}）`;
  }
  if (eff) {
    return `🟢 連線中（品質 ${eff.toUpperCase()}${extra ? `，${extra}` : ''}）`;
  }
  return `⚪ 連線中${extra ? `（${extra}）` : ''}`;
}

function _setNetworkBtnActive(type) {
  document.getElementById('netBtnWifi')?.classList.toggle('active', type === 'wifi');
  document.getElementById('netBtnMobile')?.classList.toggle('active', type === 'mobile');
}

function _applyNetworkUI(label, pref) {
  const statusEl = document.getElementById('netStatusText');
  if (statusEl) statusEl.textContent = label;
  if (pref) _setNetworkBtnActive(pref);
}

function initNetworkStatus() {
  const conn = _readConnection();

  if (conn) {
    // 初次顯示真實狀態
    _applyNetworkUI(_netTypeLabel(conn), _realNetType === 'unknown' ? null : _realNetType);

    // 監聽網路變化（斷線 / 切換 Wi-Fi / 回到 4G）
    conn.onchange = () => {
      const label = _netTypeLabel(conn);
      _applyNetworkUI(label, _realNetType === 'unknown' ? null : _realNetType);
      if (_realNetType === 'wifi') showToast('✅ 已偵測到 Wi-Fi 連線');
      else if (_realNetType === 'mobile') showToast('📡 已切換至行動網路');
      else if (_realNetType === 'none') showToast('⚠️ 網路連線中斷');
    };
  } else {
    _applyNetworkUI('⚪ 此瀏覽器不支援自動偵測', null);
  }

  // 恢復手動偏好按鈕高亮
  const saved = localStorage.getItem('ansin-network-pref');
  if (saved) _setNetworkBtnActive(saved);
}

function switchNetwork(type) {
  localStorage.setItem('ansin-network-pref', type);
  _setNetworkBtnActive(type);

  const conn = _readConnection();
  const statusEl = document.getElementById('netStatusText');

  if (type === 'wifi') {
    if (_realNetType === 'wifi') {
      if (statusEl) statusEl.textContent = conn ? _netTypeLabel(conn) : '🟢 Wi-Fi 連線中';
      showToast('✅ 目前已連接 Wi-Fi');
    } else if (_realNetType === 'mobile') {
      if (statusEl) statusEl.textContent = '⚠️ 目前為行動網路，請至裝置的網路設定連接 Wi-Fi';
      showToast('⚠️ 請至裝置網路設定連接 Wi-Fi');
    } else {
      // 桌機 / 無法偵測時：只標記偏好，不誤判
      if (statusEl && conn) statusEl.textContent = _netTypeLabel(conn);
      else if (statusEl) statusEl.textContent = '🟢 偏好：院內 Wi-Fi 模式';
      showToast('🏥 已設定偏好為 Wi-Fi 模式');
    }
  } else {
    if (_realNetType === 'mobile') {
      if (statusEl) statusEl.textContent = conn ? _netTypeLabel(conn) : '🟡 行動網路連線中';
      showToast('✅ 目前已使用行動網路');
    } else {
      if (statusEl && conn) statusEl.textContent = _netTypeLabel(conn);
      else if (statusEl) statusEl.textContent = '🟡 偏好：行動網路（4G/5G）模式';
      showToast('📡 已設定偏好為行動網路模式');
    }
  }
}

// 開啟設定 Modal 時初始化網路狀態
document.querySelectorAll('.icon-btn').forEach(btn => {
  if (btn.textContent.includes('⚙️')) {
    btn.addEventListener('click', initNetworkStatus);
  }
});

// 關閉所有 Modal 點背景
document.getElementById('shareModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('shareModal')) closeShareModal();
});
document.getElementById('rewardModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('rewardModal'))
    document.getElementById('rewardModal').style.display = 'none';
});

// ══════════════════════════════════════════════════════
// ⭐  評分與留言系統
// ══════════════════════════════════════════════════════
let _selectedStars = 5;
let _rateVoiceRec = null;
let _rateVoiceBlob = null;
let _rateVoiceTimerInt = null;
let _rateVoiceSec = 0;

function openRateModal() {
  if (!_currentCrowdTaskId) return;
  _selectedStars = 5;
  _rateVoiceBlob = null;
  document.getElementById('rateText').value = '';
  document.getElementById('chkAddFriend').checked = false;
  document.getElementById('rateVoicePreview').style.display = 'none';
  document.getElementById('btnRateVoiceRec').textContent = '🎙 開始錄音';
  document.getElementById('rateVoiceTimer').style.display = 'none';
  _renderStars(5);
  document.getElementById('rateModal').style.display = 'flex';
}

function closeRateModal() {
  if (_rateVoiceRec && _rateVoiceRec.state === 'recording') {
    _rateVoiceRec.stop();
  }
  document.getElementById('rateModal').style.display = 'none';
}

function _renderStars(n) {
  document.querySelectorAll('.star-btn').forEach((el, i) => {
    el.classList.toggle('active', i < n);
  });
  const labels = ['', '不太滿意', '一般般', '還不錯', '很棒！', '超喜歡！❤️'];
  const lbl = document.getElementById('starLabel');
  if (lbl) lbl.textContent = labels[n] || '';
}

function selectStar(n) {
  _selectedStars = n;
  _renderStars(n);
}

function toggleRateVoice() {
  if (_rateVoiceRec && _rateVoiceRec.state === 'recording') {
    _rateVoiceRec.stop();
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      _rateVoiceBlob = null;
      _rateVoiceSec = 0;
      clearInterval(_rateVoiceTimerInt);
      const timerEl = document.getElementById('rateVoiceTimer');
      timerEl.style.display = 'inline';
      timerEl.textContent = '0:00';
      _rateVoiceTimerInt = setInterval(() => {
        _rateVoiceSec++;
        const m = Math.floor(_rateVoiceSec / 60), s = _rateVoiceSec % 60;
        timerEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
      }, 1000);

      const chunks = [];
      _rateVoiceRec = new MediaRecorder(stream);
      _rateVoiceRec.ondataavailable = e => chunks.push(e.data);
      _rateVoiceRec.onstop = () => {
        clearInterval(_rateVoiceTimerInt);
        stream.getTracks().forEach(t => t.stop());
        _rateVoiceBlob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(_rateVoiceBlob);
        const prev = document.getElementById('rateVoicePreview');
        prev.src = url;
        prev.style.display = 'block';
        document.getElementById('btnRateVoiceRec').textContent = '🔁 重新錄製';
        document.getElementById('rateVoiceTimer').style.display = 'none';
      };
      _rateVoiceRec.start();
      document.getElementById('btnRateVoiceRec').textContent = '⏹ 停止錄音';
    })
    .catch(() => showToast('⚠️ 無法存取麥克風'));
}

async function submitRating() {
  const text     = document.getElementById('rateText').value.trim();
  const addFriend = document.getElementById('chkAddFriend').checked;
  const patientId = state.currentUser?.id || 'patient_503B';

  try {
    const res = await fetch('/api/crowd/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: _currentCrowdTaskId,
        patient_id: patientId,
        stars: _selectedStars,
        message_text: text,
        add_friend: addFriend,
      }),
    });
    const data = await res.json();

    // 若有語音，上傳
    if (_rateVoiceBlob && data.rate_id) {
      const fd = new FormData();
      fd.append('file', _rateVoiceBlob, 'voice.webm');
      await fetch(`/api/crowd/rate/${data.rate_id}/voice`, { method: 'POST', body: fd });
    }

    closeRateModal();
    const starStr = '⭐'.repeat(_selectedStars);
    let msg = `${starStr} 評分已送達！`;
    if (addFriend && data.freq_id) msg += ' 好友申請已送出，等待對方回應 😊';
    showToast(msg);

    // 更新感謝按鈕
    const rateBtn = document.getElementById('btnRateVideo');
    if (rateBtn) { rateBtn.disabled = true; rateBtn.textContent = '✅ 已評分'; }
  } catch {
    showToast('⚠️ 評分送出失敗');
  }
}

// ══════════════════════════════════════════════════════
// 🔔  通知面板（群眾端）
// ══════════════════════════════════════════════════════
let _notifPollTimer = null;
let _currentNotifTab = 'notif';
let _chatFriendId = null;
let _chatFriendName = '';

async function loadNotifications(userId) {
  try {
    const data = await fetch(`/api/notifications/${userId}`).then(r => r.json());
    const badge = document.getElementById('notifBadge');
    if (badge) {
      const n = data.unread_total || 0;
      badge.style.display = n > 0 ? 'flex' : 'none';
      badge.textContent = n > 9 ? '9+' : String(n);
    }
    // 若通知面板已開啟，自動刷新列表
    const panel = document.getElementById('notifPanel');
    if (panel && panel.classList.contains('open')) {
      renderNotifList(data.notifications || []);
    }
    return data;
  } catch { return { notifications: [], unread_chat: 0 }; }
}

function openNotifPanel() {
  const panel = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  if (!panel) return;
  overlay.style.display = 'block';
  panel.classList.add('open');
  const userId = state.currentUser?.id;
  if (userId) {
    loadNotifications(userId); // 自動刷新列表（panel 已 open）
    loadFriendList(userId);
  }
}

function closeNotifPanel() {
  document.getElementById('notifPanel')?.classList.remove('open');
  document.getElementById('notifOverlay').style.display = 'none';
}

function switchNotifTab(tab, btn) {
  _currentNotifTab = tab;
  document.querySelectorAll('.notif-tab').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('notifListPane').style.display  = tab === 'notif'  ? 'block' : 'none';
  document.getElementById('friendListPane').style.display = tab === 'friend' ? 'block' : 'none';
}

function renderNotifList(notifs) {
  const el = document.getElementById('notifList');
  if (!el) return;
  if (!notifs.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:0.8rem;color:#aaa">暫無通知</div>';
    return;
  }
  el.innerHTML = notifs.map(n => {
    if (n.type === 'rating') {
      const stars = '⭐'.repeat(n.stars || 5);
      const unreadDot = !n.read ? '<span class="ni-unread-dot"></span>' : '';
      const voice = n.voice_url
        ? `<audio controls src="${n.voice_url}" style="width:100%;height:30px;margin-top:6px"></audio>` : '';
      return `
        <div class="notif-item" onclick="markNotifRead('${n.id}',this)">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">${n.from_name}</span>
            <span class="ni-stars">${stars}</span>
            <span class="ni-time">${n.timestamp}</span>
          </div>
          ${n.message ? `<div class="ni-msg">「${n.message}」</div>` : ''}
          ${voice}
        </div>`;
    }
    if (n.type === 'friend_request') {
      return `
        <div class="notif-item" id="freq-${n.id}">
          <div class="ni-header">
            <span class="ni-unread-dot"></span>
            <span>💬 <b>${n.from_name}</b> 想加您為好友</span>
            <span class="ni-time">${n.timestamp}</span>
          </div>
          ${n.message ? `<div class="ni-msg">「${n.message}」</div>` : ''}
          <div class="ni-actions">
            <button class="ni-btn-accept"  onclick="respondFriend('${n.id}','accept')">✅ 接受</button>
            <button class="ni-btn-decline" onclick="respondFriend('${n.id}','decline')">❌ 拒絕</button>
          </div>
        </div>`;
    }
    return '';
  }).join('');
}

async function markNotifRead(id, el) {
  await fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
  el.querySelector('.ni-unread-dot')?.remove();
  loadNotifications(state.currentUser?.id);
}

async function respondFriend(reqId, action) {
  try {
    await fetch('/api/friend/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: reqId, action }),
    });
    const itemEl = document.getElementById(`freq-${reqId}`);
    if (itemEl) {
      itemEl.innerHTML = `<div style="padding:6px 0;font-size:0.78rem;color:${action==='accept'?'#2d8f61':'#aaa'}">
        ${action === 'accept' ? '✅ 已接受好友申請！可以開始聊天了 🎉' : '已拒絕'}
      </div>`;
    }
    if (action === 'accept') {
      showToast('🎉 已成為好友！可以前往「好友聊天」開始聊天');
      loadFriendList(state.currentUser?.id);
    }
  } catch { showToast('⚠️ 操作失敗'); }
}

async function loadFriendList(userId) {
  try {
    const data = await fetch(`/api/friend/list/${userId}`).then(r => r.json());
    renderFriendList(data.friends, userId);
  } catch {}
}

function renderFriendList(friends, myId) {
  const el = document.getElementById('friendList');
  if (!el) return;
  if (!friends.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:0.8rem;color:#aaa">暫無好友<br>評分影片時可申請加好友 😊</div>';
    return;
  }
  const roleIcon = r => r === 'patient' ? '🏥' : r === 'crowd' ? '📱' : '👤';
  el.innerHTML = friends.map(f => `
    <div class="friend-item" onclick="openChat('${f.id}','${f.name}','${myId}')">
      <div class="friend-avatar">${roleIcon(f.role)}</div>
      <div class="friend-info">
        <div class="friend-name">${f.name}</div>
        <div class="friend-sub">好友 · ${f.since}</div>
      </div>
      ${f.unread > 0 ? `<div class="friend-unread">${f.unread}</div>` : ''}
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// 💬  聊天系統
// ══════════════════════════════════════════════════════
let _chatMyId = '';
let _chatPollTimer = null;
let _chatVoiceRec = null;
let _chatVoiceSec = 0;
let _chatVoiceTimerInt = null;

function openChat(friendId, friendName, myId) {
  _chatFriendId   = friendId;
  _chatFriendName = friendName;
  _chatMyId       = myId || state.currentUser?.id || '';
  document.getElementById('chatFriendName').textContent = friendName;
  document.getElementById('chatModal').style.display = 'flex';
  document.getElementById('chatInput').value = '';
  loadChatMessages();
  // 輪詢新訊息
  clearInterval(_chatPollTimer);
  _chatPollTimer = setInterval(loadChatMessages, 5000);
}

function closeChatModal() {
  document.getElementById('chatModal').style.display = 'none';
  clearInterval(_chatPollTimer);
  // 重新整理好友列表（清除未讀）
  if (state.currentUser?.id) loadFriendList(state.currentUser.id);
}

async function loadChatMessages() {
  if (!_chatFriendId || !_chatMyId) return;
  try {
    const data = await fetch(`/api/chat/${_chatMyId}/${_chatFriendId}`).then(r => r.json());
    renderChatMessages(data.messages);
  } catch {}
}

function renderChatMessages(msgs) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  el.innerHTML = msgs.map(m => {
    const isMe = m.from_id === _chatMyId;
    const cls  = isMe ? 'me' : 'them';
    const voice = m.voice_url
      ? `<audio controls src="${m.voice_url}" style="max-width:200px;height:32px"></audio>` : '';
    return `
      <div style="display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'}">
        <div class="chat-bubble ${cls}">
          ${m.text ? `<span>${m.text}</span>` : ''}
          ${voice}
          <span class="cb-time">${m.timestamp}</span>
        </div>
      </div>`;
  }).join('');
  if (wasAtBottom || msgs.length <= 5) el.scrollTop = el.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text || !_chatFriendId) return;
  input.value = '';
  try {
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_id: _chatMyId, to_id: _chatFriendId, text }),
    });
    const data = await res.json();
    if (data.ok) loadChatMessages();
  } catch { showToast('⚠️ 訊息送出失敗'); }
}

let _chatVoiceSend = false;

function toggleChatVoice() {
  if (_chatVoiceRec && _chatVoiceRec.state === 'recording') return;
  const bar = document.getElementById('chatVoiceBar');
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      _chatVoiceSec = 0;
      _chatVoiceSend = false;
      clearInterval(_chatVoiceTimerInt);
      const timerEl = document.getElementById('chatVoiceTimer');
      const waveEl  = document.getElementById('chatVoiceWave');
      timerEl.textContent = '● 0:00';
      waveEl.style.width = '0%';
      bar.style.display = 'flex';

      _chatVoiceTimerInt = setInterval(() => {
        _chatVoiceSec++;
        const m = Math.floor(_chatVoiceSec / 60), s = _chatVoiceSec % 60;
        timerEl.textContent = `● ${m}:${s.toString().padStart(2,'0')}`;
        waveEl.style.width = Math.min(100, _chatVoiceSec / 60 * 100) + '%';
      }, 1000);

      const chunks = [];
      _chatVoiceRec = new MediaRecorder(stream);
      _chatVoiceRec.ondataavailable = e => chunks.push(e.data);
      _chatVoiceRec.onstop = async () => {
        clearInterval(_chatVoiceTimerInt);
        stream.getTracks().forEach(t => t.stop());
        bar.style.display = 'none';
        if (!_chatVoiceSend) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('from_id', _chatMyId);
        fd.append('to_id', _chatFriendId);
        fd.append('file', blob, 'voice.webm');
        try {
          const res = await fetch('/api/chat/voice', { method: 'POST', body: fd });
          const data = await res.json();
          if (data.ok) loadChatMessages();
        } catch { showToast('⚠️ 語音送出失敗'); }
      };
      _chatVoiceRec.start();
    })
    .catch(() => showToast('⚠️ 無法存取麥克風'));
}

function stopChatVoice(send) {
  _chatVoiceSend = send;
  if (_chatVoiceRec && _chatVoiceRec.state === 'recording') {
    _chatVoiceRec.stop();
  }
}

// ══════════════════════════════════════════════════════
// 🔔  病患端：通知與好友面板
// ══════════════════════════════════════════════════════
let _currentPatientTab = 'notif';

function openPatientFriendPanel() {
  const panel   = document.getElementById('patientFriendPanel');
  const overlay = document.getElementById('patientFriendOverlay');
  if (!panel) return;
  overlay.style.display = 'block';
  panel.classList.add('open');
  const uid = state.currentUser?.id;
  if (uid) {
    // 載入通知
    fetch(`/api/notifications/${uid}`)
      .then(r => r.json())
      .then(data => {
        renderPatientNotifList(data.notifications || []);
        const badge = document.getElementById('patientNotifBadge');
        if (badge) {
          const n = data.unread_total || 0;
          badge.style.display = n > 0 ? 'flex' : 'none';
          badge.textContent = n > 9 ? '9+' : String(n);
        }
      }).catch(() => {});
    // 載入好友列表
    fetch(`/api/friend/list/${uid}`)
      .then(r => r.json())
      .then(data => renderPatientFriendList(data.friends, uid))
      .catch(() => {});
  }
}

function closePatientFriendPanel() {
  document.getElementById('patientFriendPanel')?.classList.remove('open');
  document.getElementById('patientFriendOverlay').style.display = 'none';
}

function switchPatientTab(tab, btn) {
  _currentPatientTab = tab;
  document.querySelectorAll('#patientFriendPanel .notif-tab').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('patientNotifListPane').style.display  = tab === 'notif'  ? 'block' : 'none';
  document.getElementById('patientFriendListPane').style.display = tab === 'friend' ? 'block' : 'none';
}

function renderPatientNotifList(notifs) {
  const el = document.getElementById('patientNotifList');
  if (!el) return;
  if (!notifs.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:0.8rem;color:#aaa">暫無通知</div>';
    return;
  }
  el.innerHTML = notifs.map(n => {
    const unreadDot = !n.read ? '<span class="ni-unread-dot"></span>' : '';
    if (n.type === 'doctor_reply') {
      const replyPreview = (n.reply_text || '').slice(0, 40);
      return `
        <div class="notif-item" onclick="markPatientNotifRead('${n.id}',this)">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">👨‍⚕️ 醫師回覆了您的留言</span>
            <span class="ni-time">${n.timestamp}</span>
          </div>
          ${n.message_preview ? `<div class="ni-msg">您：「${escHtml(n.message_preview)}…」</div>` : ''}
          ${replyPreview ? `<div class="ni-msg" style="color:#2d8f61">↩ 醫師：「${escHtml(replyPreview)}${n.reply_text.length > 40 ? '…' : ''}」</div>` : ''}
          <button onclick="event.stopPropagation();closePatientFriendPanel();document.getElementById('btnMedical')?.click()"
            style="margin-top:6px;padding:4px 10px;border-radius:10px;border:none;
                   background:#e8f5e9;color:#2d8f61;font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit">
            查看完整回覆 →
          </button>
        </div>`;
    }
    if (n.type === 'task_upload') {
      const isPrescription = n.is_prescription;
      const videoData = n.video_url ? encodeURIComponent(JSON.stringify({ url: n.video_url, location: n.location || '' })) : '';
      const title = isPrescription
        ? `🏥 您的視覺處方影片已備妥`
        : `🎬 ${escHtml(n.uploader_name)} 上傳了影片`;
      return `
        <div class="notif-item" onclick="markPatientNotifRead('${n.id}',this)">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">${title}</span>
            <span class="ni-time">${n.timestamp}</span>
          </div>
          <div class="ni-msg">📍 ${escHtml(n.location || '')}</div>
          ${n.description ? `<div class="ni-msg" style="color:#666">${escHtml(n.description)}</div>` : ''}
          ${videoData ? `<button onclick="event.stopPropagation();goToNotifVideo('${videoData}')"
            style="margin-top:6px;padding:4px 10px;border-radius:10px;border:none;
                   background:${isPrescription ? '#f0faf4' : '#e8f0fe'};
                   color:${isPrescription ? '#27ae60' : '#3a7bd5'};
                   font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit">
            ▶ 前往欣賞影片 →
          </button>` : ''}
        </div>`;
    }
    if (n.type === 'wish_fulfilled') {
      const videoData = n.video_url ? encodeURIComponent(JSON.stringify({ url: n.video_url, location: n.place_name || '' })) : '';
      return `
        <div class="notif-item" onclick="markPatientNotifRead('${n.id}',this)">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">🌟 ${escHtml(n.fulfiller_name)} 完成了您的心願！</span>
            <span class="ni-time">${n.timestamp}</span>
          </div>
          <div class="ni-msg">📍 ${escHtml(n.place_name || '')}</div>
          ${videoData ? `<button onclick="event.stopPropagation();goToNotifVideo('${videoData}')"
            style="margin-top:6px;padding:4px 10px;border-radius:10px;border:none;
                   background:#fff3e0;color:#e67e22;font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit">
            ▶ 前往欣賞影片 →
          </button>` : ''}
        </div>`;
    }
    if (n.type === 'friend_request') {
      return `
        <div class="notif-item" id="patient-freq-${n.id}">
          <div class="ni-header">
            <span class="ni-unread-dot"></span>
            <span>💬 <b>${escHtml(n.from_name)}</b> 想加您為好友</span>
            <span class="ni-time">${n.timestamp}</span>
          </div>
          ${n.message ? `<div class="ni-msg">「${escHtml(n.message)}」</div>` : ''}
          <div class="ni-actions">
            <button class="ni-btn-accept"  onclick="respondPatientFriend('${n.id}','accept')">✅ 接受</button>
            <button class="ni-btn-decline" onclick="respondPatientFriend('${n.id}','decline')">❌ 拒絕</button>
          </div>
        </div>`;
    }
    return '';
  }).join('');
}

async function markPatientNotifRead(id, el) {
  await fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
  el.querySelector('.ni-unread-dot')?.remove();
}

function goToNotifVideo(encodedData) {
  try {
    const data = JSON.parse(decodeURIComponent(encodedData));
    // 儲存待播影片資訊，供任意視界初始化後自動播放
    state._pendingNotifVideo = data;
  } catch { return; }
  closePatientFriendPanel();
  goTo('screen-anyview');
  startGlobeAnim();
  // 稍等頁面就緒後播放
  setTimeout(() => {
    const v = state._pendingNotifVideo;
    if (!v) return;
    state._pendingNotifVideo = null;
    const player = document.getElementById('crowdVideoPlayer');
    if (!player) return;
    const placeholder = document.getElementById('camPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    // 移除現有 iframe
    document.getElementById('tcIframe')?.remove();
    const isYT = v.url && v.url.includes('youtube-nocookie.com/embed');
    const ytPl = document.getElementById('crowdYoutubePlayer');
    if (isYT) {
      player.style.display = 'none'; player.src = '';
      if (ytPl) { ytPl.style.display = 'block'; ytPl.style.zIndex = '5'; ytPl.src = v.url + '?autoplay=1'; }
    } else {
      if (ytPl) { ytPl.style.display = 'none'; ytPl.src = ''; }
      player.style.display = 'block';
      player.style.zIndex = '5';
      player.src = v.url;
      player.play().catch(() => {});
    }
    const badge = document.getElementById('videoLiveBadge');
    const dot   = document.getElementById('videoLiveDot');
    const txt   = document.getElementById('videoLiveText');
    const title = document.getElementById('videoPanelTitle');
    const controls = document.getElementById('videoControls');
    if (badge && dot && txt) {
      badge.style.display = '';
      badge.style.background = 'rgba(245,166,35,0.92)';
      badge.style.color = 'white';
      dot.style.background = 'white';
      txt.textContent = '群眾影片';
    }
    if (controls) controls.style.display = '';
    if (title) title.textContent = `▶️ ${v.location}`;
    stopGlobeAnim();
    showToast(`▶️ 正在播放：${v.location}`);
  }, 600);
}

async function respondPatientFriend(reqId, action) {
  try {
    await fetch('/api/friend/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: reqId, action }),
    });
    const itemEl = document.getElementById(`patient-freq-${reqId}`);
    if (itemEl) {
      itemEl.innerHTML = `<div style="padding:6px 0;font-size:0.78rem;color:${action === 'accept' ? '#2d8f61' : '#aaa'}">
        ${action === 'accept' ? '✅ 已接受好友申請' : '❌ 已拒絕好友申請'}
      </div>`;
    }
    if (action === 'accept') {
      const uid = state.currentUser?.id;
      if (uid) fetch(`/api/friend/list/${uid}`).then(r => r.json()).then(d => renderPatientFriendList(d.friends, uid)).catch(() => {});
      showToast('✅ 好友申請已接受！');
    }
  } catch { showToast('⚠️ 操作失敗，請稍後再試'); }
}

function renderPatientFriendList(friends, myId) {
  const el = document.getElementById('patientFriendList');
  if (!el) return;
  if (!friends.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:0.8rem;color:#aaa">暫無好友<br>觀看群眾影片後評分可申請加好友 😊</div>';
    return;
  }
  const roleIcon = r => r === 'patient' ? '🏥' : r === 'crowd' ? '📱' : '👤';
  el.innerHTML = friends.map(f => `
    <div class="friend-item" onclick="openChat('${f.id}','${f.name}','${myId}');closePatientFriendPanel()">
      <div class="friend-avatar">${roleIcon(f.role)}</div>
      <div class="friend-info">
        <div class="friend-name">${f.name}</div>
        <div class="friend-sub">好友 · ${f.since}</div>
      </div>
      ${f.unread > 0 ? `<div class="friend-unread">${f.unread}</div>` : ''}
    </div>`).join('');
}

function startPatientFriendPoll() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  const checkUnread = () => {
    fetch(`/api/notifications/${uid}`)
      .then(r => r.json())
      .then(d => {
        const badge = document.getElementById('patientNotifBadge');
        if (badge) {
          const n = d.unread_total || 0;
          badge.style.display = n > 0 ? 'flex' : 'none';
          badge.textContent   = n > 9 ? '9+' : String(n);
        }
        // 若病患通知面板已開啟，自動刷新列表
        const panel = document.getElementById('patientFriendPanel');
        if (panel && panel.classList.contains('open')) {
          renderPatientNotifList(d.notifications || []);
        }
      }).catch(() => {});
  };
  checkUnread();
  setInterval(checkUnread, 30000);
}

// ══════════════════════════════════════════════════════
// 🔴  醫生端：微表情情緒警報（M55M1 板）
// ══════════════════════════════════════════════════════
let _emotionAlertTimer = null;

function openEmotionAlerts() {
  document.getElementById('emotionAlertOverlay').style.display = 'block';
  document.getElementById('emotionAlertPanel').classList.add('open');
  loadEmotionAlerts();
}

function closeEmotionAlerts() {
  document.getElementById('emotionAlertPanel')?.classList.remove('open');
  document.getElementById('emotionAlertOverlay').style.display = 'none';
}

async function loadEmotionAlerts() {
  const doctorId = state.currentUser?.id || 'doctor_001';
  try {
    const data = await fetch(`/api/emotion/alerts/${doctorId}`).then(r => r.json());
    const badge = document.getElementById('emotionAlertBadge');
    if (badge) {
      const n = data.unread || 0;
      badge.style.display = n > 0 ? 'flex' : 'none';
      badge.textContent = n > 9 ? '9+' : String(n);
    }
    renderEmotionAlerts(data.alerts || []);
  } catch {}
}

function renderEmotionAlerts(alerts) {
  const el = document.getElementById('emotionAlertList');
  if (!el) return;
  if (!alerts.length) {
    el.innerHTML = '<div style="text-align:center;padding:24px;font-size:0.8rem;color:#aaa">目前無情緒警報 ✅</div>';
    return;
  }
  const emoIcon = e => ({ sad: '😢', anxious: '😰', angry: '😠' }[e] || '😟');
  el.innerHTML = alerts.map(a => `
    <div style="padding:10px;border-radius:10px;background:#fff5f5;border:1px solid #fecaca;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-weight:800;font-size:0.85rem">${emoIcon(a.emotion)} ${a.patient_name}（${a.bed}）</span>
        <span style="font-size:0.68rem;color:#aaa">${a.timestamp}</span>
      </div>
      <div style="font-size:0.78rem;color:#e74c3c;margin-bottom:6px">
        偵測情緒：${a.emotion_label}（信心度 ${Math.round(a.confidence * 100)}%）
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="goToPatientFromAlert('${a.bed}');closeEmotionAlerts()"
          style="flex:1;padding:6px;border-radius:8px;border:none;background:#e74c3c;color:white;
                 font-size:0.78rem;font-weight:700;cursor:pointer;font-family:inherit">
          💬 立即回覆
        </button>
        <button onclick="ackEmotionAlert('${a.id}',this)"
          style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:white;
                 font-size:0.78rem;color:#666;cursor:pointer;font-family:inherit">
          已知曉
        </button>
      </div>
    </div>`).join('');
}

async function ackEmotionAlert(alertId, btn) {
  try {
    await fetch(`/api/emotion/alerts/${alertId}/ack`, { method: 'POST' });
    btn.closest('div[style]').remove();
    loadEmotionAlerts();
  } catch {}
}

function goToPatientFromAlert(bed) {
  showToast(`前往 ${bed} 病患回覆頁面`);
  goTo('screen-doctor');
}

function startDoctorEmotionPoll() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  loadEmotionAlerts();
  clearInterval(_emotionAlertTimer);
  _emotionAlertTimer = setInterval(() => loadEmotionAlerts(), 30000);
}

// 群眾端進入時啟動通知輪詢
function startCrowdNotifPoll() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  loadNotifications(uid);
  clearInterval(_notifPollTimer);
  _notifPollTimer = setInterval(() => loadNotifications(uid), 30000);
}

// ════════════════════════════════════════════════
// 病患心願清單（病患端）
// ════════════════════════════════════════════════

function openWishlistModal() {
  document.getElementById("wishlistOverlay").style.display = "block";
  document.getElementById("wishlistModal").style.display = "flex";
  loadPatientWishlist();
}

function closeWishlistModal() {
  document.getElementById("wishlistOverlay").style.display = "none";
  document.getElementById("wishlistModal").style.display = "none";
}

async function loadPatientWishlist() {
  const user = state.currentUser;
  if (!user) return;
  const container = document.getElementById("wishlistItems");
  container.innerHTML = '<div style="text-align:center;padding:20px;color:#bbb;font-size:0.85rem">載入中…</div>';
  try {
    const data = await api.getPatientWishlist(user.id);
    renderWishlist(data.wishlists || []);
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#e74c3c;font-size:0.83rem">載入失敗，請重試</div>';
  }
}

function renderWishlist(wishes) {
  const container = document.getElementById("wishlistItems");
  if (!wishes.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#bbb;font-size:0.85rem">還沒有心願，許下第一個願望吧！🌟</div>';
    return;
  }
  container.innerHTML = wishes.map(w => {
    const claimed = !!w.claimed_by;
    const fulfilled = !!w.fulfilled;

    const preVoiceBlock = (claimed && w.pre_voice_url) ? `
      <div style="margin-top:8px;padding:8px 10px;background:#fff8ee;border-radius:8px">
        <div style="font-size:0.75rem;color:#f5a623;font-weight:700;margin-bottom:4px">🎙 志工出發前語音</div>
        <audio controls src="${w.pre_voice_url}" style="width:100%;height:30px"></audio>
      </div>` : '';

    let statusBlock = '';
    if (fulfilled) {
      statusBlock = `
        <div style="margin-top:10px;padding:12px;background:#f0fff4;border-radius:10px;border:1.5px solid #2d8f61">
          <div style="font-size:0.8rem;font-weight:800;color:#2d8f61;margin-bottom:6px">🎉 志工已回傳成果！</div>
          <video controls src="${w.fulfilled_video_url}" style="width:100%;border-radius:8px;max-height:200px;background:#000"></video>
          ${w.fulfilled_at ? `<div style="font-size:0.72rem;color:#aaa;margin-top:4px">📅 ${w.fulfilled_at}</div>` : ''}
        </div>`;
    } else if (claimed) {
      statusBlock = `
        <div style="margin-top:8px;padding:6px 10px;background:#fff3cd;border-radius:8px;font-size:0.78rem;color:#e67e22;font-weight:700">
          🙌 已被認領，等待志工拍攝回傳中...
        </div>`;
    }

    const borderColor = fulfilled ? '#2d8f61' : claimed ? '#ffc83a' : '#f0e8d8';
    const bgColor = fulfilled ? '#f0fff4' : claimed ? '#fff8ee' : '#fffbf4';

    return `
      <div style="background:${bgColor};border:1.5px solid ${borderColor};
                  border-radius:12px;padding:13px 15px;margin-bottom:10px;position:relative">
        <div style="font-weight:800;font-size:0.95rem;color:#333;margin-bottom:4px">📍 ${escHtml(w.place_name)}</div>
        ${w.description ? `<div style="font-size:0.82rem;color:#666;margin-bottom:6px">${escHtml(w.description)}</div>` : ''}
        <div style="font-size:0.73rem;color:#aaa">🕐 ${w.created_at}</div>
        ${preVoiceBlock}
        ${statusBlock}
        ${!claimed ? `<button onclick="deleteWish('${w.id}')"
             style="position:absolute;top:10px;right:10px;background:#fee;border:1px solid #fcc;
                    color:#e74c3c;border-radius:8px;padding:4px 10px;font-size:0.75rem;
                    cursor:pointer;font-family:inherit;font-weight:700">🗑 刪除</button>` : ''}
      </div>`;
  }).join("");
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function addWish() {
  const user = state.currentUser;
  if (!user) { showToast("請先登入"); return; }
  const placeName = document.getElementById("wishPlaceInput").value.trim();
  const desc = document.getElementById("wishDescInput").value.trim();
  if (!placeName) { showToast("⚠️ 請填寫地點名稱"); return; }

  const bed = user.bed ? user.bed + "號病房" : "未知病房";
  try {
    await api.addWishlist({
      patient_id: user.id,
      patient_name: user.name || "病患",
      patient_bed: bed,
      place_name: placeName,
      description: desc,
    });
    document.getElementById("wishPlaceInput").value = "";
    document.getElementById("wishDescInput").value = "";
    showToast("🌟 心願已新增！");
    loadPatientWishlist();
  } catch (e) {
    showToast("⚠️ 新增失敗：" + e.message);
  }
}

async function deleteWish(wishId) {
  try {
    await api.deleteWishlist(wishId);
    showToast("已刪除心願");
    loadPatientWishlist();
  } catch (e) {
    showToast("⚠️ " + e.message);
  }
}

// ════════════════════════════════════════════════
// 病患心願清單（群眾端）
// ════════════════════════════════════════════════

function openCrowdWishlist() {
  document.getElementById("crowdWishlistOverlay").style.display = "block";
  document.getElementById("crowdWishlistModal").style.display = "flex";
  loadCrowdWishlist();
}

function closeCrowdWishlist() {
  document.getElementById("crowdWishlistOverlay").style.display = "none";
  document.getElementById("crowdWishlistModal").style.display = "none";
}

async function loadCrowdWishlist() {
  const container = document.getElementById("crowdWishlistItems");
  const currentUser = state.currentUser;
  container.innerHTML = '<div style="text-align:center;padding:24px;color:#bbb;font-size:0.85rem">載入中…</div>';
  try {
    const data = await api.getAllWishlists();
    const wishes = data.wishlists || [];
    if (!wishes.length) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#bbb;font-size:0.85rem">目前沒有待完成的心願 💝</div>';
      return;
    }
    container.innerHTML = wishes.map(w => {
      const myId = currentUser ? currentUser.id : null;
      const isMine = myId && w.claimed_by === myId;
      const otherClaimed = w.claimed_by && !isMine;

      let actionBtn = '';
      const safeName = (w.place_name || '').replace(/'/g, '&#39;');
      if (isMine) {
        actionBtn = `<button onclick="openWishFulfillModal('${w.id}', '${safeName}')"
           style="padding:9px 14px;border-radius:12px;border:none;cursor:pointer;white-space:nowrap;
                  background:linear-gradient(135deg,#2d8f61,#27ae60);color:white;
                  font-weight:800;font-size:0.83rem;font-family:inherit;
                  box-shadow:0 2px 6px rgba(45,143,97,0.4)">
           📤 上傳成果
         </button>`;
      } else if (otherClaimed) {
        actionBtn = `<div style="padding:6px 12px;background:#fff3cd;border-radius:10px;font-size:0.77rem;color:#e67e22;font-weight:700;white-space:nowrap">🙌 已認領</div>`;
      } else {
        actionBtn = `<button onclick="claimWish('${w.id}', '${safeName}')"
           style="padding:9px 16px;border-radius:12px;border:none;cursor:pointer;white-space:nowrap;
                  background:linear-gradient(135deg,#f5a623,#ffc83a);color:white;
                  font-weight:800;font-size:0.85rem;font-family:inherit;
                  box-shadow:0 2px 6px rgba(245,166,35,0.4)">
           💪 我去拍！
         </button>`;
      }

      const borderColor = isMine ? '#2d8f61' : otherClaimed ? '#ffc83a' : '#f0e8d8';
      return `
        <div style="background:#fffbf4;border:1.5px solid ${borderColor};
                    border-radius:13px;padding:14px 16px;margin-bottom:12px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:0.75rem;color:#aaa;margin-bottom:3px">🏥 ${escHtml(w.patient_bed)}</div>
              <div style="font-weight:800;font-size:1rem;color:#333;margin-bottom:4px">📍 ${escHtml(w.place_name)}</div>
              ${w.description ? `<div style="font-size:0.83rem;color:#666;line-height:1.4">${escHtml(w.description)}</div>` : ''}
              <div style="font-size:0.72rem;color:#bbb;margin-top:5px">🕐 ${w.created_at}</div>
              ${isMine ? '<div style="font-size:0.73rem;color:#2d8f61;font-weight:700;margin-top:3px">✅ 你已認領 — 請出發並上傳成果</div>' : ''}
            </div>
            <div style="flex-shrink:0">${actionBtn}</div>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#e74c3c;font-size:0.83rem">載入失敗，請重試</div>';
  }
}

async function claimWish(wishId, placeName) {
  const user = state.currentUser;
  if (!user) { showToast("請先登入"); return; }
  try {
    const data = await api.claimWishlist(wishId, user.id);
    const wish = data.wish || {};
    showToast("已認領！可先錄出發前語音，完成後上傳成果 📹", 3500);
    openWishFulfillModal(wishId, placeName || wish.place_name || "心願地點");
  } catch (e) {
    showToast("⚠️ " + e.message);
  }
}

// ════════════════════════════════════════════════
// 心願履行 Modal（志工端）：出發前語音 + 上傳成果影片
// ════════════════════════════════════════════════

let _wishFulfillId = null;
let _preVoiceRecorder = null;
let _preVoiceBlob = null;
let _preVoiceStream = null;

function openWishFulfillModal(wishId, placeName) {
  _wishFulfillId = wishId;
  _preVoiceBlob = null;
  const el = id => document.getElementById(id);
  el("wishFulfillPlaceName").textContent = `📍 ${placeName || "心願地點"}`;
  el("preVoiceStatus").textContent = "";
  el("preVoicePlayback").style.display = "none";
  el("preVoicePlayback").src = "";
  el("btnPreVoiceRec").style.display = "";
  el("btnPreVoiceStop").style.display = "none";
  el("btnPreVoiceSend").style.display = "none";
  el("btnWishUpload").style.display = "none";
  el("wishFulfillProgress").textContent = "";
  const fi = el("wishFulfillFileInput");
  if (fi) fi.value = "";
  el("wishFulfillOverlay").style.display = "block";
  el("wishFulfillModal").style.display = "block";
}

function closeWishFulfillModal() {
  document.getElementById("wishFulfillOverlay").style.display = "none";
  document.getElementById("wishFulfillModal").style.display = "none";
  if (_preVoiceStream) {
    _preVoiceStream.getTracks().forEach(t => t.stop());
    _preVoiceStream = null;
  }
}

async function startPreVoiceRecord() {
  try {
    _preVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _preVoiceRecorder = new MediaRecorder(_preVoiceStream);
    const chunks = [];
    _preVoiceRecorder.ondataavailable = e => chunks.push(e.data);
    _preVoiceRecorder.onstop = () => {
      _preVoiceBlob = new Blob(chunks, { type: "audio/webm" });
      const url = URL.createObjectURL(_preVoiceBlob);
      const pb = document.getElementById("preVoicePlayback");
      pb.src = url;
      pb.style.display = "block";
      document.getElementById("btnPreVoiceSend").style.display = "";
      document.getElementById("preVoiceStatus").textContent = "✅ 錄音完成，可試聽後傳送";
    };
    _preVoiceRecorder.start();
    document.getElementById("btnPreVoiceRec").style.display = "none";
    document.getElementById("btnPreVoiceStop").style.display = "";
    document.getElementById("preVoiceStatus").textContent = "🔴 錄音中…";
  } catch {
    showToast("⚠️ 無法存取麥克風，請確認瀏覽器權限");
  }
}

function stopPreVoiceRecord() {
  if (_preVoiceRecorder && _preVoiceRecorder.state !== "inactive") {
    _preVoiceRecorder.stop();
  }
  if (_preVoiceStream) {
    _preVoiceStream.getTracks().forEach(t => t.stop());
    _preVoiceStream = null;
  }
  document.getElementById("btnPreVoiceStop").style.display = "none";
}

async function sendPreVoice() {
  const user = state.currentUser;
  if (!_preVoiceBlob || !_wishFulfillId || !user) return;
  const btn = document.getElementById("btnPreVoiceSend");
  btn.textContent = "傳送中…";
  btn.disabled = true;
  try {
    await api.uploadWishPreVoice(_wishFulfillId, user.id, _preVoiceBlob);
    document.getElementById("preVoiceStatus").textContent = "📤 語音已傳給病患！";
    btn.style.display = "none";
    showToast("🎙 出發前語音已傳送！");
  } catch (e) {
    showToast("⚠️ 傳送失敗：" + e.message);
    btn.textContent = "📤 傳給病患";
    btn.disabled = false;
  }
}

// 心願成果影片 file picker
(function () {
  function bindWishFulfillInput() {
    const fi = document.getElementById("wishFulfillFileInput");
    if (!fi) return;
    fi.addEventListener("change", e => {
      const f = e.target.files[0];
      if (f) {
        document.getElementById("btnWishUpload").style.display = "";
        document.getElementById("wishFulfillProgress").textContent = `已選擇：${f.name}`;
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindWishFulfillInput);
  } else {
    bindWishFulfillInput();
  }
})();

async function uploadFulfillVideo() {
  const user = state.currentUser;
  const fi = document.getElementById("wishFulfillFileInput");
  if (!fi || !fi.files[0]) { showToast("⚠️ 請先選擇影片"); return; }
  if (!_wishFulfillId || !user) return;
  const prog = document.getElementById("wishFulfillProgress");
  const btn = document.getElementById("btnWishUpload");
  prog.textContent = "上傳中，請稍候…";
  btn.disabled = true;
  try {
    await api.fulfillWishlist(_wishFulfillId, user.id, fi.files[0]);
    showToast("🎉 成果已上傳！病患可以觀看了", 3500);
    closeWishFulfillModal();
    closeCrowdWishlist();
  } catch (e) {
    prog.textContent = "";
    btn.disabled = false;
    showToast("⚠️ 上傳失敗：" + e.message);
  }
}

console.log("✅ 安心醫伴 app.js 載入完成");
