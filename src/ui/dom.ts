/**
 * DOM 도우미: 아이콘(SVG data URI), 버튼 손맛, 한 번 탭 = 설명 / 두 번 탭 = 구매, 토스트.
 */
import { art, sfx } from '../game/deps';

const uriCache: Record<string, string> = {};
/** 스프라이트 key(state 포함) → data URI. DOM 에 <img> 로 쓴다 */
export function iconUri(key: string): string {
  const hit = uriCache[key];
  if (hit) return hit;
  const at = key.indexOf('@');
  let s = '';
  try {
    s = at >= 0 ? art.svg(key.slice(0, at), key.slice(at + 1)) : art.svg(key);
  } catch (e) {
    console.warn('[ui] svg 실패', key, e);
    s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
  }
  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  uriCache[key] = uri;
  return uri;
}
/** src 속성 문자열. 따옴표를 런타임에 붙여 번들 안에 `src="…"` 꼴의 템플릿이 남지 않게 한다(release 의 외부 참조 검사가 오탐하지 않게) */
const Q = String.fromCharCode(34);
export const srcAttr = (uri: string) => 'src=' + Q + uri.replace(/"/g, '%22') + Q;
export const img = (key: string, cls = 'ic', extra = '') => `<img class="${cls}" ${srcAttr(iconUri(key))} alt="" draggable="false" ${extra}>`;

/**
 * 아이콘 미리 불러 두기: 보이지 않는 칸에 <img> 를 하나씩(0.06초 간격) 붙여 둔다. 브라우저는 같은 주소의 그림을 한 번만 해석해 두고 같이 쓰므로
 * 나중에 모달이 한꺼번에 아이콘 여러 개를 띄울 때 아이콘마다 SVG 문서를 새로 만드는 일이 한 작업에 몰리지 않음(설계서 7장)
 */
let iconHold: HTMLDivElement | null = null;
const warmed = new Set<string>();
export function warmIcons(keys: string[]): void {
  const todo = keys.filter((k) => !warmed.has(k));
  if (!todo.length) return;
  for (const k of todo) warmed.add(k);
  if (!iconHold) {
    iconHold = document.createElement('div');
    iconHold.setAttribute('aria-hidden', 'true');
    iconHold.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(iconHold);
  }
  const hold = iconHold;
  let i = 0;
  const step = (): void => {
    if (i >= todo.length) return;
    const key = todo[i++];
    const im = new Image();
    im.alt = '';
    im.src = iconUri(key);
    hold.appendChild(im);
    /* 비트맵으로도 한 장 구워 둠(iconFast): SVG 아이콘은 처음 그릴 때마다 SVG 를 다시 그려(아이콘 하나 폰 4배 느림 4~12ms) 모달이 뜨는 프레임에 몰렸음 */
    im.decode()
      .then(() => {
        const w0 = im.naturalWidth || 1;
        const h0 = im.naturalHeight || 1;
        const k = ICON_PX / Math.max(w0, h0);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w0 * k));
        cv.height = Math.max(1, Math.round(h0 * k));
        const g = cv.getContext('2d');
        if (!g) return;
        g.drawImage(im, 0, 0, cv.width, cv.height);
        pngCache[key] = cv.toDataURL('image/png');
      })
      .catch(() => undefined);
    setTimeout(step, 80);
  };
  setTimeout(step, 100);
}
/** 구운 아이콘 한 변(px). 모달 아이콘(최대 약 30 CSS px) × 폰 배율 3 */
const ICON_PX = 96;
const pngCache: Record<string, string> = {};
/** 미리 구운 비트맵 아이콘(없으면 SVG) — 한꺼번에 여러 개 뜨는 모달용 */
export function iconFast(key: string): string {
  return pngCache[key] || iconUri(key);
}
export const imgFast = (key: string, cls = 'ic', extra = '') => `<img class="${cls}" ${srcAttr(iconFast(key))} alt="" draggable="false" ${extra}>`;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T | null;
export const $$ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel)) as T[];

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/**
 * 알약 튀기(1.14배, 영업 HUD 는 1.05배 0.25초). Web Animations 로 — 클래스를 뗐다 붙이며 offsetWidth 를 읽으면
 * 매번 레이아웃을 강제해서(설계서 7장 3) 코인이 연달아 도착하면 프레임마다 리플로가 났다. 같은 요소는 120ms 에 한 번만.
 */
const bumpAt = new WeakMap<Element, number>();
export function bump(e: Element | null, scale?: number): void {
  if (!e) return;
  const now = performance.now();
  const last = bumpAt.get(e) || 0;
  if (now - last < 120) return;
  bumpAt.set(e, now);
  const s = scale ?? (e.closest('.lhud') ? 1.05 : 1.14);
  const el = e as HTMLElement;
  if (typeof el.animate !== 'function') return;
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${s})`, offset: 0.45 }, { transform: 'scale(1)' }], { duration: 250, easing: 'ease' });
}
/**
 * CSS 애니메이션 클래스를 처음부터 다시 걸기(레이아웃 강제 없이): 떼고 다음 프레임에 붙임.
 * 옛 방식(void offsetWidth)은 부를 때마다 동기 레이아웃을 일으킴.
 */
export function restartClass(e: Element | null, cls: string, drop: string[] = []): void {
  if (!e) return;
  e.classList.remove(cls, ...drop);
  requestAnimationFrame(() => e.classList.add(cls));
}
export function shakeEl(e: Element | null): void {
  if (!e) return;
  e.classList.remove('shake');
  void (e as HTMLElement).offsetWidth;
  e.classList.add('shake');
  setTimeout(() => e.classList.remove('shake'), 380);
}

/** 버튼 손맛(.tw): 누르면 아래로 3px + 0.97, 떼면 1.04 → 1. 클릭 소리 */
export function installButtonFeel(root: HTMLElement): void {
  let cur: HTMLElement | null = null;
  root.addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest('.tw') as HTMLElement | null;
    if (!t) return;
    cur = t;
    t.classList.add('down');
    t.classList.remove('rel');
    if (!t.dataset.silent) sfx('ui_click');
  });
  const up = () => {
    if (!cur) return;
    const t = cur;
    cur = null;
    t.classList.remove('down');
    void t.offsetWidth;
    t.classList.add('rel');
    setTimeout(() => t.classList.remove('rel'), 160);
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  root.addEventListener('dblclick', (e) => e.preventDefault());
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** 한 번 탭 = 0.17초 뒤 설명 / 0.45초 안 두 번 탭 = 구매. 못 사면 오류음 + 흔들림 */
let lastEl: Element | null = null;
let lastT = 0;
let infoTimer = 0;
export function bindBuy(target: HTMLElement | null, can: () => boolean, buy: () => void, info: () => void): void {
  if (!target) return;
  target.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const now = performance.now();
    if (lastEl === target && now - lastT < 450) {
      lastEl = null;
      clearTimeout(infoTimer);
      if (can()) buy();
      else {
        sfx('ui_error');
        shakeEl(target);
        info();
      }
      return;
    }
    lastEl = target;
    lastT = now;
    clearTimeout(infoTimer);
    infoTimer = window.setTimeout(() => {
      sfx('ui_tap');
      info();
    }, 170);
  });
  target.addEventListener('dblclick', (e) => e.preventDefault());
}
/** 트리처럼 DOM 이 아닌 대상용: 같은 규칙을 key 로 판정 */
let lastKey = '';
export function tapKey(key: string, can: () => boolean, buy: () => void, info: () => void, onFail?: () => void): void {
  const now = performance.now();
  if (lastKey === key && now - lastT < 450) {
    lastKey = '';
    clearTimeout(infoTimer);
    if (can()) buy();
    else {
      sfx('ui_error');
      onFail?.();
      info();
    }
    return;
  }
  lastKey = key;
  lastEl = null;
  lastT = now;
  clearTimeout(infoTimer);
  infoTimer = window.setTimeout(() => {
    sfx('ui_tap');
    info();
  }, 170);
}

/** 숫자(×·+ 로 시작하는 것 포함)를 앞 낱말과 붙여 줄바꿈: "제휴점 13" 이 "제휴점 / 13" 으로 갈리지 않게 */
export const nb = (s: string): string => s.replace(/ (?=[0-9×+])/g, '\u00a0');

/* ── 토스트: 위 가운데, 2.4초, 동시 3 ── */
let toastBox: HTMLElement | null = null;
export function mountToasts(root: HTMLElement): void {
  toastBox = el('div', 'toasts');
  root.appendChild(toastBox);
}
/**
 * 가로 화면 위쪽 토스트가 HUD(왼쪽 위 알약·오른쪽 위 메뉴)를 덮지 않게 자리를 잡는다.
 * HUD 사이 빈 띠가 넉넉하면 그 가운데, 모자라면 HUD 아래로. 세로는 아래쪽(설명 바가 떠 있으면 그 위), 영업 중은 CSS 그대로.
 */
function placeToasts(box: HTMLElement): void {
  box.style.left = box.style.right = box.style.top = box.style.bottom = '';
  const ui = box.parentElement;
  if (!ui || document.body.classList.contains('lunching')) return;
  const ur = ui.getBoundingClientRect();
  const kd = ur.width / (ui.offsetWidth || 1) || 1;
  if (ui.classList.contains('port')) {
    /* 세로: 아래쪽 토스트가 설명 바를 가리지 않게 그 위로 */
    const sh = ui.querySelector<HTMLElement>('#office.on .sheet.show');
    const b = sh?.getBoundingClientRect();
    if (b && b.height) box.style.bottom = `${Math.round((ur.bottom - b.top) / kd + 8)}px`;
    return;
  }
  const els = ui.querySelectorAll<HTMLElement>('#office.on .hud .row > *, #office.on .menu > .mb, #lunch.on .lhud .r1 > *, #lunch.on .lhud .r2 > *');
  let L = ur.left;
  let R = ur.right;
  let bottom = ur.top;
  const reach = ur.top + 190 * kd; // 토스트 3장이 쌓이는 높이
  for (const e of Array.from(els)) {
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height || b.top > reach || getComputedStyle(e).display === 'none') continue;
    bottom = Math.max(bottom, b.bottom);
    if (b.left + b.width / 2 < ur.left + ur.width / 2) L = Math.max(L, b.right);
    else R = Math.min(R, b.left);
  }
  const free = (R - L) / kd;
  if (free >= 380) {
    box.style.left = `${Math.round((L - ur.left) / kd + 8)}px`;
    box.style.right = `${Math.round((ur.right - R) / kd + 8)}px`;
  } else if (bottom > ur.top) {
    /* HUD 아래로 내려갈 때는 트리 머리 막대([가운데로] 포함)도 건너뜀 */
    for (const e of Array.from(ui.querySelectorAll<HTMLElement>('#office.on .treehead .th, #office.on .treehead .tcenter'))) {
      const b = e.getBoundingClientRect();
      if (b.width && b.height && b.top < bottom + 60 * kd && getComputedStyle(e).display !== 'none') bottom = Math.max(bottom, b.bottom);
    }
    box.style.top = `${Math.round((bottom - ur.top) / kd + 8)}px`;
  }
}
/** 떠 있는 토스트를 모두 걷음(영업 시작 때: 사무실 안내가 지도 위에 남지 않게) */
export function clearToasts(): void {
  if (toastBox) toastBox.innerHTML = '';
}
export function toast(msg: string, icon?: string): void {
  if (!toastBox) return;
  placeToasts(toastBox);
  const t = el('div', 'toast', (icon ? img(icon) : '') + `<span>${msg}</span>`);
  toastBox.appendChild(t);
  while (toastBox.children.length > 3) toastBox.firstElementChild?.remove();
  sfx('toast');
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, 2400);
}
