/**
 * key → SVG 문자열. 그룹별 그림 함수로 나눠 보낸다. 없는 key 는 기본 그림 + console.warn 1회.
 */
import { C, E, P, R, face, hashId, wrapSvg } from './kit';
import { SIZES, TARGETS } from './registry';
import { targetBody } from './draw/targets';
import { charBody } from './draw/characters';
import { itemBody } from './draw/items';
import { iconBody } from './draw/icons';
import { decorBody } from './draw/decor';
import { ambientBody } from './draw/ambient';
import { fxBody } from './draw/fx';
import { nodeBody } from './draw/nodes';
import { bgBody } from './draw/bg';
import { mapBody } from './draw/maps';

export interface Body {
  vb: [number, number, number, number];
  body: string;
}

const warned = new Set<string>();
export function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[art] ${msg}: ${key}`);
}

function split(key: string): [string, string] {
  const i = key.indexOf('@');
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)];
}

function dispatch(key: string, w: number, h: number): Body | null {
  const [id, st] = split(key);
  const pre = hashId(key);
  if (id.startsWith('t.')) {
    const info = TARGETS[id.slice(2)];
    if (!info) return null;
    const b = targetBody(id, st, Math.max(w, h), pre, info);
    return b === null ? null : { vb: [0, 0, 240, 240], body: b };
  }
  if (id.startsWith('c.')) return charBody(id.slice(2), st, pre);
  if (id.startsWith('i.')) return itemBody(id.slice(2), pre);
  if (id.startsWith('ic.')) return iconBody(id.slice(3), pre);
  if (id.startsWith('m.')) return mapBody(id, st, pre);
  if (id.startsWith('d.')) return decorBody(id, pre, w, h);
  if (id.startsWith('a.')) return ambientBody(id, st, pre, w, h);
  if (id.startsWith('o.')) return ambientBody(id, st, pre, w, h);
  if (id.startsWith('fx.')) return fxBody(id.slice(3), pre, w, h);
  if (id.startsWith('n.')) return nodeBody(id, pre, w, h);
  if (id.startsWith('bg.') || id.startsWith('ui.')) return bgBody(key, pre, w, h);
  return null;
}

/** 기본 그림 (빠진 id): 연분홍 둥근 네모 + 콩눈 */
function fallback(w: number, h: number): Body {
  const s = Math.min(w, h);
  return {
    vb: [0, 0, 100, 100 * (h / w)],
    body:
      R(6, 6, 88, 100 * (h / w) - 12, 16, { fill: '#ffd6e0', stroke: '#c96a86', sw: 4 }) +
      (s >= 24 ? face(50, (100 * (h / w)) / 2 - 6, 2.4, 'idle') : '') +
      E(50, 100 * (h / w) - 20, 18, 4, { fill: '#c96a86', op: 0.25 }) +
      C(84, 16, 5, { fill: '#fff', op: 0.8 }) +
      P('M14 14', {}),
  };
}

const cache = new Map<string, Body>();

/** key 의 SVG 본문 (캐시) */
export function bodyOf(key: string): Body {
  let b = cache.get(key);
  if (b) return b;
  const sz = SIZES[key];
  const w = sz?.w ?? 64, h = sz?.h ?? 64;
  let got: Body | null = null;
  if (!sz) warnOnce(key, '계약에 없는 key');
  try {
    got = dispatch(key, w, h);
  } catch (e) {
    warnOnce(key, '그림 오류 ' + String(e));
  }
  if (!got) {
    if (sz) warnOnce(key, '그림 없음 — 기본 그림으로 대신함');
    got = fallback(w, h);
  }
  cache.set(key, got);
  return got;
}

/** 완성 SVG 문자열. pw·ph 를 주면 그 픽셀 크기로(래스터용) */
export function svgOfKey(key: string, pw?: number, ph?: number): string {
  const sz = SIZES[key];
  const b = bodyOf(key);
  return wrapSvg(pw ?? sz?.w ?? 64, ph ?? sz?.h ?? 64, b.vb, b.body);
}
