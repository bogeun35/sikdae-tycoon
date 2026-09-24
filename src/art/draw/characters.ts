/**
 * 영업 대표 10종 × idle·cheer 초상 (256×256, 앵커 0.5,0.5).
 * 원작 고양이 선장 초상처럼 동그란 틀 안의 상반신. 정장 + 사원증·명함 등 소품. cheer = 두 팔 번쩍 + 활짝 입 + 반짝 2개.
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, face, lighten, mix, n2, sparkle, pPath, heartPath, INK, type Mood } from '../kit';

interface Look {
  fur: string;
  bg: string;
  suit: string;
  tie: string;
  shirt?: string;
}

const LOOK: Record<string, Look> = {
  bear: { fur: '#c89b6d', bg: '#d9ecff', suit: '#51639a', tie: '#4aa3df' },
  rabbit: { fur: '#efe3d3', bg: '#dff7ec', suit: '#f29bb0', tie: '#ffffff', shirt: '#fff6ea' },
  turtle: { fur: '#a8d88f', bg: '#fff1d2', suit: '#b98a5e', tie: '#ffd36b' },
  fox: { fur: '#f5a25d', bg: '#ece6ff', suit: '#3f4a6e', tie: '#9b7bd8' },
  squirrel: { fur: '#d9955a', bg: '#fff0dc', suit: '#6fae6a', tie: '#ffd36b' },
  penguin: { fur: '#4a5878', bg: '#dcf4ff', suit: '#8fb3d6', tie: '#ff7b5e' },
  dog: { fur: '#f2c27a', bg: '#ffe6ea', suit: '#6a7fb8', tie: '#ff6b6b' },
  hawk: { fur: '#b08a64', bg: '#e4ecff', suit: '#2b3f8a', tie: '#ffd36b' },
  raccoon: { fur: '#9a8a78', bg: '#ffeaf2', suit: '#7c6fb0', tie: '#ff8fab' },
  lion: { fur: '#f5c542', bg: '#fff3c8', suit: '#8a3a4a', tie: '#ffd36b' },
};

const HX = 128, HY = 114;

interface Ctx {
  sv: Svg;
  L: Look;
  cheer: boolean;
  line: string;
}

function head(c: Ctx, rx = 64, ry = 57, fill?: string): string {
  const f = fill ?? c.L.fur;
  return E(HX, HY, rx, ry, { fill: c.sv.rad([[0, lighten(f, 0.28)], [0.7, f], [1, darken(f, 0.9)]], 0.4, 0.35, 0.75), stroke: edge(f), sw: 4 });
}

function muzzle(c: Ctx, w = 30, h = 20, y = HY + 26, col?: string): string {
  return E(HX, y, w, h, { fill: col ?? lighten(c.L.fur, 0.6), stroke: mix(edge(c.L.fur), lighten(c.L.fur, 0.6), 0.55), sw: 2 });
}

function nose(y: number, w = 9, col = '#5a3a2a'): string {
  return E(HX, y, w, w * 0.66, { fill: col }) + E(HX - w * 0.3, y - w * 0.22, w * 0.3, w * 0.18, { fill: '#fff', op: 0.6 });
}

/** 정장 상반신 */
function body(c: Ctx, o: { vest?: boolean } = {}): string {
  const { sv, L } = c;
  const suit = sv.lin([[0, lighten(L.suit, 0.18)], [1, darken(L.suit, 0.85)]]);
  const sl = edge(L.suit);
  let s = P('M18 268Q22 204 72 188Q100 180 128 180Q156 180 184 188Q234 204 238 268Z', { fill: suit, stroke: sl, sw: 4 });
  s += P('M100 182L128 238L156 182Z', { fill: L.shirt ?? '#ffffff', stroke: mix(sl, '#fff', 0.4), sw: 2 });
  if (o.vest) {
    s += P('M96 186L128 250L160 186Q176 200 176 268H80Q80 200 96 186Z', { fill: darken(L.suit, 0.9), op: 0 });
  }
  // 넥타이
  s += P('M121 192H135L139 199L133 204H123L117 199Z', { fill: L.tie, stroke: edge(L.tie), sw: 1.6 });
  s += P('M123 204H133L138 238L128 250L118 238Z', { fill: sv.lin([[0, lighten(L.tie, 0.2)], [1, L.tie]]), stroke: edge(L.tie), sw: 1.6 });
  // 옷깃
  s += P('M100 182L114 212L104 216L86 190Z', { fill: lighten(L.suit, 0.28), stroke: sl, sw: 2 });
  s += P('M156 182L142 212L152 216L170 190Z', { fill: lighten(L.suit, 0.28), stroke: sl, sw: 2 });
  s += C(166, 234, 3, { fill: lighten(L.suit, 0.4) }) + C(166, 250, 3, { fill: lighten(L.suit, 0.4) });
  return s;
}

/** cheer 팔 (정장 소매 + 둥근 손) — 머리 뒤에 그림 */
function arms(c: Ctx, paw?: string): string {
  if (!c.cheer) return '';
  const { L } = c;
  const p = paw ?? L.fur;
  const sl = edge(L.suit);
  let s = '';
  for (const side of [-1, 1]) {
    const sx = HX + side * 62, sy = 206, hx = HX + side * 86, hy = 96;
    s += P(`M${sx} ${sy}Q${HX + side * 96} ${160} ${hx} ${hy + 14}`, { fill: 'none', stroke: sl, sw: 30 });
    s += P(`M${sx} ${sy}Q${HX + side * 96} ${160} ${hx} ${hy + 14}`, { fill: 'none', stroke: L.suit, sw: 23 });
    s += C(hx, hy, 16, { fill: lighten(p, 0.1), stroke: edge(p), sw: 3.5 });
    s += P(`M${hx - 8} ${hy - 6}q4 -4 8 0M${hx} ${hy - 7}q4 -4 8 0`, { fill: 'none', stroke: edge(p), sw: 2, so: 0.7 });
  }
  return s;
}

function cheerSparks(c: Ctx): string {
  if (!c.cheer) return '';
  return sparkle(44, 52, 16) + sparkle(214, 44, 12) + sparkle(222, 150, 8, '#ffb3c1');
}

/** 사원증 (목줄 + 카드 + 작은 콩눈 사진) */
function badge(x: number, y: number, s = 1, strap = '#ff5a5a'): string {
  return (
    P(`M${x - 22 * s} ${y - 54 * s}Q${x - 10 * s} ${y - 16 * s} ${x} ${y - 10 * s}Q${x + 10 * s} ${y - 16 * s} ${x + 22 * s} ${y - 54 * s}`, { fill: 'none', stroke: strap, sw: 4 * s }) +
    G(
      R(-15, -10, 30, 38, 5, { fill: '#ffffff', stroke: '#8a95a8', sw: 1.8 }) +
        R(-10, -4, 12, 14, 3, { fill: '#cfe3f2' }) +
        C(-6.5, 1, 1.1, { fill: INK }) + C(-2.5, 1, 1.1, { fill: INK }) +
        R(5, -2, 7, 2.4, 1, { fill: '#8a95a8' }) + R(5, 3, 7, 2.4, 1, { fill: '#c8d0da' }) +
        R(-10, 16, 20, 3, 1.5, { fill: strap, op: 0.8 }) + R(-10, 21, 14, 2.4, 1.2, { fill: '#c8d0da' }),
      { tf: `translate(${n2(x)} ${n2(y)}) scale(${n2(s)})` },
    )
  );
}

/** 명함 한 장 */
function card(x: number, y: number, rot: number, s = 1): string {
  return G(
    R(-18, -11, 36, 22, 3, { fill: '#ffffff', stroke: '#9aa3b2', sw: 1.6 }) + R(-18, -11, 8, 22, 3, { fill: '#ff7b5e' }) + R(-6, -5, 18, 3, 1.5, { fill: '#8a95a8' }) + R(-6, 1, 12, 2.4, 1.2, { fill: '#c8d0da' }),
    { tf: `translate(${n2(x)} ${n2(y)}) rotate(${rot}) scale(${n2(s)})` },
  );
}

function hand(c: Ctx, x: number, y: number, col?: string): string {
  const f = col ?? c.L.fur;
  return C(x, y, 13, { fill: lighten(f, 0.1), stroke: edge(f), sw: 3 });
}

function mood(c: Ctx): Mood {
  return c.cheer ? 'happy' : 'idle';
}

/* ───────── 동물별 ───────── */

type Draw = (c: Ctx) => string;

const bear: Draw = (c) => {
  const f = c.L.fur;
  let s = arms(c) + body(c);
  s += badge(150, 222, 1);
  s += C(78, 70, 20, { fill: f, stroke: edge(f), sw: 4 }) + C(78, 70, 11, { fill: lighten(f, 0.45) });
  s += C(178, 70, 20, { fill: f, stroke: edge(f), sw: 4 }) + C(178, 70, 11, { fill: lighten(f, 0.45) });
  s += head(c) + muzzle(c, 28, 20);
  s += face(HX, HY + 2, 3.8, mood(c), { gap: 1.05 });
  s += nose(HY + 20, 8.5);
  if (!c.cheer) s += hand(c, 96, 238) + card(96, 224, -14, 0.95);
  return s;
};

const rabbit: Draw = (c) => {
  const f = c.L.fur;
  let s = arms(c) + body(c);
  for (const side of [-1, 1]) {
    const x = HX + side * 30;
    s += E(x, 44, 17, 44, { fill: f, stroke: edge(f), sw: 4, tf: `rotate(${side * 10} ${x} 88)` }) + E(x, 48, 8, 32, { fill: '#ffb3c1', op: 0.9, tf: `rotate(${side * 10} ${x} 88)` });
  }
  s += head(c, 62, 56) + muzzle(c, 22, 15, HY + 26);
  s += P(`M${HX - 58} ${HY - 30}Q${HX} ${HY - 60} ${HX + 58} ${HY - 30}`, { fill: 'none', stroke: edge('#8fe0c0'), sw: 16 }) + P(`M${HX - 58} ${HY - 30}Q${HX} ${HY - 60} ${HX + 58} ${HY - 30}`, { fill: 'none', stroke: '#8fe0c0', sw: 11 });
  s += P(`M${HX - 40} ${HY - 42}Q${HX} ${HY - 58} ${HX + 40} ${HY - 42}`, { fill: 'none', stroke: '#fff', sw: 2.4, so: 0.8 });
  s += face(HX, HY + 4, 3.7, mood(c));
  s += nose(HY + 21, 7, '#ff8fab');
  s += R(HX - 5, HY + 33, 10, 7, 2, { fill: '#fff', stroke: '#c9bba8', sw: 1.2 });
  if (!c.cheer) s += hand(c, 162, 238) + card(162, 222, 12);
  return s;
};

const turtle: Draw = (c) => {
  const f = c.L.fur;
  let s = arms(c) + body(c);
  s += head(c, 64, 56) + muzzle(c, 30, 17, HY + 28, lighten(f, 0.5));
  // 등껍질 무늬 모자
  const hat = '#6fae6a';
  s += P(`M${HX - 66} ${HY - 22}Q${HX - 62} ${HY - 82} ${HX} ${HY - 84}Q${HX + 62} ${HY - 82} ${HX + 66} ${HY - 22}Z`, { fill: c.sv.lin([[0, lighten(hat, 0.3)], [1, hat]]), stroke: edge(hat), sw: 4 });
  s += R(HX - 72, HY - 30, 144, 14, 7, { fill: darken(hat, 0.88), stroke: edge(hat), sw: 3 });
  const hex = (x: number, y: number, r: number) => PL([x - r, y, x - r / 2, y - r * 0.85, x + r / 2, y - r * 0.85, x + r, y, x + r / 2, y + r * 0.85, x - r / 2, y + r * 0.85], { fill: lighten(hat, 0.45), stroke: edge(hat), sw: 2 });
  s += hex(HX, HY - 58, 14) + hex(HX - 32, HY - 46, 11) + hex(HX + 32, HY - 46, 11);
  s += face(HX, HY + 6, 3.6, mood(c));
  // 금테 안경
  const g = '#e0a52a';
  s += C(HX - 25, HY + 6, 18, { fill: '#fff', fo: 0.25, stroke: g, sw: 3.6 }) + C(HX + 25, HY + 6, 18, { fill: '#fff', fo: 0.25, stroke: g, sw: 3.6 }) + P(`M${HX - 7} ${HY + 4}Q${HX} ${HY - 1} ${HX + 7} ${HY + 4}`, { fill: 'none', stroke: g, sw: 3 });
  s += P(`M${HX - 43} ${HY + 2}L${HX - 62} ${HY - 4}M${HX + 43} ${HY + 2}L${HX + 62} ${HY - 4}`, { stroke: g, sw: 3 });
  if (!c.cheer) s += hand(c, 96, 238) + card(96, 222, -10);
  return s;
};

const fox: Draw = (c) => {
  const f = c.L.fur;
  let s = arms(c) + body(c);
  for (const side of [-1, 1]) {
    const bx = HX + side * 44;
    s += P(`M${bx - side * 22} ${HY - 34}L${bx + side * 16} ${HY - 102}L${bx + side * 30} ${HY - 22}Z`, { fill: f, stroke: edge(f), sw: 4 });
    s += P(`M${bx - side * 8} ${HY - 38}L${bx + side * 14} ${HY - 86}L${bx + side * 22} ${HY - 34}Z`, { fill: '#ffe8d6' });
    s += P(`M${bx + side * 8} ${HY - 80}L${bx + side * 16} ${HY - 102}L${bx + side * 22} ${HY - 78}Z`, { fill: darken(f, 0.55) });
  }
  s += head(c, 64, 55);
  // 흰 볼털
  s += P(`M${HX - 62} ${HY + 8}Q${HX - 50} ${HY + 52} ${HX} ${HY + 54}Q${HX + 50} ${HY + 52} ${HX + 62} ${HY + 8}Q${HX + 36} ${HY + 24} ${HX} ${HY + 18}Q${HX - 36} ${HY + 24} ${HX - 62} ${HY + 8}Z`, { fill: '#fffaf4', stroke: mix(edge(f), '#fff', 0.5), sw: 2 });
  s += face(HX, HY + 2, 3.6, mood(c));
  s += nose(HY + 20, 8, '#3a2a2a');
  // 보라 헤드셋
  const hs = '#6f5fa8';
  s += P(`M${HX - 64} ${HY - 6}Q${HX - 66} ${HY - 74} ${HX} ${HY - 76}Q${HX + 66} ${HY - 74} ${HX + 64} ${HY - 6}`, { fill: 'none', stroke: edge(hs), sw: 12 }) + P(`M${HX - 64} ${HY - 6}Q${HX - 66} ${HY - 74} ${HX} ${HY - 76}Q${HX + 66} ${HY - 74} ${HX + 64} ${HY - 6}`, { fill: 'none', stroke: hs, sw: 8 });
  s += R(HX - 76, HY - 18, 22, 34, 10, { fill: c.sv.lin([[0, lighten(hs, 0.35)], [1, hs]]), stroke: edge(hs), sw: 3 }) + R(HX + 54, HY - 18, 22, 34, 10, { fill: c.sv.lin([[0, lighten(hs, 0.35)], [1, hs]]), stroke: edge(hs), sw: 3 });
  s += P(`M${HX - 64} ${HY + 10}Q${HX - 58} ${HY + 44} ${HX - 26} ${HY + 44}`, { fill: 'none', stroke: hs, sw: 3.4 }) + C(HX - 24, HY + 44, 5, { fill: '#8fe0c0', stroke: edge(hs), sw: 2 });
  if (!c.cheer) s += hand(c, 162, 238) + card(162, 222, 10);
  return s;
};

const squirrel: Draw = (c) => {
  const f = c.L.fur;
  // 꼬리 (등 뒤)
  let s = P('M196 250Q252 220 238 150Q226 96 188 110Q214 134 204 170Q196 200 172 212Z', { fill: c.sv.lin([[0, lighten(f, 0.25)], [1, f]]), stroke: edge(f), sw: 4 });
  s += P('M206 140Q222 160 214 190', { fill: 'none', stroke: lighten(f, 0.5), sw: 5, so: 0.8 });
  s += arms(c) + body(c);
  s += E(HX - 46, HY - 48, 13, 18, { fill: f, stroke: edge(f), sw: 4 }) + E(HX + 46, HY - 48, 13, 18, { fill: f, stroke: edge(f), sw: 4 });
  s += head(c, 62, 56);
  // 빵빵 볼
  s += E(HX - 40, HY + 26, 24, 20, { fill: lighten(f, 0.55), stroke: mix(edge(f), '#fff', 0.4), sw: 2 }) + E(HX + 40, HY + 26, 24, 20, { fill: lighten(f, 0.55), stroke: mix(edge(f), '#fff', 0.4), sw: 2 });
  s += E(HX, HY + 28, 16, 12, { fill: lighten(f, 0.62) });
  s += face(HX, HY, 3.5, mood(c), { gap: 1.1 });
  s += nose(HY + 18, 7, '#6a3a2a');
  // 도토리 모자 + P 코인
  const gold = '#ffd36b';
  s += P(`M${HX - 50} ${HY - 34}Q${HX - 48} ${HY - 80} ${HX} ${HY - 82}Q${HX + 48} ${HY - 80} ${HX + 50} ${HY - 34}Z`, { fill: c.sv.lin([[0, '#fff0b0'], [1, gold]]), stroke: edge(gold), sw: 4 });
  for (let i = 0; i < 5; i++) s += P(`M${HX - 40 + i * 20} ${HY - 38}l8 -12l8 12`, { fill: 'none', stroke: darken(gold, 0.8), sw: 2, so: 0.7 });
  s += P(`M${HX} ${HY - 82}q2 -10 10 -12`, { fill: 'none', stroke: '#8a5a3a', sw: 5 });
  s += C(HX, HY - 58, 13, { fill: gold, stroke: edge(gold), sw: 3 }) + G(P(pPath(7), { fill: 'none', stroke: '#fff', sw: 3.4 }), { tf: `translate(${HX} ${HY - 58})` });
  if (!c.cheer) s += hand(c, 96, 238) + card(96, 222, -12);
  return s;
};

const penguin: Draw = (c) => {
  const f = c.L.fur;
  let s = arms(c, f) + body(c);
  // 인턴 명찰
  s += R(150, 206, 36, 22, 4, { fill: '#fff', stroke: '#8a95a8', sw: 2 }) + R(150, 206, 36, 7, 3, { fill: '#ff7b5e' }) + R(156, 214, 20, 3, 1.5, { fill: '#8a95a8' }) + R(156, 220, 14, 3, 1.5, { fill: '#c8d0da' });
  s += head(c, 64, 58);
  s += P(`M${HX} ${HY - 36}Q${HX - 18} ${HY - 50} ${HX - 38} ${HY - 38}Q${HX - 62} ${HY - 18} ${HX - 50} ${HY + 20}Q${HX - 36} ${HY + 52} ${HX} ${HY + 52}Q${HX + 36} ${HY + 52} ${HX + 50} ${HY + 20}Q${HX + 62} ${HY - 18} ${HX + 38} ${HY - 38}Q${HX + 18} ${HY - 50} ${HX} ${HY - 36}Z`, { fill: '#ffffff', stroke: '#c8d0e0', sw: 2 });
  s += face(HX, HY + 4, 3.6, mood(c), { mouth: 'beak' });
  // 민트 비니 + 흰 방울
  const b = '#8fe0c0';
  s += P(`M${HX - 62} ${HY - 22}Q${HX - 60} ${HY - 88} ${HX} ${HY - 88}Q${HX + 60} ${HY - 88} ${HX + 62} ${HY - 22}Z`, { fill: c.sv.lin([[0, lighten(b, 0.3)], [1, b]]), stroke: edge(b), sw: 4 });
  s += R(HX - 66, HY - 34, 132, 18, 9, { fill: darken(b, 0.9), stroke: edge(b), sw: 3 });
  for (let i = 0; i < 9; i++) s += P(`M${HX - 56 + i * 14} ${HY - 32}v14`, { stroke: darken(b, 0.75), sw: 2, so: 0.6 });
  s += C(HX, HY - 92, 13, { fill: '#fff', stroke: '#c8d0e0', sw: 3 });
  if (!c.cheer) s += hand(c, 96, 238, f) + card(96, 222, -10);
  return s;
};

const dog: Draw = (c) => {
  const ear = '#d9a45a';
  let s = arms(c) + body(c);
  // 반다나
  s += P('M84 186Q128 206 172 186L160 206Q128 236 96 206Z', { fill: c.sv.lin([[0, '#ff8a8a'], [1, '#ff6b6b']]), stroke: edge('#ff6b6b'), sw: 3 }) + C(108, 200, 2.4, { fill: '#fff' }) + C(128, 214, 2.4, { fill: '#fff' }) + C(148, 200, 2.4, { fill: '#fff' });
  s += head(c, 62, 56);
  s += E(HX - 60, HY + 10, 20, 38, { fill: c.sv.lin([[0, ear], [1, darken(ear, 0.88)]]), stroke: edge(ear), sw: 4, tf: `rotate(18 ${HX - 60} ${HY + 10})` });
  s += E(HX + 60, HY + 10, 20, 38, { fill: c.sv.lin([[0, ear], [1, darken(ear, 0.88)]]), stroke: edge(ear), sw: 4, tf: `rotate(-18 ${HX + 60} ${HY + 10})` });
  s += muzzle(c, 32, 22, HY + 28);
  s += face(HX, HY, 3.6, mood(c));
  s += nose(HY + 20, 10, '#4a3028');
  if (!c.cheer) s += card(HX + 18, HY + 46, 8, 1.05);
  else s += card(HX + 86, 80, -16, 1);
  return s;
};

const hawk: Draw = (c) => {
  const f = c.L.fur;
  const L = c.L;
  let s = arms(c, '#e8d6c0');
  // 남색 조끼 몸 (셔츠 위 조끼)
  const sl = edge(L.suit);
  s += P('M18 268Q22 204 72 188Q100 180 128 180Q156 180 184 188Q234 204 238 268Z', { fill: '#fdf8f0', stroke: mix(edge(f), '#fff', 0.3), sw: 4 });
  s += P('M60 268Q60 210 92 190L128 244L164 190Q196 210 196 268Z', { fill: c.sv.lin([[0, lighten(L.suit, 0.2)], [1, L.suit]]), stroke: sl, sw: 3.5 });
  s += P('M121 196H135L137 204H119Z', { fill: '#4a5f9a', stroke: sl, sw: 1.4 }) + P('M120 204H136L132 236L128 244L124 236Z', { fill: '#4a5f9a', stroke: sl, sw: 1.4 });
  s += R(114, 214, 28, 5, 2.5, { fill: L.tie, stroke: edge(L.tie), sw: 1.4 });
  s += C(106, 236, 3.2, { fill: '#ffd36b' }) + C(150, 236, 3.2, { fill: '#ffd36b' });
  // 머리 깃
  s += P(`M${HX - 20} ${HY - 50}Q${HX - 8} ${HY - 86} ${HX + 14} ${HY - 76}Q${HX + 4} ${HY - 66} ${HX + 10} ${HY - 54}`, { fill: darken(f, 0.9), stroke: edge(f), sw: 3 });
  s += head(c, 62, 57);
  s += P(`M${HX - 50} ${HY + 4}Q${HX - 42} ${HY + 54} ${HX} ${HY + 56}Q${HX + 42} ${HY + 54} ${HX + 50} ${HY + 4}Q${HX + 24} ${HY + 18} ${HX} ${HY + 14}Q${HX - 24} ${HY + 18} ${HX - 50} ${HY + 4}Z`, { fill: '#fffaf2', stroke: mix(edge(f), '#fff', 0.4), sw: 2 });
  // 눈썹 깃
  s += P(`M${HX - 44} ${HY - 18}Q${HX - 26} ${HY - 28} ${HX - 10} ${HY - 18}`, { fill: 'none', stroke: darken(f, 0.6), sw: 5 }) + P(`M${HX + 44} ${HY - 18}Q${HX + 26} ${HY - 28} ${HX + 10} ${HY - 18}`, { fill: 'none', stroke: darken(f, 0.6), sw: 5 });
  s += face(HX, HY, 3.6, mood(c), { mouth: 'none' });
  s += P(`M${HX - 14} ${HY + 12}Q${HX} ${HY + 4} ${HX + 14} ${HY + 12}Q${HX + 12} ${HY + 26} ${HX + 2} ${HY + 36}Q${HX + 4} ${HY + 26} ${HX - 2} ${HY + 24}Q${HX - 12} ${HY + 22} ${HX - 14} ${HY + 12}Z`, { fill: c.sv.lin([[0, '#ffe08a'], [1, '#f5b33a']]), stroke: '#b07d18', sw: 2.4 });
  if (c.cheer) s += P(`M${HX - 10} ${HY + 26}Q${HX} ${HY + 34} ${HX + 8} ${HY + 26}`, { fill: '#ff8fa3', stroke: INK, sw: 1.6 });
  return s;
};

const raccoon: Draw = (c) => {
  const f = c.L.fur;
  // 등에 멘 분홍 보따리
  let s = C(196, 176, 44, { fill: c.sv.rad([[0, '#ffd6e2'], [1, '#ff9fbb']], 0.4, 0.35, 0.7), stroke: edge('#ff9fbb'), sw: 4 });
  s += C(206, 162, 4, { fill: '#fff', op: 0.8 }) + C(186, 196, 3.5, { fill: '#fff', op: 0.8 }) + C(214, 190, 3, { fill: '#fff', op: 0.8 });
  s += arms(c) + body(c);
  s += P('M160 188Q176 150 206 138', { fill: 'none', stroke: '#ff8fab', sw: 9 });
  s += P('M198 134Q214 116 222 132Q210 140 198 134ZM198 134Q190 114 206 112Q206 126 198 134Z', { fill: '#ff8fab', stroke: edge('#ff8fab'), sw: 2.4 });
  s += E(HX - 48, HY - 42, 18, 18, { fill: f, stroke: edge(f), sw: 4 }) + E(HX - 48, HY - 42, 9, 9, { fill: '#4a3a3a' });
  s += E(HX + 48, HY - 42, 18, 18, { fill: f, stroke: edge(f), sw: 4 }) + E(HX + 48, HY - 42, 9, 9, { fill: '#4a3a3a' });
  s += head(c, 64, 56);
  s += P(`M${HX - 56} ${HY + 6}Q${HX - 50} ${HY - 22} ${HX - 20} ${HY - 18}Q${HX - 6} ${HY - 8} ${HX - 8} ${HY + 12}Q${HX - 30} ${HY + 30} ${HX - 56} ${HY + 6}Z`, { fill: '#4a3a3a' });
  s += P(`M${HX + 56} ${HY + 6}Q${HX + 50} ${HY - 22} ${HX + 20} ${HY - 18}Q${HX + 6} ${HY - 8} ${HX + 8} ${HY + 12}Q${HX + 30} ${HY + 30} ${HX + 56} ${HY + 6}Z`, { fill: '#4a3a3a' });
  s += muzzle(c, 26, 18, HY + 28, '#f6efe6');
  // 눈 흰 바탕 (검은 무늬 위에서도 콩눈이 보이게)
  s += E(HX - 23.4, HY - 1, 13, 17, { fill: '#fffaf2' }) + E(HX + 23.4, HY - 1, 13, 17, { fill: '#fffaf2' });
  s += face(HX, HY, 3.6, mood(c), { ink: '#1a1410' });
  s += nose(HY + 20, 8, '#2a1a1a');
  if (!c.cheer) s += hand(c, 96, 238) + card(96, 222, -12);
  return s;
};

const lion: Draw = (c) => {
  const f = c.L.fur;
  const mane = '#d98a2b';
  let s = '';
  // 갈기
  let d = '';
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 78 : 92;
    d += (i ? 'L' : 'M') + n2(HX + Math.cos(a) * r) + ' ' + n2(HY + 6 + Math.sin(a) * r * 0.92);
  }
  s += arms(c) + body(c);
  s += P(d + 'Z', { fill: c.sv.rad([[0, lighten(mane, 0.2)], [1, mane]], 0.5, 0.45, 0.6), stroke: edge(mane), sw: 4, lj: 'round' });
  s += C(HX - 52, HY - 44, 14, { fill: f, stroke: edge(f), sw: 3.5 }) + C(HX + 52, HY - 44, 14, { fill: f, stroke: edge(f), sw: 3.5 });
  s += head(c, 60, 55) + muzzle(c, 28, 18, HY + 28);
  s += face(HX, HY + 2, 3.5, mood(c));
  s += nose(HY + 20, 9, '#8a4a2a');
  const g = '#e0a52a';
  s += C(HX - 24, HY + 2, 17, { fill: '#fff', fo: 0.22, stroke: g, sw: 3.4 }) + C(HX + 24, HY + 2, 17, { fill: '#fff', fo: 0.22, stroke: g, sw: 3.4 }) + P(`M${HX - 7} ${HY}Q${HX} ${HY - 5} ${HX + 7} ${HY}`, { fill: 'none', stroke: g, sw: 3 });
  // 금관
  s += G(
    P('M-26 0L-30 -30L-14 -14L0 -36L14 -14L30 -30L26 0Z', { fill: c.sv.lin([[0, '#fff3b8'], [1, '#f0b429']]), stroke: '#a8791a', sw: 3 }) +
      R(-28, -4, 56, 9, 4, { fill: '#f0b429', stroke: '#a8791a', sw: 2.6 }) +
      C(0, -36, 4, { fill: '#fff6c8', stroke: '#a8791a', sw: 2 }) + C(0, -12, 4.4, { fill: '#ff8fab', stroke: '#a8791a', sw: 1.6 }) + C(-16, -9, 3, { fill: '#8fd3ff' }) + C(16, -9, 3, { fill: '#8fe0c0' }),
    { tf: `translate(${HX} ${HY - 50})` },
  );
  if (!c.cheer) s += hand(c, 162, 238) + card(162, 222, 12);
  return s;
};

const DRAW: Record<string, Draw> = { bear, rabbit, turtle, fox, squirrel, penguin, dog, hawk, raccoon, lion };

/** 틀·배경 없이 캐릭터 몸만 (256 좌표). 로고 등 다른 그림에 얹을 때 */
export function charFigure(id: string, st: string, sv: Svg): string {
  const L = LOOK[id];
  const fn = DRAW[id];
  if (!L || !fn) return '';
  return fn({ sv, L, cheer: st === 'cheer', line: edge(L.fur) });
}

export function charBody(id: string, st: string, pre: string): Body | null {
  const L = LOOK[id];
  const fn = DRAW[id];
  if (!L || !fn) return null;
  const sv = new Svg(pre);
  const c: Ctx = { sv, L, cheer: st === 'cheer', line: edge(L.fur) };
  const clip = sv.clip(C(128, 128, 124));
  const bg = sv.rad([[0, '#ffffff'], [0.55, lighten(L.bg, 0.3)], [1, L.bg]], 0.5, 0.38, 0.62);
  let dots = '';
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3;
    dots += C(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98 - 10, 4 + (i % 3), { fill: '#fff', op: 0.55 });
  }
  sv.add(G(C(128, 128, 124, { fill: bg }) + dots + fn(c), { cp: clip }));
  sv.add(cheerSparks(c));
  void heartPath;
  return { vb: [0, 0, 256, 256], body: sv.body() };
}
