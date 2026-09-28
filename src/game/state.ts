/**
 * 저장 상태. 키 = formulas.SAVE_KEY (sikdae_tycoon_v4, storage.ts 가 sikdae-tycoon: 접두어를 붙임).
 * 불러오기 = fresh() 위에 저장본을 깊게 병합. treeVer 가 다르면 옛 트리를 비우고 쓴 매출·기술력을 돌려준다.
 * v4(2026-09-27) = 재화 두 개(매출 · 기술력, 옛 포인트 재화 삭제)·반경 축소·잠김·해금 순서 비용. 옛 키(v3·v2) 저장은
 * 읽지 않고 새로 시작한다(재화·반경·비용 단위가 전부 바뀌어 옛 진행을 옮기면 폭주·막힘). 화면 설정만 옮기고 한 번 알림.
 * 저장 코드 가져오기도 ver 가 다르면 받지 않는다.
 */
import { storage } from '../storage';
import { F, TREE_BY, type DistrictId } from './data';

export interface Settings {
  reduceShake: boolean;
  mergeNumbers: boolean;
  /** 화질: auto(기기·프레임으로 자동) · high · normal · low (설계서 7장) */
  quality: 'auto' | 'high' | 'normal' | 'low';
  /** 프레임 상한: 0 = 자동(폰 30 · 데스크톱 60) · 30 · 60 */
  fps: number;
  /** auto 가 낮춘 등급(올리는 건 설정에서 '자동'을 다시 고를 때만). '' = 기기 등급 그대로 */
  autoTier: string;
}

/** 가장 큰 계약: 기준 = 그 계약 매출(rev). gmv 는 같은 계약의 거래액 */
export interface BestDeal { id: string; gmv: number; rev: number }

export interface SaveState {
  ver: number;
  treeVer: number;
  /** 보유 매출(쓰는 재화 1: 영업 가지·공통 칸·기본 역량·거래처 관리) */
  revenue: number;
  /** 보유 기술력(쓰는 재화 2: 기술 가지·영업 스킬·아이템 강화) */
  tech: number;
  /** 누적 거래액 — 절대 줄지 않음 */
  gmv: number;
  /** 누적 매출(번 것 전부) */
  revTotal: number;
  /** 누적 기술력(번 것 전부) */
  techTotal: number;
  /** 누적 수수료 / 이용료 */
  commTotal: number;
  feeTotal: number;
  xp: number;
  lv: number;
  tree: Record<string, number>;
  /** 옛 트리 비용 합(이관 환불용) — 매출 · 기술력 */
  treeSpent: number;
  treeSpentTech: number;
  base: { power: number; radius: number };
  /** 스킬 칸 레벨: key = skillId + slotIndex */
  sk: Record<string, number>;
  items: Record<string, number>;
  mastery: Record<string, number>;
  counts: Record<string, number>;
  gmvBy: Record<string, number>;
  /** 대상별 누적 매출(그 계약의 수수료 + 이용료) */
  revBy: Record<string, number>;
  seen: Record<string, number>;
  rep: string;
  reps: Record<string, number>;
  district: DistrictId;
  /** 누적 영업일(한 판 = 1영업일, 판 끝에 +1 · 정산 모달 "N영업일이 지났습니다") */
  runs: number;
  /** 플레이 시간(초) */
  play: number;
  best: BestDeal | null;
  /** 고객사·제휴점 수 = 누적 계약 수 (기업 / 식당) */
  netC: number;
  netR: number;
  /** 결제 대기(반대편이 0곳일 때) */
  pendG: number;
  pendC: number;
  /** 엔딩 본 판 번호(0 = 아직) */
  ending: number;
  savedAt: number;
  started: number;
  /** 튜토리얼 안내를 본 적 있는지 */
  tutorial: number;
  settings: Settings;
}

export function fresh(): SaveState {
  return {
    ver: F.SAVE.ver,
    treeVer: F.SAVE.treeVer,
    revenue: 0,
    tech: 0,
    gmv: 0,
    revTotal: 0,
    techTotal: 0,
    commTotal: 0,
    feeTotal: 0,
    xp: 0,
    lv: 1,
    tree: {},
    treeSpent: 0,
    treeSpentTech: 0,
    base: { power: 0, radius: 0 },
    sk: {},
    items: {},
    mastery: {},
    counts: {},
    gmvBy: {},
    revBy: {},
    seen: {},
    rep: 'bear',
    reps: { bear: 1 },
    district: 'euljiro',
    runs: 0,
    play: 0,
    best: null,
    netC: 0,
    netR: 0,
    pendG: 0,
    pendC: 0,
    ending: 0,
    savedAt: 0,
    started: Date.now(),
    tutorial: 0,
    settings: { reduceShake: false, mergeNumbers: true, quality: 'auto', fps: 0, autoTier: '' },
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
/** base 위에 src 를 깊게 덮어씀(타입이 다른 값은 버림) */
function deepMerge<T>(base: T, src: unknown): T {
  if (!isObj(src) || !isObj(base)) return base;
  const out = base as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    const sv = src[k];
    const bv = out[k];
    if (bv === undefined) {
      out[k] = sv;
    } else if (bv === null) {
      out[k] = sv;
    } else if (isObj(bv) && isObj(sv)) {
      out[k] = deepMerge(bv, sv);
    } else if (typeof bv === typeof sv && !isObj(bv)) {
      if (typeof sv === 'number' && !Number.isFinite(sv)) continue;
      out[k] = sv;
    } else if (isObj(bv) && sv === null) {
      /* 기본값 유지 */
    } else if (bv !== null && sv !== null && typeof bv === 'object' && typeof sv === 'object') {
      out[k] = sv;
    }
  }
  return base;
}

export let S: SaveState = fresh();
let migrateToast = '';
/** 옛 키 알림을 이미 보였는지(초기화 뒤에 다시 뜨지 않게) */
const OLD_NOTE_KEY = F.SAVE_KEY + '_oldnote';

/** 옛 키(v3·v2) 저장: 진행은 버리고 화면 설정만 옮김. 알림은 처음 한 번 */
function fromOldKeys(): SaveState {
  const st = fresh();
  for (const k of F.SAVE.old || []) {
    const old = storage.load<unknown>(k, null);
    if (!isObj(old)) continue;
    const os = old.settings;
    if (isObj(os)) {
      if (typeof os.reduceShake === 'boolean') st.settings.reduceShake = os.reduceShake;
      if (typeof os.mergeNumbers === 'boolean') st.settings.mergeNumbers = os.mergeNumbers;
      /* 옛 화질은 '고'가 기본값이라 직접 고른 '저'만 옮김(나머지는 새 기본 '자동') */
      if (os.quality === 'low') st.settings.quality = 'low';
    }
    if (!storage.load<number>(OLD_NOTE_KEY, 0)) migrateToast = '새 버전이라 처음부터 시작해요';
    break;
  }
  return st;
}

export function loadGame(): boolean {
  migrateToast = '';
  const raw = storage.load<unknown>(F.SAVE_KEY, null);
  if (!isObj(raw) || raw.ver !== F.SAVE.ver) {
    S = fromOldKeys();
    return false;
  }
  const st = deepMerge(fresh(), raw);
  if (st.treeVer !== F.SAVE.treeVer) {
    /* 옛 트리 → 비우고 쓴 매출·기술력 전액 환불 */
    st.tree = {};
    st.revenue += st.treeSpent || 0;
    st.tech += st.treeSpentTech || 0;
    st.treeSpent = 0;
    st.treeSpentTech = 0;
    st.treeVer = F.SAVE.treeVer;
    migrateToast = '성장 트리가 새로 바뀌어 쓴 재화를 돌려드렸어요';
  }
  /* 사라진 칸 정리 */
  for (const id of Object.keys(st.tree)) if (!TREE_BY[id]) delete st.tree[id];
  if (!st.reps[st.rep]) st.rep = 'bear';
  st.reps.bear = 1;
  S = st;
  return true;
}

export function takeMigrateToast(): string {
  const t = migrateToast;
  migrateToast = '';
  if (t) storage.save(OLD_NOTE_KEY, 1);
  return t;
}

export function hasSave(): boolean {
  const raw = storage.load<unknown>(F.SAVE_KEY, null);
  return isObj(raw) && typeof raw.runs === 'number' && raw.ver === F.SAVE.ver;
}

export function saveGame(): void {
  S.savedAt = Date.now();
  storage.save(F.SAVE_KEY, S);
}

export function resetGame(): void {
  storage.remove(F.SAVE_KEY);
  S = fresh();
}

export function replaceState(st: SaveState): void {
  S = deepMerge(fresh(), st);
}

export function exportCode(): string {
  const json = JSON.stringify(S);
  return btoa(unescape(encodeURIComponent(json)));
}

/** 저장 코드 가져오기: 'ok' · 'old'(이전 버전 코드 — 받지 않음) · 'bad' */
export function importCode(code: string): 'ok' | 'old' | 'bad' {
  try {
    const v = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!isObj(v) || typeof v.revenue !== 'number') return 'bad';
    if (v.ver !== F.SAVE.ver) return typeof v.ver === 'number' && v.ver < F.SAVE.ver ? 'old' : 'bad';
    S = deepMerge(fresh(), v);
    saveGame();
    return 'ok';
  } catch {
    return 'bad';
  }
}
