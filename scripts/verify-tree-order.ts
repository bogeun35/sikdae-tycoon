import assert from 'node:assert/strict';
import { TREE, TREE_BY } from '../src/game/data';
import { S, fresh, replaceState } from '../src/game/state';
import { canBuyNode, nodeCost, nodeVisible, refreshEff, tlv } from '../src/game/rules';
import { buyNode } from '../src/game/shop';
const memory=new Map<string,string>();
Object.assign(globalThis,{localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)}});
const checks:string[]=[];
const check=(name:string,fn:()=>void)=>{fn();checks.push(name)};
const reset=()=>{replaceState(fresh());S.revenue=1e16;S.tech=1e16;refreshEff()};
check('24 main development steps cannot be purchased out of order',()=>{
 const main=TREE.filter(n=>n.techMain).sort((a,b)=>a.techStage!-b.techStage!);
 assert.equal(main.length,24);
 for(let i=1;i<main.length;i++){
  reset();for(const n of TREE)S.tree[n.id]=1;
  delete S.tree[main[i].id];delete S.tree[main[i-1].id];refreshEff();
  assert(!canBuyNode(main[i]),main[i].name);assert(!nodeVisible(main[i]),main[i].name);
 }
});
check('unique positions, reciprocal links and existing prerequisites',()=>{
 const positions=new Set<string>();
 for(const n of TREE){const p=`${n.x},${n.y}`;assert(!positions.has(p),`duplicate ${n.id}`);positions.add(p);
  for(const id of n.link){assert(TREE_BY[id],id);assert(TREE_BY[id].link.includes(n.id),`${n.id} -> ${id}`)}
  for(const id of [...(n.req||[]),...(n.reqAny||[])])assert(TREE_BY[id],id);
 }
});
check('cheap PG node cannot reveal or purchase the final platform',()=>{
 reset();S.tree.start=1;S.tree.base3=1;refreshEff();assert(!nodeVisible(TREE_BY.f_boss));assert(!canBuyNode(TREE_BY.f_boss));
});
check('early sales nodes cannot reveal trillion-scale contracts',()=>{
 reset();for(const id of ['start','foot2','gmv1','refN','tv89'])S.tree[id]=1;refreshEff();
 for(const id of ['comm1','fee1','f_r10']){assert(!nodeVisible(TREE_BY[id]),id);assert(!canBuyNode(TREE_BY[id]),id)}
});
check('already owned legacy nodes remain visible with their upgrade levels',()=>{
 reset();S.tree.fee1=2;refreshEff();assert(nodeVisible(TREE_BY.fee1));assert.equal(tlv('fee1'),2);
});
const frontiers:{purchaseCap:number;owned:number;maxVisibleNextCost:number;top:string[]}[]=[];
check('progression under 100M and 200M does not expose trillion-scale nodes',()=>{
 for(const cap of [1e8,2e8]){
  reset();let changed=true;
  while(changed){changed=false;for(const n of TREE)if(canBuyNode(n)&&nodeCost(n)<=cap){assert(buyNode(n));changed=true}}
  const next=TREE.filter(n=>nodeVisible(n)&&tlv(n.id)<n.max).sort((a,b)=>nodeCost(b)-nodeCost(a));
  assert(next.length);assert(next.every(n=>nodeCost(n)<1e12));
  frontiers.push({purchaseCap:cap,owned:Object.keys(S.tree).length,maxVisibleNextCost:nodeCost(next[0]),top:next.slice(0,5).map(n=>`${n.id}: ${nodeCost(n)}`)});
 }
});
check('all 112 nodes remain visible and purchasable through normal rules',()=>{
 reset();let changed=true;
 while(changed){changed=false;for(const n of TREE)if(canBuyNode(n)){assert(nodeVisible(n),n.id);assert(buyNode(n));changed=true}}
 assert.equal(TREE.filter(n=>tlv(n.id)===n.max).length,112);
});
console.log(JSON.stringify({passed:checks.length,checks,frontiers},null,2));
