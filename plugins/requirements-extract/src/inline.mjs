// Fields are the public CLI compare projection, not Markdown source spelling.
// One definition keeps coverage, model validation and XHTML emission aligned.
export const inlineFields = Object.freeze({
  text: 'text', code: 'value', strong: 'children', emphasis: 'children',
  subscript: 'children', superscript: 'children', delete: 'children', link: 'children',
  footnote: 'label', math: 'value', reference: 'label', citation: 'keys', break: null,
});
export const inlineTags = Object.freeze({ code: 'code', strong: 'strong', emphasis: 'em', subscript: 'sub', superscript: 'sup', delete: 'del' });
export const inlineKeys = kind => ['kind', ...(kind === 'break' ? [] : [inlineFields[kind]]), ...(kind === 'link' ? ['url'] : ['reference', 'citation'].includes(kind) ? ['role'] : [])];
export const validInlineValue = c => c.kind === 'break' || (['children', 'keys'].includes(inlineFields[c.kind])
  ? Array.isArray(c[inlineFields[c.kind]]) && (c.kind !== 'link' || typeof c.url === 'string') : typeof c[inlineFields[c.kind]] === 'string');
