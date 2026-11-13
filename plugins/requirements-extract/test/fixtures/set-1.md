---
litzio: 1
title: 합성 시스템 요구사항
---

# 요구사항 문서

:::{table}

| 필드              | 값                                        |
| --------------- | ---------------------------------------- |
| profile         | requirements-extract/1                   |
| setId           | set-36b7797a-67e0-4cad-8121-000000000002 |
| exportNamespace | 8ecdb7b1-138e-49c8-a1e1-89a56f63a274     |
| defaultLevel    | system                                   |
:::

:::{table}

| sourceKey | artifactDigest                                                          | nativeFile         | nativeDigest                                                            | mapFile            |
| --------- | ----------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- | ------------------ |
| synthetic | sha256:8dd6df18f39390a986871f41f0f834c9642375d9b6d043fe4ff450bdb7095609 | synthetic-input.md | sha256:c5c8a2d18e823defe026aa0e8e6164b3d99c3de20f1b7f16d11a2a11697b1344 | synthetic-map.json |
:::

(req-1593c157-e436-422d-a7aa-000000000004)=

## 차단 유지

:::{table}

| 필드              | 값                                                                       |
| --------------- | ----------------------------------------------------------------------- |
| id              | req-1593c157-e436-422d-a7aa-000000000004                                |
| kind            | performance                                                             |
| level           | system                                                                  |
| origin          | derived                                                                 |
| strength        | mandatory                                                               |
| status          | confirmed                                                               |
| verification    | test                                                                    |
| rationale       | 공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.                               |
| confirmedDigest | sha256:1ba47f85e0e3fcddce76eaab8cbf554bd6794339484fd875bcdf3a373eacb89b |
:::

### 본문

차단 출력은 0 ≤ t ≤ 10 ms 동안 유지해야 한다.

### 출처

:::{table}

| sourceKey | elementRef | selector | quote                            | quoteDigest                                                             |
| --------- | ---------- | -------- | -------------------------------- | ----------------------------------------------------------------------- |
| synthetic | #/texts/4  | full     | 차단 출력은 0 ≤ t ≤ 10 ms 동안 유지해야 한다. | sha256:4585e44365405e7b2effacafb2a6aaa11432554b79cfa5df7d69bdae64d3a058 |
:::

### 연결

:::{table}

| role      | targetId                                 | rationale     |
| --------- | ---------------------------------------- | ------------- |
| refines   | req-1593c157-e436-422d-a7aa-000000000001 | 합성 상위 조건의 구체화 |
| relatesTo | req-1593c157-e436-422d-a7aa-000000000005 | 동작 조건 관련      |
:::

(req-1593c157-e436-422d-a7aa-000000000005)=

## 온도 오차

:::{table}

| 필드              | 값                                                                       |
| --------------- | ----------------------------------------------------------------------- |
| id              | req-1593c157-e436-422d-a7aa-000000000005                                |
| kind            | performance                                                             |
| level           | system                                                                  |
| origin          | derived                                                                 |
| strength        | mandatory                                                               |
| status          | confirmed                                                               |
| verification    | test                                                                    |
| rationale       | 공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.                               |
| confirmedDigest | sha256:8996433c009fc268d18c0f094b21e262513fab6a58b50bf448623c10c9208a6a |
:::

### 본문

온도 오차는 ±0.5 °C 이하이어야 한다.

:::{table}

| 조건 | 허용값      |
| -- | -------- |
| 정상 | ≤ 0.5 °C |
| 대기 | < 1.0 °C |
:::

### 출처

:::{table}

| sourceKey | elementRef | selector | quote                    | quoteDigest                                                             |
| --------- | ---------- | -------- | ------------------------ | ----------------------------------------------------------------------- |
| synthetic | #/texts/5  | full     | 온도 오차는 ±0.5 °C 이하이어야 한다. | sha256:fd72bfa29334c007233683bfbc892121e42030676803328885648510d3adf62d |
:::

### 연결

:::{table}

| role    | targetId                                 | rationale     |
| ------- | ---------------------------------------- | ------------- |
| refines | req-1593c157-e436-422d-a7aa-000000000002 | 합성 상위 조건의 구체화 |
:::

(req-1593c157-e436-422d-a7aa-000000000006)=

## 문자 보존

:::{table}

| 필드              | 값                                                                       |
| --------------- | ----------------------------------------------------------------------- |
| id              | req-1593c157-e436-422d-a7aa-000000000006                                |
| kind            | performance                                                             |
| level           | system                                                                  |
| origin          | derived                                                                 |
| strength        | mandatory                                                               |
| status          | confirmed                                                               |
| verification    | test                                                                    |
| rationale       | 공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.                               |
| confirmedDigest | sha256:391037bce081be5646dd31208a029104bc74003d8d95eefff24259924863ded0 |
:::

### 본문

상태 문자열 A & B < C > D "확인"과 역슬래시 \ 및 | 문자를 보존해야 한다.

### 출처

:::{table}

| sourceKey | elementRef | selector | quote                                               | quoteDigest                                                             |
| --------- | ---------- | -------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| synthetic | #/texts/6  | full     | 상태 문자열 A & B < C > D "확인"과 역슬래시 \ 및 \| 문자를 보존해야 한다. | sha256:9fec02383fed744ba9d1142fbc728f3efd12c8b20b31be2f31d6834442204cb3 |
:::

### 연결

:::{table}

| role    | targetId                                 | rationale     |
| ------- | ---------------------------------------- | ------------- |
| refines | req-1593c157-e436-422d-a7aa-000000000003 | 합성 상위 조건의 구체화 |
:::
