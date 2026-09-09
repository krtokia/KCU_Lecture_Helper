# 프로젝트 인수인계
기준일: 2026-09-09. 기존 대화와 사용자 첨부 자료를 정리한 문서이며, 현재 KCU 사이트를 새로 실측한 보고서가 아니다. 근거는 SOURCES.md 참고.

## 1. 목표
기존 Helper는 영상 자동 감지·2배속 유지·중지/종료 알림을 담당한다.
별도 Navigator는 과목/주차/차시를 찾아 재생을 이어주는 방향으로 개발 중이다.
지금은 기능을 확장하기 전에 로컬 Git/VS Code/Codex 개발과 사용자 배포를 정리한다.

## 2. 버전과 확인 상태
| 항목 | 상태 |
|---|---|
| Helper 1.0.0 | 첨부 원본에서 확인. 자동 배속·OS 알림·ntfy가 있었으며, 원본에는 개인 ntfy 주소가 포함되어 있었다. |
| Helper 1.0.1 | 대화에서 전체 코드 파일이 전달되었다. 반복 로그 정리 외 ntfy 응답 로그와 업데이트 메타데이터도 바뀌었다. 실제 설치 여부는 내보낸 코드로 확인한다. |
| 업데이트 문제 | 제공된 1.0.1에 @downloadURL none이 들어갔다. 사용자는 자신의 배포본 업데이트를 막는 것에 이의를 제기했다. 조용히 유지하거나 배포하면 안 된다. |
| Navigator POC 3 | 2026-09-08 리포트에 scriptVersion 0.3.0, phase PLAYING, finishedAt/result null. 실제 playing 확인은 있지만 해당 리포트는 완료 검증 결과가 아니다. |
| Navigator POC 3.1 | `src/kcu-auto-navigator.user.js`에 0.3.1 내보낸 소스를 로컬 이관했다. 파일 존재는 사용자 전달·설치·실행 성공을 뜻하지 않는다. |
| 현재 로컬 배포 소스 | Helper 1.0.1과 Navigator 0.3.2에 GitHub Raw `main`의 동일한 `@updateURL`/`@downloadURL`을 추가했다. Navigator 런타임 VERSION도 0.3.2로 맞췄다. 실제 Tampermonkey 설치본과의 일치 및 KCU 동작은 미검증이다. |
| 원격 저장소 | 공개 `krtokia/KCU_Lecture_Helper`, 기본 브랜치 `main`. GitHub Raw 자동 업데이트 메타데이터를 사용하며 실제 Tampermonkey 업데이트는 미검증. |

Helper 교체는 Navigator 업그레이드가 아니다. 이전의 “이미 받은 3.1을 실행” 안내를 사실로 이어받지 않는다. [P1, P2, P4, P5]

## 3. Helper 로그 수정의 의도
기존 `재생 정체 감지`는 waiting/stalled 이후 실제 정체가 확정되기 전 감시 시작 시점에 출력되던 문구다.
이 로그의 반복만으로 실제 영상이 매번 멈춘다고 해석하면 안 된다.

요구는 감시 시작 로그를 디버그로 낮추거나 “중지 미확정”으로 명확히 표시하는 것이다.
기존 코드는 일정 시간 뒤 영상 시간 증가량을 확인한다. 반복 이벤트에 의한 타이머 재설정 등은 실제 원본에서 확인해야 한다.
로그 개선과 감시 알고리즘 개편은 분리한다.

사용자의 의도적 일시정지도 중지 알림 대상이다. 수동 일시정지를 자동으로 해제하는 기능으로 바꾸지 않는다.
ntfy 서버 응답 성공과 실제 단말 수신은 구분한다. [P1, P5]

## 4. KCU 조사 자료에서 확인한 개발 맥락
다음은 사용자가 제공한 2026-09-08 DOM·상태 분석 보고서의 당시 관찰이다. 현재 페이지와 코드에서 재검증해야 한다. [P3]

| 대상 | 당시 관찰 |
|---|---|
| 현재 과목 | `#frm input[name=coseCd]`와 `#lnb li.subjLnb.on a[data-cose-cd]` 교차 확인. 동일 ID가 다른 패널에도 있어 form 스코프를 사용. |
| 과목 이동 | LNB의 `li.subjLnb` DOM 순서. 링크 클릭은 form POST를 거쳐 전체 페이지 이동. 우상단 select는 공지 화면으로 이동하므로 자동 이동에 사용하지 않음. |
| 주차 진입 | 클릭 가능한 `a.weekInfo.open` 기준. 조사 당시 날짜/주차 수를 고정하지 않음. |
| 현재 주차 | `#weekNo`와 `.swiper-slide.weekNo.on a.weekInfo[data-week-no]`는 클릭 직후, AJAX 전 바뀌므로 로딩 완료 증거가 아님. |
| 목록 응답 | 실제 주차 UI 클릭이 발생시키는 POST `/common/lect/selectWeekLectInfo`를 관찰. 당시 ajaxComplete에서는 목록 렌더가 완료되어 있었음. 응답과 대상 일치를 확인해야 함. |
| 차시 | `#videoInfoBody button.btnVideo`. `#lectNo`/`.on`은 재생 전에도 있어 실제 playing과 구분. |
| 출석 | `data-aten-yn` 또는 응답의 `weekLectInfoList[].atenYn`. `data-per`/`data-chk`로 출석 완료를 단정하지 않음. |
| 주차 good | 모든 차시가 출석 Y라는 의미. 영상 전체 시청과 다름. |
| 영상 없음 | 버튼 없는 준비 중/시험 주차 등의 분류가 필요. |
| 동시 접속 | 다른 강의실 탭/접속이 키 불일치에 따른 강제 이탈을 일으킬 수 있어 테스트는 한 탭만 유지. |
| iframe | LMS `lms.kcu.ac`, 플레이어 `mvapi.kcu.ac`. 각각 실행되는 코드와 origin/source 검증된 메시지로 관찰. |

`#weekNo`의 value 변경을 attribute 변경으로 가정해 MutationObserver만 믿지 않는다.
만료/지각 주차 규칙은 당시 관측이 충분하지 않아 미확정이다. 8과목 조사 결과를 고정 과목 수로 사용하지 않는다.

## 5. POC 3.1 목표 — 완료로 간주하지 않음
현재 과목에서 열린 주차의 출석 미인정 영상 한 차시 선택 → 실제 재생 → 종료 후보 관찰 → 대기 → 같은 주차 재조회 → 출석 확인 → 종료.
다음 차시/다음 과목 연속 실행은 아직 다음 단계다.

참조 코드에서 계획된 항목이며, 현재 설치본에 구현되어 있다고 가정하지 않는다. [P4]
- 실제 ended/ended=true와 끝부분 위치 기반 fallback을 구별한다.
- fallback은 실제 currentTime이 duration 끝 2초 이내에서 일정 시간 관찰된 경우다. 후보 뒤 최소 10초 유예 및 인스턴스/위치 재확인.
- 같은 주차 UI를 재조회해 새 응답의 해당 차시 atenYn Y를 확인한다. 캐시된 응답/오래된 DOM을 완료 증거로 쓰지 않는다.
- 결과를 PASS_NATIVE_END / PASS_FALLBACK_END 등으로 구분한다. 출석 Y나 fallback은 전체 영상 시청 증명이 아니다.
- visibility/focus, iframe 교체, currentTime/duration/paused/ended, 신호 공백을 기록한다.
- 미확인 KCU 상태 코드를 종료로 가정하지 않는다. 출석/시청 기록 API를 직접 쓰거나 시간을 위조하지 않는다.
- POC 정지는 예약을 취소하고 영상은 유지할 수 있다. 새로고침/수동 탐색은 이전 실행을 중단하며 자동 재시작하지 않는다.

실제 한 차시 종료와 출석 재조회 리포트를 확보한 뒤에 연속 재생을 설계한다.

## 6. 다음 작업 순서
A. 현재 설치본 export/개인 원본 백업 → 메타데이터 확인 → 로컬 연결 → 반영 확인 → 기본 기능 회귀 확인.
B. ntfy 설정/활성 상태의 업데이트 후 유지 테스트 → GitHub 직접/Greasy Fork 유지 중 배포 경로 결정 → 승인 후 게시.
C. 실제 Navigator 기준 소스에서 3.1 요구와 차이를 비교 → 별도 변경으로 구현 → 한 차시 검증 → 이후 연속 재생 설계.

새 작업 결과에는 실제 두 소스 버전/해시, 도구 버전, 변경 메타데이터, 수행한 검사와 미검증 사항을 남긴다.

## 7. 2026-09-09 로컬 이관 기록
`src/kcu-lecture-helper.user.js`와 `src/kcu-auto-navigator.user.js`로 파일명을 정리했다. Helper는 개인 ntfy 상수를 제거하고, 빈 주소·비활성 기본값의 Tampermonkey 로컬 설정과 메뉴를 사용한다. `@connect ntfy.sh`와 배포용 URL 부재 상태는 그대로이며, 기존 Greasy Fork 게시물 변경과 Tampermonkey/KCU 브라우저 검증은 수행하지 않았다.
민감한 경로/원본 로그는 공개 문서에 쓰지 않는다.

## 8. 2026-09-09 GitHub Raw 자동 업데이트 메타데이터
두 UserScript의 `@updateURL`과 `@downloadURL`을 각각 같은 공개 GitHub Raw `main` 소스 주소로 추가했다. Helper는 1.0.1, Navigator는 0.3.2로 patch 버전을 올렸고 Navigator의 런타임 VERSION도 0.3.2로 일치시켰다.

두 파일의 `node --check`, 헤더의 버전·URL 일치 정적 검사, `git diff --check`를 통과했다. 커밋 `42937a6`을 push했고 공개 Raw 응답에서 두 새 버전 헤더를 확인했다. Tampermonkey 신규 설치/업데이트와 KCU 브라우저 검증, Greasy Fork 변경은 미수행이다.
