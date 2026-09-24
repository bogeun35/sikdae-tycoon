/**
 * 지도 장식 30종 (앵커 0.5, 1 = 밑동). 탑뷰(약간 비스듬한 위쪽 시점). 밑동에 옅은 그림자 포함.
 * viewBox 0 0 120 120, 밑동 (60, 114). d.magok.1 만 196 크기 비율 그대로 같은 viewBox.
 */
import type { Body } from '../render';
import { C, E, G, P, PL, R, Svg, darken, edge, lighten, mix, n2, rng } from '../kit';

const BX = 60, BY = 114;
let sv: Svg;
let SW = 2.4;

const gf = (c: string, k = 0.35) => sv.lin([[0, lighten(c, k)], [1, c]]);
const o = (c: string, grad = true, sw = SW) => ({ fill: grad ? gf(c) : c, stroke: edge(c), sw });
const shadow = (rx: number, ry = rx * 0.3, x = BX, y = BY - 2) => E(x, y, rx, ry, { fill: '#000', op: 0.16 });

/** 둥근 수관 나무 */
function tree(canopy: string, trunk = '#a8764e', h = 70, r = 34, kind: 'round' | 'ginkgo' | 'cherry' | 'weep' = 'round'): string {
  const top = BY - h;
  let s = shadow(r * 0.9, r * 0.3);
  s += R(BX - 5, top + r * 0.8, 10, BY - top - r * 0.8 - 2, 4, o(trunk));
  const cy = top;
  const blobs: [number, number, number][] =
    kind === 'ginkgo'
      ? [[0, 6, r * 0.8], [-r * 0.45, 12, r * 0.62], [r * 0.45, 12, r * 0.62], [0, -r * 0.35, r * 0.6]]
      : kind === 'weep'
        ? [[0, 0, r * 0.82], [-r * 0.6, 12, r * 0.55], [r * 0.6, 12, r * 0.55], [-r * 0.3, 20, r * 0.5], [r * 0.3, 20, r * 0.5]]
        : [[0, 0, r * 0.78], [-r * 0.5, 10, r * 0.6], [r * 0.5, 10, r * 0.6], [0, 14, r * 0.62]];
  const line = edge(canopy);
  for (const [dx, dy, rr] of blobs) s += C(BX + dx, cy + dy, rr, { fill: line, stroke: line, sw: SW * 2 });
  for (const [dx, dy, rr] of blobs) s += C(BX + dx, cy + dy, rr, { fill: sv.rad([[0, lighten(canopy, 0.4)], [1, canopy]], 0.35, 0.3, 0.8) });
  s += C(BX - r * 0.3, cy - r * 0.3, r * 0.22, { fill: '#fff', op: 0.35 });
  if (kind === 'cherry' || kind === 'weep') {
    const rn = rng(kind === 'weep' ? 11 : 7);
    for (let i = 0; i < 12; i++) s += C(BX + (rn() - 0.5) * r * 1.6, cy + (rn() - 0.4) * r * 1.2, 2.2, { fill: '#fff', op: 0.8 });
  }
  if (kind === 'ginkgo') {
    for (let i = 0; i < 6; i++) s += P(`M${BX - 18 + i * 7} ${cy + 4 + (i % 2) * 8}q3 -5 6 0`, { fill: 'none', stroke: darken(canopy, 0.8), sw: 1.4, so: 0.6 });
  }
  return s;
}

function lampPost(pole: string, head: string, h = 92, style: 'round' | 'old' | 'led' = 'round'): string {
  const top = BY - h;
  let s = shadow(12, 4);
  s += R(BX - 7, BY - 8, 14, 8, 3, o(darken(pole, 0.9)));
  s += R(BX - 3, top + 8, 6, h - 12, 3, o(pole));
  if (style === 'round') {
    s += C(BX, top + 4, 22, { fill: sv.rad([[0, '#fff6c8', 0.6], [1, '#fff6c8', 0]]) });
    s += C(BX, top + 4, 10, o(head)) + C(BX - 3, top + 1, 3, { fill: '#fff', op: 0.8 });
  } else if (style === 'old') {
    s += C(BX, top + 2, 24, { fill: sv.rad([[0, '#ffd98a', 0.55], [1, '#ffd98a', 0]]) });
    s += P(`M${BX - 11} ${top - 6}H${BX + 11}L${BX + 8} ${top + 12}H${BX - 8}Z`, o('#ffe9a8')) + P(`M${BX - 14} ${top - 6}L${BX} ${top - 16}L${BX + 14} ${top - 6}Z`, o(pole)) + P(`M${BX} ${top - 6}V${top + 12}M${BX - 10} ${top + 3}H${BX + 10}`, { stroke: edge('#ffe9a8'), sw: 1.4 });
  } else {
    s += P(`M${BX} ${top + 8}Q${BX} ${top - 4} ${BX + 16} ${top - 4}`, { fill: 'none', stroke: edge(pole), sw: 7 }) + P(`M${BX} ${top + 8}Q${BX} ${top - 4} ${BX + 16} ${top - 4}`, { fill: 'none', stroke: pole, sw: 4 });
    s += R(BX + 10, top - 8, 20, 7, 3.5, o('#f4f7fa')) + E(BX + 20, top + 2, 14, 6, { fill: '#fff6c8', op: 0.6 });
  }
  return s;
}

type Draw = () => string;

const DRAW: Record<string, Draw> = {
  /* 을지로 */
  'd.euljiro.0': () => {
    // 노포 간판 (세로 입간판 + 전구 테두리)
    let s = shadow(20, 6) + R(BX - 4, 88, 8, 24, 2, o('#8a6a4a'));
    s += R(BX - 20, 18, 40, 72, 6, o('#ff9a8a')) + R(BX - 14, 24, 28, 60, 4, { fill: '#fff4dc', stroke: edge('#ff9a8a'), sw: 1.6 });
    for (let i = 0; i < 4; i++) s += R(BX - 9, 30 + i * 13, 18, 8, 2, { fill: ['#e0955a', '#ff7b5e', '#e0955a', '#7fc4b8'][i] });
    for (let i = 0; i < 8; i++) s += C(BX - 20, 22 + i * 9.5, 2.2, { fill: '#ffe066', stroke: '#c9a13d', sw: 0.8 }) + C(BX + 20, 22 + i * 9.5, 2.2, { fill: '#ffe066', stroke: '#c9a13d', sw: 0.8 });
    return s;
  },
  'd.euljiro.1': () => {
    // 평상 + 주전자
    let s = shadow(46, 10);
    s += P('M16 100L24 110M104 100L96 110', { stroke: '#8a5a3a', sw: 5 });
    s += PL([14, 76, 106, 76, 110, 96, 10, 96], o('#e8c08a')) + R(10, 96, 100, 8, 3, o('#c9955a'));
    for (let i = 1; i < 6; i++) s += P(`M${14 + i * 16} 77L${10 + i * 17} 96`, { stroke: darken('#e8c08a', 0.82), sw: 1.4 });
    s += E(46, 84, 14, 6, o('#8fb3d6')) + R(36, 72, 20, 12, 5, o('#c8d6e6')) + P('M56 76Q64 74 62 82', { fill: 'none', stroke: '#8a95a8', sw: 2 }) + E(78, 86, 10, 5, o('#fff4dc'));
    return s;
  },
  'd.euljiro.2': () => {
    // 인쇄소 롤지 (눕힌 두루마리 3개)
    let s = shadow(44, 9);
    const roll = (x: number, y: number) =>
      R(x - 20, y - 14, 40, 28, 13, o('#fdf8ee')) + E(x + 20, y, 7, 14, { fill: '#f0e6d4', stroke: '#b8a88e', sw: SW }) + E(x + 20, y, 2.6, 5, { fill: '#c9b89c' }) + P(`M${x - 14} ${y - 8}H${x + 12}`, { stroke: '#fff', sw: 2.4, so: 0.8 });
    s += roll(38, 96) + roll(78, 96) + roll(58, 70);
    return s;
  },
  'd.euljiro.3': () => lampPost('#3f5a4a', '#ffe9a8', 96, 'old'),
  /* 강남 */
  'd.gangnam.0': () => tree('#ffe066', '#a8764e', 74, 34, 'ginkgo'),
  'd.gangnam.1': () => {
    // 버스 정류장
    let s = shadow(50, 10);
    s += R(18, 58, 6, 52, 2, o('#8a95a8')) + R(96, 58, 6, 52, 2, o('#8a95a8'));
    s += R(22, 66, 76, 36, 3, { fill: '#dff4ff', fo: 0.55, stroke: '#8fb3d6', sw: 1.6 });
    s += R(30, 92, 60, 7, 3, o('#c98a5a')) + P('M36 99v8M84 99v8', { stroke: '#8a5a3a', sw: 3 });
    s += PL([10, 50, 110, 50, 104, 62, 16, 62], o('#8fd3ff'));
    s += R(104, 30, 5, 80, 2, o('#6a7a90')) + C(106.5, 30, 9, o('#4aa3df')) + R(102, 26, 9, 8, 2, { fill: '#fff' });
    return s;
  },
  'd.gangnam.2': () => {
    // 대형 전광판
    let s = shadow(40, 8) + R(34, 76, 8, 36, 2, o('#8a95a8')) + R(78, 76, 8, 36, 2, o('#8a95a8'));
    s += R(10, 14, 100, 64, 8, o('#3a4a6e', false));
    s += R(16, 20, 88, 52, 4, { fill: sv.lin([[0, '#ff9fbb'], [0.5, '#c8a0ff'], [1, '#8fd3ff']], 0, 0, 1, 1) });
    s += C(42, 46, 14, { fill: '#fff6c8', op: 0.9 }) + R(62, 32, 34, 7, 3.5, { fill: '#fff', op: 0.85 }) + R(62, 44, 26, 6, 3, { fill: '#fff', op: 0.6 }) + R(62, 55, 30, 6, 3, { fill: '#fff', op: 0.6 });
    s += P('M20 24L40 24', { stroke: '#fff', sw: 2, so: 0.5 });
    return s;
  },
  'd.gangnam.3': () => {
    // 신호등 (가로형)
    let s = shadow(14, 4) + R(BX - 4, 26, 8, 86, 3, o('#6a7a90')) + R(BX - 8, 104, 16, 8, 3, o('#5a6a80'));
    s += P(`M${BX} 30H${BX + 14}`, { stroke: '#6a7a90', sw: 5 });
    s += R(BX + 10, 18, 44, 20, 6, o('#3a4458', false)) + C(BX + 20, 28, 6, { fill: '#ff6b6b' }) + C(BX + 32, 28, 6, { fill: '#ffd36b', op: 0.35 }) + C(BX + 44, 28, 6, { fill: '#7cd07c', op: 0.35 });
    s += R(BX - 16, 54, 12, 22, 3, o('#3a4458', false)) + C(BX - 10, 60, 3.6, { fill: '#ff6b6b', op: 0.4 }) + C(BX - 10, 70, 3.6, { fill: '#7cd07c' });
    return s;
  },
  /* 여의도 */
  'd.yeouido.0': () => {
    // 한강 난간
    let s = shadow(52, 6);
    for (let i = 0; i < 5; i++) s += R(8 + i * 24, 70, 8, 42, 3, o('#e6eef5'));
    s += R(4, 66, 112, 10, 5, o('#8fd3ff')) + R(4, 90, 112, 6, 3, o('#c8d6e6'));
    s += P('M10 69H110', { stroke: '#fff', sw: 2, so: 0.8 });
    return s;
  },
  'd.yeouido.1': () => tree('#ffc7d9', '#a8764e', 72, 36, 'cherry'),
  'd.yeouido.2': () => {
    // 자전거 대여소
    let s = shadow(50, 8);
    const bike = (x: number) =>
      C(x - 13, 98, 10, { fill: 'none', stroke: '#4a5553', sw: 3 }) + C(x + 13, 98, 10, { fill: 'none', stroke: '#4a5553', sw: 3 }) +
      P(`M${x - 13} 98L${x - 3} 82H${x + 9}L${x + 13} 98M${x - 3} 82L${x + 2} 98L${x + 9} 82`, { fill: 'none', stroke: '#5fbf9a', sw: 3.2 }) + P(`M${x + 9} 82L${x + 7} 76H${x + 13}M${x - 5} 80H${x + 1}`, { fill: 'none', stroke: '#4a5553', sw: 2.4 }) +
      R(x + 7, 72, 10, 6, 2, { fill: '#8fe0c0', stroke: '#4f9e7a', sw: 1 });
    s += bike(34) + bike(76);
    s += R(96, 44, 18, 58, 4, o('#8fe0c0')) + R(99, 50, 12, 14, 2, { fill: '#2f3a5a' }) + R(99, 70, 12, 4, 2, { fill: '#fff' });
    return s;
  },
  'd.yeouido.3': () => {
    // 증권 전광판
    let s = shadow(40, 8) + R(56, 76, 8, 36, 2, o('#8a95a8'));
    s += R(8, 16, 104, 62, 8, o('#2f3a5a', false));
    s += R(14, 22, 92, 50, 4, { fill: '#1f2842' });
    const bars = [[20, 50, 12, '#ff6b6b'], [30, 44, 16, '#ff6b6b'], [40, 52, 10, '#6fa7e6'], [50, 38, 20, '#ff6b6b'], [60, 34, 18, '#ff6b6b'], [70, 42, 12, '#6fa7e6'], [80, 30, 20, '#ff6b6b']] as const;
    for (const [x, y, h, c] of bars) s += R(x, y, 6, h, 1, { fill: c }) + P(`M${x + 3} ${y - 4}V${y + h + 4}`, { stroke: c, sw: 1.2 });
    s += P('M18 60L40 50L56 54L86 30', { fill: 'none', stroke: '#ffe066', sw: 2.4 }) + P('M88 26L96 26L94 36', { fill: 'none', stroke: '#ffe066', sw: 2.4 });
    return s;
  },
  /* 판교 (밤) */
  'd.pangyo.0': () => {
    // 네온 간판
    let s = shadow(22, 6) + R(BX - 4, 76, 8, 36, 2, o('#4a5878'));
    s += R(22, 18, 76, 58, 10, o('#2a3050', false));
    s += R(30, 26, 60, 42, 8, { fill: 'none', stroke: '#ff8fdf', sw: 7, so: 0.3 }) + R(30, 26, 60, 42, 8, { fill: 'none', stroke: '#ffc8f0', sw: 2.4 });
    s += C(48, 47, 10, { fill: 'none', stroke: '#8ff0ff', sw: 6, so: 0.3 }) + C(48, 47, 10, { fill: 'none', stroke: '#c8faff', sw: 2.2 });
    s += P('M64 40H80M64 48H76M64 56H82', { stroke: '#ffe98a', sw: 2.6 });
    return s;
  },
  'd.pangyo.1': () => {
    // 편의점 불빛 (자판기 + 빛 웅덩이)
    let s = E(BX, BY - 4, 50, 14, { fill: '#ffe9a8', op: 0.35 }) + E(BX, BY - 4, 30, 8, { fill: '#fff6c8', op: 0.45 });
    s += R(30, 30, 30, 80, 6, o('#8fd3ff')) + R(34, 36, 22, 40, 3, { fill: '#fff6c8' });
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) s += R(36 + k * 7, 40 + r * 12, 5, 8, 1.5, { fill: ['#ff8f8f', '#ffd36b', '#8fe0c0'][(r + k) % 3] });
    s += R(36, 84, 18, 8, 2, { fill: '#2f3a5a' });
    s += R(64, 44, 26, 66, 6, o('#ffb3c1')) + R(68, 50, 18, 30, 3, { fill: '#fff6c8' }) + R(70, 86, 14, 6, 2, { fill: '#2f3a5a' });
    return s;
  },
  'd.pangyo.2': () => {
    // 자전거 거치대 (밤)
    let s = shadow(48, 7);
    for (let i = 0; i < 4; i++) s += P(`M${20 + i * 26} 110V88Q${20 + i * 26} 78 ${30 + i * 26} 78Q${40 + i * 26} 78 ${40 + i * 26} 88V110`, { fill: 'none', stroke: '#c8d0e0', sw: 3.4 });
    const bike = (x: number, col: string) =>
      C(x - 12, 100, 9, { fill: 'none', stroke: '#e6ecf5', sw: 2.6 }) + C(x + 12, 100, 9, { fill: 'none', stroke: '#e6ecf5', sw: 2.6 }) + P(`M${x - 12} 100L${x - 3} 86H${x + 8}L${x + 12} 100`, { fill: 'none', stroke: col, sw: 3 });
    s += bike(34, '#ff8fab') + bike(82, '#8fe0c0');
    return s;
  },
  'd.pangyo.3': () => {
    // 야식 오토바이
    let s = shadow(40, 8);
    s += C(30, 98, 12, o('#3a3a48', false)) + C(90, 98, 12, o('#3a3a48', false)) + C(30, 98, 5, { fill: '#c8d0da' }) + C(90, 98, 5, { fill: '#c8d0da' });
    s += P('M26 86L40 60H50L56 86Z', o('#ff9a3c')) + P('M40 86H96Q100 86 98 96H36Z', o('#fff4e6'));
    s += R(62, 52, 34, 32, 6, o('#ffb78a')) + P('M72 62Q76 56 84 60Q88 66 82 70Q76 72 72 68Z', { fill: '#e89a4a', stroke: '#9a5a22', sw: 1.2 });
    s += C(24, 70, 5, { fill: '#fff6b0' }) + E(10, 72, 16, 5, { fill: '#fff6b0', op: 0.35 });
    return s;
  },
  /* 마곡 */
  'd.magok.0': () => {
    // 타워 크레인
    let s = shadow(24, 6);
    s += R(BX - 10, 104, 20, 8, 2, o('#8a95a8'));
    const mast = '#ffd34d';
    s += R(BX - 6, 20, 12, 86, 1, { fill: 'none', stroke: edge(mast), sw: 5 }) + R(BX - 6, 20, 12, 86, 1, { fill: 'none', stroke: mast, sw: 3 });
    for (let y = 26; y < 104; y += 10) s += P(`M${BX - 6} ${y}L${BX + 6} ${y + 10}M${BX + 6} ${y}L${BX - 6} ${y + 10}`, { stroke: mast, sw: 1.6 });
    s += R(6, 14, 108, 8, 2, o(mast)) + R(BX - 10, 8, 20, 14, 3, o('#ff9a3c')) + R(BX - 7, 11, 8, 6, 1, { fill: '#dff4ff' });
    s += R(6, 22, 16, 12, 2, o('#8a95a8'));
    s += P('M96 22V52', { stroke: '#6a7a90', sw: 1.6 }) + R(90, 52, 12, 8, 2, o('#ff9a3c')) + P('M96 60V64', { stroke: '#6a7a90', sw: 1.6 });
    return s;
  },
  'd.magok.1': () => {
    // 식물원 돔 (큰 장식)
    let s = shadow(56, 12);
    s += P('M4 112Q4 20 60 18Q116 20 116 112Z', { fill: sv.lin([[0, '#f0fbff'], [1, '#bfe6f5']], 0, 0, 1, 1), fo: 0.95, stroke: '#6fa7c8', sw: SW });
    s += P('M26 112Q24 34 60 18Q96 34 94 112M44 112Q42 30 60 18Q78 30 76 112', { fill: 'none', stroke: '#8fbfd8', sw: 1.8 });
    s += P('M8 86H112M14 62Q60 54 106 62M28 40Q60 32 92 40', { fill: 'none', stroke: '#8fbfd8', sw: 1.8 });
    s += C(40, 96, 14, { fill: '#8fd07e', stroke: '#4f9e4a', sw: 1.6 }) + C(60, 90, 18, { fill: '#9fdc8c', stroke: '#4f9e4a', sw: 1.6 }) + C(82, 96, 13, { fill: '#8fd07e', stroke: '#4f9e4a', sw: 1.6 }) + C(66, 84, 3, { fill: '#ff8fab' }) + C(46, 92, 2.6, { fill: '#ffe066' });
    s += P('M30 34Q46 22 62 22', { fill: 'none', stroke: '#fff', sw: 4, so: 0.8 });
    s += R(2, 108, 116, 6, 3, o('#c8d0da'));
    return s;
  },
  'd.magok.2': () => lampPost('#e6eef5', '#fff6c8', 94, 'led'),
  'd.magok.3': () => {
    // 공사 펜스
    let s = shadow(54, 6);
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 36;
      s += R(x, 64, 34, 40, 3, o('#fdfdfd'));
      s += G(R(x, 76, 34, 12, 0, { fill: '#ff9a3c' }) + P(`M${x} 88L${x + 12} 76M${x + 12} 88L${x + 24} 76M${x + 24} 88L${x + 34} 78`, { stroke: '#fff', sw: 4 }), { cp: sv.clip(R(x, 64, 34, 40, 3)) });
      s += R(x + 2, 104, 8, 8, 2, o('#8a95a8')) + R(x + 24, 104, 8, 8, 2, o('#8a95a8'));
    }
    return s;
  },
  /* 세종 */
  'd.sejong.0': () => {
    // 청사 표지석
    let s = shadow(40, 8);
    s += R(18, 96, 84, 14, 4, o('#d8d2c8'));
    s += P('M26 98Q22 50 40 42Q60 34 82 44Q98 54 94 98Z', o('#e8e2d6'));
    s += R(40, 56, 40, 4, 2, { fill: '#9a8e7c' }) + R(44, 66, 32, 4, 2, { fill: '#9a8e7c' }) + R(48, 76, 24, 4, 2, { fill: '#b8ad9a' });
    s += P('M36 52Q50 44 64 44', { fill: 'none', stroke: '#fff', sw: 3, so: 0.7 });
    return s;
  },
  'd.sejong.1': () => tree('#ffb8d0', '#9a6a4e', 74, 34, 'weep'),
  'd.sejong.2': () => {
    // 곡선 지붕 정자
    let s = shadow(50, 9);
    s += R(16, 100, 88, 10, 3, o('#e2d6c0'));
    for (const x of [26, 48, 70, 90]) s += R(x - 3, 60, 7, 42, 2, o('#c9955a'));
    s += P('M4 58Q30 66 60 50Q90 66 116 58L108 44Q84 50 60 26Q36 50 12 44Z', o('#7fc4b8'));
    s += P('M60 26V18', { stroke: '#8a6a4a', sw: 3 }) + C(60, 16, 3.4, o('#ffd36b', false));
    s += P('M14 50Q36 54 60 38Q84 54 106 50', { fill: 'none', stroke: lighten('#7fc4b8', 0.5), sw: 2.4 });
    return s;
  },
  'd.sejong.3': () => {
    // 호수 분수
    let s = E(BX, BY - 8, 50, 12, { fill: '#a8dcff', stroke: '#7fb8e0', sw: SW });
    s += E(BX, BY - 10, 16, 5, o('#e6eef5'));
    s += P(`M${BX} ${BY - 12}Q${BX - 5} ${BY - 60} ${BX} ${BY - 96}Q${BX + 5} ${BY - 60} ${BX} ${BY - 12}Z`, { fill: '#e6f6ff', stroke: '#7fc0e8', sw: 1.6 });
    s += P(`M${BX} ${BY - 90}Q${BX - 24} ${BY - 84} ${BX - 30} ${BY - 16}M${BX} ${BY - 90}Q${BX + 24} ${BY - 84} ${BX + 30} ${BY - 16}`, { fill: 'none', stroke: '#bfe8ff', sw: 3 });
    for (let i = 0; i < 7; i++) s += C(BX - 28 + i * 9, BY - 16 - (i % 2) * 4, 2, { fill: '#fff', op: 0.9 });
    return s;
  },
  /* 공통 */
  'd.tree': () => tree('#9fd89a', '#a8764e', 70, 36),
  'd.lamp': () => lampPost('#3d4f7a', '#ffe9a8', 96),
  'd.bench': () => {
    let s = shadow(46, 8);
    s += P('M20 104V112M100 104V112M24 88V100M96 88V100', { stroke: '#6a4a32', sw: 5 });
    s += R(12, 82, 96, 12, 4, o('#c98a5a')) + R(12, 96, 96, 10, 4, o('#b97a4a'));
    s += R(12, 66, 96, 12, 4, o('#d9a06a')) + P('M16 70H104', { stroke: '#fff', sw: 2, so: 0.4 });
    return s;
  },
  'd.flower': () => {
    let s = shadow(34, 8);
    s += P('M24 76H96L88 112H32Z', o('#e8a07a'));
    s += R(20, 70, 80, 10, 4, o('#d98a62'));
    const fl = (x: number, y: number, c: string) =>
      [0, 72, 144, 216, 288].map((r) => E(x, y - 6, 5, 7, { fill: c, stroke: edge(c), sw: 1.2, tf: `rotate(${r} ${x} ${y})` })).join('') + C(x, y, 4, { fill: '#ffe066' });
    s += C(40, 64, 12, { fill: '#8fd07e', stroke: '#4f9e4a', sw: 1.6 }) + C(80, 64, 12, { fill: '#8fd07e', stroke: '#4f9e4a', sw: 1.6 }) + C(60, 60, 13, { fill: '#9fdc8c', stroke: '#4f9e4a', sw: 1.6 });
    s += fl(36, 56, '#ff9fbb') + fl(60, 44, '#ffe066') + fl(84, 56, '#ff9fbb') + fl(50, 66, '#ffffff') + fl(72, 66, '#c8a0ff');
    return s;
  },
  'd.fountain': () => {
    let s = E(BX, BY - 12, 54, 18, { fill: '#000', op: 0.14 });
    s += E(BX, BY - 20, 54, 20, o('#e6eef5'));
    s += E(BX, BY - 22, 44, 14, { fill: sv.rad([[0, '#dff4ff'], [1, '#8fd3ff']]) });
    s += R(BX - 8, BY - 58, 16, 36, 5, o('#e6eef5')) + E(BX, BY - 58, 20, 7, o('#e6eef5'));
    s += P(`M${BX} ${BY - 60}Q${BX - 4} ${BY - 90} ${BX} ${BY - 104}Q${BX + 4} ${BY - 90} ${BX} ${BY - 60}Z`, { fill: '#e6f6ff', stroke: '#7fc0e8', sw: 1.6 });
    s += P(`M${BX} ${BY - 100}Q${BX - 22} ${BY - 96} ${BX - 30} ${BY - 26}M${BX} ${BY - 100}Q${BX + 22} ${BY - 96} ${BX + 30} ${BY - 26}`, { fill: 'none', stroke: '#bfe8ff', sw: 3.4 });
    for (let i = 0; i < 8; i++) s += C(BX - 34 + i * 10, BY - 22 + (i % 2) * 3, 2.2, { fill: '#fff', op: 0.9 });
    return s;
  },
  'd.cone': () => {
    let s = shadow(34, 9);
    s += R(22, 96, 76, 12, 4, o('#ff9a3c'));
    s += P('M48 22H72L90 98H30Z', o('#ffa24a'));
    s += PL([43, 44, 77, 44, 81, 60, 39, 60], { fill: '#fff' }) + PL([35, 76, 85, 76, 88, 88, 32, 88], { fill: '#fff' });
    s += R(48, 18, 24, 8, 4, o('#ff9a3c'));
    return s;
  },
};

export function decorBody(id: string, pre: string, w: number, h: number): Body | null {
  const fn = DRAW[id];
  if (!fn) return null;
  sv = new Svg(pre);
  SW = Math.max(1.6, 2.6 * (120 / Math.max(w, h)) * 0.75);
  sv.add(fn());
  void mix; void n2;
  return { vb: [0, 0, 120, 120], body: sv.body() };
}
