// ==UserScript==
// @name KCU Lecture Helper
// @name:ko KCU 강의 도우미 - 자동 배속 / 중지 / 종료 알림
// @namespace    http://tampermonkey.net/
// @version      1.0.1
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
// @connect      ntfy.sh
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const NTFY_STORAGE_KEYS = Object.freeze({
        endpoint: 'kcuLectureHelperNtfyEndpoint',
        enabled: 'kcuLectureHelperNtfyEnabled'
    });

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

            CONFIG.ntfy.enabled =
                GM_getValue(NTFY_STORAGE_KEYS.enabled, false) === true;

        } catch (error) {

            console.error(
                '[LectureNotifier] ntfy 설정을 읽지 못했습니다:',
                error
            );
        }
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
        GM_setValue(NTFY_STORAGE_KEYS.endpoint, endpoint);
    }


    function toggleNtfyEnabled() {

        CONFIG.ntfy.enabled = !CONFIG.ntfy.enabled;
        GM_setValue(NTFY_STORAGE_KEYS.enabled, CONFIG.ntfy.enabled);
    }


    function registerNtfyMenu() {

        GM_registerMenuCommand('KCU Helper: ntfy 주소 설정/지우기', configureNtfyEndpoint);
        GM_registerMenuCommand(
            `KCU Helper: ntfy ${CONFIG.ntfy.enabled ? '사용 중 → 끄기' : '꺼짐 → 켜기'}`,
            toggleNtfyEnabled
        );
    }


    loadNtfySettings();
    if (window.top === window.self) {
        registerNtfyMenu();
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


        /*
         * video 발견 이벤트
         */
        fireEvent(
            'detected',
            `영상 길이: ${formatTime(video.duration)}`
        );


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


            /*
             * 자동 배속 적용
             */
            applyPlaybackSpeed(video);


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
