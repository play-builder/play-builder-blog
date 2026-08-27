# English Tech Post authoring

이 디렉터리는 한국어 Tech Post의 영어 번역본을 저장한다. `_`로 시작하는 이 파일은 Astro Post collection에서 제외된다.

## 작성 규칙

1. 한국어 원문의 `translationKey`를 확인한다.
2. 이 디렉터리에 별도 Markdown 파일을 만든다.
3. 영어 파일에는 `locale: en`과 한국어 원문과 동일한 `translationKey`를 지정한다.
4. 제목, 설명, 본문을 각각 영어로 작성한다. 한국어 본문을 런타임에 자동 번역하거나 대신 노출하지 않는다.
5. Markdown Post에는 Notion의 `Status` 필드가 없으므로 Git diff, review, build 검증을 거친 뒤 병합한다.

예시:

```yaml
---
title: Security Group Connection Tracking
description: Explain the operational behavior in English.
locale: en
translationKey: security-group-connection-tracking
pubDatetime: 2026-02-24T08:24:00Z
tags:
  - security
  - aws
draft: false
---
```

같은 번역쌍에서 파일명과 공개 Slug는 같게 유지하는 것을 권장하지만, 번역 연결의 기준은 Slug가 아니라 `translationKey`다.
