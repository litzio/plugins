import assert from 'node:assert/strict';
import {sourceCli} from '../src/cli.mjs';
import {digest} from '../src/model.mjs';
import {exportReqif} from '../src/reqif.mjs';
import {resolve} from 'node:path';
const [entry,root,file]=process.argv.slice(2),cli=sourceCli({entry:resolve(entry),root:resolve(root)}),set=cli.read(file);
assert.ok(set.requirements.length);assert.ok(!set.diagnostics.some(d=>d.severity==='error'));
for(const r of set.requirements){assert.equal(r.status,'confirmed');assert.equal(r.confirmedDigest,digest(r));assert.ok(r.sources[0].nativeLocation);}
assert.doesNotThrow(()=>exportReqif([set]));
console.log(JSON.stringify({ok:true,requirements:set.requirements.length,confirmedDigestPreserved:true,nativeLocationPreserved:true,formalReexport:true}));
