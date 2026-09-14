# Navigator 0.5.0: 실행 종료·차시 완료 알림

## 목표

Navigator가 자리를 비운 사용자에게 실행이 끝났는지(완료/처리 대상 없음/중단)와,
선택적으로 차시 하나가 출석 확인까지 끝났는지를 Windows 브라우저 알림과 ntfy로 알린다.

## 현재 상태 확인

- Navigator `0.4.1`은 모든 사건을 `record(type, details)` 한 곳에 기록하고, 실행 종료는
  `conclude(ctx, status, reason)` 한 곳으로 모인다. 종료 status는
  `PASS_ALL_COURSES_COMPLETED`, `NO_TARGET_ALL_COURSES`, `FAILED`, `STOPPED`의 네 가지다.
  페이지 이탈은 `conclude`를 거치지 않고 `INTERRUPTED`로 저장된다.
- 차시 완료는 `observeAndVerifyTarget()`에서 fresh AJAX 출석 Y 확인 직후
  `TARGET_COMPLETED_ATTENDANCE_CONFIRMED`로 기록된다.
- Navigator에는 `GM_notification`, `GM_xmlhttpRequest`, `@connect` 권한이 없어 어떤 알림도
  보낼 수 없다. 사용자는 돌아와서 실행 기록을 열어야 결과를 안다.
- Helper는 영상 pause 시 이미 "강의 중지" 알림을 보낸다. Navigator의 수동 pause 대기
  (`WAIT_MANUAL_RESUME`)는 같은 사건이므로 Navigator가 다시 알리면 중복된다.
- Tampermonkey 저장소는 스크립트별로 분리되어 Navigator가 Helper의 ntfy 주소를 읽을 수 없다.
- Helper의 ntfy 전송은 `https://ntfy.sh` 호스트만 허용하는 `normalizeNtfyEndpoint`,
  `Title` 헤더의 `encodeURIComponent`, `Priority: default` 구성으로 실제 동작이 확인됐다.

## 범위와 비목표

### 범위

- 실행 종료 알림. `conclude`에서 status별로 제목·본문을 만들어 보낸다.
  - `PASS_ALL_COURSES_COMPLETED`: 확인 과목 수, 완료 차시 수, 완료 차시 목록(과목명·주차·차시).
  - `NO_TARGET_ALL_COURSES`: 처리할 미수강 차시 없음.
  - `FAILED`: 중단 사유와 진행 중이던 과목·주차·차시.
  - `STOPPED`: 사용자가 직접 누른 것이므로 알리지 않는다. `INTERRUPTED`도 알리지 않는다.
- 차시 완료 알림(기본 꺼짐). 출석 Y 확인 직후 과목명·주차·차시·누적 완료 수를 보낸다.
- 채널은 브라우저 알림(`GM_notification`)과 ntfy(`GM_xmlhttpRequest`, `@connect ntfy.sh`) 두 개.
  각 알림은 켜진 채널 모두로 보낸다.
- 설정은 Navigator 자체 GM 저장소에 보관한다.
  - `kcuNavigatorNotifyOsEnabled` (기본 켜짐): 브라우저 알림.
  - `kcuNavigatorNtfyEndpoint` (기본 빈 값): 유효한 `https://ntfy.sh/...` 주소일 때만 ntfy 전송.
  - `kcuNavigatorNotifyLectureEnabled` (기본 꺼짐): 차시 완료 알림.
- Tampermonkey 메뉴 3개를 추가한다. 토글은 Helper와 같은 `켜짐 → 꺼짐` 형식이며 클릭 직후
  전체 메뉴를 해제·재등록해 라벨을 갱신한다. ntfy 주소 메뉴는 Helper와 같은 prompt 흐름이다.
- 전송 시도와 ntfy 응답 상태를 리포트 이벤트(`NOTIFICATION_SENT`, `NOTIFICATION_NTFY_RESULT`)로
  남긴다. 주소 자체는 이벤트·콘솔·리포트에 넣지 않는다.
- 버전을 `0.5.0`으로 올리고 헤더 권한을 추가한다. 안정화되면 `1.0.0`으로 올릴 후보다.

### 비목표

- 수동 pause, 과목 이동, 시작, 차시 선택 시점의 알림. pause는 Helper와 중복이고 나머지는
  자리를 비운 사용자에게 행동을 요구하지 않는다.
- Helper 소스 변경, Helper와 Navigator 간 설정 공유.
- 실행 로직(탐색·재생 확인·종료 후보·출석 검증·handoff)과 안전 정책의 변경.
- `@connect *` 또는 self-hosted ntfy 지원.

## 가정과 제약

- 알림 본문에는 과목명·주차·차시 번호가 들어간다. ntfy.sh는 외부 서버이므로 이 값이 외부로
  나간다. 사용자가 자기 topic 주소를 직접 설정했을 때만 전송되며, 기본값은 미전송이다.
- ntfy `Title` 헤더는 Helper와 같은 `encodeURIComponent` 방식을 쓴다. Helper에서 실제 수신이
  확인된 방식이므로 새 인코딩을 도입하지 않는다.
- `conclude`는 LMS 상위 페이지에서 호출되고 그 뒤 페이지 이동이 없으므로 ntfy 요청이 잘리지
  않는다. 차시 완료 알림은 같은 과목 재탐색 전에 보내므로 페이지 이동과 겹치지 않는다.
- `record()`는 실행 종료 후에도 상태 객체에 기록되고 GM 저장소에 반영된다. ntfy 응답
  이벤트는 종료 뒤 도착해도 리포트에 남는다.
- 메뉴 등록은 기존과 같이 LMS 상위 창(`installController`)에서만 수행한다.

## 설계

1. 헤더: `@version 0.5.0`, `@grant GM_notification`, `GM_xmlhttpRequest`,
   `GM_unregisterMenuCommand`, `@connect ntfy.sh` 추가. 설명 문구에 알림 언급.
2. `installController` 안에 알림 설정 로드(`loadNotifySettings`), 주소 정규화
   (`normalizeNtfyEndpoint`, Helper와 동일 규칙), 전송 함수(`sendOsNotification`,
   `sendNtfy`, `notifyUser(kind, title, message)`)를 둔다.
3. `notifyUser`는 두 채널 결과를 `NOTIFICATION_SENT { kind, os, ntfy }`로 기록한다.
   ntfy는 `onload`/`onerror`에서 `NOTIFICATION_NTFY_RESULT { kind, httpStatus | error }`를 기록한다.
4. `conclude`에서 `state.result`와 `RESULT` 이벤트 기록 뒤 `notifyRunConcluded(status, reason)`를
   호출한다. status가 `STOPPED`이면 반환한다. `FAILED`는 ntfy `Priority: high`로 보낸다.
5. `observeAndVerifyTarget`에서 `TARGET_COMPLETED_ATTENDANCE_CONFIRMED` 기록 뒤
   `notify.lectureEnabled`일 때만 `notifyLectureCompleted(completed)`를 호출한다.
6. 메뉴는 `addMenuCommand`/`unregisterMenu`/`registerMenu`/`refreshMenu` 구조를 Helper와 같게
   두고, 기존 6개 뒤에 다음 3개를 등록한다.
   - `KCU 학습 진행 · 완료/중단 알림 켜짐 → 꺼짐`
   - `KCU 학습 진행 · 차시 완료 알림 꺼짐 → 켜짐`
   - `KCU 학습 진행 · ntfy 주소 설정/지우기 (설정 안 됨)` 또는 `(설정됨)`
7. 완료 목록 본문은 최대 10개 차시까지 한 줄씩 `과목명 N주 M강`으로 적고, 넘치면 `외 K개`를 붙인다.

## 영향 컴포넌트

- `src/kcu-auto-navigator.user.js`
- `docs/TEST_CHECKLIST.md`
- `docs/RELEASE.md` (개인 설정 분리 절에 Navigator 주소 저장 추가)
- `docs/HANDOFF.md`
- 이 문서

## 수용 기준

- 전 과목 완료·대상 없음·실패 종료에서 각각 브라우저 알림이 뜨고, ntfy 주소가 설정된 경우
  같은 내용이 ntfy로도 간다. 사용자 정지와 페이지 이탈에서는 알림이 없다.
- 차시 완료 알림은 기본 꺼짐이고, 켜면 출석 Y 확인 직후 한 번만 온다.
- 세 설정은 새로고침 뒤에도 유지되고, 메뉴 라벨이 클릭 직후 현재 상태를 반영한다.
- 빈 주소·잘못된 주소에는 ntfy 요청이 발생하지 않는다. 주소는 리포트·콘솔에 나타나지 않는다.
- 탐색·재생·검증·handoff 코드 경로와 `video.play()`·시간·진도·출석 조작 부재는 그대로다.

## 검증 계획

1. `node --check < src/kcu-auto-navigator.user.js`, `git diff --check`.
2. 금지 조작 정적 검색(`video.play(`, `currentTime =`, 출석 API 호출)이 0건인지 확인.
3. Node 모의 GM API로 다음을 확인한다.
   - 기본 설정에서 메뉴 9개 등록, 알림 토글 클릭 뒤 이전 메뉴 해제·재등록과 라벨 변경.
   - `conclude('PASS_ALL_COURSES_COMPLETED')` 시 `GM_notification` 1회, 주소 미설정 시
     `GM_xmlhttpRequest` 0회, 주소 설정 시 1회이며 `url`이 저장 주소와 같음.
   - `conclude('STOPPED')` 시 두 API 모두 0회.
   - 차시 완료 알림 꺼짐/켜짐에서 `TARGET_COMPLETED_ATTENDANCE_CONFIRMED` 경로의 호출 수 0/1.
   - 잘못된 주소 입력 시 저장되지 않고 요청 0회.
4. 실제 KCU/Tampermonkey: 새로고침 뒤 메뉴 9개 표기, ntfy 주소 설정, 미수강 차시가 있는 상태에서
   시작 → 완료 알림 수신, 미수강 차시가 없는 상태에서 시작 → 대상 없음 알림 수신을 확인한다.
   Orca 내장 브라우저에 로그인된 KCU 탭이 없으면 이 단계는 사용자 실행 리포트로 대체한다.

## 구현 후 검증 기록

- 2026-09-14 Navigator `0.5.0` 구현. `node --check`, `git diff --check`, 금지 조작 정적 검색
  (`video.play(`, `currentTime =`, `playbackRate =`, 출석 값 대입) 0건.
- Node 모의 GM 환경 33건 통과: 기본 메뉴 9개, 토글 뒤 9개 해제·재등록과 라벨 변경, 설정 로드,
  완료/대상 없음/실패 알림 각 1회, 사용자 정지 0회, 주소 미설정 시 ntfy 0회, 설정 시 1회와 URL
  일치, 실패 시 `Priority: high`, 차시 완료 알림 꺼짐 0회·켜짐 1회, http·다른 호스트 주소 거부,
  빈 값으로 지움, 리포트 JSON에 주소 미포함.
- 실제 KCU/Tampermonkey 검증은 미수행. Orca 내장 브라우저에 열린 탭이 없고 Tampermonkey와 KCU
  로그인이 없다. 검증 계획 4단계는 사용자 실행 리포트로 확인한다.

## 1.0.0 메뉴 정리 (2026-09-14 추가)

사용자가 0.5.0 알림 동작에 이상이 없음을 확인했고, 남은 강의는 버그 수정 방식으로 대응하기로 했다.
개발 검증용 메뉴를 줄이고 `1.0.0`으로 올린다.

- 남기는 메뉴와 순서: 시작, 중지 (영상 유지), 브라우저 알림 토글, 차시 완료 알림 토글,
  ntfy 주소 설정/지우기, 실행 기록 저장. 총 6개.
- 제거하는 메뉴: 상태 보기(콘솔 출력만), 실행 기록 복사(저장의 불안정한 대체), 기록 초기화
  (시작·새로고침이 이미 상태를 정리함). 함수는 코드에 보존하고 등록만 하지 않는다.
- 실행 기록 저장은 버그 리포트 전달 수단으로 유지한다. 리포트 구조는 바꾸지 않는다.
- 헤더 설명·사용 안내·문서의 POC/Beta 표현을 1.0.0 기준으로 맞춘다. 실행 로직은 바꾸지 않는다.

수용 기준: 메뉴 6개가 위 순서로 표시되고 토글 뒤에도 순서가 유지된다. 저장 메뉴로 만든 파일이
기존 리포트와 같은 구조다. 검증: 문법 검사, 모의 GM 환경에서 메뉴 6개·순서·토글 뒤 순서 유지,
`git diff --check`.
