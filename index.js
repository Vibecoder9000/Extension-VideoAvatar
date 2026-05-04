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
    const PROBE_CACHE_MAX = 200;
    function cacheProbeResult(url, ok) {
        probeCache.set(url, ok);
        if (probeCache.size > PROBE_CACHE_MAX) {
            probeCache.delete(probeCache.keys().next().value);
        }
    }

    // Utility: try a HEAD or GET to see if a file exists
    async function urlExists(url) {
        try {
            const rec = probeCache.get(url);
            if (typeof rec === 'boolean') return rec;

            const method = settings.useHeadProbe ? 'HEAD' : 'GET';
            const res = await fetch(url, { method });
            cacheProbeResult(url, res.ok);
            return res.ok;
        } catch (err) {
            try { cacheProbeResult(url, false); } catch (_) {}
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

        const probed = await Promise.all(candidates.map(async (url) => {
            const ext = url.split('.').pop().toLowerCase();
            const ok = await urlExists(url);
            return ok ? { url, ext } : null;
        }));
        const match = probed.find(Boolean);
        if (match) {
            foundUrl = match.url;
            foundType = match.ext;
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
    const AVATAR_SELECTOR = [
        'img[src*="/avatars/"]', // direct persona path
        'img[src*="/characters/"]', // direct character path
        'img[src*="/thumbnail"][src*="type=avatar"]',
        'img[src*="/thumbnail"][src*="type=persona"]',
    ].join(',');

    function collectAvatarImages(root) {
        if (!root) return [];
        // Filter for typical static image types to avoid reprocessing already swapped items
        const list = root.querySelectorAll(AVATAR_SELECTOR);
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
                    // Skip nodes that don't contain any avatar images
                    if (!node.matches(AVATAR_SELECTOR) && !node.querySelector(AVATAR_SELECTOR)) continue;
                    upgradeAvatarsIn(node);
                    widenAvatarInputs(node);
                }
            } else if (m.type === 'attributes' && m.attributeName === 'src') {
                // Watch for src attribute changes on avatar images
                const target = m.target;
                if (target instanceof HTMLImageElement && target.id === 'avatar_load_preview') {
                    const src = target.getAttribute('src') || '';
                    // Only re-upgrade if src was changed back to a static image (PNG/JPG)
                    // Skip if it's already a webp or video or user images path
                    if (src && /\.(png|jpe?g|gif)$/i.test(src) && !/\.webp$/i.test(src)) {
                        // Character edit form avatar changed - clear upgrade flag and re-upgrade
                        delete target.dataset.stVideoAvatar;
                        upgradeOneImage(target);
                    }
                }
            }
        }
    });

    function startObservers() {
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
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
            widenAvatarInputs(document);
            installAvatarChangeInterceptor();
            await upgradeAvatarsIn(document);
            startObservers();
            patchPopupViaModule();
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
            // Listen for MESSAGE_SWIPED to re-upgrade avatars after a swipe.
            // updateMessageElement (in script.js:3411) resets the avatar img src to the
            // static character avatar during a swipe, clearing the WebP URL. The extension's
            // upgrade flag was still set, so subsequent scans skip it. Clear the flag
            // and re-upgrade the avatar in the swiped message only.
            if (event_types.MESSAGE_SWIPED) {
                eventSource.on(event_types.MESSAGE_SWIPED, (mesId) => {
                    setTimeout(() => {
                        const mesEl = document.querySelector(`.mes[mesid="${mesId}"]`);
                        if (!mesEl) return;
                        const avatars = mesEl.querySelectorAll(AVATAR_SELECTOR);
                        avatars.forEach(img => {
                            if (img instanceof HTMLImageElement) {
                                delete img.dataset.stVideoAvatar;
                            }
                        });
                        upgradeAvatarsIn(mesEl);
                    }, 50);
                });
            }

            // Listen for character editor opened to upgrade the avatar preview
            if (event_types.CHARACTER_EDITOR_OPENED) {
                eventSource.on(event_types.CHARACTER_EDITOR_OPENED, () => {
                    // Give ST a moment to set the src, then upgrade
                    setTimeout(() => {
                        const preview = document.getElementById('avatar_load_preview');
                        if (preview instanceof HTMLImageElement) {
                            delete preview.dataset.stVideoAvatar;
                            upgradeOneImage(preview);
                        }
                    }, 50);
                });
            }
            // Listen for persona changes to re-probe avatars
            if (event_types.PERSONA_CHANGED) {
                eventSource.on(event_types.PERSONA_CHANGED, () => {
                    setTimeout(() => upgradeAvatarsIn(document), 50);
                });
            }
            // Listen for persona created to upload cached companion webp
            if (event_types.PERSONA_CREATED) {
                eventSource.on(event_types.PERSONA_CREATED, async (data) => {
                    const pending = window['__va_pending_persona_webp'];
                    if (pending && data && data.avatarId) {
                        try {
                            const avatarId = String(data.avatarId).replace(/\.[^/.]+$/, '');
                            await uploadPersonaCompanionWebp(avatarId, pending);
                            showCompanionUploadedToast('Animated persona avatar uploaded');
                            delete window['__va_pending_persona_webp'];
                        } catch (e) {
                            console.warn('failed to upload persona companion on create', e);
                        }
                    }
                });
            }
            // Also do a small delayed pass in case APP_READY was already fired before we attached
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
            if (!isVideo) {
                return;
            }
            // Video selected: generate preview and stop core handler
            // CRITICAL: stop propagation BEFORE any await to prevent core handler from seeing the video file
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            try { /** @type {any} */ (window).__va_last_avatar_file = { name: file.name, type: file.type, size: file.size }; } catch (_) {}
            const thumb = await generateVideoThumbnail(file);
            const fallback = (window['default_avatar'] || '/img/ai4.png');
            const imgEl = document.getElementById('avatar_load_preview');
            if (imgEl && thumb) imgEl.setAttribute('src', thumb);
            else if (imgEl) imgEl.setAttribute('src', fallback);

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
                toast.warning('Click here to install the Video Background Loader extension', 'Video avatar uploads require a downloadable add-on', {
                    timeOut: 0,
                    extendedTimeOut: 0,
                    onclick: () => {
                        try {
                            const context = SillyTavern.getContext();
                            // openThirdPartyExtensionMenu should be available in the context
                            if (context && typeof context.openThirdPartyExtensionMenu === 'function') {
                                context.openThirdPartyExtensionMenu('https://github.com/SillyTavern/Extension-VideoBackgroundLoader');
                            } else {
                                // Fallback: try to open the URL directly
                                window.open('https://github.com/SillyTavern/Extension-VideoBackgroundLoader', '_blank');
                            }
                        } catch(err) {
                            console.error('[Video Avatars] Failed to open extension menu:', err);
                            // Last resort fallback
                            try {
                                window.open('https://github.com/SillyTavern/Extension-VideoBackgroundLoader', '_blank');
                            } catch(e) {}
                        }
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

        // Remove "Please wait" toast
        try { if (tMsg && typeof tMsg.remove === 'function') tMsg.remove(); } catch(_) {}

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

        if (isGroup) {
            // Re-dispatch change event so native handlers proceed (group/persona flows don’t use cropper)
            try {
                input.dataset.vaConverted = '1';
                const evt = new Event('change', { bubbles: true });
                input.dispatchEvent(evt);
                // clear the flag shortly after
                setTimeout(() => { try { delete input.dataset.vaConverted; } catch(_){} }, 0);
                // re-dispatched change event for group/persona after conversion
            } catch(_) {}
        } else if (isPersona) {
            // Directly upload the PNG thumbnail to /api/avatars/upload
            // (re-dispatch is unreliable; DataTransfer swaps often fail and video leaks through)
            const overwriteEl = document.getElementById('avatar_upload_overwrite');
            const overwriteName = overwriteEl && 'value' in overwriteEl ? String(overwriteEl.value || '') : '';
            try {
                // Re-create the PNG file from the already-generated thumbnail
                // If overwriteName already has an extension, strip it to avoid double .png
                const pngBaseName = overwriteName ? overwriteName.replace(/\.[^/.]+$/, '') : (file.name.replace(/\.[^/.]+$/, '') || 'avatar');
                const pngFile = await dataUrlToFile(thumbUrl, pngBaseName + '.png', 'image/png');
                const formData = new FormData();
                formData.append('avatar', pngFile);
                if (overwriteName) formData.append('overwrite_name', overwriteName);
                const csrfToken = await getCsrfTokenSafe();
                const resp = await fetch('/api/avatars/upload', {
                    method: 'POST',
                    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
                    body: formData,
                });
                if (!resp.ok) throw new Error('avatar upload failed: ' + resp.status);
                const data = await resp.json().catch(() => ({}));

                if (overwriteName) {
                    // Overwrite of existing persona: upload companion webp immediately
                    const avatarId = overwriteName.replace(/\.[^/.]+$/, '');
                    try { 
                        await uploadPersonaCompanionWebp(avatarId, convertedFile); 
                    } catch(e) { 
                    }
                    showCompanionUploadedToast('Animated persona avatar uploaded');
                    // Bust thumbnail cache so the new avatar shows immediately
                    try {
                        const bust = '/thumbnail?type=persona&file=' + encodeURIComponent(overwriteName) + '&t=' + Date.now();
                        await fetch(bust, { cache: 'reload' });
                    } catch(_) {}
                } else {
                    // New persona: cache companion webp for PERSONA_CREATED event
                    try { window['__va_pending_persona_webp'] = convertedFile; } catch(_) {}
                    // Trigger ST to refresh the avatar list and prompt persona creation
                    try {
                        const { getUserAvatars, delay } = await import(new URL('/scripts/personas.js', location.href).href);
                        await getUserAvatars();
                    } catch(_) {}
                }
            } catch (e) {
                console.warn('persona upload failed', e);
            }
        } else if (isChar) {

            // Character avatar: upload animated webp companion to user images folder under the character's base name
            try {
                if (baseName) {
                    await uploadCompanionWebp(baseName, convertedFile);
                    // uploaded animated webp companion to user images
                    // Notify user of success (persistent toast with click-to-reload)
                    try {
                        if (toast && toast.success) {
                            toast.success('Upload finished. Click to reload the page and apply the animated avatar.', 'Animated avatar uploaded', {
                                timeOut: 0,
                                extendedTimeOut: 0,
                                closeButton: true,
                                tapToDismiss: false,
                                onclick: () => { try { location.reload(); } catch (_) { /* ignore */ } },
                            });
                        }
                    } catch(_) {}
                } else {
                    // baseName not found; skipping webp companion upload (create flow?)
                }
            } catch (e) {
                console.warn('failed to upload webp companion', e);
                // Inform the user the upload failed
                try { const t = window['toastr']; if (t && t.error) t.error('Failed to upload animated avatar.'); } catch(_) {}
            }
            // character avatar handled; PNG still will be saved on Save click
        }
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
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(/** @type {string} */(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
    return dataUrl.split(',')[1];
}

/**
 * Get a CSRF token from global or fetch it from server.
 * Can be used by any upload function.
 */
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

async function uploadCompanionWebp(baseName, webpFile) {
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
    // Return result to caller; caller will handle user-facing notification
    return json;
    } catch (err) {
        // Show error toast on failure
        try { const toast = window['toastr']; if (toast && toast['error']) toast['error']('Failed to upload animated avatar.'); } catch(_) {}
        throw err;
    }
}


/**
 * Upload companion webp for a persona avatar via the /api/avatars/upload endpoint.
 * @param {string} avatarId Persona avatar id (filename without extension)
 * @param {File} webpFile The converted webp file
 */
async function uploadPersonaCompanionWebp(avatarId, webpFile) {
    // Upload companion webp via /api/images/upload to avoid polluting the avatar list
    // The file will be stored at /user/images/<avatarId>/<avatarId>.webp
    try {
        const b64 = await fileToBase64(webpFile);
        const csrf = await getCsrfTokenSafe();
        const payload = {
            image: b64,
            format: 'webp',
            ch_name: avatarId,
            filename: avatarId + '.webp',
        };
        const resp = await fetch('/api/images/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error('uploadPersonaCompanionWebp failed: ' + resp.status);
        return await resp.json().catch(() => ({}));
    } catch (err) {
        console.warn('[Video Avatars] Persona companion upload failed', err);
        throw err;
    }
}

/**
 * Show a success toast for companion avatar upload.
 * @param {string} [title='Animated avatar uploaded']
 */
function showCompanionUploadedToast(title) {
    try {
        const toast = window['toastr'];
        if (toast && toast.success) {
            toast.success('Upload finished. Click to reload the page and apply the animated avatar.', title || 'Animated avatar uploaded', {
                timeOut: 0,
                extendedTimeOut: 0,
                closeButton: true,
                tapToDismiss: false,
                onclick: () => { try { location.reload(); } catch (_) { /* ignore */ } },
            });
        }
    } catch(_) {}
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
    try { patchPopupViaModule(); } catch (_) { /* noop */ }
})();

