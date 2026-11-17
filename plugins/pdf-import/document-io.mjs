import { machineNodes, getEditableDocument, mergeParagraphWithPrevious, splitParagraph,
  convertBlock, updateHeadingLevel, removeBlock, insertParagraph, insertHeading, insertList } from '@litzio/plugin-sdk';
import { readDocument } from '@litzio/plugin-sdk/node';

export const documentNodes = document => machineNodes(getEditableDocument(document));
export function inspectDocument(file) {
  const snapshot = readDocument(file);
  return {...snapshot, nodes:documentNodes(snapshot.document)};
}
// These descriptors are private correction history, not a second document model.
export function applyCorrections(document, operations) {
  for (const op of operations) {
    const blockPath = op.path?.split('.').map(Number);
    switch (op.command) {
      case 'merge-paragraph': document=mergeParagraphWithPrevious(document,blockPath); break;
      case 'split-paragraph': document=splitParagraph(document,blockPath,op.offset); break;
      case 'convert-block': {
        const node=documentNodes(document).find(n=>n.path.join('.')===op.path);
        document=node.type==='heading' && op.to==='heading'
          ? updateHeadingLevel(document,blockPath,node.level,op.level)
          : convertBlock(document,blockPath,{block:op.to,...(op.to==='heading'?{level:op.level}:{})});
        break;
      }
      case 'remove-block': document=removeBlock(document,op.at); break;
      case 'insert-block': document=insertParagraph(document,op.at,op.content); break;
      case 'insert-heading': document=insertHeading(document,op.at,op.level,op.content); break;
      case 'insert-list': document=insertList(document,op.at,op.list); break;
      case 'format': break;
      default: throw Error('지원하지 않는 고치기입니다.');
    }
  }
  return document;
}
