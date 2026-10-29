# 扭蛋抽獎

純前端的扭蛋機抽獎網頁，可以直接放到 GitHub Pages，不需要伺服器或資料庫。

- `index.html`：前台扭蛋機。轉動旋鈕，扭蛋會掉出來，接著播放開扭蛋動畫並顯示獎品。
- `admin.html`：後台設定。在這裡新增獎品、設定扭蛋顏色、上傳獎品圖片、調整數量、查看得獎紀錄。

每扭出一顆扭蛋，該獎品的剩餘數量會自動減 1。抽中機率依剩餘數量計算，剩越多的獎品越容易扭到。

## 檔案結構

```
index.html      前台
admin.html      後台
css/style.css   共用樣式
js/store.js     資料層（localStorage + IndexedDB）
js/front.js     前台扭蛋機與動畫
js/admin.js     後台功能
```

## 放上 GitHub Pages

1. 在 GitHub 建立一個新的 repository，把這個資料夾的所有檔案上傳到 repository 的根目錄。
2. 到 repository 的 **Settings → Pages**。
3. Source 選 **Deploy from a branch**，Branch 選 `main`，資料夾選 `/ (root)`，按 Save。
4. 等一到兩分鐘，網址會顯示在同一頁，格式是 `https://<你的帳號>.github.io/<repository 名稱>/`。
   - 前台：`https://<你的帳號>.github.io/<repository 名稱>/`
   - 後台：`https://<你的帳號>.github.io/<repository 名稱>/admin.html`

## 使用方式

1. 在活動用的電腦上打開後台 `admin.html`，新增獎品、設定顏色和圖片。
2. 用同一台電腦、同一個瀏覽器打開前台 `index.html`，投影到大螢幕。
3. 後台修改數量或獎品，已開啟的前台會自動更新，不用重新整理。

## 資料存在哪裡

資料存在**瀏覽器本身**：獎品與紀錄在 localStorage，圖片在 IndexedDB。因此：

- 前台和後台必須用**同一台電腦、同一個瀏覽器**開啟，才會共用同一份資料。
- 別人用自己的手機打開網址，看到的是他自己瀏覽器裡的資料（一開始是空的），不會影響你的扭蛋機。
- 清除瀏覽器資料會把獎品一起清掉。活動前請在後台按「匯出備份檔」，要換電腦時再「匯入備份檔」。

如果需要多台裝置同時連到同一台扭蛋機（例如後台在手機、前台在投影電腦），需要另外接一個雲端資料庫（例如 Firebase）。

## 本機測試

直接雙擊 `index.html` 也能開，但部分瀏覽器對 `file://` 開啟的頁面會限制儲存功能。比較保險的方式是在資料夾內執行：

```
python3 -m http.server 8000
```

然後打開 `http://localhost:8000/` 與 `http://localhost:8000/admin.html`。
