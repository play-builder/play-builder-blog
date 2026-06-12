---
title: "컨테이너 공격 표면 최소화: Linux Capabilities로 Root 권한 제거하기"
description: 웹 서버는 80번 포트가 필요하고 1024 미만 포트는 Root가 필요하다는 딜레마를, Linux Capabilities와 Kubernetes securityContext로 해결하는 실습 가이드.
pubDatetime: 2026-01-29T17:20:00Z
tags:
  - security
  - kubernetes
  - container
featured: false
draft: false
---

웹 서버를 운영할 때 흔히 마주치는 딜레마가 있습니다.

- 웹 서버는 표준 포트인 **`80`**번을 사용해야 합니다
- 그런데 리눅스에서 **`1024`**번 미만 포트는 Root 권한이 필요합니다
- Root로 실행하면 해킹 시 전체 시스템이 위험해집니다

## Table of contents

## 기초 사전 지식: 왜 Root가 위험한가

컨테이너를 Root로 실행하면, 해당 컨테이너가 해킹당했을 때 공격자가 Root 권한을 획득합니다. 최악의 경우 **Container Escape**를 통해 **호스트 서버 전체를 장악할 수 있습니다.**

```text
[해커] → [Nginx 취약점 공격] → [컨테이너 Root 획득] → [호스트 탈출] → [전체 시스템 장악]
```

---

## 대안책: Linux Capabilities

**`Linux Capabilities`**는 Root 권한을 잘게 쪼개어 필요한 것만 부여하는 기능입니다.

| Capability | 기능 |
| --- | --- |
| NET_BIND_SERVICE | 1024 미만 포트 바인딩 |
| NET_RAW | Raw 소켓 생성 (ping 등) |
| SYS_TIME | 시스템 시간 변경 |
| SYS_ADMIN | 다양한 관리 작업 |

이 중 `NET_BIND_SERVICE`만 부여하면 Root가 아니어도 80번 포트를 열 수 있습니다.

---

## Step 1: ConfigMap 생성

Root 권한을 버리면 **Nginx**가 `/var/log`, `/var/run` 같은 시스템 경로에 쓸 수 없습니다. 모든 쓰기 경로를 `/tmp`로 우회하는 설정을 만듭니다.

`01-configmaps.yaml` 파일을 생성해보죠.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: secure-nginx-conf
data:
  nginx.conf: |
    worker_processes  1;
    error_log  /tmp/error.log warn;
    pid        /tmp/nginx.pid;

    events {
      worker_connections 1024;
    }

    http {
      access_log         /tmp/access.log;
      client_body_temp_path /tmp/client_body;
      proxy_temp_path       /tmp/proxy;
      fastcgi_temp_path     /tmp/fastcgi;
      uwsgi_temp_path       /tmp/uwsgi;
      scgi_temp_path        /tmp/scgi;

      include       /etc/nginx/mime.types;
      include       /etc/nginx/conf.d/*.conf;
    }

  default.conf: |
    server {
      listen 80;
      server_name localhost;

      location / {
        root   /usr/share/nginx/html;
        index  index.html;
      }
    }

  index.html: |
    {"status": "ok", "message": "Secure Nginx Running"}
```

```bash
kubectl apply -f 01-configmaps.yaml

# 출력 확인:
# configmap/secure-nginx-conf created
```

---

## Step 2: 보안 설정이 적용된 Pod 생성

`02-secure-pod.yaml` 파일을 생성하세요. `securityContext` 부분이 핵심입니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-webserver
  labels:
    app: secure-nginx
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80

    securityContext:
      runAsUser: 1000                  # Root(0)가 아닌 일반 유저
      runAsGroup: 3000
      allowPrivilegeEscalation: false  # 권한 상승 차단
      capabilities:
        drop: ["ALL"]                  # 모든 Capability 제거
        add: ["NET_BIND_SERVICE"]      # 80번 포트 바인딩만 허용

    volumeMounts:
    - name: config
      mountPath: /etc/nginx/nginx.conf
      subPath: nginx.conf
    - name: config
      mountPath: /etc/nginx/conf.d/default.conf
      subPath: default.conf
    - name: config
      mountPath: /usr/share/nginx/html/index.html
      subPath: index.html

  volumes:
  - name: config
    configMap:
      name: secure-nginx-conf
```

각 설정 값 비교:

| 설정 | 값 | 효과 |
| --- | --- | --- |
| runAsUser | 1000 | UID 1000번 유저로 실행 (Root 아님) |
| runAsGroup | 3000 | GID 3000번 그룹으로 실행 |
| allowPrivilegeEscalation | false | SetUID 등을 통한 권한 상승 차단 |
| capabilities.drop | ["ALL"] | 모든 특수 권한 제거 |
| capabilities.add | ["NET_BIND_SERVICE"] | 80번 포트 바인딩 권한만 부여 |

```bash
kubectl apply -f 02-secure-pod.yaml
```

Pod 상태를 확인합니다.

```bash
kubectl get pod secure-webserver
```

`Running` 상태가 되면 성공입니다.

```text
NAME               READY   STATUS    RESTARTS   AGE
secure-webserver   1/1     Running   0          10s
```

---

## Step 3: 동작 확인

Nginx가 80번 포트에서 정상 동작하는지 확인합니다.

```bash
kubectl port-forward pod/secure-webserver 8080:80
```

다른 터미널에서 요청을 보냅니다.

```bash
curl http://localhost:8080
```

정상 응답이 오면 성공입니다.

```json
{"status": "ok", "message": "Secure Nginx Running"}
```

---

## Step 4: 보안 효과 검증

**이제 해커가 컨테이너에 침투했다고 가정하고, 어떤 공격이 차단되는지 확인해봅니다.**

컨테이너 셸에 접속합니다.

```bash
kubectl exec -it secure-webserver -- sh
```

### 테스트 1: 시스템 파일 변조

```bash
echo "hack" >> /etc/hosts
```

결과:

```text
sh: can't create /etc/hosts: Permission denied
```

차단 이유: `runAsUser: 1000`이므로 Root 소유 파일에 쓸 수 없습니다.

### 테스트 2: 패키지 설치 (해커는 악성 패키지 설치 가정)

```bash
apk add curl
```

결과:

```text
ERROR: Unable to lock database: Permission denied
```

**차단 이유: 패키지 매니저는 Root 권한이 필요합니다.**

### 테스트 3: 현재 사용자 확인

```bash
id
```

결과:

```text
uid=1000 gid=3000 groups=3000
```

Root(uid=0)가 아닌 일반 유저로 실행 중임을 확인할 수 있습니다.

---

## Step 5: 추가 보안 강화 (Ping 차단)

최신 리눅스 커널은 기본적으로 **일반 유저도 ping을 사용할 수 있습니다.**

```bash
cat /proc/sys/net/ipv4/ping_group_range
```

```text
0    2147483647
```

- 이 범위는 "**거의 모든 사용자가 ping 가능**"을 의미합니다.
- 네트워크 정찰까지 차단하려면 `sysctls` 설정을 추가합니다.

`03-secure-pod-hardened.yaml` 파일을 생성하세요.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-webserver-hardened
  labels:
    app: secure-nginx
spec:
  securityContext:
    sysctls:
    - name: net.ipv4.ping_group_range
      value: "1 0"    # Ping 비활성화

  containers:
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80

    securityContext:
      runAsUser: 1000
      runAsGroup: 3000
      allowPrivilegeEscalation: false
      capabilities:
        drop: ["ALL"]
        add: ["NET_BIND_SERVICE"]

    volumeMounts:
    - name: config
      mountPath: /etc/nginx/nginx.conf
      subPath: nginx.conf
    - name: config
      mountPath: /etc/nginx/conf.d/default.conf
      subPath: default.conf
    - name: config
      mountPath: /usr/share/nginx/html/index.html
      subPath: index.html

  volumes:
  - name: config
    configMap:
      name: secure-nginx-conf
```

주목할 점은 `sysctls`가 Pod 레벨(`spec.securityContext`)에, `capabilities`는 컨테이너 레벨(`containers[].securityContext`)에 정의된다는 것입니다.

```bash
kubectl apply -f 03-secure-pod-hardened.yaml
```

### Ping 차단 확인

```bash
kubectl exec -it secure-webserver-hardened -- sh
```

```bash
ping 8.8.8.8
```

결과:

```text
PING 8.8.8.8 (8.8.8.8): 56 data bytes
ping: permission denied (are you root?)
```

네트워크 정찰도 차단되었죠!

---

## 정리: 적용된 보안 계층

| 계층 | 설정 | 차단하는 공격 |
| --- | --- | --- |
| 신분 제한 | runAsUser: 1000 | 시스템 파일 변조, 패키지 설치 |
| 권한 상승 차단 | allowPrivilegeEscalation: false | SetUID 악용, Container Escape |
| Capability 최소화 | drop: ["ALL"], add: ["NET_BIND_SERVICE"] | 대부분의 시스템 조작 |
| 커널 설정 | sysctls: ping_group_range | 네트워크 정찰 (ping) |

---

## 트러블슈팅

### Pod가 CrashLoopBackOff 상태일 때

Nginx 로그를 확인합니다.

```bash
kubectl logs secure-webserver
```

흔한 원인:

| 에러 메시지 | 원인 | 해결 |
| --- | --- | --- |
| Permission denied: /var/log | 로그 경로가 /tmp로 변경되지 않음 | nginx.conf의 error_log 경로 확인 |
| bind() failed: Permission denied | NET_BIND_SERVICE가 없음 | capabilities.add 확인 |

### sysctls 적용이 안 될 때

클러스터에서 **`unsafe sysctls`**가 허용되어 있는지 확인합니다. kubelet 설정에 다음이 필요할 수 있습니다.

```text
--allowed-unsafe-sysctls=net.ipv4.ping_group_range
```

---

## 참고 자료

- [Kubernetes Security Context 공식 문서](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Linux Capabilities man page](https://man7.org/linux/man-pages/man7/capabilities.7.html)
