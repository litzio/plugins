import test from 'node:test';
import assert from 'node:assert/strict';
import {statusLabel,statusAction} from '../document-status.mjs';
test('document status labels and reversible actions',()=>{
  for(const [value,label] of [['draft','초안'],['review','검토 중'],['approved','검토 완료'],[undefined,'']]){
    assert.equal(statusLabel(value),label);
    assert.deepEqual(statusAction(value),value==='approved'?{label:'초안으로 되돌리기',value:'draft'}:{label:'검토 완료',value:'approved'});
  }
});
