import publicText from './fixtures/upstream-public.json' with {type:'json'};
import profile from '../profiles/default.json' with {type:'json'};
import {sample} from './sample.mjs';
import {digest,sha256,canonical} from '../src/model.mjs';
export {profile};
export function upstreamFixture() {
 const [upper,lower]=sample();upper.requirements=[];lower.requirements=[];const expected={};
 const id=n=>'req-1593c157-e436-422d-a7aa-'+String(n).padStart(12,'0');
 for(const [index,item] of publicText.items.entries()) {
  const base=sample()[0].requirements[0];base.id=id(index+1);base.title='Public obligation '+(index+1);base.body=[{kind:'paragraph',text:item.text}];base.sources=[{sourceKey:'synthetic',elementRef:item.selfRef,selector:'full',quote:item.text,quoteDigest:sha256(item.text)}];base.relations=[];base.confirmedDigest=digest(base);upper.requirements.push(base);
  for(let part=0;part<2;part++) {
   const child=structuredClone(base);child.id=id(101+index*2+part);child.level='system';child.title='Implementation '+(part?'B':'A')+' of public obligation '+(index+1);child.body=[{kind:'paragraph',text:(part?'Implementation B: ':'Implementation A: ')+item.text}];child.confirmedDigest=digest(child);lower.requirements.push(child);expected[child.id]=base.id;
  }
 }
 upper.revision=sha256(canonical(upper)).slice(7);lower.revision=sha256(canonical(lower)).slice(7);
 return {upper:[upper],lower:[lower],profile:structuredClone(profile),expected};
}
export function linkDecision(job,lowerId,upperId,extra={}) {return {inputDigest:job.inputDigest,policyDigest:job.policyDigest,lowerId,scopeReview:{checked:true,reason:'Synthetic complete upper catalog judgment'},choices:[{choice:'refines',upperId,reason:'Synthetic fixture assigns this implementation to the full public obligation',basis:'satisfies-obligation',coverage:'full',covered:'Entire selected synthetic obligation',remaining:'',...extra}]};}
