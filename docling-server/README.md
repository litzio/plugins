# Docling 서버 설치

GPU가 있는 PC를 전제로 한다. 공식 cu128 v1.38.2 이미지를 그대로 사용한다. Dockerfile은 없다.
이 PC의 Docker Desktop에서 compose 실행 검증을 진행한다. 아래 WSL2 Docker Engine 설치 경로는 이 PC에서 미검증이다.

## WSL2의 Docker Engine

1. Windows에서 `wsl --update`, `wsl --list --verbose`로 최신 WSL과 배포판 VERSION 2를 확인한다. Ubuntu 24.04 LTS를 예로 든다. Windows용 NVIDIA 드라이버를 설치하고 WSL에서 `nvidia-smi`를 확인한다. WSL 안에 Linux GPU 드라이버를 설치하지 않는다. [NVIDIA WSL 안내](https://docs.nvidia.com/cuda/wsl-user-guide/index.html).
2. [Docker Ubuntu 공식 설치](https://docs.docker.com/engine/install/ubuntu/)의 apt 저장소 등록 절차를 따른 후 `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`을 실행한다. 기존 패키지가 있으면 먼저 공식 문서의 충돌 목록을 확인한다. `docker version`, `docker compose version`을 확인한다. 권한 오류면 아래 docker 명령에 sudo를 붙인다.
3. systemd 사용 배포판에서는 `sudo systemctl enable --now docker`. 미사용이면 `/etc/wsl.conf`의 `[boot]` 아래 `systemd=true`를 설정하고 Windows에서 `wsl --shutdown` 후 배포판을 다시 연다. systemd를 켜지 않는 환경은 `sudo service docker start`로 매번 시작한다. [WSL systemd](https://learn.microsoft.com/en-us/windows/wsl/systemd), [Docker 서비스 시작](https://docs.docker.com/engine/daemon/start/).
4. [NVIDIA Container Toolkit 공식 설치](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)의 apt key와 stable 저장소 등록 후 `sudo apt update && sudo apt install nvidia-container-toolkit`을 실행한다. `sudo nvidia-ctk runtime configure --runtime=docker` 후 `sudo systemctl restart docker` (systemd가 없으면 `sudo service docker restart`).
5. WSL의 `df -h`, Windows의 디스크 여유를 모두 확인한다. 대형 CUDA 이미지와 모델, 업그레이드 중 이전 이미지가 함께 필요하므로 충분한 여유를 확보한다. Docker 저장 위치는 `docker info --format '{{.DockerRootDir}}'`로 확인하며 WSL 가상 디스크가 있는 Windows 드라이브 공간도 소비한다. 위치 변경은 [WSL 디스크 관리](https://learn.microsoft.com/en-us/windows/wsl/disk-space)를 따른다.

## 처음 시작 / 다시 시작

저장소 최상위에서 bash와 PowerShell 모두 같은 명령을 쓴다.

```sh
docker compose -f docling-server/compose.yaml pull
docker compose -f docling-server/compose.yaml up -d
docker exec docling-serve nvidia-smi
docker exec docling-serve python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="docling-project/CodeFormulaV2", revision="ecedbe111d15c2dc60bfd4a823cbe80127b58af4", local_dir="/opt/app-root/src/.cache/docling/models/docling-project--CodeFormulaV2")' 
```

빈 `docling-models` volume에는 Docker가 이미지의 기본 모델 디렉터리를 복사한다. artifacts 경로를 바꾸지 않으므로 기본 모델과 추가 모델을 함께 volume에 보관한다. 추가 모델은 실제 받은 revision으로 고정한다. 모델 준비 명령은 다음 준비 스크립트로도 제공한다. 재시작할 때마다 다운로드하지 않는다.

```sh
bash docling-server/prepare-models.sh
curl --fail http://127.0.0.1:5001/ready
curl --fail http://127.0.0.1:5001/version
docker compose -f docling-server/compose.yaml stop
```

PowerShell 준비 확인은 `Invoke-RestMethod http://127.0.0.1:5001/ready`. PowerShell에서는 bash 대신 위 `docker exec` 명령을 직접 실행한다. WSL 재시작 후 배포판을 열고 Docker 서비스 시작을 확인한 다음 `docker compose -f docling-server/compose.yaml up -d`로 재개한다. 자동 컨테이너 시작 정책은 설정하지 않았다.

## Windows에서 localhost 접속

WSL NAT 모드에서는 localhost 전달이 필요하다(`.wslconfig`의 `localhostForwarding=true`, 기본값). Windows에서 `Invoke-RestMethod http://127.0.0.1:5001/ready`로 확인한다. Windows 11의 mirrored 모드는 Windows와 WSL 간 localhost 접속을 지원한다. 설정 변경 뒤 `wsl --shutdown`이 필요하다. [WSL 네트워크](https://learn.microsoft.com/en-us/windows/wsl/networking), [WSL 설정](https://learn.microsoft.com/en-us/windows/wsl/wsl-config).

접속 실패 시 WSL 안에서 먼저 `curl --fail http://127.0.0.1:5001/ready`, `docker port docling-serve`, `docker logs --tail 100 docling-serve`, `ss -lnt`로 서버와 바인딩을 확인한다. WSL에서는 성공하고 Windows에서만 실패하면 localhost 전달·VPN·방화벽·동일 포트 점유를 확인한다. 배포판 재시작 뒤 재시험한다. LAN 바인딩이나 portproxy로 외부에 열어 해결하지 않는다.

## 프록시 / 레지스트리 / 오프라인 이동

이미지 다운로드는 Docker Engine daemon의 프록시다. [공식 프록시 설정](https://docs.docker.com/engine/daemon/proxy/)에 따라 `/etc/docker/daemon.json`의 `proxies`에 `http-proxy`, `https-proxy`, `no-proxy`를 넣고 Docker를 재시작한다. 기존 JSON 설정을 덮어쓰지 않고 병합한다. systemd drop-in으로 `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`를 설정하는 방법도 해당 문서에 있다. systemd 미사용이면 daemon 시작 환경/서비스 설정에 같은 변수를 넣는다. Desktop의 프록시는 Desktop 설정에서 지정한다.

모델 다운로드는 daemon이 아니라 컨테이너 안의 요청이다. 필요한 경우 `docker exec -e HTTPS_PROXY -e HTTP_PROXY -e NO_PROXY docling-serve python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="docling-project/CodeFormulaV2", revision="ecedbe111d15c2dc60bfd4a823cbe80127b58af4", local_dir="/opt/app-root/src/.cache/docling/models/docling-project--CodeFormulaV2")'`처럼 호스트 환경 변수를 전달한다. WSL NAT에서 호스트 프록시가 127.0.0.1에만 있으면 컨테이너에서 접근할 수 없으므로 관리자가 허용한 접근 가능한 프록시 주소를 사용한다. 인증서가 필요한 망은 승인된 CA 배포 절차를 따르고 TLS 검증을 끄지 않는다. 비밀번호를 compose나 저장소에 쓰지 않는다.

사설 레지스트리는 관리자가 공식 이미지 digest를 보존해 복제한 주소를 제공해야 한다. `docker login` 후 compose의 image만 그 주소로 바꾸고 `docker image inspect`로 digest를 대조한다. 이 구성은 미검증이다. [레지스트리 인증서](https://docs.docker.com/engine/security/certificates/).

인터넷 되는 PC에서 `docker save -o docling-image.tar ghcr.io/docling-project/docling-serve-cu128:v1.38.2`, 대상에서 `docker load -i docling-image.tar`. [save](https://docs.docker.com/reference/cli/docker/image/save/), [load](https://docs.docker.com/reference/cli/docker/image/load/).

모델은 준비된 서버를 정지한 상태에서 `docker cp docling-serve:/opt/app-root/src/.cache/docling/models/. ./models-transfer`로 복사한다. 대상 PC에서 compose up으로 volume을 만든 뒤 서버를 중지하고 `docker cp ./models-transfer/. docling-serve:/opt/app-root/src/.cache/docling/models/`로 넣는다. `docker start docling-serve` 후 `/ready`와 실제 변환으로 확인한다. 권한 문제는 소유권 1001:0과 그룹 쓰기 권한을 확인한다. 이 내보내기/가져오기 경로는 미검증이다. [docker cp](https://docs.docker.com/reference/cli/docker/container/cp/). 전송 전후 파일 SHA-256 목록을 대조하며 모델 라이선스를 별도로 준수한다.

## 버전 올리기 / 삭제

명시 태그와 릴리스를 확인하고 디스크 여유를 검사한다. 서버를 정지하고 모델 volume을 백업한다. compose의 image 태그를 바꾸고 pull, up -d를 실행한다. 기존 volume은 자동 갱신되지 않으므로 새 버전에 필요한 기본 모델·추가 모델을 확인한다. `/version`, `/ready`, 실제 표본 변환을 확인한 뒤에만 구 이미지를 지운다. 모델/프로필 실패를 옵션 축소로 숨기지 않는다.

삭제는 `docker compose -f docling-server/compose.yaml down` (volume 보존). 모델까지 지우려면 별도 명시적 판단 뒤 `docker volume rm docling-models`. 이미지는 정확한 태그를 지정해 `docker image rm`한다. prune은 사용하지 않는다.

### Ubuntu apt 명령 예시 (WSL에서만, 이 PC에서는 실행하지 않음)

아래는 공식 문서의 저장소 설치 경로다. 기존 Engine/Toolkit이 있으면 중복 설치하지 말고 버전과 설정부터 확인한다.

```sh
sudo apt update
sudo apt install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update
sudo apt install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

마지막 명령은 systemd 사용 환경 기준이다. 미사용 환경은 앞 절의 service 명령으로 바꾼다. 근거: [Docker apt 설치](https://docs.docker.com/engine/install/ubuntu/), [Toolkit apt 설치·런타임 설정](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). 이 설치 절차는 미검증이며 대상 배포판 지원 범위를 실행 당일 다시 확인한다.

## 대상 PC 첫 실행 점검표

- [ ] WSL2 / Windows NVIDIA 드라이버 / WSL nvidia-smi
- [ ] Docker Engine 서비스 / compose plugin / NVIDIA runtime
- [ ] Windows와 WSL 디스크 여유 / 이미지 명시 태그·digest
- [ ] 컨테이너 nvidia-smi / model volume 권한과 파일
- [ ] WSL과 Windows 양쪽 `/ready`, `/version`
- [ ] 127.0.0.1:5001 바인딩 / 외부 미노출
- [ ] 고정 프로필 실제 표본 변환 성공 / 종료 후 stop

