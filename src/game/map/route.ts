/**
 * 도로형 대상·차가 곡선 경로(MapRoute.pts)를 길이 s 로 따라가는 계산 (설계서 5-5). 순수 함수.
 */
import type { MapRoute } from '../data';
import { cumLen, poseAt, type Pose } from './geom';

const CUM = new WeakMap<MapRoute, number[]>();
/** 누적 길이(생성 지도는 cum 을 같이 줌, 옛 지도는 여기서 계산해 캐시) */
export function routeCum(r: MapRoute): number[] {
  if (r.cum && r.cum.length === r.pts.length) return r.cum;
  let c = CUM.get(r);
  if (!c) {
    c = cumLen(r.pts);
    CUM.set(r, c);
  }
  return c;
}
export function routeLen(r: MapRoute): number {
  const c = routeCum(r);
  return c[c.length - 1];
}
export function routePose(r: MapRoute, s: number, out?: Pose): Pose {
  return poseAt(r.pts, routeCum(r), s, out);
}
/**
 * 그림 방향: 진행 방향(접선 × dir)이 가로에 가까우면 'h'(d = 오른쪽 +1), 세로면 'v'(d = 아래 +1).
 * 45° 근처에서 그림이 떨리지 않게 지금 축을 1.2배 우대
 */
export function roadAxis(vx: number, vy: number, prev: 'h' | 'v'): { ax: 'h' | 'v'; d: 1 | -1 } {
  const ax = Math.abs(vx), ay = Math.abs(vy);
  const h = prev === 'h' ? ax * 1.2 >= ay : ax > ay * 1.2;
  return h ? { ax: 'h', d: vx >= 0 ? 1 : -1 } : { ax: 'v', d: vy >= 0 ? 1 : -1 };
}
