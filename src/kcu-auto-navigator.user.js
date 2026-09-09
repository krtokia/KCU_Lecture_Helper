// ==UserScript==
// @name         KCU Auto Navigator POC 3.1
// @name:ko      KCU 자동수강 Navigator POC 3.1
// @namespace    kcu-lecture-helper
// @version      0.3.2
// @description  현재 과목 한 차시만 재생: 종료 후보·탭 상태 기록, 종료 후 출석 재조회
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
 * 3. 영상을 재생하지 않은 상태에서 메뉴의 "KCU POC3.1 시작 - 현재 과목 한 차시".
 * 4. 결과는 "리포트 복사" 또는 "리포트 파일 저장"으로 전달한다.
 *
 * 범위: 현재 과목만. 열린 주차를 순서대로 확인하여 출석 미인정 영상 한 차시만 재생.
 *       첫 과목으로 이동하지 않으며 다음 차시/과목도 재생하지 않는다.
 * 정지: POC의 대기/예약 동작만 취소한다. 영상 자체는 일시정지하지 않는다.
 * 새로고침: 이전 실행을 중단 처리한다. 자동 재시작하지 않는다.
 *
 * 종료:
 * - 실제 ended 이벤트 / ended=true.
 * - 실제 video.currentTime이 duration 끝 2초 이내인 상태가 2초 이상 관측됨.
 * - pause가 끝부분에서 발생한 경우도 위의 끝부분 후보로 처리한다.
 * - 후보 후 최소 10초 대기하고 위치를 다시 확인한 다음 같은 주차 UI를 재조회한다.
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

    const VERSION = '0.3.2';
    const CHANNEL = 'KCU_POC31_DIAGNOSTICS_V1';
    const LMS_ORIGIN = 'https://lms.kcu.ac';
    const PLAYER_ORIGIN = 'https://mvapi.kcu.ac';
    const STATE_KEY = 'kcuNavigatorPoc31State';
    const TAG = '[KCU POC3.1]';
    const WEEK_API = '/common/lect/selectWeekLectInfo';
    const CONFIG = Object.freeze({
        initialTimeoutMs: 30000,
        weekTimeoutMs: 20000,
        playingTimeoutMs: 45000,
        observationTimeoutMs: 8 * 60 * 60 * 1000,
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
        maxRpcEvents: 180
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
            attached.set(video, { id: `video-${++videoSeq}`, waitingEvents: 0, stalledEvents: 0 });
            knownVideos.add(video);
            const events = ['loadedmetadata', 'playing', 'pause', 'ended', 'error', 'seeking', 'seeked', 'ratechange', 'emptied'];
            for (const kind of events) video.addEventListener(kind, () => sendVideo(kind, video));
            video.addEventListener('timeupdate', () => sampleAll());
            video.addEventListener('waiting', () => { attached.get(video).waitingEvents++; });
            video.addEventListener('stalled', () => { attached.get(video).stalledEvents++; });
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
        document.addEventListener('visibilitychange', () => { post('visibilitychange'); sampleAll('snapshot', true); });
        window.addEventListener('focus', () => post('focus'));
        window.addEventListener('blur', () => post('blur'));
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
        function defaults() {
            return {
                version: VERSION, runId: null, running: false, phase: 'IDLE',
                startedAt: null, finishedAt: null, target: null, result: null, lastError: null,
                player: { firstPlaying: null, latestPlaying: null, latest: null, nativeEnded: null, frameChanges: 0 },
                endCandidate: null, verificationAttempts: [], events: [], samples: [], rpc: [],
                eventCounts: {}, dropped: { events: 0, samples: 0, rpc: 0 }
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
                lib(page.document).on('ajaxSend.kcuPoc31', (e, xhr, settings) => {
                    if (apiPath(settings) !== WEEK_API) return;
                    const entry = { id: ++requestSeq, requestedAt: Date.now(), key: requestIdentity(settings) };
                    requestMap.set(xhr, entry); pendingWeekIds.add(entry.id);
                });
                lib(page.document).on('ajaxComplete.kcuPoc31', (e, xhr, settings) => {
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
            const v = safeVideo(data.video);
            if (!v) return;
            const identity = data.identity;
            // 시작 전 스냅샷은 재생 중인 영상을 건드리지 않기 위한 검사에만 사용한다.
            if (!state.target) { ctx.preflight = { video: v, receivedAt: Date.now(), identity }; return; }
            if (ctx.verifying || !sameTarget(identity, state.target) || !sameTarget(frameIdentity(), state.target)) return;
            if (!ctx.clickedAt || Number(data.sentAt) < ctx.clickedAt) return;
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
        }

        function report() {
            return {
                reportType: 'KCU_POC31_REPORT', schemaVersion: 1, scriptVersion: VERSION,
                generatedAt: iso(), config: CONFIG,
                state: { running: state.running, phase: state.phase, runId: state.runId,
                    startedAt: state.startedAt, finishedAt: state.finishedAt, result: state.result, lastError: state.lastError },
                scope: 'CURRENT_COURSE_ONE_LECTURE_ONLY',
                target: state.target, initialPage: state.initialPage || null,
                player: state.player, endCandidate: state.endCandidate,
                verificationAttempts: state.verificationAttempts,
                currentPage: { course: course(), weekNo: currentWeek(), lectNo: lectureNumber($('#lectNo')?.value),
                    visibility: document.visibilityState, focused: document.hasFocus(), body: bodyStatus(), lectures: lectures(),
                    ajaxObserverInstalled: ajaxInstalled, ajaxHookError, pendingWeekRequests: pendingWeekIds.size },
                eventCounts: state.eventCounts, dropped: state.dropped,
                events: state.events, samples: state.samples, kcuRpc: state.rpc,
                interpretation: {
                    attendanceIsNotFullViewingProof: true,
                    kcuRpcEndCodesValidated: false,
                    fallbackIsNativeEndedProof: false,
                    rawUrlsAndSensitiveRpcValuesOmitted: true
                }
            };
        }
        function reportText() {
            return '===== KCU_POC31_REPORT_BEGIN =====\n' + JSON.stringify(report(), null, 2) + '\n===== KCU_POC31_REPORT_END =====';
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
            a.href = url; a.download = `KCU_POC31_REPORT_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            (document.body || document.documentElement).append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            log('리포트 파일 저장을 요청했습니다.');
        }
        function conclude(ctx, status, reason = null) {
            if (ctx !== active) return;
            signalPlayer('stop', ctx);
            state.running = false; state.phase = status.startsWith('PASS') || status === 'NO_TARGET' ? 'FINISHED' : status;
            state.finishedAt = iso();
            state.result = { status, reason, endSource: state.endCandidate?.reason ?? null,
                nativeEndedObserved: !!state.player.nativeEnded,
                attendanceConfirmed: state.verificationAttempts.some((a) => a.atenYn === 'Y'),
                fullViewingVerified: false };
            if (status.startsWith('FAIL')) state.lastError = reason;
            record('RESULT', state.result);
            persist(true);
            ctx.controller.abort();
            log('POC 종료:', status, reason || '');
            printReport();
        }
        function stop(reason = '사용자 정지') {
            if (active && state.running) conclude(active, 'STOPPED', reason);
            else log('현재 실행 중인 POC가 없습니다.');
        }
        async function run(ctx) {
            try {
                await initialReady(ctx);
                assertCourse();
                // 현재 영상이 이미 재생 중이면 다른 주차 클릭으로 끊지 않는다.
                phase('CHECK_PLAYER_IDLE');
                signalPlayer('sample', ctx);
                await waitFor(() => ctx.preflight, 12000, '플레이어 계측기가 응답하지 않습니다. 설치 후 강의실을 새로고침했는지 확인하세요.', ctx);
                if (!ctx.preflight.video.paused && !ctx.preflight.video.ended) throw new Error('이미 영상이 재생 중입니다. 사이트에서 일시정지한 뒤 POC를 시작하세요.');
                phase('FIND_TARGET');
                const target = await findTarget(ctx);
                requireRun(ctx);
                if (!target) { conclude(ctx, 'NO_TARGET', '현재 과목에 출석 미인정 영상 차시가 없습니다.'); return; }
                state.target = target;
                record('TARGET_SELECTED', target);
                // 응답으로 새로 생성된 버튼을 다시 찾는다.
                const b = $$('#videoInfoBody button.btnVideo').find((x) => lectureNumber(x.dataset.lectNo) === target.lecture.lectNo);
                if (!b) throw new Error('대상 차시 버튼을 찾지 못했습니다.');
                assertTarget(ctx);
                phase('WAIT_PLAYING');
                ctx.clickedAt = Date.now(); ctx.lastMatchingMediaAt = ctx.clickedAt; ctx.lastProgressAt = ctx.clickedAt;
                record('LECTURE_BUTTON_CLICK', { weekNo: target.week.weekNo, lectNo: target.lecture.lectNo, buttonClass: b.className });
                // 영상 조작은 이 사이트 버튼 클릭 한 번뿐이다. 배속은 기존 Helper 담당.
                b.click();
                signalPlayer('sample', ctx);
                await waitFor(() => {
                    assertTarget(ctx);
                    if (ctx.mediaFailure) throw new Error(ctx.mediaFailure);
                    return ctx.hasPlayed;
                }, CONFIG.playingTimeoutMs, '실제 영상 재생 시작을 확인하지 못했습니다. 자동재생 차단/플레이어 계측 상태를 확인하세요.', ctx);
                phase('OBSERVING');
                const deadline = performance.now() + CONFIG.observationTimeoutMs;
                let accepted;
                while (!accepted) {
                    const remaining = deadline - performance.now();
                    if (remaining <= 0) throw new Error('종료 후보 관찰 시간 한도 초과');
                    const candidate = await waitFor(() => checkObservation(ctx), remaining, '종료 후보를 확인하지 못했습니다.', ctx);
                    phase('WAIT_AFTER_END_CANDIDATE');
                    record('END_GRACE_STARTED', { reason: candidate.reason, delayMs: CONFIG.attendanceDelayMs });
                    await delay(CONFIG.attendanceDelayMs, ctx);
                    assertTarget(ctx);
                    if (!candidateStillValid(ctx, candidate)) {
                        record('END_CANDIDATE_CANCELLED', { reason: '영상 인스턴스 또는 실제 끝부분 위치가 달라짐' });
                        ctx.candidate = null; ctx.nearSince = null;
                        phase('OBSERVING'); continue;
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
                        conclude(ctx, accepted.reason === 'NATIVE_ENDED' ? 'PASS_NATIVE_END' : 'PASS_FALLBACK_END',
                            accepted.reason === 'NATIVE_ENDED' ? '실제 종료 신호와 새 응답의 출석 Y 확인' : '끝부분 위치 기반 종료 후보와 새 응답의 출석 Y 확인. native ended 검증은 별도.');
                        return;
                    }
                    if (verification.atenYn !== 'N') throw new Error('재조회 응답의 출석 값이 Y/N이 아닙니다.');
                }
                conclude(ctx, 'FAIL_ATTENDANCE_NOT_CONFIRMED', '두 차례 새 주차 응답에서 출석 Y를 확인하지 못했습니다. 자동 재생 재시도는 하지 않습니다.');
            } catch (e) {
                if (e?.name !== 'AbortError' && ctx === active && state.running) conclude(ctx, 'FAILED', scalar(e?.message || '알 수 없는 오류'));
            } finally {
                clearInterval(ctx.pingTimer);
                if (ctx === active) active = null;
            }
        }
        function start() {
            if (active || state.running) { log('이전 실행이 처리 중입니다. 중지 후 다시 시작하세요.'); return; }
            state = defaults(); state.running = true; state.runId = id(); state.startedAt = iso(); state.phase = 'STARTING';
            latestRpcByName.clear();
            const ctx = {
                id: state.runId, controller: new AbortController(), playerKey: null,
                retiredPlayers: new Set(), lastSequence: new Map(), hasPlayed: false,
                nearSince: null, candidate: null, nativeEvidence: null, clickedAt: null,
                lastProbeAt: Date.now(), lastMatchingMediaAt: Date.now(), lastProgressAt: Date.now(),
                lastTime: null, lastSampleLogAt: 0, progressWarning: false, silenceWarning: false,
                mediaFailure: null, verifying: false, preflight: null, pingTimer: null
            };
            active = ctx;
            record('START', { scope: 'CURRENT_COURSE_ONE_LECTURE_ONLY', visibility: document.visibilityState, focused: document.hasFocus() });
            persist(true);
            ctx.pingTimer = setInterval(() => {
                if (state.running && active === ctx) signalPlayer('sample', ctx);
            }, 3000);
            void run(ctx);
        }

        // 최소 UI: 경고창 없이 Tampermonkey 메뉴만 사용한다.
        GM_registerMenuCommand('KCU POC3.1 시작 - 현재 과목 한 차시', start);
        GM_registerMenuCommand('KCU POC3.1 정지 - 영상은 유지', () => stop());
        GM_registerMenuCommand('KCU POC3.1 상태/리포트 출력', printReport);
        GM_registerMenuCommand('KCU POC3.1 리포트 복사', copyReport);
        GM_registerMenuCommand('KCU POC3.1 리포트 파일 저장', downloadReport);
        GM_registerMenuCommand('KCU POC3.1 상태 초기화', () => {
            if (active || state.running) { stop('초기화 요청: 먼저 실행을 중지했습니다. 초기화 메뉴를 한 번 더 누르면 기록을 지웁니다.'); return; }
            clearTimeout(saveTimer); saveTimer = null;
            GM_deleteValue(STATE_KEY); state = defaults(); log('POC3.1 상태를 초기화했습니다.');
        });
        function visibilityEvent(type) {
            if (!state.running) return;
            record(type, { visibility: document.visibilityState, focused: document.hasFocus() });
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
        window.addEventListener('pagehide', () => {
            if (active && state.running) {
                state.running = false; state.phase = 'INTERRUPTED'; state.finishedAt = iso();
                state.result = { status: 'INTERRUPTED', reason: '강의실 페이지 이동 또는 새로고침' };
                active.controller.abort();
            }
            persist(true); clearInterval(hookTimer); bodyObserver?.disconnect();
        });
        if (state.running) {
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
        log('대기 상태. 이전 POC는 끄고, 강의실 새로고침 후 시작 메뉴를 사용하세요.');
    }
})();
