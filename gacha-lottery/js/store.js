/*
 * 扭蛋抽獎 — 資料層
 * 獎品與紀錄存在 localStorage，圖片存在 IndexedDB。
 * 同一個網站（同一個網域）底下的 index.html 與 admin.html 共用這份資料，
 * 一邊修改，另一個已開啟的分頁會自動更新。
 */
(function () {
  'use strict';
  const KEY = 'gacha-data-v1';
  const PALETTE = ['#E8483C', '#F2B705', '#2F7FE0', '#2EAA5C', '#EF6FA8', '#F07C1E', '#8A5BE0', '#16A3A3'];
  const MAX_DRAWS = 2000;

  const empty = () => ({ title: '', machineColor: '#D7372B', drawCount: 0, prizes: [], draws: [] });
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- data ---------- */
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const d = { ...empty(), ...JSON.parse(raw) };
      d.prizes = (d.prizes || []).slice().sort((a, b) => (a.order | 0) - (b.order | 0));
      return d;
    } catch (e) { return empty(); }
  }
  const listeners = [];
  function notify() { const d = read(); listeners.forEach(fn => fn(d)); }
  function write(d) {
    if (d.draws.length > MAX_DRAWS) d.draws = d.draws.slice(-MAX_DRAWS);
    localStorage.setItem(KEY, JSON.stringify(d));
    notify();
  }
  // Other tabs (e.g. the projector screen) hear about changes here.
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) notify(); });

  function subscribe(fn) { listeners.push(fn); fn(read()); }
  function update(mutator) { const d = read(); const r = mutator(d); write(d); return r; }

  function pickWeighted(prizes) {
    const pool = prizes.filter(p => (p.remaining | 0) > 0);
    const sum = pool.reduce((s, p) => s + p.remaining, 0);
    if (!sum) return null;
    let r = Math.random() * sum;
    for (const p of pool) { r -= p.remaining; if (r < 0) return p; }
    return pool[pool.length - 1];
  }

  function drawOnce(who) {
    return update(d => {
      const win = pickWeighted(d.prizes);
      if (!win) return null;
      win.remaining = (win.remaining | 0) - 1;
      d.drawCount = (d.drawCount | 0) + 1;
      const rec = { id: uid('d'), prizeId: win.id, prizeName: win.name, prizeColor: win.color || '', prizeImage: win.image || '', who: who || '', at: Date.now(), seq: d.drawCount };
      d.draws.push(rec);
      return rec;
    });
  }
  // Two tabs pressing at the same moment can't take the same last capsule.
  function draw(who) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('gacha-draw', () => drawOnce(who));
    return Promise.resolve(drawOnce(who));
  }

  /* ---------- images (IndexedDB) ---------- */
  let dbp = null;
  function idb() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('gacha-images', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('images');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const t = db.transaction('images', mode); const req = fn(t.objectStore('images'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const urlCache = new Map();
  const images = {
    async put(blob) { const id = uid('img'); await tx('readwrite', s => s.put(blob, id)); return id; },
    async get(id) { return tx('readonly', s => s.get(id)); },
    async del(id) { if (!id) return; const u = urlCache.get(id); if (u) { URL.revokeObjectURL(u); urlCache.delete(id); } try { await tx('readwrite', s => s.delete(id)); } catch (e) {} },
    async url(id) {
      if (!id) return '';
      if (urlCache.has(id)) return urlCache.get(id);
      const blob = await images.get(id);
      if (!blob) return '';
      const u = URL.createObjectURL(blob); urlCache.set(id, u); return u;
    },
    async allEntries() {
      const db = await idb();
      return new Promise((res, rej) => {
        const out = []; const t = db.transaction('images', 'readonly'); const c = t.objectStore('images').openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } };
        t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
      });
    },
    async clear() { urlCache.forEach(u => URL.revokeObjectURL(u)); urlCache.clear(); await tx('readwrite', s => s.clear()); }
  };

  // Downscale so pictures stay small and load instantly on the projector.
  function shrinkImage(file, max) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('無法處理這張圖片')), 'image/webp', .85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片，請換一個檔案')); };
      img.src = url;
    });
  }

  /* ---------- config files (export / import) ---------- */
  const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  // Only images that a prize still uses go into the file.
  async function exportBackup(name) {
    const data = read(); const used = new Set(data.prizes.map(p => p.image).filter(Boolean)); const imgs = {};
    for (const [k, v] of await images.allEntries()) if (used.has(k)) imgs[k] = await blobToDataUrl(v);
    return { app: 'gacha-lottery', version: 1, name: name || '', exportedAt: new Date().toISOString(), data, images: imgs };
  }
  function checkConfig(obj) {
    if (!obj || obj.app !== 'gacha-lottery' || !obj.data || !Array.isArray(obj.data.prizes)) throw new Error('這不是扭蛋抽獎的設定檔');
  }
  // reset: start the event fresh (every prize back to its original count, no draw history).
  async function importBackup(obj, opts) {
    checkConfig(obj);
    const reset = !!(opts && opts.reset);
    await images.clear();
    for (const [k, v] of Object.entries(obj.images || {})) {
      const blob = await (await fetch(v)).blob();
      await tx('readwrite', s => s.put(blob, k));
    }
    const d = { ...empty(), ...obj.data };
    if (reset) { d.prizes.forEach(p => { p.remaining = p.total | 0; }); d.draws = []; d.drawCount = 0; }
    write(d);
  }

  /* ---------- shared helpers ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(4, '0');
  const fmtTime = ms => new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const validColor = c => /^#[0-9a-f]{6}$/i.test(c || '');
  function colorOf(prize, prizes) {
    if (prize && validColor(prize.color)) return prize.color;
    const i = prize && prizes ? prizes.indexOf(prize) : 0;
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }
  function nextColor(prizes) {
    const used = new Set(prizes.map(p => (p.color || '').toLowerCase()));
    return PALETTE.find(c => !used.has(c.toLowerCase())) || PALETTE[prizes.length % PALETTE.length];
  }
  const capsuleHtml = c => `<span class="capsule" style="--c:${c}"><span class="top"></span><span class="bot"></span></span>`;
  // Picture of a prize: an <img> filled from IndexedDB by hydrateImages(), or a capsule when there is none.
  const picHtml = (imageId, color, alt) => imageId
    ? `<img data-img="${esc(imageId)}" data-fallback="${esc(color)}" alt="${esc(alt || '')}">`
    : capsuleHtml(color);
  function hydrateImages(root) {
    root.querySelectorAll('img[data-img]').forEach(async img => {
      const id = img.dataset.img; img.removeAttribute('data-img');
      let u = ''; try { u = await images.url(id); } catch (e) {}
      if (u) img.src = u;
      else { const t = document.createElement('span'); t.innerHTML = capsuleHtml(img.dataset.fallback); img.replaceWith(t.firstChild); }
    });
  }

  window.Gacha = {
    PALETTE, subscribe, read, update, draw, images, shrinkImage, exportBackup, importBackup, checkConfig,
    uid, esc, pad, fmtTime, validColor, colorOf, nextColor, capsuleHtml, picHtml, hydrateImages
  };
})();
