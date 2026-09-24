/**
 * 그림·소리 모듈 연결 (어댑터). 본체는 여기의 art · audio · sfx · music 만 쓴다.
 *   그림 = src/art/index.ts, 소리 = src/audio/index.ts (실제 모듈 직결, 스텁 없음)
 *   계약(contracts.ts)과 두 모듈의 모양·이름이 어긋나면 아래 타입 검사에서 tsc 가 멈춘다.
 *   이름 전수 대조는 scripts/audit-keys.mjs (npm run audit).
 */
import type { Texture } from 'pixi.js';
import * as artMod from '../art';
import * as audioMod from '../audio';
import type { ArtModule, AudioModule, SfxName, Track } from './contracts';

/* ── 계약 검사 (컴파일 시) ── */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
/** 본체 계약의 효과음 이름 = 소리 모듈의 효과음 이름 (한쪽에만 있으면 tsc 오류) */
export type CheckSfxNames = Assert<Same<SfxName, audioMod.SfxName>>;
/** 배경음 트랙 이름도 같아야 함 */
export type CheckTracks = Assert<Same<Track, audioMod.Track>>;

/* ── 그림 ── */
/** 계약에 없는 key 를 부른 기록 (검수용, __game.artMissing) */
export const artMissing: string[] = [];
const known = (key: string) => key in artMod.SIZES;
function note(key: string): void {
  if (!known(key) && !artMissing.includes(key) && artMissing.length < 200) artMissing.push(key);
}
export const art: ArtModule = {
  SPRITE_KEYS: artMod.SPRITE_KEYS,
  SIZES: artMod.SIZES,
  svg(id: string, state?: string): string {
    note(state ? `${id}@${state}` : id);
    return artMod.svg(id, state);
  },
  loadAll: (renderer, onProgress, opts) => artMod.loadAll(renderer, onProgress, opts),
  loadMap: (renderer, districtId, orient) => artMod.loadMap(renderer, districtId, orient),
  mapLayers: (districtId, orient) => artMod.mapLayers(districtId, orient),
  tex(key: string): Texture {
    note(key);
    return artMod.tex(key);
  },
};

/* ── 소리 ── */
export const audio: AudioModule = audioMod;
/** 검수용 소리 상태 (__game.audio) */
export const audioDebug = audioMod.audioDebug;

/** 소리는 첫 입력 전에는 조용히 무시 (소리 모듈도 첫 입력 전에는 AudioContext 를 만들지 않는다) */
let audioReady = false;
export async function startAudio(): Promise<void> {
  if (audioReady) return;
  audioReady = true;
  try {
    await audio.init();
  } catch (e) {
    console.warn('[audio] init 실패', e);
  }
}
type SfxOpts = Parameters<AudioModule['sfx']>[1];
export function sfx(name: SfxName, opts?: SfxOpts): void {
  try {
    audio.sfx(name, opts);
  } catch {
    /* 소리 실패는 게임을 멈추지 않음 */
  }
}
export function music(track: Track | null, opts?: { fade?: number }): void {
  try {
    audio.music(track, opts);
  } catch {
    /* 무시 */
  }
}
