/**
 * HUD(DOM): 사무실 좌상단(레벨·재화·영업력/기술력·고객사/제휴점·힌트) + 우상단 메뉴 원, 영업 HUD(타이머·매칭·결제 대기·대표 초상·스킬 슬롯).
 * 숫자는 표시값 += (실제 − 표시값) × min(1, dt × 7) 로 따라 올라가고, 오르면 알약이 1.14배 튄다.
 */
import { CHAR_BY, DISTRICT_BY, SKILLS, SKILL_ORDER, TARGET_BY, type SkillId } from '../game/data';
import { fmt } from '../game/format';
import { E, lvPowerMult, nextMasteryUnlock, skillUnlocked, statLevels, STAT_MAX, xpNeed } from '../game/rules';
import { S } from '../game/state';
import type { HudId } from '../game/fx/top';
import { domToFx } from '../game/core/stage';
import { $, $$, bump, el, img } from './dom';

/** 표시값 */
export const disp = { gmv: 0, revenue: 0, point: 0, net: 0 };
let dispInit = false;
export function snapDisplay(): void {
  disp.gmv = S.gmv;
  disp.revenue = S.revenue;
  disp.point = S.point;
  dispInit = true;
}

const MENU: { tab: string; icon: string; name: string }[] = [
  { tab: 'tree', icon: 'ic.tab_tree', name: '성장 트리' },
  { tab: 'reps', icon: 'ic.tab_reps', name: '영업 대표' },
  { tab: 'dex', icon: 'ic.tab_dex', name: '도감' },
  { tab: 'items', icon: 'ic.tab_items', name: '영업 아이템' },
  { tab: 'skills', icon: 'ic.tab_skills', name: '영업 스킬' },
];

function curPill(id: 'gmv' | 'revenue' | 'point', gain = false): string {
  const cls = id === 'gmv' ? 'gmv' : id === 'revenue' ? 'rev' : 'pt';
  const ic = id === 'gmv' ? 'ic.gmv' : id === 'revenue' ? 'ic.revenue' : 'ic.point';
  const lab = id === 'gmv' ? '누적 식대 거래액' : id === 'revenue' ? '매출' : '대장포인트';
  return `<div class="cur ${cls} pe" data-hud="hud.${id}" title="${lab}">${img(ic)}<b data-v="${id}">0</b>${gain ? `<span class="gain" data-g="${id}"></span>` : ''}</div>`;
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
  readonly bl: HTMLElement;
  private last: Record<string, string> = {};
  onLevelTap: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = el('div', 'scr', '');
    this.root.id = 'office';
    this.hud = el(
      'div',
      'hud',
      `<div class="row">${lvlPill()}<div class="hint pe clickable" data-v="hint" data-a="level"></div></div>
       <div class="row">${curPill('gmv')}${curPill('revenue')}${curPill('point')}</div>
       <div class="row"><div class="chip sales pe" data-hud="hud.sales">${img('ic.sales')}영업력 <b data-v="sales">Lv 0</b></div>
         <div class="chip tech pe" data-hud="hud.tech">${img('ic.tech')}기술력 <b data-v="tech">Lv 0</b></div>
         <div class="chip net pe" data-hud="hud.net">${img('ic.corp')}고객사 <b data-v="netc">0</b>곳 · ${img('ic.store')}제휴점 <b data-v="netr">0</b>곳</div></div>`,
    );
    this.menu = el(
      'div',
      'menu',
      MENU.map((m, i) => `<button class="mb tw" data-tab="${m.tab}" aria-label="${m.name}">${img(m.icon)}<span class="dot"></span><span class="tip">${i + 1} ${m.name}</span></button>`).join('') +
        `<button class="mb fs tw" data-a="fs" aria-label="전체화면">${img('ic.fullscreen')}<span class="tip">F 전체화면</span></button>`,
    );
    this.panel = el('div', 'panel', `<div class="body"></div>`);
    this.body = $(this.panel, '.body')!;
    this.treeHead = el('div', 'treehead', '');
    this.panel.appendChild(this.treeHead);
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
    const port = document.getElementById('ui')!.classList.contains('port');
    if (port && this.menu.parentElement !== this.hud) this.hud.appendChild(this.menu);
    if (!port && this.menu.parentElement !== this.root) this.root.insertBefore(this.menu, this.panel);
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
  }
  setAlerts(a: Record<string, boolean>): void {
    for (const b of $$(this.menu, '.mb[data-tab]')) b.classList.toggle('alert', !!a[b.dataset.tab!]);
  }
  setFullscreen(on: boolean): void {
    const b = $(this.menu, '[data-a="fs"]');
    if (b) b.innerHTML = `${img(on ? 'ic.fullscreenExit' : 'ic.fullscreen')}<span class="tip">F 전체화면</span>`;
  }
  renderDistrict(): void {
    const d = DISTRICT_BY[S.district];
    this.dist.innerHTML = `${img('ic.pin')}<span>${d.name}<small>${modLine(d.mod)}</small></span>`;
    this.fitBottom();
  }

  update(): void {
    const root = this.root;
    const set = (k: string, v: string) => {
      if (this.last[k] === v) return false;
      const had = this.last[k] !== undefined;
      this.last[k] = v;
      const e = $(root, `[data-v="${k}"]`);
      if (e) e.textContent = v;
      return had;
    };
    set('lv', String(S.lv));
    const need = xpNeed(S.lv);
    const fill = $(root, '[data-v="xpfill"]');
    if (fill) fill.style.width = `${Math.min(100, (S.xp / need) * 100)}%`;
    set('xptxt', `${fmt(S.xp)} / ${fmt(need)}`);
    if (set('gmv', fmt(disp.gmv))) bump($(root, '.cur.gmv'));
    if (set('revenue', fmt(disp.revenue))) bump($(root, '.cur.rev'));
    if (set('point', fmt(disp.point))) bump($(root, '.cur.pt'));
    const st = statLevels();
    set('sales', `Lv ${st.sales}`);
    set('tech', `Lv ${st.tech}`);
    if (set('netc', fmt(S.netC))) bump($(root, '.chip.net'));
    set('netr', fmt(S.netR));
    set('hint', hintText());
  }
}

export function modLine(mod: Record<string, number>): string {
  const parts: string[] = [];
  if (mod.spawn) parts.push(`대상 +${Math.round(mod.spawn * 100)}%`);
  if (mod.storeBias) parts.push(`식당 ×${mod.storeBias}`);
  if (mod.corpBias) parts.push(`기업 ×${mod.corpBias}`);
  if (mod.bigBias) parts.push(`대형 ×${mod.bigBias}`);
  if (mod.gmv) parts.push(`거래액 +${Math.round(mod.gmv * 100)}%`);
  if (mod.chest) parts.push(`선물 +${Math.round(mod.chest * 100)}%`);
  if (mod.point) parts.push(`P +${Math.round(mod.point * 100)}%`);
  if (mod.xp) parts.push(`경험치 +${Math.round(mod.xp * 100)}%`);
  if (mod.rare) parts.push(`희귀 +${Math.round(mod.rare * 100)}%`);
  if (mod.dark) parts.push('야근 모드');
  /* 항목 안("P +40%")에서는 줄이 갈리지 않게 줄바꿈 없는 공백(nbsp)으로, 항목 사이(·)에서만 줄바꿈 */
  return parts.map((t) => t.replace(/ /g, '\u00a0')).join(' · ') || '기본 상권';
}

export function hintText(): string {
  const nu = nextMasteryUnlock(S.lv);
  if (nu) return `Lv.${nu.masteryLv} → ${nu.name} 관리 열림`;
  return `설득력 +${Math.round((lvPowerMult(S.lv) - 1) * 100)}%`;
}
/** 레벨 설명 바: 다음 거래처 관리는 옆 힌트 알약에 있어 여기서는 뺀다 */
export function levelInfo(): { title: string; desc: string } {
  const need = xpNeed(S.lv);
  return {
    title: `레벨 ${S.lv}`,
    desc: `설득력 ×${lvPowerMult(S.lv).toFixed(2)} · 다음 레벨까지 경험치 ${fmt(Math.max(0, need - S.xp))}`,
  };
}

/* ── 영업 HUD ── */
export class LunchHud {
  readonly root: HTMLElement;
  readonly endBtn: HTMLButtonElement;
  readonly fsBtn: HTMLButtonElement;
  private slots: Record<string, HTMLElement> = {};
  private last: Record<string, string> = {};
  gain = { gmv: 0, revenue: 0, point: 0 };

  constructor(parent: HTMLElement) {
    this.root = el('div', 'scr', '');
    this.root.id = 'lunch';
    const curRow = (g: boolean) => `${curPill('gmv', g)}${curPill('revenue', g)}${curPill('point', g)}`;
    this.root.innerHTML = `
      <div class="lhud">
        <div class="r1">${lvlPill()}${curRow(true)}<div class="sp"></div><div class="timer" data-v="timer">${img('ic.timer')}<span data-v="tt">15.0</span></div></div>
        <div class="r2x">${curRow(true)}</div>
        <div class="r2">
          <div class="match" data-v="match">${img('ic.corp')}<span data-v="mc">0</span> : ${img('ic.store')}<span data-v="mr">0</span><span class="mm" data-v="mm">매칭 ×1.00</span><div class="mb2"><i data-v="mbar"></i></div></div>
          <div class="pend" data-v="pend" data-hud="hud.pending" style="display:none">${img('ic.pending')}<span data-v="pendt">결제 대기</span></div>
          <div class="sp"></div><div class="brk"></div>
          <div class="dname" data-v="dname"></div>
          <button class="mb fs tw lfs" data-a="fs" aria-label="전체화면">${img('ic.fullscreen')}</button>
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
    const st = document.createElement('style');
    st.textContent = `#ui.land .portP { display:none; } #ui.port .portL { display:none; }`;
    document.head.appendChild(st);
  }

  private modeNow = '';
  /**
   * 폰 세로: 상권 이름·전체화면 버튼은 지도 위를 가리지 않게 아래 띠 왼쪽(사무실로 버튼과 같은 줄)으로.
   * 낮은 가로 화면(폰 가로): 매칭·결제 대기 알약을 첫 줄(재화 알약 오른쪽)로 올림 — 두 줄이면 지도 맨 윗줄 부지를 덮음.
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
  }
  begin(total: number): void {
    this.place();
    this.gain = { gmv: 0, revenue: 0, point: 0 };
    this.last = {};
    const d = DISTRICT_BY[S.district];
    const dn = $(this.root, '[data-v="dname"]');
    if (dn) dn.innerHTML = `${img('ic.pin')}${d.name}<span data-v="spd"></span>`;
    const rep = CHAR_BY[S.rep] || CHAR_BY.bear;
    for (const p of $$(this.root, '.lportrait')) p.innerHTML = img(`c.${rep.id}@idle`, '');
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
    const e = $(this.root, '[data-v="tt"]');
    if (e) e.textContent = v;
    const t = $(this.root, '[data-v="timer"]');
    t?.classList.toggle('low', left <= 5 && left > 0);
  }
  setSpeed(sp: number): void {
    const e = $(this.root, '[data-v="spd"]');
    if (e) e.textContent = sp !== 1 ? ` ×${sp}` : '';
  }
  update(lunch: { cN: number; rN: number; M: number; matchStep: number; cd: Record<string, number>; lacking(): 'corp' | 'store' | null; cooldown(id: SkillId): number }): void {
    this.place();
    const set = (k: string, v: string) => {
      if (this.last[k] === v) return false;
      const had = this.last[k] !== undefined;
      this.last[k] = v;
      for (const e of $$(this.root, `[data-v="${k}"]`)) e.textContent = v;
      return had;
    };
    set('lv', String(S.lv));
    const need = xpNeed(S.lv);
    for (const f of $$(this.root, '[data-v="xpfill"]')) f.style.width = `${Math.min(100, (S.xp / need) * 100)}%`;
    set('xptxt', `${fmt(S.xp)} / ${fmt(need)}`);
    if (set('gmv', fmt(disp.gmv))) for (const e of $$(this.root, '.cur.gmv')) bump(e);
    if (set('revenue', fmt(disp.revenue))) for (const e of $$(this.root, '.cur.rev')) bump(e);
    if (set('point', fmt(disp.point))) for (const e of $$(this.root, '.cur.pt')) bump(e);
    const g = (k: 'gmv' | 'revenue' | 'point') => {
      const v = this.gain[k] > 0 ? '+' + fmt(this.gain[k]) : '';
      if (this.last['g' + k] === v) return;
      this.last['g' + k] = v;
      for (const e of $$(this.root, `[data-g="${k}"]`)) e.textContent = v;
    };
    g('gmv');
    g('revenue');
    g('point');
    set('mc', String(lunch.cN));
    set('mr', String(lunch.rN));
    set('mm', `매칭 ×${lunch.M.toFixed(2)}`);
    const steps = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    const i = Math.min(steps.length - 2, lunch.matchStep);
    const lo = steps[i];
    const hi = steps[i + 1];
    const bar = $(this.root, '[data-v="mbar"]');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, ((lunch.M - lo) / (hi - lo)) * 100))}%`;
    const lack = lunch.lacking();
    const lk = lack || '';
    if (this.last.lack !== lk) {
      this.last.lack = lk;
      const m = $(this.root, '[data-v="match"]');
      $(m!, '.need')?.remove();
      if (lack && m) {
        const icons = $$(m, 'img.ic');
        const target = lack === 'corp' ? icons[0] : icons[1];
        const left = target ? target.offsetLeft : 4;
        m.insertAdjacentHTML('beforeend', img('ic.arrowUp', 'need', `style="left:${left}px"`));
      }
    }
    const pend = $(this.root, '[data-v="pend"]');
    if (pend) {
      const show = S.pendG > 0;
      pend.style.display = show ? '' : 'none';
      if (show) set('pendt', `결제 대기 ${fmt(S.pendG)}원`);
    }
    this.fitRow();
    for (const id of SKILL_ORDER) {
      const s = this.slots[id];
      if (!skillUnlocked(id)) continue;
      const cdTotal = lunch.cooldown(id);
      const left = Math.max(0, lunch.cd[id]);
      const cdv = $(s, '.cdv');
      const cdt = $(s, '.cdt');
      if (cdv) cdv.style.height = `${Math.min(100, (left / cdTotal) * 100)}%`;
      if (cdt) {
        const v = left > 0.05 ? left.toFixed(1) : '';
        if (cdt.textContent !== v) cdt.textContent = v;
      }
    }
  }
  private fitAt = 0;
  /** 폰 가로: 첫 줄이 넘치면 .tight(매칭 막대 빼기·경험치 막대 줄이기) → .tight2(경험치 막대 빼기). 0.4초에 한 번만 잼 */
  private fitRow(): void {
    if (this.modeNow !== 'flat') return;
    const now = performance.now();
    if (now - this.fitAt < 400) return;
    this.fitAt = now;
    const r1 = $(this.root, '.lhud .r1');
    if (!r1) return;
    r1.classList.remove('tight', 'tight2');
    if (r1.scrollWidth > r1.clientWidth + 1) r1.classList.add('tight');
    if (r1.scrollWidth > r1.clientWidth + 1) r1.classList.add('tight2');
  }
  private bossGhost = 1;
  /** 보스 전용 설득 게이지(HUD 가운데 큰 막대). null = 숨김 */
  setBoss(r: number | null, dt = 0.016): void {
    const box = $(this.root, '[data-v="boss"]');
    if (!box) return;
    if (r === null) {
      if (this.last.boss !== 'off') {
        this.last.boss = 'off';
        box.classList.remove('on');
        this.bossGhost = 1;
      }
      return;
    }
    if (this.last.boss !== 'on') {
      this.last.boss = 'on';
      box.classList.add('on');
    }
    this.bossGhost = Math.max(r, this.bossGhost + (r - this.bossGhost) * Math.min(1, dt * 3));
    const fl = $(box, '[data-v="bossfl"]');
    const gh = $(box, '[data-v="bossgh"]');
    if (fl) fl.style.width = `${(r * 100).toFixed(2)}%`;
    if (gh) gh.style.width = `${(this.bossGhost * 100).toFixed(2)}%`;
    const pct = `${Math.max(0, Math.ceil(r * 1000) / 10).toFixed(1)}%`;
    if (this.last.bosspct !== pct) {
      this.last.bosspct = pct;
      const e = $(box, '[data-v="bosspct"]');
      if (e) e.textContent = pct;
    }
  }
  fire(sk: string): void {
    const s = this.slots[sk];
    if (!s) return;
    s.classList.remove('fire');
    void s.offsetWidth;
    s.classList.add('fire');
  }
  portrait(kind: 'nod' | 'cheer'): void {
    for (const p of $$(this.root, '.lportrait')) {
      if (kind === 'cheer') {
        const rep = CHAR_BY[S.rep] || CHAR_BY.bear;
        p.innerHTML = img(`c.${rep.id}@cheer`, '');
        clearTimeout((p as unknown as { _t: number })._t);
        (p as unknown as { _t: number })._t = window.setTimeout(() => (p.innerHTML = img(`c.${rep.id}@idle`, '')), 800);
      }
      p.classList.remove('nod', 'cheer');
      void p.offsetWidth;
      p.classList.add(kind);
    }
  }
  matchPop(): void {
    const m = $(this.root, '[data-v="match"]');
    if (!m) return;
    m.classList.remove('pop');
    void m.offsetWidth;
    m.classList.add('pop');
  }
}

/** 보이는 HUD 요소 중 id 를 가진 것의 fxTop 좌표 */
export function anchorOf(id: HudId): { x: number; y: number } | null {
  const list = document.querySelectorAll(`[data-hud="${id}"]`);
  for (const e of Array.from(list)) {
    const r = (e as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (e as HTMLElement).offsetParent !== null) {
      const ic = e.querySelector('img.ic');
      return domToFx(ic || e);
    }
  }
  return null;
}
export function bumpAnchor(id: HudId): void {
  for (const e of Array.from(document.querySelectorAll(`[data-hud="${id}"]`))) if ((e as HTMLElement).offsetParent !== null) bump(e);
}

/** 매 프레임 표시값 따라가기 */
export function tickDisplay(dt: number): void {
  if (!dispInit) snapDisplay();
  const k = Math.min(1, dt * 7);
  const step = (cur: number, real: number) => {
    const n = cur + (real - cur) * k;
    return Math.abs(real - n) < 1 ? real : n;
  };
  disp.gmv = step(disp.gmv, S.gmv);
  disp.revenue = step(disp.revenue, S.revenue);
  disp.point = step(disp.point, S.point);
  if (disp.revenue > S.revenue) disp.revenue = S.revenue;
  if (disp.point > S.point) disp.point = S.point;
}
export const statMaxText = () => `영업력 최대 Lv ${STAT_MAX.sales} · 기술력 최대 Lv ${STAT_MAX.tech}`;
void E;
