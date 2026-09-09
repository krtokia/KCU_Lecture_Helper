# GitHub 관리와 사용자 배포

## 기본 구조
두 개의 완결된 `.user.js`를 하나의 저장소에서 관리한다. 로컬 개발 중 저장할 때마다 push할 필요는 없다.
처음부터 번들러/Actions/서버를 필수로 추가하지 않는다. 기본 브랜치 Raw 주소를 배포한다면 그 브랜치에는 검증된 변경만 병합한다.
Navigator는 POC라는 사실을 명시하고 안정판으로 표현하지 않는다.

현재 이관본은 `src/kcu-lecture-helper.user.js`와 `src/kcu-auto-navigator.user.js`에 있으며, 공개 GitHub 저장소 `krtokia/KCU_Lecture_Helper`의 `main`에 추적한다. Helper는 개인 ntfy 값을 소스에 두지 않고 Tampermonkey 로컬 저장소에서만 읽는다. 기존 Greasy Fork 게시물은 변경하지 않았다.

## A. Greasy Fork 배포 유지
사용자 원본 Helper에는 Greasy Fork 업데이트 주소가 있었다. 로컬 이관본의 UserScript 헤더에서는 `@downloadURL`과 `@updateURL`만 제거했으며, 이는 기존 Greasy Fork 게시물의 주소·동기화·게시 상태를 변경하거나 검증한 것이 아니다. 기존 설치본의 업데이트 경로를 GitHub로 전환하려면 별도 승인, 실제 배포 주소, 버전 상승 및 업데이트 테스트가 필요하다. [P1]

GitHub에서 코드를 관리하고 Greasy Fork의 소스 동기화를 연결하면 기존 배포 창구를 유지할 수 있다.
Tampermonkey 공식 배포처 소개에도 이 동기화 기능이 안내되어 있다. [T5]
단순히 GitHub에 업로드했다고 Greasy Fork 게시물이 바뀌는 것은 아니다. 계정의 소스 동기화 설정과 실제 게시 반영을 확인해야 한다.

## B. GitHub Raw 직접 배포
GitHub/Gist Raw `.user.js` 설치도 Tampermonkey가 안내하는 방식이다. 일반 사용자는 개발자의 폴더나 file URL 접근 권한이 필요하지 않다. [T5]

예시 형식이며 OWNER/REPO/BRANCH는 자리표시자다.

```text
https://raw.githubusercontent.com/OWNER/REPO/BRANCH/src/kcu-lecture-helper.user.js
https://raw.githubusercontent.com/OWNER/REPO/BRANCH/src/kcu-auto-navigator.user.js
```

@updateURL은 버전을 확인하는 위치, @downloadURL은 새 코드 다운로드 위치다. 업데이트 확인에는 @version이 필요하다. [T6]
배포 시 실제 접근 가능한 주소와 상승한 버전으로 새 설치/업데이트 테스트를 수행한다.
메타데이터 전용 .meta.js를 추가한다면 전체 소스와 버전/권한이 어긋나지 않도록 생성 방식으로 관리한다.

기존 Greasy Fork 설치자는 기존 주소를 계속 확인할 수 있다. 완전 이전에는 기존 배포처의 전환 안내/메타데이터 갱신과 실제 업데이트 경로 확인이 별도로 필요하다.
@downloadURL none으로 확인이 차단된 설치본은 원격 복구 업데이트를 받지 못할 수 있어 직접 설정을 복구해야 한다. [T6]
private 저장소의 임시 Raw 토큰을 코드에 넣지 않는다. 비공개 개발이 필요하면 검증된 배포 산출물만 별도로 공개하는 방식을 선택한다.

## 개인 설정 분리
공통 배포 코드에 개인 ntfy 주소를 두면 다른 사용자의 알림이 같은 목적지로 갈 수 있다. Helper는 `GM_getValue`/`GM_setValue` 및 메뉴 명령으로 주소와 사용 여부를 로컬에 저장한다. [T8]

- 새 설치의 기본값은 비활성/빈 주소다. 이벤트 전송 시에도 활성 상태와 유효한 `https://` 주소를 다시 확인하므로 빈 값·잘못된 값에는 요청하지 않는다.
- Tampermonkey 메뉴에서 **KCU Helper: ntfy 주소 설정/지우기**로 자신의 주소를 저장하고, **KCU Helper: ntfy 꺼짐 → 켜기**로 사용 여부를 바꾼다. 메뉴 문구는 열 당시 상태를 표시하므로 상태 변경 뒤에는 메뉴를 다시 열어 확인한다.
- 기존 사용자는 자신의 주소를 다시 입력해야 한다. 개발자 주소를 fallback으로 유지하지 않는다. 주소·토큰을 콘솔이나 리포트에 출력하지 않는다.
- 현재 `@connect ntfy.sh`는 유지한다. 이 작업은 self-hosted 지원을 명분으로 `@connect *`를 추가하지 않는다.
- 업데이트/재시작 뒤 설정 유지와 LMS/플레이어 iframe에서의 일관된 적용은 실제 설치본에서 확인해야 한다. 이름/namespace/설치본 변경도 설정 이관 관점에서 검토한다.

## 게시 전
개인정보 분리 → staged diff/이력 확인 → 문법·회귀 검사 → 버전/업데이트 URL 확인 → 새 설치/업데이트 테스트 → 사용자 승인 후 게시.

5.5는 업데이트 확인과 자동 설치를 분리했다. 사용자는 필요한 옵션을 설정해야 하며 push 직후 모든 설치본에 강제 적용되는 구조는 아니다. [T1]
이미 Git 이력에 들어간 비밀정보는 현재 파일에서 지우거나 .gitignore를 추가하는 것만으로 없어지지 않는다. 공개 전에 별도로 점검한다.
