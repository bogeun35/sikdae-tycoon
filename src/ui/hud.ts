/**
 * HUD(DOM): 사무실 좌상단(레벨·재화·고객사/제휴점·힌트) + 우상단 메뉴 원, 영업 HUD(타이머·밸런스계약·결제 대기·대표 초상·스킬 슬롯).
 * 재화 순서 = 매출 → 기술력(같은 크기 알약, 주인공) → 누적 식대 거래액(작은 칩, 쓰지 않는 기록). 설계서 1장.
 * 숫자는 표시값 += (실제 − 표시값) × min(1, dt × 7) 로 따라 올라가고, 오르면 알약이 1.14배 튄다.
 */
import { CHAR_BY, DISTRICT_BY, SKILLS, SKILL_ORDER, TARGET_BY, type SkillId } from '../game/data';
import { fmt } from '../game/format';
import { E, lvPowerMult, nextMasteryUnlock, skillUnlocked, STAT_MAX, xpNeed } from '../game/rules';
import { S } from '../game/state';
import type { HudId } from '../game/fx/top';
import { domToFx, onLayout, view } from '../game/core/stage';
import { $, $$, bump, el, img, restartClass } from './dom';
import { FONT_STACK } from '../fonts';
import { CanvasNum, Glyphs } from './cnum';

/**
 * HUD 배치 버전(설계서 7장 3): 레이아웃·영업 HUD 줄 배치·보스 게이지·결제 대기 알약이 바뀌면 +1.
 * HUD 앵커(코인이 날아갈 자리)·영업 지도 숫자가 비킬 HUD 자리는 이 값이 바뀔 때만 다시 잰다(getBoundingClientRect 가 레이아웃을 강제).
 */
let hudVer = 0;
export function hudVersion(): number {
  return hudVer;
}
export function bumpHudVersion(): void {
  hudVer++;
}
let hudVerHooked = false;
function hookHudVersion(): void {
  if (hudVerHooked) return;
  hudVerHooked = true;
  onLayout(() => bumpHudVersion());
}
/** 막대 채우기: 폭 대신 transform(레이아웃 없음). 막대 요소는 CSS 에서 width:100% · 부모 overflow:hidden */
const barX = (r: number) => `translateX(${((Math.max(0, Math.min(1, r)) - 1) * 100).toFixed(2)}%)`;
import { legendChips } from './kinds';
import { sfx } from '../game/deps';

/** 표시값 */
export const disp = { gmv: 0, revenue: 0, tech: 0, net: 0 };
let dispInit = false;
export function snapDisplay(): void {
  disp.gmv = S.gmv;
  disp.revenue = S.revenue;
  disp.tech = S.tech;
  dispInit = true;
}

const MENU: { tab: string; icon: string; name: string }[] = [
  { tab: 'tree', icon: 'ic.tab_tree', name: '스킬' },
  { tab: 'reps', icon: 'ic.tab_reps', name: '인재영입' },
  { tab: 'dex', icon: 'ic.tab_dex', name: '기업도감' },
  { tab: 'items', icon: 'ic.tab_items', name: '유물아이템' },
  { tab: 'skills', icon: 'ic.tab_skills', name: '역량교육' },
];

function curPill(id: 'gmv' | 'revenue' | 'tech', gain = false): string {
  const cls = id === 'gmv' ? 'gmv' : id === 'revenue' ? 'rev' : 'tc';
  const ic = id === 'gmv' ? 'ic.gmv' : id === 'revenue' ? 'ic.revenue' : 'ic.tech';
  const lab = id === 'gmv' ? '누적 식대 거래액' : id === 'revenue' ? '자본' : '기술력';
  return `<div class="cur ${cls} pe" data-hud="hud.${id}" title="${lab}">${id === 'gmv' ? '' : img(ic)}<span class="cur-label">${id === 'gmv' ? '거래액' : lab}</span><b data-v="${id}">0</b>${gain ? `<span class="gain" data-g="${id}"></span>` : ''}</div>`;
}
function lvlPill(): string {
  return `<div class="lvl pe clickable" data-hud="hud.level" data-a="level"><div class="n" data-v="lv">1</div><div class="xpbar"><i data-v="xpfill"></i><span data-v="xptxt">0 / 400</span></div></div>`;
}

export class OfficeHud {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  readonly menu: HTMLElement;
  readonly panel: HTMLElement;
  readonly body: HTMLElement;
  readonly sheet: HTMLElement;
  readonly cfg: HTMLButtonElement;
  readonly dist: HTMLButtonElement;
  readonly go: HTMLButtonElement;
  readonly treeHead: HTMLElement;
  /** 효과 색 범례(설계서 6-2): 패널 머리 오른쪽 한 곳, 트리·대표·도감·아이템·스킬 탭 공통 */
  readonly legend: HTMLElement;
  readonly bl: HTMLElement;
  private last: Record<string, string> = {};
  onLevelTap: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = el('div', 'scr', '');
    this.root.id = 'office';
    this.hud = el(
      'div',
      'hud',
      `<div class="row company-row"><div class="users pe clickable" data-hud="hud.level" data-a="level"><span>사용자</span><b data-v="users">0</b><span class="user-lv">Lv.<span data-v="lv">1</span></span><div class="user-progress"><i data-v="xpfill"></i></div></div><div class="chip net pe" data-hud="hud.net"><span>고객사</span><b data-v="netc">0</b></div><div class="chip net pe"><span>제휴점</span><b data-v="netr">0</b></div></div>
       <div class="row finance-row">${curPill('revenue')}${curPill('tech')}${curPill('gmv')}</div>`,
    );
    this.menu = el(
      'div',
      'menu',
      MENU.map((m, i) => `<button class="mb tw" data-tab="${m.tab}" aria-label="${m.name}">${img(m.icon)}<span class="menu-label">${m.name}</span><span class="dot"></span><span class="tip">${i + 1} ${m.name}</span></button>`).join('') +
        `<button class="mb fs tw" data-a="fs" aria-label="전체보기">${img('ic.fullscreen')}<span class="menu-label">전체보기</span><span class="tip">F 전체보기</span></button>`,
    );
    this.panel = el('div', 'panel', `<div class="body"></div>`);
    this.body = $(this.panel, '.body')!;
    this.treeHead = el('div', 'treehead', '');
    this.panel.appendChild(this.treeHead);
    this.legend = el('div', 'legend', `<button class="lgb tw" data-a="legend" aria-label="효과 색"><i></i>효과 색</button><div class="lgl">${legendChips()}</div>`);
    this.legend.dataset.legend = '1';
    this.panel.appendChild(this.legend);
    $(this.legend, '[data-a="legend"]')?.addEventListener('click', () => {
      sfx('ui_tap');
      this.legend.classList.toggle('open');
    });
    this.sheet = el('div', 'sheet', '');
    this.panel.appendChild(this.sheet);
    const bl = el('div', 'bl', `<button class="cfg tw" data-a="cfg" aria-label="설정">${img('ic.settings')}</button><button class="dist tw" data-a="dist"></button>`);
    this.bl = bl;
    this.cfg = $(bl, '.cfg') as HTMLButtonElement;
    this.dist = $(bl, '.dist') as HTMLButtonElement;
    this.go = el('button', 'go tw', `${img('ic.go')}<span>영업 나가기</span>`);
    this.root.append(this.hud, this.menu, this.panel, bl, this.go);
    parent.appendChild(this.root);
    for (const e of $$(this.hud, '[data-a="level"]')) e.addEventListener('pointerdown', () => this.onLevelTap());
    this.place();
  }

  /** 폰 세로면 메뉴 원을 HUD 아래 한 줄로 */
  place(): void {
    if (this.menu.parentElement !== this.hud) this.hud.appendChild(this.menu);
    bumpHudVersion();
  }
  /** 패널 위치: HUD 실측 높이 아래 */
  fitPanel(): void {
    const ui = document.getElementById('ui')!;
    const kd = ui.getBoundingClientRect().width / ui.offsetWidth || 1;
    const h = this.hud.getBoundingClientRect();
    const top = (h.bottom - ui.getBoundingClientRect().top) / kd + 8;
    this.panel.style.top = `${Math.round(top)}px`;
    this.fitBottom();
  }
  /** 폰 세로: 상권 알약이 [영업 나가기] 밑으로 들어가지 않게 폭을 줄이고(보정 글자는 줄바꿈), 패널 아래 끝을 그 높이에 맞춤 */
  fitBottom(): void {
    const ui = document.getElementById('ui')!;
    const port = ui.classList.contains('port');
    const d = this.dist;
    if (!this.go.offsetParent) return;
    if (!port) {
      d.style.maxWidth = '';
      this.panel.style.bottom = '';
      return;
    }
    const kd = ui.getBoundingClientRect().width / ui.offsetWidth || 1;
    const dl = d.getBoundingClientRect().left;
    const gl = this.go.getBoundingClientRect().left;
    if (gl > dl) d.style.maxWidth = `${Math.max(90, Math.floor((gl - dl) / kd - 8))}px`;
    const ur = ui.getBoundingClientRect();
    const blTop = Math.min(this.bl.getBoundingClientRect().top, this.go.getBoundingClientRect().top);
    const need = Math.ceil((ur.bottom - blTop) / kd + 8);
    this.panel.style.bottom = need > 70 ? `${need}px` : '';
  }

  setTab(tab: string | null): void {
    for (const b of $$(this.menu, '.mb[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    this.cfg.classList.toggle('on', tab === 'settings');
    this.legend.style.display = tab && tab !== 'settings' ? '' : 'none';
  }
  setAlerts(a: Record<string, boolean>): void {
    for (const b of $$(this.menu, '.mb[data-tab]')) b.classList.toggle('alert', !!a[b.dataset.tab!]);
  }
  setFullscreen(on: boolean): void {
    const b = $(this.menu, '[data-a="fs"]');
    if (b) b.innerHTML = `${img(on ? 'ic.fullscreenExit' : 'ic.fullscreen')}<span class="menu-label">전체보기</span><span class="tip">F 전체보기</span>`;
  }
  renderDistrict(): void {
    const d = DISTRICT_BY[S.district];
    this.dist.innerHTML = `${img('ic.pin')}<span>${d.name}</span>`;
    this.fitBottom();
  }

  /** data-v 요소 캐시(매 프레임 querySelector 하지 않게) */
  private els = new Map<string, HTMLElement | null>();
  private ref(sel: string): HTMLElement | null {
    let e = this.els.get(sel);
    if (e === undefined || (e && !e.isConnected)) {
      e = $(this.root, sel);
      this.els.set(sel, e);
    }
    return e;
  }
  update(): void {
    const set = (k: string, v: string) => {
      if (this.last[k] === v) return false;
      const had = this.last[k] !== undefined;
      this.last[k] = v;
      const e = this.ref(`[data-v="${k}"]`);
      if (e) e.textContent = v;
      return had;
    };
    set('lv', String(S.lv));
    set('users', fmt(S.xp + Array.from({ length: S.lv - 1 }, (_, i) => xpNeed(i + 1)).reduce((a, b) => a + b, 0)));
    const need = xpNeed(S.lv);
    const xf = barX(S.xp / need);
    if (this.last.xpfill !== xf) {
      this.last.xpfill = xf;
      const fill = this.ref('[data-v="xpfill"]');
      if (fill) fill.style.transform = xf;
    }
    set('xptxt', `${fmt(S.xp)} / ${fmt(need)}`);
    /* 거래액 칩은 값이 올라도 튀지 않음(눈길은 매출·기술력으로) */
    set('gmv', fmt(disp.gmv));
    if (set('revenue', fmt(disp.revenue))) bump(this.ref('.cur.rev'));
    if (set('tech', fmt(disp.tech))) bump(this.ref('.cur.tc'));
    if (set('netc', fmt(S.netC))) bump(this.ref('.chip.net'));
    set('netr', fmt(S.netR));
    set('hint', hintText());
  }
}

export function modLine(mod: Record<string, number>): string {
  const parts: string[] = [];
  if (mod.spawn) parts.push(`고객서치 +${Math.round(mod.spawn * 100)}%`);
  if (mod.storeBias) parts.push(`식당 탐색 우대`);
  if (mod.corpBias) parts.push(`기업 탐색 우대`);
  if (mod.bigBias) parts.push(`대형 ×${mod.bigBias}`);
  if (mod.gmv) parts.push(`거래액 +${Math.round(mod.gmv * 100)}%`);
  if (mod.chest) parts.push(`선물 +${Math.round(mod.chest * 100)}%`);
  if (mod.tech) parts.push(`기술력 +${Math.round(mod.tech * 100)}%`);
  if (mod.xp) parts.push(`사용자수 +${Math.round(mod.xp * 100)}%`);
  if (mod.rare) parts.push(`행운 +${Math.round(mod.rare * 100)}%`);
  if (mod.dark) parts.push('야근 모드');
  /* 항목 안("기술력 +40%")에서는 줄이 갈리지 않게 줄바꿈 없는 공백(nbsp)으로, 항목 사이(·)에서만 줄바꿈 */
  return parts.map((t) => t.replace(/ /g, '\u00a0')).join(' · ') || '기본 상권';
}

export function hintText(): string {
  const nu = nextMasteryUnlock(S.lv);
  if (nu) return `Lv.${nu.masteryLv} → ${nu.name} 관리 열림`;
  return `영업기술 +${Math.round((lvPowerMult(S.lv) - 1) * 100)}%`;
}
/** 레벨 설명 바: 다음 거래처 관리는 옆 힌트 알약에 있어 여기서는 뺀다 */
export function levelInfo(): { title: string; desc: string } {
  const need = xpNeed(S.lv);
  return {
    title: `레벨 ${S.lv}`,
    desc: `영업기술 ×${lvPowerMult(S.lv).toFixed(2)} · 다음 레벨까지 사용자수 ${fmt(Math.max(0, need - S.xp))}`,
  };
}

/* ── 영업 HUD ── */
export class LunchHud {
  readonly root: HTMLElement;
  readonly endBtn: HTMLButtonElement;
  readonly fsBtn: HTMLButtonElement;
  private slots: Record<string, HTMLElement> = {};
  private last: Record<string, string> = {};
  gain = { gmv: 0, revenue: 0, tech: 0 };

  constructor(parent: HTMLElement) {
    this.root = el('div', 'scr', '');
    this.root.id = 'lunch';
    /* 이번 판 획득(+)은 매출·기술력에만. 거래액 칩은 누적만 */
    const curRow = (g: boolean) => `${curPill('revenue', g)}${curPill('tech', g)}${curPill('gmv')}`;
    this.root.innerHTML = `
      <div class="lhud">
        <div class="r1">${lvlPill()}${curRow(true)}<div class="sp"></div><div class="timer" data-v="timer">${img('ic.timer')}<span class="tts" data-v="tt"><canvas class="ttc"></canvas></span></div></div>
        <div class="r2x">${curRow(true)}</div>
        <div class="r2">
          <div class="match" data-v="match">${img('ic.corp')}<span data-v="mc">0</span> : ${img('ic.store')}<span data-v="mr">0</span><span class="mm" data-v="mm">밸런스계약 ×1.00</span><div class="mb2"><i data-v="mbar"></i></div></div>
          <div class="pend" data-v="pend" data-hud="hud.pending" style="display:none">${img('ic.pending')}<span data-v="pendt">결제 대기</span></div>
          <div class="sp"></div><div class="brk"></div>
          <div class="dname" data-v="dname"></div>
          <button class="mb fs tw lfs" data-a="fs" aria-label="전체보기">${img('ic.fullscreen')}</button>
          <div class="portrait lportrait portP" data-v="portP"></div>
        </div>
        <div class="bossbar" data-v="boss"><div class="bn">${img('ic.best')}${TARGET_BY.boss ? TARGET_BY.boss.name : ''}<span data-v="bosspct"></span></div><div class="bb"><i class="gh" data-v="bossgh"></i><i class="fl" data-v="bossfl"></i></div></div>
      </div>
      <div class="portrait lportrait portL" data-v="portL"></div>
      <div class="slots">${SKILL_ORDER.map((id) => `<div class="slot" data-sk="${id}">${img('ic.' + SKILLS[id].icon)}<div class="cdv"></div><div class="cdt"></div></div>`).join('')}</div>
      <div class="lbl"></div>
      <button class="btn light endbtn tw" data-a="end">${img('ic.office')}사무실로</button>`;
    for (const s of $$(this.root, '.slot')) this.slots[s.dataset.sk!] = s;
    this.endBtn = $(this.root, '[data-a="end"]') as HTMLButtonElement;
    this.fsBtn = $(this.root, '[data-a="fs"]') as HTMLButtonElement;
    parent.appendChild(this.root);
    {
      const ro = hudObserver();
      if (ro) for (const e of $$(this.root, '.lhud .cur, .lhud .lvl, .lhud .timer, .lhud .match, .lhud .pend, .lhud .dname, .lportrait, .bossbar, .slots .slot, .endbtn')) ro.observe(e);
    }
    const st = document.createElement('style');
    st.textContent = `#ui.land .portP { display:none; } #ui.port .portL { display:none; }`;
    document.head.appendChild(st);
    hookHudVersion();
  }

  /** 선택자 → 요소들 캐시(매 프레임 querySelectorAll 하지 않게). begin() 에서 비움 */
  private cache = new Map<string, HTMLElement[]>();
  private all(sel: string): HTMLElement[] {
    let a = this.cache.get(sel);
    if (!a || (a.length && !a[0].isConnected)) {
      a = $$(this.root, sel);
      this.cache.set(sel, a);
    }
    return a;
  }
  private one(sel: string): HTMLElement | null {
    return this.all(sel)[0] || null;
  }
  /** 캔버스 숫자(매출·기술력·거래액·+N) */
  private cnums = new WeakMap<HTMLElement, CanvasNum>();
  private cnum(e: HTMLElement): CanvasNum {
    let c = this.cnums.get(e);
    if (!c) {
      c = new CanvasNum(e);
      this.cnums.set(e, c);
    }
    return c;
  }

  private modeNow = '';
  /**
   * 폰 세로: 상권 이름·전체화면 버튼은 지도 위를 가리지 않게 아래 띠 왼쪽(사무실로 버튼과 같은 줄)으로.
   * 낮은 가로 화면(폰 가로): 밸런스계약·결제 대기 알약을 첫 줄(재화 알약 오른쪽)로 올림 — 두 줄이면 지도 맨 윗줄 부지를 덮음.
   */
  place(): void {
    const ui = document.getElementById('ui')!;
    const port = ui.classList.contains('port');
    const flat = !port && ui.classList.contains('short');
    const mode = port ? 'port' : flat ? 'flat' : 'land';
    if (mode === this.modeNow) return;
    this.modeNow = mode;
    const dn = $(this.root, '[data-v="dname"]');
    const lbl = $(this.root, '.lbl');
    const r1 = $(this.root, '.lhud .r1');
    const r2 = $(this.root, '.lhud .r2');
    const portP = $(this.root, '.lhud .r2 .portP');
    const match = $(this.root, '[data-v="match"]');
    const pend = $(this.root, '[data-v="pend"]');
    if (!dn || !lbl || !r1 || !r2 || !match || !pend) return;
    if (flat) {
      const sp1 = $(r1, '.sp');
      r1.insertBefore(match, sp1);
      r1.insertBefore(pend, sp1);
    } else if (match.parentElement !== r2) {
      r2.insertBefore(pend, r2.firstChild);
      r2.insertBefore(match, pend);
    }
    if (port) lbl.append(dn, this.fsBtn);
    else {
      r2.insertBefore(dn, portP);
      r2.insertBefore(this.fsBtn, portP);
    }
    this.last.lack = '~';
    /* 보이는 재화 줄이 바뀜: 모든 글자를 새 줄에 다시 씀 */
    for (const k of Object.keys(this.last)) if (k !== 'lack' && k !== 'boss') delete this.last[k];
    this.domForce = true;
    bumpHudVersion();
  }
  begin(total: number): void {
    this.place();
    this.gain = { gmv: 0, revenue: 0, tech: 0 };
    this.last = {};
    this.cache.clear();
    this.pendA.clear();
    this.pendB.clear();
    this.slow = 1;
    bumpHudVersion();
    const d = DISTRICT_BY[S.district];
    const dn = $(this.root, '[data-v="dname"]');
    if (dn) dn.innerHTML = `${img('ic.pin')}${d.name}<span data-v="spd"></span>`;
    const rep = CHAR_BY.lion || CHAR_BY.bear;
    /* 초상은 평소·환호 두 장을 미리 넣고 보이기만 바꿈(설계서 7장 3: 계약마다 innerHTML 로 SVG 그림을 새로 만들지 않게) */
    for (const p of $$(this.root, '.lportrait')) {
      p.innerHTML = img(`c.${rep.id}@idle`, 'pi') + img(`c.${rep.id}@cheer`, 'pc');
      p.classList.remove('pcOn');
    }
    for (const id of SKILL_ORDER) {
      const s = this.slots[id];
      const un = skillUnlocked(id);
      s.classList.toggle('lockd', !un);
      const lk = $(s, '.lk');
      if (!un && !lk) s.insertAdjacentHTML('beforeend', img('ic.lock', 'lk'));
      if (un && lk) lk.remove();
    }
    const t = $(this.root, '[data-v="timer"]');
    t?.classList.remove('low');
    this.setTimer(total);
  }
  setTimer(left: number): void {
    const v = left.toFixed(1);
    if (this.last.tt === v) return;
    this.last.tt = v;
    const low = left <= 5 && left > 0 ? '1' : '';
    if (this.last.tlow !== low) {
      this.last.tlow = low;
      this.one('[data-v="timer"]')?.classList.toggle('low', !!low);
    }
    this.drawTimer(v);
  }
  /**
   * 남은 시간 글자는 작은 캔버스에 그린다(설계서 7장 3): 0.1초마다 바뀌는 DOM 글자는 그때마다 레이아웃을 부름.
   * 캔버스는 칸 크기가 고정이라 다시 그려도 레이아웃이 없다. 크기·색은 HUD 배치가 바뀌거나 5초 경고 색이 바뀔 때만 다시 잰다
   */
  private tt: { cv: HTMLCanvasElement | null; g: CanvasRenderingContext2D | null; key: string; color: string; px: number; dpr: number; font: string; set: boolean } = { cv: null, g: null, key: '', color: '#5c3a1a', px: 25, dpr: 1, font: '25px sans-serif', set: false };
  private drawTimer(v: string): void {
    const T0 = this.tt;
    if (!T0.cv || !T0.cv.isConnected) {
      T0.cv = this.one('.ttc') as HTMLCanvasElement | null;
      T0.g = null;
    }
    const cv = T0.cv;
    if (!cv) return;
    /* 다시 잴 때 = 화면 배치(#ui 클래스·배율·첫 줄 클래스)나 5초 경고 색이 바뀔 때. hudVersion 은 숫자 길이만 바뀌어도 올라 매번 강제 레이아웃이 났음 */
    const key = (document.getElementById('ui')?.className || '') + '|' + view.kd + '|' + (this.one('.lhud .r1')?.className || '') + '|' + (this.last.tlow || '');
    if (T0.key !== key) {
      T0.key = key;
      const r = cv.getBoundingClientRect();
      /* 아직 안 보임(0 크기): 다음에 다시 잼 */
      if (r.width < 1 || r.height < 1) {
        T0.key = '';
        return;
      }
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      /* 크기를 바꾸면 그리기 상태(글꼴·정렬)가 초기화됨 → 다시 설정 */
      T0.set = false;
      const cs = getComputedStyle(cv.parentElement || cv);
      T0.color = cs.color || '#5c3a1a';
      T0.px = parseFloat(cs.fontSize) || 25;
      T0.dpr = dpr;
      T0.font = `${Math.round(T0.px * dpr)}px ${FONT_STACK.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(',')}`;
      T0.set = false;
    }
    /* 기본 캔버스(HUD 숫자 cnum 과 같게). willReadFrequently(CPU 즉시 그리기)는 fillText 자리에서 바로 래스터해 폰 4배 느림 후반 측정에서
       한 번에 2.8ms(캔버스 숫자 한 장의 약 3배)였음 — 기본 캔버스는 그리기를 모아 두었다가 화면에 올릴 때 그림.
       그리기 상태(글꼴 문자열 해석 등)는 바뀔 때만 설정 — 0.1초마다 글꼴을 다시 넣으면 그때마다 글꼴을 다시 해석함 */
    if (!T0.g) {
      T0.g = cv.getContext('2d');
      T0.set = false;
    }
    const g = T0.g;
    if (!g) return;
    g.clearRect(0, 0, cv.width, cv.height);
    /* 글자 칸으로 찍음(cnum.ts Glyphs): 가운데 정렬 = 글자 줄 폭의 반만큼 왼쪽에서 시작, 기준선 middle · 높이 0.55 는 예전 fillText 와 같게 */
    const gl = this.ttGlyphs;
    gl.config(T0.font, Math.round(T0.px * T0.dpr), T0.color, null, cv.height, cv.height * 0.55, 'middle', 0);
    gl.draw(g, v, cv.width / 2 - gl.width(v) / 2);
  }
  private ttGlyphs = new Glyphs();
  setSpeed(sp: number): void {
    const e = $(this.root, '[data-v="spd"]');
    if (e) e.textContent = sp !== 1 ? ` ×${sp}` : '';
  }
  /** 글자·막대 갱신 간격(설계서 7장 3: 10Hz). 숫자는 표시값이 따라 올라가는 중이라 0.1초 단위로 바꿔도 부드럽게 보임 */
  private slow = 1;
  private domTick = 0;
  private domForce = false;
  /**
   * 캔버스 숫자 그리기 대기열: A = 재화·이번 판 +N, B = 스킬 재사용 초. 한 프레임에 한 묶음만 그림(설계서 7장 3 — 10Hz 는 그대로).
   * 30fps 에서는 갱신 프레임에 A, 다음 프레임에 B 라 둘 다 초당 10번. 기기가 느려 프레임마다 갱신 차례가 오면(폰 4배 느림 후반 8fps)
   * 두 묶음이 번갈아 그려져 한 프레임에 캔버스 9장을 한꺼번에 그리지 않음(글자 그리기가 영업 HUD 비용의 대부분)
   */
  private pendA = new Map<CanvasNum, [string, string]>();
  private pendB = new Map<CanvasNum, [string, string]>();
  private lastGroup: 'A' | 'B' = 'B';
  private flushNums(): void {
    const A = this.pendA;
    const B = this.pendB;
    if (!A.size && !B.size) return;
    const pick = this.lastGroup === 'A' ? (B.size ? B : A) : A.size ? A : B;
    this.lastGroup = pick === A ? 'A' : 'B';
    let widthMaybe = false;
    for (const [c, [v, ver]] of pick) if (c.set(v, ver) && pick === A) widthMaybe = true;
    pick.clear();
    /* 폭이 바뀐 것은 HUD 배치 버전을 올리지 않음 — 자리는 ResizeObserver 가 레이아웃 직후에 새로 잼(onHudResize) */
    if (widthMaybe) this.fitRow();
  }
  update(lunch: { cN: number; rN: number; M: number; matchStep: number; cd: Record<string, number>; lacking(): 'corp' | 'store' | null; cooldown(id: SkillId): number }, dt = 0.1): void {
    this.slow += dt;
    if (this.slow >= 0.1) {
      this.slow = 0;
      this.tick(lunch);
    }
    this.flushNums();
  }
  private tick(lunch: { cN: number; rN: number; M: number; matchStep: number; cd: Record<string, number>; lacking(): 'corp' | 'store' | null; cooldown(id: SkillId): number }): void {
    this.place();
    /* DOM 글자(레벨·사용자수·밸런스계약·결제 대기)는 0.5초마다 한 번에 씀 — 글자가 바뀐 프레임마다 레이아웃이라 10Hz 면 초당 최대 10번(설계서 7장 3: ≤ 3회/초).
       자주 바뀌는 재화·+N·스킬 재사용 숫자는 캔버스(레이아웃 없음), 막대는 transform */
    this.domTick = (this.domTick + 1) % 5;
    const domNow = this.domTick === 0 || this.domForce;
    this.domForce = false;
    /* 보이는 줄만(폰 세로 = 둘째 줄, 그 밖 = 첫 줄) — 숨은 줄 캔버스까지 매번 그리지 않게. 배치가 바뀌면 place() 가 last 를 비워 다시 씀 */
    const row = this.modeNow === 'port' ? '.lhud .r2x ' : '.lhud .r1 ';
    /* 캔버스 숫자 크기·색이 바뀌는 때 = 화면 배치(#ui 클래스·배율)가 바뀔 때. hudVersion 은 글자 길이만 바뀌어도 오르므로 쓰지 않음 */
    const ver = (document.getElementById('ui')?.className || '') + '|' + view.kd + '|' + (this.one('.lhud .r1')?.className || '');
    let widthMaybe = false;
    const set = (k: string, v: string) => {
      const old = this.last[k];
      if (old === v) return false;
      const had = old !== undefined;
      this.last[k] = v;
      /* 캔버스 숫자는 칸 크기가 실제로 바뀐 때만 HUD 배치를 다시 잼(글자 길이만 바뀌어서는 안 잼 — 잴 때마다 강제 레이아웃) */
      if (k === 'gmv' || k === 'revenue' || k === 'tech') {
        for (const e of this.all(`${row}[data-v="${k}"]`)) this.pendA.set(this.cnum(e), [v, ver]);
      } else {
        if (!had || old.length !== v.length) widthMaybe = true;
        for (const e of this.all(`[data-v="${k}"]`)) e.textContent = v;
      }
      return had;
    };
    /* 느린 DOM 글자: 0.4초 차례가 아니면 미뤄 둠(값은 다음 차례에 최신으로) */
    const setDom = (k: string, v: string) => {
      if (domNow) set(k, v);
      else if (this.last[k] !== v) this.domForce = this.domForce || this.last[k] === undefined;
    };
    setDom('lv', String(S.lv));
    const need = xpNeed(S.lv);
    const xf = barX(S.xp / need);
    if (this.last.xpfill !== xf) {
      this.last.xpfill = xf;
      for (const f of this.all('[data-v="xpfill"]')) f.style.transform = xf;
    }
    setDom('xptxt', `${fmt(S.xp)} / ${fmt(need)}`);
    set('gmv', fmt(disp.gmv));
    /* 알약 튀기는 코인이 닿을 때만(bumpAnchor). 숫자가 따라 올라가는 0.1초마다 튀기면 애니메이션이 끊이지 않아 매 프레임 스타일 계산(설계서 7장 3) */
    set('revenue', fmt(disp.revenue));
    set('tech', fmt(disp.tech));
    const g = (k: 'gmv' | 'revenue' | 'tech') => {
      /* 이번 판 획득(+)도 누적 표시값과 같은 속도로 따라 올라가게: 누적이 아직 못 따라온 만큼 뺌(누적보다 커 보이지 않게) */
      const shownGain = Math.max(0, this.gain[k] - Math.max(0, S[k] - disp[k]));
      const v = shownGain >= 1 ? '+' + fmt(shownGain) : '';
      const old = this.last['g' + k];
      if (old === v) return;
      this.last['g' + k] = v;
      for (const e of this.all(`${row}[data-g="${k}"]`)) this.pendA.set(this.cnum(e), [v, ver]);
    };
    g('revenue');
    g('tech');
    setDom('mc', String(lunch.cN));
    setDom('mr', String(lunch.rN));
    setDom('mm', `밸런스계약 ×${lunch.M.toFixed(2)}`);
    const steps = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    const i = Math.min(steps.length - 2, lunch.matchStep);
    const lo = steps[i];
    const hi = steps[i + 1];
    const mb = barX((lunch.M - lo) / (hi - lo));
    if (this.last.mbar !== mb) {
      this.last.mbar = mb;
      const bar = this.one('[data-v="mbar"]');
      if (bar) bar.style.transform = mb;
    }
    const lack = lunch.lacking();
    const lk = lack || '';
    if (this.last.lack !== lk) {
      this.last.lack = lk;
      const m = this.one('[data-v="match"]');
      /* 화살표 그림은 한 번만 만들고 자리·보이기만 바꿈(부족한 쪽이 바뀔 때마다 SVG 그림을 새로 만들지 않게) */
      let nd = m ? $(m, '.need') : null;
      if (lack && m) {
        const icons = $$(m, 'img.ic');
        const target = lack === 'corp' ? icons[0] : icons[1];
        const left = target ? target.offsetLeft : 4;
        if (!nd) {
          m.insertAdjacentHTML('beforeend', img('ic.arrowUp', 'need'));
          nd = $(m, '.need');
        }
        /* 자리는 translate, 숨김은 visibility(레이아웃 없음 — left·display 를 바꾸면 그때마다 레이아웃) */
        if (nd) {
          nd.style.translate = `${left}px 0`;
          nd.style.visibility = '';
        }
      } else if (nd) nd.style.visibility = 'hidden';
    }
    const pend = this.one('[data-v="pend"]');
    if (pend) {
      const show = S.pendG > 0 ? '1' : '';
      if (this.last.pendOn !== show) {
        this.last.pendOn = show;
        pend.style.display = show ? '' : 'none';
        widthMaybe = true;
        bumpHudVersion();
      }
      if (show) setDom('pendt', `결제 대기 ${fmt(S.pendG)}원`);
    }
    if (widthMaybe) this.fitRow();
    for (const id of SKILL_ORDER) {
      const s = this.slots[id];
      if (!skillUnlocked(id)) continue;
      const cdTotal = lunch.cooldown(id);
      const left = Math.max(0, lunch.cd[id]);
      const k = `cd_${id}`;
      const r = Math.min(1, left / cdTotal);
      const tf = `scaleY(${r.toFixed(3)})`;
      if (this.last[k] !== tf) {
        this.last[k] = tf;
        const cdv = this.one(`.slot[data-sk="${id}"] .cdv`);
        if (cdv) cdv.style.transform = tf;
      }
      const v = left > 0.05 ? left.toFixed(1) : '';
      const kt = `cdt_${id}`;
      if (this.last[kt] !== v) {
        this.last[kt] = v;
        const cdt = this.one(`.slot[data-sk="${id}"] .cdt`);
        /* 0.1초마다 바뀌는 재사용 초는 캔버스(레이아웃 없음) */
        if (cdt) this.pendB.set(this.cnum(cdt), [v, ver]);
      }
      void s;
    }
  }
  private fitAt = 0;
  /** 폰 가로: 첫 줄이 넘치면 .tight(밸런스계약 막대 빼기·사용자수 막대 줄이기) → .tight2(사용자수 막대 빼기). 글자 길이가 바뀔 때만, 0.4초에 한 번 */
  private fitRow(): void {
    if (this.modeNow !== 'flat') return;
    const now = performance.now();
    if (now - this.fitAt < 400) return;
    this.fitAt = now;
    const r1 = this.one('.lhud .r1');
    if (!r1) return;
    const before = r1.className;
    r1.classList.remove('tight', 'tight2');
    if (r1.scrollWidth > r1.clientWidth + 1) r1.classList.add('tight');
    if (r1.scrollWidth > r1.clientWidth + 1) r1.classList.add('tight2');
    if (r1.className !== before) bumpHudVersion();
  }
  private bossGhost = 1;
  /** 보스 전용 사업자 체력(HUD 가운데 큰 막대). null = 숨김 */
  setBoss(r: number | null, dt = 0.016): void {
    const box = this.one('[data-v="boss"]');
    if (!box) return;
    if (r === null) {
      if (this.last.boss !== 'off') {
        this.last.boss = 'off';
        box.classList.remove('on');
        this.bossGhost = 1;
        bumpHudVersion();
      }
      return;
    }
    if (this.last.boss !== 'on') {
      this.last.boss = 'on';
      box.classList.add('on');
      bumpHudVersion();
    }
    this.bossGhost = Math.max(r, this.bossGhost + (r - this.bossGhost) * Math.min(1, dt * 3));
    const fx = barX(r);
    const gx = barX(this.bossGhost);
    if (this.last.bossfl !== fx) {
      this.last.bossfl = fx;
      const fl = this.one('[data-v="bossfl"]');
      if (fl) fl.style.transform = fx;
    }
    if (this.last.bossgh !== gx) {
      this.last.bossgh = gx;
      const gh = this.one('[data-v="bossgh"]');
      if (gh) gh.style.transform = gx;
    }
    const pct = `${Math.max(0, Math.ceil(r * 1000) / 10).toFixed(1)}%`;
    if (this.last.bosspct !== pct) {
      this.last.bosspct = pct;
      const e = this.one('[data-v="bosspct"]');
      if (e) e.textContent = pct;
    }
  }
  fire(sk: string): void {
    restartClass(this.slots[sk] || null, 'fire');
  }
  portrait(kind: 'nod' | 'cheer'): void {
    for (const p of this.all('.lportrait')) {
      if (kind === 'cheer') {
        p.classList.add('pcOn');
        clearTimeout((p as unknown as { _t: number })._t);
        (p as unknown as { _t: number })._t = window.setTimeout(() => p.classList.remove('pcOn'), 800);
      }
      restartClass(p, kind, ['nod', 'cheer']);
    }
  }
  matchPop(): void {
    restartClass(this.one('[data-v="match"]'), 'pop');
  }
}

/*
 * HUD 알약 크기가 바뀌면(숫자 자릿수·글자 길이 — 후반엔 초당 몇 번) ResizeObserver 로 안다. 그 콜백은 브라우저가 레이아웃을 막 끝낸 때라
 * 거기서 재면 강제 레이아웃이 없다 — 예전에는 폭이 바뀔 때마다 HUD 배치 버전을 올려 다음 프레임 안에서 getBoundingClientRect 로 다시 쟀음(프레임 안 강제 레이아웃).
 * 코인 도착 자리(앵커)는 여기서 새로 재고, 영업 지도 쪽(숫자가 비킬 HUD 자리)은 onHudResize 로 받아 같이 잰다
 */
const hudResizeFns = new Set<() => void>();
let hudRO: ResizeObserver | null = null;
function hudObserver(): ResizeObserver | null {
  if (hudRO || typeof ResizeObserver === 'undefined') return hudRO;
  hudRO = new ResizeObserver(() => {
    const now = performance.now();
    for (const id of Array.from(anchorCache.keys())) measureAnchor(id as HudId, now);
    for (const fn of hudResizeFns) {
      try {
        fn();
      } catch {
        /* 무시 */
      }
    }
  });
  return hudRO;
}
/** HUD 알약 크기가 바뀐 직후(레이아웃이 끝난 때) 부를 함수. 반환 = 떼기 */
export function onHudResize(fn: () => void): () => void {
  hudResizeFns.add(fn);
  return () => hudResizeFns.delete(fn);
}

/**
 * 보이는 HUD 요소 중 id 를 가진 것의 fxTop 좌표. 코인마다 querySelectorAll·getBoundingClientRect 하지 않게
 * HUD 배치 버전이 같으면 3초 동안 캐시(설계서 7장 3).
 */
const anchorCache = new Map<string, { v: number; at: number; p: { x: number; y: number } | null; els: HTMLElement[] }>();
function anchorEntry(id: HudId): { v: number; at: number; p: { x: number; y: number } | null; els: HTMLElement[] } {
  const now = performance.now();
  const hit = anchorCache.get(id);
  /* 배치 버전이 같으면 3초까지 그대로(다시 잴 때마다 offsetParent·getBoundingClientRect 가 강제 레이아웃) */
  if (hit && hit.v === hudVer && now - hit.at < 3000) return hit;
  return measureAnchor(id, now);
}
function measureAnchor(id: HudId, now: number): { v: number; at: number; p: { x: number; y: number } | null; els: HTMLElement[] } {
  let p: { x: number; y: number } | null = null;
  const els: HTMLElement[] = [];
  for (const e of Array.from(document.querySelectorAll<HTMLElement>(`[data-hud="${id}"]`))) {
    if (e.offsetParent === null) continue;
    els.push(e);
    if (!p) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) p = domToFx(e.querySelector('img.ic') || e);
    }
  }
  const ent = { v: hudVer, at: now, p, els };
  anchorCache.set(id, ent);
  return ent;
}
export function anchorOf(id: HudId): { x: number; y: number } | null {
  const p = anchorEntry(id).p;
  return p ? { x: p.x, y: p.y } : null;
}
export function bumpAnchor(id: HudId): void {
  for (const e of anchorEntry(id).els) bump(e);
}

/** 매 프레임 표시값 따라가기 */
export function tickDisplay(dt: number): void {
  if (!dispInit) snapDisplay();
  const k = Math.min(1, dt * 7);
  const step = (cur: number, real: number) => {
    const n = cur + (real - cur) * k;
    /* 거의 다 따라왔으면(1 미만 또는 화면 자릿수보다 작은 1만분의 1) 맞춰 붙임 — 끝없이 따라가며 루프가 잠들지 못하는 일 없게 */
    return Math.abs(real - n) < Math.max(1, Math.abs(real) * 1e-4) ? real : n;
  };
  disp.gmv = step(disp.gmv, S.gmv);
  disp.revenue = step(disp.revenue, S.revenue);
  disp.tech = step(disp.tech, S.tech);
  if (disp.revenue > S.revenue) disp.revenue = S.revenue;
  if (disp.tech > S.tech) disp.tech = S.tech;
}
export const statMaxText = () => `영업력 ${STAT_MAX.sales} · 기술력 ${STAT_MAX.tech}`;
void E;
/** 표시값이 아직 실제 값을 따라가는 중인지(루프가 잠들지 않게) */
export function displayBusy(): boolean {
  return disp.gmv !== S.gmv || disp.revenue !== S.revenue || disp.tech !== S.tech;
}
