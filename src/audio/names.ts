/**
 * 소리 이름·기본값 — 설계서 7장·9장(`audio`, `audioApi`)과 같은 값.
 * 정본은 src/data/gdd-data.json 의 audioApi.sfxNames / audioApi.tracks. 개발 페이지(audio-test.html)가 둘을 대조한다.
 */

export const sfxNames = [
  'ui_click', 'ui_tap', 'ui_open', 'ui_close', 'ui_error', 'ui_toggle',
  'ui_fullscreen', 'title_logo', 'title_start', 'node_buy', 'node_buy_key', 'skill_up',
  'mastery_up', 'item_up', 'rep_hire', 'rep_select', 'district_open', 'district_select',
  'level_up', 'lunch_start', 'lunch_tick', 'lunch_end', 'target_appear', 'target_appear_big',
  'boss_appear', 'target_leave', 'persuade', 'hop', 'flee_honk', 'bike_dash',
  'contract_s', 'contract_m', 'contract_l', 'contract_xl', 'contract_boss', 'crit',
  'stamp', 'coin_arrive', 'match_up', 'pending_release', 'skill_call', 'skill_promo_set',
  'skill_promo_boom', 'skill_rush', 'skill_qr', 'wom', 'hot', 'ref',
  'gift_spawn', 'gift_open', 'inquiry_spawn', 'inquiry_pick', 'item_drop', 'item_get',
  'point_get', 'speed_change', 'target_new', 'wipe', 'toast', 'settle_open',
  'settle_count', 'settle_total', 'ending',
] as const;

export type SfxName = (typeof sfxNames)[number];

export const tracks = ['title', 'office', 'lunch', 'boss', 'ending'] as const;
export type Track = (typeof tracks)[number];

export type VolumeKind = 'master' | 'music' | 'sfx';

/** 기본 음량 (0..1) */
export const DEFAULT_VOLUME: Record<VolumeKind, number> = { master: 0.85, music: 0.6, sfx: 0.8 };

/** 배경음 버스 게인 = 0.18 × 음악 음량 (기본 0.6 → 0.108, 효과음보다 약 14dB 작게) */
export const BGM_GAIN = 0.18;

/** 동시에 울리는 효과음 수 한도 */
export const MAX_VOICES = 14;

/** localStorage 키 (storage.ts 가 `sikdae-tycoon:` 접두어를 붙인다) */
export const STORAGE_KEY = 'sikdae_tycoon_vol';

/** 동시 발음 한도를 무시하는 소리 */
export const IMPORTANT: ReadonlySet<SfxName> = new Set<SfxName>([
  'contract_xl', 'contract_boss', 'boss_appear', 'district_open', 'level_up',
  'settle_open', 'ending', 'lunch_end', 'pending_release', 'target_new',
]);

/** 간격 제한(초) — 같은 이름이 이보다 빨리 오면 버린다 */
export const THROTTLE: Partial<Record<SfxName, number>> = {
  persuade: 0.12, coin_arrive: 0.05, contract_s: 0.07, contract_m: 0.08, contract_l: 0.12,
  contract_xl: 0.25, stamp: 0.07, crit: 0.15, target_appear: 0.05, target_appear_big: 0.2,
  target_leave: 0.1, hop: 0.15, flee_honk: 0.4, bike_dash: 0.3, point_get: 0.08,
  item_drop: 0.3, settle_count: 0.03, wom: 0.2, hot: 0.3, match_up: 0.3,
};

/**
 * 같은 이름이 동시에 몇 개까지 울릴 수 있는지 (설계서에 없는 보강).
 * 연타되는 작은 소리가 14칸을 다 차지해 큰 소리가 밀리지 않게 한다.
 */
export const MAX_PER_NAME: Partial<Record<SfxName, number>> = {
  persuade: 2, coin_arrive: 3, settle_count: 2, target_appear: 3, target_leave: 2,
  contract_s: 4, contract_m: 3, contract_l: 3, stamp: 2, point_get: 2, hop: 2, crit: 2,
};
