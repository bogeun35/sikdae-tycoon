/**
 * 상권 지도 레이어 (탑뷰 파스텔 도시). gdd-data.json maps[상권][방향] 배치를 그대로 그림.
 *   m.<id>.ground@<orient> : 바닥색·블록(둥근 모서리 부지 블록)·보도·공원/광장/호수/돔·가장자리 띠·주차장·햇살 그림자
 *   m.<id>.roads@<orient>  : 차도·차선·중앙 점선·횡단보도·교차로 (배경 투명, 보도는 ground 에)
 * 결정적(난수 씨앗 고정).
 */
import type { Body } from '../render';
import { C, E, G, P, R, Svg, darken, edge, lighten, mix, n2, rng, wave, heartPath } from '../kit';
import { DISTRICTS, GDD, type DistrictId, type MapData, type Orient } from '../registry';

type Pal = (typeof DISTRICTS)[string]['pal'];

interface MCtx {
  sv: Svg;
  m: MapData;
  p: Pal;
  id: DistrictId;
  night: boolean;
  /** 보도 폭 */
  side: number;
  rnd: () => number;
}

function seedOf(id: string, o: Orient): number {
  let h = 7;
  for (const ch of id + o) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** 보도 색 */
function walkC(c: MCtx): string {
  if (c.night) return '#4a5888';
  if (c.id === 'euljiro') return '#ecd6c0';
  return mix(c.p.ground, '#ffffff', 0.45);
}

/* ───────── 바닥 ───────── */

function groundBase(c: MCtx): string {
  const { sv, m, p } = c;
  let s = R(0, 0, m.W, m.H, 0, { fill: p.ground });
  // 햇살(왼쪽 위 밝게 → 오른쪽 아래 살짝 따뜻/어둡게)
  s += R(0, 0, m.W, m.H, 0, { fill: sv.lin([[0, '#ffffff', c.night ? 0.03 : 0.22], [0.6, '#ffffff', 0], [1, c.night ? '#000014' : '#c8a070', c.night ? 0.25 : 0.08]], 0, 0, 1, 1) });
  // 잔무늬 점
  const dots = sv.pattern(
    26, 26,
    C(4, 5, 1.3, { fill: darken(p.ground, 0.8), op: 0.18 }) + C(17, 15, 1, { fill: '#fff', op: c.night ? 0.06 : 0.35 }) + C(10, 21, 0.9, { fill: darken(p.ground, 0.8), op: 0.12 }),
  );
  s += R(0, 0, m.W, m.H, 0, { fill: dots });
  return s;
}

function bands(c: MCtx): string {
  const { sv, m, p } = c;
  let s = '';
  for (const b of m.bands) {
    if (b.kind === 'water') {
      const wc = p.water ?? '#8fd3ff';
      // 강둑(바깥쪽)
      const inner = b.y + b.h; // 도시 쪽 경계 (위쪽 띠 가정)
      s += R(b.x, b.y, b.w, b.h, 0, { fill: sv.lin([[0, darken(wc, 0.82)], [0.7, wc], [1, lighten(wc, 0.25)]]) });
      for (let i = 0; i < Math.floor(b.h / 22); i++) {
        const y = b.y + 14 + i * 22;
        const off = (i % 2) * 40;
        for (let x = -off; x < b.w; x += 180) s += P(wave(x + c.rnd() * 30, y, 70 + c.rnd() * 40, 3.4, 22), { fill: 'none', stroke: '#fff', sw: 2.4, so: 0.35 + c.rnd() * 0.25 });
      }
      // 물 반짝
      for (let i = 0; i < 26; i++) s += E(c.rnd() * b.w, b.y + 8 + c.rnd() * (b.h - 20), 8 + c.rnd() * 10, 2, { fill: '#fff', op: 0.45 });
      // 둔치: 모래 + 잔디 + 산책로
      s += R(b.x, inner - 22, b.w, 22, 0, { fill: '#e9dcc0' }) + R(b.x, inner - 22, b.w, 5, 0, { fill: '#fff', op: 0.5 });
      s += R(b.x, inner - 14, b.w, 8, 0, { fill: '#cfe7b8' });
      s += P(`M${b.x} ${inner - 22}H${b.x + b.w}`, { stroke: darken(wc, 0.7), sw: 2, so: 0.5 });
    } else {
      // 8차선 대로
      const rc = p.road;
      s += R(b.x, b.y - 10, b.w, b.h + 20, 0, { fill: walkC(c) });
      s += R(b.x, b.y, b.w, b.h, 0, { fill: sv.lin([[0, lighten(rc, 0.08)], [1, darken(rc, 0.95)]]) });
      const lane = b.h / 8;
      for (let i = 1; i < 8; i++) {
        if (i === 4) continue;
        s += P(`M0 ${n2(b.y + i * lane)}H${b.w}`, { stroke: '#fff', sw: 2.4, so: 0.75, da: '26 22' });
      }
      s += P(`M0 ${n2(b.y + 4 * lane - 2)}H${b.w}M0 ${n2(b.y + 4 * lane + 2)}H${b.w}`, { stroke: '#ffe28a', sw: 2 });
      s += P(`M0 ${n2(b.y + 1.5)}H${b.w}M0 ${n2(b.y + b.h - 1.5)}H${b.w}`, { stroke: '#fff', sw: 2.4, so: 0.9 });
      // 가로수 화단 줄
      for (let x = 60; x < b.w; x += 240) s += R(x, b.y - 8, 80, 6, 3, { fill: '#a9d88f', op: 0.9 }) + R(x, b.y + b.h + 2, 80, 6, 3, { fill: '#a9d88f', op: 0.9 });
    }
  }
  return s;
}

/** 도로 자리 전체를 보도 색으로 (차도는 roads 층이 덮음) */
function sidewalks(c: MCtx): string {
  const { sv, m } = c;
  const wc = walkC(c);
  const pav = sv.pattern(
    18, 18,
    P('M0 0.5H18M0.5 0V18', { stroke: darken(wc, 0.86), sw: 1, so: c.night ? 0.35 : 0.45 }) + (c.id === 'euljiro' ? R(1, 1, 16, 16, 2, { fill: '#e4b89a', op: 0.25 }) : ''),
  );
  let s = '';
  // 블록 격자 둘레 보도
  const g = m.grid;
  s += R(g.x - c.side, g.y - c.side, g.w + c.side * 2, g.h + c.side * 2, 16, { fill: wc });
  for (const r of m.roads) s += R(r.x, r.y, r.w, r.h, 0, { fill: wc });
  s += R(g.x - c.side, g.y - c.side, g.w + c.side * 2, g.h + c.side * 2, 16, { fill: pav });
  for (const r of m.roads) s += R(r.x, r.y, r.w, r.h, 0, { fill: pav });
  // 보도 가장자리 연석 (차도 쪽)
  for (const r of m.roads) {
    const t = c.side;
    if (r.ax === 'h') s += P(`M${r.x} ${n2(r.y + t)}H${r.x + r.w}M${r.x} ${n2(r.y + r.h - t)}H${r.x + r.w}`, { stroke: c.night ? '#6a78a8' : '#ffffff', sw: 3, so: 0.9 });
    else s += P(`M${n2(r.x + t)} ${r.y}V${r.y + r.h}M${n2(r.x + r.w - t)} ${r.y}V${r.y + r.h}`, { stroke: c.night ? '#6a78a8' : '#ffffff', sw: 3, so: 0.9 });
  }
  return s;
}

function lotBlock(c: MCtx, b: MapData['blocks'][number]): string {
  const { sv, m, p } = c;
  const L = m.lot;
  const rx = L * 0.12;
  const bc = p.block;
  let s = '';
  // 햇살 그림자 (오른쪽 아래)
  s += R(b.x + 5, b.y + 7, b.w, b.h, rx, { fill: c.night ? '#000010' : darken(p.ground, 0.55), op: c.night ? 0.35 : 0.16 });
  // 블록 (연석 테두리)
  s += R(b.x, b.y, b.w, b.h, rx, { fill: sv.lin([[0, lighten(bc, 0.18)], [1, bc]], 0, 0, 0.4, 1), stroke: c.night ? '#26305a' : darken(bc, 0.86), sw: 3 });
  // 부지 칸
  const slots = m.spawnSlots.filter((q) => q.kind === 'lot' && q.block === b.id);
  const inset = L * 0.07;
  const tiles = sv.pattern(16, 16, R(1, 1, 14, 14, 3, { fill: '#fff', op: c.night ? 0.05 : 0.22 }));
  for (const q of slots) {
    const x = q.x - L / 2 + inset, y = q.y - L / 2 + inset, w = L - inset * 2;
    const v = (q.id * 2654435761) >>> 0;
    const kind = v % 7; // 0~2 보도블록 · 3~4 타일 · 5 잔디 · 6 흙 빈터
    if (c.night) {
      s += R(x, y, w, w, L * 0.1, { fill: kind === 5 ? '#2f5448' : '#34437a', stroke: '#4a5a94', sw: 1.6 });
      if (kind === 3 || kind === 4) s += R(x + 3, y + 3, w - 6, w - 6, L * 0.08, { fill: tiles });
    } else if (kind === 5) {
      const gc = mix(p.park, bc, 0.25);
      s += R(x, y, w, w, L * 0.1, { fill: sv.lin([[0, lighten(gc, 0.2)], [1, gc]]), stroke: darken(gc, 0.85), sw: 1.6, so: 0.8 });
      for (let k = 0; k < 4; k++) {
        const tx = x + w * (0.18 + ((v >> (k * 3)) % 7) * 0.1), ty = y + w * (0.2 + ((v >> (k * 5 + 1)) % 6) * 0.12);
        s += P(`M${n2(tx - 4)} ${n2(ty + 2)}q2 -5 4 0q2 -6 4 0`, { fill: 'none', stroke: darken(gc, 0.7), sw: 1.4, so: 0.6 });
      }
    } else if (kind === 6) {
      const dc = mix('#ead8b8', bc, 0.4);
      s += R(x, y, w, w, L * 0.1, { fill: dc, stroke: darken(dc, 0.88), sw: 1.6, so: 0.8, da: '6 5' });
      s += E(x + w * 0.3, y + w * 0.7, w * 0.12, w * 0.06, { fill: darken(dc, 0.92), op: 0.6 }) + E(x + w * 0.7, y + w * 0.35, w * 0.09, w * 0.05, { fill: darken(dc, 0.92), op: 0.5 });
    } else {
      s += R(x, y, w, w, L * 0.1, { fill: lighten(bc, 0.3), stroke: darken(bc, 0.9), sw: 1.6, so: 0.8 });
      if (kind >= 3) s += R(x + 3, y + 3, w - 6, w - 6, L * 0.08, { fill: tiles });
      s += R(x + 4, y + 4, w - 8, w * 0.18, L * 0.06, { fill: '#fff', op: 0.25 });
    }
    // 부지 모서리 화단 점
    s += C(x + w - 8, y + w - 8, 4.2, { fill: c.night ? '#3f6a5a' : mix(p.park, '#5fa860', 0.3), op: 0.85 });
  }
  // 을지로: 부지 사이 좁은 골목
  if (c.id === 'euljiro') {
    const xs = [...new Set(slots.map((q) => q.x))].sort((a, b2) => a - b2);
    const ys = [...new Set(slots.map((q) => q.y))].sort((a, b2) => a - b2);
    for (let i = 1; i < xs.length; i++) {
      const x = (xs[i - 1] + xs[i]) / 2;
      s += R(x - 4, b.y + 8, 8, b.h - 16, 4, { fill: '#e2c6a4', stroke: '#c9a47c', sw: 1, so: 0.6 });
    }
    for (let i = 1; i < ys.length; i++) {
      const y = (ys[i - 1] + ys[i]) / 2;
      s += R(b.x + 8, y - 4, b.w - 16, 8, 4, { fill: '#e2c6a4', stroke: '#c9a47c', sw: 1, so: 0.6 });
    }
  }
  return s;
}

function plazaBlock(c: MCtx, b: MapData['blocks'][number]): string {
  const { sv, m } = c;
  const L = m.lot;
  const base = c.night ? '#56639a' : '#fff4d4';
  const pav = sv.pattern(
    24, 24,
    R(1, 1, 22, 22, 3, { fill: c.night ? '#5c6aa2' : '#fff9e6' }) + P('M0 12H24M12 0V24', { stroke: c.night ? '#4a5690' : '#f0dfb8', sw: 1 }),
  );
  let s = R(b.x + 5, b.y + 7, b.w, b.h, L * 0.12, { fill: '#000', op: 0.1 });
  s += R(b.x, b.y, b.w, b.h, L * 0.12, { fill: base, stroke: c.night ? '#3a4678' : '#e6cf9a', sw: 3 });
  s += R(b.x + 6, b.y + 6, b.w - 12, b.h - 12, L * 0.09, { fill: pav });
  // 가운데 원형 무늬 (보스 자리)
  const r = Math.min(b.w, b.h) * 0.4;
  s += C(b.cx, b.cy, r, { fill: c.night ? '#6272b0' : '#ffeebb', stroke: c.night ? '#8a96d0' : '#f0c870', sw: 5 });
  s += C(b.cx, b.cy, r * 0.78, { fill: 'none', stroke: c.night ? '#8a96d0' : '#f5d58c', sw: 3, da: '10 8' });
  s += C(b.cx, b.cy, r * 0.5, { fill: c.night ? '#6a7ab8' : '#fff6d6', stroke: c.night ? '#9aa6e0' : '#f0c870', sw: 4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s += P(`M${n2(b.cx + Math.cos(a) * r * 0.55)} ${n2(b.cy + Math.sin(a) * r * 0.55)}L${n2(b.cx + Math.cos(a) * r * 0.74)} ${n2(b.cy + Math.sin(a) * r * 0.74)}`, { stroke: c.night ? '#9aa6e0' : '#f5cf7a', sw: 4 });
  }
  s += G(P('M0 -16L4.6 -5 16 -5 7 2 10.6 13 0 6.4 -10.6 13 -7 2 -16 -5 -4.6 -5Z', { fill: c.night ? '#ffe9a8' : '#ffd36b', stroke: '#e0a52a', sw: 2 }), { tf: `translate(${n2(b.cx)} ${n2(b.cy)}) scale(${n2(r / 40)})` });
  // 모서리 화분
  for (const [dx, dy] of [[0.1, 0.14], [0.9, 0.14], [0.1, 0.86], [0.9, 0.86]]) {
    const x = b.x + b.w * dx, y = b.y + b.h * dy;
    s += C(x, y, L * 0.12, { fill: c.night ? '#4a5a8a' : '#e8d6b0', stroke: c.night ? '#3a4678' : '#c9ae80', sw: 2 }) + C(x, y, L * 0.09, { fill: c.night ? '#3f6a5a' : '#9fd89a' }) + C(x - 3, y - 3, L * 0.035, { fill: '#ff8fab' }) + C(x + 4, y + 2, L * 0.03, { fill: '#ffe066' });
  }
  return s;
}

function parkBlock(c: MCtx, b: MapData['blocks'][number]): string {
  const { sv, m, p } = c;
  const L = m.lot;
  const gc = p.park;
  const stripes = sv.pattern(40, 40, R(0, 0, 20, 40, 0, { fill: '#fff', op: c.night ? 0.03 : 0.1 }), 'rotate(35)');
  let s = R(b.x + 5, b.y + 7, b.w, b.h, L * 0.12, { fill: '#000', op: c.night ? 0.3 : 0.12 });
  s += R(b.x, b.y, b.w, b.h, L * 0.12, { fill: sv.lin([[0, lighten(gc, 0.15)], [1, gc]]), stroke: darken(gc, 0.8), sw: 3 });
  s += R(b.x, b.y, b.w, b.h, L * 0.12, { fill: stripes });
  const path = c.night ? '#6a7a9a' : '#f6e9c8';
  const pe = c.night ? '#52607e' : '#e2cfa2';
  const pw = L * 0.16;
  const fy = b.y + b.h * 0.67; // 분수 자리 근처
  if (b.kind === 'lake') {
    const rx = b.w * 0.35, ry = b.h * 0.3;
    const wc = p.water ?? '#a8dcff';
    s += E(b.cx, b.cy, rx + pw * 0.9, ry + pw * 0.9, { fill: path, stroke: pe, sw: 2 });
    s += E(b.cx, b.cy, rx + 4, ry + 4, { fill: '#e9dcc0' });
    s += E(b.cx, b.cy, rx, ry, { fill: sv.rad([[0, lighten(wc, 0.35)], [1, wc]], 0.45, 0.4, 0.6), stroke: darken(wc, 0.8), sw: 2 });
    for (let i = 0; i < 4; i++) s += P(wave(b.cx - rx * 0.6 + c.rnd() * rx * 0.3, b.cy - ry * 0.5 + i * ry * 0.3, rx * 0.5, 2.4, 16), { fill: 'none', stroke: '#fff', sw: 2, so: 0.5 });
    for (let i = 0; i < 6; i++) {
      const a = c.rnd() * Math.PI * 2;
      const x = b.cx + Math.cos(a) * rx * 0.78, y = b.cy + Math.sin(a) * ry * 0.78;
      s += P(`M${n2(x)} ${n2(y)}m-6 0a6 4 0 1 0 12 0a6 4 0 1 0 -12 0`, { fill: '#8fd07e', stroke: '#5fa860', sw: 1 }) + (i % 2 ? C(x + 2, y - 1, 2, { fill: '#ffc7d9' }) : '');
    }
  } else {
    // 오솔길: 가로 · 세로 곡선 + 분수 둘레
    s += P(`M${b.x} ${n2(fy)}Q${n2(b.cx - b.w * 0.2)} ${n2(fy - b.h * 0.12)} ${n2(b.cx)} ${n2(fy)}T${b.x + b.w} ${n2(fy - b.h * 0.05)}`, { fill: 'none', stroke: pe, sw: pw + 4 });
    s += P(`M${b.x} ${n2(fy)}Q${n2(b.cx - b.w * 0.2)} ${n2(fy - b.h * 0.12)} ${n2(b.cx)} ${n2(fy)}T${b.x + b.w} ${n2(fy - b.h * 0.05)}`, { fill: 'none', stroke: path, sw: pw });
    s += P(`M${n2(b.cx)} ${b.y}V${b.y + b.h}`, { stroke: pe, sw: pw + 4 }) + P(`M${n2(b.cx)} ${b.y}V${b.y + b.h}`, { stroke: path, sw: pw });
    if (b.kind === 'dome') {
      const r = Math.min(b.w, b.h) * 0.36;
      s += E(b.cx, b.cy + r * 0.25, r * 1.08, r * 0.62, { fill: '#e8eef2', stroke: '#b8c6d0', sw: 3 });
      s += E(b.cx, b.cy + r * 0.25, r * 0.9, r * 0.5, { fill: '#d6efe4', stroke: '#b8c6d0', sw: 1.6, da: '6 6' });
    } else {
      s += C(b.cx, fy, L * 0.42, { fill: path, stroke: pe, sw: 2 });
    }
  }
  // 꽃밭
  for (let i = 0; i < 5; i++) {
    const x = b.x + 30 + c.rnd() * (b.w - 60), y = b.y + 24 + c.rnd() * (b.h - 48);
    if (Math.abs(x - b.cx) < pw * 1.4) continue;
    for (let k = 0; k < 5; k++) s += C(x + (c.rnd() - 0.5) * 22, y + (c.rnd() - 0.5) * 14, 2.4, { fill: ['#ff8fab', '#ffe066', '#ffffff', '#c8a0ff'][k % 4], op: c.night ? 0.5 : 0.95 });
  }
  return s;
}

/** 격자 바깥 가장자리: 주차장 (장식과 겹치지 않는 자리만) */
function parking(c: MCtx): string {
  const { m } = c;
  const L = m.lot;
  const g = m.grid;
  const out: string[] = [];
  const cands: { x: number; y: number; w: number; h: number; vert: boolean }[] = [];
  const hRoads = m.roads.filter((r) => r.ax === 'h');
  const vRoads = m.roads.filter((r) => r.ax === 'v');
  const leftW = g.x - c.side - 8, rightX = g.x + g.w + c.side + 8, rightW = m.W - rightX;
  // 세로 가장자리 띠(왼·오른)에서 가로 도로 사이 구간
  const ySegs: [number, number][] = [];
  let y0 = m.area.y;
  for (const r of hRoads.sort((a, b) => a.y - b.y)) {
    ySegs.push([y0, r.y]);
    y0 = r.y + r.h;
  }
  ySegs.push([y0, Math.min(m.H, m.area.y + m.area.h)]);
  for (const [a, b] of ySegs) {
    const h = b - a - 24;
    if (h < L * 0.9) continue;
    if (leftW > 46) cands.push({ x: 4, y: a + 12, w: leftW - 8, h, vert: true });
    if (rightW > 46) cands.push({ x: rightX + 4, y: a + 12, w: rightW - 8, h, vert: true });
  }
  // 아래 띠
  const botY = g.y + g.h + c.side + 8, botH = m.H - botY;
  if (botH > 60) {
    let x0 = 0;
    for (const r of vRoads.sort((a, b) => a.x - b.x)) {
      cands.push({ x: x0 + 12, y: botY + 4, w: r.x - x0 - 24, h: botH - 8, vert: false });
      x0 = r.x + r.w;
    }
    cands.push({ x: x0 + 12, y: botY + 4, w: m.W - x0 - 24, h: botH - 8, vert: false });
  }
  const pad = L * 0.35;
  const free = (x: number, y: number, w: number, h: number) =>
    !m.decor.some((d) => d.x > x - pad && d.x < x + w + pad && d.y > y - 4 && d.y - L * d.s * 1.1 < y + h + 4);
  let used = 0;
  for (const q of cands) {
    if (used >= 4) break;
    // 칸 크기
    const stallW = L * 0.36, stallL = L * 0.56;
    const n = q.vert ? Math.floor(q.h / stallW) : Math.floor(q.w / stallW);
    if (n < 3) continue;
    const pw = q.vert ? Math.min(q.w, stallL + 12) : n * stallW;
    const ph = q.vert ? n * stallW : Math.min(q.h, stallL + 12);
    const px = q.vert ? q.x + (q.w - pw) / 2 : q.x + (q.w - pw) / 2;
    const py = q.vert ? q.y + (q.h - ph) / 2 : q.y + (q.h - ph) / 2;
    if (!free(px, py, pw, ph)) continue;
    used++;
    const asp = c.night ? '#2a3460' : mix(c.p.road, '#ffffff', 0.25);
    out.push(R(px, py, pw, ph, 10, { fill: asp, stroke: c.night ? '#3a4678' : darken(asp, 0.85), sw: 2 }));
    for (let i = 0; i <= n; i++) {
      if (q.vert) out.push(P(`M${n2(px + 6)} ${n2(py + i * stallW)}H${n2(px + pw - 6)}`, { stroke: '#fff', sw: 2.4, so: 0.85 }));
      else out.push(P(`M${n2(px + i * stallW)} ${n2(py + 6)}V${n2(py + ph - 6)}`, { stroke: '#fff', sw: 2.4, so: 0.85 }));
    }
    // 세워 둔 차 몇 대
    const cols = ['#ffd36b', '#8fd3ff', '#ff9fb5', '#9fe0a8', '#f4f7fb', '#c8a0ff'];
    for (let i = 0; i < n; i++) {
      if (c.rnd() < 0.45) continue;
      const col = cols[Math.floor(c.rnd() * cols.length)];
      const cx = q.vert ? px + pw / 2 : px + (i + 0.5) * stallW;
      const cy = q.vert ? py + (i + 0.5) * stallW : py + ph / 2;
      const cw = q.vert ? stallL * 0.82 : stallW * 0.66, ch = q.vert ? stallW * 0.66 : stallL * 0.82;
      out.push(R(cx - cw / 2 + 2, cy - ch / 2 + 3, cw, ch, 7, { fill: '#000', op: 0.15 }));
      out.push(R(cx - cw / 2, cy - ch / 2, cw, ch, 7, { fill: col, stroke: edge(col), sw: 2 }));
      out.push(R(cx - cw * 0.3, cy - ch * 0.3, cw * 0.6, ch * 0.6, 4, { fill: '#dff4ff', stroke: edge(col), sw: 1.4, op: 0.95 }));
      out.push(R(cx - cw * 0.2, cy - ch * 0.2, cw * 0.4, ch * 0.4, 3, { fill: lighten(col, 0.3) }));
    }
  }
  return out.join('');
}

/** 상권 특색 바닥 장식 */
function flavor(c: MCtx): string {
  const { m, sv } = c;
  let s = '';
  if (c.id === 'sejong') {
    // 벚꽃잎 흩뿌리기
    for (let i = 0; i < 140; i++) {
      const x = c.rnd() * m.W, y = c.rnd() * m.H;
      s += E(x, y, 3.6, 2.2, { fill: c.rnd() < 0.5 ? '#ffc7d9' : '#ffd9e6', op: 0.85, tf: `rotate(${Math.round(c.rnd() * 180)} ${n2(x)} ${n2(y)})` });
    }
  }
  if (c.id === 'gangnam') {
    // 유리 빌딩 그림자 (화면 밖 고층 빌딩)
    const sh = '#4a5a78';
    s += P(`M${m.W * 0.62} 0L${m.W * 0.78} 0L${m.W * 0.86} ${m.area.y}L${m.W * 0.7} ${m.area.y}Z`, { fill: sh, op: 0.1 });
    s += P(`M0 ${m.H * 0.62}L0 ${m.H * 0.8}L${m.grid.x} ${m.H * 0.86}L${m.grid.x} ${m.H * 0.68}Z`, { fill: sh, op: 0.1 });
  }
  if (c.id === 'magok') {
    // 새 부지 흙 자국 (가장자리)
    for (let i = 0; i < 6; i++) {
      const x = c.rnd() < 0.5 ? c.rnd() * (m.grid.x - 40) + 10 : m.grid.x + m.grid.w + 24 + c.rnd() * Math.max(10, m.W - m.grid.x - m.grid.w - 60);
      const y = m.area.y + c.rnd() * (m.area.h - 40);
      s += E(x, y, 14 + c.rnd() * 10, 8 + c.rnd() * 6, { fill: '#e6d6b8', op: 0.8 });
    }
  }
  if (c.night) {
    // 가로등·교차로 불빛 웅덩이
    const glow = sv.rad([[0, '#ffe9a8', 0.28], [1, '#ffe9a8', 0]]);
    const hs = m.roads.filter((r) => r.ax === 'h'), vs = m.roads.filter((r) => r.ax === 'v');
    for (const h of hs) for (const v of vs) s += C(v.x + v.w / 2, h.y + h.h / 2, m.road * 1.6, { fill: glow });
    for (const d of m.decor) if (d.svgId === 'd.lamp' || d.svgId.startsWith('d.pangyo')) s += E(d.x, d.y, m.lot * 0.5, m.lot * 0.3, { fill: glow });
  }
  return s;
}

function groundSvg(c: MCtx): string {
  const { m } = c;
  c.sv.add(groundBase(c), bands(c), sidewalks(c));
  for (const b of m.blocks) {
    if (b.kind === 'lots') c.sv.add(lotBlock(c, b));
    else if (b.kind === 'plaza') c.sv.add(plazaBlock(c, b));
    else c.sv.add(parkBlock(c, b));
  }
  c.sv.add(parking(c), flavor(c));
  return c.sv.body();
}

/* ───────── 도로 ───────── */

function roadsSvg(c: MCtx): string {
  const { sv, m, p } = c;
  const t = c.side;
  const asp = c.night ? '#1f2850' : p.road;
  const aspF = sv.pattern(
    30, 30,
    R(0, 0, 30, 30, 0, { fill: asp }) + C(6, 8, 1.2, { fill: '#fff', op: 0.08 }) + C(20, 22, 1.4, { fill: '#000', op: 0.06 }) + C(24, 6, 0.9, { fill: '#fff', op: 0.07 }),
  );
  const hs = m.roads.filter((r) => r.ax === 'h'), vs = m.roads.filter((r) => r.ax === 'v');
  const car = (r: (typeof m.roads)[number]) => (r.ax === 'h' ? { x: r.x, y: r.y + t, w: r.w, h: r.h - 2 * t } : { x: r.x + t, y: r.y, w: r.w - 2 * t, h: r.h });
  let s = '';
  for (const r of m.roads) {
    const q = car(r);
    s += R(q.x, q.y, q.w, q.h, 0, { fill: aspF });
  }
  // 중앙 점선 (교차로·횡단보도 구간 빼고)
  const lineC = c.night ? '#ffe9a8' : p.line;
  for (const r of m.roads) {
    const q = car(r);
    if (r.ax === 'h') {
      const y = q.y + q.h / 2;
      const cuts = vs.map((v) => [v.x - m.road * 0.62, v.x + v.w + m.road * 0.62] as const).sort((a, b) => a[0] - b[0]);
      let x0 = q.x;
      for (const [a, b] of [...cuts, [q.x + q.w, q.x + q.w] as const]) {
        if (a > x0) s += P(`M${n2(x0)} ${n2(y)}H${n2(a)}`, { stroke: lineC, sw: 3, da: '22 16', so: 0.9 });
        x0 = b;
      }
    } else {
      const x = q.x + q.w / 2;
      const cuts = hs.map((h) => [h.y - m.road * 0.62, h.y + h.h + m.road * 0.62] as const).sort((a, b) => a[0] - b[0]);
      let y0 = q.y;
      for (const [a, b] of [...cuts, [q.y + q.h, q.y + q.h] as const]) {
        if (a > y0) s += P(`M${n2(x)} ${n2(y0)}V${n2(a)}`, { stroke: lineC, sw: 3, da: '22 16', so: 0.9 });
        y0 = b;
      }
    }
  }
  // 교차로
  for (const h of hs)
    for (const v of vs) {
      const x = v.x + t, y = h.y + t, w = v.w - 2 * t, hh = h.h - 2 * t;
      s += R(x, y, w, hh, 0, { fill: aspF });
      s += R(x + 4, y + 4, w - 8, hh - 8, 6, { fill: '#fff', op: c.night ? 0.03 : 0.06 });
      // 정지선
      s += P(`M${n2(x - m.road * 0.58)} ${n2(y + hh / 2 + 2)}V${n2(y + hh - 2)}M${n2(x + w + m.road * 0.58)} ${n2(y + 2)}V${n2(y + hh / 2 - 2)}`, { stroke: '#fff', sw: 3, so: 0.8 });
      s += P(`M${n2(x + 2)} ${n2(y - m.road * 0.58)}H${n2(x + w / 2 - 2)}M${n2(x + w / 2 + 2)} ${n2(y + hh + m.road * 0.58)}H${n2(x + w - 2)}`, { stroke: '#fff', sw: 3, so: 0.8 });
    }
  // 횡단보도 (차도 부분만)
  const inset = m.road * 0.18;
  for (const cw of m.crosswalks) {
    const n = 5;
    if (cw.ax === 'v') {
      const w = (cw.w - 2 * inset) / (2 * n - 1);
      for (let i = 0; i < n; i++) s += R(cw.x + inset + i * 2 * w, cw.y + 3, w, cw.h - 6, 1.5, { fill: '#ffffff', op: c.night ? 0.7 : 0.92 });
    } else {
      const h = (cw.h - 2 * inset) / (2 * n - 1);
      for (let i = 0; i < n; i++) s += R(cw.x + 3, cw.y + inset + i * 2 * h, cw.w - 6, h, 1.5, { fill: '#ffffff', op: c.night ? 0.7 : 0.92 });
    }
  }
  // 차선 화살표 · 맨홀
  const arrow = (x: number, y: number, rot: number) => G(P('M0 -9V7M-5 -3L0 -10L5 -3', { fill: 'none', stroke: '#fff', sw: 2.6, so: 0.65 }), { tf: `translate(${n2(x)} ${n2(y)}) rotate(${rot})` });
  for (const r of hs) {
    const q = car(r);
    for (const v of vs) {
      s += arrow(v.x - m.road * 1.3, q.y + q.h * 0.75, 90) + arrow(v.x + v.w + m.road * 1.3, q.y + q.h * 0.25, -90);
    }
    s += C(q.x + q.w * 0.37, q.y + q.h * 0.3, 5, { fill: darken(asp, 0.8), stroke: lighten(asp, 0.2), sw: 1.2 });
  }
  for (const r of vs) {
    const q = car(r);
    s += C(q.x + q.w * 0.7, q.y + q.h * 0.44, 5, { fill: darken(asp, 0.8), stroke: lighten(asp, 0.2), sw: 1.2 });
  }
  // 한강 위를 지나는 세로 도로 = 다리 (물 그림자 + 난간 + 교각 기둥 머리)
  for (const b of m.bands) {
    if (b.kind !== 'water') continue;
    const y0 = b.y, y1 = b.y + b.h - 22;
    if (y1 - y0 < 20) continue;
    for (const r of vs) {
      if (r.x + r.w < b.x || r.x > b.x + b.w) continue;
      const wc = p.water ?? '#8fd3ff';
      s += R(r.x + r.w, y0, 14, y1 - y0, 0, { fill: darken(wc, 0.45), op: 0.28 });
      s += R(r.x - 5, y0, 5, y1 - y0, 0, { fill: '#8a9bb0' }) + R(r.x + r.w, y0, 5, y1 - y0, 0, { fill: '#7a8ba0' });
      for (const x of [r.x - 2.5, r.x + r.w + 2.5]) {
        s += P(`M${n2(x)} ${n2(y0)}V${n2(y1)}`, { stroke: '#ffffff', sw: 3.2 });
        for (let y = y0 + 8; y < y1; y += 16) s += R(x - 3, y - 2, 6, 4, 1.5, { fill: '#e6eef5', stroke: '#8a9bb0', sw: 1 });
      }
      // 다리 끝 (둔치와 만나는 곳) 이음매
      s += R(r.x - 6, y1 - 3, r.w + 12, 6, 2, { fill: '#c8d4e0', stroke: '#8a9bb0', sw: 1.2 });
      // 가로등 두 개
      for (const x of [r.x - 3, r.x + r.w + 3]) s += C(x, y0 + (y1 - y0) * 0.5, 4.4, { fill: '#ffe9a8', stroke: '#8a9bb0', sw: 1.4 });
    }
  }
  // 판교 네온 테두리
  if (c.night) {
    for (const r of m.roads) {
      const q = car(r);
      const d = r.ax === 'h' ? `M${q.x} ${q.y}H${q.x + q.w}M${q.x} ${q.y + q.h}H${q.x + q.w}` : `M${q.x} ${q.y}V${q.y + q.h}M${q.x + q.w} ${q.y}V${q.y + q.h}`;
      s += P(d, { stroke: '#ffe9a8', sw: 9, so: 0.18 }) + P(d, { stroke: '#ffe9a8', sw: 2.6, so: 0.95 });
    }
  } else {
    // 차도 가장자리 그림자
    for (const r of m.roads) {
      const q = car(r);
      const d = r.ax === 'h' ? `M${q.x} ${q.y + 2}H${q.x + q.w}` : `M${q.x + 2} ${q.y}V${q.y + q.h}`;
      s += P(d, { stroke: '#000', sw: 4, so: 0.08 });
    }
  }
  sv.add(s);
  return sv.body();
}

export function mapBody(id: string, orient: string, pre: string): Body | null {
  const mm = /^m\.(\w+)\.(ground|roads)$/.exec(id);
  if (!mm) return null;
  const did = mm[1] as DistrictId;
  const o = (orient === 'port' ? 'port' : 'land') as Orient;
  const m = GDD.maps[did]?.[o];
  const d = DISTRICTS[did];
  if (!m || !d) return null;
  const c: MCtx = { sv: new Svg(pre), m, p: d.pal, id: did, night: did === 'pangyo', side: m.road * 0.18, rnd: rng(seedOf(did + mm[2], o)) };
  const body = mm[2] === 'ground' ? groundSvg(c) : roadsSvg(c);
  void heartPath;
  return { vb: [0, 0, m.W, m.H], body };
}

/** 타이틀 배경 등에서 지도 조각을 쓰기 위한 도우미 */
export function mapPieces(did: DistrictId, o: Orient, pre: string): { ground: string; roads: string; m: MapData } {
  const m = GDD.maps[did][o];
  const d = DISTRICTS[did];
  const g: MCtx = { sv: new Svg(pre + 'g'), m, p: d.pal, id: did, night: did === 'pangyo', side: m.road * 0.18, rnd: rng(seedOf(did + 'ground', o)) };
  const r: MCtx = { ...g, sv: new Svg(pre + 'r'), rnd: rng(seedOf(did + 'roads', o)) };
  return { ground: groundSvg(g), roads: roadsSvg(r), m };
}
