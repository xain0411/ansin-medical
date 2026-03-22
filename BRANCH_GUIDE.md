# 安心醫伴 版本分支管理指南

## 分支結構

| 分支 | 用途 |
|------|------|
| `main` | **穩定版本**，比賽展示用，已移除未完成功能 |
| `feature/experimental` | **完整實驗版**，保留所有功能程式碼（含生理感測） |

---

## 各分支差異

### `main`（目前展示版）
- 照護團隊分流（care_team）
- 聊天室歷史紀錄
- 溫暖轉譯（護理師 + 醫師）
- AI 回覆建議（參考各自 RAG）
- TTAS 檢傷分類
- 視覺處方 / EMDR

### `feature/experimental`（額外保留）
- ✅ 以上所有功能
- 🧬 生理感測數據（M55M1 微表情 + EDA 膚電）
- 🔴 醫生端微表情情緒警報面板

---

## 常用指令

### 查看目前在哪個分支
```bash
git branch
```

### 切換分支
```bash
git checkout main                  # 切到穩定版
git checkout feature/experimental  # 切到實驗版（有生理感測）
```

### 儲存目前修改（commit）
```bash
git add 檔案名稱
git commit -m "說明這次改了什麼"
```

### 查看所有歷史紀錄
```bash
git log --oneline
```

---

## 還原操作

### 還原單一檔案到上一個 commit 的狀態
```bash
git checkout HEAD -- frontend/index.html
```

### 還原到某個特定 commit
```bash
git log --oneline          # 先找到 commit ID（例如 41f5159）
git checkout 41f5159       # 查看當時狀態（detached HEAD）
git checkout main          # 回到最新版
```

### 完全回到某個 commit（**會丟失之後的修改，謹慎使用**）
```bash
git reset --hard 41f5159
```

### 把 experimental 的某個功能合回 main
```bash
git checkout main
git merge feature/experimental     # 整個合併
# 或只挑特定 commit：
git cherry-pick <commit-id>
```

---

## Commit 歷史

| Commit | 說明 |
|--------|------|
| `41f5159` | v2.0 照護團隊分流、聊天室歷史、溫暖轉譯、Bug修復 |
| `732a3ab` | 智慧醫療陪伴系統 v1.0 |

---

## 注意事項

- `__pycache__/` 不需要 commit，是 Python 自動產生的
- Windows 上 `git add` 會出現 LF/CRLF warning，正常現象，不影響功能
- 切分支前建議先 commit，避免未存檔的修改造成衝突
