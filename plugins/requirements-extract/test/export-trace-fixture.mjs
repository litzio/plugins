import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {create} from 'xmlbuilder2';
import {traceStore,traceRecord} from '../src/trace-store.mjs';
export function referencedTrace(xml,source){
 const doc=create(xml).node;
 const ids=new Set([...doc.getElementsByTagName('ATTRIBUTE-DEFINITION-STRING')].filter(n=>n.getAttribute('LONG-NAME')==='SourceReferences').map(n=>n.getAttribute('IDENTIFIER')));
 const refs=[...doc.getElementsByTagName('ATTRIBUTE-VALUE-STRING')].filter(n=>ids.has(n.getElementsByTagName('ATTRIBUTE-DEFINITION-STRING-REF')[0]?.textContent)).flatMap(n=>JSON.parse(n.getAttribute('THE-VALUE')));
 const record=traceRecord(source.trace),reference=refs.find(r=>r.traceRef?.id===record.ref.id);assert.ok(reference,'ReqIF references exact full evidence bytes');assert.deepEqual(reference.traceRef,record.ref);assert.ok(reference.summary);
 const root=mkdtempSync(join(tmpdir(),'requirements-export-ref-unit-')),store=traceStore({document:join(root,'proposal.md'),scope:p=>p});assert.deepEqual(store.put(source.trace),reference.traceRef);
 const trace=store.resolve(reference.traceRef,record.summary);assert.deepEqual(trace,source.trace);store.verify();return trace;
}
