// Existing deterministic scenarios now explicitly perform the client's material
// read before a submission. Preserve a supplied digest (especially stale probes
// and duplicate retries); production never fills in a missing digest.
export async function observed(service, method, input) {
  if (input && typeof input === "object" && !Object.hasOwn(input,"contentDigest")) {
    let digest;
    if (input.scopeId) digest=(await service.progress()).scopeDigests?.[input.scopeId];
    else {
      let groupId=input.groupId;
      if (!groupId && input.undoOf)
        groupId=(await service.progress()).changes.find((change)=>change.changeId===input.undoOf)?.groupId;
      if (groupId) digest=(await service.material(groupId)).contentDigest;
    }
    input.contentDigest=digest ?? "0".repeat(64);
  }
  return service[method](input);
}
