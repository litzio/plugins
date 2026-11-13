const string = { type: 'string', minLength: 1 };
const strings = { type: 'array', items: string, uniqueItems: true };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const outputObject = properties => object(properties,Object.keys(properties).filter(k=>k!=='contextExclusions'));
export function selectionSchema(profile) {
  return object({
    schemaVersion: { const: 2 }, requestId: string, inputDigest: string, policyDigest: string,
    epoch: { type: 'integer', minimum: 1 }, sectionKey: string,
    sectionReview: object({ checked: { const: true }, reason: string, overlookedSegmentKeys: strings }),
    decisions: { type: 'array', items: object({
      candidateKey: string, decision: { enum: ['adopt', 'non-requirement', 'duplicate', 'context-needed', 'hold'] }, reason: string,
      choices: object({ ...Object.fromEntries(Object.entries(profile.choices).map(([k, v]) => [k, { enum: v }])), transformation: { enum: profile.transformations }, quality: { enum: profile.quality } }),
      duplicateOf: { type: ['string', 'null'] }, unresolved: strings,
      contextAssessments: { type: 'array', items: object({ contextKey: string, outcome: { enum: ['apply', 'not-applicable', 'needs-more'] }, reason: string }) },
      outputs: { type: 'array', items: outputObject({ contextExclusions:{type:'array',items:object({contextKey:string,reason:string})}, outputKey: {type:'string',pattern:'^[A-Za-z0-9_-]+$'}, title: string, bodyBlocks: { type: 'array', minItems: 1, items: { type: 'object', required: ['kind'], properties: { kind: string }, additionalProperties: true } }, sourceCandidateKeys: strings, contextKeys: strings, rationale: string, relations: { type: 'array', maxItems: 0 }, sourceRegionMappings: {type:'array',items:object({outputRegionKey:string,sourceRegionKey:string})}, protectedTokenMappings: { type: 'array', items: object({ outputTokenKey: string, sourceTokenKey: string }) } }) },
    }) },
  });
}
