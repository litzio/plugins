import { digest, sha256 } from '../src/model.mjs';
export function sample() {
  const namespace = '8ecdb7b1-138e-49c8-a1e1-89a56f63a274';
  const id = n => 'req-1593c157-e436-422d-a7aa-' + String(n).padStart(12, '0');
  const texts = [
    '제어기는 요청 후 10 ms 이하에 출력을 차단해야 한다.',
    '센서는 -40 °C ~ 85 °C 범위에서 동작해야 한다.',
    '통신 전압은 0.10 V < U ≤ 5.0 V 조건을 만족해야 한다.',
    '차단 출력은 0 ≤ t ≤ 10 ms 동안 유지해야 한다.',
    '온도 오차는 ±0.5 °C 이하이어야 한다.',
    '상태 문자열 A & B < C > D "확인"과 역슬래시 \\ 및 | 문자를 보존해야 한다.',
  ];
  return [0, 1].map(set => ({
    profile: 'requirements-extract/1', title: set ? '합성 시스템 요구사항' : '합성 상위 요구사항', heading: '요구사항 문서',
    setId: 'set-36b7797a-67e0-4cad-8121-' + String(set + 1).padStart(12, '0'), exportNamespace: namespace, defaultLevel: set ? 'system' : 'stakeholder',
    registry: [{ sourceKey: 'synthetic', artifactDigest: sha256('synthetic-artifact'), nativeFile: 'synthetic-input.md', nativeDigest: sha256('synthetic-native'), mapFile: 'synthetic-map.json' }],
    requirements: texts.slice(set * 3, set * 3 + 3).map((text, i) => {
      const n = set * 3 + i + 1;
      const r = { id: id(n), title: ['차단 지연', '동작 온도', '통신 전압', '차단 유지', '온도 오차', '문자 보존'][n - 1],
        kind: 'performance', level: set ? 'system' : 'stakeholder', origin: 'derived', strength: 'mandatory', status: 'confirmed', verification: 'test', rationale: '공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.',
        body: [{ kind: 'paragraph', text }], sources: [{ sourceKey: 'synthetic', elementRef: '#/texts/' + n, selector: 'full', quote: text, quoteDigest: sha256(text) }],
        relations: set ? [{ role: 'refines', targetId: id(i + 1), rationale: '합성 상위 조건의 구체화' }, ...(i === 0 ? [{ role: 'relatesTo', targetId: id(5), rationale: '동작 조건 관련' }] : [])] : [],
      };
      if (n === 5) r.body.push({ kind: 'table', rows: [['조건', '허용값'], ['정상', '≤ 0.5 °C'], ['대기', '< 1.0 °C']] });
      r.confirmedDigest = digest(r); return r;
    }),
  }));
}
