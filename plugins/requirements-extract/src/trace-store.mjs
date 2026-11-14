// Full evidence belongs to plugin data, not a human-readable document cell.
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {canonical,sha256} from './model.mjs';
const kind='requirements-extract/trace/1';
const ruleNames={'merged-cell-repeated':'병합 값 반복','compound-header-flattened':'복합 머리 합침','table-header-role':'머리 역할 평문 표현'};
export function traceSummary(trace) {
 const rules=[...new Set((trace.ruleApprovals??[]).filter(d=>d.decision==='approved').map(d=>ruleNames[d.ruleId]??d.ruleId))];
 return [trace.eligibleConfirmed?'출처 완료 조건 충족':'미검수 출처',`대상 ${trace.targets?.length??0}개`,
  `기계 전용 ${(trace.machineOnlyPages??[]).join(',')||'없음'}`,
  rules.length?`대표 규칙 승인: ${rules.join(', ')}; human 비인증 선언`:'규칙 승인 없음'].join(' · ');
}
export function traceRecord(trace) {
 const bytes=canonical({schemaVersion:'1.0.0',trace}),digest=sha256(bytes);
 return {bytes,ref:{kind,id:digest.slice(7),digest},summary:traceSummary(trace)};
}
function validRef(ref) {
 return ref&&canonical(Object.keys(ref).sort())===canonical(['digest','id','kind'])&&ref.kind===kind&&/^[a-f0-9]{64}$/.test(ref.id)&&ref.digest==='sha256:'+ref.id;
}
export function traceStore({document,scope}) {
 const directory=join(dirname(document),'.requirements-traces'),reads=new Map();
 const path=ref=>{if(!validRef(ref))throw new Error('source-trace-reference');return scope(join(directory,ref.id+'.json'));};
 const capture=file=>{if(!lstatSync(file).isFile())throw new Error('source-trace-reference');const bytes=readFileSync(file);reads.set(file,bytes);return bytes;};
 return {
  put(trace){
   const record=traceRecord(trace),wanted=Buffer.from(record.bytes,'utf8');mkdirSync(scope(directory),{recursive:true});const file=path(record.ref);
   if(existsSync(file)){if(!readFileSync(file).equals(wanted))throw new Error('source-trace-digest');}
   else writeFileSync(file,record.bytes,{flag:'wx'});
   if(sha256(readFileSync(file))!==record.ref.digest)throw new Error('source-trace-digest');
   return record.ref;
  },
  resolve(ref,summary){
   const file=path(ref),bytes=reads.get(file)??capture(file);
   // Decode strictly; hash original bytes, not a parsed/reformatted surrogate.
   const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   if(sha256(bytes)!==ref.digest)throw new Error('source-trace-digest');
   const record=JSON.parse(value);
   if(canonical(Object.keys(record).sort())!==canonical(['schemaVersion','trace'])||record.schemaVersion!=='1.0.0'||!record.trace||typeof record.trace!=='object'||Array.isArray(record.trace)||traceSummary(record.trace)!==summary)throw new Error('source-trace-reference');
   return structuredClone(record.trace);
  },
  verify(){for(const [file,bytes] of reads)if(!readFileSync(scope(file)).equals(bytes))throw new Error('source-trace-changed');},
 };
}

export function exportSourceReferences(sources) {
 return sources.map(source=>{
  if(!source.trace)return source;
  const record=traceRecord(source.trace);
  return {summary:`${source.sourceKey} · ${source.elementRef} · ${source.selector} · ${record.summary}`,traceRef:record.ref};
 });
}

export function verifyExportTraces(sets,store) {
 for(const set of sets)for(const r of set.requirements)for(const source of r.sources??[])if(source.trace){
  const record=traceRecord(source.trace),ref=store.put(source.trace);store.resolve(ref,record.summary);
 }
 store.verify();
}
