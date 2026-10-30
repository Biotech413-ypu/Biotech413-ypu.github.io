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

  /* ---------- sound (synthesised with Web Audio, no audio files needed) ---------- */
  const Sound = (() => {
    let ctx = null, on = true;
    try { on = localStorage.getItem('gacha-sound') !== 'off'; } catch (e) {}
    // iPad / iPhone Safari: Web Audio is treated as "ambient" sound and is muted by silent mode.
    // Asking for the "playback" session (Safari 17+) makes it behave like a video's sound.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    function ac() {
      if (!on) return null;
      if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    // Safari only lets a page start sound from inside a tap, so unlock on the very first touch
    // anywhere on the page: start the audio engine, play one silent sample, and play a silent
    // <audio> clip (older iPadOS switches to "playback" this way, so silent mode no longer mutes it).
    let unlocked = false, silentEl = null;
    function silentWav() {
      const n = 2205, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 22050, true); v.setUint32(28, 44100, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    }
    function unlock() {
      if (!on) return;
      const c = ac(); if (!c) return;
      try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
      if (!silentEl) {
        try { silentEl = new Audio(silentWav()); silentEl.setAttribute('playsinline', ''); silentEl.loop = true; silentEl.volume = 0.01; } catch (e) {}
      }
      if (silentEl && silentEl.paused) { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); }
      if (c.state === 'running') unlocked = true;
    }
    ['pointerdown', 'touchend', 'mousedown', 'keydown'].forEach(ev =>
      document.addEventListener(ev, () => { if (!unlocked) unlock(); }, { capture: true, passive: true }));
    // Coming back to the tab (or after a phone call) Safari suspends audio again.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') unlocked = false; });
    let noise = null;
    function noiseBuf(c) {
      if (noise) return noise;
      noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return noise;
    }
    function click(t, freq, gain, dur, q) {
      const c = ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf(c); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 3;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(f).connect(g).connect(c.destination); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.02);
    }
    function tone(t, freq, dur, type, gain, endFreq) {
      const c = ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    return {
      get on() { return on; },
      set(v) { on = v; try { localStorage.setItem('gacha-sound', v ? 'on' : 'off'); } catch (e) {} if (v) { unlocked = false; unlock(); } else if (silentEl) silentEl.pause(); },
      // Ratchet of the crank plus capsules clattering in the dome.
      crank(ms) {
        if (!ac()) return; const t0 = ctx.currentTime + 0.02, sec = ms / 1000;
        for (let i = 0; i < 16; i++) { const t = t0 + (i / 16) * sec * 0.75; click(t, 2600 + Math.random() * 500, 0.5, 0.03, 6); click(t + 0.006, 1200, 0.2, 0.04, 2); }
        for (let i = 0; i < 26; i++) click(t0 + Math.random() * sec, 1400 + Math.random() * 2200, 0.16 + Math.random() * 0.12, 0.05, 5);
      },
      // Capsule landing in the chute: a hollow plastic knock and two small bounces.
      drop() {
        if (!ac()) return; const t = ctx.currentTime + 0.02;
        [[0, 1], [0.17, 0.5], [0.28, 0.25]].forEach(([dt, k]) => { tone(t + dt, 230, 0.16, 'sine', 0.45 * k, 90); click(t + dt, 1800, 0.35 * k, 0.04, 4); });
      },
      // Small rattles while the capsule wobbles.
      rattle() {
        if (!ac()) return; const t0 = ctx.currentTime;
        [0.1, 0.2, 0.75, 0.88, 1.2, 1.3, 1.4, 1.5].forEach(dt => click(t0 + dt, 2000 + Math.random() * 1500, 0.22, 0.04, 5));
      },
      // The two halves popping apart, then a little fanfare.
      pop() {
        if (!ac()) return; const t = ctx.currentTime + 0.01;
        click(t, 3200, 0.7, 0.09, 1.5); tone(t, 320, 0.18, 'triangle', 0.3, 1100);
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + 0.12 + i * 0.09, f, i === 3 ? 0.7 : 0.2, 'triangle', 0.16));
        [1318.5, 1567.98].forEach((f, i) => tone(t + 0.5 + i * 0.07, f, 0.5, 'sine', 0.06));
      }
    };
  })();
  function syncSoundBtn() {
    const b = $('#sound-btn'); b.setAttribute('aria-pressed', String(Sound.on));
    $('#sound-label').textContent = Sound.on ? '音效開' : '音效關';
    b.querySelector('.wave').toggleAttribute('hidden', !Sound.on);
    b.querySelector('.mute').toggleAttribute('hidden', Sound.on);
  }

  /* ---------- machine colour ---------- */
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16); const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    const L = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255);
    return L > 0.4 ? '#1B2422' : '#FFFFFF';
  }
  function applyMachineColor(c) {
    const color = G.validColor(c) ? c : '#D7372B';
    const st = document.documentElement.style;
    st.setProperty('--machine', color); st.setProperty('--machine-deep', shade(color, 0.72)); st.setProperty('--machine-ink', inkFor(color));
  }

  /* ---------- capsules bouncing in the dome ---------- */
  // Performance notes (Safari / iPad):
  //  - physics runs at a fixed 60 steps per second, so 120 Hz iPads don't do double the work;
  //  - each capsule colour is drawn once into a small sprite and then just stamped;
  //  - the loop stops as soon as the capsules settle (and never runs longer than a few seconds),
  //    so an idle machine costs nothing.
  const dome = (() => {
    const cv = $('#dome-canvas'), ctx = cv.getContext('2d');
    let W = 0, R = 0, r = 0, dpr = 1, balls = [], raf = 0, shaking = 0, still = 0, wokeAt = 0, last = 0, acc = 0;
    const sprites = new Map();
    function sprite(color) {
      const key = color + '|' + r + '|' + dpr;
      if (sprites.has(key)) return sprites.get(key);
      const size = Math.ceil((r * 2 + 4) * dpr), c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(r + 2, r + 2);
      x.beginPath(); x.arc(0, 0, r, Math.PI, 0); x.closePath(); x.fillStyle = color; x.fill();
      x.beginPath(); x.arc(0, 0, r, 0, Math.PI); x.closePath(); x.fillStyle = '#F3F4F0'; x.fill();
      x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.lineWidth = 1.5; x.strokeStyle = 'rgba(0,0,0,.25)'; x.stroke();
      x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.strokeStyle = 'rgba(0,0,0,.18)'; x.stroke();
      x.beginPath(); x.arc(-r * .35, -r * .45, r * .22, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.55)'; x.fill();
      sprites.set(key, c); return c;
    }
    function size() {
      const rect = cv.getBoundingClientRect();
      if (!rect.width) return;
      const oldR = R;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width; cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = W / 2; r = Math.max(10, Math.round(W * 0.075));
      sprites.clear();
      if (oldR) { const k = R / oldR; balls.forEach(b => { b.x *= k; b.y *= k; }); }
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
      let changed = false;
      for (const [color, n] of have) { let extra = n - (want.get(color) || 0); if (extra > 0) changed = true; balls = balls.filter(b => !(b.color === color && extra-- > 0)); }
      for (const [color, n] of want) for (let k = (have.get(color) || 0); k < n; k++) {
        changed = true;
        balls.push({ x: R + (Math.random() - .5) * R, y: R * 0.4 * Math.random() + r, vx: (Math.random() - .5) * 2, vy: 0, r, color, a: Math.random() * 6.28 });
      }
      if (changed) wake(); else if (!raf) draw();
    }
    function wake() { still = 0; wokeAt = performance.now(); if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); } }
    function shake(ms) { shaking = performance.now() + ms; wake(); }
    function physics(isShaking) {
      const g = 0.35;
      for (const b of balls) {
        if (isShaking && Math.random() < 0.25) { b.vx += (Math.random() - .5) * 6; b.vy -= Math.random() * 6; }
        b.vy += g; b.x += b.vx; b.y += b.vy; b.vx *= 0.99; b.vy *= 0.995; b.a += b.vx * 0.04;
        const dx = b.x - R, dy = b.y - R, d = Math.hypot(dx, dy) || 0.01, lim = R - b.r - 2;
        if (d > lim) {
          const nx = dx / d, ny = dy / d; b.x = R + nx * lim; b.y = R + ny * lim;
          const vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; b.vx *= 0.85; b.vy *= 0.85; }
        }
      }
      const n = balls.length;
      for (let it = 0; it < 2; it++) for (let i = 0; i < n; i++) {
        const a = balls[i];
        for (let j = i + 1; j < n; j++) {
          const c = balls[j], dx = c.x - a.x, dy = c.y - a.y, min = a.r + c.r;
          if (dx > min || dx < -min || dy > min || dy < -min) continue;
          const d2 = dx * dx + dy * dy; if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, o = (min - d) / 2;
          a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
          const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rv < 0) { const imp = -0.55 * rv; a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny; }
        }
      }
    }
    function frame(t) {
      raf = 0; if (!W) return;
      const now = performance.now(), isShaking = now < shaking && !reduceMotion;
      const dt = last ? Math.min(100, t - last) : 16.67; last = t; acc += dt;
      let steps = 0;
      while (acc >= 16.67 && steps < 4) { physics(isShaking); acc -= 16.67; steps++; }
      if (steps) draw();
      let maxV = 0; for (const b of balls) maxV = Math.max(maxV, Math.abs(b.vx), Math.abs(b.vy));
      still = (!isShaking && maxV < 0.9) ? still + steps : 0;
      const tooLong = !isShaking && now - Math.max(wokeAt, shaking) > 3500;
      if (still > 45 || tooLong || !balls.length) { balls.forEach(b => { b.vx = 0; b.vy = 0; }); draw(); return; }
      raf = requestAnimationFrame(frame);
    }
    function draw() {
      ctx.clearRect(0, 0, W, W);
      for (const b of balls) {
        const img = sprite(b.color), h = img.width / dpr / 2;
        const cos = Math.cos(b.a), sin = Math.sin(b.a);
        ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, b.x * dpr, b.y * dpr);
        ctx.drawImage(img, -h, -h, h * 2, h * 2);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } });
    return { setTargets, shake };
  })();

  /* ---------- confetti ---------- */
  function confetti(mainColor) {
    if (reduceMotion) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d'); const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const colors = [mainColor, mainColor, ...G.PALETTE, '#FFFFFF'];
    const cx = W / 2, cy = Math.min(H * 0.38, 260);
    const parts = Array.from({ length: 110 }, () => {
      const ang = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      return { x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 5, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[(Math.random() * colors.length) | 0] };
    });
    const t0 = performance.now(); let last = t0;
    (function frame(t) {
      const age = t - t0, k = Math.min(3, (t - last) / 16.67) || 1; last = t;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = Math.max(0, 1 - age / 3000);
      for (const p of parts) {
        p.vy += 0.22 * k; p.vx *= Math.pow(0.985, k); p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
        if (p.y > H + 20) continue;
        const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
        ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, p.x * dpr, p.y * dpr);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      }
      ctx.globalAlpha = 1;
      if (age < 3000 && !$('#reveal').hidden) requestAnimationFrame(frame);
      else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }
    })(t0);
  }

  /* ---------- light rays behind the prize: painted once, then only rotated ---------- */
  function paintRays(color) {
    const el = document.querySelector('.rays'); if (!el) return;
    const S = 620, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), m = S / 2;
    x.translate(m, m); x.fillStyle = color; x.globalAlpha = 0.55;
    for (let i = 0; i < 15; i++) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, m, (i * 24) * Math.PI / 180, (i * 24 + 10) * Math.PI / 180); x.closePath(); x.fill(); }
    x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in';
    const g = x.createRadialGradient(0, 0, 0, 0, 0, m); g.addColorStop(0, '#000'); g.addColorStop(0.18, '#000'); g.addColorStop(0.68, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(-m, -m, S, S);
    el.style.backgroundImage = `url(${c.toDataURL()})`;
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
    applyMachineColor(data.machineColor);
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

  }

  /* ---------- turning the knob ---------- */
  let knobAngle = 0;
  async function turn() {
    if (busy || revealing || totalLeft() <= 0) return;
    busy = true; showMsg(''); render();
    knobAngle += 360; $('#knob').style.transform = `rotate(${knobAngle}deg)`;
    if (!reduceMotion) $('#dome').classList.add('shake');
    dome.shake(1500);
    Sound.crank(1500);
    const t0 = performance.now();
    try {
      const rec = await G.draw('');
      const wait = 1500 - (performance.now() - t0); if (wait > 0) await sleep(wait);
      $('#dome').classList.remove('shake');
      if (!rec) { showMsg('扭蛋已經扭完了。'); return; }
      const c = G.validColor(rec.prizeColor) ? rec.prizeColor : colorById(rec.prizeId);
      const out = $('#cap-out');
      $('#cap-out-capsule').style.setProperty('--c', c);
      out.hidden = false; out.classList.remove('drop'); void out.offsetWidth; out.classList.add('drop');
      setTimeout(() => Sound.drop(), reduceMotion ? 0 : 450);
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
    paintRays(color);
    $('#big-cap').querySelector('.capsule').style.setProperty('--c', color);
    const pic = $('#prize-pic');
    pic.innerHTML = G.picHtml(rec.prizeImage, color, rec.prizeName);
    G.hydrateImages(pic);
    $('#prize-name').textContent = rec.prizeName;
    $('#prize-sub').textContent = '第 ' + G.pad(rec.seq) + ' 顆';
    $('#cap-out').hidden = true;
    opened = false;
    rv.className = 'reveal'; rv.hidden = false;
    $('#big-cap').focus();
    if (reduceMotion) { openCapsule(); return; }
    requestAnimationFrame(() => {
      rv.classList.add('in');
      setTimeout(() => { if (!opened) { rv.classList.remove('in'); rv.classList.add('wobble'); Sound.rattle(); } }, 650);
      openTimer = setTimeout(openCapsule, 650 + 1700);
    });
  }
  function openCapsule() {
    if (opened || $('#reveal').hidden) return;
    opened = true; clearTimeout(openTimer);
    const rv = $('#reveal');
    rv.classList.remove('in', 'wobble'); rv.classList.add('opened');
    Sound.pop();
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
  $('#sound-btn').addEventListener('click', () => { Sound.set(!Sound.on); syncSoundBtn(); });
  syncSoundBtn();
  G.subscribe(d => { data = d; render(); });
})();
