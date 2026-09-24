/**
 * 배경 움직임(ambient 17) · 물체(object 8)
 *   a.car0~3@h|v : 위에서 본 차. @h 앞 = 왼쪽, @v 앞 = 위쪽 (반대 방향은 엔진이 뒤집음)
 *   a.walker0~3@a|b : 걷는 직장인 2프레임 (a = 왼발 앞, b = 오른발 앞)
 *   a.cloudShadow : 구름 그림자 (검정 8%, 가장자리 부드럽게)
 *   o.gift@1~5 · o.inquiry · o.shadow · o.crown
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, face, lighten, n2, sparkle, starPath, roundStar } from '../kit';

let sv: Svg;
const gf = (c: string, k = 0.35) => sv.lin([[0, lighten(c, k)], [1, c]]);

/* ───────── 차 (위에서 본 모습, 앞 = 위쪽 기준으로 그린 뒤 회전) ───────── */

function carTop(kind: number): string {
  // 기준: 앞이 위(-y). 가운데 (0,0), 길이 방향 = y
  const sw = 2.2;
  if (kind === 1) {
    // 버스
    const c = '#9fe0a8';
    let s = R(-15, -30, 30, 60, 7, { fill: gf(c), stroke: edge(c), sw });
    s += R(-12, -27, 24, 8, 3, { fill: '#dff4ff', stroke: edge(c), sw: 1.2 });
    for (let i = 0; i < 5; i++) s += R(-13.5, -16 + i * 8.6, 3, 6, 1, { fill: '#dff4ff' }) + R(10.5, -16 + i * 8.6, 3, 6, 1, { fill: '#dff4ff' });
    s += R(-8, -12, 16, 30, 3, { fill: lighten(c, 0.4), stroke: edge(c), sw: 1 }) + R(-5, -2, 10, 8, 2, { fill: '#e6eef5', stroke: '#9aa8b8', sw: 1 });
    s += R(-12, 26, 5, 3, 1, { fill: '#ff6b6b' }) + R(7, 26, 5, 3, 1, { fill: '#ff6b6b' }) + R(-12, -30, 5, 2.4, 1, { fill: '#fff6b0' }) + R(7, -30, 5, 2.4, 1, { fill: '#fff6b0' });
    return s;
  }
  if (kind === 3) {
    // 탑차 (식권 띠)
    const c = '#f4f7fb';
    let s = R(-13, -28, 26, 16, 6, { fill: gf('#8fd3ff'), stroke: edge('#8fd3ff'), sw });
    s += R(-11, -25, 22, 6, 2, { fill: '#dff4ff', stroke: edge('#8fd3ff'), sw: 1 });
    s += R(-14, -12, 28, 42, 4, { fill: gf(c, 0.2), stroke: '#8a95a8', sw });
    s += R(-14, 4, 28, 8, 0, { fill: '#ff9f43' }) + C(-14, 8, 2.2, { fill: '#f4f7fb' }) + C(14, 8, 2.2, { fill: '#f4f7fb' });
    s += R(-11, -30, 5, 2.4, 1, { fill: '#fff6b0' }) + R(6, -30, 5, 2.4, 1, { fill: '#fff6b0' }) + R(-11, 28, 5, 3, 1, { fill: '#ff6b6b' }) + R(6, 28, 5, 3, 1, { fill: '#ff6b6b' });
    return s;
  }
  const c = kind === 0 ? '#ffd36b' : '#8fd3ff';
  let s = R(-13, -24, 26, 48, 11, { fill: gf(c), stroke: edge(c), sw });
  s += P('M-10 -12Q0 -17 10 -12L9 -5H-9Z', { fill: '#dff4ff', stroke: edge(c), sw: 1.2 });
  s += P('M-9 10H9L10 16Q0 20 -10 16Z', { fill: '#dff4ff', stroke: edge(c), sw: 1.2 });
  s += R(-9, -5, 18, 15, 4, { fill: lighten(c, 0.3) });
  s += R(-15.5, -9, 3, 4, 1, { fill: edge(c) }) + R(12.5, -9, 3, 4, 1, { fill: edge(c) });
  s += R(-10, -24, 5, 3, 1.5, { fill: '#fff6b0' }) + R(5, -24, 5, 3, 1.5, { fill: '#fff6b0' }) + R(-10, 21.5, 5, 2.6, 1, { fill: '#ff6b6b' }) + R(5, 21.5, 5, 2.6, 1, { fill: '#ff6b6b' });
  if (kind === 0) s += R(-6, -1, 12, 6, 2, { fill: '#fff8e0', stroke: '#c9a13d', sw: 1 }) + R(-4, 1, 8, 2, 1, { fill: '#ff9f43' });
  return s;
}

function car(kind: number, ax: string): string {
  const inner = E(2, 3, 16, 30, { fill: '#000', op: 0.14 }) + carTop(kind);
  // @v: 앞 위쪽 그대로 / @h: 앞 왼쪽 → -90도 회전
  return G(inner, { tf: `translate(32.5 32.5) rotate(${ax === 'h' ? -90 : 0})` });
}

/* ───────── 걷는 직장인 ───────── */

const WALK = [
  { shirt: '#3d4f7a', item: 'badge' },
  { shirt: '#ff9f8a', item: '' },
  { shirt: '#8fe0c0', item: 'lunch' },
  { shirt: '#e8d2b0', item: 'coffee' },
] as const;

function walker(i: number, fr: string): string {
  const w = WALK[i];
  const skin = '#ffe0c2';
  const hair = ['#4a3a2a', '#6a4a32', '#2a2118', '#8a5a3a'][i];
  const a = fr === 'a' ? 1 : -1;
  const pants = i === 1 ? '#5a6fa8' : '#4a5568';
  let s = E(14, 38, 9, 2.2, { fill: '#000', op: 0.16 });
  // 다리
  s += P(`M12 28L${12 - a * 3} 37M16 28L${16 + a * 3} 37`, { stroke: pants, sw: 3.6 });
  s += E(12 - a * 3, 37.4, 2.6, 1.4, { fill: '#3a3a48' }) + E(16 + a * 3, 37.4, 2.6, 1.4, { fill: '#3a3a48' });
  // 몸
  s += P('M7 29Q6 19 14 18Q22 19 21 29Z', { fill: gf(w.shirt), stroke: edge(w.shirt), sw: 1.2 });
  s += P(`M8 21L${6 + a * 1.5} 28M20 21L${22 - a * 1.5} 28`, { stroke: w.shirt, sw: 3 });
  if (w.item === 'badge') s += R(15, 22, 4, 5, 1, { fill: '#fff', stroke: '#8a95a8', sw: 0.6 }) + P('M13 19L17 22', { stroke: '#ff5a5a', sw: 0.8 });
  if (w.item === 'lunch') s += R(20, 25, 7, 5, 1.5, { fill: '#ff8fab', stroke: '#c95a7a', sw: 0.8 });
  if (w.item === 'coffee') s += R(20, 22, 4.4, 6, 1, { fill: '#fff', stroke: '#b98a5e', sw: 0.8 }) + R(20, 23.6, 4.4, 2, 0, { fill: '#b98a5e' });
  if (i === 0) s += P('M14 19V25', { stroke: '#ff7b5e', sw: 1.6 });
  // 머리
  s += C(14, 11, 7.4, { fill: skin, stroke: '#d9a888', sw: 1.1 });
  s += P('M6.8 10Q7 3 14 3Q21 3 21.2 10Q18 7 14 7.4Q10 7 6.8 10Z', { fill: hair });
  s += face(14, 11.6, 0.42, 'idle', { noShine: true });
  return s;
}

/* ───────── 물체 ───────── */

const GIFT = [
  { box: '#ffc7d9', rib: '#ffffff', bow: '#ff8fab' },
  { box: '#bfe6ff', rib: '#ff8fab', bow: '#ff8fab' },
  { box: '#d8c8ff', rib: '#ffd36b', bow: '#ffd36b' },
  { box: '#ffb8a8', rib: '#ffd36b', bow: '#ffe066' },
  { box: '#ffe08a', rib: '#fff3b8', bow: '#ffffff' },
];

function gift(g: number): string {
  const k = GIFT[Math.max(0, Math.min(4, g - 1))];
  const line = edge(k.box);
  const sw = 2.6;
  let s = '';
  if (g >= 5) s += C(40, 44, 36, { fill: sv.rad([[0, '#fff6c8', 0.9], [1, '#fff6c8', 0]]) });
  // 상자 (앞면 + 뚜껑 윗면)
  s += R(16, 36, 48, 30, 5, { fill: sv.lin([[0, k.box], [1, darken(k.box, 0.88)]]), stroke: line, sw });
  s += R(12, 24, 56, 16, 5, { fill: sv.lin([[0, lighten(k.box, 0.45)], [1, lighten(k.box, 0.1)]]), stroke: line, sw });
  s += R(12, 34, 56, 6, 2, { fill: darken(k.box, 0.85), op: 0.9 });
  // 리본
  s += R(35, 24, 10, 42, 0, { fill: k.rib, stroke: edge(k.rib), sw: 1.2 });
  if (g >= 2) s += R(12, 29, 56, 6, 0, { fill: k.rib, stroke: edge(k.rib), sw: 1, op: 0.95 });
  // 매듭
  const bw = 12 + g * 1.6;
  s += P(`M40 25Q${40 - bw} ${14 - g} ${40 - bw - 2} ${22}Q${40 - bw} ${30} 40 25Z`, { fill: k.bow, stroke: edge(k.bow), sw: 1.8 });
  s += P(`M40 25Q${40 + bw} ${14 - g} ${40 + bw + 2} ${22}Q${40 + bw} ${30} 40 25Z`, { fill: k.bow, stroke: edge(k.bow), sw: 1.8 });
  if (g >= 3) s += P(`M38 27L32 38M42 27L48 38`, { stroke: k.bow, sw: 3.4 });
  s += C(40, 25, 4, { fill: k.bow, stroke: edge(k.bow), sw: 1.6 });
  // 무늬
  if (g >= 4) for (const [x, y] of [[22, 46], [56, 54], [24, 58], [54, 42]]) s += G(P(starPath(3.4), { fill: '#fff', op: 0.9 }), { tf: `translate(${x} ${y})` });
  else if (g >= 2) for (const [x, y] of [[23, 48], [56, 56], [26, 59]]) s += C(x, y, 2.2, { fill: '#fff', op: 0.85 });
  s += P('M18 28H30', { stroke: '#fff', sw: 2.2, so: 0.7 });
  if (g >= 5) s += sparkle(66, 18, 8) + sparkle(12, 20, 5) + sparkle(70, 50, 4);
  else if (g >= 3) s += sparkle(66, 20, 5);
  return s;
}

function inquiry(): string {
  // 흰 종이비행기 편지, 날개 끝 하늘색 (71×58 → viewBox 71×58)
  const l = '#7c93b0';
  return (
    E(38, 52, 22, 3.6, { fill: '#000', op: 0.12 }) +
    P('M4 26L66 4L48 50L32 36Z', { fill: '#ffffff', stroke: l, sw: 2.2 }) +
    P('M32 36L66 4L36 44Z', { fill: '#e2eef8', stroke: l, sw: 1.6 }) +
    P('M32 36L30 48L36 44', { fill: '#bcd6ec', stroke: l, sw: 1.6 }) +
    P('M66 4L56 20L62 22Z', { fill: '#8fd3ff', stroke: l, sw: 1.2 }) + P('M4 26L14 24L12 30Z', { fill: '#8fd3ff', stroke: l, sw: 1.2 }) +
    R(18, 22, 12, 8, 1.5, { fill: '#fff8ec', stroke: '#e0a080', sw: 1, tf: 'rotate(-18 24 26)' }) + P('M18.6 23.6L24 27L29.4 21.6', { fill: 'none', stroke: '#e0a080', sw: 1, tf: 'rotate(-18 24 26)' })
  );
}

function crown(): string {
  // 65×45, 앵커 (0.5, 1)
  return (
    P('M8 42L4 12L20 26L32.5 4L45 26L61 12L57 42Z', { fill: sv.lin([[0, '#fff3b8'], [1, '#f0b429']]), stroke: '#a8791a', sw: 2.6 }) +
    R(7, 36, 51, 8, 3, { fill: '#f0b429', stroke: '#a8791a', sw: 2 }) +
    C(32.5, 4, 3.4, { fill: '#fff6c8', stroke: '#a8791a', sw: 1.4 }) + C(4, 12, 2.8, { fill: '#fff6c8', stroke: '#a8791a', sw: 1.2 }) + C(61, 12, 2.8, { fill: '#fff6c8', stroke: '#a8791a', sw: 1.2 }) +
    C(32.5, 28, 4.6, { fill: '#ff8fab', stroke: '#a8791a', sw: 1.2 }) + C(18, 32, 3.4, { fill: '#8fd3ff', stroke: '#a8791a', sw: 1 }) + C(47, 32, 3.4, { fill: '#8fe0c0', stroke: '#a8791a', sw: 1 }) +
    P('M14 22L12 34', { stroke: '#fff', sw: 2, so: 0.7 })
  );
}

function cloudShadow(): string {
  // 640×320. 부드러운 뭉게 그림자
  const f = sv.rad([[0, '#000000', 0.085], [0.6, '#000000', 0.07], [1, '#000000', 0]]);
  const blobs: [number, number, number, number][] = [[320, 170, 250, 120], [190, 180, 150, 95], [450, 150, 160, 100], [300, 110, 150, 80], [520, 200, 110, 70], [120, 200, 100, 60]];
  return blobs.map(([x, y, rx, ry]) => E(x, y, rx, ry, { fill: f })).join('');
}

function shadowEllipse(): string {
  // 129×39, #000 18% 부드러운 타원
  return E(64.5, 19.5, 64, 19, { fill: sv.rad([[0, '#000000', 0.2], [0.65, '#000000', 0.17], [1, '#000000', 0]]) });
}

export function ambientBody(id: string, st: string, pre: string, w: number, h: number): Body | null {
  sv = new Svg(pre);
  let m: RegExpExecArray | null;
  if ((m = /^a\.car(\d)$/.exec(id))) {
    sv.add(car(Number(m[1]), st));
    return { vb: [0, 0, 65, 65], body: sv.body() };
  }
  if ((m = /^a\.walker(\d)$/.exec(id))) {
    sv.add(walker(Number(m[1]), st));
    return { vb: [0, 0, 28, 39], body: sv.body() };
  }
  if (id === 'a.cloudShadow') {
    sv.add(cloudShadow());
    return { vb: [0, 0, 640, 320], body: sv.body() };
  }
  if (id === 'o.gift') {
    sv.add(gift(Number(st) || 1));
    return { vb: [0, 0, 80, 80], body: sv.body() };
  }
  if (id === 'o.inquiry') {
    sv.add(inquiry());
    return { vb: [0, 0, 71, 58], body: sv.body() };
  }
  if (id === 'o.shadow') {
    sv.add(shadowEllipse());
    return { vb: [0, 0, 129, 39], body: sv.body() };
  }
  if (id === 'o.crown') {
    sv.add(crown());
    return { vb: [0, 0, 65, 45], body: sv.body() };
  }
  void w; void h; void PL; void n2; void roundStar;
  return null;
}
