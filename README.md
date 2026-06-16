# 네이버 예약 도우미 프로토타입

장소, 날짜/시간, 인원, 메뉴 카테고리로 네이버 지역 검색 후보를 찾고 예약 페이지로 넘겨 주는 반자동 예약 보조 앱입니다.

## 실행

```bash
cd /Users/jun.ji/Documents/Codex/2026-06-15/new-chat/outputs/naver-reservation-helper
node server.mjs
```

브라우저에서 `http://127.0.0.1:4177`을 열면 됩니다.

## 앱처럼 설치

서버를 켠 뒤 `http://127.0.0.1:4177`을 Chrome이나 Edge에서 열면 주소창 또는 화면 상단에 설치 버튼이 나타날 수 있습니다. `앱 설치`를 누르면 일반 앱처럼 Dock/런처에서 열 수 있습니다.

설치한 앱도 내부적으로는 이 로컬 서버를 사용하므로, 실행 전에는 `run.command`를 더블클릭하거나 위 실행 명령으로 서버를 켜 주세요.

## LTE에서 접속

같은 Wi-Fi 밖에서 쓰려면 임시 공개 터널이 필요합니다. 현재 프로토타입은 `localhost.run` SSH 터널로 HTTPS 주소를 만들 수 있습니다.

가장 쉬운 방법은 `run-lte.command`를 더블클릭하는 것입니다. 터미널 창에 `https://...lhr.life` 주소가 나오면 그 주소를 아이폰 Safari에서 열면 됩니다.

이 주소는 임시 주소라서 터미널 창을 닫거나 시간이 지나 터널이 끊기면 다시 사용할 수 없습니다. 그때는 `run-lte.command`를 다시 더블클릭해서 새 주소를 만들어 주세요.
현재 `run.command`와 `run-lte.command`는 편의를 위해 PIN 없이 열리도록 설정되어 있습니다. 임시 주소를 다른 사람에게 보내지 말고 혼자만 사용해 주세요.

```bash
ssh -o ServerAliveInterval=60 -o StrictHostKeyChecking=no -R 80:localhost:4177 nokey@localhost.run
```

터널 명령이 출력한 `https://...lhr.life` 주소를 아이폰 Safari에서 열면 됩니다.

## 고정 HTTPS 배포 준비

`render.yaml`과 `Dockerfile`을 추가해 두었습니다. Render 같은 호스팅 서비스에 올리면 임시 터널 대신 항상 같은 HTTPS 주소로 사용할 수 있습니다.

배포 환경변수에는 아래 값을 넣어 주세요.

```bash
HOST=0.0.0.0
APP_PIN=원하는_접근_PIN
APP_AUTH_SECRET=길고_임의의_문자열
NAVER_CLIENT_ID=발급받은_클라이언트_ID
NAVER_CLIENT_SECRET=발급받은_클라이언트_SECRET
KAKAO_REST_API_KEY=발급받은_카카오_REST_API_KEY
```

## 실제 식당명 검색 API 연결

카카오맵 기준 평점 확인을 우선하므로 카카오 REST API 키를 넣으면 실제 장소명과 카카오맵 상세 링크를 가져옵니다. 네이버 검색 API 키만 있으면 네이버 지역 검색으로 실제 후보를 가져옵니다.

앱 화면의 `API 키` 영역에 값을 붙여넣고 `키 저장`을 누르면 `.env` 파일에 저장되고 바로 적용됩니다.

```bash
NAVER_CLIENT_ID=발급받은_클라이언트_ID
NAVER_CLIENT_SECRET=발급받은_클라이언트_SECRET
KAKAO_REST_API_KEY=발급받은_카카오_REST_API_KEY
PORT=4177
```

키가 없으면 앱은 가짜 식당명을 만들지 않고 네이버/카카오 검색 링크만 표시합니다. 정확한 식당명을 직접 입력하면 그 이름으로 예약/지도 링크를 만들 수 있습니다. API 키는 서버에서만 사용하고 브라우저로 보내지지 않습니다.

## 동작 범위

- 카카오 로컬 API 또는 네이버 지역 검색 API로 실제 후보 식당명을 찾습니다.
- 한식, 일식, 중식, 양식, 기타 메뉴를 선택할 수 있고 기타는 세부 메뉴를 직접 입력합니다.
- `식사 중심` 또는 `술과 함께`를 선택하면 검색어와 추천 음식이 그 분위기에 맞게 바뀝니다.
- 식당명을 직접 입력하면 API 키 없이도 네이버 지도, 카카오맵 평점, 네이버 플레이스 예약 후보를 열 수 있습니다.
- 예약 찾기는 일반 검색 결과 대신 네이버 플레이스 목록을 열어, 식당 카드의 `예약` 버튼을 바로 확인할 수 있게 합니다.

최종 예약 확정, 로그인, 본인 인증은 사용자가 직접 확인해야 합니다.
