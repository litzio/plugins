import { sample } from './sample.mjs';
const t = text => ({ kind: 'text', text });
export function richSample() {
  const sets = sample(), r = sets[1].requirements[0];
  r.body = [
    { kind: 'paragraph', content: [t('유량은 10'), { kind: 'superscript', children: [t('3')] }, t(' m'), { kind: 'superscript', children: [t('3')] }, t('/s, H'), { kind: 'subscript', children: [t('2')] }, t('O ≤ 5 mg/L '), { kind: 'footnote', label: 'limit-note' }] },
    { kind: 'table', label: 'limits', caption: [t('이 표는 '), { kind: 'strong', children: [t('85 °C에서만')] }, t(' 적용한다')], rows: [['조건', '허용값'], ['유량', [t('≤ 10'), { kind: 'superscript', children: [t('3')] }, t(' m³/s')]]] },
    { kind: 'list', ordered: true, start: 3, items: [{ content: [t('전압 -5 ≤ U ≤ 5 V')], list: { ordered: false, items: [{ content: [t('온도 0.10 °C '), { kind: 'footnote', label: 'limit-note' }] }] } }] },
    { kind: 'quote', content: [{ kind: 'emphasis', children: [t('합성 원문 조건')] }] },
    { kind: 'admonition', variant: 'note', content: [t('상위 조건을 함께 적용한다.')] },
    { kind: 'code', language: 'text', code: 'Signal_A < B & C' },
    { kind: 'divider' },
    { kind: 'paragraph', content: [{ kind: 'link', url: 'https://example.org/spec', children: [t('공개 예시')] }, t(' '), { kind: 'delete', children: [t('이전 조건')] }, { kind: 'break' }, t('새 조건 '), { kind: 'reference', role: 'ref', label: 'limits' }] },
  ];
  r.footnotes = [{ label: 'limit-note', content: [t('공통 조건: -40 °C ~ 85 °C, 최대 10'), { kind: 'superscript', children: [t('3')] }, t(' m³/s.')] }];
  return sets;
}
