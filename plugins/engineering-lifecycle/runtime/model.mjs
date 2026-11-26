export const definitions = {
    "4.1": [
        ["SYS.1", "Requirements elicitation", "System", "intake", "4.3.1"], ["SYS.2", "System requirements analysis", "System", "requirements", "4.3.2"], ["SYS.3", "System architectural design", "System", "architecture", "4.3.3"], ["SYS.4", "System integration & integration verification", "System", "verification", "4.3.4"], ["SYS.5", "System verification", "System", "verification", "4.3.5"],
        ["SWE.1", "Software requirements analysis", "Software", "requirements", "4.4.1"], ["SWE.2", "Software architectural design", "Software", "architecture", "4.4.2"], ["SWE.3", "Software detailed design & unit construction", "Software", "architecture", "4.4.3"], ["SWE.4", "Software unit verification", "Software", "verification", "4.4.4"], ["SWE.5", "Software component & integration verification", "Software", "verification", "4.4.5"], ["SWE.6", "Software verification", "Software", "verification", "4.4.6"],
        ["HWE.1", "Hardware requirements analysis", "Hardware", "requirements", "4.7.1"], ["HWE.2", "Hardware design", "Hardware", "architecture", "4.7.2"], ["HWE.3", "Verification against hardware design", "Hardware", "verification", "4.7.3"], ["HWE.4", "Verification against hardware requirements", "Hardware", "verification", "4.7.4"], ["VAL.1", "Validation", "Validation", "verification", "4.5.1"],
        ["MAN.3", "Project management", "Management", "planning", "4.9.1"], ["MAN.5", "Risk management", "Management", "risks", "4.9.2"], ["MAN.6", "Measurement", "Management", "planning", "4.9.3"], ["SUP.1", "Quality assurance", "Support", "risks", "4.8.1"], ["SUP.8", "Configuration management", "Support", "baselines", "4.8.2"], ["SUP.9", "Problem resolution management", "Support", "risks", "4.8.3"], ["SUP.10", "Change request management", "Support", "impact", "4.8.4"], ["SPL.2", "Product release", "Support", "planning", "4.2.1"],
    ].map(([code, label, area, route, section]) => ({ code, label, area, route, section })),
};
export const requirementKinds = ["customer", "stakeholder", "system", "software", "hardware"];
export const labels = { document: "Source document", anchor: "Source clause", customer: "Customer requirement", stakeholder: "Stakeholder requirement", system: "System requirement", software: "Software requirement", hardware: "Hardware requirement", architecture: "Architecture", design: "Design", unit: "Software unit", measure: "Verification measure", execution: "Execution", evidence: "Evidence", change: "Change request", problem: "Problem", risk: "Risk", finding: "Assessment gap" };
export const kindColumns = [["document", "anchor"], ["customer"], ["stakeholder"], ["system"], ["architecture", "software", "hardware", "design", "unit", "problem", "risk", "change", "finding"], ["measure", "execution", "evidence"]];
export const directedTypes = [
    { type: "extractedFrom", from: ["anchor"], to: ["customer"], impact: true },
    { type: "derivedFrom", from: ["customer", "stakeholder", "system", "architecture", "design"], to: requirementKinds, impact: true },
    { type: "refinedFrom", from: requirementKinds, to: requirementKinds, impact: true },
    { type: "allocatedTo", from: requirementKinds, to: ["architecture", "design", "unit"], impact: true },
    { type: "realizedBy", from: ["architecture", "software", "hardware", "design"], to: ["design", "unit"], impact: true },
    { type: "verifiedBy", from: [...requirementKinds, "architecture", "design", "unit"], to: ["measure"], impact: true },
    { type: "validatedBy", from: ["customer", "stakeholder"], to: ["measure"], impact: true },
    { type: "resultOf", from: ["measure"], to: ["execution"], impact: true },
    { type: "evidenceFor", from: ["document", "execution"], to: ["anchor", "evidence"], impact: true },
    { type: "affectedBy", from: [...requirementKinds, "architecture", "measure", "execution", "finding", "problem", "risk", "change"], to: [...requirementKinds, "architecture", "measure", "execution", "finding", "problem", "risk", "change"], impact: false },
    { type: "supersedes", from: requirementKinds, to: requirementKinds, impact: false },
];
export const idFor = (project, code) => project + "/" + code;
export function snapshotOf(release) {
    const { model, items, links, expectations, processes, assessments, assessorRecords, reviews, approvals, audit } = release;
    return structuredClone({ model, items, links, expectations, processes, assessments, assessorRecords, reviews, approvals, audit });
}
export function linkBetween(from, to, type, review = "Linked") {
    return { id: from.id + ">" + type + ">" + to.id, from: from.id, to: to.id, type, review, fromRevision: from.revision, toRevision: to.revision };
}
export function acceptsLink(from, to, type) {
    return from.id !== to.id && directedTypes.some(row => row.type === type && row.from.includes(from.kind) && row.to.includes(to.kind));
}
export function consistency(link, items) {
    return (items[link.from]?.revision !== link.fromRevision || items[link.to]?.revision !== link.toRevision) ? "Suspect" : link.review;
}
export function scopeOf(workspace, projectId, releaseId, baseline) {
    const project = workspace.projects.find(candidate => candidate.id === projectId);
    const release = project?.releases[releaseId];
    if (!release || !project)
        throw new Error("Select an available project and release.");
    const scope = baseline ? release.baselines.find(value => value.id === baseline)?.snapshot : release;
    if (!scope)
        throw new Error("Select an available baseline.");
    return { project, release, scope };
}
