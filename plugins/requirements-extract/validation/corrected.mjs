// Explicit integration against a producer-generated bundle and a source-built CLI.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadProvenance,resolveSource} from '../src/provenance.mjs';
import {sample} from '../test/sample.mjs';
import {digest} from '../src/model.mjs';
import {exportReqif} from '../src/reqif.mjs';
const [entry,root,output]=process.argv.slice(2).map(p=>resolve(p));
const inspect=()=>{const r=spawnSync(process.execPath,[entry,'inspect',join(root,'document.md'),'--format','json'],{encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const bundle=loadProvenance(root,{inspect}),change=bundle.history.changes[0];
const item=bundle.provenance.items.find(i=>(change.target.kind==='cell'?i.cells.flatMap(c=>c.targets).filter(t=>t.selector.row===change.target.row&&t.selector.column===change.target.column):i.targets).some(t=>t.path[0]===change.target.path[0]));
const cell=item.cells.find(c=>c.targets.some(t=>t.selector.kind==='cell'&&t.selector.row===change.target.row&&t.selector.column===change.target.column));
const source=resolveSource(bundle,{sourceKey:'synthetic',elementRef:item.selfRef,selector:cell?'cell:'+cell.sourceCell.start_row_offset_idx+':'+cell.sourceCell.start_col_offset_idx:'full'}).source;
assert.ok(['currently-corrected','restored-to-conversion-value'].includes(source.trace.correctionState));assert.equal(source.quote,cell?.sourceCell.text??item.sourceText);
const sets=sample(),r=sets[0].requirements[0];r.sources=[source];r.confirmedDigest=digest(r);
writeFileSync(output,exportReqif(sets,{testOnly:true}).xml,{flag:'wx'});
console.log(JSON.stringify({ok:true,changes:bundle.history.changes.length,correctionState:source.trace.correctionState,evidenceRecheck:source.trace.corrections.map(c=>c.validation.evidenceRecheck),reviewState:bundle.reviewState}));

