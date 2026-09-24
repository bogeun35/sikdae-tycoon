/**
 * 한국식 숫자 (참치 타이쿤 fmt 그대로): 1만 미만은 콤마, 그 위는 두 단위까지.
 *   1만 8,500 · 4,200만 · 34억 · 1조 2,300억 · 49억 9,902만
 */
const UNITS = ['', '만', '억', '조', '경', '해', '자', '양', '구'];

const comma = (n: number) => {
  const s = String(Math.floor(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 0) return '-' + fmt(-n);
  n = Math.floor(n);
  if (n < 10000) return comma(n);
  const u = Math.floor(Math.log10(n) / 4);
  if (u >= UNITS.length) return n.toExponential(2).replace('+', '');
  const p = Math.pow(10, u * 4);
  const head = Math.floor(n / p);
  const rest = Math.floor((n % p) / Math.pow(10, (u - 1) * 4));
  if (head >= 1000 || rest === 0) return comma(head) + UNITS[u];
  return head + UNITS[u] + ' ' + comma(rest) + (u >= 2 ? UNITS[u - 1] : '');
}

/** 금액: "1만 8,500원" */
export const won = (n: number) => fmt(n) + '원';

/** 트리 칸 값 표기 */
export function fmtVal(f: string, ef: string, v: number): string {
  if (f === 'p') return `+${Math.round(v * 1000) / 10}%`;
  if (f === 'q') return `+${Math.round(v * 100) / 100}%p`;
  if (f === 's') return `${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}초`;
  if (f === 'w') return `+${fmt(v)}원`;
  if (f === 'x') return `+${Math.round(v * 100) / 100}`;
  if (f === 'n') {
    if (ef === 'pflat') return `+${Math.round(v * 100)}%`;
    if (ef === 'crowd' || ef === 'fps' || ef === 'refN') return `+${fmt(v)}곳`;
    return `+${fmt(v)}`;
  }
  return '';
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`;
  return `${m}분`;
}

export function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}
