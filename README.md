# 온라인 교무실

전주초등학교 교직원을 위한 단일 페이지 런처. HTML, CSS, Vanilla JavaScript로 구현합니다.

## 실행

`python -m http.server 8080` 실행 후 http://localhost:8080 에 접속합니다. HTML을 직접 열어도 검색과 업무 링크는 사용할 수 있지만 식단 JSON은 HTTP 서버가 필요합니다.

## GitHub Pages 배포

1. 이 폴더의 파일을 GitHub 저장소의 `main` 브랜치에 올립니다. `.github/workflows/update-meal.yml`도 포함합니다.
2. Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 선택합니다.
3. Actions → Update meal and deploy Pages → Run workflow를 실행합니다.
4. 성공한 실행의 배포 URL에서 확인합니다.

매일 한국 시간 05:30에 급식을 조회하고 사이트를 다시 배포합니다. GitHub 예약 실행은 지연될 수 있습니다. 수동 실행도 가능합니다.

## 급식

공식 NEIS API에서 확인한 전주초등학교 코드: 교육청 `P10`, 학교 `8332185`. 중식만 조회합니다. 서버에서 한국 날짜를 사용하며 알레르기 번호를 제거합니다.

NEIS의 키 없는 호출로 먼저 동작합니다. 인증키를 사용할 경우 Settings → Secrets and variables → Actions에 `NEIS_API_KEY`를 추가합니다. 키는 서버에서만 사용하며 브라우저나 JSON에 포함하지 않습니다. 인증 없는 서비스의 제한이 바뀌면 키 설정이 필요할 수 있습니다.

조회 실패와 급식 없음은 구분합니다. 날짜가 지난 JSON을 오늘의 식단으로 표시하지 않습니다. 실패 시 오류 상태를 배포하고 Actions 실행을 실패로 보고합니다. 배포된 JSON은 Actions가 생성하므로 저장소의 초기 JSON과 달라질 수 있습니다.

## 수정

업무 링크는 `js/config.js`, 디자인은 `css/style.css`에서 수정합니다. JavaScript 비활성 환경용 링크도 변경하려면 `index.html`의 href를 함께 수정합니다.

검색어·계정·방문 기록을 사이트에서 저장하지 않습니다. Google 검색 및 업무 자료는 새 탭에서 열립니다. Google 자료의 열람 권한은 원본 서비스에서 관리합니다.
