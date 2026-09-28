/**
 * 지도 생성·그리기가 같이 쓰는 2D 도형 계산 (순수 함수, DOM·Pixi 없음).
 * 좌표는 화면과 같은 방향(y 아래로 +).
 */
export interface Pt { x: number; y: number }

export const hyp = Math.hypot;
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 누적 길이 (c[0] = 0, c[n-1] = 전체 길이) */
export function cumLen(p: Pt[]): number[] {
  const c = new Array<number>(p.length);
  c[0] = 0;
  for (let i = 1; i < p.length; i++) c[i] = c[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return c;
}
export function polyLen(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
}

export interface Pose { x: number; y: number; tx: number; ty: number }
/** 길이 s 의 점과 진행 방향(단위). 범위 밖은 끝 선분을 곧게 늘림. out 을 주면 새 객체를 만들지 않음 */
export function poseAt(p: Pt[], c: number[], s: number, out: Pose = { x: 0, y: 0, tx: 1, ty: 0 }): Pose {
  const n = p.length;
  let i: number;
  if (s <= 0) i = 0;
  else if (s >= c[n - 1]) i = n - 2;
  else {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (c[m] <= s) lo = m;
      else hi = m;
    }
    i = lo;
  }
  const a = p[i], b = p[i + 1];
  const L = c[i + 1] - c[i] || 1e-9;
  const tx = (b.x - a.x) / L, ty = (b.y - a.y) / L;
  const k = s - c[i];
  out.x = a.x + tx * k;
  out.y = a.y + ty * k;
  out.tx = tx;
  out.ty = ty;
  return out;
}

/** 부분 경로 [s0, s1] (s0 < s1) */
export function subPath(p: Pt[], c: number[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  const a = poseAt(p, c, s0);
  out.push({ x: a.x, y: a.y });
  for (let i = 0; i < p.length; i++) if (c[i] > s0 + 0.5 && c[i] < s1 - 0.5) out.push({ x: p[i].x, y: p[i].y });
  const b = poseAt(p, c, s1);
  out.push({ x: b.x, y: b.y });
  return out;
}

/** 구심 캣멀-롬: ctrl 을 모두 지나는 곡선. 구간마다 per 개로 나눔 (양 끝은 반사 점) */
export function spline(ctrl: Pt[], per: number): Pt[] {
  const n = ctrl.length;
  if (n < 2) return ctrl.slice();
  const P: Pt[] = [
    { x: 2 * ctrl[0].x - ctrl[1].x, y: 2 * ctrl[0].y - ctrl[1].y },
    ...ctrl,
    { x: 2 * ctrl[n - 1].x - ctrl[n - 2].x, y: 2 * ctrl[n - 1].y - ctrl[n - 2].y },
  ];
  const out: Pt[] = [{ x: ctrl[0].x, y: ctrl[0].y }];
  const tj = (a: Pt, b: Pt) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 1; k <= per; k++) {
      const t = t1 + ((t2 - t1) * k) / per;
      const a1x = ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x, a1y = ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y;
      const a2x = ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x, a2y = ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y;
      const a3x = ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x, a3y = ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y;
      const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x, b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
      const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x, b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;
      out.push({ x: ((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x, y: ((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y });
    }
  }
  return out;
}

/** 진행 방향의 오른쪽(화면 좌표: (−ty, tx))으로 d 만큼 평행 이동한 선 */
export function offsetLine(p: Pt[], d: number): Pt[] {
  const n = p.length;
  const out: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[Math.min(n - 1, i + 1)];
    let n1x = 0, n1y = 0, n2x = 0, n2y = 0;
    if (i > 0) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      n1x = -(b.y - a.y) / L;
      n1y = (b.x - a.x) / L;
    }
    if (i < n - 1) {
      const L = Math.hypot(c.x - b.x, c.y - b.y) || 1;
      n2x = -(c.y - b.y) / L;
      n2y = (c.x - b.x) / L;
    }
    if (i === 0) {
      n1x = n2x;
      n1y = n2y;
    }
    if (i === n - 1) {
      n2x = n1x;
      n2y = n1y;
    }
    let nx = n1x + n2x, ny = n1y + n2y;
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const cos = Math.max(0.5, nx * n1x + ny * n1y);
    out[i] = { x: b.x + (nx * d) / cos, y: b.y + (ny * d) / cos };
  }
  return out;
}

/** 두 선분 교차 (끝점 포함). 교차점과 각 선분의 비율 */
export function segX(a: Pt, b: Pt, c: Pt, d: Pt): { x: number; y: number; t: number; u: number } | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { x: a.x + rx * t, y: a.y + ry * t, t, u };
}

export function distSeg(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x, vy = b.y - a.y;
  const L2 = vx * vx + vy * vy;
  let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}
/** 점 ~ 꺾은선 최소 거리 (closed = 닫힌 다각형) */
export function distLine(p: Pt, q: Pt[], closed = false): number {
  let m = Infinity;
  const n = q.length;
  for (let i = 0; i < n - 1; i++) {
    const d = distSeg(p, q[i], q[i + 1]);
    if (d < m) m = d;
  }
  if (closed && n > 2) m = Math.min(m, distSeg(p, q[n - 1], q[0]));
  return m;
}
export function inPoly(p: Pt, q: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i], b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}
/** 부호 있는 넓이 (화면 좌표에서 시계 방향이 +) */
export function area(q: Pt[]): number {
  let s = 0;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) s += (q[j].x * q[i].y - q[i].x * q[j].y);
  return s / 2;
}
export function centroid(q: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const f = q[j].x * q[i].y - q[i].x * q[j].y;
    cx += (q[j].x + q[i].x) * f;
    cy += (q[j].y + q[i].y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return { x: q[0].x, y: q[0].y };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
export function bbox(q: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of q) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 세 점을 담는 가장 작은 원의 반지름 */
export function sec3(a: Pt, b: Pt, c: Pt): number {
  const ab = Math.hypot(a.x - b.x, a.y - b.y), bc = Math.hypot(b.x - c.x, b.y - c.y), ca = Math.hypot(c.x - a.x, c.y - a.y);
  let l0 = ab, l1 = bc, l2 = ca;
  if (l0 > l2) [l0, l2] = [l2, l0];
  if (l1 > l2) [l1, l2] = [l2, l1];
  if (l2 * l2 >= l0 * l0 + l1 * l1) return l2 / 2;
  const K = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  return K < 1e-9 ? l2 / 2 : (ab * bc * ca) / (4 * K);
}

/** 더글라스-포이커 단순화 (열린 선) */
export function simplify(p: Pt[], tol: number): Pt[] {
  if (p.length < 3) return p.slice();
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const st: [number, number][] = [[0, p.length - 1]];
  while (st.length) {
    const [i, j] = st.pop()!;
    let m = -1, md = tol;
    for (let k = i + 1; k < j; k++) {
      const d = distSeg(p[k], p[i], p[j]);
      if (d > md) {
        md = d;
        m = k;
      }
    }
    if (m >= 0) {
      keep[m] = 1;
      st.push([i, m], [m, j]);
    }
  }
  return p.filter((_, i) => keep[i]);
}

/** 결정적 난수 (xorshift32) — 게임 Math.random 과 따로 */
export function rng(seed: number): () => number {
  /* 작은 씨앗(1, 2, 3…)도 첫 값부터 고르게: 섞은 뒤 시작 */
  let z = (seed >>> 0) + 0x9e3779b9;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  let s = (z ^ (z >>> 16)) >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
/** 문자열·숫자 섞어 32비트 해시 (FNV-1a) */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 닫힌 다각형을 진행 방향 오른쪽(시계 방향 다각형이면 안쪽)으로 d 만큼 (꼭짓점 이등분선, 뾰족한 곳은 2배까지) */
export function offsetClosed(q0: Pt[], d: number): Pt[] {
  const q = dedupe(q0, true);
  const n = q.length;
  const out: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = q[(i - 1 + n) % n], b = q[i], c = q[(i + 1) % n];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const n1x = -(b.y - a.y) / l1, n1y = (b.x - a.x) / l1, n2x = -(c.y - b.y) / l2, n2y = (c.x - b.x) / l2;
    let nx = n1x + n2x, ny = n1y + n2y;
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const cos = Math.max(0.5, nx * n1x + ny * n1y);
    out[i] = { x: b.x + (nx * d) / cos, y: b.y + (ny * d) / cos };
  }
  return out;
}

/** 붙은 같은 점 제거(닫힌 다각형이면 끝점 = 첫 점도) */
export function dedupe(q: Pt[], closed = false, eps = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const p of q) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > eps) out.push(p);
  if (closed) while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= eps) out.pop();
  return out;
}
