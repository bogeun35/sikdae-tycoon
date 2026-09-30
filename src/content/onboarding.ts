/** Reviewed game copy. Company policies/history require an approved source before publication. */
export const ONBOARDING = {
  title: '식권대장, 게임으로 익히기',
  steps: [
    ['영업하기', '영업 나가기를 누르고 거래처 영업에 성공하세요.'],
    ['균형 맞추기', '고객사와 제휴점의 계약 비율을 1:10으로 유지하세요.'],
    ['회사 키우기', '매출로 모은 자본과 기술력으로 스킬을 개발하세요.'],
    ['사업 방향 정하기', '경영 방향에 따라 원하는 재화를 먼저 확보하세요.'],
    ['지역 확장하기', '지역별 특성을 활용하고 보상 유물을 획득하세요.'],
    ['전국 성장하기', '모든 거래처와 지역을 열어 전국의 독보적인 기업으로 성장하세요. 마지막 목표는 대장트윈타워 계약입니다.'],
  ],
  glossary: [
    ['영업기술', '거래처를 설득하는 힘입니다. 높을수록 계약이 빨리 성사됩니다.'],
    ['제품기술', '영업할 수 있는 원의 크기입니다. 높을수록 더 넓은 범위를 살필 수 있습니다.'],
    ['고객서치', '새 거래처가 등장하는 속도입니다. 높을수록 등장 간격이 짧아집니다.'],
    ['행운', '높은 등급의 거래처가 등장할 가능성을 높입니다. 대박 계약 확률과는 별도 능력입니다.'],
    ['마케팅', '계약에 필요한 설득량을 줄입니다. 게임에서는 사업자 체력이 줄어드는 효과로 표현됩니다.'],
    ['사용자수', '계약으로 쌓이는 게임 속 성장 수치입니다. 목표를 채우면 레벨이 오릅니다.'],
    ['기술력', '제품 개발, 스킬 강화, 유물 강화에 쓰는 재화입니다.'],
    ['계약 규모', '거래액과 계약 보상을 계산하는 기준입니다. 도감에서 관리하면 해당 거래처의 보상이 커집니다.'],
  ],
  economy: '게임 속 매출은 수수료와 고객사 이용료로 구성됩니다. 계산에는 수수료 10%, 이용료 5%를 사용하며, 이는 실제 회사 요율을 설명하는 수치가 아닙니다.',
};

/** Only entries backed by approved company material should be added here. Empty entries are not shown. */
export const COMPANY_POLICIES: { title: string; body: string; source: string; approvedAt: string }[] = [];
export const COMPANY_HISTORY: { date: string; title: string; body: string; source: string; approvedAt: string }[] = [];
