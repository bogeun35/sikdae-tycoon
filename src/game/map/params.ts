/**
 * 지도 생성 수치 (설계서 5장). 상권 특색·정형도·방향별 틀.
 * 경제 수치(gdd-data.json)와 따로 둔다 — 지도만 바꿀 때 경제 파일을 건드리지 않게.
 */
import type { DistrictId, Orient } from '../data';

export interface OrientGeo {
  W: number; H: number; lot: number; U: number; road: number;
  area: { x: number; y: number; w: number; h: number };
  /** 격자 기본 블록 수·블록당 부지 수 (지금 지도와 같은 틀) */
  cols: number; rows: number; bw: number; bh: number;
}
export const GEO: Record<Orient, OrientGeo> = {
  land: { W: 1920, H: 1080, lot: 129, U: 1.42, road: 71, area: { x: 30, y: 132, w: 1860, h: 916 }, cols: 4, rows: 3, bw: 3, bh: 2 },
  port: { W: 1080, H: 1920, lot: 106, U: 1.167, road: 58.3, area: { x: 24, y: 300, w: 1032, h: 1450 }, cols: 3, rows: 4, bw: 2, bh: 3 },
};

/** 도로형 대상 경로 끝 = 화면(가로)·area 위(세로) 밖 60U (DIST.laneOver) */
export const LANE_OVER = 60;
/** 0장 5번: 부지 3곳을 담는 가장 작은 원 ≥ 판정 거리₀ + 2px. 판정 거리₀ = R₀(42 × U) + 초반 대상 최대 폭(0.72 lot) × 0.3 */
export const R0_BASE = 42;
export const tripleMin = (g: OrientGeo): number => R0_BASE * g.U + 0.72 * g.lot * 0.3 + 2;

export interface DistrictGen {
  /** 정형도 (0 = 격자, 1 = 구불구불) */
  org: number;
  /** 골목 폭 배율 (없으면 1 − 0.4 × org) */
  alley?: number;
  /** 큰길 하나를 곧게(강남 대로) */
  straightMain?: boolean;
  /** 공원 종류 */
  park: 'park' | 'dome' | 'lake';
  /** 공원 수 [최소, 최대] */
  parks: [number, number];
  /** 화면 위 가장자리 띠 */
  bands?: Record<Orient, { kind: 'water' | 'road8'; x: number; y: number; w: number; h: number }>;
}
export const DGEN: Record<DistrictId, DistrictGen> = {
  euljiro: { org: 0.85, alley: 0.6, park: 'park', parks: [1, 1] },
  gangnam: {
    org: 0.55, straightMain: true, park: 'park', parks: [1, 1],
    bands: { land: { kind: 'road8', x: 0, y: 15.9, w: 1920, h: 96.8 }, port: { kind: 'road8', x: 0, y: 204.6, w: 1080, h: 79.5 } },
  },
  yeouido: {
    org: 0.35, park: 'park', parks: [1, 1],
    bands: { land: { kind: 'water', x: 0, y: 0, w: 1920, h: 118 }, port: { kind: 'water', x: 0, y: 0, w: 1080, h: 286 } },
  },
  pangyo: { org: 0.25, park: 'park', parks: [1, 1] },
  magok: { org: 0.15, park: 'dome', parks: [1, 1] },
  sejong: { org: 0.05, park: 'lake', parks: [1, 1] },
};

/** 누적 영업일에 따른 정형도 상한: 0.9 − 0.85 × min(1, 영업일 ÷ 120) */
export const progOrg = (day: number): number => 0.9 - 0.85 * Math.min(1, Math.max(0, day) / 120);
/** 이 아래는 곧은 격자(부지 3×2 정렬) */
export const GRID_BELOW = 0.25;

/** 부지 수 범위 */
export const LOTS_GRID: [number, number] = [50, 66];
export const LOTS_ORG: [number, number] = [42, 66];
export const BIGS: [number, number] = [12, 20];
export const ROUTES: [number, number] = [4, 6];
