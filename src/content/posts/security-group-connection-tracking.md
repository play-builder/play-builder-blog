---
title: "SG 격리했는데 공격자 세션이 안 끊겼다 — Connection Tracking을 몰랐던 대가"
description: Security Group의 본체는 규칙 목록이 아니라 Connection Tracking 엔진이다. Nitro Card 레벨 동작 원리부터 인시던트 대응에서 SG 교체만으로 격리가 안 되는 이유, NACL을 활용한 올바른 격리 순서까지 Terraform 실습으로 검증한다.
locale: ko
translationKey: security-group-connection-tracking
pubDatetime: 2026-02-24T08:24:00Z
tags:
  - security
  - aws
  - network
  - terraform
featured: false
draft: false
---

_SG에서 포트를 막으면 바로 끊길까? 아니다. 그러면 언제 끊기나? 최대 5일 후에. 활발히 쓰고 있는 세션이면? 안 끊긴다. 영원히. — 대부분의 엔지니어가 Security Group을 "방화벽 규칙 목록"으로 이해하고 있다. 틀린 건 아닌데, 정확하지도 않다. SG의 본체는 규칙이 아니라 Connection Tracking이고, 이걸 정확히 모르면 보안 격리가 뚫리고, 보안 침해 대응에서도 시간과 리소스를 허비하게 된다._

## Table of contents

## 01. Stateful vs Stateless — 근본 차이

AWS VPC에서 트래픽을 제어하는 두 축이 있습니다. Security Group(SG)과 Network ACL(NACL)이죠. 겉보기에는 둘 다 "방화벽 규칙 목록"처럼 보이지만, 패킷을 판단하는 **근본 메커니즘이 완전히 다릅니다**.

| 구분           | Security Group (Stateful)     | Network ACL (Stateless)              |
| -------------- | ----------------------------- | ------------------------------------ |
| 동작 계층      | ENI (인스턴스) 레벨           | Subnet 레벨                          |
| 판단 기준      | Connection Table (연결 상태)  | 패킷 단위 규칙 매칭                  |
| Return Traffic | 자동 허용 (규칙 불필요)       | 명시적 규칙 필요                     |
| 규칙 유형      | Allow Only (Deny 없음)        | Allow + Deny                         |
| 규칙 평가      | 전체 규칙 평가 후 결정        | 번호 순서대로 평가, 첫 매칭에서 중단 |
| 기본 동작      | 모든 트래픽 거부              | 모든 트래픽 허용 (기본 NACL)         |
| 규칙 변경 시   | 기존 연결 유지 (타임아웃까지) | 즉시 적용 (기존 연결도 영향)         |

여기서 하나만 기억하세요. Security Group은 "이 패킷이 허용 목록에 있는가?"를 묻지 않습니다. **"이 패킷이 이미 추적 중인 연결에 속하는가?"**를 먼저 묻습니다.

이 한 줄이 이후 모든 동작을 설명하는 열쇠가 됩니다. 차근차근 풀어볼게요.

## 02. Connection Tracking 내부 동작 원리 — Nitro Card 레벨

**Nitro Card for VPC가 하는 일**

전통적인 하이퍼바이저에서는 네트워크 가상화가 호스트 CPU에서 소프트웨어로 처리됐습니다. **`AWS Nitro System`**은 이 구조를 완전히 뒤집었죠.

VPC 네트워킹의 핵심 기능들 — 패킷 캡슐화/디캡슐화, Security Group 적용, 라우팅, 대역폭 제한 — 이 모두 **Nitro Card for VPC**라는 전용 하드웨어에서 수행됩니다. 호스트 CPU를 전혀 쓰지 않습니다.

![Nitro Card for VPC 아키텍처](@/assets/images/security-group-connection-tracking/nitro-card.png)

**이 아키텍처가 왜 중요할까요?**

**`Connection Tracking`**이 소프트웨어 방화벽이 아닌 **전용 하드웨어 카드**에서 돌아간다는 뜻이기 때문입니다. Nitro Card는 새 Flow의 첫 번째 패킷을 받으면 전체 평가(Security Group 규칙, ACL, 라우팅)를 수행하고, 이 정보를 저장합니다. 그 다음부터 같은 Flow의 패킷들은 저장된 정보를 재사용하면서 오버헤드를 최소화하죠.

### 패킷이 도착했을 때 — 실제 처리 흐름

패킷이 EC2 인스턴스의 ENI에 도달하면, **`Nitro Card`**는 아래 순서로 처리합니다. 여기서 핵심은 **"규칙 평가보다 Connection Table 조회가 먼저"**라는 겁니다.

![패킷 처리 흐름](@/assets/images/security-group-connection-tracking/packet-flow.png)

📡 **시나리오**: **`EC2에서 apt update 실행`** (Outbound 443만 허용, Inbound 규칙 없음)

1. EC2→패키지서버 (SYN) → Outbound 443 규칙 매칭 ✅ → Connection Table 등록
2. 패키지서버→EC2 (SYN-ACK) → Connection Table 매칭 ✅ → Inbound 규칙 무시, 즉시 허용
3. 패키지 데이터 전송 → **`Connection Table 매칭`** ✅ → 계속 허용 (Inbound 규칙 0개여도!)

정리하자면, **`Security Group`**은 **"규칙 목록(Rule Table)"이 아니라 "연결 추적 엔진(Connection Tracking Engine)"**입니다. 규칙은 "새 연결의 시작"만 제어하고, 이미 Connection Table에 등록된 연결의 응답 트래픽은 규칙과 무관하게 허용됩니다. 이것이 바로 "**`Stateful`**"의 실체입니다.

## 03. Tracked / Untracked / Automatically Tracked

### 3-1. Tracked Connection (추적 연결)

가장 일반적인 케이스입니다. 특정 IP나 포트에 대해 Inbound 또는 Outbound 규칙이 존재하면, 해당 연결은 Connection Table에 등록되어 추적됩니다. 규칙을 변경하면 **새 연결(NEW)**에는 즉시 반영됩니다. 포트 443을 삭제하면 그 순간부터 새로운 HTTPS 접속은 바로 차단되죠. 이건 평소에 체감하시는 동작입니다.

하지만 **이미 수립된 연결(ESTABLISHED)**은 다릅니다. Connection Table에 엔트리가 이미 등록되어 있기 때문에, 규칙을 삭제해도 기존 세션은 **즉시 끊기지 않습니다.** 앞서 설명한 플로우를 떠올려보면 — 패킷이 도착하면 규칙을 확인하기 **전에** Connection Table부터 조회하고, 매칭되면 규칙은 아예 안 보거든요.

TCP Established 기본 타임아웃이 **최대 5일(432,000초)**인데, 활발히 사용 중인 세션은 패킷이 오갈 때마다 타이머가 리셋되므로 **사실상 무기한 유지**됩니다. 유휴 상태로 방치된 연결만 타임아웃으로 끊깁니다. **`(뒤에서 Terraform으로 간단히 배포하고 실습 예정)`**

### 3-2. Untracked Connection (미추적 연결)

다음 조건을 **모두** 만족하면 해당 Flow는 Connection Table에 등록되지 않습니다:

- TCP 또는 UDP 프로토콜일 것
- 한쪽 방향의 규칙이 **모든 트래픽(0.0.0.0/0 또는 ::/0)**을 허용하고
- 반대 방향에도 **모든 응답 트래픽(0.0.0.0/0 또는 ::/0)**, **모든 포트(0-65535)**를 허용하는 대응 규칙이 존재할 것

쉽게 말하면, **"양방향 모두 전체 오픈"**인 상태에서만 **`Untracked`**가 됩니다.

**AWS 공식 문서의 예제로 확인**

**Inbound**에 `TCP 80 from 0.0.0.0/0`, **Outbound**에 `All Traffic to 0.0.0.0/0`이 설정되어 있다면 → 포트 80의 HTTP 트래픽은 **Untracked**됩니다. 하지만 같은 SG에서 Inbound `TCP 22 from 203.0.113.1/32`(특정 IP)로 SSH를 허용하면 → SSH 트래픽은 **Tracked**됩니다. 하나의 SG 안에서도 규칙별로 추적 여부가 달라진다는 점, 기억해 두세요.

### 3-3. Automatically Tracked Connection (자동 추적 연결)

SG 규칙 구성과 상관없이 반드시 추적되는 연결들도 있습니다. 비대칭 라우팅 환경에서 응답이 올바른 경로로 돌아가도록 보장하기 위해서죠.

| 자동 추적 대상               | 추적 이유                                            |
| ---------------------------- | ---------------------------------------------------- |
| Egress-only Internet Gateway | IPv6 전용 아웃바운드 게이트웨이의 비대칭 라우팅 보장 |
| Network Load Balancer        | 로드밸런서의 대칭 라우팅 보장                        |
| 모든 ICMP 트래픽             | ICMP는 SG 규칙과 무관하게 항상 추적                  |
| Network Firewall 엔드포인트  | 방화벽 검사를 위한 상태 추적 필수                    |

**Idle Connection Tracking Timeout — 타임아웃 값 상세**

2023년 11월, AWS는 Nitro 기반 인스턴스에 대해 **ENI 단위로 idle timeout을 설정할 수 있는 기능**을 출시했습니다. 이전에는 기본값이 고정이라 불편했는데, 이제 워크로드에 맞게 튜닝할 수 있게 됐습니다.

| 파라미터          | 기본값            | 최솟값 | 최댓값    | 권장                            |
| ----------------- | ----------------- | ------ | --------- | ------------------------------- |
| `tcp-established` | 432,000초 (5일)\* | 60초   | 432,000초 | LB/방화벽 연동 시 3,600~5,400초 |
| `udp-stream`      | 180초 (3분)       | 60초   | 180초     | DNS 워크로드 시 60초            |
| `udp-timeout`     | 30초              | 30초   | 60초      | 기본값 유지                     |

- NLB 경유 연결의 경우 ENI 설정과 별도로 NLB 자체의 idle timeout(TCP 350초, UDP 120초)이 적용됩니다.

참고로, TCP 3-way 핸드셰이크 중(SYN 전송 후 SYN-ACK 대기 상태)인 연결의 타임아웃은 120초입니다. ESTABLISHED 상태로 전환되고 나서야 위 `tcp-established` 값이 적용됩니다.

## 04. NACL + SG 조합 시 트래픽 흐름과 Ephemeral Port

### 트래픽이 지나가는 전체 경로

패킷이 인터넷에서 EC2 인스턴스까지 도달하려면 여러 계층을 통과해야 합니다. 그리고 응답이 나갈 때도 마찬가지죠. 각 계층의 Stateful/Stateless 특성 차이를 모르면 "분명히 SG에서 허용했는데 왜 안 되지?" 같은 상황에 빠지게 됩니다.

![NACL과 SG를 통과하는 트래픽 경로](@/assets/images/security-group-connection-tracking/traffic-path.png)

### Ephemeral Port 함정 — 가장 흔한 NACL 트러블

클라이언트가 서버의 80번 포트에 접속할 때, 응답 트래픽의 목적지 포트는 80이 아닙니다. 클라이언트의 OS가 무작위로 선택한 **Ephemeral Port(임시 포트)**가 목적지가 됩니다.

| OS / 서비스                        | Ephemeral Port 범위 |
| ---------------------------------- | ------------------- |
| Amazon Linux / 대부분의 Linux 커널 | 32768 – 61000       |
| Elastic Load Balancing             | 1024 – 65535        |

## 05. 실전 트러블슈팅

### Case 1: 인시던트 대응 시 Security Group을 격리용으로 교체했는데 기존 세션이 안 끊긴다면 어떻게 될까요?

**가정을 해보겠습니다.** 여러분의 회사에서 운영 중인 EC2 인스턴스 하나가 이상한 행동을 보이고 있습니다. **`GuardDuty`**가 **`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS`** 알림을 띄웠고, **`CloudTrail`**을 확인해보니 해당 인스턴스의 **IAM Role 자격증명이 외부 IP에서 사용된 흔적**이 있습니다.

침해가 의심되는 상황이죠. 여러분의 팀은 AWS 인시던트 대응 백서에 따라 즉시 격리 절차에 들어갑니다. 런북의 첫 번째 단계 — **해당 인스턴스의 Security Group을 모든 트래픽 차단 SG로 교체하는 방법을 택할 수 있겠죠?**

```bash
# 런북 Step 1: 격리용 SG 적용 (Inbound/Outbound 규칙 0개)
aws ec2 modify-instance-attribute \
  --instance-id i-0compromised123 \
  --groups sg-0isolation-no-traffic
```

**그럼 단순히 Inbound/Outbound 규칙 0개인 SG로 교체하면 침해 대응에 성공했다고 볼 수 있을까요?**

이제 외부와의 모든 통신이 차단됐을 거라고 생각할 수 있습니다. 그러나 **`VPC Flow Logs`**를 다시 모니터링하면 SG 교체 후에도 계속 찍히는 아웃바운드 트래픽이 아래와 같이 발생할 수 있습니다.

```text
2 123456789012 eni-0abc123 10.0.1.47 198.51.100.77 49812 4444 6 15 9500 1706234567 1706234627 ACCEPT OK
2 123456789012 eni-0abc123 10.0.1.47 198.51.100.77 49812 4444 6 22 14200 1706234627 1706234687 ACCEPT OK
2 123456789012 eni-0abc123 10.0.1.47 198.51.100.77 49812 4444 6 18 11800 1706234687 1706234747 ACCEPT OK
                                     ↑ 공격자 C2 서버   ↑ 의심스러운 포트
```

**SG를 완전히 닫았는데 왜 트래픽이 계속 나가고 있을까요?**

공격자는 인스턴스에서 코드 실행 권한을 획득한 뒤, 자신의 C2(Command & Control) 서버로 **reverse shell**을 열었습니다. reverse shell은 **인스턴스가 먼저 시작한 Outbound TCP 연결**입니다.

여기서 핵심은, 이 인스턴스의 기존 **SG Outbound** 규칙이 어떻게 설정되어 있었느냐입니다:

```text
# 격리 전 원래 SG의 Outbound 규칙
Outbound Rule 1: TCP 443 → 10.0.0.0/16     (VPC 내부 통신)
Outbound Rule 2: TCP 443 → 52.95.0.0/16    (S3/DynamoDB 등 AWS 서비스)
Outbound Rule 3: ALL → 0.0.0.0/0           ← 문제 시작점
```

`0.0.0.0/0`으로 All Outbound를 열어놨으니 reverse shell 연결이 수립됐고, 대응하는 Inbound 규칙은 특정 포트만 허용하고 있었습니다. 이 조합에서 **Outbound 연결**은 **Tracked Connection**이 됩니다. **Connection Table에 엔트리가 등록된 거죠.**

그리고 Tracked Connection의 특성 — **SG를 교체해도 기존 엔트리는 Connection Table에 남아 있는 한 계속 허용됩니다.** 공격자가 세션을 활발히 사용하고 있으면 매 패킷마다 idle timer가 리셋되므로, 타임아웃이 사실상 영원히 오지 않습니다.

**핵심 — 활성 세션을 즉시 끊는 유일한 네트워크 계층 수단은 NACL입니다**

**SG 교체 + 타임아웃 조정**은 **유휴 상태의 연결만 정리**할 수 있습니다. 공격자가 세션을 활발히 사용 중이거나, 30초 간격으로 TCP Keepalive를 보내도록 설정해놓았다면, 타이머가 계속 리셋되므로 아무리 60초로 줄여도 효과가 없습니다. **활성 연결을 즉시 강제 종료하는 유일한 방법은 `NACL(Stateless)`입니다.**

**그래서 위에서 발생한 문제를 해결하기 위한 올바른 인시던트 대응 순서는 이렇습니다**

1. **[즉시 차단] NACL로 해당 트래픽을 차단합니다** — **`NACL`**은 Stateless이므로 Connection Table 상태와 무관하게 그 즉시 패킷을 드롭합니다. reverse shell이 활성 상태여도 상관없습니다.

   ```bash
   # 해당 서브넷의 NACL에 Deny All Egress 규칙 추가
   # rule-number 50은 기존 Allow 규칙(보통 100번대)보다 먼저 평가
   aws ec2 create-network-acl-entry \
     --network-acl-id acl-0abc123 \
     --rule-number 50 \
     --protocol -1 \
     --rule-action deny \
     --cidr-block 0.0.0.0/0 \
     --egress
   ```

   ⚠️ **`NACL`**은 **서브넷 전체에 적용**됩니다. **같은 서브넷의 다른 인스턴스도 영향**받으므로, 가능하다면 `--cidr-block 198.51.100.77/32`처럼 공격자 C2 서버 IP만 차단하는 게 안전합니다.

2. **[보조 수단] ENI의 TCP Established Timeout을 60초(최솟값)로 줄입니다** — 활성 세션은 Step 1에서 이미 차단했습니다. 이 단계는 공격자가 열어놨지만 **지금은 유휴 상태인 다른 연결들**(백도어, 데이터 유출 채널 등)을 빠르게 정리하기 위한 조치입니다.

   ```bash
   ENI_ID=$(aws ec2 describe-instances \
     --instance-ids i-0compromised123 \
     --query 'Reservations[0].Instances[0].NetworkInterfaces[0].NetworkInterfaceId' \
     --output text)

   aws ec2 modify-network-interface-attribute \
     --network-interface-id $ENI_ID \
     --connection-tracking-specification \
       TcpEstablishedTimeout=60,UdpStreamTimeout=60,UdpTimeout=30
   ```

3. **[격리 완성] 격리용 Security Group을 적용합니다** — 새 연결을 원천 차단합니다. Step 2에서 설정한 짧은 타임아웃에 의해 유휴 상태의 Tracked Connection들도 60초 뒤 정리되면, 이 인스턴스는 네트워크적으로 완전히 격리됩니다.

   ```bash
   aws ec2 modify-instance-attribute \
     --instance-id i-0compromised123 \
     --groups sg-0isolation-no-traffic
   ```

이후 포렌식을 위해 EBS 볼륨 스냅샷을 떠서 별도 분석 인스턴스에 마운트하거나, SSM(격리 SG에서도 동작하도록 VPC Endpoint를 구성해둔 경우)으로 메모리 덤프를 수집할 수 있습니다.

**RunBook에 반영해야 할 교훈**

많은 인시던트 대응 런북이 "SG 교체 → 격리 완료"로 끝납니다. 하지만 **Connection Tracking** 때문에 **SG 교체만으로는 기존 Tracked Connection을 끊을 수 없습니다.** 런북의 격리 단계를 "**`① NACL 차단 → ② Timeout 축소 → ③ SG 교체`**" 순서로 진행해야 합니다. **활성 세션은 NACL만이 즉시 끊을 수 있으니까요.**

## 06. Terraform 핸즈온

**`versions.tf`**

```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = "ap-northeast-2"
}
```

**`vpc.tf`**

```hcl
resource "aws_vpc" "lab" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "conntrack-lab-vpc" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.lab.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-northeast-2a"
  map_public_ip_on_launch = true

  tags = { Name = "conntrack-lab-public" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.lab.id
  tags   = { Name = "conntrack-lab-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lab.id
  tags   = { Name = "conntrack-lab-rt" }
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.igw.id
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
```

**`security_groups.tf`**

```hcl
# 1) Tracked SG — 특정 CIDR 기반 규칙 (연결이 추적됨)
resource "aws_security_group" "tracked" {
  name        = "conntrack-tracked-sg"
  description = "Tracked connections - specific CIDR rules"
  vpc_id      = aws_vpc.lab.id

  tags = { Name = "tracked-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "tracked_http" {
  security_group_id = aws_security_group.tracked.id
  cidr_ipv4         = "10.0.0.0/16"  # VPC 내부만 허용 → Tracked!
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "tracked_all" {
  security_group_id = aws_security_group.tracked.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"  # SSM Agent(HTTPS 443) 포함 전체 Outbound 허용
}

# 2) Untracked SG — 양방향 전체 허용 (연결이 추적되지 않음)
# 참고: ip_protocol = "-1"로 전체 프로토콜을 허용해도
# ICMP 트래픽은 항상 Automatically Tracked 상태입니다.
# 즉, ping 등의 ICMP는 여전히 Connection Table을 소모합니다.
resource "aws_security_group" "untracked" {
  name        = "conntrack-untracked-sg"
  description = "Untracked connections - all traffic both directions"
  vpc_id      = aws_vpc.lab.id

  tags = { Name = "untracked-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "untracked_all" {
  security_group_id = aws_security_group.untracked.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "untracked_all" {
  security_group_id = aws_security_group.untracked.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# 3) 격리용 SG — 인시던트 대응용 (규칙 없음 = 전부 차단)
resource "aws_security_group" "isolation" {
  name        = "conntrack-isolation-sg"
  description = "Isolation SG - no inbound, no outbound"
  vpc_id      = aws_vpc.lab.id

  tags = { Name = "isolation-sg" }
}
```

**`nacl.tf`**

```hcl
resource "aws_network_acl" "lab" {
  vpc_id     = aws_vpc.lab.id
  subnet_ids = [aws_subnet.public.id]

  tags = { Name = "conntrack-lab-nacl" }
}

resource "aws_network_acl_rule" "inbound_http" {
  network_acl_id = aws_network_acl.lab.id
  rule_number    = 100
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
}

resource "aws_network_acl_rule" "inbound_https" {
  network_acl_id = aws_network_acl.lab.id
  rule_number    = 110
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "inbound_ephemeral" {
  network_acl_id = aws_network_acl.lab.id
  rule_number    = 120
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}

resource "aws_network_acl_rule" "outbound_https" {
  network_acl_id = aws_network_acl.lab.id
  rule_number    = 100
  egress         = true      # Outbound = egress = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
}

resource "aws_network_acl_rule" "outbound_ephemeral" {
  network_acl_id = aws_network_acl.lab.id
  rule_number    = 110
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
}
```

**`iam.tf`**

```hcl
resource "aws_iam_role" "ssm" {
  name = "conntrack-lab-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = { Name = "conntrack-lab-ssm-role" }
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ssm" {
  name = "conntrack-lab-ssm-profile"
  role = aws_iam_role.ssm.name
}
```

**`ec2.tf`**

```hcl
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

resource "aws_instance" "web" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t3.micro"  # 반드시 Nitro 기반
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.tracked.id]
  iam_instance_profile   = aws_iam_instance_profile.ssm.name

  user_data = <<-EOF
    #!/bin/bash
    dnf install -y httpd
    systemctl start httpd
    systemctl enable httpd
    echo "Connection Tracking Lab" > /var/www/html/index.html
  EOF

  user_data_replace_on_change = true

  tags = { Name = "conntrack-web-server" }
}
```

**`outputs.tf`**

```hcl
output "instance_id" {
  value       = aws_instance.web.id
  description = "SSM 접속에 사용: aws ssm start-session --target "
}

output "web_public_ip" {
  value = aws_instance.web.public_ip
}

output "tracked_sg_id" {
  value = aws_security_group.tracked.id
}

output "untracked_sg_id" {
  value = aws_security_group.untracked.id
}

output "isolation_sg_id" {
  value = aws_security_group.isolation.id
}
```

### 실험 A: Tracked Connection에서 SG 교체 → 기존 세션이 유지되는지 확인

```bash
# 1. SSM Session Manager로 접속 (Tracked SG 적용 상태)
INSTANCE_ID=$(terraform output -raw instance_id)
aws ssm start-session --target $INSTANCE_ID

# 2. 세션이 열린 상태에서, 다른 터미널에서 SG를 격리용으로 교체함
aws ec2 modify-instance-attribute \
  --instance-id $(terraform output -raw instance_id) \
  --groups $(terraform output -raw isolation_sg_id)

# 3. 결과를 확인!! SSM 세션이 계속 유지됨!
#    SSM Agent는 인스턴스에서 AWS API(HTTPS 443)로 Outbound 연결을 시작합니다.
#    이 연결이 Tracked Connection으로 Connection Table에 등록되어 있기 때문에,
#    SG를 교체해도 기존 세션은 즉시 끊기지 않습니다.

# 4. 세션을 종료하고 새로 접속을 시도하면? → 실패합니다
#    ("새 연결"은 변경된 SG 규칙이 즉시 적용되니까요)
exit

aws ssm start-session --target $INSTANCE_ID
# An error occurred (TargetNotConnected) ...
# → 이것이 "새 연결은 즉시 차단, 기존 연결은 유지"의 실체입니다
```

### 실험 B: Untracked Connection에서 SG 교체 → 즉시 끊기는지 확인

```bash
# 1. 먼저 Untracked SG로 전환함
INSTANCE_ID=$(terraform output -raw instance_id)
aws ec2 modify-instance-attribute \
  --instance-id $INSTANCE_ID \
  --groups $(terraform output -raw untracked_sg_id)

# 2. SSM으로 재접속
aws ssm start-session --target $INSTANCE_ID

# 3. 세션이 열린 상태에서, 다른 터미널에서 격리용 SG로 교체
aws ec2 modify-instance-attribute \
  --instance-id $INSTANCE_ID \
  --groups $(terraform output -raw isolation_sg_id)

# 4. 결과: SSM 세션이 즉시 끊깁니다!
#    Untracked SG(양방향 0.0.0.0/0)에서는 Connection Table에 등록되지 않으므로,
#    규칙 변경 시 즉시 영향을 받습니다.
```

**`실험 A vs B 비교 — 이 차이가 핵심입니다`**

같은 "**격리용 SG 적용**"이라는 동작인데, **Tracked**에서는 세션이 유지되고 **Untracked**에서는 즉시 끊깁니다.

이 차이가 바로 인시던트 대응 시 "**SG 교체만으로는 부족한 이유**"이고, 동시에 "**Untracked를 쓰면 성능은 좋지만 변경에 민감해지는 이유**"이기도 합니다.

## References

- [AWS 공식 — Security Group Connection Tracking](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html)
- [Abusing AWS Connection Tracking (frichetten.com)](https://frichetten.com/blog/abusing-aws-connection-tracking/)
- [Introducing Configurable Idle Timeout for Connection Tracking (AWS Blog)](https://aws.amazon.com/blogs/networking-and-content-delivery/introducing-configurable-idle-timeout-for-connection-tracking/)
