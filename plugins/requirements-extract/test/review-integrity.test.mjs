import test from 'node:test';
import assert from 'node:assert/strict';
import {correctedFixture} from './corrected-fixture.mjs';
import {read,write,reseal} from './handoff-fixture.mjs';
import {loadProvenance} from '../src/provenance.mjs';
import {mutations} from './review-mutations.mjs';
for(const [name,mutate]of Object.entries(mutations))test('resealed review meaning rejects '+name,()=>{
 const root=correctedFixture(),r=read(root,'review/review-targets.json');mutate(r);write(root,'review/review-targets.json',r);reseal(root);
 assert.throws(()=>loadProvenance(root,{inspect:()=>read(root,'correction-history.json').currentSnapshot}));
});

