// 올팍 도감: 올림픽공원 9경과 생태 공간에서 사진을 찍어 카드와 배지를 모으는 웹앱
// 서버 없이 동작한다. 사진과 기록은 이 기기의 IndexedDB에만 저장한다.
const VERSION = '1.1.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  camera: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  pin: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  save: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  locate: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  chev: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};
const SEASONS = ['봄', '여름', '가을', '겨울'];
const GALLERY_CREDIT = '사진: 한국체육산업개발(주) 올림픽공원 생태갤러리';

// ---------- 데이터 ----------
let P, ROSES, BM;
const spotById = new Map();
const badgeById = new Map();
const spotGeom = new Map(); // 지점 id → 미터 좌표 도형

async function loadData() {
  const [p, r, b] = await Promise.all(['places', 'roses', 'basemap'].map((n) => fetch(`data/${n}.json`).then((x) => x.json())));
  P = p; ROSES = r; BM = b;
  for (const s of P.spots) { spotById.set(s.id, s); spotGeom.set(s.id, partsOf(s.geom)); }
  for (const bd of P.badges) badgeById.set(bd.id, bd);
}
const toM = (lon, lat) => [(lon - BM.proj.lon0) * BM.proj.kx, (lat - BM.proj.lat0) * BM.proj.ky];
const toMap = (lon, lat) => { const [x, y] = toM(lon, lat); return [(x - BM.proj.minx) * BM.proj.s, (BM.proj.maxy - y) * BM.proj.s]; };

function partsOf(g) {
  const m = (c) => toM(c[0], c[1]);
  if (g.type === 'Point') return [{ pts: [m(g.coordinates)], closed: false }];
  if (g.type === 'LineString') return [{ pts: g.coordinates.map(m), closed: false }];
  if (g.type === 'Polygon') return [{ pts: g.coordinates[0].map(m), closed: true }];
  return g.coordinates.map((poly) => ({ pts: poly[0].map(m), closed: true }));
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function inside(p, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToSpot(spotId, lon, lat) {
  const p = toM(lon, lat);
  let best = Infinity;
  for (const { pts, closed } of spotGeom.get(spotId)) {
    if (closed && inside(p, pts)) return 0;
    if (pts.length === 1) best = Math.min(best, Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]));
    for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
  }
  return best;
}
const WALK = () => P.spots.find((s) => s.badge === 't_walk');
const fmtM = (m) => (m < 1000 ? `${Math.round(m / 5) * 5}m` : `${(m / 1000).toFixed(1)}km`);
const seasonOf = (d) => { const m = d.getMonth() + 1; return m >= 3 && m <= 5 ? '봄' : m <= 8 && m >= 6 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울'; };
const nowSeason = () => seasonOf(new Date());
const badgeShort = (b) => (b.group === '9경' ? b.name.split(' ')[0] : { t_tree: '나무', t_lawn: '잔디', t_art: '조각', t_wild: '들꽃', t_walk: '산책' }[b.id]);
const badgeTitle = (b) => (b.group === '9경' ? b.name.replace(/^\d경 /, '') : b.name);

// ---------- 저장소 (IndexedDB) ----------
const db = {
  _p: null,
  open() {
    this._p ??= new Promise((res, rej) => {
      const r = indexedDB.open('olpark', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('photos', { keyPath: 'id' });
        d.createObjectStore('roses', { keyPath: 'name' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._p;
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out?.result ?? out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all(store) { return this.tx(store, 'readonly', (s) => s.getAll()); },
  get(store, key) { return this.tx(store, 'readonly', (s) => s.get(key)); },
  put(store, v) { return this.tx(store, 'readwrite', (s) => s.put(v)); },
  clear(store) { return this.tx(store, 'readwrite', (s) => s.clear()); },
};

// ---------- 상태 ----------
const state = { photos: [], roses: new Map(), fix: null, geoOn: false, geoErr: '', watchId: null, pending: null, justEarned: [], quizFor: null, bookTab: 'place' };
const urls = new Map(); // 사진 id → blob URL
async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await db.get('photos', id);
  if (!rec?.blob) return '';
  const u = URL.createObjectURL(rec.blob);
  urls.set(id, u);
  return u;
}
const ls = {
  get(k, d) { try { const v = localStorage.getItem('olpark.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('olpark.' + k, JSON.stringify(v)); } catch { /* 저장 못 해도 동작에는 지장 없음 */ } },
};
// 체험 모드: 공원 밖에서도 장소를 골라 카드를 받아 본다. 체험 기록은 실제 기록과 따로 보인다.
const demoOn = () => ls.get('demo', false);
async function loadState() {
  const demo = demoOn();
  const photos = await db.all('photos');
  state.photos = photos.map(({ blob, ...m }) => m).filter((p) => !!p.demo === demo).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  state.roses = new Map((await db.all('roses')).filter((r) => !!r.demo === demo).map((r) => [r.rose || r.name, r]));
}
async function setDemo(on) { ls.set('demo', on); await loadState(); }
const currentBadge = () => { const m = location.hash.match(/^#\/place\/([\w-]+)/); return m ? m[1] : null; };

// ---------- 진행도 ----------
const spotPhotos = (sid) => state.photos.filter((p) => p.spot === sid);
const spotSeasons = (sid) => new Set(spotPhotos(sid).map((p) => p.season));
function badgeProgress(b) {
  if (b.id === 't_walk') { const s = new Set(state.photos.map((p) => p.season)); return { got: s.size, total: 4, unit: '계절' }; }
  const got = b.spots.filter((sid) => spotPhotos(sid).length).length;
  return { got, total: b.spots.length, unit: '곳' };
}
const badgeDone = (b) => { const g = badgeProgress(b); return g.got >= g.total; };
// 같은 지점·같은 계절 사진은 카드 1장으로 센다
const cardCount = () => new Set(state.photos.map((p) => p.spot + '|' + p.season)).size + state.roses.size;
// 받침에 맞춰 "이에요/예요"
const iyeyo = (w) => { const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return `${w}(이)에요`; return (c - 0xac00) % 28 ? `${w}이에요` : `${w}예요`; };
const doneBadges = () => P.badges.filter(badgeDone).map((b) => b.id);

// ---------- 위치 ----------
const listeners = new Set();
function startGeo() {
  if (!('geolocation' in navigator)) { state.geoErr = '이 브라우저는 위치를 지원하지 않아요.'; return; }
  if (state.watchId != null) return;
  state.geoOn = true;
  ls.set('geo', true);
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => { state.fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() }; state.geoErr = ''; listeners.forEach((f) => f()); },
    (err) => {
      state.geoErr = err.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용해 주세요.' : '위치를 찾지 못했어요. 하늘이 보이는 곳에서 다시 시도해 주세요.';
      if (err.code === 1) { state.geoOn = false; navigator.geolocation.clearWatch(state.watchId); state.watchId = null; ls.set('geo', false); }
      listeners.forEach((f) => f());
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
}
function freshFix() { const f = state.fix; return f && Date.now() - f.t < 60000 ? f : null; }
function inPark(f) { return distToSpot(WALK().id, f.lon, f.lat) <= f.acc; }
// 현재 위치에서 카드를 넣을 수 있는 지점 (가까운 순)
function candidates() {
  const f = freshFix();
  if (!f) return { status: state.geoErr ? 'error' : 'wait' };
  const max = P.rules.gps_max_accuracy_m ?? 50;
  if (f.acc > max) return { status: 'weak', acc: f.acc };
  const list = P.spots.filter((s) => s.badge !== 't_walk')
    .map((s) => ({ spot: s, d: distToSpot(s.id, f.lon, f.lat) }))
    .filter((c) => c.d <= c.spot.reach + f.acc)
    .sort((a, b) => a.d - b.d);
  if (list.length) return { status: 'ok', list, fix: f };
  if (inPark(f)) return { status: 'ok', list: [{ spot: WALK(), d: 0 }], fix: f };
  return { status: 'out', fix: f };
}
function nearestSpots(n = 3, badgeId = null) {
  const f = freshFix();
  if (!f) return [];
  return P.spots.filter((s) => s.badge !== 't_walk' && (!badgeId || s.badge === badgeId))
    .map((s) => ({ spot: s, d: distToSpot(s.id, f.lon, f.lat) }))
    .sort((a, b) => a.d - b.d).slice(0, n);
}
const isInside = (c) => c.d <= c.spot.reach + (freshFix()?.acc ?? 0);

// ---------- 화면 공통 ----------
const view = () => $('#view');
let unbindView = null;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function setTabs(active) {
  const bar = $('#tabbar');
  bar.hidden = !active;
  view().classList.toggle('no-tabbar', !active);
  $$('a', bar).forEach((a) => (a.dataset.tab === active ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}
function openModal(html, onBind) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const m = $('.modal', root);
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
  onBind?.(m);
  ($('[autofocus]', m) || $('button, a, input', m))?.focus();
  document.addEventListener('keydown', escClose);
  return m;
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() { $('#modal-root').innerHTML = ''; document.removeEventListener('keydown', escClose); }
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function geoLine() {
  if (!state.geoOn) return `<div class="geo-line"><span class="dot"></span><span>위치가 꺼져 있어요. <a href="#" data-act="geo">위치 켜기</a></span></div>`;
  if (state.geoErr) return `<div class="geo-line weak"><span class="dot"></span><span>${esc(state.geoErr)}</span></div>`;
  const f = freshFix();
  if (!f) return `<div class="geo-line"><span class="dot"></span><span>위치를 찾는 중이에요…</span></div>`;
  const weak = f.acc > (P.rules.gps_max_accuracy_m ?? 50);
  return `<div class="geo-line ${weak ? 'weak' : 'ok'}"><span class="dot"></span><span>${weak ? `위치 오차가 ${Math.round(f.acc)}m로 커요. 잠시 기다리거나 조금 이동해 주세요.` : `위치 확인됨 · 오차 ${Math.round(f.acc)}m`}</span></div>`;
}
function bindCommon(root) {
  $$('[data-act="geo"]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); startGeo(); render(); }));
  $$('[data-act="capture"]', root).forEach((b) => b.addEventListener('click', () => capture()));
  $$('[data-act="home-help"]', root).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); homeHelp(); }));
}

// ---------- 화면: 시작 ----------
function viewStart() {
  setTabs(null);
  view().innerHTML = `
  <section class="start">
    <div class="cards" aria-hidden="true">
      <span style="background:var(--orange-tint);border:2px solid var(--orange);color:var(--orange-text);transform:rotate(-8deg)">6경</span>
      <span style="background:var(--green-tint);border:2px solid var(--green);color:var(--green);transform:rotate(3deg)">나무</span>
      <span style="border:2px dashed #9AA39D;color:var(--sub);transform:rotate(-2deg);font-size:24px">?</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <h1>올팍 도감</h1>
      <p style="font-size:17px">올림픽공원 곳곳을 찾아가 사진을 찍고<br>카드와 배지를 모아요.</p>
    </div>
    <ol class="steps">
      <li><b>1</b><span><strong>장소에 가요</strong><span class="muted small">9경과 명품 나무, 잔디마당 등 ${P.spots.length - 1}곳이 있어요.</span></span></li>
      <li><b>2</b><span><strong>사진을 찍어요</strong><span class="muted small">위치로 장소를 확인해요. 사진은 이 폰에만 저장돼요.</span></span></li>
      <li><b>3</b><span><strong>배지를 모아요</strong><span class="muted small">계절마다 새 카드가 열려요. 배지는 모두 ${P.badges.length}개예요.</span></span></li>
    </ol>
    ${isIOS() && !isStandalone() ? `<div class="notice" role="note">${ICON.info}<span>아이폰 사파리에서는 7일 넘게 열지 않으면 모은 기록이 지워질 수 있어요. 홈 화면에 추가하면 지워지지 않아요.<br><a href="#" data-act="home-help" style="font-weight:700;color:var(--orange-text)">홈 화면에 추가하는 법</a></span></div>` : ''}
    <div class="actions">
      <button class="btn" id="start-geo">${ICON.pin}위치 허용하고 시작하기</button>
      <a class="btn ghost" href="#/map" id="start-browse">위치 없이 둘러보기</a>
      <a class="btn ghost" href="#/map" id="start-demo" style="min-height:40px;font-size:14px">공원 밖에서 체험해 보기 (체험 모드)</a>
      <p class="tiny muted" style="text-align:center">공공데이터: 한국체육산업개발(주) · 지도 © OpenStreetMap contributors</p>
    </div>
  </section>`;
  bindCommon(view());
  $('#start-geo').addEventListener('click', () => { ls.set('started', true); startGeo(); location.hash = '#/map'; });
  $('#start-browse').addEventListener('click', () => ls.set('started', true));
  $('#start-demo').addEventListener('click', async (e) => { e.preventDefault(); ls.set('started', true); await setDemo(true); location.hash = '#/map'; });
}

// ---------- 화면: 지도 ----------
function mapPins() {
  const done = new Set(doneBadges());
  let out = '';
  for (const b of P.badges) {
    if (b.id === 't_walk') continue;
    b.spots.forEach((sid, i) => {
      const s = spotById.get(sid);
      const left = (s.c[0] / BM.w) * 100, top = (s.c[1] / BM.h) * 100;
      const sdone = spotPhotos(sid).length > 0;
      const label = `${b.group === '9경' ? b.name : `${b.name} · ${s.name}`}${sdone ? ' (모음)' : ''}`;
      if (b.group === '9경' && i === 0) out += `<a class="pin big ${done.has(b.id) ? 'done' : ''}" href="#/place/${b.id}" style="left:${left}%;top:${top}%" aria-label="${esc(label)}">${b.name.match(/^\d/)[0]}</a>`;
      else out += `<a class="pin dot ${b.group === '9경' ? 'v' : ''} ${sdone ? 'done' : ''}" href="#/place/${b.id}" style="left:${left}%;top:${top}%" aria-label="${esc(label)}"></a>`;
    });
  }
  return out;
}
function meDot() {
  const f = freshFix();
  if (!f) return '';
  const [x, y] = toMap(f.lon, f.lat);
  if (x < 0 || y < 0 || x > BM.w || y > BM.h) return '';
  return `<span class="me" style="left:${(x / BM.w) * 100}%;top:${(y / BM.h) * 100}%"></span>`;
}
function nearList() {
  const near = nearestSpots(3);
  if (!near.length) {
    return P.badges.filter((b) => b.group === '9경').slice(0, 3).map((b) => nearRow(b, null, null)).join('');
  }
  return near.map((c) => nearRow(badgeById.get(c.spot.badge), c.spot, c)).join('');
}
function nearRow(b, s, c) {
  const g = badgeProgress(b);
  const where = c ? (isInside(c) ? '지금 이 구역 안이에요' : `${fmtM(c.d)} 떨어져 있어요`) : esc(b.desc);
  return `<a class="near ${c && isInside(c) ? 'inside' : ''}" href="#/place/${b.id}">
    <span class="num ${b.group === '9경' ? '' : 't'}">${esc(badgeShort(b))}</span>
    <span class="txt"><strong>${esc(badgeTitle(b))}${s && b.spots.length > 1 ? ` · ${esc(s.name)}` : ''}</strong><span>${where} · ${g.got}/${g.total}${g.unit}</span></span>
    ${ICON.chev}</a>`;
}
function viewMap() {
  setTabs('map');
  const done = doneBadges().length;
  const zoom = ls.get('zoom', false);
  view().innerHTML = `
  <header class="page-head"><h1 class="logo">올팍 도감</h1><span class="chip orange">${nowSeason()} 카드 받는 중</span></header>
  <section class="stats">
    <div class="stat"><span>배지</span><strong>${done} <small>/ ${P.badges.length}</small></strong></div>
    <div class="stat"><span>모은 카드</span><strong>${cardCount()}<small>장</small></strong></div>
  </section>
  ${demoOn() ? `<div style="padding:0 20px 12px"><div class="notice green" role="note">${ICON.info}<span><strong>체험 모드예요.</strong> 지도에서 장소를 누르고 장소 화면의 사진 찍기를 누르면 위치 확인 없이 카드를 받아 볼 수 있어요. 체험 기록은 실제 기록과 따로 저장돼요. <a href="#" id="demo-off" style="font-weight:700">체험 끝내기</a></span></div></div>` : ''}
  ${isIOS() && !isStandalone() && !ls.get('iosHintClosed', false) ? `<div style="padding:0 20px 12px"><div class="notice" role="note">${ICON.info}<span>홈 화면에 추가하면 기록이 지워지지 않아요. <a href="#" data-act="home-help" style="font-weight:700;color:var(--orange-text)">추가하는 법</a> · <a href="#" id="ios-close" style="color:var(--orange-text)">닫기</a></span></div></div>` : ''}
  <section class="map-box ${zoom ? 'zoom' : ''}" aria-label="올림픽공원 지도">
    <div class="map-tools">
      <button id="zoom" aria-label="${zoom ? '지도 작게 보기' : '지도 크게 보기'}">${zoom ? ICON.minus : ICON.plus}</button>
      <button id="locate" aria-label="내 위치로 이동">${ICON.locate}</button>
    </div>
    <div class="map-scroll" id="map-scroll"><div class="map-inner">
      <svg viewBox="0 0 ${BM.w} ${BM.h}" role="img" aria-label="올림픽공원 지도">${BM.svg}</svg>
      <div id="pins">${mapPins()}</div><div id="me">${meDot()}</div>
    </div></div>
    <span class="map-attr">© OpenStreetMap contributors</span>
  </section>
  <div class="legend"><span><i style="background:var(--orange)"></i>9경</span><span><i style="background:var(--green)"></i>테마</span><span><i style="background:var(--blue)"></i>내 위치</span><span>색이 채워지면 모음</span></div>
  <div id="geo">${geoLine()}</div>
  <section class="section"><h2 id="near-title">${freshFix() ? '지금 가까운 곳' : '올팍 9경'}</h2><div class="list" id="near">${nearList()}</div></section>
  <div style="height:84px" aria-hidden="true"></div>
  <button class="fab" data-act="capture">${ICON.camera}사진 찍기</button>`;
  bindCommon(view());
  $('#ios-close')?.addEventListener('click', (e) => { e.preventDefault(); ls.set('iosHintClosed', true); render(); });
  $('#demo-off')?.addEventListener('click', async (e) => { e.preventDefault(); await setDemo(false); toast('체험 모드를 껐어요. 실제 기록으로 돌아왔어요.'); render(); });
  $('#zoom').addEventListener('click', () => { ls.set('zoom', !zoom); render(); if (!zoom) setTimeout(centerOnMe, 30); });
  $('#locate').addEventListener('click', () => { if (!state.geoOn) startGeo(); if (!ls.get('zoom', false)) { ls.set('zoom', true); render(); } setTimeout(centerOnMe, 30); });
  if (state.geoOn) startGeo();
  const upd = () => { $('#me').innerHTML = meDot(); $('#geo').innerHTML = geoLine(); $('#near').innerHTML = nearList(); $('#near-title').textContent = freshFix() ? '지금 가까운 곳' : '올팍 9경'; bindCommon($('#geo')); };
  listeners.add(upd);
  return () => listeners.delete(upd);
}
function centerOnMe() {
  const f = freshFix(), sc = $('#map-scroll');
  if (!sc) return;
  let x = BM.w / 2, y = BM.h / 2;
  if (f) { [x, y] = toMap(f.lon, f.lat); } else if (state.geoOn) toast('위치를 찾는 중이에요.');
  const inner = $('.map-inner', sc);
  sc.scrollTo({ left: (x / BM.w) * inner.clientWidth - sc.clientWidth / 2, top: (y / BM.h) * inner.clientHeight - sc.clientHeight / 2, behavior: 'smooth' });
}

// ---------- 화면: 장소 ----------
function viewPlace(bid) {
  const b = badgeById.get(bid);
  if (!b) { location.hash = '#/map'; return; }
  setTabs('map');
  const hero = b.gallery[0];
  const g = badgeProgress(b);
  view().innerHTML = `
  <div class="hero">
    <a class="back" href="#/map" aria-label="지도로 돌아가기">${ICON.back}</a>
    ${hero ? `<img src="${esc(hero.url)}" alt="${esc(hero.title)}" loading="lazy" referrerpolicy="no-referrer"><span class="credit">${esc(GALLERY_CREDIT)}</span>` : `<div class="noimg">${esc(b.name)}</div>`}
  </div>
  <section class="section" style="padding-top:18px">
    <div class="place-title"><span class="chip ${b.group === '9경' ? 'orange' : 'green'}">${esc(badgeShort(b))}</span><h1>${esc(badgeTitle(b))}</h1></div>
    <p class="muted">${esc(b.desc)}</p>
    <div id="place-status"></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;font-size:14px"><strong>${g.got} / ${g.total}${g.unit}</strong><span class="muted">${badgeDone(b) ? '배지를 받았어요' : `${g.total - g.got}${g.unit} 더 모으면 배지`}</span></div>
      <div class="bar"><span style="width:${(g.got / g.total) * 100}%"></span></div>
    </div>
  </section>
  ${b.id === 't_walk' ? walkSection() : `<section class="section"><h2>${b.spots.length > 1 ? '지점' : '계절 카드'}</h2><div id="spots" style="display:flex;flex-direction:column;gap:10px">${spotCards(b)}</div></section>`}
  ${b.id === 'v9' ? roseTeaser() : ''}
  ${b.gallery.length > 1 ? `<section class="section"><h2>공원 갤러리 사진</h2><div class="strip">${b.gallery.slice(1, 13).map((x) => `<figure><img src="${esc(x.url)}" alt="${esc(x.title)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>${esc(x.title)}</figcaption></figure>`).join('')}</div><p class="tiny muted">${esc(GALLERY_CREDIT)} (공공누리 제4유형)</p></section>` : ''}
  <div class="cta-bar"><button class="btn" data-act="capture">${ICON.camera}사진 찍고 ${nowSeason()} 카드 받기</button><span class="tiny muted" style="text-align:center">사진은 이 폰에만 저장돼요</span></div>`;
  bindCommon(view());
  if (state.geoOn) startGeo();
  const upd = () => { $('#place-status').innerHTML = placeStatus(b); const sp = $('#spots'); if (sp) sp.innerHTML = spotCards(b); bindCommon($('#place-status')); };
  upd();
  listeners.add(upd);
  return () => listeners.delete(upd);
}
function placeStatus(b) {
  if (!state.geoOn) return `<div class="status">위치가 꺼져 있어요 · <a href="#" data-act="geo">켜기</a></div>`;
  const f = freshFix();
  if (!f) return `<div class="status">${esc(state.geoErr || '위치를 찾는 중이에요…')}</div>`;
  if (b.id === 't_walk') return inPark(f) ? `<div class="status in">${ICON.check}공원 안에 있어요</div>` : `<div class="status">공원 밖에 있어요</div>`;
  const near = nearestSpots(1, b.id)[0];
  if (!near) return '';
  return isInside(near) ? `<div class="status in">${ICON.check}지금 이 구역 안에 있어요 · 오차 ${Math.round(f.acc)}m</div>` : `<div class="status">${b.spots.length > 1 ? `가장 가까운 ${esc(near.spot.name)}까지 ` : ''}${fmtM(near.d)}</div>`;
}
function lawnNote(s) {
  if (!s.lawn) return '';
  if (!s.lawn.seasonal) return `<p class="small muted">잔디: ${esc(s.lawn.open)}</p>`;
  const m = new Date().getMonth() + 1;
  const closed = m >= 11 || m <= 5;
  return closed ? `<p class="small" style="color:var(--orange-text)">지금은 잔디 보호 기간이에요 (${esc(P.lawnClosed)}). 잔디 밖에서 찍어 주세요.</p>` : `<p class="small muted">잔디 개방: ${esc(s.lawn.open)}</p>`;
}
function spotCards(b) {
  const near = new Map(nearestSpots(99, b.id).map((c) => [c.spot.id, c]));
  const cur = nowSeason();
  return b.spots.map((sid) => {
    const s = spotById.get(sid), c = near.get(sid), seasons = spotSeasons(sid);
    const slots = SEASONS.map((sn) => {
      const ph = spotPhotos(sid).filter((p) => p.season === sn).at(-1);
      if (ph) return `<a class="slot got" href="#/card/${ph.id}" data-photo="${ph.id}" aria-label="${esc(s.name)} ${sn} 카드 보기"><img alt="" data-src="${ph.id}"><span>${sn}</span></a>`;
      return `<span class="slot ${sn === cur ? 'now' : ''}">${sn === cur ? `${sn}<br>지금` : sn}</span>`;
    }).join('');
    return `<div class="spot ${c && isInside(c) ? 'in' : ''}">
      <div class="spot-head"><strong>${esc(s.name)}</strong><span class="small muted">${c ? (isInside(c) ? '구역 안' : fmtM(c.d)) : ''} · ${seasons.size}/4</span></div>
      <div class="seasons">${slots}</div>${lawnNote(s)}</div>`;
  }).join('');
}
function walkSection() {
  const have = new Set(state.photos.map((p) => p.season));
  return `<section class="section"><h2>계절 카드</h2><p class="small muted">공원 안 어디서 찍은 사진이든 그 계절 칸이 채워져요.</p>
    <div class="seasons">${SEASONS.map((sn) => `<span class="slot ${have.has(sn) ? 'got' : sn === nowSeason() ? 'now' : ''}" style="${have.has(sn) ? 'background:var(--green)' : ''}"><span>${sn}</span></span>`).join('')}</div></section>`;
}
function roseTeaser() {
  return `<section class="section"><h2>장미 도감 ${state.roses.size} / ${ROSES.length}</h2>
    <p class="small muted">장미광장에서 사진을 찍으면 장미 퀴즈가 열려요. 맞히면 그 장미 카드를 받아요.</p>
    <a class="btn secondary" href="#/book?tab=rose">장미 도감 보기</a></section>`;
}
async function fillThumbs(root = view()) {
  for (const img of $$('img[data-src]', root)) { const u = await photoURL(img.dataset.src); if (u) img.src = u; }
}

// ---------- 촬영 ----------
function capture() {
  if (demoOn()) {
    const b = badgeById.get(currentBadge());
    if (!b) return toast('체험 모드에서는 장소 화면에서 사진 찍기를 눌러 주세요. 지도에서 번호나 점을 누르면 장소 화면이 열려요.', 4500);
    const list = (b.id === 't_walk' ? [WALK()] : b.spots.map((id) => spotById.get(id))).map((s) => ({ spot: s, d: 0 }));
    state.pending = { list, season: nowSeason() };
    const cam = $('#cam');
    cam.value = '';
    cam.click();
    return;
  }
  if (!state.geoOn) { startGeo(); toast('위치를 켜는 중이에요. 위치가 확인되면 다시 눌러 주세요.'); render(); return; }
  const c = candidates();
  if (c.status === 'error') return toast(state.geoErr);
  if (c.status === 'wait') return toast('위치를 찾는 중이에요. 잠시 후 다시 눌러 주세요.');
  if (c.status === 'weak') return toast(`위치 오차가 ${Math.round(c.acc)}m로 커요. 잠시 기다리거나 하늘이 보이는 곳으로 조금 이동해 주세요.`);
  if (c.status === 'out') { const n = nearestSpots(1)[0]; return toast(`올림픽공원 안에서만 카드를 모을 수 있어요.${n ? ` 가장 가까운 곳: ${n.spot.name} ${fmtM(n.d)}` : ''}`, 4500); }
  state.pending = { list: c.list, season: nowSeason() };
  const cam = $('#cam');
  cam.value = '';
  cam.click();
}
async function onPhotoPicked(file) {
  const pend = state.pending;
  state.pending = null;
  if (!file || !pend) return;
  let img;
  try { img = await shrink(file); } catch { toast('사진을 읽지 못했어요. 다시 찍어 주세요.'); return; }
  if (pend.list.length === 1) return savePhoto(pend.list[0].spot, img, pend.season);
  const previewURL = URL.createObjectURL(img.blob);
  const first = Math.max(0, pend.list.findIndex((c) => !spotSeasons(c.spot.id).has(pend.season)));
  openModal(`<form class="sheet" id="choose"><span class="grip" aria-hidden="true"></span>
    <img class="preview" src="${previewURL}" alt="방금 찍은 사진">
    <div><h2>어디서 찍었어요?</h2><p class="small muted">가까운 장소가 여러 곳이라 위치만으로는 알 수 없어요. 사진 1장은 한 곳에만 넣을 수 있어요.</p></div>
    <fieldset style="border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:10px"><legend class="sr-only">사진을 넣을 장소</legend>
    ${pend.list.map((c, i) => { const b = badgeById.get(c.spot.badge); const has = spotSeasons(c.spot.id).has(pend.season); return `<label class="opt"><input type="radio" name="spot" value="${c.spot.id}" ${i === first ? 'checked' : ''}><span class="near" style="border:0;padding:0;flex:1"><span class="num ${b.group === '9경' ? '' : 't'}">${esc(badgeShort(b))}</span><span class="txt"><strong>${esc(badgeTitle(b))}${b.spots.length > 1 ? ` · ${esc(c.spot.name)}` : ''}</strong><span>${c.d < 1 ? '구역 안' : fmtM(c.d)} · ${has ? `${pend.season} 카드 이미 있음` : `${pend.season} 카드 받을 수 있어요`}</span></span></span></label>`; }).join('')}
    </fieldset>
    <button class="btn" type="submit">이 장소에 넣기</button><button class="btn ghost" type="button" id="cancel">취소</button></form>`, (m) => {
    $('#cancel', m).addEventListener('click', () => { URL.revokeObjectURL(previewURL); closeModal(); });
    $('#choose', m).addEventListener('submit', (e) => {
      e.preventDefault();
      const sid = new FormData(e.target).get('spot');
      URL.revokeObjectURL(previewURL);
      closeModal();
      savePhoto(spotById.get(sid), img, pend.season);
    });
  });
}
async function shrink(file) {
  const MAX = 1600;
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, MAX / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  // 다시 그려 저장하므로 촬영 위치 같은 사진 속 정보(EXIF)는 남지 않는다
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
  return { blob, w, h };
}
async function savePhoto(spot, img, season) {
  const before = new Set(doneBadges());
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rec = { id, spot: spot.id, badge: spot.badge, season, takenAt: new Date().toISOString(), w: img.w, h: img.h, quiz: spot.badge === 'v9' ? 'open' : '' };
  if (demoOn()) rec.demo = true;
  try { await db.put('photos', { ...rec, blob: img.blob }); } catch { toast('저장 공간이 부족해서 저장하지 못했어요.'); return; }
  state.photos.push(rec);
  state.justEarned = doneBadges().filter((x) => !before.has(x));
  if (navigator.storage?.persist && !ls.get('persistAsked', false)) { ls.set('persistAsked', true); navigator.storage.persist().catch(() => {}); }
  location.hash = `#/card/${id}?new=1`;
}

// ---------- 화면: 카드 ----------
async function viewCard(id, isNew) {
  const rec = state.photos.find((p) => p.id === id);
  if (!rec) { location.hash = '#/book'; return; }
  setTabs('book');
  const s = spotById.get(rec.spot), b = badgeById.get(rec.badge);
  const then = b.gallery.find((x) => x.season === rec.season) || b.gallery[0];
  const earned = isNew ? state.justEarned.map((x) => badgeById.get(x)) : [];
  const d = new Date(rec.takenAt);
  view().innerHTML = `
  <section class="card-page">
    <div style="text-align:center"><p style="font-size:14px;color:#D5E8DA">${esc(b.name)}</p><h1>${isNew ? '새 카드를 받았어요' : '내 카드'}</h1></div>
    <article class="card">
      <div class="photo"><img id="card-img" alt="${esc(s.name)}에서 찍은 사진"><span class="season">${rec.season}</span>${rec.demo ? '<span class="season" style="left:auto;right:10px;background:var(--green)">체험</span>' : ''}</div>
      <div class="meta"><h2>${esc(b.spots.length > 1 ? s.name : badgeTitle(b))}의 ${rec.season}</h2><span class="small muted">${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}</span></div>
      ${then ? `<div class="then"><img src="${esc(then.url)}" alt="${esc(then.title)}" loading="lazy" referrerpolicy="no-referrer"><span class="small"><strong>그때 사진</strong><br><span class="muted">${esc(then.title)}${then.date ? ` · ${then.date.slice(0, 4)}년 공원 갤러리` : ''}</span></span></div>` : ''}
    </article>
    ${earned.map((e) => `<div class="earned"><span class="medal">${esc(badgeShort(e))}</span><span><strong>배지를 받았어요!</strong><br><span class="small muted">${esc(e.name)}</span></span></div>`).join('')}
    ${rec.quiz === 'open' ? `<button class="btn light" id="quiz" style="width:100%;max-width:330px">장미 퀴즈 풀고 장미 카드 받기</button>` : ''}
    <div class="card-actions"><button class="btn outline-light" id="save-album">${ICON.save}앨범에 저장</button><a class="btn light" href="#/place/${b.id}">장소로 가기</a></div>
    ${then ? `<p class="tiny" style="color:#D5E8DA;text-align:center">${esc(GALLERY_CREDIT)}</p>` : ''}
  </section>`;
  if (isNew) state.justEarned = [];
  $('#card-img').src = await photoURL(id);
  $('#save-album').addEventListener('click', () => saveToAlbum(rec));
  $('#quiz')?.addEventListener('click', () => roseQuiz(rec));
}
async function saveToAlbum(rec) {
  const full = await db.get('photos', rec.id);
  if (!full?.blob) return;
  const b = badgeById.get(rec.badge), s = spotById.get(rec.spot);
  const name = `olpark-${(b.spots.length > 1 ? s.name : badgeTitle(b)).replace(/\s+/g, '')}-${rec.season}-${rec.takenAt.slice(0, 10)}.jpg`;
  const file = new File([full.blob], name, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '올팍 도감' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- 장미 퀴즈 ----------
function pick(arr, n, avoid = new Set()) {
  const pool = arr.filter((x) => !avoid.has(x)), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
function roseQuiz(rec) {
  const left = ROSES.filter((r) => !state.roses.has(r.name));
  if (!left.length) { toast('장미 도감을 모두 채웠어요!'); return; }
  const answer = pick(left, 1)[0];
  const others = pick(ROSES, 2, new Set([answer]));
  const opts = pick([answer, ...others], 3);
  const desc = answer.desc.replaceAll(answer.name, '○○○');
  openModal(`<div class="sheet"><span class="grip" aria-hidden="true"></span>
    <h2>이 장미의 이름은?</h2>
    <img class="quiz-img" src="${esc(answer.img)}" alt="퀴즈 장미 사진" referrerpolicy="no-referrer">
    <p class="small muted">${esc(desc)}</p>
    <div style="display:flex;flex-direction:column;gap:8px" id="answers">${opts.map((o) => `<button class="answer" data-name="${esc(o.name)}">${esc(o.name)}</button>`).join('')}</div>
    <p class="tiny muted">장미 정보·사진: 한국체육산업개발(주) 올림픽공원장미정보 (문화공공데이터광장)</p>
    <button class="btn ghost" id="quiz-close">닫기</button></div>`, (m) => {
    $('#quiz-close', m).addEventListener('click', closeModal);
    $$('.answer', m).forEach((btn) => btn.addEventListener('click', async () => {
      const ok = btn.dataset.name === answer.name;
      $$('.answer', m).forEach((x) => { x.disabled = true; if (x.dataset.name === answer.name) x.classList.add('right'); });
      if (!ok) btn.classList.add('wrong');
      rec.quiz = ok ? 'right' : 'wrong';
      const full = await db.get('photos', rec.id);
      if (full) await db.put('photos', { ...full, quiz: rec.quiz });
      if (ok) {
        // 저장 키(name)는 체험 기록과 겹치지 않게 나누고, 실제 장미 이름은 rose에 둔다
        const r = { name: (rec.demo ? 'demo:' : '') + answer.name, rose: answer.name, at: new Date().toISOString(), photo: rec.id, ...(rec.demo ? { demo: true } : {}) };
        await db.put('roses', r); state.roses.set(answer.name, r);
      }
      $('#quiz-close', m).textContent = '확인';
      m.querySelector('h2').textContent = ok ? `정답! ${answer.name} 카드를 받았어요` : `아쉬워요. 정답은 ${iyeyo(answer.name)}`;
      $('#quiz-close', m).addEventListener('click', () => render(), { once: true });
    }));
  });
}

// ---------- 화면: 도감 ----------
function viewBook(tab) {
  setTabs('book');
  if (tab) state.bookTab = tab;
  const t = state.bookTab;
  view().innerHTML = `
  <header class="page-head"><h1 class="logo">도감</h1><span class="chip gray">카드 ${cardCount()}장</span></header>
  <div class="tabs" role="tablist"><button role="tab" aria-selected="${t === 'place'}" data-t="place">장소 카드</button><button role="tab" aria-selected="${t === 'rose'}" data-t="rose">장미 도감 ${state.roses.size}/${ROSES.length}</button></div>
  ${t === 'place' ? P.badges.filter((b) => b.id !== 't_walk').map((b) => `
    <section class="section"><h2><a href="#/place/${b.id}" style="color:inherit;text-decoration:none">${esc(b.name)}</a> <span class="small muted">${badgeProgress(b).got}/${badgeProgress(b).total}곳</span></h2>
    ${b.spots.map((sid) => { const s = spotById.get(sid); return `<div style="display:flex;flex-direction:column;gap:6px">${b.spots.length > 1 ? `<span class="small">${esc(s.name)}</span>` : ''}<div class="seasons">${SEASONS.map((sn) => { const ph = spotPhotos(sid).filter((p) => p.season === sn).at(-1); return ph ? `<a class="slot got" href="#/card/${ph.id}" aria-label="${esc(s.name)} ${sn} 카드"><img alt="" data-src="${ph.id}"><span>${sn}</span></a>` : `<span class="slot">${sn}</span>`; }).join('')}</div></div>`; }).join('')}</section>`).join('')
  : `<section class="section"><p class="small muted">장미광장에 심어진 ${ROSES.length}종이에요. 장미광장에서 사진을 찍고 퀴즈를 맞히면 모여요.</p>
    <div class="rose-grid">${ROSES.map((r) => { const got = state.roses.has(r.name); return `<div class="rose ${got ? 'got' : ''}"><div class="ph">${got ? `<img src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '?'}</div><span>${got ? esc(r.name) : '???'}</span></div>`; }).join('')}</div>
    <p class="tiny muted">장미 정보·사진: 한국체육산업개발(주) 올림픽공원장미정보, 올림픽공원장미광장 (문화공공데이터광장)</p></section>`}`;
  $$('[role="tab"]', view()).forEach((b) => b.addEventListener('click', () => { state.bookTab = b.dataset.t; history.replaceState(null, '', '#/book'); render(); }));
  fillThumbs();
}

// ---------- 화면: 배지 ----------
function viewBadges() {
  setTabs('badges');
  const done = new Set(doneBadges());
  const v = P.badges.filter((b) => b.group === '9경'), th = P.badges.filter((b) => b.group !== '9경');
  view().innerHTML = `
  <header class="page-head"><h1 class="logo">배지</h1><span class="small muted"><strong style="font-size:20px;color:var(--ink)">${done.size}</strong> / ${P.badges.length}</span></header>
  <section class="section"><h2>올팍 9경</h2><div class="medals">${v.map((b) => { const g = badgeProgress(b); return `<a href="#/place/${b.id}"><span class="m ${done.has(b.id) ? 'done' : ''}">${esc(badgeShort(b))}</span><span class="n">${esc(badgeTitle(b))}</span><span class="small muted">${done.has(b.id) ? '받음' : `${g.got}/${g.total}곳`}</span></a>`; }).join('')}</div></section>
  <section class="section"><h2>테마</h2>${th.map((b) => { const g = badgeProgress(b); return `<a class="theme-row" href="#/place/${b.id}"><span class="m ${done.has(b.id) ? 'done' : ''}">${esc(badgeShort(b))}</span><span class="t"><div><strong>${esc(b.name)}${b.id === 't_walk' ? ' (어디서나)' : ''}</strong><span class="muted">${g.got} / ${g.total}${g.unit}</span></div><span class="bar green"><span style="width:${(g.got / g.total) * 100}%"></span></span></span></a>`; }).join('')}
    <a class="theme-row" href="#/book?tab=rose"><span class="m">장미</span><span class="t"><div><strong>장미 도감</strong><span class="muted">${state.roses.size} / ${ROSES.length}종</span></div><span class="bar green"><span style="width:${(state.roses.size / ROSES.length) * 100}%"></span></span></span></a></section>
  <section class="section"><div class="notice green">${ICON.info}<span>모은 기록은 이 폰에만 있어요. 가끔 <a href="#/settings">설정 › 기록 백업</a>으로 백업 파일을 저장해 두세요.</span></div></section>`;
}

// ---------- 화면: 설정 ----------
function viewSettings() {
  setTabs('settings');
  view().innerHTML = `
  <header class="page-head"><h1 class="logo">설정</h1></header>
  <section class="section"><h2>기록 백업</h2>
    <p class="small muted">사진과 모은 카드를 파일 하나로 저장하고, 다른 폰이나 새 브라우저에서 불러올 수 있어요.${isIOS() ? ' 아이폰 사파리는 7일 넘게 열지 않으면 기록을 지울 수 있어요.' : ''}</p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><button class="btn" id="backup">백업 파일 저장</button><button class="btn secondary" id="restore">불러오기</button></div></section>
  <section class="section"><h2>도움말</h2><div class="list">
    <button class="row" data-act="home-help">홈 화면에 추가하는 법 ${ICON.chev}</button>
    <a href="#/check">위치 점검 모드 ${ICON.chev}</a>
    <button class="row" id="geo-toggle">${state.geoOn ? '위치 끄기' : '위치 켜기'} ${ICON.chev}</button>
    <button class="row" id="demo-toggle">${demoOn() ? '체험 모드 끄기' : '체험 모드 켜기 (공원 밖에서 둘러보기)'} ${ICON.chev}</button>
  </div></section>
  <section class="section"><h2>데이터 출처</h2><ul class="sources" style="margin:0;padding-left:18px">${P.sources.map((s) => `<li>${esc(s.name)} · ${esc(s.by)} · ${esc(s.license)}</li>`).join('')}</ul>
    <p class="small muted">사진은 서버로 보내지 않아요. 위치는 장소 확인에만 쓰고 저장하지 않아요.</p></section>
  <section class="section"><h2>기록 지우기</h2><button class="btn secondary" id="wipe" style="color:#9A3D06">이 폰의 기록 모두 지우기</button><p class="tiny muted">올팍 도감 ${VERSION}</p></section>`;
  bindCommon(view());
  $('#backup').addEventListener('click', backup);
  $('#demo-toggle').addEventListener('click', async () => { const on = !demoOn(); await setDemo(on); toast(on ? '체험 모드를 켰어요. 장소 화면에서 위치 확인 없이 카드를 받아 볼 수 있어요.' : '체험 모드를 껐어요.'); render(); });
  $('#restore').addEventListener('click', () => $('#restore-file').click());
  $('#geo-toggle').addEventListener('click', () => {
    if (state.geoOn) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; state.geoOn = false; state.fix = null; ls.set('geo', false); } else startGeo();
    render();
  });
  $('#wipe').addEventListener('click', async () => {
    if (!confirm('이 폰에 저장된 사진과 카드를 모두 지울까요? 되돌릴 수 없어요.')) return;
    await db.clear('photos'); await db.clear('roses');
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    await loadState(); toast('기록을 모두 지웠어요.'); render();
  });
}
const b64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
async function makeBackup() {
  const photos = await db.all('photos');
  return { app: 'olpark', v: 1, exportedAt: new Date().toISOString(), photos: await Promise.all(photos.map(async ({ blob, ...m }) => ({ ...m, jpg: blob ? await b64(blob) : '' }))), roses: await db.all('roses') };
}
async function backup() {
  const data = await makeBackup();
  const photos = data.photos;
  const name = `olpark-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (isIOS() && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`사진 ${photos.length}장을 백업 파일로 저장했어요.`);
}
async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'olpark') throw new Error('형식');
    let n = 0;
    for (const p of data.photos || []) {
      if (!spotById.has(p.spot) || !p.jpg) continue;
      const bin = Uint8Array.from(atob(p.jpg), (c) => c.charCodeAt(0));
      const { jpg, ...m } = p;
      await db.put('photos', { ...m, blob: new Blob([bin], { type: 'image/jpeg' }) }); n++;
    }
    for (const r of data.roses || []) if (ROSES.some((x) => x.name === (r.rose || r.name))) await db.put('roses', r);
    await loadState();
    toast(`사진 ${n}장과 장미 카드 ${(data.roses || []).length}장을 불러왔어요.`);
    render();
  } catch { toast('백업 파일을 읽지 못했어요. 올팍 도감에서 만든 파일인지 확인해 주세요.'); }
}

// ---------- 화면: 위치 점검 ----------
function viewCheck() {
  setTabs('settings');
  const draw = () => {
    const f = freshFix();
    const log = ls.get('checkLog', []);
    const near = nearestSpots(6);
    $('#check-body').innerHTML = `
      <dl class="kv"><dt>위도</dt><dd>${f ? f.lat.toFixed(6) : '-'}</dd><dt>경도</dt><dd>${f ? f.lon.toFixed(6) : '-'}</dd><dt>오차</dt><dd>${f ? Math.round(f.acc) + 'm' : '-'}</dd><dt>시각</dt><dd>${f ? new Date(f.t).toLocaleTimeString('ko-KR') : '-'}</dd><dt>판정</dt><dd>${esc(judgeText())}</dd></dl>
      <table class="cands"><thead><tr><th>지점</th><th>거리</th><th>여유</th><th>판정</th></tr></thead><tbody>${near.map((c) => `<tr><td>${esc(c.spot.name)}</td><td>${Math.round(c.d)}m</td><td>${c.spot.reach}m</td><td>${isInside(c) ? '후보' : '-'}</td></tr>`).join('')}</tbody></table>
      <p class="small muted">기록 ${log.length}건</p>`;
  };
  view().innerHTML = `<header class="page-head"><h1 class="logo">위치 점검</h1><a class="chip gray" href="#/settings">닫기</a></header>
    <section class="section"><p class="small muted">공원을 걸으며 실제 위치와 판정이 맞는지 확인하는 화면이에요. 장소 앞에서 "지금 위치 기록"을 누르고 메모를 남기면, 나중에 구역을 고칠 때 써요.</p>
    <div id="check-body"></div>
    <label class="small" for="memo">메모 (예: 장미광장 입구)</label><input id="memo" style="min-height:44px;border-radius:12px;border:1.5px solid var(--line);padding:0 12px;font:inherit">
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><button class="btn" id="rec">지금 위치 기록</button><button class="btn secondary" id="exp">기록 내보내기</button></div>
    <button class="btn ghost" id="clr">기록 지우기</button></section>`;
  startGeo();
  draw();
  $('#rec').addEventListener('click', () => {
    const f = freshFix();
    if (!f) return toast('위치를 찾는 중이에요.');
    const log = ls.get('checkLog', []);
    log.push({ t: new Date().toISOString(), lat: f.lat, lon: f.lon, acc: f.acc, memo: $('#memo').value, judge: judgeText(), near: nearestSpots(3).map((c) => ({ spot: c.spot.id, d: Math.round(c.d) })) });
    ls.set('checkLog', log); $('#memo').value = ''; draw(); toast('기록했어요.');
  });
  $('#exp').addEventListener('click', () => {
    const file = new File([JSON.stringify(ls.get('checkLog', []), null, 1)], `olpark-check-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
  });
  $('#clr').addEventListener('click', () => { if (confirm('점검 기록을 지울까요?')) { ls.set('checkLog', []); draw(); } });
  listeners.add(draw);
  return () => listeners.delete(draw);
}
function judgeText() {
  const c = candidates();
  if (c.status !== 'ok') return { wait: '위치 기다리는 중', weak: `오차 큼 (${Math.round(c.acc ?? 0)}m)`, out: '공원 밖', error: state.geoErr }[c.status] || c.status;
  return c.list.map((x) => x.spot.name).join(', ');
}

// ---------- 홈 화면 추가 안내 ----------
function homeHelp() {
  const ios = isIOS();
  openModal(`<div class="sheet"><span class="grip" aria-hidden="true"></span><h2>홈 화면에 추가하기</h2>
    ${ios ? `<ol class="steps"><li><b>1</b><span>사파리 아래쪽의 <strong>공유 버튼</strong>(네모에서 화살표가 나오는 모양)을 눌러요.</span></li><li><b>2</b><span>목록에서 <strong>홈 화면에 추가</strong>를 눌러요.</span></li><li><b>3</b><span>오른쪽 위 <strong>추가</strong>를 누르면 홈 화면에 올팍 도감이 생겨요.</span></li></ol>
      <p class="small muted">홈 화면에서 열면 앱처럼 쓸 수 있고, 7일이 지나도 기록이 지워지지 않아요. 단, 사파리에서 쓰던 기록은 홈 화면 앱으로 옮겨지지 않으니 <strong>설정 › 기록 백업</strong>으로 옮겨 주세요.</p>`
    : `<ol class="steps"><li><b>1</b><span>브라우저 오른쪽 위 <strong>메뉴(⋮)</strong>를 눌러요.</span></li><li><b>2</b><span><strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를 눌러요.</span></li></ol>`}
    <button class="btn" id="ok" autofocus>알겠어요</button></div>`, (m) => $('#ok', m).addEventListener('click', closeModal));
}

// ---------- 라우터 ----------
function render() {
  unbindView?.();
  unbindView = null;
  closeModal();
  const [path, query] = (location.hash.slice(1) || '/').split('?');
  const q = new URLSearchParams(query || '');
  const parts = path.split('/').filter(Boolean);
  if (!ls.get('started', false) && parts[0] !== 'start') { location.replace('#/start'); return; }
  switch (parts[0]) {
    case 'start': viewStart(); break;
    case 'place': unbindView = viewPlace(parts[1]); fillThumbs(); break;
    case 'card': viewCard(parts[1], q.get('new') === '1'); break;
    case 'book': viewBook(q.get('tab')); break;
    case 'badges': viewBadges(); break;
    case 'settings': viewSettings(); break;
    case 'check': unbindView = viewCheck(); break;
    default: unbindView = viewMap();
  }
  if (!parts[0] || parts[0] === 'map' || parts[0] === 'place') view().focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function main() {
  try {
    await loadData();
    await loadState();
  } catch (e) {
    view().innerHTML = `<p style="padding:24px">데이터를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>`;
    throw e;
  }
  if (ls.get('geo', false)) startGeo();
  $('#cam').addEventListener('change', (e) => onPhotoPicked(e.target.files[0]));
  $('#restore-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restore(f); });
  addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
// 시험 도구
window.__olpark = { state, candidates, distToSpot, db, P: () => P, ROSES: () => ROSES, savePhoto, shrink, render, makeBackup, restore, loadState, cardCount, setDemo };
