/**
 * 효과 텍스처 43종 (앵커 0.5, 0.5 — fx.flyer 는 엔진이 0.5, 0.8 · fx.arrow 는 0.5, 1 로 씀).
 * viewBox = 픽셀 크기 그대로 (w×h).
 * 엔진이 tint 로 색을 입히는 것(fx.glow · fx.ring · fx.dot · fx.firework · fx.streak · fx.vignette)은 흰색으로 그린다.
 *   fx.vignette 도 흰 가장자리: 빨강 tint = 남은 5초 경고, add + 금색 = 러시 테두리, 검정 tint = 보스 등장 어둡게.
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, face, heartPath, lighten, mix, n2, pPath, rng, roundStar, sparkle, sweat, ticketPath, wonPath, starPath } from '../kit';

let sv: Svg;
const gf = (c: string, k = 0.4) => sv.lin([[0, lighten(c, k)], [1, c]], 0, 0, 0.25, 1);
const o = (c: string, sw = 2.4, grad = true) => ({ fill: grad ? gf(c) : c, stroke: edge(c), sw });
const shine = (x: number, y: number, rx: number, ry: number, rot = -30, op = 0.7) => E(x, y, rx, ry, { fill: '#fff', op, tf: `rotate(${rot} ${n2(x)} ${n2(y)})` });

const INKRED = '#e53935';

/* ───────── 도장·잉크 ───────── */

/** 도장 인주 결: 작은 구멍들이 뚫린 마스크 */
function grainMask(w: number, h: number, seed: number, n: number): string {
  const id = sv.uid();
  const rn = rng(seed);
  let holes = '';
  for (let i = 0; i < n; i++) {
    const x = rn() * w, y = rn() * h, r = 0.8 + rn() * 2.6;
    holes += C(x, y, r, { fill: '#000', op: 0.35 + rn() * 0.5 });
  }
  // 긁힌 자국 몇 줄
  for (let i = 0; i < 7; i++) {
    const x = rn() * w, y = rn() * h, l = 14 + rn() * 30, a = rn() * 180;
    holes += P(`M${n2(x)} ${n2(y)}l${n2(Math.cos(a) * l)} ${n2(Math.sin(a) * l)}`, { stroke: '#000', sw: 1 + rn() * 1.6, so: 0.4 });
  }
  sv.def(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>${holes}</mask>`);
  return `url(#${id})`;
}

function stamp(): string {
  // 300×300. 이중 원 + 좌우 별(바깥 원을 끊고 별) + 두 원 사이 점 테. 가운데는 비움 — 엔진이 '영업/성공!' 두 줄을 얹음(약 185×156).
  const cx = 150, cy = 150;
  const mask = grainMask(300, 300, 31, 170);
  // 바깥 원: 좌우(별 자리)만 끊음
  const gapA = 12; // 도
  const arc = (r: number, a0: number, a1: number) => {
    const p0 = [cx + Math.cos((a0 * Math.PI) / 180) * r, cy + Math.sin((a0 * Math.PI) / 180) * r];
    const p1 = [cx + Math.cos((a1 * Math.PI) / 180) * r, cy + Math.sin((a1 * Math.PI) / 180) * r];
    return 'M' + n2(p0[0]) + ' ' + n2(p0[1]) + 'A' + r + ' ' + r + ' 0 0 1 ' + n2(p1[0]) + ' ' + n2(p1[1]);
  };
  let s = P(arc(135, gapA, 180 - gapA) + arc(135, 180 + gapA, 360 - gapA), { fill: "none", stroke: INKRED, sw: 11, lc: "round" });
  s += C(cx, cy, 121, { fill: "none", stroke: INKRED, sw: 3.4 });
  // 두 원 사이 점 테
  for (let i = 0; i < 360; i += 7.5) {
    if (i < gapA + 6 || (i > 180 - gapA - 6 && i < 180 + gapA + 6) || i > 360 - gapA - 6) continue;
    const r = (i * Math.PI) / 180;
    s += C(cx + Math.cos(r) * 127.5, cy + Math.sin(r) * 127.5, 1.6, { fill: INKRED });
  }
  // 좌우 별
  s += G(P(roundStar(14.5, 6.8, 2), { fill: INKRED }), { tf: 'translate(' + (cx - 135) + ' ' + cy + ') rotate(-8)' });
  s += G(P(roundStar(14.5, 6.8, 2), { fill: INKRED }), { tf: 'translate(' + (cx + 135) + ' ' + cy + ') rotate(8)' });
  // 위·아래 작은 별 (안쪽 원 바로 안, 글자와 겹치지 않는 자리)
  s += G(P(roundStar(7, 3.4, 1), { fill: INKRED }), { tf: 'translate(' + cx + ' ' + (cy - 108) + ')' });
  s += G(P(roundStar(7, 3.4, 1), { fill: INKRED }), { tf: 'translate(' + cx + ' ' + (cy + 108) + ')' });
  return G(s, { mk: mask, op: 0.96 });
}

function blobPath(cx: number, cy: number, r: number, n: number, jit: number, seed: number): string {
  const rn = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - jit + rn() * jit * 2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // 부드러운 닫힌 곡선 (중점 이차 곡선)
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    d += (i ? '' : `M${n2((pts[n - 1][0] + p[0]) / 2)} ${n2((pts[n - 1][1] + p[1]) / 2)}`) + `Q${n2(p[0])} ${n2(p[1])} ${n2(mx)} ${n2(my)}`;
  }
  return d + 'Z';
}

function stampInk(): string {
  // 360×360 연분홍 잉크 번짐 + 튄 점
  const cx = 180, cy = 180;
  const f = sv.rad([[0, '#ff8fab', 0.3], [0.6, '#ff8fab', 0.46], [0.9, '#ff7a9c', 0.62], [1, '#ff6f93', 0.7]]);
  let s = P(blobPath(cx, cy, 150, 22, 0.07, 5), { fill: f });
  s += P(blobPath(cx, cy, 128, 16, 0.05, 9), { fill: '#ff8fab', op: 0.18 });
  const rn = rng(77);
  for (let i = 0; i < 26; i++) {
    const a = rn() * Math.PI * 2;
    const d = 150 + rn() * 26;
    const r = 2 + rn() * 6.5;
    s += C(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, { fill: '#ff7a9c', op: 0.55 + rn() * 0.3 });
  }
  // 흘러내린 방울 두 개
  s += P(`M${cx + 96} ${cy + 104}q10 16 2 30q-10 6 -12 -6q-2 -12 10 -24Z`, { fill: '#ff7a9c', op: 0.6 });
  s += P(`M${cx - 120} ${cy + 70}q12 10 8 24q-9 7 -14 -3q-4 -10 6 -21Z`, { fill: '#ff7a9c', op: 0.5 });
  return s;
}

/* ───────── 말풍선·배너 (9-slice) ───────── */

function bubble(): string {
  // 192×120, 9-slice [40,36,40,44]. 크림 몸통 + 흰 테 6 + 아래 가운데 꼬리 + 바닥 그림자(#5c3a1a)
  const body = (dx: number, dy: number, ins: number) =>
    `M${6 + ins + dx} ${36 + dy}Q${6 + ins + dx} ${6 + ins + dy} ${36 + dx} ${6 + ins + dy}H${156 + dx}Q${186 - ins + dx} ${6 + ins + dy} ${186 - ins + dx} ${36 + dy}V${62 + dy}Q${186 - ins + dx} ${92 - ins + dy} ${156 + dx} ${92 - ins + dy}H${107 - ins * 0.4 + dx}L${96 + dx} ${113 - ins * 1.6 + dy}L${85 + ins * 0.4 + dx} ${92 - ins + dy}H${36 + dx}Q${6 + ins + dx} ${92 - ins + dy} ${6 + ins + dx} ${62 + dy}Z`;
  let s = P(body(0, 5, 0), { fill: '#5c3a1a', fo: 0.35 });
  s += P(body(0, 0, 0), { fill: '#ffffff' });
  s += P(body(0, 0, 6), { fill: sv.lin([[0, '#fffdf7'], [1, '#fff3de']]) });
  s += P('M40 18H150', { stroke: '#fff', sw: 4, so: 0.9 });
  return s;
}

function banner(): string {
  // 720×140, 9-slice [90,40,90,40]. 금 리본: 가운데 띠 x 62..658 · 양끝 접힌 꼬리(#c9a13d) x 0..88 / 632..720
  const tailC = '#c9a13d', line = '#8a6414';
  let s = '';
  // 그림자
  s += PL([2, 50, 88, 50, 88, 134, 2, 134, 24, 92], { fill: '#5c3a1a', op: 0.3, tf: 'translate(0 4)' });
  s += PL([718, 50, 632, 50, 632, 134, 718, 134, 696, 92], { fill: '#5c3a1a', op: 0.3, tf: 'translate(0 4)' });
  // 꼬리
  s += PL([2, 46, 88, 46, 88, 128, 2, 128, 24, 87], { fill: sv.lin([[0, '#e2bb52'], [1, tailC]]), stroke: line, sw: 3.4, lj: 'round' });
  s += PL([718, 46, 632, 46, 632, 128, 718, 128, 696, 87], { fill: sv.lin([[0, '#e2bb52'], [1, tailC]]), stroke: line, sw: 3.4, lj: 'round' });
  s += P('M14 58H80M14 116H80M640 58H706M640 116H706', { stroke: '#fff3c4', sw: 2, da: '6 5', so: 0.7 });
  // 접힘 그늘
  s += PL([62, 112, 88, 128, 88, 112], { fill: '#8a6414' }) + PL([658, 112, 632, 128, 632, 112], { fill: '#8a6414' });
  // 가운데 띠
  s += R(62, 18, 596, 100, 14, { fill: '#5c3a1a', op: 0.32, tf: 'translate(0 6)' });
  s += R(62, 16, 596, 98, 14, { fill: sv.lin([[0, '#fff6c8'], [0.45, '#ffd36b'], [1, '#f0b429']]), stroke: line, sw: 3.6 });
  s += R(72, 25, 576, 80, 9, { fill: 'none', stroke: '#fff3c4', sw: 2.4, da: '8 6', so: 0.9 });
  s += R(80, 22, 560, 14, 7, { fill: '#fff', op: 0.45 });
  return s;
}

/* ───────── 재화 파티클 ───────── */

function coin(cx: number, cy: number, r: number, c: string, glyph: 'won' | 'p'): string {
  const dark = darken(c, 0.78);
  let s = E(cx, cy + r * 0.12, r, r * 0.98, { fill: dark, stroke: edge(c), sw: r * 0.1 });
  s += C(cx, cy - r * 0.04, r * 0.94, { fill: sv.lin([[0, lighten(c, 0.55)], [0.5, c], [1, darken(c, 0.92)]], 0, 0, 0.3, 1), stroke: '#fff', sw: r * 0.12, so: 0.9 });
  s += C(cx, cy - r * 0.04, r * 0.66, { fill: 'none', stroke: darken(c, 0.86), sw: r * 0.06, so: 0.5 });
  if (glyph === 'won') s += G(P(wonPath(r * 0.36), { fill: 'none', stroke: '#fff', sw: r * 0.16 }) , { tf: `translate(${n2(cx)} ${n2(cy - r * 0.02)})` });
  else s += G(P(pPath(r * 0.42), { fill: 'none', stroke: '#fff', sw: r * 0.18 }), { tf: `translate(${n2(cx + r * 0.06)} ${n2(cy - r * 0.04)})` });
  s += shine(cx - r * 0.42, cy - r * 0.46, r * 0.2, r * 0.11, -35, 0.85);
  return s;
}

function ticketFx(): string {
  // 56×36 주황 식권
  const c = '#ff9f43';
  let s = P(ticketPath(3, 4, 50, 29, 5, 4.2, 2), { fill: '#b8641a', op: 0.5, tf: 'translate(0 1.6)' });
  s += P(ticketPath(3, 3, 50, 29, 5, 4.2, 2), { fill: sv.lin([[0, '#ffc98a'], [1, c]]), stroke: edge(c), sw: 1.8 });
  s += P('M38 7V29', { stroke: '#fff', sw: 1.4, da: '2.4 2.4', so: 0.9 });
  s += G(P(wonPath(5.8), { fill: 'none', stroke: '#fff', sw: 2.4 }), { tf: 'translate(21 17.5)' });
  s += R(42, 11, 6, 3, 1.5, { fill: '#fff', op: 0.8 }) + R(42, 17, 6, 3, 1.5, { fill: '#fff', op: 0.6 }) + R(42, 23, 6, 3, 1.5, { fill: '#fff', op: 0.8 });
  s += P('M9 7H24', { stroke: '#fff', sw: 1.6, so: 0.7 });
  return s;
}

function spark(): string {
  // 48×48 4갈래 반짝 (흰 가운데 → 노랑 끝) + 은은한 빛
  let s = C(24, 24, 20, { fill: sv.rad([[0, '#fff6c8', 0.7], [1, '#fff6c8', 0]]) });
  const d = 'M24 1Q26.2 21.8 47 24Q26.2 26.2 24 47Q21.8 26.2 1 24Q21.8 21.8 24 1Z';
  s += P(d, { fill: sv.rad([[0, '#ffffff'], [0.35, '#fffbe0'], [1, '#ffd84a']]) });
  s += P('M24 12Q25 23 36 24Q25 25 24 36Q23 25 12 24Q23 23 24 12Z', { fill: '#fff', tf: 'rotate(45 24 24)', op: 0.75 });
  s += C(24, 24, 4.2, { fill: '#fff' });
  return s;
}

function starFx(): string {
  // 64×64 5각 별 #ffe066
  const c = '#ffe066';
  let s = G(P(roundStar(28, 14, 4), { fill: '#b8860b', op: 0.35 }), { tf: 'translate(32 35)' });
  s += G(P(roundStar(28, 14, 4), { fill: sv.lin([[0, '#fff6c0'], [0.55, c], [1, '#f5c02e']]), stroke: '#c9901a', sw: 2.6 }), { tf: 'translate(32 33)' });
  s += G(P(roundStar(17, 8.5, 2.6), { fill: '#fff', op: 0.35 }), { tf: 'translate(32 33)' });
  s += shine(24, 24, 5, 3, -40, 0.9);
  return s;
}

/* ───────── 빛·링·반경 (흰색, tint 용) ───────── */

const dot = () => C(16, 16, 16, { fill: sv.rad([[0, '#fff', 1], [0.45, '#fff', 0.85], [0.75, '#fff', 0.35], [1, '#fff', 0]]) });
const glow = () => C(128, 128, 128, { fill: sv.rad([[0, '#fff', 1], [0.18, '#fff', 0.72], [0.42, '#fff', 0.32], [0.7, '#fff', 0.1], [1, '#fff', 0]]) });
const ring = () => C(128, 128, 128, { fill: sv.rad([[0.8, '#fff', 0], [0.875, '#fff', 0.95], [0.945, '#fff', 1], [0.995, '#fff', 0]]) });

function radius(): string {
  // 512×512. 흰 10% 채움 + 가장자리 점선 + 5×5 가는 격자 35% (원 안만)
  const cx = 256, R0 = 248;
  let s = C(cx, cx, R0, { fill: '#fff', fo: 0.1 });
  s += C(cx, cx, R0, { fill: sv.rad([[0.72, '#fff', 0], [0.97, '#fff', 0.22], [1, '#fff', 0.3]]) });
  let grid = '';
  for (let i = -2; i <= 2; i++) {
    const v = cx + i * R0 * 0.4;
    grid += P(`M${n2(v)} 0V512M0 ${n2(v)}H512`, { stroke: '#fff', sw: 1.8, so: 0.35 });
  }
  s += G(grid, { cp: sv.clip(C(cx, cx, R0 - 3)) });
  s += C(cx, cx, R0, { fill: 'none', stroke: '#fff', sw: 5.5, da: '15 11', so: 0.95, lc: 'butt' });
  s += C(cx, cx, 7, { fill: '#fff', op: 0.55 });
  return s;
}

function hole(): string {
  // 1024×1024. 반지름 512 = 3.4R. 0.6R(= 0.1765) 까지 투명 → 끝에서 남색 82%. 원 밖 모서리도 82% (pad)
  const navy = '#070b26';
  return R(0, 0, 1024, 1024, 0, {
    fill: sv.rad([[0, navy, 0], [0.1765, navy, 0], [0.3, navy, 0.12], [0.55, navy, 0.42], [0.8, navy, 0.66], [1, navy, 0.82]], 0.5, 0.5, 0.5),
  });
}

function rays(): string {
  // 512×512 흰 25% 부채꼴 (10도 폭, 20도마다 18개), 가운데·가장자리로 옅어짐
  const cx = 256;
  let w = '';
  for (let i = 0; i < 18; i++) {
    const a0 = ((i * 20 - 5) * Math.PI) / 180, a1 = ((i * 20 + 5) * Math.PI) / 180;
    w += `M${cx} ${cx}L${n2(cx + Math.cos(a0) * 256)} ${n2(cx + Math.sin(a0) * 256)}A256 256 0 0 1 ${n2(cx + Math.cos(a1) * 256)} ${n2(cx + Math.sin(a1) * 256)}Z`;
  }
  const f = sv.rad([[0, '#fff', 0.1], [0.12, '#fff', 0.32], [0.55, '#fff', 0.22], [1, '#fff', 0]], cx, cx, 256, undefined, undefined, 'user');
  return P(w, { fill: f });
}

function vignette(): string {
  // 1024² 흰 가장자리 (tint 로 색). 가운데 투명
  return R(0, 0, 1024, 1024, 0, { fill: sv.rad([[0, '#fff', 0], [0.52, '#fff', 0], [0.72, '#fff', 0.28], [0.88, '#fff', 0.62], [1, '#fff', 0.9]], 0.5, 0.5, 0.72) });
}

function firework(): string {
  // 256² 방사 선 12개 + 끝 점 (흰, tint 로 색)
  const cx = 128;
  let s = C(cx, cx, 34, { fill: sv.rad([[0, '#fff', 0.8], [1, '#fff', 0]]) });
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const x0 = cx + ca * 30, y0 = cx + sa * 30, x1 = cx + ca * 100, y1 = cx + sa * 100;
    const g = sv.lin([[0, '#fff', 0], [1, '#fff', 1]], x0, y0, x1, y1, 'user');
    s += P(`M${n2(x0)} ${n2(y0)}L${n2(x1)} ${n2(y1)}`, { stroke: g, sw: 6.5 });
    s += C(cx + ca * 114, cx + sa * 114, 7, { fill: '#fff' });
    const b = a + (15 * Math.PI) / 180;
    s += C(cx + Math.cos(b) * 78, cx + Math.sin(b) * 78, 3.6, { fill: '#fff', op: 0.85 });
  }
  return s;
}

function streak(): string {
  // 128×16 빛줄기: 오른쪽(머리) 밝고 왼쪽 꼬리로 투명
  const g = sv.lin([[0, '#fff', 0], [0.6, '#fff', 0.55], [1, '#fff', 1]], 0, 0, 1, 0);
  return P('M0 8Q64 3.2 116 1.6Q128 2 128 8Q128 14 116 14.4Q64 12.8 0 8Z', { fill: g });
}

/* ───────── 연기·땀·하트 ───────── */

function smoke(): string {
  // 96² 뭉게 연기 (흰 70%)
  const blobs: [number, number, number][] = [[48, 54, 26], [28, 58, 18], [68, 58, 19], [38, 38, 19], [60, 36, 17], [48, 26, 13]];
  let s = '';
  for (const [x, y, r] of blobs) s += C(x, y + 3, r, { fill: '#c9c2d6', op: 0.35 });
  for (const [x, y, r] of blobs) s += C(x, y, r, { fill: sv.rad([[0, '#ffffff', 0.95], [0.7, '#ffffff', 0.82], [1, '#f1eef8', 0.65]], 0.4, 0.35, 0.7) });
  s += C(36, 36, 6, { fill: '#fff', op: 0.9 });
  return G(s, { op: 0.8 });
}

function heartFx(): string {
  // 40×36 하트 #ff8fab
  const c = '#ff8fab';
  return G(P(heartPath(17), { fill: sv.lin([[0, '#ffc2d3'], [1, c]]), stroke: '#d9577a', sw: 2.2 }) + shine(-7.5, -6, 3.6, 2.2, -35, 0.9), { tf: 'translate(20 17.5)' });
}

/* ───────── 지도 효과 ───────── */

function petal(): string {
  // 28×22 벚꽃잎
  const c = '#ffc7d9';
  return G(
    P('M-12 0Q-8 -9 2 -8Q8 -8 12 -3L8 0L12 3Q8 8 2 8Q-8 9 -12 0Z', { fill: sv.lin([[0, '#fff0f5'], [1, c]], 0, 0, 1, 0), stroke: '#e58aa8', sw: 1.2 }) +
      P('M-9 0Q-2 -1 5 -2M-9 0Q-2 1 5 2', { fill: 'none', stroke: '#f0a0bb', sw: 0.8, so: 0.8 }),
    { tf: 'translate(14 11) rotate(-12)' },
  );
}

const waterGlint = () => E(20, 6, 20, 6, { fill: sv.rad([[0, '#fff', 1], [0.5, '#fff', 0.6], [1, '#fff', 0]]) });

function windowLight(): string {
  // 20×26 불 켜진 창 (add 로 얹음)
  return R(0, 0, 20, 26, 5, { fill: sv.rad([[0, '#fff4c8', 1], [0.55, '#ffe9a8', 0.8], [1, '#ffd36b', 0]]) }) + R(5, 5, 10, 14, 2.4, { fill: '#fff6d0', op: 0.9 });
}

const boltGlow = () => E(32, 16, 32, 16, { fill: sv.rad([[0, '#ffffff', 1], [0.3, '#bff0ff', 0.85], [0.65, '#7fd8ff', 0.4], [1, '#7fd8ff', 0]]) });

/* ───────── 스킬 ───────── */

function flyer(): string {
  // 110² 프로모션 폭탄: 분홍 전단 뭉치 + 확성기 + 도화선. 앵커(엔진) (0.5, 0.8) = (55, 88)
  const pink = '#ff9fbb';
  let s = E(55, 90, 38, 9, { fill: '#000', op: 0.16 });
  // 전단 뭉치 (둥근 폭탄 몸)
  s += C(52, 62, 30, { fill: sv.rad([[0, lighten(pink, 0.5)], [0.7, pink], [1, darken(pink, 0.85)]], 0.38, 0.32, 0.75), stroke: edge(pink), sw: 2.8 });
  // 전단 종이 끝이 삐져나옴
  for (const [x, y, r] of [[30, 50, -30], [74, 52, 24], [40, 84, -10], [70, 80, 14]] as const)
    s += R(-9, -6, 18, 12, 2, { fill: '#fffaf2', stroke: '#e0a0b4', sw: 1.4, tf: `translate(${x} ${y}) rotate(${r})` }) + R(-6, -3, 10, 2, 1, { fill: '#ff8fab', tf: `translate(${x} ${y}) rotate(${r})` });
  // 고무줄 띠
  s += P('M24 64Q52 74 80 62', { fill: 'none', stroke: '#ffe066', sw: 5 }) + P('M24 64Q52 74 80 62', { fill: 'none', stroke: '#c9a13d', sw: 1.2, so: 0.7 });
  // 얼굴
  s += face(50, 56, 1.25, 'idle', { gap: 1.1 });
  // 확성기 (오른쪽 아래)
  s += G(
    P('M-12 -6L6 -14V14L-12 6Z', { fill: gf('#ff9f43'), stroke: edge('#ff9f43'), sw: 2 }) + R(-18, -6, 7, 12, 2.4, { fill: gf('#ffd36b'), stroke: edge('#ffd36b'), sw: 1.6 }) +
      P('M10 -8q6 8 0 16M15 -12q9 12 0 24', { fill: 'none', stroke: '#ff7b5e', sw: 2.2 }),
    { tf: 'translate(84 76) rotate(-12)' },
  );
  // 뚜껑 + 도화선 (끝이 위 오른쪽 (74, 6))
  s += R(44, 28, 16, 8, 3, { fill: gf('#8a95a8'), stroke: '#5a6478', sw: 2 });
  s += P('M52 28Q50 16 60 14Q70 12 72 6', { fill: 'none', stroke: '#6a4a32', sw: 3.4 });
  s += P('M52 28Q50 16 60 14Q70 12 72 6', { fill: 'none', stroke: '#c9a07a', sw: 1.4, da: '2 3' });
  s += sparkle(74, 6, 7, '#ffb35e');
  s += shine(38, 44, 6, 3.4, -40, 0.7);
  return s;
}

function paper(): string {
  // 30×22 날리는 전단 한 장
  return G(
    R(-12, -8, 24, 16, 2.4, { fill: '#ffe6ee', stroke: '#e58aa8', sw: 1.4 }) + R(-9, -5, 11, 3, 1.5, { fill: '#ff8fab' }) + R(-9, 0, 17, 1.8, 0.9, { fill: '#f0b8c8' }) + R(-9, 3.4, 13, 1.8, 0.9, { fill: '#f0b8c8' }) + C(7, -3.4, 2.6, { fill: '#ffd36b' }),
    { tf: 'translate(15 11) rotate(-8)' },
  );
}

/** 달리는 직장인 (왼쪽을 봄). 70×90, 발끝 (35, 84) */
function runner(i: number): string {
  const L = [
    { shirt: '#ffffff', suit: '#3d4f7a', hair: '#4a3a2a', tie: '#ff7b5e' },
    { shirt: '#ffe9d6', suit: '#ff9f8a', hair: '#6a4a32', tie: '' },
    { shirt: '#eaf8f2', suit: '#8fd3c0', hair: '#2a2118', tie: '' },
  ][i];
  const skin = '#ffe0c2', skinL = '#d9a888';
  let s = E(36, 85, 20, 4, { fill: '#000', op: 0.16 });
  // 뒤 다리·팔
  s += P('M38 62L50 70L54 80', { fill: 'none', stroke: darken('#4a5568', 0.9), sw: 7 }) + E(56, 81, 5.6, 3.4, { fill: '#3a3a48' });
  s += P('M44 44L54 52L60 46', { fill: 'none', stroke: darken(L.suit, 0.85), sw: 6.4 }) + C(61, 45, 4, { fill: skin, stroke: skinL, sw: 1 });
  // 몸통
  s += P('M22 44Q22 36 34 35Q46 36 46 44L46 62Q34 66 22 62Z', { fill: gf(L.suit, 0.25), stroke: edge(L.suit), sw: 2 });
  s += P('M30 36L34 46L38 36Z', { fill: L.shirt });
  if (L.tie) s += P('M33 38H36L37 50L34.5 53L32 50Z', { fill: L.tie, stroke: edge(L.tie), sw: 0.8 });
  // 앞 다리
  s += P('M30 62L22 72L12 74', { fill: 'none', stroke: '#4a5568', sw: 7.4 }) + E(10, 74, 6, 3.6, { fill: '#3a3a48' });
  // 소품 + 앞 팔
  if (i === 0) s += R(38, 47, 7, 9, 1.6, { fill: '#fff', stroke: '#8a95a8', sw: 0.9 }) + R(39.5, 49, 4, 3, 0.8, { fill: '#cfe3f2' }) + P('M34 36L41 47', { stroke: '#ff5a5a', sw: 1.2 });
  if (i === 1) s += R(4, 44, 16, 11, 3, { fill: gf('#ff8fab'), stroke: '#c95a7a', sw: 1.4 }) + P('M6 49H18', { stroke: '#fff', sw: 1.4 }) + P('M8 44Q12 39 16 44', { fill: 'none', stroke: '#c95a7a', sw: 1.4 });
  if (i === 2) s += R(4, 36, 11, 18, 2.6, { fill: '#3d4f7a', stroke: '#26324f', sw: 1.2 }) + R(5.6, 38.4, 7.8, 12.4, 1.4, { fill: '#ff9f43' }) + P(ticketPath(6.4, 42, 6.2, 5, 1, 0.8, 1), { fill: '#fff' });
  s += P(`M26 44L18 50L${i === 0 ? 10 : 12} ${i === 0 ? 44 : 48}`, { fill: 'none', stroke: L.suit, sw: 6.4 }) + C(i === 0 ? 10 : 12, i === 0 ? 44 : 48, 4.2, { fill: skin, stroke: skinL, sw: 1 });
  // 머리 (크게)
  s += C(34, 20, 16.5, { fill: sv.rad([[0, '#fff0e0'], [1, skin]], 0.4, 0.35, 0.7), stroke: skinL, sw: 1.8 });
  s += P('M17.6 18Q18 3 34 3Q50 3 50.6 18Q46 10 38 10.6Q28 9 22 14Q20 17 17.6 18Z', { fill: L.hair });
  if (i === 1) s += C(50, 14, 5.4, { fill: L.hair });
  s += face(28, 22, 0.78, 'idle', { gap: 0.95 });
  // 땀 방울 (달리는 중)
  s += P('M56 18q3 -3 6 -2M58 26q3 -2 6 0', { fill: 'none', stroke: '#8fd3ff', sw: 1.8 });
  return s;
}

function qrTile(): string {
  // 48² QR 모듈 한 칸
  const c = '#2b3f8a';
  return R(3, 5, 42, 42, 8, { fill: '#000', op: 0.18 }) + R(3, 3, 42, 42, 8, { fill: sv.lin([[0, '#4a62b0'], [1, c]]), stroke: '#1a2a66', sw: 2 }) + R(8, 7, 30, 7, 3.5, { fill: '#fff', op: 0.25 });
}

function qrRing(): string {
  // 512² 보라 #c896ff 점선 원 + 15% 채움 + QR 위치 표시 3개
  const cx = 256, c = '#c896ff';
  let s = C(cx, cx, 244, { fill: c, fo: 0.15 });
  s += C(cx, cx, 244, { fill: sv.rad([[0.7, c, 0], [1, c, 0.3]]) });
  s += C(cx, cx, 244, { fill: 'none', stroke: c, sw: 9, da: '22 14', lc: 'round' });
  s += C(cx, cx, 214, { fill: 'none', stroke: '#fff', sw: 2.4, so: 0.5, da: '4 10' });
  const finder = (x: number, y: number) =>
    G(R(-22, -22, 44, 44, 7, { fill: '#fff', stroke: '#6a4ab0', sw: 5 }) + R(-10, -10, 20, 20, 4, { fill: '#6a4ab0' }), { tf: `translate(${x} ${y})` });
  for (const a of [-90, 30, 150]) {
    const r = (a * Math.PI) / 180;
    s += finder(cx + Math.cos(r) * 244, cx + Math.sin(r) * 244);
  }
  return s;
}

function whirl(): string {
  // 340² 핫플 소용돌이: 회전 호 3개 + 가운데 어둠
  const cx = 170, c = '#c8a0ff';
  let s = C(cx, cx, 150, { fill: sv.rad([[0, '#2a1a5a', 0.55], [0.5, '#3a2a6a', 0.3], [1, '#3a2a6a', 0]]) });
  for (let k = 0; k < 3; k++) {
    const rot = k * 120;
    // 바깥에서 안으로 감기는 호 (굵기 점점 가늘게: 두 겹)
    const arc = (r0: number, r1: number, a0: number, a1: number) => {
      let d = '';
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
        const r = r0 + (r1 - r0) * t;
        d += (i ? 'L' : 'M') + n2(cx + Math.cos(a) * r) + ' ' + n2(cx + Math.sin(a) * r);
      }
      return d;
    };
    const d = arc(150, 40, rot, rot + 250);
    s += P(d, { fill: 'none', stroke: darken(c, 0.7), sw: 20, so: 0.35 });
    s += P(d, { fill: 'none', stroke: c, sw: 14, so: 0.85 });
    s += P(arc(146, 60, rot + 6, rot + 150), { fill: 'none', stroke: '#fff', sw: 4, so: 0.6 });
  }
  s += C(cx, cx, 24, { fill: '#2a1a5a', op: 0.5 });
  for (const [x, y, r] of [[60, 80, 7], [270, 110, 5], [250, 270, 6], [90, 260, 4]] as const) s += sparkle(x, y, r * 1.6, '#e8d8ff');
  return s;
}

function handshake(): string {
  // 96×72 악수: 왼손(남색 소매, 손바닥이 오른쪽) + 오른손(코랄 소매)이 위에서 감싸 쥠 — 손가락 네 개가 보임
  const skinA = '#ffe3c8', skinB = '#ffd0ae', lineA = '#c99a78', lineB = '#b9825e';
  let s = E(48, 66, 34, 4.4, { fill: '#000', op: 0.12 });
  // 소매 + 흰 커프스
  s += P('M2 34Q2 28 8 27L24 24L28 48L10 52Q3 53 2 46Z', { fill: gf('#3d4f7a', 0.3), stroke: '#26324f', sw: 2.2 });
  s += P('M22 24.4L27 48', { stroke: '#fff', sw: 4.4 });
  s += P('M94 34Q94 28 88 27L72 24L68 48L86 52Q93 53 94 46Z', { fill: gf('#ff8f7a', 0.3), stroke: '#c9502e', sw: 2.2 });
  s += P('M74 24.4L69 48', { stroke: '#fff', sw: 4.4 });
  // 왼손 (손바닥 + 아래 손가락 끝)
  s += P('M26 28Q40 24 54 30Q62 34 62 40Q62 46 54 47L28 47Z', { fill: gf(skinA, 0.3), stroke: lineA, sw: 2 });
  // 오른손 손등 (오른쪽에서)
  s += P('M70 26Q58 22 48 26L44 30L70 46Z', { fill: gf(skinB, 0.3), stroke: lineB, sw: 2 });
  // 오른손 손가락 네 개 (왼손을 감쌈)
  for (let i = 0; i < 4; i++) {
    const x = 36 + i * 7.4;
    s += R(x - 3.6, 28 + i * 0.6, 7.2, 16 - i * 0.8, 3.6, { fill: gf(skinB, 0.35), stroke: lineB, sw: 1.6 });
  }
  // 왼손 엄지 (위로 감싸 올라옴)
  s += P('M30 30Q34 20 44 21Q50 22 49 26Q48 29 42 28Q37 28 34 32Z', { fill: gf(skinA, 0.4), stroke: lineA, sw: 1.8 });
  // 반짝
  s += sparkle(48, 9, 7) + sparkle(18, 13, 4.4) + sparkle(80, 13, 4.4, '#ffb3c1');
  return s;
}

function womMark(): string {
  // 52×44 귓속말 말풍선
  const c = '#fff8ec';
  let s = P('M8 6H44Q50 6 50 12V28Q50 34 44 34H22L12 42L14 34H8Q2 34 2 28V12Q2 6 8 6Z', { fill: '#5c3a1a', op: 0.3, tf: 'translate(0 2)' });
  s += P('M8 6H44Q50 6 50 12V28Q50 34 44 34H22L12 42L14 34H8Q2 34 2 28V12Q2 6 8 6Z', { fill: c, stroke: '#c9a07a', sw: 2.2 });
  s += C(16, 20, 3.4, { fill: '#ff8fab' }) + C(26, 20, 3.4, { fill: '#ff8fab' }) + C(36, 20, 3.4, { fill: '#ff8fab' });
  s += G(P(heartPath(5), { fill: '#ff6f91', stroke: '#fff', sw: 1.4 }), { tf: 'translate(46 7)' });
  return s;
}

function arrow(): string {
  // 40×48 아래 화살표 (앵커 0.5, 1 = 끝이 아래)
  const c = '#ffd36b';
  const d = 'M13 4H27Q30 4 30 7V22H36Q39 22 37 25L22 44Q20 46.4 18 44L3 25Q1 22 4 22H10V7Q10 4 13 4Z';
  return P(d, { fill: '#5c3a1a', op: 0.3, tf: 'translate(0 2)' }) + P(d, { fill: sv.lin([[0, '#fff3b8'], [0.5, c], [1, '#ff9f43']]), stroke: '#a8561a', sw: 2.6 }) + P('M14 8V22', { stroke: '#fff', sw: 3, so: 0.8 });
}

function clockFx(): string {
  // 36² 작은 시계 (수명 2초 배지)
  let s = C(18, 19.4, 15, { fill: '#000', op: 0.18 });
  s += C(18, 18, 15, { fill: gf('#ff6b6b', 0.3), stroke: '#b83a3a', sw: 2 });
  s += C(18, 18, 10.4, { fill: '#fffaf2' });
  s += P('M18 11V18L22.6 20.6', { fill: 'none', stroke: '#2a2118', sw: 2.2 });
  s += C(18, 18, 1.6, { fill: '#2a2118' });
  s += R(15, 1, 6, 4, 1.5, { fill: '#b83a3a' });
  return s;
}

const CONFETTI = ['#ff7b5e', '#ffd36b', '#8fe0c0', '#8fd3ff', '#b79cf0', '#ff8fab'];
function confetti(i: number): string {
  const c = CONFETTI[i];
  return R(2, 2, 20, 12, 3, { fill: sv.lin([[0, lighten(c, 0.35)], [0.5, c], [0.5, darken(c, 0.9)], [1, darken(c, 0.82)]], 0, 0, 1, 0) }) + R(4, 3.5, 7, 2.6, 1.3, { fill: '#fff', op: 0.6 });
}

/* ───────── 목록 ───────── */

type Draw = () => string;
const DRAW: Record<string, Draw> = {
  stamp,
  stampInk,
  bubble,
  banner,
  coin: () => coin(24, 23, 21, '#ffd36b', 'won'),
  ticket: ticketFx,
  point: () => coin(22, 21, 19, '#6fd3f7', 'p'),
  spark,
  star: starFx,
  dot,
  glow,
  ring,
  radius,
  hole,
  rays,
  smoke,
  sweat: () => sweat(12, 17, 2.7),
  heart: heartFx,
  firework,
  streak,
  petal,
  waterGlint,
  windowLight,
  boltGlow,
  flyer,
  paper,
  runner0: () => runner(0),
  runner1: () => runner(1),
  runner2: () => runner(2),
  qrTile,
  qrRing,
  whirl,
  handshake,
  womMark,
  arrow,
  clock: clockFx,
  vignette,
  confetti0: () => confetti(0),
  confetti1: () => confetti(1),
  confetti2: () => confetti(2),
  confetti3: () => confetti(3),
  confetti4: () => confetti(4),
  confetti5: () => confetti(5),
};

export function fxBody(id: string, pre: string, w: number, h: number): Body | null {
  const fn = DRAW[id];
  if (!fn) return null;
  sv = new Svg(pre);
  sv.add(fn());
  void mix; void starPath; void o;
  return { vb: [0, 0, w, h], body: sv.body() };
}

export const FX_IDS = Object.keys(DRAW);
