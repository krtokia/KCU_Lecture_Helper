AGENTS.md와 docs/HANDOFF.md, docs/DEVELOPMENT.md, docs/RELEASE.md를 읽고 이 프로젝트를 이어받아줘.

첫 작업은 기능 확장이 아니라, 현재 두 Tampermonkey 스크립트를 로컬 Git 작업 폴더에서 관리하고 VS Code에서 수정·테스트할 수 있도록 이관하는 거야.

src/kcu-lecture-helper.user.js와 src/kcu-auto-navigator.user.js의 실제 버전·권한·업데이트 주소와 동작을 먼저 확인해줘. 소스가 없으면 누락 사실을 알려주고 원본을 만들어내지 마.

Helper의 자동 배속/중지·종료 알림과 Navigator는 분리해서 유지해. POC 3.1을 이미 전달·설치·검증된 것으로 가정하지 마. 배포용 자동 업데이트도 임의로 끄지 마.

Tampermonkey의 Follow file on disk 연결을 우선으로 안내하고, 사용할 수 없을 때만 원본 헤더를 보존한 로컬 @require 방식으로 구성해줘. 실제 실행 코드까지 반영되는지 확인하는 절차를 포함해줘.

공개 배포 전 개인 ntfy 설정을 GM 저장소/설정 메뉴로 분리하는 최소 변경안을 만들고, 필요한 권한과 기존 사용자 설정 이관 방식을 설명해줘. 원본 백업과 개인정보·원본 로그는 커밋하지 마.

원격 저장소 생성이나 push, Greasy Fork 게시, Navigator 기능 확장은 아직 하지 마. 우선 로컬 이관 결과, 변경 diff, 가능한 검사 결과와 내가 브라우저에서 확인할 것을 정리해줘.
