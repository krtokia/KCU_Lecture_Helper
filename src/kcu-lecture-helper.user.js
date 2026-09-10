// ==UserScript==
// @name KCU Lecture Helper
// @name:ko KCU 강의 도우미 - 자동 배속 / 중지 / 종료 알림
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description KCU 온라인 강의 자동 배속 및 재생 중지/종료 알림
// @author       krtokia@gmail.com
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/krtokia/KCU_Lecture_Helper/main/src/kcu-lecture-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/krtokia/KCU_Lecture_Helper/main/src/kcu-lecture-helper.user.js
//
// @match        *://kcu.ac/*
// @match        *://*.kcu.ac/*
//
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setClipboard
// @connect      ntfy.sh
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.1.0';

    const DIAGNOSTIC_STORAGE_KEY =
        'kcuLectureHelperAutoResumeDiagnostics';
    const DIAGNOSTIC_MAX_EVENTS = 200;

    const NTFY_STORAGE_KEYS = Object.freeze({
        endpoint: 'kcuLectureHelperNtfyEndpoint',
        enabled: 'kcuLectureHelperNtfyEnabled'
    });

    const PLAYBACK_STORAGE_KEYS = Object.freeze({
        enabled: 'kcuLectureHelperPlaybackEnabled',
        autoResumeEnabled: 'kcuLectureHelperAutoResumeEnabled',
        autoMuteEnabled: 'kcuLectureHelperAutoMuteEnabled'
    });

    const menuCommandIds = [];

    /*
     * ============================================================
     * 설정
     * ============================================================
     */
    const CONFIG = {

        /*
         * 자동 재생속도 설정
         */
        playback: {
            enabled: true,
            speed: 2.0,

            // 사이트가 재생속도를 다시 1배속 등으로 변경하면
            // 지정한 속도로 자동 복구
            forceSpeed: true
        },

        /*
         * 자동 소리 끄기 설정
         */
        mute: {
            enabled: false
        },

        /*
         * 실제 재생 후, 사용자 입력 없이 비의도적으로 멈춘 경우만
         * 제한적으로 재생을 다시 시도한다. 새 기능이므로 기본은 꺼짐이다.
         */
        autoResume: {
            enabled: false,
            delayMs: 700,
            confirmationDelayMs: 1_000,
            userIntentGraceMs: 1_800,
            maxAttempts: 2,
            attemptWindowMs: 20_000
        },

        /*
         * 버퍼링 / stalled 발생 후
         * 이 시간 이상 영상 시간이 진행되지 않으면 중지로 판단
         */
        stallTimeout: 10_000,

        /*
         * 브라우저(OS) 알림
         */
        browser: {
            enabled: true,

            detected: false,
            started: false,
            stopped: true,
            ended: true
        },

        /*
         * ntfy 알림
         */
        ntfy: {
            enabled: false,

            detected: false,
            started: false,
            stopped: true,
            ended: true,

            url: ''
        }
    };


    function diagnosticVideoState(video) {

        if (!video) {
            return null;
        }

        const numberOrNull = (value) =>
            Number.isFinite(value) ? Number(value) : null;

        return {
            currentTime: numberOrNull(video.currentTime),
            duration: numberOrNull(video.duration),
            paused: video.paused === true,
            ended: video.ended === true,
            seeking: video.seeking === true,
            playbackRate: numberOrNull(video.playbackRate)
        };
    }


    function readDiagnostics() {

        try {

            const stored = GM_getValue(DIAGNOSTIC_STORAGE_KEY, null);

            if (
                !stored ||
                typeof stored !== 'object' ||
                !Array.isArray(stored.events)
            ) {
                return { events: [], dropped: 0 };
            }

            return {
                events: stored.events.slice(-DIAGNOSTIC_MAX_EVENTS),
                dropped: Number.isFinite(stored.dropped)
                    ? stored.dropped
                    : 0
            };

        } catch (error) {

            console.warn(
                '[LectureNotifier] 자동 재개 진단 기록을 읽지 못했습니다:',
                error
            );

            return { events: [], dropped: 0 };
        }
    }


    function recordDiagnostic(type, video, details = {}) {

        const diagnostics = readDiagnostics();
        const event = {
            at: new Date().toISOString(),
            type: String(type),
            iframe: window.self !== window.top,
            video: diagnosticVideoState(video),
            details: details
        };

        diagnostics.events.push(event);

        if (diagnostics.events.length > DIAGNOSTIC_MAX_EVENTS) {
            diagnostics.dropped +=
                diagnostics.events.length - DIAGNOSTIC_MAX_EVENTS;
            diagnostics.events = diagnostics.events.slice(-DIAGNOSTIC_MAX_EVENTS);
        }

        try {

            GM_setValue(DIAGNOSTIC_STORAGE_KEY, diagnostics);

        } catch (error) {

            console.warn(
                '[LectureNotifier] 자동 재개 진단 기록을 저장하지 못했습니다:',
                error
            );
        }
    }


    function buildDiagnosticReport() {

        const diagnostics = readDiagnostics();

        return {
            reportType: 'KCU_HELPER_AUTO_RESUME_REPORT',
            schemaVersion: 1,
            scriptVersion: VERSION,
            generatedAt: new Date().toISOString(),
            settings: {
                autoResumeEnabled: CONFIG.autoResume.enabled,
                autoSpeedEnabled: CONFIG.playback.enabled,
                autoResume: {
                    delayMs: CONFIG.autoResume.delayMs,
                    confirmationDelayMs: CONFIG.autoResume.confirmationDelayMs,
                    userIntentGraceMs: CONFIG.autoResume.userIntentGraceMs,
                    maxAttempts: CONFIG.autoResume.maxAttempts,
                    attemptWindowMs: CONFIG.autoResume.attemptWindowMs
                }
            },
            diagnostics: diagnostics,
            privacy: {
                includesUrls: false,
                includesNtfyEndpoint: false,
                includesKeyboardContent: false,
                includesSessionValues: false
            }
        };
    }


    function diagnosticReportText() {

        return (
            '===== KCU_HELPER_AUTO_RESUME_REPORT_BEGIN =====\n' +
            JSON.stringify(buildDiagnosticReport(), null, 2) +
            '\n===== KCU_HELPER_AUTO_RESUME_REPORT_END ====='
        );
    }


    function showDiagnosticReport() {

        console.log(diagnosticReportText());
        window.alert(
            '자동 재개 진단 리포트를 개발자 도구 콘솔에 출력했습니다.\n' +
            '복사 또는 파일 저장 메뉴를 사용하면 전달용 텍스트를 얻을 수 있습니다.'
        );
    }


    function copyDiagnosticReport() {

        const report = diagnosticReportText();

        try {

            GM_setClipboard(report, 'text');
            window.alert('자동 재개 진단 리포트를 클립보드에 복사했습니다.');

        } catch (error) {

            console.error(
                '[LectureNotifier] 자동 재개 진단 리포트 복사 실패:',
                error
            );
            window.alert('리포트 복사에 실패했습니다. 콘솔 출력 메뉴를 사용해 주세요.');
        }
    }


    function downloadDiagnosticReport() {

        const report = diagnosticReportText();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `KCU_HELPER_AUTO_RESUME_REPORT_${timestamp}.txt`;
        link.style.display = 'none';
        document.documentElement.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }


    function clearDiagnostics() {

        try {

            GM_setValue(DIAGNOSTIC_STORAGE_KEY, { events: [], dropped: 0 });
            window.alert('자동 재개 진단 기록을 초기화했습니다.');

        } catch (error) {

            console.error(
                '[LectureNotifier] 자동 재개 진단 기록 초기화 실패:',
                error
            );
            window.alert('자동 재개 진단 기록 초기화에 실패했습니다.');
        }
    }


    function normalizeNtfyEndpoint(value) {

        const endpoint = String(value || '').trim();

        if (!endpoint) {
            return '';
        }

        try {

            const url = new URL(endpoint);

            return url.protocol === 'https:' && url.hostname === 'ntfy.sh'
                ? url.href
                : '';

        } catch (_) {

            return '';
        }
    }


    function loadNtfySettings() {

        try {

            CONFIG.ntfy.url = normalizeNtfyEndpoint(
                GM_getValue(NTFY_STORAGE_KEYS.endpoint, '')
            );

            const storedEnabled =
                GM_getValue(NTFY_STORAGE_KEYS.enabled, false) === true;

            CONFIG.ntfy.enabled = CONFIG.ntfy.url !== '' && storedEnabled;

            if (!CONFIG.ntfy.url && storedEnabled) {
                GM_setValue(NTFY_STORAGE_KEYS.enabled, false);
            }

        } catch (error) {

            console.error(
                '[LectureNotifier] ntfy 설정을 읽지 못했습니다:',
                error
            );
        }
    }


    function loadPlaybackSettings() {

        try {

            CONFIG.playback.enabled =
                GM_getValue(PLAYBACK_STORAGE_KEYS.enabled, true) === true;

            CONFIG.autoResume.enabled =
                GM_getValue(PLAYBACK_STORAGE_KEYS.autoResumeEnabled, false) === true;

            CONFIG.mute.enabled =
                GM_getValue(PLAYBACK_STORAGE_KEYS.autoMuteEnabled, false) === true;

        } catch (error) {

            console.error(
                '[LectureNotifier] 재생 설정을 읽지 못했습니다:',
                error
            );
        }
    }


    function ntfyStatusText() {

        const endpoint = normalizeNtfyEndpoint(CONFIG.ntfy.url);

        return (
            `ntfy 알림: ${CONFIG.ntfy.enabled ? '켜짐' : '꺼짐'}\n` +
            `주소: ${endpoint || '설정 안 됨'}`
        );
    }


    function showNtfyStatus() {

        window.alert(ntfyStatusText());
    }


    function configureNtfyEndpoint() {

        const input = window.prompt(
            'ntfy.sh HTTPS 주소를 입력하세요. 빈 값이면 주소를 지웁니다.',
            CONFIG.ntfy.url
        );

        if (input === null) {
            return;
        }

        const endpoint = normalizeNtfyEndpoint(input);

        if (input.trim() && !endpoint) {
            window.alert('https://ntfy.sh/ 형식의 유효한 주소를 입력하세요.');
            return;
        }

        CONFIG.ntfy.url = endpoint;
        CONFIG.ntfy.enabled = endpoint !== '';
        GM_setValue(NTFY_STORAGE_KEYS.endpoint, endpoint);
        GM_setValue(NTFY_STORAGE_KEYS.enabled, CONFIG.ntfy.enabled);

        showNtfyStatus();
    }


    function togglePlaybackEnabled() {

        CONFIG.playback.enabled = !CONFIG.playback.enabled;
        GM_setValue(
            PLAYBACK_STORAGE_KEYS.enabled,
            CONFIG.playback.enabled
        );

        refreshMenu();

        window.alert(
            `자동 배속: ${CONFIG.playback.enabled ? '켜짐' : '꺼짐'}\n` +
            '새로고침 뒤에도 유지됩니다.'
        );
    }


    function toggleAutoResumeEnabled() {

        CONFIG.autoResume.enabled = !CONFIG.autoResume.enabled;
        GM_setValue(
            PLAYBACK_STORAGE_KEYS.autoResumeEnabled,
            CONFIG.autoResume.enabled
        );

        refreshMenu();

        window.alert(
            `비의도적 중지 자동 재개: ${
                CONFIG.autoResume.enabled ? '켜짐' : '꺼짐'
            }\n` +
            '직접 클릭·키보드 입력 뒤의 일시정지는 자동 재개하지 않습니다.\n' +
            '새로고침 뒤에도 유지됩니다.'
        );
    }


    function toggleAutoMuteEnabled() {

        CONFIG.mute.enabled = !CONFIG.mute.enabled;
        GM_setValue(
            PLAYBACK_STORAGE_KEYS.autoMuteEnabled,
            CONFIG.mute.enabled
        );

        refreshMenu();

        window.alert(
            `자동 소리 끄기: ${CONFIG.mute.enabled ? '켜짐' : '꺼짐'}\n` +
            '새로고침 뒤에도 유지됩니다.'
        );
    }


    function unregisterMenu() {

        if (typeof GM_unregisterMenuCommand !== 'function') {
            return;
        }

        while (menuCommandIds.length > 0) {

            const id = menuCommandIds.pop();

            try {
                GM_unregisterMenuCommand(id);
            } catch (error) {
                console.warn(
                    '[LectureNotifier] 메뉴 갱신 중 이전 항목을 지우지 못했습니다:',
                    error
                );
            }
        }
    }


    function addMenuCommand(label, handler) {

        const id = GM_registerMenuCommand(label, handler);

        if (id !== undefined && id !== null) {
            menuCommandIds.push(id);
        }
    }


    function registerMenu() {

        addMenuCommand('KCU Helper: ntfy 주소 설정/지우기', configureNtfyEndpoint);

        const playbackEnabledText = CONFIG.playback.enabled ? '켜짐' : '꺼짐';
        const playbackNextText = CONFIG.playback.enabled ? '꺼짐' : '켜짐';
        addMenuCommand(
            `KCU Helper: 자동 배속 현재 ${playbackEnabledText} (클릭하면 ${playbackNextText})`,
            togglePlaybackEnabled
        );

        const autoMuteEnabledText = CONFIG.mute.enabled ? '켜짐' : '꺼짐';
        const autoMuteNextText = CONFIG.mute.enabled ? '꺼짐' : '켜짐';
        addMenuCommand(
            `KCU Helper: 자동 소리 끄기 현재 ${autoMuteEnabledText} (클릭하면 ${autoMuteNextText})`,
            toggleAutoMuteEnabled
        );

        const autoResumeEnabledText = CONFIG.autoResume.enabled ? '켜짐' : '꺼짐';
        const autoResumeNextText = CONFIG.autoResume.enabled ? '꺼짐' : '켜짐';
        addMenuCommand(
            `KCU Helper: 비의도적 중지 자동 재개 현재 ${autoResumeEnabledText} (클릭하면 ${autoResumeNextText})`,
            toggleAutoResumeEnabled
        );

        /*
         * 자동 재개 진단은 필요 시 코드로 다시 노출할 수 있도록 수집·리포트 함수를
         * 보존한다. 일상 메뉴 과밀을 피하기 위해 1.1.0에서는 메뉴를 등록하지 않는다.
         */
    }


    function refreshMenu() {

        if (window.top !== window.self) {
            return;
        }

        unregisterMenu();
        registerMenu();
    }


    loadNtfySettings();
    loadPlaybackSettings();
    if (window.top === window.self) {
        registerMenu();
    }


    /*
     * ============================================================
     * 이벤트별 메시지
     * ============================================================
     */
    const EVENT_INFO = {

        detected: {
            title: '강의 영상 감지',
            message: '온라인 강의 영상이 감지되었습니다.'
        },

        started: {
            title: '강의 시작',
            message: '온라인 강의 영상이 재생되기 시작했습니다.'
        },

        stopped: {
            title: '강의 중지',
            message: '온라인 강의 영상이 중지되었습니다.'
        },

        ended: {
            title: '강의 종료',
            message: '온라인 강의 영상이 종료되었습니다.'
        }
    };

    const debugStallWatch = false;


    console.log(
        '[LectureNotifier] 스크립트 시작',
        'URL:',
        location.href,
        'iframe:',
        window.self !== window.top
    );


    /*
     * ============================================================
     * 시간 포맷
     * ============================================================
     */
    function formatTime(seconds) {

        if (!Number.isFinite(seconds)) {
            return '--:--';
        }

        seconds = Math.floor(seconds);

        const hour = Math.floor(seconds / 3600);
        const minute = Math.floor((seconds % 3600) / 60);
        const second = seconds % 60;

        if (hour > 0) {
            return (
                `${hour}:` +
                `${String(minute).padStart(2, '0')}:` +
                `${String(second).padStart(2, '0')}`
            );
        }

        return (
            `${minute}:` +
            `${String(second).padStart(2, '0')}`
        );
    }


    /*
     * ============================================================
     * 브라우저 알림
     * ============================================================
     */
    function sendBrowserNotification(title, message) {

        try {

            GM_notification({
                title: title,
                text: message,
                timeout: 10_000
            });

            console.log(
                '[LectureNotifier] 브라우저 알림 전송:',
                title
            );

        } catch (error) {

            console.error(
                '[LectureNotifier] 브라우저 알림 실패:',
                error
            );
        }
    }


    /*
     * ============================================================
     * ntfy 알림
     * ============================================================
     */
    function sendNtfy(title, message) {

        const endpoint = normalizeNtfyEndpoint(CONFIG.ntfy.url);

        if (!CONFIG.ntfy.enabled || !endpoint) {
            return;
        }

        try {

            GM_xmlhttpRequest({

                method: 'POST',

                url: endpoint,

                data: message,

                headers: {
                    'Title': encodeURIComponent(title),
                    'Priority': 'default'
                },

                onload(response) {

                    console.log(
                        '[LectureNotifier] ntfy 전송 완료:',
                        response.status
                    );
                },

                onerror(error) {

                    console.error(
                        '[LectureNotifier] ntfy 전송 실패:',
                        error
                    );
                }
            });

        } catch (error) {

            console.error(
                '[LectureNotifier] ntfy 호출 실패:',
                error
            );
        }
    }


    /*
     * ============================================================
     * 이벤트 중앙 처리
     * ============================================================
     */
    function fireEvent(type, extraMessage = '') {

        const info = EVENT_INFO[type];

        if (!info) {
            console.error(
                '[LectureNotifier] 알 수 없는 이벤트:',
                type
            );

            return;
        }

        const message = extraMessage
            ? `${info.message}\n${extraMessage}`
            : info.message;


        console.log(
            `[LectureNotifier] EVENT: ${type}`,
            message
        );


        /*
         * 브라우저 알림
         */
        if (
            CONFIG.browser.enabled &&
            CONFIG.browser[type]
        ) {
            sendBrowserNotification(
                info.title,
                message
            );
        }


        /*
         * ntfy
         */
        if (
            CONFIG.ntfy.enabled &&
            CONFIG.ntfy[type]
        ) {
            sendNtfy(
                info.title,
                message
            );
        }
    }


    /*
     * ============================================================
     * 재생 속도 적용
     * ============================================================
     */
    function applyPlaybackSpeed(video) {

        if (!CONFIG.playback.enabled) {
            return;
        }

        const speed = Number(CONFIG.playback.speed);

        if (
            !Number.isFinite(speed) ||
            speed <= 0
        ) {
            console.warn(
                '[LectureNotifier] 잘못된 재생속도:',
                CONFIG.playback.speed
            );

            return;
        }


        if (video.playbackRate !== speed) {

            console.log(
                '[LectureNotifier] 재생속도 변경:',
                video.playbackRate,
                '→',
                speed
            );

            video.playbackRate = speed;
        }


        if (video.defaultPlaybackRate !== speed) {
            video.defaultPlaybackRate = speed;
        }
    }


    /*
     * ============================================================
     * 자동 소리 끄기 적용
     * ============================================================
     */
    function applyAutoMute(video) {

        if (!CONFIG.mute.enabled || video.muted) {
            return;
        }

        console.log('[LectureNotifier] 자동 소리 끄기 적용');
        video.muted = true;
    }


    /*
     * ============================================================
     * video 감시 등록
     * ============================================================
     */
    function attach(video) {

        /*
         * 이미 등록한 video는 중복 등록 방지
         */
        if (video.dataset.lectureNotifierAttached) {
            return;
        }

        video.dataset.lectureNotifierAttached = '1';


        console.log(
            '[LectureNotifier] video 감지',
            video,
            'URL:',
            location.href,
            'iframe:',
            window.self !== window.top
        );


        /*
         * --------------------------------------------------------
         * 상태 변수
         * --------------------------------------------------------
         */

        // 실제 playing 이벤트가 한 번이라도 발생했는지
        let started = false;

        // 정상 종료됐는지
        let ended = false;

        // 현재 정지 상황에서 이미 알림을 보냈는지
        let stopNotified = false;

        // 버퍼링 감시 타이머
        let stallTimer = null;

        // 최근 신뢰된 사용자 입력과, 그 입력에 이어진 탐색 시각
        let lastTrustedUserInputAt = 0;
        let lastUserSeekAt = 0;

        // 자동 재개는 짧은 시간에 제한된 횟수만 시도한다.
        let autoResumeTimer = null;
        let autoResumeConfirmationTimer = null;
        let autoResumeAttempts = 0;
        let autoResumeWindowStartedAt = 0;
        let autoResumeGeneration = 0;


        /*
         * video 발견 이벤트
         */
        fireEvent(
            'detected',
            `영상 길이: ${formatTime(video.duration)}`
        );

        applyAutoMute(video);


        /*
         * --------------------------------------------------------
         * 버퍼링 감시 타이머 제거
         * --------------------------------------------------------
         */
        function clearStallTimer() {

            if (stallTimer !== null) {

                clearTimeout(stallTimer);

                stallTimer = null;
            }
        }


        function clearAutoResumeTimer() {

            if (autoResumeTimer !== null) {

                clearTimeout(autoResumeTimer);

                autoResumeTimer = null;
            }
        }


        function clearAutoResumeConfirmationTimer() {

            if (autoResumeConfirmationTimer !== null) {

                clearTimeout(autoResumeConfirmationTimer);

                autoResumeConfirmationTimer = null;
            }
        }


        function clearAutoResumeTimers() {

            clearAutoResumeTimer();
            clearAutoResumeConfirmationTimer();
            autoResumeGeneration += 1;
        }


        function recordTrustedUserInput(event) {

            if (!event.isTrusted) {
                return;
            }

            lastTrustedUserInputAt = Date.now();
        }


        function hasRecentUserIntent() {

            const now = Date.now();
            const graceMs = CONFIG.autoResume.userIntentGraceMs;

            return (
                now - lastTrustedUserInputAt <= graceMs ||
                now - lastUserSeekAt <= graceMs
            );
        }


        function scheduleAutoResume(reason) {

            clearAutoResumeTimers();

            if (!CONFIG.autoResume.enabled) {
                recordDiagnostic('AUTO_RESUME_SKIPPED_DISABLED', video, { reason: reason });
                return;
            }

            if (hasRecentUserIntent()) {

                console.log(
                    '[LectureNotifier] 최근 사용자 입력 뒤 pause - 자동 재개하지 않음:',
                    reason
                );

                recordDiagnostic('AUTO_RESUME_SKIPPED_USER_INTENT', video, {
                    reason: reason
                });

                return;
            }

            const now = Date.now();

            if (
                now - autoResumeWindowStartedAt >
                CONFIG.autoResume.attemptWindowMs
            ) {
                autoResumeWindowStartedAt = now;
                autoResumeAttempts = 0;
            }

            if (autoResumeAttempts >= CONFIG.autoResume.maxAttempts) {

                console.warn(
                    '[LectureNotifier] 자동 재개 최대 시도 횟수 도달:',
                    autoResumeAttempts
                );

                recordDiagnostic('AUTO_RESUME_MAX_ATTEMPTS', video, {
                    attempts: autoResumeAttempts
                });

                return;
            }

            recordDiagnostic('AUTO_RESUME_SCHEDULED', video, {
                reason: reason,
                nextAttempt: autoResumeAttempts + 1
            });

            autoResumeTimer = setTimeout(() => {

                autoResumeTimer = null;

                if (
                    !CONFIG.autoResume.enabled ||
                    !started ||
                    ended ||
                    video.ended ||
                    !video.paused ||
                    video.seeking ||
                    hasRecentUserIntent()
                ) {
                    recordDiagnostic('AUTO_RESUME_CANCELLED', video, {
                        reason: reason
                    });
                    return;
                }

                autoResumeAttempts += 1;
                const attemptGeneration = ++autoResumeGeneration;

                console.warn(
                    '[LectureNotifier] 비의도적 중지 자동 재개 시도:',
                    autoResumeAttempts,
                    '/',
                    CONFIG.autoResume.maxAttempts,
                    `(${reason})`
                );

                recordDiagnostic('AUTO_RESUME_ATTEMPT', video, {
                    attempt: autoResumeAttempts,
                    reason: reason
                });

                Promise.resolve()
                    .then(() => video.play())
                    .then(() => {

                        if (attemptGeneration !== autoResumeGeneration) {
                            return;
                        }

                        console.log(
                            '[LectureNotifier] 자동 재개 요청 성공'
                        );

                        recordDiagnostic(
                            'AUTO_RESUME_PLAY_REQUEST_RESOLVED',
                            video,
                            { attempt: autoResumeAttempts }
                        );

                        clearAutoResumeConfirmationTimer();
                        autoResumeConfirmationTimer = setTimeout(() => {

                            autoResumeConfirmationTimer = null;

                            if (attemptGeneration !== autoResumeGeneration) {
                                return;
                            }

                            if (
                                !CONFIG.autoResume.enabled ||
                                !started ||
                                ended ||
                                video.ended ||
                                !video.paused ||
                                video.seeking
                            ) {
                                return;
                            }

                            recordDiagnostic(
                                'AUTO_RESUME_STILL_PAUSED_AFTER_RESOLVE',
                                video,
                                { attempt: autoResumeAttempts }
                            );

                            scheduleAutoResume('재생 요청 후 계속 중지');

                        }, CONFIG.autoResume.confirmationDelayMs);
                    })
                    .catch((error) => {

                        console.warn(
                            '[LectureNotifier] 자동 재개 요청 거부:',
                            error
                        );

                        recordDiagnostic(
                            'AUTO_RESUME_PLAY_REQUEST_REJECTED',
                            video,
                            {
                                attempt: autoResumeAttempts,
                                errorName: error && error.name
                                    ? String(error.name)
                                    : 'UnknownError'
                            }
                        );

                        scheduleAutoResume('재생 요청 거부');
                    });

            }, CONFIG.autoResume.delayMs);
        }


        document.addEventListener('pointerdown', recordTrustedUserInput, true);
        document.addEventListener('keydown', recordTrustedUserInput, true);


        /*
         * --------------------------------------------------------
         * 중지 이벤트 처리
         * --------------------------------------------------------
         */
        function notifyStopped(reason) {

            /*
             * 아직 실제 재생한 적이 없다면 무시
             */
            if (!started) {
                return;
            }


            /*
             * 정상 종료 상태라면 무시
             */
            if (ended || video.ended) {
                return;
            }


            /*
             * 같은 정지 상황에서 중복 알림 방지
             */
            if (stopNotified) {
                return;
            }


            stopNotified = true;


            const current =
                formatTime(video.currentTime);

            const duration =
                formatTime(video.duration);


            console.warn(
                '[LectureNotifier] 영상 중지:',
                reason,
                `${current} / ${duration}`
            );


            fireEvent(
                'stopped',
                `원인: ${reason}\n` +
                `현재 위치: ${current} / ${duration}`
            );
        }


        /*
         * --------------------------------------------------------
         * 영상 실제 재생
         * --------------------------------------------------------
         */
        video.addEventListener('playing', () => {

            clearStallTimer();
            clearAutoResumeTimers();

            if (autoResumeAttempts > 0) {
                recordDiagnostic('AUTO_RESUME_PLAYING_CONFIRMED', video, {
                    attempts: autoResumeAttempts
                });
                autoResumeAttempts = 0;
                autoResumeWindowStartedAt = 0;
            }

            recordDiagnostic('VIDEO_PLAYING', video);


            /*
             * 자동 배속 적용
             */
            applyPlaybackSpeed(video);
            applyAutoMute(video);


            /*
             * 최초 재생
             */
            if (!started) {

                started = true;


                console.log(
                    '[LectureNotifier] 영상 최초 재생:',
                    formatTime(video.currentTime),
                    `(${video.playbackRate}x)`
                );


                fireEvent(
                    'started',
                    `현재 위치: ${formatTime(video.currentTime)}\n` +
                    `재생 속도: ${video.playbackRate}x`
                );

            } else {

                console.log(
                    '[LectureNotifier] 영상 재생 재개:',
                    formatTime(video.currentTime),
                    `(${video.playbackRate}x)`
                );
            }


            /*
             * 다시 재생됐으므로
             * 다음 중지 알림 허용
             */
            stopNotified = false;
        });


        /*
         * --------------------------------------------------------
         * 재생속도 변경 감시
         * --------------------------------------------------------
         *
         * 사이트가 playbackRate를 다시 1.0 등으로 변경하면
         * 원하는 속도로 복원
         */
        video.addEventListener('ratechange', () => {

            console.log(
                '[LectureNotifier] 재생속도 이벤트:',
                video.playbackRate
            );


            if (
                !CONFIG.playback.enabled ||
                !CONFIG.playback.forceSpeed ||
                !started
            ) {
                return;
            }


            const desiredSpeed =
                Number(CONFIG.playback.speed);


            if (
                Number.isFinite(desiredSpeed) &&
                desiredSpeed > 0 &&
                video.playbackRate !== desiredSpeed
            ) {

                console.log(
                    '[LectureNotifier] 재생속도 강제 복구:',
                    video.playbackRate,
                    '→',
                    desiredSpeed
                );


                video.playbackRate =
                    desiredSpeed;
            }
        });


        /*
         * --------------------------------------------------------
         * pause
         * --------------------------------------------------------
         */
        video.addEventListener('pause', () => {

            clearStallTimer();

            recordDiagnostic('VIDEO_PAUSE', video);


            /*
             * 한번도 실제 재생되지 않았다면 무시
             */
            if (!started) {

                console.log(
                    '[LectureNotifier] 재생 전 pause - 무시'
                );

                return;
            }


            /*
             * 이미 ended 상태라면 무시
             */
            if (ended || video.ended) {
                return;
            }


            /*
             * 정상 종료 직전 pause 이벤트 오탐 방지
             */
            if (
                Number.isFinite(video.duration) &&
                video.duration > 0 &&
                video.currentTime >=
                    video.duration - 0.5
            ) {

                console.log(
                    '[LectureNotifier] 종료 직전 pause - 무시'
                );

                return;
            }


            notifyStopped(
                '영상 일시정지'
            );

            scheduleAutoResume('pause 이벤트');
        });


        video.addEventListener('seeking', () => {

            if (
                Date.now() - lastTrustedUserInputAt <=
                CONFIG.autoResume.userIntentGraceMs
            ) {
                lastUserSeekAt = Date.now();
            }

            clearAutoResumeTimers();
            recordDiagnostic('VIDEO_SEEKING', video, {
                userIntentRecent: hasRecentUserIntent()
            });
        });


        /*
         * --------------------------------------------------------
         * waiting
         * --------------------------------------------------------
         *
         * 버퍼 부족 등의 이유로 재생 대기
         */
        video.addEventListener('waiting', () => {

            startStallWatch(
                '버퍼링'
            );
        });


        /*
         * --------------------------------------------------------
         * stalled
         * --------------------------------------------------------
         *
         * 브라우저가 미디어 데이터를 받지 못하는 상황
         */
        video.addEventListener('stalled', () => {

            startStallWatch(
                '영상 데이터 수신 중단'
            );
        });


        /*
         * --------------------------------------------------------
         * 버퍼링 / 정체 감시
         * --------------------------------------------------------
         */
        function startStallWatch(reason) {

            if (
                !started ||
                ended ||
                video.ended ||
                video.paused
            ) {
                return;
            }


            clearStallTimer();


            const startTime =
                video.currentTime;




            if (debugStallWatch) {
                console.debug(
                    '[LectureNotifier] 재생 진행 확인 시작 (중지 미확정):',
                    reason,
                    '위치:', formatTime(startTime),
                    '판정 대기:', CONFIG.stallTimeout / 1000, '초'
                );
            }


            stallTimer = setTimeout(() => {

                stallTimer = null;


                if (
                    !started ||
                    ended ||
                    video.ended ||
                    video.paused
                ) {
                    return;
                }


                const progressed =
                    video.currentTime - startTime;


                /*
                 * 지정한 시간 동안
                 * 실제 영상 시간이 1초도 진행되지 않았다면
                 * 중지 상태로 판단
                 */
                if (progressed < 1) {

                    notifyStopped(
                        `${reason} ` +
                        `(${CONFIG.stallTimeout / 1000}초 이상)`
                    );
                }

            }, CONFIG.stallTimeout);
        }


        /*
         * --------------------------------------------------------
         * 정상 영상 종료
         * --------------------------------------------------------
         */
        video.addEventListener('ended', () => {

            if (ended) {
                return;
            }


            ended = true;


            clearStallTimer();
            clearAutoResumeTimers();
            recordDiagnostic('VIDEO_ENDED', video);


            console.log(
                '[LectureNotifier] 영상 정상 종료:',
                formatTime(video.currentTime),
                '/',
                formatTime(video.duration)
            );


            fireEvent(
                'ended',
                `재생 시간: ` +
                `${formatTime(video.currentTime)} / ` +
                `${formatTime(video.duration)}`
            );
        });
    }


    /*
     * ============================================================
     * video 탐색
     * ============================================================
     */
    function scan() {

        document
            .querySelectorAll('video')
            .forEach(attach);
    }


    /*
     * 현재 존재하는 video 검색
     */
    scan();


    /*
     * 페이지 로딩 후 동적으로 video가 추가되는 경우 대응
     */
    const observer =
        new MutationObserver(scan);


    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

})();
