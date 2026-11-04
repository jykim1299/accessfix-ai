# RC4 QA 보고서

최종 실행: `qa/rc4/run-2`. Playwright1.64.1, axe-core4.14.0. RC3의94개 검사를 유지·조정하고6개를 추가해 **100/100 통과**했습니다. 과거 Meta 수리 실험을 재실행하거나 재판정한 결과가 아닙니다.

## 검증 결과

- TypeScript 및 production build 성공. 빌드와 QA의app.js/app.css/data 해시 일치.
- Overview 초기 두 카드,1440×900 안의 양쪽 핵심 수치·판정, 모바일 순차 배치와 최소 크롭 폭 확인.
- 모든 상단 메뉴를 실제 클릭하고 대표CTA·두 사례 링크의 이동 결과 확인. 기존 전체case/evidence 경로도 열람.
- 두 사례4단계, 원본만 보이는 Step1, 실제 패치 변경줄·전체 코드, 기본 접힘과 펼침, Step4의 원래 판정 확인.
- 실제 Tab/Enter로 탐색·포커스·상세 펼침·이벤트 선택. workflow를 바꾸면 해당 작업 결과·소스·대표 이미지 단계가 바뀌는지 확인.
- 대표 결과2개 및 나머지4개. Menu 잔여 검토와 M5 incomplete≠확정 위반·경계선 손실 표현 유지.
- 증거69파일 HTTP200, 바이트 수와SHA-256 모두 일치. 전체 파일의 접힘/다운로드, 원본·파생본 구분과 각 파일SHA 보존.
-1440/390/320px에서 페이지 가로 넘침 없음. 원본PNG 경로·로드·대체 텍스트와CSS filter 없음 확인.
- UI 탐색 중 외부 요청·모델 요청·쓰기 요청0회. JavaScript/console/CSP/HTTP 오류와 실패 요청0건.
- 별도 최종 보안52/52 통과. 차단 확인용 쓰기 메서드 요청은 보안검사에서만 수행했으며 모두405였습니다.

## axe 원시 결과

18개 기본 상태와320px 추가14상태, 총32상태입니다. 숫자는 스캔별 노드 발생 건수이며 전역 고유 문제 수가 아닙니다.

| 너비 | 상태 | 확정 위반 | incomplete |
|---|---|---|---|
| 1440 | dashboard | 0 | 0 |
| 1440 | guide | 0 | 0 |
| 1440 | tabs | 0 | 0 |
| 1440 | switch | 0 | 0 |
| 1440 | evidence | 0 | 0 |
| 1440 | history | 0 | 0 |
| 390 | dashboard | 0 | 0 |
| 390 | guide | 0 | 0 |
| 390 | tabs | 0 | 0 |
| 390 | switch | 0 | 0 |
| 390 | evidence | 0 | 0 |
| 390 | history | 0 | 0 |
| 320 | dashboard | 0 | 0 |
| 320 | guide | 0 | 0 |
| 320 | tabs | 0 | 0 |
| 320 | switch | 0 | 0 |
| 320 | evidence | 0 | 0 |
| 320 | history | 0 | 0 |
| 320 | overview-dual-proof | 0 | 0 |
| 320 | guide-tabs-patch-expanded | 0 | 9 |
| 320 | guide-tabs-comparison-default | 0 | 0 |
| 320 | guide-tabs-events-expanded | 0 | 0 |
| 320 | guide-tabs-verification | 0 | 0 |
| 320 | guide-tabs-verdict | 0 | 0 |
| 320 | guide-switch-patch-expanded | 0 | 5 |
| 320 | guide-switch-comparison-default | 0 | 0 |
| 320 | guide-switch-events-expanded | 0 | 0 |
| 320 | guide-switch-verification | 0 | 0 |
| 320 | guide-switch-verdict | 0 | 0 |
| 320 | evidence-all-files | 0 | 0 |
| 320 | evidence-switch-proof | 0 | 0 |
| 320 | evidence-switch-code-expanded | 0 | 4 |

확정 위반은0개입니다. 기존RC3와 같은18개 기본 화면은 incomplete0건입니다. 추가 상태는RC3의8상태에서18건, RC4의14상태에서18건입니다. 너비·뷰·규칙·DOM 대상·이유를 비교하면 **18건 모두 같은 서명으로 잔존, 부재0건, 새 서명0건**입니다. 추가 범위가 늘었다는 사실을 함께 기록합니다.

18건은 전체 패치 코드의 가로 스크롤 줄에서 발생한color-contrast / elmPartiallyObscuring입니다. 최종 대비 판정은 **미검증·수동 검토 필요**로 유지합니다. incomplete를 통과나 확정 위반으로 바꾸지 않았습니다. 확정 위반0개는 전체 접근성 적합 인증이 아닙니다.

## 초기 결과 보존과 보정

run-1도 기능100/100이었으나 기본 상태에 새incomplete12건, 추가 상태에29건이 관측됐습니다. 기본12건과 추가2건은 화살표 문자만 있는 노드의nonBmp 사유였습니다. 같은 수치 사이에 읽을 수 있는 영어 `to`를 표시하도록 변경했습니다. 추가9건은 스크롤 후 반투명 헤더의 배경 계산 불확실성이어서 헤더를 불투명 흰색으로 변경했습니다. 새 표시에서 재검사한 결과는 위 표와 같습니다. 최초 원시 결과를 지우거나 합격으로 재분류하지 않았습니다.

시각 검토에서 대표 Tabs 크롭의 부분 제목이 잘리던 점은 실제 탭 줄만 보여주도록 조정했습니다. PNG 바이트는 변경하지 않았습니다. 별도21개 최종 캡처에서 Overview, 두 사례의 Step3, Repair Results, Proof & Code 기본 접힘을 확인했습니다. History 나란히/순차 배치와 상세 초기 접힘도 별도 검사했습니다.

## 한계

실제 사람의5초/2분 이해 시간, 스크린리더와Firefox/Safari는 측정하지 않았습니다. 캡처와 배치 검사는 휴리스틱 확인입니다. 검사에서 선택한 key event의 기록은 검증했지만, 과거 앱에 새 키를 보내 재실험한 것은 아닙니다.

로컬 서버는127.0.0.1:8833에서 유지합니다. 공개 호스팅과 공식 제출 검증은 이번 범위에 포함되지 않습니다.
