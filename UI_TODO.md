# UI 待修改項目清單

> 原則：按重要性決定大小，最常用 / 最關鍵的操作元件應最顯眼。
> 格式：每個項目標記 `[ ]` 待修改、`[x]` 已完成。

---

## 畫面：醫聲相伴（病患端）`#screen-medical`

### [ ] 心情選擇四格縮小

- **問題**：`.emotion-btn` 的 emoji 字型 `3rem (48px)`、padding `16px 8px`，整個格子佔據畫面過多空間，擠壓輸入區。
- **影響元素**：`.emotion-btn`、`.emotion-emoji`、`.emotion-label`、`.emotion-grid`
- **建議修改**：
  - `.emotion-emoji`：`3rem` → `2rem`
  - `.emotion-btn` padding：`16px 8px` → `10px 6px`
  - `.emotion-btn` gap（emoji 與 label 間距）：`10px` → `6px`
  - `.emotion-label` font-size：`1.1rem` → `0.95rem`
  - `.emotion-grid` padding：`16px` → `10px`
  - `.emotion-grid` gap：`12px` → `8px`
- **CSS 位置**：`frontend/css/style.css`（`.emotion-btn`、`.emotion-emoji`、`.emotion-label`、`.emotion-grid`）

---

### [ ] 語音輸入按鈕放大

- **問題**：`.voice-input-btn` 直徑僅 `42px`（平板更縮到 `36px`），是病患最常使用的核心輸入方式，卻比傳送按鈕（`40px`）還大不了多少，對行動不便的病患難以精準點擊。
- **影響元素**：`.voice-input-btn`
- **建議修改**：
  - `width` / `height`：`42px` → `56px`
  - `font-size`：`1.15rem` → `1.5rem`
  - 平板（≤768px）：`36px` → `52px`
- **CSS 位置**：`frontend/css/style.css`（`.voice-input-btn`）及 `@media (max-width: 768px)` 區塊

---

### [ ] 傳送按鈕放大

- **問題**：`.send-btn` 直徑 `40px`，是最終傳送訊息的主要動作，重要性高但大小與語音按鈕幾乎相同，視覺層級不明確。
- **影響元素**：`.send-btn`
- **建議修改**：
  - `width` / `height`：`40px` → `52px`
  - `font-size`：`1.1rem` → `1.35rem`
- **CSS 位置**：`frontend/css/style.css`（`.send-btn`）

---

### [ ] 「不知道問哪科？」按鈕字型偏小

- **問題**：`font-size: 0.85rem`，此按鈕是 AI 輔助功能的入口，對不知道看哪科的病患非常重要，但視覺份量不足。
- **影響元素**：`#btnRecommendDept`（HTML 內聯 style）
- **建議修改**：
  - `font-size`：`0.85rem` → `0.95rem`
  - `padding`：`8px 12px` → `10px 16px`
- **HTML 位置**：`frontend/index.html`（`#btnRecommendDept` 的 inline style）

---

### [ ] 科別選擇下拉框字型偏小

- **問題**：`font-size: 0.85rem`，病患選錯科別會讓訊息送到錯誤醫生，重要性高，但字體小且視覺不突出。
- **影響元素**：`#doctorSelect`（HTML 內聯 style）
- **建議修改**：
  - `font-size`：`0.85rem` → `0.95rem`
  - `padding`：`8px` → `10px 12px`
- **HTML 位置**：`frontend/index.html`（`#doctorSelect` 的 inline style）

---

## 畫面：任意視界（病患端）`#screen-anyview`

### [ ] 靜音按鈕視覺層級不夠明顯

- **問題**：`.vc-btn.mute` 和 AI 導覽按鈕大小相同，但靜音是使用頻率更高的實用功能（病房夜間使用），應更突出。
- **建議修改**：
  - 放大 padding 或增加最小寬度
  - 靜音啟動時的顏色對比度提高（目前僅改背景透明度）
- **CSS 位置**：`frontend/css/style.css`（`.vc-btn`）

---

## 新增項目區（待填寫）

<!-- 在此行下方依相同格式新增 -->

---

## 已完成項目

<!-- 修改完成後將 [ ] 改為 [x] 並移至此區 -->
