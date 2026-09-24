/**
 * 그림(src/art)·소리(src/audio) 모듈 계약 — 설계서 8장·9장. 본체는 이 모양으로만 부른다.
 */
import type { Renderer, Texture } from 'pixi.js';
import type { DistrictId, MapData, Orient } from './data';

export type SpriteGroup = 'target' | 'character' | 'item' | 'icon' | 'map' | 'decor' | 'ambient' | 'object' | 'fx' | 'node' | 'bg' | 'ui';
export interface SpriteSize {
  w: number; h: number; anchor: [number, number]; group: SpriteGroup | string; desc: string;
  nineSlice?: [number, number, number, number] | number[]; lazy?: boolean; tiling?: boolean; res?: 1 | 'view';
}
export interface MapLayers extends MapData {
  ground: string; // 'm.<id>.ground@<orient>'
  roadsLayer: string; // 'm.<id>.roads@<orient>'
}

export interface ArtModule {
  SPRITE_KEYS: readonly string[];
  SIZES: Record<string, SpriteSize>;
  svg(id: string, state?: string): string;
  loadAll(renderer: Renderer, onProgress?: (done: number, total: number) => void, opts?: { resolution?: number; skipLazy?: boolean }): Promise<Record<string, Texture>>;
  loadMap(renderer: Renderer, districtId: DistrictId, orient: Orient): Promise<{ ground: Texture; roads: Texture }>;
  mapLayers(districtId: DistrictId, orient?: Orient): MapLayers;
  tex(key: string): Texture;
}

export type SfxName =
  | 'ui_click' | 'ui_tap' | 'ui_open' | 'ui_close' | 'ui_error' | 'ui_toggle'
  | 'ui_fullscreen' | 'title_logo' | 'title_start' | 'node_buy' | 'node_buy_key' | 'skill_up'
  | 'mastery_up' | 'item_up' | 'rep_hire' | 'rep_select' | 'district_open' | 'district_select'
  | 'level_up' | 'lunch_start' | 'lunch_tick' | 'lunch_end' | 'target_appear' | 'target_appear_big'
  | 'boss_appear' | 'target_leave' | 'persuade' | 'hop' | 'flee_honk' | 'bike_dash'
  | 'contract_s' | 'contract_m' | 'contract_l' | 'contract_xl' | 'contract_boss' | 'crit'
  | 'stamp' | 'coin_arrive' | 'match_up' | 'pending_release' | 'skill_call' | 'skill_promo_set'
  | 'skill_promo_boom' | 'skill_rush' | 'skill_qr' | 'wom' | 'hot' | 'ref'
  | 'gift_spawn' | 'gift_open' | 'inquiry_spawn' | 'inquiry_pick' | 'item_drop' | 'item_get'
  | 'point_get' | 'speed_change' | 'target_new' | 'wipe' | 'toast' | 'settle_open'
  | 'settle_count' | 'settle_total' | 'ending';
export type Track = 'title' | 'office' | 'lunch' | 'boss' | 'ending';
export type VolumeKind = 'master' | 'music' | 'sfx';

export interface AudioModule {
  init(): Promise<void>;
  sfx(name: SfxName, opts?: { pitch?: number; vol?: number; pan?: number; tier?: number; delay?: number }): void;
  music(track: Track | null, opts?: { fade?: number }): void;
  setVolume(kind: VolumeKind, v: number): void;
  getVolume(kind: VolumeKind): number;
  setHurry(on: boolean): void;
  duck(to: number, sec: number): void;
}
