/* global SillyTavern */

// Video Avatars extension: upgrades avatar <img> into animated .webp or <video> when a companion file exists
(() => {
    'use strict';

    const ctx = () => SillyTavern.getContext();

    // Simple persistent settings (can be expanded later)
    const MODULE_NAME = 'st_video_avatars';
    const defaultSettings = Object.freeze({
        enabled: true,
        // Preference order: first hit wins
        order: ['webp', 'webm', 'mp4'],
        // Probe with HEAD to avoid downloading full assets
        useHeadProbe: true,
    });

    function getSettings() {
        const { extensionSettings, saveSettingsDebounced } = ctx();
        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
            saveSettingsDebounced();
        } else {
            // ensure keys exist after updates
            for (const k of Object.keys(defaultSettings)) {
                if (!Object.hasOwn(extensionSettings[MODULE_NAME], k)) {
                    extensionSettings[MODULE_NAME][k] = defaultSettings[k];
                }
            }
        }
        return extensionSettings[MODULE_NAME];
    }

    const settings = getSettings();

    // Cache probed URLs (positive and negative)
    // key: absolute URL string -> boolean (true if exists)
    const probeCache = new Map();
    // In-memory-only probe cache (no persistent storage)

    // Utility: try a HEAD or GET to see if a file exists
    async function urlExists(url) {
        try {
            const now = Date.now();
            const rec = probeCache.get(url);
            if (typeof rec === 'boolean') return rec;

            const method = settings.useHeadProbe ? 'HEAD' : 'GET';
            const res = await fetch(url, { method, cache: 'no-store' });
            const ok = res.ok;
            probeCache.set(url, ok);
            return ok;
        } catch (err) {
            try { probeCache.set(url, false); } catch (_) {}
            return false;
        }
    }

    // Parse avatar img src and produce candidate companion URLs (absolute)
    function getCompanionCandidates(img) {
        const src = img.getAttribute('src') || '';
        try {
            const u = new URL(src, location.href);
            const origin = u.origin;
            const extsByKey = { webp: '.webp', webm: '.webm', mp4: '.mp4' };

            /** @type {{type: 'avatar'|'persona'|null, fileBase: string|null}} */
            let info = { type: null, fileBase: null };

            if (/\/thumbnail/i.test(u.pathname)) {
                const params = u.searchParams;
                const type = params.get('type');
                const fileParam = params.get('file');
                if ((type === 'avatar' || type === 'persona') && fileParam) {
                    const base = String(fileParam).replace(/\.[a-z0-9]+$/i, '');
                    info = { type, fileBase: base };
                }
            } else if (/\/characters\//i.test(u.pathname)) {
                // Direct character path -> avatar thumbnail
                const fileName = u.pathname.split('/').pop() || '';
                const base = fileName.replace(/\.[a-z0-9]+$/i, '');
                info = { type: 'avatar', fileBase: base };
            } else if (/\/avatars\//i.test(u.pathname)) {
                // Direct persona/avatar path -> persona thumbnail
                const fileName = u.pathname.split('/').pop() || '';
                const base = fileName.replace(/\.[a-z0-9]+$/i, '');
                info = { type: 'persona', fileBase: base };
            }

            if (!info.type || !info.fileBase) {
                // unrecognized src
                return [];
            }

            const out = [];
            for (const key of settings.order) {
                const ext = extsByKey[key];
                if (!ext) continue;
                const file = `${info.fileBase}${ext}`;
                const url = `${origin}/thumbnail?type=${info.type}&file=${encodeURIComponent(file)}`;
                out.push(url);
                // Also probe direct user images companion path: /user/images/<base>/<base>.<ext>
                // This is where the extension uploads the animated asset for characters.
                const direct = `${origin}/user/images/${encodeURIComponent(info.fileBase)}/${encodeURIComponent(info.fileBase)}${ext}`;
                out.push(direct);
            }
            // derived companion candidates
            return out;
        } catch (e) {
            // error deriving candidates
            return [];
        }
    }

    function isUpgraded(el) {
        return el?.dataset?.stVideoAvatar === '1';
    }

    function markUpgraded(el) {
        el.dataset.stVideoAvatar = '1';
    }

    function copySizing(fromEl, toEl) {
        // Keep classes; assume border-radius/size from CSS
        toEl.className = fromEl.className;
        // Preserve inline size styles if any
        const style = window.getComputedStyle(fromEl);
        // If the img has explicit width/height, reflect it
        const w = fromEl.getAttribute('width') || '';
        const h = fromEl.getAttribute('height') || '';
        if (w) toEl.setAttribute('width', w);
        if (h) toEl.setAttribute('height', h);

        // Ensure new element fits the same box
        toEl.style.width = fromEl.style.width || '';
        toEl.style.height = fromEl.style.height || '';
        // Copy some visual hints
        toEl.style.borderRadius = style.borderRadius;
        toEl.style.objectFit = 'cover';
    }

    async function upgradeOneImage(img) {
        if (!settings.enabled) return;
        if (!img || isUpgraded(img)) return;
    // upgradeOneImage start
        const candidates = getCompanionCandidates(img);
    // candidates resolved
    if (!candidates.length) { return; }

        // Try WebP first (cheap swap), then videos
        let foundUrl = null;
        let foundType = null;

        for (const url of candidates) {
            const ext = url.split('.').pop().toLowerCase();
            // probing candidate
            const ok = await urlExists(url);
            if (ok) {
                foundUrl = url;
                foundType = ext; // 'webp' | 'webm' | 'mp4'
                // candidate ok
                break;
            }
        }

        if (!foundUrl) { return; }

        if (foundType === 'webp') {
            // Simple replacement of src keeps layout intact
            img.src = foundUrl;
            markUpgraded(img);
            // replaced IMG src with webp
            return;
        }

        // Video case: replace <img> with <video>
        const video = document.createElement('video');
        video.classList.add('st-video-avatar');
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        copySizing(img, video);

        // Prefer <source> for better type hints
        const source = document.createElement('source');
        source.src = foundUrl;
        source.type = foundType === 'webm' ? 'video/webm' : 'video/mp4';
        video.appendChild(source);

        // If the original IMG had alt or title, keep them on the container
        if (img.alt) video.setAttribute('aria-label', img.alt);
        if (img.title) video.title = img.title;

        // Swap in-place
        img.replaceWith(video);
        markUpgraded(video);
        // replaced IMG with <video>
        return;
    }

    /**
     * Collect avatar <img> elements under a given root.
     * @param {Document|HTMLElement} root
     */
    function collectAvatarImages(root) {
        if (!root) return [];
        // Heuristics: target avatar images in common ST paths and formats
        const selector = [
            'img[src*="/avatars/"]', // direct persona path
            'img[src*="/characters/"]', // direct character path
            'img[src*="/thumbnail"][src*="type=avatar"]',
            'img[src*="/thumbnail"][src*="type=persona"]',
        ].join(',');

        // Filter for typical static image types to avoid reprocessing already swapped items
        const list = root.querySelectorAll(selector);
        const arr = Array.from(list).filter((img) => {
            if (!(img instanceof HTMLImageElement)) return false;
            if (isUpgraded(img)) return false;
            const src = img.getAttribute('src') || '';
            // Accept both direct file types and thumbnail URLs
            const isDirectImage = /\.(png|jpe?g|gif|webp)$/i.test(src);
            const isAvatarThumb = /\/thumbnail/.test(src) && /(type=avatar|type=persona)/.test(src);
            return isDirectImage || isAvatarThumb;
        });

        return arr;
    }

    /**
     * Upgrade avatar images within a root node (Document or HTMLElement).
     * @param {Document|HTMLElement} [root=document]
     */
    async function upgradeAvatarsIn(root = document) {
        const imgs = collectAvatarImages(root);
        for (const img of imgs) {
            // Fire and forget to keep UI snappy
            upgradeOneImage(img);
        }
    }

    // MutationObserver to catch dynamic content
    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    // mutation observer detected new node
                    upgradeAvatarsIn(node);
                    // Ensure any newly added avatar inputs accept videos
                    widenAvatarInputs(node);
                }
            }
        }
    });

    function startObservers() {
        mo.observe(document.body, { childList: true, subtree: true });
    }

    globalThis.resolveAndApplyAvatar = async function (imgEl) {
        if (imgEl instanceof HTMLImageElement) {
            await upgradeOneImage(imgEl);
        }
    };

    // Wire into ST events with a safe initializer
    /**
     * Ensure avatar file inputs accept video files as well as images.
     * @param {Document|HTMLElement} [root=document]
     */
    function widenAvatarInputs(root = document) {
        try {
            const sel = [
                '#add_avatar_button',
                '#group_avatar_button',
                '#avatar_upload_file',
                'input.avatarUpload',
            ].join(',');
            const inputs = root.querySelectorAll(sel);
            inputs.forEach((el) => {
                if (!(el instanceof HTMLInputElement)) return;
                const acc = el.getAttribute('accept') || '';
                if (!/video\/\*/.test(acc)) {
                    el.setAttribute('accept', acc ? acc + ',video/*' : 'image/*,video/*');
                }
            });
        } catch (e) { /* ignore */ }
    }

    async function onAppReady() {
        try {
            // Ensure inputs accept videos and attach interceptors
            widenAvatarInputs(document);
            installAvatarChangeInterceptor();
            installReadAvatarLoadHook();
            installEnsureImageFormatSupportedHook();
            // Initial upgrade + observers
            await upgradeAvatarsIn(document);
            startObservers();
            // Patch avatar uploader to gracefully handle video files (no cropper)
            schedulePatchReadAvatarLoad();
            patchPopupCropperSafety();
        } catch (err) {
            console.error('[Video Avatars] init error:', err);
        }
    }

    function tryWire() {
        try {
            const { eventSource, event_types } = ctx();
            if (!eventSource || !event_types || !event_types.APP_READY) throw new Error('context not ready');
            eventSource.on(event_types.APP_READY, onAppReady);
            // Also subscribe to chat/message events for continuous upgrades
            const followUps = ['USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'CHAT_CHANGED'];
            followUps.forEach((name) => {
                const et = event_types[name];
                if (et) eventSource.on(et, () => upgradeAvatarsIn(document));
            });
            // Also do a small delayed pass in case APP_READY was already fired before we attached
            setTimeout(() => { try { onAppReady(); } catch(_) {} }, 300);
            return true;
        } catch (_) {
            return false;
        }
    }

    if (!tryWire()) {
        // Retry a few times until ST context is ready
        let attempts = 0; const max = 20; const iv = setInterval(() => {
            attempts++;
            if (tryWire() || attempts >= max) clearInterval(iv);
        }, 250);
    }

    // Expose minimal API in case other extensions want to trigger a pass
    globalThis.STVideoAvatars = {
        rescan: () => upgradeAvatarsIn(document),
        settings,
    };
})();

/**
 * Generate a PNG data URL thumbnail from a selected video File.
 * @param {File} file
 * @returns {Promise<string|null>} data URL or null on failure
 */
async function generateVideoThumbnail(file) {
    try {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        video.muted = true; video.playsInline = true; video.preload = 'metadata';
        // Wait for metadata
        await new Promise((resolve) => {
            const onMeta = () => { cleanup(); resolve(); };
            const cleanup = () => { video.removeEventListener('loadedmetadata', onMeta); };
            video.addEventListener('loadedmetadata', onMeta);
        });
        // Try to seek a bit into the video for a non-black frame
        const target = Math.min(0.5, Number.isFinite(video.duration) ? video.duration : 0) || 0;
        if (target > 0) {
            await new Promise((resolve) => {
                const onSeek = () => { cleanup2(); resolve(); };
                const cleanup2 = () => { video.removeEventListener('seeked', onSeek); };
                video.addEventListener('seeked', onSeek);
                try { video.currentTime = target; } catch (_) { resolve(); }
            });
        }
        const w = video.videoWidth || 256;
        const h = video.videoHeight || 256;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx2 = canvas.getContext('2d');
        if (ctx2) {
            ctx2.drawImage(video, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/png');
            URL.revokeObjectURL(url);
            return dataUrl;
        }
        URL.revokeObjectURL(url);
        return null;
    } catch (e) {
        console.warn('[Video Avatars] thumbnail generation failed', e);
        return null;
    }
}

/**
 * Monkey-patch core read_avatar_load to bypass cropper for video files and show a preview thumbnail instead.
 */
function schedulePatchReadAvatarLoad() {
    try {
        let attempts = 0; const max = 40; // ~10s
        const iv = setInterval(() => {
            attempts++;
            try {
                patchReadAvatarLoadOnce();
                clearInterval(iv);
            } catch (e) {
                if (attempts >= max) {
                    console.warn('[Video Avatars] failed to patch read_avatar_load', e);
                    clearInterval(iv);
                }
            }
        }, 250);
    } catch (e) {
        console.warn('[Video Avatars] failed to schedule read_avatar_load patch', e);
    }
}

function patchReadAvatarLoadOnce() {
    /** @type {any} */
    const g = window;
    /** @type {any} */
    const orig = g.read_avatar_load;
    if (typeof orig !== 'function' || (orig && orig.__va_patched)) return;
    /** @type {any} */
    const wrapped = async function(input) {
        try {
            try {
                const f0 = input && input.files && input.files[0];
                const meta0 = f0 ? { name: f0.name, type: f0.type, size: f0.size } : null;
                /** @type {any} */
                const w = window; w.__va_last_avatar_file = meta0;
            } catch (_) { /* noop */ }
            const file = input && input.files && input.files[0];
            const name = file && typeof file.name === 'string' ? file.name : '';
            const type = file && typeof file.type === 'string' ? file.type : '';
            const isVideoByType = !!type && type.startsWith('video/');
            const isVideoByExt = /\.(webm|mp4|m4v|mov|ogg)$/i.test(name);
                if (file && (isVideoByType || isVideoByExt)) {
                // Generate a preview thumbnail and skip crop popup
                const thumb = await generateVideoThumbnail(file);
                const fallback = (g.default_avatar || '/img/ai4.png');
                const imgEl = document.getElementById('avatar_load_preview');
                if (imgEl && thumb) imgEl.setAttribute('src', thumb);
                else if (imgEl) imgEl.setAttribute('src', fallback);
                // Stop here to avoid invoking the cropper on a video file
                return;
            }
        } catch (e) {
            console.warn('[Video Avatars] read_avatar_load video intercept failed', e);
        }
        // Fallback to original behavior for images
        return await orig.apply(this, arguments);
    };
    try { Object.defineProperty(wrapped, '__va_patched', { value: true }); } catch (_) { wrapped.__va_patched = true; }
    g.read_avatar_load = wrapped;
}

/**
 * Install a property hook on window.read_avatar_load to wrap any later assignment from core.
 * Ensures video bypass even if core defines/overwrites the function after our extension.
 */
function installReadAvatarLoadHook() {
    try {
        const g = /** @type {any} */ (window);
        if (g.__va_read_avatar_load_hook) return;
        let current = g.read_avatar_load;
        const wrap = (fn) => {
            if (typeof fn !== 'function') return fn;
            if (fn.__va_wrapped) return fn;
            /** @type {any} */
            const wrapped = async function(input) {
                try {
                    try {
                        const f0 = input && input.files && input.files[0];
                        const meta0 = f0 ? { name: f0.name, type: f0.type, size: f0.size } : null;
                        /** @type {any} */
                        const w = window; w.__va_last_avatar_file = meta0;
                    } catch (_) { /* noop */ }
                    const file = input && input.files && input.files[0];
                    const name = file && typeof file.name === 'string' ? file.name : '';
                    const type = file && typeof file.type === 'string' ? file.type : '';
                    const isVideoByType = !!type && type.startsWith('video/');
                    const isVideoByExt = /\.(webm|mp4|m4v|mov|ogg)$/i.test(name);
                    if (file && (isVideoByType || isVideoByExt)) {
                        // intercepted video (hook-wrap)
                        const thumb = await generateVideoThumbnail(file);
                        const fallback = (g.default_avatar || '/img/ai4.png');
                        const imgEl = document.getElementById('avatar_load_preview');
                        if (imgEl && thumb) imgEl.setAttribute('src', thumb); else if (imgEl) imgEl.setAttribute('src', fallback);
                        return; // bypass cropper path
                    }
                } catch (e) { console.warn('[Video Avatars] hook wrapper failed', e); }
                return await fn.apply(this, arguments);
            };
            try { Object.defineProperty(wrapped, '__va_wrapped', { value: true }); } catch (_) { wrapped.__va_wrapped = true; }
            return wrapped;
        };
        // Initial wrap if already present
        if (typeof current === 'function') current = wrap(current);
        Object.defineProperty(g, 'read_avatar_load', {
            configurable: true,
            enumerable: false,
            get() { return current; },
            set(v) { current = wrap(v); },
        });
        g.__va_read_avatar_load_hook = true;
    } catch (e) {
        console.warn('[Video Avatars] failed to install read_avatar_load hook', e);
    }
}

/**
 * Intercept avatar input change events (capture phase) to handle video files
 * before jQuery handlers invoke read_avatar_load.
 */
function installAvatarChangeInterceptor() {
    // Avoid double-adding
    try {
        /** @type {any} */
        const w = window;
        if (w.__va_change_interceptor_attached) return;
        w.__va_change_interceptor_attached = true;
    } catch (_) { /* ignore */ }

    const handler = async (e) => {
        try {
            const target = e.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.type !== 'file') return;
            const id = target.id || '';
            const name = target.name || '';
            const cls = target.className || '';
            // Limit to known avatar pickers
            const isAvatarPicker = (
                id === 'add_avatar_button' ||
                id === 'group_avatar_button' ||
                id === 'avatar_upload_file' ||
                cls.split(/\s+/).includes('avatarUpload')
            );
            if (!isAvatarPicker) return;
            const file = target.files && target.files[0];
            if (!file) return;
            const type = (file.type || '').toLowerCase();
            const fname = (file.name || '').toLowerCase();
            const isVideo = (type.startsWith('video/')) || /\.(webm|mp4|m4v|mov|ogg)$/i.test(fname);
            if (!isVideo) return;
            // Video selected: generate preview and stop core handler
            try { /** @type {any} */ (window).__va_last_avatar_file = { name: file.name, type: file.type, size: file.size }; } catch (_) {}
            // intercepting video selection at change/input; stopping core
            const thumb = await generateVideoThumbnail(file);
            const fallback = (window['default_avatar'] || '/img/ai4.png');
            const imgEl = document.getElementById('avatar_load_preview');
            if (imgEl && thumb) imgEl.setAttribute('src', thumb);
            else if (imgEl) imgEl.setAttribute('src', fallback);
            // Prevent downstream handlers (including read_avatar_load)
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();

            // Kick off conversion to animated webp (if available)
            try {
                await convertAvatarVideoIfNeeded(target);
            } catch (convErr) {
                console.warn('convertAvatarVideoIfNeeded failed', convErr);
            }
        } catch (err) {
            console.warn('[Video Avatars] change intercept failed', err);
        }
    };
    // Use capture to run before jQuery's bubbling handlers
    document.addEventListener('change', handler, true);
    document.addEventListener('input', handler, true);
}

/**
 * If target has a video file, convert it to animated webp using global converter.
 * Replace the input's file with the converted image, update preview, and trigger the appropriate flow.
 * @param {HTMLInputElement} input
 */
async function convertAvatarVideoIfNeeded(input) {
    try {
        // De-dupe: avoid running conversion twice for the same selection (input/change both fire)
            if (input && typeof input === 'object' && 'dataset' in input) {
            if (input.dataset.vaConverting === '1') {
                // already converting; skipping duplicate
                return;
            }
            input.dataset.vaConverting = '1';
        }
        const file = input.files && input.files[0];
        if (!file) return;
        const isVideo = (file.type || '').startsWith('video/') || /\.(webm|mp4|m4v|mov|ogg)$/i.test(file.name || '');
        if (!isVideo) return;

        /** @type {any} */
        const w = window;
        const toast = w['toastr'];
        const openExtMenu = SillyTavern.getContext().openThirdPartyExtensionMenu;
        const converter = w['convertVideoToAnimatedWebp'];
        // Always ensure the avatar input is a PNG still (so server never receives a video)
        const baseName = getCharacterBaseNameSafe();
        const thumbUrl = await generateVideoThumbnail(file);
        if (thumbUrl) {
            const stillPng = await dataUrlToFile(thumbUrl, (baseName || (file.name.replace(/\.[^/.]+$/, '') || 'avatar')) + '.png', 'image/png');
                try {
                const dt = new DataTransfer();
                dt.items.add(stillPng);
                input.files = dt.files;
            } catch(_) {}
        }

        if (typeof converter !== 'function') {
            // converter missing
            if (toast && toast.warning) {
                const toastMsg = toast.warning('Click here to install the Video Background Loader extension', 'Video avatar uploads require a downloadable add-on', {
                    timeOut: 0,
                    extendedTimeOut: 0,
                    onclick: function() {
                        try {
                            if (typeof openExtMenu === 'function') {
                                openExtMenu('https://github.com/SillyTavern/Extension-VideoBackgroundLoader');
                            }
                        } catch(_){}
                    },
                });
            }
            // Without converter, we stop here: PNG will be saved; no animation companion.
            return;
        }

        let tMsg = null;
        try {
            if (toast && toast.info) tMsg = toast.info('Preparing video for upload. This may take several minutes.', 'Please wait', { timeOut: 0, extendedTimeOut: 0 });
        } catch(_) {}

        // starting video->animated webp conversion
        const sourceBuffer = await file.arrayBuffer();
        const convertedBuffer = await converter({ buffer: new Uint8Array(sourceBuffer), name: file.name });
        const convertedName = file.name.replace(/\.[^/.]+$/, '.webp');
        const convertedFile = new File([new Uint8Array(convertedBuffer)], convertedName, { type: 'image/webp' });
    // conversion complete

        // Update preview to a data URL of the still image (thumbnail)
        try {
            const dataUrl = thumbUrl;
            const imgEl = document.getElementById('avatar_load_preview');
            if (imgEl && typeof dataUrl === 'string') imgEl.setAttribute('src', dataUrl);
        } catch(_) {}

        // Decide flow based on input ID
        const id = input.id || '';
        const isGroup = id === 'group_avatar_button';
        const isPersona = (id === 'avatar_upload_file') || (input.className || '').split(/\s+/).includes('avatarUpload');
        const isChar = id === 'add_avatar_button';

        if (isGroup || isPersona) {
            // Re-dispatch change event so native handlers proceed (group/persona flows don’t use cropper)
            try {
                input.dataset.vaConverted = '1';
                const evt = new Event('change', { bubbles: true });
                input.dispatchEvent(evt);
                // clear the flag shortly after
                setTimeout(() => { try { delete input.dataset.vaConverted; } catch(_){} }, 0);
                // re-dispatched change event for group/persona after conversion
            } catch(_) {}
        } else if (isChar) {
            // Character avatar: upload animated webp companion to user images folder under the character's base name
            try {
                if (baseName) {
                    await uploadCompanionWebp(baseName, convertedFile);
                    // uploaded animated webp companion to user images
                } else {
                    // baseName not found; skipping webp companion upload (create flow?)
                }
            } catch (e) {
                console.warn('failed to upload webp companion', e);
            }
            // character avatar handled; PNG still will be saved on Save click
        }

        try { if (tMsg && typeof tMsg.remove === 'function') tMsg.remove(); } catch(_) {}
    } catch (e) {
        console.warn('conversion error', e);
        try { const toast = window['toastr']; if (toast && toast['error']) toast['error']('Error converting video to animated webp'); } catch(_) {}
    } finally {
        try { if (input && 'dataset' in input) delete input.dataset.vaConverting; } catch(_) {}
    }
}

function getCharacterBaseNameSafe() {
    try {
        const el = document.getElementById('avatar_url_pole');
        const val = el && 'value' in el ? String(el.value || '') : '';
        if (val && val.toLowerCase().endsWith('.png')) return val.slice(0, -4);
        return val || '';
    } catch (_) { return ''; }
}

async function dataUrlToFile(dataUrl, filename, mime) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    return new File([new Uint8Array(buf)], filename, { type: mime || blob.type || 'application/octet-stream' });
}

async function fileToBase64(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return btoa(binary);
}

async function uploadCompanionWebp(baseName, webpFile) {
    // Get CSRF token from global if available, otherwise fetch it
    async function getCsrfTokenSafe() {
        try {
            // @ts-ignore
            const t = window['token'];
            if (typeof t === 'string' && t) return t;
        } catch(_) {}
        try {
            const res = await fetch('/csrf-token', { method: 'GET', cache: 'no-store' });
            if (res.ok) {
                const js = await res.json().catch(() => null);
                if (js && typeof js.token === 'string') return js.token;
            }
        } catch(_) {}
        return '';
    }
    const b64 = await fileToBase64(webpFile);
    const payload = {
        image: b64,
        format: 'webp',
        ch_name: baseName,
        filename: baseName + '.webp',
    };
    const csrf = await getCsrfTokenSafe();
    try {
        const resp = await fetch('/api/images/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error('uploadCompanionWebp failed: ' + resp.status);
        const json = await resp.json().catch(() => ({}));
        // Notify user that upload finished and advise reload
        try { const toast = window['toastr']; if (toast && toast['success']) toast['success']('Upload finished, please reload.'); } catch(_) {}
        return json;
    } catch (err) {
        // Show error toast on failure
        try { const toast = window['toastr']; if (toast && toast['error']) toast['error']('Failed to upload animated avatar.'); } catch(_) {}
        throw err;
    }
}

/**
 * Make the crop popup robust: if cropper is not present (e.g., video placeholder),
 * resolve with the image src instead of calling getCroppedCanvas().
 */
function patchPopupCropperSafety() {
    try {
        /** @type {any} */
        const w = window;
        if (w.__va_cropper_patch_started) return; w.__va_cropper_patch_started = true;
        let attempts = 0; const max = 40; // ~10s at 250ms
        const iv = setInterval(() => {
            attempts++;
            try {
                /** @type {any} */
                const PopupCtor = window['Popup'];
                if (!PopupCtor || !PopupCtor.prototype || PopupCtor.prototype.__va_crop_patched) {
                    if (PopupCtor && PopupCtor.prototype && PopupCtor.prototype.__va_crop_patched) clearInterval(iv);
                    if (attempts >= max) clearInterval(iv);
                    return;
                }
                /** @type {any} */
                const POPUP_TYPE = window['POPUP_TYPE'] || {};
                /** @type {any} */
                const POPUP_RESULT = window['POPUP_RESULT'] || {};
                const origComplete = PopupCtor.prototype.complete;
                const origShow = PopupCtor.prototype.show;
                // Bypass CROP popup entirely if last selected file was a video
                PopupCtor.prototype.show = function() {
                    try {
                        const last = w.__va_last_avatar_file || null;
                        const isVideo = last && (String(last.type || '').startsWith('video/') || /\.(webm|mp4|m4v|mov|ogg)$/i.test(String(last.name || '')));
                        if (this.type === POPUP_TYPE.CROP && isVideo) {
                            const previewEl = /** @type {HTMLImageElement} */ (document.getElementById('avatar_load_preview'));
                            const src = (previewEl && previewEl.src) ? previewEl.src : (this.cropImage || null);
                            // Mimic original API: return a promise resolving to the image data
                            return Promise.resolve(src || null);
                        }
                    } catch (_) { /* fall through to original show */ }
                    return origShow.apply(this, arguments);
                };
                PopupCtor.prototype.complete = async function(result) {
                    try {
                        // Popup.complete called
                        if (this.type === POPUP_TYPE.CROP && result >= POPUP_RESULT.AFFIRMATIVE) {
                            const $img = window['jQuery'] ? window['jQuery'](this.cropImage) : null;
                            try {
                                const hasData = $img && typeof $img.data === 'function';
                                const cropper = hasData ? $img.data('cropper') : null;
                                const needsShim = !cropper || typeof cropper.getCroppedCanvas !== 'function' || !cropper.getCroppedCanvas();
                                if (needsShim) {
                                    const imgEl = /** @type {HTMLImageElement} */ (this.cropImage);
                                    const canvas = document.createElement('canvas');
                                    const w = (imgEl && (imgEl.naturalWidth || imgEl.width)) || 256;
                                    const h = (imgEl && (imgEl.naturalHeight || imgEl.height)) || 256;
                                    canvas.width = w; canvas.height = h;
                                    const ctx = canvas.getContext('2d');
                                    if (ctx && imgEl) {
                                        try { ctx.drawImage(imgEl, 0, 0, w, h); } catch (_) { /* ignore */ }
                                    }
                                    // Inject a shim cropper so original logic proceeds without nulls
                                    if (hasData) $img.data('cropper', { getCroppedCanvas: () => canvas });
                                }
                            } catch (_) { /* ignore and let original try */ }
                        }
                    } catch (_) { /* fallthrough to original */ }
                    return origComplete.apply(this, arguments);
                };
                try { Object.defineProperty(PopupCtor.prototype, '__va_crop_patched', { value: true }); } catch (_) { PopupCtor.prototype.__va_crop_patched = true; }
                clearInterval(iv);
            } catch (e) {
                if (attempts >= max) {
                    console.warn('[Video Avatars] failed to patch Popup cropper', e);
                    clearInterval(iv);
                }
            }
        }, 250);
    } catch (e) {
        console.warn('[Video Avatars] failed to schedule Popup cropper patch', e);
    }
}

// Add logging to identify who opens the popup (especially CROP)
function patchPopupLogging() {
    try {
        /** @type {any} */
        const w = window;
        if (w.__va_popup_logging_started) return; w.__va_popup_logging_started = true;
        let attempts = 0; const max = 40;
        const iv = setInterval(() => {
            attempts++;
            try {
                /** @type {any} */
                const PopupCtor = w['Popup'];
                if (!PopupCtor || !PopupCtor.prototype || PopupCtor.prototype.__va_show_patched) {
                    if (PopupCtor && PopupCtor.prototype && PopupCtor.prototype.__va_show_patched) clearInterval(iv);
                    if (attempts >= max) clearInterval(iv);
                    return;
                }
                const POPUP_TYPE = w['POPUP_TYPE'] || {};
                const origShow = PopupCtor.prototype.show;
                PopupCtor.prototype.show = function() {
                    return origShow.apply(this, arguments);
                };
                try { Object.defineProperty(PopupCtor.prototype, '__va_show_patched', { value: true }); } catch (_) { PopupCtor.prototype.__va_show_patched = true; }
                clearInterval(iv);
            } catch (e) {
                if (attempts >= max) {
                    console.warn('[Video Avatars] failed to patch Popup.show', e);
                    clearInterval(iv);
                }
            }
        }, 250);
    } catch (e) {
        console.warn('[Video Avatars] failed to schedule Popup logging patch', e);
    }
}

// Patch popup via ES module import, in case Popup class isn’t exposed on window
async function patchPopupViaModule() {
    try {
        /** @type {any} */
        const w = window;
        if (w.__va_popup_module_patched) return;
    // Try common public path
    // @ts-ignore - dynamic import URL not known to typechecker
    const mod = await import(new URL('/scripts/popup.js', location.href).href);
        const PopupCtor = mod && mod.Popup;
        const POPUP_TYPE = mod && mod.POPUP_TYPE;
        const POPUP_RESULT = mod && mod.POPUP_RESULT;
        if (!PopupCtor || !PopupCtor.prototype || !POPUP_TYPE) return;
        if (PopupCtor.prototype.__va_shimmed) return;

        const origShow = PopupCtor.prototype.show;
        PopupCtor.prototype.show = function() {
            try {
                const last = w.__va_last_avatar_file || null;
                const isVideo = last && (String(last.type || '').startsWith('video/') || /\.(webm|mp4|m4v|mov|ogg)$/i.test(String(last.name || '')));
                    if (this.type === POPUP_TYPE.CROP && isVideo) {
                    const previewEl = /** @type {HTMLImageElement} */ (document.getElementById('avatar_load_preview'));
                    const src = (previewEl && previewEl.src) ? previewEl.src : (this.cropImage || null);
                    return Promise.resolve(src || null);
                }
            } catch (_) { /* fall through */ }
            return origShow.apply(this, arguments);
        };

        const origComplete = PopupCtor.prototype.complete;
        PopupCtor.prototype.complete = async function(result) {
        try {
            // Popup.complete called
                if (this.type === POPUP_TYPE.CROP && result >= (POPUP_RESULT?.AFFIRMATIVE ?? 1)) {
                    const $img = window['jQuery'] ? window['jQuery'](this.cropImage) : null;
                    try {
                        const hasData = $img && typeof $img.data === 'function';
                        const cropper = hasData ? $img.data('cropper') : null;
                        const needsShim = !cropper || typeof cropper.getCroppedCanvas !== 'function' || !cropper.getCroppedCanvas();
                        if (needsShim) {
                            const imgEl = /** @type {HTMLImageElement} */ (this.cropImage);
                            const canvas = document.createElement('canvas');
                            const w2 = (imgEl && (imgEl.naturalWidth || imgEl.width)) || 256;
                            const h2 = (imgEl && (imgEl.naturalHeight || imgEl.height)) || 256;
                            canvas.width = w2; canvas.height = h2;
                            const ctx = canvas.getContext('2d');
                            if (ctx && imgEl) {
                                try { ctx.drawImage(imgEl, 0, 0, w2, h2); } catch (_) { /* ignore */ }
                            }
                            if (hasData) $img.data('cropper', { getCroppedCanvas: () => canvas });
                        }
                    } catch (_) { /* ignore */ }
                }
            } catch (_) { /* noop */ }
            return origComplete.apply(this, arguments);
        };

        try { Object.defineProperty(PopupCtor.prototype, '__va_shimmed', { value: true }); } catch (_) { PopupCtor.prototype.__va_shimmed = true; }
        w.__va_popup_module_patched = true;
    } catch (e) {
        // Silent: module path or environment may differ; window patch remains a fallback
    }
}
// Early bootstrap: attach critical hooks ASAP in case user selects a file before APP_READY
(() => {
    try {
        const sel = ['#add_avatar_button', '#group_avatar_button', '#avatar_upload_file', 'input.avatarUpload'].join(',');
        document.querySelectorAll(sel).forEach((el) => {
            if (!(el instanceof HTMLInputElement)) return;
            const acc = el.getAttribute('accept') || '';
            if (!/video\/\*/.test(acc)) {
                el.setAttribute('accept', acc ? acc + ',video/*' : 'image/*,video/*');
            }
        });
    } catch (_) { /* noop */ }
    try { installAvatarChangeInterceptor(); } catch (_) { /* noop */ }
    try { installReadAvatarLoadHook(); } catch (_) { /* noop */ }
    try { installEnsureImageFormatSupportedHook(); } catch (_) { /* noop */ }
    try { schedulePatchReadAvatarLoad(); } catch (_) { /* noop */ }
    try { patchPopupCropperSafety(); } catch (_) { /* noop */ }
    // Try to patch via module import too
    try { patchPopupViaModule(); } catch (_) { /* noop */ }
})();

/**
 * Ensure that when the core tries to normalize the avatar file before submit,
 * any video gets converted into a PNG still. This is a safety net in case
 * input replacement was bypassed earlier.
 */
function installEnsureImageFormatSupportedHook() {
    try {
        /** @type {any} */
        const g = window;
        if (g.__va_ensure_image_hook) return;
        let current = g.ensureImageFormatSupported;
        const wrap = (fn) => {
            if (typeof fn !== 'function') return fn;
            if (fn.__va_wrapped) return fn;
            /** @type {any} */
            const wrapped = async function(file) {
                try {
                    const isFile = (typeof File !== 'undefined') && (file instanceof File);
                    const type = isFile ? String(file.type || '').toLowerCase() : '';
                    const name = isFile ? String(file.name || '').toLowerCase() : '';
                    const isVideo = isFile && (type.startsWith('video/') || /\.(webm|mp4|m4v|mov|ogg)$/i.test(name));
                    if (isVideo) {
                        // ensureImageFormatSupported intercepted a video; converting to PNG still
                        const thumb = await generateVideoThumbnail(file);
                        if (thumb) {
                            const baseName = getCharacterBaseNameSafe() || (name.replace(/\.[^/.]+$/, '') || 'avatar');
                            const stillPng = await dataUrlToFile(thumb, baseName + '.png', 'image/png');
                            try {
                                const imgEl = document.getElementById('avatar_load_preview');
                                if (imgEl) imgEl.setAttribute('src', thumb);
                            } catch(_) {}
                            return stillPng;
                        }
                    }
                } catch (e) { console.warn('[Video Avatars] ensureImageFormatSupported hook failed', e); }
                // Fallback to original behavior
                // @ts-ignore
                return await fn.apply(this, arguments);
            };
            try { Object.defineProperty(wrapped, '__va_wrapped', { value: true }); } catch (_) { wrapped.__va_wrapped = true; }
            return wrapped;
        };
        if (typeof current === 'function') current = wrap(current);
        Object.defineProperty(g, 'ensureImageFormatSupported', {
            configurable: true,
            enumerable: false,
            get() { return current; },
            set(v) { current = wrap(v); },
        });
        g.__va_ensure_image_hook = true;
    } catch (e) {
        console.warn('[Video Avatars] failed to install ensureImageFormatSupported hook', e);
    }
}
