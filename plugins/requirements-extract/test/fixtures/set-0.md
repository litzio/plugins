---
litzio: 1
title: 합성 상위 요구사항
---

# 요구사항 문서

:::{table}

| 필드              | 값                                        |
| --------------- | ---------------------------------------- |
| profile         | requirements-extract/1                   |
| setId           | set-36b7797a-67e0-4cad-8121-000000000001 |
| exportNamespace | 8ecdb7b1-138e-49c8-a1e1-89a56f63a274     |
| defaultLevel    | stakeholder                              |
:::

:::{table}

| sourceKey | artifactDigest                                                          | nativeFile         | nativeDigest                                                            | mapFile            |
| --------- | ----------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- | ------------------ |
| synthetic | sha256:8dd6df18f39390a986871f41f0f834c9642375d9b6d043fe4ff450bdb7095609 | synthetic-input.md | sha256:c5c8a2d18e823defe026aa0e8e6164b3d99c3de20f1b7f16d11a2a11697b1344 | synthetic-map.json |
:::

(req-1593c157-e436-422d-a7aa-000000000001)=

## 차단 지연

:::{table}

| 필드              | 값                                                                       |
| --------------- | ----------------------------------------------------------------------- |
| id              | req-1593c157-e436-422d-a7aa-000000000001                                |
| kind            | performance                                                             |
| level           | stakeholder                                                             |
| origin          | derived                                                                 |
| strength        | mandatory                                                               |
| status          | confirmed                                                               |
| verification    | test                                                                    |
| rationale       | 공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.                               |
| confirmedDigest | sha256:f8c3531eef0ea003334bef1707b1245e77c037444939f74e8dbd32c81d222504 |
:::

### 본문

제어기는 요청 후 10 ms 이하에 출력을 차단해야 한다.

### 출처

:::{table}

| sourceKey | elementRef | selector | quote                            | quoteDigest                                                             |
| --------- | ---------- | -------- | -------------------------------- | ----------------------------------------------------------------------- |
| synthetic | #/texts/1  | full     | 제어기는 요청 후 10 ms 이하에 출력을 차단해야 한다. | sha256:952acece0e0e2f6484a0244e610b19f9e9c2fc49b6e2249a8eaa633380cdfb04 |
:::

### 연결

:::{table}

| role | targetId | rationale |
| ---- | -------- | --------- |
:::

(req-1593c157-e436-422d-a7aa-000000000002)=

## 동작 온도

:::{table}

| 필드              | 값                                                                       |
| --------------- | ----------------------------------------------------------------------- |
| id              | req-1593c157-e436-422d-a7aa-000000000002                                |
| kind            | performance                                                             |
| level           | stakeholder                                                             |
| origin          | derived                                                                 |
| strength        | mandatory                                                               |
| status          | confirmed                                                               |
| verification    | test                                                                    |
| rationale       | 공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.                               |
| confirmedDigest | sha256:6c38c1c50bfefb9715422b18956ae98ef79f68e8fca8cf1cec69258675ebfeb1 |
:::

### 본문

센서는 -40 °C ~ 85 °C 범위에서 동작해야 한다.

### 출처

:::{table}

| sourceKey | elementRef | selector | quote                            | quoteDigest                                                             |
| --------- | ---------- | -------- | -------------------------------- | ----------------------------------------------------------------------- |
| synthetic | #/texts/2  | full     | 센서는 -40 °C ~ 85 °C 범위에서 동작해야 한다. | sha256:6818575903a27b10a4c8b05c7b51eb4b366378d5601c3d7570acd3bfbd3b66ca |
:::

### 연결

:::{table}

| role | targetId | rationale |
| ---- | -------- | --------- |
:::

(req-1593c157-e436-422d-a7aa-000000000003)=

## 통신 전압

:::{table}

| 필드              | 값                                                                       |
| --------------- | ----------------------------------------------------------------------- |
| id              | req-1593c157-e436-422d-a7aa-000000000003                                |
| kind            | performance                                                             |
| level           | stakeholder                                                             |
| origin          | derived                                                                 |
| strength        | mandatory                                                               |
| status          | confirmed                                                               |
| verification    | test                                                                    |
| rationale       | 공개 가능한 가상 전장 요구사항. 합성 출처이며 PDF 추적 증거가 아님.                               |
| confirmedDigest | sha256:e2c079e68408cf487ff65a07e5592f1278bada8cfe91b959600be909702b6819 |
:::

### 본문

통신 전압은 0.10 V < U ≤ 5.0 V 조건을 만족해야 한다.

### 출처

:::{table}

| sourceKey | elementRef | selector | quote                                  | quoteDigest                                                             |
| --------- | ---------- | -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| synthetic | #/texts/3  | full     | 통신 전압은 0.10 V < U ≤ 5.0 V 조건을 만족해야 한다. | sha256:c4cf1cdb612225e4b87e3e755edd3c8a1978388f4682acd4c28457accd07309d |
:::

### 연결

:::{table}

| role | targetId | rationale |
| ---- | -------- | --------- |
:::
