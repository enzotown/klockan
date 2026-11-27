/* Klockan — lär dig klockan med Marre. Barn 4–6 år (och uppåt).
   Två lekar: STÄLL (dra visarna till rätt tid) och LÄS (vilken av tre klockor är det?).
   Ingen text man måste kunna läsa, inget kan förloras, stjärnor är bara belöning. */

'use strict';

/* Skolappars kodsnutt: säger till katalogen när en omgång är klar (inga id:n, inga cookies) */
function skolKlar(pct) {
  try { if (window.skolappar && skolappar.event) skolappar.event('round_done', Math.max(0, Math.min(100, Math.round(pct)))); } catch (e) {}
}

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
let W = 0, H = 0, S_ = 1;

const BG = '#fdf3e7';
const INK = '#4a3f39';
const DIM = '#8d7c6c';
const HOUR_COL = '#4a3f39';
const MIN_COL = '#ef8f34';

const NUM = ['', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva', 'tolv'];

const MODES = [
  { id: 'stall', label: 'STÄLL', hint: 'Dra visarna dit tiden är!' },
  { id: 'las',   label: 'LÄS',   hint: 'Tryck på klockan som visar samma tid!' },
  { id: 'siffror', label: 'SIFFROR', hint: 'Vilken klocka visar samma tid som siffrorna?' }
];

const G = {
  mode: 'stall',
  level: 1,             // 1 = hela timmar, 2 = även halva
  task: { hour: 3, minute: 0 },
  hour: 12, minute: 0,  // visarna
  hourA: -Math.PI / 2,  // mjuk animation mot rätt läge
  minA: -Math.PI / 2,
  drag: null,           // 'hour' | 'min' | null
  options: [],          // för LÄS: [{hour, minute}, ...]
  picked: -1,
  stars: 0,
  streak: 0,
  right: 0,
  tries: 0,
  solved: 0,            // tidpunkten då uppgiften löstes
  shake: 0,
  celebrate: 0,
  taskAt: 0,
  sayAt: 0,
  hits: []
};

try { G.stars = parseInt(localStorage.getItem('klockan-stjarnor') || '0', 10) || 0; } catch (e) { G.stars = 0; }

/* ---------- ljud ---------- */
let actx = null, master = null;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { actx = new AC(); master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination); }
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, vol, type, slideTo) {
  if (!audio()) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.012);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.22);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.08);
}
function tickSound() { tone(1200, 0.03, 0.045, 'square'); }
function chime() {
  [523, 659, 784].forEach((f, k) => setTimeout(() => tone(f, 0.26, 0.13, 'triangle'), k * 85));
}
function nudge() { tone(300, 0.13, 0.10, 'sine', 240); }

/* ---------- röst ---------- */
let voiceOn = true;
function say(text) {
  /* rösten är en inspelad mp3-fil (Shipholm TTS) – saknas den är appen tyst */
  if (!text) return;
  if (window.__rost && window.__rost(text)) return;
}

/* ---------- tid som text ---------- */
function timeWord(hour, minute) {
  if (minute === 30) return 'halv ' + NUM[hour === 12 ? 1 : hour + 1];
  return NUM[hour];
}
function digital(hour, minute) {
  return hour + ':' + (minute === 0 ? '00' : '30');
}

/* ---------- layout ---------- */
function scaleNow() {
  return Math.min(Math.max(Math.sqrt(W * H) / 1000, 0.72), 1.22);
}

function resize() {
  W = Math.max(300, window.innerWidth);
  H = Math.max(320, window.innerHeight);
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  S_ = scaleNow();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function layout() {
  const s = S_ = scaleNow();
  const pad = 14 * s;
  const titleH = (H > W * 1.05 ? 54 : 46) * s;
  const tabH = Math.max(44, 46 * s);
  const top = pad + titleH + tabH + 8 * s;

  const nTabs = MODES.length;
  const gap = 10 * s;
  const tabW = Math.min((W - pad * 2 - gap * (nTabs - 1)) / nTabs, 230 * s);
  const totalW = tabW * nTabs + gap * (nTabs - 1);
  const tabs = MODES.map((m, i) => ({
    id: m.id, label: m.label,
    x: W / 2 - totalW / 2 + i * (tabW + gap),
    y: pad + titleH, w: tabW, h: tabH
  }));

  /* Skolappars hemknapp (Kotten) sitter nere till vänster: håll det hörnet fritt på smala skärmar */
  const kottenSkydd = W < 560 ? 84 : 0;
  const stage = { x: pad, y: top, w: W - pad * 2, h: H - top - pad - kottenSkydd };
  const taskH = 40 * s;
  const optH = G.mode !== 'stall' ? Math.min(186 * s, Math.max(112 * s, stage.h * 0.30)) : 0;
  const hintH = G.mode !== 'stall' ? 0 : 24 * s;
  const clockBox = {
    x: stage.x, y: stage.y + taskH + 4 * s,
    w: stage.w, h: stage.h - taskH - optH - hintH - 14 * s
  };
  const portrait = stage.h > stage.w * 1.05;
  const r = Math.max(52 * s, Math.min(clockBox.h * 0.5 - 12 * s, stage.w * (portrait ? 0.44 : 0.36), (portrait ? 340 : 260) * s));
  const cx = stage.x + stage.w / 2;
  const cy = clockBox.y + clockBox.h / 2;

  let options = [];
  if (G.mode !== 'stall') {
    const ow = Math.min(190 * s, (stage.w - 2 * 14 * s - 2 * 12 * s) / 3);
    const oy = stage.y + stage.h - optH - 6 * s;
    options = G.options.map((t, i) => ({
      i, hour: t.hour, minute: t.minute,
      x: stage.x + stage.w / 2 - (ow * 3 + 24 * s) / 2 + i * (ow + 12 * s),
      y: oy, w: ow, h: optH * 0.92
    }));
  }

  return { s, pad, titleH, tabs, stage, clockBox, cx, cy, r, taskH, options, hintH };
}

/* ---------- ritning ---------- */
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function font(px, weight) {
  ctx.font = (weight || 'bold') + ' ' + Math.round(px) + 'px "Trebuchet MS", Verdana, sans-serif';
}

function fitText(text, maxW, startPx, weight, minPx) {
  let px = startPx;
  for (;;) {
    font(px, weight);
    if (ctx.measureText(text).width <= maxW || px <= (minPx || 12)) break;
    px -= 1;
  }
  return px;
}

function star(cx, cy, r, col) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 ? r * 0.46 : r;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}

function drawHeader(L) {
  const s = L.s;
  font(26 * s, 'bold');
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('Klockan', L.pad + 2, L.pad + L.titleH / 2);

  const txt = '★ ' + G.stars;
  font(20 * s, 'bold');
  const w = ctx.measureText(txt).width + 26 * s;
  const h = 34 * s;
  const x = W - L.pad - w, y = L.pad + L.titleH / 2 - h / 2;
  ctx.fillStyle = '#fff6df';
  roundRect(x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(200,150,40,.35)'; ctx.lineWidth = 2 * s; ctx.stroke();
  ctx.fillStyle = '#c98a12'; ctx.textAlign = 'center';
  ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
}

function drawTabs(L) {
  const s = L.s;
  L.tabs.forEach((t) => {
    const on = G.mode === t.id;
    ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,.55)';
    roundRect(t.x, t.y, t.w, t.h, 14 * s); ctx.fill();
    ctx.strokeStyle = on ? '#ef8f34' : 'rgba(74,63,57,.12)';
    ctx.lineWidth = on ? 2.5 * s : 1.5 * s;
    roundRect(t.x, t.y, t.w, t.h, 14 * s); ctx.stroke();
    font(Math.min(19 * s, t.h * 0.44), 'bold');
    ctx.fillStyle = on ? INK : DIM;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2 + 1);
  });
}

function drawStage(L) {
  const s = L.s, st = L.stage;
  ctx.fillStyle = '#ffffff';
  roundRect(st.x, st.y, st.w, st.h, 22 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(74,63,57,.08)'; ctx.lineWidth = 2 * s;
  roundRect(st.x, st.y, st.w, st.h, 22 * s); ctx.stroke();

  // uppgiftsraden
  const solved = G.solved && performance.now() - G.solved < 1800;
  const taskTxt = G.mode === 'stall'
    ? (solved ? 'Rätt! ' + digital(G.task.hour, G.task.minute) : 'Ställ klockan på ' + timeWord(G.task.hour, G.task.minute))
    : G.mode === 'siffror'
      ? (solved ? 'Rätt! Det är ' + timeWord(G.task.hour, G.task.minute) : 'Vilken klocka visar samma tid?')
      : (solved ? 'Rätt! Det är ' + timeWord(G.task.hour, G.task.minute) : 'Läs klockan — tryck på samma tid!');
  const px = fitText(taskTxt, st.w - 32 * s, 26 * s, 'bold', 15);
  font(px, 'bold');
  ctx.fillStyle = solved ? '#2f8f6b' : INK;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(taskTxt, st.x + st.w / 2, st.y + L.taskH * 0.55);

  // klockan
  const shakeX = G.shake > 0 ? Math.sin(performance.now() / 28) * 7 * s * Math.min(1, G.shake) : 0;
  if (G.mode !== 'siffror') drawClock(L.cx + shakeX, L.cy, L.r, G.hourA, G.minA, true, s);

  if (G.mode === 'siffror') drawDigital(L, L.cx, L.cy, s);
  if (G.mode !== 'stall') drawOptions(L);
  else {
    font(14 * s, 'normal');
    ctx.fillStyle = 'rgba(74,63,57,.45)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(MODES[0].hint, st.x + st.w / 2, st.y + st.h - 10 * s);
  }
}

function drawClock(cx, cy, r, hourA, minA, numbers, s) {
  // urtavla
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf3'; ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.045); ctx.strokeStyle = '#e8d3b4'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.90, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(74,63,57,.10)'; ctx.lineWidth = Math.max(1, r * 0.012); ctx.stroke();

  // streck
  /* små urtavlor: hoppa över minutstrecken så att siffrorna syns bättre */
  const smatt = numbers && r < 62;
  for (let i = 0; i < (smatt ? 12 : 60); i++) {
    const a = -Math.PI / 2 + (i * (smatt ? Math.PI / 6 : Math.PI / 30));
    const big = smatt || i % 5 === 0;
    const r1 = r * (big ? 0.80 : 0.855), r2 = r * 0.885;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.strokeStyle = big ? 'rgba(74,63,57,.55)' : 'rgba(74,63,57,.22)';
    ctx.lineWidth = big ? Math.max(2, r * 0.022) : Math.max(1, r * 0.010);
    ctx.stroke();
  }

  // siffror
  if (numbers && r > 33) {
    const fs = Math.max(9, Math.min(r * 0.22, (2 * Math.PI * r * 0.80) / 12 * 0.80));
    font(fs, 'bold');
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let n = 1; n <= 12; n++) {
      const a = -Math.PI / 2 + (n * Math.PI) / 6;
      ctx.fillText(String(n), cx + Math.cos(a) * r * 0.685, cy + Math.sin(a) * r * 0.685);
    }
  }

  // visare: minutvisaren först, timvisaren ovanpå — annars försvinner timvisaren
  // helt bakom minutvisaren klockan tolv (och då kan barnet inte se den alls)
  const hand = (angle, len, width, col) => {
    ctx.lineCap = 'round';
    // vit kant runt visaren så att den syns även mot en annan visare
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * len * 0.12, cy - Math.sin(angle) * len * 0.12);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = width + Math.max(2, r * 0.022);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * len * 0.12, cy - Math.sin(angle) * len * 0.12);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  hand(minA, r * 0.76, Math.max(3.5, r * 0.052), MIN_COL);
  hand(hourA, r * 0.50, Math.max(5, r * 0.085), HOUR_COL);

  // nav
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.075, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf3'; ctx.fill();
  ctx.strokeStyle = 'rgba(74,63,57,.25)'; ctx.lineWidth = Math.max(2, r * 0.015); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.032, 0, Math.PI * 2);
  ctx.fillStyle = INK; ctx.fill();

  // grön ring när det blev rätt
  if (G.solved && performance.now() - G.solved < 1800) {
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.02, 0, Math.PI * 2);
    ctx.strokeStyle = '#6fbf85'; ctx.lineWidth = Math.max(4, r * 0.035); ctx.stroke();
  }
}

/* siffertavla: visar tiden som siffror, t.ex. 4:00 */
function drawDigital(L, cx, cy, s) {
  const w = Math.min(L.stage.w * 0.66, 440 * s);
  const h = Math.min(Math.max(96 * s, L.clockBox.h * 0.52), 200 * s);
  ctx.fillStyle = '#46514b';
  roundRect(cx - w / 2, cy - h / 2, w, h, 18 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(74,63,57,.18)'; ctx.lineWidth = 2 * s;
  roundRect(cx - w / 2, cy - h / 2, w, h, 18 * s); ctx.stroke();
  const txt = digital(G.task.hour, G.task.minute);
  const px = fitText(txt, w - 40 * s, h * 0.62, 'bold', 30);
  font(px, 'bold');
  ctx.fillStyle = '#fdf3e7';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, cx, cy + 2 * s);
}

function drawOptions(L) {
  const s = L.s;
  L.options.forEach((o) => {
    const ok = G.picked === o.i && G.solved;
    const bad = G.picked === o.i && !G.solved && G.shake > 0;
    ctx.fillStyle = ok ? '#e9f7ee' : '#fffaf3';
    roundRect(o.x, o.y, o.w, o.h, 16 * s); ctx.fill();
    ctx.strokeStyle = ok ? '#6fbf85' : bad ? '#e2705f' : 'rgba(74,63,57,.14)';
    ctx.lineWidth = (ok || bad) ? 3 * s : 1.8 * s;
    roundRect(o.x, o.y, o.w, o.h, 16 * s); ctx.stroke();

    const rr = Math.min(o.w, o.h) * 0.36;
    const cx = o.x + o.w / 2, cy = o.y + o.h * 0.44;
    const ha = -Math.PI / 2 + ((o.hour % 12) + o.minute / 60) * (Math.PI / 6);
    const ma = -Math.PI / 2 + o.minute * (Math.PI / 30);
    drawClock(cx, cy, rr, ha, ma, rr > 44, s);
  });
}

/* ---------- uppgifter ---------- */
function randInt(n) { return Math.floor(Math.random() * n); }

function newTask() {
  const minute = G.level >= 2 && Math.random() < 0.5 ? 30 : 0;
  let hour = 1 + randInt(12);
  for (let i = 0; i < 8 && hour === G.task.hour && minute === G.task.minute; i++) hour = 1 + randInt(12);
  G.task = { hour, minute };
  G.taskAt = performance.now();
  G.solved = 0;
  G.picked = -1;
  G.tries = 0;

  if (G.mode !== 'stall') {
    const opts = [{ hour, minute }];
    const used = new Set([hour]);
    while (opts.length < 3) {
      const h = 1 + randInt(12);
      if (used.has(h)) continue;
      used.add(h);
      opts.push({ hour: h, minute });
    }
    // blanda
    for (let i = opts.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
    }
    G.options = opts;
  } else {
    // börja inte på rätt tid – barnet ska flytta visarna
    G.hour = hour === 12 ? 6 : (hour % 12) + 1;
    G.minute = 0;
    G.hourA = -Math.PI / 2 + (G.hour % 12) * (Math.PI / 6);
    G.minA = -Math.PI / 2;
  }
  speakTask();
}

function speakTask() {
  G.sayAt = performance.now();
  if (G.mode === 'stall') say('Ställ klockan på ' + timeWord(G.task.hour, G.task.minute));
  else if (G.mode === 'siffror') say('Vilken klocka visar ' + timeWord(G.task.hour, G.task.minute) + '?');
  else say('Läs klockan! Tryck på den klocka som visar samma tid.');
}

function solvedNow() {
  G.solved = performance.now();
  skolKlar(((G.right % 6) + 1) / 6 * 100);
  G.stars++;
  G.right++;
  G.streak++;
  try { localStorage.setItem('klockan-stjarnor', String(G.stars)); } catch (e) {}
  chime();
  if (G.level === 1 && G.right >= 6) {
    G.level = 2;
    say('Vad duktig du är! Nu kommer halva timmar också.');
    G.celebrate = 1;
    setTimeout(() => { newTask(); }, 2200);
    return;
  }
  if (G.streak > 0 && G.streak % 5 === 0) {
    G.celebrate = 1;
    say('Fem rätt! Vad duktig du är!');
  } else {
    say(timeWord(G.task.hour, G.task.minute) + '!');
  }
  setTimeout(() => {
    if (G.mode === 'stall') newTask();
    else newTask();
  }, 1500);
}

function wrong() {
  G.streak = 0;
  G.shake = 1;
  nudge();
  say(G.mode === 'stall' ? 'Nästan! Den korta visaren visar timmen.' : 'Nästan! Titta på den korta visaren.');
}

/* ---------- interaktion ---------- */
function angleAt(x, y) {
  return Math.atan2(y - L_.cy, x - L_.cx);
}

function handFromPoint(x, y) {
  const dx = x - L_.cx, dy = y - L_.cy;
  const dist = Math.hypot(dx, dy);
  if (dist > L_.r * 1.15) return null;
  if (dist < L_.r * 0.14) return null;
  const a = Math.atan2(dy, dx);
  const near = (ang) => {
    let d = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return d;
  };
  const dHour = near(G.hourA), dMin = near(G.minA);
  const hourLen = L_.r * 0.50, minLen = L_.r * 0.76;
  // nära ytterkanten = minutvisaren, nära mitten = timvisaren
  if (dist > L_.r * 0.56) return 'min';
  if (dist < L_.r * 0.30) return 'hour';
  return dHour <= dMin ? 'hour' : 'min';
}

function setFromAngle(which, a) {
  // 12 = rakt upp
  const deg = ((a * 180 / Math.PI) + 90 + 360) % 360;
  if (which === 'hour') {
    // timvisaren lutar lite när det är halv – räkna bort det innan vi rundar
    const degH = ((deg - G.minute * 0.5) + 360) % 360;
    let h = Math.round(degH / 30) % 12;
    if (h === 0) h = 12;
    if (h !== G.hour) { G.hour = h; tickSound(); }
  } else {
    const allowed = G.level >= 2 ? [0, 30] : [0];
    let best = allowed[0], bestD = 999;
    allowed.forEach((m) => {
      const d = Math.min(Math.abs(deg - m * 6), 360 - Math.abs(deg - m * 6));
      if (d < bestD) { bestD = d; best = m; }
    });
    if (best !== G.minute) { G.minute = best; tickSound(); }
  }
}

function onDown(e) {
  const x = e.clientX, y = e.clientY;
  const h = hitTest(x, y);
  if (!h) return;
  if (e.preventDefault) e.preventDefault();
  audio();

  if (h.kind === 'tab') {
    if (G.mode !== h.id) {
      G.mode = h.id;
      G.drag = null;
      G.celebrate = 0;
      newTask();
      tone(520, 0.08, 0.08, 'triangle');
    }
    return;
  }
  if (h.kind === 'opt') {
    if (G.solved) return;
    G.picked = h.i;
    const t = G.options[h.i];
    if (t.hour === G.task.hour && t.minute === G.task.minute) solvedNow();
    else wrong();
    return;
  }
  if (h.kind === 'clock' && G.mode === 'stall' && !G.solved) {
    G.drag = handFromPoint(x, y) || 'min';
    setFromAngle(G.drag, angleAt(x, y));
  }
}

function onMove(e) {
  if (!G.drag) return;
  if (e.preventDefault) e.preventDefault();
  setFromAngle(G.drag, angleAt(e.clientX, e.clientY));
}

function onUp() {
  if (!G.drag) return;
  const wasHour = G.drag === 'hour';
  G.drag = null;
  if (G.solved) return;
  if (G.hour === G.task.hour && G.minute === G.task.minute) solvedNow();
  else if (G.hour === G.task.hour && G.task.minute === 30 && G.minute !== 30) {
    say('Och så den långa visaren ner till sex!');
  } else if (wasHour && G.minute !== G.task.minute) { /* låt barnet fortsätta med minutvisaren */ }
}

function hitTest(x, y) {
  for (const t of L_.tabs) if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return { kind: 'tab', id: t.id };
  for (const o of L_.options) if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return { kind: 'opt', i: o.i };
  if (Math.hypot(x - L_.cx, y - L_.cy) <= L_.r * 1.12) return { kind: 'clock' };
  return null;
}

/* ---------- animation ---------- */
function shortest(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}

let L_ = null;
let last = performance.now();

function update() {
  const targetH = -Math.PI / 2 + ((G.hour % 12) + G.minute / 60) * (Math.PI / 6);
  const targetM = -Math.PI / 2 + G.minute * (Math.PI / 30);
  G.hourA += (shortest(G.hourA, targetH) - G.hourA) * 0.28;
  G.minA += (shortest(G.minA, targetM) - G.minA) * 0.32;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 0.045);
  if (G.celebrate > 0) G.celebrate = Math.max(0, G.celebrate - 0.012);

  // påminnelse om barnet inte gör något på ett tag
  if (!G.solved && !G.drag && performance.now() - G.sayAt > 14000) speakTask();
}

window.__errs = window.__errs || [];

function draw(now) {
  try {
    last = now;
    if (Math.abs(window.innerWidth - W) > 1 || Math.abs(window.innerHeight - H) > 1) resize();
    update();
    G.hits = [];
    L_ = layout();

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    drawHeader(L_);
    drawTabs(L_);
    drawStage(L_);
    G.hits = L_.tabs.map((t) => ({ kind: 'tab', id: t.id, x: t.x, y: t.y, w: t.w, h: t.h }))
      .concat(L_.options.map((o) => ({ kind: 'opt', i: o.i, x: o.x, y: o.y, w: o.w, h: o.h })))
      .concat([{ kind: 'clock', x: L_.cx - L_.r, y: L_.cy - L_.r, w: L_.r * 2, h: L_.r * 2 }]);

    if (G.celebrate > 0) drawConfetti(L_);
  } catch (err) {
    window.__errs.push(String((err && err.message) || err));
    G.drag = null;
  }
  requestAnimationFrame(draw);
}

function drawConfetti(L) {
  const s = L.s, k = G.celebrate;
  const cols = ['#efc93d', '#ef6a5a', '#6fbf85', '#45b7d1', '#9b6bc9'];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + k * 2;
    const d = (1 - k) * 260 * s;
    const x = L.cx + Math.cos(a) * d, y = L.cy + Math.sin(a) * d * 0.8;
    ctx.globalAlpha = k;
    star(x, y, 9 * s, cols[i % cols.length]);
    ctx.globalAlpha = 1;
  }
}

/* ---------- start ---------- */
cv.addEventListener('pointerdown', onDown, { passive: false });
cv.addEventListener('pointermove', onMove, { passive: false });
cv.addEventListener('pointerup', onUp);
cv.addEventListener('pointercancel', onUp);
cv.addEventListener('pointerleave', onUp);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') G.drag = null; });

resize();
newTask();
requestAnimationFrame(draw);

/* ---------- testkrokar ---------- */
window.__kl = {
  state: () => ({
    mode: G.mode, level: G.level, task: { ...G.task }, hour: G.hour, minute: G.minute,
    solved: !!G.solved, stars: G.stars, streak: G.streak, right: G.right,
    options: G.options.map((o) => ({ ...o })), w: W, h: H, scale: S_
  }),
  hits: () => G.hits.map((h) => ({ ...h })),
  rects: () => ({ r: L_.r, cx: L_.cx, cy: L_.cy, stage: L_.stage, tabs: L_.tabs, options: L_.options }),
  setTask: (hour, minute) => { G.task = { hour, minute }; G.solved = 0; G.picked = -1; speakTask(); },
  setLevel: (n) => { G.level = n; newTask(); },
  setHands: (hour, minute) => { G.hour = hour; G.minute = minute; },
  answer: (i) => { const o = L_.options[i]; if (!o) return; G.picked = i; const t = G.options[i]; if (t.hour === G.task.hour && t.minute === G.task.minute) solvedNow(); else wrong(); },
  solve: () => { G.hour = G.task.hour; G.minute = G.task.minute; solvedNow(); },
  mode: (m) => { G.mode = m; newTask(); },
  newTask
};