/**
 * 모달: 정산(N영업일이 지났습니다) · 엔딩 · 상권 선택 · 확인(두 단계 초기화 등). alert/confirm/prompt 는 쓰지 않는다.
 */
import { CHAR_BY, DISTRICTS, ITEM_BY, TARGETS, TARGET_BY, UNLOCK_NODE, type DistrictId } from '../game/data';
import { sfx } from '../game/deps';
import { fmt, fmtAll, fmtTime, shown, won } from '../game/format';
import { districtUnlocked } from '../game/rules';
import { S } from '../game/state';
import type { RunStats } from '../game/lunch/logic';
import { $, $$, el, iconUri, img, imgFast, nb, srcAttr, warmIcons } from './dom';
import { modLine } from './hud';

let modal: HTMLElement;
let box: HTMLElement;
let onEsc: (() => void) | null = null;
let onEnter: (() => void) | null = null;

export function mountModal(root: HTMLElement): void {
  modal = el('div', 'modal', '<div class="box"></div>');
  box = $(modal, '.box')!;
  root.appendChild(modal);
  modal.addEventListener('pointerdown', (e) => {
    if (e.target === modal && onEsc) onEsc();
  });
}
export function modalOpen(): boolean {
  return modal.classList.contains('show');
}
export function hideModal(): void {
  openSeq++;
  modal.classList.remove('show');
  document.body.classList.remove('modal-on');
  box.innerHTML = '';
  box.className = 'box';
  onEsc = null;
  onEnter = null;
}
/** 모달을 열 때마다 +1(나눠 여는 정산 모달이 그 사이 닫히거나 다른 모달로 바뀌었는지 보려고) */
let openSeq = 0;
function open(html: string, cls = ''): void {
  openSeq++;
  box.className = 'box ' + cls;
  box.innerHTML = html;
  modal.classList.add('show');
  document.body.classList.add('modal-on');
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
}
export function modalKey(key: 'esc' | 'enter'): boolean {
  if (!modalOpen()) return false;
  if (key === 'esc' && onEsc) {
    onEsc();
    return true;
  }
  if (key === 'enter' && onEnter) {
    onEnter();
    return true;
  }
  return true;
}

/** 확인 창 */
export function confirmBox(title: string, msg: string, okText: string, onOk: () => void, danger = false): void {
  open(
    `<h2>${img(danger ? 'ic.warn' : 'ic.help')}${title}</h2><p>${msg}</p><div class="btns"><button class="btn light tw" data-a="no">취소</button><button class="btn ${danger ? '' : 'green'} tw" data-a="ok">${okText}</button></div>`,
    'confirm',
  );
  const no = () => {
    hideModal();
  };
  $(box, '[data-a="no"]')?.addEventListener('click', no);
  $(box, '[data-a="ok"]')?.addEventListener('click', () => {
    hideModal();
    onOk();
  });
  onEsc = no;
  onEnter = null;
}

/** 숫자 0 → 값 (0.8초) */
function countUp(root: HTMLElement, done: () => void): void {
  const nodes = $$(root, '[data-count]');
  const t0 = performance.now();
  const dur = 800;
  let lastTick = 0;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    for (const n of nodes) {
      const v = Number(n.dataset.count);
      const pre = n.dataset.pre || '';
      const suf = n.dataset.suf || '';
      n.textContent = pre + (n.dataset.fmt === 'all' ? fmtAll : fmt)(v * e) + suf;
    }
    const now = performance.now();
    if (now - lastTick > 45 && k < 1) {
      lastTick = now;
      sfx('settle_count');
    }
    if (k < 1) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}

/**
 * 정산 숫자가 칸보다 길면 한 줄에 들어가게 글자를 줄인다(폰 세로에서 "+912억 8,345만 / 원"처럼 쪼개지지 않게).
 * 올라가기 전에 마지막 값으로 재고, 다시 +0 으로 돌려놓는다.
 */
function fitCounts(root: HTMLElement): void {
  /*
   * 한 번에 쓰고 한 번에 재서(레이아웃 1~2번) 줄일 비율을 구함 — 칸마다 1px 씩 줄이며 재던 것(칸마다 레이아웃 최대 30번, 폰 4배 느림에서
   * 정산 창이 뜰 때 200ms 넘게 멈춤)을 없앰(설계서 7장 3)
   */
  const ns = $$(root, '[data-count]');
  const was = ns.map((n) => n.textContent);
  for (const n of ns) {
    n.textContent = (n.dataset.pre || '') + (n.dataset.fmt === 'all' ? fmtAll : fmt)(Number(n.dataset.count)) + (n.dataset.suf || '');
    n.style.fontSize = '';
  }
  const need = (n: HTMLElement): number => {
    const box = n.parentElement as HTMLElement | null;
    const sw = n.scrollWidth;
    let k = sw > n.clientWidth + 1 ? n.clientWidth / sw : 1;
    if (box && box.scrollWidth > box.clientWidth + 1 && sw > 0) k = Math.min(k, Math.max(0.3, (sw - (box.scrollWidth - box.clientWidth) - 2) / sw));
    return k;
  };
  const sizes = ns.map((n) => parseFloat(getComputedStyle(n).fontSize) || 20);
  const ks = ns.map(need);
  let left: number[] = [];
  ns.forEach((n, i) => {
    if (ks[i] >= 1) return;
    sizes[i] = Math.max(12, Math.floor(sizes[i] * ks[i]));
    n.style.fontSize = sizes[i] + 'px';
    left.push(i);
  });
  /* 글자 폭이 글자 크기에 딱 비례하지 않아 모자라면 1px 씩 더(대개 0~1번) */
  for (let r = 0; r < 4 && left.length; r++) {
    const still = left.filter((i) => sizes[i] > 12 && need(ns[i]) < 1);
    for (const i of still) ns[i].style.fontSize = --sizes[i] + 'px';
    left = still;
  }
  ns.forEach((n, i) => (n.textContent = was[i]));
}

export interface SettleOpts {
  stats: RunStats;
  /** 누적 영업일 = S.runs(이번 판 포함, 저장 유지) */
  runNo: number;
  districtName: string;
  onAgain: () => void;
  onOffice: () => void;
}
/** 정산 모달에 쓰는 작은 아이콘(사무실 여유 시간에 미리 불러 둠 — warmSettleIcons) */
const SETTLE_ICONS = ['ic.contracts', 'ic.revenue', 'ic.ef_comm', 'ic.ef_fee', 'ic.chest', 'ic.tech', 'ic.match', 'ic.xp', 'ic.crit', 'ic.gmv', 'ic.mastery', 'ic.pending', 'ic.best', 'ic.newItem', 'ic.plus', 'ic.level', 'ic.play', 'ic.office'];
/** 정산 모달 아이콘을 미리 불러 둠(첫 정산 때 아이콘마다 SVG 문서를 만드는 일이 한 작업에 몰리지 않게). 여러 번 불러도 한 번만 */
export function warmSettleIcons(): void {
  warmIcons(SETTLE_ICONS);
}
/**
 * 첫 정산 모달 미리 배치(사무실 여유 시간): 보이지 않는 복사본을 같은 자리에 두고 두 번에 나눠 배치 — 처음 쓰는 글자 크기·글자 모양 잡기(한글 글꼴)가
 * 첫 정산을 보일 때 한 번에 몰려 폰 4배 느림에서 긴 작업(150~400ms)이 되던 것. 복사본은 첫 정산이 열릴 때까지 두었다가 지움(글자 캐시가 남게)
 */
let settleWarmEl: HTMLElement | null = null;
let settleDone = false;
export function warmSettleLayout(): void {
  if (settleWarmEl || settleDone || !modal?.parentElement) return;
  const t = TARGETS[0];
  const zero = { gmv: 0, comm: 0, fee: 0, rev: 0, xp: 0, tech: 0, count: 0, cN: 0, rN: 0, corps: 0, stores: 0, bonus: 0, bonusChest: 0, bonusInq: 0, bestM: 1, crits: 0, netC0: 0, netR0: 0, pendN: 0, released: false, bossSigned: false, misses: 0, salesLv: 0, techLv: 0 };
  const stats = { ...zero, best: t ? { t, gmv: 123456789, rev: 1234567 } : null, boss: null, newItems: [], newSeen: [], lvFrom: S.lv } as unknown as RunStats;
  const html = settleHtml({ stats, runNo: S.runs + 1, districtName: '상권', onAgain: () => {}, onOffice: () => {} });
  /* 'show' 는 붙이지 않음(검수 도구가 '.modal.show .box.settle' 로 정산 모달을 찾음) — 보이기만 인라인으로 */
  const wrap = el('div', 'modal');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'display:flex;visibility:hidden;pointer-events:none;z-index:-1;animation:none';
  const b = el('div', 'box settle', html);
  b.style.animation = 'none';
  const cols = $$(b, '.col');
  const later = cols.slice(1);
  for (const c of later) c.style.display = 'none';
  wrap.appendChild(b);
  settleWarmEl = wrap;
  setTimeout(() => {
    if (settleWarmEl !== wrap) return;
    modal.parentElement?.appendChild(wrap);
    void b.getBoundingClientRect();
    setTimeout(() => {
      if (settleWarmEl !== wrap) return;
      for (const c of later) c.style.display = '';
      void b.getBoundingClientRect();
    }, 150);
  }, 150);
}
/** 정산 모달의 큰 그림(대상·아이템): 열린 뒤 한 장씩 채움(아래 settleModal) */
const artImg = (key: string) => `<img class="" data-art="${key}" alt="" draggable="false">`;
/**
 * 정산 모달은 나눠서 연다(설계서 7장 — 폰 4배 느림에서 한 번에 열면 400ms 넘는 긴 작업 하나였음):
 *  1) 안 보이는 채로 HTML 만 넣음(글자 해석)  2) 다음 프레임에 보이기(스타일·배치)  3) 숫자 칸 맞추기 · 올라가기 시작
 *  4) 큰 그림(대상·아이템 SVG — 그림 만들기·해석이 가장 무거움)을 한 장씩. 보이는 결과는 같고, 그림이 한두 프레임 늦게 뜰 뿐
 */
function openStaged(html: string, cls: string, onShown: () => void): void {
  openSeq++;
  modal.classList.remove('show');
  document.body.classList.remove('modal-on');
  box.style.animation = '';
  box.className = 'box ' + cls;
  box.innerHTML = html;
  const seq = openSeq;
  const alive = () => seq === openSeq;
  requestAnimationFrame(() => {
    if (!alive()) return;
    modal.classList.add('show');
    document.body.classList.add('modal-on');
    setTimeout(() => {
      if (!alive()) return;
      onShown();
      const arts = $$<HTMLImageElement>(box, 'img[data-art]');
      const next = (i: number) => {
        if (!alive() || i >= arts.length) return;
        const im = arts[i];
        im.src = iconUri(im.dataset.art || '');
        im.removeAttribute('data-art');
        setTimeout(() => next(i + 1), 34);
      };
      setTimeout(() => next(0), 34);
    }, 0);
  });
}
/** 정산 모달 HTML(settleModal · warmSettleLayout 이 같이 씀) */
function settleHtml(o: SettleOpts): string {
  const s = o.stats;
  const lvUp = S.lv - s.lvFrom;
  /* 보스 계약한 날은 보스를 '전국 계약'으로(같은 날 대박 난 그룹 본사가 더 클 수 있어 '가장 큰 계약'이 트윈타워가 아닐 수 있음) */
  const best = s.boss || s.best;
  const bestLab = s.boss ? '전국 계약' : '가장 큰 계약';
  const newT = s.newSeen.map((id) => TARGET_BY[id]).filter(Boolean);
  const items = s.newItems.map((id) => ITEM_BY[id]).filter(Boolean);
  /* 이번 판 레벨업으로 새로 열린 거래처 관리(영업 중에는 토스트를 띄우지 않고 여기 모음) */
  const mast = TARGETS.filter((t) => t.masteryLv > s.lvFrom && t.masteryLv <= S.lv).sort((a, b) => a.masteryLv - b.masteryLv);
  const mastLine = mast.length ? `<div class="pendline mastline">${imgFast('ic.mastery')}<span>거래처 관리 열림 · ${mast.slice(0, 3).map((t) => t.name).join('·')}${mast.length > 3 ? `&nbsp;외&nbsp;${mast.length - 3}곳` : ''}</span></div>` : '';
  /* 선물 상자·인바운드 문의 매출: 이번 판에 받았을 때만 줄을 둔다(+0원 줄은 띄우지 않음. 합계 = 수수료 + 이용료 + 이 줄) */
  const showBonus = Math.floor(s.bonus) >= 1;
  /* 합계는 화면에 보이는 세 값(두 단위 아래 버림)을 더한 값. 합계는 아랫단위를 버리지 않고 표기(fmtAll) — 보이는 항목을 더하면 합계와 맞게 */
  const sumShown = shown(s.comm) + shown(s.fee) + (showBonus ? shown(s.bonus) : 0);
  /* 제목 = 누적 영업일. 순서(설계서 1장): 매출 합계(가장 큼) → 수수료·이용료 → 기술력(둘째) → 계약·밸런스계약 → 식대 거래액(작은 줄).
     고객사/제휴점 수는 계약 칸 아래에, 요율 풀이는 설정 > 어떻게 하나요에만 */
  const html = `
    <h2>${imgFast('ic.contracts')}${fmt(o.runNo)}영업일이 지났습니다</h2>
    <div class="sub">${o.districtName}</div>
    <div class="bd"><div class="cols"><div class="col">
    <div class="bigline"><div class="lab">${imgFast('ic.revenue')}매출 합계</div><b data-count="${sumShown}" data-fmt="all" data-pre="+" data-suf="원">+0원</b></div>
    <div class="res rev">
      <div>${imgFast('ic.ef_comm')}수수료 매출<b data-count="${Math.floor(s.comm)}" data-pre="+" data-suf="원">+0원</b></div>
      <div>${imgFast('ic.ef_fee')}이용료 매출<b data-count="${Math.floor(s.fee)}" data-pre="+" data-suf="원">+0원</b></div>
      ${showBonus ? `<div class="bonus">${imgFast('ic.chest')}<span class="bl2">선물·문의 매출</span><b data-count="${Math.floor(s.bonus)}" data-pre="+" data-suf="원">+0원</b></div>` : ''}
    </div>
    <div class="techline">${imgFast('ic.tech')}<span class="lb">기술력</span><b data-count="${Math.floor(s.tech)}" data-pre="+">+0</b></div>
    </div><div class="col">
    <div class="res">
      <div>${imgFast('ic.contracts')}계약<b data-count="${s.count}" data-suf="건">0건</b><span class="note">${nb(`고객사 ${fmt(s.corps)} · 제휴점 ${fmt(s.stores)}`)}</span></div>
      <div>${imgFast('ic.match')}최고 밸런스계약<b>×${s.bestM.toFixed(2)}</b></div>
      <div>${imgFast('ic.xp')}사용자수<b data-count="${Math.floor(s.xp)}" data-pre="+">+0</b></div>
      <div>${imgFast('ic.crit')}대박 계약<b>${fmt(s.crits)}번</b></div>
    </div>
    <div class="gmvline">${imgFast('ic.gmv')}식대 거래액<b data-count="${Math.floor(s.gmv)}" data-pre="+" data-suf="원">+0원</b></div>
    ${mastLine}
    ${S.pendG > 0 ? `<div class="pendline">${imgFast('ic.pending')}결제 대기 ${won(S.pendG)} · ${S.netC > 0 ? '제휴점' : '고객사'} 계약하면 풀려요</div>` : ''}
    ${best ? `<div class="dealcard"><div class="art">${artImg(`t.${best.t.id}@happy`)}</div><div class="t">${imgFast('ic.best')} ${bestLab}<br><b>${best.t.name}</b><br><span class="g">매출 ${won(best.rev)}</span><br><small>거래액 ${won(best.gmv)}</small></div></div>` : ''}
    ${items.length || newT.length ? `<div class="minis">${items.map((it) => `<div class="dealcard"><div class="art">${artImg(`i.${it.id}`)}</div><div class="t">${imgFast('ic.newItem')} 새 아이템<br><b>${it.name}</b><br>${it.u}</div></div>`).join('')}${newT.map((t) => `<div class="dealcard"><div class="art">${artImg(`t.${t.id}@idle`)}</div><div class="t">${imgFast('ic.plus')} 새 거래처<br><b>${t.name}</b></div></div>`).join('')}</div>` : ''}
    </div></div>
    <div class="foot"><span>${imgFast('ic.level')}레벨 ${S.lv}${lvUp > 0 ? ` (+${lvUp})` : ''}</span></div>
    </div>
    <div class="btns"><button class="btn green tw" data-a="again">${imgFast('ic.play')}다음 영업일</button><button class="btn light tw" data-a="office">${imgFast('ic.office')}사무실로</button></div>`;
  return html;
}
export function settleModal(o: SettleOpts): void {
  settleDone = true;
  settleWarmEl?.remove();
  settleWarmEl = null;
  const html = settleHtml(o);
  openStaged(html, 'settle', () => {
    fitCounts(box);
    sfx('settle_open');
    countUp(box, () => {
      sfx('settle_total');
      const big = $(box, '.bigline');
      big?.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
      const tech = $(box, '.techline b');
      tech?.animate([{ transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 280, delay: 60, easing: 'ease-out' });
    });
  });
  const again = () => {
    hideModal();
    o.onAgain();
  };
  const office = () => {
    hideModal();
    o.onOffice();
  };
  $(box, '[data-a="again"]')?.addEventListener('click', again);
  $(box, '[data-a="office"]')?.addEventListener('click', office);
  onEnter = again;
  onEsc = office;
}

export function endingModal(onClose: () => void): void {
  const found = TARGETS.filter((t) => S.counts[t.id]).length;
  open(
    `<h2>${img('ic.best')}전국 계약 달성!</h2>
     <div class="art" style="height:190px;display:grid;place-items:center">${img('t.boss@happy', '', 'style="height:190px"')}</div>
     <p>대장그룹 트윈타워까지 계약했어요</p>
     <div class="res">
       <div>영업일<b>${fmt(S.runs)}일</b></div><div>레벨<b>${S.lv}</b></div>
       <div>도감<b>${found}/${TARGETS.length}</b></div><div>플레이 시간<b>${fmtTime(S.play)}</b></div>
       <div>누적 매출<b>${won(S.revTotal)}</b></div><div>누적 기술력<b>${fmt(S.techTotal)}</b></div>
       <div>누적 식대 거래액<b>${won(S.gmv)}</b></div>
     </div>
     <div class="btns"><button class="btn green tw" data-a="ok">${img('ic.contracts')}정산 보기</button></div>`,
    'ending',
  );
  const ok = () => {
    hideModal();
    onClose();
  };
  $(box, '[data-a="ok"]')?.addEventListener('click', ok);
  onEnter = ok;
  onEsc = ok;
}

/** 상권 설명: 수치(+220% · ×1.85 · 1.8배)는 앞 낱말과 붙여 줄바꿈 */
const nbNote = (s: string) => s.replace(/ (?=[+×\d])/g, '\u00a0');

const thumbCache: Record<string, string> = {};
function thumb(id: DistrictId): string {
  if (!thumbCache[id]) thumbCache[id] = iconUri(`m.${id}.ground@land`);
  return thumbCache[id];
}
export function districtModal(onPick: (id: DistrictId) => void): void {
  open(
    `<h2>${img('ic.pin')}상권 선택</h2><div class="sub">다음 영업일부터 적용돼요</div><div class="dgrid">` +
      DISTRICTS.map((d) => {
        const un = districtUnlocked(d.id);
        const node = UNLOCK_NODE[d.id];
        return `<div class="dcard ${d.id === S.district ? 'on' : ''} ${un ? '' : 'lock'}" data-d="${d.id}"><img class="th" ${srcAttr(thumb(d.id))} alt=""><div class="nm">${img(`ic.dist_${d.id}`)}${d.name}</div><div class="ds">${un ? nbNote(d.note) : `${img('ic.lock')} 스킬: ${node ? node.name : ''}`}</div><div class="ds" style="color:#a08a6a">${un ? modLine(d.mod) : ''}</div></div>`;
      }).join('') +
      `</div><div class="btns" style="margin-top:12px"><button class="btn light tw" data-a="close">닫기</button></div>`,
    'distpick',
  );
  for (const c of $$(box, '.dcard')) {
    c.addEventListener('click', () => {
      const id = c.dataset.d as DistrictId;
      if (!districtUnlocked(id)) {
        sfx('ui_error');
        return;
      }
      sfx('district_select');
      hideModal();
      onPick(id);
    });
  }
  const close = () => hideModal();
  $(box, '[data-a="close"]')?.addEventListener('click', close);
  onEsc = close;
}

export function repName(): string {
  return (CHAR_BY.lion || CHAR_BY.bear).name;
}
