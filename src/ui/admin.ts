import { CHARS, DISTRICTS, F, SKILLS, SKILL_ORDER, TREE, TREE_BY } from '../game/data';
import { refreshEff } from '../game/rules';
import { S, exportCode, importCode, saveGame } from '../game/state';
import { storage } from '../storage';
import { snapDisplay } from './hud';

const BACKUP = 'admin-before-test-v1';
/** Intentionally hidden testing entry. Local game only; not an authentication boundary. */
export function bindAdminEntry(root: HTMLElement, refresh: () => void): void {
  const entry = root.querySelector<HTMLElement>('[data-admin-entry]');
  let taps = 0, last = 0;
  const tap = () => {
    const now = Date.now(); taps = now - last > 2500 ? 1 : taps + 1; last = now;
    if (taps >= 7) { taps = 0; openAdmin(refresh); }
  };
  entry?.addEventListener('click', tap);
  entry?.addEventListener('keydown', e => { if (e.key === 'Enter') tap(); });
}

function openAdmin(refresh: () => void): void {
  if (document.querySelector('#test-admin')) return;
  const dialog = document.createElement('dialog'); dialog.id = 'test-admin';
  dialog.style.cssText = 'width:min(92vw,560px);max-height:88dvh;overflow:auto;box-sizing:border-box;border:2px solid #9fc1ef;border-radius:20px;padding:24px;background:#152747;color:#fff;font:16px Jua,Malgun Gothic,sans-serif;';
  dialog.innerHTML = `<style>#test-admin *{box-sizing:border-box}#test-admin label{display:block;margin:14px 0 5px}#test-admin input,#test-admin select,#test-admin button{font:inherit;border-radius:8px;padding:10px;border:1px solid #758eaa;max-width:100%}#test-admin input,#test-admin select{width:100%;background:#fff;color:#152747}#test-admin button{cursor:pointer;margin:8px 6px 0 0;background:#d2e6ff;color:#152747}#test-admin::backdrop{background:#071227c9}#test-admin p{line-height:1.5;font-size:14px}#test-admin [role=status]{color:#a6efc7}</style>
  <h2 style="margin:0">관리자 · 테스트 설정</h2>
  <p>첫 변경 전에 진행을 자동 백업합니다. 아래 복원 버튼으로 테스트 이전으로 돌아갈 수 있어요.</p>
  <label for="admin-money">보유 매출 (원)</label><input id="admin-money" type="number" min="0" max="1000000000000000" value="${S.revenue}">
  <label for="admin-tech">보유 기술력</label><input id="admin-tech" type="number" min="0" max="1000000000000000" value="${S.tech}">
  <button data-admin="money">금액 적용</button>
  <label for="admin-node">강제 강화할 성장 트리</label><select id="admin-node">${TREE.map(n=>`<option value="${n.id}">${n.name} (${S.tree[n.id]||0}/${n.max})</option>`).join('')}</select>
  <button data-admin="node">선택한 기술 +1 (비용·선행 무시)</button>
  <button data-admin="base">기본 역량 각각 +1</button><button data-admin="skills">모든 스킬 해금·각각 +1</button>
  <label for="admin-district">테스트 지역</label><select id="admin-district">${DISTRICTS.map(d=>`<option value="${d.id}" ${S.district===d.id?'selected':''}>${d.name}</option>`).join('')}</select>
  <button data-admin="district">지역 해금·이동</button><button data-admin="hire">모든 인재 고용</button>
  <hr style="margin-top:20px"><button data-admin="download">현재 저장 백업 파일</button><button data-admin="restore">테스트 이전으로 복원</button><button data-admin="close">닫기</button><p role="status" aria-live="polite"></p>`;
  document.body.appendChild(dialog); dialog.showModal();
  const status = dialog.querySelector<HTMLElement>('[role=status]')!;
  const value = (id:string) => (dialog.querySelector('#admin-'+id) as HTMLInputElement).value;
  const backup = () => {
    if (!storage.load<string>(BACKUP,'')) storage.save(BACKUP,exportCode());
    if (!storage.load<string>(BACKUP,'')) throw new Error('저장 공간이 부족해 백업하지 못했습니다. 백업 파일을 먼저 내려받아 주세요.');
  };
  const finish = (message:string) => { refreshEff(); saveGame(); snapDisplay(); refresh(); status.textContent=message; };
  dialog.addEventListener('click', e => {
    const action=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-admin]')?.dataset.admin;
    if (!action) return;
    try {
      if (action==='close') {dialog.close(); return;}
      if (action==='download') {
        const a=document.createElement('a'); const url=URL.createObjectURL(new Blob([exportCode()],{type:'text/plain;charset=utf-8'}));
        a.href=url; a.download=`sikdae-save-${Date.now()}.txt`; a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
      }
      if (action==='restore') {
        const code=storage.load<string>(BACKUP,'');
        if (!code) {status.textContent='복원할 테스트 백업이 없습니다.';return;}
        if (importCode(code)!=='ok') throw new Error('백업을 읽지 못했습니다.');
        storage.remove(BACKUP);finish('테스트 이전 저장으로 복원했습니다.');dialog.close();return;
      }
      if(action==='money') {
        const money=Number(value('money')), tech=Number(value('tech'));
        if(!value('money').trim() || !value('tech').trim() || ![money,tech].every(n=>Number.isFinite(n)&&n>=0&&n<=1e15)) throw new Error('0부터 1,000조까지 숫자를 입력하세요.');
        backup(); S.revenue=Math.floor(money);S.tech=Math.floor(tech);
      } else {
        backup();
        if(action==='node') {const n=TREE_BY[value('node')];S.tree[n.id]=Math.min(n.max,(S.tree[n.id]||0)+1);}
        if(action==='base') {S.tree[F.BASIC.power.unlock]=Math.max(1,S.tree[F.BASIC.power.unlock]||0);S.tree[F.BASIC.radius.unlock]=Math.max(1,S.tree[F.BASIC.radius.unlock]||0);S.base.power=Math.min(100,S.base.power+1);S.base.radius=Math.min(F.BASIC.radius.max,S.base.radius+1);}
        if(action==='skills') for(const id of SKILL_ORDER) {S.tree[SKILLS[id].unlock]=1;SKILLS[id].sk.forEach((k,i)=>S.sk[id+i]=Math.min(k.max,(S.sk[id+i]||0)+1));}
        if(action==='district') {const d=DISTRICTS.find(d=>d.id===value('district'))!;if(d.unlock!=='base')S.tree[d.unlock]=1;S.district=d.id;}
        if(action==='hire') for(const c of CHARS){if(c.unlock!=='base')S.tree[c.unlock]=1;S.reps[c.id]=1;}
      }
      finish('테스트 설정을 적용했습니다. 진행은 자동 저장됩니다.');
    } catch(err) {status.textContent=err instanceof Error ? err.message : '적용하지 못했습니다.';}
  });
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
}
