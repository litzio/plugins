import {test} from 'node:test';
import assert from 'node:assert/strict';
import {steppedScale} from '../../shared/browse-scale.mjs';
test('browse wheel steps stop at the supported limits',()=>{
 assert.equal(steppedScale(1,1),.75);assert.equal(steppedScale(.75,1),.5);assert.equal(steppedScale(.5,1),.4);assert.equal(steppedScale(.4,1),.4);assert.equal(steppedScale(.4,-1),.5);assert.equal(steppedScale(1,-1),1);
});
