/**
 * 그림 공통 도구 — 색 함수, SVG 조각, 콩눈 얼굴, 반짝이.
 * 그림체: 참치 타이쿤 "콩눈 파스텔" (둥근 도형 · 부드러운 파스텔 그라데이션 · 작은 검은 콩 눈 + 흰 하이라이트 · 볼터치 · 짙은 동계열 외곽선)
 * SVG 안에 <text>·외부 href·foreignObject 금지 (캔버스 오염·글꼴 없음). 글자 모양이 필요하면 path 로 그린다.
 */

export const INK = '#2a2118';
export const BLUSH = '#ffb3c1';
export const WHITE = '#ffffff';
export const CREAM = '#fff8ec';
export const GOLD = '#ffd36b';
export const GOLD_D = '#c9a13d';
export const CORAL = '#ff7b5e';
export const PINK = '#ff8fab';
export const SKY = '#4aa3df';
export const MINT = '#8fe0c0';
export const GREEN = '#5cb85c';
export const PURPLE = '#9b7bd8';
export const RED = '#e53935';

/* ───────── 색 ───────── */

function clamp255(x: number): number {
  return x < 0 ? 0 : x > 255 ? 255 : Math.round(x);
}
export function rgb(c: string): [number, number, number] {
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => clamp255(x).toString(16).padStart(2, '0')).join('');
}
/** 원작 lighten: 채널마다 흰쪽으로 t(기본 60%) */
export function lighten(c: string, t = 0.6): string {
  const [r, g, b] = rgb(c);
  return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
/** 원작 darken: 채널 × k(기본 0.72) */
export function darken(c: string, k = 0.72): string {
  const [r, g, b] = rgb(c);
  return hex(r * k, g * k, b * k);
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
/** 외곽선 색 = 짙은 동계열 (채도는 살짝 올림) */
export function edge(c: string): string {
  const [r, g, b] = rgb(c);
  const m = (r + g + b) / 3;
  const k = 0.5;
  return hex((m + (r - m) * 1.35) * k, (m + (g - m) * 1.35) * k, (m + (b - m) * 1.35) * k);
}

/* ───────── SVG 조각 ───────── */

export type At = Record<string, string | number | undefined | null | false>;
const ALIAS: Record<string, string> = {
  sw: 'stroke-width',
  op: 'opacity',
  fo: 'fill-opacity',
  so: 'stroke-opacity',
  lc: 'stroke-linecap',
  lj: 'stroke-linejoin',
  da: 'stroke-dasharray',
  tf: 'transform',
  fr: 'fill-rule',
  cp: 'clip-path',
  mk: 'mask',
};
export function n2(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}
export function at(a?: At): string {
  if (!a) return '';
  let s = '';
  let hasStroke = false;
  for (const k in a) {
    const v = a[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'stroke' && v !== 'none') hasStroke = true;
    s += ` ${ALIAS[k] ?? k}="${typeof v === 'number' ? n2(v) : v}"`;
  }
  if (hasStroke) {
    if (a.lj === undefined) s += ' stroke-linejoin="round"';
    if (a.lc === undefined) s += ' stroke-linecap="round"';
  }
  return s;
}
export const R = (x: number, y: number, w: number, h: number, rx = 0, a?: At): string =>
  `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(Math.max(0, w))}" height="${n2(Math.max(0, h))}"${rx ? ` rx="${n2(Math.min(rx, w / 2, h / 2))}"` : ''}${at(a)}/>`;
export const E = (cx: number, cy: number, rx: number, ry: number, a?: At): string =>
  `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}"${at(a)}/>`;
export const C = (cx: number, cy: number, r: number, a?: At): string => `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}"${at(a)}/>`;
export const P = (d: string, a?: At): string => `<path d="${d}"${at(a)}/>`;
export const PL = (pts: number[], a?: At): string => {
  let s = '';
  for (let i = 0; i < pts.length; i += 2) s += (i ? ' ' : '') + n2(pts[i]) + ',' + n2(pts[i + 1]);
  return `<polygon points="${s}"${at(a)}/>`;
};
export const LN = (pts: number[], a?: At): string => {
  let s = '';
  for (let i = 0; i < pts.length; i += 2) s += (i ? ' ' : '') + n2(pts[i]) + ',' + n2(pts[i + 1]);
  return `<polyline points="${s}" fill="none"${at(a)}/>`;
};
export const G = (inner: string, a?: At): string => `<g${at(a)}>${inner}</g>`;
export const T = (x: number, y: number, s = 1, rot = 0): string =>
  `translate(${n2(x)} ${n2(y)})${rot ? ` rotate(${n2(rot)})` : ''}${s !== 1 ? ` scale(${n2(s)})` : ''}`;

/** 모서리 둥근 다각형 path (각 꼭짓점을 r 로 깎음) */
export function roundPoly(pts: number[], r: number): string {
  const n = pts.length / 2;
  let d = '';
  for (let i = 0; i < n; i++) {
    const x0 = pts[((i - 1 + n) % n) * 2], y0 = pts[((i - 1 + n) % n) * 2 + 1];
    const x1 = pts[i * 2], y1 = pts[i * 2 + 1];
    const x2 = pts[((i + 1) % n) * 2], y2 = pts[((i + 1) % n) * 2 + 1];
    const l1 = Math.hypot(x0 - x1, y0 - y1), l2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = x1 + ((x0 - x1) / l1) * rr, ay = y1 + ((y0 - y1) / l1) * rr;
    const bx = x1 + ((x2 - x1) / l2) * rr, by = y1 + ((y2 - y1) / l2) * rr;
    d += (i ? 'L' : 'M') + n2(ax) + ' ' + n2(ay) + 'Q' + n2(x1) + ' ' + n2(y1) + ' ' + n2(bx) + ' ' + n2(by);
  }
  return d + 'Z';
}

/** 위 모서리만 둥근 사각형 path */
export function rTop(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h);
  return `M${n2(x)} ${n2(y + h)}V${n2(y + r)}Q${n2(x)} ${n2(y)} ${n2(x + r)} ${n2(y)}H${n2(x + w - r)}Q${n2(x + w)} ${n2(y)} ${n2(x + w)} ${n2(y + r)}V${n2(y + h)}Z`;
}
/** 아래 모서리만 둥근 사각형 path */
export function rBot(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h);
  return `M${n2(x)} ${n2(y)}H${n2(x + w)}V${n2(y + h - r)}Q${n2(x + w)} ${n2(y + h)} ${n2(x + w - r)} ${n2(y + h)}H${n2(x + r)}Q${n2(x)} ${n2(y + h)} ${n2(x)} ${n2(y + h - r)}Z`;
}

/** 문자열 해시 → 짧은 id 접두어 (DOM innerHTML 로 여러 SVG 를 넣어도 gradient id 가 겹치지 않게) */
export function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'k' + (h >>> 0).toString(36);
}

/** 결정적 난수 (그림이 매번 같게) */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** SVG 한 장을 만드는 도구 (defs 의 id 를 key 별로 고유하게) */
export class Svg {
  private defs: string[] = [];
  private parts: string[] = [];
  private n = 0;
  constructor(readonly pre: string) {}
  uid(): string {
    return this.pre + '_' + (this.n++).toString(36);
  }
  /** 선형 그라데이션. stops = [offset, color, opacity?] (기본 위→아래) */
  lin(stops: Array<[number, string, number?]>, x1 = 0, y1 = 0, x2 = 0, y2 = 1, units?: 'user'): string {
    const id = this.uid();
    this.defs.push(
      `<linearGradient id="${id}" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}"${units ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopStr(stops)}</linearGradient>`,
    );
    return `url(#${id})`;
  }
  /** 방사 그라데이션 (objectBoundingBox 기준) */
  rad(stops: Array<[number, string, number?]>, cx = 0.5, cy = 0.5, r = 0.5, fx?: number, fy?: number, units?: 'user'): string {
    const id = this.uid();
    this.defs.push(
      `<radialGradient id="${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}"${fx !== undefined ? ` fx="${n2(fx)}" fy="${n2(fy ?? cy)}"` : ''}${units ? ' gradientUnits="userSpaceOnUse"' : ''}>${stopStr(stops)}</radialGradient>`,
    );
    return `url(#${id})`;
  }
  /** clipPath 정의 → clip-path 값 */
  clip(inner: string): string {
    const id = this.uid();
    this.defs.push(`<clipPath id="${id}">${inner}</clipPath>`);
    return `url(#${id})`;
  }
  /** 필터(가우시안 흐림) → filter 값 */
  blur(sd: number): string {
    const id = this.uid();
    this.defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n2(sd)}"/></filter>`);
    return `url(#${id})`;
  }
  /** 패턴 정의 → fill 값 */
  pattern(w: number, h: number, inner: string, tf?: string): string {
    const id = this.uid();
    this.defs.push(`<pattern id="${id}" width="${n2(w)}" height="${n2(h)}" patternUnits="userSpaceOnUse"${tf ? ` patternTransform="${tf}"` : ''}>${inner}</pattern>`);
    return `url(#${id})`;
  }
  def(raw: string): void {
    this.defs.push(raw);
  }
  add(...s: string[]): this {
    for (const x of s) if (x) this.parts.push(x);
    return this;
  }
  body(): string {
    return (this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '') + this.parts.join('');
  }
}
function stopStr(stops: Array<[number, string, number?]>): string {
  return stops
    .map(([o, c, a]) => `<stop offset="${n2(o)}" stop-color="${c}"${a !== undefined && a !== 1 ? ` stop-opacity="${n2(a)}"` : ''}/>`)
    .join('');
}

/** 완성 SVG 문자열 */
export function wrapSvg(w: number, h: number, vb: [number, number, number, number], inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}" viewBox="${vb.map(n2).join(' ')}">${inner}</svg>`;
}

/* ───────── 콩눈 얼굴 ───────── */

export type Mood = 'idle' | 'blink' | 'hit' | 'happy';

export interface FaceOpt {
  /** 볼터치 색 */
  blush?: string | false;
  /** 눈 간격 배율 (기본 1 = 13) */
  gap?: number;
  /** 입 모양 강제 */
  mouth?: 'smile' | 'none' | 'beak' | 'cat';
  /** 눈썹 (위엄) */
  brow?: boolean;
  /** 눈 색 */
  ink?: string;
  /** 하이라이트 끔 */
  noShine?: boolean;
  /** 땀방울 (hit) 끔 */
  noSweat?: boolean;
}

/**
 * 원작 face() 를 가운데 기준으로 옮긴 것. (cx, cy) = 두 눈 가운데, s = 배율.
 * 원작 값: 눈 세로 타원 rx 2.6 ry 4 간격 13, 볼 r 3.2 (#ffb3c1 .8), 입 Q 곡선 1.6.
 * 추가: 흰 하이라이트, 상태별 눈·입.
 */
export function face(cx: number, cy: number, s: number, mood: Mood, o: FaceOpt = {}): string {
  const ink = o.ink ?? INK;
  const g = 6.5 * (o.gap ?? 1);
  const out: string[] = [];
  const blush = o.blush === false ? '' : o.blush ?? BLUSH;
  const sw = 1.6;
  // 볼
  if (blush) {
    const br = mood === 'happy' ? 3.9 : 3.3;
    const bo = mood === 'happy' ? 0.95 : mood === 'hit' ? 0.55 : 0.8;
    const bc = mood === 'happy' ? mix(blush, '#ff6f91', 0.35) : blush;
    out.push(E(-g - 4, 7, br * 1.1, br * 0.85, { fill: bc, op: bo }), E(g + 4, 7, br * 1.1, br * 0.85, { fill: bc, op: bo }));
  }
  // 눈썹
  if (o.brow) {
    const by = mood === 'hit' ? -7.4 : -7;
    out.push(
      P(`M${-g - 3.4} ${by + 0.6}Q${-g} ${by - 1.8} ${-g + 3.2} ${by}`, { fill: 'none', stroke: ink, sw: 1.5 }),
      P(`M${g + 3.4} ${by + 0.6}Q${g} ${by - 1.8} ${g - 3.2} ${by}`, { fill: 'none', stroke: ink, sw: 1.5 }),
    );
  }
  // 눈
  for (const side of [-1, 1]) {
    const ex = side * g;
    if (mood === 'idle') {
      out.push(E(ex, 0, 2.6, 4, { fill: ink }));
      if (!o.noShine) out.push(C(ex - 0.8, -1.5, 0.95, { fill: '#fff' }));
    } else if (mood === 'blink') {
      out.push(P(`M${ex - 2.9} ${0.2}Q${ex} ${2.9} ${ex + 2.9} ${0.2}`, { fill: 'none', stroke: ink, sw }));
    } else if (mood === 'hit') {
      // > <  질끈 감은 눈
      const d = side < 0 ? `M${ex - 2.6} ${-3}L${ex + 2.2} 0L${ex - 2.6} 3` : `M${ex + 2.6} ${-3}L${ex - 2.2} 0L${ex + 2.6} 3`;
      out.push(P(d, { fill: 'none', stroke: ink, sw: 1.7 }));
    } else {
      // ^^ 웃는 눈
      out.push(P(`M${ex - 3} ${1.2}Q${ex} ${-3.6} ${ex + 3} ${1.2}`, { fill: 'none', stroke: ink, sw: 1.8 }));
    }
  }
  // 입
  const mouth = o.mouth ?? 'smile';
  if (mouth === 'beak') {
    out.push(P('M-3.4 4.6Q0 3.4 3.4 4.6L0 9.2Z', { fill: '#ffc247', stroke: darken('#ffc247', 0.7), sw: 0.8 }));
  } else if (mouth !== 'none') {
    if (mood === 'happy') {
      out.push(P('M-3.4 6.4Q0 6.9 3.4 6.4Q3 12.6 0 12.6Q-3 12.6 -3.4 6.4Z', { fill: ink }));
      out.push(E(0, 10.9, 1.9, 1.3, { fill: '#ff8fa3' }));
    } else if (mood === 'hit') {
      out.push(P('M-4 8.6q1 -1.6 2 0t2 0t2 0t2 0', { fill: 'none', stroke: ink, sw: 1.4 }));
    } else if (mouth === 'cat') {
      out.push(P('M-3.2 7Q-1.6 9.4 0 7Q1.6 9.4 3.2 7', { fill: 'none', stroke: ink, sw }));
    } else {
      out.push(P('M-2 7.5Q0 9.6 2 7.5', { fill: 'none', stroke: ink, sw }));
    }
  }
  // 땀방울
  if (mood === 'hit' && !o.noSweat) out.push(sweat(g + 9, -6, 1));
  return G(out.join(''), { tf: T(cx, cy, s) });
}

/** 땀방울 (하늘 #8fd3ff), (x,y) = 방울 가운데 */
export function sweat(x: number, y: number, s = 1): string {
  return G(
    P('M0 -5.2Q3.6 -0.6 3.2 1.6Q2.8 4.2 0 4.2Q-2.8 4.2 -3.2 1.6Q-3.6 -0.6 0 -5.2Z', { fill: '#8fd3ff', stroke: '#4a9fd0', sw: 0.8 }) +
      E(-1, 1.2, 0.9, 1.3, { fill: '#fff', op: 0.9 }),
    { tf: T(x, y, s) },
  );
}

/** 4갈래 반짝이 (가운데 흰 → 끝 노랑) */
export function sparkle(x: number, y: number, r: number, col = '#ffe066'): string {
  const k = 0.2;
  const d = `M0 ${-r}Q${r * k} ${-r * k} ${r} 0Q${r * k} ${r * k} 0 ${r}Q${-r * k} ${r * k} ${-r} 0Q${-r * k} ${-r * k} 0 ${-r}Z`;
  return G(P(d, { fill: col }) + P(d, { fill: '#fff', tf: 'scale(.55)' }), { tf: T(x, y) });
}

/** 5각 별 path (가운데 0,0 바깥 반지름 r, 안 반지름 ri) */
export function starPath(r: number, ri = r * 0.48, pts = 5, rot = -90): string {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const rr = i % 2 ? ri : r;
    const a = ((rot + (i * 180) / pts) * Math.PI) / 180;
    d += (i ? 'L' : 'M') + n2(Math.cos(a) * rr) + ' ' + n2(Math.sin(a) * rr);
  }
  return d + 'Z';
}

/** 둥근 별 (모서리 부드럽게) */
export function roundStar(r: number, ri = r * 0.5, rr = r * 0.12, pts = 5): string {
  const arr: number[] = [];
  for (let i = 0; i < pts * 2; i++) {
    const q = i % 2 ? ri : r;
    const a = ((-90 + (i * 180) / pts) * Math.PI) / 180;
    arr.push(Math.cos(a) * q, Math.sin(a) * q);
  }
  return roundPoly(arr, rr);
}

/** ₩ 모양 path (가운데 0,0, 높이 약 2h). 굵은 선으로 그림 */
export function wonPath(h: number): string {
  const w = h * 0.95;
  return `M${-w} ${-h}L${-w * 0.5} ${h}L0 ${-h * 0.35}L${w * 0.5} ${h}L${w} ${-h}M${-w * 1.05} ${-h * 0.2}H${w * 1.05}M${-w * 0.92} ${h * 0.25}H${w * 0.92}`;
}
/** P 모양 path (가운데 0,0, 높이 2h). 굵은 선 */
export function pPath(h: number): string {
  const w = h * 0.62;
  return `M${-w * 0.7} ${h}V${-h}H${w * 0.15}Q${w} ${-h} ${w} ${-h * 0.35}Q${w} ${h * 0.3} ${w * 0.15} ${h * 0.3}H${-w * 0.7}`;
}
/** H 모양 path */
export function hPath(h: number): string {
  const w = h * 0.7;
  return `M${-w} ${-h}V${h}M${w} ${-h}V${h}M${-w} 0H${w}`;
}
/** % 모양 (선+원 두 개) */
export function pctShape(h: number, col: string, sw: number): string {
  return (
    P(`M${h * 0.7} ${-h}L${-h * 0.7} ${h}`, { fill: 'none', stroke: col, sw }) +
    C(-h * 0.5, -h * 0.55, h * 0.32, { fill: 'none', stroke: col, sw: sw * 0.8 }) +
    C(h * 0.5, h * 0.55, h * 0.32, { fill: 'none', stroke: col, sw: sw * 0.8 })
  );
}

/** 하트 path (가운데 0,0, 폭 약 2r) */
export function heartPath(r: number): string {
  return `M0 ${r * 0.95}C${-r * 0.2} ${r * 0.75} ${-r * 1.1} ${r * 0.15} ${-r * 1.02} ${-r * 0.38}C${-r * 0.95} ${-r * 0.9} ${-r * 0.3} ${-r * 1.05} 0 ${-r * 0.5}C${r * 0.3} ${-r * 1.05} ${r * 0.95} ${-r * 0.9} ${r * 1.02} ${-r * 0.38}C${r * 1.1} ${r * 0.15} ${r * 0.2} ${r * 0.75} 0 ${r * 0.95}Z`;
}

/** 톱니(식권 티켓) 모양 path: 양옆 가장자리에 반원 홈 n개 */
export function ticketPath(x: number, y: number, w: number, h: number, r: number, notch: number, n = 3): string {
  // 위 → 오른쪽(홈) → 아래 → 왼쪽(홈)
  let d = `M${n2(x + r)} ${n2(y)}H${n2(x + w - r)}Q${n2(x + w)} ${n2(y)} ${n2(x + w)} ${n2(y + r)}`;
  const seg = (h - 2 * r) / n;
  for (let i = 0; i < n; i++) {
    const cy = y + r + seg * (i + 0.5);
    d += `V${n2(cy - notch)}A${n2(notch)} ${n2(notch)} 0 0 0 ${n2(x + w)} ${n2(cy + notch)}`;
  }
  d += `V${n2(y + h - r)}Q${n2(x + w)} ${n2(y + h)} ${n2(x + w - r)} ${n2(y + h)}H${n2(x + r)}Q${n2(x)} ${n2(y + h)} ${n2(x)} ${n2(y + h - r)}`;
  for (let i = n - 1; i >= 0; i--) {
    const cy = y + r + seg * (i + 0.5);
    d += `V${n2(cy + notch)}A${n2(notch)} ${n2(notch)} 0 0 0 ${n2(x)} ${n2(cy - notch)}`;
  }
  return d + `V${n2(y + r)}Q${n2(x)} ${n2(y)} ${n2(x + r)} ${n2(y)}Z`;
}

/** 물결선 path (가로) */
export function wave(x: number, y: number, w: number, amp: number, len: number): string {
  let d = `M${n2(x)} ${n2(y)}`;
  const n = Math.max(1, Math.round(w / len));
  const l = w / n;
  for (let i = 0; i < n; i++) d += `q${n2(l / 4)} ${n2(-amp)} ${n2(l / 2)} 0t${n2(l / 2)} 0`;
  return d;
}
