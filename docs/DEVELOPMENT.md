# 로컬 개발 연결
Windows + Chrome 계열 기준. 아래 `D:\dev\kcu-lecture-tools`는 예시 경로다.

## 권장: Follow file on disk
공식 변경 이력은 Tampermonkey 5.5.0(2026-05-08)에 Chrome의 로컬 userscript 열기/디스크 변경 추적 기능 추가를 명시한다. 실제 설치 버전과 메뉴를 확인한다. [T1]

1. 현재 두 스크립트 전체 코드를 각각 저장한다.

```text
D:\dev\kcu-lecture-tools\src\kcu-lecture-helper.user.js
D:\dev\kcu-lecture-tools\src\kcu-auto-navigator.user.js
```

2. Tampermonkey 대시보드에서 대응 스크립트 편집기 → **File → Follow file on disk** → 해당 파일을 선택한다. 메뉴 이름은 공식 저장소의 사용자 보고에서도 확인된다. [T2]
3. 파일 접근 권한 요청을 확인한다. 필요한 경우 `chrome://extensions` → Tampermonkey 상세정보의 **파일 URL에 대한 액세스 허용**을 확인한다. 스크립트 실행 권한과 로컬 파일 권한은 별개다. [T4]
4. VS Code에서 저장 → Tampermonkey 편집기 내용 갱신 확인 → KCU 페이지 새로고침 후 새 코드 실행을 확인한다.

로컬 저장을 실행 중 페이지의 안전한 hot reload로 간주하지 않는다. 타이머/이벤트 리스너를 중복 주입하지 말고 테스트 종료 후 새로고침한다.
Navigator 테스트 중 새로고침하면 이전 실행이 중단될 수 있다.

Helper 하나와 Navigator 하나만 활성화한다. DEV와 배포본을 따로 설치한 경우 동일 기능의 두 복사본을 동시에 켜지 않는다. 별도 설치본은 설정 저장소가 달라질 수 있으므로 개인 설정도 확인한다.

### 갱신이 안 될 때
5.5.0에서 시간이 지나면 디스크 추적이 멈추고 오래된 저장 소스를 실행한다는 사용자 보고가 2026-09-04 등록되었다. 2026-09-09 조회 시 Open이며 모든 환경에서 발생하는 것으로 확정된 것은 아니다. [T2]

로컬 내용 → Tampermonkey 편집기 내용 → 새로고침 후 실제 로그를 비교한다.
보고자는 파일 연결을 다시 선택해 동기화했다. 추적 중에는 메뉴 표시가 달라질 수 있어 연결을 해제/재선택하는 방식도 확인한다.
반복되면 아래 방식으로 전환한다. 버전만 같아도 본문은 다를 수 있으므로 수정한 줄/개발 표식도 비교한다.

## 대안: 원래 헤더 + 로컬 @require
공식 FAQ Q402의 외부 편집기 개발 방식이다. [T3]
전체 코드는 로컬 파일에 둔다. Tampermonkey 안에는 원래 UserScript 헤더만 남기고 아래 한 줄을 헤더 안에 추가한다.
아래는 추가할 줄의 예시이지 전체 설치 스크립트가 아니다.

```javascript
// @require file:///D:/dev/kcu-lecture-tools/src/kcu-lecture-helper.user.js
```

Navigator의 대응 설치본에는 별도로 다음 참조를 추가한다.

```javascript
// @require file:///D:/dev/kcu-lecture-tools/src/kcu-auto-navigator.user.js
```

파일 URL에는 `/`를 사용하고 공백 등은 필요 시 인코딩한다. Windows Chrome이 읽을 수 있는 위치를 선택한다.
파일 URL 접근 권한은 Chrome 확장 상세정보에서 허용한다. [T4]

- 로더의 원래 @match, @grant, @connect, @run-at과 필요한 의존성을 유지한다. @grant none 템플릿으로 바꾸지 않는다.
- 로컬 파일의 헤더는 JS 주석이므로 그곳의 새 권한이 로더에 자동 적용되지 않는다. 메타데이터를 바꾸면 로더도 갱신한다.
- 로더 본문에 기존 실행 코드까지 남기면 중복 실행될 수 있다. 본문은 비운다.
- @require 로딩은 실제 실행 시점에 영향을 줄 수 있다. Navigator document-start의 초기 AJAX 관찰은 실제 브라우저에서 확인한다. [T7]
- file:///는 개발자 개인 설치본에만 쓰고 배포 파일에는 넣지 않는다.

## 개발과 자동 업데이트
배포용 코드의 업데이트 URL을 차단하지 않는다. 원격 업데이트가 개발 복사본을 덮어쓰는 것을 막아야 한다면 **본인 개발용 설치본의 업데이트 옵션만** 분리한다.
5.5에서 업데이트 확인과 자동 설치가 분리되었으므로 두 설정을 구분한다. [T1]
별도 DEV 설치본을 사용할 때는 원래 배포본을 비활성화하고 개인 설정도 확인한다.

## Codex
이 루트 폴더를 VS Code에서 열고 AGENTS.md와 HANDOFF.md로 작업 기준을 전달한다. [O1, O2]
로컬 코드 수정과 로그인된 KCU 브라우저 검증은 별개다. 브라우저 도구를 따로 연결하지 않았다면 자동 검증했다고 가정하지 않는다.
이번 이관에 별도 MCP/로컬 서버를 필수 구성으로 추가할 필요는 없다.
