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
| 현재 로컬 배포 소스 | Helper 1.0.2와 Navigator 0.3.2에 GitHub Raw `main`의 동일한 `@updateURL`/`@downloadURL`을 추가했다. Navigator 런타임 VERSION도 0.3.2로 맞췄다. 실제 Tampermonkey 설치본과의 일치 및 KCU 동작은 미검증이다. |
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

## 9. 2026-09-10 Helper ntfy 상태 표기

Helper를 `1.0.3`으로 올렸다. Tampermonkey 메뉴에 `ntfy 상태 확인`을 추가하고,
토글을 `현재 꺼짐 (클릭하면 켜짐)` 또는 `현재 켜짐 (클릭하면 꺼짐)`으로 표시한다.
토글 및 주소 저장/삭제 직후에는 `켜짐/꺼짐`, `주소 설정됨/설정 안 됨`만 담은
확인창을 띄운다. 실제 주소는 표시·로그하지 않는다.

두 UserScript의 `node --check`, `git diff --check`, GM API 모의 상태 전환 검사를
통과했다. 커밋 `949fb26`을 GitHub `main`에 push했고, 공개 Raw 응답에서
`@version 1.0.3`과 기존 GitHub Raw 업데이트 URL을 확인했다. Orca 내장
브라우저에는 Tampermonkey/KCU 로그인 탭이 없어 실제 확장 메뉴 클릭과 저장 후
새로고침 검증은 미수행이다. Greasy Fork 게시는 수행하지 않았다.

## 10. 2026-09-10 상태 창의 ntfy 주소 표시

사용자 요청으로 Helper `1.0.4`는 `ntfy 상태 확인` 및 설정 변경 후 확인창에
저장된 ntfy 주소 자체를 표시한다. 이 값은 사용자가 직접 연 로컬 확인창에만
표시하며, 메뉴 라벨·콘솔·소스·문서에는 넣지 않는다. 빈 주소는 `설정 안 됨`으로
표시한다.

두 UserScript의 `node --check`, `git diff --check`, GM API 모의 상태 확인창
검사를 통과했다. 커밋 `1be5780`을 GitHub `main`에 push했고 공개 Raw 응답에서
`@version 1.0.4`와 기존 GitHub Raw 업데이트 URL을 확인했다. 실제
Tampermonkey/KCU 브라우저 검증은 아직 수행하지 않았다.

## 11. 2026-09-10 로컬 Tampermonkey 개발 연결 준비

사용자는 GitHub 연동 설치본/POC를 잠시 비활성화하고, 저장소의 로컬
`.user.js`를 따라 개발하기로 했다. 이에 따라
`docs/plans/local-tampermonkey-development-setup.md`에 Follow file on disk를
우선으로 하는 연결 계획과 `@require file:///...` 대안을 기록했다.

`node --check src/kcu-lecture-helper.user.js`,
`node --check src/kcu-auto-navigator.user.js`, `git diff --check`는 통과했다.
두 실행 소스 및 GitHub Raw 배포 메타데이터는 변경하지 않았다.

Orca를 통한 읽기 전용 데스크톱 점검에서 Chrome과 Edge 실행은 확인했지만,
현재 Tampermonkey 대시보드는 열려 있지 않았고 브라우저 접근성 스냅샷도
시간 내 응답하지 않았다. 따라서 실제 설치본의 이름·namespace·업데이트
출처를 확인할 수 없어 비활성화나 로컬 파일 연결을 수행하지 않았다.

다음 실제 작업은 사용자가 Tampermonkey 대시보드를 열어 대상 Navigator
POC를 식별한 다음 해당 설치본만 비활성화하고, 개발용 설치본에서
**File → Follow file on disk**로
`src/kcu-auto-navigator.user.js`를 선택하는 것이다. 연결 후 로컬 저장 →
편집기 반영 → 강의실 새로고침의 순서로 확인한다. Navigator 시작 메뉴는
이 연결 검증 단계에서 실행하지 않는다.

## 12. 2026-09-10 로컬 연결 Navigator POC 3.1 실측

사용자가 로컬 파일 연결 뒤 실행한 `0.3.2` 리포트에서 한 차시 POC가
`PASS_NATIVE_END`로 완료됐다. 이미 출석 `Y`였던 같은 주차 1강은 건너뛰고,
출석 미인정이던 2강만 선택했다. 실제 `playing`(2배속), `ended`, 10초 유예,
새 주차 목록 응답의 대상 `atenYn: Y` 및 UI `100%`를 순서대로 확인했다.

현재 목록에서 3강은 출석 `N`으로 남아 있지만, 이 실행은 2강 완료 뒤
`FINISHED`가 됐고 3강을 선택하거나 재생하지 않았다. 따라서 다음 차시 자동
연속 재생이 구현·검증됐다고 해석하지 않는다. 전체 시청 여부도
`fullViewingVerified: false`로 미검증이다.

후속 변경 후보는 Navigator의 시작·선택·실제 재생·완료/실패 상태를 Windows
알림과 선택적 ntfy 알림으로 알리는 것이다. 이는 Helper와 분리된 Navigator
변경으로 계획·구현·검증해야 하며, 개인 ntfy 주소는 기존처럼 GM 저장소에만
보관하고 빈 주소에는 요청하지 않는다.

## 13. 2026-09-10 Navigator POC 3.2 수동 일시정지 안전성 구현

`src/kcu-auto-navigator.user.js`를 POC 3.2 / `0.3.3`으로 올렸다. 한 차시의
실제 재생 뒤, 끝부분이 아닌 동일 플레이어의 명시적 `pause`만
`NON_END_PAUSE_OBSERVED`로 기록한다. 이어 `WAIT_MANUAL_RESUME`에서 최대 5분간
같은 플레이어의 실제 `playing` 신호를 기다리며, 이 기간 Navigator는 영상 재생,
차시 선택, 주차 재조회, 출석 확인을 호출하지 않는다. 재개 신호는
`MANUAL_RESUME_CONFIRMED`로 기록하고, 그 후에만 기존 종료 후보·10초 유예·새
목록 응답의 출석 Y 검증 흐름으로 돌아간다.

POC가 수동 pause/restart 안전성을 실제로 시험하는 목적이므로, pause/restart
증거 없이 종료 후보가 먼저 나오면 성공 처리하지 않고 실패한다. 끝부분 pause와
native ended는 기존 종료 판정으로 남겨 혼동하지 않는다. 다음 차시/과목 자동
진행, `video.play()`, currentTime/진도/출석 조작, Helper·ntfy 변경은 추가하지
않았다.

`node --check < src/kcu-auto-navigator.user.js`, 금지 조작 정적 검색,
`git diff --check`는 통과했다. Orca 내장 브라우저가 검사 가능한 탭 상태를 반환하지
않아 실제 Tampermonkey/KCU 흐름은 아직 검증하지 않았다. 다음 실행은 3강에서
실제 재생을 확인한 뒤 플레이어 UI로 끝부분이 아닌 곳에서 pause → 15초 대기 →
플레이어 UI로 재생 재개 → 끝까지 재생 → POC 3.2 리포트 복사 순서다.

## 14. 2026-09-10 POC 3.2 초기 자동 pause 오인 수정

첫 POC 3.2 (`0.3.3`) 실행 리포트에서 3강은 실제 `playing` 뒤 약 0.5초, 영상 위치
`0.814초`에 사용자의 조작 없이 `pause`가 발생했다. Navigator가 이를 수동 pause로
오인해 `WAIT_MANUAL_RESUME`으로 진입한 것이며, 영상 정지의 원인은 Navigator가
`play()`/시간/진도를 조작해서가 아니라 사이트가 보낸 초기 pause다.

`0.3.4` POC 3.2.1은 같은 실제 영상 위치가 10초에 도달하기 전의 non-end pause를
`STARTUP_PAUSE_IGNORED`로만 기록한다. 이 경우 자동 재생·다음 차시 선택을 하지
않고 일반 관찰을 유지한다. 10초 이후의 pause만 기존 수동 pause 검증으로 보며,
보고서 경계도 `KCU_POC321_REPORT`로 분리했다.

`node --check < src/kcu-auto-navigator.user.js`, 금지 조작 정적 검색,
`git diff --check`는 통과했다. 실제 KCU 재실행은 아직 필요하다. 테스트 시 초기
pause가 다시 나서 영상이 멈춘 채라면 사용자가 플레이어 UI로 한 번 재생해 10초를
넘긴 뒤에, 다시 플레이어 UI로 수동 pause를 시험한다.

## 15. 2026-09-10 POC 3.2.1 완주 및 POC 3.3 진단 확장

사용자가 저장한 POC 3.2.1 완주 리포트에서 3강은 `PASS_NATIVE_END`, 새 목록 응답의
대상 `atenYn: Y`, `nonEndPauseObserved: true`, `manualResumeConfirmed: true`를 모두
확인했다. 중간 pause는 영상 위치 `45.232초`에서 발생했고, 그 직전 약 90ms에
상위 창 blur와 iframe focus가 기록됐다. 이 상관관계만으로 특정 위치의 사이트
pause인지 포커스/입력 영향인지는 단정하지 않는다.

Navigator `0.3.5` POC 3.3은 이에 맞춰 시작부터 종료까지 compact `timeline`을
추가했다. media 상태 전이와 1초 단위 `timeupdate`, iframe/top focus·visibility,
입력의 trusted 여부·대상 유형·좌표 존재 여부만 최대 5,000건 기록한다. 키 문자,
키 코드, 실제 좌표, URL, 원본 RPC, 세션값은 넣지 않는다. 이는 관찰 전용이며
재생/정지/시간/진도/출석/다음 차시 조작을 추가하지 않았다.

`node --check < src/kcu-auto-navigator.user.js`, `git diff --check`, 재생·정지·시간
대입 정적 검색을 통과했다. 실제 POC 3.3 리포트는 아직 필요하다. 짧은 강의 한 회
후 `timeline`과 `dropped.timeline`을 포함한 전체 리포트를 확인한다.

POC 3.3은 수동 pause가 한 번도 발생하지 않아도 진단 리포트와 native ended/출석
확인까지 완료한다. pause가 생긴 경우에만 기존 재개 대기와 해당 증거 필드를 쓴다.

## 16. 2026-09-10 Helper 비의도적 pause 복구 제어 구현

사용자가 저장한 POC 3.3의 비영점 재개 진단에서는 실제 `playing` 뒤 약 0.5초에
입력 흔적 없는 `pause`가 발생했다. 사용자는 Helper를 비활성화해도 같은 현상을
확인했으므로, Helper의 배속 대입을 단독 원인으로 단정하지 않는다. 이 원본 로그는
민감정보 보호를 위해 저장소의 무시된 로컬 `log/`에만 남기고 문서에는 넣지 않는다.

Helper `1.0.5`는 자동 배속과 **비의도적 중지 자동 재개**를 독립 Tampermonkey
메뉴/GM 저장소 설정으로 제공한다. 새 자동 재개는 기본 꺼짐이며, 실제 `playing`이
한 번 확인된 뒤에만 동작한다. ON이면 입력 없는 pause 후 700ms를 기다려 여전히
paused이고 ended/seeking이 아닐 때 최대 두 번 `video.play()`를 시도한다. 최근
신뢰된 포인터·키보드 입력과 그 입력에 이은 seek 뒤의 pause는 직접 조작으로 보아
자동 재개하지 않으며, 기존 중지 알림은 그대로 유지한다. Navigator의 선택/재생
로직이나 시간·진도·출석 조작은 추가하지 않았다.

`node --check src/kcu-lecture-helper.user.js`와 Navigator를 포함한 두 UserScript
문법 검사, `git diff --check`, 그리고 Helper의 유일한 `video.play()` 호출이 위
조건부 복구 루틴에 있는 정적 검사를 통과했다. Node 모의 video 이벤트에서도 자동
재개 ON의 무입력 pause는 1회 재생 요청, trusted pointer 입력 뒤 pause는 0회 요청을
확인했다. Orca 내장 브라우저에는 열린 탭이 없어 Tampermonkey 설치본/KCU 실제
브라우저 검증은 수행하지 못했으며, 배포·push도 하지 않았다. 실제 검증은 Helper
메뉴에서 자동 재개 ON → 비영점 재개 강의를 시작 → 입력 없는 초기 pause가 한 번
재생되는지 확인, 그 다음 직접 pause가 유지되는지 확인하는 순서다.

Helper `1.0.6`은 메뉴의 자동 배속·자동 재개 항목에 현재 `켜짐/꺼짐`을 표시하고,
클릭 직후 이전 메뉴 명령을 해제·재등록하여 라벨도 즉시 갱신한다. 이 때문에
`GM_unregisterMenuCommand` grant를 추가했으며, 기존 업데이트 URL과 download URL은
유지했다. Node 모의 Tampermonkey 메뉴 검증에서 초기 자동 재개 `꺼짐` 라벨을 눌러
`켜짐` 라벨로 교체되고 이전 명령이 남지 않는 것을 확인했다. 실제 확장 팝업 메뉴의
즉시 갱신은 KCU/Tampermonkey 설치본에서 별도 확인이 필요하다.

## 17. 2026-09-10 POC 3.3 무중단 완주 실측

사용자가 저장한 POC 3.3 `0.3.5` 리포트는 소비자행동론의 출석 미인정 2강을 한
차시 범위에서 선택해 `PASS_NATIVE_END`로 완료했다. 실제 `playing`부터 native
`ended`, 새 목록 응답의 대상 출석 `Y`까지 확인됐고, timeline drop은 0이었다.

이번 실행에는 시작 직후 또는 중간의 non-end pause가 없었다. timeline의 유일한
pause는 `ended: true`인 정상 종료와 함께 발생했으며, `nonEndPauseObserved`와
`manualResumeConfirmed`는 모두 false다. 따라서 Helper 자동 재개가 실제 KCU에서
발동한 사례는 아직 확보하지 못했지만, Navigator의 3.3 무중단 한 차시 흐름은
독립적으로 다시 확인됐다. 출석 Y는 전체 시청 증명이 아니므로
`fullViewingVerified: false`는 그대로다.

## 22. 2026-09-10 Navigator POC 3.5 현재 재생 차시 인계 구현 (폐기됨)

Navigator를 `0.3.7` / POC 3.5로 올렸다. 이는 POC 3.4가 실제 playing을 확인하고
멈춰 둔 차시를 사용자가 계속 시청 중일 때 쓰는 후속 단계다. 시작 시 LMS 현재 행,
iframe의 과목·주차·차시 identity, 출석 N·영상 Y, 실제 non-paused/non-ended/non-seeking
video와 readyState 2 이상을 모두 확인한다. 하나라도 다르면 어떤 차시 버튼도 누르지
않고 중단한다.

전제가 맞으면 현재 차시는 `CURRENT_TARGET_ADOPTED`로 관찰만 인계한다. native ended
또는 보조 종료 후보, 10초 유예, 새 UI AJAX 응답의 출석 Y를 확인한 뒤에만 기존과 동일한
순서로 다음 적격 차시 하나의 사이트 버튼을 클릭해 실제 playing까지 확인하고 종료한다.
현재 차시 재클릭, 현재/다음 차시의 시간·진도·출석 API 조작, 다음 차시 종료/출석 확인,
세 번째 차시 및 과목 이동은 추가하지 않았다.

두 UserScript 문법 검사, `git diff --check`, POC 3.4 식별자 잔존 여부와 현재 차시 버튼
클릭 부재의 정적 검사를 통과했다. 실제 KCU/Tampermonkey 검증은 아직 필요하며, 새
UserScript는 페이지 새로고침 후에만 주입되므로 이미 끝나가는 기존 3강에 소급 적용할 수
없다. 배포·push는 하지 않았다.

## 18. 2026-09-10 Navigator POC 3.4 다음 차시 전환 1회 구현

Navigator를 `0.3.6` / POC 3.4로 올렸다. 첫 미수강 영상은 기존과 같이 실제 재생,
종료 후보, 10초 유예, 새 UI AJAX 응답의 출석 Y까지 확인한다. 이 증거를
`transition.first*`에 보존한 뒤에만 같은 과목에서 같은 주차의 뒤 차시부터 이후
열린 주차 순서로 다음 출석 N·영상 Y 차시 하나를 다시 조회한다. 그 차시의 사이트
버튼 클릭과 실제 `playing`을 확인하면 `PASS_NEXT_PLAYING`으로 즉시 종료한다.

다음 차시 종료·출석 검증, 세 번째 차시, 과목 이동, 직접 media/time/progress/출석
API 조작은 추가하지 않았다. 다음 적격 차시가 없으면 `PASS_NO_NEXT_ELIGIBLE`로
종료하며, 다음 대상 재생 실패도 다른 차시로 대체하지 않는다. 출석 확인 후
`ctx.verifying`을 해제해 다음 iframe의 실제 playing 계측을 막지 않도록 했다.

두 UserScript `node --check`, 금지 조작 정적 검색, `git diff --check`를 통과했다.
실제 KCU에서는 두 개 이상의 미수강 영상이 있는 과목으로 POC 3.4 리포트를
확보해야 한다. 실제 브라우저/Tampermonkey 검증, 배포, push는 아직 수행하지 않았다.

사용자가 저장한 POC 3.4 리포트에서 유통 컨설턴트의 이해 2주 1강은 native ended
뒤 새 주차 응답의 출석 Y를 확인했다. 그 뒤 같은 주차의 2강만 선택했고, 새 player
instance의 실제 `playing`까지 확인해 `PASS_NEXT_PLAYING`으로 종료했다. 첫 완료
확인, 다음 대상 선택, 다음 버튼 클릭, 다음 playing은 각각 한 번이며 세 번째 차시
클릭은 없었다. non-end pause도 없었다. 이 실행은 다음 차시 전환을 증명하지만,
두 번째 차시의 종료/출석이나 반복 연속 재생은 아직 검증하지 않는다.

## 19. 2026-09-10 Helper 자동 재개 진단·재시도 보강

사용자가 POC 3.4 두 번째 실행에서 실제 `playing` 뒤 약 0.5초에 비종료 pause가
발생하고 Helper 자동 재개가 켜져 있어도 관찰상 재생으로 돌아오지 않은 사례를 보고했다.
Navigator 리포트만으로는 Helper의 `play()` 요청이 거부됐는지, resolve됐으나 실제
paused로 남았는지 구별할 수 없었다.

Helper를 `1.0.7`로 올려 자동 재개 요청의 거부와 “resolve 뒤 계속 paused” 모두에 대해
1초 확인 후 남은 횟수만큼 재시도하도록 했다. 실제 `playing`은 성공의 유일한 증거로
삼고 즉시 재개 타이머를 취소한다. trusted 포인터/키보드 입력 뒤 pause와 그에 이은
seek에 대한 기존 자동 재개 억제 및 중지 알림은 유지한다.

또한 Helper 상위 메뉴에 개인정보 없는 자동 재개 진단 리포트의 콘솔 출력·복사·파일
저장·초기화를 추가했다. 리포트는 최대 200건의 시각, iframe 여부, media 상태, 고정된
원인, 오류 이름만 포함하며 URL·ntfy 주소·입력 내용·세션값은 포함하지 않는다.

두 UserScript 문법 검사, `git diff --check`, 그리고 Node 모의 video 검사(계속 paused
시 정확히 2회 후 중단, 직접 입력 뒤 0회, 실제 playing 확인)를 통과했다. Orca 내장
브라우저의 실제 KCU 탭은 아직 없어 Tampermonkey 메뉴·복사/파일 저장·실제 자동 재개는
미검증이다. 배포·push는 하지 않았다.

## 20. 2026-09-10 Helper 자동 음소거 및 ntfy 메뉴 간소화

Helper `1.0.8`에는 기본 OFF의 자동 소리 끄기 설정을 추가했다. ON이면 video 감지 및
실제 playing 때 `muted`만 true로 적용하며, 볼륨·시간·출석·플레이어 버튼은 조작하지
않는다. 자동 배속·자동 재개와 독립 GM 저장소 설정이고 메뉴 라벨에 현재 상태를 표시한다.

ntfy는 주소 설정/지우기 메뉴로 결합했다. 유효한 HTTPS ntfy.sh 주소를 저장하면 자동
ON, 빈 값이면 주소를 지우고 자동 OFF이며 기존 독립 ON/OFF 메뉴는 제거했다. 자동 음소거
메뉴 1개를 추가하고 ntfy 상태·토글 2개를 제거했으므로 메뉴 총수는 9개에서 8개다.

실제 Tampermonkey/KCU 검증은 아직 필요하다. 배포·push는 하지 않았다.

Node 모의 Tampermonkey 검증에서 자동 음소거 ON의 감지 시 muted 적용, 메뉴 총 8개,
빈 ntfy 주소의 자동 OFF(기존 불일치 ON 값 정리 포함), 유효한 주소 저장의 자동 ON을
확인했다. 두 UserScript 문법 검사와 `git diff --check`도 통과했다.

## 21. 2026-09-10 POC 3.4 초기 비종료 pause 포함 성공 실측

사용자가 저장한 `KCU_POC34_REPORT_2026-09-10T07-17-55-602Z.txt`는
`PASS_NEXT_PLAYING`으로 완료됐다. 유통 컨설턴트의 이해 2주 2강은 비영점
`1101초`에서 실제 playing 뒤 약 0.5초에 non-end pause가 한 번 발생했고,
Navigator는 `WAIT_MANUAL_RESUME`으로 전환했다. 이후 실제 playing을 수동 재개로
확인하고 동일 차시를 계속 관찰했다.

2강은 native ended 및 새 UI AJAX 응답의 출석 Y까지 확인됐으며, 그 다음 같은 주차의
출석 N·영상 Y인 3강만 선택했다. 3강의 새 player instance 실제 playing을 확인한 뒤
`STOP_AFTER_NEXT_PLAYING`으로 끝났고, 세 번째 선택·다음 종료 대기·다음 출석 검증은
수행하지 않았다. `fullViewingVerified: false`는 그대로다.

## 22. 2026-09-10 Navigator POC 3.5 과목 전체 탐색으로 교체

직전 POC 3.5 현재 재생 차시 인계안은 POC 3.4가 이미 실측한 같은 과목 다음 차시 범위를
중복했으므로 폐기했다. Navigator `0.3.8`은 LNB 첫 과목부터 순서대로 열린 주차의
출석 N·영상 Y를 검사하고, 첫 적격 과목의 첫 차시 실제 `playing`만 확인해 종료한다.
과목 간 POST 페이지 이동에는 실행 ID·다음 인덱스·예상 과목 ID·시각만 GM handoff로
저장하며 새 DOM으로 도착을 대조한다. URL·세션·진도 값은 저장하지 않는다.

문법 검사와 diff 검사는 통과했다. 실제 KCU/Tampermonkey에서 과목 이동 및 handoff
소비 검증은 아직 필요하다.

첫 실측 리포트 `KCU_POC35_REPORT_2026-09-10T08-07-59-591Z`는 6개 과목을 올바른
순서로 넘겨 서비스마케팅 2주 1강을 찾았지만, `lectures()`의 공개 스냅샷에 DOM 버튼을
넣지 않는 설계 때문에 클릭 직전에 실패했다. `0.3.9`는 대상의 현재 DOM 버튼을 차시 번호,
출석 N, 영상 Y로 재대조해 클릭하도록 수정했다. 실제 재시험이 필요하다.

## 23. 2026-09-10 Helper 1.1.0 진단 메뉴 숨김

Helper를 `1.1.0`으로 올렸다. 자동 재개 진단 수집과 리포트 함수는 보존했지만 콘솔
출력·복사·파일 저장·초기화 메뉴는 등록하지 않는다. 남는 Helper 메뉴는 ntfy 주소
설정/지우기, 자동 배속, 자동 소리 끄기, 비의도적 중지 자동 재개의 네 개다.

두 UserScript 문법 검사와 `git diff --check`, Node 모의 메뉴 검사(진단 메뉴 0개,
현재 설정 메뉴 4개, 자동 음소거 적용)를 통과했다. 실제 확장 메뉴는 새로고침 뒤
확인이 필요하다. 배포·push는 하지 않았다.
