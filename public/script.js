let currentPlaylistId = null;
let currentPlaylistImage = null;
let displayedTracks = [];
let originalCurrentTracks = [];
let savedSortFeature = localStorage.getItem('savedSortFeature') || 'manual';
let savedSortOrder   = localStorage.getItem('savedSortOrder')   || 'asc';
let currentRepeatState = 'off';
let currentShuffleState = false;
let nowPlayingInterval = null;
let volumeTimeout = null;
let lastPlayback = null;
let currentQueue = [];
let queueSignature = '';
let undoStack = [];
let redoStack = [];

const HIDDEN_PLAYLISTS = ['My Shazam Tracks'];
const MAX_HISTORY = 50;

const trackList              = document.getElementById('trackList');
const saveOrderButton        = document.getElementById('saveOrderBtn');
const saveAsNewButton        = document.getElementById('saveAsNewBtn');
const shufflePlaylistBtn     = document.getElementById('shufflePlaylistBtn');
const sortFeatureSelect      = document.getElementById('sortFeatureSelect');
const sortOrderSelect        = document.getElementById('sortOrderSelect');
const filterInput            = document.getElementById('filterInput');
const loginOrLogoutBtn       = document.getElementById('loginOrLogoutBtn');
const loginScreenBtn         = document.getElementById('loginScreenBtn');
const loginOverlay           = document.getElementById('loginOverlay');
const mainContent            = document.getElementById('mainContent');
const profileNameEl          = document.getElementById('profileName');
const profileFollowersEl     = document.getElementById('profileFollowers');
const profileImageEl         = document.getElementById('profileImage');
const profileSection         = document.getElementById('profile');
const onlineIndicator        = document.getElementById('onlineIndicator');
const playlistTitle          = document.getElementById('playlistTitle');
const playlistCoverEl        = document.getElementById('playlistCover');
const playlistStatsText      = document.getElementById('playlistStatsText');
const playlistsTotal         = document.getElementById('playlistsTotal');
const removeDuplicatesBtn    = document.getElementById('removeDuplicatesBtn');
const removeSelectedBtn      = document.getElementById('removeSelectedBtn');
const selectAllCheckbox      = document.getElementById('selectAllCheckbox');
const selectedCountEl        = document.getElementById('selectedCount');
const batchActionsContainer  = document.getElementById('batchActionsContainer');
const playlistToolsContainer = document.getElementById('playlistToolsContainer');
const trackSection           = document.getElementById('trackSection');
const yourPlaylistsSection   = document.getElementById('yourPlaylistsSection');
const loadingOverlay         = document.getElementById('loadingOverlay');
const nowPlayingSection      = document.getElementById('nowPlayingSection');
const playPauseBtn           = document.getElementById('playPauseBtn');
const nextBtn                = document.getElementById('nextBtn');
const prevBtn                = document.getElementById('prevBtn');
const shuffleBtn             = document.getElementById('shuffleBtn');
const repeatBtn              = document.getElementById('repeatBtn');
const repeatLabel            = document.getElementById('repeatLabel');
const volumeSlider           = document.getElementById('volumeSlider');
const volumeValueEl          = document.getElementById('volumeValue');
const nowPlayingGenresEl     = document.getElementById('nowPlayingGenres');
const likeBtn                = document.getElementById('likeBtn');
const likeIcon               = document.getElementById('likeIcon');
const likeLabel              = document.getElementById('likeLabel');
const addToPlaylistBtn       = document.getElementById('addToPlaylistBtn');
const progressBarContainer   = document.getElementById('progressBarContainer');
const queueContainer         = document.getElementById('queueContainer');
const queueList              = document.getElementById('queueList');
const genreStatsBtn          = document.getElementById('genreStatsBtn');
const loadGenresBtn          = document.getElementById('loadGenresBtn');
const smartSortSelect        = document.getElementById('smartSortSelect');
const undoBtn                = document.getElementById('undoBtn');
const redoBtn                = document.getElementById('redoBtn');
const dirtyBadge             = document.getElementById('dirtyBadge');
const discardBtn             = document.getElementById('discardBtn');

let currentMovedUris = new Set();
const genreCache = {};
let genreLoadToken = 0;

(async () => {
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    if (!cfg.spotifyClientId) {
      toast('Configuration error: Spotify credentials missing.');
      return;
    }
    window._spotifyClientId    = cfg.spotifyClientId;
    window._spotifyRedirectUri = cfg.redirectUri;
    await handleCallback();
  } catch (e) {
    console.error('Failed to load config', e);
    toast('Failed to load app configuration. Please refresh the page.');
    return;
  }

  updateLoginBtn();
  restoreSortUI();

  const token = getToken();
  if (token) {
    if (loginOverlay) loginOverlay.classList.add('hidden');
    try {
      await initApp();
    } catch (err) {
      console.error('Init failed:', err);
    }
  } else {
    if (loginOverlay) loginOverlay.classList.remove('hidden');
  }
})();

if (loginScreenBtn) loginScreenBtn.addEventListener('click', startAuth);
if (playPauseBtn)   playPauseBtn.addEventListener('click', togglePlayPause);
if (nextBtn)        nextBtn.addEventListener('click', playNext);
if (prevBtn)        prevBtn.addEventListener('click', playPrevious);
if (shuffleBtn)     shuffleBtn.addEventListener('click', toggleShuffle);
if (repeatBtn)      repeatBtn.addEventListener('click', cycleRepeat);
if (likeBtn)        likeBtn.addEventListener('click', toggleLike);
if (addToPlaylistBtn) addToPlaylistBtn.addEventListener('click', openAddToPlaylistModal);
if (genreStatsBtn)  genreStatsBtn.addEventListener('click', openGenreStats);
if (loadGenresBtn)  loadGenresBtn.addEventListener('click', () => loadAllGenres());
if (undoBtn)        undoBtn.addEventListener('click', undo);
if (redoBtn)        redoBtn.addEventListener('click', redo);
if (discardBtn)     discardBtn.addEventListener('click', discardChanges);

if (smartSortSelect)
  smartSortSelect.addEventListener('change', () => {
    const mode = smartSortSelect.value;
    smartSortSelect.value = '';
    if (mode) smartSort(mode);
  });

document.addEventListener('keydown', (e) => {
  if (trackSection?.classList.contains('hidden')) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); }
});

if (progressBarContainer)
  progressBarContainer.addEventListener('click', (e) => {
    if (!lastPlayback || !lastPlayback.duration_ms) return;
    const rect = progressBarContainer.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const pos  = Math.floor(frac * lastPlayback.duration_ms);
    mcp('seek', { position_ms: pos })
      .then(() => setTimeout(refreshNowPlaying, 300))
      .catch(err => console.warn('Seek error:', err));
  });

document.getElementById('closeGenreStatsBtn')?.addEventListener('click', () => closeModal('genreStatsModal'));
document.getElementById('genreStatsModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('genreStatsModal'); });
document.getElementById('closeAddToPlaylistBtn')?.addEventListener('click', () => closeModal('addToPlaylistModal'));
document.getElementById('addToPlaylistModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('addToPlaylistModal'); });

if (volumeSlider) {
  volumeSlider.addEventListener('input', () => {
    const vol = parseInt(volumeSlider.value);
    if (volumeValueEl) volumeValueEl.textContent = vol + '%';
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
      mcp('set_volume', { volume_percent: vol }).catch(err => console.warn('Volume error:', err));
    }, 400);
  });
}

function getToken() {
  const token  = localStorage.getItem('spotify_token');
  const expiry = localStorage.getItem('token_expiry');
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry)) {
    if (refreshToken) {
      refreshAccessToken().catch(() => logoutSilently());
      return null;
    }
    logoutSilently();
    return null;
  }
  return token;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) throw new Error('No refresh token');
  const res  = await fetch('/api/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Refresh failed');
  localStorage.setItem('spotify_token', data.access_token);
  localStorage.setItem('token_expiry', Date.now() + data.expires_in * 1000);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
}

function logoutSilently() {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('token_expiry');
  localStorage.removeItem('spotify_refresh_token');
}

function updateLoginBtn() {
  if (!loginOrLogoutBtn) return;
  if (getToken()) {
    loginOrLogoutBtn.textContent = 'Logout';
    loginOrLogoutBtn.onclick = logout;
  } else {
    loginOrLogoutBtn.textContent = 'Connect Spotify';
    loginOrLogoutBtn.onclick = startAuth;
  }
}

async function startAuth() {
  const clientId    = window._spotifyClientId;
  const redirectUri = window._spotifyRedirectUri;
  if (!clientId || !redirectUri) { toast('Auth config not loaded - please refresh.'); return; }
  const scopes = [
    'playlist-read-private', 'playlist-read-collaborative',
    'playlist-modify-public', 'playlist-modify-private', 'user-read-currently-playing',
  ].join('%20');
  window.location.href =
    `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&show_dialog=true`;
}

async function handleCallback() {
  if (!window.location.search) return;
  const params = new URLSearchParams(window.location.search.slice(1));
  const code   = params.get('code');
  const error  = params.get('error');
  if (error) {
    toast(`Authorization failed: ${error}`);
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  if (!code) return;
  try {
    const res  = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Token exchange failed: ${res.status}`);
    localStorage.setItem('spotify_token', data.access_token);
    localStorage.setItem('token_expiry', Date.now() + data.expires_in * 1000);
    if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  } catch (err) {
    toast(`Authentication failed: ${err.message}`);
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function logout() {
  if (nowPlayingInterval) { clearInterval(nowPlayingInterval); nowPlayingInterval = null; }
  logoutSilently();
  updateLoginBtn();
  if (profileSection)        profileSection.classList.add('hidden');
  if (onlineIndicator)       onlineIndicator.classList.add('hidden');
  if (nowPlayingSection)     nowPlayingSection.classList.add('hidden');
  if (trackSection)          trackSection.classList.add('hidden');
  if (playlistToolsContainer) playlistToolsContainer.classList.add('hidden');
  if (batchActionsContainer)  batchActionsContainer.classList.add('hidden');
  const container = document.getElementById('playlists');
  if (container)       container.innerHTML = '';
  if (playlistsTotal)  playlistsTotal.textContent = 'Click any playlist to start organizing';
  if (loginOverlay)    loginOverlay.classList.remove('hidden');
}

async function mcp(tool, args = {}) {
  if (!getToken()) throw new Error('Not authenticated');
  const res  = await fetch(`/api/mcp/${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.result;
}

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) { console.log(message); return; }
  const colors = {
    info:    'bg-gray-800 border-gray-600',
    success: 'bg-green-900 border-green-600',
    error:   'bg-red-900 border-red-600',
  };
  const el = document.createElement('div');
  el.className = `pointer-events-auto px-4 py-2 rounded-lg border text-sm text-red-50 shadow-lg max-w-sm text-center transition-opacity duration-300 ${colors[type] || colors.info}`;
  el.textContent = String(message);
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

function playbackErrorMessage(err) {
  const m = (err && err.message ? err.message : String(err)).toLowerCase();
  if (m.includes('no active device') || m.includes('no_active_device') || m.includes('404')) {
    return 'No active Spotify device - open Spotify on a device and start playing something first.';
  }
  return `Could not control playback: ${err && err.message ? err.message : err}`;
}

function showLoading() { if (loadingOverlay) loadingOverlay.classList.remove('hidden'); }
function hideLoading()  { if (loadingOverlay) loadingOverlay.classList.add('hidden'); }

async function initApp() {
  showLoading();
  try {
    const profile = await mcp('get_user_profile');
    if (profile && !profile.error) {
      if (profileNameEl)      profileNameEl.textContent = profile.display_name || 'Spotify User';
      if (profileFollowersEl) profileFollowersEl.textContent = profile.followers != null ? `${profile.followers.toLocaleString()} followers` : '';
      if (profileSection)     profileSection.classList.remove('hidden');
      if (onlineIndicator)    onlineIndicator.classList.remove('hidden');
      const pic = profile.images?.[0]?.url;
      if (pic && profileImageEl) { profileImageEl.src = pic; }
    }

    try {
      const nowPlaying = await mcp('get_current_playback');
      if (nowPlaying && nowPlaying.track) {
        displayNowPlaying(nowPlaying);
      } else {
        if (nowPlayingSection) nowPlayingSection.classList.add('hidden');
      }
    } catch (err) {
      console.warn('Could not fetch now playing:', err.message);
      if (nowPlayingSection) nowPlayingSection.classList.add('hidden');
    }

    if (nowPlayingInterval) clearInterval(nowPlayingInterval);
    nowPlayingInterval = setInterval(refreshNowPlaying, 10000);

    updateLoginBtn();
    await loadPlaylists();
  } catch (err) {
    console.error('Init error', err);
    if (err.message.includes('401') || err.message.includes('auth')) logout();
  } finally {
    hideLoading();
  }
}

async function loadPlaylists() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('/api/playlists', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let playlists = await res.json();
    playlists = (playlists || []).filter(p => !HIDDEN_PLAYLISTS.includes(p.name));
    const container = document.getElementById('playlists');
    if (!container) return;
    if (!playlists || playlists.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-sm p-4">No playlists found.</p>';
      return;
    }
    if (playlistsTotal) playlistsTotal.textContent = `${playlists.length} playlists`;

    window._playlistMeta = {};
    for (const p of playlists) window._playlistMeta[p.id] = { name: p.name, image: p.image };

    container.innerHTML = playlists.map(p => {
      const safeName    = p.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const displayName = p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `
    <button
      class="playlist-item relative card-hover w-full text-left p-0 rounded-xl glass-effect hover:border hover:border-red-500/30 transition-all duration-300 flex flex-col overflow-hidden group"
      data-playlist-id="${p.id}"
    >
      ${p.image
        ? `<img src="${p.image}" alt="${safeName}" class="w-full h-36 object-cover group-hover:opacity-30 transition-opacity" loading="lazy">`
        : `<div class="w-full h-36 bg-gradient-to-br from-red-900/60 to-gray-800 flex items-center justify-center group-hover:opacity-30 transition-opacity">
             <svg class="w-12 h-12 text-red-400 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
             </svg>
           </div>`
      }
      <div class="track-preview-overlay">
        <div class="font-bold text-red-200 text-sm mb-2 truncate">${displayName}</div>
        <div id="preview-tracks-${p.id}" class="track-preview-list text-xs space-y-1 overflow-y-auto">
          <div class="text-gray-400 text-center py-2">Loading tracks...</div>
        </div>
      </div>
      <div class="p-4 min-w-0 relative z-10 bg-gradient-to-t from-black/60 to-transparent">
        <div class="font-semibold text-red-100 truncate">${displayName}</div>
        <div class="text-xs text-red-400 opacity-50">by ${p.owner || 'Unknown'}</div>
      </div>
    </button>
  `}).join('');

    document.querySelectorAll('.playlist-item[data-playlist-id]').forEach(btn => {
      const playlistId = btn.dataset.playlistId;
      btn.addEventListener('click', () => loadPlaylist(playlistId, window._playlistMeta?.[playlistId]?.name || ''));
      let previewLoaded = false;
      btn.addEventListener('mouseenter', async () => {
        if (previewLoaded) return;
        previewLoaded = true;
        try {
          const res  = await fetch('/api/mcp/get_playlist_tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: { playlist_id: playlistId } }),
          });
          const data   = await res.json();
          const tracks = data.result || [];
          const el     = document.getElementById(`preview-tracks-${playlistId}`);
          if (!el) return;
          if (!tracks.length) { el.innerHTML = '<div class="text-gray-400 text-center py-2">No tracks</div>'; return; }
          el.innerHTML = tracks.slice(0, 5).map(t => `
            <div class="preview-track-item">
              <div class="track-name truncate">${t.name || 'Unknown'}</div>
              <div class="track-artist truncate">${t.artists?.[0] || 'Unknown Artist'}</div>
            </div>
          `).join('') + (tracks.length > 5 ? `<div class="text-gray-400 text-center py-1">+${tracks.length - 5} more</div>` : '');
        } catch (err) {
          const el = document.getElementById(`preview-tracks-${playlistId}`);
          if (el) el.innerHTML = '<div class="text-red-400 text-center py-2">Error loading</div>';
        }
      });
    });
  } catch (err) {
    console.error('Failed to load playlists:', err);
    const container = document.getElementById('playlists');
    if (container) container.innerHTML = '<p class="text-red-400 text-sm p-4">Failed to load playlists. Please refresh.</p>';
  }
}

async function loadPlaylist(id, name) {
  currentPlaylistId = id;
  genreLoadToken++;
  if (loadGenresBtn) loadGenresBtn.textContent = 'Load Genres';
  const meta = window._playlistMeta?.[id];
  currentPlaylistImage = meta?.image || null;

  if (playlistCoverEl) {
    if (currentPlaylistImage) {
      playlistCoverEl.src = currentPlaylistImage;
      playlistCoverEl.alt = name || 'Playlist cover';
      playlistCoverEl.classList.remove('hidden');
    } else {
      playlistCoverEl.classList.add('hidden');
    }
  }
  if (playlistTitle) playlistTitle.textContent = name || 'Playlist';

  showLoading();
  try {
    const tracks = await mcp('get_playlist_tracks', { playlist_id: id });
    displayedTracks       = tracks || [];
    originalCurrentTracks = [...displayedTracks];
    resetHistory();
    applySavedSort();
    if (trackSection)           trackSection.classList.remove('hidden');
    if (playlistToolsContainer) playlistToolsContainer.classList.remove('hidden');
    if (batchActionsContainer)  batchActionsContainer.classList.remove('hidden');
    renderTracks(displayedTracks);
    updatePlaylistStats();
    trackSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('Load playlist error', err);
    toast(`Failed to load playlist: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function updatePlaylistStats() {
  if (!playlistStatsText) return;
  const totalMs = displayedTracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  playlistStatsText.textContent = `${displayedTracks.length} tracks • ${h > 0 ? `${h}h ${m}m` : `${m}m`}`;
}

function pushUndo() {
  undoStack.push([...displayedTracks]);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

function resetHistory() {
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push([...displayedTracks]);
  displayedTracks = undoStack.pop();
  if (filterInput) filterInput.value = '';
  renderTracks(displayedTracks);
  updatePlaylistStats();
  updateUndoRedoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push([...displayedTracks]);
  displayedTracks = redoStack.pop();
  if (filterInput) filterInput.value = '';
  renderTracks(displayedTracks);
  updatePlaylistStats();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function countMap(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return m;
}

function isSubsequence(sub, sup) {
  let i = 0;
  for (const x of sup) if (i < sub.length && sub[i] === x) i++;
  return i === sub.length;
}

function computeMovedUris(origSeq, dispSeq) {
  const n = origSeq.length, m = dispSeq.length;
  if (n === 0 || m === 0 || n * m > 1000000) return new Set();
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = origSeq[i] === dispSeq[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const inLcs = new Set();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (origSeq[i] === dispSeq[j]) { inLcs.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const moved = new Set();
  dispSeq.forEach((u, idx) => { if (!inLcs.has(idx)) moved.add(u); });
  return moved;
}

function computeDiff() {
  const origUris = originalCurrentTracks.map(t => t.uri);
  const dispUris = displayedTracks.map(t => t.uri);
  const origCount = countMap(origUris);
  const dispCount = countMap(dispUris);

  const removed = [];
  for (const uri in origCount) {
    const gone = origCount[uri] - (dispCount[uri] || 0);
    for (let k = 0; k < gone; k++) removed.push(uri);
  }
  const removedCount = removed.length;

  const changed = origUris.length !== dispUris.length || origUris.some((u, i) => u !== dispUris[i]);
  const hasDuplicates = Object.values(origCount).some(c => c > 1);
  const removalsOnly = isSubsequence(dispUris, origUris);
  const removalSafe = removed.every(u => !(dispCount[u] > 0));

  const moved = changed ? computeMovedUris(origUris, dispUris) : new Set();
  const movedCount = moved.size;

  return { changed, removed, removedCount, movedCount, removalsOnly, removalSafe, hasDuplicates, moved };
}

function updateDirtyState() {
  if (!currentPlaylistId) return;
  const d = computeDiff();
  currentMovedUris = d.moved;

  if (dirtyBadge) {
    if (!d.changed) {
      dirtyBadge.classList.add('hidden');
      dirtyBadge.textContent = '';
    } else {
      const parts = [];
      if (d.movedCount)   parts.push(`${d.movedCount} moved`);
      if (d.removedCount) parts.push(`${d.removedCount} removed`);
      dirtyBadge.textContent = `● Unsaved${parts.length ? ' · ' + parts.join(' · ') : ''}`;
      dirtyBadge.classList.remove('hidden');
    }
  }
  if (discardBtn) discardBtn.classList.toggle('hidden', !d.changed);

  if (trackList) {
    trackList.querySelectorAll('li[data-uri]').forEach(li => {
      li.classList.toggle('track-moved', currentMovedUris.has(li.dataset.uri));
    });
  }
}

function discardChanges() {
  if (!currentPlaylistId) return;
  const d = computeDiff();
  if (!d.changed) return;
  pushUndo();
  displayedTracks = [...originalCurrentTracks];
  if (filterInput) filterInput.value = '';
  if (sortFeatureSelect) sortFeatureSelect.value = 'manual';
  renderTracks(displayedTracks);
  updatePlaylistStats();
}

function restoreSortUI() {
  if (sortFeatureSelect) sortFeatureSelect.value = savedSortFeature;
  if (sortOrderSelect)   sortOrderSelect.value   = savedSortOrder;
}

function applySavedSort() {
  if (!savedSortFeature || savedSortFeature === 'manual') return;
  displayedTracks = sortTracks([...originalCurrentTracks], savedSortFeature, savedSortOrder);
}

function sortTracks(arr, feature, order) {
  return arr.sort((a, b) => {
    let valA, valB;
    switch (feature) {
      case 'name':        valA = a.name?.toLowerCase()          || ''; valB = b.name?.toLowerCase()          || ''; break;
      case 'artist':      valA = (a.artists?.[0] || '').toLowerCase(); valB = (b.artists?.[0] || '').toLowerCase(); break;
      case 'album':       valA = a.album?.toLowerCase()         || ''; valB = b.album?.toLowerCase()         || ''; break;
      case 'duration_ms': valA = a.duration_ms || 0;                   valB = b.duration_ms || 0;                   break;
      case 'popularity':  valA = a.popularity  || 0;                   valB = b.popularity  || 0;                   break;
      default: return 0;
    }
    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ?  1 : -1;
    return 0;
  });
}

if (sortFeatureSelect) sortFeatureSelect.addEventListener('change', handleSortChange);
if (sortOrderSelect)   sortOrderSelect.addEventListener('change',   handleSortChange);

function handleSortChange() {
  const feature = sortFeatureSelect?.value || 'manual';
  const order   = sortOrderSelect?.value   || 'asc';
  localStorage.setItem('savedSortFeature', feature);
  localStorage.setItem('savedSortOrder',   order);
  savedSortFeature = feature;
  savedSortOrder   = order;
  if (currentPlaylistId) pushUndo();
  displayedTracks = feature === 'manual'
    ? [...originalCurrentTracks]
    : sortTracks([...originalCurrentTracks], feature, order);
  renderTracks(displayedTracks);
}

if (filterInput)
  filterInput.addEventListener('input', () => {
    const q = filterInput.value.toLowerCase();
    if (!q) { renderTracks(displayedTracks); return; }
    renderTracks(displayedTracks.filter(
      t => t.name?.toLowerCase().includes(q) || t.artists?.some(a => String(a).toLowerCase().includes(q))
    ));
  });

if (selectAllCheckbox)
  selectAllCheckbox.addEventListener('change', () => {
    document.querySelectorAll('.track-checkbox').forEach(cb => { cb.checked = selectAllCheckbox.checked; });
    updateSelectedCount();
  });

function updateSelectedCount() {
  const n = document.querySelectorAll('.track-checkbox:checked').length;
  if (selectedCountEl)   selectedCountEl.textContent = n;
  if (removeSelectedBtn) removeSelectedBtn.disabled  = n === 0;
}

if (saveOrderButton) saveOrderButton.addEventListener('click', saveOrder);

async function saveOrder() {
  if (!currentPlaylistId) return;
  const d = computeDiff();
  if (!d.changed) { toast('No changes to save.'); return; }

  showLoading();
  try {
    if (d.removalsOnly && d.removedCount && d.removalSafe && !d.hasDuplicates) {
      const uniqueRemoved = [...new Set(d.removed)];
      await mcp('remove_tracks_from_playlist', { playlist_id: currentPlaylistId, track_uris: uniqueRemoved });
      toast(`Removed ${d.removedCount} track(s).`);
    } else {
      await mcp('save_playlist_order', { playlist_id: currentPlaylistId, track_uris: displayedTracks.map(t => t.uri) });
      toast('Playlist saved!');
    }
    originalCurrentTracks = [...displayedTracks];
    updateDirtyState();
  } catch (err) {
    toast(`Failed to save: ${err.message}`);
  } finally {
    hideLoading();
  }
}

if (saveAsNewButton) saveAsNewButton.addEventListener('click', saveAsNewPlaylist);

async function saveAsNewPlaylist() {
  if (!currentPlaylistId || !displayedTracks.length) return;
  const name = prompt('Enter a name for the new playlist:');
  if (!name) return;
  showLoading();
  try {
    const result = await mcp('create_playlist_from_tracks', {
      name,
      track_uris: displayedTracks.map(t => t.uri),
      cover_image_url: currentPlaylistImage || '',
    });
    toast(result || 'Playlist created!');
    await loadPlaylists();
  } catch (err) {
    toast(`Failed to create playlist: ${err.message}`);
  } finally {
    hideLoading();
  }
}

if (shufflePlaylistBtn)
  shufflePlaylistBtn.addEventListener('click', () => {
    if (!displayedTracks.length) return;
    pushUndo();
    for (let i = displayedTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [displayedTracks[i], displayedTracks[j]] = [displayedTracks[j], displayedTracks[i]];
    }
    renderTracks(displayedTracks);
  });

function handleRemoveTrack(uri) {
  const idx = displayedTracks.findIndex(t => t.uri === uri);
  if (idx === -1) return;
  pushUndo();
  displayedTracks.splice(idx, 1);
  const q = filterInput?.value.toLowerCase() || '';
  renderTracks(q
    ? displayedTracks.filter(t => t.name?.toLowerCase().includes(q) || t.artists?.some(a => String(a).toLowerCase().includes(q)))
    : displayedTracks
  );
  updatePlaylistStats();
}

function handleRemoveSelected() {
  const uris = [...document.querySelectorAll('.track-checkbox:checked')].map(cb => cb.dataset.uri).filter(Boolean);
  if (!uris.length) return;
  pushUndo();
  displayedTracks = displayedTracks.filter(t => !uris.includes(t.uri));
  if (selectAllCheckbox) selectAllCheckbox.checked = false;
  if (selectedCountEl)   selectedCountEl.textContent = '0';
  if (removeSelectedBtn) removeSelectedBtn.disabled  = true;
  renderTracks(displayedTracks);
  updatePlaylistStats();
}

if (removeDuplicatesBtn)
  removeDuplicatesBtn.addEventListener('click', async () => {
    if (!currentPlaylistId) return;
    showLoading();
    try {
      const result = await mcp('remove_duplicate_tracks', { playlist_id: currentPlaylistId });
      toast(result || 'Duplicates removed!');
      await loadPlaylist(currentPlaylistId, playlistTitle?.textContent || '');
    } catch (err) {
      toast(`Failed to remove duplicates: ${err.message}`);
    } finally {
      hideLoading();
    }
  });

if (removeSelectedBtn) removeSelectedBtn.addEventListener('click', handleRemoveSelected);

async function fetchGenre(artist, track) {
  const key = `${artist}|${track}`.toLowerCase();
  if (genreCache[key]) return genreCache[key];
  try {
    const res    = await fetch(`/api/genres?artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`);
    const data   = await res.json();
    const genres = (data.tags || data.genres || []).slice(0, 3);
    genreCache[key] = genres;
    return genres;
  } catch {
    return [];
  }
}

function applyGenreToRow(t) {
  if (!trackList) return;
  const li = trackList.querySelector(`li[data-uri="${t.uri}"]`);
  if (!li) return;
  const el = li.querySelector('.genre-tag');
  if (!el) return;
  const genres = t.genre_text ? t.genre_text.split(', ').filter(Boolean) : [];
  el.innerHTML = genres.map(g => `<span class="genre-badge">${g}</span>`).join('');
}

function setGenreBtnProgress(done, total) {
  if (!loadGenresBtn) return;
  if (total === 0)            loadGenresBtn.textContent = 'Genres ✓';
  else if (done >= total)     loadGenresBtn.textContent = 'Genres ✓';
  else                        loadGenresBtn.textContent = `Genres ${done}/${total}`;
}

async function loadAllGenres(onProgress) {
  const token = ++genreLoadToken;
  const todo  = displayedTracks.filter(t => !t.genre_text && t.artists?.[0]);
  const total = todo.length;
  let done = 0;
  const report = () => { setGenreBtnProgress(done, total); if (onProgress) onProgress(done, total); };

  if (!total) { setGenreBtnProgress(0, 0); if (onProgress) onProgress(0, 0); return; }
  report();

  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      if (token !== genreLoadToken) return;
      const t = todo[idx++];
      const genres = await fetchGenre(String(t.artists[0]), t.name);
      if (token !== genreLoadToken) return;
      t.genre_text = genres.join(', ');
      applyGenreToRow(t);
      done++;
      report();
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, total) }, worker));
}

async function loadGenresForVisible() {
  const items = [...document.querySelectorAll('#trackList li[data-uri]')];
  for (const li of items) {
    const t = displayedTracks.find(x => x.uri === li.dataset.uri);
    if (!t || t.genre_text || !t.artists?.[0]) continue;
    const genres = await fetchGenre(String(t.artists[0]), t.name);
    t.genre_text = genres.join(', ');
    applyGenreToRow(t);
  }
}

function openTrackModal(uriOrTrack) {
  const track = typeof uriOrTrack === 'string'
    ? displayedTracks.find(t => t.uri === uriOrTrack)
    : uriOrTrack;
  if (!track) return;

  const modal = document.getElementById('trackInfoModal');
  if (!modal) return;

  document.getElementById('modalTrackName').textContent     = track.name || '';
  document.getElementById('modalTrackArtist').textContent   = (track.artists || []).map(a => String(a)).join(', ') || '';
  document.getElementById('modalTrackAlbum').textContent    = track.album || '';
  document.getElementById('modalTrackDuration').textContent = formatDuration(track.duration_ms);

  const releaseDateEl = document.getElementById('modalTrackReleaseDate');
  if (releaseDateEl) releaseDateEl.textContent = track.release_date || '';

  const genresEl = document.getElementById('modalTrackGenres');
  if (genresEl) {
    genresEl.innerHTML = track.genre_text
      ? track.genre_text.split(', ').map(g => `<span class="genre-badge">${g}</span>`).join('')
      : '<span class="text-red-400 text-xs">Loading...</span>';
  }

  const featuresEl = document.getElementById('modalAudioFeatures');
  if (featuresEl) {
    featuresEl.innerHTML = track.popularity != null
      ? `<span class="text-red-300">Popularity</span>: ${track.popularity}/100`
      : '';
  }

  const img = document.getElementById('modalTrackImage');
  if (img) {
    const src = track.image_full || track.image;
    if (src) { img.src = src; img.alt = track.album || track.name || ''; img.classList.remove('hidden'); }
    else      { img.classList.add('hidden'); }
  }

  const link = document.getElementById('modalSpotifyLink');
  if (link) link.href = track.spotify_url || track.uri?.replace('spotify:track:', 'https://open.spotify.com/track/') || '#';

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (!track.genre_text) {
    const artist = track.artists?.[0] ? String(track.artists[0]) : null;
    if (artist) {
      fetchGenre(artist, track.name)
        .then(genres => {
          const idx = displayedTracks.findIndex(t => t.uri === track.uri);
          if (idx !== -1) displayedTracks[idx].genre_text = genres.join(', ');
          if (genresEl) {
            genresEl.innerHTML = genres.length
              ? genres.map(g => `<span class="genre-badge">${g}</span>`).join('')
              : '<span class="text-red-400 text-xs">Unknown</span>';
          }
        })
        .catch(() => { if (genresEl) genresEl.textContent = 'Unavailable'; });
    }
  }
}

function closeTrackModal() {
  const modal = document.getElementById('trackInfoModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

document.getElementById('closeModalBtn')?.addEventListener('click', closeTrackModal);
document.getElementById('trackInfoModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTrackModal();
});

function initSortable() {
  if (typeof Sortable === 'undefined' || !trackList) return;
  if (trackList._sortable) trackList._sortable.destroy();
  trackList._sortable = Sortable.create(trackList, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      pushUndo();
      const renderedUris = [...trackList.querySelectorAll('li[data-uri]')].map(li => li.dataset.uri);
      const uriSet       = new Set(renderedUris);
      const invisible    = displayedTracks.filter(t => !uriSet.has(t.uri));
      const uriToTrack   = Object.fromEntries(displayedTracks.map(t => [t.uri, t]));
      displayedTracks    = [...renderedUris.map(uri => uriToTrack[uri]).filter(Boolean), ...invisible];
      updatePlaylistStats();
      updateDirtyState();
    },
  });
}

function moveTrack(uri, delta) {
  const idx = displayedTracks.findIndex(t => t.uri === uri);
  if (idx < 0) return;
  const j = idx + delta;
  if (j < 0 || j >= displayedTracks.length) return;
  pushUndo();
  const [t] = displayedTracks.splice(idx, 1);
  displayedTracks.splice(j, 0, t);
  renderTracks(displayedTracks);
  updatePlaylistStats();
  updateDirtyState();
  const el = trackList.querySelector(`.drag-handle[data-uri="${CSS.escape(uri)}"]`);
  if (el) el.focus();
}

function handleReorderKey(e, uri) {
  if (!e.altKey) return;
  if (e.key === 'ArrowUp') { e.preventDefault(); moveTrack(uri, -1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); moveTrack(uri, 1); }
}

function formatDuration(ms) {
  if (!ms) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderTracks(tracks) {
  if (!trackList) return;
  if (!tracks || !tracks.length) {
    trackList.innerHTML = '<li class="text-gray-500 text-sm p-4 text-center">No tracks to display.</li>';
    initSortable();
    updatePlaylistStats();
    return;
  }
  trackList.innerHTML = tracks.map(t => {
    const artist   = t.artists?.map(a => String(a)).join(', ') || 'Unknown Artist';
    const duration = formatDuration(t.duration_ms);
    const thumbHtml = t.image
      ? `<img src="${t.image}" alt="" class="w-10 h-10 rounded object-cover flex-shrink-0" loading="lazy">`
      : '<div class="w-10 h-10 rounded bg-red-900/40 flex-shrink-0 flex items-center justify-center"><svg class="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg></div>';
    const genreBadges = t.genre_text
      ? t.genre_text.split(', ').map(g => `<span class="genre-badge">${g}</span>`).join('')
      : '';
    return `<li class="track-item flex items-center gap-3 p-3 rounded-lg group" data-uri="${t.uri}">
      <span class="drag-handle cursor-grab text-red-700 hover:text-red-400 text-lg select-none px-1" tabindex="0" role="button" aria-label="Reorder track. Press Alt with Arrow Up or Arrow Down to move." data-uri="${t.uri}" onkeydown="handleReorderKey(event, '${t.uri}')">⠿</span>
      <input type="checkbox" class="track-checkbox w-4 h-4 flex-shrink-0" data-uri="${t.uri}" onchange="updateSelectedCount()">
      ${thumbHtml}
      <div class="min-w-0 flex-1 cursor-pointer" onclick="openTrackModal('${t.uri}')">
        <div class="font-medium truncate text-red-100">${t.name || 'Unknown'}</div>
        <div class="text-sm text-red-300 truncate">${artist}</div>
        <div class="genre-tag mt-0.5">${genreBadges}</div>
      </div>
      <div class="text-sm text-red-400 flex-shrink-0">${duration}</div>
      <button onclick="handleRemoveTrack('${t.uri}')"
        class="text-red-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 ml-1"
        aria-label="Remove track">✕</button>
    </li>`;
  }).join('');
  initSortable();
  updatePlaylistStats();
  updateDirtyState();
  setTimeout(loadGenresForVisible, 200);
}

function displayNowPlaying(data) {
  if (!nowPlayingSection) return;
  lastPlayback = data;

  const trackEl    = document.getElementById('nowPlayingTrack');
  const artistEl   = document.getElementById('nowPlayingArtist');
  const albumEl    = document.getElementById('nowPlayingAlbum');
  const artworkEl  = document.getElementById('nowPlayingAlbumArt');
  const progressEl = document.getElementById('progressBar');
  const progTimeEl = document.getElementById('progressTime');
  const durTimeEl  = document.getElementById('durationTime');

  if (trackEl)  trackEl.textContent  = data.track || 'Unknown Track';
  if (artistEl) artistEl.textContent = data.artists?.join(', ') || 'Unknown Artist';
  if (albumEl)  albumEl.textContent  = data.album || '';

  if (artworkEl) {
    if (data.image) {
      artworkEl.src = data.image;
      artworkEl.style.display = '';
    } else {
      artworkEl.src = '';
    }
  }

  if (data.progress_ms !== undefined && data.duration_ms) {
    const pct = (data.progress_ms / data.duration_ms) * 100;
    if (progressEl) progressEl.style.width = pct + '%';
    if (progTimeEl) progTimeEl.textContent = formatDuration(data.progress_ms);
    if (durTimeEl)  durTimeEl.textContent  = formatDuration(data.duration_ms);
  }

  if (nowPlayingGenresEl && data.artists?.[0] && data.track) {
    fetch(`/api/genres?artist=${encodeURIComponent(data.artists[0])}&track=${encodeURIComponent(data.track)}`)
      .then(r => r.json())
      .then(d => {
        const tags = d.tags || d.genres || [];
        nowPlayingGenresEl.innerHTML = tags.slice(0, 3).map(g => `<span class="genre-badge">${g}</span>`).join('');
      })
      .catch(() => {});
  }

  nowPlayingSection.classList.remove('hidden');

  const playIcon  = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  if (data.playing) {
    if (playIcon)  playIcon.classList.add('hidden');
    if (pauseIcon) pauseIcon.classList.remove('hidden');
  } else {
    if (playIcon)  playIcon.classList.remove('hidden');
    if (pauseIcon) pauseIcon.classList.add('hidden');
  }

  if (data.shuffle_state !== undefined) {
    currentShuffleState = data.shuffle_state;
    updateShuffleBtn();
  }
  if (data.repeat_state !== undefined) {
    currentRepeatState = data.repeat_state === 'track' ? 'track'
                       : data.repeat_state === 'context' ? 'context'
                       : 'off';
    updateRepeatBtn();
  }
  if (data.volume_percent !== undefined) {
    if (volumeSlider)  volumeSlider.value     = data.volume_percent;
    if (volumeValueEl) volumeValueEl.textContent = data.volume_percent + '%';
  }

  refreshLikeState(data.id);
  refreshQueue();
}

async function refreshLikeState(trackId) {
  if (!likeBtn || !trackId) return;
  try {
    const result = await mcp('is_track_saved', { track_id: trackId });
    setLikeUI(!!result?.saved);
  } catch (err) {
    console.warn('Could not check saved state:', err);
  }
}

function setLikeUI(saved) {
  if (!likeIcon || !likeLabel) return;
  if (saved) {
    likeIcon.setAttribute('fill', 'currentColor');
    likeIcon.setAttribute('stroke', 'none');
    likeBtn.classList.add('ctrl-btn-active');
    likeLabel.textContent = 'Liked';
  } else {
    likeIcon.setAttribute('fill', 'none');
    likeIcon.setAttribute('stroke', 'currentColor');
    likeBtn.classList.remove('ctrl-btn-active');
    likeLabel.textContent = 'Like';
  }
}

async function refreshQueue() {
  if (!queueContainer || !queueList) return;
  try {
    const data  = await mcp('get_queue');
    const queue = data?.queue || [];
    if (!queue.length) {
      queueContainer.classList.add('hidden');
      currentQueue = [];
      queueSignature = '';
      return;
    }
    const sig = queue.map(t => t.uri).slice().sort().join('|');
    if (sig === queueSignature) { queueContainer.classList.remove('hidden'); return; }
    queueSignature = sig;
    currentQueue   = queue;
    renderQueue();
    queueContainer.classList.remove('hidden');
  } catch (err) {
    console.warn('Could not fetch queue:', err);
    queueContainer.classList.add('hidden');
  }
}

function renderQueue() {
  if (!queueList) return;
  queueList.innerHTML = currentQueue.map((t, i) => {
    const artist = t.artists?.join(', ') || 'Unknown';
    const thumb  = t.image
      ? `<img src="${t.image}" alt="" class="w-8 h-8 rounded object-cover flex-shrink-0">`
      : '<div class="w-8 h-8 rounded bg-red-900/40 flex-shrink-0"></div>';
    return `<div class="queue-item flex items-center gap-2 rounded-lg p-1 hover:bg-red-500/10 transition-all group" data-uri="${t.uri}">
      <span class="queue-drag cursor-grab text-red-700 hover:text-red-400 select-none px-0.5" title="Drag to reorder">⠿</span>
      ${thumb}
      <div class="min-w-0 flex-1 cursor-pointer" data-queue-index="${i}" title="Play from here">
        <div class="text-xs font-medium text-red-100 truncate">${t.name || 'Unknown'}</div>
        <div class="text-xs text-red-400/70 truncate">${artist}</div>
      </div>
      <button class="queue-play text-red-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1" data-queue-index="${i}" title="Play from here" aria-label="Play from here">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
      </button>
    </div>`;
  }).join('');

  queueList.querySelectorAll('[data-queue-index]').forEach(el => {
    el.addEventListener('click', () => playFromQueue(parseInt(el.dataset.queueIndex)));
  });

  initQueueSortable();
}

function initQueueSortable() {
  if (typeof Sortable === 'undefined' || !queueList) return;
  if (queueList._sortable) queueList._sortable.destroy();
  queueList._sortable = Sortable.create(queueList, {
    animation: 150,
    handle: '.queue-drag',
    ghostClass: 'sortable-ghost',
    onEnd: () => {
      const order = [...queueList.querySelectorAll('.queue-item')].map(el => el.dataset.uri);
      const byUri = Object.fromEntries(currentQueue.map(t => [t.uri, t]));
      currentQueue = order.map(uri => byUri[uri]).filter(Boolean);
      renderQueue();
    },
  });
}

async function playFromQueue(index) {
  if (index < 0 || index >= currentQueue.length) return;
  const uris = currentQueue.slice(index).map(t => t.uri).filter(Boolean);
  if (!uris.length) return;
  try {
    await mcp('play_tracks', { track_uris: uris });
    queueSignature = '';
    setTimeout(refreshNowPlaying, 400);
  } catch (err) {
    toast(playbackErrorMessage(err), 'error');
  }
}

function updateShuffleBtn() {
  if (!shuffleBtn) return;
  if (currentShuffleState) {
    shuffleBtn.classList.add('ctrl-btn-active');
  } else {
    shuffleBtn.classList.remove('ctrl-btn-active');
  }
}

function updateRepeatBtn() {
  if (!repeatLabel) return;
  const labels = { off: 'Repeat', context: 'Repeat ●', track: 'Repeat 1' };
  repeatLabel.textContent = labels[currentRepeatState] || 'Repeat';
  if (repeatBtn) {
    if (currentRepeatState !== 'off') {
      repeatBtn.classList.add('ctrl-btn-active');
    } else {
      repeatBtn.classList.remove('ctrl-btn-active');
    }
  }
}

async function togglePlayPause() {
  try {
    const nowPlaying = await mcp('get_current_playback');
    if (nowPlaying && nowPlaying.playing) {
      await mcp('pause');
    } else {
      await mcp('play');
    }
    setTimeout(refreshNowPlaying, 300);
  } catch (err) {
    console.error('Error toggling playback:', err);
  }
}

async function playNext() {
  try { await mcp('next_track'); setTimeout(refreshNowPlaying, 500); }
  catch (err) { console.error('Error skipping:', err); }
}

async function playPrevious() {
  try { await mcp('previous_track'); setTimeout(refreshNowPlaying, 500); }
  catch (err) { console.error('Error going previous:', err); }
}

async function toggleShuffle() {
  try {
    currentShuffleState = !currentShuffleState;
    await mcp('set_shuffle', { enabled: currentShuffleState });
    updateShuffleBtn();
  } catch (err) {
    currentShuffleState = !currentShuffleState;
    console.error('Error toggling shuffle:', err);
  }
}

async function cycleRepeat() {
  const next = currentRepeatState === 'off'     ? 'context'
             : currentRepeatState === 'context' ? 'track'
             : 'off';
  try {
    if (next === 'context')    await mcp('repeat');
    else if (next === 'track') await mcp('repeat_track');
    else                       await mcp('repeat_off');
    currentRepeatState = next;
    updateRepeatBtn();
  } catch (err) {
    console.error('Error cycling repeat:', err);
  }
}

async function refreshNowPlaying() {
  try {
    const nowPlaying = await mcp('get_current_playback');
    if (nowPlaying && nowPlaying.track) {
      displayNowPlaying(nowPlaying);
    }
  } catch (err) {
    console.warn('Error refreshing now playing:', err);
  }
}

async function toggleLike() {
  const id = lastPlayback?.id;
  if (!id) return;
  const liked = likeBtn?.classList.contains('ctrl-btn-active');
  try {
    if (liked) await mcp('remove_saved_track', { track_id: id });
    else       await mcp('save_track', { track_id: id });
    setLikeUI(!liked);
  } catch (err) {
    console.error('Error toggling like:', err);
  }
}

function openAddToPlaylistModal() {
  const uri  = lastPlayback?.uri;
  const list = document.getElementById('addToPlaylistList');
  const nameEl = document.getElementById('addToPlaylistTrackName');
  if (!uri || !list) return;
  if (nameEl) nameEl.textContent = lastPlayback.track || '';

  const meta = window._playlistMeta || {};
  const entries = Object.entries(meta);
  if (!entries.length) {
    list.innerHTML = '<p class="text-red-400 text-sm">No playlists loaded.</p>';
  } else {
    list.innerHTML = entries.map(([id, m]) => `
      <button class="add-to-pl-item w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-red-500/20 transition-all" data-pl-id="${id}">
        ${m.image
          ? `<img src="${m.image}" alt="" class="w-8 h-8 rounded object-cover flex-shrink-0">`
          : '<div class="w-8 h-8 rounded bg-red-900/40 flex-shrink-0"></div>'}
        <span class="text-sm text-red-100 truncate">${m.name}</span>
      </button>
    `).join('');
    list.querySelectorAll('.add-to-pl-item').forEach(btn => {
      btn.addEventListener('click', () => addCurrentTrackToPlaylist(btn.dataset.plId, uri));
    });
  }
  openModal('addToPlaylistModal');
}

async function addCurrentTrackToPlaylist(playlistId, uri) {
  try {
    await mcp('add_track_to_playlist', { playlist_id: playlistId, track_uri: uri });
    closeModal('addToPlaylistModal');
    toast('Track added to playlist!');
  } catch (err) {
    toast(`Failed to add track: ${err.message}`);
  }
}

async function openGenreStats() {
  if (!displayedTracks.length) { toast('Load a playlist first.'); return; }
  const subtitle = document.getElementById('genreStatsSubtitle');
  const body     = document.getElementById('genreStatsBody');
  openModal('genreStatsModal');
  if (subtitle) subtitle.textContent = `${playlistTitle?.textContent || 'Playlist'} • ${displayedTracks.length} tracks`;
  if (body)     body.innerHTML = '<div class="text-red-400 text-sm">Fetching genres from Last.fm…</div>';

  await loadAllGenres((done, total) => {
    if (body && total) body.innerHTML = `<div class="text-red-400 text-sm">Fetching genres… ${done}/${total}</div>`;
  });

  const counts = {};
  let analyzed = 0;
  for (const t of displayedTracks) {
    if (!t.genre_text) continue;
    analyzed++;
    for (const g of t.genre_text.split(', ')) {
      if (!g) continue;
      const key = g.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (subtitle) subtitle.textContent = `${playlistTitle?.textContent || 'Playlist'} • ${analyzed}/${displayedTracks.length} tracks tagged`;
  if (!body) return;
  if (!sorted.length) { body.innerHTML = '<div class="text-red-400 text-sm">No genre data found.</div>'; return; }

  const max = sorted[0][1];
  body.innerHTML = sorted.map(([genre, count]) => {
    const pct = Math.round((count / max) * 100);
    return `<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-red-200 capitalize">${genre}</span>
        <span class="text-red-400/70">${count}</span>
      </div>
      <div class="w-full bg-gray-700/30 rounded-full h-2">
        <div class="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full" style="width: ${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

async function smartSort(mode) {
  if (!displayedTracks.length) { toast('Load a playlist first.'); return; }
  showLoading();
  try {
    let ordered;
    if (mode === 'genre') {
      await loadAllGenres();
      ordered = groupByGenre(displayedTracks);
    } else {
      const feats = await fetchAudioFeatures(displayedTracks);
      if (Object.keys(feats).length === 0) {
        await loadAllGenres();
        ordered = groupByGenre(displayedTracks);
        toast('Spotify audio features are unavailable for this app - grouped by genre instead.');
      } else {
        const withE = displayedTracks.map(t => ({ t, energy: feats[t.id]?.energy ?? 0.5 }));
        ordered = mode === 'buildup'
          ? withE.sort((a, b) => a.energy - b.energy).map(x => x.t)
          : flowOrder(withE);
      }
    }
    applyReorder(ordered);
  } catch (err) {
    toast(`Smart sort failed: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function applyReorder(orderedTracks) {
  pushUndo();
  displayedTracks = orderedTracks;
  if (sortFeatureSelect) sortFeatureSelect.value = 'manual';
  if (filterInput) filterInput.value = '';
  renderTracks(displayedTracks);
  updatePlaylistStats();
}

async function fetchAudioFeatures(tracks) {
  const token = getToken();
  if (!token) return {};
  const ids = tracks.map(t => t.id).filter(Boolean);
  const map = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const res = await fetch(`/api/audio-features?ids=${batch.join(',')}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const f of (data.audio_features || [])) {
        if (f && f.id) map[f.id] = f;
      }
    } catch {}
  }
  return map;
}

function flowOrder(items) {
  const pool = [...items].sort((a, b) => a.energy - b.energy);
  const result = [pool.shift()];
  while (pool.length) {
    const cur = result[result.length - 1].energy;
    let bestIdx = 0, bestDiff = Infinity;
    for (let k = 0; k < pool.length; k++) {
      const d = Math.abs(pool[k].energy - cur);
      if (d < bestDiff) { bestDiff = d; bestIdx = k; }
    }
    result.push(pool.splice(bestIdx, 1)[0]);
  }
  return result.map(x => x.t);
}

function groupByGenre(tracks) {
  const groups = {};
  for (const t of tracks) {
    const g = (t.genre_text ? t.genre_text.split(',')[0].trim().toLowerCase() : '') || 'unknown';
    (groups[g] = groups[g] || []).push(t);
  }
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return groups[b].length - groups[a].length;
  });
  const out = [];
  for (const k of keys) {
    groups[k].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    out.push(...groups[k]);
  }
  return out;
}
