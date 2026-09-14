# 로컬 UserScript 소스
현재 Tampermonkey에서 내보낸 전체 소스를 아래 두 파일로 로컬 이관했습니다.

- `kcu-lecture-helper.user.js`: 배속·알림용 Helper
- `kcu-auto-navigator.user.js`: 전 과목 미수강 차시 순차 진행·알림용 Navigator (1.0.0)

UserScript 헤더부터 마지막 실행 코드까지 포함해야 합니다. 파일명을 바꿔도 내부 버전이 올라가는 것은 아닙니다.
Navigator는 POC 3.x와 Beta 0.4.x의 실측을 거쳐 2026-09-14에 1.0.0이 되었습니다. 이후 문제는 `실행 기록 저장` 메뉴의 리포트 파일로 전달합니다.

개인 원본은 먼저 `../.local/originals/`에 백업하세요.
Helper의 ntfy 주소와 사용 여부는 Tampermonkey의 로컬 저장소에만 보관합니다. 새 설치는 주소가 비어 있고 비활성 상태이며, Helper 메뉴에서 각 사용자가 자신의 HTTPS 주소를 설정한 뒤 켜야 합니다. 이 작업만으로 기존 Git 이력이나 배포 상태가 검증·변경되는 것은 아닙니다.
Navigator `0.5.0`의 실행 완료/중단 알림용 ntfy 주소도 Navigator 자체 Tampermonkey 저장소에만 보관합니다. Helper 주소와 공유되지 않으므로 Navigator 메뉴에서 따로 설정합니다.
