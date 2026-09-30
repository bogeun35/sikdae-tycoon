/**
 * 설계 데이터(gdd-data.json) 타입과 접근. 수치·목록의 정본은 JSON 이고 여기서는 타입만 붙인다.
 */
import RAW from '../data/gdd-data.json';

export type Side = 'corp' | 'store';
export type Beh = 'group' | 'hop' | 'stay' | 'pop' | 'road' | 'tank' | 'boss';
export type DistrictId = 'euljiro' | 'gangnam' | 'yeouido' | 'pangyo' | 'magok' | 'sejong';
export type Orient = 'land' | 'port';
export type SkillId = 'call' | 'promo' | 'rush' | 'qr';
/** 효과 종류 11가지(설계서 6-1). 이름·색은 gdd-data.json effectKinds */
export type KindId = 'power' | 'radius' | 'both' | 'time' | 'spawn' | 'rev' | 'tech' | 'luck' | 'xp' | 'special' | 'unlock';
/** color(·color2) = 테두리, chip(·chip2) = 칩 바탕(없으면 color). fg = 칩 글자 */
export interface KindDef { name: string; color: string; color2?: string; fg: string; chip?: string; chip2?: string }

export interface TargetDef {
  id: string; tier: number; side: Side; name: string; beh: Beh; hp: number; value: number; xp: number; w: number; s: number;
  lots: number; lifeMult: number | null; spd: number; flee: boolean; dash: boolean; big: boolean; grade: number; masteryLv: number;
  sizeLabel: string; unlock: string; desc: string; look: string; c: string; acc: string;
}
/** kind·chips = 효과 종류(설계서 6장): 테두리 색은 kind, 칩은 최대 2개 [종류, 글자] */
export interface CharDef { id: string; name: string; animal: string; eff: Record<string, number>; sk: string; tip: string; unlock: string; fur: string; acc: string; trade: boolean; kind: KindId; chips: [KindId, string][] }
export interface SkillSlot { p: string; n: string; ic: string; ds: string; max: number; need?: number; nl?: number; kind: KindId; chip: string }
export interface SkillDef { name: string; icon: string; orig: string; cd: number; d: string; unlockName: string; sk: SkillSlot[]; unlock: string }
/** grade = 등급 1~20(설계서 4-2): 해금한 대상 수 ≥ max(4, grade) 부터 떨어짐, 강화 첫 값도 등급 순 */
export interface ItemDef { district: DistrictId; id: string; name: string; k: string; v: number; u: string; look: string; grade: number; kind: KindId; chip: string }
export interface DistrictDef { id: DistrictId; name: string; unlock: string; mod: Record<string, number>; note: string; look: string; pal: Record<string, string>; deco: string[]; weight: Record<string, number> }
export interface TreeNode {
  x: number; y: number; id: string; name: string; ef: string; tg: string | number | string[] | null; max: number; icon: string; link: string[];
  d: number; br: 'sales' | 'tech' | 'common'; f: string; key: boolean; vals: number[]; costs: number[]; lab: string;
  /** 잠김(설계서 4-1): req = 전부 보유해야, reqAny = 하나 이상 보유해야 강화 가능 */
  help?: string;
  req?: string[]; reqAny?: string[];
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface MapPt { x: number; y: number }
/** 블록. 생성 지도(src/game/map/gen.ts)는 poly(실제 경계 다각형)·grp(막다른 골목으로 합쳐진 블록 묶음)·gaps(부지 사이 골목 선)를 더 씀 */
export interface MapBlock {
  id: number; c: number; r: number; x: number; y: number; w: number; h: number; cx: number; cy: number; kind: 'lots' | 'plaza' | 'park' | 'dome' | 'lake'; lots: number[];
  poly?: MapPt[]; grp?: number; gaps?: MapPt[][];
}
/** a = 부지 판 기울기(라디안, 생성 지도) */
export interface MapSlot { id: number; kind: 'lot' | 'big' | 'plaza'; x: number; y: number; block: number; lots?: number[]; w?: number; h?: number; a?: number }
export interface MapRoad { id: string; ax: 'h' | 'v'; x: number; y: number; w: number; h: number }
/** 도로형 대상 경로(여러 점 꺾은선). cum = 누적 길이(생성 지도) */
export interface MapRoute { id: string; ax: 'h' | 'v'; pts: MapPt[]; cum?: number[] }
/** 생성 지도의 도로 한 가닥(가운데 선). w = 보도 포함 폭, stub = 막다른 골목, nx = 이 도로 위 교차점(건너는 도로 폭) */
export interface MapStreet { id: string; ax: 'h' | 'v'; w: number; main: boolean; stub: boolean; pts: MapPt[]; nx?: { x: number; y: number; w: number }[] }
/** 횡단보도: 중심, 도로 방향 각(라디안), 도로 폭, 깊이 */
export interface MapXing { x: number; y: number; a: number; w: number; d: number }
export interface MapData {
  district: DistrictId; orient: Orient; W: number; H: number; lot: number; U: number; road: number; area: Rect; grid: Rect; topLimit: number;
  blocks: MapBlock[]; spawnSlots: MapSlot[]; roads: MapRoad[]; routes: MapRoute[]; crosswalks: (Rect & { ax: 'h' | 'v' })[];
  bands: (Rect & { kind: 'water' | 'road8' })[]; decor: { svgId: string; x: number; y: number; s: number }[];
  /** 생성 지도(설계서 5장): 도로·횡단보도·씨앗·영업일·정형도 */
  streets?: MapStreet[]; xings?: MapXing[]; seed?: number; day?: number; org?: number; mode?: 'grid' | 'org'; tries?: number;
}
export interface ContractFx {
  grade: number; stampScale: number; banner: string | null; hitstopMs: number; shake: number; flash: number; tickets: number; coins: number;
  rings: number[]; glow: boolean; confetti: number; fireworks: number; zoom: number; slowmo: { rate: number; sec: number } | null;
  duck: { to: number; sec: number } | null; sfx: string;
}
export interface SpriteInfo { key: string; id: string; state?: string; w: number; h: number; anchor: [number, number]; group: string; desc: string; nineSlice?: number[]; lazy?: boolean; tiling?: boolean; res?: 1 | 'view' }

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Formulas {
  ECON: { COMMISSION_RATE: number; SERVICE_FEE_RATE: number; LUNCH_PRICE: number; COST_SCALE: number; VALUE_SCALE: number; REQUIRE_BOTH_SIDES: boolean };
  MATCH: { BASE_BONUS: number; RAMP_PAIRS: number; BOSS_WEIGHT: number; FIRST_BIAS?: number };
  RUN: Record<string, any>;
  GEOM: any;
  DIST: Record<string, any>;
  XP: { base: number; growth: number; powerPerLv: number };
  /** 기본 역량: unlock 칸 보유 뒤 열림, 비용 = unlock 칸 첫 값 × costK × growth^레벨 (매출) */
  BASIC: { power: { unlock: string; costK: number; growth: number; mult: number }; radius: { unlock: string; costK: number; growth: number; mult: number; max: number } };
  /** 영업 스킬(기술력): 칸 첫 값 = 해금 칸 첫 값 × slotK[칸], 레벨당 × growth */
  SKILL_COST: { slotK: number[]; growth: number };
  /** 기술력 버는 곳(설계서 2-1) */
  TECH: { store: number; corp: number; chestK: number; chestMin: number; inqK: number; inqMin: number; dupK: number; dupMin: number; per10K: number };
  SKILL_DMG: any; SKILL_LEVEL: { dmgStep: number; cdStep: number; bonusStep: number };
  PASSIVE: any; MASTERY: { perStage: number; max: number; costK: number; growth: number };
  /** 아이템 강화(기술력): 등급 1~4 = baseNode 첫 값 × baseK, 5~20 = tgtNodes 첫 값 오름차순 × tgtK, 앞 등급 × step 이상. 레벨당 × growth */
  ITEM: { growth: number; max: number; floatUp: number; life: number; pick: number; baseK: number[]; tgtK: number; step: number; baseNode: string; tgtNodes: string[]; gradeMin: number; first?: number[] };
  CHEST: any; INQUIRY: any; DEX_STARS: number[]; SPEEDS: number[]; SAVE_KEY: string; SAVE_EVERY: number; SAVE: { ver: number; treeVer: number; old?: string[] };
  FIRST_SKILL: number[]; TREE: any; STATS: any;
}
interface GddData {
  meta: { title: string; version: string; built: string; nodes: number };
  formulas: Formulas;
  targets: TargetDef[]; characters: CharDef[]; skills: Record<SkillId, SkillDef>; skillOrder: SkillId[]; items: ItemDef[]; itemAllKeys: string[];
  districts: DistrictDef[]; tree: TreeNode[]; maps: Record<DistrictId, Record<Orient, MapData>>;
  effects: Record<string, { f: string; lab: string; br: string; kind: KindId; chip: string }>;
  effectKinds: { order: KindId[]; kinds: Record<KindId, KindDef>; keys: Record<string, [KindId, string]> };
  fx: Record<string, any> & { contract: ContractFx[] };
  audio: any; artApi: any; audioApi: any; icons: Record<string, string>; iconNames: string[];
}
const D = RAW as unknown as GddData;

export const DATA = D;
export const F = D.formulas;
export const TARGETS: TargetDef[] = D.targets;
export const TARGET_BY: Record<string, TargetDef> = Object.fromEntries(TARGETS.map((t) => [t.id, t]));
export const CHARS: CharDef[] = D.characters;
export const CHAR_BY: Record<string, CharDef> = Object.fromEntries(CHARS.map((c) => [c.id, c]));
export const SKILLS = D.skills;
export const SKILL_ORDER: SkillId[] = D.skillOrder;
export const ITEMS: ItemDef[] = D.items;
export const ITEM_BY: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const ITEM_ALL_KEYS: string[] = D.itemAllKeys;
export const DISTRICTS: DistrictDef[] = D.districts;
export const DISTRICT_BY: Record<string, DistrictDef> = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
export const TREE: TreeNode[] = D.tree;
export const TREE_BY: Record<string, TreeNode> = Object.fromEntries(TREE.map((n) => [n.id, n]));
export const TREE_CENTER = 'start';
export const EFFECTS = D.effects;
export const EFFECT_KINDS = D.effectKinds;
/** 효과 키(트리 ef·아이템 k·대표 eff·기본 역량) → [종류, 칩 글자]. 모르는 키는 특수 */
export function kindOfKey(key: string): [KindId, string] {
  return D.effectKinds.keys[key] || ['special', '특수'];
}
export const FX = D.fx;
export const CONTRACT_FX: ContractFx[] = D.fx.contract;
export const SPRITES: SpriteInfo[] = D.artApi.sprites;
export const MAPS = D.maps;
export const VERSION: string = D.meta.version;
/** 화면에 보이는 버전(개발용 꼬리 '-gdd' 뺌) */
export const VERSION_LABEL: string = VERSION.replace(/-.*$/, '');

/** 어느 칸이 대상·상권·대표·스킬을 여는지 */
export const UNLOCK_NODE: Record<string, TreeNode> = {};
for (const n of TREE) {
  if (n.ef === 'tgt' || n.ef === 'district' || n.ef === 'cap' || n.ef === 'sk') UNLOCK_NODE[String(n.tg)] = n;
}
export function unlockNodeName(key: string): string {
  const n = UNLOCK_NODE[key] || TREE_BY[key];
  return n ? n.name : '';
}
