import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExtractionCache } from '../extraction-cache.mjs';

test('one digest shares an in-flight extraction and its result, then evicts for another digest',async()=>{
  let calls=0,finish;
  const cache=createExtractionCache(async file=>{calls++;if(file==='first')return await new Promise(r=>finish=r);return file;});
  const a=cache('first','digest-a'),b=cache('same-bytes-copy','digest-a');
  assert.equal(a.reused,false);assert.equal(b.reused,true);assert.equal(a.promise,b.promise);
  await Promise.resolve();assert.equal(calls,1);finish({pages:['public fixture']});
  assert.deepEqual(await b.promise,{pages:['public fixture']});
  assert.equal(cache('another-copy','digest-a').promise,a.promise);
  assert.equal(await cache('second','digest-b').promise,'second');
  assert.equal(cache('first-again','digest-a').reused,false);
  await cache('first-again','digest-a').promise;assert.equal(calls,3);
});

test('a failed extraction can retry without an older failure clearing the current digest',async()=>{
  let rejectOld;
  const cache=createExtractionCache(file=>file==='old'?new Promise((_,reject)=>rejectOld=reject):Promise.resolve(file));
  const old=cache('old','a');await Promise.resolve();
  const current=cache('current','b');rejectOld(Error('failed'));
  await assert.rejects(old.promise,/failed/);
  assert.equal(cache('current','b').promise,current.promise);
  const failing=createExtractionCache(async()=>{throw Error('retry');});
  await assert.rejects(failing('file','a').promise,/retry/);
  assert.equal(failing('file','a').reused,false);
  await assert.rejects(failing('file','a').promise,/retry/);
});
