// Browser-side measurements; uses only plugin-owned hooks and observed public UI DOM.
export async function measureTargets(page) {
 const results=[];
 for(let i=0;i<3;i++)for(let repeat=0;repeat<5;repeat++){
  await page.evaluate(()=>window.platformCheck.clearTarget());
  await page.waitForFunction(()=>!document.querySelector('[data-testid="document-view-highlight"]'));
  const ms=await page.evaluate(async i=>{
   const t=performance.now();window.platformCheck.target(i);
   await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Highlight did not become visible')),15000);
    function check(){const h=document.querySelector('[data-testid="document-view-highlight"]');if(h){const r=h.getBoundingClientRect();if(r.height>0&&r.top<innerHeight&&r.bottom>0){requestAnimationFrame(()=>{clearTimeout(deadline);resolve();});return;}}requestAnimationFrame(check);}check();});
   return performance.now()-t;
  },i);
  results.push({target:i,repeat,ms});
 }
 return results;
}
export async function scrollPdf(page) {
 return page.evaluate(async()=>{
  const el=document.querySelector('[data-pdf-pane]');el.scrollTop=0;
  const t=performance.now(),tasks=[];const observer=new PerformanceObserver(l=>tasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));observer.observe({type:'longtask'});
  await new Promise(resolve=>{function tick(){el.scrollTop=Math.min(el.scrollHeight-el.clientHeight,(performance.now()-t)*3.5);if(el.scrollTop>=el.scrollHeight-el.clientHeight)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));tasks.push(...observer.takeRecords().map(e=>({start:e.startTime,duration:e.duration})));observer.disconnect();
  return {duration:performance.now()-t,tasks,heap:performance.memory?.usedJSHeapSize};
 });
}
