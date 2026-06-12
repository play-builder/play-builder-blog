---
title: Kinesis의 숨겨진 터보 버튼 (Enhanced Fan-Out)
description: ProvisionedThroughputExceededException의 범인은 샤드 대역폭을 나눠 먹는 컨슈머들이다. 컨슈머별 전용 2MB/s 파이프와 HTTP/2 Push를 제공하는 Enhanced Fan-Out의 원리와 적용 기준.
pubDatetime: 2026-02-01T16:20:00Z
tags:
  - observability
  - aws
  - kinesis
featured: false
draft: false
---

AWS Kinesis Data Streams를 운영하다 보면 누구나 한 번쯤 마주치는 공포의 에러 메시지가 있습니다.

> `ProvisionedThroughputExceededException`

샤드 좀 넉넉히 늘린 것 같은데 왜 자꾸 터지지? 하고 로그를 까보면, 범인은 십중팔구 **여러 개의 컨슈머들이 서로 데이터를 가져가겠다고 싸우고 있기 때문**입니다.

## Table of contents

## 1. 문제의 가능성

- **상황:** 샤드 하나는 초당 **2MB**의 Throughput을 가집니다.
- **문제:** 만약 이 샤드에 컨슈머 애플리케이션이 3개(A: 데이터 분석, B: S3 백업, C: 실시간 알림) 붙어있다면?
- **결과:** 2MB라는 파이를 3명이 나눠 먹습니다. (각자 약 0.6MB/s)

**Standard 방식**은 **`Polling(풀링) 방식`**입니다. 컨슈머가 Kinesis에게 "데이터 있어?"라고 **0.2초마다** 계속 물어봐야 하죠. 컨슈머가 늘어날수록 서로 물어보느라 바빠서 정작 데이터를 못 가져가는 병목이 발생하게 되죠.

![Enhanced Fan-Out 구조](@/assets/images/kinesis-enhanced-fan-out/efo-diagram.png)

## 2. 전용 파이프 (Enhanced Fan-Out)

**전용 대역폭:** EFO를 등록한 컨슈머는 남들과 경쟁하지 않습니다. 샤드 용량과 무관하게 **자신만의 독립적인 2MB/s 파이프**를 받습니다. 마치 VIP 대접을 받는 거죠.

**HTTP/2 Push:** 더 이상 "데이터 있어?"라고 묻지 않습니다. Kinesis가 데이터가 들어오자마자 **HTTP/2 연결을 통해 컨슈머에게 꽂아줍니다(Push).**

| 특징 | Standard Consumer (기본) | Enhanced Fan-Out (EFO) |
| --- | --- | --- |
| 통신 방식 | Polling (HTTP/1.1) | **Push (HTTP/2)** |
| 대역폭 | 모든 컨슈머가 2MB/s **공유** | 컨슈머마다 2MB/s **독점** |
| 평균 지연(Latency) | 200ms ~ 1초 이상 | **~70ms** (매우 빠름) |
| 컨슈머 제한 | 샤드당 권장 5개 미만 | 샤드당 최대 20개 |
| 비용 | 기본 샤드 비용에 포함 | **추가 비용 발생** (데이터 처리량 + 시간) |

## 3. 언제 EFO를 써야 할까? (Use Cases)

무조건 EFO가 좋은 건 아닙니다. 비용이 들기 때문이죠.

### 시나리오: 가상화폐 거래소 데이터 파이프라인

데이터가 Kinesis로 들어올 때, 목적에 따라 컨슈머를 다르게 구성합니다.

1. **S3 데이터 레이크 저장 (로그용)**
   - **요구사항:** 실시간성 중요하지 않음. 1분 늦게 저장돼도 상관없음.
   - **선택:** 👉 **Standard Consumer**
2. **실시간 차트/호가창 업데이트 (사용자 경험)**
   - **요구사항:** 0.1초라도 늦으면 고객 이탈.
   - **선택:** 👉 **Enhanced Fan-Out**

## 4. 적용

EFO를 적용하는 건 코드 수정이 거의 필요 없습니다. 인프라 설정만 하면 됩니다.

```hcl
resource "aws_kinesis_stream" "example" {
  name        = "my-stream"
  shard_count = 1
}

resource "aws_kinesis_stream_consumer" "example" {
  name       = "fast-consumer"
  stream_arn = aws_kinesis_stream.example.arn
}
```

애플리케이션에서는 별도 설정 없이, 등록된 Consumer ARN을 사용하기만 하면 자동으로 HTTP/2 Push 모드로 동작합니다.
