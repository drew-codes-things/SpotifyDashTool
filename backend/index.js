require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const axios = require('axios');
const path = require('path');
const { callTool, ensureInitialized } = require('./mcp-bridge');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const SPOTIFY_API_BASE = process.env.SPOTIFY_API_BASE || 'https://api.spotify.com/v1';
const VERIFIED_TOKEN_TTL_MS = 60 * 1000;
const JSON_BODY_LIMIT = '2mb';
const SPOTIFY_TIMEOUT_MS = Number(process.env.SPOTIFY_TIMEOUT_MS) || 10000;
const spotifyHttp = axios.create({ timeout: SPOTIFY_TIMEOUT_MS });
const PAYLOAD_TOO_LARGE = 413;
const INTERNAL_SERVER_ERROR = 500;

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && !req.is('application/json')) {
    return res.status(415).json({ error: 'API requests must be JSON.' });
  }
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  BACKEND_REDIRECT_URI,
  LASTFM_API_KEY
} = process.env;

function getBasicAuth() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
  return Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
}

app.get('/api/config', (req, res) => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !BACKEND_REDIRECT_URI) {
    console.error('Missing required env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, or BACKEND_REDIRECT_URI');
    return res.status(500).json({
      error: 'Server misconfiguration: missing Spotify credentials. Check .env file.'
    });
  }

  res.json({
    spotifyClientId: SPOTIFY_CLIENT_ID,
    redirectUri: BACKEND_REDIRECT_URI,
    lastfmEnabled: Boolean(LASTFM_API_KEY)
  });
});

app.get('/callback', (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    return res.redirect(`/?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`);
  }

  res.redirect('/');
});

app.post('/api/token', async (req, res) => {
  const { code, code_verifier } = req.body;
  const basicAuth = getBasicAuth();
  if (!basicAuth) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Spotify credentials. Check .env file.' });
  }
  try {
    const params = new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: BACKEND_REDIRECT_URI,
    });

    if (code_verifier) params.append('code_verifier', code_verifier);

    const response = await spotifyHttp.post(
      'https://accounts.spotify.com/api/token',
      params,
      { headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(response.data);
  } catch (err) {
    console.error('/api/token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Token exchange failed', details: err.response?.data });
  }
});

app.post('/api/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  const basicAuth = getBasicAuth();
  if (!basicAuth) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Spotify credentials. Check .env file.' });
  }
  try {
    const response = await spotifyHttp.post('https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      { headers: { Authorization: `Basic ${basicAuth}` } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Refresh failed', details: err.response?.data });
  }
});

app.get('/api/playlists', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  try {
    const playlists = [];
    let url = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;

    while (url) {
      const { data } = await spotifyHttp.get(url, {
        headers: { Authorization: authHeader },
      });

      for (const p of data.items || []) {
        if (!p) continue;
        const images = p.images || [];
        let trackTotal = p.items?.total ?? p.tracks?.total;

        if (trackTotal === undefined || trackTotal === null) {
          try {
            const fullPlaylist = await spotifyHttp.get(`${SPOTIFY_API_BASE}/playlists/${p.id}?fields=items(total),tracks(total)`, {
              headers: { Authorization: authHeader },
            });
            trackTotal = fullPlaylist.data?.items?.total ?? fullPlaylist.data?.tracks?.total ?? 0;
          } catch (detailErr) {
            console.warn(`Could not fetch full details for playlist ${p.id}:`, detailErr.message);
            trackTotal = 0;
          }
        }

        playlists.push({
          id: p.id,
          name: p.name,
          track_count: trackTotal,
          owner: p.owner?.display_name || p.owner?.id || 'Unknown',
          public: p.public ?? false,
          image: images[0]?.url || null,
        });
      }

      url = data.next || null;
    }

    res.json(playlists);
  } catch (err) {
    console.error('GET /api/playlists error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.error?.message || err.message,
    });
  }
});

function tagsFrom(node) {
  const t = node?.tag;
  const arr = Array.isArray(t) ? t : (t ? [t] : []);
  return arr.map(x => x.name).filter(Boolean);
}

app.get('/api/genres', async (req, res) => {
  const { artist, track } = req.query;
  if (!artist || !track || !LASTFM_API_KEY) return res.json({ tags: [] });
  const base = `https://ws.audioscrobbler.com/2.0/?api_key=${LASTFM_API_KEY}&format=json&autocorrect=1`;
  try {
    const trackUrl = `${base}&method=track.getInfo&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}`;
    const { data } = await axios.get(trackUrl, { timeout: 8000 });
    let tags = tagsFrom(data?.track?.toptags);

    if (!tags.length) {
      const artistUrl = `${base}&method=artist.getTopTags&artist=${encodeURIComponent(artist)}`;
      try {
        const { data: aData } = await axios.get(artistUrl, { timeout: 8000 });
        tags = tagsFrom(aData?.toptags);
      } catch {}
    }

    res.json({ tags: tags.slice(0, 5) });
  } catch (err) {
    console.error('GET /api/genres error:', err.message);
    res.json({ tags: [] });
  }
});

const verifiedTokens = new Map();
let mcpAccountId = null;

function bearerTokenFrom(req) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  return match ? match[1] : null;
}

function forgetExpiredTokens(now) {
  for (const [token, entry] of verifiedTokens) {
    if (entry.expiresAt <= now) verifiedTokens.delete(token);
  }
}

async function spotifyUserIdForToken(token) {
  const now = Date.now();
  const cached = verifiedTokens.get(token);
  if (cached && cached.expiresAt > now) return cached.userId;

  const { data } = await spotifyHttp.get(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!data?.id) throw new Error('Spotify /me returned no user id');
  forgetExpiredTokens(now);
  verifiedTokens.set(token, { userId: data.id, expiresAt: now + VERIFIED_TOKEN_TTL_MS });
  return data.id;
}

async function getMcpAccountId() {
  if (mcpAccountId) return mcpAccountId;
  const profile = await callTool('get_user_profile');
  if (!profile?.user_id) throw new Error('MCP server did not report its Spotify account');
  mcpAccountId = profile.user_id;
  return mcpAccountId;
}

async function requireMcpAccountOwner(req, res, next) {
  const token = bearerTokenFrom(req);
  if (!token) return res.status(401).json({ error: 'Missing Spotify access token. Please log in again.' });

  let userId;
  try {
    userId = await spotifyUserIdForToken(token);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      return res.status(401).json({ error: 'Spotify rejected the access token. Please log in again.' });
    }
    console.error('MCP auth: could not verify the Spotify token:', err.message);
    return res.status(502).json({ error: `Could not verify the Spotify login: ${err.message}` });
  }

  let accountId;
  try {
    accountId = await getMcpAccountId();
  } catch (err) {
    console.error('MCP auth: could not read the MCP account:', err.message);
    return res.status(503).json({ error: `MCP server unavailable: ${err.message}` });
  }

  if (userId !== accountId) {
    return res.status(403).json({ error: 'This Spotify login is not the account the MCP server controls.' });
  }
  next();
}

app.post('/api/mcp/:tool', requireMcpAccountOwner, async (req, res) => {
  const { tool } = req.params;
  const args = req.body?.args || {};
  try {
    const result = await callTool(tool, args);
    res.json({ result });
  } catch (err) {
    console.error(`MCP tool call failed [${tool}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tracks/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const response = await spotifyHttp.get(`${SPOTIFY_API_BASE}/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error('GET /api/tracks/:trackId error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || INTERNAL_SERVER_ERROR;
  if (status === PAYLOAD_TOO_LARGE) {
    return res.status(status).json({ error: `Request too large: the limit is ${JSON_BODY_LIMIT}.` });
  }
  if (status >= INTERNAL_SERVER_ERROR || !err.expose) {
    console.error(`${req.method} ${req.path} failed:`, err.message);
    return res.status(status).json({ error: 'Internal server error' });
  }
  res.status(status).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
