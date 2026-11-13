# 표 규칙 전후 — LSR 고정 표본

공식 CLI inspect로 읽은 실제 출력의 일부다. 화면을 사람이 열어 본 결과는 아니다. 좌표는 원문 기준이며 원문 셀과 span은 대응 파일에 전부 보존된다. 빈 칸으로 바꾸면 누락으로 오해하기 쉬워 값을 반복하고, 아래 설명을 넣는 방식을 택했다. 모든 병합 표는 검수 대상으로 남긴다.

## #/tables/2

원본 7×7 → 출력 6×7. 원본 머리 2행을 1행으로 합쳤다.

원본 머리/병합 셀 일부:

| 원본 행/열(1-based) | 높이×폭 | 원문 |
| --- | --- | --- |
| R1/C1 | 2×1 | Parameter |
| R1/C2 | 1×3 | Steady observations |
| R1/C5 | 1×3 | Transient observations |
| R2/C2 | 1×1 | Accuracy |
| R2/C3 | 1×1 | Window |
| R2/C4 | 1×1 | Range |
| R2/C5 | 1×1 | Accuracy |
| R2/C6 | 1×1 | Window |
| R2/C7 | 1×1 | Range |

실제 출력 첫 행과 본문 일부:

| Parameter | Steady observations – Accuracy | Steady observations – Window | Steady observations – Range | Transient observations – Accuracy | Transient observations – Window | Transient observations – Range |
| --- | --- | --- | --- | --- | --- | --- |
| Amplitude | ± 0.7% A | 12 cycles | 0.4 ≤ u ≤ 1.3 | ± 1.4% A | 3 cycles | 0.0 < u < 1.5 |
| Rate | ± 0.03 Hz | 48 cycles | 47.5 to 52.5 Hz | N/A | N/A | Not required |
| Active score | ± 3% B | 9 cycles | 0.15 < p < 0.95 | 0 | - | N/A |

표 바로 아래 실제 설명 문단:

원문 표 구조 안내: 원문 R1–2/C1, R1/C2–4, R1/C5–7 칸은 병합돼 있었습니다. 원문의 머리 2행은 ‘상위 머리 – 하위 머리’로 합쳤습니다. 좌표는 원문 기준입니다. 반복된 값은 행별 독립 값이 아니라 공통 조건·범위·합계일 수 있으므로 원문 구조를 검수해야 합니다.

## #/tables/3

원본 7×5 → 출력 6×5. 원본 머리 2행을 1행으로 합쳤다.

원본 머리/병합 셀 일부:

| 원본 행/열(1-based) | 높이×폭 | 원문 |
| --- | --- | --- |
| R1/C1 | 2×1 | Parameter |
| R1/C2 | 1×2 | Default settings |
| R1/C4 | 1×2 | Allowed settings |
| R2/C2 | 1×1 | Profile A |
| R2/C3 | 1×1 | Profile B |
| R2/C4 | 1×1 | Minimum |
| R2/C5 | 1×1 | Maximum |
| R5/C1 | 2×1 | Review path |
| R5/C2 | 1×2 | Archive stream |
| R6/C2 | 1×2 | Archive stream |
| R7/C2 | 1×2 | protcol pending |

실제 출력 첫 행과 본문 일부:

| Parameter | Default settings – Profile A | Default settings – Profile B | Allowed settings – Minimum | Allowed settings – Maximum |
| --- | --- | --- | --- | --- |
| Capture floor | ≥ 0.932 u a | ≥ 0.941 u | 0.90 u | 0.98 u |
| Delay factor |  |  |  |  |
| Review path | Archive stream | Archive stream | TCP | Ethernet |
| Review path | Archive stream | Archive stream | N/A | RS-422 |
| Record status | protcol pending | protcol pending |  | 0 |

표 바로 아래 실제 설명 문단:

원문 표 구조 안내: 원문 R1–2/C1, R1/C2–3, R1/C4–5, R5–6/C1, R5/C2–3, R6/C2–3, R7/C2–3 칸은 병합돼 있었습니다. 원문의 머리 2행은 ‘상위 머리 – 하위 머리’로 합쳤습니다. 좌표는 원문 기준입니다. 반복된 값은 행별 독립 값이 아니라 공통 조건·범위·합계일 수 있으므로 원문 구조를 검수해야 합니다.

## 번호 이관

| 원본 근거 | 실제 fixed 번호 | 남은 판정 |
| --- | --- | --- |
| formula.orig의 (1), (2), (3) | 1, 2, 3 | 전부 검수 대상; LaTeX 변경 없음 |
| Figure K.1 / Figure K.2 | K.1 / K.2 | caption prefix만 이관; 본문 caption 보존 |

명시 원본 flag 없이 복합 머리를 추측하지 않는다. 합계/범위/공통 조건 여부도 자동 확정하지 않는다. risk는 의심 이유이고, 원문을 검수해야 한다.
