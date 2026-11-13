// Deterministic fake decisions for processing tests. No AI or extraction-quality claim.
import { readFileSync } from 'node:fs';
import { handoff, read } from './handoff-fixture.mjs';
import { loadProvenance } from '../src/provenance.mjs';
import { prepare, batch, outputTokens } from '../src/workflow.mjs';
export const profile=JSON.parse(readFileSync(new URL('../profiles/default.json',import.meta.url)));
export function input() {const root=handoff();return {key:'synthetic',bundle:loadProvenance(root,{inspect:()=>read(root,'snapshot.json')})};}
export const job=()=>prepare([input()],structuredClone(profile));
export function fake(job,section=job.corpus.sections[0],{adopt=true}={}) {
  const b=batch(job,section.key);
  const response={schemaVersion:1,requestId:b.requestId,inputDigest:b.inputDigest,policyDigest:b.policyDigest,epoch:b.epoch,sectionKey:section.key,sectionReview:{checked:true,reason:'Synthetic complete section inspection',overlookedSegmentKeys:[]},decisions:[]};
  for(const c of b.candidates) {
    const d={candidateKey:c.candidateKey,decision:adopt?'adopt':'non-requirement',reason:'Deterministic processing fixture',choices:{kind:'performance',level:'system',strength:'mandatory',verification:'test',origin:'derived',transformation:'keep',quality:'same'},duplicateOf:null,unresolved:[],contextAssessments:c.contexts.map(c=>({contextKey:c.key,outcome:'not-applicable',reason:'Synthetic independent condition'})),outputs:[]};
    if(adopt) {
      const output={outputKey:'main',title:'Synthetic requirement',bodyBlocks:structuredClone(c.bodyBlocks),sourceCandidateKeys:[c.candidateKey],contextKeys:[],rationale:'Synthetic derivation',relations:[],protectedTokenMappings:[]};
      output.protectedTokenMappings=outputTokens(output,job.profile,0).map(t=>({outputTokenKey:t.key,sourceTokenKey:c.tokens.find(s=>s.value===t.value&&s.kind===t.kind).key}));
      // Repeated equal occurrences need distinct source mappings when possible.
      const used=new Set();for(const m of output.protectedTokenMappings){const t=outputTokens(output,job.profile,0).find(t=>t.key===m.outputTokenKey);const s=c.tokens.find(s=>!used.has(s.key)&&s.value===t.value&&s.kind===t.kind);if(s){m.sourceTokenKey=s.key;used.add(s.key);}}
      d.outputs=[output];
    }
    response.decisions.push(d);
  }
  return response;
}
