/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass. 
 * Hargai sebagaimana u mau dihargai.
 * jhstory.js — Scraper IG Story + Highlights DL Lengkap by JamvanHax0r
 */

import puppeteer from 'puppeteer';

const IG_SESSIONID = '13559937571%3ApfEL19QUSvoElK%3A20%3AAYnreLPbXzsSi5BGYafhD1_bgedbkwXGgFyVPVJ31A';

const PROXY_API_URL = 'https://proxy.jhx.my.id/jh-proxy';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchRandomProxy() {
  const res = await fetch(PROXY_API_URL);
  if (!res.ok) throw new Error(`Gagal ambil proxy list, status=${res.status}`);

  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Proxy list kosong / format response bukan array.');
  }

  const picked = list[Math.floor(Math.random() * list.length)];
  const parts = picked.split(':');
  if (parts.length !== 4) {
    throw new Error(`Format proxy dari API nggak sesuai dugaan ("host:port:user:pass"): "${picked}"`);
  }
  const [host, port, username, password] = parts;
  return { host, port, username, password };
}

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function extractDataSjsBlocks(rawHtml) {
  if (!rawHtml) return [];
  const blocks = [];
  const re = /<script[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(rawHtml)) !== null) blocks.push(m[1]);
  return blocks;
}

function looksLikeReelObject(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!Array.isArray(obj.items) || obj.items.length === 0) return false;
  const first = obj.items[0];
  const itemHasMedia = !!(first && (first.image_versions2 || first.video_versions));
  const hasIdentity = !!(obj.user || obj.owner || obj.id || obj.pk);
  return itemHasMedia && hasIdentity;
}

function matchesReelTarget(obj, targetMode, value) {
  if (!obj) return false;
  if (targetMode === 'highlight') {
    return String(obj.id) === String(value) || String(obj.pk) === String(value);
  }
  const user = obj.user || obj.owner;
  if (!user) return false;
  return (
    (user.username && user.username.toLowerCase() === String(value).toLowerCase()) ||
    String(user.pk) === String(value)
  );
}

function deepFindReelObject(obj, targetMode, value, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 15) return null;
  if (looksLikeReelObject(obj) && matchesReelTarget(obj, targetMode, value)) return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      const found = deepFindReelObject(val, targetMode, value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findReelFromDataSjs(rawHtml, targetMode, value) {
  const blocks = extractDataSjsBlocks(rawHtml);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      const found = deepFindReelObject(parsed, targetMode, value);
      if (found) return found;
    } catch (_) {
    }
  }
  return null;
}

function findReelFromJsonBodies(bodies, targetMode, value) {
  for (const text of bodies) {
    try {
      const parsed = JSON.parse(text);
      const found = deepFindReelObject(parsed, targetMode, value);
      if (found) return found;
    } catch (_) {
    }
  }
  return null;
}

function deepFindUserFullName(obj, username, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 15) return null;
  if (
    obj.username &&
    String(obj.username).toLowerCase() === String(username).toLowerCase() &&
    obj.full_name
  ) {
    return obj.full_name;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      const found = deepFindUserFullName(val, username, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findFullNameFromHtml(rawHtml, username) {
  const blocks = extractDataSjsBlocks(rawHtml);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      const found = deepFindUserFullName(parsed, username);
      if (found) return found;
    } catch (_) {
    }
  }
  return null;
}

function mapReelItem(item) {
  const isVideo = !!item.video_versions || item.media_type === 2;
  const imgUrl = item.image_versions2?.candidates?.[0]?.url || null;
  const vidUrl = item.video_versions?.[0]?.url || null;
  return {
    storyId: item.pk || item.id || null,
    type: isVideo ? 'VIDEO' : 'IMAGE',
    downloadUrl: isVideo ? vidUrl || null : imgUrl || null,
    thumbnail: imgUrl || null,
    width: item.original_width || item.image_versions2?.candidates?.[0]?.width || null,
    height: item.original_height || item.image_versions2?.candidates?.[0]?.height || null,
    takenAt: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
    expiringAt: item.expiring_at ? new Date(item.expiring_at * 1000).toISOString() : null,
  };
}

function normalizeReelObject(reel) {
  if (!reel) return null;
  const user = reel.user || reel.owner || {};
  const items = Array.isArray(reel.items) ? reel.items.map(mapReelItem).filter((x) => x.downloadUrl) : [];
  return {
    username: user.username || null,
    fullName: user.full_name || null,
    isVerified: user.is_verified ?? null,
    profilePicUrl: user.profile_pic_url || null,
    highlightTitle: reel.title ? decodeEntities(reel.title) : null,
    items,
  };
}

async function getStoryOrHighlight(target) {
  if (!IG_SESSIONID || IG_SESSIONID === 'xxx') {
    return { success: false, error: 'IG_SESSIONID belum diisi di igStory.js.' };
  }

  const highlightMatch = target.match(/instagram\.com\/stories\/highlights\/(\d+)/);
  const storyMatch = target.match(/instagram\.com\/stories\/([A-Za-z0-9_.]+)/);

  let mode, targetValue;
  if (highlightMatch) {
    mode = 'highlight';
    targetValue = highlightMatch[1];
  } else if (storyMatch && storyMatch[1] !== 'highlights') {
    mode = 'story';
    targetValue = storyMatch[1];
  } else {
    const trimmed = target.trim().replace(/^@/, '');
    if (/^\d+$/.test(trimmed)) {
      mode = 'highlight';
      targetValue = trimmed;
    } else if (/^[A-Za-z0-9_.]+$/.test(trimmed)) {
      mode = 'story';
      targetValue = trimmed;
    } else {
      return { success: false, error: 'Input nggak valid — bisa URL story/highlight, username polos, atau ID highlight angka.' };
    }
  }

  const navigateUrl =
    mode === 'highlight'
      ? `https://www.instagram.com/stories/highlights/${targetValue}/`
      : `https://www.instagram.com/stories/${targetValue}/`;

  let proxy = null;
  try {
    proxy = await fetchRandomProxy();
  } catch (e) {
    console.error(`[igStory] Gagal ambil proxy (${e.message}), lanjut tanpa proxy.`);
  }

  const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'];
  if (proxy) launchArgs.push(`--proxy-server=${proxy.host}:${proxy.port}`);

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: launchArgs });

    const page = await browser.newPage();
    if (proxy?.username && proxy?.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setCookie({
      name: 'sessionid',
      value: IG_SESSIONID,
      domain: '.instagram.com',
      path: '/',
      httpOnly: true,
      secure: true,
    });

    const capturedJsonBodies = [];
    page.on('response', async (res) => {
      try {
        const ct = res.headers()['content-type'] || '';
        const rurl = res.url();
        const looksRelevant = /graphql|\/api\/v1\/|query|reels_media|highlight/i.test(rurl);
        if (ct.includes('application/json') && looksRelevant) {
          const text = await res.text();
          if (text && text.length < 3_000_000) capturedJsonBodies.push(text);
        }
      } catch (_) {
      }
    });

    const response = await page.goto(navigateUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    const httpStatus = response ? response.status() : null;

    let html = null;
    try {
      html = response ? await response.text() : null;
    } catch (_) {
    }
    if (!html || html.length < 500) html = await page.content();

    await new Promise((r) => setTimeout(r, 2500));

    const domHtml = await page.content();

    const reelFromNetwork = findReelFromJsonBodies(capturedJsonBodies, mode, targetValue);
    const reelFromSjsInitial = findReelFromDataSjs(html, mode, targetValue);
    const reelFromSjsRendered = findReelFromDataSjs(domHtml, mode, targetValue);

    const rawReelObject = reelFromNetwork || reelFromSjsInitial || reelFromSjsRendered;
    const normalized = normalizeReelObject(rawReelObject);

    if (normalized && !normalized.fullName && normalized.username) {
      normalized.fullName = findFullNameFromHtml(domHtml, normalized.username) || findFullNameFromHtml(html, normalized.username) || null;
    }

    const _diag = {
      httpStatus,
      usedProxy: !!proxy,
      jsonResponsesCaptured: capturedJsonBodies.length,
      foundVia: {
        networkJson: !!reelFromNetwork,
        dataSjsInitial: !!reelFromSjsInitial,
        dataSjsRendered: !!reelFromSjsRendered,
      },
      mode,
      targetValue,
    };

    if (!normalized || normalized.items.length === 0) {
      return {
        success: false,
        error: 'Story/highlight nggak ketemu atau lagi kosong (bisa juga akun private & belum di-follow akun yang digunakan untuk skrep ini).',
        debug: { ..._diag, htmlSnippetHead: (html || domHtml || '').slice(0, 800) },
      };
    }

    return {
      success: true,
      data: {
        mode,
        targetValue,
        author: {
          username: normalized.username,
          fullName: normalized.fullName,
          isVerified: normalized.isVerified === true,
          profilePicUrl: normalized.profilePicUrl,
        },
        highlightTitle: normalized.highlightTitle,
        itemCount: normalized.items.length,
        items: normalized.items,
      },
      debug: _diag,
    };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export { getStoryOrHighlight };

import { fileURLToPath } from 'url';
import process from 'process';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node igStory.js <username | highlight_id | url_story/highlight>');
    process.exit(1);
  }
  getStoryOrHighlight(target).then((res) => console.log(JSON.stringify(res, null, 2)));
}
