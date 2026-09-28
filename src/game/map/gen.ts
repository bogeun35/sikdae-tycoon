/**
 * 영업 지도 생성기 (설계서 5장) — DOM·Pixi 를 쓰지 않는 순수 함수. 게임·시뮬·검사 스크립트가 같은 코드를 쓴다.
 *
 *   genMap(district, orient, seed, day) → MapData   같은 인자면 늘 같은 지도
 *   mapSeed(S.started, S.runs, district, orient)    영업일마다 새 씨앗(같은 영업일에 다시 열면 같은 지도)
 *
 * 만드는 순서
 *   1. 틀: 격자(org < 0.25)는 블록 칸 수(±1)·원점을 씨앗으로 고름. 구불구불(org ≥ 0.25)은 큰 블록 몇 개(크기 ±12%)
 *   2. 교차점을 블록 크기 × 0.32 × org 만큼 흔들고, 도로 가운데를 블록 크기 × 0.18 × org 만큼 휨(캣멀-롬 곡선)
 *   3. 골목 일부를 끊어 막다른 골목(교차점 연결은 유지). 블록 = 도로 사이 면(도로 폭 절반만큼 안으로)
 *   4. 부지: 격자는 블록마다 3×2 정렬 그대로. 구불구불은 블록마다 블록 방향으로 기운 1 lot 격자를 가장 많이 들어가게 놓음
 *   5. 검사: 부지 간격 ≥ 0.95 lot, 부지-도로 안 겹침, 부지 3곳을 담는 가장 작은 원 ≥ 판정 거리₀ + 2px(0장 5번).
 *      어긴 부지는 빼고, 모자라면 다른 씨앗으로 최대 3번 → 그래도 모자라면 곧은 격자
 *   6. 큰 부지(붙은 2×2) · 광장(보스) · 공원 · 도로형 경로(가장자리 ↔ 가장자리, 끊긴 길은 돌아감) · 횡단보도 · 장식
 */
import type { DistrictId, MapBlock, MapData, MapRoute, MapSlot, MapStreet, MapXing, Orient } from '../data';
import { BIGS, DGEN, GEO, GRID_BELOW, LANE_OVER, LOTS_GRID, LOTS_ORG, ROUTES, progOrg, tripleMin, type OrientGeo } from './params';
import { bbox, cumLen, dedupe, dist, distLine, hash32, inPoly, offsetLine, poseAt, rng, sec3, segX, spline, subPath, type Pt } from './geom';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const P2 = (p: Pt): Pt => ({ x: r2(p.x), y: r2(p.y) });

/** 영업일 씨앗 = hash(시작 시각, 누적 영업일, 상권, 방향) */
export function mapSeed(started: number, runs: number, did: DistrictId, orient: Orient): number {
  return hash32('map', Math.floor(started || 0), runs | 0, did, orient);
}
/** 실제 정형도 = min(상권, 누적 영업일) ± 0.08 */
export function orgFor(did: DistrictId, day: number, seed: number): number {
  const r = rng(hash32('org', seed, did));
  const base = Math.min(DGEN[did].org, progOrg(day));
  return clamp(base + (r() * 2 - 1) * 0.08, 0, 1);
}

/* ───────── 1. 틀 ───────── */

type Wt<T> = T & { wt: number };
function pickW<T extends { wt: number }>(a: T[], r: () => number): T {
  let t = a.reduce((s, o) => s + o.wt, 0) * r();
  for (const o of a) {
    t -= o.wt;
    if (t <= 0) return o;
  }
  return a[a.length - 1];
}
function combos(n0: number, b: number, maxLen: number, L: number, road: number): Wt<{ v: number[] }>[] {
  const out: Wt<{ v: number[] }>[] = [];
  for (let n = Math.max(2, n0 - 1); n <= n0 + 1; n++) {
    const cur: number[] = [];
    const rec = (k: number) => {
      if (k === n) {
        const tot = cur.reduce((a, c) => a + c, 0) * L + (n - 1) * road;
        if (tot <= maxLen) {
          const dev = cur.reduce((a, c) => a + Math.abs(c - b), 0);
          out.push({ v: cur.slice(), wt: Math.exp(-0.8 * Math.abs(n - n0) - 0.45 * dev) * Math.pow(tot / maxLen, 6) });
        }
        return;
      }
      for (let v = Math.max(1, b - 1); v <= b + 1; v++) {
        cur.push(v);
        rec(k + 1);
        cur.pop();
      }
    };
    rec(0);
  }
  return out;
}
const COMBO_CACHE: Partial<Record<Orient, { cols: Wt<{ v: number[] }>[]; rows: Wt<{ v: number[] }>[] }>> = {};
function combosFor(o: Orient): { cols: Wt<{ v: number[] }>[]; rows: Wt<{ v: number[] }>[] } {
  const hit = COMBO_CACHE[o];
  if (hit) return hit;
  const g = GEO[o];
  const c = { cols: combos(g.cols, g.bw, g.area.w - 24, g.lot, g.road), rows: combos(g.rows, g.bh, g.area.h, g.lot, g.road) };
  COMBO_CACHE[o] = c;
  return c;
}
/** 구불구불 지도의 블록 수 후보(가로 × 세로) — 블록이 커야 흔들어도 부지가 덜 빠짐 */
const ORG_LAYOUT: Record<Orient, Wt<{ nc: number; nr: number }>[]> = {
  land: [{ nc: 4, nr: 2, wt: 5 }, { nc: 3, nr: 2, wt: 1 }, { nc: 5, nr: 2, wt: 0.6 }],
  port: [{ nc: 2, nr: 4, wt: 3 }, { nc: 2, nr: 3, wt: 1.2 }, { nc: 3, nr: 4, wt: 1 }],
};

interface Line {
  id: string; ax: 'h' | 'v'; idx: number; w: number; main: boolean; nodes: Pt[]; pts: Pt[]; cum: number[]; ns: number[];
  /** 끊은 간선 번호(-1 = 없음), 막다른 골목이 붙는 쪽(true = 앞 교차점), 길이 비율 */
  cut: number; stubA: boolean; stubF: number;
}
interface LotT { x: number; y: number; a: number; block: number; k: number; l: number; dead?: boolean }

interface Ctx {
  did: DistrictId; o: Orient; g: OrientGeo; r: () => number; org: number; grid: boolean;
  nc: number; nr: number; bw: number[]; bh: number[]; colW: number[]; rowW: number[]; mainRow: number; mainCol: number; x0: number; y0: number;
  P: Pt[][]; rows: Line[]; cols: Line[]; frame: { x0: number; y0: number; x1: number; y1: number };
  plaza: [number, number]; parks: [number, number][];
}

function layout(c: Ctx): boolean {
  const { g, r, o } = c;
  const L = g.lot;
  const gen = DGEN[c.did];
  const maxW = g.area.w - 24;
  if (c.grid) {
    const { cols, rows } = combosFor(o);
    for (let t = 0; t < 40; t++) {
      const cw = pickW(cols, r).v, rh = pickW(rows, r).v;
      const nc = cw.length, nr = rh.length;
      const cells = cw.reduce((a, v) => a + v, 0) * rh.reduce((a, v) => a + v, 0);
      const sp = pickSpecial(c, nc, nr, (i, j) => cw[i] >= g.bw && rh[j] >= g.bh, (i, j) => cw[i] >= 2 && rh[j] >= 2);
      if (!sp) continue;
      const free = cells - cw[sp.plaza[0]] * rh[sp.plaza[1]] - sp.parks.reduce((a, p) => a + cw[p[0]] * rh[p[1]], 0);
      if (free < LOTS_GRID[0] || free > LOTS_GRID[1] + 6) continue;
      Object.assign(c, { nc, nr, bw: cw.map((v) => v * L), bh: rh.map((v) => v * L), plaza: sp.plaza, parks: sp.parks });
      c.colW = [0, ...Array(nc - 1).fill(g.road)];
      c.rowW = [0, ...Array(nr - 1).fill(g.road)];
      c.mainRow = 1 + Math.floor(r() * (nr - 1));
      c.mainCol = 1 + Math.floor(r() * (nc - 1));
      const totW = c.bw.reduce((a, v) => a + v, 0) + (nc - 1) * g.road;
      const totH = c.bh.reduce((a, v) => a + v, 0) + (nr - 1) * g.road;
      c.x0 = g.area.x + 12 + r() * Math.max(0, maxW - totW);
      c.y0 = g.area.y + r() * Math.max(0, g.area.h - totH);
      return true;
    }
    return false;
  }
  const lay = pickW(ORG_LAYOUT[o], r);
  const nc = lay.nc, nr = lay.nr;
  const alleyK = gen.alley ?? 1 - 0.4 * c.org;
  const mainRow = 1 + Math.floor(r() * (nr - 1));
  const mainCol = 1 + Math.floor(r() * (nc - 1));
  const rowW = [0];
  for (let j = 1; j < nr; j++) rowW.push(j === mainRow ? g.road * (gen.straightMain ? 1.2 : 1) : g.road * alleyK);
  const colW = [0];
  for (let i = 1; i < nc; i++) colW.push(i === mainCol ? g.road : g.road * alleyK);
  const split = (n: number, avail: number) => {
    const w = Array.from({ length: n }, () => 1 + (r() - 0.5) * 0.24);
    const s = w.reduce((a, v) => a + v, 0);
    return w.map((v) => (v / s) * avail);
  };
  const bw = split(nc, maxW - colW.reduce((a, v) => a + v, 0));
  const bh = split(nr, g.area.h - rowW.reduce((a, v) => a + v, 0));
  const sp = pickSpecial(c, nc, nr, () => true, () => true);
  if (!sp) return false;
  Object.assign(c, { nc, nr, bw, bh, colW, rowW, mainRow, mainCol, plaza: sp.plaza, parks: sp.parks, x0: g.area.x + 12, y0: g.area.y });
  return true;
}
/** 광장(가운데에 가까운 둘 중 하나) · 공원 칸 */
function pickSpecial(c: Ctx, nc: number, nr: number, plazaOk: (i: number, j: number) => boolean, parkOk: (i: number, j: number) => boolean): { plaza: [number, number]; parks: [number, number][] } | null {
  const r = c.r;
  const pz: { c: [number, number]; d: number }[] = [];
  for (let i = 0; i < nc; i++)
    for (let j = 0; j < nr; j++) {
      if (!plazaOk(i, j)) continue;
      const dx = (i + 0.5) / nc - 0.5, dy = (j + 0.5) / nr - 0.5;
      pz.push({ c: [i, j], d: Math.hypot(dx, dy * 1.2) + r() * 0.12 });
    }
  if (!pz.length) return null;
  pz.sort((a, b) => a.d - b.d);
  const plaza = pz[0].c;
  const pk: [number, number][] = [];
  for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) if ((i !== plaza[0] || j !== plaza[1]) && parkOk(i, j)) pk.push([i, j]);
  const gen = DGEN[c.did];
  const nPark = gen.parks[0] + Math.floor(r() * (gen.parks[1] - gen.parks[0] + 1));
  const parks: [number, number][] = [];
  for (let k = 0; k < nPark && pk.length; k++) parks.push(pk.splice(Math.floor(r() * pk.length), 1)[0]);
  return { plaza, parks };
}

/* ───────── 2. 교차점·도로 ───────── */

/** 정형도 → 흔들림 세기. 0.2 이하 0, 0.85 에서 0.85, 그 사이는 제곱(격자 경계 근처는 거의 곧게) */
export const distOf = (org: number): number => clamp(0.85 * Math.pow(Math.max(0, org - 0.2) / 0.65, 2), 0, 1);

function buildLattice(c: Ctx): void {
  const { g, r, nc, nr, bw, bh, colW, rowW } = c;
  const gen = DGEN[c.did];
  /* 흔들림 세기: 격자 경계(0.25) 근처에서는 거의 곧게, 을지로 첫날(0.85)에서 org 그대로 */
  const org = distOf(c.org);
  const X: number[] = [c.x0];
  let cx = c.x0;
  for (let i = 0; i < nc; i++) {
    cx += bw[i];
    if (i < nc - 1) {
      X.push(cx + colW[i + 1] / 2);
      cx += colW[i + 1];
    } else X.push(cx);
  }
  const Y: number[] = [c.y0];
  let cy = c.y0;
  for (let j = 0; j < nr; j++) {
    cy += bh[j];
    if (j < nr - 1) {
      Y.push(cy + rowW[j + 1] / 2);
      cy += rowW[j + 1];
    } else Y.push(cy);
  }
  c.frame = { x0: X[0], y0: Y[0], x1: X[nc], y1: Y[nr] };
  /* 흔들기: 옆 블록 크기 × 0.32 × org (테두리 점은 테두리를 따라서만) */
  const P: Pt[][] = [];
  const straight = (j: number) => !!gen.straightMain && j === c.mainRow && !c.grid;
  const sj = straight(c.mainRow) ? (r() * 2 - 1) * 0.1 * org * Math.min(bh[c.mainRow - 1], bh[c.mainRow]) : 0;
  for (let i = 0; i <= nc; i++) {
    P.push([]);
    for (let j = 0; j <= nr; j++) {
      let x = X[i], y = Y[j];
      if (!c.grid) {
        const ax = i > 0 && i < nc ? 0.32 * org * Math.min(bw[i - 1], bw[i]) : 0;
        const ay = j > 0 && j < nr ? 0.32 * org * Math.min(bh[j - 1], bh[j]) : 0;
        x += (r() * 2 - 1) * ax;
        y += straight(j) ? sj : (r() * 2 - 1) * ay;
      }
      P[i].push({ x, y });
    }
  }
  c.P = P;
  /* 선: 교차점 + 가운데(휜) 점을 지나는 곡선. 곧은 격자는 per=1 */
  const per = c.grid ? 1 : 6;
  const mk = (ax: 'h' | 'v', idx: number, nodes: Pt[], w: number, main: boolean, noBend: boolean, perp: number): Line => {
    const ctrl: Pt[] = [nodes[0]];
    for (let k = 0; k < nodes.length - 1; k++) {
      const a = nodes[k], b = nodes[k + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* 휨 크기 0.45~1 × 최대, 방향 무작위 */
      const bend = c.grid || noBend ? 0 : (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.55) * 0.18 * org * perp;
      ctrl.push({ x: (a.x + b.x) / 2 + (-dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend }, b);
    }
    const sp = spline(ctrl, per);
    const n = nodes.length - 1;
    const e0 = ax === 'h' ? { x: -20, y: nodes[0].y } : { x: nodes[0].x, y: -20 };
    const e1 = ax === 'h' ? { x: g.W + 20, y: nodes[n].y } : { x: nodes[n].x, y: g.H + 20 };
    const pts = [e0, ...sp, e1];
    const cum = cumLen(pts);
    const ns = nodes.map((_, k) => cum[1 + 2 * k * per]);
    return { id: `${ax}${idx}`, ax, idx, w, main, nodes, pts, cum, ns, cut: -1, stubA: true, stubF: 0 };
  };
  c.rows = [];
  for (let j = 1; j < nr; j++) c.rows.push(mk('h', j, P.map((col) => col[j]), rowW[j], c.grid || j === c.mainRow, straight(j), Math.min(bh[j - 1], bh[j])));
  c.cols = [];
  for (let i = 1; i < nc; i++) c.cols.push(mk('v', i, P[i], colW[i], c.grid || i === c.mainCol, false, Math.min(bw[i - 1], bw[i])));
}

/* ───────── 3. 막다른 골목 ───────── */

/** 가로선 j 의 간선 k = 칸(k,j-1)|(k,j), 세로선 i 의 간선 k = 칸(i-1,k)|(i,k). 테두리에 닿는 간선은 안쪽 교차점 쪽에 막다른 골목 */
function cutEdges(c: Ctx): Map<string, number> {
  const grp = new Map<string, number>();
  if (c.grid) return grp;
  const cand: { line: Line; k: number; a: [number, number]; b: [number, number] }[] = [];
  for (const ln of c.rows) if (!ln.main) for (let k = 0; k < c.nc; k++) cand.push({ line: ln, k, a: [k, ln.idx - 1], b: [k, ln.idx] });
  for (const ln of c.cols) if (!ln.main) for (let k = 0; k < c.nr; k++) cand.push({ line: ln, k, a: [ln.idx - 1, k], b: [ln.idx, k] });
  const total = c.rows.reduce((a, l) => a + l.nodes.length - 1, 0) + c.cols.reduce((a, l) => a + l.nodes.length - 1, 0);
  const want = Math.round(0.2 * c.org * total * Math.min(1, distOf(c.org) / 0.6) + c.r() * 0.5);
  const bad = (q: [number, number]) => (q[0] === c.plaza[0] && q[1] === c.plaza[1]) || c.parks.some((p) => p[0] === q[0] && p[1] === q[1]);
  const used = new Set<string>();
  let n = 0;
  for (let t = 0; t < 40 && n < want && cand.length; t++) {
    const q = cand.splice(Math.floor(c.r() * cand.length), 1)[0];
    if (q.line.cut >= 0 || bad(q.a) || bad(q.b) || used.has(q.a.join()) || used.has(q.b.join())) continue;
    const last = q.line.nodes.length - 2;
    q.line.cut = q.k;
    q.line.stubA = q.k === 0 ? false : q.k === last ? true : c.r() < 0.5;
    q.line.stubF = 0.3 + c.r() * 0.15;
    if (!connected(c)) {
      q.line.cut = -1;
      continue;
    }
    used.add(q.a.join());
    used.add(q.b.join());
    grp.set(q.a.join(), n);
    grp.set(q.b.join(), n);
    n++;
  }
  return grp;
}
/** 도로가 남은 모든 교차점이 이어져 있는지 */
function connected(c: Ctx): boolean {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };
  for (const ln of c.rows) for (let k = 0; k < ln.nodes.length - 1; k++) if (k !== ln.cut) add(`${k},${ln.idx}`, `${k + 1},${ln.idx}`);
  for (const ln of c.cols) for (let k = 0; k < ln.nodes.length - 1; k++) if (k !== ln.cut) add(`${ln.idx},${k}`, `${ln.idx},${k + 1}`);
  const keys = [...adj.keys()];
  if (!keys.length) return true;
  const seen = new Set([keys[0]]);
  const st = [keys[0]];
  while (st.length) for (const b of adj.get(st.pop()!)!) if (!seen.has(b)) (seen.add(b), st.push(b));
  return seen.size === keys.length;
}

/* ───────── 블록 다각형 ───────── */

function extend(p: Pt[], e: number): Pt[] {
  const n = p.length;
  const a = p[0], b = p[1], y = p[n - 2], z = p[n - 1];
  const l0 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l1 = Math.hypot(z.x - y.x, z.y - y.y) || 1;
  return [{ x: a.x - ((b.x - a.x) / l0) * e, y: a.y - ((b.y - a.y) / l0) * e }, ...p, { x: z.x + ((z.x - y.x) / l1) * e, y: z.y + ((z.y - y.y) / l1) * e }];
}
/** 변(시계 방향 가운데 선)을 안쪽으로 ds 만큼 옮겨 이웃 변끼리 만나는 곳에서 자름 → 다각형 + 꼭짓점 번호 */
export function joinSides(sides: Pt[][], ds: number[], corners: Pt[]): { poly: Pt[]; ci: number[] } {
  const n = sides.length;
  const ext = 60;
  const O = sides.map((s, k) => extend(offsetLine(s, ds[k]), ext));
  const maxD = Math.max(...ds.map(Math.abs));
  const R = ext + maxD * 2 + 40;
  const cuts: { ia: number; ib: number; x: Pt }[] = [];
  for (let k = 0; k < n; k++) {
    const A = O[k], B = O[(k + 1) % n], C = corners[(k + 1) % n];
    let best: { ia: number; ib: number; x: Pt; d: number } | null = null;
    for (let ia = A.length - 2; ia >= 0; ia--) {
      const a0 = A[ia], a1 = A[ia + 1];
      if (Math.min(dist(a0, C), dist(a1, C)) > R) {
        if (ia < A.length - 4) break;
        continue;
      }
      for (let ib = 0; ib < B.length - 1; ib++) {
        const b0 = B[ib], b1 = B[ib + 1];
        if (Math.min(dist(b0, C), dist(b1, C)) > R) {
          if (ib > 3) break;
          continue;
        }
        const q = segX(a0, a1, b0, b1);
        if (!q) continue;
        const d = Math.hypot(q.x - C.x, q.y - C.y);
        if (!best || d < best.d) best = { ia, ib, x: { x: q.x, y: q.y }, d };
      }
    }
    if (best) cuts.push({ ia: best.ia, ib: best.ib, x: best.x });
    else {
      const a = A[A.length - 2], b = B[1];
      cuts.push({ ia: A.length - 3, ib: 1, x: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
    }
  }
  const poly: Pt[] = [];
  const ci: number[] = [];
  for (let k = 0; k < n; k++) {
    const prev = cuts[(k - 1 + n) % n];
    ci.push(poly.length);
    poly.push(prev.x);
    const A = O[k];
    const s = prev.ib + 1, e = cuts[k].ia;
    for (let i = s; i <= e; i++) poly.push(A[i]);
  }
  return { poly, ci };
}

interface Patch { ok: boolean; lenU: number; lenV: number; at(u: number, v: number): Pt }
/** 네 변(위·오른·아래·왼)으로 쿤스 곡면: at(u, v), u = 왼→오른, v = 위→아래 */
function patchOf(poly: Pt[], ci: number[]): Patch {
  const seg = (a: number, b: number) => (a <= b ? poly.slice(a, b + 1) : [...poly.slice(a), ...poly.slice(0, b + 1)]);
  const T = seg(ci[0], ci[1]), Rr = seg(ci[1], ci[2]), B = seg(ci[2], ci[3]).reverse(), Lf = seg(ci[3], ci[0]).reverse();
  const cT = cumLen(T), cR = cumLen(Rr), cB = cumLen(B), cL = cumLen(Lf);
  const lT = cT[cT.length - 1], lR = cR[cR.length - 1], lB = cB[cB.length - 1], lL = cL[cL.length - 1];
  const c00 = T[0], c10 = T[T.length - 1], c01 = B[0], c11 = B[B.length - 1];
  const q1 = { x: 0, y: 0, tx: 0, ty: 0 }, q2 = { x: 0, y: 0, tx: 0, ty: 0 }, q3 = { x: 0, y: 0, tx: 0, ty: 0 }, q4 = { x: 0, y: 0, tx: 0, ty: 0 };
  const at = (u: number, v: number): Pt => {
    const t = poseAt(T, cT, u * lT, q1), b = poseAt(B, cB, u * lB, q2), l = poseAt(Lf, cL, v * lL, q3), rr = poseAt(Rr, cR, v * lR, q4);
    const x = (1 - v) * t.x + v * b.x + (1 - u) * l.x + u * rr.x - ((1 - u) * (1 - v) * c00.x + u * (1 - v) * c10.x + (1 - u) * v * c01.x + u * v * c11.x);
    const y = (1 - v) * t.y + v * b.y + (1 - u) * l.y + u * rr.y - ((1 - u) * (1 - v) * c00.y + u * (1 - v) * c10.y + (1 - u) * v * c01.y + u * v * c11.y);
    return { x, y };
  };
  const mt = at(0.5, 0), mb = at(0.5, 1), ml = at(0, 0.5), mr = at(1, 0.5);
  const ok = mb.y - mt.y > -1 && mr.x - ml.x > -1;
  return { ok, lenU: Math.min(lT, lB), lenV: Math.min(lL, lR), at };
}

/**
 * 부지 중심이 놓일 수 있는 면(region) 안에, 블록 방향(θ 후보)으로 기운 간격 s 격자를 가장 많이 들어가게 놓음.
 * 블록 안 부지끼리는 곧은 격자라 3곳 원 제약이 늘 지켜짐(직각 삼각형 = 0.707 lot)
 */
function fitLattice(region: Pt[], s: number, thetas: number[], r: () => number, base: number): { pts: { x: number; y: number; k: number; l: number }[]; a: number } {
  const n = region.length;
  const X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) (X[i] = region[i].x), (Y[i] = region[i].y);
  const inside = (x: number, y: number): boolean => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) if (Y[i] > y !== Y[j] > y && x < ((X[j] - X[i]) * (y - Y[i])) / (Y[j] - Y[i] || 1e-12) + X[i]) c = !c;
    return c;
  };
  const N = 5;
  let best = { score: -Infinity, th: 0, u0: 0, v0: 0, nu: 0, nv: 0 };
  /* 거의 같은 방향(90° 주기로 2° 안)은 한 번만 */
  const q = Math.PI / 2;
  const ths: number[] = [];
  for (const t of thetas) if (!ths.some((u) => { const d = Math.abs((((t - u) % q) + q) % q); return Math.min(d, q - d) < 0.035; })) ths.push(t);
  for (const th of ths) {
    const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const u = X[i] * ux + Y[i] * uy, v = X[i] * vx + Y[i] * vy;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        const su = u0 + (a / N) * s, sv = v0 + (b / N) * s;
        const nu = Math.floor((u1 - su) / s + 1e-6) + 1, nv = Math.floor((v1 - sv) / s + 1e-6) + 1;
        let cnt = 0;
        for (let l = 0; l < nv; l++)
          for (let k = 0; k < nu; k++) {
            const u = su + k * s, v = sv + l * s;
            if (inside(u * ux + v * vx, u * uy + v * vy)) cnt++;
          }
        /* 블록 평균 방향(base)에서 많이 기울수록 감점: 45° 돌아가면 부지 0.8곳 몫 */
        let dth = Math.abs(((th - base) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
        dth = Math.min(dth, Math.PI / 2 - dth);
        const score = cnt + r() * 0.4 - 0.8 * (dth / (Math.PI / 4));
        if (score > best.score) best = { score, th, u0: su, v0: sv, nu, nv };
      }
  }
  const { th, u0, v0, nu, nv } = best;
  const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
  const pts: { x: number; y: number; k: number; l: number }[] = [];
  for (let l = 0; l < nv; l++)
    for (let k = 0; k < nu; k++) {
      const u = u0 + k * s, v = v0 + l * s;
      const x = u * ux + v * vx, y = u * uy + v * vy;
      if (inside(x, y)) pts.push({ x, y, k, l });
    }
  return { pts, a: th };
}

/* ───────── 본체 ───────── */

interface Built { m: MapData; lots: number; bigs: number }

export function genMap(did: DistrictId, orient: Orient, seed: number, day: number): MapData {
  const org0 = orgFor(did, day, seed);
  let last: Built | null = null;
  if (org0 >= GRID_BELOW) {
    /* 6번은 그 정형도 그대로, 그다음 4번은 흔들림을 조금씩 줄여서(그래도 구불구불) — 격자로 되돌아가는 판을 줄임 */
    for (let t = 0; t < 10; t++) {
      const org = t < 6 ? org0 : Math.max(GRID_BELOW, org0 - (t - 5) * 0.06);
      const b = build(did, orient, hash32(seed, 'try', t), org, false);
      if (b && b.lots >= LOTS_ORG[0] && b.bigs >= BIGS[0]) {
        b.m.seed = seed;
        b.m.day = day;
        b.m.tries = t + 1;
        return b.m;
      }
      last = b || last;
    }
  }
  for (let t = 0; t < 6; t++) {
    const b = build(did, orient, hash32(seed, 'grid', t), Math.min(org0, GRID_BELOW - 0.01), true);
    if (b && b.lots >= LOTS_GRID[0] && b.bigs >= BIGS[0]) {
      b.m.seed = seed;
      b.m.day = day;
      b.m.tries = org0 >= GRID_BELOW ? 10 + t : t + 1;
      return b.m;
    }
    last = b || last;
  }
  if (!last) throw new Error('[map] 생성 실패');
  last.m.seed = seed;
  last.m.day = day;
  return last.m;
}

function build(did: DistrictId, o: Orient, seed: number, org: number, grid: boolean): Built | null {
  const g = GEO[o];
  const L = g.lot;
  const r = rng(seed);
  const gen = DGEN[did];
  const tmin = tripleMin(g);
  const c: Ctx = {
    did, o, g, r, org, grid, nc: 0, nr: 0, bw: [], bh: [], colW: [], rowW: [], mainRow: 1, mainCol: 1, x0: 0, y0: 0,
    P: [], rows: [], cols: [], frame: { x0: 0, y0: 0, x1: 0, y1: 0 }, plaza: [0, 0], parks: [],
  };
  if (!layout(c)) return null;
  buildLattice(c);
  const grp = cutEdges(c);
  const { nc, nr, P } = c;

  /* 칸 → 네 변 (가운데 선) · 변마다 도로 폭 */
  const lineSide = (ln: Line | null, k: number, fwd: boolean, a: Pt, b: Pt): Pt[] => {
    const pts = ln ? subPath(ln.pts, ln.cum, ln.ns[k], ln.ns[k + 1]) : [a, b];
    if (ln) {
      pts[0] = { x: a.x, y: a.y };
      pts[pts.length - 1] = { x: b.x, y: b.y };
    }
    return fwd ? pts : pts.reverse();
  };
  const rowLine = (j: number) => (j > 0 && j < nr ? c.rows[j - 1] : null);
  const colLine = (i: number) => (i > 0 && i < nc ? c.cols[i - 1] : null);
  interface Cell { i: number; j: number; sides: Pt[][]; wd: number[]; cutS: boolean[]; corners: Pt[] }
  const cells: Cell[] = [];
  for (let j = 0; j < nr; j++)
    for (let i = 0; i < nc; i++) {
      const tl = P[i][j], tr = P[i + 1][j], br = P[i + 1][j + 1], bl = P[i][j + 1];
      const top = rowLine(j), bot = rowLine(j + 1), lef = colLine(i), rig = colLine(i + 1);
      cells.push({
        i, j, corners: [tl, tr, br, bl],
        sides: [lineSide(top, i, true, tl, tr), lineSide(rig, j, true, tr, br), lineSide(bot, i, false, bl, br), lineSide(lef, j, false, tl, bl)],
        wd: [top?.w ?? 0, rig?.w ?? 0, bot?.w ?? 0, lef?.w ?? 0],
        cutS: [!!top && top.cut === i, !!rig && rig.cut === j, !!bot && bot.cut === i, !!lef && lef.cut === j],
      });
    }

  /* 도로(가닥) · 막다른 골목 */
  const streets: MapStreet[] = [];
  for (const ln of [...c.rows, ...c.cols]) {
    const end = ln.cum[ln.cum.length - 1];
    const w = r2(ln.w);
    /* 교차점(건너는 도로 폭) — 가운데 점선을 교차로에서 끊는 데 씀 */
    const nodeX = (s0: number, s1: number) => {
      const o: { x: number; y: number; w: number }[] = [];
      for (let k = 1; k < ln.nodes.length - 1; k++) {
        const cross = ln.ax === 'h' ? c.cols[k - 1] : c.rows[k - 1];
        if (cross && ln.ns[k] >= s0 - 1 && ln.ns[k] <= s1 + 1) o.push({ x: r2(ln.nodes[k].x), y: r2(ln.nodes[k].y), w: r2(cross.w) });
      }
      return o;
    };
    if (ln.cut < 0) {
      streets.push({ id: ln.id, ax: ln.ax, w, main: ln.main, stub: false, pts: simp(ln.pts), nx: nodeX(0, end) });
      continue;
    }
    const k = ln.cut, last = ln.nodes.length - 2;
    const sa = ln.ns[k], sb = ln.ns[k + 1];
    if (k > 0) streets.push({ id: ln.id + 'a', ax: ln.ax, w, main: false, stub: false, pts: simp(subPath(ln.pts, ln.cum, 0, sa)), nx: nodeX(0, sa) });
    if (k < last) streets.push({ id: ln.id + 'b', ax: ln.ax, w, main: false, stub: false, pts: simp(subPath(ln.pts, ln.cum, sb, end)), nx: nodeX(sb, end) });
    const f = ln.stubF * (sb - sa);
    const st = ln.stubA ? subPath(ln.pts, ln.cum, sa, sa + f) : subPath(ln.pts, ln.cum, sb - f, sb).reverse();
    streets.push({ id: ln.id + 's', ax: ln.ax, w, main: false, stub: true, pts: simp(st) });
  }
  const sBox = streets.map((s) => {
    const b = bbox(s.pts);
    return { x0: b.x - s.w, y0: b.y - s.w, x1: b.x + b.w + s.w, y1: b.y + b.h + s.w };
  });
  /** 점 p 에서 도로 가장자리까지(음수 = 도로 위). pad 보다 먼 도로는 건너뜀 */
  const roadGap = (p: Pt, pad: number): number => {
    let m = Infinity;
    for (let i = 0; i < streets.length; i++) {
      const b = sBox[i];
      if (p.x < b.x0 - pad || p.x > b.x1 + pad || p.y < b.y0 - pad || p.y > b.y1 + pad) continue;
      const d = distLine(p, streets[i].pts) - streets[i].w / 2;
      if (d < m) m = d;
    }
    return m;
  };

  /* 블록 · 부지 */
  const blocks: MapBlock[] = [];
  const lotsT: LotT[] = [];
  const lotGrid: Map<string, number>[] = [];
  const patches: Patch[] = [];
  for (const cl of cells) {
    const id = blocks.length;
    const isPlaza = cl.i === c.plaza[0] && cl.j === c.plaza[1];
    const pi = c.parks.findIndex((p) => p[0] === cl.i && p[1] === cl.j);
    const kind: MapBlock['kind'] = isPlaza ? 'plaza' : pi >= 0 ? (pi === 0 ? gen.park : 'park') : 'lots';
    const dBlock = cl.wd.map((w, k) => (cl.cutS[k] ? -(w / 2 + 2) : w / 2));
    const bp = joinSides(cl.sides, dBlock, cl.corners);
    const dPatch = cl.wd.map((w) => w / 2 + L / 2);
    const pp = joinSides(cl.sides, dPatch, cl.corners);
    const pa = patchOf(pp.poly, pp.ci);
    patches.push(pa);
    const bb = bbox(bp.poly);
    const ctr = pa.ok ? pa.at(0.5, 0.5) : { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
    const poly = dedupe(simp(bp.poly), true);
    const blk: MapBlock = { id, c: cl.i, r: cl.j, x: r2(bb.x), y: r2(bb.y), w: r2(bb.w), h: r2(bb.h), cx: r2(ctr.x), cy: r2(ctr.y), kind, lots: [], poly };
    const gk = grp.get(`${cl.i},${cl.j}`);
    if (gk !== undefined) blk.grp = gk;
    blocks.push(blk);
    const G = new Map<string, number>();
    lotGrid.push(G);
    if (kind !== 'lots' || !pa.ok) continue;
    const put = (x: number, y: number, a: number, k: number, l: number) => {
      G.set(`${k},${l}`, lotsT.length);
      lotsT.push({ x, y, a, block: id, k, l });
    };
    let rowsOf: { k0: number; k1: number; l: number; at: (k: number) => Pt }[] = [];
    if (grid) {
      /* 곧은 격자: 블록 칸 수 그대로(부지 판이 블록을 딱 채움) */
      const nu = Math.max(1, Math.floor(pa.lenU / L + 0.01) + 1), nv = Math.max(1, Math.floor(pa.lenV / L + 0.01) + 1);
      for (let l = 0; l < nv; l++)
        for (let k = 0; k < nu; k++) {
          const p = pa.at(nu > 1 ? k / (nu - 1) : 0.5, nv > 1 ? l / (nv - 1) : 0.5);
          put(p.x, p.y, 0, k, l);
        }
    } else {
      const region = dedupe(simp(pp.poly), true);
      const [c0, c1, c2, c3] = pp.ci.map((i) => pp.poly[i]);
      const t1 = Math.atan2(c1.y - c0.y, c1.x - c0.x), t2 = Math.atan2(c2.y - c3.y, c2.x - c3.x);
      const t3 = Math.atan2(c3.y - c0.y, c3.x - c0.x) - Math.PI / 2, t4 = Math.atan2(c2.y - c1.y, c2.x - c1.x) - Math.PI / 2;
      const fit = fitLattice(region, L * 1.004, [t1, t2, (t1 + t2) / 2, t3, t4], r, (t1 + t2) / 2);
      for (const p of fit.pts) put(p.x, p.y, fit.a, p.k, p.l);
      if (did === 'euljiro' && fit.pts.length) {
        const ux = Math.cos(fit.a), uy = Math.sin(fit.a);
        const base = fit.pts[0];
        const byL = new Map<number, { k0: number; k1: number }>();
        for (const p of fit.pts) {
          const q = byL.get(p.l);
          if (!q) byL.set(p.l, { k0: p.k, k1: p.k });
          else (q.k0 = Math.min(q.k0, p.k)), (q.k1 = Math.max(q.k1, p.k));
        }
        rowsOf = [...byL.entries()].map(([l, q]) => ({
          k0: q.k0, k1: q.k1, l,
          at: (k: number) => ({ x: base.x + (k - base.k) * L * 1.004 * ux - (l - base.l) * L * 1.004 * uy, y: base.y + (k - base.k) * L * 1.004 * uy + (l - base.l) * L * 1.004 * ux }),
        }));
      }
    }
    if (did === 'euljiro') blk.gaps = gapsOf(grid, pa, rowsOf, L, lotsT, id);
  }

  /* 검사·보정 */
  repair(lotsT, roadGap, blocks, g, tmin);
  const maxN = grid ? LOTS_GRID[1] : LOTS_ORG[1];
  for (let live = lotsT.filter((q) => !q.dead); live.length > maxN; live = lotsT.filter((q) => !q.dead)) live[Math.floor(r() * live.length)].dead = true;
  const alive = lotsT.filter((q) => !q.dead);
  /* 모자라면 여기서 그만(다음 씨앗으로) — 경로·장식까지 만들지 않음 */
  if (alive.length < (grid ? LOTS_GRID[0] : LOTS_ORG[0])) return null;
  const idOf = new Map<LotT, number>();
  alive.forEach((q, n) => idOf.set(q, n));
  const slots: MapSlot[] = alive.map((q, n) => ({ id: n, kind: 'lot', x: r2(q.x), y: r2(q.y), block: q.block, ...(q.a ? { a: r2(q.a) } : {}) }));
  for (const q of alive) blocks[q.block].lots.push(idOf.get(q)!);

  /* 큰 부지: 붙은 2×2 */
  const bigC: { x: number; y: number; lots: number[]; block: number }[] = [];
  for (const b of blocks) {
    const G = lotGrid[b.id];
    for (const [key, i0] of G) {
      const [k, l] = key.split(',').map(Number);
      const ids = [i0, G.get(`${k + 1},${l}`), G.get(`${k},${l + 1}`), G.get(`${k + 1},${l + 1}`)];
      if (ids.some((i) => i === undefined || lotsT[i].dead)) continue;
      const q = ids.map((i) => lotsT[i!]);
      const ctr = { x: q.reduce((a, p) => a + p.x, 0) / 4, y: q.reduce((a, p) => a + p.y, 0) / 4 };
      if (b.poly && distLine(ctr, b.poly, true) < 0.93 * L) continue;
      if (roadGap(ctr, L) < 0.93 * L) continue;
      const near = alive.filter((p) => dist(p, ctr) < 1.45 * L).map((p) => idOf.get(p)!);
      bigC.push({ ...ctr, lots: near, block: b.id });
    }
  }
  let bigs = bigC;
  if (bigs.length > BIGS[1]) {
    bigs = [];
    const pool = bigC.slice();
    while (bigs.length < BIGS[1] && pool.length) bigs.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  }
  if (bigs.length < BIGS[0]) return null;
  for (const b of bigs) slots.push({ id: slots.length, kind: 'big', x: r2(b.x), y: r2(b.y), block: b.block, lots: b.lots });
  /* 광장 */
  const pz = blocks.find((b) => b.kind === 'plaza')!;
  const pzP = patches[pz.id];
  slots.push({ id: slots.length, kind: 'plaza', x: pz.cx, y: pz.cy, block: pz.id, w: r2(pzP.lenU + L), h: r2(pzP.lenV + L) });

  const routes = makeRoutes(c);
  const xings = makeXings(c);
  const decor = makeDecor(c, streets, roadGap, blocks, slots, patches);

  const m: MapData = {
    district: did, orient: o, W: g.W, H: g.H, lot: L, U: g.U, road: g.road, area: { ...g.area },
    grid: { x: r2(c.frame.x0), y: r2(c.frame.y0), w: r2(c.frame.x1 - c.frame.x0), h: r2(c.frame.y1 - c.frame.y0) }, topLimit: g.area.y,
    blocks, spawnSlots: slots, roads: [], routes, crosswalks: [], bands: gen.bands ? [{ ...gen.bands[o] }] : [], decor,
    streets, xings, org: r2(org), mode: grid ? 'grid' : 'org',
  };
  return { m, lots: alive.length, bigs: bigs.length };
}

/** 을지로: 부지 사이 좁은 골목 선 */
function gapsOf(grid: boolean, pa: Patch, rows: { k0: number; k1: number; l: number; at: (k: number) => Pt }[], L: number, lots: LotT[], id: number): Pt[][] {
  const gaps: Pt[][] = [];
  if (grid) {
    const nu = Math.max(1, Math.floor(pa.lenU / L + 0.01) + 1), nv = Math.max(1, Math.floor(pa.lenV / L + 0.01) + 1);
    const eu = (L / 2 - 8) / Math.max(1, pa.lenU), ev = (L / 2 - 8) / Math.max(1, pa.lenV);
    for (let l = 0; l < nv - 1; l++) {
      const v = (l + 0.5) / (nv - 1);
      gaps.push([pa.at(-eu, v), pa.at(1 + eu, v)].map(P2));
    }
    for (let k = 0; k < nu - 1; k++) {
      const u = (k + 0.5) / (nu - 1);
      gaps.push([pa.at(u, -ev), pa.at(u, 1 + ev)].map(P2));
    }
    return gaps;
  }
  const e = 0.5 - 8 / L;
  const byL = new Map(rows.map((q) => [q.l, q]));
  for (const q of rows) {
    const nx = byL.get(q.l + 1);
    if (nx) {
      const k0 = Math.max(q.k0, nx.k0), k1 = Math.min(q.k1, nx.k1);
      if (k1 >= k0) {
        const a = q.at(k0 - e), b = q.at(k1 + e), a2 = nx.at(k0 - e), b2 = nx.at(k1 + e);
        gaps.push([P2({ x: (a.x + a2.x) / 2, y: (a.y + a2.y) / 2 }), P2({ x: (b.x + b2.x) / 2, y: (b.y + b2.y) / 2 })]);
      }
    }
    for (let k = q.k0; k < q.k1; k++) {
      const a = q.at(k + 0.5);
      const up = byL.has(q.l - 1) ? 0.5 : e, dn = byL.has(q.l + 1) ? 0.5 : e;
      const ux = q.at(k + 1.5).x - a.x, uy = q.at(k + 1.5).y - a.y;
      const len = Math.hypot(ux, uy) || 1;
      const vx = -uy / len, vy = ux / len;
      gaps.push([P2({ x: a.x - vx * L * up, y: a.y - vy * L * up }), P2({ x: a.x + vx * L * dn, y: a.y + vy * L * dn })]);
    }
  }
  void lots;
  void id;
  return gaps;
}

/** 거의 곧은 구간의 점을 줄임(JSON·그리기 가볍게) */
function simp(p: Pt[]): Pt[] {
  const out: Pt[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1) {
      const a = out[out.length - 1], b = p[i], cc = p[i + 1];
      const cross = (b.x - a.x) * (cc.y - a.y) - (b.y - a.y) * (cc.x - a.x);
      const len = Math.hypot(cc.x - a.x, cc.y - a.y) || 1;
      if (Math.abs(cross) / len < 0.25 && Math.hypot(b.x - a.x, b.y - a.y) < 400) continue;
    }
    out.push(P2(p[i]));
  }
  return out;
}

/* ───────── 검사·보정 ───────── */

function repair(lots: LotT[], roadGap: (p: Pt, pad: number) => number, blocks: MapBlock[], g: OrientGeo, tmin: number): void {
  const L = g.lot;
  const A = g.area;
  for (const q of lots) {
    if (q.x < A.x || q.x > A.x + A.w || q.y < A.y || q.y > A.y + A.h) q.dead = true;
    else if (roadGap(q, L) < L / 2 - 1) q.dead = true;
    else {
      const b = blocks[q.block];
      if (b.poly && (!inPoly(q, b.poly) || distLine(q, b.poly, true) < L / 2 - 1.5)) q.dead = true;
    }
  }
  const lv = lots.filter((q) => !q.dead);
  const n = lv.length;
  /* 간격 < 0.95 lot */
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!lv[i].dead && !lv[j].dead && dist(lv[i], lv[j]) < 0.95 * L) lv[j].dead = true;
  /* 3곳 원: 이웃(2 × 기준 안)끼리만. 가장 많이 걸린 부지부터 뺌 */
  const lim = 2 * tmin;
  const nb: number[][] = lv.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (dist(lv[i], lv[j]) < lim) (nb[i].push(j), nb[j].push(i));
  const tri: [number, number, number][] = [];
  for (let i = 0; i < n; i++)
    for (const j of nb[i]) {
      if (j <= i) continue;
      for (const k of nb[j]) if (k > j && nb[i].includes(k) && sec3(lv[i], lv[j], lv[k]) < tmin) tri.push([i, j, k]);
    }
  let live = tri.filter((t) => !t.some((x) => lv[x].dead));
  while (live.length) {
    const cnt = new Map<number, number>();
    for (const t of live) for (const x of t) cnt.set(x, (cnt.get(x) || 0) + 1);
    let w = -1, wn = 0;
    for (const [x, k] of cnt) if (k > wn) (w = x), (wn = k);
    lv[w].dead = true;
    live = live.filter((t) => !t.includes(w));
  }
}

/** 검사 스크립트용: 어긴 건수 */
export function checkMap(m: MapData): Record<string, number> {
  const L = m.lot;
  const g = GEO[m.orient];
  const tmin = tripleMin(g);
  const lots = m.spawnSlots.filter((s) => s.kind === 'lot');
  const streets = m.streets || [];
  const out: Record<string, number> = { lots: lots.length, bigs: m.spawnSlots.filter((s) => s.kind === 'big').length, plaza: m.spawnSlots.filter((s) => s.kind === 'plaza').length, routes: m.routes.length };
  let pair = 0, road = 0, area = 0, triple = 0, decor = 0, routeEnds = 0, bigRoad = 0, bigOverlap = 0;
  for (let i = 0; i < lots.length; i++) {
    const a = lots[i];
    if (a.x < m.area.x || a.x > m.area.x + m.area.w || a.y < m.area.y || a.y > m.area.y + m.area.h) area++;
    if (streets.some((s) => distLine(a, s.pts) < s.w / 2 + L / 2 - 1.5)) road++;
    for (let j = i + 1; j < lots.length; j++) {
      const b = lots[j];
      if (dist(a, b) < 0.95 * L) pair++;
      if (dist(a, b) >= 2 * tmin) continue;
      for (let k = j + 1; k < lots.length; k++) {
        const cc = lots[k];
        if (dist(a, cc) >= 2 * tmin || dist(b, cc) >= 2 * tmin) continue;
        if (sec3(a, b, cc) < tmin - 0.01) triple++;
      }
    }
  }
  for (const d of m.decor) {
    const side = L * d.s * 1.1;
    const x0 = d.x - side / 2, x1 = d.x + side / 2, y0 = d.y - side, y1 = d.y;
    for (const q of lots) {
      const dx = Math.max(x0 - q.x, 0, q.x - x1), dy = Math.max(y0 - q.y, 0, q.y - y1);
      if (Math.hypot(dx, dy) < 0.3 * L) decor++;
    }
  }
  for (const rt of m.routes) {
    const a = rt.pts[0], b = rt.pts[rt.pts.length - 1];
    const off = (p: Pt) => p.x < 0 || p.x > m.W || p.y < m.area.y - 1 || p.y > m.H;
    if (!off(a) || !off(b)) routeEnds++;
  }
  for (const b of m.spawnSlots.filter((s) => s.kind === 'big')) {
    if (streets.some((s) => distLine(b, s.pts) < s.w / 2 + 0.9 * L)) bigRoad++;
    /* 큰 대상(폭 최대 1.95 lot) 반지름 0.95 lot 안에 묶음 밖 부지(반지름 0.45 lot)가 겹치는지 */
    for (const q of lots) if (!b.lots!.includes(q.id) && dist(b, q) < 1.4 * L) bigOverlap++;
  }
  Object.assign(out, { pair, road, area, triple, decor, routeEnds, bigRoad, bigOverlap });
  return out;
}

/* ───────── 경로 ───────── */

function makeRoutes(c: Ctx): MapRoute[] {
  const g = c.g;
  const lo = LANE_OVER * g.U;
  type Edge = { to: string; pts: Pt[]; len: number };
  const adj = new Map<string, Edge[]>();
  const add = (a: string, b: string, pts: Pt[]) => {
    const len = cumLen(pts).pop()!;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, pts, len });
    adj.get(b)!.push({ to: a, pts: pts.slice().reverse(), len });
  };
  const ends: { line: Line; a: string; b: string }[] = [];
  for (const ln of [...c.rows, ...c.cols]) {
    const key = (k: number) => (ln.ax === 'h' ? `${k},${ln.idx}` : `${ln.idx},${k}`);
    const n = ln.nodes.length - 1;
    const tA = `T${ln.id}a`, tB = `T${ln.id}b`;
    const s0 = ln.ax === 'h' ? { x: -lo, y: ln.nodes[0].y } : { x: ln.nodes[0].x, y: g.area.y - lo };
    const s1 = ln.ax === 'h' ? { x: g.W + lo, y: ln.nodes[n].y } : { x: ln.nodes[n].x, y: g.H + lo };
    if (ln.cut !== 0) add(tA, key(0), [s0, ln.nodes[0]]);
    if (ln.cut !== n - 1) add(key(n), tB, [ln.nodes[n], s1]);
    for (let k = 0; k < n; k++) if (k !== ln.cut) add(key(k), key(k + 1), subPath(ln.pts, ln.cum, ln.ns[k], ln.ns[k + 1]));
    ends.push({ line: ln, a: tA, b: tB });
  }
  const path = (a: string, b: string): Pt[] | null => {
    if (!adj.has(a) || !adj.has(b)) return null;
    const D = new Map<string, number>([[a, 0]]);
    const prev = new Map<string, { from: string; e: Edge }>();
    const todo = new Set([a]);
    while (todo.size) {
      let u = '', du = Infinity;
      for (const k of todo) if ((D.get(k) ?? Infinity) < du) (u = k), (du = D.get(k)!);
      todo.delete(u);
      if (u === b) break;
      for (const e of adj.get(u) || []) {
        if (e.to.startsWith('T') && e.to !== b) continue;
        const nd = du + e.len;
        if (nd < (D.get(e.to) ?? Infinity)) {
          D.set(e.to, nd);
          prev.set(e.to, { from: u, e });
          todo.add(e.to);
        }
      }
    }
    if (!prev.has(b)) return null;
    const segs: Pt[][] = [];
    for (let v = b; v !== a; v = prev.get(v)!.from) segs.push(prev.get(v)!.e.pts);
    segs.reverse();
    const out: Pt[] = [];
    for (const s of segs) for (const p of s) if (!out.length || dist(out[out.length - 1], p) > 0.5) out.push(p);
    return out;
  };
  const list: { id: string; pts: Pt[] }[] = [];
  for (const e of ends) {
    const p = path(e.a, e.b);
    if (p) list.push({ id: e.line.id, pts: p });
  }
  /* 4개 미만이면 꺾어 가는 길을 더함 */
  const terms = ends.flatMap((e) => [e.a, e.b]).filter((t) => adj.has(t));
  for (let t = 0; list.length < ROUTES[0] && t < 30; t++) {
    const a = terms[Math.floor(c.r() * terms.length)], b = terms[Math.floor(c.r() * terms.length)];
    if (a === b || a.slice(0, -1) === b.slice(0, -1)) continue;
    const p = path(a, b);
    if (p && !list.some((q) => q.id === `${a}-${b}` || q.id === `${b}-${a}`)) list.push({ id: `${a}-${b}`, pts: p });
  }
  while (list.length > ROUTES[1]) list.splice(Math.floor(c.r() * list.length), 1);
  return list.map((q) => {
    const pts = simp(q.pts);
    const a = pts[0], b = pts[pts.length - 1];
    return { id: q.id, ax: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v', pts, cum: cumLen(pts).map(r2) } as MapRoute;
  });
}

/* ───────── 횡단보도 ───────── */

function makeXings(c: Ctx): MapXing[] {
  const out: MapXing[] = [];
  const g = c.g;
  for (const ln of [...c.rows, ...c.cols]) {
    const n = ln.nodes.length - 1;
    for (let k = 1; k < n; k++) {
      const cross = ln.ax === 'h' ? c.cols[k - 1] : c.rows[k - 1];
      if (!cross) continue;
      /* 끊긴 교차 도로(막다른 골목이 아닌 쪽)면 건널목 없음 */
      const depth = g.road * 0.545 * Math.min(1, ln.w / g.road + 0.1);
      const d = cross.w / 2 + depth / 2 + 1;
      for (const dir of [-1, 1]) {
        const e = dir < 0 ? k - 1 : k;
        if (e === ln.cut) {
          const f = ln.stubF * (ln.ns[e + 1] - ln.ns[e]);
          const stubHere = (dir > 0 && ln.stubA) || (dir < 0 && !ln.stubA);
          if (!stubHere || f < d + depth) continue;
        }
        const p = poseAt(ln.pts, ln.cum, ln.ns[k] + dir * d);
        out.push({ x: r2(p.x), y: r2(p.y), a: r2(Math.atan2(p.ty, p.tx)), w: r2(ln.w), d: r2(depth) });
      }
    }
  }
  return out;
}

/* ───────── 장식 ───────── */

function makeDecor(c: Ctx, streets: MapStreet[], roadGap: (p: Pt, pad: number) => number, blocks: MapBlock[], slots: MapSlot[], patches: Patch[]): MapData['decor'] {
  const g = c.g;
  const L = g.lot;
  const r = c.r;
  const out: MapData['decor'] = [];
  const lotPts = slots.filter((s) => s.kind === 'lot');
  const ok = (x: number, y: number, s: number, gap = 0.28): boolean => {
    const w = L * s * 1.1;
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - w, y1 = y;
    if (x < 6 || x > g.W - 6 || y < g.area.y - 4 || y > g.H - 2) return false;
    for (const q of lotPts) {
      const dx = Math.max(x0 - q.x, 0, q.x - x1), dy = Math.max(y0 - q.y, 0, q.y - y1);
      if (dx * dx + dy * dy < 0.1024 * L * L) return false;
    }
    for (const d of out) if (Math.abs(d.x - x) < L * gap && Math.abs(d.y - y) < L * gap && Math.hypot(d.x - x, d.y - y) < L * gap) return false;
    return true;
  };
  /* 차도 위(보도 안쪽 경계보다 도로 가운데 쪽)에는 놓지 않음 */
  const sbb = streets.map((s) => bbox(s.pts));
  const onAsphalt = (x: number, y: number) => {
    for (let i = 0; i < streets.length; i++) {
      const s = streets[i];
      const lim = s.w * (0.5 - 0.18 * 0.9);
      const b = sbb[i];
      if (x < b.x - lim || x > b.x + b.w + lim || y < b.y - lim || y > b.y + b.h + lim) continue;
      if (distLine({ x, y }, s.pts) < lim) return true;
    }
    return false;
  };
  const put = (svgId: string, x: number, y: number, s: number, gap?: number) => {
    if (!ok(x, y, s, gap) || onAsphalt(x, y)) return false;
    out.push({ svgId, x: r2(x), y: r2(y), s });
    return true;
  };
  /* 교차로 모퉁이: 나무·가로등 */
  for (let i = 1; i < c.nc; i++)
    for (let j = 1; j < c.nr; j++) {
      const P = c.P[i][j];
      const row = c.rows[j - 1], col = c.cols[i - 1];
      const dirs: { ux: number; uy: number; w: number }[] = [];
      const add = (ln: Line, k: number, sgn: number) => {
        const e = sgn > 0 ? k : k - 1;
        if (e < 0 || e >= ln.nodes.length - 1) return;
        if (e === ln.cut) {
          const stubHere = (sgn > 0 && ln.stubA) || (sgn < 0 && !ln.stubA);
          if (!stubHere) return;
        }
        const p = poseAt(ln.pts, ln.cum, ln.ns[k] + sgn * 20);
        dirs.push({ ux: p.tx * sgn, uy: p.ty * sgn, w: ln.w });
      };
      add(row, i, 1);
      add(row, i, -1);
      add(col, j, 1);
      add(col, j, -1);
      dirs.sort((a, b) => Math.atan2(a.uy, a.ux) - Math.atan2(b.uy, b.ux));
      for (let k = 0; k < dirs.length; k++) {
        const a = dirs[k], b = dirs[(k + 1) % dirs.length];
        const cr = a.ux * b.uy - a.uy * b.ux;
        if (cr < 0.3) continue;
        const da = a.w * (0.5 - 0.18 * 0.45), db = b.w * (0.5 - 0.18 * 0.45);
        const x = P.x + (a.ux * db + b.ux * da) / cr, y = P.y + (a.uy * db + b.uy * da) / cr;
        const q = r();
        if (q < 0.34) put('d.tree', x, y, 0.46);
        else if (q < 0.58) put('d.lamp', x, y, 0.5);
      }
    }
  /* 큰길 가로수 */
  for (const s of streets) {
    if (!s.main) continue;
    const cum = cumLen(s.pts);
    const len = cum[cum.length - 1];
    for (let t = L * (0.8 + r()); t < len; t += L * (2 + r() * 1.2)) {
      const p = poseAt(s.pts, cum, t);
      const sg = r() < 0.5 ? 1 : -1;
      const off = s.w * (0.5 - 0.18 * 0.45);
      put('d.tree', p.x - p.ty * off * sg, p.y + p.tx * off * sg, 0.46, 0.8);
    }
  }
  /* 격자 밖 가장자리: 상권 장식 */
  const deco = [0, 1, 2, 3].map((k) => `d.${c.did}.${k}`);
  const margins: { x: number; w: number }[] = [
    { x: c.frame.x0 / 2, w: c.frame.x0 },
    { x: (c.frame.x1 + g.W) / 2, w: g.W - c.frame.x1 },
  ];
  let dk = Math.floor(r() * 4);
  for (const mg of margins) {
    if (mg.w < 58) continue;
    for (let y = g.area.y + L * (0.55 + r() * 0.4); y < g.H - 8; y += L * (1.05 + r() * 0.5)) {
      if (roadGap({ x: mg.x, y }, L) < 6 || roadGap({ x: mg.x, y: y - L * 0.45 }, L) < 4) continue;
      if (r() < 0.14) put('d.flower', mg.x, y, 0.3, 0.5);
      else put(deco[dk++ % 4], mg.x, y, 0.45, 0.5);
    }
  }
  /* 공원 · 돔 · 호수 */
  for (const b of blocks) {
    if (b.kind === 'lots' || b.kind === 'plaza') continue;
    const pa = patches[b.id];
    if (!pa.ok) continue;
    const at = (u: number, v: number) => pa.at(u, v);
    if (b.kind === 'park') {
      put('d.fountain', b.cx, b.cy + L * 0.42, 0.9, 0.2);
      put('d.bench', at(0.18, 0.62).x, at(0.18, 0.62).y, 0.34, 0.3);
      put('d.bench', at(0.82, 0.62).x, at(0.82, 0.62).y, 0.34, 0.3);
      for (const [u, v] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.95], [0.92, 0.95]]) if (r() < 0.75) put('d.tree', at(u, v).x, at(u, v).y, 0.5, 0.3);
    } else if (b.kind === 'dome') {
      put('d.magok.1', b.cx, b.cy + L * 0.5, 1.5, 0.2);
      put('d.tree', at(0.95, 0.12).x, at(0.95, 0.12).y, 0.5, 0.3);
      put('d.bench', at(0.5, 1).x, at(0.5, 1).y, 0.34, 0.3);
    } else {
      for (const [u, v] of [[0.05, 0.1], [0.95, 0.1], [0.05, 1], [0.95, 1]]) if (r() < 0.7) put('d.tree', at(u, v).x, at(u, v).y, 0.5, 0.3);
      put('d.bench', at(0.5, 1).x, at(0.5, 1).y + L * 0.1, 0.34, 0.3);
    }
  }
  /* 막다른 골목 끝 고깔 */
  for (const s of streets) {
    if (!s.stub) continue;
    const e = s.pts[s.pts.length - 1];
    if (ok(e.x, e.y + 6, 0.2, 0.1)) out.push({ svgId: 'd.cone', x: r2(e.x), y: r2(e.y + 6), s: 0.2 });
  }
  out.sort((a, b) => a.y - b.y);
  return out;
}
