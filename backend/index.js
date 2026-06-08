require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { callTool, ensureInitialized } = require('./mcp-bridge');

const app = express();
const PORT = 4000;
const HOST = '127.0.0.1';

app.use(cors());
app.use(express.json());
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
    lastfmApiKey: LASTFM_API_KEY || ''
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

    const response = await axios.post(
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
    const response = await axios.post('https://accounts.spotify.com/api/token',
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
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50&fields=next,items(id,name,owner,public,images,tracks)';

    while (url) {
      const { data } = await axios.get(url, {
        headers: { Authorization: authHeader },
      });

      for (const p of data.items || []) {
        if (!p) continue;
        const images = p.images || [];
        let trackTotal = p.tracks?.total;

        if (trackTotal === undefined || trackTotal === null) {
          try {
            const fullPlaylist = await axios.get(`https://api.spotify.com/v1/playlists/${p.id}?fields=tracks(total)`, {
              headers: { Authorization: authHeader },
            });
            trackTotal = fullPlaylist.data?.tracks?.total ?? 0;
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
  const base = `http://ws.audioscrobbler.com/2.0/?api_key=${LASTFM_API_KEY}&format=json&autocorrect=1`;
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

app.post('/api/mcp/:tool', async (req, res) => {
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
    const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error('GET /api/tracks/:trackId error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

app.get('/api/audio-features', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 100);
  if (!ids.length) return res.json({ audio_features: [] });

  try {
    const { data } = await axios.get(
      `https://api.spotify.com/v1/audio-features?ids=${ids.join(',')}`,
      { headers: { Authorization: authHeader } }
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 404) {
      return res.json({ audio_features: [] });
    }
    console.error('GET /api/audio-features error:', err.response?.data || err.message);
    res.status(status || 500).json({
      error: err.response?.data?.error?.message || err.message,
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
