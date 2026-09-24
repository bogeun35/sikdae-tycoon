/**
 * 개발용 그림 검수판 (art-gallery.html, vite dev 에서만). 빌드 결과물에는 들어가지 않는다.
 *   ?g=targets|chars|items|icons|decor|ambient|fx|nodes|bg|maps|scene|all
 *   &bg=<색> 칸 바탕, &z=<배율> 표시 배율, &d=<상권> &o=land|port (maps·scene)
 */
import { Application, Container, Sprite, NineSliceSprite, Graphics, Texture, Text } from 'pixi.js';
import { loadFonts, FONT_STACK } from '../fonts';
import { SPRITE_KEYS, SIZES, EXTRA_KEYS, svg, loadAll, loadMap, mapLayers, tex, type DistrictId, type Orient } from './index';

const q = new URLSearchParams(location.search);
const G = q.get('g') || 'all';
const Z = Number(q.get('z') || 0);
const BG = q.get('bg') || '';

const done = (extra: Record<string, unknown> = {}) => {
  (window as unknown as { __artReport: unknown }).__artReport = extra;
  window.__sikdae = { ready: true, platform: 'gallery', renderer: '', gpu: '', fps: 0, launches: 0, fullscreen: false, errors: [] };
};

const css = `
body{margin:0;background:${BG || '#fff8ec'};font-family:'Malgun Gothic',sans-serif;color:#2a2118}
.grid{display:flex;flex-wrap:wrap;gap:6px;padding:8px;align-items:flex-end}
.cell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border-radius:10px;background:rgba(255,255,255,.55)}
.cell img{display:block;image-rendering:auto}
.cell span{font-size:10px;color:#5c3a1a;white-space:nowrap}
h2{margin:6px 10px;font-size:15px}
`;
const st = document.createElement('style');
st.textContent = css;
document.head.appendChild(st);
const app = document.getElementById('app')!;

function group(keys: string[], title: string, zoom: number, cellBg?: string): Promise<void>[] {
  const h = document.createElement('h2');
  h.textContent = `${title} (${keys.length})`;
  app.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'grid';
  app.appendChild(grid);
  return keys.map((k) => {
    const s = SIZES[k];
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (cellBg) cell.style.background = cellBg;
    const img = new Image();
    const [id, stt] = k.split('@');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(id, stt));
    img.width = Math.round(s.w * zoom);
    img.height = Math.round(s.h * zoom);
    const lab = document.createElement('span');
    lab.textContent = k;
    cell.append(img, lab);
    grid.appendChild(cell);
    return img.decode().catch(() => undefined);
  });
}

const ST = q.get('st');
const ONLY = q.get('only')?.split(',');
const by = (pre: string) =>
  [...SPRITE_KEYS, ...EXTRA_KEYS].filter((k) => k.startsWith(pre) && (!ST || k.endsWith('@' + ST) || !k.includes('@')) && (!ONLY || ONLY.some((o) => k.startsWith(o))));

async function domGallery(): Promise<void> {
  const ps: Promise<void>[] = [];
  const want = (g: string) => G === 'all' || G === g;
  if (want('targets')) {
    const ks = by('t.').sort((a, b) => (a.split('@')[0] === b.split('@')[0] ? 0 : a < b ? -1 : 1));
    ps.push(...group(ks, '대상', Z || 1.2, BG ? undefined : '#e9d6b3'));
  }
  if (want('chars')) ps.push(...group(by('c.'), '영업 대표', Z || 0.7));
  if (want('items')) ps.push(...group(by('i.'), '아이템', Z || 1));
  if (want('icons')) ps.push(...group(by('ic.'), '아이콘', Z || 1));
  if (want('decor')) ps.push(...group(by('d.'), '장식', Z || 1, BG ? undefined : '#e9d6b3'));
  if (want('ambient')) ps.push(...group([...by('a.'), ...by('o.')], '배경 움직임·물체', Z || 1.2, BG ? undefined : '#c9b89c'));
  if (want('fx')) ps.push(...group(by('fx.').filter((k) => !['fx.hole', 'fx.vignette'].includes(k)), '효과', Z || 0.6, BG ? undefined : '#6b7fa8'));
  if (want('fxbig')) ps.push(...group(['fx.hole', 'fx.vignette', 'fx.glow', 'fx.rays', 'fx.radius', 'fx.qrRing', 'fx.whirl'], '큰 효과', Z || 0.3, '#8fa0c8'));
  if (want('nodes')) ps.push(...group(by('n.'), '트리 칸', Z || 1.5, BG ? undefined : '#2b3f8a'));
  if (want('bg')) ps.push(...group([...by('bg.office'), ...by('bg.cloud'), 'ui.logo'], '배경·로고', Z || 0.4, BG ? undefined : '#bcd7ff'));
  if (want('title')) ps.push(...group(by('bg.title'), '타이틀', Z || 0.4));
  if (want('maps')) {
    const d = q.get('d');
    ps.push(...group(by('m.').filter((k) => !d || k.includes(`.${d}.`)).filter((k) => k.includes('ground')), '지도 바닥', Z || 0.45));
  }
  await Promise.all(ps);
  done({ count: ps.length });
}

/** 지도 + 대상을 실제 크기로 배치한 합성 장면 (실제 파이프라인: loadAll + loadMap) */
async function scene(): Promise<void> {
  const d = (q.get('d') || 'euljiro') as DistrictId;
  const o = (q.get('o') || 'land') as Orient;
  const L = mapLayers(d, o);
  const pixi = new Application();
  const vw = innerWidth, vh = innerHeight;
  await pixi.init({ width: vw, height: vh, preference: 'webgl', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true, background: '#000000' });
  app.appendChild(pixi.canvas);
  const t0 = performance.now();
  const texs = await loadAll(pixi.renderer);
  const t1 = performance.now();
  const m = await loadMap(pixi.renderer, d, o);
  const t2 = performance.now();
  const world = new Container();
  const sc = Math.min(vw / L.W, vh / L.H);
  world.scale.set(sc);
  world.position.set((vw - L.W * sc) / 2, (vh - L.H * sc) / 2);
  pixi.stage.addChild(world);
  world.addChild(new Sprite(m.ground));
  if (m.roads !== Texture.EMPTY) world.addChild(new Sprite(m.roads));
  const actors = new Container();
  actors.sortableChildren = true;
  const shadows = new Container();
  world.addChild(shadows, actors);
  const k = o === 'port' ? 106 / 129 : 1;
  for (const dc of L.decor) {
    const s = new Sprite(tex(dc.svgId));
    s.anchor.set(0.5, 1);
    const side = L.lot * dc.s * 1.1;
    s.width = side * (SIZES[dc.svgId].w / Math.max(SIZES[dc.svgId].w, SIZES[dc.svgId].h));
    s.height = side * (SIZES[dc.svgId].h / Math.max(SIZES[dc.svgId].w, SIZES[dc.svgId].h));
    s.position.set(dc.x, dc.y);
    s.zIndex = dc.y;
    actors.addChild(s);
  }
  const lotIds = ['c01', 'r01', 'c02', 'r02', 'c03', 'c04', 'r04', 'c05', 'c06', 'r07', 'c07', 'r08'];
  const bigIds = ['r05', 'c08', 'r09', 'c09', 'r10', 'c10'];
  const states = ['idle', 'hit', 'happy', 'blink'];
  const put = (id: string, x: number, y: number, stt: string) => {
    const key = `t.${id}@${stt}`;
    const sz = SIZES[key];
    const sh = new Sprite(tex('o.shadow'));
    sh.anchor.set(0.5);
    sh.width = sz.w * k * 0.84;
    sh.height = sz.w * k * 0.24;
    sh.position.set(x, y);
    shadows.addChild(sh);
    const s = new Sprite(tex(key));
    s.anchor.set(0.5, 0.8);
    s.scale.set(k);
    s.position.set(x, y);
    s.zIndex = y;
    actors.addChild(s);
  };
  const slots = L.spawnSlots;
  const lots = slots.filter((s) => s.kind === 'lot');
  const bigs = slots.filter((s) => s.kind === 'big');
  const used = new Set<number>();
  let n = 0;
  for (let i = 0; i < bigs.length && n < 6; i += 3) {
    const b = bigs[i];
    if (b.lots!.some((l) => used.has(l))) continue;
    b.lots!.forEach((l) => used.add(l));
    put(bigIds[n % bigIds.length], b.x, b.y, states[n % 4]);
    n++;
  }
  let j = 0;
  for (const s of lots) {
    if (used.has(s.id)) continue;
    if ((s.id * 7) % 3 === 0) continue;
    put(lotIds[j % lotIds.length], s.x, s.y, states[(j + 1) % 4]);
    j++;
  }
  const plaza = slots.find((s) => s.kind === 'plaza');
  if (plaza && q.get('boss')) put('boss', plaza.x, plaza.y, 'idle');
  // 도로 위 이동형
  const rt = L.routes;
  for (let i = 0; i < rt.length; i++) {
    const r = rt[i];
    const f = 0.3 + 0.15 * i;
    const x = r.pts[0].x + (r.pts[1].x - r.pts[0].x) * f, y = r.pts[0].y + (r.pts[1].y - r.pts[0].y) * f;
    const id = i % 2 ? 'r03' : 'r06';
    put(id, x, y, r.ax === 'h' ? 'idle' : i % 2 ? 'down' : 'up');
    const car = new Sprite(tex(`a.car${i % 4}@${r.ax}`));
    car.anchor.set(0.5);
    car.scale.set(k);
    const f2 = f + 0.3;
    car.position.set(r.pts[0].x + (r.pts[1].x - r.pts[0].x) * f2, r.pts[0].y + (r.pts[1].y - r.pts[0].y) * f2);
    car.zIndex = car.y;
    actors.addChild(car);
  }
  for (let i = 0; i < 10; i++) {
    const cw = L.crosswalks[(i * 5) % L.crosswalks.length];
    const w = new Sprite(tex(`a.walker${i % 4}@${i % 2 ? 'a' : 'b'}`));
    w.anchor.set(0.5, 1);
    w.scale.set(k);
    w.position.set(cw.x + cw.w / 2, cw.y + cw.h / 2 + 10);
    w.zIndex = w.y;
    actors.addChild(w);
  }
  if (q.get('radius') !== '0') {
    const rad = new Sprite(tex('fx.radius'));
    rad.anchor.set(0.5);
    rad.width = rad.height = 150 * 2 * (o === 'port' ? 1.167 / 1.42 : 1);
    rad.position.set(L.W * 0.52, L.H * 0.55);
    world.addChild(rad);
  }
  const cloud = new Sprite(tex('a.cloudShadow'));
  cloud.anchor.set(0.5);
  cloud.position.set(L.W * 0.3, L.H * 0.35);
  world.addChild(cloud);
  if (q.get('fx')) {
    // 엔진과 같은 모양: 도장(잉크+테+두 줄 글자, 0.42 배) · 말풍선 9-slice · 금 배너 9-slice
    await loadFonts();
    const mkStamp = (x: number, y: number, sc: number, rot: number) => {
      const c = new Container();
      const ink = new Sprite(tex('fx.stampInk'));
      ink.anchor.set(0.5);
      ink.alpha = 0.85;
      const ring = new Sprite(tex('fx.stamp'));
      ring.anchor.set(0.5);
      const txt = new Text({ text: '영업\n성공!', style: { fontFamily: FONT_STACK, fontSize: 80, lineHeight: 78, align: 'center', fill: '#e53935', stroke: { color: '#ffffff', width: 9, join: 'round' }, letterSpacing: -2 } });
      txt.anchor.set(0.5);
      c.addChild(ink, ring, txt);
      c.position.set(x, y);
      c.rotation = rot;
      c.scale.set(sc);
      world.addChild(c);
    };
    mkStamp(L.W * 0.7, L.H * 0.36, 0.62 * 0.42 * 1.6, -0.18);
    mkStamp(L.W * 0.3, L.H * 0.62, 0.62 * 0.42 * 1, -0.1);
    const bub = new NineSliceSprite({ texture: tex('fx.bubble'), leftWidth: 40, topHeight: 36, rightWidth: 40, bottomHeight: 44 });
    const bt = new Text({ text: '중견기업 계약!', style: { fontFamily: FONT_STACK, fontSize: 30, fill: '#5c3a1a' } });
    bt.anchor.set(0.5);
    const bw = Math.max(160, bt.width + 70);
    bub.width = bw;
    bub.height = 100;
    const bc = new Container();
    bub.position.set(-bw / 2, -100);
    bt.position.set(0, -58);
    bc.addChild(bub, bt);
    bc.position.set(L.W * 0.5, L.H * 0.3);
    bc.scale.set(0.62);
    world.addChild(bc);
    const ban = new NineSliceSprite({ texture: tex('fx.banner'), leftWidth: 90, topHeight: 40, rightWidth: 90, bottomHeight: 40 });
    ban.width = 820;
    ban.height = 140;
    const bnt = new Text({ text: '대형 계약', style: { fontFamily: FONT_STACK, fontSize: 64, fill: '#ffffff', stroke: { color: '#8a5a2a', width: 10, join: 'round' } } });
    bnt.anchor.set(0.5);
    const bnc = new Container();
    ban.position.set(-410, -70);
    bnt.position.set(0, -4);
    bnc.addChild(ban, bnt);
    bnc.position.set(L.W * 0.5, L.H * 0.12);
    bnc.scale.set(0.7);
    world.addChild(bnc);
  }
  const g = new Graphics();
  g.rect(L.area.x, L.area.y, L.area.w, L.area.h).stroke({ color: 0xe53935, width: q.get('area') ? 3 : 0, alpha: 0.6 });
  world.addChild(g);
  done({ keys: Object.keys(texs).length, loadAllMs: Math.round(t1 - t0), loadMapMs: Math.round(t2 - t1) });
}

/** 지도 한 장: ground + roads 를 겹쳐 실제 크기로 */
async function mapView(): Promise<void> {
  const d = (q.get('d') || 'euljiro') as DistrictId;
  const o = (q.get('o') || 'land') as Orient;
  const L = mapLayers(d, o);
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:${L.W}px;height:${L.H}px;transform-origin:0 0;transform:scale(${Z || 1})`;
  const ps: Promise<unknown>[] = [];
  for (const k of [L.ground, L.roadsLayer]) {
    const img = new Image();
    const [id, stt] = k.split('@');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(id, stt));
    img.style.cssText = 'position:absolute;left:0;top:0';
    wrap.appendChild(img);
    ps.push(img.decode().catch(() => undefined));
  }
  app.appendChild(wrap);
  document.body.style.margin = '0';
  await Promise.all(ps);
  done({});
}

/** 계약 key 전부: 전용 그림이 있는지(기본 그림으로 빠지지 않는지)·SVG 크기·금지 요소 검사 */
function check(): void {
  const warns: string[] = [];
  const ow = console.warn;
  console.warn = (...a: unknown[]) => warns.push(a.map(String).join(' '));
  const bad: string[] = [];
  const big: [string, number][] = [];
  let total = 0;
  for (const k of [...SPRITE_KEYS, ...EXTRA_KEYS]) {
    const [id, stt] = k.split('@');
    const s = svg(id, stt);
    total += s.length;
    if (/<text|<image|foreignObject|href="(?!#)/.test(s)) bad.push(k);
    big.push([k, s.length]);
  }
  console.warn = ow;
  big.sort((a, b) => b[1] - a[1]);
  const groups: Record<string, number> = {};
  for (const k of SPRITE_KEYS) groups[SIZES[k].group] = (groups[SIZES[k].group] || 0) + 1;
  const tgt = big.filter(([k]) => k.startsWith('t.'));
  const tAvg = Math.round(tgt.reduce((a, [, n]) => a + n, 0) / Math.max(1, tgt.length) / 1024);
  // 타이틀 배경 디코드 시간 (게임 시작 때 가장 먼저 굽는 큰 그림)
  const t0 = performance.now();
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg('bg.title', 'land'));
  img
    .decode()
    .catch(() => undefined)
    .then(() => {
      const c = document.createElement('canvas');
      c.width = 1920;
      c.height = 1080;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const titleMs = Math.round(performance.now() - t0);
      done({ keys: SPRITE_KEYS.length, extra: EXTRA_KEYS.length, groups, warns, bad, totalKB: Math.round(total / 1024), tAvgKB: tAvg, titleMs, biggest: big.slice(0, 8).map(([k, n]) => `${k} ${Math.round(n / 1024)}KB`) });
    });
}

if (G === 'check') check();
else if (G === 'mapview') mapView().catch((e) => { console.error(e); done({ error: String(e) }); });
else if (G === 'scene') scene().catch((e) => { console.error(e); done({ error: String(e) }); });
else domGallery().catch((e) => { console.error(e); done({ error: String(e) }); });
