// ==UserScript==
// @name         KCU Auto Navigator Beta
// @name:ko      KCU 자동수강 Navigator Beta
// @namespace    kcu-lecture-helper
// @version      0.4.0
// @description  첫 과목부터 전체 미수강 차시를 실제 종료·출석 확인 뒤 순차 진행
// @author       krtokia
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/krtokia/KCU_Lecture_Helper/main/src/kcu-auto-navigator.user.js
// @downloadURL  https://raw.githubusercontent.com/krtokia/KCU_Lecture_Helper/main/src/kcu-auto-navigator.user.js
// @match        https://lms.kcu.ac/atnlcSubj/lectRoom*
// @match        https://mvapi.kcu.ac/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        unsafeWindow
// ==/UserScript==

/*
 * 설치 / 사용
 * 1. 이전 Navigator POC는 모두 비활성화한다. 기존 Lecture Helper는 그대로 둔다.
 * 2. 이 전체 코드를 새 Tampermonkey 스크립트로 저장하고 강의실을 한 번 새로고침한다.
 * 3. 영상을 재생하지 않은 상태에서 메뉴의 "KCU Navigator Beta 시작".
 * 4. 결과는 "리포트 복사" 또는 "리포트 파일 저장"으로 전달한다.
 *
 * 범위: LNB 첫 과목부터. 첫 미수강 과목의 첫 영상 하나만 실제 재생까지 확인.
 *       다음 영상의 종료·출석 확인, 세 번째 차시 및 다른 과목 이동은 하지 않는다.
 * 정지: POC의 대기/예약 동작만 취소한다. 영상 자체는 일시정지하지 않는다.
 * 새로고침: 이전 실행을 중단 처리한다. 자동 재시작하지 않는다.
 *
 * 종료:
 * - 실제 ended 이벤트 / ended=true.
 * - 실제 video.currentTime이 duration 끝 2초 이내인 상태가 2초 이상 관측됨.
 * - pause가 끝부분에서 발생한 경우도 위의 끝부분 후보로 처리한다.
 * - 후보 후 최소 10초 대기하고 위치를 다시 확인한 다음 같은 주차 UI를 재조회한다.
 * - 끝부분이 아닌 실제 pause는 종료로 취급하지 않고, 실제 playing 재개 신호까지 기다린다.
 * - KCU callFunction 메시지는 수동적으로 기록만 한다. 미확인 상태코드를 종료로 간주하지 않는다.
 * - 출석 Y는 출석 인정이지 영상 전체 시청 증명이 아니다. fallback 결과는 따로 표시한다.
 *
 * AJAX: 사이트의 실제 주차 클릭으로 발생하는 응답만 관찰한다.
 *       출석 기록 API, 영상 시간/배속/진도값을 이 스크립트가 직접 조작하지 않는다.
 *       Resource Timing 개수만으로 성공 응답을 인정하지 않는다.
 * 개인정보: 전체 iframe URL, 학번, IP, 세션키, 원본 RPC/원본 JSON은 보고서에 저장하지 않는다.
 *
 * 구현 근거: 이 대화에 첨부된 KCU DOM 분석 보고서와 POC2.1/POC3 실행 로그.
 * API 참고:
 * https://www.tampermonkey.net/documentation.php
 * https://api.jquery.com/ajaxComplete/
 * https://api.jquery.com/data/
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended_event
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event
 */
(function () {
    'use strict';

    const VERSION = '0.4.0';
    const CHANNEL = 'KCU_NAVIGATOR_BETA_V1';
    const LMS_ORIGIN = 'https://lms.kcu.ac';
    const PLAYER_ORIGIN = 'https://mvapi.kcu.ac';
    const STATE_KEY = 'kcuNavigatorPoc35State';
    const HANDOFF_KEY = 'kcuNavigatorPoc35CourseHandoff';
    const TAG = '[KCU POC3.5]';
    const WEEK_API = '/common/lect/selectWeekLectInfo';
    const CONFIG = Object.freeze({
        initialTimeoutMs: 30000,
        weekTimeoutMs: 20000,
        playingTimeoutMs: 45000,
        manualResumeTimeoutMs: 5 * 60 * 1000,
        manualPauseMinPlaybackSec: 10,
        observationTimeoutMs: 8 * 60 * 60 * 1000,
        courseNavigationTimeoutMs: 10 * 60 * 1000,
        endMarginSec: 2,
        nearEndHoldMs: 2000,
        attendanceDelayMs: 10000,
        retryDelayMs: 10000,
        verificationAttempts: 2,
        sampleLogIntervalMs: 15000,
        noProgressWarningMs: 60000,
        signalSilenceWarningMs: 90000,
        signalSilenceFailureMs: 180000,
        maxEvents: 600,
        maxSamples: 360,
        maxRpcEvents: 180,
        maxTimelineEvents: 5000
    });

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const scalar = (v) => v === null || v === undefined ? '' : String(v);
    const numberOrNull = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    const iso = () => new Date().toISOString();
    const id = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const log = (...v) => console.log(TAG, ...v);

    function ordinal(v, width = 0) {
        const s = scalar(v).trim();
        if (!/^\d+$/.test(s)) return '';
        return String(Number(s)).padStart(width, '0');
    }
    const weekNumber = (v) => ordinal(v, 2);
    const lectureNumber = (v) => ordinal(v);

    function identityFromUrl(url) {
        try {
            const u = new URL(url, location.href);
            return {
                origin: u.origin,
                shyr: u.searchParams.get('SHYR') || '',
                smstCd: u.searchParams.get('SMST_CD') || '',
                coseCd: u.searchParams.get('COSE_CD') || '',
                weekNo: weekNumber(u.searchParams.get('WKEND_CD')),
                lectNo: lectureNumber(u.searchParams.get('LECT_NO'))
            };
        } catch (_) { return null; }
    }

    function sameCourse(a, b) {
        return !!(a && b && a.coseCd && a.shyr && a.smstCd &&
            a.coseCd === b.coseCd && a.shyr === b.shyr && a.smstCd === b.smstCd);
    }
    function sameTarget(a, target) {
        return sameCourse(a, target?.course) &&
            a.weekNo === target.week.weekNo && a.lectNo === target.lecture.lectNo;
    }
    function nearEnd(video) {
        return !!(video && Number.isFinite(video.duration) && video.duration > 0 &&
            Number.isFinite(video.currentTime) && !video.seeking && !video.loop &&
            video.currentTime >= video.duration - CONFIG.endMarginSec &&
            video.currentTime <= video.duration + CONFIG.endMarginSec);
    }
    function classifyEnd(video, kind, hasPlayed, nearSince, now) {
        if (!hasPlayed || !video || video.seeking || video.loop) return { nearSince: null, reason: null };
        if (kind === 'ended' || video.ended === true) return { nearSince, reason: 'NATIVE_ENDED' };
        if (!nearEnd(video)) return { nearSince: null, reason: null };
        const since = nearSince ?? now;
        const ready = now - since >= CONFIG.nearEndHoldMs;
        return { nearSince: since, reason: ready ? (video.paused ? 'PAUSED_NEAR_END' : 'MEDIA_POSITION_NEAR_END') : null };
    }

    // 초기 실행 분기 전에 공통 상수를 모두 초기화한다.
    if (window.self !== window.top) {
        if (location.origin === PLAYER_ORIGIN) installPlayerProbe();
        return;
    }
    if (location.origin !== LMS_ORIGIN || location.pathname !== '/atnlcSubj/lectRoom') return;
    installController();

    // ============================================================
    // iframe: 제어하지 않고 실제 video의 이벤트와 위치만 보고한다.
    // ============================================================
    function installPlayerProbe() {
        const frameId = id();
        const identity = identityFromUrl(location.href);
        const attached = new WeakMap();
        const knownVideos = new Set();
        let token = null;
        let seq = 0;
        let videoSeq = 0;
        let lastSampleAt = 0;
        let lastHelloAt = 0;

        function post(kind, details = {}) {
            if (!token && kind !== 'hello') return;
            window.top.postMessage({
                channel: CHANNEL, kind, token, frameId, seq: ++seq,
                sentAt: Date.now(), identity,
                visibility: document.visibilityState,
                focused: document.hasFocus(), ...details
            }, LMS_ORIGIN);
        }

        function mediaSnapshot(video) {
            let bufferedEnd = null;
            try {
                for (let i = 0; i < video.buffered.length; i++) {
                    if (video.buffered.start(i) <= video.currentTime + 0.1 && video.buffered.end(i) >= video.currentTime) {
                        bufferedEnd = video.buffered.end(i);
                    }
                }
            } catch (_) { /* 계측 실패가 재생에 영향을 주지 않도록 무시 */ }
            let quality = null;
            try {
                const q = video.getVideoPlaybackQuality?.();
                if (q) quality = { totalVideoFrames: q.totalVideoFrames, droppedVideoFrames: q.droppedVideoFrames };
            } catch (_) { /* 미지원 브라우저에서는 생략 */ }
            return {
                currentTime: numberOrNull(video.currentTime), duration: numberOrNull(video.duration),
                paused: video.paused, ended: video.ended, seeking: video.seeking, loop: video.loop,
                playbackRate: numberOrNull(video.playbackRate), readyState: video.readyState,
                networkState: video.networkState, bufferedEnd: numberOrNull(bufferedEnd),
                quality, mediaErrorCode: video.error?.code ?? null,
                waitingEvents: attached.get(video)?.waitingEvents || 0,
                stalledEvents: attached.get(video)?.stalledEvents || 0
            };
        }

        function sendVideo(kind, video) {
            const info = attached.get(video);
            if (!info || !video.isConnected) return;
            post(kind, { videoId: info.id, video: mediaSnapshot(video) });
        }
        function timeline(kind, details = {}) {
            post('timeline', { timeline: { source: 'iframe', event: kind, ...details } });
        }
        function timelineVideo(kind, video, event) {
            const info = attached.get(video);
            if (!info || !video.isConnected) return;
            const now = Date.now();
            if (kind === 'timeupdate') {
                if (now - info.lastTimelineTimeAt < 1000) return;
                info.lastTimelineTimeAt = now;
            }
            post('timeline', {
                videoId: info.id,
                video: mediaSnapshot(video),
                timeline: { source: 'media', event: kind, trusted: event?.isTrusted === true }
            });
        }
        function targetKind(target) {
            if (!(target instanceof Element)) return 'other';
            if (target.closest('video')) return 'video';
            if (target.closest('button')) return 'button';
            if (target.closest('input, select, textarea')) return 'form';
            if (target.closest('a')) return 'link';
            return target.tagName.toLowerCase();
        }
        function sampleAll(kind = 'sample', force = false) {
            const now = Date.now();
            if (!token || (!force && now - lastSampleAt < 1000)) return;
            lastSampleAt = now;
            let count = 0;
            for (const video of knownVideos) {
                if (!video.isConnected) { knownVideos.delete(video); continue; }
                sendVideo(kind, video);
                count++;
            }
            if (!count) post('no_video');
        }
        function attach(video) {
            if (attached.has(video)) return;
            attached.set(video, { id: `video-${++videoSeq}`, waitingEvents: 0, stalledEvents: 0, lastTimelineTimeAt: 0 });
            knownVideos.add(video);
            const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'pause', 'ended', 'error', 'seeking', 'seeked', 'ratechange', 'emptied', 'waiting', 'stalled', 'suspend'];
            for (const kind of events) video.addEventListener(kind, (event) => {
                if (kind === 'waiting') attached.get(video).waitingEvents++;
                if (kind === 'stalled') attached.get(video).stalledEvents++;
                timelineVideo(kind, video, event);
                sendVideo(kind, video);
            });
            video.addEventListener('timeupdate', (event) => { timelineVideo('timeupdate', video, event); sampleAll(); });
            sendVideo('attached', video);
        }
        function scan(root = document) {
            if (root instanceof Element && root.matches('video')) attach(root);
            if (root.querySelectorAll) root.querySelectorAll('video').forEach(attach);
        }

        window.addEventListener('message', (event) => {
            if (event.source !== window.top || event.origin !== LMS_ORIGIN) return;
            const m = event.data;
            if (!m || m.channel !== CHANNEL) return;
            if (m.command === 'stop' && m.token === token) { token = null; return; }
            if (m.command !== 'sample' || typeof m.token !== 'string') return;
            const changed = token !== m.token;
            token = m.token;
            if (changed) lastSampleAt = 0;
            scan();
            sampleAll('snapshot', true);
        });
        document.addEventListener('visibilitychange', () => {
            timeline('visibilitychange', { visibility: document.visibilityState, focused: document.hasFocus() });
            post('visibilitychange'); sampleAll('snapshot', true);
        });
        window.addEventListener('focus', () => { timeline('focus', { focused: true }); post('focus'); });
        window.addEventListener('blur', () => { timeline('blur', { focused: false }); post('blur'); });
        for (const kind of ['pointerdown', 'pointerup', 'click', 'keydown']) {
            document.addEventListener(kind, (event) => timeline(kind, {
                source: 'input', trusted: event.isTrusted === true, target: targetKind(event.target),
                button: typeof event.button === 'number' ? event.button : null,
                hasCoordinates: Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
            }), true);
        }
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) for (const node of mutation.addedNodes) scan(node);
        });
        observer.observe(document, { childList: true, subtree: true });
        scan();
        post('hello');
        const timer = setInterval(() => {
            if (token) sampleAll();
            else if (Date.now() - lastHelloAt >= 10000) { lastHelloAt = Date.now(); post('hello'); }
        }, 1000);
        window.addEventListener('pagehide', () => { clearInterval(timer); observer.disconnect(); }, { once: true });
    }

    // ============================================================
    // 최상위 LMS: 한 차시 POC 제어 + 보고서
    // ============================================================
    function installController() {
        function playerDefaults() {
            return { firstPlaying: null, latestPlaying: null, latest: null, nativeEnded: null, frameChanges: 0 };
        }
        function defaults() {
            return {
                version: VERSION, runId: null, running: false, phase: 'IDLE',
                startedAt: null, finishedAt: null, target: null, result: null, lastError: null,
                player: playerDefaults(),
                manualPauseTest: { nonEndPause: null, resume: null },
                endCandidate: null, verificationAttempts: [], events: [], samples: [], rpc: [],
                transition: { firstTarget: null, firstEndCandidate: null, firstAttendance: null, firstManualPauseTest: null,
                    nextTarget: null, nextSelection: null, nextClick: null, nextPlaying: null, terminalAction: null },
                courseScan: { index: null, total: null, visited: [], handoff: null, targetPlaying: null, completedTargets: [] },
                timeline: [], timelineSequence: 0, eventCounts: {}, dropped: { events: 0, samples: 0, rpc: 0, timeline: 0 }
            };
        }
        let state = { ...defaults(), ...GM_getValue(STATE_KEY, {}) };
        let active = null;
        let saveTimer = null;
        let jq = null;
        let ajaxInstalled = false;
        let ajaxHookError = null;
        let requestSeq = 0;
        let renderRevision = 0;
        const requestMap = new WeakMap();
        const pendingWeekIds = new Set();
        const weekResponses = [];
        const latestRpcByName = new Map();
        let observedBody = null;
        let bodyObserver = null;
        let hookTimer = null;

        function persist(immediate = false) {
            if (immediate) {
                clearTimeout(saveTimer); saveTimer = null;
                GM_setValue(STATE_KEY, state);
            } else if (!saveTimer) {
                saveTimer = setTimeout(() => { saveTimer = null; GM_setValue(STATE_KEY, state); }, 1000);
            }
        }
        function bounded(listName, value, limit) {
            const list = state[listName];
            list.push(value);
            if (list.length > limit) { state.dropped[listName] += list.length - limit; list.splice(0, list.length - limit); }
        }
        function record(type, details = {}) {
            bounded('events', { at: iso(), type, ...details }, CONFIG.maxEvents);
            state.eventCounts[type] = (state.eventCounts[type] || 0) + 1;
            persist();
        }
        function recordTimeline(entry) {
            bounded('timeline', { sequence: ++state.timelineSequence, ...entry }, CONFIG.maxTimelineEvents);
            persist();
        }
        function phase(value) {
            state.phase = value;
            record('PHASE', { value });
            log(value);
        }
        function abortError() { const e = new Error('POC가 중지되었습니다.'); e.name = 'AbortError'; return e; }
        function requireRun(ctx) {
            if (ctx !== active || ctx.controller.signal.aborted || !state.running) throw abortError();
        }
        function waitFor(predicate, timeout, message, ctx) {
            return new Promise((resolve, reject) => {
                const start = performance.now();
                let timer;
                let done = false;
                const signal = ctx.controller.signal;
                function finish(err, result) {
                    if (done) return;
                    done = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort);
                    if (err) reject(err); else resolve(result);
                }
                function onAbort() { finish(abortError()); }
                function tick() {
                    try {
                        requireRun(ctx);
                        const value = predicate();
                        if (value) return finish(null, value);
                        if (performance.now() - start >= timeout) return finish(new Error(message));
                    } catch (e) { finish(e); return; }
                    timer = setTimeout(tick, 200);
                }
                signal.addEventListener('abort', onAbort, { once: true });
                tick();
            });
        }
        function delay(ms, ctx) {
            const until = performance.now() + ms;
            return waitFor(() => performance.now() >= until, ms + 120000, '대기 시간 초과', ctx);
        }

        function course() {
            const form = $('#frm');
            const lnb = $('#lnb li.subjLnb.on > a');
            return {
                title: text(lnb),
                coseCd: form?.querySelector('[name="coseCd"]')?.value || '',
                shyr: form?.querySelector('[name="shyr"]')?.value || '',
                smstCd: form?.querySelector('[name="smstCd"]')?.value || '',
                lnbCoseCd: lnb?.dataset.coseCd || '',
                selectCoseCd: $('.selMngrCose option:checked')?.value || ''
            };
        }
        const currentWeek = () => weekNumber($('#weekNo')?.value);
        function assertCourse(expected = null) {
            const c = course();
            if (!c.coseCd || !c.shyr || !c.smstCd || c.lnbCoseCd !== c.coseCd ||
                (c.selectCoseCd && c.selectCoseCd !== c.coseCd)) throw new Error('과목 식별값이 없거나 일치하지 않습니다.');
            if (expected && !sameCourse(c, expected)) throw new Error('POC 실행 중 현재 과목이 바뀌었습니다.');
            const auth = $('#userAuth')?.value;
            const type = $('#lectRmPrcsCd')?.value;
            if (auth && auth !== 'S') throw new Error('일반 학생 강의실이 아닙니다.');
            if (type && type !== '1') throw new Error('일반 수강 강의실이 아닙니다.');
            return c;
        }
        function weeks() {
            return $$('.subjectCont .swiper-slide.weekNo').map((slide, index) => {
                const link = $('a.weekInfo[data-week-no]', slide);
                const status = $('p.state', slide);
                return {
                    index, weekNo: weekNumber(link?.dataset.weekNo), title: text(link),
                    open: !!link?.classList.contains('open'), good: !!status?.classList.contains('good'),
                    stateClass: status ? [...status.classList].filter((s) => s !== 'state').join(' ') : null,
                    stateText: text(status) || null
                };
            });
        }
        function weekLink(n) {
            return $$('.subjectCont .swiper-slide.weekNo a.weekInfo[data-week-no]')
                .find((a) => weekNumber(a.dataset.weekNo) === n) || null;
        }
        function readData(el, key) {
            try { const v = el && jq ? jq(el).data(key) : undefined; return v === undefined ? null : scalar(v); }
            catch (_) { return null; }
        }
        function lectures() {
            return $$('#videoInfoBody tr').map((row) => {
                const b = $('button.btnVideo', row);
                if (!b) return null;
                const p = $('.progress', row);
                const per = $('.percent', row);
                return {
                    lectNo: lectureNumber(b.dataset.lectNo),
                    title: text($('.videoInfo strong', row)).replace('[학습중]', '').trim(),
                    current: b.classList.contains('on'), atenYn: b.dataset.atenYn || '',
                    atenYnJquery: readData(b, 'atenYn'), vdoFlag: b.dataset.vdoFlag || '',
                    perAttribute: per?.dataset.per || '', perJquery: readData(per, 'per'),
                    progressText: text(per), chkAttribute: p?.dataset.chk || '', chkJquery: readData(p, 'chk'),
                    attendancePct: text($('.inPercent strong', row)),
                    durationText: text($('.endTime', row)).replace('동영상 종료 시간', '').trim(),
                    buttonClass: b.className, buttonText: text(b)
                };
            }).filter(Boolean);
        }
        function bodyStatus() {
            const b = $('#videoInfoBody');
            return {
                exists: !!b, rowCount: b ? $$('tr', b).length : 0,
                buttonCount: b ? $$('button.btnVideo', b).length : 0,
                emptyMessage: !!b && text(b).includes('준비중인 강의'), renderRevision
            };
        }
        function ensureBodyObserver() {
            const b = $('#videoInfoBody');
            if (!b || observedBody === b) return;
            bodyObserver?.disconnect(); observedBody = b;
            bodyObserver = new MutationObserver((ms) => {
                if (ms.some((m) => m.type === 'childList')) renderRevision++;
            });
            // 행 자체 교체만 관찰한다. 진도 텍스트 갱신을 주차 로딩 완료로 보지 않는다.
            bodyObserver.observe(b, { childList: true });
        }

        // 사이트 jQuery로 기존 UI 요청을 관찰한다. 요청을 직접 보내거나 수정하지 않는다.
        function requestIdentity(settings) {
            const data = settings.data;
            const p = typeof data === 'string' ? new URLSearchParams(data) : null;
            const get = (k) => scalar(p ? p.get(k) : data?.[k]);
            return { shyr: get('shyr'), smstCd: get('smstCd'), coseCd: get('coseCd'),
                weekNo: weekNumber(get('weekNo')), lectNo: lectureNumber(get('lectNo')) };
        }
        function apiPath(settings) {
            try { return new URL(settings.url, location.href).pathname; } catch (_) { return ''; }
        }
        function sanitizeServerLecture(v) {
            return {
                shyr: scalar(v.shyr), smstCd: scalar(v.smstCd), coseCd: scalar(v.coseCd),
                weekNo: weekNumber(v.wkendCnt ?? v.weekNo), lectNo: lectureNumber(v.lectNo),
                title: scalar(v.lectTtlNm).slice(0, 240), atenYn: scalar(v.atenYn),
                vdoFlag: scalar(v.vidoFileUldYn), chkPerFlag: scalar(v.chkPerFlag),
                totalSeconds: numberOrNull(v.lectToalLectTm), resumeSeconds: numberOrNull(v.lectRevivEndTm),
                accumulatedSeconds: numberOrNull(v.lectAtnlcAccmTm),
                attendanceProgress: numberOrNull(v.rtprgsRpblty), playerStatus: scalar(v.prcsSttsCd)
            };
        }
        function tryInstallAjax() {
            if (ajaxInstalled) return true;
            try {
                const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const lib = page.jQuery;
                if (typeof lib !== 'function' || typeof lib.fn?.on !== 'function') return false;
                jq = lib;
                lib(page.document).on('ajaxSend.kcuPoc35', (e, xhr, settings) => {
                    if (apiPath(settings) !== WEEK_API) return;
                    const entry = { id: ++requestSeq, requestedAt: Date.now(), key: requestIdentity(settings) };
                    requestMap.set(xhr, entry); pendingWeekIds.add(entry.id);
                });
                lib(page.document).on('ajaxComplete.kcuPoc35', (e, xhr, settings) => {
                    if (apiPath(settings) !== WEEK_API) return;
                    try {
                        const req = requestMap.get(xhr) || { id: ++requestSeq, requestedAt: null, key: requestIdentity(settings) };
                        pendingWeekIds.delete(req.id);
                        let data = xhr.responseJSON;
                        if (!data) { try { data = JSON.parse(xhr.responseText); } catch (_) { data = null; } }
                        const httpOK = (xhr.status >= 200 && xhr.status < 300) || xhr.status === 304;
                        const rows = Array.isArray(data?.weekLectInfoList) ? data.weekLectInfoList.map(sanitizeServerLecture) : null;
                        const matched = !!rows && rows.every((r) => sameCourse(r, req.key) && r.weekNo === req.key.weekNo && !!r.lectNo);
                        const recordValue = { ...req, receivedAt: Date.now(), httpStatus: xhr.status,
                            valid: httpOK && matched, igiCd: scalar(data?.igiCd), lectures: rows };
                        weekResponses.push(recordValue);
                        if (weekResponses.length > 30) weekResponses.shift();
                        if (state.running) record('WEEK_RESPONSE', {
                            id: req.id, key: req.key, httpStatus: xhr.status, valid: recordValue.valid,
                            lectureCount: rows?.length ?? null, igiCd: recordValue.igiCd
                        });
                    } catch (_) { ajaxHookError = '주차 응답 파싱에 실패했습니다.'; }
                });
                ajaxInstalled = true;
                return true;
            } catch (_) { ajaxHookError = '페이지 jQuery 접근 또는 관찰 핸들러 설치 실패'; return false; }
        }
        function initialRequestHint() {
            return performance.getEntriesByType('resource').some((r) => {
                try { return new URL(r.name).pathname === WEEK_API; } catch (_) { return false; }
            });
        }
        async function initialReady(ctx) {
            phase('WAIT_INITIAL_LOAD');
            await waitFor(() => {
                tryInstallAjax(); ensureBodyObserver();
                const b = bodyStatus();
                return ajaxInstalled && $('#frm') && weeks().length && pendingWeekIds.size === 0 &&
                    (weekResponses.length > 0 || initialRequestHint()) && (b.buttonCount > 0 || b.emptyMessage);
            }, CONFIG.initialTimeoutMs, '초기 강의정보/주차 응답 관찰 준비 시간 초과', ctx);
            record('INITIAL_READY', { course: course(), weekNo: currentWeek(), body: bodyStatus(), ajaxInstalled });
        }
        async function reloadWeek(n, expectedCourse, ctx) {
            requireRun(ctx); assertCourse(expectedCourse); ensureBodyObserver();
            const link = weekLink(n);
            if (!link?.classList.contains('open')) throw new Error(`${n}주차에 접근 가능한 링크가 없습니다.`);
            const before = requestSeq;
            const beforeRevision = renderRevision;
            record('WEEK_UI_CLICK', { weekNo: n, beforeRequestId: before });
            link.click();
            const response = await waitFor(() => {
                assertCourse(expectedCourse);
                const r = weekResponses.find((x) => x.id > before && x.requestedAt !== null && sameCourse(x.key, expectedCourse) && x.key.weekNo === n);
                if (!r) return false;
                if (!r.valid) throw new Error(`${n}주차 응답이 실패했거나 과목/주차 식별값이 일치하지 않습니다.`);
                return r;
            }, CONFIG.weekTimeoutMs, `${n}주차 응답을 확인하지 못했습니다.`, ctx);
            await waitFor(() => {
                assertCourse(expectedCourse);
                if (currentWeek() !== n || renderRevision <= beforeRevision) return false;
                if (response.igiCd !== '2' || !response.lectures.length) return bodyStatus().emptyMessage;
                const dom = lectures();
                return dom.length === response.lectures.length && response.lectures.every((r) =>
                    dom.some((d) => d.lectNo === r.lectNo && d.atenYn === r.atenYn));
            }, CONFIG.weekTimeoutMs, `${n}주차 응답과 새 차시 DOM의 대응 확인 실패`, ctx);
            record('WEEK_LOAD_READY', { weekNo: n, responseId: response.id, body: bodyStatus() });
            return response;
        }
        async function findTarget(ctx) {
            const c = assertCourse();
            state.initialPage = { course: c, weekNo: currentWeek() };
            for (const w of weeks()) {
                requireRun(ctx);
                if (!w.open) continue;
                if (!w.weekNo) throw new Error('열린 주차 번호를 읽지 못했습니다.');
                if (w.good) { record('WEEK_SKIPPED_GOOD', { weekNo: w.weekNo }); continue; }
                phase(`INSPECT_WEEK_${w.weekNo}`);
                // 현재 주차도 재조회하여 초기 안내 문구나 오래된 .data 캐시를 판단에 사용하지 않는다.
                const response = await reloadWeek(w.weekNo, c, ctx);
                if (response.igiCd !== '2' || !response.lectures.length) {
                    record('WEEK_NOT_VIDEO_CONTENT', { weekNo: w.weekNo, igiCd: response.igiCd }); continue;
                }
                for (const server of response.lectures) {
                    if (!['Y', 'N'].includes(server.atenYn) || !['Y', 'N'].includes(server.vdoFlag)) {
                        throw new Error('알 수 없는 출석/영상 상태입니다. 추측하여 재생하지 않습니다.');
                    }
                    if (server.atenYn === 'Y' || server.vdoFlag === 'N') continue;
                    const dom = lectures().find((l) => l.lectNo === server.lectNo);
                    if (!dom) throw new Error('서버 차시에 대응하는 재생 버튼이 없습니다.');
                    return { course: c, week: w, lecture: dom, serverBefore: server };
                }
            }
            return null;
        }

        function courseLinks() {
            return $$('#lnb li.subjLnb > a[data-cose-cd]').map((link, index) => ({
                index, coseCd: scalar(link.dataset.coseCd).trim(), title: text(link), link
            })).filter((item) => item.coseCd);
        }
        function publicCourse(c) { return { coseCd: scalar(c?.coseCd), title: scalar(c?.title).slice(0, 240) }; }
        function clearHandoff() { try { GM_deleteValue(HANDOFF_KEY); } catch (_) {} }
        function readHandoff() {
            try {
                const h = GM_getValue(HANDOFF_KEY, null);
                if (!h || typeof h !== 'object' || typeof h.runId !== 'string' || !Number.isInteger(h.nextIndex) ||
                    !scalar(h.expectedCoseCd) || !Number.isFinite(h.createdAt) || Date.now() - h.createdAt > CONFIG.courseNavigationTimeoutMs) return null;
                return h;
            } catch (_) { return null; }
        }
        async function navigateToCourse(ctx, entry) {
            const from = assertCourse();
            if (from.coseCd === entry.coseCd) throw new Error('다음 과목 식별값이 현재 과목과 같습니다.');
            const handoff = { runId: state.runId, nextIndex: entry.index, expectedCoseCd: entry.coseCd, phase: 'COURSE_SCAN', createdAt: Date.now() };
            state.courseScan.handoff = { nextIndex: entry.index, expectedCoseCd: entry.coseCd, createdAt: handoff.createdAt };
            state.courseScan.index = entry.index;
            phase('NAVIGATE_NEXT_COURSE');
            record('COURSE_NAVIGATION_REQUESTED', { from: publicCourse(from), to: { index: entry.index, ...publicCourse(entry) } });
            persist(true); GM_setValue(HANDOFF_KEY, handoff);
            ctx.navigating = true;
            entry.link.click();
            await waitFor(() => false, 15000, '다음 과목 페이지 이동을 확인하지 못했습니다.', ctx);
        }
        async function playCourseTarget(ctx, target) {
            state.target = target; resetForNextTarget(ctx); assertTarget(ctx);
            state.courseScan.target = clone(target);
            phase('WAIT_TARGET_PLAYING');
            const button = $$('#videoInfoBody button.btnVideo').find((item) =>
                lectureNumber(item.dataset.lectNo) === target.lecture.lectNo &&
                scalar(item.dataset.atenYn) === 'N' && scalar(item.dataset.vdoFlag) === 'Y');
            if (!button) throw new Error('첫 미수강 차시의 현재 DOM 재생 버튼/상태를 확인하지 못했습니다.');
            ctx.clickedAt = Date.now(); ctx.lastMatchingMediaAt = ctx.clickedAt; ctx.lastProgressAt = ctx.clickedAt;
            record('TARGET_LECTURE_BUTTON_CLICK', { weekNo: target.week.weekNo, lectNo: target.lecture.lectNo, buttonClass: button.className });
            button.click(); signalPlayer('sample', ctx);
            await waitFor(() => {
                assertTarget(ctx);
                if (ctx.mediaFailure) throw new Error(ctx.mediaFailure);
                return ctx.hasPlayed;
            }, CONFIG.playingTimeoutMs, '첫 미수강 차시의 실제 재생 시작을 확인하지 못했습니다.', ctx);
            state.courseScan.targetPlaying = clone(state.player.firstPlaying || state.player.latestPlaying);
            record('TARGET_PLAYING_CONFIRMED', state.courseScan.targetPlaying);
            persist(true);
        }

        async function observeAndVerifyTarget(ctx) {
            phase('OBSERVING');
            const deadline = performance.now() + CONFIG.observationTimeoutMs;
            let accepted;
            while (!accepted) {
                const remaining = deadline - performance.now();
                if (remaining <= 0) throw new Error('종료 후보 관찰 시간 한도 초과');
                const observation = await waitFor(() => {
                    const candidate = checkObservation(ctx);
                    if (ctx.manualPause && !ctx.manualResume) return { type: 'MANUAL_PAUSE' };
                    return candidate ? { type: 'END_CANDIDATE', candidate } : false;
                }, remaining, '종료 후보 또는 수동 일시정지를 확인하지 못했습니다.', ctx);
                if (observation.type === 'MANUAL_PAUSE') {
                    phase('WAIT_MANUAL_RESUME');
                    const pauseAt = ctx.manualPause.receivedAt;
                    await waitFor(() => {
                        checkObservation(ctx);
                        return ctx.manualResume || false;
                    }, CONFIG.manualResumeTimeoutMs,
                    '수동 일시정지 뒤 실제 재생 재개를 5분 안에 확인하지 못했습니다. 자동 재생·다음 차시 선택 없이 중단합니다.', ctx);
                    record('MANUAL_RESUME_WAIT_COMPLETED', { pauseAt, resumeAt: ctx.manualResume.receivedAt });
                    phase('OBSERVING');
                    continue;
                }
                const candidate = observation.candidate;
                phase('WAIT_AFTER_END_CANDIDATE');
                record('END_GRACE_STARTED', { reason: candidate.reason, delayMs: CONFIG.attendanceDelayMs });
                await delay(CONFIG.attendanceDelayMs, ctx);
                assertTarget(ctx);
                if (!candidateStillValid(ctx, candidate)) {
                    record('END_CANDIDATE_CANCELLED', { reason: '영상 인스턴스 또는 실제 끝부분 위치가 달라짐' });
                    ctx.candidate = null; ctx.nearSince = null; phase('OBSERVING'); continue;
                }
                accepted = ctx.nativeEvidence ? { ...candidate, reason: 'NATIVE_ENDED', sample: ctx.nativeEvidence } : candidate;
            }
            state.endCandidate = accepted;
            record('END_CANDIDATE_ACCEPTED', accepted);
            persist(true);
            for (let attempt = 1; attempt <= CONFIG.verificationAttempts; attempt++) {
                if (attempt > 1) { phase('WAIT_ATTENDANCE_RETRY'); await delay(CONFIG.retryDelayMs, ctx); }
                const verification = await verifyAttendance(ctx, attempt);
                if (!verification.found) throw new Error('재조회 응답에서 대상 차시가 사라졌습니다.');
                if (verification.atenYn === 'Y') {
                    const completed = { target: clone(state.target), endCandidate: clone(accepted), verification: clone(verification), manualPauseTest: clone(state.manualPauseTest) };
                    state.courseScan.completedTargets.push(completed);
                    record('TARGET_COMPLETED_ATTENDANCE_CONFIRMED', completed);
                    persist(true);
                    return;
                }
                if (verification.atenYn !== 'N') throw new Error('재조회 응답의 출석 값이 Y/N이 아닙니다.');
            }
            throw new Error('두 차례 새 주차 응답에서 출석 Y를 확인하지 못했습니다. 자동 재생 재시도는 하지 않습니다.');
        }

        function adoptCurrentPlayingTarget(ctx) {
            const c = assertCourse();
            const w = weeks().find((item) => item.weekNo === currentWeek()) || null;
            const lecture = lectures().find((item) => item.current) || null;
            const identity = ctx.preflight?.identity;
            const video = ctx.preflight?.video;

            if (!w?.open || !w.weekNo) {
                throw new Error('현재 재생 주차가 열려 있지 않거나 식별되지 않습니다. 다른 주차를 선택하지 않고 중단합니다.');
            }
            if (!lecture?.lectNo || lecture.vdoFlag !== 'Y' || lecture.atenYn !== 'N') {
                throw new Error('현재 선택 차시는 출석 N·영상 Y가 아닙니다. 다른 차시를 선택하지 않고 중단합니다.');
            }
            if (!sameCourse(identity, c) || identity.weekNo !== w.weekNo || identity.lectNo !== lecture.lectNo) {
                throw new Error('현재 LMS 차시와 player iframe 식별값이 일치하지 않습니다. 다른 차시를 선택하지 않고 중단합니다.');
            }
            if (!video || video.paused || video.ended || video.seeking || video.currentTime === null || video.readyState === null || video.readyState < 2) {
                throw new Error('현재 영상이 실제 재생 상태가 아닙니다. 재생 중인 차시만 인계하며 버튼을 누르지 않습니다.');
            }

            return {
                course: c,
                week: w,
                lecture,
                serverBefore: null,
                adoptedFromCurrentPlayback: true
            };
        }

        function eligibleNextLecture(server) {
            return server?.atenYn === 'N' && server?.vdoFlag === 'Y';
        }

        async function findNextTarget(ctx, completed) {
            const c = assertCourse(completed.course);
            const orderedWeeks = weeks();
            const completedIndex = orderedWeeks.findIndex((w) => w.weekNo === completed.week.weekNo);
            if (completedIndex < 0) throw new Error('완료한 첫 대상 주차를 현재 과목에서 찾지 못했습니다.');
            const completedLectureNo = Number(completed.lecture.lectNo);
            for (let index = completedIndex; index < orderedWeeks.length; index++) {
                requireRun(ctx);
                const w = orderedWeeks[index];
                if (!w.open || !w.weekNo) continue;
                phase(`FIND_NEXT_INSPECT_WEEK_${w.weekNo}`);
                const response = await reloadWeek(w.weekNo, c, ctx);
                if (response.igiCd !== '2' || !response.lectures.length) continue;
                for (const server of response.lectures) {
                    if (!['Y', 'N'].includes(server.atenYn) || !['Y', 'N'].includes(server.vdoFlag)) {
                        throw new Error('다음 차시의 출석/영상 상태를 해석할 수 없습니다. 추측하여 재생하지 않습니다.');
                    }
                    if (index === completedIndex && Number(server.lectNo) <= completedLectureNo) continue;
                    if (!eligibleNextLecture(server)) continue;
                    const dom = lectures().find((l) => l.lectNo === server.lectNo);
                    if (!dom) throw new Error('다음 대상 서버 차시에 대응하는 재생 버튼이 없습니다.');
                    return { course: c, week: w, lecture: dom, serverBefore: server };
                }
            }
            return null;
        }

        // ========================================================
        // 메시지: 현재 iframe/source, 정확한 origin, 실행 token, 차시 식별 검증.
        // ========================================================
        function frame() { return $('#cndIfram'); }
        function frameIdentity() { const f = frame(); return f?.getAttribute('src') ? identityFromUrl(f.src) : null; }
        function signalPlayer(command = 'sample', ctx = active) {
            if (!ctx) return;
            const f = frame();
            if (!f || frameIdentity()?.origin !== PLAYER_ORIGIN) return;
            try { f.contentWindow.postMessage({ channel: CHANNEL, command, token: ctx.id }, PLAYER_ORIGIN); }
            catch (_) { /* 후속 heartbeat/timeout에서 진단 */ }
        }
        function safeVideo(v) {
            if (!v || typeof v !== 'object') return null;
            return {
                currentTime: numberOrNull(v.currentTime), duration: numberOrNull(v.duration),
                paused: v.paused === true, ended: v.ended === true, seeking: v.seeking === true,
                loop: v.loop === true, playbackRate: numberOrNull(v.playbackRate),
                readyState: numberOrNull(v.readyState), networkState: numberOrNull(v.networkState),
                bufferedEnd: numberOrNull(v.bufferedEnd), mediaErrorCode: numberOrNull(v.mediaErrorCode),
                waitingEvents: numberOrNull(v.waitingEvents), stalledEvents: numberOrNull(v.stalledEvents),
                quality: v.quality ? { totalVideoFrames: numberOrNull(v.quality.totalVideoFrames), droppedVideoFrames: numberOrNull(v.quality.droppedVideoFrames) } : null
            };
        }
        function safeRpcValue(v, depth = 0) {
            if (depth > 2) return '[depth-limit]';
            if (v === null || typeof v === 'boolean') return v;
            if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= 100000 ? v : '[redacted-number]';
            if (typeof v === 'string') {
                if (/^(?:Y|N|T|F|lect|week)$/.test(v) || (/^-?\d{1,5}(?:\.\d{1,8})?$/.test(v))) return v;
                return '[redacted-string]';
            }
            if (Array.isArray(v)) return v.slice(0, 12).map((x) => safeRpcValue(x, depth + 1));
            if (typeof v === 'object') {
                const allowed = ['lectNo', 'weekNo', 'playStts', 'prcsSttsCd', 'currentTime', 'duration', 'atenYn', 'time', 'position'];
                const out = {};
                for (const k of allowed) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = safeRpcValue(v[k], depth + 1);
                return Object.keys(out).length ? out : '[redacted-object]';
            }
            return '[unsupported]';
        }
        function recordRpc(data, ctx) {
            const allowed = ['dataSetPost', 'dsp_PlayTime', 'atenChk', 'updateAtnlcRate'];
            if (data.action !== 'callFunction' || !allowed.includes(data.functionName)) return;
            if (!state.target || !sameTarget(frameIdentity(), state.target)) return;
            const values = safeRpcValue(data.parameters);
            const key = data.functionName;
            const old = latestRpcByName.get(key);
            const signature = JSON.stringify(values);
            if (old && old.signature === signature && Date.now() - old.at < 10000) return;
            latestRpcByName.set(key, { at: Date.now(), signature });
            bounded('rpc', { at: iso(), functionName: key, parameters: values,
                note: '관찰 전용. 인자 위치/종료코드 의미 미확정; 자동 종료 판정에 사용하지 않음.' }, CONFIG.maxRpcEvents);
            persist();
        }
        function acceptProbe(data, ctx) {
            if (data.token !== ctx.id) return;
            ctx.lastProbeAt = Date.now();
            if (['focus', 'blur', 'visibilitychange'].includes(data.kind)) {
                record('PLAYER_VISIBILITY', { kind: data.kind, visibility: data.visibility, focused: data.focused === true });
                return;
            }
            const identity = data.identity;
            // 시작 전 스냅샷은 재생 중인 영상을 건드리지 않기 위한 검사에만 사용한다.
            if (!state.target) {
                const v = safeVideo(data.video);
                if (v) ctx.preflight = { video: v, receivedAt: Date.now(), identity };
                return;
            }
            if (ctx.verifying || !sameTarget(identity, state.target) || !sameTarget(frameIdentity(), state.target)) return;
            if (!ctx.clickedAt || Number(data.sentAt) < ctx.clickedAt) return;
            if (data.kind === 'timeline') {
                const v = safeVideo(data.video);
                const t = data.timeline;
                const sources = ['iframe', 'media', 'input'];
                const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'pause', 'ended',
                    'error', 'seeking', 'seeked', 'ratechange', 'emptied', 'waiting', 'stalled', 'suspend', 'timeupdate',
                    'visibilitychange', 'focus', 'blur', 'pointerdown', 'pointerup', 'click', 'keydown'];
                if (!t || typeof t !== 'object' || !sources.includes(t.source) || !events.includes(t.event)) return;
                recordTimeline({
                    at: iso(), receivedAt: Date.now(), sentAt: Number(data.sentAt),
                    playerKey: typeof data.frameId === 'string' && typeof data.videoId === 'string' ? `${data.frameId}/${data.videoId}` : null,
                    identity: { shyr: identity.shyr, smstCd: identity.smstCd, coseCd: identity.coseCd, weekNo: identity.weekNo, lectNo: identity.lectNo },
                    source: t.source, event: t.event, trusted: t.trusted === true,
                    target: ['video', 'button', 'form', 'link', 'other'].includes(t.target) ? t.target : null,
                    button: Number.isInteger(t.button) ? t.button : null,
                    hasCoordinates: t.hasCoordinates === true,
                    visibility: data.visibility, focused: data.focused === true,
                    video: v ? { currentTime: v.currentTime, duration: v.duration, paused: v.paused, ended: v.ended,
                        seeking: v.seeking, playbackRate: v.playbackRate, readyState: v.readyState,
                        networkState: v.networkState, waitingEvents: v.waitingEvents, stalledEvents: v.stalledEvents } : null
                });
                return;
            }
            const v = safeVideo(data.video);
            if (!v) return;
            if (typeof data.frameId !== 'string' || typeof data.videoId !== 'string') return;
            const key = `${data.frameId}/${data.videoId}`;
            if (ctx.retiredPlayers.has(key)) return;
            if (ctx.playerKey !== key) {
                if (ctx.playerKey) { ctx.retiredPlayers.add(ctx.playerKey); state.player.frameChanges++; }
                ctx.playerKey = key; ctx.hasPlayed = false; ctx.nearSince = null;
                ctx.candidate = null; ctx.nativeEvidence = null; ctx.lastTime = null; ctx.lastProgressAt = Date.now();
                record('PLAYER_INSTANCE', { key });
            }
            if (!Number.isSafeInteger(data.seq) || data.seq <= (ctx.lastSequence.get(key) || 0)) return;
            ctx.lastSequence.set(key, Number(data.seq));
            const sample = { at: iso(), receivedAt: Date.now(), sentAt: Number(data.sentAt), kind: data.kind,
                playerKey: key, identity: { shyr: identity.shyr, smstCd: identity.smstCd, coseCd: identity.coseCd, weekNo: identity.weekNo, lectNo: identity.lectNo },
                visibility: data.visibility, focused: data.focused === true, video: v };
            state.player.latest = sample;
            ctx.lastMatchingMediaAt = Date.now();
            if (v.mediaErrorCode) ctx.mediaFailure = `video 오류 코드 ${v.mediaErrorCode}`;
            const resumedSnapshot = ['snapshot', 'sample', 'attached'].includes(data.kind) && !v.paused && !v.ended && v.readyState >= 2 && v.currentTime > 0;
            if (data.kind === 'playing' || (!ctx.hasPlayed && resumedSnapshot)) {
                ctx.hasPlayed = true;
                if (!state.player.firstPlaying) state.player.firstPlaying = sample;
                state.player.latestPlaying = sample;
                record('PLAYER_PLAYING', sample);
                // POC가 재생을 호출하지 않으므로 이 신호는 pause 뒤 실제로 재개됐다는 관찰값만 뜻한다.
                if (ctx.manualPause && !ctx.manualResume && ctx.playerKey === ctx.manualPause.playerKey && data.kind === 'playing') {
                    ctx.manualResume = sample;
                    state.manualPauseTest.resume = sample;
                    record('MANUAL_RESUME_CONFIRMED', sample);
                    log('수동 일시정지 뒤 실제 재생 재개를 확인했습니다.');
                }
            }
            if (ctx.lastTime === null || (v.currentTime !== null && Math.abs(v.currentTime - ctx.lastTime) > 0.15)) {
                ctx.lastProgressAt = Date.now(); ctx.progressWarning = false;
            }
            ctx.lastTime = v.currentTime;
            if (Date.now() - ctx.lastSampleLogAt >= CONFIG.sampleLogIntervalMs) {
                ctx.lastSampleLogAt = Date.now();
                bounded('samples', { ...sample, lmsLectures: lectures() }, CONFIG.maxSamples);
                persist();
            }
            if (!['sample', 'snapshot', 'attached', 'playing'].includes(data.kind)) record(`PLAYER_${String(data.kind).toUpperCase()}`, sample);
            // ended/끝부분 pause는 기존 종료 판정에 맡긴다. 그 밖의 명시적 pause만 안전성 검증 대상으로 삼는다.
            const nonEndPause = ctx.hasPlayed && data.kind === 'pause' && v.paused && !v.ended &&
                !v.seeking && !v.loop && !nearEnd(v);
            if (nonEndPause && !ctx.manualPause) {
                if (v.currentTime < CONFIG.manualPauseMinPlaybackSec) {
                    record('STARTUP_PAUSE_IGNORED', {
                        currentTime: v.currentTime,
                        minimumPlaybackSec: CONFIG.manualPauseMinPlaybackSec,
                        sample
                    });
                    log('재생 시작 안정화 전 pause를 수동 일시정지로 처리하지 않습니다.');
                } else {
                    ctx.manualPause = sample;
                    state.manualPauseTest.nonEndPause = sample;
                    ctx.candidate = null;
                    ctx.nearSince = null;
                    record('NON_END_PAUSE_OBSERVED', sample);
                    persist(true);
                    log('끝부분이 아닌 일시정지를 확인했습니다. 실제 재생 재개를 기다립니다.');
                }
            }
            const outcome = classifyEnd(v, data.kind, ctx.hasPlayed, ctx.nearSince, Date.now());
            ctx.nearSince = outcome.nearSince;
            if (outcome.reason === 'NATIVE_ENDED') { state.player.nativeEnded = sample; ctx.nativeEvidence = sample; }
            if (outcome.reason) {
                if (!ctx.candidate || (outcome.reason === 'NATIVE_ENDED' && ctx.candidate.reason !== 'NATIVE_ENDED')) {
                    ctx.candidate = { reason: outcome.reason, at: iso(), receivedAt: Date.now(), sample };
                    record('END_CANDIDATE', ctx.candidate);
                    log('종료 후보:', outcome.reason);
                }
            } else if (!nearEnd(v) && !ctx.nativeEvidence) {
                ctx.candidate = null;
            }
        }
        window.addEventListener('message', (event) => {
            const ctx = active;
            if (!ctx || !state.running || ctx.controller.signal.aborted) return;
            if (event.origin !== PLAYER_ORIGIN || event.source !== frame()?.contentWindow) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            if (data.channel === CHANNEL) {
                if (data.kind === 'hello') { signalPlayer('sample', ctx); return; }
                acceptProbe(data, ctx);
            } else recordRpc(data, ctx);
        });

        function assertTarget(ctx) {
            requireRun(ctx); assertCourse(state.target.course);
            if (currentWeek() !== state.target.week.weekNo) throw new Error('POC 대상과 현재 주차가 달라졌습니다.');
        }
        function candidateStillValid(ctx, candidate) {
            if (ctx.playerKey !== candidate.sample.playerKey) return false;
            const last = state.player.latest;
            if (!last || Date.now() - last.receivedAt > CONFIG.signalSilenceFailureMs) return false;
            if (ctx.nativeEvidence) return true;
            return ctx.hasPlayed && nearEnd(last.video);
        }
        function checkObservation(ctx) {
            assertTarget(ctx);
            if (ctx.mediaFailure) throw new Error(ctx.mediaFailure);
            const now = Date.now();
            if (now - ctx.lastMatchingMediaAt > CONFIG.signalSilenceFailureMs) throw new Error('실제 video 계측 신호가 180초 이상 없습니다. 종료로 추정하지 않고 중단합니다.');
            if (!ctx.silenceWarning && now - ctx.lastMatchingMediaAt > CONFIG.signalSilenceWarningMs) {
                ctx.silenceWarning = true; record('PLAYER_SIGNAL_GAP', { elapsedMs: now - ctx.lastMatchingMediaAt });
            }
            if (now - ctx.lastMatchingMediaAt < 5000) ctx.silenceWarning = false;
            if (!ctx.progressWarning && now - ctx.lastProgressAt > CONFIG.noProgressWarningMs) {
                ctx.progressWarning = true;
                record('MEDIA_TIME_NOT_ADVANCING', { elapsedMs: now - ctx.lastProgressAt, latest: state.player.latest });
                log('실제 영상 위치가 60초 이상 그대로입니다. 완료로 간주하지 않고 관찰 중입니다.');
            }
            return ctx.candidate || false;
        }
        async function verifyAttendance(ctx, attempt) {
            assertTarget(ctx); ctx.verifying = true;
            try {
                phase(`VERIFY_ATTENDANCE_${attempt}`);
                const response = await reloadWeek(state.target.week.weekNo, state.target.course, ctx);
                requireRun(ctx);
                const server = response.lectures.find((x) => x.lectNo === state.target.lecture.lectNo) || null;
                const dom = lectures().find((x) => x.lectNo === state.target.lecture.lectNo) || null;
                const verification = { attempt, at: iso(), source: 'FRESH_UI_AJAX_RESPONSE', responseId: response.id,
                    found: !!server, atenYn: server?.atenYn ?? null, server, dom };
                state.verificationAttempts.push(verification);
                record('ATTENDANCE_VERIFIED', verification);
                persist(true);
                return verification;
            } finally {
                ctx.verifying = false;
            }
        }

        function resetForNextTarget(ctx) {
            ctx.playerKey = null;
            ctx.retiredPlayers.clear();
            ctx.lastSequence.clear();
            ctx.hasPlayed = false;
            ctx.nearSince = null;
            ctx.candidate = null;
            ctx.nativeEvidence = null;
            ctx.clickedAt = null;
            ctx.manualPause = null;
            ctx.manualResume = null;
            ctx.lastMatchingMediaAt = Date.now();
            ctx.lastProgressAt = Date.now();
            ctx.lastTime = null;
            ctx.lastSampleLogAt = 0;
            ctx.progressWarning = false;
            ctx.silenceWarning = false;
            ctx.mediaFailure = null;
            state.player = playerDefaults();
            state.manualPauseTest = { nonEndPause: null, resume: null };
            state.endCandidate = null;
        }

        async function playNextTarget(ctx, next) {
            state.transition.nextTarget = clone(next);
            state.transition.nextSelection = { at: iso(), target: clone(next) };
            state.target = next;
            resetForNextTarget(ctx);
            assertTarget(ctx);
            const b = $$('#videoInfoBody button.btnVideo').find((x) =>
                lectureNumber(x.dataset.lectNo) === next.lecture.lectNo);
            if (!b) throw new Error('다음 대상 차시 버튼을 찾지 못했습니다.');
            phase('WAIT_NEXT_PLAYING');
            ctx.clickedAt = Date.now();
            ctx.lastMatchingMediaAt = ctx.clickedAt;
            ctx.lastProgressAt = ctx.clickedAt;
            state.transition.nextClick = { at: iso(), weekNo: next.week.weekNo, lectNo: next.lecture.lectNo,
                buttonClass: b.className };
            record('NEXT_LECTURE_BUTTON_CLICK', state.transition.nextClick);
            b.click();
            signalPlayer('sample', ctx);
            await waitFor(() => {
                assertTarget(ctx);
                if (ctx.mediaFailure) throw new Error(ctx.mediaFailure);
                return ctx.hasPlayed;
            }, CONFIG.playingTimeoutMs,
            '다음 대상 차시의 실제 재생 시작을 확인하지 못했습니다. 다른 차시로 대체하지 않습니다.', ctx);
            state.transition.nextPlaying = clone(state.player.firstPlaying || state.player.latestPlaying);
            record('NEXT_PLAYING_CONFIRMED', state.transition.nextPlaying);
            state.transition.terminalAction = 'STOP_AFTER_NEXT_PLAYING';
            persist(true);
            conclude(ctx, 'PASS_NEXT_PLAYING', '현재 인계 차시의 실제 종료와 새 출석 Y 확인 뒤, 같은 과목의 다음 미수강 차시 실제 재생을 확인했습니다. 다음 종료·세 번째 차시 선택은 하지 않습니다.');
        }

        function report() {
            return {
                reportType: 'KCU_NAVIGATOR_BETA_REPORT', schemaVersion: 1, scriptVersion: VERSION,
                generatedAt: iso(), config: CONFIG,
                state: { running: state.running, phase: state.phase, runId: state.runId,
                    startedAt: state.startedAt, finishedAt: state.finishedAt, result: state.result, lastError: state.lastError },
                scope: 'FIRST_LNB_COURSE_THROUGH_ALL_ELIGIBLE_LECTURES_WITH_NATIVE_END_AND_FRESH_ATTENDANCE',
                target: state.target, courseScan: state.courseScan, transition: state.transition, initialPage: state.initialPage || null,
                player: state.player, manualPauseTest: state.manualPauseTest, endCandidate: state.endCandidate,
                verificationAttempts: state.verificationAttempts,
                currentPage: { course: course(), weekNo: currentWeek(), lectNo: lectureNumber($('#lectNo')?.value),
                    visibility: document.visibilityState, focused: document.hasFocus(), body: bodyStatus(), lectures: lectures(),
                    ajaxObserverInstalled: ajaxInstalled, ajaxHookError, pendingWeekRequests: pendingWeekIds.size },
                eventCounts: state.eventCounts, dropped: state.dropped,
                events: state.events, samples: state.samples, timeline: state.timeline, kcuRpc: state.rpc,
                interpretation: {
                    attendanceIsNotFullViewingProof: true,
                    kcuRpcEndCodesValidated: false,
                    fallbackIsNativeEndedProof: false,
                    rawUrlsAndSensitiveRpcValuesOmitted: true
                }
            };
        }
        function reportText() {
            return '===== KCU_NAVIGATOR_BETA_REPORT_BEGIN =====\n' + JSON.stringify(report(), null, 2) + '\n===== KCU_NAVIGATOR_BETA_REPORT_END =====';
        }
        function printReport() { console.log(reportText()); }
        function copyReport() {
            try { GM_setClipboard(reportText(), 'text'); log('리포트를 복사했습니다.'); }
            catch (_) { log('복사에 실패했습니다. 리포트 파일 저장 메뉴를 사용하세요.'); }
        }
        function downloadReport() {
            const blob = new Blob([reportText()], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `KCU_NAVIGATOR_BETA_REPORT_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            (document.body || document.documentElement).append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            log('리포트 파일 저장을 요청했습니다.');
        }
        function conclude(ctx, status, reason = null) {
            if (ctx !== active) return;
            signalPlayer('stop', ctx);
            state.running = false; state.phase = status.startsWith('PASS') || status === 'NO_TARGET' ? 'FINISHED' : status;
            state.finishedAt = iso();
            const firstEnd = state.transition?.firstEndCandidate;
            const firstAttendance = state.transition?.firstAttendance;
            state.result = { status, reason,
                endSource: firstEnd?.reason ?? state.endCandidate?.reason ?? null,
                nativeEndedObserved: firstEnd?.reason === 'NATIVE_ENDED' || !!state.player.nativeEnded,
                attendanceConfirmed: firstAttendance?.atenYn === 'Y' || state.verificationAttempts.some((a) => a.atenYn === 'Y'),
                nextPlayingConfirmed: !!state.transition?.nextPlaying,
                targetPlayingConfirmed: !!state.courseScan?.targetPlaying,
                nonEndPauseObserved: !!(state.transition?.firstManualPauseTest?.nonEndPause || state.manualPauseTest?.nonEndPause),
                manualResumeConfirmed: !!(state.transition?.firstManualPauseTest?.resume || state.manualPauseTest?.resume),
                fullViewingVerified: false };
            if (status.startsWith('FAIL')) state.lastError = reason;
            record('RESULT', state.result);
            persist(true);
            ctx.controller.abort();
            log('POC 종료:', status, reason || '');
            printReport();
        }
        function stop(reason = '사용자 정지') {
            clearHandoff();
            if (active && state.running) conclude(active, 'STOPPED', reason);
            else log('현재 실행 중인 POC가 없습니다.');
        }
        async function run(ctx) {
            try {
                await initialReady(ctx);
                const current = assertCourse();
                const links = courseLinks();
                if (!links.length) throw new Error('LNB 과목 목록을 읽지 못했습니다.');
                state.courseScan ||= { index: null, total: null, visited: [], handoff: null, targetPlaying: null, completedTargets: [] };
                state.courseScan.completedTargets ||= [];
                state.courseScan.total = links.length;
                const resume = ctx.handoff;
                const index = resume ? resume.nextIndex : 0;
                if (resume) {
                    if (resume.runId !== state.runId || resume.expectedCoseCd !== current.coseCd) throw new Error('과목 이동 handoff와 새 페이지 과목 식별값이 일치하지 않습니다.');
                    clearHandoff(); state.courseScan.handoff = null;
                    record('COURSE_NAVIGATION_ARRIVED', { index, course: publicCourse(current) });
                }
                if (!links[index] || links[index].coseCd !== current.coseCd) {
                    if (!links[index]) { conclude(ctx, 'NO_TARGET_ALL_COURSES', '모든 LNB 과목에서 적격 미수강 차시를 찾지 못했습니다.'); return; }
                    await navigateToCourse(ctx, links[index]); return;
                }
                state.courseScan.index = index;
                if (!state.courseScan.visited.some((item) => item.index === index && item.course?.coseCd === current.coseCd)) {
                    state.courseScan.visited.push({ index, course: publicCourse(current) });
                }
                record('COURSE_SCANNED', { index, course: publicCourse(current) });
                while (state.running) {
                    const target = await findTarget(ctx);
                    if (target) {
                        record('TARGET_SELECTED', { index, target });
                        await playCourseTarget(ctx, target);
                        await observeAndVerifyTarget(ctx);
                        state.target = null;
                        record('COURSE_RESCAN_AFTER_COMPLETION', { index, completedCount: state.courseScan.completedTargets.length });
                        persist(true);
                        continue;
                    }
                    break;
                }
                record('COURSE_NO_ELIGIBLE_TARGET', { index, course: publicCourse(current) });
                if (!links[index + 1]) { conclude(ctx, 'PASS_ALL_COURSES_COMPLETED', '첫 과목부터 모든 과목의 적격 미수강 차시를 실제 종료와 새 출석 Y 확인까지 처리했습니다.'); return; }
                await navigateToCourse(ctx, links[index + 1]);
            } catch (e) {
                if (e?.name !== 'AbortError' && ctx === active && state.running) conclude(ctx, 'FAILED', scalar(e?.message || '알 수 없는 오류'));
            } finally {
                clearInterval(ctx.pingTimer);
                if (ctx === active) active = null;
            }
        }
        function start() {
            if (active || state.running) { log('이전 실행이 처리 중입니다. 중지 후 다시 시작하세요.'); return; }
            clearHandoff();
            state = defaults(); state.running = true; state.runId = id(); state.startedAt = iso(); state.phase = 'STARTING';
            latestRpcByName.clear();
            const ctx = {
                id: state.runId, controller: new AbortController(), playerKey: null,
                retiredPlayers: new Set(), lastSequence: new Map(), hasPlayed: false,
                nearSince: null, candidate: null, nativeEvidence: null, clickedAt: null,
                manualPause: null, manualResume: null,
                lastProbeAt: Date.now(), lastMatchingMediaAt: Date.now(), lastProgressAt: Date.now(),
                lastTime: null, lastSampleLogAt: 0, progressWarning: false, silenceWarning: false,
                mediaFailure: null, verifying: false, preflight: null, pingTimer: null, handoff: null, navigating: false
            };
            active = ctx;
            record('START', { scope: 'FIRST_LNB_COURSE_THROUGH_ALL_ELIGIBLE_LECTURES_WITH_NATIVE_END_AND_FRESH_ATTENDANCE', visibility: document.visibilityState, focused: document.hasFocus() });
            persist(true);
            ctx.pingTimer = setInterval(() => {
                if (state.running && active === ctx) signalPlayer('sample', ctx);
            }, 3000);
            void run(ctx);
        }

        // 최소 UI: 경고창 없이 Tampermonkey 메뉴만 사용한다.
        GM_registerMenuCommand('KCU Navigator Beta 시작 - 첫 과목부터 연속 진행', start);
        GM_registerMenuCommand('KCU Navigator Beta 정지 - 영상은 유지', () => stop());
        GM_registerMenuCommand('KCU Navigator Beta 상태/리포트 출력', printReport);
        GM_registerMenuCommand('KCU Navigator Beta 리포트 복사', copyReport);
        GM_registerMenuCommand('KCU Navigator Beta 리포트 파일 저장', downloadReport);
        GM_registerMenuCommand('KCU Navigator Beta 상태 초기화', () => {
            if (active || state.running) { stop('초기화 요청: 먼저 실행을 중지했습니다. 초기화 메뉴를 한 번 더 누르면 기록을 지웁니다.'); return; }
            clearTimeout(saveTimer); saveTimer = null;
            GM_deleteValue(STATE_KEY); state = defaults(); log('Navigator Beta 상태를 초기화했습니다.');
        });
        function visibilityEvent(type) {
            if (!state.running) return;
            record(type, { visibility: document.visibilityState, focused: document.hasFocus() });
            recordTimeline({ at: iso(), source: 'top', event: type.toLowerCase(), trusted: true,
                visibility: document.visibilityState, focused: document.hasFocus(), video: null });
            signalPlayer();
        }
        document.addEventListener('visibilitychange', () => visibilityEvent('TOP_VISIBILITYCHANGE'));
        window.addEventListener('focus', () => visibilityEvent('TOP_FOCUS'));
        window.addEventListener('blur', () => visibilityEvent('TOP_BLUR'));
        // 사람이 다른 과목/주차/차시를 조작하면 POC 예약을 취소하되, 사이트 클릭은 막지 않는다.
        document.addEventListener('click', (e) => {
            if (!e.isTrusted || !state.running || !(e.target instanceof Element)) return;
            if (e.target.closest('#lnb li.subjLnb a, .weekInfo, #videoInfoBody button.btnVideo')) stop('사용자가 과목/주차/차시를 직접 조작함');
        }, true);
        document.addEventListener('change', (e) => {
            if (e.isTrusted && state.running && e.target instanceof Element && e.target.matches('.selMngrCose')) stop('사용자가 과목 선택을 변경함');
        }, true);
        document.addEventListener('pointerdown', (e) => {
            if (!state.running || !(e.target instanceof Element)) return;
            const target = e.target.closest('button') ? 'button' : e.target.closest('a') ? 'link' : e.target.closest('input, select, textarea') ? 'form' : e.target.tagName.toLowerCase();
            recordTimeline({ at: iso(), source: 'top-input', event: 'pointerdown', trusted: e.isTrusted === true,
                target, button: e.button, hasCoordinates: Number.isFinite(e.clientX) && Number.isFinite(e.clientY),
                visibility: document.visibilityState, focused: document.hasFocus(), video: null });
        }, true);
        window.addEventListener('pagehide', () => {
            if (active && state.running && !active.navigating) {
                state.running = false; state.phase = 'INTERRUPTED'; state.finishedAt = iso();
                state.result = { status: 'INTERRUPTED', reason: '강의실 페이지 이동 또는 새로고침' };
                active.controller.abort();
            }
            persist(true); clearInterval(hookTimer); bodyObserver?.disconnect();
        });
        const handoff = readHandoff();
        if (state.running && handoff && state.runId === handoff.runId) {
            const ctx = { id: state.runId, controller: new AbortController(), playerKey: null, retiredPlayers: new Set(), lastSequence: new Map(),
                hasPlayed: false, nearSince: null, candidate: null, nativeEvidence: null, clickedAt: null, manualPause: null, manualResume: null,
                lastProbeAt: Date.now(), lastMatchingMediaAt: Date.now(), lastProgressAt: Date.now(), lastTime: null, lastSampleLogAt: 0,
                progressWarning: false, silenceWarning: false, mediaFailure: null, verifying: false, preflight: null, pingTimer: null, handoff, navigating: false };
            active = ctx; record('COURSE_HANDOFF_RESUMED', { index: handoff.nextIndex, expectedCoseCd: handoff.expectedCoseCd }); persist(true);
            ctx.pingTimer = setInterval(() => { if (state.running && active === ctx) signalPlayer('sample', ctx); }, 3000);
            void run(ctx);
        } else if (state.running) {
            clearHandoff();
            state.running = false; state.phase = 'INTERRUPTED'; state.finishedAt = iso();
            state.result = { status: 'INTERRUPTED', reason: '이전 페이지 실행이 중단되었습니다. 자동 재시작하지 않습니다.' };
            persist(true);
        }
        tryInstallAjax(); ensureBodyObserver();
        const hookDeadline = Date.now() + 60000;
        hookTimer = setInterval(() => {
            tryInstallAjax(); ensureBodyObserver();
            if ((ajaxInstalled && observedBody) || Date.now() > hookDeadline) clearInterval(hookTimer);
        }, 50);
        log('대기 상태. 이전 Navigator POC는 끄고, 강의실 새로고침 후 시작 메뉴를 사용하세요.');
    }
})();
