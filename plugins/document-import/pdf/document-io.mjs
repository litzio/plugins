import { machineNodes, getEditableDocument, mergeParagraphWithPrevious, splitParagraph, serialize,
  convertBlock, updateHeadingLevel, removeBlock, insertParagraph, insertHeading, insertList, updateList,
  insertAdmonition, insertTable, updateTableCaption, updateLabel, updateEnumerator, updateEnumeration,
  updateDocumentTitle, updateParagraphInlineContent, updateHeadingInlineContent, updateAdmonitionInlineContent,
  insertTableNote, removeTableNote } from '@litzio/plugin-sdk';
import { readDocument } from '@litzio/plugin-sdk/node';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const documentNodes = document => machineNodes(getEditableDocument(document));
// A saved document's revision is the SHA-256 of its bytes; reading it does not parse the document.
export const fileRevision = file => createHash('sha256').update(readFileSync(file)).digest('hex');
// The revision the official write gives a document held in memory.
export const documentRevision = document => createHash('sha256').update(serialize(document), 'utf8').digest('hex');
export function snapshotOf(revision, document) {
  const editable = getEditableDocument(document);
  return {revision, document, status:editable.status, title:editable.title ?? null, nodes:machineNodes(editable)};
}
export function inspectDocument(file) {
  const {revision, document} = readDocument(file);
  return snapshotOf(revision, document);
}
const at = path => path.split('.').map(Number);
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
      case 'update-list': document=updateList(document,blockPath,op.list); break;
      case 'insert-admonition': document=insertAdmonition(document,op.at,op.variant,op.content); break;
      case 'insert-table': document=insertTable(document,op.at,op.cells); break;
      case 'update-table-caption': document=updateTableCaption(document,blockPath,op.content); break;
      case 'update-label': document=updateLabel(document,blockPath,op.label); break;
      case 'update-enumerator': document=updateEnumerator(document,blockPath,op.enumerator); break;
      case 'update-enumeration': document=updateEnumeration(document,blockPath,op.enumerated); break;
      case 'update-paragraph': document=updateParagraphInlineContent(document,at(op.path),op.content); break;
      case 'update-heading-content': document=updateHeadingInlineContent(document,at(op.path),op.content); break;
      case 'update-admonition-content': document=updateAdmonitionInlineContent(document,at(op.path),op.content); break;
      case 'insert-table-note': document=insertTableNote(document,at(op.path),op.at,op.content); break;
      case 'remove-table-note': document=removeTableNote(document,at(op.path),op.at); break;
      case 'update-title': document=updateDocumentTitle(document,op.remove?null:op.text); break;
      case 'format': break;
      default: throw Error('지원하지 않는 고치기입니다.');
    }
  }
  return document;
}
