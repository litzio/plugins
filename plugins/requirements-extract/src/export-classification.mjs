import {bodyFields,listItemFields,footnoteFields} from './body.mjs';
import {inlineFields,inlineKeys} from './inline.mjs';
import {policy} from './model.mjs';
// Intentionally independent of the model's allowed-field lists. Updating the
// model MUST NOT automatically classify a field as supported by the exporter.
const body=Object.freeze({
 paragraph:{kind:'preserve',text:'preserve',content:'preserve'},
 quote:{kind:'preserve',text:'preserve',content:'preserve'},
 admonition:{kind:'preserve',text:'preserve',content:'preserve',variant:'preserve'},
 table:{kind:'preserve',rows:'preserve',caption:'preserve',label:'preserve',align:'preserve',enumerator:'preserve'},
 list:{kind:'preserve',ordered:'preserve',start:'preserve',style:'preserve',delimiter:'preserve',items:'preserve'},
 code:{kind:'preserve',language:'preserve',code:'preserve'},divider:{kind:'preserve'},
 equation:{kind:'block',latex:'block',label:'block',enumerator:'block'},
 figure:{kind:'block',label:'block',contentKind:'block',imageUrl:'block',imageAlt:'block',caption:'block',mermaidSource:'block',enumerator:'block'},
});
const inline=Object.freeze({
 text:{kind:'preserve',text:'preserve'},code:{kind:'preserve',value:'preserve'},
 strong:{kind:'preserve',children:'preserve'},emphasis:{kind:'preserve',children:'preserve'},subscript:{kind:'preserve',children:'preserve'},superscript:{kind:'preserve',children:'preserve'},delete:{kind:'preserve',children:'preserve'},
 link:{kind:'preserve',children:'preserve',url:'preserve'},footnote:{kind:'preserve',label:'preserve'},
 reference:{kind:'preserve',label:'preserve',role:'preserve'},break:{kind:'preserve'},
 math:{kind:'block',value:'block'},citation:{kind:'block',keys:'block',role:'block'},
});
const listItem={content:'preserve',list:'preserve'},footnote={label:'preserve',content:'preserve'};
export const requirementClassification=Object.freeze({id:'preserve',title:'preserve',titleContent:'preserve',body:'preserve',footnotes:'preserve',kind:'preserve',level:'preserve',origin:'preserve',strength:'preserve',status:'preserve',verification:'preserve',rationale:'preserve',sources:'preserve',relations:'preserve',confirmedDigest:'exclude',location:'exclude'});
export const setClassification=Object.freeze({setId:'preserve',title:'preserve',profile:'preserve',defaultLevel:'preserve',exportNamespace:'preserve',registry:'preserve',requirements:'preserve',file:'exclude',revision:'exclude',heading:'exclude',diagnostics:'exclude'});
export function exportCatalogIssues() {
 const issues=[];
 const check=(scope,fields,classification)=>{for(const field of fields)if(!['preserve','exclude','block'].includes(classification?.[field]))issues.push({file:'',location:[1],severity:'error',code:'unclassified-export-model-field',message:scope+'.'+field+': 내보내기 분류가 없습니다'});};
 for(const [kind,fields] of Object.entries(bodyFields))check('body.'+kind,['kind',...fields],body[kind]);
 for(const kind of Object.keys(inlineFields))check('inline.'+kind,inlineKeys(kind),inline[kind]);
 check('list-item',listItemFields,listItem);check('footnote',footnoteFields,footnote);check('requirement',Object.keys(policy),requirementClassification);
 return issues;
}
