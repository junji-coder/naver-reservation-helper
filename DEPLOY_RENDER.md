# 고정 주소로 배포하기

이 앱을 임시 터널이 아닌 항상 같은 주소로 쓰려면 Render 같은 서버 호스팅에 올려야 합니다.

## 필요한 계정

- GitHub 계정
- Render 계정

## 가장 쉬운 순서

1. GitHub에서 새 저장소를 만듭니다.
   - 저장소 이름 예시: `naver-reservation-helper`
   - 공개/비공개는 원하는 대로 선택해도 됩니다.
2. 이 폴더의 파일을 GitHub 저장소에 올립니다.
   - `.env` 파일은 올리면 안 됩니다.
   - `dist` 폴더는 올리지 않아도 됩니다.
3. Render에서 `New` → `Blueprint`를 선택합니다.
4. GitHub 저장소를 연결하고 `render.yaml`을 인식하게 합니다.
5. Render 환경변수에 아래 값을 넣습니다.
   - `HOST`: `0.0.0.0`
   - `NAVER_CLIENT_ID`: 네이버 Client ID
   - `NAVER_CLIENT_SECRET`: 네이버 Client Secret
   - `KAKAO_REST_API_KEY`: 카카오 REST API 키가 있으면 입력
6. 배포가 끝나면 `https://...onrender.com` 주소가 생깁니다.

이 주소는 iOS Safari, Android Chrome, PC 브라우저에서 모두 사용할 수 있습니다.
