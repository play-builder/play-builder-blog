---
title: "169.254.169.254의 정체: Link-Local Address"
description: 모든 EC2에서 똑같이 동작하는 메타데이터 주소 169.254.169.254의 원리(Link-Local)와, SSRF 공격을 막는 IMDSv2 강제 설정·검증 방법을 정리한다.
pubDatetime: 2026-01-29T17:18:00Z
tags:
  - infra
  - aws
  - security
featured: false
draft: false
---

전 세계 **어떤 리전(Region), 어떤 가용 영역(AZ), 어떤 타입의 EC2 인스턴스**를 생성하더라도, 그 안에서 `169.254.169.254`를 호출하면 **"자기 자신"**의 메타데이터 서비스로 연결됩니다.

## Table of contents

## 1. 169.254.169.254의 정체: Link-Local Address

이 IP는 인터넷상에 존재하는 서버 주소가 아닙니다. **약속된 특수 주소**입니다.

- **비유:** 호텔 객실 전화기의 "0번(프런트 데스크)"과 같습니다.
  - 서울 호텔에서 0번을 누르나, 뉴욕 호텔에서 0번을 누르나 똑같이 "그 호텔의 프런트"로 연결되죠?
  - 하지만 서울 호텔 0번과 뉴욕 호텔 0번은 서로 다른 곳입니다.
- **작동 원리:**
  1. EC2 내부에서 이 IP로 요청을 보냅니다.
  2. 이 요청은 인스턴스 밖(인터넷)으로 나가지 않습니다.
  3. EC2를 돌리고 있는 **물리적 호스트 서버(Hypervisor)**가 이 요청을 중간에 가로챕니다.
  4. 호스트가 "아, 이 요청은 i-12345 인스턴스가 보낸 거구나"라고 인식하고, 그에 맞는 정보를 리턴해줍니다.

## 2. 실무 포인트: IMDSv1 vs IMDSv2

팀에서 모든 기존 및 신규 Amazon EC2 인스턴스가 반드시 인스턴스 메타데이터 서비스 버전 2(**`IMDSv2`**)를 사용하도록 요구받는다면?

- AWS CLI에서 `HttpTokens=required` 옵션과 함께 `ec2 modify-instance-metadata-options` 명령을 사용하여 기존 인스턴스를 업데이트합니다.
- `ec2:RunInstances` API 작업을 사용할 때 `--metadata-options HttpTokens` 옵션을 `required`로 설정합니다.

1. **SSRF(Server-Side Request Forgery) 방어의 핵심:**
   - 과거 해커들은 웹 애플리케이션 취약점을 통해 `http://169.254.169.254/latest/meta-data/iam/security-credentials/`를 호출하여 서버의 IAM 권한을 탈취했습니다(`IMDSv1`).
   - 업비트/바이낸스와 같은 거래소는 모든 EC2 인스턴스에 IMDSv2를 강제함과 동시에, **WAF(Web Application Firewall)**에서도 메타데이터 IP 호출 패턴을 차단하는 이중 방어막을 칩니다.
2. **자동화된 규정 준수 검사 (AWS Config):**
   - `ec2-instance-imds-v2-enabled`라는 **`AWS Config 관리형 규칙`**을 활성화하여, 만약 누군가가 v1을 켜는 순간 즉시 알람이 울리고, Lambda가 트리거되어 해당 인스턴스를 격리하거나 설정을 강제로 되돌리는 자동화(Remediation)가 구축되어 있습니다.

```bash
# IMDSv1 방식 (단순 호출)
curl -s http://169.254.169.254/latest/meta-data/instance-id
```

하지만 최근 보안 강화 추세(SSRF 공격 방지)로 인해 **IMDSv2 (버전 2)** 사용을 강제하는 기업이 많습니다. 만약 회사 정책상 **"v2 필수"**가 걸려 있다면, 위 스크립트는 **작동하지 않습니다.**

**EC2 접속 후 테스트**

![IMDSv1 호출 테스트](@/assets/images/link-local-address-169-254-169-254/imdsv1-test.png)

**v2는 토큰(Token)이 필요합니다.**

```bash
# IMDSv2 방식 (토큰 발급 후 호출)
TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"`
```

```bash
[ec2-user@ip-10-0-0-10 ~]$ curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/
ami-id
ami-launch-index
ami-manifest-path
block-device-mapping/
events/
hostname
identity-credentials/
instance-action
instance-id
instance-life-cycle
instance-type
local-hostname
local-ipv4
mac
metrics/
network/
placement/
profile
public-hostname
public-ipv4
public-keys/
reservation-id
security-groups
services/
system
```

```bash
[ec2-user@ip-10-0-0-10 ~]$ curl -H "X-aws-ec2-metadata-token: $TOKEN" -s http://169.254.169.254/latest/meta-data/instance-id
```

![IMDSv2 토큰 호출 결과](@/assets/images/link-local-address-169-254-169-254/imdsv2-test.png)

AWS는 **새로 생성되는 인스턴스**에 대해 IMDSv2를 기본값으로 권장하고 있지만, 사용자가 명시적으로 끄지 않는 이상 **IMDSv1은 여전히 활성화 상태**로 유지되는 경우가 많습니다. AWS 공식 문서에 따르면 기존 인스턴스나 특정 AMI(Amazon Machine Image)는 호환성을 위해 IMDSv1과 IMDSv2를 모두 허용하는 `Optional` 모드로 실행될 수 있습니다.

**Terraform 설정 팁:** 인스턴스 생성 시 `metadata_options` 블록에서 `http_tokens = "required"`로 설정되어 있다면 **v1은 막힙니다.** v1으로 편하게 가려면 `optional`로 해야 하지만, 보안상 권장되지는 않습니다.
