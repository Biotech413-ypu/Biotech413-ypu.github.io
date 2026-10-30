/* 扭蛋抽獎 — 後台設定 */
(function () {
  'use strict';
  const G = window.Gacha;
  const $ = s => document.querySelector(s);
  let data = G.read();

  const totalLeft = () => data.prizes.reduce((s, p) => s + Math.max(0, p.remaining | 0), 0);
  function showMsg(sel, text, isErr) { const el = $(sel); el.textContent = text; el.classList.toggle('err', !!isErr); }
  const errText = err => (err && err.name === 'QuotaExceededError') ? '瀏覽器儲存空間已滿，請換小一點的圖片或刪除不用的獎品' : ((err && err.message) || '未知錯誤');

  /* ---------- render ---------- */
  function render() {
    const title = data.title || '扭蛋抽獎';
    $('#admin-eyebrow').textContent = title;
    const left = totalLeft(), total = data.prizes.reduce((s, p) => s + (p.total | 0), 0);
    $('#summary').innerHTML = `<span><b>${data.prizes.length}</b>種獎品</span><span><b>${left}</b>顆剩餘</span><span><b>${total}</b>顆原始</span><span><b>${data.drawCount | 0}</b>顆已扭出</span>`;
    const ti = $('#title-input'); if (document.activeElement !== ti) ti.value = data.title || '';
    const mc = G.validColor(data.machineColor) ? data.machineColor : '#D7372B';
    if (document.activeElement !== $('#machine-color')) $('#machine-color').value = mc.toLowerCase();
    previewMachine(mc);
    const ac = $('#add-color'); if (!ac.dataset.touched) ac.value = G.nextColor(data.prizes);

    const logs = data.draws.slice().reverse();
    $('#log-admin').innerHTML = logs.length ? logs.map(d => {
      const p = data.prizes.find(x => x.id === d.prizeId);
      const c = G.validColor(d.prizeColor) ? d.prizeColor : G.colorOf(p, data.prizes);
      return `<li><span class="n">#${G.pad(d.seq | 0)}</span><span class="dot" style="--c:${c}"></span><span class="p">${G.esc(d.prizeName)}${d.who ? ` <small>· ${G.esc(d.who)}</small>` : ''}</span><span class="t">${G.fmtTime(d.at)}</span></li>`;
    }).join('') : '<li class="empty">還沒有人扭到。</li>';

    renderRows();
  }

  function renderRows() {
    const tbody = $('#prize-rows');
    // Don't rebuild while someone is typing or uploading in the table.
    if (tbody.contains(document.activeElement) || tbody.querySelector('.uploading')) return;
    tbody.innerHTML = data.prizes.length ? data.prizes.map(p => {
      const c = G.colorOf(p, data.prizes), id = G.esc(p.id);
      return `<tr data-id="${id}" style="--c:${c}">
        <td><input type="color" id="cl-${id}" data-f="color" value="${c}" aria-label="扭蛋顏色"></td>
        <td><div class="thumb-cell"><div class="thumb">${G.picHtml(p.image, c, p.name)}</div>
          <div class="thumb-actions"><label>${p.image ? '更換' : '上傳'}<input type="file" accept="image/*" data-up="${id}"></label>${p.image ? `<button type="button" class="btn-small" data-rmimg="${id}">移除</button>` : ''}</div>
        </div></td>
        <td><input type="text" id="nm-${id}" data-f="name" value="${G.esc(p.name)}" maxlength="60" aria-label="獎品名稱"></td>
        <td><input type="number" id="rm-${id}" data-f="remaining" value="${p.remaining | 0}" min="0" max="99999" aria-label="剩餘數量"></td>
        <td><input type="number" id="tt-${id}" data-f="total" value="${p.total | 0}" min="0" max="99999" aria-label="原始數量"></td>
        <td>${(p.remaining | 0) > 0 ? '<span class="pill live">可扭</span>' : '<span class="pill out">已扭完</span>'}</td>
        <td><button type="button" class="btn-danger" data-del="${id}">刪除</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">還沒有獎品，請在上方新增。</td></tr>';
    G.hydrateImages(tbody);
  }

  /* ---------- two-step confirm buttons ---------- */
  function armButton(btn, label, armedLabel, action, msgSel) {
    let timer = null;
    btn.addEventListener('click', async () => {
      if (!btn.classList.contains('armed')) {
        btn.classList.add('armed'); btn.textContent = armedLabel;
        timer = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer); btn.disabled = true;
      try { await action(); } catch (e) { showMsg(msgSel, '操作失敗：' + errText(e), true); }
      btn.disabled = false; btn.classList.remove('armed'); btn.textContent = label;
    });
  }

  /* ---------- title ---------- */
  $('#title-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#title-input').value.trim();
    try { G.update(d => { d.title = t; }); $('#title-input').blur(); showMsg('#table-msg', '活動名稱已儲存。'); }
    catch (err) { showMsg('#table-msg', '儲存失敗：' + errText(err), true); }
  });

  /* ---------- add prize ---------- */
  $('#add-color').addEventListener('input', e => { e.target.dataset.touched = '1'; });
  $('#add-file').addEventListener('change', e => {
    const f = e.target.files[0]; const pv = $('#add-pv');
    if (pv.src) URL.revokeObjectURL(pv.src);
    if (f) { pv.src = URL.createObjectURL(f); pv.hidden = false; $('#add-file-name').textContent = f.name; }
    else { pv.hidden = true; $('#add-file-name').textContent = '選擇圖片'; }
  });
  $('#add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#add-name').value.trim(); const qty = Math.floor(Number($('#add-qty').value));
    const color = $('#add-color').value; const file = $('#add-file').files[0];
    if (!name) return showMsg('#add-msg', '請輸入獎品名稱。', true);
    if (!(qty >= 1)) return showMsg('#add-msg', '數量至少要 1。', true);
    const btn = $('#add-btn'); btn.disabled = true;
    try {
      let image = '';
      if (file) { showMsg('#add-msg', '正在處理圖片…'); image = await G.images.put(await G.shrinkImage(file, 800)); }
      G.update(d => {
        const order = d.prizes.reduce((m, x) => Math.max(m, x.order | 0), 0) + 1;
        d.prizes.push({ id: G.uid('p'), name, remaining: qty, total: qty, color, image, order, createdAt: Date.now() });
      });
      $('#add-name').value = ''; $('#add-qty').value = 1; $('#add-file').value = ''; $('#add-pv').hidden = true; $('#add-file-name').textContent = '選擇圖片';
      delete $('#add-color').dataset.touched; $('#add-color').value = G.nextColor(data.prizes);
      $('#add-name').focus();
      showMsg('#add-msg', `已新增「${name}」× ${qty}`);
    } catch (err) { showMsg('#add-msg', '新增失敗：' + errText(err), true); }
    btn.disabled = false;
  });

  /* ---------- prize table ---------- */
  const tbody = $('#prize-rows');
  tbody.addEventListener('change', async e => {
    const inp = e.target; const tr = inp.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    if (inp.dataset.up) {
      const file = inp.files[0]; if (!file) return;
      const old = (data.prizes.find(p => p.id === id) || {}).image;
      tr.classList.add('uploading'); showMsg('#table-msg', '正在處理圖片…');
      try {
        const ref = await G.images.put(await G.shrinkImage(file, 800));
        G.update(d => { const p = d.prizes.find(x => x.id === id); if (p) p.image = ref; });
        if (old) G.images.del(old);
        showMsg('#table-msg', '圖片已更新。');
      } catch (err) { showMsg('#table-msg', '上傳失敗：' + errText(err), true); }
      tr.classList.remove('uploading'); renderRows();
      return;
    }
    const f = inp.dataset.f; if (!f) return;
    let v = inp.value;
    if (f === 'name') { v = v.trim(); if (!v) { showMsg('#table-msg', '獎品名稱不能空白。', true); return; } }
    else if (f === 'color') { if (!G.validColor(v)) return; tr.style.setProperty('--c', v); }
    else { v = Math.max(0, Math.floor(Number(v) || 0)); inp.value = v; }
    try { G.update(d => { const p = d.prizes.find(x => x.id === id); if (p) p[f] = v; }); showMsg('#table-msg', '已儲存。'); }
    catch (err) { showMsg('#table-msg', '儲存失敗：' + errText(err), true); }
  });
  tbody.addEventListener('focusout', () => setTimeout(() => { if (!tbody.contains(document.activeElement)) renderRows(); }, 0));
  tbody.addEventListener('click', e => {
    const rm = e.target.closest('[data-rmimg]');
    if (rm) {
      const id = rm.dataset.rmimg; const old = (data.prizes.find(p => p.id === id) || {}).image;
      G.update(d => { const p = d.prizes.find(x => x.id === id); if (p) p.image = ''; });
      if (old) G.images.del(old);
      rm.blur(); renderRows(); showMsg('#table-msg', '圖片已移除。');
      return;
    }
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = '確定刪除？'; setTimeout(() => { b.classList.remove('armed'); b.textContent = '刪除'; }, 4000); return; }
    const id = b.dataset.del; const old = (data.prizes.find(p => p.id === id) || {}).image;
    G.update(d => { d.prizes = d.prizes.filter(x => x.id !== id); });
    if (old) G.images.del(old);
    b.blur(); renderRows(); showMsg('#table-msg', '已刪除。');
  });

  armButton($('#reset-btn'), '剩餘數量重設為原始數量', '確定重設？再按一次', () => {
    G.update(d => d.prizes.forEach(p => { p.remaining = p.total | 0; }));
    showMsg('#table-msg', '已將所有獎品的剩餘數量重設為原始數量。');
  }, '#table-msg');
  armButton($('#clear-btn'), '清除全部紀錄', '確定清除？再按一次', () => {
    G.update(d => { d.draws = []; d.drawCount = 0; });
  }, '#table-msg');

  /* ---------- machine colour ---------- */
  function previewMachine(c) {
    const n = parseInt(c.slice(1), 16); const k = 0.72;
    const deep = '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * k).toString(16).padStart(2, '0')).join('');
    const pv = document.querySelector('.machine-preview'); pv.style.setProperty('--machine', c); pv.style.setProperty('--machine-deep', deep);
  }
  $('#machine-color').addEventListener('input', e => previewMachine(e.target.value));
  $('#machine-color').addEventListener('change', e => {
    const v = e.target.value; if (!G.validColor(v)) return;
    G.update(d => { d.machineColor = v; }); showMsg('#table-msg', '扭蛋機顏色已儲存。');
  });
  $('#machine-reset').addEventListener('click', () => { G.update(d => { d.machineColor = '#D7372B'; }); });

  /* ---------- export a config file ---------- */
  const safeName = s => s.replace(/[\\/:*?"<>|#%\s]+/g, '-').replace(/^-+|-+$/g, '');
  $('#export-form').addEventListener('submit', async e => {
    e.preventDefault();
    const label = $('#export-name').value.trim();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const file = (safeName(label) || 'gacha-config-' + stamp) + '.json';
    try {
      const obj = await G.exportBackup(label);
      const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { showMsg('#cfg-msg', '匯出失敗：' + errText(err), true); return; }
    showMsg('#cfg-msg', `已下載「${file}」。把它上傳到 GitHub repository 的 configs 資料夾，約一兩分鐘後按「重新讀取清單」就會出現。`);
  });

  /* ---------- list config files published with the site ---------- */
  // 1) configs/index.json if you keep one (works on any host);
  // 2) otherwise read the repository's file list through the GitHub API (public repos on *.github.io).
  //    Any .json inside a folder named "configs" is listed, wherever the site sits in the repo.
  const parseJson = text => JSON.parse(String(text).replace(/^﻿/, ''));
  function repoInfo() {
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return null;
    const owner = host.split('.')[0];
    const segs = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (segs.length && /\.[a-z0-9]+$/i.test(segs[segs.length - 1])) segs.pop(); // drop admin.html
    // https://owner.github.io/repo/... is a project site; a repo named owner.github.io serves from the root.
    const userSite = { owner, repo: host, prefix: segs.join('/') };
    const projectSite = segs.length ? { owner, repo: segs[0], prefix: segs.slice(1).join('/') } : null;
    return { candidates: projectSite ? [projectSite, userSite] : [userSite] };
  }
  const rawUrl = (o, r, path) => `https://raw.githubusercontent.com/${o}/${r}/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`;
  let checkedRepo = '';
  async function listConfigs() {
    try {
      const r = await fetch('configs/index.json', { cache: 'no-store' });
      if (r.ok) {
        const arr = parseJson(await r.text());
        if (Array.isArray(arr)) return arr.map(x => typeof x === 'string' ? x : x && x.file).filter(f => f && /\.json$/i.test(f) && f !== 'index.json')
          .map(f => ({ name: f, url: 'configs/' + f.split('/').map(encodeURIComponent).join('/') }));
      }
    } catch (e) {}
    const info = repoInfo();
    if (!info) throw new Error('local');
    let lastStatus = 0;
    for (const c of info.candidates) {
      checkedRepo = `${c.owner}/${c.repo}`;
      let r;
      try { r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/git/trees/HEAD?recursive=1`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }); }
      catch (e) { throw new Error('連不上 GitHub，請檢查網路後再試'); }
      lastStatus = r.status;
      if (r.status === 404) continue;
      if (r.status === 409) return []; // empty repository
      if (r.status === 403 || r.status === 429) throw new Error('GitHub 暫時限制查詢次數（每小時 60 次），請過幾分鐘再按「重新讀取清單」');
      if (!r.ok) throw new Error('GitHub 回應錯誤（' + r.status + '）');
      const tree = (await r.json()).tree || [];
      const prefix = c.prefix ? c.prefix + '/' : '';
      const files = tree.filter(x => x.type === 'blob' && /\.json$/i.test(x.path) && !/(^|\/)(index|package|package-lock)\.json$/i.test(x.path));
      // Files in a configs folder first; also accept .json files dropped next to admin.html by mistake.
      const inConfigs = files.filter(x => /(^|\/)configs\/[^/]+$/i.test(x.path));
      const nearSite = files.filter(x => !inConfigs.includes(x) && x.path.startsWith(prefix) && !x.path.slice(prefix.length).includes('/'));
      const pick = [...inConfigs.sort((a, b) => (b.path.startsWith(prefix) ? 1 : 0) - (a.path.startsWith(prefix) ? 1 : 0)), ...nearSite];
      return pick.map(x => {
        const base = x.path.split('/').pop();
        const where = /(^|\/)configs\//i.test(x.path) ? '' : '（不在 configs 資料夾）';
        return { name: base, label: base.replace(/\.json$/i, '') + where, path: x.path, url: rawUrl(c.owner, c.repo, x.path) };
      });
    }
    if (lastStatus === 404) throw new Error(`找不到 repository「${checkedRepo}」。請確認 repository 是 Public（Settings → General → Danger Zone → Change visibility）`);
    return [];
  }
  let configs = [];
  async function refreshConfigs() {
    const sel = $('#cfg-select'); sel.innerHTML = '<option value="">讀取中…</option>'; sel.disabled = true;
    try {
      configs = await listConfigs();
      const where = checkedRepo ? `（已檢查 ${checkedRepo}）` : '';
      if (!configs.length) {
        sel.innerHTML = '<option value="">（還沒有設定檔）</option>';
        showMsg('#cfg-msg', `沒有找到設定檔${where}。請把匯出的 .json 上傳到 repository 的 configs 資料夾，等一兩分鐘後按「重新讀取清單」。`);
      } else {
        sel.innerHTML = configs.map((c, i) => `<option value="${i}">${G.esc(c.label || c.name.replace(/\.json$/i, ''))}</option>`).join('');
        sel.disabled = false; showMsg('#cfg-msg', `找到 ${configs.length} 個設定檔${where}。`);
      }
    } catch (err) {
      sel.innerHTML = '<option value="">（無法讀取清單）</option>';
      showMsg('#cfg-msg', err.message === 'local'
        ? '目前不是在 github.io 網址上開啟，所以無法自動讀取 GitHub 清單。請用下方「從這台電腦的檔案載入」，或在 configs 資料夾放一個 index.json 列出檔名。'
        : '讀取清單失敗：' + errText(err), err.message !== 'local');
    }
  }
  async function fetchConfig(c) {
    let r;
    try { r = await fetch(c.url, { cache: 'no-store' }); } catch (e) { throw new Error('下載設定檔失敗，請檢查網路後再試'); }
    if (!r.ok) throw new Error('下載設定檔失敗（' + r.status + '）');
    let obj;
    try { obj = parseJson(await r.text()); } catch (e) { throw new Error('「' + c.name + '」不是有效的 JSON 檔，可能在上傳時被改動，請重新匯出後再上傳'); }
    return obj;
  }
  $('#cfg-refresh').addEventListener('click', refreshConfigs);
  armButton($('#cfg-load'), '載入選擇的設定檔', '會取代目前所有資料，確定？', async () => {
    const c = configs[Number($('#cfg-select').value)];
    if (!c) { showMsg('#cfg-msg', '請先選擇一個設定檔。', true); return; }
    showMsg('#cfg-msg', '正在載入…');
    const obj = await fetchConfig(c);
    await G.importBackup(obj, { reset: $('#cfg-reset').checked });
    showMsg('#cfg-msg', `已載入「${obj.name || c.name}」。已開啟的前台會自動更新。`);
  }, '#cfg-msg');
  refreshConfigs();

  /* ---------- load a config file from this computer ---------- */
  let pendingImport = null;
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const obj = parseJson(await f.text());
      G.checkConfig(obj);
      pendingImport = obj;
      showMsg('#backup-msg', `「${obj.name || f.name}」有 ${obj.data.prizes.length} 種獎品。載入會取代目前所有獎品、圖片與紀錄（是否重設數量依照上方勾選）。 `);
      const go = document.createElement('button'); go.type = 'button'; go.className = 'btn-danger armed btn-small'; go.textContent = '確定載入';
      go.addEventListener('click', async () => {
        go.disabled = true;
        try { await G.importBackup(pendingImport, { reset: $('#cfg-reset').checked }); pendingImport = null; showMsg('#backup-msg', '載入完成。'); }
        catch (err) { showMsg('#backup-msg', '載入失敗：' + errText(err), true); }
      });
      $('#backup-msg').appendChild(go);
    } catch (err) { showMsg('#backup-msg', '無法讀取：' + (err instanceof SyntaxError ? '這個檔案不是有效的 JSON，請確認選的是後台匯出的設定檔' : errText(err)), true); }
  });

  G.subscribe(d => { data = d; render(); });
})();
