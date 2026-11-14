import { expressionRuleReviews } from "./expression-rules.js";
import { reviewBindings, reviewDigest } from "./review-bindings.js";
import { historicalReviewHandoff } from "./review-projection.js";

export const RULE_MATERIAL_FIELDS=Object.freeze(["ruleId","version","title","method","policyDigest","members","representatives","generationId","documentRevision","contentDigest"]);
export function ruleMaterialDigest(view) {
  if (JSON.stringify(Object.keys(view).sort())!==JSON.stringify([...RULE_MATERIAL_FIELDS].sort()))
    throw Object.assign(new Error("unbound-rule-material-field"),{code:"unbound-rule-material-field"});
  const {contentDigest,documentRevision,...content}=view;
  return reviewDigest(content);
}
// All members are bound, including failures. A representative opens every PDF
// page covering its source; group material brings all shown neighbors/history.
export function ruleMaterials(report,handoff,evidence,catalog,bindings) {
  bindings ??= reviewBindings(report,handoff,evidence);
  const verification=expressionRuleReviews(handoff,catalog);
  const losses=new Map(catalog.map((loss)=>[loss.lossId,loss]));
  const findings=new Map(report.findings.map((finding)=>[finding.id,finding]));
  const bySource=new Map();
  for (const group of report.groups) for (const id of new Set(group.findingIds.flatMap((id)=>findings.get(id)?.sourceIds ?? []))) {
    if (!bySource.has(id)) bySource.set(id,[]);
    bySource.get(id).push(group);
  }
  return verification.rules.map((rule)=> {
    const members=verification.items.filter((item)=>item.ruleId===rule.ruleId);
    const representatives=rule.representatives.map((rep)=> {
      const loss=losses.get(rep.lossId),groups=bySource.get(loss.sourceId) ?? [];
      const pages=[...new Set(groups.flatMap((group)=>group.pageNos))].sort((a,b)=>a-b);
      return {...rep,sourceId:loss.sourceId,targetPaths:loss.targets.map((target)=>target.path),
        comparisons:pages.map((pageNo)=> {
          const group=groups.find((group)=>group.pageNos.includes(pageNo));
          return {groupId:group.id,pageNo,contentDigest:bindings.get(group.id)};
        })};
    });
    const view={ruleId:rule.ruleId,version:rule.version,title:rule.title,method:rule.method,policyDigest:rule.policyDigest,
      members,representatives,generationId:handoff.provenance.generationId,documentRevision:handoff.snapshot.revision,contentDigest:null};
    view.contentDigest=ruleMaterialDigest(view);
    return view;
  });
}

// Recompute historical witnesses from validated baseline + correction history.
// No approval can manufacture a current digest for material its caller never saw.
// Caches belong to this single read operation, never to an instance or session.
export function ruleReviews(state,report,handoff,evidence,catalog,bindings) {
  if (state.reviewVersion!=="1.3.0") return {rules:[],items:[]};
  const current=ruleMaterials(report,handoff,evidence,catalog,bindings),byCount=new Map([[(handoff.history?.changes ?? []).length,current]]);
  const at=(count)=> {
    if (!byCount.has(count)) {
      const h=historicalReviewHandoff(handoff,count);
      byCount.set(count,ruleMaterials(report,h,evidence,catalog));
    }
    return byCount.get(count);
  };
  const validDecision=(decision,view)=> {
    try {
      const old=at(decision.changeCount).find((rule)=>rule.ruleId===view.ruleId);
      if (!old || decision.actor!=="human" || !decision.note?.trim() || !decision.time || decision.revision!==old.documentRevision ||
          decision.contentDigest!==old.contentDigest || decision.policyDigest!==view.policyDigest ||
          reviewDigest(decision.memberIds)!==reviewDigest(view.members.map((member)=>member.lossId))) return false;
      if (decision.decision!=="approved") return true;
      const receipts=new Map((state.ruleOpens ?? []).map((open)=>[open.openId,open]));
      const required=old.representatives.flatMap((rep)=>rep.comparisons.map((comparison)=>({rep,comparison})));
      return required.length>0 && decision.openIds.length===required.length && new Set(decision.openIds).size===required.length &&
        required.every(({rep,comparison})=>decision.openIds.some((id)=> {
          const open=receipts.get(id);
          return open && open.actor==="human" && open.time && open.ruleId===old.ruleId && open.lossId===rep.lossId &&
            open.changeCount===decision.changeCount && open.revision===old.documentRevision && open.ruleContentDigest===old.contentDigest &&
            open.groupId===comparison.groupId && open.pageNo===comparison.pageNo && open.contentDigest===comparison.contentDigest &&
            open.comparison==="source-and-current-side-by-side";
        }));
    } catch { return false; }
  };
  const rules=current.map((view)=> {
    // Latest decision always wins; an invalid latest record cannot expose an old approval.
    const decision=(state.ruleDecisions ?? []).filter((record)=>record.ruleId===view.ruleId).at(-1) ?? null;
    const valid=decision && !decision.invalidatedAt && validDecision(decision,view);
    return {...view,decision:valid ? decision : null};
  });
  const rulesById=new Map(rules.map((rule)=>[rule.ruleId,rule]));
  const verification=expressionRuleReviews(handoff,catalog);
  return {rules,items:verification.items.map((item)=> {
    const rule=rulesById.get(item.ruleId),decision=rule?.decision;
    return {...item,ruleConfirmation:item.status==="verified" && decision?.decision==="approved" ?
      {ruleId:item.ruleId,decisionId:decision.decisionId,actor:"human",time:decision.time,revision:decision.revision,
        contentDigest:decision.contentDigest,policyDigest:decision.policyDigest,meaning:"rule-approved-representation"} : null};
  })};
}
