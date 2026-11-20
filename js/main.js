
/* ==========================================================================
   LISTENERS SURVIVAL — SATELLITE INTELLIGENCE NETWORK
   ========================================================================== */

// SHA-256 of the normalised designation (trimmed, upper-case). The plain
// text is not stored in the page, and zone data is only fetched after a match.
const DESIGNATION_HASH = '1dc316c29ea0d3a29d294accf4f0d4ea30328c26c275bdd61162366127c66fbd';

const $ = (s, r = document) => r.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, l = 2) => String(n).padStart(l, '0');
const rand = (a, b) => a + Math.random() * (b - a);
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const body = document.body;
const setStage = (s) => {
  body.classList.remove('stage-globe', 'stage-zoom', 'stage-map');
  body.classList.add('stage-' + s);
};

/* ---------- system log ---------- */
const logEl = $('#log');
function log(msg, cls = '') {
  const d = new Date();
  const row = document.createElement('div');
  if (cls) row.className = cls;
  row.innerHTML = `<span class="t">[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]</span> `;
  row.append(document.createTextNode(msg));
  logEl.append(row);
  while (logEl.children.length > 10) logEl.firstChild.remove();
}

/* ---------- text helpers ---------- */
async function type(container, text, { cls = '', cps = 55, caret = true } = {}) {
  const line = document.createElement('div');
  line.className = 'line ' + cls;
  container.append(line);
  window.SFX && SFX.line();
  if (caret) line.classList.add('caret');
  if (reduceMotion) cps = 1e4;
  const delay = 1000 / cps;
  for (let i = 1; i <= text.length; i++) {
    line.textContent = text.slice(0, i);
    if (i % 2 === 0 || text.length < 20) await sleep(delay);
  }
  line.classList.remove('caret');
  return line;
}

async function decrypt(el, final, ms = 1400) {
  window.SFX && SFX.sweep(ms / 1000);
  const glyphs = '0123456789ABCDEF#%&@$/\\';
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const fixed = Math.floor(p * final.length);
      let out = final.slice(0, fixed);
      for (let i = fixed; i < final.length; i++) out += final[i] === ' ' ? ' ' : glyphs[Math.floor(Math.random() * glyphs.length)];
      el.textContent = out;
      p < 1 ? requestAnimationFrame(tick) : resolve();
    };
    tick();
  });
}

/* ---------- screen effects ---------- */
function glitch(ms = 500, heavy = false) {
  window.SFX && SFX.glitch();
  body.classList.add('glitch');
  if (heavy) body.classList.add('glitch-heavy');
  $('#flash').classList.remove('on');
  void $('#flash').offsetWidth;
  $('#flash').classList.add('on');
  setTimeout(() => body.classList.remove('glitch', 'glitch-heavy'), ms);
}

// film grain
{
  const c = $('#noise');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  const draw = () => {
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v * 0.4;
      img.data[i + 1] = v;
      img.data[i + 2] = v * 0.5;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  draw();
  if (!reduceMotion) setInterval(draw, 110);
}

// cursor
{
  const cur = $('#cursor');
  window.addEventListener('pointermove', (e) => {
    cur.classList.add('on');
    cur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    cur.classList.toggle('hot', !!e.target.closest?.('button, a, input, .zone-card, .leaflet-marker-icon, .img-frame.big'));
  });
  window.addEventListener('pointerdown', () => cur.classList.add('down'));
  window.addEventListener('pointerup', () => cur.classList.remove('down'));
  document.addEventListener('pointerleave', () => cur.classList.remove('on'));
}

/* ---------- sound ---------- */
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => SFX.start(), { once: true }));
{
  const el = document.getElementById('designation');
  el.addEventListener('input', () => SFX.key());
}
$('#sound-toggle').addEventListener('click', (e) => {
  SFX.start();
  const on = SFX.toggle();
  e.currentTarget.textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
  e.currentTarget.setAttribute('aria-pressed', String(on));
});

document.addEventListener('pointerover', (e) => {
  const t = e.target.closest?.('button, .zone-card');
  if (t && !t.disabled && t !== document.__lastHover) { document.__lastHover = t; SFX.hover(); }
});
document.addEventListener('pointerout', (e) => { if (e.target.closest?.('button, .zone-card') === document.__lastHover) document.__lastHover = null; });
document.addEventListener('click', (e) => { if (e.target.closest?.('button')) SFX.click(); });

/* ---------- globe ---------- */
let globe;
try {
  globe = createGlobe($('#globe'), $('#sat-labels'));
} catch (err) {
  console.error('WebGL unavailable, running in map-only mode.', err);
  const noop = () => {};
  globe = {
    ready: Promise.resolve(), onFrame: noop, setActive: noop, setInteractive: noop, setWatcherLabel: noop, setComm: () => Promise.resolve(),
    spinToward: () => Promise.resolve(), flyIn: (_a, ms, cb) => sleep(ms).then(() => cb && cb(1, 1)),
    getSubPoint: () => ({ lat: 0, lon: 0 }), getTargetScreen: () => null, dist: 3.6,
  };
}

/* ---------- ambient HUD ---------- */
const bars = $('#bars');
for (let i = 0; i < 14; i++) bars.append(document.createElement('i'));
const stat = { obj: 24310, pkt: 0 };
let linked = false;
function hudTick() {
  const d = new Date();
  $('#st-utc').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  stat.obj += Math.floor(rand(-3, 4));
  stat.pkt += Math.floor(rand(40, 900)) * (linked ? 6 : 1);
  $('#st-obj').textContent = pad(stat.obj, 5);
  $('#st-pkt').textContent = pad(stat.pkt, 7);
  const base = linked ? 0.8 : 0.35;
  [...bars.children].forEach((b, i) => (b.style.height = Math.max(4, (base + rand(-0.25, 0.2)) * 34 * (0.5 + i / 20)) + 'px'));
  const p = globe.getSubPoint();
  $('#st-lat').textContent = `${Math.abs(p.lat).toFixed(3)}° ${p.lat >= 0 ? 'N' : 'S'}`;
  $('#st-lon').textContent = `${Math.abs(p.lon).toFixed(3)}° ${p.lon >= 0 ? 'E' : 'W'}`;
  $('#st-alt').textContent = Math.max(0, (globe.dist - 1) * 6371).toFixed(0) + ' KM';
  $('#tiny-block').textContent = `${hex(16)} ${hex(16)} ${hex(16)} ${hex(16)}`;
}
setInterval(hudTick, 600);
hudTick();

const ambient = [
  'TRACKING 24310 ORBITAL OBJECTS',
  'CARRIER LOCK STABLE',
  'ATMOSPHERIC INTERFERENCE: LOW',
  'KEY ROTATION COMPLETE',
  'RELAY NODE 7 RESPONDING',
  'GROUND STATION HANDSHAKE OK',
  'PERIMETER SCAN: NO ANOMALIES',
];
setInterval(() => {
  if (!body.classList.contains('stage-zoom')) log(ambient[Math.floor(Math.random() * ambient.length)]);
}, 5200);

/* ---------- boot sequence ---------- */
const bootEl = $('#boot');
const authForm = $('#auth');
const input = $('#designation');

async function boot() {
  log('TERMINAL POWER ON');
  const lines = [
    ['SECURE SATELLITE ACCESS TERMINAL', ''],
    ['SATELLITE INTELLIGENCE SYSTEM  v7.2.1', ''],
    ['ESTABLISHING ENCRYPTED CONNECTION...', ''],
    ['HANDSHAKE ............ [OK]', 'ok'],
    ['KEY EXCHANGE ......... [OK]', 'ok'],
    ['ORBITAL TRACKING FEED  [ONLINE]', 'ok'],
    ['AWAITING SATELLITE IDENTIFICATION', ''],
  ];
  for (const [t, c] of lines) await type(bootEl, t, { cls: c, cps: 70 });
  await Promise.race([globe.ready, sleep(5000)]);
  await sleep(350);
  bootEl.classList.add('done');
  authForm.hidden = false;
  $('#st-link').textContent = 'AWAITING ID';
  log('AWAITING SATELLITE DESIGNATION', 'hl');
  input.focus();
}

/* ---------- authentication ---------- */
let locked = false;
let failures = 0;

// Minimal SHA-256 fallback for browsers without crypto.subtle.
function sha256Hex(str) {
  const K = [];
  const H = [];
  const isP = (n) => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  for (let c = 2, n = 0; n < 64; c++) if (isP(c)) {
    if (n < 8) H[n] = (Math.pow(c, 0.5) * 4294967296) | 0;
    K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
  }
  const bytes = [...new TextEncoder().encode(str)];
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 255);
  const rr = (v, n) => (v >>> n) | (v << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => (H[i] = (H[i] + v) | 0));
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

async function matches(value) {
  const norm = value.trim().toUpperCase();
  if (!norm) return false;
  if (!window.crypto?.subtle) return sha256Hex(norm) === DESIGNATION_HASH;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return h === DESIGNATION_HASH;
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (locked) return;
  const value = input.value;
  locked = true;
  $('#auth-btn').disabled = true;
  $('#auth-btn span').textContent = '[ VERIFYING... ]';
  await sleep(650);
  const ok = await matches(value);
  if (ok) {
    SFX.ok();
    input.disabled = true;
    runSequence();
    return;
  }
  failures++;
  SFX.deny();
  $('#denied').hidden = false;
  $('#d-count').textContent = `FAILED ATTEMPTS: ${failures}`;
  log('ACCESS DENIED: UNKNOWN DESIGNATION', 'bad');
  const t = $('#terminal');
  t.classList.remove('shake');
  void t.offsetWidth;
  t.classList.add('shake');
  glitch(400);
  $('#auth-btn').disabled = false;
  $('#auth-btn span').textContent = '[ AUTHENTICATE ]';
  input.select();
  locked = false;
});
input.addEventListener('input', () => ($('#denied').hidden = true));

/* ---------- cinematic sequence ---------- */
const seq = $('#seq');
const seqLines = $('#seq-lines');
const seqBar = $('#seq-bar');
const seqPct = $('#seq-pct');
let pct = 0;
function setPct(v) {
  pct = v;
  seqBar.style.width = v + '%';
  seqPct.textContent = Math.round(v) + '%';
}
async function rampTo(target, ms) {
  const from = pct;
  const t0 = performance.now();
  while (true) {
    const t = Math.min(1, (performance.now() - t0) / ms);
    setPct(from + (target - from) * t);
    if (t >= 1) break;
    await new Promise(requestAnimationFrame);
  }
}
function seqReset(title) {
  seqLines.textContent = '';
  $('#seq-title').textContent = title;
  $('#seq-sub').textContent = '';
  setPct(0);
}

let ZONES;
const loadScript = (src) =>
  new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = res;
    el.onerror = () => rej(new Error('Failed to load ' + src));
    document.head.append(el);
  });

async function runSequence() {
  await loadScript('js/zones.js');
  ZONES = window.ZONES_DATA;
  linked = true;
  SFX.mode('uplink');
  $('#st-link').textContent = 'UPLINK';
  $('#st-link').className = 'ok';
  $('#st-clear').textContent = 'TOP SECRET';
  $('#st-clear').className = 'ok';
  $('#st-mode').textContent = 'ACTIVE';
  $('#st-mode').className = 'ok';

  $('#terminal').classList.add('out');
  await sleep(500);
  $('#terminal').hidden = true;
  glitch(450);

  seq.hidden = false;
  seq.classList.add('show');
  seqReset('WATCHER UPLINK');

  await type(seqLines, 'AUTHENTICATION SUCCESSFUL.', { cls: 'ok' });
  log('AUTHENTICATION SUCCESSFUL', 'hl');
  await sleep(250);
  await type(seqLines, 'SATELLITE IDENTIFIED: WATCHER', { cls: 'ok' });
  globe.setWatcherLabel('WATCHER', true);
  const wl = $('#orbit-list .red');
  wl.className = 'ok';
  wl.firstChild.textContent = 'WATCHER ';
  wl.querySelector('span').textContent = 'IDENTIFIED';
  log('WATCHER IDENTIFIED', 'hl');
  await sleep(350);

  await type(seqLines, 'ESTABLISHING SATELLITE UPLINK...');
  log('SATELLITE UPLINK ESTABLISHED');
  await rampTo(30, 1300);
  await type(seqLines, 'RECEIVING ENCRYPTED DATA...');
  log('ENCRYPTED DATA RECEIVED');
  await rampTo(65, 1300);
  const dec = await type(seqLines, 'DECRYPTING SURVEILLANCE FOOTAGE...');
  const cipher = document.createElement('div');
  cipher.className = 'line dec';
  seqLines.append(cipher);
  const cipherRun = (async () => {
    for (let i = 0; i < 10; i++) {
      cipher.textContent = `${hex(8)} ${hex(8)} ${hex(8)} ${hex(8)} ${hex(8)}`;
      await sleep(110);
    }
  })();
  await Promise.all([rampTo(100, 1400), cipherRun]);
  await decrypt(cipher, 'DECRYPTION COMPLETE // 3 SITES INDEXED', 800);
  dec.classList.add('ok');
  log('SURVEILLANCE FOOTAGE DECRYPTED');
  await sleep(600);

  seq.hidden = true;
  glitch(500);
  setStage('map');
  body.classList.add('stage-zones', 'map-live');
  SFX.mode('zones');
  SFX.reveal();
  globe.setInteractive(false);
  log('3 EVACUATION SITES DETECTED', 'hl');
  buildStrip();
  [...$('#zone-strip').children].forEach((c, i) => setTimeout(() => { c.classList.add('in'); SFX.ok(); }, 600 + i * 450));
}

/* ---------- zone data helpers ---------- */
const fmtCoord = (z) =>
  `${Math.abs(z.lat).toFixed(4)}° ${z.lat >= 0 ? 'N' : 'S'}, ${Math.abs(z.lon).toFixed(4)}° ${z.lon >= 0 ? 'E' : 'W'}`;
const utcNow = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
};
const lastObserved = (z) => z.lastObserved ?? `${utcNow()} // LIVE`;

// Stand-in imagery (Esri World Imagery capture) used until a custom image is configured.
function esriCapture(z, w) {
  const h = Math.round((w * 9) / 16);
  const dLon = 0.011;
  const dLat = dLon * Math.cos((z.lat * Math.PI) / 180) * (9 / 16);
  const bbox = [z.lon - dLon / 2, z.lat - dLat / 2, z.lon + dLon / 2, z.lat + dLat / 2].join(',');
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=jpg&f=image`;
}
const zoneImage = (z, full) => (full && z.imageFull) || z.image || esriCapture(z, full ? 1600 : 640);

function loadInto(frame, img, src) {
  frame.classList.add('loading');
  frame.classList.remove('err');
  img.onload = () => setTimeout(() => frame.classList.remove('loading'), 500 + Math.random() * 600);
  img.onerror = () => {
    frame.classList.remove('loading');
    frame.classList.add('err');
  };
  img.src = src;
}

function buildStrip() {
  const strip = $('#zone-strip');
  strip.textContent = '';
  ZONES.forEach((z, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'zone-card';
    card.setAttribute('aria-label', `Open ${z.id}, ${z.name}`);
    card.innerHTML = `
      <div class="zc-head"><span>${z.id}</span><span>${z.name}</span></div>
      <div class="zc-body">
        <div class="img-frame loading"><img alt="" /><div class="img-noise"></div><div class="img-scan"></div></div>
        <div class="zc-info">
          <b>GPS COORDINATES</b><span>${fmtCoord(z)}</span>
          <b>LAST OBSERVED</b><span>${lastObserved(z)}</span>
          <b>FIELD CONDITION</b><span>${z.fieldCondition}</span>
          <b>EXTRACTION STATUS</b><span>${z.extractionStatus}</span>
        </div>
      </div>`;
    loadInto($('.img-frame', card), $('img', card), zoneImage(z, false));
    card.addEventListener('click', () => openViewer(i));
    strip.append(card);
  });
}

/* ---------- zone viewer ---------- */
const viewer = $('#viewer');
const vFrame = $('#v-frame');
const vImg = $('#v-img');
let current = 0;
let lastFocus = null;

function openViewer(i) {
  current = (i + ZONES.length) % ZONES.length;
  const z = ZONES[current];
  if (viewer.hidden) lastFocus = document.activeElement;
  if (viewer.hidden) SFX.open();
  viewer.hidden = false;
  vFrame.classList.remove('zoomed');
  $('#v-title').textContent = `${z.id} // ${z.name}`;
  $('#v-imgtag').textContent = `${z.id.replace(' ', '-')} // ${fmtCoord(z)}`;
  const rows = [
    ['GPS COORDINATES', fmtCoord(z)],
    ['LAST OBSERVED', lastObserved(z)],
    ['FIELD CONDITION', z.fieldCondition],
    ['EXTRACTION STATUS', z.extractionStatus],
    ['SENSOR', 'WATCHER // OPTICAL RECON'],
  ];
  const dl = $('#v-data');
  dl.textContent = '';
  rows.forEach(([k, v]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
  });
  const ul = $('#v-analysis');
  ul.textContent = '';
  (z.analysis || []).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.append(li);
  });
  loadInto(vFrame, vImg, zoneImage(z, true));
  log(`${z.id} IMAGERY OPENED`);
  $('#v-close').focus();
}
function closeViewer() {
  viewer.hidden = true;
  lastFocus?.focus?.();
}
$('#v-close').addEventListener('click', closeViewer);
$('#v-prev').addEventListener('click', () => openViewer(current - 1));
$('#v-next').addEventListener('click', () => openViewer(current + 1));
viewer.addEventListener('click', (e) => e.target === viewer && closeViewer());
window.addEventListener('keydown', (e) => {
  if (viewer.hidden) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') openViewer(current - 1);
  if (e.key === 'ArrowRight') openViewer(current + 1);
});
// click image to magnify; move to pan the magnified area
vFrame.addEventListener('click', (e) => {
  vFrame.classList.toggle('zoomed');
  moveZoom(e);
});
vFrame.addEventListener('mousemove', moveZoom);
function moveZoom(e) {
  if (!vFrame.classList.contains('zoomed')) return;
  const r = vFrame.getBoundingClientRect();
  vImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
}

boot();
