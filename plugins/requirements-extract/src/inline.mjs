// Fields are the public CLI compare projection, not Markdown source spelling.
// One definition keeps coverage, model validation and XHTML emission aligned.
export const inlineFields = Object.freeze({
  text: 'text', code: 'value', strong: 'children', emphasis: 'children',
  subscript: 'children', superscript: 'children',
});
export const inlineTags = Object.freeze({ code: 'code', strong: 'strong', emphasis: 'em', subscript: 'sub', superscript: 'sup' });
export const validInlineValue = c => inlineFields[c.kind] === 'children'
  ? Array.isArray(c.children) : typeof c[inlineFields[c.kind]] === 'string';
