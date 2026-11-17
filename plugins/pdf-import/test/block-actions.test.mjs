import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockActions} from '../block-actions.mjs';
test('toolbar and menu actions reject partial document groups and preserve mutation preconditions',()=>{
 const a={id:'a',path:[1],documentKind:'paragraph',lines:[{},{}]},b={id:'b',path:[2],documentKind:'paragraph',lines:[{}]},h={id:'h',path:[3],documentKind:'heading',level:2},li={id:'l1',path:[4],documentKind:'list'},li2={id:'l2',path:[4],documentKind:'list'};
 const all=[a,b,h,li,li2],actions=bs=>Object.fromEntries(blockActions(bs,all).map(x=>[x.id,x]));
 assert.equal(actions([a,b]).merge.disabled,false);
 assert.equal(actions([a,h]).merge.disabled,true);
 assert.equal(actions([a]).split.disabled,false);
 assert.equal(actions([b]).split.disabled,true);
 assert.equal(actions([h]).h2.disabled,true);
 assert.equal(actions([h]).paragraph.disabled,false);
 assert.deepEqual(actions([h]).h3.extra,{kind:'heading',level:3});
 assert.equal(actions([li]).remove.disabled,true);
 assert.match(actions([li]).remove.disabledReason,/모두/);
 assert.equal(actions([a]).remove.danger,true);
 assert.equal(actions([a]).remove.disabled,false);
 assert.ok(blockActions([],all).every(a=>a.disabled));
});
