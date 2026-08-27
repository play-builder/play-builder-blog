---
title: "Auto Scaling으로 사라지는 로그, 어떻게 지킬까? Lifecycle Hook과 SSM을 활용한 데이터 보존 전략"
description: ASG Scale-in 시 인스턴스와 함께 증발하는 로그를 지키는 방법. Lifecycle Hook으로 종료를 잠시 멈추고 EventBridge→Lambda→SSM Run Command로 S3에 백업하는 Graceful Termination 아키텍처를 Terraform으로 구현한다.
locale: ko
translationKey: autoscaling-log-preservation-lifecycle-hook-ssm
pubDatetime: 2026-01-29T18:00:00Z
tags:
  - observability
  - aws
  - terraform
featured: false
draft: false
---

**`Auto Scaling Group(ASG)`**을 운영하다 보면 가장 고민되는 부분 중 하나가 **`Scale-in`**(축소) 이벤트 발생 시 인스턴스 내부의 로그나 데이터가 유실되는 문제입니다. 인스턴스가 종료(Terminate)되면 그 안에 저장된 휘발성 데이터는 영구적으로 사라지기 때문입니다.

오늘은 **Terraform**을 사용하여, 인스턴스가 종료되기 직전 `Lifecycle Hook(생명주기 훅)`으로 잠시 멈춰 세우고, `AWS Systems Manager(SSM)`를 통해 로그를 **S3로 안전하게 백업**한 뒤 종료시키는 **우아한 종료(Graceful Termination) 아키텍처**를 구현해 보겠습니다.

## Table of contents

## 들어가기 전: 실무 표준은 실시간 로그 전송

물론 실무에서는 로그 백업만을 위해 `Lifecycle Hook`을 사용하는 경우는 드뭅니다. 로그는 생성되는 즉시 실시간으로 외부로 보내는 것(Log Forwarding)이 표준입니다. 실무에서는 보통 EC2 안에 로그를 배달해주는 에이전트(Log Shipper)를 설치합니다.

### A. AWS Native 방식 (가장 흔함)

- **도구:** **Amazon CloudWatch Agent**
- **방식:** EC2에 Agent를 설치해두면, `/var/log/syslog`나 `application.log`에 새로운 줄이 생길 때마다 **CloudWatch Logs**로 전송합니다.
- **장점:** 구축이 쉽고 AWS 서비스 간 통합이 완벽함.
- **단점:** CloudWatch Logs 비용이 생각보다 비쌈.

### B. 오픈소스/ELK 스택 (대규모 환경)

- **도구:** **Fluent Bit, Fluentd, Filebeat**
- **방식:** 로그를 수집해서 **`Elasticsearch(OpenSearch)`**나 **`Kafka`**로 보냅니다.
- **장점:** 검색과 분석(Kibana)이 강력하고, 로그 포맷팅이 자유로움.

### C. SaaS 솔루션 (돈 많은 회사)

- **도구:** **Datadog, Splunk, New Relic Agent**
- **방식:** 전용 에이전트가 알아서 다 가져갑니다.
- **장점:** 예쁜 대시보드와 강력한 알람 기능 제공.

---

## 🏗️ 전체 아키텍처 (Architecture Overview)

이 시스템의 작동 원리는 다음과 같습니다.

1. **Scale-in 발생:** **`ASG`**가 인스턴스 종료를 결정합니다.
2. **Wait 상태 진입:** **Lifecycle Hook**이 작동하여 인스턴스를 즉시 끄지 않고 `Terminating:Wait` 상태로 대기시킵니다.
3. **이벤트 감지:** **`EventBridge`**가 이 종료 이벤트를 감지하여 **`Lambda`**를 트리거합니다.
4. **명령 실행:** **`Lambda`**가 **SSM Run Command**를 호출하여 해당 EC2에게 "로그를 S3로 올려라"라는 명령을 내립니다.
5. **로그 백업:** EC2(SSM Agent)가 **SSM Document**에 정의된 스크립트를 실행하여 로그를 S3로 업로드합니다.
6. **종료 승인:** Lambda가 ASG에게 `CONTINUE` 신호를 보내면, 인스턴스가 비로소 완전히 종료됩니다.

---

## 🛠️ Terraform 코드 구현 (Step-by-Step)

> 전체를 한 번에 배포할 수 있는 통합 `main.tf`는 아래 단계별 코드를 순서대로 합치면 됩니다.

### 0. Provider 및 Network 설정

가장 먼저 AWS Provider를 설정하고, ASG가 배포될 VPC와 Subnet 정보를 동적으로 가져옵니다. (Default VPC가 없는 환경에서도 작동하도록 설계되었습니다.)

```hcl
provider "aws" {
  region = "us-east-1" # 원하는 리전으로 변경
}

data "aws_availability_zones" "available" {}

# 사용 가능한 VPC 및 서브넷 자동 조회
data "aws_vpc" "selected" {
  state = "available"
}

data "aws_subnets" "selected" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }
}
```

### 1. S3 Bucket (로그 저장소)

로그가 저장될 버킷입니다. 실습 편의를 위해 `force_destroy = true`를 설정했습니다.

```hcl
resource "aws_s3_bucket" "log_bucket" {
  bucket_prefix = "asg-log-backup-"
  force_destroy = true
}
```

### 2. SSM Document (백업 스크립트 정의)

EC2 내부에서 실행될 쉘 스크립트를 정의합니다. `AWS-RunShellScript` 플러그인을 사용하며, 인스턴스 ID를 식별하여 파일명에 포함시킵니다.

```hcl
resource "aws_ssm_document" "log_backup_doc" {
  name          = "BackupLogsToS3"
  document_type = "Command"

  content = <<DOC
  {
    "schemaVersion": "2.2",
    "description": "Copy logs to S3",
    "mainSteps": [
      {
        "action": "aws:runShellScript",
        "name": "backupLogs",
        "inputs": {
          "runCommand": [
            "echo 'Backing up logs...'",
            "INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)",
            "aws s3 cp /var/log/syslog s3://${aws_s3_bucket.log_bucket.id}/$INSTANCE_ID-syslog.log",
            "echo 'Backup complete.'"
          ]
        }
      }
    ]
  }
DOC
}
```

> 참고: **`169.254.169.254`**는 EC2 내부에서 자기 자신의 메타데이터를 조회할 수 있는 고유 IP입니다.
> 자세한 내용은 [169.254.169.254의 정체: Link-Local Address](/posts/link-local-address-169-254-169-254) 글을 참고하세요.

### 3. IAM Role (권한 설정)

가장 중요한 보안 설정입니다. **EC2**는 SSM 통신 및 S3 업로드 권한이 필요하고, **Lambda**는 SSM 실행 및 ASG 제어 권한이 필요합니다.

```hcl
# --- EC2 Role ---
resource "aws_iam_role" "ec2_role" {
  name = "ec2_ssm_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" } }]
  })
}

# 중요: SSM Agent가 작동하기 위한 필수 관리형 정책
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# S3 업로드 권한 (Inline Policy)
resource "aws_iam_role_policy" "ec2_s3_put" {
  name = "s3_put_access"
  role = aws_iam_role.ec2_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{ Action = "s3:PutObject", Effect = "Allow", Resource = "${aws_s3_bucket.log_bucket.arn}/*" }]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "ec2_ssm_profile"
  role = aws_iam_role.ec2_role.name
}

# --- Lambda Role ---
resource "aws_iam_role" "lambda_role" {
  name = "lifecycle_lambda_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda_permissions"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      { Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Effect = "Allow", Resource = "*" },
      { Action = "ssm:SendCommand", Effect = "Allow", Resource = "*" },
      { Action = "autoscaling:CompleteLifecycleAction", Effect = "Allow", Resource = "*" }
    ]
  })
}
```

### 4. Lambda Function (로직 처리)

EventBridge에서 받은 정보를 토대로 SSM 명령을 내리고, 완료 후 ASG에 `CONTINUE` 신호를 보내는 파이썬 코드입니다.

```hcl
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda_function.zip"
  source_content_filename = "lambda_function.py"

  source_content = <<EOF
import boto3
import time
import os

ssm = boto3.client('ssm')
asg = boto3.client('autoscaling')
doc_name = os.environ['SSM_DOCUMENT_NAME']

def lambda_handler(event, context):
    print("Event Received:", event)
    detail = event['detail']
    instance_id = detail['EC2InstanceId']
    hook_name = detail['LifecycleHookName']
    asg_name = detail['AutoScalingGroupName']
    token = detail['LifecycleActionToken']

    try:
        # 1. SSM 실행
        print(f"Sending SSM Command to {instance_id}")
        response = ssm.send_command(InstanceIds=[instance_id], DocumentName=doc_name)

        # 2. 대기 (실무에서는 Waiter 사용 권장)
        time.sleep(5)

        # 3. ASG 종료 승인 (CONTINUE)
        print("Sending CONTINUE to ASG")
        asg.complete_lifecycle_action(
            LifecycleHookName=hook_name,
            AutoScalingGroupName=asg_name,
            LifecycleActionToken=token,
            LifecycleActionResult='CONTINUE'
        )
    except Exception as e:
        print(f"Error: {str(e)}")
EOF
}

resource "aws_lambda_function" "lifecycle_handler" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "ASGLifecycleHandler"
  role             = aws_iam_role.lambda_role.arn
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  environment {
    variables = { SSM_DOCUMENT_NAME = aws_ssm_document.log_backup_doc.name }
  }
}
```

### 5. EventBridge & Auto Scaling Group

ASG 이벤트를 낚아챌 규칙과, 실제 Hook이 설정된 ASG를 생성합니다.

```hcl
# --- EventBridge ---
resource "aws_cloudwatch_event_rule" "asg_terminate_rule" {
  name          = "capture-asg-terminate"
  event_pattern = jsonencode({
    "source": ["aws.autoscaling"],
    "detail-type": ["EC2 Instance-terminate Lifecycle Action"]
  })
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.asg_terminate_rule.name
  target_id = "SendToLambda"
  arn       = aws_lambda_function.lifecycle_handler.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lifecycle_handler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.asg_terminate_rule.arn
}

# --- ASG & Launch Template ---
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

resource "aws_launch_template" "lt" {
  name_prefix   = "log-backup-lt-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = "t3.micro"

  # ★ IAM Profile 연결 필수!
  iam_instance_profile {
    name = aws_iam_instance_profile.ec2_profile.name
  }
  user_data = base64encode("#!/bin/bash\nyum install -y aws-cli")
}

resource "aws_autoscaling_group" "asg" {
  name                = "log-backup-asg"
  vpc_zone_identifier = data.aws_subnets.selected.ids # 서브넷 동적 할당
  desired_capacity    = 1
  max_size            = 1
  min_size            = 0

  launch_template {
    id      = aws_launch_template.lt.id
    version = "$Latest"
  }

  # ★ 핵심: 종료 시 Hook 발동
  initial_lifecycle_hook {
    name                 = "LogBackupHook"
    default_result       = "ABANDON"
    heartbeat_timeout    = 300
    lifecycle_transition = "autoscaling:EC2_INSTANCE_TERMINATING"
  }
}
```

---

## ✅ 검증: 로그 백업이 진짜 되는지 확인하기

```bash
# Terraform Init
terraform init

# Terraform Validate
terraform validate

# Terraform Plan
terraform plan

# Terraform Apply
terraform apply -auto-approve
```

```text
$ terraform state list
data.archive_file.lambda_zip
data.aws_ami.amazon_linux_2
data.aws_availability_zones.available
data.aws_subnets.selected
data.aws_vpc.selected
aws_autoscaling_group.asg
aws_cloudwatch_event_rule.asg_terminate_rule
aws_cloudwatch_event_target.lambda_target
aws_iam_instance_profile.ec2_profile
aws_iam_role.ec2_role
aws_iam_role.lambda_role
aws_iam_role_policy.ec2_s3_put
aws_iam_role_policy.lambda_policy
aws_iam_role_policy_attachment.ec2_ssm_core
aws_lambda_function.lifecycle_handler
aws_lambda_permission.allow_eventbridge
aws_launch_template.lt
aws_s3_bucket.log_bucket
aws_ssm_document.log_backup_doc
```

코드를 배포(`terraform apply`)한 후, ASG의 **Desired Capacity를 1에서 0으로 수정**하면 종료 프로세스가 시작됩니다. 이때 아래 순서대로 확인해야 정확한 검증이 가능합니다.

![검증 화면 1: 배포 결과](@/assets/images/autoscaling-log-preservation-lifecycle-hook-ssm/verify-1.png)

![검증 화면 2: 콘솔 확인](@/assets/images/autoscaling-log-preservation-lifecycle-hook-ssm/verify-2.png)

![검증 화면 3: 콘솔 확인](@/assets/images/autoscaling-log-preservation-lifecycle-hook-ssm/verify-3.png)

### Step 1. Auto Scaling Group 상태 확인 (가장 먼저!)

인스턴스가 바로 사라지지 않고 "잠시 멈춤" 상태가 되어야 합니다.

- **Console:**
  1. EC2 콘솔 > 좌측 메뉴 **Auto Scaling Groups** 클릭.
  2. 생성한 ASG (`log-backup-asg`) 선택.
  3. **[Instance management]** 탭 클릭.
  4. **Lifecycle state**가 **`Terminating:Wait`**인지 확인. (이 상태여야 정상!)
  5. **[Activity]** 탭에서도 "Lifecycle hook locking..." 메시지 확인 가능.

```bash
aws autoscaling describe-auto-scaling-instances
# 결과 JSON에서 "LifecycleState": "Terminating:Wait" 확인
```

- **확인 포인트:** `Terminating:Wait` 상태여야 정상입니다. (Wait 없이 사라지면 실패)

![Terminating:Wait 상태 확인](@/assets/images/autoscaling-log-preservation-lifecycle-hook-ssm/asg-terminating-wait.png)

### Step 2. Lambda 실행 로그 확인 (트러블슈팅 핵심)

EventBridge가 Lambda를 제대로 찔러줬는지, Lambda 코드가 에러 없이 돌았는지 봅니다.

- **Console:**
  1. Lambda 콘솔 > 함수 목록 > `ASGLifecycleHandler` 클릭.
  2. **[Monitor]** 탭 > **[View CloudWatch logs]** 버튼 클릭.
  3. 가장 최신 Log Stream 클릭.
  4. 로그 내용 확인: `Event Received`, `Sending SSM Command`, `Sending CONTINUE` 메시지가 찍혀 있어야 함.

```bash
# 최신 로그 스트림 이름 가져오기 및 로그 출력 (jq 필요)
LOG_GROUP="/aws/lambda/ASGLifecycleHandler"
LAST_STREAM=$(aws logs describe-log-streams --log-group-name $LOG_GROUP --order-by LastEventTime --descending --limit 1 | jq -r '.logStreams[0].logStreamName')

aws logs get-log-events --log-group-name $LOG_GROUP --log-stream-name $LAST_STREAM
```

### Step 3. Systems Manager (SSM) 명령 성공 여부

Lambda가 명령은 보냈는데, EC2 내부에서 스크립트가 터졌을 수도 있습니다.

- **Console:**
  1. Systems Manager 콘솔 > 좌측 메뉴 **Run Command** 클릭.
  2. **[Command history]** 탭 확인.
  3. 가장 최근 명령의 상태가 **`Success`**인지 확인.
  4. Command ID를 클릭해서 **[Output]**을 보면 `echo 'Backing up logs...'` 등의 스크립트 실행 결과를 볼 수 있음.

```bash
# 가장 최근 실행된 명령 1개 조회
aws ssm list-commands --max-results 1
# "Status": "Success" 확인
```

### Step 4. S3 버킷 파일 확인 (결과물)

실제로 로그 파일이 들어왔는지 봅니다.

- **Console:**
  1. S3 콘솔 > 버킷 목록.
  2. `asg-log-backup-xxxx` 버킷 클릭.
  3. `i-xxxxx-syslog.log` 파일이 생성되었는지 확인.

```bash
# 버킷 이름은 테라폼 출력값이나 콘솔에서 확인 후 입력
aws s3 ls s3://<YOUR_BUCKET_NAME>/
```

### Step 5. 최종 종료 확인

모든 작업이 끝나면 Lambda가 `CONTINUE`를 보냈으므로, 인스턴스는 사라져야 합니다.

- **Console:** 다시 ASG의 **[Instance management]** 탭이나 EC2 인스턴스 목록을 보면 상태가 `Terminated`로 변해 있고 목록에서 사라집니다.

---

## 마무리

**실습이 끝나면 반드시 생성한 리소스를 삭제해주세요.**

```bash
terraform destroy -auto-approve
```

삭제가 성공적으로 되었는지 현재 state가 있는지 체크!

```bash
terraform state list
```
