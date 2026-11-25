import { activate as activatePdf } from "./pdf/host.mjs";
import { activate as activateWord } from "./word/host.mjs";
import { mergeRecentRows } from "./shared/recent.mjs";

export function activate(context) {
  const pdf = activatePdf(context);
  const word = activateWord();
  return {
    status: () => pdf.status(),
    operations: {
      "pdf-load": input => pdf.operations.load(input),
      "pdf-suggest": input => pdf.operations.suggest(input),
      "pdf-convert": input => pdf.operations.convert(input),
      "pdf-backup": input => pdf.operations.backup(input),
      "pdf-mapping": input => pdf.operations.mapping(input),
      "pdf-correct": input => pdf.operations.correct(input),
      "pdf-correctionResult": input => pdf.operations.correctionResult(input),
      "word-load": input => word.operations.load(input),
      "word-convert": input => word.operations.convert(input),
      "word-progress": input => word.operations.progress(input),
      "word-plan": input => word.operations.plan(input),
      "word-image": input => word.operations.image(input),
      "word-backup": input => word.operations.backup(input),
      "word-mapping": input => word.operations.mapping(input),
      "word-source": input => word.operations.source(input),
      "word-sourcePdf": input => word.operations.sourcePdf(input),
      async recent({ folders = [] }) {
        const [pdfList, wordList] = await Promise.allSettled([
          pdf.operations.recent({ folders }),
          word.operations.recent({ folders }),
        ]);
        return {
          rows: mergeRecentRows(pdfList.value?.rows ?? [], wordList.value?.rows ?? []),
          folders: pdfList.value?.folders ?? wordList.value?.folders ?? folders,
          incomplete: pdfList.status === "rejected" || wordList.status === "rejected",
        };
      },
    },
    async dispose() {
      pdf.dispose();
      await word.dispose();
    },
  };
}
