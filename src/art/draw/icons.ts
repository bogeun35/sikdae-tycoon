/**
 * 아이콘 109종 (64×64, 앵커 0.5,0.5). 두께 일정한 둥근 선(3.2) + 파스텔 채움 + 짙은 동계열 외곽선. 그림 안 글자 금지(₩·P·%는 path).
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, face, heartPath, lighten, n2, pPath, roundStar, sparkle, starPath, ticketPath, wonPath } from '../kit';

const S = 3.2;
let sv: Svg;

const gf = (c: string, k = 0.38) => sv.lin([[0, lighten(c, k)], [1, c]], 0, 0, 0.25, 1);
const o = (c: string, grad = true, sw = S) => ({ fill: grad ? gf(c) : c, stroke: edge(c), sw });
const shine = (x: number, y: number, rx: number, ry: number, rot = -30) => E(x, y, rx, ry, { fill: '#fff', op: 0.65, tf: `rotate(${rot} ${n2(x)} ${n2(y)})` });
const tr = (x: number, y: number, s = 1, r = 0) => `translate(${n2(x)} ${n2(y)})${r ? ` rotate(${r})` : ''}${s !== 1 ? ` scale(${n2(s)})` : ''}`;

/* ───────── 부품 ───────── */

const CO = { gold: '#ffd36b', sky: '#8fd3ff', dia: '#6fd3f7', coral: '#ff8f7a', mint: '#8fe0c0', green: '#7cc47c', pink: '#ff9fbb', purple: '#b79cf0', orange: '#ff9f43', cream: '#fff4dc', grey: '#c8d0da', red: '#ff6b6b', blue: '#6fa7e6', yellow: '#ffe066' };

function coin(cx: number, cy: number, r: number, c: string, glyph: 'won' | 'p' | '' = '', gs = 1): string {
  let s = C(cx, cy, r, o(c)) + C(cx, cy, r * 0.72, { fill: 'none', stroke: '#fff', sw: 1.6, so: 0.7 });
  if (glyph === 'won') s += G(P(wonPath(r * 0.36 * gs), { fill: 'none', stroke: '#fff', sw: 2.8 }), { tf: tr(cx, cy) }) + G(P(wonPath(r * 0.36 * gs), { fill: 'none', stroke: edge(c), sw: 1, so: 0.35 }), { tf: tr(cx + 0.6, cy + 0.8) });
  if (glyph === 'p') s += G(P(pPath(r * 0.42 * gs), { fill: 'none', stroke: '#fff', sw: 3.2 }), { tf: tr(cx + r * 0.05, cy) });
  return s + shine(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.12);
}
function ticket(x: number, y: number, w: number, h: number, c = CO.orange, won = true): string {
  return P(ticketPath(x, y, w, h, 4, h * 0.13, 2), o(c)) + (won ? G(P(wonPath(h * 0.23), { fill: 'none', stroke: '#fff', sw: 2.8 }), { tf: tr(x + w / 2, y + h / 2) }) : '') + P(`M${x + 5} ${y + 4}H${x + w * 0.45}`, { stroke: '#fff', sw: 2, so: 0.6 });
}
function bldg(x: number, y: number, w: number, h: number, c = CO.sky, door = true): string {
  let s = R(x, y, w, h, 4, o(c));
  const cols = w > 20 ? 2 : 1;
  const ww = w > 20 ? w * 0.22 : w * 0.36;
  for (let r = 0; r < Math.floor((h - (door ? 12 : 4)) / 9); r++) for (let k = 0; k < cols; k++) s += R(x + (cols === 1 ? w / 2 - ww / 2 : w * 0.2 + k * w * 0.38), y + 5 + r * 9, ww, 5, 1.4, { fill: '#fff', op: 0.9 });
  if (door) s += R(x + w / 2 - 4, y + h - 9, 8, 9, 2, { fill: darken(c, 0.72) });
  return s;
}
function bowl(cx: number, cy: number, s = 1, steamOn = true): string {
  return G(
    (steamOn ? P('M-6 -14q-3 -4 0 -8M0 -14q-3 -4 0 -8M6 -14q-3 -4 0 -8', { fill: 'none', stroke: '#b8c6d4', sw: 2.4 }) : '') +
      P('M-15 -8Q-12 -15 0 -15Q12 -15 15 -8Z', { fill: '#fffdf6', stroke: '#b8a88e', sw: 2.2 }) +
      P('M-17 -8H17Q16 10 0 10Q-16 10 -17 -8Z', o('#ffffff', false)) + P('M-17 -8H17Q16 10 0 10Q-16 10 -17 -8Z', { fill: 'none', stroke: '#8f7a66', sw: S }) +
      P('M-10 0H10', { stroke: '#7fb0d8', sw: 2.6 }) + R(-6, 9, 12, 4, 2, { fill: '#fff', stroke: '#8f7a66', sw: 2 }),
    { tf: tr(cx, cy, s) },
  );
}
function heart(cx: number, cy: number, r: number, c = CO.pink): string {
  return G(P(heartPath(r), o(c)) + shine(-r * 0.45, -r * 0.35, r * 0.22, r * 0.14), { tf: tr(cx, cy) });
}
function star(cx: number, cy: number, r: number, c = CO.gold, fill = true): string {
  return G(P(roundStar(r, r * 0.5, r * 0.14), fill ? o(c) : { fill: '#f3ecdf', stroke: '#b8a88e', sw: S }) + (fill ? shine(-r * 0.25, -r * 0.3, r * 0.16, r * 0.1) : ''), { tf: tr(cx, cy) });
}
function badge(cx: number, cy: number, kind: 'up' | 'plus' | 'down' = 'up', c = '#5cb85c'): string {
  let g = C(cx, cy, 9, { fill: c, stroke: '#fff', sw: 2.6 });
  if (kind === 'plus') g += P(`M${cx - 4.5} ${cy}H${cx + 4.5}M${cx} ${cy - 4.5}V${cy + 4.5}`, { stroke: '#fff', sw: 3 });
  else if (kind === 'up') g += P(`M${cx} ${cy + 5}V${cy - 4}M${cx - 4.5} ${cy}L${cx} ${cy - 5}L${cx + 4.5} ${cy}`, { fill: 'none', stroke: '#fff', sw: 2.8 });
  else g += P(`M${cx} ${cy - 5}V${cy + 4}M${cx - 4.5} ${cy}L${cx} ${cy + 5}L${cx + 4.5} ${cy}`, { fill: 'none', stroke: '#fff', sw: 2.8 });
  return g;
}
function bolt(cx: number, cy: number, s = 1, c = CO.yellow): string {
  return G(P('M3 -16L-9 2H0L-4 16L10 -3H1L6 -16Z', o(c)), { tf: tr(cx, cy, s) });
}
function clock(cx: number, cy: number, r: number, c = CO.cream, h1 = 0, h2 = 90, btn = false): string {
  let s = '';
  if (btn) s += R(cx - 4, cy - r - 6, 8, 6, 2, o('#c8d0da', false));
  s += C(cx, cy, r, o(c)) + C(cx, cy, r - 4.5, { fill: '#fffdf8', stroke: darken(c, 0.8), sw: 1.2 });
  const hand = (a: number, l: number, w: number) => P(`M${cx} ${cy}L${n2(cx + Math.sin((a * Math.PI) / 180) * l)} ${n2(cy - Math.cos((a * Math.PI) / 180) * l)}`, { stroke: '#5c3a1a', sw: w });
  return s + hand(h1, r * 0.62, 3) + hand(h2, r * 0.45, 3) + C(cx, cy, 2.2, { fill: '#ff7b5e' });
}
function gear(cx: number, cy: number, r: number, c = CO.sky, teeth = 8): string {
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const a2 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.8 : r;
    d += (i ? 'L' : 'M') + n2(cx + Math.cos(a) * rr) + ' ' + n2(cy + Math.sin(a) * rr) + 'L' + n2(cx + Math.cos(a2) * rr) + ' ' + n2(cy + Math.sin(a2) * rr);
  }
  return P(d + 'Z', { ...o(c), lj: 'round' }) + C(cx, cy, r * 0.36, { fill: '#fff', stroke: edge(c), sw: 2.4 });
}
function bubble(x: number, y: number, w: number, h: number, c = CO.coral, tailLeft = true): string {
  const tx = tailLeft ? x + w * 0.25 : x + w * 0.72;
  return P(`M${x + 8} ${y}H${x + w - 8}Q${x + w} ${y} ${x + w} ${y + 8}V${y + h - 8}Q${x + w} ${y + h} ${x + w - 8} ${y + h}H${tx + 6}L${tx - 4} ${y + h + 8}L${tx - 2} ${y + h}H${x + 8}Q${x} ${y + h} ${x} ${y + h - 8}V${y + 8}Q${x} ${y} ${x + 8} ${y}Z`, o(c));
}
function fist(cx: number, cy: number, s = 1, c = '#ffe0c2'): string {
  return G(
    R(-11, -9, 22, 18, 6, o(c, false)) + P('M-4 -9V-2M3 -9V-2', { stroke: edge(c), sw: 2 }) + P('M-11 1Q-17 -1 -15 6Q-13 10 -7 8', { fill: c, stroke: edge(c), sw: 2.6 }) + R(-9, 9, 16, 7, 2, { fill: '#6fa7e6', stroke: edge('#6fa7e6'), sw: 2.4 }),
    { tf: tr(cx, cy, s) },
  );
}
function person(cx: number, cy: number, s = 1, c = CO.blue, skin = '#ffe0c2'): string {
  return G(P('M-11 16Q-11 4 0 4Q11 4 11 16Z', o(c)) + C(0, -4, 7.5, o(skin, false)) + C(-2.6, -4.5, 1.1, { fill: '#2a2118' }) + C(2.6, -4.5, 1.1, { fill: '#2a2118' }), { tf: tr(cx, cy, s) });
}
function book(x: number, y: number, w: number, h: number, c = CO.green): string {
  return R(x, y, w, h, 4, o(c)) + R(x + 4, y + h - 7, w - 6, 5, 2, { fill: '#fffdf6', stroke: edge(c), sw: 1.6 }) + R(x, y, 6, h, 3, { fill: darken(c, 0.82) }) + R(x + w * 0.35, y + 6, w * 0.45, 5, 2, { fill: '#fff', op: 0.85 });
}
function phone(cx: number, cy: number, s = 1, c = '#c9d6ff'): string {
  return G(R(-11, -18, 22, 36, 5, o('#5a6a90', false)) + R(-8, -14, 16, 26, 2, { fill: gf(c) }) + R(-3, 14, 6, 2, 1, { fill: '#c8d0da' }), { tf: tr(cx, cy, s) });
}
function magnifier(cx: number, cy: number, r: number): string {
  return P(`M${cx + r * 0.7} ${cy + r * 0.7}L${cx + r * 1.5} ${cy + r * 1.5}`, { stroke: '#8a6a4a', sw: 6 }) + C(cx, cy, r, { fill: '#dff4ff', fo: 0.85, stroke: '#5d7288', sw: S }) + shine(cx - r * 0.4, cy - r * 0.35, r * 0.25, r * 0.14);
}
function hourglass(cx: number, cy: number, s = 1): string {
  return G(
    R(-12, -18, 24, 5, 2.5, o('#c98a5a', false)) + R(-12, 13, 24, 5, 2.5, o('#c98a5a', false)) +
      P('M-9 -13H9Q9 -3 2 0Q9 3 9 13H-9Q-9 3 -2 0Q-9 -3 -9 -13Z', { fill: '#e8f6ff', stroke: '#5d7288', sw: 2.6 }) +
      P('M-5 -8H5Q3 -3 0 -1Q-3 -3 -5 -8Z', { fill: '#ffd36b' }) + P('M-6 12Q0 4 6 12Z', { fill: '#ffd36b' }),
    { tf: tr(cx, cy, s) },
  );
}
function plane(cx: number, cy: number, s = 1): string {
  return G(
    P('M-20 2L20 -14L8 16L-2 6Z', { fill: '#ffffff', stroke: '#7c93b0', sw: S }) + P('M-2 6L20 -14L2 10Z', { fill: '#dcebf7', stroke: '#7c93b0', sw: 2 }) + P('M-2 6L-4 14L2 10', { fill: '#b8d4ec', stroke: '#7c93b0', sw: 2 }) + P('M20 -14L14 -4L18 -2Z', { fill: CO.sky }),
    { tf: tr(cx, cy, s) },
  );
}
function briefcase(cx: number, cy: number, s = 1, c = '#c98a5a'): string {
  return G(R(-7, -16, 14, 8, 3, { fill: 'none', stroke: edge(c), sw: S }) + R(-18, -10, 36, 26, 5, o(c)) + P('M-18 0H18', { stroke: edge(c), sw: 2 }) + R(-4, -3, 8, 6, 1.5, { fill: '#ffd36b', stroke: edge('#ffd36b'), sw: 1.4 }), { tf: tr(cx, cy, s) });
}
function pin(cx: number, cy: number, s = 1, c = '#ff7b7b'): string {
  return G(E(0, 20, 8, 2.5, { fill: '#000', op: 0.15 }) + P('M0 20Q-15 3 -15 -5Q-15 -20 0 -20Q15 -20 15 -5Q15 3 0 20Z', o(c)) + C(0, -5, 5.5, { fill: '#fff' }), { tf: tr(cx, cy, s) });
}
function megaphone(cx: number, cy: number, s = 1, c = '#ffa24a'): string {
  return G(
    P('M-16 -6H-8L10 -16V16L-8 6H-16Q-20 6 -20 2V-2Q-20 -6 -16 -6Z', o(c)) + E(10, 0, 4, 16, { fill: darken(c, 0.85), stroke: edge(c), sw: 2.4 }) + R(-14, 5, 7, 11, 3, { fill: '#8a95a8', stroke: '#5d6878', sw: 2 }),
    { tf: tr(cx, cy, s) },
  );
}
function rings(cx: number, cy: number, r: number, c = CO.mint): string {
  return C(cx, cy, r, { fill: lighten(c, 0.6), stroke: edge(c), sw: S, da: '5 4' }) + C(cx, cy, r * 0.62, { fill: lighten(c, 0.3), stroke: edge(c), sw: 2.6 }) + C(cx, cy, r * 0.25, { fill: c, stroke: edge(c), sw: 2.2 });
}
function shoe(cx: number, cy: number, s = 1): string {
  return G(
    P('M-18 6Q-19 -4 -12 -8L0 -14Q5 -16 8 -11L12 -4Q18 -3 22 1Q25 5 22 8H-18Z', o('#ffffff', false)) + P('M-18 6H22Q23 10 20 11H-17Q-19 10 -18 6Z', o(CO.mint, false)) + P('M-9 -6Q0 -10 6 -6', { fill: 'none', stroke: CO.mint, sw: 3 }),
    { tf: tr(cx, cy, s) },
  );
}
function tie(cx: number, cy: number, s = 1, c = '#4aa3df'): string {
  return G(P('M-5 -18H5L7 -12L2 -8H-2L-7 -12Z', o(c, false)) + P('M-2 -8H2L8 12L0 20L-8 12Z', o(c)), { tf: tr(cx, cy, s) });
}
function bizCard(cx: number, cy: number, rot = 0, s = 1): string {
  return G(R(-14, -9, 28, 18, 3, { fill: '#fff', stroke: '#8a95a8', sw: 2.6 }) + R(-14, -9, 7, 18, 2, { fill: '#ff7b5e' }) + R(-4, -4, 14, 2.6, 1.3, { fill: '#8a95a8' }) + R(-4, 1, 10, 2.4, 1.2, { fill: '#c8d0da' }), { tf: tr(cx, cy, s, rot) });
}
function pct(cx: number, cy: number, h: number, c = '#ff6b6b'): string {
  return P(`M${cx + h * 0.7} ${cy - h}L${cx - h * 0.7} ${cy + h}`, { stroke: c, sw: 3 }) + C(cx - h * 0.5, cy - h * 0.55, h * 0.32, { fill: 'none', stroke: c, sw: 2.6 }) + C(cx + h * 0.5, cy + h * 0.55, h * 0.32, { fill: 'none', stroke: c, sw: 2.6 });
}
function handshake(cx: number, cy: number, s = 1): string {
  return G(
    P('M-26 -2L-14 -10L-4 -6L4 -12L14 -10L26 -2L20 8L8 14L-2 12L-12 8Z', { fill: '#ffe0c2', stroke: '#c98a5a', sw: S }) +
      P('M-4 -6L-10 2Q-8 6 -4 4L4 -2M2 2L8 8M-2 6L4 11', { fill: 'none', stroke: '#c98a5a', sw: 2.2 }) +
      R(-32, -8, 10, 16, 3, o(CO.blue, false)) + R(22, -8, 10, 16, 3, o(CO.coral, false)),
    { tf: tr(cx, cy, s) },
  );
}
function burst(cx: number, cy: number, r: number, c = '#ffb347'): string {
  return G(P(starPath(r, r * 0.62, 10), o(c)) + P(roundStar(r * 0.52, r * 0.26, 2), { fill: '#fff6c8', stroke: edge('#ffe066'), sw: 2 }), { tf: tr(cx, cy) });
}
function doc(x: number, y: number, w: number, h: number): string {
  return P(`M${x} ${y + 4}Q${x} ${y} ${x + 4} ${y}H${x + w - 10}L${x + w} ${y + 10}V${y + h - 4}Q${x + w} ${y + h} ${x + w - 4} ${y + h}H${x + 4}Q${x} ${y + h} ${x} ${y + h - 4}Z`, { fill: '#ffffff', stroke: '#8a95a8', sw: S }) + P(`M${x + w - 10} ${y}V${y + 10}H${x + w}`, { fill: '#e8eef5', stroke: '#8a95a8', sw: 2 });
}
function gift(cx: number, cy: number, s = 1, c = CO.pink, rib = '#ffffff'): string {
  return G(
    R(-16, -6, 32, 22, 4, o(c)) + R(-18, -12, 36, 9, 3, o(lighten(c, 0.2), false)) + R(-3, -12, 6, 28, 0, { fill: rib, op: 0.95 }) +
      P('M0 -12Q-12 -24 -14 -16Q-14 -10 0 -12Q12 -24 14 -16Q14 -10 0 -12Z', { fill: rib, stroke: edge(c), sw: 2.2 }),
    { tf: tr(cx, cy, s) },
  );
}
function speed(x: number, y: number, n = 3, len = 10): string {
  let s = '';
  for (let i = 0; i < n; i++) s += P(`M${x} ${y + i * 6}h${-len + i * 2}`, { stroke: '#9aa8b8', sw: 2.6 });
  return s;
}
function swirl(cx: number, cy: number, r: number, c = CO.purple): string {
  let d = `M${cx} ${cy}`;
  for (let i = 0; i <= 40; i++) {
    const a = i * 0.42;
    const rr = (i / 40) * r;
    d += `L${n2(cx + Math.cos(a) * rr)} ${n2(cy + Math.sin(a) * rr)}`;
  }
  return C(cx, cy, r + 2, { fill: lighten(c, 0.6), stroke: edge(c), sw: 2.4 }) + P(d, { fill: 'none', stroke: c, sw: 4 });
}
function chainLink(cx: number, cy: number, rot: number, c = '#b8c4d4'): string {
  return R(cx - 12, cy - 6, 24, 12, 6, { fill: 'none', stroke: edge(c), sw: 7, tf: `rotate(${rot} ${cx} ${cy})` }) + R(cx - 12, cy - 6, 24, 12, 6, { fill: 'none', stroke: c, sw: 4, tf: `rotate(${rot} ${cx} ${cy})` });
}
function qr(x: number, y: number, s: number): string {
  const m = [
    '1110101', '1010011', '1110101', '0001010', '1101111', '0110101', '1011011',
  ];
  let g = R(x - 2, y - 2, s * 7 + 4, s * 7 + 4, 3, { fill: '#fff', stroke: '#5a6a90', sw: 2.4 });
  m.forEach((row, r) => row.split('').forEach((b, c) => { if (b === '1') g += R(x + c * s, y + r * s, s, s, s * 0.25, { fill: '#2f3a5a' }); }));
  return g;
}

/* ───────── 아이콘 목록 ───────── */

type Draw = () => string;

const ICONS: Record<string, Draw> = {
  gmv: () => ticket(6, 16, 52, 32),
  revenue: () => E(32, 50, 20, 6, o(CO.gold)) + E(32, 44, 20, 6, o(CO.gold)) + E(32, 38, 20, 6, o(CO.gold)) + coin(34, 24, 15, CO.gold, 'won'),
  point: () => coin(32, 32, 24, CO.dia, 'p'),
  xp: () => book(12, 10, 40, 44, CO.green) + sparkle(50, 12, 7),
  level: () => C(32, 32, 25, { fill: '#ff6b6b', stroke: '#ffffff', sw: 5 }) + C(32, 32, 27.5, { fill: 'none', stroke: edge('#ff6b6b'), sw: 1.6 }) + P('M22 36L32 26L42 36', { fill: 'none', stroke: '#fff', sw: 4.4 }) + shine(22, 20, 6, 3),
  timer: () => clock(32, 35, 23, CO.cream, 0, 0, true),
  corp: () => bldg(16, 10, 32, 46, CO.sky) + R(12, 54, 40, 4, 2, { fill: edge(CO.sky), op: 0.4 }),
  store: () => bowl(32, 38, 1.35),
  match: () => bldg(4, 18, 20, 34, CO.sky, false) + bowl(49, 42, 0.8, false) + heart(32, 22, 10) + P('M18 36Q32 50 44 38', { fill: 'none', stroke: '#ff8fab', sw: 3, da: '3 4' }),
  contracts: () => doc(12, 6, 36, 48) + R(18, 16, 20, 3, 1.5, { fill: '#c8d0da' }) + R(18, 23, 16, 3, 1.5, { fill: '#c8d0da' }) + C(40, 44, 11, { fill: '#ff8a80', stroke: '#e53935', sw: 3, op: 0.95 }) + C(40, 44, 6, { fill: 'none', stroke: '#fff', sw: 1.8 }),
  crit: () => burst(32, 32, 27),
  best: () => P('M18 12H46V24Q46 38 32 40Q18 38 18 24Z', o(CO.gold)) + P('M18 16Q8 16 10 24Q12 30 20 30M46 16Q56 16 54 24Q52 30 44 30', { fill: 'none', stroke: edge(CO.gold), sw: S }) + R(28, 40, 8, 8, 1, o(CO.gold, false)) + R(20, 48, 24, 8, 3, o('#c98a5a')) + G(P(starPath(6), { fill: '#fff6c8' }), { tf: tr(32, 24) }),
  newItem: () => briefcase(30, 36, 1.2) + sparkle(50, 14, 9) + sparkle(12, 16, 5),
  chest: () => gift(32, 34, 1.3),
  inquiry: () => plane(32, 32, 1.25) + P('M6 44q6 -2 10 2', { fill: 'none', stroke: '#b8c6d4', sw: 2.4, da: '2 4' }),
  pending: () => hourglass(22, 32, 1.2) + ticket(34, 30, 26, 18, CO.orange, false),
  sales: () => bubble(6, 8, 52, 38, CO.coral) + fist(32, 27, 0.9),
  tech: () => gear(32, 32, 25, CO.sky) + C(32, 32, 4, { fill: '#4aa3df' }) + P('M32 22V16M40 34H46M24 34H18', { stroke: '#fff', sw: 2.4 }) + C(32, 15, 2.4, { fill: '#fff' }) + C(47, 34, 2.4, { fill: '#fff' }) + C(17, 34, 2.4, { fill: '#fff' }),
  warn: () => P('M32 8L58 54H6Z', { ...o(CO.yellow), lj: 'round' }) + R(29, 22, 6, 18, 3, { fill: '#5c3a1a' }) + C(32, 47, 3.4, { fill: '#5c3a1a' }),
  arrowUp: () => P('M32 6L54 30H42V56H22V30H10Z', { ...o(CO.coral), lj: 'round' }) + P('M28 34V50', { stroke: '#fff', sw: 2.6, so: 0.6 }),
  lock: () => P('M20 28V20Q20 8 32 8Q44 8 44 20V28', { fill: 'none', stroke: '#8a95a8', sw: 6 }) + R(12, 26, 40, 30, 7, o(CO.gold)) + C(32, 38, 4.4, { fill: '#8a6a2a' }) + R(30, 40, 4, 9, 2, { fill: '#8a6a2a' }),
  check: () => C(32, 32, 26, o('#7cd07c')) + P('M19 33L28 42L46 22', { fill: 'none', stroke: '#fff', sw: 6 }),
  plus: () => C(32, 32, 26, o('#5cb85c')) + P('M32 18V46M18 32H46', { stroke: '#fff', sw: 6.4 }),
  doubleTap: () => P('M18 16Q18 8 26 8Q34 8 34 16', { fill: 'none', stroke: '#8fd3ff', sw: 3 }) + P('M12 18Q12 2 26 2Q40 2 40 18', { fill: 'none', stroke: '#8fd3ff', sw: 2.6, so: 0.7 }) + P('M22 18Q22 12 26 12Q30 12 30 18V32Q36 28 40 32Q46 30 48 36Q54 36 54 44V50Q54 60 42 60H32Q24 60 20 52L12 40Q10 34 16 34Q20 34 22 38Z', o('#ffe0c2', false)),
  max: () => R(4, 16, 56, 32, 16, o(CO.purple)) + G(P(starPath(7), { fill: '#fff6c8', stroke: '#fff', sw: 1 }), { tf: tr(18, 32) }) + G(P(starPath(8.5), { fill: '#fff6c8', stroke: '#fff', sw: 1 }), { tf: tr(32, 31) }) + G(P(starPath(7), { fill: '#fff6c8', stroke: '#fff', sw: 1 }), { tf: tr(46, 32) }),
  close: () => P('M14 14L50 50M50 14L14 50', { stroke: edge(CO.coral), sw: 13 }) + P('M14 14L50 50M50 14L14 50', { stroke: CO.coral, sw: 8 }),
  back: () => P('M8 32L30 10V22H54V42H30V54Z', { ...o(CO.sky), lj: 'round' }),
  sound: () => P('M8 24H18L32 12V52L18 40H8Z', { ...o('#9fb6d8'), lj: 'round' }) + P('M40 22Q46 32 40 42M46 16Q56 32 46 48', { fill: 'none', stroke: '#6fa7e6', sw: 3.6 }),
  soundOff: () => P('M8 24H18L32 12V52L18 40H8Z', { ...o('#c8d0da'), lj: 'round' }) + P('M40 24L54 40M54 24L40 40', { stroke: '#ff6b6b', sw: 4.6 }),
  music: () => P('M22 46V14L50 8V40', { fill: 'none', stroke: '#6f5fa8', sw: 4.4 }) + E(16, 46, 8, 6, o(CO.purple)) + E(44, 40, 8, 6, o(CO.purple)) + P('M22 20L50 14', { stroke: '#6f5fa8', sw: 5 }),
  settings: () => gear(32, 32, 26, '#c8d0da', 8),
  pin: () => pin(32, 30, 1.3),
  fullscreen: () => ['M8 22V8H22', 'M42 8H56V22', 'M56 42V56H42', 'M22 56H8V42'].map((d) => P(d, { fill: 'none', stroke: edge(CO.sky), sw: 8 }) + P(d, { fill: 'none', stroke: CO.sky, sw: 4.6 })).join('') + R(22, 22, 20, 20, 4, { fill: lighten(CO.sky, 0.6), stroke: edge(CO.sky), sw: 2 }),
  fullscreenExit: () => ['M8 22H22V8', 'M42 8V22H56', 'M56 42H42V56', 'M22 56V42H8'].map((d) => P(d, { fill: 'none', stroke: edge(CO.sky), sw: 8 }) + P(d, { fill: 'none', stroke: CO.sky, sw: 4.6 })).join(''),
  play: () => P('M20 10L52 32L20 54Z', { ...o('#7cd07c'), lj: 'round' }),
  office: () => bldg(12, 8, 40, 48, CO.sky, false) + R(24, 38, 16, 18, 4, o('#c98a5a', false)) + C(36, 48, 1.6, { fill: '#ffd36b' }),
  go: () => speed(12, 20, 3, 10) + briefcase(38, 26, 0.95) + P('M30 42L26 54M44 42L50 52', { stroke: '#5a6a90', sw: 5 }) + E(24, 56, 6, 3.4, { fill: '#ff7b5e' }) + E(52, 54, 6, 3.4, { fill: '#ff7b5e' }),
  save: () => R(10, 10, 44, 44, 6, o(CO.blue)) + R(18, 10, 24, 14, 2, { fill: '#fff', stroke: edge(CO.blue), sw: 2 }) + R(34, 13, 5, 8, 1, { fill: '#5a6a90' }) + R(18, 34, 28, 20, 3, { fill: '#fffdf6', stroke: edge(CO.blue), sw: 2 }),
  load: () => P('M8 20Q8 14 14 14H26L30 20H50Q56 20 56 26V48Q56 54 50 54H14Q8 54 8 48Z', o(CO.gold)) + P('M32 48V30M24 37L32 28L40 37', { fill: 'none', stroke: '#fff', sw: 4 }),
  reset: () => P('M50 32A18 18 0 1 1 42 17', { fill: 'none', stroke: edge(CO.mint), sw: 10 }) + P('M50 32A18 18 0 1 1 42 17', { fill: 'none', stroke: CO.mint, sw: 6 }) + P('M36 8L50 12L44 26Z', { ...o(CO.mint, false), lj: 'round' }),
  help: () => C(32, 32, 26, o(CO.sky)) + P('M24 25Q24 16 32 16Q41 16 41 24Q41 30 32 33V38', { fill: 'none', stroke: '#fff', sw: 5 }) + C(32, 47, 3.6, { fill: '#fff' }),
  record: () => R(12, 10, 40, 48, 5, o('#fff4dc')) + R(22, 6, 20, 8, 3, o('#c98a5a', false)) + [0, 1, 2, 3].map((i) => R(18, 20 + i * 9, 6, 5, 1.5, { fill: ['#ff8fab', '#ffd36b', '#8fe0c0', '#8fd3ff'][i] }) + R(28, 21 + i * 9, 18, 3, 1.5, { fill: '#b8a88e' })).join(''),
  star: () => star(32, 33, 27),
  starEmpty: () => star(32, 33, 27, '#e6d9bd', false),
  speed: () => P('M8 14L30 32L8 50Z', { ...o('#ffb347'), lj: 'round' }) + P('M30 14L52 32L30 50Z', { ...o('#ffb347'), lj: 'round' }) + R(52, 14, 6, 36, 3, o('#ffb347', false)),
  mastery: () => R(8, 20, 38, 30, 5, o('#5a6fa8')) + P('M27 20V50', { stroke: darken('#5a6fa8', 0.7), sw: 2 }) + bizCard(34, 34, -8, 0.8) + badge(50, 16, 'up'),
  tab_tree: () => star(32, 38, 22) + P('M32 16Q30 8 22 6Q24 14 32 16Q34 6 44 6Q42 14 32 16Z', { fill: '#8fd07e', stroke: '#4f9e4a', sw: 2.4 }) + P('M32 16V20', { stroke: '#4f9e4a', sw: 2.4 }),
  tab_reps: () => C(16, 16, 8, o('#c89b6d', false)) + C(48, 16, 8, o('#c89b6d', false)) + C(32, 32, 22, o('#c89b6d')) + E(32, 40, 10, 7, { fill: '#f0dcc4' }) + face(32, 32, 1.35, 'idle') + E(32, 38, 3, 2, { fill: '#5a3a2a' }) + tie(32, 58, 0.5),
  tab_dex: () => book(10, 8, 44, 48, CO.blue) + G(P(heartPath(6), { fill: '#fff' }), { tf: tr(34, 28) }),
  tab_items: () => briefcase(32, 36, 1.4),
  tab_skills: () => phone(28, 34, 1.3) + bolt(44, 22, 0.9),
  ef_crowd: () => person(16, 34, 0.9, CO.coral) + person(48, 34, 0.9, CO.mint) + person(32, 38, 1.1, CO.blue),
  ef_respawn: () => P('M50 34A18 18 0 1 1 42 18', { fill: 'none', stroke: '#8fd07e', sw: 5 }) + P('M38 10L50 14L44 24Z', { fill: '#8fd07e', stroke: '#4f9e4a', sw: 2.2 }) + P('M32 44V30M32 34Q24 26 18 30Q24 38 32 34Q40 24 46 28Q40 36 32 34', { fill: '#8fd07e', stroke: '#4f9e4a', sw: 2.6 }),
  ef_fps: () => speed(18, 22, 3, 10) + bizCard(40, 20, -16, 0.9) + bizCard(34, 38, 6, 0.9) + bizCard(44, 50, -4, 0.7),
  ef_pflat: () => megaphone(30, 34, 1.15) + badge(50, 16, 'up'),
  ef_power: () => bubble(6, 8, 52, 38, CO.coral) + fist(32, 27, 0.9) + badge(52, 52, 'up'),
  ef_radius: () => rings(32, 30, 24) + P('M26 52Q24 44 28 42Q32 42 31 48ZM36 50Q35 44 39 43Q42 44 41 50Z', { fill: '#8a6a4a' }),
  ef_all: () => rings(32, 32, 26) + fist(32, 32, 0.95),
  ef_gflat: () => coin(32, 32, 24, CO.gold, 'won'),
  ef_gmv: () => ticket(8, 38, 40, 20) + ticket(12, 26, 40, 20) + ticket(16, 14, 40, 20) + badge(52, 12, 'up'),
  ef_tv: () => magnifier(26, 26, 17) + G(bldg(-7, -10, 14, 20, CO.sky, false), { tf: tr(26, 26) }),
  ef_xflat: () => doc(14, 8, 36, 48) + [0, 1, 2, 3].map((i) => R(20, 22 + i * 7, 22 - (i % 2) * 6, 3, 1.5, { fill: '#8fd07e' })).join(''),
  ef_xp: () => book(12, 12, 38, 42, CO.green) + sparkle(50, 14, 9) + sparkle(14, 12, 5),
  ef_match: () => heart(28, 34, 17) + P('M10 34Q28 58 48 34', { fill: 'none', stroke: '#ff8fab', sw: 3, da: '3 4' }) + badge(52, 14, 'up'),
  ef_crit: () => burst(28, 34, 24) + badge(52, 14, 'up'),
  ef_wom: () => bubble(8, 12, 48, 32, '#c9e4ff', false) + C(22, 28, 3.4, { fill: '#5a6a90' }) + C(32, 28, 3.4, { fill: '#5a6a90' }) + C(42, 28, 3.4, { fill: '#5a6a90' }),
  ef_womC: () => bubble(4, 6, 34, 22, '#ffd6e0') + bubble(24, 22, 36, 24, '#c9e4ff', false) + bubble(8, 40, 26, 16, '#d8f5e6') + C(36, 34, 2.6, { fill: '#5a6a90' }) + C(43, 34, 2.6, { fill: '#5a6a90' }) + C(50, 34, 2.6, { fill: '#5a6a90' }),
  ef_hot: () => swirl(32, 32, 24) + C(32, 10, 4.4, o('#ffe0c2', false)) + C(54, 30, 4.4, o('#ffe0c2', false)) + C(18, 50, 4.4, o('#ffe0c2', false)),
  ef_hotC: () => swirl(28, 34, 22) + pct(50, 16, 8),
  ef_ref: () => handshake(32, 34, 0.95),
  ef_refN: () => handshake(28, 40, 0.8) + person(50, 16, 0.75, CO.mint),
  ef_inquiry: () => plane(28, 34, 1.05) + badge(52, 14, 'up'),
  ef_district: () => pin(32, 30, 1.3, '#8fd07e'),
  ef_cap: () => R(10, 18, 44, 32, 6, o('#ffffff', false)) + R(10, 18, 44, 10, 5, { fill: '#ff7b5e' }) + C(22, 39, 6, { fill: '#cfe3f2' }) + R(32, 35, 16, 3, 1.5, { fill: '#8a95a8' }) + R(32, 41, 12, 3, 1.5, { fill: '#c8d0da' }) + R(28, 10, 8, 10, 2, o('#c8d0da', false)),
  ef_time: () => hourglass(20, 32, 1.05) + clock(44, 36, 14, CO.cream, 0, 120),
  ef_tgt: () => bldg(10, 14, 32, 42, CO.sky) + badge(48, 16, 'plus'),
  ef_sk: () => phone(28, 34, 1.2) + bolt(44, 24, 0.9),
  ef_cds: () => speed(14, 22, 3, 10) + clock(38, 32, 20, CO.cream, 60, 180),
  ef_dbl: () => bolt(22, 32, 1.05) + bolt(42, 32, 1.05, '#ffd34d'),
  ef_chest: () => gift(28, 36, 1.1) + badge(52, 14, 'up'),
  ef_point: () => coin(32, 32, 24, CO.dia, 'p'),
  ef_disc: () => P('M8 30L30 8H54V32L32 54Z', { ...o(CO.coral), lj: 'round' }) + C(44, 18, 4, { fill: '#fff', stroke: edge(CO.coral), sw: 2 }) + pct(30, 34, 8, '#fff'),
  ef_autoMatch: () => P('M32 10V52M14 54H50', { stroke: '#8a6a4a', sw: 4 }) + P('M10 18H54', { stroke: '#8a6a4a', sw: 3.4 }) + P('M4 36Q10 44 18 36L12 18Z', o(CO.sky)) + P('M46 36Q52 44 60 36L52 18Z', o(CO.pink)) + C(32, 10, 4, o(CO.gold, false)),
  ef_comm: () => P('M14 6H50V58L44 54L38 58L32 54L26 58L20 54L14 58Z', { fill: '#ffffff', stroke: '#8a95a8', sw: S }) + R(20, 14, 18, 3, 1.5, { fill: '#c8d0da' }) + R(20, 20, 24, 3, 1.5, { fill: '#c8d0da' }) + pct(32, 40, 8, '#ff7b5e'),
  ef_fee: () => R(6, 14, 52, 36, 6, o(CO.sky)) + R(6, 22, 52, 6, 0, { fill: edge(CO.sky), op: 0.35 }) + C(20, 38, 5, { fill: '#fff' }) + pct(42, 38, 7, '#fff'),
  ef_auto: () => gear(22, 24, 16, '#c8d0da') + R(26, 32, 32, 22, 4, o('#ffffff', false)) + P('M26 34L42 46L58 34', { fill: 'none', stroke: '#8a95a8', sw: 2.6 }),
  ef_rare: () => P('M16 22L26 10H38L48 22L32 56Z', { ...o('#9fe9ff'), lj: 'round' }) + P('M16 22H48M26 10L32 22L38 10M32 22V56', { fill: 'none', stroke: edge('#9fe9ff'), sw: 2 }) + R(28, 28, 3, 4, 1, { fill: '#fff' }) + R(33, 28, 3, 4, 1, { fill: '#fff' }) + R(28, 35, 3, 4, 1, { fill: '#fff' }) + R(33, 35, 3, 4, 1, { fill: '#fff' }) + sparkle(52, 12, 7) + sparkle(12, 46, 5),
  sk_call: () => G(P('M-14 -18Q-20 -18 -20 -10Q-18 8 -4 16Q4 22 12 20Q18 18 18 12L14 6Q12 4 8 6L4 8Q-4 4 -8 -4L-6 -8Q-4 -12 -6 -14L-10 -18Z', o('#7cd07c')), { tf: tr(26, 34) }) + bolt(46, 18, 0.9),
  sk_promo: () => C(28, 38, 20, o('#ff9fbb')) + R(20, 30, 16, 12, 2, { fill: '#fff', op: 0.9, tf: 'rotate(-10 28 36)' }) + P('M40 22Q46 12 54 12', { fill: 'none', stroke: '#8a6a4a', sw: 3 }) + sparkle(55, 11, 6, '#ffb347') + G(megaphone(0, 0, 0.45), { tf: tr(30, 38) }),
  sk_rush: () => [0, 1, 2].map((i) => G(C(0, -10, 5, o('#ffe0c2', false)) + P('M0 -4L-2 8M-2 8L-8 16M-2 8L4 16M0 0L8 -2M0 0L-8 4', { fill: 'none', stroke: ['#5a6fa8', '#ff8f7a', '#6fae6a'][i], sw: 4 }), { tf: tr(14 + i * 18, 36 - (i % 2) * 4) })).join('') + speed(8, 50, 2, 6),
  sk_qr: () => C(32, 32, 28, { fill: 'none', stroke: '#c896ff', sw: 2.6, da: '4 4' }) + C(32, 32, 22, { fill: lighten('#c896ff', 0.6), stroke: '#c896ff', sw: 2.4 }) + qr(20, 20, 3.4),
  up_dmg: () => fist(28, 36, 1.3) + badge(50, 14, 'up'),
  up_chain: () => chainLink(20, 40, -40) + chainLink(32, 32, -40, '#d6dde6') + chainLink(44, 24, -40),
  up_area: () => C(32, 32, 14, o(CO.mint)) + [0, 90, 180, 270].map((r) => G(P('M0 -20V-28M-5 -23L0 -29L5 -23', { fill: 'none', stroke: edge(CO.mint), sw: 3.4 }), { tf: `translate(32 32) rotate(${r})` })).join(''),
  up_dur: () => R(6, 40, 44, 12, 6, { fill: '#eadfc6', stroke: '#b8a88e', sw: 2.4 }) + R(6, 40, 34, 12, 6, o('#8fe0c0')) + clock(44, 22, 14, CO.cream, 0, 90) + P('M50 46H58M54 42L58 46L54 50', { fill: 'none', stroke: '#5cb85c', sw: 3 }),
  up_cd: () => P('M48 24A18 18 0 0 0 16 26', { fill: 'none', stroke: CO.sky, sw: 5.4 }) + P('M10 18L16 28L24 20Z', { fill: CO.sky, stroke: edge(CO.sky), sw: 2 }) + P('M16 40A18 18 0 0 0 48 38', { fill: 'none', stroke: CO.sky, sw: 5.4 }) + P('M54 46L48 36L40 44Z', { fill: CO.sky, stroke: edge(CO.sky), sw: 2 }),
  up_bonus: () => coin(28, 36, 20, CO.gold, 'won') + badge(50, 14, 'up'),
  sp_dual: () => P('M34 6L18 30H30L22 58L46 26H34L42 6Z', o(CO.yellow)) + P('M40 34L54 40L46 44L56 54', { fill: 'none', stroke: edge(CO.yellow), sw: 6 }) + P('M40 34L54 40L46 44L56 54', { fill: 'none', stroke: CO.yellow, sw: 3.4 }),
  sp_encore: () => G(P(starPath(16, 6, 8), o('#ff9fbb')), { tf: tr(22, 26) }) + G(P(starPath(13, 5, 8), o('#8fd3ff')), { tf: tr(44, 42) }) + C(22, 26, 3, { fill: '#fff' }) + C(44, 42, 2.6, { fill: '#fff' }),
  sp_queue: () => [0, 1, 2, 3].map((i) => person(12 + i * 13, 36, 0.7 + i * 0.04, [CO.blue, CO.coral, CO.mint, CO.purple][i])).join('') + P('M4 54H60', { stroke: '#b8a88e', sw: 2.4, da: '4 4' }),
  sp_follow: () => P('M14 12V32Q14 50 32 50Q50 50 50 32V12H38V32Q38 38 32 38Q26 38 26 32V12Z', { ...o('#ff7b7b'), lj: 'round' }) + R(14, 8, 12, 8, 1, o('#e8eef5', false)) + R(38, 8, 12, 8, 1, o('#e8eef5', false)) + P('M8 58q4 -3 8 0M48 58q4 -3 8 0', { fill: 'none', stroke: '#b8c6d4', sw: 2.4 }),
  basic_power: () => tie(20, 32, 1.2) + fist(40, 36, 1.05),
  basic_radius: () => rings(38, 26, 18) + shoe(26, 46, 0.95),
  dist_euljiro: () => P('M14 8H50', { stroke: '#8a6a4a', sw: 4 }) + P('M22 8V14M42 8V14', { stroke: '#8a6a4a', sw: 3 }) + R(18, 14, 28, 44, 4, o('#ffcf9e')) + R(22, 18, 20, 36, 2, { fill: 'none', stroke: '#fff', sw: 2 }) + R(26, 22, 12, 4, 2, { fill: '#e0955a' }) + R(26, 30, 12, 4, 2, { fill: '#e0955a' }) + R(26, 38, 12, 4, 2, { fill: '#e0955a' }) + C(32, 48, 3.4, { fill: '#ff6b6b' }),
  dist_gangnam: () => G(R(0, 0, 22, 48, 3, o('#a3c8f0')) + P('M5 6V44M11 6V44M17 6V44', { stroke: '#fff', sw: 1.4, so: 0.7 }), { tf: tr(8, 10) }) + G(R(0, 0, 22, 36, 3, o('#bfe0ff')) + P('M5 6V32M11 6V32M17 6V32', { stroke: '#fff', sw: 1.4, so: 0.7 }), { tf: tr(34, 22) }) + P('M34 22L56 22', { stroke: '#fff', sw: 2, so: 0.6 }),
  dist_yeouido: () => bldg(18, 6, 28, 40, '#a3c8f0', false) + P('M4 46Q12 40 20 46T36 46T52 46T62 46V60H4Z', o('#8fd3ff')) + P('M8 52q4 -3 8 0M28 54q4 -3 8 0', { fill: 'none', stroke: '#fff', sw: 2 }),
  dist_pangyo: () => R(4, 4, 56, 56, 12, { fill: '#2e3a66', stroke: '#1c2548', sw: S }) + C(46, 16, 7, { fill: '#ffe9a8' }) + C(49, 14, 6, { fill: '#2e3a66' }) + R(14, 22, 22, 32, 3, { fill: '#3a4a7e', stroke: '#1c2548', sw: 2 }) + [0, 1, 2].map((r) => R(18, 26 + r * 9, 5, 5, 1, { fill: '#ffe066' }) + R(27, 26 + r * 9, 5, 5, 1, { fill: r === 1 ? '#6a7ab0' : '#ffe066' })).join(''),
  dist_magok: () => P('M8 50Q8 14 32 14Q56 14 56 50Z', { fill: '#dff6ff', fo: 0.9, stroke: '#6fa7c8', sw: S }) + P('M20 50Q20 18 32 14Q44 18 44 50M8 36H56M12 26H52', { fill: 'none', stroke: '#6fa7c8', sw: 1.8 }) + P('M24 50Q26 38 32 38Q38 38 40 50Z', { fill: '#8fd07e', stroke: '#4f9e4a', sw: 2 }) + R(4, 50, 56, 6, 3, o('#c8d0da', false)),
  dist_sejong: () => P('M6 30Q32 12 58 30L54 34Q32 22 10 34Z', o('#7fc4b8')) + R(14, 34, 36, 20, 2, o('#fffaf2', false)) + R(22, 40, 6, 14, 1, { fill: '#7fc4b8' }) + R(36, 40, 6, 14, 1, { fill: '#7fc4b8' }) + [[50, 12], [58, 20], [8, 14]].map(([x, y]) => G([0, 72, 144, 216, 288].map((r) => E(0, -3.4, 2.4, 3.4, { fill: '#ffc7d9', stroke: '#e58aa8', sw: 0.8, tf: `rotate(${r})` })).join('') + C(0, 0, 1.4, { fill: '#ffd36b' }), { tf: tr(x, y) })).join(''),
};

export function iconBody(id: string, pre: string): Body | null {
  const fn = ICONS[id];
  if (!fn) return null;
  sv = new Svg(pre);
  sv.add(fn());
  void PL;
  return { vb: [0, 0, 64, 64], body: sv.body() };
}

export const ICON_IDS = Object.keys(ICONS);
