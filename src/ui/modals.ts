/**
 * 모달: 정산(N영업일이 지났습니다) · 엔딩 · 상권 선택 · 확인(두 단계 초기화 등). alert/confirm/prompt 는 쓰지 않는다.
 */
import { CHAR_BY, DISTRICTS, ITEM_BY, TARGETS, TARGET_BY, UNLOCK_NODE, type DistrictId } from '../game/data';
import { sfx } from '../game/deps';
import { fmt, fmtTime, won } from '../game/format';
import { E, districtUnlocked, statLevels } from '../game/rules';
import { S } from '../game/state';
import type { RunStats } from '../game/lunch/logic';
import { $, $$, el, iconUri, img, srcAttr } from './dom';
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
  modal.classList.remove('show');
  box.innerHTML = '';
  box.className = 'box';
  onEsc = null;
  onEnter = null;
}
function open(html: string, cls = ''): void {
  box.className = 'box ' + cls;
  box.innerHTML = html;
  modal.classList.add('show');
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
      n.textContent = pre + fmt(v * e) + suf;
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
  for (const n of $$(root, '[data-count]')) {
    const final = (n.dataset.pre || '') + fmt(Number(n.dataset.count)) + (n.dataset.suf || '');
    const was = n.textContent;
    n.textContent = final;
    n.style.fontSize = '';
    const box = n.parentElement as HTMLElement | null;
    let fs = parseFloat(getComputedStyle(n).fontSize) || 20;
    const over = () => n.scrollWidth > n.clientWidth + 1 || (!!box && box.scrollWidth > box.clientWidth + 1);
    for (let i = 0; i < 30 && fs > 12 && over(); i++) {
      fs -= 1;
      n.style.fontSize = fs + 'px';
    }
    n.textContent = was;
  }
}

export interface SettleOpts {
  stats: RunStats;
  /** 누적 영업일 = S.runs(이번 판 포함, 저장 유지) */
  runNo: number;
  districtName: string;
  onAgain: () => void;
  onOffice: () => void;
}
export function settleModal(o: SettleOpts): void {
  const s = o.stats;
  const st = statLevels();
  const lvUp = S.lv - s.lvFrom;
  const best = s.best;
  const newT = s.newSeen.map((id) => TARGET_BY[id]).filter(Boolean);
  const items = s.newItems.map((id) => ITEM_BY[id]).filter(Boolean);
  /* 이번 판 레벨업으로 새로 열린 거래처 관리(영업 중에는 토스트를 띄우지 않고 여기 모음) */
  const mast = TARGETS.filter((t) => t.masteryLv > s.lvFrom && t.masteryLv <= S.lv).sort((a, b) => a.masteryLv - b.masteryLv);
  const mastLine = mast.length ? `<div class="pendline mastline">${img('ic.mastery')}<span>거래처 관리 열림 · ${mast.slice(0, 3).map((t) => t.name).join('·')}${mast.length > 3 ? `&nbsp;외&nbsp;${mast.length - 3}곳` : ''}</span></div>` : '';
  /* 선물 상자·인바운드 문의 매출: 해금됐거나 이번 판에 받았으면 줄을 둔다(합계 = 수수료 + 이용료 + 이 줄) */
  const showBonus = s.bonus > 0 || E.chest > 0 || E.inquiry > 0;
  /* 제목 = 누적 영업일. 누적 식대 거래액·고객사/제휴점 수는 위 HUD 와 계약 칸에 있어 여기서는 빼고, 요율 풀이는 설정 > 어떻게 하나요에만 */
  const html = `
    <h2>${img('ic.contracts')}${fmt(o.runNo)}영업일이 지났습니다</h2>
    <div class="sub">${o.districtName}</div>
    <div class="bd"><div class="cols"><div class="col">
    <div class="bigline"><div class="lab">${img('ic.gmv')}식대 거래액</div><b data-count="${Math.floor(s.gmv)}" data-pre="+" data-suf="원">+0원</b></div>
    <div class="res rev">
      <div>${img('ic.ef_comm')}수수료 매출<b data-count="${Math.floor(s.comm)}" data-pre="+" data-suf="원">+0원</b></div>
      <div>${img('ic.ef_fee')}이용료 매출<b data-count="${Math.floor(s.fee)}" data-pre="+" data-suf="원">+0원</b></div>
      ${showBonus ? `<div class="bonus">${img('ic.chest')}<span class="bl2">선물·문의 매출</span><b data-count="${Math.floor(s.bonus)}" data-pre="+" data-suf="원">+0원</b></div>` : ''}
    </div>
    <div class="sumline">${img('ic.revenue')}매출 합계 <b data-count="${Math.floor(s.rev)}" data-pre="+" data-suf="원">+0원</b></div>
    <div class="res c3">
      <div>${img('ic.contracts')}계약<b data-count="${s.count}" data-suf="곳">0곳</b><span class="note">고객사 ${fmt(s.corps)} · 제휴점 ${fmt(s.stores)}</span></div>
      <div>${img('ic.xp')}경험치<b data-count="${Math.floor(s.xp)}" data-pre="+">+0</b></div>
      <div>${img('ic.point')}대장포인트<b data-count="${s.point}" data-pre="+">+0</b></div>
    </div>
    </div><div class="col">
    <div class="res">
      <div>${img('ic.match')}최고 매칭<b>×${s.bestM.toFixed(2)}</b></div>
      <div>${img('ic.crit')}대박 계약<b>${fmt(s.crits)}번</b></div>
    </div>
    ${mastLine}
    ${S.pendG > 0 ? `<div class="pendline">${img('ic.pending')}결제 대기 ${won(S.pendG)} · ${S.netC > 0 ? '제휴점' : '고객사'} 계약하면 풀려요</div>` : ''}
    ${best ? `<div class="dealcard"><div class="art">${img(`t.${best.t.id}@happy`, '')}</div><div class="t">${img('ic.best')} 가장 큰 계약<br><b>${best.t.name}</b><br><span class="g">${won(best.gmv)}</span></div></div>` : ''}
    ${items.length || newT.length ? `<div class="minis">${items.map((it) => `<div class="dealcard"><div class="art">${img(`i.${it.id}`, '')}</div><div class="t">${img('ic.newItem')} 새 아이템<br><b>${it.name}</b><br>${it.u}</div></div>`).join('')}${newT.map((t) => `<div class="dealcard"><div class="art">${img(`t.${t.id}@idle`, '')}</div><div class="t">${img('ic.plus')} 새 거래처<br><b>${t.name}</b></div></div>`).join('')}</div>` : ''}
    </div></div>
    <div class="foot"><span>${img('ic.sales')}영업력 Lv ${st.sales}</span><span>${img('ic.tech')}기술력 Lv ${st.tech}</span><span>${img('ic.level')}레벨 ${S.lv}${lvUp > 0 ? ` (+${lvUp})` : ''}</span></div>
    </div>
    <div class="btns"><button class="btn green tw" data-a="again">${img('ic.play')}다음 영업일</button><button class="btn light tw" data-a="office">${img('ic.office')}사무실로</button></div>`;
  open(html, 'settle');
  fitCounts(box);
  sfx('settle_open');
  countUp(box, () => {
    sfx('settle_total');
    const sum = $(box, '.sumline');
    if (sum) {
      sum.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    }
    const big = $(box, '.bigline b');
    big?.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
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
       <div>누적 식대 거래액<b>${won(S.gmv)}</b></div><div>누적 매출<b>${won(S.revTotal)}</b></div>
     </div>
     <div class="btns"><button class="btn green tw" data-a="ok">${img('ic.play')}계속 영업하기</button></div>`,
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
        return `<div class="dcard ${d.id === S.district ? 'on' : ''} ${un ? '' : 'lock'}" data-d="${d.id}"><img class="th" ${srcAttr(thumb(d.id))} alt=""><div class="nm">${img(`ic.dist_${d.id}`)}${d.name}</div><div class="ds">${un ? nbNote(d.note) : `${img('ic.lock')} 성장 트리: ${node ? node.name : ''}`}</div><div class="ds" style="color:#a08a6a">${un ? modLine(d.mod) : ''}</div></div>`;
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
  return (CHAR_BY[S.rep] || CHAR_BY.bear).name;
}
