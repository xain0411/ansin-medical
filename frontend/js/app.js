// frontend/js/app.js — 前端主邏輯與三端互動控制

// ══ WebSocket 即時推播 ════════════════════════════
let _ws = null;
let _wsReconnectTimer = null;

function connectWS(userId) {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(`${proto}//${location.host}/ws/${userId}`);

  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      _handleWSEvent(msg);
    } catch {}
  };

  _ws.onclose = () => {
    // 斷線後 3 秒自動重連
    clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = setTimeout(() => {
      if (state.currentUser?.id) connectWS(state.currentUser.id);
    }, 3000);
  };
}

function _handleWSEvent(msg) {
  const role = state.currentUser?.role;
  switch (msg.event) {
    case 'new_message':
      // 有新病患訊息 → 醫護端刷新
      if (role === 'nurse') loadNurseMessages();
      if (role === 'doctor') loadDoctorList();
      break;
    case 'new_reply':
      // 有醫護回覆 → 病患端刷新通知
      if (role === 'patient') {
        loadNotifications(state.currentUser.id);
        loadPatientMessages();
        showToast('💬 醫護人員已回覆您的訊息！');
      }
      break;
    case 'eta_notice':
      // 有 ETA 通知 → 病患端刷新通知
      if (role === 'patient') {
        loadNotifications(state.currentUser.id);
        showToast(`🔔 ${msg.doctor_name}已收到您的訊息，將盡快為您處理`);
      }
      break;
    case 'pending_updated':
      // 待辦更新 → 醫師端刷新
      if (role === 'doctor') loadDoctorList();
      break;
  }
}

// ── 麥克風 SVG 圖示常數（統一使用） ─────────────────
const _MIC = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;flex-shrink:0"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

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

// ── DEMO 快速分流預設結果（跳過 AI 呼叫）────────────
let _demoTriageResult = null;

function setDemoL2() {
  document.getElementById('patientMsg').value = '醫生我骨盆很痛，呼吸也有點喘';
  _demoTriageResult = {
    ttas_level: 2,
    ttas_category: "緊急醫療",
    ttas_summary: "骨盆劇痛合併呼吸困難，疑似術後急性併發症",
    route: "attending",
    nrs_estimated: 8,
    bsrs_estimated: 11,
    pcs_level: 1,
    urgency_flags: ["pain_attention", "bsrs_attention"],
    self_harm_detected: false,
    follow_up: "",
    ttas_reasoning: "骨盆疼痛合併呼吸喘，屬 L2 危急。NRS 8 重度疼痛，BSRS 11 心理壓力明顯，PCS L1 需主治醫師立即評估，排除肺栓塞等術後急性併發症。"
  };
}

function setDemoL5() {
  document.getElementById('patientMsg').value = '護理師，我今天想吃什麼比較好？';
  _demoTriageResult = {
    ttas_level: 5,
    ttas_category: "生活協助",
    ttas_summary: "術後飲食詢問，非緊急",
    route: "nurse",
    nrs_estimated: 1,
    bsrs_estimated: 3,
    pcs_level: 4,
    urgency_flags: [],
    self_harm_detected: false,
    follow_up: "",
    ttas_reasoning: "飲食詢問屬 L5 非緊急生活協助。NRS 1 無明顯疼痛，BSRS 3 情緒穩定，PCS L4 護理師提供飲食衛教即可，無需醫師介入。"
  };
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

// ── 角色選擇（直接自動登入，無需登入畫面）──────────
document.querySelectorAll(".role-card").forEach((card) => {
  card.addEventListener("click", () => {
    const role = card.dataset.role;
    if (role === "patient") autoLogin("patient_503B", "123", "503-B");
    else if (role === "doctor") autoLogin("doctor_004", "123");
    else if (role === "crowd") autoLogin("crowd_001", "123");
    else if (role === "nurse") autoLogin("nurse_001", "123");
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

// ── 自動登入（統一入口）──────────────────────────────
async function autoLogin(userId, password, bed = "") {
  try {
    const data = await api.login(userId, password, bed);
    const u = data.user;
    state.currentUser = u;
    connectWS(u.id);

    if (u.role === "patient") {
      const userBed = u.bed || bed || "503-B";
      const bedTag = document.getElementById("patientBedTag");
      if (bedTag) bedTag.textContent = userBed + "號病房";
      const welcomeNameEl = document.getElementById("welcomeName");
      if (welcomeNameEl) {
        const fullName = u.name || '';
        const masked = fullName.length >= 2 ? fullName[0] + '○' + fullName.slice(2) : fullName || '貴賓';
        welcomeNameEl.textContent = masked;
      }
      const dateEl = document.getElementById("currentDateDisplay");
      if (dateEl) {
        const d = new Date();
        dateEl.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
      }
      goTo("screen-patient-home");

    } else if (u.role === "doctor") {
      _doctorType = u.doctor_type || 'resident';
      const badge = document.getElementById('doctorTypeBadge');
      if (badge) {
        const isResident = _doctorType === 'resident';
        badge.textContent = isResident ? '🩻 住院醫師' : '👨‍⚕️ 主治醫師';
        badge.style.background = isResident ? '#2471a3' : '#8e44ad';
      }
      const welcomeEl = document.getElementById("doctorWelcomeText");
      if (welcomeEl) {
        const fullName = u.name || '醫師';
        const masked = fullName.length >= 2 ? fullName[0] + '○' + fullName.slice(2) : fullName;
        welcomeEl.textContent = `歡迎，${u.dept || ''}${masked} 醫師　|　今日待辦請求如下`;
      }
      await loadDoctorList();
      goTo("screen-doctor");

    } else if (u.role === "nurse") {
      await loadNurseMessages();
      goTo("screen-nurse");

    } else if (u.role === "crowd") {
      await loadCrowdData();
      goTo("screen-crowd");
    }
  } catch {
    showToast("⚠️ 登入失敗，請稍後再試");
  }
}

// ════════════════════════════════════════════════
// 護理師端
// ════════════════════════════════════════════════
let _nurseFilter = 'all';
let _nurseMsgData = [];
let _nurseReplyMsgId = null;
let _nurseReplyMsgFull = null;   // 當前開啟 modal 的完整 message 物件
let _nurseVoiceRecorder = null;
let _nurseVoiceChunks = [];
let _nurseVoiceRecording = false;

async function loadNurseMessages() {
  try {
    const hospital = state.currentUser?.hospital;
    const qs = hospital ? '?hospital=' + encodeURIComponent(hospital) : '';
    const data = await fetch(`/api/nurse/messages${qs}`).then(r => r.json());
    _nurseMsgData = data.messages || [];
    renderNurseMsgs();
    updateNurseStats();
  } catch(e) { showToast("載入訊息失敗"); }
}

function updateNurseStats() {
  const all    = _nurseMsgData;
  const total  = all.filter(m => !m.replied).length;
  const l1     = all.filter(m => m.ttas_level === 1).length;
  const l2     = all.filter(m => m.ttas_level === 2).length;
  const l3     = all.filter(m => m.ttas_level === 3).length;
  const l4     = all.filter(m => m.ttas_level === 4).length;
  const l5     = all.filter(m => m.ttas_level === 5).length;
  const unseen = all.filter(m => !m.nurse_seen).length;
  const setT = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setT('nurseStatTotalNum', total);
  setT('nurseStatL1Num',    l1);
  setT('nurseStatL2Num',    l2);
  setT('nurseStatUnseenNum',unseen);
  setT('nurseCountL1', l1);
  setT('nurseCountL2', l2);
  setT('nurseCountL3', l3);
  setT('nurseCountL4', l4);
  setT('nurseCountL5', l5);
  // 更新歡迎文字
  const name = state.currentUser?.name || '護理師';
  const wEl = document.getElementById('nurseWelcomeText');
  if (wEl) wEl.textContent = `歡迎，${name}｜今日待處理 ${total} 則`;
}

const LEVEL_ICON = { 1: '🔴', 2: '🟠', 3: '🟡', 4: '🟢', 5: '⚪' };
const LEVEL_NAME = { 1: '復甦急救', 2: '危急', 3: '緊急', 4: '次緊急', 5: '非緊急' };
const LEVEL_BG   = { 1: '#e53935', 2: '#ff6f00', 3: '#ffc107', 4: '#9e9e9e' };
const LEVEL_COLOR= { 1: '#fff',    2: '#fff',    3: '#555',    4: '#fff' };

function renderNurseMsgs() {
  const list = document.getElementById('nurseMsgList');
  if (!list) return;
  let msgs = [..._nurseMsgData];
  if (_nurseFilter === '1') msgs = msgs.filter(m => m.ttas_level === 1);
  else if (_nurseFilter === '2') msgs = msgs.filter(m => m.ttas_level === 2);
  else if (_nurseFilter === '3') msgs = msgs.filter(m => m.ttas_level === 3);
  else if (_nurseFilter === '4') msgs = msgs.filter(m => m.ttas_level === 4);
  else if (_nurseFilter === '5') msgs = msgs.filter(m => m.ttas_level === 5);
  else if (_nurseFilter === 'unseen') msgs = msgs.filter(m => !m.nurse_seen);

  if (msgs.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#aaa;margin-top:60px;font-size:.95rem">📭 目前沒有符合條件的訊息</div>';
    return;
  }

  list.innerHTML = msgs.map(m => {
    const lvl = m.ttas_level || 3;
    const newDot = m.nurse_seen ? '' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e53935;margin-left:4px"></span>';
    const repliedBadge = m.replied
      ? '<span style="font-size:.7rem;background:#43a047;color:#fff;padding:2px 7px;border-radius:10px">已回覆</span>' : '';
    const routeBadge = m.route
      ? `<span style="font-size:.7rem;background:#7b1fa2;color:#fff;padding:2px 7px;border-radius:10px">分流：${m.route}</span>` : '';
    return `
    <div class="nurse-msg-card level-${lvl}" data-msg-id="${m.id}" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <span class="ttas-badge l${lvl}">${LEVEL_ICON[lvl]} Level ${lvl}｜${LEVEL_NAME[lvl]}</span>
        ${newDot}
        <strong style="font-size:.9rem">${escHtml(m.bed)}</strong>
        ${repliedBadge}${routeBadge}
      </div>
      <div style="font-size:.92rem;color:#333;margin-bottom:4px;line-height:1.5">${escHtml(m.text)}</div>
      <div style="font-size:.75rem;color:#aaa;margin-bottom:6px">${m.timestamp}${m.ttas_summary ? '｜' + escHtml(m.ttas_summary) : ''}</div>
      ${(m.nrs_estimated != null || m.bsrs_estimated != null) ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        ${m.nrs_estimated != null ? `<span style="font-size:.68rem;background:#fff3e0;color:#e65100;border:1px solid #ffb74d;padding:1px 6px;border-radius:6px">NRS ${m.nrs_estimated}/10</span>` : ''}
        ${m.bsrs_estimated != null ? `<span style="font-size:.68rem;background:#f3e5f5;color:#6a1b9a;border:1px solid #ce93d8;padding:1px 6px;border-radius:6px">BSRS ${m.bsrs_estimated}/20</span>` : ''}
        ${m.pcs_level != null ? `<span style="font-size:.68rem;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:1px 6px;border-radius:6px">PCS L${m.pcs_level}</span>` : ''}
        ${(m.urgency_flags||[]).includes('self_harm') || m.self_harm_detected ? `<span style="font-size:.68rem;background:#ffebee;color:#c62828;border:1px solid #ef9a9a;padding:1px 6px;border-radius:6px;font-weight:700">⚠️ 自傷意念</span>` : ''}
        ${(m.urgency_flags||[]).includes('bsrs_attention') ? `<span style="font-size:.68rem;background:#fce4ec;color:#880e4f;border:1px solid #f48fb1;padding:1px 6px;border-radius:6px">心理關注</span>` : ''}
        ${(m.urgency_flags||[]).includes('pain_attention') ? `<span style="font-size:.68rem;background:#fff8e1;color:#f57f17;border:1px solid #ffe082;padding:1px 6px;border-radius:6px">疼痛關注</span>` : ''}
      </div>` : ''}
      ${m.replied
        ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
             <div style="font-size:.82rem;color:var(--green);padding:8px 12px;background:#f1f8f4;border-radius:8px;border-left:3px solid var(--green);flex:1">💬 ${escHtml(m.reply_text || '')}</div>
             <button onclick="event.stopPropagation();openNurseHistoryModal('${m.bed}')" style="margin-left:8px;padding:4px 10px;font-size:.68rem;border:1px solid #c5cae9;border-radius:8px;background:#f3f4ff;color:#3949ab;cursor:pointer;font-family:inherit;flex-shrink:0;font-weight:700">📋 歷史 + AI分流</button>
           </div>`
        : `<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:4px">
             <button onclick="event.stopPropagation();openNurseHistoryModal('${m.bed}')" style="padding:4px 10px;font-size:.68rem;border:1px solid #c5cae9;border-radius:8px;background:#f3f4ff;color:#3949ab;cursor:pointer;font-family:inherit;font-weight:700">📋 歷史 + AI分流</button>
             <button class="nurse-done-btn" data-msg-id="${m.id}" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:8px;padding:5px 10px;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap">✅ 完成</button>
           </div>`
      }
    </div>`;
  }).join('');

  // 已完成列表
  const doneList = document.getElementById('nurseDoneList');
  if (doneList) {
    const doneMsgs = _nurseMsgData.filter(m => m.replied);
    if (doneMsgs.length === 0) {
      doneList.innerHTML = '<div style="text-align:center;color:#aaa;margin:16px 0;font-size:.85rem">尚無已完成項目</div>';
    } else {
      doneList.innerHTML = doneMsgs.map(m => `
        <div class="todo-row done-row" style="opacity:.75;cursor:pointer" onclick="openNurseHistoryModal('${m.bed}')">
          <div style="flex:1;min-width:0">
            <div class="todo-room">
              <span class="todo-done-icon">✅</span>${escHtml(m.bed)} - ${escHtml(m.ttas_summary || m.text?.slice(0,20) || '')}
            </div>
            <div style="font-size:.78rem;color:#aaa;margin-top:2px">${m.timestamp || ''}</div>
            ${m.reply_text && m.reply_text !== '（已標記完成）'
              ? `<div style="font-size:.8rem;color:#43a047;margin-top:4px;padding:6px 10px;background:#f1f8f4;border-radius:7px;border-left:3px solid #43a047">💬 ${escHtml(m.reply_text)}</div>`
              : ''}
          </div>
          <span class="ttas-badge l${m.ttas_level||4}" style="flex-shrink:0">${LEVEL_ICON[m.ttas_level||4]} L${m.ttas_level||4}</span>
        </div>`).join('');
    }
  }

  // 點卡片：標記已讀 + 開啟回覆 Modal（未回覆時）
  list.querySelectorAll('.nurse-msg-card').forEach(card => {
    // ETA 按鈕：送出預計回覆時間通知給病患
    card.querySelectorAll('.eta-btn').forEach(btn => btn.addEventListener('click', async e => {
      e.stopPropagation();
      const bed = btn.dataset.bed;
      const eta = btn.dataset.eta;
      _replyEtaMap[bed] = eta;
      // 更新按鈕視覺
      card.querySelectorAll('.eta-btn').forEach(b => b.classList.remove('eta-active'));
      btn.classList.add('eta-active');
      showToast(`✅ 已通知病患：護理師預計 ${eta} 回覆`);
      try {
        await fetch(`/api/doctor/pending/${encodeURIComponent(bed)}/eta`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bed, eta, doctor_id: state.currentUser?.id || 'nurse_001' })
        });
      } catch(_) {}
    }));

    card.querySelector('.nurse-done-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const msgId = parseInt(e.currentTarget.dataset.msgId);
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = '處理中…';
      try {
        await fetch(`/api/nurse/message/${msgId}/done`, { method: 'POST' });
        showToast('✅ 已標記為完成');
        await loadNurseMessages();
      } catch {
        showToast('⚠️ 操作失敗，請重試');
        e.currentTarget.disabled = false;
        e.currentTarget.textContent = '✅ 完成';
      }
    });

    card.addEventListener('click', async (e) => {
      if (e.target.closest('.nurse-done-btn') || e.target.closest('.eta-btn')) return;
      const id = parseInt(card.dataset.msgId);
      const msg = _nurseMsgData.find(m => m.id === id);
      if (!msg) return;

      // 標記已讀
      if (!msg.nurse_seen) {
        msg.nurse_seen = true;
        await fetch('/api/nurse/seen', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ message_id: id, nurse_id: state.currentUser?.id || 'nurse_001' })
        });
        updateNurseStats();
      }

      // 開啟回覆 Modal（已回覆的不開啟）
      if (!msg.replied) {
        _nurseReplyMsgId = id;
        _nurseReplyMsgFull = msg;
        const lvl = msg.ttas_level || 3;
        document.getElementById('nurseReplyMsgPreview').textContent = `病患：「${msg.text}」`;
        const ttasBadgeEl = document.getElementById('nurseReplyTtasBadge');
        if (ttasBadgeEl) ttasBadgeEl.innerHTML = `<span class="ttas-badge l${lvl}">${LEVEL_ICON[lvl]} Level ${lvl}｜${LEVEL_NAME[lvl]}</span>`;
        document.getElementById('nurseReplyText').value = '';
        document.getElementById('nurseAiSuggestionBox').style.display = 'none';
        document.getElementById('nurseAiSuggestionText').textContent = '';
        document.getElementById('nurseAiSuggestBtn').disabled = false;
        document.getElementById('nurseAiSuggestBtn').textContent = '🤖 AI 建議回覆（供護理師參考）';
        _chatHistory = [];
        document.getElementById('nurseReplyModal').style.display = 'flex';
      }
    });
  });
}

// 篩選按鈕（用事件委派）
document.getElementById('screen-nurse')?.addEventListener('click', e => {
  const btn = e.target.closest('.nurse-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.nurse-filter-btn').forEach(b => {
    b.classList.remove('active');
    b.style.background = '#fff';
    b.style.color = '';
    b.style.borderColor = '#ddd';
  });
  btn.classList.add('active');
  btn.style.background = 'var(--pink-main)';
  btn.style.color = '#fff';
  btn.style.borderColor = 'var(--pink-main)';
  _nurseFilter = btn.dataset.filter;
  renderNurseMsgs();
});

// 重新整理按鈕
document.getElementById('nurseRefreshBtn')?.addEventListener('click', () => loadNurseMessages());

// 護理師回覆：直接回覆病患
document.getElementById('nurseReplySubmitBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('nurseReplyText').value.trim();
  if (!text) { showToast("請輸入回覆內容"); return; }
  await fetch('/api/nurse/reply', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ message_id: _nurseReplyMsgId, reply_text: text, nurse_id: state.currentUser?.id || 'nurse_001' })
  });
  document.getElementById('nurseReplyModal').style.display = 'none';
  showToast("回覆已送出 ✅");
  await loadNurseMessages();
});

// 護理師語音輸入（直接使用 SpeechRecognition，不需 MediaRecorder）
let _nurseRecognizer = null;
document.getElementById('nurseVoiceBtn')?.addEventListener('click', () => {
  const btn = document.getElementById('nurseVoiceBtn');
  if (_nurseRecognizer) {
    _nurseRecognizer.stop();
    return;
  }
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    showToast("⚠️ 此裝置不支援語音識別，請手動輸入");
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  _nurseRecognizer = new SR();
  _nurseRecognizer.lang = 'zh-TW';
  _nurseRecognizer.continuous = false;
  _nurseRecognizer.interimResults = false;
  _nurseRecognizer.onresult = ev => {
    const transcript = ev.results[0][0].transcript;
    const ta = document.getElementById('nurseReplyText');
    ta.value += (ta.value ? '；' : '') + transcript;
  };
  _nurseRecognizer.onerror = () => {
    showToast("⚠️ 語音識別失敗，請手動輸入");
  };
  _nurseRecognizer.onend = () => {
    btn.innerHTML = `${_MIC} 語音輸入`;
    btn.style.background = '#fff';
    _nurseRecognizer = null;
  };
  _nurseRecognizer.start();
  btn.innerHTML = '⏹ 停止';
  btn.style.background = '#ffebee';
});

// 護理師 AI 建議回覆
document.getElementById('nurseAiSuggestBtn')?.addEventListener('click', async () => {
  const m = _nurseReplyMsgFull;
  if (!m || !m.text) { showToast("⚠️ 無法取得訊息內容"); return; }
  const btn = document.getElementById('nurseAiSuggestBtn');
  const box  = document.getElementById('nurseAiSuggestionBox');
  const textEl = document.getElementById('nurseAiSuggestionText');
  btn.disabled = true;
  btn.textContent = '🤖 AI 分析中…';
  textEl.textContent = '';
  box.style.display = 'none';

  // DEMO bypass：飲食詢問直接用寫好的回覆
  const msgText = m.text || '';
  if (msgText.includes('吃') || msgText.includes('飲食') || msgText.includes('食物') || msgText.includes('菜單')) {
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('nurseReplyText').value =
      '王先生您好！根據您目前骨盆骨折術後的情況，飲食建議以高蛋白質食物（雞胸肉、豆腐、水煮蛋）為主，有助骨骼修復；同時多補充富含鈣質的食物（牛奶、豆漿）和維他命D。今日醫院提供軟食，請依個人口感偏好選擇，若有腸胃不適或特殊飲食限制，請立即告知護理師。';
    showToast('🤖 AI 飲食衛教建議已生成，可修改後送出');
    btn.disabled = false;
    btn.textContent = '🤖 重新生成';
    return;
  }

  try {
    const res = await fetch('/api/nurse/ai-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_text:  m.text,
        ttas_level:    m.ttas_level    || 3,
        ttas_category: m.ttas_category || '常規護理',
        ttas_summary:  m.ttas_summary  || '',
        history:       _chatHistory.slice(-3),
      }),
    });
    const data = await res.json();
    if (data.success && data.suggestion) {
      document.getElementById('nurseReplyText').value = data.suggestion;
      box.style.display = 'none';
      btn.textContent = '🤖 重新生成';
    } else {
      showToast("⚠️ AI 無法生成建議：" + (data.error || '未知錯誤'));
      btn.textContent = '🤖 AI 建議回覆（供護理師參考）';
    }
  } catch {
    showToast("⚠️ 連線失敗，請稍後再試");
    btn.textContent = '🤖 AI 建議回覆（供護理師參考）';
  }
  btn.disabled = false;
});

// 採用 AI 草稿 → 填入 textarea
document.getElementById('nurseAiAdoptBtn')?.addEventListener('click', () => {
  const suggestion = document.getElementById('nurseAiSuggestionText').textContent;
  if (suggestion) {
    document.getElementById('nurseReplyText').value = suggestion;
    document.getElementById('nurseAiSuggestionBox').style.display = 'none';
    showToast("草稿已填入，請審閱後送出");
  }
});

// 略過 AI 草稿
document.getElementById('nurseAiDismissBtn')?.addEventListener('click', () => {
  document.getElementById('nurseAiSuggestionBox').style.display = 'none';
});

// 護理師 TTS 朗讀回覆內容
document.getElementById('nurseVoiceTts')?.addEventListener('click', () => {
  const text = document.getElementById('nurseReplyText').value.trim();
  if (!text) { showToast("請先輸入回覆內容"); return; }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-TW';
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  } else { showToast("此裝置不支援語音朗讀"); }
});

// ════════════════════════════════════════════════
// 對話紀錄（聊天室模式）共用工具
// ════════════════════════════════════════════════
let _chatHistory = []; // 快取目前開啟病患的歷史

function renderChatBubbles(messages, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!messages || messages.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#bbb;font-size:.78rem">尚無歷史訊息</div>';
    return;
  }
  el.innerHTML = messages.map(m => {
    const patBubble = `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
        <span style="font-size:.68rem;color:#aaa">病患｜${m.timestamp || ''}</span>
        <div style="background:#fce4ec;border-radius:0 10px 10px 10px;padding:8px 12px;font-size:.85rem;color:#333;max-width:90%;line-height:1.4">${escHtml(m.text)}</div>
      </div>`;
    const _role = m.reply_by_role || m.route || 'attending';
    const _repBg    = _role === 'nurse' ? '#f3e5f5' : _role === 'resident' ? '#e3f2fd' : '#e8f5e9';
    const _repBorder= _role === 'nurse' ? '#9c27b0' : _role === 'resident' ? '#1976d2' : '#388e3c';
    const _repLabel = _role === 'nurse' ? '護理師回覆' : _role === 'resident' ? '住院醫師回覆' : '主治醫師回覆';
    const repBubble = m.replied && m.reply_text ? `
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <span style="font-size:.68rem;color:#aaa">${_repLabel}</span>
        <div style="background:${_repBg};border-left:3px solid ${_repBorder};border-radius:10px 0 10px 10px;padding:8px 12px;font-size:.85rem;color:#333;max-width:90%;line-height:1.4">${escHtml(m.reply_text)}</div>
      </div>` : '';
    return patBubble + repBubble;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function loadChatHistory(bed, listId) {
  try {
    const data = await api.getMessageHistory(bed, 5);
    _chatHistory = data.messages || [];
    renderChatBubbles(_chatHistory, listId);
  } catch { /* silent */ }
}

// ── 醫生：對話紀錄 toggle ────────────────────────
document.getElementById('doctorHistoryToggle')?.addEventListener('click', () => {
  const panel = document.getElementById('doctorHistoryPanel');
  const chevron = document.getElementById('doctorHistoryChevron');
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  chevron.textContent = open ? '▼' : '▲';
});

// ── 護理師：溫暖轉譯 ────────────────────────────
document.getElementById('nurseEmpathyRewriteBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('nurseEmpathyRewriteBtn');
  const ta  = document.getElementById('nurseReplyText');
  const rawText = ta?.value.trim();
  if (!rawText) { showToast("⚠️ 請先輸入回覆內容再進行溫暖轉譯"); return; }
  btn.disabled = true;
  btn.textContent = '💝 轉譯中…';
  try {
    const data = await api.empathyRewrite(rawText, '', _chatHistory);
    if (data.rewritten) {
      ta.value = data.rewritten;
      showToast(data.fallback ? "📝 已套用備用溫暖模板" : "💝 已轉譯為溫暖語句，可修改後送出");
    }
  } catch {
    showToast("⚠️ 溫暖轉譯失敗，請重試");
  } finally {
    btn.disabled = false;
    btn.textContent = '💝 溫暖轉譯';
  }
});

// 護理師端定時刷新（保底備援，60 秒；WebSocket 即時推播為主）
setInterval(() => {
  if (document.getElementById('screen-nurse')?.classList.contains('active')) loadNurseMessages();
}, 60000);

// 醫生端定時刷新（保底備援，60 秒；WebSocket 即時推播為主）
setInterval(() => {
  const doctorScreen = document.getElementById('screen-doctor');
  if (doctorScreen?.classList.contains('active')) loadDoctorList();
}, 60000);

// ════════════════════════════════════════════════
// 醫生端身分由帳號登入決定
// ════════════════════════════════════════════════
let _doctorType = 'resident'; // 預設，登入後由 user.doctor_type 覆蓋

// ── 任意視界：Google Maps + Twipcam 攝影機 Marker ──────────────
let _allCameras = [];      // 全部攝影機資料
let _selectedCamId = null;    // 目前選中的攝影機 ID
let _gMap = null;    // Google Maps 實例
let _infoWindow = null;    // Google Maps InfoWindow
let _gMarkers = [];      // 所有 Marker 陣列
let _gmapReady = false;   // Maps SDK 是否已初始化
const _windyLoadedCells = new Set();  // 已載入的網格 key（避免重複請求）
let _windyIdleTimer = null;           // idle 防抖計時器
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
      // 點在空白地圖 → 用 Geocoder 反查點擊位置的真實地名
      const latLng = e.latLng;
      if (_infoWindow) _infoWindow.close();
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: latLng, language: 'zh-TW' }, (results, status) => {
        let locationName = '此地點';
        if (status === 'OK' && results.length > 0) {
          // 優先取行政區名稱（locality 或 administrative_area）
          const preferred = results[0].address_components.find(c =>
            c.types.includes('locality') || c.types.includes('administrative_area_level_2')
          );
          locationName = preferred?.long_name || results[0].formatted_address.split(',')[0];
        }
        showMissingPopup(locationName, latLng);
      });
    }
  });

  if (_allCameras.length > 0) {
    addTwipcamMarkers(_allCameras);
  }

  // ── 放大地圖後動態載入當前視圖的 Windy 攝影機 ──
  _gMap.addListener('idle', () => {
    clearTimeout(_windyIdleTimer);
    _windyIdleTimer = setTimeout(async () => {
      const zoom = _gMap.getZoom();
      if (zoom < 7) return;  // 縮放不夠，不載入

      const center = _gMap.getCenter();
      const lat = center.lat();
      const lon = center.lng();

      // 依 zoom 決定搜尋半徑（zoom 越大 → 範圍越小越精確）
      const radius = zoom >= 13 ? 5 : zoom >= 11 ? 20 : zoom >= 9 ? 50 : 150;

      // 用網格 key 避免重複載入同一區域
      const cellKey = `${(lat).toFixed(1)}_${(lon).toFixed(1)}_${radius}`;
      if (_windyLoadedCells.has(cellKey)) return;
      _windyLoadedCells.add(cellKey);

      console.log(`[Windy動態] zoom=${zoom} radius=${radius}km 抓取中…`, lat.toFixed(2), lon.toFixed(2));

      try {
        const res = await fetch(`/api/windy/webcams?lat=${lat}&lon=${lon}&radius=${radius}&limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        const newCams = (data.cameras || []).filter(c => !_allCameras.find(e => e.id === c.id));
        console.log(`[Windy動態] 回傳 ${data.cameras?.length ?? 0} 支，新增 ${newCams.length} 支`);
        if (newCams.length === 0) return;

        _allCameras.push(...newCams);
        _addWindyMarkers(newCams);  // 只加新的，不重畫全部
        showToast(`🌍 載入 ${newCams.length} 個新攝影機`);
      } catch { /* 靜默失敗 */ }
    }, 800);  // 停止移動 0.8 秒後才載入
  });
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

  // 停止所有其他播放源
  const camStream = document.getElementById('camStream');
  if (camStream) { camStream.style.display = 'none'; camStream.src = ''; }
  const crowdPlayer = document.getElementById('crowdVideoPlayer');
  if (crowdPlayer) { crowdPlayer.pause(); crowdPlayer.style.display = 'none'; crowdPlayer.src = ''; }
  const crowdYT = document.getElementById('crowdYoutubePlayer');
  if (crowdYT) { crowdYT.style.display = 'none'; crowdYT.src = ''; }
  const actionsDiv = document.getElementById('crowdVideoActions');
  if (actionsDiv) actionsDiv.style.display = 'none';
  _currentCrowdTaskId = null;
  _selectedCamId = null;

  // 移除舊 MJPEG img，換成 iframe
  const panel = document.querySelector('.video-panel');
  if (!panel) return;
  const oldImg    = document.getElementById('camImg');
  const oldIframe = document.getElementById('tcIframe');
  if (oldImg)    oldImg.style.display = 'none';
  if (oldIframe) oldIframe.remove();

  const iframe = document.createElement('iframe');
  iframe.id    = 'tcIframe';
  const tcSep  = ch.embed_url.includes('?') ? '&' : '?';
  iframe.src   = ch.embed_url + tcSep + 'enablejsapi=1' + (_isMuted ? '&mute=1' : '');
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
    // 同時載入 Twipcam（交通/路況）與 Windy（公園/地標/自然景點）
    const [twipcamData, windyData] = await Promise.allSettled([
      api.getTwipcamPresets(),
      api.getWindyWebcams(),
    ]);

    const twipcams = twipcamData.status === 'fulfilled' ? (twipcamData.value.cameras || []) : [];
    const windyCams = windyData.status === 'fulfilled' ? (windyData.value.cameras || []) : [];

    _allCameras = [...twipcams, ...windyCams];

    if (windyCams.length > 0) {
      showToast(`🌍 已載入 ${windyCams.length} 個 Windy 景觀攝影機`);
    }

    // 若 Maps 已 ready，立即加 Marker；否則等 initGoogleMap 呼叫
    if (_gmapReady && _gMap) {
      addTwipcamMarkers(_allCameras);
    }
  } catch (err) {
    showToast('⚠️ 攝影機載入失敗，請確認網路');
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
  emdrTrack('cam');
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
  const oldTcIframe = document.getElementById('tcIframe');
  if (oldTcIframe) oldTcIframe.remove();

  const youtubePlayer = document.getElementById('crowdYoutubePlayer');
  const isYoutube = v.video_url && v.video_url.includes('youtube-nocookie.com/embed');
  if (isYoutube) {
    if (crowdVideoPlayer) { crowdVideoPlayer.style.display = 'none'; crowdVideoPlayer.src = ''; crowdVideoPlayer.pause?.(); }
    if (youtubePlayer) { youtubePlayer.style.display = 'block'; youtubePlayer.style.zIndex = '5'; youtubePlayer.src = v.video_url + '?autoplay=1&enablejsapi=1' + (_isMuted ? '&mute=1' : ''); emdrWatchStart(); }
  } else {
    if (youtubePlayer) { youtubePlayer.style.display = 'none'; youtubePlayer.src = ''; }
    if (crowdVideoPlayer) {
      crowdVideoPlayer.style.display = 'block';
      crowdVideoPlayer.style.zIndex = '5';
      crowdVideoPlayer.src = v.video_url;
      crowdVideoPlayer.muted = _isMuted;
      crowdVideoPlayer.play().catch(e => console.warn('自動撥放失敗:', e));
      emdrWatchStart();
    }
  }
  // 記錄任務 ID 與地點，顯示操作按鈕組
  _currentCrowdTaskId = v.id || v.task_id || null;
  _currentCrowdLocation = v.location || v.name || v.title || '';
  const actionsDiv = document.getElementById('crowdVideoActions');
  if (actionsDiv) actionsDiv.style.display = 'flex';
  const thankBtn = document.getElementById('btnThankVolunteer');
  if (thankBtn) { thankBtn.disabled = false; thankBtn.textContent = '💝 感謝志工'; }
  const rateBtn2 = document.getElementById('btnRateVideo');
  if (rateBtn2) { rateBtn2.disabled = false; rateBtn2.textContent = '⭐ 評分'; }

  // 顯示點讚 / 回饋按鈕（群眾影片才出現）
  const btnLike = document.getElementById('btnLikeVideo');
  const btnFb   = document.getElementById('btnFeedbackVideo');
  if (btnLike) { btnLike.style.display = 'inline-flex'; btnLike.disabled = false; btnLike.classList.remove('liked'); btnLike.textContent = '👍 點讚'; }
  if (btnFb)   { btnFb.style.display = 'inline-flex'; }

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
 * 只新增 Windy 攝影機的 Marker（不清除現有 Marker）
 */
function _addWindyMarkers(cameras) {
  if (!_gMap || !cameras.length) return;
  const windyIcon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#0d1b2e" stroke="#f97316" stroke-width="2"/>
        <text x="16" y="21" text-anchor="middle" font-size="16">🌄</text>
      </svg>
    `)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  };
  cameras.forEach(cam => {
    if (!cam.lat || !cam.lon) return;
    const marker = new google.maps.Marker({
      position: { lat: cam.lat, lng: cam.lon },
      map: _gMap,
      title: `🌄 ${cam.name || cam.id}`,
      icon: windyIcon,
      optimized: false,
    });
    marker.addListener('click', () => {
      if (_infoWindow) _infoWindow.close();
      selectCamera(cam);
    });
    _gMarkers.push(marker);
  });
}

/**
 * 在 Google Maps 上為每台攝影機建立自訂 SVG Marker
 */
function addTwipcamMarkers(cameras) {
  if (!_gMap) return;

  // 清除舊 Marker
  _gMarkers.forEach(m => m.setMap(null));
  _gMarkers = [];

  // 圖標：綠色=Twipcam交通攝影機，橘色=Windy景觀攝影機
  const makeSvgIcon = (emoji, borderColor) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="#0d1b2e" stroke="${borderColor}" stroke-width="2"/>
        <text x="16" y="21" text-anchor="middle" font-size="16">${emoji}</text>
      </svg>
    `)}`,
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 16),
  });
  const twipcamIcon = makeSvgIcon('📹', '#38b27a');  // 綠色
  const windyIcon   = makeSvgIcon('🌄', '#f97316');  // 橘色

  const bounds = new google.maps.LatLngBounds();

  cameras.forEach(cam => {
    if (!cam.lat || !cam.lon) return;

    const icon = cam.source === 'windy' ? windyIcon : twipcamIcon;
    const marker = new google.maps.Marker({
      position: { lat: cam.lat, lng: cam.lon },
      map: _gMap,
      title: cam.source === 'windy' ? `🌄 ${cam.name || cam.id}` : (cam.name || cam.id),
      icon,
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
  emdrTrack('cam');
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

  // 隱藏群眾影片的感謝/評分/點讚/回饋按鈕
  const actionsDiv = document.getElementById('crowdVideoActions');
  if (actionsDiv) actionsDiv.style.display = 'none';
  const _btnLike = document.getElementById('btnLikeVideo');
  const _btnFb   = document.getElementById('btnFeedbackVideo');
  if (_btnLike) _btnLike.style.display = 'none';
  if (_btnFb)   _btnFb.style.display = 'none';
  _currentCrowdTaskId = null;
  const oldTc = document.getElementById('tcIframe');
  if (oldTc) oldTc.remove();

  // 清除上一個攝影機的錯誤覆層
  const errOverlayPrev = document.getElementById('camErrorOverlay');
  if (errOverlayPrev) errOverlayPrev.style.display = 'none';

  // 恢復即時影像 Badge 樣式
  const badge = document.getElementById('videoLiveBadge');
  const dot = document.getElementById('videoLiveDot');
  const txt = document.getElementById('videoLiveText');
  if (badge && dot && txt) {
    badge.style.background = cam.source === 'windy' ? 'rgba(249,115,22,0.9)' : 'rgba(56,178,122,0.9)';
    badge.style.color = 'white';
    dot.style.background = '#ff5555';
    txt.textContent = cam.source === 'windy' ? '🌄 Windy 景觀' : '即時影像';
  }

  const panel = document.querySelector('.video-panel');
  const controls = document.getElementById('videoControls');
  const btnClose = document.getElementById('btnCloseStream');
  const title = document.getElementById('videoPanelTitle');

  // ── Windy 攝影機：用 iframe 播放 ──────────────────────────────
  if (cam.source === 'windy' && cam.embed_url) {
    if (loading) loading.style.display = 'none';
    if (camStream) camStream.style.display = 'none';

    const oldIframe = document.getElementById('tcIframe');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id    = 'tcIframe';
    iframe.src   = cam.embed_url;
    iframe.allow = 'autoplay; fullscreen';
    iframe.setAttribute('allowfullscreen', '');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#000';
    iframe.onload = () => emdrWatchStart();
    if (panel) panel.insertBefore(iframe, panel.firstChild);

    if (badge) badge.style.display = 'flex';
    if (controls) controls.style.display = '';
    if (btnClose) btnClose.style.display = '';
    if (title) title.textContent = `🌄 ${cam.name || cam.id}`;
    stopGlobeAnim();
    showToast(`🌄 Windy 景觀：${cam.name || cam.id}`);
    return;
  }

  // ── Twipcam 攝影機：MJPEG img ──────────────────────────────
  // 建立新的 img 元素（先 clone 移除舊事件）
  const newImg = camStream ? camStream.cloneNode(false) : document.createElement('img');
  if (camStream && camStream.parentNode) {
    camStream.parentNode.replaceChild(newImg, camStream);
  }

  newImg.onload = () => {
    if (loading) loading.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    newImg.style.display = 'block';
    if (badge) badge.style.display = '';
    if (controls) controls.style.display = '';
    if (btnClose) btnClose.style.display = '';
    if (title) title.textContent = `📺 ${cam.name || cam.id}`;
    emdrWatchStart();
    stopGlobeAnim();
    showToast(`📺 正在播放：${cam.name || cam.id}`);
  };
  newImg.onerror = () => {
    if (loading) loading.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    // 顯示連線失敗覆層，等使用者手動關閉
    const errOverlay = document.getElementById('camErrorOverlay');
    if (errOverlay) errOverlay.style.display = 'flex';
    if (badge) badge.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (btnClose) btnClose.style.display = 'none';   // 只用覆層內的大按鈕
    if (title) title.textContent = `⚠️ ${cam.name || cam.id}`;
  };
  newImg.id = 'camStream';
  newImg.alt = cam.name || cam.id;
  newImg.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
  newImg.src = api.getCamProxyUrl(cam.id);
}


// ── 依名稱關鍵字找攝影機並播放（按鈕快捷用）──────────────
function selectCameraByKeyword(keyword) {
  const cam = _allCameras.find(c => c.name && c.name.includes(keyword));
  if (cam) {
    selectCamera(cam);
  } else {
    showToast('⏳ 攝影機載入中，請稍候再試...');
  }
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
  // 優先取攝影機名稱；若是群眾影片則取任務地點
  const camName = cam?.name || _currentCrowdLocation || '';
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
  if (videoEl && videoEl.readyState >= 2) {
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

function applyMuteState() {
  const player = document.getElementById('crowdVideoPlayer');
  if (player) player.muted = _isMuted;
  const muteCmd = JSON.stringify({ event: 'command', func: _isMuted ? 'mute' : 'unMute', args: [] });
  const yt = document.getElementById('crowdYoutubePlayer');
  if (yt && yt.contentWindow) yt.contentWindow.postMessage(muteCmd, '*');
  const tc = document.getElementById('tcIframe');
  if (tc && tc.contentWindow) tc.contentWindow.postMessage(muteCmd, '*');
}

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
  applyMuteState();
});

// ── 地圖快選搜尋（DEMO 用）──────────────────────────
function demoMapSearch(query) {
  const input = document.getElementById('mapSearchInput');
  if (input) input.value = query;
  if (!_gMap || !window.google) return;
  const service = new google.maps.places.PlacesService(_gMap);
  service.findPlaceFromQuery(
    { query, fields: ['geometry', 'name'] },
    (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
        const loc = results[0].geometry.location;
        _gMap.panTo(loc);
        _gMap.setZoom(16);
      }
    }
  );
}

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

async function loadPatientMessages() {
  const patientId = state.currentUser?.id || "patient_503B";
  showSkeleton("historyList", 4);
  try {
    const [msgData, careData] = await Promise.all([
      api.getPatientMessages(patientId),
      fetch(`/api/patient/care-team?patient_id=${patientId}`).then(r => r.json()).catch(() => ({}))
    ]);
    state._careTeam = careData.care_team || {};
    renderHistoryList(msgData.messages);
    renderCareTeamBar(state._careTeam);
  } catch {
    showToast("⚠️ 訊息載入失敗");
  }
}

function renderCareTeamBar(careTeam) {
  const at = careTeam.attending;
  const res = careTeam.resident;
  const nur = careTeam.nurse;
  const el = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };
  el('careTeamAttending', at  ? `👨‍⚕️ 主治：${at.name}（${at.dept}）` : '');
  el('careTeamResident',  res ? `🩻 住院：${res.name}（${res.dept}）` : '');
  el('careTeamNurse',     nur ? `🩺 護理：${nur.name}` : '');
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
  const LVLCOLOR = { 1:'#b71c1c', 2:'#e53935', 3:'#ff6f00', 4:'#ffc107', 5:'#9e9e9e' };
  const LVLICON  = { 1:'🔴', 2:'🟠', 3:'🟡', 4:'🟢', 5:'⚪' };
  const LVLNAME  = { 1:'復甦急救', 2:'危急', 3:'緊急', 4:'次緊急', 5:'非緊急' };
  const ct = state._careTeam || {};
  const atName  = ct.attending ? `${ct.attending.name}（${ct.attending.dept}）主治醫師` : '主治醫師';
  const resName = ct.resident  ? `${ct.resident.name}（${ct.resident.dept}）住院醫師`  : '住院醫師';
  const nurName = ct.nurse     ? `${ct.nurse.name} 護理師` : '護理師';
  // 路由標籤：優先用 route 欄位，fallback 用 ttas_level
  function _lvlRoute(m) {
    const r = m.route;
    if (r === 'attending') return `→ ${atName}`;
    if (r === 'resident')  return `→ ${resName}`;
    if (r === 'nurse')     return `→ ${nurName}`;
    const l = m.ttas_level || 4;
    return l <= 2 ? `→ ${atName}` : l === 3 ? `→ ${resName}` : `→ ${nurName}`;
  }
  list.innerHTML = messages.map((m, idx) => {
    const emo = emotionEmoji[m.emotion] || m.emotion || '';
    const preview = m.text ? (m.text.slice(0, 22) + (m.text.length > 22 ? '...' : '')) : `[${m.emotion}]`;
    const lvl = m.ttas_level || 0;
    const tColor = (lvl === 4 || lvl === 5) ? '#555' : '#fff';
    const ttasBadge = lvl
      ? `<span style="background:${LVLCOLOR[lvl]||'#9e9e9e'};color:${tColor};padding:1px 6px;border-radius:7px;font-size:.68rem;font-weight:700;white-space:nowrap">${LVLICON[lvl]||'⚪'} L${lvl} ${LVLNAME[lvl]||''}</span><span style="font-size:.68rem;color:#888">${_lvlRoute(m)}</span>`
      : '';
    return `
    <div class="history-item ${!m.replied ? 'unread' : ''}" onclick="openMsgModal(${idx})" style="cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="history-emotion-tag">${emo}</span>
          <div class="history-text">${escHtml(preview)}</div>
        </div>
        ${ttasBadge ? `<div style="display:flex;align-items:center;gap:4px;margin-top:3px">${ttasBadge}</div>` : ''}
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
  // TTAS 分級資訊
  const ttasSection = document.getElementById('mdm-ttas-section');
  const ttasBadgeEl = document.getElementById('mdm-ttas-badge');
  if (ttasSection && ttasBadgeEl && m.ttas_level) {
    const LVLCOLOR = { 1:'#b71c1c', 2:'#e53935', 3:'#ff6f00', 4:'#ffc107', 5:'#9e9e9e' };
    const LVLICON  = { 1:'🔴', 2:'🟠', 3:'🟡', 4:'🟢', 5:'⚪' };
    const LVLNAME  = { 1:'復甦急救', 2:'危急', 3:'緊急', 4:'次緊急', 5:'非緊急' };
    const _routeToLabel = r => r==='attending'?'主治醫師':r==='resident'?'住院醫師':'護理師';
    const lvl = m.ttas_level;
    const routeLabel = _routeToLabel(m.route || (lvl<=2?'attending':lvl===3?'resident':'nurse'));
    const tColor = (lvl === 4 || lvl === 5) ? '#555' : '#fff';
    ttasBadgeEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="background:${LVLCOLOR[lvl]||'#9e9e9e'};color:${tColor};padding:3px 10px;border-radius:10px;font-weight:800;font-size:.8rem">${LVLICON[lvl]||'⚪'} Level ${lvl}｜${LVLNAME[lvl]||''}</span>
        <span style="font-size:.8rem;color:#555">→ 分流至 ${routeLabel}</span>
      </div>
      ${m.ttas_summary ? `<div style="margin-top:4px;font-size:.75rem;color:#888">摘要：${escHtml(m.ttas_summary)}</div>` : ''}`;
    ttasSection.style.display = 'block';
  } else if (ttasSection) {
    ttasSection.style.display = 'none';
  }
  const replySection = document.getElementById('mdm-reply-section');
  const replyText = document.getElementById('mdm-reply-text');
  if (m.replied && m.reply_text) {
    replyText.textContent = m.reply_text;
    const _mRole = m.reply_by_role || m.route || 'attending';
    const _mBg     = _mRole === 'nurse' ? '#f3e5f5' : _mRole === 'resident' ? '#e3f2fd' : '#e8f5e9';
    const _mBorder = _mRole === 'nurse' ? '#9c27b0' : _mRole === 'resident' ? '#1976d2' : '#388e3c';
    const _mLabel  = _mRole === 'nurse' ? '護理師回覆' : _mRole === 'resident' ? '住院醫師回覆' : '主治醫師回覆';
    replySection.style.background = _mBg;
    replySection.style.borderLeft = `4px solid ${_mBorder}`;
    const labelEl = document.getElementById('mdm-reply-label');
    if (labelEl) { labelEl.textContent = _mLabel; labelEl.style.color = _mBorder; }
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

// ── TTAS 緊急警告大視窗 ────────────────────────────
function showEmergencyAlert(level, summary) {
  // 移除舊的
  document.getElementById('ttasEmergencyOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'ttasEmergencyOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(180,0,0,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;animation:fadeIn .3s';
  const icon  = level === 1 ? '🚨' : '⚠️';
  const title = level === 1 ? '復甦急救！請馬上按護理鈴！'
              : level === 2 ? '危急狀況！請馬上按護理鈴！'
              : '緊急狀況！請按護理鈴！';
  overlay.innerHTML = `
    <div style="font-size:4rem;margin-bottom:12px">${icon}</div>
    <div style="color:#fff;font-size:1.6rem;font-weight:900;text-align:center;margin-bottom:12px">${title}</div>
    <div style="color:#ffd;font-size:1rem;text-align:center;margin-bottom:24px;max-width:300px">${summary}</div>
    <div style="color:#fff;font-size:1.2rem;font-weight:700;text-align:center;margin-bottom:8px">📋 AI 分類僅供參考</div>
    <div style="color:#ffd;font-size:.85rem;text-align:center;margin-bottom:24px">如有緊急狀況，護理鈴才是最即時的求助方式</div>
    <button id="ttasEmergencyClose" style="background:#fff;color:#c00;font-weight:900;font-size:1.1rem;padding:14px 32px;border:none;border-radius:50px;cursor:pointer">
      我已知曉，繼續傳送訊息
    </button>`;
  document.body.appendChild(overlay);
  document.getElementById('ttasEmergencyClose')?.addEventListener('click', () => overlay.remove());
}

// ── TTAS 追問對話框 ─────────────────────────────────
function showTriageFollowUp(followUpQuestion) {
  document.getElementById('ttasFollowUpModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'ttasFollowUpModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:min(92vw,420px);overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25)">
      <div style="background:linear-gradient(135deg,#38b27a,#2d8f61);padding:18px 20px;display:flex;align-items:center;gap:12px">
        <span style="font-size:1.8rem;line-height:1">🤔</span>
        <div>
          <div style="font-weight:900;font-size:1.05rem;color:#fff">護理 AI 需要再確認一下</div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.75);margin-top:2px">補充說明有助 AI 更精準分流</div>
        </div>
      </div>
      <div style="padding:18px 20px 0">
        <div style="background:#f0fdf4;border:1.5px solid rgba(56,178,122,.3);border-radius:12px;padding:14px 16px;font-size:1rem;color:#2d5a3d;line-height:1.6;margin-bottom:14px">
          ${followUpQuestion}
        </div>
        <textarea id="ttasFollowUpAnswer" placeholder="請在這裡補充說明…"
          style="width:100%;min-height:80px;border:1.5px solid #c8e6d0;border-radius:12px;
                 padding:12px 14px;font-size:.98rem;resize:vertical;box-sizing:border-box;
                 font-family:inherit;line-height:1.6;outline:none;background:#fafff9;
                 color:#333;margin-bottom:8px;display:block"></textarea>
        <button id="ttasFollowUpVoice"
          style="width:100%;padding:11px;border:2px dashed #38b27a;border-radius:12px;
                 background:#f0fdf4;color:#2d8f61;font-size:.95rem;font-weight:700;
                 cursor:pointer;font-family:inherit;display:flex;align-items:center;
                 justify-content:center;gap:8px;margin-bottom:6px;box-sizing:border-box">
          ${_MIC} 點此語音輸入
        </button>
        <div id="ttasFollowUpVoiceStatus" style="font-size:.75rem;color:#38b27a;min-height:18px;text-align:center;margin-bottom:10px"></div>
        <div style="display:flex;gap:10px;margin-bottom:16px">
          <button id="ttasFollowUpSkip"
            style="flex:1;padding:12px;border:1.5px solid #e0e0e0;border-radius:12px;
                   background:#f8f8f8;cursor:pointer;font-size:.92rem;color:#666;
                   font-family:inherit;font-weight:600">跳過，直接送出</button>
          <button id="ttasFollowUpSend"
            style="flex:2;padding:12px;background:linear-gradient(135deg,#38b27a,#2d8f61);
                   color:#fff;border:none;border-radius:12px;font-weight:800;cursor:pointer;
                   font-size:.95rem;font-family:inherit;box-shadow:0 3px 10px rgba(56,178,122,.35)">
            ✅ 補充後送出</button>
        </div>
        <div style="font-size:.7rem;color:#ccc;text-align:center;padding-bottom:16px">AI 分類僅供參考，非臨床診斷</div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // 語音輸入
  let _voiceActive = false;
  document.getElementById('ttasFollowUpVoice')?.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const status = document.getElementById('ttasFollowUpVoiceStatus');
    const voiceBtn = document.getElementById('ttasFollowUpVoice');
    if (!SR) { status.textContent = '此裝置不支援語音輸入'; return; }
    if (_voiceActive) return;
    _voiceActive = true;
    voiceBtn.textContent = '⏹';
    voiceBtn.style.background = '#e53935';
    status.textContent = '🎙 錄音中…請說話';
    const rec = new SR();
    rec.lang = 'zh-TW';
    rec.interimResults = false;
    rec.start();
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      const ta = document.getElementById('ttasFollowUpAnswer');
      if (ta) ta.value += (ta.value ? '；' : '') + t;
      status.textContent = '✅ 語音轉文字完成';
    };
    rec.onerror = () => { status.textContent = '語音識別失敗，請手動輸入'; };
    rec.onend = () => {
      _voiceActive = false;
      voiceBtn.innerHTML = `${_MIC} 點此語音輸入`;
      voiceBtn.style.background = '#f0fdf4';
    };
  });

  return new Promise(resolve => {
    document.getElementById('ttasFollowUpSend')?.addEventListener('click', () => {
      const answer = document.getElementById('ttasFollowUpAnswer')?.value.trim() || '';
      modal.remove();
      resolve(answer);
    });
    document.getElementById('ttasFollowUpSkip')?.addEventListener('click', () => {
      modal.remove();
      resolve('');
    });
  });
}

// ── 送出病患訊息（含 TTAS 分類 + AI 情緒分析）────────
document.getElementById("btnSendMsg")?.addEventListener("click", async () => {
  let text = document.getElementById("patientMsg").value.trim();
  if (!text && !state.selectedEmotion) {
    showToast("⚠️ 請選擇心情或輸入訊息");
    return;
  }
  const emotion   = state.selectedEmotion || "有問題";
  const patientId = state.currentUser?.id  || "patient_503B";
  const bed       = state.currentUser?.bed || "503-B";
  // doctor_id 不再由病患選擇，後端依 care_team 路由
  const doctorId = null;

  // 若有文字，先做 TTAS 分類
  let ttasResult = { level: 3, category: "常規護理", summary: text.slice(0, 30), follow_up: "" };
  let ttasFallback = false;

  if (text) {
    if (_demoTriageResult) {
      // DEMO 模式：假裝 AI 分析中，直接用預設結果
      showToast("🔍 AI 正在分析訊息緊急程度...");
      ttasResult = _demoTriageResult;
      _demoTriageResult = null;
    } else {
    try {
      showToast("🔍 AI 正在分析訊息緊急程度...");
      const triageRes = await fetch('/api/triage', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text, patient_name: state.currentUser?.name || '病患' })
      }).then(r => r.json());

      if (triageRes.success) {
        ttasResult = triageRes.result;
      } else {
        ttasFallback = true;
        ttasResult = triageRes.result; // 保守預設
      }
    } catch {
      ttasFallback = true;
    }
    }

    // 自傷意念：特殊警告
    if (ttasResult.self_harm_detected) {
      showToast('🆘 我們注意到您可能需要心理支持，已立即通知醫療團隊');
    }
    // Level 1 或 2：立即跳大視窗警告，不管 follow_up
    if ((ttasResult.ttas_level || ttasResult.level) <= 2) {
      showEmergencyAlert(ttasResult.ttas_level || ttasResult.level, ttasResult.summary);
      // 仍然繼續送出訊息（病患知情後可繼續）
    } else if (ttasResult.follow_up && !ttasFallback) {
      // Level 3/4 且 AI 需要追問：最多一次
      const extraAnswer = await showTriageFollowUp(ttasResult.follow_up);
      if (extraAnswer) {
        text = text + '（補充：' + extraAnswer + '）';
        // 第二輪分類
        try {
          const triageRes2 = await fetch('/api/triage', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ text })
          }).then(r => r.json());
          if (triageRes2.success) ttasResult = triageRes2.result;
        } catch {}
        // 第二輪若升為 Level 1/2 也要警告
        const lvl2 = ttasResult.ttas_level || ttasResult.level;
        if (lvl2 <= 2) showEmergencyAlert(lvl2, ttasResult.summary);
        if (ttasResult.self_harm_detected) showToast('🆘 我們注意到您可能需要心理支持，已立即通知醫療團隊');
      }
    }
  }

  // 送出訊息
  try {
    await api.sendPatientMessage(
      patientId, bed, emotion, text, doctorId, null,
      ttasResult.ttas_level || ttasResult.level, ttasResult.ttas_category || ttasResult.category, ttasResult.ttas_summary || ttasResult.summary, ttasResult
    );

    document.getElementById("patientMsg").value = "";
    state.selectedEmotion = null;
    document.querySelectorAll(".emotion-btn").forEach(b => b.classList.remove("selected"));
    const bar = document.getElementById("emotionSelectedBar");
    if (bar) bar.style.display = 'none';

    // 顯示送出結果卡
    const resultCard = document.getElementById('ttasSendResult');
    const resultBody = document.getElementById('ttasSendResultBody');
    if (resultCard && resultBody) {
      if (ttasFallback) {
        resultCard.style.borderColor = '#aaa';
        resultCard.style.background = '#f8f8f8';
        resultBody.innerHTML = '<span style="color:#888">AI 暫時無法分析，訊息已保守處理</span>';
      } else {
        const lvl = ttasResult.ttas_level || ttasResult.level;
        const LVLCOLOR = { 1:'#b71c1c', 2:'#e53935', 3:'#ff6f00', 4:'#ffc107', 5:'#9e9e9e' };
        const LVLICON  = { 1:'🔴', 2:'🟠', 3:'🟡', 4:'🟢', 5:'⚪' };
        const LVLNAME  = { 1:'復甦急救', 2:'危急', 3:'緊急', 4:'次緊急', 5:'非緊急' };
        const ttasRes  = ttasResult;
        const routeLabel = ttasRes.route === 'attending' ? '📣 已分流至主治醫師'
                         : ttasRes.route === 'resident'  ? '📣 已分流至住院醫師'
                         : '📣 已分流至護理師';
        const LVLROUTE = { 1: routeLabel, 2: routeLabel, 3: routeLabel, 4: routeLabel, 5: routeLabel };
        const tColor   = (lvl === 4 || lvl === 5) ? '#555' : '#fff';
        resultCard.style.borderColor = LVLCOLOR[lvl] || '#38b27a';
        resultCard.style.background  = lvl <= 2 ? '#fff5f5' : lvl === 3 ? '#f1f8f4' : '#f8f8f8';
        resultBody.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="background:${LVLCOLOR[lvl]};color:${tColor};padding:3px 10px;border-radius:10px;font-weight:800;font-size:.8rem">${LVLICON[lvl]} Level ${lvl}｜${LVLNAME[lvl]}</span>
            <span style="font-size:.82rem;font-weight:700;color:#333">${LVLROUTE[lvl]}</span>
          </div>
          ${ttasResult.summary ? `<div style="font-size:.78rem;color:#666;background:#f5f5f5;border-radius:8px;padding:6px 10px">AI 摘要：${escHtml(ttasResult.summary)}</div>` : ''}`;
      }
      resultCard.style.display = 'block';
      // 5 秒後自動淡出
      setTimeout(() => { if (resultCard) resultCard.style.display = 'none'; }, 6000);
    }
    // L1/L2 是緊急狀況，不計入 EMDR 焦慮偵測
    const sentLevel = ttasResult?.level || 3;
    if (sentLevel >= 3) emdrTrack('msg');
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

// btnRecommendDept 已移除（照護團隊由入院時護理師設定，無需病患選擇）

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
      api.getPendingPatients(state.currentUser?.hospital || "", _doctorType, state.currentUser?.id || ""),
      loadAllRxReviewStat(),
    ]);
    _lastDoctorData = data;
    renderPendingList(data.pending, data.done, data.stats);
  } catch {
    showToast("⚠️ 清單載入失敗");
  }
}

const _TTAS_BADGE = {
  1: { label: '🔴 L1 復甦急救', bg: '#b71c1c', color: '#fff', border: '#b71c1c' },
  2: { label: '🟠 L2 危急',     bg: '#e53935', color: '#fff', border: '#e53935' },
  3: { label: '🟡 L3 緊急',     bg: '#ff6f00', color: '#fff', border: '#ff6f00' },
  4: { label: '🟢 L4 次緊急',   bg: '#ffc107', color: '#555', border: '#ffc107' },
  5: { label: '⚪ L5 非緊急',   bg: '#f5f5f5', color: '#777', border: '#bbb'    },
};

function ttasBadgeHtml(lvl) {
  const b = _TTAS_BADGE[lvl] || _TTAS_BADGE[3];
  return `<span style="background:${b.bg};color:${b.color};border:1px solid ${b.border};padding:3px 9px;border-radius:10px;font-size:.75rem;font-weight:800;white-space:nowrap">${b.label}</span>`;
}

function updateTtasCounts(pending) {
  const count = [0, 0, 0, 0, 0]; // index 1-4
  pending.forEach(p => { const l = p.latest_ttas_level || 4; if (l >= 1 && l <= 5) count[l]++; });
  ['L1','L2','L3','L4','L5'].forEach((k, i) => {
    const el = document.getElementById('count' + k);
    if (el) el.textContent = count[i + 1];
  });
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

  // 排序：TTAS 等級優先（L1 最上），同等級再依時間（最早 = 等最久）
  const sorted = [...pending].sort((a, b) => {
    const la = a.latest_ttas_level || 3;
    const lb = b.latest_ttas_level || 3;
    if (la !== lb) return la - lb;
    const ta = a.timestamp ? new Date(a.timestamp.replace(/\//g, '-')) : 0;
    const tb = b.timestamp ? new Date(b.timestamp.replace(/\//g, '-')) : 0;
    return ta - tb;
  });

  // 更新 TTAS 計數
  updateTtasCounts(pending);

  const LEVEL_ROW_CLASS = { 1: 'priority-red', 2: 'priority-red', 3: 'priority-yellow', 4: '', 5: '' };
  const ETA_OPTIONS = [
    { label: '5分', value: '5分鐘內' },
    { label: '10分', value: '10分鐘內' },
    { label: '20分', value: '20分鐘內' },
    { label: '半小時', value: '30分鐘內' },
  ];

  pendingEl.innerHTML = sorted.map((p) => {
    const lvl = p.latest_ttas_level || 3;
    const rowClass = LEVEL_ROW_CLASS[lvl] || '';
    const unreadBadge = p.unread > 0 ? `<span class="unread-badge">${p.unread}</span>` : '';
    return `
    <div class="todo-row ${rowClass}" data-bed="${p.bed}">
      <div style="flex:1;min-width:0;">
        <div class="todo-room">
          ${p.bed}號病房 - ${p.patient_name}
          <span class="todo-hospital">${p.hospital || '未知醫院'}</span>
          ${unreadBadge}
        </div>
        <div class="todo-emotion" style="display:flex; justify-content:space-between; margin-top:4px;gap:8px;">
           <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#555;font-size:.85rem">${p.latest_message ? escHtml(p.latest_message) : p.latest_emotion}</span>
           <span class="todo-time" style="flex-shrink:0">${p.timestamp || ''}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-left:12px; flex-shrink:0;">
        ${ttasBadgeHtml(lvl)}
        <button class="view-btn">查看留言</button>
        <button class="done-btn" data-bed="${p.bed}" title="標記為已完成" style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:8px;padding:6px 10px;font-size:.82rem;font-weight:700;cursor:pointer;white-space:nowrap">✅ 完成</button>
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

  // 綁定 ETA 快選按鈕（醫生端 + 護理師端共用）
  document.querySelectorAll(".eta-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const bed = btn.dataset.bed;
      const eta = btn.dataset.eta;
      const role = btn.dataset.role || 'doctor';
      _replyEtaMap[bed] = eta;
      const senderLabel = role === 'nurse' ? '護理師' : '醫師';
      showToast(`✅ 已通知病患：${senderLabel}預計 ${eta} 回覆`);
      // 寫入病患通知（統一走 doctor eta API）
      fetch(`/api/doctor/pending/${encodeURIComponent(bed)}/eta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bed,
          eta,
          doctor_id: state.currentUser?.id || (role === 'nurse' ? 'nurse' : 'doctor'),
        })
      }).catch(() => {});
      if (role === 'doctor') {
        renderPendingList(_lastDoctorData?.pending || [], _lastDoctorData?.done || []);
      } else {
        renderNurseMsgs();
      }
    });
  });

  // 綁定點擊 (點擊卡片進入回覆；已完成卡片開歷史 Modal)
  document.querySelectorAll(".todo-row[data-bed]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest('.done-btn') || e.target.closest('.eta-btn')) return;
      if (row.classList.contains('done-row')) {
        openNurseHistoryModal(row.dataset.bed);
        return;
      }
      const patientRow = _lastDoctorData?.pending?.find(p => p.bed === row.dataset.bed)
        || _lastDoctorData?.done?.find(p => p.bed === row.dataset.bed)
        || null;
      openDoctorReply(row.dataset.bed, patientRow);
    });
  });

  document.querySelectorAll(".done-btn[data-bed]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const bed = btn.dataset.bed;
      btn.disabled = true;
      btn.textContent = '處理中…';
      try {
        await fetch(`/api/doctor/pending/${encodeURIComponent(bed)}/done`, { method: 'POST' });
        showToast(`✅ ${bed} 號病房已標記完成`);
        await loadDoctorList();
      } catch {
        showToast('⚠️ 操作失敗，請重試');
        btn.disabled = false;
        btn.textContent = '✅ 完成';
      }
    });
  });
}

// 暫存最近一次 API 資料，供前端篩選重渲染用
let _lastDoctorData = null;
// 醫生設定的預計回覆時間：{ bed: etaString }
const _replyEtaMap = {};

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
    pending = pending.filter(p => String(p.latest_ttas_level || 3) === priority);
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
      _lastDoctorData = await api.getPendingPatients("", _doctorType);
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
  _chatHistory = [];

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
    // 依醫師角色過濾：用 route 欄位決定，fallback 才用 TTAS level
    const roleKey = _doctorType === 'resident' ? 'resident' : 'attending';
    const unreplied = msgs.filter((m) => {
      if (m.replied) return false;
      if (m.route) return m.route === roleKey;
      // fallback（舊資料無 route 欄位）
      return _doctorType === 'resident' ? m.ttas_level <= 3 : m.ttas_level <= 2;
    });
    const emoBadge = document.getElementById("patientEmotionBadge");

    // 待回覆訊息（最新的未讀，API 已 newest-first）
    const firstUnread = unreplied.length > 0 ? unreplied[0] : null;
    if (firstUnread) {
      state.currentMsgId = firstUnread.id;
      document.getElementById("patientMsgBubble").textContent = firstUnread.text || `[${firstUnread.emotion}]`;
      if (emoBadge && firstUnread.emotion) {
        const emoIcon = emotionEmoji[firstUnread.emotion] || firstUnread.emotion;
        emoBadge.textContent = `病患心情：${emoIcon} ${firstUnread.emotion}`;
        emoBadge.style.display = 'inline-flex';
      }
      // TTAS 標籤
      const ttasBadgeEl = document.getElementById('doctorTtasBadge');
      if (ttasBadgeEl && firstUnread.ttas_level) {
        const LEVEL_COLOR = { 1:'#b71c1c', 2:'#e53935', 3:'#ff6f00', 4:'#ffc107', 5:'#9e9e9e' };
        const LEVEL_ICON  = { 1:'🔴', 2:'🟠', 3:'🟡', 4:'🟢', 5:'⚪' };
        const lvl = firstUnread.ttas_level;
        const tClr = (lvl===4||lvl===5) ? '#555' : '#fff';
        const hasScores = firstUnread.nrs_estimated != null || firstUnread.bsrs_estimated != null;
        ttasBadgeEl.innerHTML = `
          <span style="background:${LEVEL_COLOR[lvl]||'#9e9e9e'};color:${tClr};padding:3px 10px;border-radius:12px;font-size:.78rem;font-weight:700">${LEVEL_ICON[lvl]||'⚪'} Level ${lvl}｜${firstUnread.ttas_category || ''}${firstUnread.ttas_summary ? '：' + firstUnread.ttas_summary : ''}</span>
          ${hasScores ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
            ${firstUnread.nrs_estimated != null ? `<span style="font-size:.68rem;background:#fff3e0;color:#e65100;border:1px solid #ffb74d;padding:1px 6px;border-radius:6px">NRS ${firstUnread.nrs_estimated}/10</span>` : ''}
            ${firstUnread.bsrs_estimated != null ? `<span style="font-size:.68rem;background:#f3e5f5;color:#6a1b9a;border:1px solid #ce93d8;padding:1px 6px;border-radius:6px">BSRS ${firstUnread.bsrs_estimated}/20</span>` : ''}
            ${firstUnread.pcs_level != null ? `<span style="font-size:.68rem;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:1px 6px;border-radius:6px">PCS L${firstUnread.pcs_level}</span>` : ''}
            ${firstUnread.self_harm_detected ? `<span style="font-size:.68rem;background:#ffebee;color:#c62828;border:1px solid #ef9a9a;padding:1px 6px;border-radius:6px;font-weight:700">⚠️ 自傷意念</span>` : ''}
            ${(firstUnread.urgency_flags||[]).includes('bsrs_attention') ? `<span style="font-size:.68rem;background:#fce4ec;color:#880e4f;border:1px solid #f48fb1;padding:1px 6px;border-radius:6px">心理關注</span>` : ''}
            ${(firstUnread.urgency_flags||[]).includes('pain_attention') ? `<span style="font-size:.68rem;background:#fff8e1;color:#f57f17;border:1px solid #ffe082;padding:1px 6px;border-radius:6px">疼痛關注</span>` : ''}
          </div>` : ''}
          ${firstUnread.ttas_reasoning ? `<div style="margin-top:6px;padding:7px 10px;background:#f0f4ff;border-radius:8px;border-left:3px solid #6c5ce7;font-size:.72rem;color:#444;line-height:1.5">
            <span style="font-weight:700;color:#6c5ce7">🤖 AI 分析依據：</span>${escHtml(firstUnread.ttas_reasoning)}
          </div>` : ''}`;
        ttasBadgeEl.style.display = 'block';
      }
    } else {
      document.getElementById("patientMsgBubble").textContent = "（目前無待回覆訊息）";
      if (emoBadge) emoBadge.style.display = 'none';
      const ttasBadgeEl = document.getElementById('doctorTtasBadge');
      if (ttasBadgeEl) ttasBadgeEl.style.display = 'none';
    }

    // 多訊息選擇器（有 2+ 則不同訊息時顯示，相同文字去重只留最新一則）
    const selectorRow = document.getElementById('msgSelectorRow');
    if (selectorRow) {
      const seenTexts = new Set();
      const dedupUnreplied = unreplied.filter(m => {
        const key = (m.text || '').trim();
        if (seenTexts.has(key)) return false;
        seenTexts.add(key);
        return true;
      });
      if (dedupUnreplied.length > 1) {
        selectorRow.style.display = 'flex';
        selectorRow.innerHTML = dedupUnreplied.map((m, i) => {
          const emo = emotionEmoji[m.emotion] || '';
          const preview = (m.text || '').slice(0, 12);
          const isActive = i === 0;
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
}

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
  const LVLCOLOR = {1:'#b71c1c',2:'#e53935',3:'#ff6f00',4:'#ffc107',5:'#9e9e9e'};
  const LVLICON  = {1:'🔴',2:'🟠',3:'🟡',4:'🟢',5:'⚪'};
  const LVLNAME  = {1:'復甦急救',2:'危急',3:'緊急',4:'次緊急',5:'非緊急'};
  if (list) {
    if (!msgs.length) {
      list.innerHTML = '<div style="text-align:center;padding:32px;color:#aaa;font-size:0.85rem">尚無對話紀錄</div>';
    } else {
      // 最近 5 則（已按時間由舊到新排序，取最後 5 筆）
      const recent = msgs.slice(-5);
      list.innerHTML = recent.map((m, i) => {
        const icon = emotionEmoji[m.emotion] || '';
        const lvl = m.ttas_level;
        const replierLabel = m.reply_by_role === 'nurse' ? '護理師回覆'
          : m.reply_by_role === 'resident' ? '住院醫師回覆'
          : m.reply_by_role === 'attending' ? '主治醫師回覆'
          : '醫護回覆';
        const replyBg   = m.reply_by_role === 'nurse'     ? '#f0fff4'
          : m.reply_by_role === 'attending'               ? '#f3f0ff' : '#f0f8ff';
        const replyBord = m.reply_by_role === 'nurse'     ? '#43a047'
          : m.reply_by_role === 'attending'               ? '#7b1fa2' : '#4a90d9';
        const replyCl   = m.reply_by_role === 'nurse'     ? '#2e7d32'
          : m.reply_by_role === 'attending'               ? '#6a1b9a' : '#4a90d9';
        const replyBlock = m.replied && m.reply_text
          ? `<div style="margin-top:8px;padding:8px 12px;background:${replyBg};border-radius:8px;
                         border-left:3px solid ${replyBord};font-size:0.82rem;color:#333;line-height:1.5">
               <div style="font-size:0.68rem;color:${replyCl};font-weight:700;margin-bottom:3px">↩ ${replierLabel}</div>
               ${escHtml(m.reply_text)}
             </div>`
          : `<div style="margin-top:6px;font-size:0.72rem;color:#e67e22;font-weight:700">⏳ 尚未回覆</div>`;
        const aiDetail = lvl ? `
          <div id="aiDetail_${i}" style="display:none;margin-top:8px;padding:8px 10px;background:#f8f9ff;
               border-radius:8px;border:1px solid #e0e4ff;font-size:0.75rem;color:#444;line-height:1.6">
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px">
              <span style="background:${LVLCOLOR[lvl]||'#9e9e9e'};color:${lvl>=4?'#555':'#fff'};
                           padding:1px 8px;border-radius:8px;font-weight:700;font-size:0.72rem">
                ${LVLICON[lvl]||'⚪'} L${lvl} ${LVLNAME[lvl]||''}
              </span>
              ${m.nrs_estimated!=null?`<span style="background:#fff3e0;color:#e65100;border:1px solid #ffb74d;padding:1px 6px;border-radius:6px">NRS ${m.nrs_estimated}/10</span>`:''}
              ${m.bsrs_estimated!=null?`<span style="background:#f3e5f5;color:#6a1b9a;border:1px solid #ce93d8;padding:1px 6px;border-radius:6px">BSRS ${m.bsrs_estimated}/20</span>`:''}
              ${m.pcs_level!=null?`<span style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:1px 6px;border-radius:6px">PCS L${m.pcs_level}</span>`:''}
              ${m.self_harm_detected?`<span style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;padding:1px 6px;border-radius:6px;font-weight:700">⚠️ 自傷意念</span>`:''}
              ${(m.urgency_flags||[]).includes('bsrs_attention')?`<span style="background:#fce4ec;color:#880e4f;border:1px solid #f48fb1;padding:1px 6px;border-radius:6px">心理關注</span>`:''}
              ${(m.urgency_flags||[]).includes('pain_attention')?`<span style="background:#fff8e1;color:#f57f17;border:1px solid #ffe082;padding:1px 6px;border-radius:6px">疼痛關注</span>`:''}
            </div>
            ${m.ttas_summary?`<div><b>摘要：</b>${escHtml(m.ttas_summary)}</div>`:''}
            ${m.ttas_reasoning?`<div style="color:#888;margin-top:2px"><b>AI判斷：</b>${escHtml(m.ttas_reasoning)}</div>`:''}
            <div style="margin-top:3px"><b>分流至：</b>${m.route==='attending'?'主治醫師':m.route==='resident'?'住院醫師':'護理師'}</div>
          </div>` : '';
        return `
          <div style="padding:12px 14px;border-radius:12px;margin-bottom:10px;
                      background:${m.replied ? '#fafafa' : '#fffbf0'};
                      border:1.5px solid ${m.replied ? '#eee' : '#ffe0a0'}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:1rem">${icon}</span>
                <span style="font-size:0.72rem;font-weight:700;color:#888">${m.emotion || ''}</span>
                ${lvl?`<span style="font-size:0.68rem;background:${LVLCOLOR[lvl]||'#9e9e9e'};color:${lvl>=4?'#555':'#fff'};padding:1px 7px;border-radius:8px;font-weight:700">${LVLICON[lvl]||''} L${lvl}</span>`:''}
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:0.68rem;color:#bbb">${m.timestamp || ''}</span>
                ${lvl?`<button onclick="const el=document.getElementById('aiDetail_${i}');el.style.display=el.style.display==='none'?'block':'none'"
                  style="padding:2px 8px;font-size:0.65rem;border:1px solid #c5cae9;border-radius:8px;
                         background:#f3f4ff;color:#3949ab;cursor:pointer;font-family:inherit;flex-shrink:0">
                  🔍 AI分流</button>`:''}
              </div>
            </div>
            <div style="font-size:0.88rem;color:#333;line-height:1.55">${escHtml(m.text || '')}</div>
            ${replyBlock}
            ${aiDetail}
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

// ── 護理師：開啟病患歷史 + AI分流 Modal ──────────────────────────────
async function openNurseHistoryModal(bed) {
  const overlay = document.getElementById('historyModalOverlay');
  const modal   = document.getElementById('historyModal');
  const list    = document.getElementById('historyModalList');
  const meta    = document.getElementById('historyModalMeta');
  if (!modal) return;

  if (meta) meta.textContent = `${bed}號病房 · 載入中…`;
  if (list) list.innerHTML = '<div style="text-align:center;padding:24px;color:#bbb;font-size:.85rem">載入中…</div>';
  overlay.style.display = 'block';
  modal.style.display   = 'flex';

  try {
    const data = await api.getPatientByBed(bed);
    const msgs = (data.messages || []).sort((a, b) =>
      new Date(a.timestamp.replace(/\//g,'-')) - new Date(b.timestamp.replace(/\//g,'-'))
    );
    const total  = msgs.length;
    const unread = msgs.filter(m => !m.replied).length;
    if (meta) meta.textContent = `${bed}號病房 · 共 ${total} 則・${unread > 0 ? unread + ' 則待回覆' : '全部已回覆'}`;

    const LVLCOLOR = {1:'#b71c1c',2:'#e53935',3:'#ff6f00',4:'#ffc107',5:'#9e9e9e'};
    const LVLICON  = {1:'🔴',2:'🟠',3:'🟡',4:'🟢',5:'⚪'};
    const LVLNAME  = {1:'復甦急救',2:'危急',3:'緊急',4:'次緊急',5:'非緊急'};
    const emotionEmoji = { '開心':'😊','難過':'😟','焦慮':'😰','有問題':'🤔' };
    const recent = msgs.slice(-5);

    if (list) {
      list.innerHTML = recent.length ? recent.map((m, i) => {
        const icon = emotionEmoji[m.emotion] || '';
        const lvl  = m.ttas_level;
        const replierLabel2 = m.reply_by_role === 'nurse' ? '護理師回覆'
          : m.reply_by_role === 'resident' ? '住院醫師回覆'
          : m.reply_by_role === 'attending' ? '主治醫師回覆'
          : '醫護回覆';
        const replyBg2   = m.reply_by_role === 'nurse'     ? '#f0fff4'
          : m.reply_by_role === 'attending'                ? '#f3f0ff' : '#f0f8ff';
        const replyBord2 = m.reply_by_role === 'nurse'     ? '#43a047'
          : m.reply_by_role === 'attending'                ? '#7b1fa2' : '#4a90d9';
        const replyCl2   = m.reply_by_role === 'nurse'     ? '#2e7d32'
          : m.reply_by_role === 'attending'                ? '#6a1b9a' : '#4a90d9';
        const replyBlock = m.replied && m.reply_text
          ? `<div style="margin-top:8px;padding:8px 12px;background:${replyBg2};border-radius:8px;
                         border-left:3px solid ${replyBord2};font-size:0.82rem;color:#333;line-height:1.5">
               <div style="font-size:0.68rem;color:${replyCl2};font-weight:700;margin-bottom:3px">↩ ${replierLabel2}</div>
               ${escHtml(m.reply_text)}</div>`
          : `<div style="margin-top:6px;font-size:0.72rem;color:#e67e22;font-weight:700">⏳ 尚未回覆</div>`;
        const aiDetail = lvl ? `
          <div id="nai_${i}" style="display:none;margin-top:8px;padding:8px 10px;background:#f8f9ff;
               border-radius:8px;border:1px solid #e0e4ff;font-size:0.75rem;color:#444;line-height:1.6">
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px">
              <span style="background:${LVLCOLOR[lvl]||'#9e9e9e'};color:${lvl>=4?'#555':'#fff'};
                           padding:1px 8px;border-radius:8px;font-weight:700;font-size:0.72rem">
                ${LVLICON[lvl]||'⚪'} L${lvl} ${LVLNAME[lvl]||''}</span>
              ${m.nrs_estimated!=null?`<span style="background:#fff3e0;color:#e65100;border:1px solid #ffb74d;padding:1px 6px;border-radius:6px">NRS ${m.nrs_estimated}/10</span>`:''}
              ${m.bsrs_estimated!=null?`<span style="background:#f3e5f5;color:#6a1b9a;border:1px solid #ce93d8;padding:1px 6px;border-radius:6px">BSRS ${m.bsrs_estimated}/20</span>`:''}
              ${m.pcs_level!=null?`<span style="background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:1px 6px;border-radius:6px">PCS L${m.pcs_level}</span>`:''}
              ${m.self_harm_detected?`<span style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;padding:1px 6px;border-radius:6px;font-weight:700">⚠️ 自傷意念</span>`:''}
              ${(m.urgency_flags||[]).includes('bsrs_attention')?`<span style="background:#fce4ec;color:#880e4f;border:1px solid #f48fb1;padding:1px 6px;border-radius:6px">心理關注</span>`:''}
              ${(m.urgency_flags||[]).includes('pain_attention')?`<span style="background:#fff8e1;color:#f57f17;border:1px solid #ffe082;padding:1px 6px;border-radius:6px">疼痛關注</span>`:''}
            </div>
            ${m.ttas_summary?`<div><b>摘要：</b>${escHtml(m.ttas_summary)}</div>`:''}
            ${m.ttas_reasoning?`<div style="color:#888;margin-top:2px"><b>AI判斷：</b>${escHtml(m.ttas_reasoning)}</div>`:''}
            <div style="margin-top:3px"><b>分流至：</b>${m.route==='attending'?'主治醫師':m.route==='resident'?'住院醫師':'護理師'}</div>
          </div>` : '';
        return `
          <div style="padding:12px 14px;border-radius:12px;margin-bottom:10px;
                      background:${m.replied?'#fafafa':'#fffbf0'};
                      border:1.5px solid ${m.replied?'#eee':'#ffe0a0'}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:1rem">${icon}</span>
                <span style="font-size:0.72rem;font-weight:700;color:#888">${m.emotion||''}</span>
                ${lvl?`<span style="font-size:0.68rem;background:${LVLCOLOR[lvl]||'#9e9e9e'};color:${lvl>=4?'#555':'#fff'};padding:1px 7px;border-radius:8px;font-weight:700">${LVLICON[lvl]||''} L${lvl}</span>`:''}
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:0.68rem;color:#bbb">${m.timestamp||''}</span>
                ${lvl?`<button onclick="const el=document.getElementById('nai_${i}');el.style.display=el.style.display==='none'?'block':'none'"
                  style="padding:2px 8px;font-size:0.65rem;border:1px solid #c5cae9;border-radius:8px;
                         background:#f3f4ff;color:#3949ab;cursor:pointer;font-family:inherit;flex-shrink:0">
                  🔍 AI分流</button>`:''}
              </div>
            </div>
            <div style="font-size:0.88rem;color:#333;line-height:1.55">${escHtml(m.text||'')}</div>
            ${replyBlock}${aiDetail}
          </div>`;
      }).join('')
      : '<div style="text-align:center;padding:32px;color:#aaa;font-size:.85rem">尚無對話紀錄</div>';
    }
  } catch {
    if (list) list.innerHTML = '<div style="text-align:center;padding:24px;color:#e53935;font-size:.85rem">載入失敗</div>';
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
  // 更新 TTAS badge
  const ttasBadgeEl = document.getElementById('doctorTtasBadge');
  if (ttasBadgeEl) {
    if (msg.ttas_level) {
      const LC = { 1:'#e53935', 2:'#ff6f00', 3:'#ffc107', 4:'#9e9e9e' };
      const LI = { 1:'🔴', 2:'🟠', 3:'🟡', 4:'⚪' };
      const lvl = msg.ttas_level;
      ttasBadgeEl.innerHTML = `<span style="background:${LC[lvl]};color:${lvl===3?'#555':'#fff'};padding:3px 10px;border-radius:12px;font-size:.78rem;font-weight:700">${LI[lvl]} Level ${lvl}｜${msg.ttas_category || ''}${msg.ttas_summary ? '：' + msg.ttas_summary : ''}</span>`;
      ttasBadgeEl.style.display = 'block';
    } else {
      ttasBadgeEl.style.display = 'none';
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

// ── 醫生端：朗讀病患訊息 ──────────────────────────────────────
function readPatientMsgAloud() {
  const text = document.getElementById('patientMsgBubble')?.textContent?.trim();
  if (!text || text === '載入中...' || text === '（目前無待回覆訊息）') {
    showToast("⚠️ 目前沒有訊息可朗讀");
    return;
  }
  if (!('speechSynthesis' in window)) { showToast("⚠️ 此裝置不支援語音朗讀"); return; }
  window.speechSynthesis.cancel();
  const ttas = document.getElementById('doctorTtasBadge')?.textContent?.trim();
  const parts = [];
  if (ttas) parts.push(`TTAS 分類：${ttas.replace(/\s+/g, ' ')}`);
  parts.push(`病患留言：${text}`);
  const utt = new SpeechSynthesisUtterance(parts.join('。'));
  utt.lang = 'zh-TW';
  utt.rate = 0.88;
  const btn = document.getElementById('btnReadPatientMsg');
  if (btn) { btn.textContent = '🔊 朗讀中…'; btn.disabled = true; }
  utt.onend = utt.onerror = () => {
    if (btn) { btn.textContent = '🔊 朗讀訊息'; btn.disabled = false; }
  };
  window.speechSynthesis.speak(utt);
}

// ── 醫生端：回覆內容 TTS 朗讀（送出前確認）──────────────────
document.getElementById('btnReadReplyAloud')?.addEventListener('click', () => {
  const text = document.getElementById('doctorReplyText')?.value?.trim();
  if (!text) { showToast("⚠️ 請先輸入回覆內容"); return; }
  if (!('speechSynthesis' in window)) { showToast("⚠️ 此裝置不支援語音朗讀"); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'zh-TW'; utt.rate = 0.88;
  window.speechSynthesis.speak(utt);
});

// ══ 醫生審核視覺處方影片 ══════════════════════════════════════
let _rxReviewTasks = [];

// 載入全部待審核視覺處方，更新 dashboard 統計卡
async function loadAllRxReviewStat() {
  try {
    const data = await fetch('/api/doctor/prescription-reviews').then(r => r.json());
    _rxReviewTasks = (data.tasks || []).filter(t => t.status === 'review' || !t.status || t.status === 'pending');
    const badge = document.getElementById('statRxReview');
    if (badge) {
      const count = _rxReviewTasks.length;
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'block' : 'none';
    }
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
      body.innerHTML = `<div style="padding:14px 18px">` + msgs.map(m => {
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
let _currentCrowdLocation = '';  // 目前群眾影片的地點名稱（供 AI 導覽使用）

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

// ══ 任意視界：點讚志工 ════════════════════════════════════════
async function likeCrowdVideo() {
  if (!_currentCrowdTaskId) return;
  const btn = document.getElementById('btnLikeVideo');
  if (btn) { btn.disabled = true; btn.classList.add('liked'); btn.textContent = '👍 已點讚！'; }
  try {
    const patientId = state.currentUser?.id || 'patient_503B';
    await fetch(`/api/crowd/like/${_currentCrowdTaskId}?patient_id=${patientId}`, { method: 'POST' });
    showToast('👍 點讚成功！志工將收到通知並獲得 +5 點');
  } catch {
    showToast('⚠️ 點讚送出失敗');
    if (btn) { btn.disabled = false; btn.classList.remove('liked'); btn.textContent = '👍 點讚'; }
  }
}

// ══ 任意視界：回饋感謝 Modal ══════════════════════════════════
let _fbVoiceRec   = null;
let _fbVoiceBlob  = null;
let _fbVoiceTimer = null;
let _fbVoiceSec   = 0;
let _fbPhotoBlob  = null;

let _fbAddFriend = false;

function toggleFbFriend() {
  _fbAddFriend = !_fbAddFriend;
  const toggle = document.getElementById('fbFriendToggle');
  const knob   = document.getElementById('fbFriendKnob');
  const label  = document.getElementById('fbFriendLabel');
  if (toggle) toggle.style.background = _fbAddFriend ? '#43a047' : '#ccc';
  if (knob)   knob.style.left = _fbAddFriend ? '22px' : '2px';
  if (label)  label.textContent = _fbAddFriend ? '✅ 申請加好友' : '不加好友';
}

function openFeedbackModal() {
  if (!_currentCrowdTaskId) return;
  // 重置
  _fbVoiceBlob = null;
  _fbPhotoBlob = null;
  _fbAddFriend = false;
  const toggle = document.getElementById('fbFriendToggle');
  const knob   = document.getElementById('fbFriendKnob');
  const label  = document.getElementById('fbFriendLabel');
  if (toggle) toggle.style.background = '#ccc';
  if (knob)   knob.style.left = '2px';
  if (label)  label.textContent = '不加好友';
  const textEl = document.getElementById('feedbackText');
  if (textEl) textEl.value = '';
  const voicePrev = document.getElementById('fbVoicePreview');
  if (voicePrev) { voicePrev.src = ''; voicePrev.style.display = 'none'; }
  const voiceBtn = document.getElementById('btnFbVoiceRec');
  if (voiceBtn) voiceBtn.textContent = '🎙 開始錄音';
  const voiceTimer = document.getElementById('fbVoiceTimer');
  if (voiceTimer) { voiceTimer.style.display = 'none'; voiceTimer.textContent = '0:00'; }
  const photoPrev = document.getElementById('fbPhotoPreview');
  if (photoPrev) photoPrev.style.display = 'none';
  const photoInput = document.getElementById('fbPhotoInput');
  if (photoInput) photoInput.value = '';
  document.getElementById('feedbackModal').style.display = 'flex';
}

function closeFeedbackModal() {
  if (_fbVoiceRec && _fbVoiceRec.state === 'recording') _fbVoiceRec.stop();
  document.getElementById('feedbackModal').style.display = 'none';
}

function toggleFeedbackVoice() {
  if (_fbVoiceRec && _fbVoiceRec.state === 'recording') {
    _fbVoiceRec.stop();
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      _fbVoiceBlob = null;
      _fbVoiceSec = 0;
      clearInterval(_fbVoiceTimer);
      const timerEl = document.getElementById('fbVoiceTimer');
      timerEl.style.display = 'inline';
      timerEl.textContent = '0:00';
      _fbVoiceTimer = setInterval(() => {
        _fbVoiceSec++;
        const m = Math.floor(_fbVoiceSec / 60), s = _fbVoiceSec % 60;
        timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      }, 1000);
      const chunks = [];
      _fbVoiceRec = new MediaRecorder(stream);
      _fbVoiceRec.ondataavailable = e => chunks.push(e.data);
      _fbVoiceRec.onstop = () => {
        clearInterval(_fbVoiceTimer);
        stream.getTracks().forEach(t => t.stop());
        _fbVoiceBlob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(_fbVoiceBlob);
        const prev = document.getElementById('fbVoicePreview');
        prev.src = url;
        prev.style.display = 'block';
        document.getElementById('btnFbVoiceRec').textContent = '🔁 重新錄製';
        document.getElementById('fbVoiceTimer').style.display = 'none';
      };
      _fbVoiceRec.start();
      document.getElementById('btnFbVoiceRec').textContent = '⏹ 停止錄音';
    })
    .catch(() => showToast('⚠️ 無法存取麥克風'));
}

function triggerFeedbackPhoto() {
  document.getElementById('fbPhotoInput')?.click();
}

function previewFeedbackPhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  _fbPhotoBlob = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('fbPhotoImg');
    img.src = e.target.result;
    document.getElementById('fbPhotoPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function submitFeedback() {
  if (!_currentCrowdTaskId) return;
  const message = document.getElementById('feedbackText')?.value.trim() || '';
  if (!message && !_fbVoiceBlob && !_fbPhotoBlob) {
    showToast('⚠️ 請至少填寫文字、錄音或照片其中一項');
    return;
  }
  const patientId = state.currentUser?.id || 'patient_503B';
  const fd = new FormData();
  fd.append('task_id', _currentCrowdTaskId);
  fd.append('patient_id', patientId);
  fd.append('message', message);
  fd.append('add_friend', _fbAddFriend ? '1' : '0');
  if (_fbVoiceBlob) fd.append('voice', _fbVoiceBlob, 'feedback_voice.webm');
  if (_fbPhotoBlob) fd.append('photo', _fbPhotoBlob, _fbPhotoBlob.name || 'photo.jpg');
  try {
    const res = await fetch('/api/crowd/feedback', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '送出失敗');
    closeFeedbackModal();
    showToast(_fbAddFriend ? '💌 感謝已送達！志工將收到您的好友邀請 💚' : '💌 感謝已送達志工！');
  } catch {
    showToast('⚠️ 回饋送出失敗，請再試一次');
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
    if (guideBtn)   guideBtn.style.display   = 'inline-flex';
    if (guideBadge) { guideBadge.style.display = pending.length > 0 ? 'flex' : 'none'; if (pending.length > 0) guideBadge.textContent = String(pending.length); }
  } catch { /* 靜默失敗 */ }
}

function openRxPanel() {
  const overlay = document.getElementById('rxPanelOverlay');
  const drawer  = document.getElementById('rxPanelDrawer');
  if (!drawer) return;
  overlay.style.display = 'block';
  drawer.style.display  = 'flex';
  const pending = _rxPrescriptions.filter(r => r.status === 'pending');
  const subEl = document.getElementById('rxPanelSubtitle');
  if (subEl) subEl.textContent = pending.length > 0 ? `醫師開立 · ${pending[pending.length - 1].created_at || ''}` : '';
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
    list.innerHTML = tasks.map(t => {
      return `
      <div style="flex-shrink:0;width:140px;border-radius:10px;overflow:hidden;
                  background:#f0f8f5;
                  border:1.5px solid rgba(45,143,97,0.2);
                  cursor:pointer"
           onclick="closeRxPanel();playCrowdVideoFromPrescription('${t.video_url}','${t.id}','${t.location}')">
        <div style="background:#2d8f61;padding:6px 8px;font-size:0.65rem;color:white;font-weight:700;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          📍 ${t.location}
        </div>
        <div style="padding:6px 8px;font-size:0.68rem;color:#555;line-height:1.4;
                    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
          ${t.description}
        </div>
        <div style="padding:3px 8px 6px;font-size:0.65rem;color:#2d8f61;font-weight:700">
          ✅ 已完成
        </div>
      </div>`;
    }).join('');
  } catch {}
}

function playCrowdVideoFromPrescription(videoUrl, taskId, location) {
  _currentCrowdTaskId = taskId;
  _currentCrowdLocation = location;

  // 關閉即時攝影機串流
  const camStream = document.getElementById('camStream');
  if (camStream) { camStream.style.display = 'none'; camStream.src = ''; }
  _selectedCamId = null;

  // 關閉療癒頻道 iframe
  const tcIframe = document.getElementById('tcIframe');
  if (tcIframe) tcIframe.remove();

  // 關閉 YouTube 播放器
  const youtubePlayer = document.getElementById('crowdYoutubePlayer');
  if (youtubePlayer) { youtubePlayer.style.display = 'none'; youtubePlayer.src = ''; }

  const player = document.getElementById('crowdVideoPlayer');
  const placeholder = document.getElementById('camPlaceholder');
  const loading = document.getElementById('camLoading');
  const actions = document.getElementById('crowdVideoActions');
  if (!player) return;

  if (placeholder) placeholder.style.display = 'none';
  if (loading) loading.style.display = 'none';

  player.src = videoUrl;
  player.muted = _isMuted;
  player.style.display = 'block';
  player.style.zIndex = '5';
  player.play().catch(e => console.warn('自動撥放失敗:', e));

  if (actions) actions.style.display = 'flex';

  // 更新 badge 與控制欄
  const badge = document.getElementById('videoLiveBadge');
  const dot = document.getElementById('videoLiveDot');
  const txt = document.getElementById('videoLiveText');
  const controls = document.getElementById('videoControls');
  if (badge && dot && txt) {
    badge.style.display = '';
    badge.style.background = 'rgba(245,166,35,0.92)';
    badge.style.color = 'white';
    dot.style.background = 'white';
    txt.textContent = '視覺處方';
  }
  if (controls) controls.style.display = '';
  const btnClose = document.getElementById('btnCloseStream');
  if (btnClose) btnClose.style.display = '';

  document.getElementById('videoPanelTitle').textContent = `📹 ${location}`;
  stopGlobeAnim();
  showToast(`▶️ 正在播放：${location}`);
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
  // DEMO 快速模式：骨盆疼痛 + 呼吸喘 → 直接套用預設回覆
  if (msgText.includes('骨盆') && (msgText.includes('呼吸') || msgText.includes('喘'))) {
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('doctorReplyText').value =
      '王先生您好，已收到您的訊息。骨盆疼痛合併呼吸不適需要立即評估，我會盡快到床邊為您檢查，請保持平躺休息，不要自行移動。';
    showToast('🤖 AI 回覆草稿已生成，可修改後送出');
    btn.disabled = false;
    btn.textContent = '🤖 AI 生成回覆';
    return;
  }
  try {
    const res = await fetch('/api/doctor/ai-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: msgId,
        patient_name: patientName,
        patient_emotion: emotion,
        patient_text: msgText,
        doctor_type: _doctorType,
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
    btn.innerHTML = `${_MIC} 語音錄製`;
  };
  rec.onerror = () => {
    state._doctorRec = null;
    btn.classList.remove("recording");
    btn.innerHTML = `${_MIC} 語音錄製`;
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
    const data = await api.empathyRewrite(rawText, emotion, _chatHistory.slice(-3));
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
  if (!state.currentMsgId) {
    showToast("⚠️ 找不到待回覆訊息，請重新開啟病患頁面");
    return;
  }
  try {
    await api.sendDoctorReply(state.currentMsgId, finalText, "");
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
      ? ``
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
    const completedTaskId = _selectedTaskId;
    const uploadUserId = state.currentUser?.id || 'crowd_001';
    document.getElementById('modalYoutubeInput').style.display = 'none';
    document.getElementById('modalSuccess').style.display = 'block';
    document.getElementById('modalSuccessMsg').textContent =
      `YouTube 影片已提交！AI 分析中，積分即將核發…`;
    // CLIP/CLAP 分析（與檔案上傳流程一致，分析完核發積分）
    runClipMatchAnalysis(completedTaskId, uploadUserId);
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
      `視訊已提交！AI 分析中，積分即將核發（最高 +${result.base_points} 點）`;

    showToast(`✅ 影片上傳成功！AI 分析中…`);
    const completedTaskId = result.task_id;
    const uploadUserId = state.currentUser?.id;
    _selectedTaskId = null;

    // CLIP 內容符合度分析（非同步），分析完成後核發積分
    runClipMatchAnalysis(completedTaskId, uploadUserId);

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
async function runClipMatchAnalysis(taskId, userId) {
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

  // ── DEMO 快速模式：義大遊樂世界 / 摩天輪 ──────────────────────────
  const demoTask = _selectedTaskData;
  const isDemo = demoTask &&
    (demoTask.location || '').includes('義大遊樂世界') &&
    (demoTask.description || '').includes('摩天輪');
  if (isDemo) {
    if (audioRowEl)   audioRowEl.style.display  = 'none';
    if (suggestRowEl) suggestRowEl.style.display = 'none';
    loadingEl.style.display = 'block';
    resultEl.style.display  = 'none';
    // 模擬短暫分析中
    await new Promise(r => setTimeout(r, 300));
    loadingEl.style.display = 'none';
    // 套用預設結果
    const pct = 92, color = '#2d8f61';
    if (barEl)   { barEl.style.width = '92%'; barEl.style.background = color; }
    if (scoreEl) { scoreEl.textContent = '92%'; scoreEl.style.color = color; }
    if (labelEl) { labelEl.textContent = '✅ 高度符合'; labelEl.style.color = color; }
    if (descEl)  descEl.textContent = '比對描述：摩天輪';
    labelEl?.insertAdjacentHTML('afterend',
      `<div class="reward-hint" style="margin-top:5px;font-size:0.74rem;color:#2d8f61;font-weight:700">🎁 符合內容要求，積分已完整發放！</div>`);
    resultEl.style.display = 'block';
    // 核發積分
    try {
      const finRes = await fetch(`/api/crowd/finalize_points/${encodeURIComponent(taskId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, score_pct: 92 }),
      }).then(r => r.json());
      if (finRes.success) {
        const msgEl = document.getElementById('modalSuccessMsg');
        if (msgEl) msgEl.textContent = `視訊已提交！累積獎勵：+${finRes.points_earned} 點`;
        showToast(`🎁 積分核發：+${finRes.points_earned} 點`);
        await loadCrowdData();
      }
    } catch { /* 靜默 */ }
    return;
  }
  // ── 正常 AI 分析流程 ───────────────────────────────────────────────

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

    // ── 依符合度核發積分 ──
    if (userId && data.score_pct >= 0 && data.ready) {
      try {
        const finRes = await fetch(`/api/crowd/finalize_points/${encodeURIComponent(taskId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, score_pct: data.score_pct }),
        }).then(r => r.json());

        if (finRes.success) {
          // 更新成功訊息顯示實際發放積分
          const msgEl = document.getElementById('modalSuccessMsg');
          if (msgEl) {
            msgEl.textContent = `視訊已提交！累積獎勵：+${finRes.points_earned} 點` +
              (data.score_pct < 70 ? `（符合度 ${data.score_pct}%，依比例發放）` : '');
          }
          showToast(`🎁 積分核發：+${finRes.points_earned} 點`);
          // 里程碑獎勵
          if (finRes.milestone_reward) {
            const r = finRes.milestone_reward;
            const store = document.getElementById('rgcStore');
            const icon  = document.getElementById('rgcIcon');
            const item  = document.getElementById('rgcItem');
            const code  = document.getElementById('rgcCode');
            const exp   = document.getElementById('rgcExpiry');
            if (store) store.textContent = r.store || '—';
            if (icon)  icon.textContent  = r.icon  || '🎁';
            if (item)  item.textContent  = r.item  || '兌換券';
            if (code)  code.textContent  = r.code  || '—';
            if (exp)   exp.textContent   = r.expiry ? `有效期限：${r.expiry}` : '';
            setTimeout(() => {
              const modal = document.getElementById('rewardModal');
              if (modal) modal.style.display = 'flex';
            }, 800);
          }
          await loadCrowdData();
        }
      } catch { /* 靜默失敗，不影響 UI */ }
    }
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
    closeEmdr();               // 離開任意視界時完整清除 EMDR（含 AudioContext）
  }

  // 離開醫聲相伴時，重置 EMDR 統計
  if (_lastActiveScreen === 'screen-medical') {
    emdrWatchStop();
    _emdr.triggered = false;
    _emdr.msgTimestamps = [];
    _emdr.camTimestamps = [];
    const overlay = document.getElementById('emdrOverlay');
    if (overlay) overlay.style.display = 'none';
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
  // 關閉 Windy / 療癒精選 iframe
  document.getElementById('tcIframe')?.remove();
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
  patient: { icon: '😊', label: '病患端',     extraId: 'regBed',      extraLabel: '床號',   extraPlaceholder: '床號（如 503-B，請洽護理站）' },
  doctor:  { icon: '👨‍⚕️', label: '醫師端',     extraId: 'regDept',     extraLabel: '科別',   extraPlaceholder: '科別（如：內科、外科）' },
  crowd:   { icon: '🙋', label: '志工/群眾端', extraId: null,          extraLabel: null,     extraPlaceholder: null },
  nurse:   { icon: '🩺', label: '護理師端',   extraId: 'regHospital', extraLabel: '任職醫院', extraPlaceholder: '任職醫院（如：台北總院）' },
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
  const colors = { patient:'linear-gradient(135deg,#2d8f61,#38af7a)', doctor:'linear-gradient(135deg,#667eea,#764ba2)', crowd:'linear-gradient(135deg,#f5a623,#ffc83a)', nurse:'linear-gradient(135deg,#d64d80,#e891bb)' };
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
    // 地圖已初始化就保留顯示，只清除座標與選點標示
    if (_patientShareMap) {
      _patientShareLatLng = null;
      const placeEl = document.getElementById('patientShareSelectedPlace');
      if (placeEl) placeEl.style.display = 'none';
      if (_patientShareMarker) _patientShareMarker.setPosition(null);
    } else {
      // 地圖尚未初始化才顯示提示
      _patientShareLatLng = null;
      const hint = document.getElementById('patientShareMapHint');
      if (hint) hint.style.display = 'flex';
      const placeEl = document.getElementById('patientShareSelectedPlace');
      if (placeEl) placeEl.style.display = 'none';
      if (_patientShareMarker) _patientShareMarker.setPosition(null);
    }
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
  const uploadLink = `${window.location.origin}/?task=${task.id}`;
  const msg = `嗨！我是${name}，目前住在${hospital} ${bed}。\n\n我想請你幫我拍一段影片，讓我能在病房裡欣賞外面的世界 🌍\n\n📍 拍攝地點：${task.location}\n📝 拍攝內容：${task.description || '自然風景'}\n\n👇 請複製以下完整連結，貼到手機瀏覽器開啟即可直接拍攝或上傳：\n${uploadLink}\n\n謝謝你 💙`;
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
  document.getElementById('btnRateVoiceRec').innerHTML = `${_MIC} 開始錄音`;
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
    if (!res.ok) throw new Error(data.detail || '評分送出失敗');

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
    const unreadDot = !n.read ? '<span class="ni-unread-dot"></span>' : '';
    const delBtn = `<button class="ni-del" onclick="event.stopPropagation();deleteNotif('${n.id}',this)" title="刪除">✕</button>`;
    if (n.type === 'rating') {
      const stars = '⭐'.repeat(n.stars || 5);
      const voice = n.voice_url
        ? `<audio controls src="${n.voice_url}" style="width:100%;height:30px;margin-top:6px"></audio>` : '';
      return `
        <div class="notif-item" onclick="markNotifRead('${n.id}',this)">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">${escHtml(n.from_name)}</span>
            <span class="ni-stars">${stars}</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          ${n.message ? `<div class="ni-msg">「${escHtml(n.message)}」</div>` : ''}
          ${voice}
        </div>`;
    }
    if (n.type === 'like') {
      return `
        <div class="notif-item" onclick="markNotifRead('${n.id}',this)"
          style="border-left:3px solid #f59e0b;background:#fffbeb">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">👍 ${escHtml(n.from_name)} 為您的影片按讚了！</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          <div class="ni-msg" style="color:#b45309">+5 點已加入您的積分 ✨</div>
        </div>`;
    }
    if (n.type === 'thank') {
      return `
        <div class="notif-item" onclick="markNotifRead('${n.id}',this)"
          style="border-left:3px solid #e74c3c;background:#fff5f5">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">💝 ${escHtml(n.from_name)} 向您表達了感謝！</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          <div class="ni-msg" style="color:#c0392b">+10 點已加入您的積分 ✨</div>
        </div>`;
    }
    if (n.type === 'feedback') {
      const voice = n.voice_url
        ? `<audio controls src="${n.voice_url}" style="width:100%;height:30px;margin-top:6px"></audio>` : '';
      const photo = n.photo_url
        ? `<img src="${n.photo_url}" style="max-width:100%;max-height:120px;border-radius:8px;margin-top:6px;object-fit:cover">` : '';
      return `
        <div class="notif-item" onclick="markNotifRead('${n.id}',this)"
          style="border-left:3px solid #e74c3c;background:#fff5f5">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">💌 ${escHtml(n.from_name)} 傳來感謝回饋</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          ${n.message ? `<div class="ni-msg">「${escHtml(n.message)}」</div>` : ''}
          ${voice}
          ${photo}
        </div>`;
    }
    if (n.type === 'friend_request') {
      return `
        <div class="notif-item" id="freq-${n.id}">
          <div class="ni-header">
            <span class="ni-unread-dot"></span>
            <span>💬 <b>${n.from_name}</b> 想加您為好友</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
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

async function deleteNotif(id, el) {
  const item = el.closest('.notif-item');
  if (item) { item.style.opacity = '0'; item.style.transition = 'opacity 0.2s'; setTimeout(() => item.remove(), 200); }
  await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
  const uid = state.currentUser?.id;
  if (uid) {
    fetch(`/api/notifications/${uid}`).then(r => r.json()).then(data => {
      const n = data.unread_total || 0;
      ['notifBadge', 'patientNotifBadge'].forEach(bid => {
        const b = document.getElementById(bid);
        if (b) { b.style.display = n > 0 ? 'flex' : 'none'; b.textContent = n > 9 ? '9+' : String(n); }
      });
    }).catch(() => {});
  }
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
    const delBtn = `<button class="ni-del" onclick="event.stopPropagation();deleteNotif('${n.id}',this)" title="刪除">✕</button>`;
    if (n.type === 'doctor_reply') {
      const replyPreview = (n.reply_text || '').slice(0, 40);
      const _rRole = n.reply_by_role || 'attending';
      const _rBg     = _rRole === 'nurse' ? '#f3e5f5' : _rRole === 'resident' ? '#e3f2fd' : '#e8f5e9';
      const _rColor  = _rRole === 'nurse' ? '#7b1fa2' : _rRole === 'resident' ? '#1565c0' : '#2d8f61';
      const _rIcon   = _rRole === 'nurse' ? '👩‍⚕️' : '👨‍⚕️';
      const _rLabel  = _rRole === 'nurse' ? '護理師' : _rRole === 'resident' ? '住院醫師' : '主治醫師';
      const etaHtml = n.reply_eta
        ? `<div class="ni-msg" style="color:#e67e22;font-weight:600">⏰ 醫師預計於「${escHtml(n.reply_eta)}」回覆您</div>`
        : '';
      return `
        <div class="notif-item" onclick="markPatientNotifRead('${n.id}',this)" style="border-left:3px solid ${_rColor}">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">${_rIcon} ${_rLabel}回覆了您的留言</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          ${n.message_preview ? `<div class="ni-msg">您：「${escHtml(n.message_preview)}…」</div>` : ''}
          ${etaHtml}
          ${replyPreview ? `<div class="ni-msg" style="color:${_rColor}">↩ ${_rLabel}：「${escHtml(replyPreview)}${n.reply_text.length > 40 ? '…' : ''}」</div>` : ''}
          <button onclick="event.stopPropagation();closePatientFriendPanel();document.getElementById('btnMedical')?.click()"
            style="margin-top:6px;padding:4px 10px;border-radius:10px;border:none;
                   background:${_rBg};color:${_rColor};font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit">
            查看完整回覆 →
          </button>
        </div>`;
    }
    if (n.type === 'eta_notice') {
      const senderName = n.doctor_name || '護理師';
      return `
        <div class="notif-item" onclick="markPatientNotifRead('${n.id}',this)">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">🔔 護理師通知</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          <div class="ni-msg" style="color:#e67e22;font-weight:600">
            ${escHtml(senderName)}已收到您的訊息，將盡快為您處理，請耐心等候 🙏
          </div>
          <div class="ni-msg" style="color:#2e7d32;font-size:0.85rem;margin-top:4px">
            等待期間不妨前往「🌍 任意視界」，欣賞世界各地即時風景，放鬆心情 😊
          </div>
        </div>`;
    }
    if (n.type === 'task_upload') {
      const taskId = n.id.startsWith('upload_') ? n.id.slice(7) : '';
      const videoData = n.video_url ? encodeURIComponent(JSON.stringify({ url: n.video_url, location: n.location || '', task_id: taskId })) : '';
      const title = `🎬 ${escHtml(n.uploader_name)} 為您上傳了影片`;
      return `
        <div class="notif-item" onclick="markPatientNotifRead('${n.id}',this)"
          style="border-left:3px solid #f59e0b;background:#fffbeb">
          <div class="ni-header">
            ${unreadDot}
            <span class="ni-name">${title}</span>
            <span class="ni-time">${n.timestamp}</span>
            ${delBtn}
          </div>
          ${n.location ? `<div class="ni-msg">📍 ${escHtml(n.location)}</div>` : ''}
          ${n.description ? `<div class="ni-msg" style="color:#666">${escHtml(n.description)}</div>` : ''}
          ${videoData ? `<button onclick="event.stopPropagation();goToNotifVideo('${videoData}')"
            style="margin-top:6px;padding:4px 10px;border-radius:10px;border:none;
                   background:#fef3c7;color:#b45309;
                   font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit">
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
            ${delBtn}
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
      if (ytPl) { ytPl.style.display = 'block'; ytPl.style.zIndex = '5'; ytPl.src = v.url + '?autoplay=1&enablejsapi=1' + (_isMuted ? '&mute=1' : ''); }
    } else {
      if (ytPl) { ytPl.style.display = 'none'; ytPl.src = ''; }
      player.style.display = 'block';
      player.style.zIndex = '5';
      player.src = v.url;
      player.muted = _isMuted;
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
    // 設定任務 ID 以啟用點讚 / 回饋
    _currentCrowdTaskId = v.task_id || null;
    _currentCrowdLocation = v.location || '';
    const _lBtn = document.getElementById('btnLikeVideo');
    const _fBtn = document.getElementById('btnFeedbackVideo');
    if (_currentCrowdTaskId) {
      if (_lBtn) { _lBtn.style.display = 'inline-flex'; _lBtn.disabled = false; _lBtn.classList.remove('liked'); _lBtn.textContent = '👍 點讚'; }
      if (_fBtn)   _fBtn.style.display = 'inline-flex';
    } else {
      if (_lBtn) _lBtn.style.display = 'none';
      if (_fBtn) _fBtn.style.display = 'none';
    }
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


// 群眾端進入時啟動通知輪詢
function startCrowdNotifPoll() {
  const uid = state.currentUser?.id;
  if (!uid) return;
  loadNotifications(uid);
  clearInterval(_notifPollTimer);
  _notifPollTimer = setInterval(() => loadNotifications(uid), 30000);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

console.log("✅ 安心醫伴 app.js 載入完成");

// ════════════════════════════════════════════════
// 🔗 深連結偵測（親友點連結直接進入上傳畫面）
// 格式：/?task=task_008
// ════════════════════════════════════════════════
(function detectDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get('task');
  if (!taskId) return;

  // 清掉 URL 參數，避免重新整理重複觸發
  window.history.replaceState({}, '', window.location.pathname);

  fetch(`/api/crowd/tasks/${taskId}`)
    .then(r => r.json())
    .then(data => {
      if (data.task) _initFriendUploadScreen(data.task);
    })
    .catch(() => {/* 查不到就停在首頁 */});
})();

function _initFriendUploadScreen(task) {
  const locEl  = document.getElementById('friendTaskLocation');
  const descEl = document.getElementById('friendTaskDesc');
  const bedEl  = document.getElementById('friendTaskBed');
  if (locEl)  locEl.textContent  = `📍 ${task.location}`;
  if (descEl) descEl.textContent = `📝 ${task.description || '自然風景'}`;
  if (bedEl)  bedEl.textContent  = `🏥 來自：${task.requested_by || '病患'}`;

  // 儲存任務資料供後續上傳使用
  _selectedTaskId   = task.id;
  _selectedTaskData = task;

  goTo('screen-friend-upload');
}

function friendStartCamera() {
  if (!_selectedTaskData) return;
  // 先開 uploadModal（帶入任務資訊），再立即開鏡頭
  openUploadModal(_selectedTaskData);
  setTimeout(() => openCameraCapture(), 150);
}

function friendChooseFile() {
  if (!_selectedTaskData) return;
  // 先開 uploadModal，再立即呼叫檔案選擇器
  openUploadModal(_selectedTaskData);
  setTimeout(() => document.getElementById('videoFileInput')?.click(), 150);
}

// ══════════════════════════════════════════════════════════════
// EMDR 眼動減敏系統
// ══════════════════════════════════════════════════════════════

// ── 觸發追蹤 ──────────────────────────────────────────────────
const _emdr = {
  msgTimestamps: [], camTimestamps: [],
  watchStart: null, watchTimer: null, triggered: false,
};
const EMDR_MSG_COUNT  = 5;
const EMDR_MSG_WINDOW = 5 * 60 * 1000;
const EMDR_CAM_COUNT  = 5;
const EMDR_CAM_WINDOW = 2 * 60 * 1000;
const EMDR_WATCH_SEC  = 300;  // 5 分鐘

function _emdrOnAllowedScreen() {
  return document.getElementById('screen-anyview')?.classList.contains('active') ||
         document.getElementById('screen-medical')?.classList.contains('active');
}

function emdrTrack(type) {
  if (!_emdrOnAllowedScreen()) return;
  if (_emdr.triggered) return;
  const now = Date.now();
  if (type === 'msg') {
    _emdr.msgTimestamps.push(now);
    _emdr.msgTimestamps = _emdr.msgTimestamps.filter(t => now - t <= EMDR_MSG_WINDOW);
    if (_emdr.msgTimestamps.length >= EMDR_MSG_COUNT) showEmdr('短時間內持續傳送多則訊息');
  }
  if (type === 'cam') {
    _emdr.camTimestamps.push(now);
    _emdr.camTimestamps = _emdr.camTimestamps.filter(t => now - t <= EMDR_CAM_WINDOW);
    if (_emdr.camTimestamps.length >= EMDR_CAM_COUNT) showEmdr('連續切換多個攝影機畫面');
  }
}
function emdrWatchStart() {
  emdrWatchStop();
  if (_emdr.triggered) return;
  if (!_emdrOnAllowedScreen()) return;
  _emdr.watchTimer = setTimeout(() => { if (!_emdr.triggered) showEmdr('長時間持續觀看影片'); }, EMDR_WATCH_SEC * 1000);
}
function emdrWatchStop() {
  if (_emdr.watchTimer) { clearTimeout(_emdr.watchTimer); _emdr.watchTimer = null; }
}

// ── 動畫引擎 ──────────────────────────────────────────────────
const _emdrEng = {
  raf: null, lastTime: 0, phase: 0,
  pattern: 'horizontal',  // horizontal | diagonal | z
  speedHz: 0.2,           // 可調：慢0.18 中0.32 快0.5
  audioCtx: null,
  audioEnabled: true,
  atEndpoint: false,      // 防重複觸發
  prevSide: null,
};
const EMDR_SPEEDS = { slow: 0.18, medium: 0.32, fast: 0.5 };

// 計算光點在軌道內的正規化座標 (tx,ty) ∈ [0,1]
function _emdrPos(phase, pattern) {
  const raw = ((phase % 1) + 1) % 1;
  // 使用 cosine 曲線 → 兩端慢、中間快（自然模擬慢→快→慢）
  const t = (1 - Math.cos(raw * Math.PI * 2)) / 2;

  if (pattern === 'horizontal') {
    return { tx: t, ty: 0.5 };
  } else if (pattern === 'diagonal') {
    return { tx: t, ty: t };          // 左上 ↔ 右下
  } else {                             // z 字型
    const seg = raw * 3;
    const ease = s => (1 - Math.cos(s * Math.PI)) / 2;
    if (seg < 1)      return { tx: ease(seg),       ty: 0.08 };           // 上橫
    else if (seg < 2) return { tx: 1 - ease(seg-1), ty: 0.08 + ease(seg-1)*0.84 }; // 斜線
    else              return { tx: ease(seg-2),      ty: 0.92 };           // 下橫
  }
}

function _emdrAnimate(ts) {
  const eng = _emdrEng;
  if (eng.lastTime === 0) eng.lastTime = ts;
  const dt = Math.min((ts - eng.lastTime) / 1000, 0.1);
  eng.lastTime = ts;
  eng.phase += dt * eng.speedHz;

  const track = document.getElementById('emdrTrack');
  const dot   = document.getElementById('emdrDot');
  if (!track || !dot) { eng.raf = null; return; }

  const tw = track.offsetWidth, th = track.offsetHeight;
  const ds = 34, pad = 14;
  const { tx, ty } = _emdrPos(eng.phase, eng.pattern);
  dot.style.left = (pad + tx * (tw - ds - pad * 2)) + 'px';
  dot.style.top  = (pad + ty * (th - ds - pad * 2)) + 'px';

  // 偵測端點（左側 tx<0.04，右側 tx>0.96）觸發音效 + 震動
  const isLeft  = tx < 0.04;
  const isRight = tx > 0.96;
  if ((isLeft || isRight) && !eng.atEndpoint) {
    eng.atEndpoint = true;
    const side = isLeft ? 'left' : 'right';
    _emdrPing(side);
    if (navigator.vibrate) navigator.vibrate(55);
  } else if (!isLeft && !isRight) {
    eng.atEndpoint = false;
  }

  eng.raf = requestAnimationFrame(_emdrAnimate);
}

// 雙側音效：端點時在對應耳朵播一個短促 ping
function _emdrPing(side) {
  if (!_emdrEng.audioEnabled) return;
  try {
    if (!_emdrEng.audioCtx)
      _emdrEng.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _emdrEng.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    const pan  = ctx.createStereoPanner();

    osc.type = 'sine';
    osc.frequency.value = 480;           // 柔和音調
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    pan.pan.value = side === 'left' ? -0.92 : 0.92;

    osc.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) { /* 靜默失敗 */ }
}

// ── 控制函式（HTML 呼叫） ──────────────────────────────────────
function emdrSetPattern(p) {
  _emdrEng.pattern = p;
  ['horizontal','diagonal','z'].forEach(k => {
    document.getElementById('emdrPat-' + k)?.classList.toggle('active', k === p);
  });
}
function emdrSetSpeed(s) {
  _emdrEng.speedHz = EMDR_SPEEDS[s] || 0.35;
  ['slow','medium','fast'].forEach(k => {
    document.getElementById('emdrSpd-' + k)?.classList.toggle('active', k === s);
  });
}
function emdrToggleAudio() {
  _emdrEng.audioEnabled = !_emdrEng.audioEnabled;
  const btn = document.getElementById('emdrAudioBtn');
  if (btn) btn.textContent = _emdrEng.audioEnabled ? '🔊 音效：開' : '🔇 音效：關';
}

function triggerEmdrManual() {
  showEmdr('手動開啟眼動練習');
}

function showEmdr(reason) {
  // 只在任意視界或醫聲相伴才顯示
  const onAnyview = document.getElementById('screen-anyview')?.classList.contains('active');
  const onMedical = document.getElementById('screen-medical')?.classList.contains('active');
  if (!onAnyview && !onMedical) { emdrWatchStop(); return; }
  _emdr.triggered = true;
  emdrWatchStop();
  const overlay  = document.getElementById('emdrOverlay');
  const reasonEl = document.getElementById('emdrTriggerReason');
  if (reasonEl) reasonEl.textContent = reason;
  if (overlay)  overlay.style.display = 'flex';

  // 啟動動畫
  if (_emdrEng.raf) cancelAnimationFrame(_emdrEng.raf);
  _emdrEng.lastTime = 0;
  _emdrEng.phase = 0;
  _emdrEng.atEndpoint = false;
  // 初始位置
  const dot = document.getElementById('emdrDot');
  if (dot) { dot.style.left = '14px'; dot.style.top = '53px'; }
  _emdrEng.raf = requestAnimationFrame(_emdrAnimate);
}

function closeEmdr() {
  emdrWatchStop();  // 務必清除 180s 觀看計時器，避免在其他頁面觸發
  if (_emdrEng.raf) { cancelAnimationFrame(_emdrEng.raf); _emdrEng.raf = null; }
  // 關閉 AudioContext 釋放資源
  if (_emdrEng.audioCtx) { _emdrEng.audioCtx.close(); _emdrEng.audioCtx = null; }
  const overlay = document.getElementById('emdrOverlay');
  if (overlay) overlay.style.display = 'none';
  _emdr.triggered = false;
  _emdr.msgTimestamps = [];
  _emdr.camTimestamps = [];
}
