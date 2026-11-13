// Deterministic fake decisions for processing tests. No AI or extraction-quality claim.
import { readFileSync } from 'node:fs';
import { handoff, read } from './handoff-fixture.mjs';
import { loadProvenance } from '../src/provenance.mjs';
import { neutralTitle,evidenceRegions } from '../src/protected.mjs';
import { prepare, batch, outputTokens, outputRegions, sourceRegions } from '../src/workflow.mjs';
export const profile=JSON.parse(readFileSync(new URL('../profiles/default.json',import.meta.url)));
export function input() {const root=handoff();return {key:'synthetic',bundle:loadProvenance(root,{inspect:()=>read(root,'snapshot.json')})};}
export const job=()=>prepare([input()],structuredClone(profile));
export function fake(job,section=job.corpus.sections[0],{adopt=true}={}) {
  const b=batch(job,section.key);
  const response={schemaVersion:2,requestId:b.requestId,inputDigest:b.inputDigest,policyDigest:b.policyDigest,epoch:b.epoch,sectionKey:section.key,sectionReview:{checked:true,reason:'Synthetic complete section inspection',overlookedSegmentKeys:[]},decisions:[]};
  for(const c of b.candidates) {
    const d={candidateKey:c.candidateKey,decision:adopt?'adopt':'non-requirement',reason:'Deterministic processing fixture',choices:{kind:'performance',level:'system',strength:'mandatory',verification:'test',origin:'derived',transformation:'keep',quality:'same'},duplicateOf:null,unresolved:[],contextAssessments:c.contexts.map(c=>({contextKey:c.key,outcome:['header','caption','footnote','list-parent','row'].includes(c.kind)?'apply':'not-applicable',reason:'Synthetic independent condition'})),outputs:[]};
    if(adopt) {
      const output={outputKey:'main',title:neutralTitle,bodyBlocks:structuredClone([...c.bodyBlocks,...c.contexts.filter(c=>['header','caption','footnote','list-parent','row'].includes(c.kind)).flatMap(c=>c.bodyBlocks)]),sourceCandidateKeys:[c.candidateKey],contextKeys:c.contexts.filter(c=>['header','caption','footnote','list-parent','row'].includes(c.kind)).map(c=>c.key),rationale:'Synthetic derivation',relations:[],protectedTokenMappings:[]};
      const pool=[...c.tokens,...c.contexts.filter(c=>output.contextKeys.includes(c.key)).flatMap(c=>c.tokens)],used=new Set();
      const notes=c.contexts.filter(c=>c.kind==='footnote'&&output.contextKeys.includes(c.key)).map(c=>({label:c.label,content:c.bodyBlocks[0].content}));
      output.protectedTokenMappings=outputTokens(output,job.profile,0,notes).map(t=>{const original=pool.find(s=>!used.has(s.key)&&s.value===t.value&&s.kind===t.kind)??pool.find(s=>s.value===t.value&&s.kind===t.kind);used.add(original.key);return {outputTokenKey:t.key,sourceTokenKey:original.key};});
      d.outputs=[output];
    }
    response.decisions.push(d);
  }
  return withProof(job,response);
}

export function withProof(job,response) {
  const r=structuredClone(response);
  for(const d of r.decisions) for(const [i,o] of d.outputs.entries()) {
    const cs=o.sourceCandidateKeys.map(k=>job.corpus.candidates[k]).filter(Boolean);
    const contexts=[...new Map(cs.flatMap(c=>c.contexts.filter(c=>o.contextKeys.includes(c.key))).map(c=>[c.key,c])).values()];
    const pool=[...cs.flatMap(sourceRegions),...contexts.flatMap(c=>evidenceRegions(c.bodyBlocks,c.key))];
    const notes=contexts.filter(c=>c.kind==='footnote').map(c=>({label:c.label,content:c.bodyBlocks[0].content}));
    const used=new Set();o.sourceRegionMappings=outputRegions(o,i,notes).map(region=>{
      const source=pool.find(s=>!used.has(s.key)&&s.value===region.value)??pool.find(s=>s.value===region.value)??pool[0];
      if(region.role!=='title')used.add(source?.key);
      return {outputRegionKey:region.key,sourceRegionKey:source?.key??'missing'};
    });
  }
  return r;
}
