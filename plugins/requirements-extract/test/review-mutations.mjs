export const mutations={
 'empty group pages':r=>r.groups[0].pageNos=[],
 'uncovered page':r=>r.groups[0].pageNos=[2],
 'unknown group finding':r=>r.groups[0].findingIds=['unknown'],
 'missing group':r=>r.groups=[],
 'representative':r=>r.groups[0].representativeId='other',
 'kind':r=>r.groups[0].kinds=[],
 'priority':r=>r.groups[0].priority='low',
 'window':r=>r.groups[0].pageNos=[1,5],
 'duplicate group':r=>r.groups.push(structuredClone(r.groups[0])),
 'duplicate finding':r=>r.findings.push(structuredClone(r.findings[0])),
 'evidence':r=>r.findings[0].evidence={},
 'source':r=>r.findings[0].sourceIds=['0'.repeat(64)],
 'selfRef':r=>r.findings[0].selfRefs=['#/unknown'],
 'bbox':r=>r.findings[0].regions[0].bbox=[100,100,10,10],
 'page':r=>r.findings[0].regions[0].pageNo=99,
 'target revision':r=>r.findings[0].targets[0].documentRevision='0'.repeat(64),
 'target path':r=>r.findings[0].targets[0].path=[99],
 'check source':r=>r.checks[0].sourceId='0'.repeat(64),
 'check token':r=>r.checks[0].pdfTokenIds.push('unknown'),
 'series':r=>r.series=[{id:'bad',groupIds:['unknown'],representativeGroupId:'unknown',pattern:'bad',defaultCollapsed:true}],
};
for(const key of ['pages','findings','groups','groupsPerPage','foldedRows','unavailableChecks'])mutations['statistics '+key]=r=>r.statistics[key]++;
mutations['statistics kinds']=r=>r.statistics.byKind={};

