import { resolve } from "node:path";
import { loadHandoff } from "./provenance.js";
const [folder, flag] = process.argv.slice(2);
if (!folder || (flag && flag !== "--require-reviewed"))
  throw new Error(
    "Usage: node src/read-handoff.js DIRECTORY [--require-reviewed]",
  );
const result = await loadHandoff(resolve(folder), {
  requireReviewed: flag === "--require-reviewed",
});
console.log(
  JSON.stringify(
    {
      generationId: result.provenance.generationId,
      schemaVersion: result.provenance.schemaVersion,
      reviewState: result.reviewComplete ? "reviewed" : "unreviewed",
      documentRevision: result.provenance.document.revision,
      coverage: result.coverage,
    },
    null,
    2,
  ),
);
