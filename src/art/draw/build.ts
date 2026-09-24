/**
 * 탑뷰(약간 비스듬한 위쪽 시점) 건물 부품.
 * 시점: 지붕 윗면(lighten) + 앞면(기본색) + 대형은 오른쪽 옆면(darken). 햇살은 왼쪽 위에서.
 * 좌표는 viewBox 240×240 기준. 앵커 (120,192) = 부지 중심.
 */
import { C, E, G, P, PL, R, Svg, darken, edge, face, lighten, mix, n2, rBot, rTop, roundPoly, sparkle, type Mood, type FaceOpt } from '../kit';

export interface TCtx {
  sv: Svg;
  m: Mood;
  c: string;
  acc: string;
  /** 외곽선 두께(viewBox 단위) */
  sw: number;
  /** 외곽선 색 */
  line: string;
  /** 1 화면 px 당 viewBox 단위 */
  u: number;
}

export function makeCtx(sv: Svg, m: Mood, c: string, acc: string, px: number): TCtx {
  const u = 240 / px;
  const sw = (1.55 + px / 300) * u;
  return { sv, m, c, acc, sw, line: edge(c), u };
}

export interface BoxO {
  x: number;
  /** 앞면 윗변 y */
  y: number;
  w: number;
  /** 앞면 높이 */
  h: number;
  /** 지붕 깊이(화면 세로) */
  d: number;
  /** 옆면 기울기(뒤 모서리가 오른쪽으로 밀리는 양). 0 이면 옆면 없음 */
  k?: number;
  c?: string;
  roof?: string;
  side?: string;
  line?: string;
  r?: number;
  sw?: number;
  /** 지붕 테두리(파라펫) */
  parapet?: boolean;
  /** 앞면 아래 어둠 */
  ao?: boolean;
}

export interface BoxG {
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
  k: number;
  /** 지붕 위 점 (u 가로 0~1, v 깊이 0 앞 ~ 1 뒤) */
  rp(u: number, v: number): [number, number];
}

/** 상자 건물 하나: 외곽선(뒤) → 옆면 → 앞면 → 지붕 */
export function box(t: TCtx, o: BoxO): BoxG {
  const { sv } = t;
  const k = o.k ?? 0;
  const c = o.c ?? t.c;
  const line = o.line ?? edge(c);
  const sw = o.sw ?? t.sw;
  const r = o.r ?? 10;
  const { x, y, w, h, d } = o;
  const roofC = o.roof ?? lighten(c, 0.5);
  const roofF = sv.lin([[0, lighten(roofC, 0.35)], [0.55, roofC], [1, mix(roofC, c, 0.25)]], 0, 0, 0.6, 1);
  const frontF = sv.lin([[0, lighten(c, 0.08)], [0.7, c], [1, mix(c, darken(c, 0.8), 0.6)]]);
  // 외곽선: 실루엣을 두 배 두께로 먼저 그리고 채움이 덮게
  let sil: string;
  if (k > 0) sil = roundPoly([x, y + h, x, y, x + k, y - d, x + w + k, y - d, x + w + k, y + h - d, x + w, y + h], r * 0.8);
  else sil = roundPoly([x, y + h, x, y - d, x + w, y - d, x + w, y + h], r);
  sv.add(P(sil, { fill: line, stroke: line, sw: sw * 2 }));
  if (k > 0) {
    const sideC = o.side ?? darken(c, 0.84);
    const sideF = sv.lin([[0, sideC], [1, darken(sideC, 0.9)]]);
    sv.add(PL([x + w - 1, y, x + w + k, y - d, x + w + k, y + h - d, x + w - 1, y + h], { fill: sideF }));
    sv.add(P(rBot(x, y, w, h, r), { fill: frontF }));
    sv.add(PL([x, y + 0.5, x + k, y - d, x + w + k, y - d, x + w, y + 0.5], { fill: roofF }));
  } else {
    sv.add(P(rBot(x, y - 0.5, w, h + 0.5, r), { fill: frontF }));
    sv.add(P(rTop(x, y - d, w, d, r), { fill: roofF }));
  }
  // 지붕 앞 모서리 빛 + 처마 그림자
  sv.add(P(`M${n2(x + r * 0.6)} ${n2(y)}H${n2(x + w - r * 0.3)}`, { stroke: '#fff', so: 0.55, sw: sw * 0.7, fill: 'none' }));
  sv.add(R(x, y + sw * 0.35, w, Math.min(h * 0.08, 6), 0, { fill: darken(c, 0.7), op: 0.18 }));
  if (o.parapet !== false && d > 16) {
    const ins = Math.min(8, d * 0.16);
    if (k > 0) {
      const p = [x + ins, y - ins * 0.6, x + k + ins * 0.6, y - d + ins * 0.8, x + w + k - ins * 0.9, y - d + ins * 0.8, x + w - ins * 0.9, y - ins * 0.6];
      sv.add(P(roundPoly(p, 4), { fill: 'none', stroke: mix(roofC, line, 0.28), sw: sw * 0.55, so: 0.8 }));
    } else {
      sv.add(R(x + ins, y - d + ins, w - ins * 2, d - ins * 1.6, Math.max(2, r - ins), { fill: 'none', stroke: mix(roofC, line, 0.28), sw: sw * 0.55, so: 0.8 }));
    }
  }
  if (o.ao !== false) sv.add(R(x + 2, y + h - Math.min(10, h * 0.14), w - 4, Math.min(10, h * 0.14), 0, { fill: darken(c, 0.6), op: 0.12 }));
  return {
    x, y, w, h, d, k,
    rp: (uu: number, vv: number) => [x + uu * w + vv * k, y - vv * d],
  };
}

/** 유리창 하나 */
export function win(t: TCtx, x: number, y: number, w: number, h: number, o: { glass?: [string, string]; frame?: string; r?: number; shine?: boolean; lit?: boolean } = {}): string {
  const [g1, g2] = o.glass ?? ['#f2fbff', '#a8d8f2'];
  const f = t.sv.lin([[0, g1], [1, g2]], 0, 0, 0.4, 1);
  const frame = o.frame ?? edge(t.c);
  const r = o.r ?? Math.min(w, h) * 0.22;
  let s = R(x, y, w, h, r, { fill: f, stroke: frame, sw: t.sw * 0.5 });
  if (o.shine !== false && w > 6 && h > 6) {
    s += P(`M${n2(x + w * 0.18)} ${n2(y + h * 0.78)}L${n2(x + w * 0.52)} ${n2(y + h * 0.18)}L${n2(x + w * 0.7)} ${n2(y + h * 0.18)}L${n2(x + w * 0.36)} ${n2(y + h * 0.78)}Z`, {
      fill: '#fff',
      op: 0.55,
    });
  }
  return s;
}

/** 창 격자 */
export function winGrid(
  t: TCtx,
  x: number,
  y: number,
  cols: number,
  rows: number,
  w: number,
  h: number,
  gx: number,
  gy: number,
  o: { glass?: [string, string]; frame?: string; skip?: (c: number, r: number) => boolean; r?: number } = {},
): string {
  let s = '';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (o.skip && o.skip(c, r)) continue;
      s += win(t, x + c * (w + gx), y + r * (h + gy), w, h, { glass: o.glass, frame: o.frame, r: o.r, shine: (c + r) % 2 === 0 });
    }
  return s;
}

/** 문 (위 둥근) */
export function door(t: TCtx, x: number, y: number, w: number, h: number, col: string, o: { glass?: boolean; double?: boolean } = {}): string {
  const line = edge(col);
  let s = P(rTop(x, y, w, h, Math.min(w * 0.35, 10)), { fill: t.sv.lin([[0, lighten(col, 0.15)], [1, col]]), stroke: line, sw: t.sw * 0.55 });
  if (o.glass) {
    if (o.double) {
      s += win(t, x + w * 0.12, y + h * 0.16, w * 0.33, h * 0.7, { frame: line, r: 2 }) + win(t, x + w * 0.55, y + h * 0.16, w * 0.33, h * 0.7, { frame: line, r: 2 });
    } else s += win(t, x + w * 0.18, y + h * 0.14, w * 0.64, h * 0.5, { frame: line, r: 3 });
  }
  if (!o.double) s += C(x + w * 0.78, y + h * 0.62, Math.max(1.4, w * 0.06), { fill: '#ffe08a', stroke: line, sw: t.sw * 0.3 });
  return s;
}

/** 줄무늬 차양 (아래 물결) */
export function awning(t: TCtx, x: number, y: number, w: number, h: number, c1: string, c2: string, n: number): string {
  const sv = t.sv;
  const line = edge(c1);
  const seg = w / n;
  const sc = seg / 2;
  // 몸 (앞으로 기울어 보이게 위가 좁음)
  let d = `M${n2(x + 3)} ${n2(y)}H${n2(x + w - 3)}L${n2(x + w)} ${n2(y + h)}`;
  for (let i = n - 1; i >= 0; i--) d += `Q${n2(x + seg * i + sc)} ${n2(y + h + sc * 0.9)} ${n2(x + seg * i)} ${n2(y + h)}`;
  d += 'Z';
  const clip = sv.clip(P(d));
  let stripes = '';
  for (let i = 0; i < n; i++) if (i % 2 === 0) stripes += R(x + seg * i, y - 2, seg, h + sc + 4, 0, { fill: c2 });
  return (
    P(d, { fill: c1, stroke: line, sw: t.sw * 1.6 }) +
    G(R(x - 2, y - 2, w + 4, h + sc + 4, 0, { fill: c1 }) + stripes + R(x - 2, y - 2, w + 4, h * 0.45, 0, { fill: '#fff', op: 0.22 }), { cp: clip })
  );
}

/** 옥상 실외기 */
export function acUnit(t: TCtx, cx: number, cy: number, s: number): string {
  const w = 22 * s, h = 12 * s, d = 9 * s;
  const x = cx - w / 2, y = cy - h / 2 + d / 2;
  const line = '#8b95a3';
  return (
    R(x, y, w, h, 3 * s, { fill: '#dfe5ec', stroke: line, sw: t.sw * 0.5 }) +
    R(x, y - d, w, d + 2, 3 * s, { fill: '#f4f7fa', stroke: line, sw: t.sw * 0.5 }) +
    C(cx - w * 0.2, y - d / 2 + 1, d * 0.36, { fill: '#c6ced8', stroke: line, sw: t.sw * 0.35 }) +
    P(`M${n2(cx - w * 0.2 - d * 0.3)} ${n2(y - d / 2 + 1)}H${n2(cx - w * 0.2 + d * 0.3)}M${n2(cx - w * 0.2)} ${n2(y - d / 2 + 1 - d * 0.3)}V${n2(y - d / 2 + 1 + d * 0.3)}`, { stroke: line, sw: t.sw * 0.3 }) +
    R(cx + w * 0.08, y + h * 0.25, w * 0.34, h * 0.14, 1, { fill: line, op: 0.5 }) +
    R(cx + w * 0.08, y + h * 0.55, w * 0.34, h * 0.14, 1, { fill: line, op: 0.5 })
  );
}

/** 뭉게 김(연기) 한 덩이 */
export function puff(x: number, y: number, r: number, op = 0.95): string {
  return G(
    C(0, 0, r, { fill: '#fff' }) + C(-r * 0.85, r * 0.3, r * 0.7, { fill: '#fff' }) + C(r * 0.85, r * 0.3, r * 0.72, { fill: '#fff' }) + C(0, r * 0.45, r * 0.75, { fill: '#fff' }),
    { tf: `translate(${n2(x)} ${n2(y)})`, op },
  ) + G(C(r * 0.1, r * 0.55, r * 0.9, { fill: '#dfe8f2' }), { tf: `translate(${n2(x)} ${n2(y)})`, op: 0.35 });
}

/** 모락 김 (물결 줄 세 개) */
export function steam(t: TCtx, x: number, y: number, s: number): string {
  let out = '';
  for (let i = -1; i <= 1; i++) {
    const xx = x + i * 9 * s;
    out += P(`M${n2(xx)} ${n2(y)}q${n2(-5 * s)} ${n2(-6 * s)} 0 ${n2(-12 * s)}t0 ${n2(-12 * s)}`, { fill: 'none', stroke: '#fff', sw: 3.2 * s, so: 0.95 });
    out += P(`M${n2(xx)} ${n2(y)}q${n2(-5 * s)} ${n2(-6 * s)} 0 ${n2(-12 * s)}t0 ${n2(-12 * s)}`, { fill: 'none', stroke: '#b9c6d3', sw: 1 * s, so: 0.5, tf: `translate(${n2(1.2 * s)} ${n2(1 * s)})` });
  }
  void t;
  return out;
}

/** 크림 얼굴판 + 콩눈 */
export function facePanel(t: TCtx, cx: number, cy: number, w: number, h: number, s: number, o: { fill?: string; fo?: FaceOpt; r?: number } = {}): string {
  const fill = o.fill ?? '#fffaf0';
  return (
    R(cx - w / 2, cy - h / 2, w, h, o.r ?? h * 0.3, { fill: t.sv.lin([[0, '#ffffff'], [1, fill]]), stroke: mix(edge(t.c), '#ffffff', 0.25), sw: t.sw * 0.55 }) +
    face(cx, cy - s * 1.6, s, t.m, o.fo)
  );
}

/** 유리 커튼월 */
export function glassWall(
  t: TCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { top: string; bot: string; mull?: string; cols?: number; rows?: number; rx?: number; refl?: number },
): string {
  const sv = t.sv;
  const f = sv.lin([[0, o.top], [1, o.bot]], 0, 0, 0.3, 1);
  const clip = sv.clip(R(x, y, w, h, o.rx ?? 0));
  let s = R(x, y, w, h, o.rx ?? 0, { fill: f });
  let inner = '';
  const cols = o.cols ?? 6, rows = o.rows ?? 8;
  const mull = o.mull ?? '#ffffff';
  for (let i = 1; i < cols; i++) inner += P(`M${n2(x + (w * i) / cols)} ${n2(y)}V${n2(y + h)}`, { stroke: mull, sw: t.sw * 0.42, so: 0.55 });
  for (let j = 1; j < rows; j++) inner += P(`M${n2(x)} ${n2(y + (h * j) / rows)}H${n2(x + w)}`, { stroke: mull, sw: t.sw * 0.55, so: 0.75 });
  // 사선 반사 띠
  const n = o.refl ?? 2;
  for (let i = 0; i < n; i++) {
    const ox = x - h * 0.5 + (w + h * 0.6) * ((i + 0.35) / n);
    inner += PL([ox, y + h, ox + h * 0.55, y, ox + h * 0.55 + w * 0.12, y, ox + w * 0.12, y + h], { fill: '#fff', op: 0.22 });
    inner += PL([ox + w * 0.16, y + h, ox + h * 0.55 + w * 0.16, y, ox + h * 0.55 + w * 0.2, y, ox + w * 0.2, y + h], { fill: '#fff', op: 0.16 });
  }
  s += G(inner, { cp: clip });
  return s;
}

/** 원통 (물탱크·굴뚝). (cx, top) 윗면 가운데 */
export function cylinder(t: TCtx, cx: number, top: number, rx: number, h: number, col: string, o: { cap?: string } = {}): string {
  const ry = rx * 0.42;
  const line = edge(col);
  const f = t.sv.lin([[0, lighten(col, 0.35)], [0.45, col], [1, darken(col, 0.8)]], 0, 0, 1, 0);
  return (
    P(`M${n2(cx - rx)} ${n2(top)}V${n2(top + h)}A${n2(rx)} ${n2(ry)} 0 0 0 ${n2(cx + rx)} ${n2(top + h)}V${n2(top)}Z`, { fill: f, stroke: line, sw: t.sw * 0.6 }) +
    E(cx, top, rx, ry, { fill: o.cap ?? lighten(col, 0.45), stroke: line, sw: t.sw * 0.6 })
  );
}

/** 해피 반짝이 */
export function happySpark(t: TCtx, x: number, y: number, r = 11): string {
  if (t.m !== 'happy') return '';
  return sparkle(x, y, r) + sparkle(x + r * 1.4, y + r * 1.2, r * 0.45);
}

/** 작은 화분 (지붕 위) */
export function plant(t: TCtx, cx: number, by: number, s: number): string {
  return (
    P(`M${n2(cx - 7 * s)} ${n2(by - 9 * s)}H${n2(cx + 7 * s)}L${n2(cx + 5 * s)} ${n2(by)}H${n2(cx - 5 * s)}Z`, { fill: '#e8a07a', stroke: '#a8643e', sw: t.sw * 0.45 }) +
    C(cx - 4 * s, by - 13 * s, 6 * s, { fill: '#8fd07e', stroke: '#4f9e4a', sw: t.sw * 0.45 }) +
    C(cx + 4.5 * s, by - 14 * s, 6.2 * s, { fill: '#9fdc8c', stroke: '#4f9e4a', sw: t.sw * 0.45 }) +
    C(cx, by - 19 * s, 6.4 * s, { fill: '#a9e296', stroke: '#4f9e4a', sw: t.sw * 0.45 }) +
    C(cx - 1.5 * s, by - 21 * s, 2 * s, { fill: '#fff', op: 0.5 })
  );
}

/** 바퀴 (옆에서 본) */
export function wheel(t: TCtx, cx: number, cy: number, r: number): string {
  return C(cx, cy, r, { fill: '#4a4553', stroke: '#2e2a36', sw: t.sw * 0.6 }) + C(cx, cy, r * 0.48, { fill: '#dcdce6', stroke: '#8a8898', sw: t.sw * 0.4 }) + C(cx - r * 0.12, cy - r * 0.14, r * 0.14, { fill: '#fff', op: 0.8 });
}

export { face, sparkle, lighten, darken, mix, edge, R, C, E, P, PL, G };
