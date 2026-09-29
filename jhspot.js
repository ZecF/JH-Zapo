/**
 * spotifySearch.js
 * Search Spotify TANPA API key/login — pakai Puppeteer, navigate langsung ke
 * halaman search asli (open.spotify.com/search/{query}) dan nangkep response
 * JSON yang di-fetch browser secara natural (bukan manggil api.spotify.com
 * manual pakai token anonim).
 *
 * KENAPA BUKAN "ambil token anonim → panggil api.spotify.com/v1/search manual":
 *   Token anonim itu SANGAT gampang kena rate-limit di endpoint resmi —
 *   ada laporan 2-3 request manual aja bisa kena `Retry-After: ~22 jam`.
 *   Halaman /search sendiri juga cuma render lewat JS (nggak ada HTML
 *   berguna dari plain HTTP GET), jadi emang HARUS lewat browser beneran.
 *   Dengan nangkep response network dari navigasi normal (bukan hajar API
 *   manual berkali-kali), pattern trafficnya lebih mirip user asli.
 *
 * CATATAN PENTING buat rencana download nanti:
 *   Lagu FULL nggak bisa didownload lewat scraping cara apapun (butuh OAuth
 *   + Widevine DRM). Yang bisa diambil cuma PREVIEW 30 DETIK (field
 *   `preview_url` di hasil search ini, kalau ada — kadang null tergantung
 *   licensing/region).
 *
 * npm install puppeteer
 */

import puppeteer from 'puppeteer';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Deep-search generik: cari semua object yang punya "uri" berformat spotify:{type}:... */
function deepFindByUriPrefix(obj, prefix, found = new Map(), depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 20) return found;
  if (typeof obj.uri === 'string' && obj.uri.startsWith(prefix) && obj.name) {
    if (!found.has(obj.uri)) found.set(obj.uri, obj);
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') deepFindByUriPrefix(val, prefix, found, depth + 1);
  }
  return found;
}

function extractFromBodies(bodies, prefix) {
  const merged = new Map();
  for (const text of bodies) {
    try {
      const parsed = JSON.parse(text);
      deepFindByUriPrefix(parsed, prefix, merged);
    } catch (_) {
      /* skip body yg bukan JSON valid */
    }
  }
  return [...merged.values()];
}

function mapTrack(t) {
  const tryExtract = () => {
    if (Array.isArray(t.artists?.items)) return t.artists.items.map((a) => a.profile?.name || a.name).filter(Boolean);
    if (Array.isArray(t.artists)) return t.artists.map((a) => a.profile?.name || a.name).filter(Boolean);
    if (Array.isArray(t.firstArtist?.items)) return t.firstArtist.items.map((a) => a.profile?.name || a.name).filter(Boolean);
    if (t.artist?.name) return [t.artist.name];
    return [];
  };
  const artistsList = tryExtract();

  const result = {
    id: t.uri?.split(':')[2],
    uri: t.uri,
    name: t.name,
    artists: artistsList.join(', ') || undefined,
    album: t.albumOfTrack?.name || t.album?.name,
    duration_ms: t.duration?.totalMilliseconds || t.duration_ms,
    cover: t.albumOfTrack?.coverArt?.sources?.[0]?.url || t.album?.images?.[0]?.url,
    preview_url: t.previewUrl || t.preview_url || null,
    spotify_url: `https://open.spotify.com/track/${t.uri?.split(':')[2]}`,
  };

  if (!artistsList.length) {
    // belum ketemu field artist yang cocok — sertain raw keys biar gampang di-debug
    result._debugArtistKeys = Object.keys(t).filter((k) => /artist/i.test(k));
  }

  return result;
}

function mapAlbum(a) {
  return {
    id: a.uri?.split(':')[2],
    uri: a.uri,
    name: a.name,
    artists: Array.isArray(a.artists?.items)
      ? a.artists.items.map((x) => x.profile?.name).filter(Boolean).join(', ')
      : Array.isArray(a.artists)
      ? a.artists.map((x) => x.name).filter(Boolean).join(', ')
      : undefined,
    cover: a.coverArt?.sources?.[0]?.url || a.images?.[0]?.url,
    spotify_url: `https://open.spotify.com/album/${a.uri?.split(':')[2]}`,
  };
}

function mapArtist(a) {
  return {
    id: a.uri?.split(':')[2],
    uri: a.uri,
    name: a.name,
    image: a.visuals?.avatarImage?.sources?.[0]?.url || a.images?.[0]?.url,
    spotify_url: `https://open.spotify.com/artist/${a.uri?.split(':')[2]}`,
  };
}

function mapPlaylist(p) {
  return {
    id: p.uri?.split(':')[2],
    uri: p.uri,
    name: p.name,
    owner: p.ownerV2?.data?.name || p.owner?.display_name,
    cover: p.images?.items?.[0]?.sources?.[0]?.url || p.images?.[0]?.url,
    spotify_url: `https://open.spotify.com/playlist/${p.uri?.split(':')[2]}`,
  };
}

/**
 * @param {string} query
 * @param {object} opts
 * @param {boolean} [opts.headless=true]
 * @returns {Promise<{success:boolean, query?:string, results?:object, error?:string, debug?:object}>}
 */
async function searchSpotify(query, opts = {}) {
  const { headless = true } = opts;

  if (!query || !query.trim()) {
    return { success: false, error: 'Query pencarian kosong.' };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 900 });

    const capturedBodies = [];
    page.on('response', async (res) => {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('application/json')) {
          const text = await res.text();
          if (text && text.length < 3_000_000) capturedBodies.push(text);
        }
      } catch (_) {
        /* response mungkin udah kelar, skip */
      }
    });

    const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2000)); // jeda buat request lanjutan/lazy

    if (capturedBodies.length === 0) {
      return {
        success: false,
        error: 'Nggak ada response JSON yang ke-capture — kemungkinan kena halaman login/consent dulu, atau butuh interaksi manual (klik search box).',
      };
    }

    const tracks = extractFromBodies(capturedBodies, 'spotify:track:').map(mapTrack);
    const albums = extractFromBodies(capturedBodies, 'spotify:album:').map(mapAlbum);
    const artists = extractFromBodies(capturedBodies, 'spotify:artist:').map(mapArtist);
    const playlists = extractFromBodies(capturedBodies, 'spotify:playlist:').map(mapPlaylist);

    if (!tracks.length && !albums.length && !artists.length && !playlists.length) {
      return {
        success: false,
        error: 'JSON ke-capture tapi nggak nemu object track/album/artist/playlist — struktur GraphQL Spotify kemungkinan beda dari dugaan.',
        debug: { bodiesCaptured: capturedBodies.length, sampleBodyHead: capturedBodies[0]?.slice(0, 500) },
      };
    }

    return {
      success: true,
      query,
      results: { tracks, albums, artists, playlists },
    };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export { searchSpotify };

// ---- contoh pemakaian ----
import { fileURLToPath } from 'url';
import process from 'process';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const query = process.argv[2];
  if (!query) {
    console.log('Usage: node spotifySearch.js "<query>"');
    process.exit(1);
  }
  searchSpotify(query).then((res) => console.log(JSON.stringify(res, null, 2)));
}
