# 근거와 확인 범위
확인일: 2026-09-09. 자료는 이후 바뀔 수 있다. 이슈의 사용자 보고는 제조사 확정 공지와 구분한다.

## 공식 도구 자료
[T1] Tampermonkey Changes: 5.5.0, 2026-05-08. Chrome 로컬 파일 추적 추가, 업데이트 확인/자동 설치 분리.
`https://www.tampermonkey.net/changelog.php?locale=en`

[T2] Tampermonkey 공식 GitHub 이슈 #2883. 2026-09-04 사용자 보고, 확인 시 Open. Follow file on disk의 간헐적 동기화 중단과 재연결 사례. 모든 환경의 확정 결함 또는 수정 완료로 단정하지 않음.
`https://github.com/Tampermonkey/tampermonkey/issues/2883`

[T3] FAQ Q402. 외부 편집기: 전체 로컬 파일 + 원래 헤더의 @require.
`https://www.tampermonkey.net/faq.php?locale=en&q=Q402`

[T4] FAQ Q204. 확장의 로컬 파일 URL 접근 허용.
`https://www.tampermonkey.net/faq.php?locale=en&q=Q204`

[T5] Userscripts. Greasy Fork/GitHub 소스 동기화 소개, GitHub/Gist Raw 설치.
`https://www.tampermonkey.net/scripts.php?locale=en`

[T6] @updateURL/@downloadURL. 버전 필요, 다운로드 위치, none의 의미.
`https://www.tampermonkey.net/documentation.php?q=update_url`

[T7] @require 및 @run-at.
`https://www.tampermonkey.net/documentation.php?q=externals`
`https://www.tampermonkey.net/documentation.php?q=run_at`

[T8] GM 설정 API 등은 구현할 때 해당 항목을 확인.
`https://www.tampermonkey.net/documentation.php`

[O1] OpenAI Codex IDE extension.
`https://developers.openai.com/codex/ide/`
확인 시 공식 문서 리디렉션: `https://learn.chatgpt.com/docs/codex/ide`

[O2] OpenAI AGENTS.md.
`https://developers.openai.com/codex/guides/agents-md/`
확인 시 공식 문서 리디렉션: `https://learn.chatgpt.com/docs/agent-configuration/agents-md`

## 프로젝트 근거 — 원본은 패키지에 미포함
[P1] 이 프로젝트 첨부 Helper 원본 1.0.0 및 대화에서 제공된 KCU_Lecture_Helper_1.0.1.txt/.user.js.
기존 Greasy Fork 주소, 개인 알림 설정, 로그 변경 및 @downloadURL none 문제의 근거. 최신 실제 설치본 여부는 확인해야 한다. 개인정보가 있는 원본은 복제하지 않음.

[P2] 2026-09-08 Navigator 실행 로그와 KCU_POC3_REPORT.
scriptVersion 0.3.0, phase PLAYING, result/finishedAt null. playing 확인 근거이지 종료 검증 성공 리포트가 아님. 원본에 민감한 URL/학생 식별자/IP 등이 있어 미포함.

[P3] 사용자 제공 「KCU Auto Navigator 구현 전 정밀 DOM·상태 분석 보고서」, 조사일 2026-09-08.
당시 셀렉터/AJAX/출석 상태 분석. HANDOFF는 이를 요약하며 현재 사이트에서 새로 실측한 결과가 아님.

[P4] File Library에서 확인된 @name KCU Auto Navigator POC 3.1 / @version 0.3.1 참조 코드 내용.
현재 과목 한 차시 진단, 종료 후보, 출석 재조회 설계 참고. 사용자가 받은 적 없다고 명시했으므로 전달/설치/실행 성공의 증거가 아님.
전체 코드가 패키지에 없으며 새 Codex 세션이 자동으로 File Library에 접근할 수 있다고 가정하지 않음.

[P5] 2026-09-09 사용자 요구: 로그 개선과 기존 동작 유지, 자신의 배포본 업데이트 유지, 로컬/GitHub 관리 및 Codex 이관.
