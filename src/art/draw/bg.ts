/**
 * 배경·로고 — bg.title@land|port (lazy) · bg.office.sky · bg.office.skyline · bg.office.skylineFar · bg.cloud0~2 · ui.logo
 *   타이틀: 한낮 하늘 + 먼 스카이라인 + 아래쪽에 원근으로 눕힌 탑뷰 상권 지도(블록·도로·횡단보도·가로수·콩눈 건물들)
 *   사무실 스카이라인: 가로로 이어붙여도 이음매 없음(건물은 0~1920 안, 가로수는 양끝에서 감아 그림)
 *   ui.logo: 식권 티켓 엠블럼(주황 톱니 티켓 + 금 테) 앞에 곰대리 상반신이 엄지 척. 글자는 엔진이 얹음(아래쪽 비움)
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, face, hashId, lighten, mix, n2, rng, roundPoly, sparkle, ticketPath, wonPath, type Mood } from '../kit';
import { targetBody } from './targets';
import { charFigure } from './characters';
import { TARGETS } from '../registry';

let sv: Svg;

/* ───────── 하늘 ───────── */

const SKY: Array<[number, string]> = [[0, '#7fa8e8'], [0.38, '#bcd7ff'], [0.72, '#ffd1dc'], [1, '#ffe9c4']];

function officeSky(): string {
  // 64×1080: 위 #7fa8e8 → #bcd7ff → #ffd1dc → 아래 #ffe9c4
  return R(0, 0, 64, 1080, 0, { fill: sv.lin(SKY.map(([o, c]) => [o, c] as [number, string])) });
}

/* ───────── 구름 ───────── */

function cloud(kind: number): string {
  // 360×160 흰 뭉게구름, 아래쪽 연분홍
  const sets: [number, number, number][][] = [
    [[180, 96, 58], [120, 108, 42], [240, 106, 46], [150, 72, 40], [212, 70, 36], [78, 120, 28], [290, 122, 28]],
    [[180, 104, 34], [120, 108, 30], [240, 108, 32], [70, 116, 22], [292, 116, 24], [150, 90, 28], [210, 88, 26], [34, 124, 14], [326, 124, 14]],
    [[108, 100, 38], [70, 112, 26], [146, 110, 28], [106, 76, 26], [256, 108, 30], [226, 118, 20], [286, 116, 22], [254, 88, 20]],
  ];
  const b = sets[kind] ?? sets[0];
  const f = sv.lin([[0, '#ffffff'], [0.62, '#fffafc'], [1, '#ffd6e2']], 0, 0, 0, 1);
  let s = '';
  for (const [x, y, r] of b) s += C(x, y + 5, r, { fill: '#e8b4c8', op: 0.25 });
  let shape = '';
  for (const [x, y, r] of b) shape += C(x, y, r);
  s += G(shape, { fill: f });
  // 바닥 평평하게 + 하이라이트
  const bot = Math.max(...b.map(([, y, r]) => y + r * 0.55));
  s += R(Math.min(...b.map(([x, , r]) => x - r * 0.4)), bot - 18, Math.max(...b.map(([x, , r]) => x + r * 0.4)) - Math.min(...b.map(([x, , r]) => x - r * 0.4)), 18, 9, { fill: '#ffe0ea', op: 0.75 });
  for (const [x, y, r] of b.slice(0, 3)) s += E(x - r * 0.3, y - r * 0.45, r * 0.34, r * 0.16, { fill: '#fff', op: 0.9 });
  return s;
}

/* ───────── 스카이라인 (옆모습) ───────── */

const PASTEL = ['#bfe0ff', '#c8ebd9', '#ffd9c2', '#d9d2ff', '#fff0c8', '#ffd6e2', '#cfe3f2', '#e8d8c4', '#b8e6c1', '#ffe3a3'];

interface Bld {
  x: number;
  w: number;
  h: number;
  c: string;
  roof: number;
  face: Mood | '';
}

function planRow(seed: number, x0: number, x1: number, hmin: number, hmax: number, wmin: number, wmax: number, gmin: number, gmax: number, faceEvery: number): Bld[] {
  const rn = rng(seed);
  const out: Bld[] = [];
  let x = x0;
  let i = 0;
  while (true) {
    const w = wmin + rn() * (wmax - wmin);
    if (x + w > x1) break;
    const tall = i % 3 === 1 ? 1 : 0.55 + rn() * 0.4;
    out.push({ x, w, h: hmin + (hmax - hmin) * tall, c: PASTEL[Math.floor(rn() * PASTEL.length)], roof: Math.floor(rn() * 5), face: faceEvery && i % faceEvery === 2 ? (['idle', 'happy', 'idle', 'blink'] as Mood[])[Math.floor(rn() * 4)] : '' });
    x += w + gmin + rn() * (gmax - gmin);
    i++;
  }
  return out;
}

/** 옆에서 본 파스텔 빌딩 하나 (바닥 by) */
function sideBuilding(b: Bld, by: number, detail: number): string {
  const { x, w, h, c } = b;
  const top = by - h;
  const line = edge(c);
  const sw = 3.2;
  const r = Math.min(14, w * 0.12);
  let s = '';
  // 옥상 소품 (뒤)
  if (b.roof === 0) s += P(`M${n2(x + w * 0.5)} ${n2(top)}V${n2(top - 46)}`, { stroke: line, sw: 3 }) + C(x + w * 0.5, top - 48, 4.4, { fill: '#ff8fab', stroke: line, sw: 2 });
  if (b.roof === 1) s += R(x + w * 0.62, top - 26, w * 0.24, 28, 6, { fill: lighten(c, 0.35), stroke: line, sw: 2.6 }) + P(`M${n2(x + w * 0.62)} ${n2(top - 16)}H${n2(x + w * 0.86)}`, { stroke: line, sw: 1.6, so: 0.6 });
  if (b.roof === 2) s += P(`M${n2(x + w * 0.2)} ${n2(top)}L${n2(x + w * 0.5)} ${n2(top - 40)}L${n2(x + w * 0.8)} ${n2(top)}Z`, { fill: lighten(c, 0.25), stroke: line, sw: 2.6 });
  if (b.roof === 3) s += R(x + w * 0.16, top - 20, w * 0.42, 20, 4, { fill: '#ffd36b', stroke: darken('#ffd36b', 0.7), sw: 2.4 }) + R(x + w * 0.21, top - 15, w * 0.32, 10, 3, { fill: '#fff6d0' });
  // 몸통
  s += P(`M${n2(x)} ${n2(by)}V${n2(top + r)}Q${n2(x)} ${n2(top)} ${n2(x + r)} ${n2(top)}H${n2(x + w - r)}Q${n2(x + w)} ${n2(top)} ${n2(x + w)} ${n2(top + r)}V${n2(by)}Z`, {
    fill: sv.lin([[0, lighten(c, 0.3)], [1, c]], 0, 0, 1, 0.3),
    stroke: line,
    sw,
  });
  // 오른쪽 그늘 면
  s += R(x + w * 0.8, top + 3, w * 0.2 - 2, h - 3, 0, { fill: darken(c, 0.86), op: 0.35 });
  // 옥상 테
  s += R(x + 3, top + 3, w - 6, 8, 4, { fill: '#fff', op: 0.45 });
  // 창 격자
  if (detail > 0) {
    const cols = Math.max(2, Math.round(w / 34));
    const cw = (w - 16) / cols;
    const rows = Math.max(2, Math.floor((h - 40) / 34));
    const faceRow = b.face ? Math.min(rows - 1, Math.max(1, Math.floor(rows * 0.45))) : -1;
    const wf = sv.lin([[0, '#ffffff'], [1, lighten(c, 0.2)]]);
    let wins = '', lits = '';
    for (let rr = 0; rr < rows; rr++) {
      if (rr === faceRow || rr === faceRow + 1) continue;
      for (let k = 0; k < cols; k++) {
        const wx = x + 8 + k * cw + cw * 0.14, wy = top + 20 + rr * 34;
        const lit = (k * 7 + rr * 3 + b.roof) % 5 === 0;
        const rr2 = R(wx, wy, cw * 0.72, 22, 5);
        if (lit) lits += rr2;
        else wins += rr2;
      }
    }
    s += G(wins, { fill: wf, stroke: mix(line, c, 0.45), sw: 1.6, so: 0.8 }) + G(lits, { fill: '#fff6d0', stroke: mix(line, c, 0.45), sw: 1.6, so: 0.8 });
    if (b.face) {
      const fy = top + 20 + faceRow * 34 + 30;
      s += R(x + 10, fy - 26, w - 20, 60, 14, { fill: '#fffaf2', stroke: mix(line, c, 0.3), sw: 2 });
      s += face(x + w / 2, fy + 2, Math.min(3, w / 44), b.face, { gap: 1.1 });
    }
    // 1층 문
    s += R(x + w / 2 - 12, by - 30, 24, 30, 6, { fill: darken(c, 0.78), stroke: line, sw: 2 }) + R(x + w / 2 - 8, by - 26, 16, 12, 3, { fill: '#e8f6ff', op: 0.8 });
  }
  return s;
}

function bushRow(W: number, by: number, seed: number, cols = ['#9fd89a', '#8fcf8a', '#b3e2a4']): string {
  const rn = rng(seed);
  let s = '';
  let x = 0;
  const items: [number, number, string][] = [];
  while (x < W) {
    const r = 18 + rn() * 16;
    items.push([x, r, cols[Math.floor(rn() * cols.length)]]);
    x += r * 1.3;
  }
  const one = (cx: number, r: number, c: string) =>
    C(cx, by - r * 0.55, r, { fill: sv.rad([[0, lighten(c, 0.35)], [1, c]], 0.4, 0.3, 0.8), stroke: edge(c), sw: 2.6 }) + E(cx - r * 0.35, by - r * 0.95, r * 0.3, r * 0.16, { fill: '#fff', op: 0.5 });
  for (const [cx, r, c] of items) {
    s += one(cx, r, c);
    if (cx < r) s += one(cx + W, r, c);
    if (cx > W - r) s += one(cx - W, r, c);
  }
  return s;
}

function officeSkyline(): string {
  // 1920×420, 앵커 (0, 1). 파스텔 빌딩 + 창 격자 + 몇 채 콩눈 + 아래 가로수 줄
  const W = 1920, H = 420;
  const by = H - 16;
  const bl = planRow(17, 12, W - 12, 170, 380, 118, 210, 14, 46, 3);
  let s = '';
  for (const b of bl) s += sideBuilding(b, by, 1);
  s += R(0, by - 4, W, 20, 0, { fill: '#e8dcc8' }) + R(0, by - 4, W, 4, 0, { fill: '#fff', op: 0.5 });
  s += bushRow(W, by + 6, 23);
  return s;
}

function officeSkylineFar(): string {
  // 1920×360 먼 스카이라인 (하늘색 옅게)
  const W = 1920, H = 360;
  const rn = rng(41);
  let s = '';
  let x = -10;
  const col = '#a9c6ee';
  while (x < W + 10) {
    const w = 60 + rn() * 110;
    const h = 110 + rn() * 230;
    const top = H - h;
    const cx0 = Math.max(0, x), cx1 = Math.min(W, x + w);
    if (cx1 - cx0 > 20) {
      s += R(cx0, top, cx1 - cx0, h, 6, { fill: sv.lin([[0, mix(col, '#ffffff', 0.25)], [1, mix(col, '#ffd1dc', 0.3)]]), op: 0.6 });
      if (rn() < 0.4) s += P(`M${n2(cx0 + (cx1 - cx0) / 2)} ${n2(top)}V${n2(top - 24 - rn() * 30)}`, { stroke: col, sw: 3, so: 0.6 });
      for (let wy = top + 16; wy < H - 20; wy += 26) for (let wx = cx0 + 10; wx < cx1 - 14; wx += 20) if (rn() < 0.55) s += R(wx, wy, 9, 12, 2, { fill: '#ffffff', op: 0.35 });
    }
    x += w + 6 + rn() * 20;
  }
  return G(s, { op: 0.9 });
}

/* ───────── 타이틀 배경 (원근 탑뷰 지도) ───────── */

interface Cam {
  W: number;
  H: number;
  hy: number;
  cx: number;
  D: number;
}
function proj(c: Cam, X: number, Z: number): [number, number, number] {
  const f = c.D / (c.D + Z);
  return [c.cx + (X - c.cx) * f, c.hy + (c.H - c.hy) * f, f];
}
function quad(c: Cam, x0: number, z0: number, x1: number, z1: number): number[] {
  const a = proj(c, x0, z0), b = proj(c, x1, z0), d = proj(c, x1, z1), e = proj(c, x0, z1);
  return [a[0], a[1], b[0], b[1], d[0], d[1], e[0], e[1]];
}

const TITLE_PAL = { ground: '#f3e6cf', side: '#fff6e6', block: '#ecdcc0', road: '#cdbfa6', line: '#fff8ec', park: '#bfe3a8' };

function titleBg(orient: 'land' | 'port'): string {
  const land = orient === 'land';
  const W = land ? 1920 : 1080, H = land ? 1080 : 1920;
  const hy = land ? 610 : 1110;
  const cam: Cam = { W, H, hy, cx: W / 2, D: land ? 1150 : 1250 };
  const PAL = TITLE_PAL;
  let s = '';
  // 하늘
  s += R(0, 0, W, hy + 40, 0, { fill: sv.lin([[0, '#7fa8e8'], [0.45, '#bcd7ff'], [0.8, '#ffd1dc'], [1, '#ffe9c4']]) });
  // 해
  const sx = land ? W * 0.8 : W * 0.78, sy = land ? 150 : 260;
  s += C(sx, sy, land ? 360 : 300, { fill: sv.rad([[0, '#fff6d8', 0.95], [0.25, '#fff0c8', 0.55], [1, '#ffe9c4', 0]]) });
  s += C(sx, sy, 58, { fill: '#fffbea' });
  const farY = proj(cam, 0, 9000)[1];
  // 땅 (원근)
  s += R(0, hy, W, H - hy, 0, { fill: PAL.road });
  {
    // 아주 먼 블록들은 한 덩어리로 (지평선 ~ 마지막 블록 줄)
    s += R(0, hy, W, farY - hy + 4, 0, { fill: sv.lin([[0, mix(PAL.block, '#ffe9c4', 0.5)], [1, mix(PAL.block, PAL.road, 0.35)]]) });
    for (let y = hy + 6; y < farY; y += 7 + (y - hy) * 0.18) s += P(`M0 ${n2(y)}H${W}`, { stroke: PAL.road, sw: 1 + (y - hy) * 0.05, so: 0.5 });
  }
  // 먼 스카이라인
  {
    const rn = rng(5);
    let x = -20;
    while (x < W + 20) {
      const w = 50 + rn() * 90, h = 70 + rn() * 170;
      s += R(x, farY - h, w, h + 4, 5, { fill: mix('#a9c6ee', '#ffd1dc', 0.35), op: 0.55 });
      for (let wy = farY - h + 14; wy < farY - 10; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rn() < 0.45) s += R(wx, wy, 7, 9, 2, { fill: '#fff', op: 0.3 });
      x += w + 4 + rn() * 16;
    }
  }
  // 가까운 스카이라인 (지평선 위, 작게 · 하늘빛으로 옅게)
  {
    const k = 0.5;
    const bl = planRow(9, -60, W / k + 60, 150, 330, 90, 170, 10, 40, 4);
    let row = '';
    for (const b of bl) row += sideBuilding({ ...b, c: mix(b.c, '#cfe0ff', 0.25) }, 0, 1);
    s += G(row, { tf: `translate(0 ${n2(farY + 3)}) scale(${k})`, op: 0.92 });
  }
  const P0 = 420, RD = 90; // 블록 간격, 도로 폭
  const zRows: number[] = [];
  for (let z = -P0 * 0.35; z < 9000; z += P0) zRows.push(z);
  const xMin = cam.cx - 9000, xMax = cam.cx + 9000;
  const blocks: { x0: number; z0: number; x1: number; z1: number; kind: 'lots' | 'park' | 'plaza'; j: number; k: number }[] = [];
  zRows.forEach((z, k) => {
    for (let j = -22; j <= 22; j++) {
      const x0 = cam.cx + j * P0 + RD / 2, x1 = cam.cx + (j + 1) * P0 - RD / 2;
      if (x1 < xMin || x0 > xMax) continue;
      const kind = (j === 0 && k === 1) || (j === -3 && k === 3) ? 'park' : j === -1 && k === 2 ? 'plaza' : 'lots';
      blocks.push({ x0, z0: z + RD, x1, z1: z + P0, kind, j, k });
    }
  });
  // 보도 + 블록 (먼 것부터)
  blocks.sort((a, b) => b.z0 - a.z0);
  for (const b of blocks) {
    const f = proj(cam, b.x0, b.z0)[2];
    if (f < 0.02) continue;
    {
      const qq = quad(cam, b.x0 - 20, b.z0 - 20, b.x1 + 20, b.z1 + 20);
      const xs = [qq[0], qq[2], qq[4], qq[6]];
      if (Math.max(...xs) < 0 || Math.min(...xs) > W) continue;
    }
    if (f < 0.07) {
      s += PL(quad(cam, b.x0, b.z0, b.x1, b.z1), { fill: b.kind === 'park' ? PAL.park : PAL.block });
      continue;
    }
    const pad = 18;
    s += P(roundPoly(quad(cam, b.x0 - pad, b.z0 - pad, b.x1 + pad, b.z1 + pad), 10 * f), { fill: PAL.side });
    const fill = b.kind === 'park' ? PAL.park : b.kind === 'plaza' ? '#fff4d8' : PAL.block;
    s += P(roundPoly(quad(cam, b.x0, b.z0, b.x1, b.z1), 16 * f), { fill, stroke: darken(fill, 0.88), sw: Math.max(0.6, 2.4 * f) });
    if (b.kind === 'lots' && f > 0.18) {
      // 부지 경계
      const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
      const a = proj(cam, mx, b.z0 + 10), c2 = proj(cam, mx, b.z1 - 10), d = proj(cam, b.x0 + 10, mz), e = proj(cam, b.x1 - 10, mz);
      s += P(`M${n2(a[0])} ${n2(a[1])}L${n2(c2[0])} ${n2(c2[1])}M${n2(d[0])} ${n2(d[1])}L${n2(e[0])} ${n2(e[1])}`, { stroke: darken(PAL.block, 0.9), sw: 2.2 * f, so: 0.7 });
    }
    if (b.kind === 'plaza') {
      const cc = proj(cam, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      s += E(cc[0], cc[1], 120 * cc[2], 120 * cc[2] * 0.42, { fill: '#ffe9a8', stroke: '#e6c270', sw: 3 * cc[2] });
      s += E(cc[0], cc[1], 60 * cc[2], 60 * cc[2] * 0.42, { fill: '#bfe8ff', stroke: '#7fb8e0', sw: 3 * cc[2] });
    }
    if (b.kind === 'park' && f > 0.12) {
      const cc = proj(cam, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      s += E(cc[0], cc[1], 110 * cc[2], 110 * cc[2] * 0.4, { fill: '#f6ecd4', op: 0.9 });
    }
  }
  // 차선 점선 (도로마다 한 path)
  let lines = '';
  const qd = (pts: number[]) => 'M' + n2(pts[0]) + ' ' + n2(pts[1]) + 'L' + n2(pts[2]) + ' ' + n2(pts[3]) + 'L' + n2(pts[4]) + ' ' + n2(pts[5]) + 'L' + n2(pts[6]) + ' ' + n2(pts[7]) + 'Z';
  for (let j = -22; j <= 22; j++) {
    const X = cam.cx + j * P0;
    let d = '';
    for (let z = -200; z < 7000; z += 90) {
      if (proj(cam, X, z)[2] < 0.08) break;
      const [x0] = proj(cam, X - 2.6, z), [x1] = proj(cam, X + 2.6, z);
      if (Math.max(x0, x1) < -10 || Math.min(x0, x1) > W + 10) continue;
      d += qd(quad(cam, X - 2.6, z, X + 2.6, z + 44));
    }
    if (d) lines += P(d, { fill: PAL.line, op: 0.85 });
  }
  for (const z of zRows) {
    const Z = z + RD / 2;
    const f = proj(cam, 0, Z)[2];
    if (f < 0.08) continue;
    const y = proj(cam, 0, Z)[1];
    lines += P('M0 ' + n2(y) + 'H' + W, { stroke: PAL.line, sw: 4.6 * f, da: n2(46 * f) + ' ' + n2(40 * f), so: 0.8 });
    // 횡단보도 (가까운 줄만, 한 줄에 한 path)
    if (f > 0.3) {
      let d = '';
      for (let j = -6; j <= 6; j++) {
        const X = cam.cx + j * P0;
        for (let q = 0; q < 6; q++) {
          const xx = X + RD / 2 + 14 + q * 20;
          const xx2 = X - RD / 2 - 14 - q * 20 - 11;
          for (const x of [xx, xx2]) {
            const [sx0] = proj(cam, x, z);
            if (sx0 < -20 || sx0 > W + 20) continue;
            d += qd(quad(cam, x, z + 14, x + 11, z + RD - 14));
          }
        }
      }
      if (d) lines += P(d, { fill: '#ffffff', op: 0.85 });
    }
  }
  s += lines;
  // 지평선 옅은 안개
  s += R(0, farY - 26, W, 60, 0, { fill: sv.lin([[0, '#ffe9c4', 0], [0.45, '#ffe9c4', 0.55], [1, '#ffe9c4', 0]]) });
  // 건물·가로수 (먼 것부터). 대상 그림(콩눈) 재사용
  type Put = { z: number; draw: () => string };
  const puts: Put[] = [];
  const rn = rng(orient === 'land' ? 88 : 99);
  const smalls = ['c01', 'r01', 'c02', 'r02', 'c03', 'r04', 'c04', 'r07', 'c05', 'r08', 'c07', 'c06'];
  const bigs = ['c09', 'r09', 'c10', 'c08', 'r05', 'r10'];
  const moods: string[] = ['idle', 'idle', 'happy', 'idle', 'idle'];
  let bi = 0, si = 0;
  for (const b of blocks) {
    const f = proj(cam, b.x0, b.z1)[2];
    if (f < 0.2 || b.kind !== 'lots') continue;
    const [lx] = proj(cam, b.x1 + 60, b.z0);
    const [rx] = proj(cam, b.x0 - 60, b.z0);
    if (lx < -40 || rx > W + 40) continue;
    const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
    const bw = b.x1 - b.x0;
    if ((b.j + b.k * 2) % 4 === 1 && b.k >= 1) {
      const id = bigs[bi++ % bigs.length];
      puts.push({ z: mz, draw: () => bldg(cam, id, moods[(bi + b.k) % moods.length], mx, mz + 40, bw * 0.95) });
    } else {
      const pos: [number, number][] = [[b.x0 + bw * 0.27, b.z0 + (b.z1 - b.z0) * 0.3], [b.x0 + bw * 0.73, b.z0 + (b.z1 - b.z0) * 0.3], [b.x0 + bw * 0.27, b.z0 + (b.z1 - b.z0) * 0.78], [b.x0 + bw * 0.73, b.z0 + (b.z1 - b.z0) * 0.78]];
      for (const [px, pz] of pos) {
        if (rn() < 0.28) continue;
        const id = smalls[si++ % smalls.length];
        const sz = 129 * (TARGETS[id]?.s ?? 0.8) * 1.3;
        puts.push({ z: pz, draw: () => bldg(cam, id, moods[(si + b.j + 7) % moods.length], px, pz, sz) });
      }
    }
    // 가로수 (보도 앞줄)
    for (let q = 0; q < 3; q++) {
      const tx = b.x0 + 30 + q * ((bw - 60) / 2);
      puts.push({ z: b.z0 - 34, draw: () => treeAt(cam, tx, b.z0 - 26) });
    }
  }
  // 공원 나무
  for (const b of blocks) {
    if (b.kind !== 'park') continue;
    const f = proj(cam, b.x0, b.z1)[2];
    if (f < 0.12) continue;
    for (let q = 0; q < 7; q++) {
      const tx = b.x0 + 40 + rn() * (b.x1 - b.x0 - 80), tz = b.z0 + 40 + rn() * (b.z1 - b.z0 - 80);
      puts.push({ z: tz, draw: () => treeAt(cam, tx, tz, 1.25) });
    }
  }
  puts.sort((a, b) => b.z - a.z);
  for (const p of puts) s += p.draw();
  // 아래쪽 은은한 비네트
  s += R(0, H - 220, W, 220, 0, { fill: sv.lin([[0, '#5c3a1a', 0], [1, '#5c3a1a', 0.12]]) });
  return s;
}

/** 원근 위치에 대상 그림 하나 (앵커 0.5, 0.8) */
/** 원근 위치에 대상 그림 하나 (앵커 0.5, 0.8). 같은 대상·표정은 한 번만 정의하고 <use> 로 재사용(파일 크기) */
const symDone = new Set<string>();
function bldg(cam: Cam, id: string, mood: string, X: number, Z: number, size: number): string {
  const [x, y, f] = proj(cam, X, Z);
  const px = size * f;
  const info = TARGETS[id];
  if (!info) return '';
  const big = !!info.big;
  const sid = sv.pre + '_t' + id + mood;
  if (!symDone.has(sid)) {
    const body = targetBody('t.' + id, mood, big ? 190 : 110, hashId('bgt.' + id + '@' + mood), info);
    if (!body) return '';
    sv.def('<g id="' + sid + '">' + body + '</g>');
    symDone.add(sid);
  }
  const sc = px / 240;
  const shadow = E(x + px * 0.05, y + px * 0.02, px * 0.44, px * 0.13, { fill: '#5c3a1a', op: 0.16 });
  return shadow + '<use href="#' + sid + '" transform="translate(' + n2(x - 120 * sc) + ' ' + n2(y - 192 * sc) + ') scale(' + n2(sc) + ')"/>';
}

function treeAt(cam: Cam, X: number, Z: number, k = 1): string {
  const [x, y, f] = proj(cam, X, Z);
  const sid = sv.pre + '_tree';
  if (!symDone.has(sid)) {
    // r = 26 기준 나무 한 그루 (밑동 0,0)
    const c = '#9fd89a';
    sv.def('<g id="' + sid + '">' + E(6.5, 0, 23.4, 7.8, { fill: '#5c3a1a', op: 0.14 }) + R(-3.64, -28.6, 7.28, 28.6, 2.6, { fill: '#a8764e' }) +
      C(0, -39, 26, { fill: sv.rad([[0, lighten(c, 0.4)], [1, c]], 0.38, 0.3, 0.8), stroke: edge(c), sw: 2.6 }) + E(-9.1, -49.4, 7.8, 4.68, { fill: '#fff', op: 0.45 }) + '</g>');
    symDone.add(sid);
  }
  return '<use href="#' + sid + '" transform="translate(' + n2(x) + ' ' + n2(y) + ') scale(' + n2(f * k) + ')"/>';
}

/* ───────── 로고 ───────── */

function logo(): string {
  // 640×360. 티켓 엠블럼(뒤) + 곰대리 상반신(앞) 엄지 척. 아래 y 290~360 은 제목 글자가 겹침
  let s = '';
  // 뒤 햇살 반짝
  s += E(320, 190, 300, 170, { fill: sv.rad([[0, '#fff6c8', 0.85], [0.6, '#fff6c8', 0.25], [1, '#fff6c8', 0]]) });
  // 티켓 엠블럼 (살짝 기울임)
  const tk = (dy: number, fill: string, stroke?: string, sw = 0) => P(ticketPath(34, 118 + dy, 572, 190, 30, 20, 3), { fill, stroke, sw });
  let t = tk(10, '#5c3a1a');
  t = G(t, { op: 0.35 });
  t += tk(0, '#f0b429', '#8a6414', 5);
  t += P(ticketPath(48, 131, 544, 164, 22, 15, 3), { fill: sv.lin([[0, '#ffc98a'], [0.5, '#ff9f43'], [1, '#f07f2a']]), stroke: '#fff3c4', sw: 3 });
  t += P('M62 146H578M62 280H578', { stroke: '#fff3c4', sw: 3, da: '10 8', so: 0.85 });
  t += R(70, 138, 500, 22, 11, { fill: '#fff', op: 0.3 });
  // 양쪽 ₩ 동전
  for (const cx of [118, 522]) {
    t += C(cx, 214, 40, { fill: sv.lin([[0, '#fff3b8'], [1, '#f0b429']]), stroke: '#a8791a', sw: 4 }) + C(cx, 214, 30, { fill: 'none', stroke: '#fff', sw: 2.6, so: 0.8 });
    t += G(P(wonPath(15), { fill: 'none', stroke: '#fff', sw: 6 }), { tf: `translate(${cx} 214)` }) + G(P(wonPath(15), { fill: 'none', stroke: '#c9901a', sw: 2, so: 0.5 }), { tf: `translate(${cx + 1.5} 216)` });
    t += E(cx - 14, 196, 8, 4.4, { fill: '#fff', op: 0.8, tf: `rotate(-30 ${cx - 14} 196)` });
  }
  s += G(t, { tf: 'rotate(-3 320 214)' });
  // 반짝이
  s += sparkle(64, 92, 16) + sparkle(586, 84, 20) + sparkle(610, 150, 9, '#ffb3c1') + sparkle(36, 150, 10, '#ffb3c1') + sparkle(470, 40, 10);
  // 곰대리 (256 좌표 → 스케일 1.3, 머리 가운데 (320, 128))
  const k = 1.3;
  const fig = charFigure('bear', 'idle', sv);
  const tx = 320 - 128 * k, ty = 128 - 114 * k;
  // 몸 아래를 티켓 아래 선에서 부드럽게 끊음
  const clip = sv.clip(R(0, 0, 640, 336, 0));
  s += G(G(fig, { tf: `translate(${n2(tx)} ${n2(ty)}) scale(${k})` }), { cp: clip });
  // 엄지 척 (오른쪽 팔: 정장 소매 + 주먹 + 세운 엄지)
  const fur = '#c89b6d', suit = '#51639a';
  const sl = edge(suit);
  const arm = 'M404 300Q452 280 458 214';
  s += P(arm, { fill: 'none', stroke: sl, sw: 44 }) + P(arm, { fill: 'none', stroke: sv.lin([[0, lighten(suit, 0.2)], [1, suit]]), sw: 36 });
  s += R(438, 208, 42, 14, 6, { fill: '#fff', stroke: '#b8c0d0', sw: 2 });
  // 주먹
  s += R(432, 160, 54, 52, 20, { fill: sv.lin([[0, lighten(fur, 0.3)], [1, fur]]), stroke: edge(fur), sw: 4 });
  s += P('M440 176H474M440 190H474', { stroke: edge(fur), sw: 2.4, so: 0.6 });
  // 엄지
  s += P('M446 164Q438 120 454 112Q470 108 468 128L466 164Z', { fill: sv.lin([[0, lighten(fur, 0.4)], [1, fur]]), stroke: edge(fur), sw: 4 });
  s += E(452, 124, 5, 3, { fill: '#fff', op: 0.6, tf: 'rotate(-60 452 124)' });
  s += sparkle(500, 118, 12);
  return s;
}

/* ───────── 나눠 보내기 ───────── */

export function bgBody(key: string, pre: string, w: number, h: number): Body | null {
  sv = new Svg(pre);
  switch (key) {
    case 'bg.office.sky':
      sv.add(officeSky());
      return { vb: [0, 0, 64, 1080], body: sv.body() };
    case 'bg.office.skyline':
      sv.add(officeSkyline());
      return { vb: [0, 0, 1920, 420], body: sv.body() };
    case 'bg.office.skylineFar':
      sv.add(officeSkylineFar());
      return { vb: [0, 0, 1920, 360], body: sv.body() };
    case 'bg.cloud0':
    case 'bg.cloud1':
    case 'bg.cloud2':
      sv.add(cloud(Number(key.slice(-1))));
      return { vb: [0, 0, 360, 160], body: sv.body() };
    case 'bg.title@land':
      symDone.clear();
      sv.add(titleBg('land'));
      return { vb: [0, 0, 1920, 1080], body: sv.body() };
    case 'bg.title@port':
      symDone.clear();
      sv.add(titleBg('port'));
      return { vb: [0, 0, 1080, 1920], body: sv.body() };
    case 'ui.logo':
      sv.add(logo());
      return { vb: [0, 0, 640, 360], body: sv.body() };
  }
  void w; void h; void PL;
  return null;
}
