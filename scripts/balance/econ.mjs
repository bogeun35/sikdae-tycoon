/**
 * 경제 수치 정본 — 대상 가치·트리 비용·공식 상수·잠김(req)·아이템 등급을 여기(SPEC)에서 정하고 src/data/gdd-data.json 에 써 넣는다.
 * 현재 JSON 값이 아니라 SPEC 에서만 계산하므로 몇 번을 돌려도 결과가 같다.
 *
 *   node scripts/balance/econ.mjs            적용 (gdd-data.json 덮어씀, 들여쓰기 1칸 형식 유지)
 *   node scripts/balance/econ.mjs --dry      적용하지 않고 바뀌는 항목 수만
 *   node scripts/balance/econ.mjs --table    대상 가치·거리별 첫 레벨 비용 표(마크다운)
 *   node scripts/balance/econ.mjs --check    잠김·시작 값 규칙 검사(설계서 4-1·4-3·4-4·2-6). 어긴 것이 있으면 종료 코드 1
 *
 * 경제 v4 (2026-09-27): 재화 두 개.
 *   매출 = 영업 가지(서쪽)·공통 칸·기본 역량·거래처 관리 / 기술력 = 기술 가지(동쪽)·영업 스킬·아이템 강화
 * 트리 비용 = 2자리 반올림( C1<재화>[거리] × 레벨 배율 LVM × (해금 칸이면 unlockMult) × 효과 배수 × 흔들림 ), 그 뒤 규칙으로 끌어올림:
 *   1) 가장 싼 경로에서 가장 가까운 같은 재화 앞 칸 첫 값 × stepMin 이상
 *   2) 선행 칸(req·reqAny)이 있으면 같은 재화 × reqMin, 다른 재화면 수입 배수(techPerRev)로 환산해 × reqMin 이상
 *   3) 1~ladderRings 고리의 같은 재화 레벨 값끼리 ladderStep 배 이상 떨어지게(한 영업일에 몰려 사지지 않게)
 * 예외는 special(레벨별 값 그대로, 규칙 3 만 받음)·상권 districtK. 모든 금액 단위는 원(매출)·기술력(정수).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 게임 데이터 정본. SIM_DATA 환경변수로 다른 파일(실험용 복사본)을 가리킬 수 있다 */
export const DATA_FILE = process.env.SIM_DATA || join(HERE, '..', '..', 'src', 'data', 'gdd-data.json');

/** 시뮬 묶음(rolldown)에서 게임 데이터 import 를 SIM_DATA 로 돌리는 플러그인 */
export function dataRedirect() {
  return {
    name: 'sim-data-redirect',
    resolveId(id) {
      if (process.env.SIM_DATA && /gdd-data.json$/.test(id)) return process.env.SIM_DATA;
      return null;
    },
  };
}
/** SIM_DATA 별로 다른 묶음 파일 이름(동시에 돌려도 서로 덮어쓰지 않게) */
export function bundleName(base) {
  if (!process.env.SIM_DATA) return base + '.mjs';
  let h = 0;
  for (const c of process.env.SIM_DATA) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${base}-${(h >>> 0).toString(36)}.mjs`;
}

/** 거래처 해금 칸(트윈타워 제외) — 아이템 등급 5~20 값 기준 */
const TGT_NODES = ['f_c03', 'f_r03', 'f_c04', 'f_r04', 'f_c05', 'f_r05', 'f_c06', 'f_r06', 'f_r07', 'f_c07', 'f_c08', 'f_r08', 'f_r09', 'f_c09', 'f_r10', 'f_c10'];

export const SPEC = {
  /** 대상 1곳 계약 규모(거래액, 원). 매칭·노하우·대박 전 기본값 */
  values: {
    c01: 20, r01: 60, c02: 80, r02: 120,
    c03: 2400, r03: 4000,
    c04: 16000, r04: 36000,
    c05: 80000, r05: 190000,
    r06: 420000, c06: 900000,
    r07: 1800000, c07: 3800000,
    c08: 11000000, r08: 26000000,
    r09: 75000000, c09: 264000000,
    r10: 480000000, c10: 1200000000,
    boss: 1600000000,
  },
  /** 대상 체력(설득에 드는 양). 여기 없는 대상은 데이터 값 그대로 */
  /* 트윈타워: 해금 무렵 하루에 줄 수 있는 설득(보통 봇 약 3.0~3.3억, 시뮬 bossDmg)보다 조금 많게 — 해금 뒤 10영업일 안팎(v3 보통 12영업일) */
  hp: { r01: 8, boss: 340000000 },
  /** 기본 거래액(gflat) 칸 레벨별 값(원) */
  gflat: {
    app: [100, 100, 100],
    base2: [800, 800, 800, 800],
    base3: [10000, 10000, 10000, 10000, 10000],
  },
  /** 그 밖의 칸 레벨별 효과 값(gflat 말고). 여기 없는 칸은 데이터 값 그대로 */
  vals: {
    match1: [0.2, 0.2, 0.2],
    match2: [0.25, 0.25, 0.25],
    match3: [0.3, 0.3, 0.3],
    /* 반경(설계서 0장): 발품 영업 Ⅰ·Ⅱ·Ⅲ +8%·+10%·+15%/레벨 */
    foot1: [0.08, 0.08, 0.08],
    foot2: [0.1, 0.1, 0.1],
    foot3: [0.15, 0.15, 0.15],
    /* 기술 축적 Ⅰ~Ⅲ(옛 대장포인트 적립): +4%/레벨 — 하루 기술력 ÷ 매출이 0.35~0.8 안에 있게(설계서 2-3) */
    pt1: [0.04, 0.04, 0.04, 0.04, 0.04],
    pt2: [0.04, 0.04, 0.04, 0.04, 0.04],
    pt3: [0.04, 0.04, 0.04, 0.04, 0.04],
    /* 수수료·이용료 정책 개선: +100% → +50%/레벨(매출만 오르는 칸이라 후반 기술력 비율이 무너지지 않게) */
    comm1: [0.5, 0.5, 0.5, 0.5, 0.5],
    fee1: [0.5, 0.5, 0.5, 0.5, 0.5],
  },
  tree: {
    /** 거리 d(중앙에서 맨해튼 거리)별 첫 레벨 비용 — 매출 칸(영업 가지·공통) · 기술력 칸(기술 가지) */
    C1rev: [100, 120, 450, 2200, 12000, 95000, 980000, 9100000, 41000000, 220000000, 1100000000, 3300000000, 8500000000, 230000000000, 1500000000000, 2100000000000],
    C1tech: [50, 60, 700, 1600, 2800, 19000, 77000, 7600000, 30000000, 290000000, 1800000000, 6400000000, 13000000000, 690000000000, 3000000000000, 6100000000000],
    LVM: { 1: [1], 3: [1, 2.5, 6], 4: [1, 2.5, 6, 12], 5: [1, 2.5, 6, 12, 24] },
    /** 거리 ≥ lateFrom 칸의 레벨 배율(후반 수입이 더 오르지 않는 구간 — 마지막 레벨이 수십 영업일치가 되지 않게) */
    lateFrom: 12,
    LVMlate: { 3: [1, 1.5, 2.2], 5: [1, 1.3, 1.7, 2.2, 2.8] },
    unlockMult: 1.2,
    /** 해금 칸(비용 × unlockMult) 효과 종류 */
    unlockEf: ['tgt', 'sk', 'cap', 'chest', 'inquiry', 'wom', 'hot', 'ref'],
    /** 효과 종류별 추가 배수: 센 효과는 비싸게·약한 효과는 싸게 */
    efMult: {
      /* 새 거래처 해금 칸 = 수입이 크게 뛰는 칸 — 고리 안에서 너무 뒤로 밀리지 않게 1.0 */
      tgt: 1.0,
      pflat: 1.5, gflat: 1.5, gmv: 1.5, all: 1.5, tv: 1.4, power: 1.4,
      xflat: 0.8, xp: 0.8, tech: 0.8, respawn: 0.85, disc: 0.85, cds: 0.85, dbl: 0.85, womC: 0.85, hotC: 0.85, refN: 0.85,
    },
    /** 같은 거리·같은 종류 칸이 같은 값으로 몰리지 않게 칸 id 로 정해지는 고정 흔들림: × e^(spread × (−1 ~ +1)) */
    spread: 0.2,
    /** 상권 칸 비용 = C1rev[거리] × districtK */
    districtK: 0.15,
    /** 해금 순서 규칙(설계서 4-2) */
    stepMin: 1.2,
    reqMin: 1.5,
    /** 해금 순서 사슬: [앞 칸, 뒤 칸, 배수] — 영업 스킬 해금 칸은 앞 스킬의 5배 이상(설계서 4-4, 스킬 첫 칸 = 해금 칸 × 0.5 라 칸 값도 5배) */
    chain: [['s_call', 's_promo', 5], ['s_promo', 's_rush', 5], ['s_rush', 's_qr', 5]],
    /** 재화 환산(다른 재화 선행 칸 비교용): 하루 기술력 ≈ 하루 매출 × techPerRev */
    techPerRev: 0.5,
    /** 사다리(설계서 8-5): 거리 ≤ ladderRings 칸의 모든 레벨(+ ladderExtra 칸)을 같은 재화끼리 오름차순으로 ladderStep 배 이상 떨어지게 */
    ladderRings: 1,
    ladderFirst: 2,
    ladderExtra: ['d_gangnam'],
    ladderStep: 1.3,
    ladderMix: true,
    /** 예외 칸: 배열 = 레벨별 비용 그대로 / { k } = 보통 공식 비용 × k */
    special: {
      /* 을지로 첫 두 고리(거리 0~2 첫 레벨, 1~20영업일): 매출·기술력 칸을 한 줄 사다리(ladderMix, 기술력 × 2 = 매출 환산)로 1.3배씩.
       * 여기 값은 순서를 정하는 밑값이고 간격은 사다리가 맞춤. 순서 = 첫 영업 개시 → 식권 앱·영업 교육 → 발품 영업 Ⅰ → 강남 진출 → 매칭 → … */
      start: [50, 500, 2800],
      log1: [110, 950, 3500],
      refer1: [160, 1800, 5000, 7000, 10000],
      edu1: [340],
      app: [120, 290, 700],
      foot1: [700, 1750, 4200],
      d_gangnam: [900],
      match1: [1300, 3250, 7800],
      pt1: [400, 1000, 2400, 4800, 9600],
      time1: [800, 2000, 4800],
      crowd2: [2000, 5000, 12000, 24000],
      tv23: [2400, 6000, 14400],
      gift1: [1600],
      card1: [4000],
      /* 첫 새 거래처(중소기업·푸드트럭) 칸: 22영업일 무렵(설계서 8-2 보통 22~32) */
      f_c03: { k: 1.2 },
      f_r03: { k: 1.2 },
      /* 첫 스킬(콜드콜) 칸: 새 거래처 칸 뒤(설계서 8-2 보통 20~30) */
      s_call: { k: 1.4 },
      f_r07: { k: 1.6 },
      f_c10: { k: 1.6 },
      f_boss: { k: 2.5 },
    },
  },
  /** 트리 칸 잠김(설계서 4-1): req = 전부 보유, reqAny = 하나 이상 보유 */
  req: {
    tv45: { reqAny: ['f_c03', 'f_r03'] },
    tv67: { reqAny: ['f_c04', 'f_r04'] },
    tv89: { reqAny: ['f_c05', 'f_r05'] },
    tv1011: { reqAny: ['f_r06', 'f_c06'] },
    tv1213: { reqAny: ['f_r07', 'f_c07'] },
    tv1415: { reqAny: ['f_c08', 'f_r08'] },
    cds_call: { req: ['s_call'] }, dbl_call: { req: ['s_call'] },
    cds_promo: { req: ['s_promo'] }, dbl_promo: { req: ['s_promo'] },
    cds_rush: { req: ['s_rush'] }, dbl_rush: { req: ['s_rush'] },
    cds_qr: { req: ['s_qr'] }, dbl_qr: { req: ['s_qr'] },
    womC: { req: ['wom'] }, hotC: { req: ['hot'] }, refN: { req: ['ref'] },
    gift2: { req: ['gift1'] }, gift3: { req: ['gift2'] }, gift4: { req: ['gift3'] }, gift5: { req: ['gift4'] },
    inq2: { req: ['inq1'] }, inq3: { req: ['inq2'] }, inq4: { req: ['inq3'] }, inq5: { req: ['inq4'] },
  },
  /** 아이템 등급(설계서 4-2): 효과가 센 것을 뒤로 */
  itemGrade: {
    it01: 1, it02: 2, it03: 3, it07: 4, it10: 5, it11: 6, it09: 7, it04: 8, it05: 9, it06: 10,
    it14: 11, it19: 12, it08: 13, it12: 14, it13: 15, it18: 16, it17: 17, it15: 18, it16: 19, it20: 20,
  },
  /** 데이터 안 글자·효과 키 바꾸기(대장포인트 → 기술력, 설계서 2-3) */
  patch: {
    tree: {
      pt1: { name: '기술 축적 Ⅰ', ef: 'tech', icon: 'ic.tech', lab: '기술력 +%' },
      pt2: { name: '기술 축적 Ⅱ', ef: 'tech', icon: 'ic.tech', lab: '기술력 +%' },
      pt3: { name: '기술 축적 Ⅲ', ef: 'tech', icon: 'ic.tech', lab: '기술력 +%' },
    },
    characters: {
      squirrel: { eff: { tech: 1, gmv: -0.3 }, sk: '기술력 +100% · 거래액 −30%', tip: '기술력 모으기' },
      hawk: { sk: '대박 +15% · 10곳마다 기술력' },
    },
    districts: { yeouido: { mod: { corpBias: 1.85, chest: 2.2, tech: 0.4 } } },
    items: {
      it09: { name: '기술 문서', k: 'tech', u: '기술력 +5%' },
      it18: { k: 'tech', u: '기술력 +5%' },
    },
    skillBonus: '계약 매출 +20%',
    /* 그림·소리 설명 글(화면에는 안 나옴) — 옛 재화 이름 정리 */
    text: {
      'icons.point': '옛 포인트 동전(지금 게임에서 안 씀) — 하늘색 동전에 흰 P',
      'audio.sfx.point_get.0': '기술력 획득',
    },
    spriteDesc: {
      'ic.point': '옛 포인트 동전(지금 게임에서 안 씀) — 하늘색 동전에 흰 P',
      'fx.point': '옛 포인트 동전(하늘 #6fd3f7, 흰 P path) — 지금 게임에서 안 씀',
    },
  },
  /** formulas 안 값 바꾸기: 'A.B.C' = 값 */
  formulas: {
    'ECON.COST_SCALE': 1.3,
    'ECON.VALUE_SCALE': 1.5,
    'CHEST.revMin': 20,
    'INQUIRY.revMin': 20,
    'MATCH.BASE_BONUS': 0.5,
    'MATCH.FIRST_BIAS': 2,
    /* 0장 반경: R₀ = 42 × U(가로 1.42 → 59.6px) */
    'DIST.radius': 42,
    /* 3장 기본 역량: 해금 칸 뒤에 열리고, 첫 값 = 해금 칸 첫 값 × costK, 레벨당 × growth */
    BASIC: {
      power: { unlock: 'edu1', costK: 2, growth: 1.75, mult: 1.08 },
      radius: { unlock: 'foot1', costK: 1.5, growth: 2.1, mult: 1.05, max: 30 },
    },
    /* 2장 기술력 버는 곳 */
    TECH: {
      store: 0.07, corp: 0.03, chestK: 12, chestMin: 20, inqK: 6, inqMin: 20, dupK: 3, dupMin: 10, per10K: 2,
      rule: '계약 1건 = 매칭 전 규모 G0 × 매칭 M × (식당 7% · 기업 3%) × (1 + 기술력 효과 + 상권). 결제 대기여도 계약 순간 바로. 선물 = max(20, 계약당 평균 기술력 × 12) × 0.8~1.4 × (1 + 0.6 × (등급 − 1)), 문의 = max(20, 평균 × 6) × 등급 × 0.8~1.3, 중복 아이템 = max(10, 평균 × 3), 매부장 = 10곳마다 평균 × 2',
    },
    /* 4장 영업 스킬(기술력): 칸 첫 값 = 그 스킬 해금 칸 첫 값 × slotK[칸], 레벨당 × growth */
    SKILL_COST: { slotK: [0.5, 0.8, 1.2, 3, 3.6], growth: 2.2 },
    /* 4장 아이템 강화(기술력): 등급 1~4 = 식권 앱 출시 첫 값 × baseK, 5~20 = 거래처 해금 칸 첫 값 오름차순 (k−4)번째 × tgtK, 앞 등급 × step 이상. 레벨당 × growth */
    'ITEM.baseK': [1, 1.2, 1.44, 1.73],
    'ITEM.tgtK': 0.3,
    'ITEM.step': 1.2,
    'ITEM.growth': 2.6,
    'ITEM.baseNode': 'app',
    'ITEM.tgtNodes': TGT_NODES,
    'ITEM.gradeMin': 4,
    /* 등급별 첫 값(설계서 4-4 기준 맞춤): 등급 1~4 = 식권 앱 출시 첫 값 × baseK(120·144·173·208), 5~20 = 보통·싼 칸 시뮬에서 그 등급이 열린 날 하루 기술력 × 1.5
       (run.mjs --itemcost 3 --k 1.5 로 다시 뽑음), 앞 등급 × 1.2 이상 */
    'ITEM.first': [120, 144, 173, 208, 1400, 2000, 780000, 940000, 16000000, 30000000, 110000000, 140000000, 1200000000, 3600000000, 18000000000, 22000000000, 110000000000, 2700000000000, 3300000000000, 6500000000000],
    /* 거래처 관리 = 매출만 */
    'MASTERY.costK': 13,
    'MASTERY.growth': 2.2,
    SAVE_KEY: 'sikdae_tycoon_v4',
    'SAVE.ver': 4,
    'SAVE.treeVer': 4,
    'SAVE.old': ['sikdae_tycoon_v3', 'sikdae_tycoon_v2'],
    'STATS.sales.name': '영업 가지',
    'STATS.tech.name': '기술 가지',
    'STATS.sales.rule': '트리 서쪽(영업 가지) 보유 레벨 합. 매출로 삼',
    'STATS.tech.rule': '트리 동쪽(기술 가지) 보유 레벨 합. 기술력으로 삼',
    'STATS.tech.gives': '새 기업·식당 해금(제품 기능)·영업 스킬·영업시간·선물 상자·기술 축적·수수료/이용료 매출·자동 영업',
  },
  /** formulas 에서 지울 키 */
  remove: [
    'ITEM.gold', 'ITEM.point', 'ITEM.dupPoint', 'MASTERY.point', 'CHEST.point', 'INQUIRY.point',
    'SKILL_COST.gold', 'SKILL_COST.slotStep', 'SKILL_COST.abilityGrowth', 'SKILL_COST.specialGold', 'SKILL_COST.point', 'SKILL_COST.specialPoint',
    'RUN.POINT_CHANCE_LOW', 'RUN.POINT_CHANCE_HIGH', 'RUN.POINT_HIGH_TIER', 'TREE.C1', 'TREE.districtCost',
  ],
  /** fx 안 값 바꾸기 */
  fx: {
    'number.magK': 0.7,
    'number.mag': 'log10(max(1, 거래액 ÷ (VALUE_SCALE 1.5 × 판 배율))) × magK 0.7. 1인 사무실 ≈ 1, 대장그룹 트윈타워 ≈ 6.3(옛 경제 눈금과 같게 맞춤). 판 배율 = 영업 시작 때의 (1 + 트리 gmv + 대표·아이템 gmv + 상권 gmv) — 판 안에서는 고정. 배율을 빼서 대상 규모·노하우·매칭·대박 차이만 남김. 크기 = (base + min(maxAdd, perMag × mag)) × logicalK × (대박 crit) × (보스 boss)',
    'eventText.point': ['기술력 +N', '#9fe9ff', 22],
    'eventText.per10': ['기술력 +N', '#9fe9ff', 22],
    'coinFly.target.point': 'hud.tech',
  },
};

/** 2자리 유효숫자 반올림(100 미만은 정수) */
export function round2(x) {
  if (!(x > 0)) return 0;
  if (x < 100) return Math.max(1, Math.round(x));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}
/** 2자리 유효숫자 올림(규칙으로 끌어올린 값이 반올림으로 다시 규칙 밑으로 내려가지 않게) */
export function ceil2(x) {
  if (!(x > 0)) return 0;
  if (x < 100) return Math.max(1, Math.ceil(x - 1e-9));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.ceil(x / p - 1e-9) * p;
}

/** 칸 id → 0~1 고정값(FNV-1a) */
export function idHash(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** 칸을 사는 재화: 기술 가지 = 기술력, 영업 가지·공통 = 매출 */
export const nodeCur = (n) => (n.br === 'tech' ? 'tech' : 'rev');

/** 규칙 전 기본 비용 */
export function baseCosts(n, T = SPEC.tree) {
  const sp = T.special[n.id];
  if (Array.isArray(sp)) return sp.slice();
  const C1 = nodeCur(n) === 'tech' ? T.C1tech : T.C1rev;
  if (n.ef === 'district') return [round2(T.C1rev[n.d] * T.districtK * (sp && sp.k ? sp.k : 1))];
  const lvm = (T.lateFrom != null && n.d >= T.lateFrom && (T.LVMlate || {})[n.max]) || T.LVM[n.max] || [1];
  const j = T.spread && n.ef !== 'tgt' ? Math.exp(T.spread * (idHash(n.id) * 2 - 1)) : 1;
  const k = (T.unlockEf.includes(n.ef) ? T.unlockMult : 1) * ((T.efMult || {})[n.ef] || 1) * (sp ? sp.k : 1) * j;
  return lvm.map((m) => round2(C1[n.d] * m * k));
}

/** 매출 단위로 환산한 첫 값(가장 싼 경로 찾기용) */
const revUnits = (n, c, T) => (nodeCur(n) === 'tech' ? c / T.techPerRev : c);

/** 가장 싼 경로(첫 값 합, 매출 단위) 부모 */
export function cheapestParents(tree, costs, T = SPEC.tree) {
  const by = Object.fromEntries(tree.map((n) => [n.id, n]));
  const dist = { start: 0 };
  const parent = { start: null };
  const done = new Set();
  const order = [];
  for (;;) {
    let u = null;
    for (const id in dist) if (!done.has(id) && (u === null || dist[id] < dist[u])) u = id;
    if (u === null) break;
    done.add(u);
    order.push(u);
    for (const v of by[u].link) {
      if (!by[v] || done.has(v)) continue;
      const w = dist[u] + revUnits(by[v], costs[v][0], T);
      if (dist[v] === undefined || w < dist[v]) {
        dist[v] = w;
        parent[v] = u;
      }
    }
  }
  return { parent, order, dist };
}

/** 선행 칸 첫 값 기준(reqAny = 가장 싼 것, req = 가장 비싼 것) → 이 칸 재화 단위 하한 */
function reqFloor(n, costs, by, T) {
  const r = n.reqAny || n.req;
  if (!r || !r.length) return 0;
  const conv = (m) => {
    const c = costs[m.id][0];
    const same = nodeCur(m) === nodeCur(n);
    if (same) return c;
    return nodeCur(n) === 'rev' ? c / T.techPerRev : c * T.techPerRev;
  };
  const vals = r.map((id) => conv(by[id]));
  const base = n.reqAny ? Math.min(...vals) : Math.max(...vals);
  return base * T.reqMin;
}

/** 모든 칸 비용(규칙 1~3 적용). tree 에는 req·reqAny 가 붙어 있어야 함 */
export function allTreeCosts(tree, T = SPEC.tree) {
  const by = Object.fromEntries(tree.map((n) => [n.id, n]));
  const costs = Object.fromEntries(tree.map((n) => [n.id, baseCosts(n, T)]));
  const bump = (id, floor) => {
    const c = costs[id];
    if (c[0] >= floor) return false;
    const f = floor / c[0];
    costs[id] = c.map((x) => ceil2(x * f));
    return true;
  };
  for (let it = 0; it < 30; it++) {
    let changed = false;
    const { parent, order } = cheapestParents(tree, costs, T);
    for (const id of order) {
      const n = by[id];
      if (id === 'start') continue;
      /* 1) 가장 가까운 같은 재화 앞 칸 × stepMin */
      let p = parent[id];
      while (p && nodeCur(by[p]) !== nodeCur(n)) p = parent[p];
      if (p && bump(id, costs[p][0] * T.stepMin)) changed = true;
      /* 2) 선행 칸 */
      const rf = reqFloor(n, costs, by, T);
      if (rf && bump(id, rf)) changed = true;
    }
    for (const [a, b, k] of T.chain || []) if (costs[a] && costs[b] && bump(b, costs[a][0] * k)) changed = true;
    /* 3) 사다리: 범위 안 레벨 값을 오름차순으로, 앞 값 × ladderStep 이상. ladderMix 면 두 재화를 한 줄로(기술력 ÷ techPerRev = 매출 환산) —
     *    한 영업일에 매출 칸·기술력 칸이 같이 몰려 3칸이 되지 않게 */
    const inLadder = (n, i) => n.d <= T.ladderRings || (i === 0 && n.d <= (T.ladderFirst || 0)) || (T.ladderExtra || []).includes(n.id);
    const groups = T.ladderMix ? [['rev', 'tech']] : [['rev'], ['tech']];
    for (const g of groups) {
      const lv = [];
      for (const n of tree) if (g.includes(nodeCur(n))) costs[n.id].forEach((c, i) => {
        if (inLadder(n, i)) lv.push({ id: n.id, i, k: nodeCur(n) === 'tech' && T.ladderMix ? 1 / T.techPerRev : 1 });
      });
      const val = (o) => costs[o.id][o.i] * o.k;
      lv.sort((x, y) => val(x) - val(y) || (x.id < y.id ? -1 : x.id > y.id ? 1 : x.i - y.i));
      let prev = 0;
      for (const o of lv) {
        let v = val(o);
        if (prev && v < prev * T.ladderStep - 1e-9) {
          const c = ceil2((prev * T.ladderStep) / o.k);
          costs[o.id][o.i] = c;
          v = c * o.k;
          changed = true;
        }
        prev = v;
      }
    }
    /* 한 칸 안 레벨은 늘 오름차순 */
    for (const n of tree) {
      const c = costs[n.id];
      for (let i = 1; i < c.length; i++) if (c[i] <= c[i - 1]) {
        c[i] = ceil2(c[i - 1] * 1.01 + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return costs;
}

function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] === undefined) o[ks[i]] = {};
    o = o[ks[i]];
  }
  const last = ks[ks.length - 1];
  const old = o[last];
  o[last] = JSON.parse(JSON.stringify(v));
  return JSON.stringify(old) !== JSON.stringify(v);
}
function delPath(obj, path) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    o = o[ks[i]];
    if (!o) return false;
  }
  const last = ks[ks.length - 1];
  if (!(last in o)) return false;
  delete o[last];
  return true;
}
/** a 의 키를 b 로 맞춤(b 에 있는 것만). 바뀌었으면 true */
function assignSome(a, b) {
  let ch = false;
  for (const k of Object.keys(b)) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) ch = true;
    a[k] = JSON.parse(JSON.stringify(b[k]));
  }
  return ch;
}

/** spec 을 JSON 으로 복제(보정 스크립트가 고쳐 쓰는 용도) */
export const cloneSpec = (s = SPEC) => JSON.parse(JSON.stringify(s));

export function apply(D, spec = SPEC) {
  let changed = 0;
  for (const t of D.targets) {
    const v = spec.values[t.id];
    if (v == null) throw new Error('가치 없음: ' + t.id);
    if (t.value !== v) changed++;
    t.value = v;
    const hp = (spec.hp || {})[t.id];
    if (hp != null) {
      if (t.hp !== hp) changed++;
      t.hp = hp;
    }
  }
  /* 글자·효과 키 */
  const P = spec.patch || {};
  for (const n of D.tree) if (P.tree && P.tree[n.id] && assignSome(n, P.tree[n.id])) changed++;
  for (const c of D.characters) if (P.characters && P.characters[c.id] && assignSome(c, P.characters[c.id])) changed++;
  for (const d of D.districts) if (P.districts && P.districts[d.id] && assignSome(d, P.districts[d.id])) changed++;
  for (const it of D.items) {
    if (P.items && P.items[it.id] && assignSome(it, P.items[it.id])) changed++;
    const g = (spec.itemGrade || {})[it.id];
    if (g && it.grade !== g) {
      it.grade = g;
      changed++;
    }
  }
  /* 스킬 칸4(계약 보너스): "○○ 계약 거래액 +20%" → "○○ 계약 매출 +20%" (logic.ts 도 매출에만 곱함) */
  if (P.skillBonus) for (const id of Object.keys(D.skills)) {
    const k = D.skills[id].sk[4];
    if (k && /거래액/.test(k.ds)) {
      k.ds = k.ds.replace('거래액', '매출');
      changed++;
    }
  }
  for (const [path, v] of Object.entries(P.text || {})) if (setPath(D, path, v)) changed++;
  for (const sp of (D.artApi && D.artApi.sprites) || []) {
    const v = (P.spriteDesc || {})[sp.key];
    if (v && sp.desc !== v) {
      sp.desc = v;
      changed++;
    }
  }
  if (D.itemAllKeys.includes('point')) {
    D.itemAllKeys = D.itemAllKeys.map((k) => (k === 'point' ? 'tech' : k));
    changed++;
  }
  if (D.effects.point) {
    D.effects.tech = { f: 'p', lab: '기술력 +%', br: 'tech' };
    delete D.effects.point;
    changed++;
  }
  /* 잠김 */
  for (const n of D.tree) {
    const r = (spec.req || {})[n.id] || {};
    for (const k of ['req', 'reqAny']) {
      if (r[k]) {
        if (JSON.stringify(n[k]) !== JSON.stringify(r[k])) changed++;
        n[k] = r[k].slice();
      } else if (k in n) {
        delete n[k];
        changed++;
      }
    }
  }
  /* 비용 */
  const costs = allTreeCosts(D.tree, spec.tree);
  for (const n of D.tree) {
    const c = costs[n.id];
    if (JSON.stringify(c) !== JSON.stringify(n.costs)) changed++;
    n.costs = c;
    const vv = spec.gflat[n.id] || (spec.vals || {})[n.id];
    if (vv) {
      if (JSON.stringify(n.vals) !== JSON.stringify(vv)) changed++;
      n.vals = vv.slice();
    }
  }
  const T = D.formulas.TREE;
  for (const k of ['C1rev', 'C1tech', 'LVM', 'unlockMult', 'efMult', 'spread', 'districtK', 'special', 'stepMin', 'reqMin', 'techPerRev', 'ladderRings', 'ladderFirst', 'ladderExtra', 'ladderStep', 'ladderMix', 'lateFrom', 'LVMlate', 'chain']) {
    if (spec.tree[k] === undefined) { if (k in T) { delete T[k]; changed++; } continue; }
    if (JSON.stringify(T[k]) !== JSON.stringify(spec.tree[k])) changed++;
    T[k] = JSON.parse(JSON.stringify(spec.tree[k]));
  }
  T.unit = '원 · 기술력';
  T.currency = '기술 가지(br tech) = 기술력, 영업 가지·공통 = 매출';
  for (const [p, v] of Object.entries(spec.formulas)) if (setPath(D.formulas, p, v)) changed++;
  for (const p of spec.remove || []) if (delPath(D.formulas, p)) changed++;
  for (const [p, v] of Object.entries(spec.fx || {})) if (setPath(D.fx, p, v)) changed++;
  return changed;
}

/* ── 파생 비용(게임 rules.ts 와 같은 식) ── */
export function skillFirstCosts(D) {
  const C = D.formulas.SKILL_COST;
  const by = Object.fromEntries(D.tree.map((n) => [n.id, n]));
  const out = {};
  for (const id of D.skillOrder) {
    const u = by[D.skills[id].unlock].costs[0];
    out[id] = C.slotK.map((k) => Math.round(u * k));
  }
  return out;
}
export function itemFirstCosts(D) {
  const I = D.formulas.ITEM;
  if (Array.isArray(I.first) && I.first.length >= 20) return I.first.slice(0, 20);
  const by = Object.fromEntries(D.tree.map((n) => [n.id, n]));
  const base = by[I.baseNode].costs[0];
  const tg = I.tgtNodes.map((id) => by[id].costs[0]).sort((a, b) => a - b);
  const byGrade = [];
  for (let g = 1; g <= 20; g++) {
    let c = g <= I.baseK.length ? base * I.baseK[g - 1] : tg[g - 1 - I.baseK.length] * I.tgtK;
    if (g > 1) c = Math.max(c, byGrade[g - 2] * I.step);
    byGrade.push(Math.round(c));
  }
  return byGrade;
}

/** 설계서 4-1·4-3·4-4·2-6 검사 */
export function check(D) {
  const errs = [];
  const T = D.formulas.TREE;
  const by = Object.fromEntries(D.tree.map((n) => [n.id, n]));
  const costs = Object.fromEntries(D.tree.map((n) => [n.id, n.costs]));
  /* 4-1 선행 필요 칸에 req */
  const needReq = [];
  for (const n of D.tree) {
    if (n.ef === 'tv') {
      const tg = Array.isArray(n.tg) ? n.tg : String(n.tg).split(',');
      const base = tg.every((id) => D.targets.find((t) => t.id === id)?.unlock === 'base');
      if (!base) needReq.push(n.id);
    }
    if (n.ef === 'cds' || n.ef === 'dbl' || n.ef === 'womC' || n.ef === 'hotC' || n.ef === 'refN') needReq.push(n.id);
    if ((n.ef === 'chest' || n.ef === 'inquiry') && Number(n.tg) > 1) needReq.push(n.id);
  }
  const noReq = needReq.filter((id) => !(by[id].req || by[id].reqAny));
  if (noReq.length) errs.push(`4-1 req 없는 선행 필요 칸 ${noReq.length}: ${noReq.join(',')}`);
  /* 4-3 */
  const { parent } = cheapestParents(D.tree, costs, T);
  for (const n of D.tree) {
    if (n.id === 'start') continue;
    let p = parent[n.id];
    while (p && nodeCur(by[p]) !== nodeCur(n)) p = parent[p];
    if (p && n.costs[0] < costs[p][0] * T.stepMin - 1e-6) errs.push(`4-3 ${n.id}(${n.costs[0]}) < 앞 칸 ${p}(${costs[p][0]}) × ${T.stepMin}`);
    const rf = reqFloor(n, costs, by, T);
    if (rf && n.costs[0] < rf - 1e-6) errs.push(`4-3 ${n.id}(${n.costs[0]}) < 선행 ${(n.req || n.reqAny).join('|')} 하한 ${Math.round(rf)}`);
  }
  /* 4-4 스킬 */
  const sk = skillFirstCosts(D);
  let prev = 0;
  for (const id of D.skillOrder) {
    const c = sk[id];
    if (prev && c[0] < prev * 5) errs.push(`4-4 스킬 ${id} 첫 칸 ${c[0]} < 앞 스킬 × 5 (${prev * 5})`);
    prev = c[0];
    for (let i = 1; i < c.length; i++) if (c[i] < c[i - 1] * 1.2 - 1) errs.push(`4-4 스킬 ${id} 칸${i} ${c[i]} < 칸${i - 1} × 1.2`);
  }
  /* 4-4 아이템 */
  const it = itemFirstCosts(D);
  for (let g = 2; g <= 20; g++) if (it[g - 1] < it[g - 2] * 1.2 - 1) errs.push(`4-4 아이템 등급 ${g} ${it[g - 1]} < 앞 등급 × 1.2`);
  const grades = D.items.map((x) => x.grade).sort((a, b) => a - b);
  if (JSON.stringify(grades) !== JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1))) errs.push('4-4 아이템 등급 1~20 이 한 번씩이 아님');
  /* 2-6 거리 1~12 각 고리에 매출 칸·기술력 칸 */
  for (let d = 1; d <= 12; d++) {
    const r = D.tree.filter((n) => n.d === d);
    if (!r.some((n) => nodeCur(n) === 'rev')) errs.push(`2-6 거리 ${d} 매출 칸 없음`);
    if (!r.some((n) => nodeCur(n) === 'tech')) errs.push(`2-6 거리 ${d} 기술력 칸 없음`);
  }
  /* 사다리 */
  {
    const inL = (n, i) => n.d <= T.ladderRings || (i === 0 && n.d <= (T.ladderFirst || 0)) || (T.ladderExtra || []).includes(n.id);
    const groups = T.ladderMix ? [['rev', 'tech']] : [['rev'], ['tech']];
    for (const g of groups) {
      const lv = [];
      for (const n of D.tree) if (g.includes(nodeCur(n))) n.costs.forEach((c, i) => {
        if (inL(n, i)) lv.push(c * (nodeCur(n) === 'tech' && T.ladderMix ? 1 / T.techPerRev : 1));
      });
      lv.sort((x, y) => x - y);
      for (let i = 1; i < lv.length; i++) if (lv[i] < lv[i - 1] * T.ladderStep - 1e-6) errs.push(`8-5 사다리(${g.join('+')}) ${lv[i - 1]} → ${lv[i]} (× ${T.ladderStep} 미만)`);
    }
  }
  return { errs, skills: sk, items: it };
}

export function table(D) {
  const L = [];
  const f = (n) => Math.round(n).toLocaleString('ko-KR');
  L.push('| 티어 | 대상 | 가치(원) | 앞 티어 대비 |', '|---|---|---|---|');
  let prev = 0;
  for (const t of D.targets) {
    L.push(`| ${t.tier} | ${t.name} | ${f(t.value)} | ${prev ? '×' + (t.value / prev).toFixed(2) : '-'} |`);
    prev = t.value;
  }
  L.push('', '| 거리 | 매출 칸 첫 레벨(원) | 기술력 칸 첫 레벨 |', '|---|---|---|');
  const T = D.formulas.TREE;
  T.C1rev.forEach((c, d) => L.push(`| ${d} | ${f(c)} | ${f(T.C1tech[d])} |`));
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const D = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const n = apply(D);
  if (process.argv.includes('--table')) console.log(table(D));
  else if (process.argv.includes('--check')) {
    const r = check(D);
    console.log(`스킬 첫 칸(기술력): ${Object.entries(r.skills).map(([k, v]) => `${k} ${v.join('·')}`).join(' / ')}`);
    console.log(`아이템 등급 1~20 첫 값(기술력): ${r.items.join(' · ')}`);
    if (r.errs.length) {
      console.log(`위반 ${r.errs.length}건`);
      for (const e of r.errs) console.log('  ' + e);
      process.exit(1);
    }
    console.log('검사 통과 (4-1·4-3·4-4·2-6·사다리)');
  } else if (process.argv.includes('--dry')) console.log(`바뀌는 항목 ${n}개 (적용 안 함)`);
  else {
    writeFileSync(DATA_FILE, JSON.stringify(D, null, 1));
    console.log(`gdd-data.json 적용: 바뀐 항목 ${n}개`);
  }
}
