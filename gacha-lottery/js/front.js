/* 扭蛋抽獎 — 前台扭蛋機 */
(function () {
  'use strict';
  const G = window.Gacha;
  const $ = s => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let data = G.read();
  let busy = false, revealing = false;

  const totalLeft = () => data.prizes.reduce((s, p) => s + Math.max(0, p.remaining | 0), 0);
  const colorById = id => { const p = data.prizes.find(x => x.id === id); return G.colorOf(p, data.prizes); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function showMsg(text, isErr) { const el = $('#draw-msg'); el.textContent = text; el.classList.toggle('err', !!isErr); }

  /* ---------- capsules bouncing in the dome ---------- */
  const dome = (() => {
    const cv = $('#dome-canvas'), ctx = cv.getContext('2d');
    let W = 0, R = 0, r = 0, balls = [], asleep = 0, raf = 0, shaking = 0;
    function size() {
      const rect = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      if (!rect.width) return;
      W = rect.width; cv.width = W * dpr; cv.height = W * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = W / 2; r = Math.max(10, W * 0.075);
      balls.forEach(b => b.r = r); wake();
    }
    new ResizeObserver(size).observe(cv);
    function setTargets(counts) {
      const total = counts.reduce((s, c) => s + c.n, 0);
      const cap = 34, want = new Map();
      if (total > 0) {
        const room = Math.min(cap, total);
        const scaled = counts.map(c => ({ color: c.color, n: c.n > 0 ? Math.max(1, Math.round(c.n / total * room)) : 0 }));
        let sum = scaled.reduce((s, c) => s + c.n, 0);
        while (sum > room) { const big = scaled.reduce((a, b) => b.n > a.n ? b : a); big.n--; sum--; }
        scaled.forEach(c => want.set(c.color, (want.get(c.color) || 0) + c.n));
      }
      const have = new Map(); balls.forEach(b => have.set(b.color, (have.get(b.color) || 0) + 1));
      for (const [color, n] of have) { let extra = n - (want.get(color) || 0); balls = balls.filter(b => !(b.color === color && extra-- > 0)); }
      for (const [color, n] of want) for (let k = (have.get(color) || 0); k < n; k++)
        balls.push({ x: R + (Math.random() - .5) * R, y: R * 0.4 * Math.random() + r, vx: (Math.random() - .5) * 2, vy: 0, r, color, a: Math.random() * 6.28 });
      wake();
    }
    function wake() { asleep = 0; if (!raf) raf = requestAnimationFrame(step); }
    function shake(ms) { shaking = performance.now() + ms; wake(); }
    function step() {
      raf = 0; if (!W) return;
      const g = 0.35, isShaking = performance.now() < shaking && !reduceMotion;
      for (const b of balls) {
        if (isShaking && Math.random() < 0.25) { b.vx += (Math.random() - .5) * 6; b.vy -= Math.random() * 6; }
        b.vy += g; b.x += b.vx; b.y += b.vy; b.vx *= 0.995; b.a += b.vx * 0.04;
        const dx = b.x - R, dy = b.y - R, d = Math.hypot(dx, dy) || 0.01, lim = R - b.r - 2;
        if (d > lim) {
          const nx = dx / d, ny = dy / d; b.x = R + nx * lim; b.y = R + ny * lim;
          const vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.vx *= 0.9; }
        }
      }
      for (let it = 0; it < 3; it++) for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], c = balls[j]; const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + c.r;
        if (d < min) {
          const nx = dx / d, ny = dy / d, o = (min - d) / 2;
          a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
          const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rv < 0) { const imp = -0.6 * rv; a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny; }
        }
      }
      draw();
      const energy = balls.reduce((s, b) => s + b.vx * b.vx + b.vy * b.vy, 0) / Math.max(1, balls.length);
      asleep = (energy < 0.6 && !isShaking) ? asleep + 1 : 0;
      if (asleep < 90) raf = requestAnimationFrame(step);
    }
    function draw() {
      ctx.clearRect(0, 0, W, W);
      for (const b of balls) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.beginPath(); ctx.arc(0, 0, b.r, Math.PI, 0); ctx.closePath(); ctx.fillStyle = b.color; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI); ctx.closePath(); ctx.fillStyle = '#F3F4F0'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-b.r, 0); ctx.lineTo(b.r, 0); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(-b.r * .35, -b.r * .45, b.r * .22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
        ctx.restore();
      }
    }
    return { setTargets, shake };
  })();

  /* ---------- confetti ---------- */
  function confetti(mainColor) {
    if (reduceMotion) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = [mainColor, mainColor, ...G.PALETTE, '#FFFFFF'];
    const cx = W / 2, cy = Math.min(H * 0.38, 260);
    const parts = Array.from({ length: 160 }, () => {
      const ang = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      return { x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 5, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[(Math.random() * colors.length) | 0] };
    });
    const t0 = performance.now();
    (function frame(t) {
      const age = t - t0; ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 3200); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2))); ctx.restore();
      }
      if (age < 3200 && !$('#reveal').hidden) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  /* ---------- render ---------- */
  function setHint() {
    const left = totalLeft();
    let t;
    if (busy) t = '喀啦喀啦…';
    else if (!data.prizes.length) t = '扭蛋機還沒放入獎品，請先到後台新增';
    else if (left <= 0) t = '扭蛋都被扭完了，感謝參與！';
    else t = '轉動旋鈕扭一顆';
    $('#hint').textContent = t;
  }

  function render() {
    const title = data.title || '扭蛋抽獎';
    $('#title').textContent = title; document.title = title;
    const left = totalLeft();
    $('#left-count').textContent = left;
    $('#knob').disabled = busy || revealing || left <= 0;
    const kinds = data.prizes.filter(p => p.remaining > 0).length;
    $('#kinds-count').textContent = data.prizes.length ? `${kinds} 種可扭` : '';
    setHint();
    dome.setTargets(data.prizes.map(p => ({ color: G.colorOf(p, data.prizes), n: Math.max(0, p.remaining | 0) })));

    const sc = $('#showcase');
    sc.innerHTML = data.prizes.length ? data.prizes.map(p => {
      const rm = Math.max(0, p.remaining | 0), c = G.colorOf(p, data.prizes);
      return `<li class="prize-card ${rm ? '' : 'out'}" style="--c:${c}"><div class="pic">${G.picHtml(p.image, c, p.name)}</div><div class="meta"><span class="nm">${G.esc(p.name)}</span><span class="ct">剩 <b>${rm}</b> / ${p.total | 0}</span></div></li>`;
    }).join('') : '<li class="empty">還沒有獎品。</li>';
    G.hydrateImages(sc);

    const recent = data.draws.slice(-8).reverse();
    $('#log-front').innerHTML = recent.length ? recent.map(d => {
      const c = G.validColor(d.prizeColor) ? d.prizeColor : colorById(d.prizeId);
      return `<li><span class="n">#${G.pad(d.seq | 0)}</span><span class="dot" style="--c:${c}"></span><span class="p">${G.esc(d.prizeName)}${d.who ? ` <small>· ${G.esc(d.who)}</small>` : ''}</span><span class="t">${G.fmtTime(d.at)}</span></li>`;
    }).join('') : '<li class="empty">還沒有人扭到。</li>';
    $('#log-count').textContent = data.drawCount ? `共 ${data.drawCount} 顆` : '';
  }

  /* ---------- turning the knob ---------- */
  let knobAngle = 0;
  async function turn() {
    if (busy || revealing || totalLeft() <= 0) return;
    const who = $('#who').value.trim();
    busy = true; showMsg(''); render();
    knobAngle += 360; $('#knob').style.transform = `rotate(${knobAngle}deg)`;
    if (!reduceMotion) $('#dome').classList.add('shake');
    dome.shake(1500);
    const t0 = performance.now();
    try {
      const rec = await G.draw(who);
      const wait = 1500 - (performance.now() - t0); if (wait > 0) await sleep(wait);
      $('#dome').classList.remove('shake');
      if (!rec) { showMsg('扭蛋已經扭完了。'); return; }
      const c = G.validColor(rec.prizeColor) ? rec.prizeColor : colorById(rec.prizeId);
      const out = $('#cap-out');
      $('#cap-out-capsule').style.setProperty('--c', c);
      out.hidden = false; out.classList.remove('drop'); void out.offsetWidth; out.classList.add('drop');
      $('#who').value = '';
      revealing = true;
      await sleep(reduceMotion ? 200 : 900);
      startReveal(rec, c);
    } catch (err) {
      $('#dome').classList.remove('shake');
      showMsg('這次沒扭成功，獎品數量沒有變動，請再轉一次。（' + (err && err.message || 'error') + '）', true);
    } finally {
      busy = false; render();
    }
  }

  /* ---------- opening animation ---------- */
  let openTimer = null, opened = false;
  function startReveal(rec, color) {
    const rv = $('#reveal');
    rv.style.setProperty('--c', color);
    $('#big-cap').querySelector('.capsule').style.setProperty('--c', color);
    const pic = $('#prize-pic');
    pic.innerHTML = G.picHtml(rec.prizeImage, color, rec.prizeName);
    G.hydrateImages(pic);
    $('#prize-name').textContent = rec.prizeName;
    $('#prize-sub').textContent = (rec.who ? rec.who + ' · ' : '') + '第 ' + G.pad(rec.seq) + ' 顆';
    $('#cap-out').hidden = true;
    opened = false;
    rv.className = 'reveal'; rv.hidden = false;
    $('#big-cap').focus();
    if (reduceMotion) { openCapsule(); return; }
    requestAnimationFrame(() => {
      rv.classList.add('in');
      setTimeout(() => { if (!opened) { rv.classList.remove('in'); rv.classList.add('wobble'); } }, 650);
      openTimer = setTimeout(openCapsule, 650 + 1700);
    });
  }
  function openCapsule() {
    if (opened || $('#reveal').hidden) return;
    opened = true; clearTimeout(openTimer);
    const rv = $('#reveal');
    rv.classList.remove('in', 'wobble'); rv.classList.add('opened');
    confetti(rv.style.getPropertyValue('--c') || G.PALETTE[0]);
    setTimeout(() => $('#reveal-close').focus(), 500);
  }
  function closeReveal() {
    if (!opened) { openCapsule(); return; }
    $('#reveal').hidden = true; $('#reveal').className = 'reveal';
    revealing = false; render(); $('#knob').focus();
  }

  /* ---------- boot ---------- */
  $('#knob').addEventListener('click', turn);
  $('#big-cap').addEventListener('click', openCapsule);
  $('#big-cap').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCapsule(); } });
  $('#reveal-close').addEventListener('click', closeReveal);
  $('#reveal').addEventListener('click', e => { if (e.target.id === 'reveal') closeReveal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#reveal').hidden) closeReveal(); });
  $('#who-form').addEventListener('submit', e => { e.preventDefault(); turn(); });
  G.subscribe(d => { data = d; render(); });
})();
