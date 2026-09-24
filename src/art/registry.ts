/**
 * 스프라이트 목록·크기 = gdd-data.json 의 artApi.sprites (정본, 359개)
 * 여기에 대상 21종의 눈 감은 프레임(t.<id>@blink, idle 깜빡임용)을 덧붙인다(EXTRA_KEYS). SPRITE_KEYS 는 계약 그대로.
 */
import gdd from '../data/gdd-data.json';

export type DistrictId = 'euljiro' | 'gangnam' | 'yeouido' | 'pangyo' | 'magok' | 'sejong';
export type Orient = 'land' | 'port';
export type SpriteGroup = 'target' | 'character' | 'item' | 'icon' | 'map' | 'decor' | 'ambient' | 'object' | 'fx' | 'node' | 'bg' | 'ui';

export interface SpriteSize {
  w: number;
  h: number;
  anchor: [number, number];
  group: SpriteGroup;
  desc: string;
  nineSlice?: [number, number, number, number];
  lazy?: boolean;
  tiling?: boolean;
  res?: 1 | 'view';
}

interface RawSprite {
  key: string;
  id: string;
  state?: string;
  w: number;
  h: number;
  anchor: [number, number];
  group: SpriteGroup;
  desc: string;
  lazy?: boolean;
  res?: 1 | 'view';
  nineSlice?: [number, number, number, number];
  tiling?: boolean;
}

export interface TargetData {
  id: string;
  side: 'corp' | 'store';
  name: string;
  c: string;
  acc: string;
  s: number;
  grade: number;
  big: boolean;
}
export interface CharData {
  id: string;
  name: string;
  fur: string;
}
export interface DistrictData {
  id: DistrictId;
  name: string;
  pal: { ground: string; block: string; road: string; line: string; park: string; accent: string; water?: string };
}

export interface MapData {
  district: DistrictId;
  orient: Orient;
  W: number;
  H: number;
  lot: number;
  U: number;
  road: number;
  area: { x: number; y: number; w: number; h: number };
  grid: { x: number; y: number; w: number; h: number };
  topLimit: number;
  blocks: { id: number; c: number; r: number; x: number; y: number; w: number; h: number; cx: number; cy: number; kind: 'lots' | 'plaza' | 'park' | 'dome' | 'lake'; lots: number[] }[];
  spawnSlots: { id: number; kind: 'lot' | 'big' | 'plaza'; x: number; y: number; block: number; lots?: [number, number, number, number]; w?: number; h?: number }[];
  roads: { id: string; ax: 'h' | 'v'; x: number; y: number; w: number; h: number }[];
  routes: { id: string; ax: 'h' | 'v'; pts: [{ x: number; y: number }, { x: number; y: number }] }[];
  crosswalks: { x: number; y: number; w: number; h: number; ax: 'h' | 'v' }[];
  bands: { kind: 'water' | 'road8'; x: number; y: number; w: number; h: number }[];
  decor: { svgId: string; x: number; y: number; s: number }[];
}

interface Gdd {
  artApi: { sprites: RawSprite[]; fxTopKeys: string[] };
  targets: TargetData[];
  characters: CharData[];
  districts: DistrictData[];
  maps: Record<DistrictId, Record<Orient, MapData>>;
}

export const GDD = gdd as unknown as Gdd;

const RAW = GDD.artApi.sprites;

/** 계약의 모든 key (359개, 순서 그대로) */
export const SPRITE_KEYS: readonly string[] = Object.freeze(RAW.map((s) => s.key));

/** key → 크기·앵커 */
export const SIZES: Record<string, SpriteSize> = {};
for (const s of RAW) {
  const o: SpriteSize = { w: s.w, h: s.h, anchor: [s.anchor[0], s.anchor[1]], group: s.group, desc: s.desc };
  if (s.nineSlice) o.nineSlice = [...s.nineSlice] as [number, number, number, number];
  if (s.lazy) o.lazy = true;
  if (s.tiling) o.tiling = true;
  if (s.res !== undefined) o.res = s.res;
  SIZES[s.key] = o;
}

/** 계약 밖 추가 그림: 대상 깜빡임 프레임 (loadAll 이 같이 굽는다) */
export const EXTRA_KEYS: readonly string[] = Object.freeze(
  GDD.targets.map((t) => {
    const k = `t.${t.id}@blink`;
    const base = SIZES[`t.${t.id}@idle`];
    SIZES[k] = { ...base, anchor: [base.anchor[0], base.anchor[1]], desc: base.desc.replace(/—.*?\./, '— 눈 감은 프레임(깜빡임).') };
    return k;
  }),
);

export const FX_TOP_KEYS: readonly string[] = GDD.artApi.fxTopKeys;

export const TARGETS: Record<string, TargetData> = {};
for (const t of GDD.targets) TARGETS[t.id] = t;

export const CHARS: Record<string, CharData> = {};
for (const c of GDD.characters) CHARS[c.id] = c;

export const DISTRICTS: Record<string, DistrictData> = {};
for (const d of GDD.districts) DISTRICTS[d.id] = d;
