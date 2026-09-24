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

export function bump(e: Element | null): void {
  if (!e) return;
  e.classList.remove('bump');
  void (e as HTMLElement).offsetWidth;
  e.classList.add('bump');
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
    box.style.top = `${Math.round((bottom - ur.top) / kd + 8)}px`;
  }
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
