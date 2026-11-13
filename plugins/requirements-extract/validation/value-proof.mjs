// Real public CLI and file workflow. Synthetic handoff/PDF bytes, NOT producer/PDF quality proof.
import { mkdirSync,writeFileSync,readFileSync,renameSync,existsSync } from 'node:fs';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';
import { handoff,read,write,reseal,h } from '../test/handoff-fixture.mjs';
import { fake,withProof } from '../test/candidate-fixture.mjs';
import { sourceCli } from '../src/cli.mjs';
import { execute } from '../src/candidate-cli.mjs';
import { loadLedger,saveLedger } from '../src/ledger.mjs';
import { outputTokens } from '../src/workflow.mjs';
import { exportReqif } from '../src/reqif.mjs';
const [entry,scratch]=process.argv.slice(2).map(p=>resolve(p)),results=[];
const cases=[['fullwidth','Voltage shall be １０ V','Voltage shall be ２０ V'],['identifier','Signal_A shall be active','Signal_B shall be active'],['range','Voltage shall be 10~20 V','Voltage shall be 20~10 V']];
for(const [name,original,changed] of cases) {
  const root=join(scratch,name);mkdirSync(root);const input=join(root,'input');mkdirSync(input);handoff(input);
  renameSync(join(input,'document.md'),join(input,'placeholder.md'));
  const cli=sourceCli({entry,root:input}),authoring={inputs:[{key:'all',blocks:[{kind:'paragraph',text:original},{kind:'table',rows:[['Parameter','Parameter'],['≤ 5 V','≤ 5 V']]}]}]};
  const createInput=join(input,'authoring.json');writeFileSync(createInput,JSON.stringify({authoring,images:[]}));
  const created=cli.run('create',join(input,'document.md'),'--input',createInput,'--format','json');
  cli.run('check',join(input,'document.md'),'--format','json');
  const snapshot=cli.run('inspect',join(input,'document.md'),'--format','json'),p=read(input,'provenance.json'),raw=read(input,'source/document.json');
  raw.texts[0].text=raw.texts[0].orig=original;write(input,'source/document.json',raw);
  const docHash=h(readFileSync(join(input,'source/document.json'))),record=read(input,'source/conversion-record.json');record.document.sha256=docHash;write(input,'source/conversion-record.json',record);
  p.source.docling.sha256=docHash;p.source.conversionRecord.sha256=h(readFileSync(join(input,'source/conversion-record.json')));
  p.document.revision=snapshot.revision;p.document.blocks=snapshot.nodes.filter(n=>n.path.length===1).map(n=>({path:n.path,kind:n.type,text:n.text??null}));
  for(const item of p.items) {
    item.sourceId=h(docHash+':'+item.selfRef);
    if(item.selfRef==='#/texts/0') {item.sourceText=item.originalText=original;item.targets[0].text=original;}
    for(const t of item.targets)t.documentRevision=snapshot.revision;
    for(const c of item.cells){c.sourceId=h(docHash+':'+item.selfRef+':'+c.cellIndex);for(const t of c.targets)t.documentRevision=snapshot.revision;}
  }
  write(input,'provenance.json',p);write(input,'snapshot.json',snapshot);write(input,'receipt.json',created);
  const loss=read(input,'losses.json');loss.documentRevision=snapshot.revision;write(input,'losses.json',loss);
  const complete=read(input,'complete.json');complete.documentRevision=snapshot.revision;write(input,'complete.json',complete);reseal(input);
  for(const origin of ['quoted','derived']) {
    const config=join(root,origin+'.json'),job=join(root,origin+'-job');writeFileSync(config,JSON.stringify({cliEntry:entry,job,outputRoot:root,inputs:[{key:'source',root:input}]}));
    execute(['prepare',config]);const initial=loadLedger(job),state=initial.state,good=fake(state);good.decisions[0].choices.origin=origin;
    const bad=structuredClone(good),d=bad.decisions[0],c=state.corpus.candidates[d.candidateKey],o=d.outputs[0];o.bodyBlocks[0].text=changed;
    const used=new Set();o.protectedTokenMappings=outputTokens(o,state.profile,0).map(t=>{const s=c.tokens.find(s=>!used.has(s.key)&&s.kind===t.kind&&s.value===t.value);if(s)used.add(s.key);return {outputTokenKey:t.key,sourceTokenKey:s?.key??'unproven'};});
    const badFile=join(root,origin+'-bad.json');writeFileSync(badFile,JSON.stringify(withProof(state,bad)));
    const protective=e=>e.diagnostics?.some(d=>['protected-token','quoted-changed','source-region-proof','source-region-order'].includes(d.code));
    assert.throws(()=>execute(['submit',config,badFile]),protective);assert.equal(Object.keys(loadLedger(job).state.responses).length,0);
    // A previously cached bad judgment must also fail BEFORE a result directory is created.
    const stale=structuredClone(state);stale.responses[bad.sectionKey]=withProof(state,bad);
    const stored=saveLedger(job,stale,initial.head);assert.throws(()=>execute(['propose',config,origin+'-blocked']),protective);assert.equal(existsSync(join(root,origin+'-blocked')),false);
    saveLedger(job,state,stored.head);
    const goodFile=join(root,origin+'-good.json');writeFileSync(goodFile,JSON.stringify(good));execute(['submit',config,goodFile]);execute(['propose',config,origin+'-control']);
    const out=sourceCli({entry,root:join(root,origin+'-control')}),model=out.read('proposal.md'),trial=exportReqif([model],{testOnly:true});
    assert.equal(model.requirements[0].body[0].text,original);assert.ok(trial.xml.includes(original));assert.equal(trial.xml.includes(changed),false);
    assert.ok(existsSync(join(out.root,'proposal-complete.json')));writeFileSync(join(root,origin+'.reqif'),trial.xml);
    results.push({case:name,origin,mutatedSubmit:'blocked',cachedProposal:'blocked-before-directory',unchanged:'native-complete-marker-reqif-passed'});
  }
}
writeFileSync(join(scratch,'value-proof-report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({ok:true,mutantCases:results.length,controls:results.length}));
