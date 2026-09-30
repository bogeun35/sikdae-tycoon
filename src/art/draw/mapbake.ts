/**
 * 생성 지도(MapData, src/game/map/gen.ts) → Canvas2D 한 장 (설계서 5-5).
 * 바닥 · 가장자리 띠 · 보도 · 블록(부지 판·광장·공원) · 차도 · 가운데 선 · 횡단보도 · 다리 · 상권 특색 · 정적 장식을 한 번에 굽는다.
 * SVG 문자열·decode 를 쓰지 않음. 장식 그림은 이미 구운 아틀라스(loadAll)에서 잘라 그린다.
 */
import type { MapBlock, MapData, MapPt, MapStreet } from '../../game/data';
import { cumLen, distLine, hash32, offsetClosed, offsetLine, poseAt, rng, type Pt } from '../../game/map/geom';
import { darken, edge, lighten, mix, rgb } from '../kit';
import { DISTRICTS } from '../registry';

export interface SpriteSrc { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }
type G = CanvasRenderingContext2D;
type Pal = (typeof DISTRICTS)[string]['pal'];

const rgba = (c: string, a: number): string => {
  const [r, g, b] = rgb(c);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
};
function line(g: G, p: MapPt[]): void {
  g.beginPath();
  g.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
}
function poly(g: G, p: MapPt[]): void {
  line(g, p);
  g.closePath();
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
function circ(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
}
function ell(g: G, x: number, y: number, rx: number, ry: number, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}
function tile(w: number, h: number, draw: (c: G) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w * 2;
  cv.height = h * 2;
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  draw(c);
  return cv;
}
/** 패턴(논리 px 기준 타일). 타일 캔버스는 2배로 그려 두고 패턴 행렬로 절반 */
function pat(g: G, w: number, h: number, draw: (c: G) => void, rot = 0): CanvasPattern {
  const p = g.createPattern(tile(w, h, draw), 'repeat')!;
  const mtx = new DOMMatrix().rotate(rot).scale(0.5, 0.5);
  p.setTransform(mtx);
  return p;
}

interface Ctx { g: G; m: MapData; p: Pal; night: boolean; wc: string; pav: CanvasPattern; asp: string; aspF: CanvasPattern; r: () => number; L: number }

export function bakeMap(g: G, m: MapData, res: number, sprite?: (key: string) => SpriteSrc | null): void {
  const d = DISTRICTS[m.district];
  const p = d.pal;
  const night = m.district === 'pangyo';
  const wc = night ? '#4a5888' : m.district === 'euljiro' ? '#ecd6c0' : mix(p.ground, '#ffffff', 0.45);
  g.setTransform(res, 0, 0, res, 0, 0);
  g.lineJoin = 'round';
  const pav = pat(g, 18, 18, (c) => {
    if (m.district === 'euljiro') {
      c.fillStyle = rgba('#e4b89a', 0.25);
      rr(c, 1, 1, 16, 16, 2);
      c.fill();
    }
    c.strokeStyle = rgba(darken(wc, 0.86), night ? 0.35 : 0.45);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 0.5);
    c.lineTo(18, 0.5);
    c.moveTo(0.5, 0);
    c.lineTo(0.5, 18);
    c.stroke();
  });
  const asp = night ? '#1f2850' : p.road;
  const aspF = pat(g, 30, 30, (c) => {
    c.fillStyle = asp;
    c.fillRect(0, 0, 30, 30);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    circ(c, 6, 8, 1.2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.06)';
    circ(c, 20, 22, 1.4);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.07)';
    circ(c, 24, 6, 0.9);
    c.fill();
  });
  const c: Ctx = { g, m, p, night, wc, pav, asp, aspF, r: rng(hash32('bake', m.seed ?? 0, m.district, m.orient)), L: m.lot };
  ground(c);
  bands(c);
  const streets = m.streets || [];
  sidewalkRing(c);
  for (const s of streets) if (!s.stub) sidewalk(c, s);
  blocks(c);
  for (const s of streets) if (s.stub) sidewalk(c, s);
  for (const s of streets) asphalt(c, s);
  for (const s of streets) centerLine(c, s);
  crosswalks(c);
  bridges(c);
  edges(c);
  flavor(c);
  // A district-colored pavement sign remains recognizable on procedurally generated maps.
  g.save();
  const signW = Math.min(350, m.W * 0.58), sx = (m.W-signW)/2, sy = m.area.y + 8;
  g.fillStyle = p.accent; g.globalAlpha = 0.9;
  g.beginPath(); g.roundRect(sx,sy,signW,42,12);g.fill();
  g.globalAlpha = 1;g.fillStyle='#ffffff';g.font='bold 23px Jua, sans-serif';g.textAlign='center';g.textBaseline='middle';
  const landmarks: Record<string,string> = {euljiro:'골목 상권',gangnam:'스타트업 거리',yeouido:'한강 금융가',pangyo:'네온 테크밸리',magok:'초록 연구단지',sejong:'벚꽃 정부청사'};
  g.fillText(d.name+' · '+landmarks[m.district],m.W/2,sy+22,signW-16);g.restore();
  if (sprite) decor(c, sprite);
}

/* ───────── 바닥 ───────── */

function ground(c: Ctx): void {
  const { g, m, p, night } = c;
  g.fillStyle = p.ground;
  g.fillRect(0, 0, m.W, m.H);
  const lg = g.createLinearGradient(0, 0, m.W, m.H);
  lg.addColorStop(0, rgba('#ffffff', night ? 0.03 : 0.22));
  lg.addColorStop(0.6, rgba('#ffffff', 0));
  lg.addColorStop(1, rgba(night ? '#000014' : '#c8a070', night ? 0.25 : 0.08));
  g.fillStyle = lg;
  g.fillRect(0, 0, m.W, m.H);
  g.fillStyle = pat(g, 26, 26, (t) => {
    t.fillStyle = rgba(darken(p.ground, 0.8), 0.18);
    circ(t, 4, 5, 1.3);
    t.fill();
    t.fillStyle = rgba('#ffffff', night ? 0.06 : 0.35);
    circ(t, 17, 15, 1);
    t.fill();
    t.fillStyle = rgba(darken(p.ground, 0.8), 0.12);
    circ(t, 10, 21, 0.9);
    t.fill();
  });
  g.fillRect(0, 0, m.W, m.H);
}

function wave(g: G, x: number, y: number, w: number, amp: number, len: number): void {
  g.beginPath();
  g.moveTo(x, y);
  const n = Math.max(2, Math.ceil(w / (len / 4)));
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * w;
    g.lineTo(x + t, y + Math.sin((t / len) * Math.PI * 2) * amp);
  }
}

function bands(c: Ctx): void {
  const { g, m, p } = c;
  for (const b of m.bands) {
    if (b.kind === 'water') {
      const wcol = p.water ?? '#8fd3ff';
      const inner = b.y + b.h;
      const lg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      lg.addColorStop(0, darken(wcol, 0.82));
      lg.addColorStop(0.7, wcol);
      lg.addColorStop(1, lighten(wcol, 0.25));
      g.fillStyle = lg;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2.4;
      for (let i = 0; i < Math.floor(b.h / 22); i++) {
        const y = b.y + 14 + i * 22;
        const off = (i % 2) * 40;
        for (let x = -off; x < b.w; x += 180) {
          g.globalAlpha = 0.35 + c.r() * 0.25;
          wave(g, x + c.r() * 30, y, 70 + c.r() * 40, 3.4, 22);
          g.stroke();
        }
      }
      g.globalAlpha = 0.45;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 26; i++) {
        ell(g, c.r() * b.w, b.y + 8 + c.r() * (b.h - 20), 8 + c.r() * 10, 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#e9dcc0';
      g.fillRect(b.x, inner - 22, b.w, 22);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(b.x, inner - 22, b.w, 5);
      g.fillStyle = '#cfe7b8';
      g.fillRect(b.x, inner - 14, b.w, 8);
      g.strokeStyle = rgba(darken(wcol, 0.7), 0.5);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(b.x, inner - 22);
      g.lineTo(b.x + b.w, inner - 22);
      g.stroke();
    } else {
      g.fillStyle = c.wc;
      g.fillRect(b.x, b.y - 10, b.w, b.h + 20);
      const lg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      lg.addColorStop(0, lighten(p.road, 0.08));
      lg.addColorStop(1, darken(p.road, 0.95));
      g.fillStyle = lg;
      g.fillRect(b.x, b.y, b.w, b.h);
      const lane = b.h / 8;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 2.4;
      g.setLineDash([26, 22]);
      g.beginPath();
      for (let i = 1; i < 8; i++) {
        if (i === 4) continue;
        g.moveTo(0, b.y + i * lane);
        g.lineTo(b.w, b.y + i * lane);
      }
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = '#ffe28a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, b.y + 4 * lane - 2);
      g.lineTo(b.w, b.y + 4 * lane - 2);
      g.moveTo(0, b.y + 4 * lane + 2);
      g.lineTo(b.w, b.y + 4 * lane + 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(0, b.y + 1.5);
      g.lineTo(b.w, b.y + 1.5);
      g.moveTo(0, b.y + b.h - 1.5);
      g.lineTo(b.w, b.y + b.h - 1.5);
      g.stroke();
      g.fillStyle = 'rgba(169,216,143,0.9)';
      for (let x = 60; x < b.w; x += 240) {
        rr(g, x, b.y - 8, 80, 6, 3);
        g.fill();
        rr(g, x, b.y + b.h + 2, 80, 6, 3);
        g.fill();
      }
    }
  }
}

/* ───────── 보도 ───────── */

function sidewalkRing(c: Ctx): void {
  const { g, m } = c;
  const side = m.road * 0.18;
  const q = m.grid;
  for (const f of [c.wc, c.pav]) {
    g.fillStyle = f;
    rr(g, q.x - side, q.y - side, q.w + side * 2, q.h + side * 2, 16);
    g.fill();
  }
}
function sidewalk(c: Ctx, s: MapStreet): void {
  const { g } = c;
  g.lineCap = s.stub ? 'round' : 'butt';
  g.lineWidth = s.w;
  for (const f of [c.wc, c.pav]) {
    g.strokeStyle = f;
    line(g, s.pts);
    g.stroke();
  }
  g.lineCap = 'butt';
}

/* ───────── 블록 ───────── */

function blockStyle(c: Ctx, b: MapBlock): { shadow: string; outline: string; fill: CanvasGradient | string } {
  const { g, p, night } = c;
  const lg = g.createLinearGradient(b.x, b.y, b.x + b.w * 0.4, b.y + b.h);
  if (b.kind === 'lots') {
    lg.addColorStop(0, lighten(p.block, 0.18));
    lg.addColorStop(1, p.block);
    return { shadow: night ? rgba('#000010', 0.35) : rgba(darken(p.ground, 0.55), 0.16), outline: night ? '#26305a' : darken(p.block, 0.86), fill: lg };
  }
  if (b.kind === 'plaza') return { shadow: 'rgba(0,0,0,0.1)', outline: night ? '#3a4678' : '#e6cf9a', fill: night ? '#56639a' : '#fff4d4' };
  lg.addColorStop(0, lighten(p.park, 0.15));
  lg.addColorStop(1, p.park);
  return { shadow: `rgba(0,0,0,${night ? 0.3 : 0.12})`, outline: darken(p.park, 0.8), fill: lg };
}

function blocks(c: Ctx): void {
  const { g, m, L } = c;
  const rad = L * 0.12;
  const list = m.blocks.filter((b) => b.poly && b.poly.length > 2).map((b) => ({ b, core: offsetClosed(b.poly!, rad), st: blockStyle(c, b) }));
  /* 그림자 → 테두리 → 채움 순서로 전부 한 번씩(막다른 골목으로 합친 블록 사이에 선이 안 보이게) */
  g.save();
  g.translate(5, 7);
  for (const q of list) {
    g.fillStyle = q.st.shadow;
    g.strokeStyle = q.st.shadow;
    g.lineWidth = rad * 2;
    poly(g, q.core);
    g.fill();
    g.stroke();
  }
  g.restore();
  for (const q of list) {
    g.strokeStyle = q.st.outline;
    g.lineWidth = rad * 2 + 3;
    poly(g, q.core);
    g.stroke();
  }
  for (const q of list) {
    g.fillStyle = q.st.fill;
    g.strokeStyle = q.st.fill;
    g.lineWidth = Math.max(1, rad * 2 - 3);
    poly(g, q.core);
    g.fill();
    g.stroke();
  }
  const lotsBy = new Map<number, typeof m.spawnSlots>();
  for (const s of m.spawnSlots) if (s.kind === 'lot') (lotsBy.get(s.block) || lotsBy.set(s.block, []).get(s.block)!).push(s);
  for (const q of list) {
    const b = q.b;
    if (b.kind === 'lots') lotPads(c, b, lotsBy.get(b.id) || []);
    else if (b.kind === 'plaza') plaza(c, b, q.core);
    else park(c, b, q.core);
  }
}

function lotPads(c: Ctx, b: MapBlock, lots: MapData['spawnSlots']): void {
  const { g, p, night, L, m } = c;
  const bc = p.block;
  const inset = L * 0.07;
  const w = L - inset * 2;
  const tiles = pat(g, 16, 16, (t) => {
    t.fillStyle = `rgba(255,255,255,${night ? 0.05 : 0.22})`;
    rr(t, 1, 1, 14, 14, 3);
    t.fill();
  });
  const gc = mix(p.park, bc, 0.25);
  const dc = mix('#ead8b8', bc, 0.4);
  for (const q of lots) {
    const v = hash32(m.seed ?? 0, q.id, q.x | 0) >>> 0;
    const kind = v % 7;
    g.save();
    g.translate(q.x, q.y);
    if (q.a) g.rotate(q.a);
    const x = -w / 2, y = -w / 2;
    if (night) {
      g.fillStyle = kind === 5 ? '#2f5448' : '#34437a';
      g.strokeStyle = '#4a5a94';
      g.lineWidth = 1.6;
      rr(g, x, y, w, w, L * 0.1);
      g.fill();
      g.stroke();
      if (kind === 3 || kind === 4) {
        g.fillStyle = tiles;
        rr(g, x + 3, y + 3, w - 6, w - 6, L * 0.08);
        g.fill();
      }
    } else if (kind === 5) {
      const lg = g.createLinearGradient(x, y, x, y + w);
      lg.addColorStop(0, lighten(gc, 0.2));
      lg.addColorStop(1, gc);
      g.fillStyle = lg;
      g.strokeStyle = rgba(darken(gc, 0.85), 0.8);
      g.lineWidth = 1.6;
      rr(g, x, y, w, w, L * 0.1);
      g.fill();
      g.stroke();
      g.strokeStyle = rgba(darken(gc, 0.7), 0.6);
      g.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) {
        const tx = x + w * (0.18 + ((v >> (k * 3)) % 7) * 0.1), ty = y + w * (0.2 + ((v >> (k * 5 + 1)) % 6) * 0.12);
        g.beginPath();
        g.moveTo(tx - 4, ty + 2);
        g.quadraticCurveTo(tx - 2, ty - 3, tx, ty + 2);
        g.quadraticCurveTo(tx + 2, ty - 4, tx + 4, ty + 2);
        g.stroke();
      }
    } else if (kind === 6) {
      g.fillStyle = dc;
      g.strokeStyle = rgba(darken(dc, 0.88), 0.8);
      g.lineWidth = 1.6;
      g.setLineDash([6, 5]);
      rr(g, x, y, w, w, L * 0.1);
      g.fill();
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = rgba(darken(dc, 0.92), 0.6);
      ell(g, x + w * 0.3, y + w * 0.7, w * 0.12, w * 0.06);
      g.fill();
      ell(g, x + w * 0.7, y + w * 0.35, w * 0.09, w * 0.05);
      g.fill();
    } else {
      g.fillStyle = lighten(bc, 0.3);
      g.strokeStyle = rgba(darken(bc, 0.9), 0.8);
      g.lineWidth = 1.6;
      rr(g, x, y, w, w, L * 0.1);
      g.fill();
      g.stroke();
      if (kind >= 3) {
        g.fillStyle = tiles;
        rr(g, x + 3, y + 3, w - 6, w - 6, L * 0.08);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.25)';
      rr(g, x + 4, y + 4, w - 8, w * 0.18, L * 0.06);
      g.fill();
    }
    g.fillStyle = night ? rgba('#3f6a5a', 0.85) : rgba(mix(p.park, '#5fa860', 0.3), 0.85);
    circ(g, x + w - 8, y + w - 8, 4.2);
    g.fill();
    g.restore();
  }
  /* 을지로: 부지 사이 좁은 골목 */
  if (b.gaps && b.gaps.length) {
    g.lineCap = 'round';
    for (const [col, lw] of [[rgba('#c9a47c', 0.6), 9.2], ['#e2c6a4', 8]] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      for (const q of b.gaps) {
        g.moveTo(q[0].x, q[0].y);
        for (let i = 1; i < q.length; i++) g.lineTo(q[i].x, q[i].y);
      }
      g.stroke();
    }
    g.lineCap = 'butt';
  }
}

function plaza(c: Ctx, b: MapBlock, core: Pt[]): void {
  const { g, night, L, m } = c;
  const slot = m.spawnSlots.find((s) => s.kind === 'plaza' && s.block === b.id);
  const cx = slot ? slot.x : b.cx, cy = slot ? slot.y : b.cy;
  g.fillStyle = pat(g, 24, 24, (t) => {
    t.fillStyle = night ? '#5c6aa2' : '#fff9e6';
    rr(t, 1, 1, 22, 22, 3);
    t.fill();
    t.strokeStyle = night ? '#4a5690' : '#f0dfb8';
    t.lineWidth = 1;
    t.beginPath();
    t.moveTo(0, 12);
    t.lineTo(24, 12);
    t.moveTo(12, 0);
    t.lineTo(12, 24);
    t.stroke();
  });
  g.strokeStyle = g.fillStyle;
  g.lineWidth = Math.max(1, L * 0.12 * 2 - 12);
  poly(g, core);
  g.fill();
  g.stroke();
  const clear = b.poly ? distLine({ x: cx, y: cy }, b.poly, true) : Math.min(b.w, b.h) / 2;
  const r = Math.max(L * 0.5, Math.min(clear * 0.86, Math.min(b.w, b.h) * 0.4));
  const ring = (rad: number, fill: string | null, stroke: string, sw: number, dash?: number[]) => {
    circ(g, cx, cy, rad);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.strokeStyle = stroke;
    g.lineWidth = sw;
    if (dash) g.setLineDash(dash);
    g.stroke();
    g.setLineDash([]);
  };
  ring(r, night ? '#6272b0' : '#ffeebb', night ? '#8a96d0' : '#f0c870', 5);
  ring(r * 0.78, null, night ? '#8a96d0' : '#f5d58c', 3, [10, 8]);
  ring(r * 0.5, night ? '#6a7ab8' : '#fff6d6', night ? '#9aa6e0' : '#f0c870', 4);
  g.strokeStyle = night ? '#9aa6e0' : '#f5cf7a';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
    g.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
  }
  g.stroke();
  const k = r / 40;
  g.beginPath();
  const star = [[0, -16], [4.6, -5], [16, -5], [7, 2], [10.6, 13], [0, 6.4], [-10.6, 13], [-7, 2], [-16, -5], [-4.6, -5]];
  star.forEach(([x, y], i) => (i ? g.lineTo(cx + x * k, cy + y * k) : g.moveTo(cx + x * k, cy + y * k)));
  g.closePath();
  g.fillStyle = night ? '#ffe9a8' : '#ffd36b';
  g.fill();
  g.strokeStyle = '#e0a52a';
  g.lineWidth = 2 * k;
  g.stroke();
  /* 모서리 화분 */
  const bx = [b.x, b.x + b.w], by = [b.y, b.y + b.h];
  for (const X of bx)
    for (const Y of by) {
      let best = core[0], bd = Infinity;
      for (const q of core) {
        const dd = Math.hypot(q.x - X, q.y - Y);
        if (dd < bd) (bd = dd), (best = q);
      }
      const dx = cx - best.x, dy = cy - best.y, dl = Math.hypot(dx, dy) || 1;
      const x = best.x + (dx / dl) * L * 0.1, y = best.y + (dy / dl) * L * 0.1;
      circ(g, x, y, L * 0.12);
      g.fillStyle = night ? '#4a5a8a' : '#e8d6b0';
      g.fill();
      g.strokeStyle = night ? '#3a4678' : '#c9ae80';
      g.lineWidth = 2;
      g.stroke();
      circ(g, x, y, L * 0.09);
      g.fillStyle = night ? '#3f6a5a' : '#9fd89a';
      g.fill();
      circ(g, x - 3, y - 3, L * 0.035);
      g.fillStyle = '#ff8fab';
      g.fill();
      circ(g, x + 4, y + 2, L * 0.03);
      g.fillStyle = '#ffe066';
      g.fill();
    }
}

function park(c: Ctx, b: MapBlock, core: Pt[]): void {
  const { g, p, night, L } = c;
  const rad = L * 0.12;
  g.save();
  poly(g, offsetClosed(core, -rad + 3));
  g.clip();
  g.fillStyle = pat(g, 40, 40, (t) => {
    t.fillStyle = `rgba(255,255,255,${night ? 0.03 : 0.1})`;
    t.fillRect(0, 0, 20, 40);
  }, 35);
  g.fillRect(b.x, b.y, b.w, b.h);
  const path = night ? '#6a7a9a' : '#f6e9c8';
  const pe = night ? '#52607e' : '#e2cfa2';
  const pw = L * 0.16;
  const cx = b.cx, cy = b.cy;
  if (b.kind === 'lake') {
    const rx = b.w * 0.34, ry = b.h * 0.3;
    const wcol = p.water ?? '#a8dcff';
    ell(g, cx, cy, rx + pw * 0.9, ry + pw * 0.9);
    g.fillStyle = path;
    g.fill();
    g.strokeStyle = pe;
    g.lineWidth = 2;
    g.stroke();
    ell(g, cx, cy, rx + 4, ry + 4);
    g.fillStyle = '#e9dcc0';
    g.fill();
    const rg = g.createRadialGradient(cx - rx * 0.1, cy - ry * 0.2, 0, cx, cy, Math.max(rx, ry));
    rg.addColorStop(0, lighten(wcol, 0.35));
    rg.addColorStop(1, wcol);
    ell(g, cx, cy, rx, ry);
    g.fillStyle = rg;
    g.fill();
    g.strokeStyle = darken(wcol, 0.8);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      wave(g, cx - rx * 0.6 + c.r() * rx * 0.3, cy - ry * 0.5 + i * ry * 0.3, rx * 0.5, 2.4, 16);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = c.r() * Math.PI * 2;
      const x = cx + Math.cos(a) * rx * 0.78, y = cy + Math.sin(a) * ry * 0.78;
      ell(g, x, y, 6, 4);
      g.fillStyle = '#8fd07e';
      g.fill();
      g.strokeStyle = '#5fa860';
      g.lineWidth = 1;
      g.stroke();
      if (i % 2) {
        circ(g, x + 2, y - 1, 2);
        g.fillStyle = '#ffc7d9';
        g.fill();
      }
    }
  } else {
    const fy = cy + L * 0.1;
    const x0 = b.x - 10, x1 = b.x + b.w + 10;
    for (const [col, lw] of [[pe, pw + 4], [path, pw]] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(x0, fy);
      g.quadraticCurveTo(cx - b.w * 0.2, fy - b.h * 0.12, cx, fy);
      g.quadraticCurveTo(cx + b.w * 0.2, fy + b.h * 0.12, x1, fy - b.h * 0.05);
      g.moveTo(cx, b.y - 10);
      g.lineTo(cx, b.y + b.h + 10);
      g.stroke();
    }
    if (b.kind === 'dome') {
      const r = Math.min(b.w, b.h) * 0.36;
      ell(g, cx, cy + r * 0.25, r * 1.08, r * 0.62);
      g.fillStyle = '#e8eef2';
      g.fill();
      g.strokeStyle = '#b8c6d0';
      g.lineWidth = 3;
      g.stroke();
      ell(g, cx, cy + r * 0.25, r * 0.9, r * 0.5);
      g.fillStyle = '#d6efe4';
      g.fill();
      g.lineWidth = 1.6;
      g.setLineDash([6, 6]);
      g.stroke();
      g.setLineDash([]);
    } else {
      circ(g, cx, fy, L * 0.42);
      g.fillStyle = path;
      g.fill();
      g.strokeStyle = pe;
      g.lineWidth = 2;
      g.stroke();
    }
  }
  const cols = ['#ff8fab', '#ffe066', '#ffffff', '#c8a0ff'];
  g.globalAlpha = night ? 0.5 : 0.95;
  for (let i = 0; i < 6; i++) {
    const x = b.x + 30 + c.r() * (b.w - 60), y = b.y + 24 + c.r() * (b.h - 48);
    if (Math.abs(x - cx) < pw * 1.4) continue;
    for (let k = 0; k < 5; k++) {
      circ(g, x + (c.r() - 0.5) * 22, y + (c.r() - 0.5) * 14, 2.4);
      g.fillStyle = cols[k % 4];
      g.fill();
    }
  }
  g.globalAlpha = 1;
  g.restore();
}

/* ───────── 차도 ───────── */

function asphalt(c: Ctx, s: MapStreet): void {
  const { g } = c;
  g.lineCap = s.stub ? 'round' : 'butt';
  g.lineWidth = s.w * 0.64;
  g.strokeStyle = c.aspF;
  line(g, s.pts);
  g.stroke();
  g.lineCap = 'butt';
}

/** 길을 따라 step 마다 점을 찍어 교차로 근처를 뺀 구간들 */
function runsOf(s: MapStreet, gap: (p: Pt) => boolean, step = 6): Pt[][] {
  const cum = cumLen(s.pts);
  const len = cum[cum.length - 1];
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (let t = 0; t <= len; t += step) {
    const q = poseAt(s.pts, cum, t);
    if (gap(q)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push({ x: q.x, y: q.y });
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function centerLine(c: Ctx, s: MapStreet): void {
  const { g, m, night, p } = c;
  if (!s.main || s.stub) return;
  const nx = s.nx || [];
  const near = (q: Pt) => nx.some((n) => Math.hypot(q.x - n.x, q.y - n.y) < n.w / 2 + m.road * 0.62);
  const runs = runsOf(s, near);
  if (s.w >= m.road * 1.1) {
    g.strokeStyle = '#ffe28a';
    g.lineWidth = 2;
    for (const r of runs)
      for (const d of [-2.2, 2.2]) {
        line(g, offsetLine(r, d));
        g.stroke();
      }
  } else {
    g.strokeStyle = rgba(night ? '#ffe9a8' : p.line, 0.9);
    g.lineWidth = 3;
    g.setLineDash([22, 16]);
    for (const r of runs) {
      line(g, r);
      g.stroke();
    }
    g.setLineDash([]);
  }
  /* 맨홀 */
  const cum = cumLen(s.pts);
  const len = cum[cum.length - 1];
  for (let t = 280 + c.r() * 300; t < len - 100; t += 620 + c.r() * 300) {
    const q = poseAt(s.pts, cum, t);
    if (near(q)) continue;
    const o = s.w * 0.14;
    circ(g, q.x - q.ty * o, q.y + q.tx * o, 5);
    g.fillStyle = darken(c.asp, 0.8);
    g.fill();
    g.strokeStyle = lighten(c.asp, 0.2);
    g.lineWidth = 1.2;
    g.stroke();
  }
}

function crosswalks(c: Ctx): void {
  const { g, m, night } = c;
  g.fillStyle = `rgba(255,255,255,${night ? 0.7 : 0.92})`;
  for (const x of m.xings || []) {
    const n = 5;
    const inset = x.w * 0.18;
    const bw = (x.w - 2 * inset) / (2 * n - 1);
    g.save();
    g.translate(x.x, x.y);
    g.rotate(x.a);
    for (let i = 0; i < n; i++) {
      rr(g, -x.d / 2 + 3, -x.w / 2 + inset + i * 2 * bw, x.d - 6, bw, 1.5);
      g.fill();
    }
    g.restore();
  }
}

function bridges(c: Ctx): void {
  const { g, m, p } = c;
  for (const b of m.bands) {
    if (b.kind !== 'water') continue;
    const y0 = b.y, y1 = b.y + b.h - 22;
    if (y1 - y0 < 20) continue;
    for (const s of m.streets || []) {
      if (s.ax !== 'v' || s.stub) continue;
      const top = s.pts[0];
      if (top.y > y0 + 4) continue;
      const hw = s.w * 0.32, x = top.x;
      const wcol = p.water ?? '#8fd3ff';
      g.fillStyle = rgba(darken(wcol, 0.45), 0.28);
      g.fillRect(x + hw, y0, 14, y1 - y0);
      g.fillStyle = '#8a9bb0';
      g.fillRect(x - hw - 5, y0, 5, y1 - y0);
      g.fillStyle = '#7a8ba0';
      g.fillRect(x + hw, y0, 5, y1 - y0);
      for (const xx of [x - hw - 2.5, x + hw + 2.5]) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(xx, y0);
        g.lineTo(xx, y1);
        g.stroke();
        for (let y = y0 + 8; y < y1; y += 16) {
          rr(g, xx - 3, y - 2, 6, 4, 1.5);
          g.fillStyle = '#e6eef5';
          g.fill();
          g.strokeStyle = '#8a9bb0';
          g.lineWidth = 1;
          g.stroke();
        }
      }
      rr(g, x - hw - 6, y1 - 3, hw * 2 + 12, 6, 2);
      g.fillStyle = '#c8d4e0';
      g.fill();
      for (const xx of [x - hw - 3, x + hw + 3]) {
        circ(g, xx, y0 + (y1 - y0) * 0.5, 4.4);
        g.fillStyle = '#ffe9a8';
        g.fill();
        g.strokeStyle = '#8a9bb0';
        g.lineWidth = 1.4;
        g.stroke();
      }
    }
  }
}

/** 판교 네온 가장자리 / 낮에는 차도 가장자리 그림자 */
function edges(c: Ctx): void {
  const { g, m, night } = c;
  for (const s of m.streets || []) {
    const hw = s.w * 0.32;
    g.lineCap = s.stub ? 'round' : 'butt';
    if (night) {
      for (const d of [-hw, hw]) {
        const q = offsetLine(s.pts, d);
        g.strokeStyle = 'rgba(255,233,168,0.18)';
        g.lineWidth = 9;
        line(g, q);
        g.stroke();
        g.strokeStyle = 'rgba(255,233,168,0.95)';
        g.lineWidth = 2.6;
        line(g, q);
        g.stroke();
      }
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.08)';
      g.lineWidth = 4;
      line(g, offsetLine(s.pts, -hw + 2));
      g.stroke();
    }
  }
  g.lineCap = 'butt';
}

/* ───────── 상권 특색 ───────── */

function flavor(c: Ctx): void {
  const { g, m } = c;
  if (m.district === 'sejong') {
    for (let i = 0; i < 140; i++) {
      const x = c.r() * m.W, y = c.r() * m.H;
      g.fillStyle = c.r() < 0.5 ? 'rgba(255,199,217,0.85)' : 'rgba(255,217,230,0.85)';
      ell(g, x, y, 3.6, 2.2, c.r() * Math.PI);
      g.fill();
    }
  }
  if (m.district === 'gangnam') {
    g.fillStyle = 'rgba(74,90,120,0.1)';
    g.beginPath();
    g.moveTo(m.W * 0.62, 0);
    g.lineTo(m.W * 0.78, 0);
    g.lineTo(m.W * 0.86, m.area.y);
    g.lineTo(m.W * 0.7, m.area.y);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(0, m.H * 0.62);
    g.lineTo(0, m.H * 0.8);
    g.lineTo(m.grid.x, m.H * 0.86);
    g.lineTo(m.grid.x, m.H * 0.68);
    g.closePath();
    g.fill();
  }
  if (m.district === 'magok') {
    g.fillStyle = 'rgba(230,214,184,0.8)';
    for (let i = 0; i < 6; i++) {
      const left = c.r() < 0.5;
      const x = left ? c.r() * Math.max(10, m.grid.x - 40) + 10 : m.grid.x + m.grid.w + 24 + c.r() * Math.max(10, m.W - m.grid.x - m.grid.w - 60);
      const y = m.area.y + c.r() * (m.area.h - 40);
      ell(g, x, y, 14 + c.r() * 10, 8 + c.r() * 6);
      g.fill();
    }
  }
  if (c.night) {
    const glow = (x: number, y: number, rx: number, ry: number) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      rg.addColorStop(0, 'rgba(255,233,168,0.28)');
      rg.addColorStop(1, 'rgba(255,233,168,0)');
      g.fillStyle = rg;
      ell(g, x, y, rx, ry);
      g.fill();
    };
    const seen = new Set<string>();
    for (const s of m.streets || [])
      for (const n of s.nx || []) {
        const k = `${Math.round(n.x)},${Math.round(n.y)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        glow(n.x, n.y, m.road * 1.6, m.road * 1.6);
      }
    for (const d of m.decor) if (d.svgId === 'd.lamp' || d.svgId.startsWith('d.pangyo')) glow(d.x, d.y, m.lot * 0.5, m.lot * 0.3);
  }
}

/* ───────── 장식 ───────── */

function decor(c: Ctx, sprite: (key: string) => SpriteSrc | null): void {
  const { g, m } = c;
  for (const d of m.decor) {
    const s = sprite(d.svgId);
    if (!s) continue;
    const side = m.lot * d.s * 1.1;
    const h = side * (s.sh / Math.max(1, s.sw));
    g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, d.x - side / 2, d.y - h, side, h);
  }
}

void edge;
