/**
 * 같은 글자·모양 Pixi Text 돌려 쓰기(설계서 7장 6). Text 는 글자를 캔버스에 그려 텍스처로 올리므로(배너 한 장 ≈ 글자 2~3개)
 * 계약·배너마다 새로 만들면 긴 프레임이 된다. 여기서 받은 Text 는 쓰고 나서 부모에서 떼어 두면 다음에 그대로 다시 쓴다.
 * 부모를 destroy({ children: true }) 하기 전에 detachCached(부모) 로 떼어 낼 것(아니면 캐시 글자까지 부서짐 — 부서진 것은 다시 만듦).
 * 키가 많아지면 오래 안 쓴 것부터 버림(떠 있는 것은 남김).
 *
 * 글자 텍스처가 다시 그려지지 않게(폰 4배 느림에서 글자 한 장 = 캔버스 그리기 + 업로드 10~40ms):
 *  - 모양(TextStyle)은 styleId 마다 한 벌만 만들어 나눠 씀. Pixi 는 모양 객체마다 키가 달라(uid) 같은 글자·같은 모양이라도
 *    Text 를 새로 만들면 텍스처를 또 그렸음(도장 두 개가 동시에 뜨면 두 번째 도장 글자를 새로 그림)
 *  - 해상도는 고정(자동이 아님): 화질이 바뀌어 렌더 해상도가 바뀌어도 캐시 글자를 전부 다시 그리지 않게.
 *    글자는 세계 배율(폰 세로 약 0.36)로 줄여 그리므로 렌더 해상도 그대로 그리면 필요한 것보다 몇 배 큰 텍스처였음 → 화면에 보이는 크기의 1.6배까지만
 *  - 캐시 글자는 Pixi GC 가 내리지 않게(autoGarbageCollect = false): 떼어 둔 글자는 GC 가 "안 쓰임"으로 보고 60초 뒤 텍스처를 버려 다음에 다시 그렸음
 */
import { Text, TextStyle, type Container, type TextStyleOptions } from 'pixi.js';
import { view } from './stage';

const pool = new Map<string, Text[]>();
const cached = new WeakSet<Text>();
/** 도장·말풍선(대상 21)·새 거래처 알약(21)·배너·아이템 컷 글자가 영업일 사이에 남도록 */
const MAX_KEYS = 160;
/** styleId 마다 모양 한 벌 */
const styles = new Map<string, TextStyle>();

function styleOf(styleId: string, style: TextStyleOptions): TextStyle {
  let s = styles.get(styleId);
  if (!s) {
    s = new TextStyle(style);
    styles.set(styleId, s);
  }
  return s;
}

/** 캐시 글자 해상도: 화면에 보이는 크기(세계 배율 × 렌더 해상도)의 1.6배, 1 ~ 렌더 해상도. 0.25 단위(조금 바뀌어도 다시 그리지 않게) */
export function textRes(): number {
  const need = Math.ceil(view.k * view.res * 1.6 * 4) / 4;
  return Math.min(view.res, Math.max(1, need));
}

/**
 * styleId = 모양 이름(같은 style 이면 같은 이름), text = 글자.
 * keep = false: 다시 올 일이 없는 글자(금액이 든 부제 등) — 캐시에 넣지 않고 새로 만든다(부모와 같이 부서짐). 영업일마다 캐시·힙이 늘지 않게
 */
export function takeText(styleId: string, text: string, style: TextStyleOptions, keep = true): Text {
  const st = styleOf(styleId, style);
  const res = textRes();
  if (!keep) return new Text({ text, style: st, resolution: res });
  const key = styleId + '\u0001' + text;
  let arr = pool.get(key);
  if (arr) {
    /* 최근에 쓴 것을 뒤로(버릴 때 앞에서부터) */
    pool.delete(key);
    pool.set(key, arr);
  } else {
    arr = [];
    pool.set(key, arr);
    trim();
  }
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].destroyed) arr.splice(i, 1);
  let t = arr.find((q) => !q.parent);
  if (!t) {
    t = new Text({ text, style: st, resolution: res });
    t.autoGarbageCollect = false;
    cached.add(t);
    arr.push(t);
  } else if (t.resolution !== res) t.resolution = res;
  t.alpha = 1;
  t.visible = true;
  t.rotation = 0;
  t.scale.set(1);
  t.position.set(0, 0);
  t.anchor.set(0, 0);
  t.tint = 0xffffff;
  return t;
}

/** 부모(와 그 아래)에 붙은 캐시 글자를 떼어 냄 — destroy 전에 */
export function detachCached(c: Container | null | undefined): void {
  if (!c || c.destroyed) return;
  for (let i = c.children.length - 1; i >= 0; i--) {
    const ch = c.children[i] as Container;
    if (cached.has(ch as Text)) c.removeChild(ch);
    else if (ch.children && ch.children.length) detachCached(ch);
  }
}

/** 떼어 낸 글자 하나를 돌려줌(부모에서 뺌) */
export function releaseText(t: Text | null | undefined): void {
  if (t && !t.destroyed && t.parent) t.parent.removeChild(t);
}

function trim(): void {
  if (pool.size <= MAX_KEYS) return;
  for (const [k, arr] of pool) {
    if (pool.size <= MAX_KEYS) break;
    if (arr.some((t) => !!t.parent && !t.destroyed)) continue;
    for (const t of arr) if (!t.destroyed) t.destroy();
    pool.delete(k);
  }
}
