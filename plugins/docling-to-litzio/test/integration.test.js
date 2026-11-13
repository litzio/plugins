import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadHandoff } from "../src/provenance.js";
import { generate } from "../src/generate.js";
import { readBundle, makePlan, hash } from "../src/convert.js";
const cli = process.env.DOCLING_TEST_CLI;
test(
  "isolated official CLI: three fixtures, readback, assets, conflicts and incomplete failure",
  { skip: !cli },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "docling-pr2-integration-"));
    console.log("Retained integration directory:", root);
    const fixtures = [
      [
        "lsr",
        "fixtures/lsr-1.1/converted",
        "fixtures/lsr-1.1/ground_truth/standards.json",
      ],
      [
        "no-bookmarks",
        "fixtures/lsr-1.1/converted/no-bookmarks",
        "fixtures/lsr-1.1/ground_truth/standards-no-bookmarks.json",
      ],
      ["nist", "fixtures/nist-sp1108r4/converted"],
    ];
    for (const [name, folder, oracle] of fixtures) {
      const before = await readBundle(folder),
        evidence = spawnSync(
          "python",
          [
            resolve("plugins/docling-to-litzio/src/audit_bookmarks.py"),
            resolve(folder, before.record.source.file),
          ],
          { encoding: "utf8" },
        );
      assert.equal(evidence.status, 0);
      const ef = join(root, name + "-bookmarks.json");
      await writeFile(ef, evidence.stdout);
      const out = join(root, name),
        result = await generate(
          resolve(folder),
          out,
          cli,
          oracle && resolve(oracle),
          ef,
        );
      assert.equal(result.generationMismatches, 0);
      assert.equal(result.status, "generated-draft");
      assert.equal(
        result.source.doclingSha256,
        (await readBundle(folder)).source.doclingSha256,
      );
      const saved = await readFile(join(out, "document.md"));
      await assert.rejects(generate(resolve(folder), out, cli), /EEXIST/);
      assert.equal(hash(saved), hash(await readFile(join(out, "document.md"))));
      const correction = Buffer.concat([
        saved,
        Buffer.from("\nTemporary correction fixture\n"),
      ]);
      await writeFile(join(out, "document.md"), correction);
      await assert.rejects(generate(resolve(folder), out, cli), /EEXIST/);
      assert.equal(
        hash(await readFile(join(out, "document.md"))),
        hash(correction),
      );
      await assert.rejects(loadHandoff(out), /file-digest/);
      await writeFile(join(out, "document.md"), saved); // Restore only this test-owned injection.
      const report = JSON.parse(
        await readFile(join(out, "provenance.json"), "utf8"),
      );
      assert(
        report.items.every(
          (i) => i.disposition !== "mapped" || i.targets.length > 0,
        ),
      );
      const handoff = await loadHandoff(out);
      assert.equal(handoff.coverage.sourceItems, report.items.length);
      await assert.rejects(
        loadHandoff(out, { requireReviewed: true }),
        /review-unavailable/,
      );
      const snapshot = JSON.parse(
        await readFile(join(out, "snapshot.json"), "utf8"),
      );
      assert.equal(result.losses, name === "nist" ? 0 : 31);
      assert.equal(
        snapshot.nodes.filter((n) => n.type === "footnote").length,
        name === "nist" ? 7 : 1,
      );
      assert.equal(
        snapshot.nodes.filter((n) => n.type === "table" && n.caption?.length)
          .length,
        name === "nist" ? 3 : 7,
      );
      for (const ref of before.doc.tables.flatMap((t) => t.captions ?? [])) {
        const caption = handoff.provenance.items.find(
          (i) => i.selfRef === ref.$ref,
        );
        assert(
          caption.regions.length &&
            caption.targets.some((t) =>
              snapshot.nodes.some(
                (n) =>
                  n.type === "table" &&
                  JSON.stringify(n.path) === JSON.stringify(t.path),
              ),
            ),
        );
      }
      for (const note of handoff.provenance.items.filter(
        (i) => i.structure.noteBinding,
      )) {
        assert(
          note.regions.length &&
            note.targets.some((t) =>
              snapshot.nodes.some(
                (n) =>
                  n.type === "footnote" &&
                  n.label === note.structure.noteBinding.label &&
                  JSON.stringify(n.path) === JSON.stringify(t.path),
              ),
            ),
        );
      }
      const plan = makePlan(before),
        receipt = JSON.parse(await readFile(join(out, "receipt.json"), "utf8"));
      for (const entry of plan.items.filter((i) => i.asset)) {
        const target = receipt.inputs.find((r) => r.key === entry.links[0].key)
          .targets[0];
        const figure = snapshot.nodes.find(
          (n) => JSON.stringify(n.path) === JSON.stringify(target.path),
        );
        assert.equal(
          hash(await readFile(resolve(out, figure.imageUrl))),
          entry.asset.sha256,
        );
      }
      if (oracle) {
        assert.deepEqual(
          snapshot.nodes
            .filter((n) => n.type === "equation")
            .map((n) => n.enumerator),
          ["1", "2", "3"],
        );
        assert.deepEqual(
          snapshot.nodes
            .filter((n) => n.type === "figure")
            .map((n) => n.enumerator),
          ["K.1", "K.2"],
        );

        const scored = JSON.parse(
          await readFile(join(out, "score.json"), "utf8"),
        );
        assert(Object.values(scored.metrics).every((m) => m.generation === 0));
      }
    }
    const failed = join(root, "failed");
    await assert.rejects(
      generate(resolve(fixtures[0][1]), failed, join(root, "missing-cli.mjs")),
    );
    assert.equal(
      JSON.parse(await readFile(join(failed, "generation.json"), "utf8"))
        .status,
      "incomplete",
    );
  },
);
