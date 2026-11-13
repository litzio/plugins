import {canonical} from './model.mjs';
const equal=(a,b)=>canonical(a)===canonical(b);
export function verifyNotes(p,raw,snapshot,need) {
 for(const item of p.items) {
  const b=item.structure.noteBinding;
  if(b) {
   const source=raw.get(item.selfRef),call=raw.get(b.sourceRef),prefix=/^(\d+|[a-z])\s+(\S[\s\S]*)$/.exec(source.text??'');
   need(source.label==='footnote'&&prefix?.[1]===b.marker&&b.label==='docling-note-'+item.selfRef.split('/').at(-1),'note-definition');
   const text=b.cellIndex===null?call?.text:call?.data?.table_cells[b.cellIndex]?.text;
   need(Number.isInteger(b.start)&&b.start>=0&&text?.slice(b.start,b.start+b.marker.length)===b.marker,'note-call-site');
   need(p.items.find(i=>i.selfRef===b.sourceRef)?.structure.noteReferences?.some(v=>equal(v,b)),'note-reciprocal');
   need(b.witness&&p.pages.some(page=>page.pageNo===b.witness.pageNo),'note-witness');
   const n=snapshot.nodes.find(n=>n.type==='footnote'&&n.label===b.label);
   need(n&&n.text===prefix[2],'note-native-definition');
  }
  for(const ref of item.structure.noteReferences??[])need(ref.sourceRef===item.selfRef&&p.items.some(i=>equal(i.structure.noteBinding,ref)),'note-reference');
 }
}
export function noteSourceText(snapshot,target,bindings,expected,need) {
 const path=target.selector.kind==='cell'?[...target.path,target.selector.row,target.selector.column]:target.path;
 const n=snapshot.nodes.find(n=>equal(n.path,path));need(n&&Array.isArray(n.content),'note-content');
 let result='',seen=[];
 function visit(content) {for(const atom of content) {
  if(atom.kind==='footnote') {const b=bindings.find(b=>b.label===atom.label);need(b,'note-unknown-atom');need(result.length===b.start,'note-call-position');result+=b.marker;seen.push(b.label);}
  else if(atom.children)visit(atom.children);
  else {need(atom.kind==='text','note-unsupported-atom');result+=atom.text;}
 }}
 visit(n.content);need(equal(seen,[...bindings].sort((a,b)=>a.start-b.start).map(b=>b.label))&&result===expected,'note-source-text');
 return result;
}
