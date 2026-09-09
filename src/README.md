# 로컬 UserScript 소스
현재 Tampermonkey에서 내보낸 전체 소스를 아래 두 파일로 로컬 이관했습니다.

- `kcu-lecture-helper.user.js`: 배속·알림용 Helper
- `kcu-auto-navigator.user.js`: 현재 사용 중인 Navigator POC

UserScript 헤더부터 마지막 실행 코드까지 포함해야 합니다. 파일명을 바꿔도 내부 버전이 올라가는 것은 아닙니다.
Navigator 파일의 헤더는 POC 3.1을 표기하지만, 파일 존재는 전달·설치·실행 성공 검증을 뜻하지 않습니다.

개인 원본은 먼저 `../.local/originals/`에 백업하세요.
Helper의 ntfy 주소와 사용 여부는 Tampermonkey의 로컬 저장소에만 보관합니다. 새 설치는 주소가 비어 있고 비활성 상태이며, Helper 메뉴에서 각 사용자가 자신의 HTTPS 주소를 설정한 뒤 켜야 합니다. 이 작업만으로 기존 Git 이력이나 배포 상태가 검증·변경되는 것은 아닙니다.
