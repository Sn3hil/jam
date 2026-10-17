// ==UserScript==
// @name         Jam - YouTube & Spotify Bridge
// @namespace    jam
// @version      1.0.0
// @author       Kshiyo
// @description  Queue tracks to Jam from YouTube, YouTube Music, and Spotify
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM.getValue
// @grant        GM_setValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// @connect      www.youtube.com
// @connect      open.spotify.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

// IMPORTANT: Enforces Trusted Types CSP compatibility.
// This script uses ZERO innerHTML — all DOM is built via createElement/createElementNS.

(function() {
  'use strict';

  const IS_YTMUSIC = location.hostname === 'music.youtube.com';
  const IS_SPOTIFY = location.hostname === 'open.spotify.com';
  const WATCH_BUTTON_ID = 'jam-bridge-btn';
  const CARD_BUTTON_CLASS = 'jam-bridge-card-btn';
  const YTM_ROW_BUTTON_CLASS = 'jam-ytm-row-btn';
  const SPOTIFY_ROW_BUTTON_CLASS = 'jam-sp-row-btn';
  const MENU_ITEM_CLASS = 'jam-bridge-menu-item';
  const TOAST_ID = 'jam-bridge-toast';
  const STYLE_ID = 'jam-bridge-style';
  const DEFAULT_SERVER_URL = 'http://127.0.0.1:3000';
  const REQUEST_TIMEOUT_MS = 35000;

  /* ---------- Cross-manager helpers ---------- */

  async function gmGet(key, fallback) {
    try { if (typeof GM_getValue === 'function') return GM_getValue(key, fallback); } catch (e) { console.error('[Jam-Bridge]', e); }
    try {
      if (typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function') {
        const v = await GM.getValue(key, fallback);
        return v === undefined ? fallback : v;
      }
    } catch (e) { console.error('[Jam-Bridge]', e); }
    return fallback;
  }

  async function gmSet(key, value) {
    try { if (typeof GM_setValue === 'function') { GM_setValue(key, value); return; } } catch (e) { console.error('[Jam-Bridge]', e); }
    try { if (typeof GM !== 'undefined' && GM && typeof GM.setValue === 'function') await GM.setValue(key, value); } catch (e) { console.error('[Jam-Bridge]', e); }
  }

  function gmRegisterMenuCommand(label, handler) {
    try { if (typeof GM_registerMenuCommand === 'function') { GM_registerMenuCommand(label, handler); return; } } catch (e) { console.error('[Jam-Bridge]', e); }
    try { if (typeof GM !== 'undefined' && GM && typeof GM.registerMenuCommand === 'function') GM.registerMenuCommand(label, handler); } catch (e) { console.error('[Jam-Bridge]', e); }
  }

  function gmRequest(details) {
    try { if (typeof GM_xmlhttpRequest === 'function') { GM_xmlhttpRequest(details); return; } } catch (e) { console.error('[Jam-Bridge]', e); }
    try { if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') GM.xmlHttpRequest(details); } catch (e) { console.error('[Jam-Bridge]', e); }
  }

  /* ---------- Settings ---------- */

  const settings = { serverUrl: DEFAULT_SERVER_URL, apiToken: '', jamUsername: '' };

  async function loadSettings() {
    try {
      settings.serverUrl = String(await gmGet('serverUrl', DEFAULT_SERVER_URL) || DEFAULT_SERVER_URL).replace(/\/+$/, '');
      settings.apiToken = String(await gmGet('apiToken', '') || '');
      settings.jamUsername = String(await gmGet('jamUsername', '') || '');
    } catch (e) { console.error('[Jam-Bridge] loadSettings error:', e); }
  }

  try {
    gmRegisterMenuCommand('Set Jam server URL', async () => {
      const v = prompt('Jam API URL (e.g. http://127.0.0.1:3000 or your tunnel URL)', settings.serverUrl);
      if (v && v.trim()) {
        settings.serverUrl = v.trim().replace(/\/+$/, '');
        await gmSet('serverUrl', settings.serverUrl);
        showToast('Jam server URL saved', 3000);
      }
    });
    gmRegisterMenuCommand('Set Jam API token', async () => {
      const v = prompt("API token from Jam's .env (API_TOKEN)", settings.apiToken);
      if (v !== null) {
        settings.apiToken = v.trim();
        await gmSet('apiToken', settings.apiToken);
        showToast('Jam API token saved', 3000);
      }
    });
    gmRegisterMenuCommand('Set Jam username', async () => {
      const v = prompt('Your Jam username (required to queue songs)', settings.jamUsername);
      if (v !== null) {
        settings.jamUsername = v.trim();
        await gmSet('jamUsername', settings.jamUsername);
        showToast(settings.jamUsername ? 'Jam username set to: ' + settings.jamUsername : 'Jam username cleared', 3000);
      }
    });
  } catch (e) { console.error('[Jam-Bridge] Menu command error:', e); }

  loadSettings();

  /* ---------- SVG icon builder (pure DOM, no innerHTML) ---------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Musical note icon (Material Design music_note)
  const MUSIC_NOTE_PATH = 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z';
  const CHECK_PATH = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
  const CLOSE_PATH = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

  function createSvgIcon(pathData, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 24));
    svg.setAttribute('height', String(size || 24));
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'pointer-events:none;display:block;width:100%;height:100%;';

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);

    return svg;
  }

  function createSpinnerIcon(size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 24));
    svg.setAttribute('height', String(size || 24));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'pointer-events:none;display:block;width:100%;height:100%;animation:jam-spin .9s linear infinite;';

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('stroke-dasharray', '40 17');
    svg.appendChild(circle);

    return svg;
  }

  /* ---------- Styles ---------- */

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    const bottomOffset = (IS_YTMUSIC || IS_SPOTIFY) ? '96px' : '24px';
    s.textContent =
      '#' + TOAST_ID + '{position:fixed;left:24px;bottom:' + bottomOffset + ';z-index:2147483647;max-width:480px;padding:12px 16px;border-radius:8px;background:#0f0f0f;color:#fff;font:14px "Roboto","Arial",sans-serif;opacity:0;transform:translateY(8px);transition:opacity .15s,transform .15s;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.4)}' +
      '#' + TOAST_ID + '.jam-show{opacity:1;transform:translateY(0)}' +
      '.' + CARD_BUTTON_CLASS + '{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:26px;padding:0 10px;margin-top:6px;margin-right:36px;flex-shrink:0;align-self:flex-start;border:none;border-radius:13px;cursor:pointer;font:500 12px "YouTube Sans","Roboto","Arial",sans-serif;white-space:nowrap;color:var(--yt-spec-text-primary,#f1f1f1);background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.14));transition:background .15s,color .15s,transform .1s;position:relative;z-index:5;width:fit-content}' +
      '.' + CARD_BUTTON_CLASS + ':hover{background:var(--yt-spec-button-chip-background-hover,rgba(255,255,255,0.25))}' +
      '.' + CARD_BUTTON_CLASS + '.' + YTM_ROW_BUTTON_CLASS + '{margin:0 8px;align-self:center}' +
      '.' + CARD_BUTTON_CLASS + '.' + SPOTIFY_ROW_BUTTON_CLASS + '{margin:0 8px 0 0; padding:0; width:28px; height:28px; border-radius:50%; align-self:center; background:transparent; color:#b3b3b3}' +
      '.' + CARD_BUTTON_CLASS + '.' + SPOTIFY_ROW_BUTTON_CLASS + ':hover{background:rgba(255,255,255,0.1); color:#1ed760; transform:scale(1.06)}' +
      '[data-testid="tracklist-row"] [role="gridcell"]:last-child{overflow:visible!important}' +
      '[data-testid="tracklist-row"] [role="gridcell"]:last-child > *{flex-shrink:0!important}' +
      '@keyframes jam-spin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- Toast ---------- */

  let toastEl = null, toastTimer = null;
  function showToast(msg, ms) {
    if (!document.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement('div');
      toastEl.id = TOAST_ID;
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('jam-show');
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(function() { toastEl.classList.remove('jam-show'); }, ms);
  }

  /* ---------- Visibility Helper ---------- */

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /* ---------- Spotify -> YouTube Search Resolver ---------- */

  const ytSearchCache = new Map();

  function searchYouTubeVideoId(query) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return Promise.resolve(null);
    if (ytSearchCache.has(cleanQuery)) return Promise.resolve(ytSearchCache.get(cleanQuery));

    return new Promise(function(resolve) {
      gmRequest({
        method: 'GET',
        url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(cleanQuery + ' official audio') + '&hl=en',
        headers: { 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 15000,
        onload: function(r) {
          if (r.status === 200 && r.responseText) {
            var m = r.responseText.match(/"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (!m) m = r.responseText.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (m && m[1]) {
              ytSearchCache.set(cleanQuery, m[1]);
              resolve(m[1]);
              return;
            }
          }
          resolve(null);
        },
        onerror: function() { resolve(null); },
        ontimeout: function() { resolve(null); },
      });
    });
  }

  function fetchSpotifyTrackTitleFromOembed(trackUrl) {
    return new Promise(function(resolve) {
      gmRequest({
        method: 'GET',
        url: 'https://open.spotify.com/oembed?url=' + encodeURIComponent(trackUrl),
        timeout: 10000,
        onload: function(r) {
          try {
            var data = JSON.parse(r.responseText);
            if (data && data.title) {
              resolve(data.title);
              return;
            }
          } catch (e) { console.error('[Jam-Bridge] OEmbed parse error:', e); }
          resolve(null);
        },
        onerror: function() { resolve(null); },
        ontimeout: function() { resolve(null); },
      });
    });
  }

  /* ---------- Jam API ---------- */

  function sendPlayRequest(videoIdOrQuery) {
    return new Promise(function(resolve) {
      Promise.resolve(videoIdOrQuery).then(function(target) {
        if (!target) {
          resolve({ ok: false, message: 'Could not resolve track' });
          return;
        }
        var resolveIdPromise = target.startsWith('ytsearch:')
          ? searchYouTubeVideoId(target.slice('ytsearch:'.length))
          : Promise.resolve(target);

        resolveIdPromise.then(function(videoId) {
          if (!videoId) {
            resolve({ ok: false, message: 'No matching YouTube track found' });
            return;
          }

          if (!settings.jamUsername) {
            resolve({ ok: false, message: 'Jam username not set — configure in userscript menu' });
            return;
          }

          var bodyPayload = {
            url: 'https://www.youtube.com/watch?v=' + videoId,
            user: settings.jamUsername,
          };
          var reqHeaders = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + settings.apiToken,
          };

          gmRequest({
            method: 'POST',
            url: settings.serverUrl + '/api/play',
            headers: reqHeaders,
            data: JSON.stringify(bodyPayload),
            timeout: REQUEST_TIMEOUT_MS,
            onload: function(r) {
              var p = {};
              try { p = JSON.parse(r.responseText); } catch (e) { console.error('[Jam-Bridge] Response parse error:', e); }
              if (r.status === 200) {
                resolve({ ok: true, payload: p });
              } else if (r.status === 401) {
                resolve({ ok: false, message: 'Unauthorized — check Jam API token' });
              } else if (r.status === 404) {
                resolve({ ok: false, message: p.error?.message || 'User does not exist in Jam' });
              } else if (r.status === 409) {
                resolve({ ok: false, message: p.error?.message || 'Cannot queue (not in room or duplicate)' });
              } else {
                resolve({ ok: false, message: p.error?.message || 'Server error (' + r.status + ')' });
              }
            },
            onerror: function() { resolve({ ok: false, message: 'Jam server unreachable — is it running?' }); },
            ontimeout: function() { resolve({ ok: false, message: 'Request timed out' }); },
          });
        });
      });
    });
  }

  function handleListenRequest(videoIdOrQuery) {
    if (!settings.apiToken) return showToast('No API token — set it in userscript menu', 6000);
    if (!settings.jamUsername) return showToast('No Jam username — set it in userscript menu', 6000);
    showToast('Queueing in Jam...');
    sendPlayRequest(videoIdOrQuery).then(function(r) {
      if (!r.ok) return showToast(r.message, 6000);
      var title = (r.payload && r.payload.item && r.payload.item.title) ? (' "' + r.payload.item.title + '"') : '';
      showToast('Queued in Jam!' + title, 4000);
    });
  }

  function triggerButtonAction(btn, iconWrap, label, iconSize, getTargetFn) {
    if (btn.disabled) return;
    var target = getTargetFn();
    if (!target) {
      if (label) {
        label.textContent = 'Error';
        setTimeout(function() { label.textContent = 'Jam'; }, 3000);
      } else {
        showToast('Could not resolve track', 3000);
      }
      return;
    }
    if (!settings.apiToken) {
      showToast('No API token — set it in userscript menu', 6000);
      return;
    }
    if (!settings.jamUsername) {
      showToast('No Jam username — set it in userscript menu', 6000);
      return;
    }
    btn.disabled = true;
    btn.style.opacity = '0.6';
    if (label) label.textContent = '...';

    iconWrap.textContent = '';
    iconWrap.appendChild(createSpinnerIcon(iconSize));

    sendPlayRequest(target).then(function(r) {
      btn.disabled = false;
      btn.style.opacity = '';
      iconWrap.textContent = '';

      if (!r.ok) {
        iconWrap.appendChild(createSvgIcon(CLOSE_PATH, iconSize));
        if (label) label.textContent = 'Failed';
        showToast(r.message, 6000);
      } else {
        iconWrap.appendChild(createSvgIcon(CHECK_PATH, iconSize));
        if (label) label.textContent = 'Queued';
        var title = (r.payload && r.payload.item && r.payload.item.title) ? (' "' + r.payload.item.title + '"') : '';
        showToast('Queued in Jam!' + title, 4000);
      }
      setTimeout(function() {
        if (btn.isConnected) {
          if (label) label.textContent = 'Jam';
          iconWrap.textContent = '';
          iconWrap.appendChild(createSvgIcon(MUSIC_NOTE_PATH, iconSize));
        }
      }, 4000);
    });
  }

  /* ---------- Spotify Helpers ---------- */

  function getSpotifyRowQuery(row) {
    if (!row) return null;
    var titleEl =
      row.querySelector('[data-testid="internal-track-link"] div') ||
      row.querySelector('[data-testid="internal-track-link"]') ||
      row.querySelector('a[href*="/track/"]');
    var title = titleEl ? (titleEl.textContent || '').trim() : '';

    var artistLinks = row.querySelectorAll('a[href*="/artist/"]');
    var artists = [];
    for (var i = 0; i < artistLinks.length; i++) {
      var aText = (artistLinks[i].textContent || '').trim();
      if (aText && artists.indexOf(aText) === -1) artists.push(aText);
    }

    if (artists.length === 0) {
      var pageArtist = document.querySelector(
        '[data-testid="creator-link"], main a[href*="/artist/"]'
      );
      if (pageArtist) {
        var paText = (pageArtist.textContent || '').trim();
        if (paText) artists.push(paText);
      }
    }

    if (title && artists.length > 0) {
      return 'ytsearch:' + artists.join(' ') + ' - ' + title;
    }
    if (title) {
      return 'ytsearch:' + title;
    }
    return null;
  }

  function getSpotifyNowPlayingQuery() {
    var npWidget = document.querySelector(
      '[data-testid="now-playing-widget"], footer [data-testid="context-item-info-title"]'
    );
    var titleEl = document.querySelector('[data-testid="context-item-info-title"]');
    var artistEls = document.querySelectorAll('[data-testid="context-item-info-subtitles"] a, [data-testid="context-item-info-artist"]');

    var title = titleEl ? (titleEl.textContent || '').trim() : '';
    var artists = [];
    for (var i = 0; i < artistEls.length; i++) {
      var t = (artistEls[i].textContent || '').trim();
      if (t && artists.indexOf(t) === -1) artists.push(t);
    }

    if (title) {
      return 'ytsearch:' + (artists.length ? artists.join(' ') + ' - ' : '') + title;
    }

    if (location.pathname.startsWith('/track/')) {
      var h1 = document.querySelector('main h1');
      var creator = document.querySelector('[data-testid="creator-link"], main a[href*="/artist/"]');
      if (h1 && h1.textContent) {
        var cName = creator ? (creator.textContent || '').trim() + ' - ' : '';
        return 'ytsearch:' + cName + h1.textContent.trim();
      }
      return fetchSpotifyTrackTitleFromOembed(location.href).then(function(oTitle) {
        return oTitle ? 'ytsearch:' + oTitle : null;
      });
    }

    if (npWidget) {
      var aria = npWidget.getAttribute('aria-label') || '';
      if (aria) return 'ytsearch:' + aria.replace(/^Now playing:\s*/i, '');
    }

    return null;
  }

  /* ---------- Video ID helpers ---------- */

  var CARD_SELECTOR = [
    // Regular YouTube
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-rich-item-renderer',
    // YouTube Music
    'ytmusic-responsive-list-item-renderer',
    'ytmusic-two-row-item-renderer',
    'ytmusic-player-queue-item',
    'ytmusic-card-shelf-renderer .main-card-content-container',
    // Spotify Web Player
    '[data-testid="tracklist-row"]',
  ].join(', ');

  function extractVideoIdFromLink(link) {
    try {
      var href = link.getAttribute('href') || link.href;
      if (!href) return null;
      var u = new URL(href, location.origin);
      var v = u.searchParams.get('v');
      if (v) return v;
      var m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
    } catch (e) { console.error('[Jam-Bridge]', e); }
    return null;
  }

  function extractVideoIdFromPolymer(el) {
    try {
      var raw = el.wrappedJSObject || el;
      var data =
        raw.data ||
        (raw.__data && raw.__data.data) ||
        (raw.polymerController && raw.polymerController.data) ||
        (raw.inst && raw.inst.data);
      if (!data) {
        if (raw.currentItem && raw.currentItem.videoId) return raw.currentItem.videoId;
        if (typeof raw.getPlayerApi === 'function') {
          var vd = raw.getPlayerApi().getVideoData();
          if (vd && vd.video_id) return vd.video_id;
        }
        return null;
      }
      if (typeof data.videoId === 'string' && data.videoId) return data.videoId;
      if (data.playlistItemData && data.playlistItemData.videoId) {
        return data.playlistItemData.videoId;
      }
      if (data.playlistPanelVideoRenderer && data.playlistPanelVideoRenderer.videoId) {
        return data.playlistPanelVideoRenderer.videoId;
      }
      if (
        data.playlistPanelVideoWrapperRenderer &&
        data.playlistPanelVideoWrapperRenderer.primaryRenderer &&
        data.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer
      ) {
        return data.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.videoId;
      }
      if (
        data.navigationEndpoint &&
        data.navigationEndpoint.watchEndpoint &&
        data.navigationEndpoint.watchEndpoint.videoId
      ) {
        return data.navigationEndpoint.watchEndpoint.videoId;
      }
      if (
        data.playNavigationEndpoint &&
        data.playNavigationEndpoint.watchEndpoint &&
        data.playNavigationEndpoint.watchEndpoint.videoId
      ) {
        return data.playNavigationEndpoint.watchEndpoint.videoId;
      }
      if (
        data.overlay &&
        data.overlay.musicItemThumbnailOverlayRenderer &&
        data.overlay.musicItemThumbnailOverlayRenderer.content &&
        data.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer &&
        data.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint &&
        data.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint
      ) {
        return data.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId;
      }
    } catch (e) { console.error('[Jam-Bridge]', e); }
    return null;
  }

  function getCardVideoId(card) {
    if (IS_SPOTIFY) {
      return getSpotifyRowQuery(card);
    }
    if (card.tagName && card.tagName.toLowerCase() === 'a') {
      var directVid = extractVideoIdFromLink(card);
      if (directVid) return directVid;
    }
    var links = card.querySelectorAll('a[href*="watch?v="], a[href*="/shorts/"]');
    for (var i = 0; i < links.length; i++) {
      var vid = extractVideoIdFromLink(links[i]);
      if (vid) return vid;
    }
    var polyVid = extractVideoIdFromPolymer(card);
    if (polyVid) return polyVid;

    var imgs = card.querySelectorAll('img[src*="/vi/"], img[src*="/vi_webp/"]');
    for (var j = 0; j < imgs.length; j++) {
      var src = imgs[j].getAttribute('src') || '';
      var m = src.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
      if (m) return m[1];
    }
    return null;
  }

  function getActivePageVideoId() {
    if (IS_SPOTIFY) {
      return getSpotifyNowPlayingQuery();
    }
    try {
      var u = new URL(location.href);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
      if (u.pathname.startsWith('/watch')) {
        var v = u.searchParams.get('v');
        if (v) return v;
      }
      var m = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];

      var playerLink = document.querySelector(
        '#movie_player a.ytp-title-link[href*="watch?v="], ytmusic-player-bar a[href*="watch?v="]'
      );
      if (playerLink) {
        var pVid = extractVideoIdFromLink(playerLink);
        if (pVid) return pVid;
      }
      var playerBar = document.querySelector('ytmusic-player-bar');
      if (playerBar) {
        var pbVid = extractVideoIdFromPolymer(playerBar) || getCardVideoId(playerBar);
        if (pbVid) return pbVid;
      }
    } catch (e) { console.error('[Jam-Bridge]', e); }
    return null;
  }

  function findVideoIdNearElement(el) {
    var current = el;
    for (var depth = 0; depth < 12 && current && current !== document.documentElement; depth++) {
      if (current.querySelectorAll) {
        var vid = getCardVideoId(current);
        if (vid) return vid;
      }
      var root = current.getRootNode();
      if (root instanceof ShadowRoot) {
        current = root.host;
      } else {
        current = current.parentElement;
      }
    }
    return null;
  }

  /* ====================================================================
   * 1. VIDEO & SONG LISTING CARDS BUTTON
   * ==================================================================== */

  function isYtmHorizontalRow(card) {
    var tag = card.tagName ? card.tagName.toLowerCase() : '';
    return (
      tag === 'ytmusic-responsive-list-item-renderer' ||
      tag === 'ytmusic-player-queue-item'
    );
  }

  function isSpotifyRow(card) {
    return IS_SPOTIFY && card.getAttribute && card.getAttribute('data-testid') === 'tracklist-row';
  }

  function createCardButton(card, initialVideoId) {
    var btn = document.createElement('button');
    btn.type = 'button';
    var spRow = isSpotifyRow(card);
    var extraClass = '';
    if (isYtmHorizontalRow(card)) extraClass = ' ' + YTM_ROW_BUTTON_CLASS;
    else if (spRow) extraClass = ' ' + SPOTIFY_ROW_BUTTON_CLASS;

    btn.className = CARD_BUTTON_CLASS + extraClass;
    btn.dataset.videoId = initialVideoId;
    btn.title = 'Jam this song';
    btn.setAttribute('aria-label', 'Jam this song');

    var iconSize = 16;
    var iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'width:' + iconSize + 'px;height:' + iconSize + 'px;display:flex;align-items:center;justify-content:center;';
    iconWrap.appendChild(createSvgIcon(MUSIC_NOTE_PATH, iconSize));
    btn.appendChild(iconWrap);

    var label = null;
    if (!spRow) {
      label = document.createElement('span');
      label.textContent = 'Jam';
      btn.appendChild(label);
    }

    var stopEvent = function(e) { e.stopPropagation(); };
    btn.addEventListener('mousedown', stopEvent);
    btn.addEventListener('mouseup', stopEvent);
    btn.addEventListener('pointerdown', stopEvent);
    btn.addEventListener('pointerup', stopEvent);
    btn.addEventListener('dblclick', stopEvent);

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      triggerButtonAction(btn, iconWrap, label, iconSize, function() {
        return btn.dataset.videoId || getCardVideoId(card);
      });
    });

    return btn;
  }

  function findCardMetadataHost(card) {
    if (isSpotifyRow(card)) {
      var gridCells = card.querySelectorAll('[role="gridcell"]');
      if (gridCells.length > 0) {
        return gridCells[gridCells.length - 1];
      }
      return card;
    }

    var tag = card.tagName ? card.tagName.toLowerCase() : '';

    if (tag === 'ytmusic-responsive-list-item-renderer' || tag === 'ytmusic-player-queue-item') {
      return card;
    }

    if (tag === 'ytmusic-two-row-item-renderer') {
      return card.querySelector('.details') || card;
    }

    var lockupMeta = card.querySelector(
      'yt-lockup-metadata-view-model, .shortsLockupViewModelHostMetadata'
    );
    if (lockupMeta) {
      var heading = lockupMeta.querySelector('h3, h4');
      if (heading && heading.parentElement && heading.parentElement !== lockupMeta) {
        return heading.parentElement;
      }
      var contentMeta = lockupMeta.querySelector('yt-content-metadata-view-model');
      if (contentMeta && contentMeta.parentElement) {
        var textCol = contentMeta.parentElement.parentElement;
        if (textCol && textCol !== lockupMeta && lockupMeta.contains(textCol)) {
          return textCol;
        }
        if (contentMeta.parentElement !== lockupMeta) {
          return contentMeta.parentElement;
        }
      }
    }

    var selectors = [
      '.ytLockupMetadataViewModelTextContainer',
      '.yt-lockup-metadata-view-model__text-container',
      '.yt-lockup-metadata-view-model-wiz__text-container',
      '.shortsLockupViewModelHostMetadata',
      '.buttons-container',
      '.metadata-container',
      '#meta',
      '#metadata',
      'yt-lockup-metadata-view-model',
      '#details',
      '.details',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var found = card.querySelector(selectors[i]);
      if (found) return found;
    }
    return card;
  }

  function insertCardButtonIntoHost(card, host, btn) {
    if (isSpotifyRow(card)) {
      host.insertBefore(btn, host.firstChild);
      return;
    }
    if (isYtmHorizontalRow(card) && host === card) {
      var anchor =
        card.querySelector(':scope > ytmusic-menu-renderer') ||
        card.querySelector(':scope > .fixed-columns') ||
        card.querySelector(':scope > .duration');
      if (anchor) {
        card.insertBefore(btn, anchor);
        return;
      }
    }
    host.appendChild(btn);
  }

  function injectCardButtons() {
    var cards = document.querySelectorAll(CARD_SELECTOR);
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];

      if (
        card.tagName.toLowerCase() === 'ytd-rich-item-renderer' &&
        card.querySelector('yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-rich-grid-media')
      ) {
        continue;
      }

      var videoId = getCardVideoId(card);
      if (!videoId) continue;

      var host = findCardMetadataHost(card);
      if (!host) continue;

      var existingBtn = card.querySelector('.' + CARD_BUTTON_CLASS);
      if (existingBtn) {
        if (existingBtn.dataset.videoId !== videoId) {
          existingBtn.dataset.videoId = videoId;
        }
        if (existingBtn.parentElement !== host) {
          insertCardButtonIntoHost(card, host, existingBtn);
        }
        continue;
      }

      insertCardButtonIntoHost(card, host, createCardButton(card, videoId));
    }
  }

  /* ====================================================================
   * 2. WATCH, SHORTS, YT MUSIC & SPOTIFY PLAYER BAR BUTTON
   * ==================================================================== */

  function findVisibleWatchButton() {
    var existing = document.querySelectorAll('#' + WATCH_BUTTON_ID);
    for (var i = 0; i < existing.length; i++) {
      if (isVisible(existing[i])) return existing[i];
      existing[i].remove();
    }
    var renderers = document.querySelectorAll('ytd-menu-renderer, ytmusic-menu-renderer');
    for (var j = 0; j < renderers.length; j++) {
      if (renderers[j].shadowRoot) {
        var shadowBtn = renderers[j].shadowRoot.querySelector('#' + WATCH_BUTTON_ID);
        if (shadowBtn) {
          if (isVisible(shadowBtn)) return shadowBtn;
          shadowBtn.remove();
        }
      }
    }
    return null;
  }

  function findVisibleActionBar() {
    if (IS_SPOTIFY) {
      if (location.pathname.startsWith('/track/')) {
        var trackPageBar = document.querySelector('[data-testid="action-bar-row"]');
        if (trackPageBar && isVisible(trackPageBar)) return trackPageBar;
      }
      var spSelectors = [
        '[data-testid="now-playing-widget"]',
        'footer [data-testid="control-button-npv"]',
      ];
      for (var sp = 0; sp < spSelectors.length; sp++) {
        var spNode = document.querySelector(spSelectors[sp]);
        if (spNode && isVisible(spNode)) {
          return spNode.tagName.toLowerCase() === 'button' ? spNode.parentElement : spNode;
        }
      }
      return null;
    }

    if (IS_YTMUSIC) {
      var ytmSelectors = [
        'ytmusic-player-bar .middle-controls-buttons',
        'ytmusic-player-bar .middle-controls',
        'ytmusic-player-bar .right-controls-buttons',
      ];
      for (var m = 0; m < ytmSelectors.length; m++) {
        var ytmBar = document.querySelector(ytmSelectors[m]);
        if (ytmBar && isVisible(ytmBar)) return ytmBar;
      }
      return null;
    }

    if (location.pathname.startsWith('/shorts/')) {
      var shortsBars = document.querySelectorAll(
        'ytd-reel-video-renderer[is-active] #actions, ytd-reel-player-overlay-renderer #actions'
      );
      for (var s = 0; s < shortsBars.length; s++) {
        if (isVisible(shortsBars[s])) return shortsBars[s];
      }
    }

    var shadowCandidates = document.querySelectorAll(
      'ytd-watch-metadata ytd-menu-renderer, #above-the-fold ytd-menu-renderer'
    );
    for (var i = 0; i < shadowCandidates.length; i++) {
      var mr = shadowCandidates[i];
      if (!isVisible(mr)) continue;
      if (mr.shadowRoot) {
        var topLevel = mr.shadowRoot.querySelector('#top-level-buttons-computed');
        if (topLevel && isVisible(topLevel)) return topLevel;
      }
      var lightTop = mr.querySelector('#top-level-buttons-computed');
      if (lightTop && isVisible(lightTop)) return lightTop;
    }

    var selectors = [
      'ytd-watch-metadata #top-level-buttons-computed',
      '#above-the-fold #top-level-buttons-computed',
      'ytd-watch-metadata #flexible-item-buttons',
      'ytd-watch-metadata #actions-inner #menu',
      'ytd-watch-metadata #actions-inner',
      '#above-the-fold #actions-inner',
      'ytd-video-primary-info-renderer #top-level-buttons-computed',
    ];
    for (var j = 0; j < selectors.length; j++) {
      var nodes = document.querySelectorAll(selectors[j]);
      for (var k = 0; k < nodes.length; k++) {
        if (isVisible(nodes[k])) return nodes[k];
      }
    }
    return null;
  }

  function createWatchButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = WATCH_BUTTON_ID;
    btn.title = 'Jam this song';
    btn.setAttribute('aria-label', 'Jam this song');

    if (IS_SPOTIFY) {
      btn.style.cssText =
        'display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;margin-left:8px;' +
        'border:none;border-radius:50%;cursor:pointer;color:#b3b3b3;flex-shrink:0;background:transparent;transition:color .15s,background .15s,transform .1s;';
    } else {
      btn.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;margin-left:8px;' +
        'border:none;border-radius:16px;cursor:pointer;font:500 13px "YouTube Sans","Roboto","Arial",sans-serif;' +
        'white-space:nowrap;color:var(--yt-spec-text-primary,#fff);flex-shrink:0;' +
        'background:var(--yt-spec-badge-chip-background,rgba(255,255,255,0.14));';
    }

    var iconWrap = document.createElement('span');
    iconWrap.style.cssText = 'width:18px;height:18px;display:flex;align-items:center;justify-content:center;';
    iconWrap.appendChild(createSvgIcon(MUSIC_NOTE_PATH, 18));
    btn.appendChild(iconWrap);

    var label = null;
    if (!IS_SPOTIFY) {
      label = document.createElement('span');
      label.textContent = 'Jam';
      btn.appendChild(label);
    }

    btn.addEventListener('mouseover', function() {
      if (IS_SPOTIFY) {
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.color = '#1ed760';
      } else {
        btn.style.background = 'var(--yt-spec-button-chip-background-hover,rgba(255,255,255,0.25))';
      }
    });
    btn.addEventListener('mouseout', function() {
      if (IS_SPOTIFY) {
        btn.style.background = 'transparent';
        btn.style.color = '#b3b3b3';
      } else {
        btn.style.background = 'var(--yt-spec-badge-chip-background,rgba(255,255,255,0.14))';
      }
    });

    var stopEvent = function(e) { e.stopPropagation(); };
    btn.addEventListener('mousedown', stopEvent);
    btn.addEventListener('mouseup', stopEvent);
    btn.addEventListener('pointerdown', stopEvent);
    btn.addEventListener('pointerup', stopEvent);

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      triggerButtonAction(btn, iconWrap, label, 18, getActivePageVideoId);
    });

    return btn;
  }

  function injectWatchButton() {
    var shouldInject =
      IS_YTMUSIC ||
      IS_SPOTIFY ||
      location.pathname.startsWith('/watch') ||
      location.pathname.startsWith('/shorts/');
    if (!shouldInject) return;
    if (findVisibleWatchButton()) return;

    var bar = findVisibleActionBar();
    if (bar) {
      bar.appendChild(createWatchButton());
    }
  }

  /* ====================================================================
   * 3. CONTEXT MENU INJECTION (YouTube & YouTube Music)
   * ==================================================================== */

  var pendingVideoId = null;
  var menuPollTimer = null;

  function closeDropdown(el) {
    try {
      var dd = el.closest('tp-yt-iron-dropdown');
      if (dd && typeof dd.close === 'function') dd.close();
      else if (dd) dd.style.display = 'none';
    } catch (e) { console.error('[Jam-Bridge]', e); }
  }

  function buildMenuItem(videoId) {
    var row = document.createElement('div');
    row.className = MENU_ITEM_CLASS;
    row.setAttribute('role', 'menuitem');
    row.tabIndex = 0;
    row.style.cssText =
      'display:flex;align-items:center;gap:16px;padding:8px 16px;cursor:pointer;' +
      'font:400 14px/20px "Roboto","Arial",sans-serif;color:var(--yt-spec-text-primary,#fff);' +
      'min-height:36px;box-sizing:border-box;user-select:none;';

    var iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'width:24px;height:24px;flex:none;display:flex;align-items:center;justify-content:center;';
    iconWrap.appendChild(createSvgIcon(MUSIC_NOTE_PATH, 24));

    var label = document.createElement('span');
    label.textContent = 'Jam';

    row.appendChild(iconWrap);
    row.appendChild(label);

    row.addEventListener('mouseover', function() {
      row.style.backgroundColor = 'var(--yt-spec-10-percent-layer,rgba(255,255,255,0.1))';
    });
    row.addEventListener('mouseout', function() {
      row.style.backgroundColor = '';
    });

    row.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown(row);
      handleListenRequest(videoId);
    });
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
    });

    return row;
  }

  function bumpMaxHeight(el) {
    var current = el;
    for (var i = 0; i < 6 && current; i++) {
      var mh = current.style && current.style.maxHeight;
      if (mh) {
        var match = mh.match(/^(\d+(?:\.\d+)?)\s*px$/);
        if (match) current.style.maxHeight = (parseFloat(match[1]) + 48) + 'px';
      }
      current = current.parentElement;
    }
  }

  function tryInjectMenu() {
    if (!pendingVideoId) return false;

    var dropdowns = document.querySelectorAll('tp-yt-iron-dropdown');
    for (var i = 0; i < dropdowns.length; i++) {
      var dd = dropdowns[i];
      if (dd.getAttribute('aria-hidden') === 'true' || !isVisible(dd)) continue;

      var container =
        dd.querySelector('tp-yt-paper-listbox#items') ||
        dd.querySelector('tp-yt-paper-listbox') ||
        dd.querySelector('yt-list-view-model[role="menu"]') ||
        dd.querySelector('yt-list-view-model') ||
        dd.querySelector('#items') ||
        dd.querySelector('[role="menu"]') ||
        dd.querySelector('[role="listbox"]');

      if (container) {
        var oldItems = container.querySelectorAll('.' + MENU_ITEM_CLASS);
        for (var k = 0; k < oldItems.length; k++) oldItems[k].remove();

        container.insertBefore(buildMenuItem(pendingVideoId), container.firstChild);
        bumpMaxHeight(dd);
        return true;
      }
    }
    return false;
  }

  function startMenuPoll() {
    if (menuPollTimer) clearInterval(menuPollTimer);
    var attempts = 0;
    menuPollTimer = setInterval(function() {
      attempts++;
      try {
        if (tryInjectMenu() || attempts >= 40) {
          clearInterval(menuPollTimer);
          menuPollTimer = null;
        }
      } catch (e) {
        console.error('[Jam-Bridge] Menu poll error:', e);
        clearInterval(menuPollTimer);
        menuPollTimer = null;
      }
    }, 60);
  }

  document.addEventListener('click', function(event) {
    try {
      if (IS_SPOTIFY) return;
      var target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest('tp-yt-iron-dropdown')) return;
      if (target.closest('.' + CARD_BUTTON_CLASS) || target.closest('#' + WATCH_BUTTON_ID)) return;

      var menuTrigger = target.closest(
        'ytd-menu-renderer, ytmusic-menu-renderer, .ytLockupMetadataViewModelMenuButton, .yt-lockup-metadata-view-model__menu-button, .yt-lockup-metadata-view-model-wiz__menu-button, .shortsLockupViewModelHostMetadataMenuButton, button[aria-label="More actions"], button[aria-label*="Action menu"]'
      );
      if (!menuTrigger) return;

      var videoId = null;
      if (menuTrigger.closest('ytmusic-player-bar')) {
        videoId = getActivePageVideoId();
      } else {
        var card = menuTrigger.closest(CARD_SELECTOR);
        if (card) videoId = getCardVideoId(card);
        if (!videoId) videoId = findVideoIdNearElement(menuTrigger);
        if (!videoId) videoId = getActivePageVideoId();
      }

      if (!videoId) return;

      pendingVideoId = videoId;
      startMenuPoll();
    } catch (e) {
      console.error('[Jam-Bridge] Click handler error:', e);
    }
  }, true);

  /* ---------- Lifecycle & SPA Navigation ---------- */

  var lastUrl = location.href;

  function boot() {
    try {
      addStyles();
      var url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        if (!IS_YTMUSIC && !IS_SPOTIFY) {
          var old = document.getElementById(WATCH_BUTTON_ID);
          if (old) old.remove();
        }
      }
      injectWatchButton();
      injectCardButtons();
    } catch (e) {
      console.error('[Jam-Bridge] boot() error:', e);
    }
  }

  var bootTimer = null;
  function scheduleBoot() {
    if (bootTimer) return;
    bootTimer = setTimeout(function() {
      bootTimer = null;
      boot();
    }, 250);
  }

  window.addEventListener('yt-navigate-finish', boot);
  window.addEventListener('yt-page-data-updated', boot);
  window.addEventListener('popstate', boot);

  try {
    new MutationObserver(scheduleBoot).observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    console.error('[Jam-Bridge] MutationObserver error:', e);
  }

  boot();
})();
