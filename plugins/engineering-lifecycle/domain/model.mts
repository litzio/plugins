
export type Kind = "document" | "anchor" | "customer" | "stakeholder" | "system" | "software" | "hardware" | "architecture" | "design" | "unit" | "measure" | "execution" | "evidence" | "change" | "problem" | "risk" | "finding";
export type ReviewState = "Draft" | "In review" | "Approved" | "Rejected";
export type ProcessState = "Not started" | "Ready" | "In progress" | "In review" | "Blocked" | "Completed" | "Not applicable";
export type Result = "Passed" | "Failed" | "Blocked" | "Not run";
export type LinkType = "extractedFrom" | "derivedFrom" | "refinedFrom" | "allocatedTo" | "realizedBy" | "verifiedBy" | "validatedBy" | "resultOf" | "evidenceFor" | "affectedBy" | "supersedes";
export type LinkReview = "Linked" | "Suspect" | "Reviewed";
export type ChangeState = "Proposed" | "Impact analysis" | "Owner review" | "Approved" | "Updating artifacts" | "Re-verification" | "Closed";
export type Disposition = "Pending" | "Affected" | "Unaffected";
export interface User { id: string; name: string; role: string }
export interface ProcessDefinition { code: string; label: string; area: string; route: string; section: string }
export interface ProcessInstance { code: string; state: ProcessState; owner: string; planned: number; approved: number; milestone: string; updated: string; exclusion?: string }
export interface Project { id: string; name: string; customer: string; type: string; owner: string; milestone: string; milestoneDate: string; latest: string; releases: Record<string, Release> }
export interface Release extends Snapshot { id: string; name: string; baselines: Baseline[] }
export interface SourceAnchor { document: string; version: string; page: number; section: string; x: number; y: number; width: number; height: number; quote: string }
export interface DocumentClause { code: string; title: string; paragraph: string }
export interface DocumentRevision {
  version: string;
  received: string;
  pages: { title: string; clauses: DocumentClause[] }[];
  attachment?: { filename:string; mime:string; base64:string; sha256:string };
}
export interface SourceDocument { current: string; revisions: DocumentRevision[]; applicability: string; state: string }
export interface RequirementRevision { revision: number; title: string; body: string; time: string; owner: string; change?: string }
export interface Requirement { type: string; classification: string; priority: string; method: string; rationale: string; implementation: string; applicability: string; criterion: string; revisions: RequirementRevision[] }
export interface VerificationMeasure { method: string; environment: string; criterion: string; procedure: string[]; preconditions: string; release: string; retestAfter?: string }
export interface VerificationResult { outcome: Result; observed: string; reason: string }
export interface VerificationExecution { measure: string; measureRevision: number; scope: string; environment: string; date: string; result: VerificationResult; targetRevisions?: Record<string,number>; criterion?: string }
export interface EvidenceArtifact { filename: string; mime: string; execution: string; content: string; waveform?: { time: number; value: number }[] }
export interface ArchitectureElement { domain: string; responsibility: string; interfaces: string[] }
export interface DesignElement { component: string; responsibility: string }
export interface SoftwareUnit { component: string; responsibility: string }
export interface ImpactCandidate { id: string; hops: number; path: string[]; owner: string; disposition: Disposition; rationale?: string }
export interface ChangeRequest { oldText: string; newText: string; target: string; state: ChangeState; candidates: ImpactCandidate[]; actions: { id: string; owner: string; text: string; done: boolean }[] }
export interface AssessmentEvidence { source: string; attribute: string; label: string; state: "Ready" | "Review" | "Missing" | "N/A" }
export interface AssessmentFinding { status: string; attribute: string; action?: string; due?: string }
export interface ProblemReport { severity: string; cause: string; action: string; state: string; execution?: string }
export interface Risk { likelihood: number; impact: number; residualLikelihood: number; residualImpact: number; strategy: string }
export interface Item { id: string; code: string; kind: Kind; title: string; body: string; owner: string; process: string; revision: number; review: ReviewState; applicable: boolean; date: string; requirement?: Requirement; source?: SourceAnchor; document?: SourceDocument; measure?: VerificationMeasure; execution?: VerificationExecution; evidence?: EvidenceArtifact; architecture?: ArchitectureElement; design?: DesignElement; unit?: SoftwareUnit; change?: ChangeRequest; finding?: AssessmentFinding; problem?: ProblemReport; risk?: Risk }
export interface Review { item: string; revision: number; author: string; comment: string; at: string }
export interface Approval { item: string; revision: number; author: string; decision: "Approved" | "Rejected"; at: string }
export interface TraceLink { id: string; from: string; to: string; type: LinkType; review: LinkReview; fromRevision: number; toRevision: number }
export interface TraceExpectation { from: string; targetKind: Kind; type: LinkType; to?: string; category: string }
export interface AuditEvent { id: string; at: string; action: string; actor: string; item?: string }
export interface AssessmentRecord { process: string; attribute: string; assessor: string; note: string; rating: "N" | "P" | "L" | "F"; at: string }
export interface Snapshot { model: string; items: Record<string, Item>; links: TraceLink[]; expectations: TraceExpectation[]; processes: ProcessInstance[]; assessments: Record<string, AssessmentEvidence[]>; assessorRecords: AssessmentRecord[]; reviews: Review[]; approvals: Approval[]; audit: AuditEvent[] }
export interface Baseline { id: string; created: string; approvedBy: string; snapshot: Snapshot }
export interface Workspace { schema: 1; marker: "litzio.engineering-lifecycle"; revision: number; resettable: boolean; users: User[]; projects: Project[]; applied: string[] }

export const definitions: Record<string, ProcessDefinition[]> = {
  "4.1": [
    ["SYS.1","Requirements elicitation","System","intake","4.3.1"], ["SYS.2","System requirements analysis","System","requirements","4.3.2"], ["SYS.3","System architectural design","System","architecture","4.3.3"], ["SYS.4","System integration & integration verification","System","verification","4.3.4"], ["SYS.5","System verification","System","verification","4.3.5"],
    ["SWE.1","Software requirements analysis","Software","requirements","4.4.1"], ["SWE.2","Software architectural design","Software","architecture","4.4.2"], ["SWE.3","Software detailed design & unit construction","Software","architecture","4.4.3"], ["SWE.4","Software unit verification","Software","verification","4.4.4"], ["SWE.5","Software component & integration verification","Software","verification","4.4.5"], ["SWE.6","Software verification","Software","verification","4.4.6"],
    ["HWE.1","Hardware requirements analysis","Hardware","requirements","4.7.1"], ["HWE.2","Hardware design","Hardware","architecture","4.7.2"], ["HWE.3","Verification against hardware design","Hardware","verification","4.7.3"], ["HWE.4","Verification against hardware requirements","Hardware","verification","4.7.4"], ["VAL.1","Validation","Validation","verification","4.5.1"],
    ["MAN.3","Project management","Management","planning","4.9.1"], ["MAN.5","Risk management","Management","risks","4.9.2"], ["MAN.6","Measurement","Management","planning","4.9.3"], ["SUP.1","Quality assurance","Support","risks","4.8.1"], ["SUP.8","Configuration management","Support","baselines","4.8.2"], ["SUP.9","Problem resolution management","Support","risks","4.8.3"], ["SUP.10","Change request management","Support","impact","4.8.4"], ["SPL.2","Product release","Support","planning","4.2.1"],
  ].map(([code, label, area, route, section]) => ({ code, label, area, route, section })),
};
export const requirementKinds: Kind[] = ["customer", "stakeholder", "system", "software", "hardware"];
export const labels: Record<Kind, string> = { document:"Source document", anchor:"Source clause", customer:"Customer requirement", stakeholder:"Stakeholder requirement", system:"System requirement", software:"Software requirement", hardware:"Hardware requirement", architecture:"Architecture", design:"Design", unit:"Software unit", measure:"Verification measure", execution:"Execution", evidence:"Evidence", change:"Change request", problem:"Problem", risk:"Risk", finding:"Assessment gap" };
export const kindColumns: Kind[][] = [["document","anchor"],["customer"],["stakeholder"],["system"],["architecture","software","hardware","design","unit","problem","risk","change","finding"],["measure","execution","evidence"]];
export const directedTypes: { type: LinkType; from: Kind[]; to: Kind[]; impact: boolean }[] = [
  {type:"extractedFrom",from:["anchor"],to:["customer"],impact:true},
  {type:"derivedFrom",from:["customer","stakeholder","system","architecture","design"],to:requirementKinds,impact:true},
  {type:"refinedFrom",from:requirementKinds,to:requirementKinds,impact:true},
  {type:"allocatedTo",from:requirementKinds,to:["architecture","design","unit"],impact:true},
  {type:"realizedBy",from:["architecture","software","hardware","design"],to:["design","unit"],impact:true},
  {type:"verifiedBy",from:[...requirementKinds,"architecture","design","unit"],to:["measure"],impact:true},
  {type:"validatedBy",from:["customer","stakeholder"],to:["measure"],impact:true},
  {type:"resultOf",from:["measure"],to:["execution"],impact:true},
  {type:"evidenceFor",from:["document","execution"],to:["anchor","evidence"],impact:true},
  {type:"affectedBy",from:[...requirementKinds,"architecture","measure","execution","finding","problem","risk","change"],to:[...requirementKinds,"architecture","measure","execution","finding","problem","risk","change"],impact:false},
  {type:"supersedes",from:requirementKinds,to:requirementKinds,impact:false},
];
export const idFor = (project: string, code: string) => project + "/" + code;
export function snapshotOf(release: Release): Snapshot {
  const { model,items,links,expectations,processes,assessments,assessorRecords,reviews,approvals,audit } = release;
  return structuredClone({ model,items,links,expectations,processes,assessments,assessorRecords,reviews,approvals,audit });
}
export function linkBetween(from: Item, to: Item, type: LinkType, review: LinkReview = "Linked"): TraceLink {
  return { id: from.id + ">" + type + ">" + to.id, from: from.id, to: to.id, type, review, fromRevision: from.revision, toRevision: to.revision };
}
export function acceptsLink(from: Item, to: Item, type: LinkType) {
  return from.id !== to.id && directedTypes.some(row => row.type === type && row.from.includes(from.kind) && row.to.includes(to.kind));
}
export function consistency(link: TraceLink, items: Record<string,Item>): LinkReview {
  return (items[link.from]?.revision !== link.fromRevision || items[link.to]?.revision !== link.toRevision) ? "Suspect" : link.review;
}
export function scopeOf(workspace: Workspace, projectId: string, releaseId: string, baseline?: string) {
  const project = workspace.projects.find(candidate => candidate.id === projectId);
  const release = project?.releases[releaseId];
  if (!release || !project) throw new Error("Select an available project and release.");
  const scope = baseline ? release.baselines.find(value => value.id === baseline)?.snapshot : release;
  if (!scope) throw new Error("Select an available baseline.");
  return { project, release, scope };
}
