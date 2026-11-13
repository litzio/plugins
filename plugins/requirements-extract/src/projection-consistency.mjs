// Inspect's text is a plain projection of content. Atoms have no plain text;
// source note markers are reconstructed separately by note-projection.mjs.
export function checkProjectionConsistency(value,need) {
 const plain=content=>content.map(c=>{
  if(c.kind==='text') {need(typeof c.text==='string','projection-self-consistency','인라인 text 형식 불일치');return c.text;}
  if(['code','math'].includes(c.kind)) {need(typeof c.value==='string','projection-self-consistency','인라인 value 형식 불일치');return c.value;}
  if(c.kind==='break')return '\n';
  if(['footnote','reference','citation'].includes(c.kind))return '';
  need(['strong','emphasis','subscript','superscript','delete','link'].includes(c.kind)&&Array.isArray(c.children),'projection-self-consistency','알 수 없는 인라인 투영');return plain(c.children);
 }).join('');
 const visit=v=>{
  if(Array.isArray(v)) {for(const item of v)visit(item);return;}
  if(!v||typeof v!=='object')return;
  if(typeof v.text==='string'&&v.content!==undefined) {
   need(Array.isArray(v.content),'projection-self-consistency','content 배열이 필요합니다');
   need(plain(v.content)===v.text,'projection-self-consistency','같은 위치의 text와 content가 다릅니다');
  }
  for(const child of Object.values(v))visit(child);
 };
 visit(value);
}
