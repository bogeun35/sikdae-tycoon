/**
 * 설계 데이터(gdd-data.json) 타입과 접근. 수치·목록의 정본은 JSON 이고 여기서는 타입만 붙인다.
 */
import RAW from '../data/gdd-data.json';

export type Side = 'corp' | 'store';
export type Beh = 'group' | 'hop' | 'stay' | 'pop' | 'road' | 'tank' | 'boss';
export type DistrictId = 'euljiro' | 'gangnam' | 'yeouido' | 'pangyo' | 'magok' | 'sejong';
export type Orient = 'land' | 'port';
export type SkillId = 'call' | 'promo' | 'rush' | 'qr';

export interface TargetDef {
  id: string; tier: number; side: Side; name: string; beh: Beh; hp: number; value: number; xp: number; w: number; s: number;
  lots: number; lifeMult: number | null; spd: number; flee: boolean; dash: boolean; big: boolean; grade: number; masteryLv: number;
  sizeLabel: string; unlock: string; desc: string; look: string; c: string; acc: string;
}
export interface CharDef { id: string; name: string; animal: string; eff: Record<string, number>; sk: string; tip: string; unlock: string; fur: string; acc: string; trade: boolean }
export interface SkillSlot { p: string; n: string; ic: string; ds: string; max: number; need?: number; nl?: number }
export interface SkillDef { name: string; icon: string; orig: string; cd: number; d: string; unlockName: string; sk: SkillSlot[]; unlock: string }
export interface ItemDef { id: string; name: string; k: string; v: number; u: string; look: string }
export interface DistrictDef { id: DistrictId; name: string; unlock: string; mod: Record<string, number>; note: string; look: string; pal: Record<string, string>; deco: string[]; weight: Record<string, number> }
export interface TreeNode {
  x: number; y: number; id: string; name: string; ef: string; tg: string | number | string[] | null; max: number; icon: string; link: string[];
  d: number; br: 'sales' | 'tech' | 'common'; f: string; key: boolean; vals: number[]; costs: number[]; lab: string;
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface MapBlock { id: number; c: number; r: number; x: number; y: number; w: number; h: number; cx: number; cy: number; kind: 'lots' | 'plaza' | 'park' | 'dome' | 'lake'; lots: number[] }
export interface MapSlot { id: number; kind: 'lot' | 'big' | 'plaza'; x: number; y: number; block: number; lots?: number[]; w?: number; h?: number }
export interface MapRoad { id: string; ax: 'h' | 'v'; x: number; y: number; w: number; h: number }
export interface MapRoute { id: string; ax: 'h' | 'v'; pts: { x: number; y: number }[] }
export interface MapData {
  district: DistrictId; orient: Orient; W: number; H: number; lot: number; U: number; road: number; area: Rect; grid: Rect; topLimit: number;
  blocks: MapBlock[]; spawnSlots: MapSlot[]; roads: MapRoad[]; routes: MapRoute[]; crosswalks: (Rect & { ax: 'h' | 'v' })[];
  bands: (Rect & { kind: 'water' | 'road8' })[]; decor: { svgId: string; x: number; y: number; s: number }[];
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
  MATCH: { BASE_BONUS: number; RAMP_PAIRS: number; BOSS_WEIGHT: number };
  RUN: Record<string, any>;
  GEOM: any;
  DIST: Record<string, any>;
  XP: { base: number; growth: number; powerPerLv: number };
  BASIC: { power: { base: number; growth: number; mult: number }; radius: { base: number; growth: number; mult: number; max: number } };
  SKILL_COST: { gold: number; growth: number; slotStep: number; abilityGrowth: number; specialGold: number; point: number[]; specialPoint: number };
  SKILL_DMG: any; SKILL_LEVEL: { dmgStep: number; cdStep: number; bonusStep: number };
  PASSIVE: any; MASTERY: { perStage: number; max: number; costK: number; growth: number; point: number[] };
  ITEM: { gold: number; growth: number; point: number[]; max: number; dupPoint: number; floatUp: number; life: number; pick: number };
  CHEST: any; INQUIRY: any; DEX_STARS: number[]; SPEEDS: number[]; SAVE_KEY: string; SAVE_EVERY: number; SAVE: { ver: number; treeVer: number };
  FIRST_SKILL: number[]; TREE: any; STATS: any;
}
interface GddData {
  meta: { title: string; version: string; built: string; nodes: number };
  formulas: Formulas;
  targets: TargetDef[]; characters: CharDef[]; skills: Record<SkillId, SkillDef>; skillOrder: SkillId[]; items: ItemDef[]; itemAllKeys: string[];
  districts: DistrictDef[]; tree: TreeNode[]; maps: Record<DistrictId, Record<Orient, MapData>>;
  effects: Record<string, { f: string; lab: string; br: string }>;
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
export const FX = D.fx;
export const CONTRACT_FX: ContractFx[] = D.fx.contract;
export const SPRITES: SpriteInfo[] = D.artApi.sprites;
export const MAPS = D.maps;
export const VERSION: string = D.meta.version;

/** 어느 칸이 대상·상권·대표·스킬을 여는지 */
export const UNLOCK_NODE: Record<string, TreeNode> = {};
for (const n of TREE) {
  if (n.ef === 'tgt' || n.ef === 'district' || n.ef === 'cap' || n.ef === 'sk') UNLOCK_NODE[String(n.tg)] = n;
}
export function unlockNodeName(key: string): string {
  const n = UNLOCK_NODE[key] || TREE_BY[key];
  return n ? n.name : '';
}
