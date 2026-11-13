import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React,{act} from 'react';
import {create} from 'react-test-renderer';
import {transformSync} from 'esbuild';
import {screenFixture} from './screen-fixture.mjs';
import {reviewLists} from '../src/screen-review.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
const compiled=transformSync(readFileSync(new URL('../screen.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).code;
const Screen=new Function('module',compiled+';return module.exports.default;')({exports:{}});
const text=n=>typeof n==='string'?n:(n.children??[]).map(text).join('');
async function harness(f,{summary=()=>f.summary()}={}) {
 const calls=[];let renderer,pendingDetail=null;
 const ui={ScreenLayout:({children})=>React.createElement('div',{},children),Toolbar:({children})=>React.createElement('div',{},children),
  Button:({children,...props})=>React.createElement('button',props,children),Input:props=>React.createElement('input',props),
  Notice:({children})=>React.createElement('p',{role:'alert'},children),SummaryCard:({label,value})=>React.createElement('span',{'data-summary':label},String(value)),
  DocumentView:()=>React.createElement('article',{'data-source-view':true}),
  DataTable:({title,rows,columns})=>{const [hidden,setHidden]=React.useState(false);return React.createElement(React.Fragment,{},React.createElement('button',{onClick:()=>setHidden(true)},'검사 필터 · '+title),React.createElement('table',{'data-table':title},React.createElement('tbody',{},(hidden?[]:rows).map((r,i)=>React.createElement('tr',{key:i},columns.map(c=>React.createElement('td',{key:c},String(r[c]??''))))))));}};
 async function invoke(op,input) {
  calls.push({op,input:structuredClone(input)});
  if(op==='health')return {ok:true};if(op==='jobs')return {jobs:[{jobId:f.jobId,document:'source.md',checkedSections:1,sections:1}]};
  try {
   if(op==='inspect'&&input.method==='detail'&&pendingDetail){const wait=pendingDetail;pendingDetail=null;await wait;}
   const result=op==='inspect'?(input.method==='summary'?summary():f.service[input.method](input.payload)):await f.service.action(input.action,input.payload);
   return JSON.parse(JSON.stringify({id:input.requestId,state:'succeeded',result}));
  }catch(e){return {id:input.requestId,state:'failed',message:e.message};}
 }
 await act(async()=>{renderer=create(React.createElement(Screen,{React,ui,invoke,pickPath:async()=>null,openDocument:async()=>({status:'opened'})}));});
 const h={get root(){return renderer.root;},calls,button:name=>renderer.root.findAllByType('button').find(b=>text(b)===name),
  table:title=>renderer.root.findByProps({'data-table':title}).findAllByType('tr').map(r=>r.findAllByType('td').map(text)),
  body:()=>{const s=renderer.root.findAllByType('section').find(s=>s.findAllByType('h3').length);return s?.findAllByType('p')[0]?.children.join('')??'';},
  async click(name){const b=this.button(name);assert.ok(b,'button '+name);assert.ok(!b.props.disabled,'enabled '+name);await act(async()=>{await b.props.onClick();});},
  async ready(){await act(async()=>{renderer.root.findByType(ui.DocumentView).props.onStateChange({state:'ready'});});},
  sourceCallback:()=>renderer.root.findByType(ui.DocumentView).props.onStateChange,
  sourceReload:()=>renderer.root.findByType(ui.DocumentView).props.reloadKey,
  async index(value){await act(async()=>{renderer.root.findByProps({'aria-label':'상세 항목 번호'}).props.onChange({target:{value:String(value)}});});},
  deferDetail(){let resolve;pendingDetail=new Promise(r=>{resolve=r;});return resolve;},async close(){await act(async()=>renderer.unmount());}};
 await h.click(text(h.root.findAllByType('button').find(b=>text(b).startsWith('계속 · '))));return h;
}

test('React: reload leaves old detail explicitly stale; only its own receipt is submitted, never the new summary hash',async()=>{
 const f=await screenFixture(),h=await harness(f);
 try {
  await h.click('항목 상세');await h.ready();const oldBody=h.body(),oldClick=h.button('선택 항목 확정').props.onClick;
  const oldReview=f.service.detail({jobId:f.jobId,requirementId:f.summary().requirements[0].id}).review;
  await f.rejudge();await h.click('다시 검사');assert.equal(h.body(),oldBody);assert.ok(h.root.findAllByProps({role:'alert'}).some(n=>text(n).includes('상세가 낡았습니다')));assert.equal(h.button('선택 항목 확정').props.disabled,true);
  // Even a saved callback from the old render cannot confirm the new body.
  await act(async()=>{await oldClick();});assert.equal(f.summary().review.confirmedCount,0);
  const attempt=h.calls.filter(c=>c.input.action==='confirm').at(-1).input.payload;assert.deepEqual(attempt.reviewed,[oldReview]);assert.equal(attempt.planDigest,oldReview.planDigest);
  await h.click('항목 상세');await h.ready();assert.notEqual(h.body(),oldBody);await h.click('선택 항목 확정');assert.equal(f.summary().review.confirmedCount,1);
  assert.equal(h.button('표시된 채택안 확정'),undefined);
 }finally{await h.close();}
});

test('React: every problem count and paginated row comes directly from processing, including a held candidate beside an adoption',async()=>{
 const f=await screenFixture({hold:true}),base=f.summary(),state=f.state(),[a,b]=Object.values(state.corpus.candidates);
 const problems=[...base.report.problems,{code:'compound',candidateKeys:[a.candidateKey,b.candidateKey]},{code:'global-error',message:'No candidate target'},
  {code:'empty-section',sectionKey:'empty'},...Array.from({length:23},(_,i)=>({code:'many-findings',candidateKey:b.candidateKey,reason:'Finding '+i}))];
 const s={...base,report:{...base.report,problems}};s.review=reviewLists({state,head:'harness-head',s:{links:null}},s);
 const h=await harness(f,{summary:()=>s});
 try {
  for(const group of s.review.groups){
   assert.equal(group.count,group.rows.length);await h.click(group.title+' · '+group.count);
   const rendered=[];for(const [i,page] of group.pages.entries()){
    const rows=h.table('요구사항·후보');assert.equal(rows.length,page.rows.length);rendered.push(...rows);
    if(i+1<group.pageCount)await h.click('다음 묶음');
   }
   assert.equal(rendered.length,group.count);assert.deepEqual(rendered.map(r=>r.join(' · ')),group.rows.map(r=>[r.number,r.title,r.status].join(' · ')));
   if(group.code==='hold'){await h.click('항목 상세');assert.match(h.body(),/logger/);}
   await h.click('검사 필터 · 요구사항·후보');assert.equal(h.table('요구사항·후보').length,0);
   await h.click('문제 먼저 '+s.review.problemCount);assert.equal(h.table('확인할 묶음').length,s.review.groupList.count);
  }
 }finally{await h.close();}
});

test('React: changing row discards a late detail response; changing revision or job clears the assistant task copy',async()=>{
 const f=await screenFixture(),h=await harness(f);
 try {
  const release=h.deferDetail();let pending;
  await act(async()=>{pending=h.button('항목 상세').props.onClick();await Promise.resolve();});
  await h.index(2);await act(async()=>{release();await pending;});assert.equal(h.body(),'');
  await h.click('항목 상세');await h.ready();assert.match(h.body(),/logger/);
  await h.click('비서에게 판단 맡기기');assert.ok(h.button('작업 파일 경로 복사'));
  await f.rejudge();await h.click('다시 검사');assert.equal(h.button('작업 파일 경로 복사'),undefined);
  await h.click('비서에게 판단 맡기기');assert.ok(h.button('작업 파일 경로 복사'));
  await h.click('다른 입력');assert.equal(h.button('작업 파일 경로 복사'),undefined);assert.equal(h.body(),'');
 }finally{await h.close();}
});

test('React: a late source-view callback cannot mark another displayed detail ready',async()=>{
 const f=await screenFixture(),h=await harness(f);
 try {
  await h.click('항목 상세');await h.ready();const old=h.sourceCallback();
  await h.index(2);await h.click('항목 상세');assert.equal(h.button('선택 항목 확정').props.disabled,true);
  await act(async()=>old({state:'ready'}));assert.equal(h.button('선택 항목 확정').props.disabled,true);
  await h.ready();assert.equal(h.button('선택 항목 확정').props.disabled,false);
 }finally{await h.close();}
});

test('React: switching source within one detail rejects its old callback; rereading the same detail reloads the renderer',async()=>{
 const f=await screenFixture();await f.rejudge();const h=await harness(f);
 try {
  await h.click('항목 상세');await h.ready();const old=h.sourceCallback(),reload=h.sourceReload();
  await h.click('출처 위치 1/2');assert.notEqual(h.sourceReload(),reload);assert.equal(h.button('선택 항목 확정').props.disabled,true);
  await act(async()=>old({state:'ready'}));assert.equal(h.button('선택 항목 확정').props.disabled,true);await h.ready();
  const before=h.sourceReload(),previous=h.sourceCallback();await h.click('항목 상세');assert.notEqual(h.sourceReload(),before);
  await act(async()=>previous({state:'ready'}));assert.equal(h.button('선택 항목 확정').props.disabled,true);await h.ready();assert.equal(h.button('선택 항목 확정').props.disabled,false);
 }finally{await h.close();}
});
