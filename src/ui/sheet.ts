/**
 * 하단 설명 바: [아이콘] [제목 / 설명] [가격 + 두 줄]. 가격 자리 상태 5가지(원작 그대로):
 *  살 수 있음 = 초록 "두 번 누르면 구매!" / 재화 부족 = 빨강 가격 + "매출 부족"(기술력 부족 · 매출·기술력 부족) / 이웃 미보유 = 회색 "연결된 칸 먼저" / 최대 = 보라 "최대" / 잠김 = 회색 자물쇠 + 조건 문구("먼저: 칸 이름")
 *  보유 매출·기술력은 위 HUD 에 늘 있어서 여기엔 되풀이하지 않고, 모자란 액수도 가격과 겹쳐서 빼고 "부족" 만.
 *  가격은 재화 아이콘(매출 = 동전, 기술력 = 톱니)으로 어느 재화로 사는지 보여 준다.
 *  제목 옆 chips = 효과 종류 칩(설계서 6장, 카드·트리 칸과 같은 칩).
 */
import { fmt } from '../game/format';
import { lackOf, payable, type Cost } from '../game/rules';
import { img } from './dom';

export type SheetState = 'buy' | 'max' | 'link' | 'lock' | 'none';
export type { Cost };

export class Sheet {
  constructor(readonly el: HTMLElement) {
    let startY: number | null = null;
    el.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('[data-sheet-close]')) {
        e.preventDefault(); e.stopPropagation(); this.hide();
      }
    });
    el.addEventListener('pointerdown', e => {
      if (!(e.target as HTMLElement).closest('[data-sheet-drag]')) return;
      startY = e.clientY; el.setPointerCapture(e.pointerId); e.stopPropagation();
    });
    el.addEventListener('pointerup', e => {
      if (startY !== null && e.clientY - startY > 40) this.hide();
      startY = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener('pointercancel', () => { startY = null; });
  }
  private cur: (() => void) | null = null;

  show(icon: string, name: string, desc: string, o: { cost?: Cost | null; state?: SheetState; lockText?: string; extra?: string; sub?: string; okText?: string; chips?: string } = {}): void {
    const iconHtml = icon.startsWith('<') ? icon : img(icon, '');
    const own = '';
    let right = o.extra || '';
    const st = o.state || (o.cost ? 'buy' : 'none');
    if (st === 'max') right = `<span class="pz max"><span class="mxl">${img('ic.max', 'mxi')}최대</span>${own}</span>`;
    else if (st === 'link') right = `<span class="pz gray"><span class="grp">${o.cost ? costTxt(o.cost) : ''}</span><small class="hl">연결된 칸 먼저</small>${own}</span>`;
    else if (st === 'lock') right = `<span class="pz gray"><span class="grp">${img('ic.lock')}<small class="hl">${o.lockText || '잠김'}</small></span>${own}</span>`;
    else if (st === 'buy' && o.cost) {
      const c = o.cost;
      const ok = payable(c);
      right = `<span class="pz ${ok ? 'ok' : 'no'}"><span class="grp">${costTxt(c)}</span><small class="hl">${ok ? `${img('ic.doubleTap')} ${o.okText || '두 번 누르면 구매!'}` : `${lackOf(c)} 부족`}</small>${own}</span>`;
    }
    this.el.innerHTML = `<div class="sheet-grip" data-sheet-drag aria-hidden="true"><i></i></div><button class="sheet-close" data-sheet-close aria-label="상세창 닫기">×</button><div class="sic">${iconHtml}</div><div class="t"><div class="nm">${name}${o.sub ? `<small>${o.sub}</small>` : ''}</div><div class="ds">${o.chips || ''}<span class="effect-value">${desc}</span></div></div>${right}`;
    this.el.classList.add('show');
  }
  hide(): void {
    this.el.classList.remove('show');
    this.el.innerHTML = '';
    this.cur = null;
  }
  get shown(): boolean {
    return this.el.classList.contains('show');
  }
  /** 다시 그리기용 */
  bind(fn: (() => void) | null): void {
    this.cur = fn;
  }
  refresh(): void {
    this.cur?.();
  }
}

/** 가격: 매출 = 동전 아이콘, 기술력 = 톱니 아이콘(둘 다 있으면 둘 다) */
export function costTxt(c: Cost): string {
  /* 아이콘과 숫자가 줄바꿈으로 갈라지지 않게 묶음 */
  const parts: string[] = [];
  if (c.rev || !c.tech) parts.push(`<span class="nw">${img('ic.revenue')}자본 ${fmt(c.rev)}</span>`);
  if (c.tech) parts.push(`<span class="nw">${img('ic.tech')}기술력 ${fmt(c.tech)}</span>`);
  return parts.join(' ');
}
