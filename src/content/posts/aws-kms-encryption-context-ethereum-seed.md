---
title: AWS KMS Encryption Context로 이더리움 시드 키 보호하기
description: KMS Key Policy의 Encryption Context 조건과 클라이언트 사이드 봉투 암호화(Envelope Encryption)를 결합해, AWS 관리자조차 복호화할 수 없는 시드 키 보호 아키텍처를 실습으로 구축한다.
pubDatetime: 2026-01-29T17:52:00Z
tags:
  - security
  - aws
  - kms
  - web3
featured: false
draft: false
---

블록체인 지갑 서비스나 핀테크 앱을 개발할 때 가장 중요한 것은 `Seed Key(Private Key)`의 관리입니다. 단순히 DB에 암호화해 저장하는 것을 넘어, **"특정 맥락(Context)이 일치하지 않으면 AWS 관리자조차 복호화할 수 없게"** 만드는 방법을 실습을 통해 알아볼 예정입니다.

## Table of contents

## Part 1. 실전 CLI 핸즈온

### 준비 사항

- AWS CLI가 설치된 macOS 환경 (Linux/Windows는 base64 옵션이 다를 수 있음)
- AWS KMS Key ID 준비

### Step 1. KMS 키 정책(Key Policy) 설정

먼저 KMS 키가 `올바른 꼬리표(Context)`를 가진 요청만 허용하도록 정책을 설정해야 합니다. AWS 콘솔에서 해당 KMS 생성 후 KMS의 **Key Policy**를 편집합니다.

핵심은 `Condition` 블록입니다. `kms:EncryptionContext:Project`가 `EthWallet`일 때만 암호화/복호화를 허용합니다.

```json
{
  "Version": "2012-10-17",
  "Id": "key-policy-with-context",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:root"
      },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow use of the key only with valid context",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:user/YOUR_KEY_USER"
      },
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:EncryptionContext:Project": "EthWallet"
        }
      }
    }
  ]
}
```

- **주의:** `Principal`의 ARN은 본인의 IAM 사용자 정보로 변경하세요.

---

### Step 2. 작업 환경 구성 및 시드 키 생성

터미널을 열고 실습 폴더로 이동한 뒤, 테스트용 시드 키 파일을 생성합니다. 여기서는 이더리움 Private key를 사용했습니다.

```text
0xabf82ff96b463e9d82b83cb9bb450fe87e6166d4db6d7021d0c71d7e960d5abe
```

```bash
echo "0xabf82ff96b463e9d82b83cb9bb450fe87e6166d4db6d7021d0c71d7e960d5abe" > private_key.txt
```

---

### Step 3. 암호화 (Encrypt)

이제 KMS를 이용해 암호화를 진행합니다. 이때 **`--encryption-context`** 옵션을 반드시 포함해야 정책에 의해 승인됩니다.

```bash
aws kms encrypt \
  --region us-east-1 \
  --key-id YOUR-KEY-ID \
  --plaintext fileb://private_key.txt \
  --encryption-context Project=EthWallet \
  --output text \
  --query CiphertextBlob | base64 -D > private_key.encrypted
```

**주의:** key-id를 각자 여러분의 kms key-id로 변경, region은 **`"us-east-1"`**인지 확인

**체크 포인트:**

- `ls -l private_key.encrypted` 명령어로 파일 용량이 0이 아닌지 확인하세요.

---

### Step 4. 복호화 테스트 (성공 vs 실패)

이 튜토리얼의 하이라이트입니다. 암호화된 파일을 다시 풀 때, `Context` 유무에 따른 차이를 확인해 봅시다.

### ✅ Case 1: 성공 (올바른 Context 입력)

정책에서 요구하는 `Project=EthWallet`을 명시하면 정상적으로 원문이 출력됩니다.

```bash
aws kms decrypt \
  --region us-east-1 \
  --ciphertext-blob fileb://private_key.encrypted \
  --encryption-context Project=EthWallet \
  --output text \
  --query Plaintext | base64 -D
```

> 결과: `0xabf82ff96b463e9d82b83cb9bb450fe87e6166d4db6d7021d0c71d7e960d5abe`

### ❌ Case 2: 실패 (Context 누락 또는 불일치)

해커가 파일을 탈취했거나, 내부자가 권한을 오용하려 할 때 Context를 모르면 어떻게 될까요?

```bash
aws kms decrypt \
  --region us-east-1 \
  --ciphertext-blob fileb://private_key.encrypted \
  --output text \
  --query Plaintext
```

> 결과: An error occurred (AccessDeniedException)...

**해설:** 키 사용 권한이 있는 `Admin`이라도, **문맥(Context)이 일치하지 않으므로 KMS가 복호화를 거부**합니다.

---

## Part 2. 심화: 클라이언트 사이드 봉투 암호화 (Envelope Encryption)

실제 프로덕션 환경에서는 보안 표준인 **클라이언트 사이드 봉투 암호화**를 적용해야 합니다.

### 왜 이 방식이 필요한가요?

AWS로 평문 데이터를 보내지 않고, **클라이언트(브라우저/앱) 내부에서 암호화를 완료**한 뒤 결과물만 전송하기 때문입니다. AWS조차도 여러분의 시드 키 원문을 볼 수 없습니다.

### 전체 아키텍처 흐름

### 1. 암호화 및 저장 (Client → AWS)

1. **DEK 요청:** 클라이언트가 KMS에 `GenerateDataKey`를 요청합니다.
2. **DEK 수신:** KMS는 '평문 키(Plaintext DEK)'와 '암호화된 키(Encrypted DEK)' 두 개를 줍니다.
3. **로컬 암호화:** 클라이언트는 메모리 상에서 '평문 키'로 시드 구문을 암호화합니다.
4. **(핵심 요소) 메모리 소거:** 암호화 직후, **메모리에서 '평문 키'와 '시드 구문'을 즉시 삭제**합니다.
5. **전송:** '암호화된 시드'와 '암호화된 키'만 백엔드 DB에 저장합니다.

### 실습 준비 (Node.js)

```bash
npm init -y
npm install @aws-sdk/client-kms
```

### Step 1. 암호화 스크립트 (`encrypt.js`)

이 스크립트는 **KMS에서 키 발급 → 로컬 암호화 → 키 폐기 → 파일 저장** 과정을 수행합니다.

`encrypt.js` 파일을 생성하고 아래 코드를 붙여넣으세요.

```js
const { KMSClient, GenerateDataKeyCommand } = require("@aws-sdk/client-kms");
const fs = require("fs");
const crypto = require("crypto");

// 설정
const KEY_ID = "alias/kms-key";
const REGION = "us-east-1";
const CONTEXT = { Project: "EthWallet" };

const client = new KMSClient({ region: REGION });

async function envelopeEncrypt(plainTextSecret) {
  console.log(
    `🔒 [1단계] KMS (${REGION})에 데이터 키(DEK) 생성을 요청합니다...`
  );

  // 1. 데이터 키 생성 요청
  const command = new GenerateDataKeyCommand({
    KeyId: KEY_ID,
    KeySpec: "AES_256",
    EncryptionContext: CONTEXT,
  });
  const response = await client.send(command);

  const plaintextDek = Buffer.from(response.Plaintext); // 쓰고 버릴 키
  const encryptedDek = Buffer.from(response.CiphertextBlob); // 저장할 키

  console.log("⚡ [2단계] 로컬 메모리에서 AES-256-GCM 암호화를 수행합니다...");

  // 2. 로컬 암호화
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", plaintextDek, iv);
  let encryptedData = cipher.update(plainTextSecret, "utf8");
  encryptedData = Buffer.concat([encryptedData, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 3. 키 폐기 (가장 중요!)
  plaintextDek.fill(0);
  console.log("🗑️  [3단계] 보안을 위해 평문 키를 메모리에서 삭제했습니다.");

  return {
    EncryptedData: encryptedData.toString("base64"),
    EncryptedDEK: encryptedDek.toString("base64"),
    IV: iv.toString("base64"),
    AuthTag: authTag.toString("base64"),
  };
}

(async () => {
  try {
    const mySeed =
      "0xabf82ff96b463e9d82b83cb9bb450fe87e6166d4db6d7021d0c71d7e960d5abe";
    console.log(`원본 데이터: ${mySeed.substring(0, 10)}...`);
    const result = await envelopeEncrypt(mySeed);
    fs.writeFileSync("mock_database.json", JSON.stringify(result, null, 2));
    console.log(
      "✅ [4단계] 암호화된 데이터를 'mock_database.json'에 저장했습니다."
    );
  } catch (err) {
    console.error(err);
  }
})();
```

```bash
node encrypt.js
```

```text
원본 데이터: 0xabf82ff9...
🔒 [1단계] KMS (us-east-1)에 데이터 키(DEK) 생성을 요청합니다...
   👉 사용 중인 키 ID: alias/kms-key
⚡ [2단계] 로컬 메모리에서 AES-256-GCM 암호화를 수행합니다...
🗑️  [3단계] 보안을 위해 평문 키를 메모리에서 삭제했습니다.
✅ [4단계] 암호화된 데이터를 'mock_database.json'에 저장했습니다.
```

### 2. 복호화 및 사용 (AWS → Client)

1. **데이터 수신:** 클라이언트가 DB에서 암호화된 데이터들을 받아옵니다.
2. **키 복구:** 클라이언트는 '암호화된 키'를 KMS에 보내 `Decrypt`를 요청합니다. (이때 올바른 Encryption Context가 필수입니다.)
3. **원문 복구:** KMS가 돌려준 '평문 키'로 시드 구문을 복호화하여 서명에 사용하고, 다시 메모리에서 즉시 삭제합니다.

### Step 2. 복호화 스크립트 (`decrypt.js`)

이 스크립트는 **DB 로드 → KMS로 키 복구 → 로컬 복호화** 과정을 수행합니다.

`decrypt.js` 파일을 생성하고 아래 코드를 붙여넣으세요.

```js
const { KMSClient, DecryptCommand } = require("@aws-sdk/client-kms");
const fs = require("fs");
const crypto = require("crypto");

// --- 설정 ---
const REGION = "us-east-1";
const CONTEXT = { Project: "EthWallet" }; // 암호화 시 사용한 것과 동일해야 함

const client = new KMSClient({ region: REGION });

async function envelopeDecrypt() {
  // 1. DB 파일 읽기
  if (!fs.existsSync("mock_database.json")) {
    console.log("❌ DB 파일이 없습니다. encrypt.js를 먼저 실행하세요.");
    return;
  }
  const dbRecord = JSON.parse(fs.readFileSync("mock_database.json", "utf8"));

  // Base64 문자열을 다시 Buffer로 변환
  const encryptedDek = Buffer.from(dbRecord.EncryptedDEK, "base64");
  const encryptedData = Buffer.from(dbRecord.EncryptedData, "base64");
  const iv = Buffer.from(dbRecord.IV, "base64");
  const authTag = Buffer.from(dbRecord.AuthTag, "base64");

  console.log("KEY 🔑 [1단계] KMS에 잠긴 키(DEK)의 해제를 요청합니다...");

  try {
    // 2. KMS에 Decrypt 요청
    const command = new DecryptCommand({
      CiphertextBlob: encryptedDek,
      EncryptionContext: CONTEXT,
    });

    const response = await client.send(command);
    const plaintextDek = Buffer.from(response.Plaintext);

    console.log("🔓 [2단계] 로컬에서 데이터를 복구합니다...");

    // 3. 로컬 복호화 (AES-256-GCM)
    const decipher = crypto.createDecipheriv("aes-256-gcm", plaintextDek, iv);
    decipher.setAuthTag(authTag); // GCM 모드는 Auth Tag 검증이 필수

    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // 4. 키 삭제
    plaintextDek.fill(0);

    return decrypted.toString("utf8");
  } catch (err) {
    console.error("❌ 복호화 실패! (Context 불일치 또는 권한 문제)");
    throw err;
  }
}

// --- 실행부 ---
(async () => {
  try {
    const recoveredText = await envelopeDecrypt();
    console.log(`✅ [완료] 복구된 원본 데이터: ${recoveredText}`);
    console.log("🎉 봉투 암호화/복호화 성공!");
  } catch (err) {
    // 에러 처리
  }
})();
```

```bash
node decrypt.js
```

컨텍스트가 다르다면 아래와 같이 에러 발생:

```text
KEY 🔑 [1단계] KMS에 잠긴 키(DEK)의 해제를 요청합니다...
❌ 복호화 실패! (Context 불일치 또는 권한 문제)
```

컨텍스트가 같다면 아래와 같이 성공:

```text
KEY 🔑 [1단계] KMS에 잠긴 키(DEK)의 해제를 요청합니다...
🔓 [2단계] 로컬에서 데이터를 복구합니다...
✅ [완료] 복구된 원본 데이터: 0xabf82ff96b463e9d82b83cb9bb450fe87e6166d4db6d7021d0c71d7e960d5abe
🎉 봉투 암호화/복호화 성공!
```

### 결론

AWS KMS의 **Encryption Context**와 **봉투 암호화**를 결합하면, **데이터 전송 구간(TLS)**, **저장 공간(DB)**, 그리고 **키 관리 시스템(KMS)**까지 **삼중으로 보호되는 강력한 보안 아키텍처**를 구축할 수 있습니다.
