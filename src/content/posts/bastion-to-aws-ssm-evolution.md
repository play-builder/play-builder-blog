---
title: "서버 접속의 진화: Bastion Host에서 AWS SSM까지"
description: 1세대 Bastion 키 저장, 2세대 SSH Agent Forwarding을 거쳐 3세대 AWS SSM까지 — 서버 접속 방식의 변천사와 SSM 기반 접속의 구현 가이드(Terraform 포함).
locale: ko
translationKey: bastion-to-aws-ssm-evolution
pubDatetime: 2026-01-29T17:19:00Z
tags:
  - security
  - aws
  - ssm
  - terraform
featured: false
draft: false
---

EC2 서버에 접속하는 방법은 AWS 인프라의 발전과 함께 진화해왔습니다. 이 글에서는 서버 접속 방식의 변천사를 살펴보고, 현재 권장되는 **`AWS Systems Manager(SSM)`** 기반 접속 방식의 구현 방법을 정리합니다.

## Table of contents

## 서버 접속 방식의 진화

### 1세대: Bastion Host에 키 저장

가장 초창기에 사용하던 방식으로, 현재는 보안상 권장되지 않는 패턴입니다.

![1세대: Bastion Host에 키 저장 구조](@/assets/images/bastion-to-aws-ssm-evolution/gen1-bastion.png)

**작동 방식:**

```bash
# 1. 로컬 -> Bastion 접속
local$ ssh -i my-bastion-key.pem ec2-user@<BASTION_PUBLIC_IP>

# 2. Bastion -> Private EC2 접속 (Bastion 안에 키가 있어야 함)
bastion$ ssh -i ~/.ssh/private-key.pem ec2-user@<PRIVATE_IP>
```

**문제점:**

| 문제      | 설명                                       |
| --------- | ------------------------------------------ |
| 키 집중   | Bastion이 침해되면 모든 서버의 키가 노출됨 |
| 키 복제   | 개발자들이 키 파일을 복사해서 공유하게 됨  |
| 추적 불가 | 퇴사자가 키를 가지고 있어도 알 수 없음     |

---

### 2세대: SSH Agent Forwarding

키 파일을 서버에 올리는 위험을 제거하기 위해 등장한 방식입니다.

![2세대: SSH Agent Forwarding 구조](@/assets/images/bastion-to-aws-ssm-evolution/gen2-agent-forwarding.png)

**작동 방식:**

```bash
# 1. 로컬에 키 등록
ssh-add -K my-private-key.pem

# 2. Agent Forwarding으로 접속
ssh -A ec2-user@<BASTION_PUBLIC_IP>

# 3. Bastion에서 Private EC2로 접속 (키 파일 없이 가능)
bastion$ ssh ec2-user@<PRIVATE_IP>
```

또는 **`ProxyJump 옵션`**으로 한 번에 접속할 수 있습니다.

```bash
ssh -J ec2-user@<BASTION_PUBLIC_IP> ec2-user@<PRIVATE_IP>
```

**개선된 점:**

- Bastion Host에 키 파일이 존재하지 않음
- 키 유출 위험 감소

**여전한 한계:**

- 22번 포트를 열어야 함
- Bastion Host 운영/관리 부담
- 세션 로깅 자동화 어려움

---

### 3세대: AWS Systems Manager (SSM)

현재 AWS 환경에서 권장되는 방식입니다. SSH가 아닌 HTTPS(443) 통신을 사용하며, 인증은 IAM 기반으로 이루어집니다.

![3세대: AWS SSM 구조](@/assets/images/bastion-to-aws-ssm-evolution/gen3-ssm.png)

**핵심 특징:**

| 항목      | Bastion 방식      | SSM 방식               |
| --------- | ----------------- | ---------------------- |
| 인증      | SSH 키 파일       | IAM Role/User          |
| 포트      | 22 (SSH)          | 443 (HTTPS)            |
| 중간 서버 | Bastion 필요      | 불필요                 |
| 세션 로깅 | 수동 구성         | 자동 지원              |
| 권한 회수 | 키 파일 회수 필요 | IAM 정책 변경으로 즉시 |

---

## SSM 접속 구성 가이드

### 필수 구성 요소

SSM 접속이 작동하려면 **세 가지가 필요**합니다.

### 1. SSM Agent

대부분의 최신 AWS AMI(Amazon Linux 2/2023, Ubuntu 16.04+)에는 기본 설치되어 있습니다.

```bash
# 설치 확인
sudo systemctl status amazon-ssm-agent
# Active: active (running) 이면 정상
```

**수동 설치가 필요한 경우** — Ubuntu x86_64 (`Intel/AMD`) 아키텍처 기준 설치 방법:

```bash
cd /tmp
wget https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb
sudo dpkg -i amazon-ssm-agent.deb
sudo systemctl enable amazon-ssm-agent
sudo systemctl start amazon-ssm-agent
```

**Terraform user_data**로 자동화:

```hcl
resource "aws_launch_template" "app" {
  name_prefix   = "app-"
  image_id      = data.aws_ami.ubuntu.id
  instance_type = "t2.micro"

  user_data = base64encode(<<-EOF
    #!/bin/bash
    cd /tmp
    wget https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb
    dpkg -i amazon-ssm-agent.deb
    systemctl enable amazon-ssm-agent
    systemctl start amazon-ssm-agent
  EOF
  )

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_ssm.name
  }
}
```

### 2. IAM Role (가장 중요)

EC2에 **`AmazonSSMManagedInstanceCore`** 정책이 연결되어 있어야 합니다. 이 설정이 없으면 SSM은 작동하지 않습니다.

```hcl
# IAM Role
resource "aws_iam_role" "ec2_ssm" {
  name = "ec2-ssm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

# SSM 정책 연결
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Instance Profile
resource "aws_iam_instance_profile" "ec2_ssm" {
  name = "ec2-ssm-profile"
  role = aws_iam_role.ec2_ssm.name
}
```

AWS 콘솔에서 EC2를 생성할 경우, **[고급 세부 정보]** 탭에서 **IAM 인스턴스 프로파일**을 직접 선택해야 합니다.

### 3. 네트워크 경로

Private EC2가 SSM 서비스(AWS API)와 통신할 수 있어야 합니다.

**방법 A: NAT Gateway**

```hcl
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}
```

**방법 B: VPC Endpoint (NAT Gateway 없이 가능)**

```hcl
# SSM 관련 VPC Endpoint 3개 필요
locals {
  ssm_endpoints = ["ssm", "ssmmessages", "ec2messages"]
}

resource "aws_vpc_endpoint" "ssm" {
  for_each = toset(local.ssm_endpoints)

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.ap-northeast-2.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private.id]
  security_group_ids  = [aws_security_group.vpc_endpoint.id]
  private_dns_enabled = true
}

resource "aws_security_group" "vpc_endpoint" {
  name   = "vpc-endpoint-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
}
```

---

## 접속 방법

### 방법 1: AWS 콘솔

1. EC2 콘솔 → 인스턴스 선택
2. **[연결(Connect)]** 클릭
3. **[Session Manager]** 탭 → **[연결]**

웹 브라우저에서 바로 터미널이 열립니다.

### 방법 2: AWS CLI

로컬에 session-manager-plugin 설치 후 사용합니다.

```bash
# macOS 설치
brew install session-manager-plugin

# 접속
aws ssm start-session --target i-0123456789abcdef0
```

### 방법 3: SSH처럼 사용 (ProxyCommand)

기존 SSH 워크플로우(scp, rsync 등)를 유지하려면 SSH config를 설정합니다.

```bash
# ~/.ssh/config
Host i-* mi-*
    ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
    User ec2-user
```

```bash
# 사용
ssh i-0123456789abcdef0
scp ./file.txt i-0123456789abcdef0:/home/ec2-user/
```

---

## 세션 로깅 설정

SSM의 장점 중 하나는 **모든 세션 활동을 자동으로 로깅**할 수 있다는 점입니다.

```hcl
# 로그 저장용 S3 버킷
resource "aws_s3_bucket" "ssm_logs" {
  bucket = "company-ssm-session-logs"
}

# SSM Document로 세션 설정
resource "aws_ssm_document" "session_prefs" {
  name            = "SSM-SessionManagerRunShell"
  document_type   = "Session"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "1.0"
    description   = "Session Manager Settings"
    sessionType   = "Standard_Stream"
    inputs = {
      s3BucketName           = aws_s3_bucket.ssm_logs.id
      s3KeyPrefix            = "session-logs"
      s3EncryptionEnabled    = true
      idleSessionTimeout     = "30"
      maxSessionDuration     = "120"
    }
  })
}
```

---

## IAM 기반 접근 제어

태그 기반으로 "누가 어떤 서버에 접속할 수 있는지" 제어할 수 있습니다.

```hcl
# 개발 서버만 접속 가능한 정책
resource "aws_iam_policy" "ssm_dev_only" {
  name = "ssm-dev-server-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:StartSession"]
        Resource = ["arn:aws:ec2:ap-northeast-2:*:instance/*"]
        Condition = {
          StringEquals = {
            "ssm:resourceTag/Environment" = "dev"
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:TerminateSession", "ssm:ResumeSession"]
        Resource = ["arn:aws:ssm:*:*:session/$${aws:username}-*"]
      }
    ]
  })
}
```

---

## 트러블슈팅 체크리스트

SSM 접속이 되지 않을 때 확인할 항목입니다.

| 순서 | 확인 항목          | 확인 방법                                          |
| ---- | ------------------ | -------------------------------------------------- |
| 1    | SSM Agent 실행 중? | `systemctl status amazon-ssm-agent`                |
| 2    | IAM Role 연결됨?   | EC2 콘솔에서 IAM role 확인                         |
| 3    | 정책 포함됨?       | `AmazonSSMManagedInstanceCore` 확인                |
| 4    | 네트워크 경로?     | NAT Gateway 또는 VPC Endpoint 확인                 |
| 5    | Agent 로그         | `tail -f /var/log/amazon/ssm/amazon-ssm-agent.log` |

가장 흔한 실수는 **IAM Role을 연결하지 않는 것**입니다. Launch Template에서 `iam_instance_profile`을 빠뜨리는 경우가 많습니다.

---

## 정리

| 방식                  | 키 파일     | 22번 포트 | Bastion | 세션 로깅 | 권한 관리 |
| --------------------- | ----------- | --------- | ------- | --------- | --------- |
| **1세대 (키 저장)**   | 서버에 보관 | 필요      | 필요    | 수동      | 수동      |
| **2세대 (Agent Fwd)** | 로컬에만    | 필요      | 필요    | 수동      | 수동      |
| **3세대 (SSM)**       | 불필요      | 불필요    | 불필요  | 자동      | IAM 통합  |

- **`SSM`**은 "**No Key, No Port 22, No Bastion**"을 실현하는 현대적인 서버 접속 방식이에요.
- IAM 기반 인증으로 권한 관리가 단순해지고, 퇴사자 권한 회수도 IAM 정책 변경만으로 즉시 처리되죠.
