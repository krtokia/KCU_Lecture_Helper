# KCU Lecture Tools — Codex 인수인계
기준일: 2026-09-09 (Asia/Seoul)

**로컬에서 추적하는 실행용 Helper/Navigator UserScript 소스가 포함되어 있습니다.** 두 파일은 현재 내보낸 원본을 이름만 정리한 로컬 작업본이며, 이 패키지는 POC 3.1의 설치·실행 성공을 검증한 결과물이 아닙니다.

## 시작
1. 기존 두 스크립트를 각각 전체 백업합니다. 개인정보가 있을 수 있는 원본은 `.local/originals/`처럼 Git에서 제외되는 위치에 보관합니다.
2. 포함된 `src/kcu-lecture-helper.user.js`와 `src/kcu-auto-navigator.user.js`를 작업본으로 사용합니다. 두 파일은 UserScript 헤더부터 마지막 실행 코드까지 포함하며, 내부 이름·namespace·버전은 이 이관에서 변경하지 않았습니다.
3. 이 루트 폴더를 VS Code에서 열고 Codex에 `CODEX_START_PROMPT.md` 내용을 전달합니다. 로컬 작업을 시작하는 데 GitHub 저장소는 필수가 아닙니다. [O1]
4. `docs/DEVELOPMENT.md`에 따라 로컬 파일을 Tampermonkey와 연결합니다.
5. Helper의 ntfy는 새 설치에서 비활성이고 주소도 비어 있습니다. Tampermonkey 메뉴에서 각 사용자가 자신의 HTTPS ntfy 주소를 저장한 뒤 활성화해야 하며, 공개 배포 전에는 Git 이력과 배포 경로를 별도로 검토합니다.

```text
VS Code / Codex → 로컬 .user.js → 내 Tampermonkey → KCU 테스트
                       ↓ 검증 후 commit / push
                    GitHub → 배포 URL → 다른 사용자의 Tampermonkey
```

GitHub 소스 관리, 로컬 파일 추적, 배포 업데이트는 별개입니다. 다른 사용자가 개발자의 로컬 폴더에 접근하는 구조가 아닙니다. GitHub Raw 설치는 공식 자료 [T5]를 참고하세요.

## 구성
- `AGENTS.md`: Codex 작업 규칙
- `docs/HANDOFF.md`: 진행 경위, 현재 상태와 다음 작업
- `docs/DEVELOPMENT.md`: 로컬 연결
- `docs/RELEASE.md`: 배포 및 개인 설정 분리
- `docs/TEST_CHECKLIST.md`: 검증 항목
- `docs/SOURCES.md`: 근거와 확인 범위

작성 과정에서 브라우저 설정, 설치된 스크립트, Greasy Fork 게시물은 변경하지 않았습니다. 비공개 GitHub 저장소 생성과 `main` push는 수행했으며, Node 문법 검사는 기록했습니다. 실제 KCU 동작은 새로 테스트하지 않았습니다.
