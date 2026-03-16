// frontend/js/api.js — API 呼叫封裝層
// 所有 API 呼叫集中在這裡，方便之後修改 base URL

const BASE_URL = "";  // 同源，不需要加 http://localhost:8000

const api = {
  // ── AUTH ─────────────────────────────────────
  async login(userId, password, bed = "") {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, password, bed }),
    });
    if (!res.ok) throw new Error("登入失敗");
    return res.json();
  },

  // ── 任意視界（舊版 fake pins，保持向後相容）─────
  async getMapPins() {
    const res = await fetch(`${BASE_URL}/api/map/pins`);
    return res.json();
  },

  async createSpotRequest(location, description, specialReqs, requestedBy, lat, lng) {
    const res = await fetch(`${BASE_URL}/api/spot-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location,
        description,
        special_requirements: specialReqs,
        requested_by: requestedBy,
        lat: lat,
        lng: lng,
      }),
    });
    return res.json();
  },

  // ── 任意視界（真實 Twipcam API）──────────────
  /**
   * 查詢附近 Twipcam 攝影機（後端 proxy 至 twipcam.com）
   * @param {number} lat 緯度
   * @param {number} lon 經度
   * @returns {Promise<{cameras: Array}>}
   */
  async getTwipcamNearby(lat = 25.0330, lon = 121.5654) {
    const res = await fetch(
      `${BASE_URL}/api/twipcam/nearby?lat=${lat}&lon=${lon}&limit=30`
    );
    if (!res.ok) throw new Error("Twipcam API 失敗");
    return res.json();
  },

  /**
   * 取得預設多城市攝影機清單
   * @returns {Promise<{cameras: Array, total: number}>}
   */
  async getTwipcamPresets() {
    const res = await fetch(`${BASE_URL}/api/twipcam/presets`);
    if (!res.ok) throw new Error("Twipcam presets 失敗");
    return res.json();
  },

  async getTherapeuticChannels() {
    const res = await fetch(`${BASE_URL}/api/therapeutic-channels`);
    if (!res.ok) throw new Error("療癒精選載入失敗");
    return res.json();
  },

  /**
   * 取得 MJPEG proxy URL（直接貼給 <img src=>）
   * @param {string} camId Twipcam 攝影機 ID
   * @returns {string} proxy URL
   */
  getCamProxyUrl(camId) {
    return `${BASE_URL}/api/cam-proxy/${encodeURIComponent(camId)}`;
  },

  // ── 醫聲相伴（病患端）───────────────────────
  async getDoctors() {
    const res = await fetch(`${BASE_URL}/api/doctors`);
    return res.json();
  },

  async getPatientMessages(patientId) {
    const res = await fetch(`${BASE_URL}/api/messages/${patientId}`);
    return res.json();
  },

  async sendPatientMessage(patientId, bed, emotion, text = "", doctorId = null, sentiment = null) {
    const body = { patient_id: patientId, bed, emotion, text, doctor_id: doctorId };
    // 附上 AI 情緒分析結果（Hugging Face Transformers.js 推論）
    if (sentiment) {
      body.sentiment       = sentiment.label;
      body.sentiment_score = sentiment.score;
    }
    const res = await fetch(`${BASE_URL}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async recommendDept(text) {
    const res = await fetch(`${BASE_URL}/api/llm/recommend-dept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: text }),
    });
    return res.json();
  },

  // ── 醫聲相伴（醫生端）───────────────────────
  async getPendingPatients(hospital = "") {
    const url = hospital ? `${BASE_URL}/api/doctor/pending?hospital=${encodeURIComponent(hospital)}` : `${BASE_URL}/api/doctor/pending`;
    const res = await fetch(url);
    return res.json();
  },

  async togglePatientStar(bed, color) {
    const res = await fetch(`${BASE_URL}/api/doctor/pending/${encodeURIComponent(bed)}/star`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ star_color: color }),
    });
    return res.json();
  },

  async getPatientByBed(bed) {
    const res = await fetch(`${BASE_URL}/api/doctor/patient/${encodeURIComponent(bed)}`);
    return res.json();
  },

  async sendDoctorReply(messageId, replyText) {
    const res = await fetch(`${BASE_URL}/api/doctor/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, reply_text: replyText }),
    });
    return res.json();
  },

  async llmRewrite(rawText) {
    const res = await fetch(`${BASE_URL}/api/llm/rewrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: rawText }),
    });
    return res.json();
  },

  async empathyRewrite(rawText, patientEmotion = '') {
    const res = await fetch(`${BASE_URL}/api/llm/empathy-rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: rawText, patient_emotion: patientEmotion }),
    });
    return res.json();
  },

  // ── 群眾端 ───────────────────────────────────
  async getCrowdTasks() {
    const res = await fetch(`${BASE_URL}/api/crowd/tasks`);
    return res.json();
  },

  async getCrowdVideos() {
    const res = await fetch(`${BASE_URL}/api/crowd/videos`);
    return res.json();
  },

  async getCrowdStats(userId) {
    const res = await fetch(`${BASE_URL}/api/crowd/stats/${userId}`);
    return res.json();
  },

  async completeTask(taskId) {
    const res = await fetch(`${BASE_URL}/api/crowd/tasks/${taskId}/complete`, {
      method: "POST",
    });
    return res.json();
  },

  async getRewards() {
    const res = await fetch(`${BASE_URL}/api/crowd/rewards`);
    return res.json();
  },

  async redeemReward(userId, rewardId) {
    const res = await fetch(`${BASE_URL}/api/crowd/redeem/${encodeURIComponent(userId)}/${encodeURIComponent(rewardId)}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("兌換失敗");
    return res.json();
  },

  /**
   * 上傳影片（真實 multipart/form-data，帶進度回調）
   * @param {string} taskId 對應的任務 ID
   * @param {File} file 影片 File 物件
   * @param {function(number): void} onProgress 進度回調 0~100
   * @returns {Promise<{success:boolean, video_url:string, points_earned:number}>}
   */
  async getLeaderboard(period = "weekly") {
    const res = await fetch(`${BASE_URL}/api/leaderboard/${period}`);
    return res.json();
  },

  async getUserRewards(userId) {
    const res = await fetch(`${BASE_URL}/api/leaderboard/rewards/${encodeURIComponent(userId)}`);
    return res.json();
  },

  async analyzeVideoContent(taskId) {
    const res = await fetch(`${BASE_URL}/api/video/analyze/${encodeURIComponent(taskId)}`);
    return res.json();
  },

  async getVideoModelStatus() {
    const res = await fetch(`${BASE_URL}/api/video/model-status`);
    return res.json();
  },

  uploadVideo(taskId, file, onProgress = null) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("task_id", taskId);
      formData.append("file", file);
      // 帶上登入用戶 ID，讓後端分別計算個人成就
      const uid = (typeof state !== 'undefined' && state.currentUser?.id) || "crowd_001";
      formData.append("user_id", uid);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/api/crowd/upload`);

      // 進度事件
      if (onProgress && xhr.upload) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`上傳失敗：${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("網路錯誤"));
      xhr.send(formData);
    });
  },

  // ── 評分 / 通知 / 好友 / 聊天 ─────────────────────
  async rateVideo(taskId, patientId, stars, messageText, addFriend) {
    const res = await fetch(`${BASE_URL}/api/crowd/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, patient_id: patientId, stars, message_text: messageText, add_friend: addFriend }),
    });
    if (!res.ok) throw new Error("評分失敗");
    return res.json();
  },

  async getNotifications(userId) {
    const res = await fetch(`${BASE_URL}/api/notifications/${encodeURIComponent(userId)}`);
    return res.json();
  },

  async respondFriendRequest(requestId, action) {
    const res = await fetch(`${BASE_URL}/api/friend/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, action }),
    });
    return res.json();
  },

  async getFriendList(userId) {
    const res = await fetch(`${BASE_URL}/api/friend/list/${encodeURIComponent(userId)}`);
    return res.json();
  },

  async getChatMessages(userId, otherId) {
    const res = await fetch(`${BASE_URL}/api/chat/${encodeURIComponent(userId)}/${encodeURIComponent(otherId)}`);
    return res.json();
  },

  async sendChatMessage(fromId, toId, text) {
    const res = await fetch(`${BASE_URL}/api/chat/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_id: fromId, to_id: toId, text }),
    });
    if (!res.ok) throw new Error("訊息送出失敗");
    return res.json();
  },

  // ── 病患心願清單 ─────────────────────────────────
  async getPatientWishlist(patientId) {
    const res = await fetch(`${BASE_URL}/api/wishlist/${encodeURIComponent(patientId)}`);
    if (!res.ok) throw new Error("載入心願清單失敗");
    return res.json();
  },

  async getAllWishlists() {
    const res = await fetch(`${BASE_URL}/api/wishlist/all`);
    if (!res.ok) throw new Error("載入所有心願失敗");
    return res.json();
  },

  async addWishlist(data) {
    const res = await fetch(`${BASE_URL}/api/wishlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("新增心願失敗");
    return res.json();
  },

  async deleteWishlist(wishId) {
    const res = await fetch(`${BASE_URL}/api/wishlist/${encodeURIComponent(wishId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "刪除心願失敗");
    }
    return res.json();
  },

  async claimWishlist(wishId, crowdId) {
    const res = await fetch(`${BASE_URL}/api/wishlist/${encodeURIComponent(wishId)}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crowd_id: crowdId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "認領失敗");
    }
    return res.json();
  },

  async uploadWishPreVoice(wishId, crowdId, audioBlob) {
    const fd = new FormData();
    fd.append("crowd_id", crowdId);
    fd.append("file", audioBlob, "voice.webm");
    const res = await fetch(`${BASE_URL}/api/wishlist/${encodeURIComponent(wishId)}/pre-voice`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error("上傳語音失敗");
    return res.json();
  },

  async fulfillWishlist(wishId, crowdId, file) {
    const fd = new FormData();
    fd.append("crowd_id", crowdId);
    fd.append("file", file);
    const res = await fetch(`${BASE_URL}/api/wishlist/${encodeURIComponent(wishId)}/fulfill`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error("上傳成果失敗");
    return res.json();
  },
};
