(function () {
  'use strict';

  var VERSION = 'legacy-player-1.0.0';
  var STORED_SCREEN_KEY = 'digital-signage-screen-id';
  var config = readBootstrap();
  var screenId = getScreenId(config.path) || safeStorageGet(STORED_SCREEN_KEY);
  var screenName = 'Legacy player';
  var items = [];
  var currentIndex = 0;
  var manifestSignature = '';
  var rotationTimer = null;
  var videoWatchdog = null;
  var manifestTimer = null;
  var heartbeatTimer = null;
  var stopped = false;
  var content = document.getElementById('legacy-content');
  var message = document.getElementById('legacy-message');
  var messageText = document.getElementById('legacy-message-text');
  var pairForm = document.getElementById('legacy-pair');
  var pairCode = document.getElementById('legacy-code');
  var pairError = document.getElementById('legacy-error');
  var footerLeft = document.getElementById('legacy-footer-left');

  if (!config.supabaseUrl || !config.anonKey || config.supabaseUrl.indexOf('%VITE_') === 0) {
    showMessage('Legacy player configuration is missing.');
    return;
  }

  window.onbeforeunload = stop;
  if (pairForm) pairForm.onsubmit = pair;

  if (!screenId) {
    showPairing();
  } else {
    start();
  }

  function readBootstrap() {
    var raw = window.name || '';
    if (raw.indexOf('NEHAS_LEGACY:') !== 0) raw = safeStorageGet('nehas-legacy-bootstrap') || '';
    if (raw.indexOf('NEHAS_LEGACY:') !== 0) return { path: '/player', supabaseUrl: '', anonKey: '' };
    try { return JSON.parse(raw.substring(13)); } catch (ignore) { return { path: '/player', supabaseUrl: '', anonKey: '' }; }
  }

  function getScreenId(path) {
    var match = String(path || '').match(/\/player\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function safeStorageGet(key) {
    try { return window.localStorage.getItem(key); } catch (ignore) { return null; }
  }

  function safeStorageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (ignore) {}
  }

  function start() {
    stopped = false;
    hidePairing();
    loadManifest(true);
    heartbeat();
    manifestTimer = window.setInterval(function () { loadManifest(false); }, 30000);
    heartbeatTimer = window.setInterval(heartbeat, 30000);
  }

  function stop() {
    stopped = true;
    clearPlaybackTimers();
    if (manifestTimer) window.clearInterval(manifestTimer);
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    manifestTimer = null;
    heartbeatTimer = null;
    clearContent();
  }

  function pair(event) {
    if (event && event.preventDefault) event.preventDefault();
    var code = pairCode ? String(pairCode.value || '').replace(/^\s+|\s+$/g, '') : '';
    if (!code) return false;
    pairError.innerHTML = '';
    request('GET', 'screens?select=id,name&pairing_code=eq.' + encodeURIComponent(code) + '&limit=1', null, function (error, rows) {
      if (error || !rows || !rows[0]) {
        pairError.innerHTML = 'No screen was found for that pairing code.';
        return;
      }
      screenId = rows[0].id;
      screenName = rows[0].name || 'Legacy player';
      safeStorageSet(STORED_SCREEN_KEY, screenId);
      request('PATCH', 'screens?id=eq.' + encodeURIComponent(screenId), {
        is_paired: true,
        last_seen: new Date().toISOString()
      }, function () { start(); });
    });
    return false;
  }

  function loadManifest(initial) {
    if (stopped || !screenId) return;
    request('GET', 'screens?select=id,name&id=eq.' + encodeURIComponent(screenId) + '&limit=1', null, function (screenError, screens) {
      if (screenError || !screens || !screens[0]) {
        showMessage('This screen could not be loaded. Retrying...');
        reportHealth('error', null, 'Screen lookup failed');
        return;
      }
      screenName = screens[0].name || 'Legacy player';
      footerLeft.innerHTML = 'Player: ' + escapeHtml(screenName) + ' (Legacy)';
      request('GET', 'screen_playlist_assignments?select=playlist_id&screen_id=eq.' + encodeURIComponent(screenId) + '&limit=1', null, function (assignmentError, assignments) {
        if (!assignmentError && assignments && assignments[0] && assignments[0].playlist_id) {
          loadItems('playlist_id=eq.' + encodeURIComponent(assignments[0].playlist_id), initial);
        } else {
          loadItems('screen_id=eq.' + encodeURIComponent(screenId), initial);
        }
      });
    });
  }

  function loadItems(filter, initial) {
    var select = 'id,media_id,display_order,duration_seconds,duration,start_time,end_time,media:media(id,file_name,file_url,media_type,created_at)';
    request('GET', 'playlist_items?select=' + encodeURIComponent(select) + '&' + filter + '&order=display_order.asc', null, function (error, rows) {
      if (error) {
        showMessage('Playlist is temporarily unavailable. Retrying...');
        reportHealth('error', null, 'Playlist request failed');
        return;
      }
      var supported = filterSupportedItems(rows || []);
      var nextSignature = buildSignature(supported);
      items = supported;
      if (initial || nextSignature !== manifestSignature) {
        manifestSignature = nextSignature;
        currentIndex = 0;
        playCurrent();
      } else if (!items.length) {
        showMessage('No supported image or video content is active.');
      }
    });
  }

  function filterSupportedItems(rows) {
    var result = [];
    var i;
    for (i = 0; i < rows.length; i += 1) {
      var item = rows[i];
      var media = item ? item.media : null;
      var type = media ? media.media_type : '';
      if (media && (type === 'image' || type === 'image/*' || type === 'video') && withinWindow(item.start_time, item.end_time)) {
        result.push(item);
      }
    }
    return result;
  }

  function withinWindow(start, end) {
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var startMinutes = parseTime(start || '00:00');
    var endMinutes = parseTime(end || '23:59');
    if (startMinutes <= endMinutes) return minutes >= startMinutes && minutes <= endMinutes;
    return minutes >= startMinutes || minutes <= endMinutes;
  }

  function parseTime(value) {
    var parts = String(value || '00:00').split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }

  function buildSignature(list) {
    var parts = [];
    var i;
    for (i = 0; i < list.length; i += 1) {
      parts.push(list[i].id + ':' + list[i].media_id + ':' + list[i].display_order + ':' + list[i].duration_seconds + ':' + list[i].media.file_url);
    }
    return parts.join('|');
  }

  function playCurrent() {
    clearPlaybackTimers();
    clearContent();
    if (!items.length) {
      showMessage('No supported image or video content is active.');
      reportHealth('empty', null, 'No supported content');
      return;
    }
    if (currentIndex >= items.length) currentIndex = 0;
    var item = items[currentIndex];
    var media = item.media;
    hideMessage();
    if (media.media_type === 'video') playVideo(item, media);
    else playImage(item, media);
  }

  function playImage(item, media) {
    var image = document.createElement('img');
    image.alt = media.file_name || '';
    image.onload = function () { reportHealth('playing', item.media_id, 'Showing ' + (media.file_name || 'image')); };
    image.onerror = next;
    image.src = cacheUrl(media.file_url, item.id + '-' + (media.created_at || ''));
    content.appendChild(image);
    rotationTimer = window.setTimeout(next, Math.max(1, item.duration_seconds || item.duration || 10) * 1000);
  }

  function playVideo(item, media) {
    var video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.setAttribute('muted', 'muted');
    video.setAttribute('playsinline', 'playsinline');
    video.setAttribute('webkit-playsinline', 'webkit-playsinline');
    video.onended = next;
    video.onerror = next;
    video.onloadedmetadata = function () {
      var duration = Number(video.duration);
      if (isFinite(duration) && duration > 0) {
        videoWatchdog = window.setTimeout(next, Math.ceil(duration + 8) * 1000);
      }
      reportHealth('playing', item.media_id, 'Playing ' + (media.file_name || 'video'));
    };
    video.src = cacheUrl(media.file_url, item.id + '-' + (media.created_at || ''));
    content.appendChild(video);
    try {
      var playResult = video.play();
      if (playResult && typeof playResult['catch'] === 'function') playResult['catch'](function () {});
    } catch (ignore) {}
  }

  function next() {
    if (stopped || !items.length) return;
    currentIndex = (currentIndex + 1) % items.length;
    playCurrent();
  }

  function clearPlaybackTimers() {
    if (rotationTimer) window.clearTimeout(rotationTimer);
    if (videoWatchdog) window.clearTimeout(videoWatchdog);
    rotationTimer = null;
    videoWatchdog = null;
  }

  function clearContent() {
    if (!content) return;
    while (content.firstChild) {
      if (content.firstChild.tagName && content.firstChild.tagName.toLowerCase() === 'video') {
        try { content.firstChild.pause(); } catch (ignore) {}
        content.firstChild.removeAttribute('src');
      }
      content.removeChild(content.firstChild);
    }
  }

  function cacheUrl(url, signature) {
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'v=' + encodeURIComponent(signature);
  }

  function heartbeat() {
    var item = items.length ? items[currentIndex % items.length] : null;
    reportHealth(items.length ? 'playing' : 'empty', item ? item.media_id : null, items.length ? 'Legacy playback active' : 'No supported content');
  }

  function reportHealth(status, mediaId, text) {
    if (!screenId) return;
    var full = {
      last_seen: new Date().toISOString(),
      is_paired: true,
      player_status: status,
      current_media_id: mediaId || null,
      player_message: text,
      player_error: status === 'error' ? text : null,
      player_version: VERSION
    };
    request('PATCH', 'screens?id=eq.' + encodeURIComponent(screenId), full, function (error) {
      if (error) {
        request('PATCH', 'screens?id=eq.' + encodeURIComponent(screenId), {
          last_seen: new Date().toISOString(),
          is_paired: true
        }, function () {});
      }
    });
  }

  function request(method, resource, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + resource, true);
    xhr.setRequestHeader('apikey', config.anonKey);
    xhr.setRequestHeader('Authorization', 'Bearer ' + config.anonKey);
    xhr.setRequestHeader('Accept', 'application/json');
    if (body !== null) {
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Prefer', 'return=minimal');
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        var data = null;
        if (xhr.responseText) {
          try { data = JSON.parse(xhr.responseText); } catch (ignore) { data = null; }
        }
        callback(null, data);
      } else {
        callback(new Error('Request failed with status ' + xhr.status), null);
      }
    };
    xhr.onerror = function () { callback(new Error('Network request failed'), null); };
    xhr.send(body === null ? null : JSON.stringify(body));
  }

  function showPairing() {
    clearContent();
    message.style.display = 'none';
    pairForm.style.display = 'block';
    footerLeft.innerHTML = 'Legacy pairing mode';
  }

  function hidePairing() {
    pairForm.style.display = 'none';
  }

  function showMessage(text) {
    clearContent();
    hidePairing();
    messageText.innerHTML = escapeHtml(text);
    message.style.display = 'table';
  }

  function hideMessage() {
    message.style.display = 'none';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
