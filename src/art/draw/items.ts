/**
 * 영업 아이템 20종 (96×96). 파스텔 채움 + 짙은 동계열 외곽선, 부드러운 그라데이션, 흰 광택.
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, face, lighten, n2, sparkle, starPath, pPath, ticketPath } from '../kit';

const SW = 3;

type Draw = (sv: Svg) => string;

const grad = (sv: Svg, c: string, k = 0.3) => sv.lin([[0, lighten(c, k)], [1, c]], 0, 0, 0.3, 1);
const shine = (x: number, y: number, w: number, h: number, rot = -20) =>
  E(x, y, w, h, { fill: '#fff', op: 0.6, tf: `rotate(${rot} ${n2(x)} ${n2(y)})` });

const it01: Draw = (sv) => {
  const card = (x: number, y: number, rot: number) =>
    G(
      R(-30, -18, 60, 36, 5, { fill: grad(sv, '#ffffff', 0), stroke: '#8a95a8', sw: SW }) +
        R(-30, -18, 14, 36, 5, { fill: '#ff7b5e' }) + R(-18, -18, 3, 36, 0, { fill: '#ff7b5e' }) +
        R(-8, -8, 26, 5, 2.5, { fill: '#8a95a8' }) + R(-8, 2, 18, 4, 2, { fill: '#c8d0da' }) + R(-8, 9, 22, 4, 2, { fill: '#c8d0da' }),
      { tf: `translate(${x} ${y}) rotate(${rot})` },
    );
  return E(50, 84, 32, 5, { fill: '#000', op: 0.1 }) + card(44, 42, -14) + card(52, 56, 8);
};

const it02: Draw = (sv) => {
  const y = '#ffd96b';
  return (
    P(ticketPath(8, 24, 80, 50, 8, 6, 3), { fill: grad(sv, y), stroke: edge(y), sw: SW }) +
    P('M62 28V70', { stroke: edge(y), sw: 2, da: '4 4' }) +
    P('M22 42H48L45 60Q44 64 40 64H30Q26 64 25 60Z', { fill: '#b07a4e', stroke: '#6e4428', sw: 2.2 }) +
    P('M47 46Q56 46 54 53Q52 58 46 57', { fill: 'none', stroke: '#6e4428', sw: 2.6 }) +
    P('M28 38q-3 -4 0 -8M35 38q-3 -4 0 -8M42 38q-3 -4 0 -8', { fill: 'none', stroke: '#b07a4e', sw: 2 }) +
    G(P(starPath(7), { fill: '#fff', stroke: edge(y), sw: 1.6 }), { tf: 'translate(75 49)' })
  );
};

const it03: Draw = (sv) => {
  const c = '#8fd3ff';
  let dots = '';
  for (const [x, y] of [[44, 42], [54, 52], [42, 60], [52, 70], [46, 78], [56, 38]]) dots += C(x, y, 2.4, { fill: '#fff' });
  return (
    P('M40 12H56L60 22L52 28H44L36 22Z', { fill: grad(sv, darken(c, 0.9)), stroke: edge(c), sw: SW }) +
    G(P('M44 28H52L62 74L48 90L34 74Z', { fill: grad(sv, c) }) + dots, { cp: sv.clip(P('M44 28H52L62 74L48 90L34 74Z')) }) +
    P('M44 28H52L62 74L48 90L34 74Z', { fill: 'none', stroke: edge(c), sw: SW }) +
    P('M38 20L28 10M58 20L68 10', { stroke: '#e6eef5', sw: 5 }) + P('M38 20L28 10M58 20L68 10', { stroke: '#9aa8b8', sw: 1.4 })
  );
};

const it04: Draw = (sv) => {
  const c = '#fff1d6';
  const l = edge('#e6c89a');
  return (
    E(48, 88, 26, 4, { fill: '#000', op: 0.1 }) +
    P('M30 80L24 88M66 80L72 88', { stroke: l, sw: 4 }) +
    E(26, 22, 12, 10, { fill: '#ffd36b', stroke: edge('#ffd36b'), sw: SW, tf: 'rotate(-30 26 22)' }) +
    E(70, 22, 12, 10, { fill: '#ffd36b', stroke: edge('#ffd36b'), sw: SW, tf: 'rotate(30 70 22)' }) +
    P('M44 16H52', { stroke: l, sw: 4 }) +
    C(48, 52, 32, { fill: sv.rad([[0, '#ffffff'], [1, c]]), stroke: l, sw: SW }) +
    C(48, 52, 25, { fill: '#fffdf6', stroke: '#e6d2b0', sw: 1.6 }) +
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
      const a = (i / 12) * Math.PI * 2;
      return C(48 + Math.sin(a) * 20, 52 - Math.cos(a) * 20, i % 3 === 0 ? 2.2 : 1.2, { fill: '#b98a5e' });
    }).join('') +
    P('M48 52L48 36', { stroke: '#5c3a1a', sw: 3.4 }) +
    P(`M48 52L${n2(48 - Math.sin(Math.PI / 6) * 13)} ${n2(52 - Math.cos(Math.PI / 6) * 13)}`, { stroke: '#5c3a1a', sw: 4 }) +
    C(48, 52, 3, { fill: '#ff7b5e' }) +
    shine(34, 36, 7, 4)
  );
};

const it05: Draw = (sv) => {
  const g = '#ffd36b';
  return G(
    R(-8, -34, 16, 60, 7, { fill: sv.lin([[0, '#fff3b8'], [0.5, g], [1, '#e0a52a']], 0, 0, 1, 0), stroke: edge(g), sw: SW }) +
      P('M-8 26L0 40L8 26Z', { fill: '#e8eef5', stroke: '#8a95a8', sw: 2.4 }) + P('M-2 36L0 42L2 36Z', { fill: '#3a3a48' }) +
      R(-9, -12, 18, 5, 2, { fill: '#e0a52a' }) + R(7, -30, 4, 22, 2, { fill: '#e0a52a', stroke: edge(g), sw: 1.4 }) +
      R(-3, -28, 3, 40, 1.5, { fill: '#fff', op: 0.6 }) +
      G(
        [0, 90, 180, 270].map((r) => P(`M0 0C-10 -6 -8 -16 0 -12C8 -16 10 -6 0 0Z`, { fill: '#7cd07c', stroke: '#3f8a3f', sw: 1.8, tf: `rotate(${r})` })).join('') + C(0, 0, 2, { fill: '#3f8a3f' }),
        { tf: 'translate(0 -40)' },
      ),
    { tf: 'translate(52 52) rotate(28)' },
  );
};

const it06: Draw = (sv) => {
  const c = '#c2ecb0';
  const l = edge(c);
  return (
    PL([12, 24, 36, 16, 60, 24, 84, 16, 84, 72, 60, 80, 36, 72, 12, 80], { fill: c, stroke: l, sw: SW }) +
    PL([36, 16, 60, 24, 60, 80, 36, 72], { fill: darken(c, 0.9) }) +
    PL([12, 24, 36, 16, 84, 16, 84, 72, 60, 80, 36, 72, 12, 80], { fill: 'none', stroke: l, sw: SW }) +
    P('M36 16V72M60 24V80', { stroke: l, sw: 2 }) +
    P('M16 50Q30 40 44 52T80 44', { fill: 'none', stroke: '#fff', sw: 4 }) + P('M24 30L30 64M70 24L66 70', { stroke: '#fff', sw: 2.4, so: 0.8 }) +
    E(68, 52, 8, 3, { fill: '#000', op: 0.15 }) +
    P('M68 50Q56 34 60 26Q64 18 72 20Q80 24 78 34Q76 40 68 50Z', { fill: sv.lin([[0, '#ff8f8f'], [1, '#e53935']]), stroke: '#9a2a2a', sw: 2.4 }) +
    C(69, 30, 4, { fill: '#fff' })
  );
};

const it07: Draw = (sv) => {
  const m = '#8fe0c0';
  return (
    E(48, 80, 36, 5, { fill: '#000', op: 0.1 }) +
    P('M12 66Q10 50 22 44L42 34Q50 30 56 38L64 50Q74 52 82 58Q90 64 86 72H14Z', { fill: grad(sv, '#ffffff', 0), stroke: '#8a9aa8', sw: SW }) +
    P('M12 66H86Q88 72 84 76H14Q10 72 12 66Z', { fill: m, stroke: edge(m), sw: SW }) +
    P('M30 48Q44 40 54 46', { fill: 'none', stroke: m, sw: 5 }) +
    P('M44 38L50 50M50 36L56 48M38 42L44 52', { stroke: '#c8d0da', sw: 2.2 }) +
    P('M20 30Q34 22 42 32Q30 30 26 40Q22 34 20 30Z', { fill: m, stroke: edge(m), sw: 2 }) + P('M14 38Q26 32 32 40Q22 40 20 46Z', { fill: lighten(m, 0.4), stroke: edge(m), sw: 2 }) +
    shine(66, 58, 8, 3, -10)
  );
};

const it08: Draw = (sv) => {
  const s = '#dfe4ec';
  return (
    P('M8 72H88L82 82H14Z', { fill: grad(sv, s), stroke: '#7c8294', sw: SW }) +
    R(18, 20, 60, 50, 6, { fill: sv.lin([[0, '#f4f6fa'], [1, '#c9ced8']]), stroke: '#7c8294', sw: SW }) +
    R(23, 25, 50, 38, 3, { fill: sv.lin([[0, '#dff4ff'], [1, '#9fd4f5']]) }) +
    R(28, 50, 7, 9, 1.5, { fill: '#8fe0c0' }) + R(38, 44, 7, 15, 1.5, { fill: '#ffd36b' }) + R(48, 38, 7, 21, 1.5, { fill: '#ff8fab' }) + R(58, 32, 7, 27, 1.5, { fill: '#9b7bd8' }) +
    P('M28 46L40 38L50 42L66 28', { fill: 'none', stroke: '#ff5a5a', sw: 3 }) + P('M60 27L67 27L67 34', { fill: 'none', stroke: '#ff5a5a', sw: 3 }) +
    R(40, 74, 16, 3, 1.5, { fill: '#9aa3b2' })
  );
};

const it09: Draw = (sv) => {
  const c = '#8fd3ff';
  return (
    R(10, 22, 76, 52, 8, { fill: sv.lin([[0, lighten(c, 0.35)], [1, c]], 0, 0, 1, 1), stroke: edge(c), sw: SW }) +
    R(10, 32, 76, 8, 0, { fill: edge(c), op: 0.35 }) +
    C(62, 56, 14, { fill: '#6fd3f7', stroke: '#fff', sw: 3 }) + G(P(pPath(7.5), { fill: 'none', stroke: '#fff', sw: 3.8 }), { tf: 'translate(62 56)' }) +
    R(18, 50, 22, 4, 2, { fill: '#fff', op: 0.8 }) + R(18, 58, 14, 4, 2, { fill: '#fff', op: 0.6 }) +
    shine(26, 28, 9, 3, -6)
  );
};

const it10: Draw = (sv) => {
  const c = '#ffc2d4';
  let s = '';
  for (let i = 0; i < 4; i++) {
    const r = -10 + i * 7;
    s += G(R(-26, -32, 52, 64, 4, { fill: grad(sv, i % 2 ? c : lighten(c, 0.3), 0.2), stroke: edge(c), sw: 2.4 }) + (i === 3 ? R(-18, -24, 36, 10, 2, { fill: '#ff8fab' }) + R(-18, -8, 24, 4, 2, { fill: '#fff' }) + R(-18, 0, 30, 4, 2, { fill: '#fff' }) + C(12, 18, 7, { fill: '#ffd36b' }) : ''), { tf: `translate(48 50) rotate(${r})` });
  }
  return s + P('M16 48Q48 60 80 44', { fill: 'none', stroke: '#c07ad8', sw: 4 }) + P('M16 48Q48 60 80 44', { fill: 'none', stroke: '#e6b8ff', sw: 1.6 });
};

const it11: Draw = (sv) => {
  const c = '#7cc47c';
  return (
    R(20, 12, 58, 74, 7, { fill: sv.lin([[0, lighten(c, 0.3)], [1, c]], 0, 0, 1, 0.3), stroke: edge(c), sw: SW }) +
    R(20, 12, 12, 74, 5, { fill: darken(c, 0.85) }) +
    R(40, 26, 30, 16, 3, { fill: '#fffaf0', stroke: edge(c), sw: 1.8 }) + R(44, 31, 20, 2.6, 1.3, { fill: '#8a9a88' }) + R(44, 36, 14, 2.6, 1.3, { fill: '#b8c6b4' }) +
    P('M62 12V92L67 86L72 92V12', { fill: '#ff6b6b', stroke: '#b84a4a', sw: 1.8 }) +
    R(20, 80, 58, 6, 3, { fill: '#fffaf0', op: 0.9 }) +
    shine(52, 60, 10, 3, -60)
  );
};

const it12: Draw = (sv) => {
  const c = '#8fe0c0';
  let cells = '';
  for (let i = 0; i < 4; i++) cells += R(28 + i * 11, 64, 8, 10, 2, { fill: i < 3 ? '#5cb85c' : '#e6f4ee', stroke: edge(c), sw: 1.2 });
  return (
    R(20, 14, 56, 70, 12, { fill: sv.lin([[0, lighten(c, 0.35)], [1, c]], 0, 0, 1, 0.2), stroke: edge(c), sw: SW }) +
    R(40, 8, 16, 8, 3, { fill: '#c8d0da', stroke: '#7c8294', sw: 2 }) +
    P('M52 22L36 44H48L42 60L62 36H50L56 22Z', { fill: '#ffe066', stroke: '#c9a13d', sw: 2.2 }) +
    cells + shine(30, 26, 4, 10, 0)
  );
};

const it13: Draw = (sv) => {
  const b = '#b79cf0';
  return (
    R(34, 4, 28, 26, 6, { fill: grad(sv, b), stroke: edge(b), sw: SW }) + R(34, 66, 28, 26, 6, { fill: grad(sv, b), stroke: edge(b), sw: SW }) +
    R(24, 24, 48, 48, 14, { fill: sv.lin([[0, '#f4f6fa'], [1, '#c9ced8']]), stroke: '#7c8294', sw: SW }) +
    R(30, 30, 36, 36, 10, { fill: '#2f3a5a' }) +
    C(48, 48, 12, { fill: 'none', stroke: '#4a5a80', sw: 4 }) + P('M48 36A12 12 0 0 1 59 52', { fill: 'none', stroke: '#8fe0c0', sw: 4 }) +
    P('M48 48V40M48 48L53 51', { stroke: '#fff', sw: 2.2 }) +
    R(72, 40, 5, 10, 2, { fill: '#9aa3b2', stroke: '#7c8294', sw: 1.4 })
  );
};

const it14: Draw = (sv) => {
  const c = '#ff9f8a';
  return (
    E(48, 88, 20, 4, { fill: '#000', op: 0.1 }) +
    P('M28 26H68L64 82Q63 88 56 88H40Q33 88 32 82Z', { fill: sv.lin([[0, lighten(c, 0.3)], [0.5, c], [1, darken(c, 0.88)]], 0, 0, 1, 0), stroke: edge(c), sw: SW }) +
    R(30, 50, 36, 10, 0, { fill: '#fff', op: 0.35 }) +
    R(24, 12, 48, 16, 6, { fill: grad(sv, '#ffffff', 0), stroke: '#9aa3b2', sw: SW }) +
    R(40, 6, 16, 8, 3, { fill: '#ffffff', stroke: '#9aa3b2', sw: 2.4 }) +
    shine(38, 40, 3, 10, 4)
  );
};

const it15: Draw = (sv) => {
  const c = '#3d4f8a', g = '#ffd36b';
  const corner = (x: number, y: number, r: number) => P('M0 0H14L0 14Z', { fill: g, stroke: edge(g), sw: 1.8, tf: `translate(${x} ${y}) rotate(${r})` });
  return (
    R(12, 20, 72, 56, 8, { fill: sv.lin([[0, lighten(c, 0.3)], [1, c]]), stroke: edge(c), sw: SW }) +
    P('M48 20V76', { stroke: darken(c, 0.7), sw: 2.4 }) +
    R(18, 26, 60, 44, 5, { fill: 'none', stroke: lighten(c, 0.45), sw: 1.4, da: '3 3' }) +
    corner(12, 20, 0) + corner(84, 20, 90) + corner(84, 76, 180) + corner(12, 76, 270) +
    R(56, 34, 22, 14, 2, { fill: '#fff', stroke: '#c8d0da', sw: 1.2, tf: 'rotate(-6 67 41)' }) + R(57, 36, 5, 10, 1, { fill: '#ff7b5e', tf: 'rotate(-6 67 41)' }) +
    G(P(starPath(8), { fill: g, stroke: edge(g), sw: 1.4 }), { tf: 'translate(31 50)' })
  );
};

const it16: Draw = (sv) => {
  const g = '#ffd36b';
  return (
    R(8, 22, 80, 52, 8, { fill: sv.lin([[0, '#fff3b8'], [0.45, g], [1, '#e0a52a']], 0, 0, 1, 1), stroke: edge(g), sw: SW }) +
    R(18, 36, 18, 14, 3, { fill: sv.lin([[0, '#f4f6fa'], [1, '#c9ced8']]), stroke: '#8a7a50', sw: 1.8 }) + P('M18 43H36M27 36V50', { stroke: '#8a7a50', sw: 1.2 }) +
    R(18, 58, 40, 4, 2, { fill: '#b07d18', op: 0.5 }) + R(62, 58, 16, 4, 2, { fill: '#b07d18', op: 0.4 }) +
    P('M48 22L64 74M60 22L76 74', { stroke: '#fff', sw: 4, so: 0.45 }) +
    sparkle(80, 22, 9, '#fff6b0')
  );
};

const it17: Draw = (sv) => {
  return (
    R(24, 16, 52, 70, 4, { fill: '#e8eef5', stroke: '#8a95a8', sw: 2.4, tf: 'rotate(6 50 51)' }) +
    R(20, 12, 54, 72, 4, { fill: grad(sv, '#ffffff', 0), stroke: '#8a95a8', sw: SW }) +
    R(28, 22, 26, 5, 2.5, { fill: '#4aa3df' }) + R(28, 31, 36, 3.4, 1.7, { fill: '#c8d0da' }) +
    R(30, 60, 7, 14, 1.5, { fill: '#8fe0c0' }) + R(40, 52, 7, 22, 1.5, { fill: '#ffd36b' }) + R(50, 44, 7, 30, 1.5, { fill: '#ff8fab' }) + R(60, 38, 7, 36, 1.5, { fill: '#4aa3df' }) +
    P('M28 76H68', { stroke: '#8a95a8', sw: 2 }) +
    P('M40 6H56V20Q56 24 52 24H44Q40 24 40 20Z', { fill: '#4aa3df', stroke: '#2b6f9e', sw: 2.4 }) + R(44, 10, 8, 8, 2, { fill: '#fff', op: 0.8 })
  );
};

const it18: Draw = (sv) => {
  return (
    P('M30 6Q40 34 48 36Q56 34 66 6', { fill: 'none', stroke: '#e53935', sw: 6 }) + P('M30 6Q40 34 48 36Q56 34 66 6', { fill: 'none', stroke: '#ff6b6b', sw: 3 }) +
    R(42, 32, 12, 8, 2, { fill: '#c8d0da', stroke: '#7c8294', sw: 1.4 }) +
    R(22, 38, 52, 52, 7, { fill: grad(sv, '#ffffff', 0), stroke: '#8a95a8', sw: SW }) +
    R(28, 46, 22, 26, 4, { fill: '#cfe3f2', stroke: '#8fb3d6', sw: 1.6 }) + C(39, 54, 6, { fill: '#c89b6d' }) + P('M29 72Q30 62 39 62Q48 62 49 72Z', { fill: '#51639a' }) +
    face(39, 53.5, 0.42, 'idle', { blush: false, noShine: true }) +
    R(54, 50, 14, 4, 2, { fill: '#8a95a8' }) + R(54, 58, 12, 3, 1.5, { fill: '#c8d0da' }) + R(54, 64, 10, 3, 1.5, { fill: '#c8d0da' }) +
    R(28, 78, 40, 6, 3, { fill: '#ff6b6b' })
  );
};

const it19: Draw = (sv) => {
  const c = '#ffa24a';
  return (
    P('M20 40H34L66 20V76L34 58H20Q14 58 14 50V48Q14 40 20 40Z', { fill: sv.lin([[0, lighten(c, 0.35)], [1, c]]), stroke: edge(c), sw: SW }) +
    E(66, 48, 7, 28, { fill: darken(c, 0.85), stroke: edge(c), sw: SW }) +
    R(26, 56, 10, 22, 4, { fill: '#8a95a8', stroke: '#5d6878', sw: 2.2, tf: 'rotate(-10 31 67)' }) +
    P('M76 38Q82 48 76 58', { fill: 'none', stroke: '#ff7b5e', sw: 3.4 }) + P('M82 30Q92 48 82 66', { fill: 'none', stroke: '#ff7b5e', sw: 3.4, so: 0.8 }) + P('M88 22Q102 48 88 74', { fill: 'none', stroke: '#ff7b5e', sw: 3.4, so: 0.6 }) +
    R(18, 44, 10, 4, 2, { fill: '#fff', op: 0.6 })
  );
};

const it20: Draw = (sv) => {
  const c = '#8a6fd8', g = '#ffd36b';
  return (
    C(48, 50, 44, { fill: sv.rad([[0, '#fff6c8', 0.9], [0.5, '#ffe38a', 0.35], [1, '#ffe38a', 0]]) }) +
    R(22, 14, 54, 72, 7, { fill: sv.lin([[0, lighten(c, 0.3)], [1, c]], 0, 0, 1, 0.3), stroke: edge(c), sw: SW }) +
    R(26, 18, 46, 64, 5, { fill: 'none', stroke: g, sw: 2.6 }) +
    R(22, 14, 10, 72, 5, { fill: darken(c, 0.82) }) +
    G(P(starPath(12), { fill: sv.lin([[0, '#fff3b8'], [1, g]]), stroke: edge(g), sw: 2 }), { tf: 'translate(52 44)' }) +
    R(40, 64, 26, 4, 2, { fill: g }) +
    sparkle(80, 16, 8) + sparkle(16, 72, 6) + sparkle(82, 78, 5)
  );
};

const DRAW: Record<string, Draw> = { it01, it02, it03, it04, it05, it06, it07, it08, it09, it10, it11, it12, it13, it14, it15, it16, it17, it18, it19, it20 };

export function itemBody(id: string, pre: string): Body | null {
  const fn = DRAW[id];
  if (!fn) return null;
  const sv = new Svg(pre);
  sv.add(fn(sv));
  return { vb: [0, 0, 96, 96], body: sv.body() };
}
