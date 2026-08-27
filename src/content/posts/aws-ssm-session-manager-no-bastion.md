---
title: "SSH Key는 이제 그만: Session Manager로 Bastion 없는 보안 접속 환경 구축"
description: AmazonSSMManagedInstanceCore 정책 하나로 SSH 키와 22번 포트, Bastion Host 없이 EC2에 안전하게 접속하는 방법과 정책 내부 권한 구조 해설.
locale: ko
translationKey: aws-ssm-session-manager-no-bastion
pubDatetime: 2026-01-29T17:19:00Z
tags:
  - security
  - aws
  - ssm
featured: false
draft: false
---

`AmazonSSMManagedInstanceCore`는 실무에서 EC2 인스턴스를 다룰 때 **가장 기본이자 필수적으로 사용하는 정책**입니다.

한마디로 정의하자면:

> **"EC2 인스턴스(내부의 SSM Agent)가 AWS Systems Manager 서비스와 통신할 수 있게 해주는 '필수 통행증(Visa)'"**

## Table of contents

## 1. [핵심] SSH 키 없이 서버 접속 (Session Manager)

**현재 방식 (Modern - Session Manager):**

- **`AmazonSSMManagedInstanceCore`** 정책만 연결되어 있다면, **22번 포트를 아예 닫아버려도 됩니다.**
- Pem 키가 필요 없습니다. AWS 콘솔이나 CLI를 통해 **IAM 권한만으로** 안전하게 쉘 접속이 가능합니다.
- **실무 포인트:** "Bastion Host(점프 서버) 없이 프라이빗 서브넷에 있는 인스턴스에 바로 접속"할 때 이 방식이 표준입니다.

자세한 배경은 [서버 접속의 진화: Bastion Host에서 AWS SSM까지](/posts/bastion-to-aws-ssm-evolution) 글을 참고하세요.

---

## 2. 원격 명령 실행 및 자동화 (Run Command)

**상황:** 서버가 100대인데, 모든 서버의 로그를 지우거나 특정 패치를 해야 한다면?

- **역할:** 이 정책이 있어야 **SSM Run Command**가 인스턴스 내부로 명령어를 내려보낼 수 있습니다.
- **작동 원리:** 인스턴스 내부의 `SSM Agent`가 "혹시 나한테 내려온 명령 있나요?" 하고 AWS 서버(SSM 서비스)에 물어볼 때(Polling), 이 권한을 사용합니다.

---

## 3. 패치 관리 및 인벤토리 수집 (Patch Manager & Inventory)

- **패치 자동화:** "매주 일요일 새벽 3시에 보안 패치(yum update)를 돌려라" 같은 자동화 작업을 할 때 이 권한이 필요합니다.
- **자산 관리:** 현재 내 서버들에 "어떤 소프트웨어가 깔려있고, OS 버전은 몇인지" 정보를 수집하여 콘솔에 보여줄 때 사용됩니다.

---

## 정책 내부 구조: 세 가지 부류의 권한

이 정책의 내용을 뜯어보면 크게 **세 가지 부류의 권한**이 들어있습니다.

![AmazonSSMManagedInstanceCore 정책 구성](@/assets/images/aws-ssm-session-manager-no-bastion/policy-overview.png)

1. **`ssm:DescribeAssociation`, `ssm:GetDocument`...**
   - SSM Agent가 "내가 무슨 작업을 해야 하지?"라고 작업 명세서(Document)를 읽어오는 권한입니다.
2. **`ssmmessages:CreateControlChannel`, `ssmmessages:CreateDataChannel`...**
   - **가장 중요!** 이것이 있어야 **Session Manager(웹 터미널 접속)**가 작동합니다. 터미널의 입력/출력 데이터를 암호화된 채널로 주고받는 권한입니다.
3. **`ec2messages:...`**
   - 예전 방식의 통신 프로토콜을 위한 권한입니다 (하위 호환성).

**AmazonSSMManagedInstanceCore 정책 세부 목록** (이름에 'Core'가 들어간 게 최신 경량화 버전입니다):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeAssociation",
        "ssm:GetDeployablePatchSnapshotForInstance",
        "ssm:GetDocument",
        "ssm:DescribeDocument",
        "ssm:GetManifest",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:ListAssociations",
        "ssm:ListInstanceAssociations",
        "ssm:PutInventory",
        "ssm:PutComplianceItems",
        "ssm:PutConfigurePackageResult",
        "ssm:UpdateAssociationStatus",
        "ssm:UpdateInstanceAssociationStatus",
        "ssm:UpdateInstanceInformation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2messages:AcknowledgeMessage",
        "ec2messages:DeleteMessage",
        "ec2messages:FailMessage",
        "ec2messages:GetEndpoint",
        "ec2messages:GetMessages",
        "ec2messages:SendReply"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 요약

> 이 정책을 EC2에 붙이는 순간, SSH 포트(22)를 닫아도 접속할 수 있고, 원격으로 조종(스크립트 실행)할 수 있게 된다. 뿐만 아니라, SSH로 접속하면 누가 언제 들어왔는지 로그 남기기가 까다롭지만, Session Manager를 쓰면 `CloudTrail`과 `S3`에 접속 기록과 명령어 내역이 전부 로깅되어 보안 감사가 가능해집니다.
