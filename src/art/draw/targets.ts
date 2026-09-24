/**
 * 영업 대상 21종 × 상태 (idle · hit · happy · blink, 이동형은 up · down 추가).
 * viewBox 0 0 240 240, 앵커 (0.5, 0.8) = (120, 192) = 부지 중심. 몸통은 앵커 위로 솟고 앞면 바닥은 앵커 조금 아래.
 * idle·hit·happy 옆모습은 왼쪽을 봄(이동형). 오른쪽은 엔진이 scale.x = −1.
 * 모든 상태의 외곽 모양은 같다(텍스처를 바꿔도 튀지 않게). 달라지는 것은 얼굴·땀·반짝이뿐.
 */
import {
  C, E, G, P, PL, R, Svg, darken, edge, face, lighten, mix, n2, rTop, roundPoly, sparkle, sweat, starPath, ticketPath, wonPath, hPath, heartPath, type Mood,
} from '../kit';
import { acUnit, awning, box, cylinder, door, facePanel, glassWall, happySpark, makeCtx, plant, puff, steam, wheel, win, winGrid, type TCtx } from './build';

type Draw = (t: TCtx, st: string) => void;

/* ───────── 작은 소품 ───────── */

function burger(t: TCtx, cx: number, cy: number, s: number): string {
  const sw = t.sw * 0.55;
  const bun = '#f5b35c', bunL = edge('#f5b35c');
  return G(
    P('M-22 6Q-22 14 -14 14H14Q22 14 22 6Z', { fill: bun, stroke: bunL, sw }) +
      R(-23, -1, 46, 8, 4, { fill: '#8a5236', stroke: '#5e3522', sw }) +
      P('M-24 -2L-16 3L-10 -2L-2 4L6 -2L14 3L24 -2V-5H-24Z', { fill: '#ffd34d', stroke: '#c9a13d', sw: sw * 0.8 }) +
      P('M-25 -5Q-20 -1 -15 -5Q-10 -1 -5 -5Q0 -1 5 -5Q10 -1 15 -5Q20 -1 25 -5V-8H-25Z', { fill: '#8fd07e', stroke: '#4f9e4a', sw: sw * 0.8 }) +
      P('M-23 -7Q-23 -26 0 -26Q23 -26 23 -7Z', { fill: t.sv.lin([[0, '#ffd08a'], [1, bun]]), stroke: bunL, sw }) +
      E(-9, -18, 1.8, 1.1, { fill: '#fff8e0' }) + E(0, -21, 1.8, 1.1, { fill: '#fff8e0' }) + E(9, -17, 1.8, 1.1, { fill: '#fff8e0' }) + E(-3, -13, 1.8, 1.1, { fill: '#fff8e0' }) + E(12, -11, 1.6, 1, { fill: '#fff8e0' }) +
      P('M-15 -19Q-12 -23 -6 -23', { fill: 'none', stroke: '#fff', sw: 2.4, so: 0.7 }),
    { tf: `translate(${n2(cx)} ${n2(cy)}) scale(${n2(s)})` },
  );
}

function crownShape(t: TCtx, cx: number, by: number, s: number, gem = '#ff8fab'): string {
  const sw = t.sw * 0.6;
  return G(
    P('M-16 0L-19 -18L-9 -9L0 -22L9 -9L19 -18L16 0Z', { fill: t.sv.lin([[0, '#fff0a8'], [1, '#f0b429']]), stroke: '#b07d18', sw }) +
      R(-17, -3, 34, 6, 2, { fill: '#f0b429', stroke: '#b07d18', sw: sw * 0.8 }) +
      C(0, -22, 2.6, { fill: '#fff6c8', stroke: '#b07d18', sw: sw * 0.6 }) + C(-19, -18, 2.2, { fill: '#fff6c8', stroke: '#b07d18', sw: sw * 0.6 }) + C(19, -18, 2.2, { fill: '#fff6c8', stroke: '#b07d18', sw: sw * 0.6 }) +
      C(0, -7, 3, { fill: gem, stroke: '#b07d18', sw: sw * 0.5 }) + C(-9, -5, 2.2, { fill: '#8fd3ff', stroke: '#b07d18', sw: sw * 0.5 }) + C(9, -5, 2.2, { fill: '#8fe0c0', stroke: '#b07d18', sw: sw * 0.5 }),
    { tf: `translate(${n2(cx)} ${n2(by)}) scale(${n2(s)})` },
  );
}

function kimbap(cx: number, cy: number, r: number): string {
  return (
    C(cx, cy, r, { fill: '#2f3d2f', stroke: '#1f281f', sw: 0.8 }) +
    C(cx, cy, r * 0.78, { fill: '#fffdf6' }) +
    C(cx, cy, r * 0.26, { fill: '#ffd34d' }) +
    C(cx - r * 0.36, cy - r * 0.22, r * 0.18, { fill: '#ff9f43' }) +
    C(cx + r * 0.36, cy - r * 0.18, r * 0.18, { fill: '#6cc46c' }) +
    C(cx, cy + r * 0.42, r * 0.17, { fill: '#ff8fab' }) +
    C(cx + r * 0.3, cy + r * 0.3, r * 0.14, { fill: '#8a5236' })
  );
}

function riceBowl(cx: number, cy: number, s: number, col = '#ffffff'): string {
  return G(
    P('M-12 0Q-12 11 0 11Q12 11 12 0Z', { fill: col, stroke: '#8f7a66', sw: 1.2 }) +
      R(-5, 10, 10, 3, 1.5, { fill: col, stroke: '#8f7a66', sw: 1 }) +
      P('M-11 0Q-10 -9 0 -9Q10 -9 11 0Z', { fill: '#fffdf6', stroke: '#c9bba8', sw: 1 }) +
      P('M-7 5H7', { stroke: '#7fb0d8', sw: 1.6 }),
    { tf: `translate(${n2(cx)} ${n2(cy)}) scale(${n2(s)})` },
  );
}

/* ───────── 기업 ───────── */

/*
 * 소형 기업(1인 사무실~IT기업)도 중견기업 이상처럼 3/4 시점(앞면 + 윗면 + 오른쪽 옆면, k > 0).
 * 창·문·얼굴은 앞면(y ~ y+h)에만, 화분·로켓·간판은 지붕(윗면) 위에 올린다.
 */
/** 1인 사무실 */
const c01: Draw = (t) => {
  const { sv } = t;
  const b = box(t, { x: 50, y: 112, w: 128, h: 96, d: 34, k: 14, r: 14 });
  const [px, py] = b.rp(0.74, 0.42);
  sv.add(plant(t, px, py + 6, 1.3));
  sv.add(win(t, 62, 124, 46, 30, { glass: ['#ffffff', '#b9e0fb'], r: 7 }));
  sv.add(P('M68 150L78 130', { stroke: '#fff', sw: 3, so: 0.7 }));
  sv.add(door(t, 142, 160, 30, 48, t.acc, { glass: true }));
  sv.add(R(60, 160, 30, 5, 2.5, { fill: t.acc, op: 0.8 }));
  sv.add(face(100, 182, 2.3, t.m));
  sv.add(happySpark(t, 190, 70, 13));
};

/** 스타트업 */
const c02: Draw = (t) => {
  const { sv } = t;
  box(t, { x: 52, y: 112, w: 128, h: 96, d: 34, k: 14, r: 12 });
  // 로켓 안테나(지붕 위)
  sv.add(P('M150 104Q150 108 138 110Q150 116 162 110Q150 108 150 104Z', { fill: '#fff', op: 0.8 }));
  sv.add(puff(150, 106, 7, 0.85));
  sv.add(P('M150 50V40', { stroke: '#8a8aa0', sw: 2.2 }) + C(150, 38, 3, { fill: '#ff6b6b', stroke: '#b84a4a', sw: 1 }));
  sv.add(P('M140 92L132 104L141 101Z', { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.5 }) + P('M160 92L168 104L159 101Z', { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.5 }));
  sv.add(P('M150 50Q162 62 161 86Q160 98 150 100Q140 98 139 86Q138 62 150 50Z', { fill: sv.lin([[0, '#ffffff'], [1, '#dfe6ee']], 0, 0, 1, 0), stroke: '#8a95a8', sw: t.sw * 0.6 }));
  sv.add(P('M150 50Q158 57 160 66H140Q142 57 150 50Z', { fill: '#ff7b7b', stroke: '#b84a4a', sw: t.sw * 0.5 }));
  sv.add(C(150, 78, 5.2, { fill: '#8fd3ff', stroke: '#4a7fae', sw: t.sw * 0.5 }) + C(148.5, 76.5, 1.6, { fill: '#fff' }));
  // 창 4개 (2층)
  sv.add(winGrid(t, 60, 122, 4, 1, 22, 24, 7.3, 0));
  sv.add(R(52, 156, 128, 4, 0, { fill: darken(t.c, 0.8), op: 0.35 }));
  sv.add(door(t, 142, 166, 30, 42, t.acc, { glass: true }));
  sv.add(face(102, 182, 2.15, t.m));
  sv.add(happySpark(t, 188, 70, 12));
};

/** 중소기업 (4층) */
const c03: Draw = (t) => {
  const { sv } = t;
  const b = box(t, { x: 46, y: 100, w: 140, h: 108, d: 30, k: 14, r: 12 });
  const [ax, ay] = b.rp(0.24, 0.5);
  const [bx, by] = b.rp(0.72, 0.56);
  sv.add(acUnit(t, ax, ay, 1.3), acUnit(t, bx, by, 1.3));
  for (const x0 of [54, 146]) {
    for (let r = 0; r < 3; r++) sv.add(win(t, x0, 108 + r * 23, 32, 15, { r: 3, shine: r !== 1 }), P(`M${x0 + 16} ${108 + r * 23}v15`, { stroke: edge(t.c), sw: t.sw * 0.45 }));
    sv.add(win(t, x0, 178, 32, 22, { r: 3 }));
  }
  for (let r = 0; r < 4; r++) sv.add(R(46, 103 + r * 23 + 21, 140, 2.5, 0, { fill: darken(t.c, 0.8), op: 0.35 }));
  sv.add(R(88, 106, 56, 62, 8, { fill: lighten(t.c, 0.35), stroke: mix(edge(t.c), '#fff', 0.2), sw: t.sw * 0.5 }));
  sv.add(face(116, 132, 2.25, t.m));
  sv.add(R(94, 170, 44, 5, 2, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.4 }));
  sv.add(door(t, 100, 176, 32, 32, t.acc, { glass: true, double: true }));
  sv.add(happySpark(t, 190, 52, 13));
};

/** IT기업 (유리 커튼월 5층) */
const c04: Draw = (t) => {
  const { sv } = t;
  box(t, { x: 50, y: 98, w: 132, h: 110, d: 30, k: 14, r: 12 });
  sv.add(glassWall(t, 58, 104, 116, 98, { top: '#f6f3ff', bot: '#b3a6f2', cols: 6, rows: 5, refl: 2, rx: 4 }));
  // 옥상 노트북 로고판(지붕 위)
  sv.add(P('M96 90L152 90L160 97L88 97Z', { fill: sv.lin([[0, '#f4f5f8'], [1, '#c8ccd6']]), stroke: '#7c8294', sw: t.sw * 0.6 }));
  sv.add(R(98, 52, 52, 38, 6, { fill: sv.lin([[0, '#eef0f5'], [1, '#c9cdd8']]), stroke: '#7c8294', sw: t.sw * 0.6 }));
  sv.add(R(103, 57, 42, 28, 4, { fill: sv.lin([[0, lighten(t.acc, 0.5)], [1, t.acc]]) }));
  sv.add(P('M108 78L116 70L123 74L134 62L140 66', { fill: 'none', stroke: '#fff', sw: 2.6 }) + C(140, 65, 2.2, { fill: '#fff' }));
  sv.add(facePanel(t, 116, 136, 72, 46, 2.15));
  sv.add(R(84, 176, 64, 6, 3, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.45 }));
  sv.add(door(t, 96, 182, 40, 26, '#e9e5ff', { glass: true, double: true }));
  sv.add(happySpark(t, 188, 54, 13));
};

/** 중견기업 (8층) */
const c05: Draw = (t) => {
  const { sv } = t;
  const b = box(t, { x: 56, y: 70, w: 124, h: 138, d: 40, k: 10, r: 10 });
  const [tx, ty] = b.rp(0.3, 0.62);
  sv.add(P(`M${tx - 10} ${ty + 6}v10M${tx + 10} ${ty + 6}v10`, { stroke: '#8a95a8', sw: 2.2 }));
  sv.add(cylinder(t, tx, ty - 14, 13, 20, '#dfe8f2'));
  const [px, py] = b.rp(0.76, 0.5);
  sv.add(P(`M${px} ${py}V${py - 26}`, { stroke: '#8a95a8', sw: 2 }) + C(px, py - 27, 2.4, { fill: '#ff6b6b' }));
  sv.add(winGrid(t, 64, 78, 4, 6, 21, 11, 7, 5.3, { r: 2, skip: (c, r) => r >= 4 && (c === 1 || c === 2) }));
  sv.add(win(t, 64, 146, 21, 11, { r: 2 }), win(t, 148, 146, 21, 11, { r: 2 }));
  sv.add(facePanel(t, 118, 150, 60, 40, 1.95));
  sv.add(R(80, 173, 78, 7, 3, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.5 }));
  sv.add(win(t, 64, 184, 16, 20, { r: 2 }), win(t, 156, 184, 16, 20, { r: 2 }));
  sv.add(door(t, 96, 181, 44, 27, '#dcecff', { glass: true, double: true }));
  sv.add(happySpark(t, 190, 38, 13));
};

/** 산단 공장 (톱니 지붕) */
const c06: Draw = (t) => {
  const { sv } = t;
  // 컨테이너
  box(t, { x: 8, y: 178, w: 38, h: 30, d: 14, c: t.acc, r: 5, parapet: false });
  for (let i = 0; i < 5; i++) sv.add(P(`M${14 + i * 7} 181v24`, { stroke: darken(t.acc, 0.75), sw: 1.4, so: 0.7 }));
  const b = box(t, { x: 48, y: 148, w: 152, h: 60, d: 70, k: 12, r: 8, parapet: false });
  // 톱니 4줄
  const roofC = lighten(t.c, 0.45);
  for (let i = 0; i < 4; i++) {
    const v0 = i / 4 + 0.02, v1 = (i + 1) / 4 - 0.02, vm = v1 - 0.07;
    const p = (u: number, v: number) => b.rp(u, v);
    const [a0x, a0y] = p(0.03, v0), [a1x, a1y] = p(0.97, v0), [b0x, b0y] = p(0.03, vm), [b1x, b1y] = p(0.97, vm), [c0x, c0y] = p(0.03, v1), [c1x, c1y] = p(0.97, v1);
    sv.add(PL([a0x, a0y, a1x, a1y, b1x, b1y, b0x, b0y], { fill: sv.lin([[0, darken(roofC, 0.92)], [1, lighten(roofC, 0.4)]]), stroke: edge(t.c), sw: t.sw * 0.45 }));
    sv.add(PL([b0x, b0y, b1x, b1y, c1x, c1y, c0x, c0y], { fill: sv.lin([[0, '#bfe6ff'], [1, '#86c4ec']]), stroke: edge(t.c), sw: t.sw * 0.45 }));
  }
  // 굴뚝 + 흰 김
  const [cx, cy] = b.rp(0.86, 0.82);
  sv.add(cylinder(t, cx, cy - 64, 9, 64, '#eae6f0'));
  sv.add(R(cx - 9, cy - 52, 18, 6, 0, { fill: '#ff9a8a', op: 0.9 }), R(cx - 9, cy - 36, 18, 6, 0, { fill: '#ff9a8a', op: 0.9 }));
  sv.add(puff(cx - 6, cy - 76, 10), puff(cx - 22, cy - 88, 8, 0.9), puff(cx - 38, cy - 96, 6, 0.75));
  // 셔터 문
  sv.add(R(58, 162, 46, 46, 3, { fill: '#e6eaf0', stroke: edge(t.c), sw: t.sw * 0.55 }));
  for (let i = 0; i < 7; i++) sv.add(P(`M60 ${168 + i * 6}H102`, { stroke: '#aab4c2', sw: 1.3 }));
  sv.add(winGrid(t, 166, 160, 2, 1, 12, 12, 4, 0, { r: 2 }));
  sv.add(face(138, 182, 2.05, t.m));
  sv.add(happySpark(t, 28, 150, 11));
};

/** 공공기관 (곡선 지붕) */
const c07: Draw = (t) => {
  const { sv } = t;
  const line = edge(t.acc);
  // 깃대 3개
  const flags = ['#7fc4b8', '#ff8fab', '#ffd36b'];
  for (let i = 0; i < 3; i++) {
    const x = 14 + i * 11, top = 168 + i * 3;
    sv.add(P(`M${x} 230V${top}`, { stroke: '#8a95a8', sw: 2 }) + C(x, top - 1.5, 1.8, { fill: '#ffd36b' }));
    sv.add(P(`M${x + 1} ${top + 1}q6 -3 12 0t0 9q-6 -3 -12 0Z`, { fill: flags[i], stroke: edge(flags[i]), sw: 0.9 }));
  }
  // 몸 외곽
  const sil = 'M40 210V136Q120 116 200 136V210Z';
  const roof = 'M40 136Q120 116 200 136V74Q120 54 40 74Z';
  sv.add(P('M40 210V74Q120 54 200 74V210Z', { fill: edge(t.c), stroke: edge(t.c), sw: t.sw * 2 }));
  sv.add(P(sil, { fill: sv.lin([[0, '#ffffff'], [1, t.c]]) }));
  sv.add(P(roof, { fill: sv.lin([[0, lighten(t.acc, 0.35)], [0.45, lighten(t.acc, 0.62)], [1, t.acc]]) }));
  for (let i = 1; i < 8; i++) {
    const x = 40 + i * 20;
    const yb = 136 - Math.sin((i / 8) * Math.PI) * 15, yt = 74 - Math.sin((i / 8) * Math.PI) * 15;
    sv.add(P(`M${x} ${n2(yt)}L${x} ${n2(yb)}`, { stroke: line, sw: t.sw * 0.4, so: 0.45 }));
  }
  sv.add(P('M40 136Q120 116 200 136', { fill: 'none', stroke: '#fff', sw: t.sw * 0.8, so: 0.6 }));
  // 프리즈 + 얼굴
  sv.add(P('M46 144Q120 126 194 144V158H46Z', { fill: '#fffdf8', stroke: mix(edge(t.c), '#fff', 0.2), sw: t.sw * 0.5 }));
  sv.add(face(120, 144, 1.9, t.m));
  // 기둥
  for (let i = 0; i < 7; i++) {
    const x = 50 + i * 22;
    if (i === 3) continue;
    sv.add(R(x, 162, 10, 38, 3, { fill: sv.lin([[0, '#ffffff'], [1, '#dcebe8']], 0, 0, 1, 0), stroke: mix(edge(t.c), '#fff', 0.15), sw: t.sw * 0.45 }));
  }
  sv.add(door(t, 108, 168, 26, 34, t.acc, { glass: true }));
  sv.add(R(42, 200, 156, 5, 2, { fill: '#e2e9e8', stroke: mix(edge(t.c), '#fff', 0.2), sw: t.sw * 0.4 }), R(36, 205, 168, 6, 2, { fill: '#eef3f2', stroke: mix(edge(t.c), '#fff', 0.2), sw: t.sw * 0.4 }));
  // 분수
  sv.add(E(206, 224, 22, 9, { fill: '#e8eef2', stroke: '#9aa8b4', sw: t.sw * 0.5 }) + E(206, 223, 17, 6, { fill: '#9fdcff' }));
  sv.add(P('M206 222Q203 212 206 200Q209 212 206 222Z', { fill: '#dff4ff', stroke: '#7fc0e8', sw: 1 }) + P('M200 216q-4 -4 -2 -9M212 216q4 -4 2 -9', { fill: 'none', stroke: '#bfe8ff', sw: 2 }));
  sv.add(happySpark(t, 196, 60, 13));
};

/** 대학병원 (2×2) */
const c08: Draw = (t) => {
  const { sv } = t;
  const main = box(t, { x: 22, y: 90, w: 126, h: 118, d: 56, k: 14, r: 10 });
  // 헬리패드
  const [hx, hy] = main.rp(0.52, 0.5);
  sv.add(E(hx, hy, 38, 17, { fill: '#8aa0b4', stroke: '#5d7288', sw: t.sw * 0.6 }), E(hx, hy, 31, 13.5, { fill: 'none', stroke: '#ffe066', sw: 2.4 }));
  sv.add(G(P(hPath(9), { fill: 'none', stroke: '#fff', sw: 3.4 }), { tf: `translate(${hx} ${hy}) scale(1 .46)` }));
  sv.add(winGrid(t, 32, 124, 4, 3, 18, 10, 10, 8, { r: 2, glass: ['#f4fbff', '#b8dcf2'], skip: (c, r) => r >= 1 && (c === 1 || c === 2) }));
  sv.add(win(t, 32, 160, 18, 10, { r: 2 }), win(t, 116, 160, 18, 10, { r: 2 }));
  // 하트 표시
  sv.add(C(85, 106, 11, { fill: '#fff', stroke: edge(t.acc), sw: t.sw * 0.6 }) + G(P(heartPath(6.5), { fill: t.acc, stroke: edge(t.acc), sw: 0.8 }), { tf: 'translate(85 106.5)' }));
  sv.add(facePanel(t, 85, 157, 58, 34, 1.7));
  sv.add(R(56, 180, 58, 7, 3, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.5 }));
  sv.add(door(t, 68, 187, 34, 21, '#e8f2fb', { glass: true, double: true }));
  // 별관
  const an = box(t, { x: 158, y: 138, w: 62, h: 70, d: 40, k: 10, r: 8, c: lighten(t.acc, 0.55), roof: lighten(t.acc, 0.72) });
  sv.add(winGrid(t, 166, 148, 2, 3, 18, 11, 10, 8, { r: 2, glass: ['#fff5f8', '#f6c4d2'] }));
  const [ux, uy] = an.rp(0.5, 0.5);
  sv.add(acUnit(t, ux, uy, 1.1));
  sv.add(happySpark(t, 204, 74, 14));
};

/** 대기업 (트윈 타워 + 스카이브리지) */
const c09: Draw = (t) => {
  const { sv } = t;
  const glass = { top: '#eef6ff', bot: '#6f9fd6', mull: '#ffffff', cols: 4, rows: 14, refl: 2 } as const;
  const L = box(t, { x: 20, y: 30, w: 66, h: 152, d: 24, k: 12, r: 8 });
  sv.add(glassWall(t, 25, 35, 56, 142, glass));
  const Rt = box(t, { x: 150, y: 48, w: 66, h: 134, d: 24, k: 12, r: 8 });
  sv.add(glassWall(t, 155, 53, 56, 124, { ...glass, rows: 12 }));
  // 금색 로고판 (왼쪽 옥상)
  const [lx, ly] = L.rp(0.5, 0.45);
  sv.add(P(`M${lx - 12} ${ly + 4}v6M${lx + 12} ${ly + 4}v6`, { stroke: '#8a7a50', sw: 2 }));
  sv.add(R(lx - 20, ly - 22, 40, 27, 6, { fill: sv.lin([[0, '#fff3b8'], [0.5, '#ffd36b'], [1, '#e0a52a']]), stroke: '#a8791a', sw: t.sw * 0.7 }));
  sv.add(G(P(ticketPath(-12, -8, 24, 16, 3, 3, 2), { fill: '#fff8e0', stroke: '#a8791a', sw: 1.2 }) + G(P(wonPath(4.2), { fill: 'none', stroke: '#c9861a', sw: 1.6 }), { tf: 'scale(.9)' }), { tf: `translate(${lx} ${ly - 8.5})` }));
  // 오른쪽 옥상 안테나
  const [rx, ry] = Rt.rp(0.55, 0.5);
  sv.add(P(`M${rx - 8} ${ry}V${ry - 22}M${rx + 6} ${ry + 2}V${ry - 14}`, { stroke: '#7c8aa0', sw: 2.2 }) + C(rx - 8, ry - 23, 2.4, { fill: '#ff6b6b' }));
  // 스카이브리지 + 얼굴
  box(t, { x: 90, y: 100, w: 62, h: 44, d: 10, k: 4, r: 6, c: '#e8f1fc', parapet: false });
  sv.add(facePanel(t, 121, 122, 54, 36, 1.75, { r: 8 }));
  // 포디움
  box(t, { x: 12, y: 180, w: 206, h: 30, d: 16, k: 10, r: 8, c: '#e3edf8', parapet: false });
  sv.add(R(80, 180, 70, 5, 2, { fill: t.acc, op: 0.85 }));
  sv.add(door(t, 96, 186, 38, 24, '#dcecff', { glass: true, double: true }));
  sv.add(winGrid(t, 22, 188, 3, 1, 16, 14, 5, 0, { r: 2 }), winGrid(t, 152, 188, 3, 1, 16, 14, 5, 0, { r: 2 }));
  sv.add(happySpark(t, 214, 26, 15));
};

/** 그룹 본사 (금테 초고층 + 첨탑) */
const c10: Draw = (t) => {
  const { sv } = t;
  const gold = '#ffd36b', goldD = '#b88a1e';
  // 광장 바닥
  sv.add(E(120, 222, 110, 14, { fill: '#f3eee4', stroke: '#d8ccb4', sw: t.sw * 0.5 }));
  // 양쪽 날개
  const wl = box(t, { x: 12, y: 170, w: 58, h: 42, d: 22, k: 8, r: 8, c: lighten(t.c, 0.35) });
  const wr = box(t, { x: 172, y: 170, w: 56, h: 42, d: 22, k: 8, r: 8, c: lighten(t.c, 0.35) });
  void wl; void wr;
  sv.add(winGrid(t, 20, 180, 3, 2, 12, 10, 6, 6, { r: 2 }), winGrid(t, 180, 180, 3, 2, 12, 10, 5, 6, { r: 2 }));
  // 본동
  const b = box(t, { x: 70, y: 44, w: 102, h: 168, d: 28, k: 14, r: 8 });
  sv.add(glassWall(t, 76, 54, 90, 150, { top: '#f3efff', bot: '#9788dc', mull: '#fff4c8', cols: 5, rows: 13, refl: 2 }));
  // 금테
  sv.add(R(70, 44, 102, 9, 3, { fill: sv.lin([[0, '#fff3b8'], [1, gold]]), stroke: goldD, sw: t.sw * 0.55 }));
  sv.add(R(70, 44, 6, 168, 3, { fill: gold, stroke: goldD, sw: t.sw * 0.45 }), R(166, 44, 6, 168, 3, { fill: gold, stroke: goldD, sw: t.sw * 0.45 }));
  sv.add(PL([172, 44, 184, 17, 184, 30, 172, 57], { fill: darken(gold, 0.85), op: 0.9 }));
  // 첨탑
  const [sx, sy] = b.rp(0.5, 0.5);
  sv.add(P(`M${sx - 7} ${sy + 2}L${sx} ${4}L${sx + 7} ${sy + 2}Z`, { fill: sv.lin([[0, '#fff6c8'], [1, gold]], 0, 0, 1, 0), stroke: goldD, sw: t.sw * 0.6 }));
  sv.add(R(sx - 11, sy - 2, 22, 6, 3, { fill: gold, stroke: goldD, sw: t.sw * 0.5 }) + C(sx, 5, 3, { fill: '#fff6c8', stroke: goldD, sw: 1 }));
  sv.add(facePanel(t, 121, 124, 70, 44, 2.1, { fo: { brow: true }, fill: '#fff6dc' }));
  sv.add(R(88, 184, 66, 6, 3, { fill: gold, stroke: goldD, sw: t.sw * 0.5 }));
  sv.add(door(t, 98, 190, 46, 22, '#ece7ff', { glass: true, double: true }));
  // 조형물
  sv.add(R(24, 214, 30, 8, 3, { fill: '#e6dccb', stroke: '#b3a58c', sw: t.sw * 0.5 }));
  sv.add(C(39, 200, 11, { fill: 'none', stroke: goldD, sw: 7 }) + C(39, 200, 11, { fill: 'none', stroke: sv.lin([[0, '#fff3b8'], [1, gold]]), sw: 4.6 }));
  sv.add(E(206, 216, 18, 6, { fill: '#9fd89a', stroke: '#5fa860', sw: t.sw * 0.5 }) + C(200, 213, 2.4, { fill: '#ff8fab' }) + C(209, 212, 2.4, { fill: '#ffd36b' }) + C(214, 216, 2.2, { fill: '#fff' }));
  sv.add(happySpark(t, 206, 30, 15));
};

/* ───────── 식당 ───────── */

/** 김밥집 */
const r01: Draw = (t) => {
  const { sv } = t;
  const wall = '#fff9ec';
  box(t, { x: 46, y: 136, w: 148, h: 74, d: 0, c: wall, line: edge(t.c), r: 10, parapet: false });
  // 박공 지붕
  const line = edge(t.c);
  sv.add(P(roundPoly([28, 152, 38, 64, 202, 64, 212, 152], 10), { fill: line, stroke: line, sw: t.sw * 2 }));
  sv.add(P('M36 100L42 68H198L204 100Z', { fill: sv.lin([[0, lighten(t.c, 0.55)], [1, lighten(t.c, 0.25)]]) }));
  sv.add(P('M30 150L36 100H204L210 150Z', { fill: sv.lin([[0, lighten(t.c, 0.1)], [1, darken(t.c, 0.93)]]) }));
  for (let i = 0; i < 4; i++) sv.add(P(`M${34 - i * 1.2} ${112 + i * 10}H${206 + i * 1.2}`, { stroke: darken(t.c, 0.82), sw: 1.4, so: 0.6 }));
  sv.add(R(34, 96, 172, 8, 4, { fill: darken(t.c, 0.88), stroke: line, sw: t.sw * 0.5 }));
  // 간판 (김밥)
  sv.add(R(78, 70, 84, 30, 8, { fill: '#ffffff', stroke: t.acc, sw: t.sw * 0.9 }));
  sv.add(kimbap(98, 85, 9) + kimbap(120, 85, 9) + kimbap(142, 85, 9));
  // 차양
  sv.add(awning(t, 50, 148, 140, 16, '#ffffff', t.acc, 8));
  sv.add(win(t, 56, 178, 30, 24, { r: 4 }));
  sv.add(door(t, 158, 172, 28, 38, t.acc, { glass: true }));
  sv.add(face(120, 186, 2.05, t.m));
  sv.add(happySpark(t, 198, 58, 12));
};

/** 백반집 (기와 노포) */
const r02: Draw = (t) => {
  const { sv } = t;
  const wall = '#fffaf1';
  const roofC = darken(t.c, 0.8);
  box(t, { x: 44, y: 134, w: 152, h: 76, d: 0, c: wall, line: edge(t.c), r: 8, parapet: false });
  // 김
  sv.add(steam(t, 92, 58, 1.2));
  const line = edge(roofC);
  const front = 'M22 138Q40 158 72 154H168Q200 158 218 138L184 100H56Z';
  const back = 'M56 100H184L176 70H64Z';
  sv.add(P(front, { fill: line, stroke: line, sw: t.sw * 2 }), P(back, { fill: line, stroke: line, sw: t.sw * 2 }));
  sv.add(P(back, { fill: sv.lin([[0, lighten(roofC, 0.5)], [1, lighten(roofC, 0.25)]]) }));
  sv.add(P(front, { fill: sv.lin([[0, lighten(roofC, 0.22)], [1, darken(roofC, 0.95)]]) }));
  const clip = sv.clip(P(front));
  let tiles = '';
  for (let i = 0; i <= 14; i++) {
    const xt = 58 + i * 9, xb = 26 + i * 13.4;
    tiles += P(`M${n2(xt)} 100Q${n2((xt + xb) / 2 + 1)} 128 ${n2(xb)} 158`, { fill: 'none', stroke: darken(roofC, 0.78), sw: 2.2, so: 0.7 });
  }
  sv.add(G(tiles, { cp: clip }));
  for (let i = 0; i < 13; i++) sv.add(C(36 + i * 14, 150 + Math.abs(6 - i) * 0.5, 3.6, { fill: lighten(roofC, 0.3), stroke: line, sw: 1 }));
  sv.add(P('M46 104Q52 96 60 98H180Q188 96 194 104', { fill: 'none', stroke: darken(roofC, 0.7), sw: 7 }), P('M50 101Q56 95 62 97H178Q184 95 190 101', { fill: 'none', stroke: lighten(roofC, 0.25), sw: 2.4 }));
  // 현판 (밥그릇)
  sv.add(R(88, 146, 64, 20, 4, { fill: sv.lin([[0, '#d9a878'], [1, '#b98452']]), stroke: '#7a5232', sw: t.sw * 0.6 }));
  sv.add(riceBowl(120, 155, 0.62));
  // 창호 문
  sv.add(R(134, 170, 48, 40, 3, { fill: '#fff4dc', stroke: t.acc, sw: t.sw * 0.8 }));
  for (let i = 1; i < 4; i++) sv.add(P(`M${134 + i * 12} 170V210`, { stroke: t.acc, sw: 1.6 }));
  for (let j = 1; j < 4; j++) sv.add(P(`M134 ${170 + j * 10}H182`, { stroke: t.acc, sw: 1.6 }));
  sv.add(P('M158 170V210', { stroke: darken(t.acc, 0.8), sw: 2.6 }));
  sv.add(face(86, 186, 2.05, t.m));
  sv.add(happySpark(t, 206, 88, 12));
};

/** 푸드트럭 */
const r03: Draw = (t, st) => {
  const { sv } = t;
  if (st === 'up') {
    sv.add(R(58, 186, 16, 20, 5, { fill: '#4a4553' }), R(166, 186, 16, 20, 5, { fill: '#4a4553' }));
    const b = box(t, { x: 62, y: 146, w: 116, h: 50, d: 96, r: 16 });
    sv.add(R(76, 30, 88, 26, 10, { fill: lighten(t.c, 0.35), stroke: edge(t.c), sw: t.sw }));
    sv.add(win(t, 84, 34, 72, 14, { r: 5 }));
    sv.add(burger(t, 120, 108, 1.25));
    sv.add(P('M120 150V192', { stroke: edge(t.c), sw: t.sw * 0.7 }));
    sv.add(R(104, 164, 10, 4, 2, { fill: '#8a8a9a' }), R(126, 164, 10, 4, 2, { fill: '#8a8a9a' }));
    sv.add(C(74, 184, 6, { fill: '#ff6b6b', stroke: '#b84a4a', sw: 1 }), C(166, 184, 6, { fill: '#ff6b6b', stroke: '#b84a4a', sw: 1 }));
    sv.add(R(62, 176, 116, 6, 0, { fill: t.acc, op: 0.9 }));
    sv.add(R(58, 196, 124, 8, 4, { fill: '#8f8a9a', stroke: '#5d5968', sw: t.sw * 0.5 }));
    void b;
    return;
  }
  if (st === 'down') {
    const b = box(t, { x: 62, y: 128, w: 116, h: 20, d: 94, r: 16 });
    void b;
    sv.add(burger(t, 120, 88, 1.25));
    sv.add(R(58, 186, 16, 20, 5, { fill: '#4a4553' }), R(166, 186, 16, 20, 5, { fill: '#4a4553' }));
    box(t, { x: 66, y: 150, w: 108, h: 48, d: 16, r: 14, c: t.c, roof: lighten(t.c, 0.4) });
    sv.add(win(t, 76, 154, 88, 18, { r: 6 }));
    sv.add(C(80, 186, 6.5, { fill: '#fff6b0', stroke: '#c9a13d', sw: 1.2 }), C(160, 186, 6.5, { fill: '#fff6b0', stroke: '#c9a13d', sw: 1.2 }));
    sv.add(R(62, 198, 116, 7, 3.5, { fill: '#8f8a9a', stroke: '#5d5968', sw: t.sw * 0.5 }));
    sv.add(face(120, 180, 1.75, 'idle'));
    return;
  }
  // 옆모습 (왼쪽 봄)
  const b = box(t, { x: 88, y: 118, w: 124, h: 70, d: 44, r: 12 });
  sv.add(burger(t, b.x + 64, 96, 1.05));
  sv.add(P('M152 100v8', { stroke: '#8a8a9a', sw: 2 }));
  // 판매창 + 들어 올린 덮개
  sv.add(R(104, 130, 92, 30, 4, { fill: '#6b4a5e', stroke: edge(t.c), sw: t.sw * 0.6 }));
  sv.add(burger(t, 124, 152, 0.42) + R(142, 140, 8, 14, 2, { fill: '#fff', stroke: '#aaa', sw: 0.8 }) + R(144, 136, 4, 5, 1, { fill: '#ff8fab' }) + C(170, 148, 7, { fill: '#ffd34d', stroke: '#c9a13d', sw: 0.8 }));
  sv.add(P('M98 112H202L196 130H104Z', { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.6 }));
  for (let i = 1; i < 6; i++) sv.add(P(`M${104 + i * 16} 112L${106 + i * 15} 130`, { stroke: '#fff', sw: 3.2, so: 0.7 }));
  sv.add(P('M108 160L104 130M192 160L196 130', { stroke: '#8a7a80', sw: 1.6 }));
  sv.add(R(98, 158, 104, 6, 3, { fill: lighten(t.acc, 0.4), stroke: edge(t.acc), sw: t.sw * 0.45 }));
  sv.add(R(88, 176, 124, 8, 0, { fill: t.acc, op: 0.9 }));
  // 운전석
  box(t, { x: 34, y: 128, w: 58, h: 60, d: 28, r: 14, parapet: false });
  sv.add(win(t, 42, 135, 42, 20, { r: 6 }));
  sv.add(C(38, 180, 4, { fill: '#fff6b0', stroke: '#c9a13d', sw: 1 }));
  sv.add(face(64, 170, 1.7, t.m));
  sv.add(wheel(t, 70, 194, 15), wheel(t, 180, 194, 15));
  sv.add(happySpark(t, 206, 70, 12));
};

/** 한식뷔페 */
const r04: Draw = (t) => {
  const { sv } = t;
  const b = box(t, { x: 24, y: 148, w: 192, h: 60, d: 90, r: 18, c: '#fff4e6', roof: lighten(t.c, 0.15), line: edge(t.c) });
  void b;
  // 지붕 쟁반
  sv.add(R(56, 70, 128, 66, 12, { fill: '#8a5a3a', op: 0.25, tf: 'translate(3 4)' }));
  sv.add(R(56, 70, 128, 66, 12, { fill: sv.lin([[0, '#fffdf6'], [1, '#efe6d2']]), stroke: t.acc, sw: t.sw * 0.9 }));
  const dish = ['#ff7b6b', '#7cc47c', '#ffd34d', '#c98a5a'];
  for (let i = 0; i < 4; i++) {
    sv.add(R(64 + i * 29, 77, 25, 22, 6, { fill: '#f6efe0', stroke: '#d8c8a8', sw: 1.4 }));
    sv.add(E(76.5 + i * 29, 88, 8, 6, { fill: dish[i] }) + C(73 + i * 29, 85, 2, { fill: '#fff', op: 0.6 }));
  }
  sv.add(R(64, 104, 62, 26, 7, { fill: '#f6efe0', stroke: '#d8c8a8', sw: 1.4 }) + E(95, 117, 24, 9, { fill: '#ffffff', stroke: '#e0d6c4', sw: 1 }));
  sv.add(R(132, 104, 44, 26, 7, { fill: '#f6efe0', stroke: '#d8c8a8', sw: 1.4 }) + E(154, 117, 16, 9, { fill: '#ffb36b' }) + C(150, 115, 2.4, { fill: '#fff', op: 0.6 }) + C(158, 119, 1.8, { fill: '#7cc47c' }));
  // 앞면
  sv.add(R(24, 150, 192, 8, 0, { fill: t.acc, op: 0.85 }));
  sv.add(win(t, 34, 164, 52, 30, { r: 4 }));
  sv.add(door(t, 168, 164, 34, 44, t.acc, { glass: true, double: true }));
  sv.add(face(126, 180, 2.1, t.m));
  // 입간판
  sv.add(P('M14 224L22 190H40L48 224', { fill: 'none', stroke: '#8a5a3a', sw: 2.2 }));
  sv.add(R(16, 188, 30, 26, 4, { fill: '#fff8ec', stroke: t.acc, sw: t.sw * 0.8 }) + riceBowl(31, 200, 0.62));
  sv.add(happySpark(t, 200, 58, 13));
};

/** 구내식당 (2×2) */
const r05: Draw = (t) => {
  const { sv } = t;
  const wall = lighten(t.c, 0.72);
  const b = box(t, { x: 20, y: 124, w: 178, h: 82, d: 74, k: 18, r: 14, c: wall, roof: t.c, line: edge(t.c) });
  // 지붕 골
  for (let i = 1; i < 10; i++) {
    const [x0, y0] = b.rp(i / 10, 0.06), [x1, y1] = b.rp(i / 10, 0.94);
    sv.add(P(`M${n2(x0)} ${n2(y0)}L${n2(x1)} ${n2(y1)}`, { stroke: darken(t.c, 0.85), sw: 1.6, so: 0.55 }));
  }
  // 굴뚝 + 김
  for (const [u, v] of [[0.24, 0.62], [0.72, 0.68]] as const) {
    const [cx, cy] = b.rp(u, v);
    sv.add(cylinder(t, cx, cy - 26, 9, 26, '#e6e8ee'));
    sv.add(puff(cx - 4, cy - 38, 9), puff(cx - 16, cy - 50, 7, 0.85));
  }
  sv.add(winGrid(t, 28, 158, 2, 1, 20, 24, 6, 0, { r: 3 }), winGrid(t, 146, 158, 2, 1, 20, 24, 6, 0, { r: 3 }));
  sv.add(R(80, 164, 58, 7, 3, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.5 }));
  sv.add(door(t, 90, 171, 38, 35, '#eaf6e2', { glass: true, double: true }));
  sv.add(face(109, 144, 2.5, t.m));
  // 식판 모양 벤치
  for (const x of [20, 128]) {
    sv.add(R(x, 212, 72, 22, 6, { fill: sv.lin([[0, '#f3d9a8'], [1, '#d9b27a']]), stroke: '#a67c46', sw: t.sw * 0.6 }));
    sv.add(R(x + 5, 216, 20, 14, 4, { fill: 'none', stroke: '#b98a52', sw: 1.4 }) + R(x + 29, 216, 14, 6, 3, { fill: 'none', stroke: '#b98a52', sw: 1.4 }) + R(x + 47, 216, 20, 6, 3, { fill: 'none', stroke: '#b98a52', sw: 1.4 }) + R(x + 29, 224, 38, 6, 3, { fill: 'none', stroke: '#b98a52', sw: 1.4 }));
  }
  sv.add(happySpark(t, 214, 58, 15));
};

/** 배달 맛집 (오토바이 + 배달통 얼굴) */
const r06: Draw = (t, st) => {
  const { sv } = t;
  const helmet = '#ff9a3c';
  const hl = edge(helmet);
  const drum = (cx: number, cy: number, s: number) =>
    G(
      P('M-8 4Q-12 -8 0 -10Q12 -10 9 2Q6 8 -2 7Z', { fill: '#e89a4a', stroke: '#9a5a22', sw: 1.2 }) +
        P('M-6 5L-12 11', { stroke: '#fff3dc', sw: 4.4 }) + C(-13, 12, 2.6, { fill: '#fff3dc', stroke: '#c9a888', sw: 0.8 }) + C(-11, 14, 2.4, { fill: '#fff3dc', stroke: '#c9a888', sw: 0.8 }) +
        P('M-3 -6Q2 -8 5 -4', { fill: 'none', stroke: '#fff', sw: 1.6, so: 0.7 }),
      { tf: `translate(${n2(cx)} ${n2(cy)}) scale(${n2(s)})` },
    );
  if (st === 'up') {
    sv.add(R(112, 176, 16, 30, 7, { fill: '#4a4553', stroke: '#2e2a36', sw: t.sw * 0.5 }));
    sv.add(P('M98 150H142L136 186H104Z', { fill: '#fff4e6', stroke: edge(t.c), sw: t.sw * 0.8 }));
    sv.add(C(120, 176, 5, { fill: '#ff6b6b', stroke: '#b84a4a', sw: 1 }));
    sv.add(P('M70 84H96M144 84H170', { stroke: '#6a6a78', sw: 4 }) + C(70, 80, 5, { fill: '#cfd6e0', stroke: '#6a6a78', sw: 1.2 }) + C(170, 80, 5, { fill: '#cfd6e0', stroke: '#6a6a78', sw: 1.2 }));
    sv.add(R(92, 76, 56, 34, 14, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.8 }));
    sv.add(C(120, 68, 20, { fill: sv.lin([[0, lighten(helmet, 0.35)], [1, helmet]]), stroke: hl, sw: t.sw * 0.8 }) + P('M110 52Q120 48 130 52', { fill: 'none', stroke: '#fff', sw: 3, so: 0.8 }));
    const b = box(t, { x: 82, y: 124, w: 76, h: 50, d: 28, r: 10 });
    const [cx, cy] = b.rp(0.5, 0.5);
    sv.add(drum(cx, cy, 0.9));
    sv.add(drum(120, 150, 1.1));
    return;
  }
  if (st === 'down') {
    const b = box(t, { x: 80, y: 60, w: 80, h: 44, d: 24, r: 10 });
    const [cx, cy] = b.rp(0.5, 0.5);
    sv.add(drum(cx, cy, 0.9));
    sv.add(face(120, 76, 1.7, 'idle'));
    sv.add(R(92, 118, 56, 36, 14, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.8 }));
    sv.add(C(120, 108, 21, { fill: sv.lin([[0, lighten(helmet, 0.35)], [1, helmet]]), stroke: hl, sw: t.sw * 0.8 }));
    sv.add(P('M104 108Q120 100 136 108Q136 120 120 121Q104 120 104 108Z', { fill: '#4a5878', stroke: '#2e3850', sw: 1.4 }) + P('M110 107Q116 104 122 105', { fill: 'none', stroke: '#fff', sw: 2, so: 0.7 }));
    sv.add(R(112, 176, 16, 30, 7, { fill: '#4a4553', stroke: '#2e2a36', sw: t.sw * 0.5 }));
    sv.add(P('M100 146H140L134 186H106Z', { fill: '#fff4e6', stroke: edge(t.c), sw: t.sw * 0.8 }));
    sv.add(P('M70 144H100M140 144H170', { stroke: '#6a6a78', sw: 4 }) + C(68, 136, 5, { fill: '#cfd6e0', stroke: '#6a6a78', sw: 1.2 }) + C(172, 136, 5, { fill: '#cfd6e0', stroke: '#6a6a78', sw: 1.2 }));
    sv.add(C(120, 168, 9, { fill: '#fff6b0', stroke: '#c9a13d', sw: 1.4 }) + C(117, 165, 3, { fill: '#fff' }));
    return;
  }
  // 옆모습 (왼쪽 봄)
  sv.add(wheel(t, 54, 194, 15), wheel(t, 176, 194, 15));
  // 스쿠터 몸
  sv.add(P('M40 114L58 112L66 180L50 184Z', { fill: '#fff4e6', stroke: edge(t.c), sw: t.sw * 0.8 }));
  sv.add(P('M40 176Q54 170 70 178', { fill: 'none', stroke: edge(t.c), sw: t.sw * 0.7 }));
  sv.add(P('M64 174H132L138 162H200Q206 176 196 186H66Z', { fill: sv.lin([[0, '#fff4e6'], [1, '#f2dcc4']]), stroke: edge(t.c), sw: t.sw * 0.8 }));
  sv.add(P('M150 176H196', { stroke: t.acc, sw: 4 }));
  sv.add(C(42, 118, 6, { fill: '#fff6b0', stroke: '#c9a13d', sw: 1.2 }));
  sv.add(P('M52 106L66 108', { stroke: '#6a6a78', sw: 4 }));
  // 배달통 (얼굴)
  const b = box(t, { x: 124, y: 102, w: 78, h: 62, d: 30, r: 10 });
  const [cx, cy] = b.rp(0.5, 0.5);
  sv.add(drum(cx, cy, 0.85));
  sv.add(R(124, 104, 78, 5, 0, { fill: t.acc, op: 0.8 }));
  sv.add(face(163, 136, 1.85, t.m));
  // 라이더
  sv.add(P('M104 160L84 162L80 180', { fill: 'none', stroke: '#4a5878', sw: 9 }) + R(72, 178, 14, 6, 3, { fill: '#3a3a48' }));
  sv.add(P('M92 112Q90 104 102 102Q122 100 126 116L128 160Q112 166 96 160Z', { fill: sv.lin([[0, lighten(t.acc, 0.2)], [1, t.acc]]), stroke: edge(t.acc), sw: t.sw * 0.8 }));
  sv.add(P('M98 120L66 110', { stroke: t.acc, sw: 9 }) + P('M98 120L66 110', { stroke: edge(t.acc), sw: 1.4, so: 0.5 }) + C(64, 110, 4.6, { fill: '#fff4e6', stroke: '#b9a58c', sw: 1 }));
  sv.add(C(106, 84, 21, { fill: sv.lin([[0, lighten(helmet, 0.35)], [1, helmet]]), stroke: hl, sw: t.sw * 0.8 }));
  sv.add(P('M86 80Q88 70 100 72V92Q90 94 86 88Z', { fill: '#4a5878', stroke: '#2e3850', sw: 1.2 }) + P('M110 66Q120 68 124 78', { fill: 'none', stroke: '#fff', sw: 3.2, so: 0.85 }));
  sv.add(happySpark(t, 212, 72, 12));
};

/** 카페 */
const r07: Draw = (t) => {
  const { sv } = t;
  box(t, { x: 44, y: 140, w: 152, h: 68, d: 72, r: 16, c: '#fffaf1', roof: mix(t.c, '#f3d6a4', 0.35), line: edge('#e8cfa6') });
  // 커피잔 모형
  const cup = t.acc;
  sv.add(steam(t, 120, 70, 0.9));
  sv.add(E(120, 118, 36, 10, { fill: '#8a5a3a', op: 0.18 }));
  sv.add(E(120, 114, 34, 10, { fill: '#ffffff', stroke: edge(cup), sw: t.sw * 0.6 }));
  sv.add(P('M140 90Q156 88 154 100Q152 110 138 106', { fill: 'none', stroke: edge(cup), sw: 8 }) + P('M140 90Q156 88 154 100Q152 110 138 106', { fill: 'none', stroke: '#fff', sw: 5 }));
  sv.add(P('M98 84L102 108Q104 114 120 114Q136 114 138 108L142 84Z', { fill: sv.lin([[0, '#ffffff'], [1, '#efe6da']], 0, 0, 1, 0), stroke: edge(cup), sw: t.sw * 0.6 }));
  sv.add(P('M99.5 94H140.5L139 102H101Z', { fill: cup }));
  sv.add(E(120, 84, 22, 6.5, { fill: '#8a5a3a', stroke: edge(cup), sw: t.sw * 0.6 }));
  sv.add(G(P(heartPath(3.4), { fill: '#fff4e0' }), { tf: 'translate(120 84) scale(1 .6)' }));
  sv.add(awning(t, 48, 140, 144, 18, '#fff4e0', cup, 8));
  sv.add(win(t, 54, 170, 38, 28, { r: 4 }));
  sv.add(door(t, 160, 168, 28, 40, cup, { glass: true }));
  sv.add(face(128, 186, 2.0, t.m));
  // 파라솔 두 개
  for (const x of [28, 212]) {
    sv.add(E(x, 222, 18, 5, { fill: '#000', op: 0.12 }));
    let seg = '';
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      seg += P(`M${x} 206L${n2(x + Math.cos(a0) * 22)} ${n2(206 + Math.sin(a0) * 13)}L${n2(x + Math.cos(a1) * 22)} ${n2(206 + Math.sin(a1) * 13)}Z`, { fill: i % 2 ? '#fff4e0' : cup });
    }
    sv.add(E(x, 206, 22, 13, { fill: edge(cup), stroke: edge(cup), sw: t.sw * 1.4 }) + seg + C(x, 206, 2.6, { fill: '#fff', stroke: edge(cup), sw: 1 }));
  }
  sv.add(happySpark(t, 196, 64, 12));
};

/** 편의점 */
const r08: Draw = (t) => {
  const { sv } = t;
  const b = box(t, { x: 44, y: 132, w: 152, h: 76, d: 62, r: 12 });
  const [ax, ay] = b.rp(0.72, 0.5);
  sv.add(acUnit(t, ax, ay, 1.5));
  const [vx, vy] = b.rp(0.26, 0.55);
  sv.add(cylinder(t, vx, vy - 8, 7, 8, '#e6ebf2'));
  sv.add(G(R(44, 132, 152, 9, 0, { fill: '#4aa3df' }) + R(44, 141, 152, 4, 0, { fill: '#ffffff' }) + R(44, 145, 152, 8, 0, { fill: t.acc }), { cp: sv.clip(R(44, 132, 152, 76, 12)) }));
  sv.add(P('M44 153H196', { stroke: edge(t.c), sw: t.sw * 0.5 }));
  // 유리 진열창
  sv.add(win(t, 52, 160, 46, 42, { r: 4, shine: false }));
  const dots = ['#ff8f8f', '#ffd34d', '#8fe0c0', '#8fd3ff', '#c8a0ff', '#ffb36b'];
  for (let r = 0; r < 3; r++) {
    sv.add(P(`M54 ${172 + r * 12}H96`, { stroke: '#9fb6c8', sw: 1.4 }));
    for (let c = 0; c < 5; c++) sv.add(R(57 + c * 8, 164 + r * 12, 5, 7, 1.5, { fill: dots[(c + r * 2) % 6] }));
  }
  sv.add(P('M58 200L72 162', { stroke: '#fff', sw: 3, so: 0.5 }));
  sv.add(door(t, 154, 160, 34, 48, '#d6ecfb', { glass: true, double: true }));
  sv.add(face(126, 180, 1.95, t.m));
  sv.add(happySpark(t, 190, 64, 12));
};

/** 대형 프랜차이즈 (2×2) */
const r09: Draw = (t) => {
  const { sv } = t;
  // 드라이브스루 차선
  sv.add(P('M214 40V196Q214 228 184 228H20', { fill: 'none', stroke: '#9aa3b2', sw: 26 }), P('M214 40V196Q214 228 184 228H20', { fill: 'none', stroke: '#cfd5de', sw: 22 }));
  sv.add(P('M214 48V196Q214 228 184 228H28', { fill: 'none', stroke: '#fff', sw: 2, da: '7 7' }));
  sv.add(P('M40 222L30 228L40 234', { fill: 'none', stroke: '#fff', sw: 2.6 }));
  // 메뉴판
  sv.add(P('M228 118V140', { stroke: '#6a6a78', sw: 2 }) + R(220, 96, 16, 24, 3, { fill: '#2f3a5a', stroke: '#1f283e', sw: 1 }) + R(222, 99, 12, 3, 1, { fill: t.c }) + R(222, 105, 12, 3, 1, { fill: '#fff', op: 0.7 }) + R(222, 111, 12, 3, 1, { fill: '#fff', op: 0.7 }));
  const b = box(t, { x: 22, y: 128, w: 164, h: 76, d: 70, k: 12, r: 14, c: '#fff6e6', roof: t.c, line: edge(t.acc) });
  // 빨간 지붕 테
  const [a0x, a0y] = b.rp(0, 0), [a1x, a1y] = b.rp(1, 0), [b1x, b1y] = b.rp(1, 0.22), [b0x, b0y] = b.rp(0, 0.22);
  sv.add(PL([a0x + 2, a0y, a1x - 2, a1y, b1x - 2, b1y, b0x + 2, b0y], { fill: sv.lin([[0, lighten(t.acc, 0.2)], [1, t.acc]]) }));
  sv.add(burger(t, b.rp(0.5, 0.62)[0], b.rp(0.5, 0.62)[1] + 10, 1.35));
  sv.add(crownShape(t, b.rp(0.5, 0.62)[0], b.rp(0.5, 0.62)[1] - 24, 1.0));
  // 앞면
  sv.add(R(22, 130, 164, 10, 0, { fill: t.acc, op: 0.9 }));
  sv.add(winGrid(t, 30, 166, 2, 1, 24, 30, 5, 0, { r: 4, frame: edge(t.acc) }), winGrid(t, 128, 166, 2, 1, 24, 30, 5, 0, { r: 4, frame: edge(t.acc) }));
  sv.add(door(t, 90, 170, 28, 34, t.acc, { glass: true }));
  sv.add(face(104, 152, 2.2, t.m));
  sv.add(happySpark(t, 196, 50, 15));
};

/** 위탁급식 본사 (센트럴키친 + 탑차 2대) */
const r10: Draw = (t) => {
  const { sv } = t;
  const wall = lighten(t.c, 0.72);
  const b = box(t, { x: 18, y: 108, w: 178, h: 90, d: 72, k: 18, r: 14, c: wall, roof: t.c, line: edge(t.c) });
  // 지붕 식판 로고
  const [lx, ly] = b.rp(0.5, 0.52);
  sv.add(G(
    R(-44, -20, 88, 40, 10, { fill: '#ffffff', stroke: t.acc, sw: 3 }) +
      R(-38, -14, 22, 14, 4, { fill: lighten(t.acc, 0.55) }) + R(-12, -14, 22, 14, 4, { fill: lighten('#ffd34d', 0.3) }) + R(14, -14, 24, 14, 4, { fill: lighten('#ff8f8f', 0.35) }) +
      R(-38, 3, 40, 12, 4, { fill: '#f4f0e6' }) + R(6, 3, 32, 12, 4, { fill: lighten('#ffb36b', 0.35) }),
    { tf: `translate(${n2(lx)} ${n2(ly)}) skewX(-8) scale(1 .62)` },
  ));
  for (const u of [0.1, 0.9]) {
    const [vx, vy] = b.rp(u, 0.7);
    sv.add(acUnit(t, vx, vy, 1.0));
  }
  // 앞면: 셔터 도크
  for (let i = 0; i < 3; i++) {
    const x = 30 + i * 32;
    sv.add(R(x, 160, 26, 38, 3, { fill: '#eef2f0', stroke: edge(t.c), sw: t.sw * 0.5 }));
    for (let j = 0; j < 5; j++) sv.add(P(`M${x + 2} ${166 + j * 6}H${x + 24}`, { stroke: '#b6c4bc', sw: 1.2 }));
  }
  sv.add(R(128, 146, 60, 7, 3, { fill: t.acc, stroke: edge(t.acc), sw: t.sw * 0.5 }));
  sv.add(door(t, 136, 153, 44, 45, '#e2f4e6', { glass: true, double: true }));
  sv.add(facePanel(t, 76, 132, 66, 30, 1.65, { r: 8 }));
  // 탑차 2대
  for (const x of [22, 118]) {
    sv.add(E(x + 44, 232, 40, 5, { fill: '#000', op: 0.12 }));
    box(t, { x: x + 20, y: 204, w: 68, h: 24, d: 14, r: 5, c: '#f7f9fb', line: '#8a95a8', parapet: false });
    sv.add(R(x + 20, 216, 68, 5, 0, { fill: t.acc }));
    sv.add(G(P(ticketPath(-8, -4, 16, 8, 2, 1.6, 1), { fill: '#ffb36b', stroke: '#c9861a', sw: 0.8 }), { tf: `translate(${x + 54} 210)` }));
    box(t, { x: x + 4, y: 210, w: 18, h: 18, d: 8, r: 5, c: t.acc, parapet: false });
    sv.add(win(t, x + 6, 212, 12, 7, { r: 2 }));
    sv.add(C(x + 14, 230, 4, { fill: '#4a4553' }), C(x + 76, 230, 4, { fill: '#4a4553' }));
  }
  sv.add(happySpark(t, 214, 44, 15));
};

/** 보스: 대장그룹 트윈타워 */
const boss: Draw = (t) => {
  const { sv } = t;
  const gold = '#ffd36b', goldD = '#b07d18';
  const glass = { top: '#fffbe8', bot: '#f0b938', mull: '#fff4c8', cols: 4, rows: 12, refl: 2 } as const;
  const L = box(t, { x: 22, y: 62, w: 60, h: 142, d: 22, k: 10, r: 8 });
  sv.add(glassWall(t, 27, 67, 50, 132, glass));
  const Rt = box(t, { x: 158, y: 62, w: 60, h: 142, d: 22, k: 10, r: 8 });
  sv.add(glassWall(t, 163, 67, 50, 132, glass));
  for (const b of [L, Rt]) {
    sv.add(R(b.x, b.y, b.w, 7, 3, { fill: t.acc, op: 0.85 }), R(b.x, b.y + 72, b.w, 4, 0, { fill: t.acc, op: 0.6 }));
    const [cx, cy] = b.rp(0.5, 0.5);
    sv.add(crownShape(t, cx, cy + 4, 1.05, '#c8a0ff'));
    sv.add(P(`M${cx} ${cy - 18}V${cy - 44}`, { stroke: goldD, sw: 2.4 }) + C(cx, cy - 46, 3.2, { fill: '#fff6c8', stroke: goldD, sw: 1.2 }));
  }
  // 식권 모양 현수막 + 얼굴
  sv.add(P('M92 80Q124 90 158 80', { fill: 'none', stroke: '#8a7a50', sw: 1.6 }));
  sv.add(P(ticketPath(96, 84, 58, 70, 8, 5, 3), { fill: edge('#ff9f43'), stroke: edge('#ff9f43'), sw: t.sw * 2 }));
  sv.add(P(ticketPath(96, 84, 58, 70, 8, 5, 3), { fill: sv.lin([[0, '#ffe2b8'], [1, '#ffb36b']]) }));
  sv.add(P('M104 138H146', { stroke: '#fff', sw: 1.6, da: '4 3', so: 0.9 }));
  sv.add(face(125, 104, 1.95, t.m, { brow: true }));
  sv.add(G(P(wonPath(5.5), { fill: 'none', stroke: '#fff', sw: 2.6 }), { tf: 'translate(125 146)' }));
  // 포디움
  box(t, { x: 12, y: 198, w: 216, h: 20, d: 14, r: 8, c: '#fff1c9', parapet: false });
  sv.add(R(86, 196, 78, 5, 2, { fill: gold, stroke: goldD, sw: t.sw * 0.5 }));
  sv.add(door(t, 100, 201, 50, 17, '#fff4d8', { glass: true, double: true }));
  sv.add(happySpark(t, 226, 40, 14) + (t.m === 'happy' ? sparkle(16, 60, 8) : ''));
};

const DRAW: Record<string, Draw> = { c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, r01, r02, r03, r04, r05, r06, r07, r08, r09, r10, boss };

export interface TargetInfo {
  c: string;
  acc: string;
}

/** 대상 SVG 본문 (viewBox 0 0 240 240). px = 논리 크기 */
export function targetBody(id: string, state: string, px: number, pre: string, info: TargetInfo): string | null {
  const key = id.replace(/^t\./, '');
  const fn = DRAW[key];
  if (!fn) return null;
  const mood: Mood = state === 'hit' ? 'hit' : state === 'happy' ? 'happy' : state === 'blink' ? 'blink' : 'idle';
  const sv = new Svg(pre);
  const t = makeCtx(sv, mood, info.c, info.acc, px);
  fn(t, state);
  return sv.body();
}

export { sweat, starPath, rTop };
