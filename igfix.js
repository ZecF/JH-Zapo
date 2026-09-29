/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass. 
 * Hargai sebagaimana u mau dihargai.
 * igfix.js — Scraper IGDL Lengkap by JAMVANHAX0R
 */

import axios from 'axios';

const SAFARI_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function getCleanUrl(url) {
  return url.trim().split('?')[0];
}

function cleanSlashes(s) {
  return typeof s === 'string' ? s.replace(/\\\//g, '/') : s;
}

async function scrapeViaEmbed(igUrl, pathType, shortcode) {
  const embedUrl = `https://www.instagram.com/${pathType}/${shortcode}/embed/captioned/`;

  let res;
  try {
    res = await axios.get(embedUrl, {
      headers: {
        'User-Agent': SAFARI_MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
      validateStatus: () => true,
    });
  } catch (e) {
    return { success: false, error: `Request ke Instagram gagal: ${e.message}` };
  }

  if (res.status !== 200) {
    return {
      success: false,
      error: `Instagram balikin status ${res.status} — post mungkin private/dihapus, atau shortcode salah.`,
    };
  }

  const html = String(res.data);
  const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const idx = unescaped.indexOf('"shortcode_media":');

  if (idx === -1) {
    const titleMatch = unescaped.match(/<title[^>]*>([^<]*)<\/title>/i);
    return {
      success: false,
      error:
        'shortcode_media nggak ketemu di embed page. Kemungkinan: (1) akun/post private, (2) pemilik akun MATIIN izin embedding (setting terpisah dari private/public, cukup umum kejadian), atau (3) post udah dihapus/shortcode salah.',
      debug: {
        pageTitle: titleMatch ? titleMatch[1].trim() : null,
        htmlSnippet: unescaped.slice(0, 500),
      },
    };
  }

  const start = idx + '"shortcode_media":'.length;
  let depth = 0;
  let end = -1;
  for (let i = start; i < unescaped.length; i++) {
    if (unescaped[i] === '{') depth++;
    else if (unescaped[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) {
    return { success: false, error: 'Gagal parse JSON shortcode_media (unbalanced braces).' };
  }

  let media;
  try {
    media = JSON.parse(unescaped.slice(start, end));
  } catch (e) {
    return { success: false, error: `Gagal JSON.parse shortcode_media: ${e.message}` };
  }

  const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';

  const metadata = {
    shortcode: media.shortcode,
    caption,
    owner_username: media.owner?.username,
    is_video: !!media.is_video,
    is_carousel: !!media.edge_sidecar_to_children,
    like_count: media.edge_liked_by?.count ?? media.edge_media_preview_like?.count,
    comment_count: media.edge_media_to_comment?.count ?? media.edge_media_to_parent_comment?.count,
    video_view_count: media.video_view_count,
    video_duration: media.video_duration,
    dimensions: media.dimensions,
    taken_at_timestamp: media.taken_at_timestamp,
  };

  const downloads = [];

  if (media.edge_sidecar_to_children?.edges?.length) {
    media.edge_sidecar_to_children.edges.forEach((edge, i) => {
      const n = edge.node;
      const mediaUrl = cleanSlashes(n.video_url) || cleanSlashes(n.display_url);
      if (mediaUrl) {
        downloads.push({
          url: mediaUrl,
          type: n.is_video ? 'VIDEO' : 'IMAGE',
          quality: n.is_video ? `HD Video ${i + 1}` : `HD Photo ${i + 1}`,
          thumbnail: cleanSlashes(n.display_url) || mediaUrl,
        });
      }
    });
  } else {
    const mediaUrl = cleanSlashes(media.video_url) || cleanSlashes(media.display_url);
    if (mediaUrl) {
      downloads.push({
        url: mediaUrl,
        type: media.is_video ? 'VIDEO' : 'IMAGE',
        quality: media.is_video ? 'HD Video' : 'HD Photo',
        thumbnail: cleanSlashes(media.display_url) || mediaUrl,
      });
    }
  }

  if (!downloads.length) {
    return {
      success: false,
      error: media.is_video
        ? 'Post ditandai video tapi video_url kosong (kemungkinan audio-licensing/regional restriction dari IG).'
        : 'Nggak ada media url yang bisa diambil dari hasil parse.',
      metadata,
    };
  }

  return {
    success: true,
    title: caption ? caption.slice(0, 80) : 'Instagram Media',
    thumbnail: downloads[0].thumbnail,
    downloads,
    metadata,
    sourceUrl: igUrl,
  };
}

import puppeteer from 'puppeteer';

const IG_SESSIONID = '13559937571%3ApfEL19QUSvoElK%3A20%3AAYnudxFGohUM1t80wUrYNYM6TnJ0ZW25R1TwYMXgqw';
const PROXY_API_URL = 'https://proxy.jhx.my.id/jh-proxy';
const SESSION_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchRandomProxy() {
  const res = await fetch(PROXY_API_URL);
  if (!res.ok) throw new Error(`Gagal ambil proxy list, status=${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) throw new Error('Proxy list kosong.');
  const picked = list[Math.floor(Math.random() * list.length)];
  const [host, port, username, password] = picked.split(':');
  return { host, port, username, password };
}

function extractDataSjsBlocks(rawHtml) {
  if (!rawHtml) return [];
  const blocks = [];
  const re = /<script[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(rawHtml)) !== null) blocks.push(m[1]);
  return blocks;
}

function looksLikePostMedia(obj, targetShortcode) {
  if (!obj || typeof obj !== 'object') return false;

  const identifier = obj.shortcode ?? obj.code;
  if (identifier === undefined || identifier === null) return false;
  if (String(identifier) !== String(targetShortcode)) return false;

  const hasGraphqlMedia = !!(obj.video_url || obj.display_url || obj.edge_sidecar_to_children);
  const hasMobileMedia = !!(obj.image_versions2 || obj.video_versions || obj.carousel_media);
  return hasGraphqlMedia || hasMobileMedia;
}

function deepFindPostMedia(obj, targetShortcode, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 15) return null;
  if (looksLikePostMedia(obj, targetShortcode)) return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      const found = deepFindPostMedia(val, targetShortcode, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function findPostMediaFromSources(sources, targetShortcode) {
  for (const text of sources) {
    try {
      const parsed = JSON.parse(text);
      const found = deepFindPostMedia(parsed, targetShortcode);
      if (found) return found;
    } catch (_) {
    }
  }
  return null;
}

function normalizePostMedia(media) {
  const toItem = (n, i) => {
    const isVideo = !!(n.video_url || n.video_versions?.length || n.is_video);
    const url = cleanSlashes(n.video_url) || cleanSlashes(n.video_versions?.[0]?.url) ||
      cleanSlashes(n.display_url) || cleanSlashes(n.image_versions2?.candidates?.[0]?.url);
    const thumb = cleanSlashes(n.display_url) || cleanSlashes(n.image_versions2?.candidates?.[0]?.url) || url;
    return url ? { url, type: isVideo ? 'VIDEO' : 'IMAGE', quality: isVideo ? `HD Video ${i}` : `HD Photo ${i}`, thumbnail: thumb } : null;
  };

  const downloads = [];
  const carouselEdges = media.edge_sidecar_to_children?.edges?.map((e) => e.node) || media.carousel_media || null;

  if (carouselEdges?.length) {
    carouselEdges.forEach((n, i) => {
      const item = toItem(n, i + 1);
      if (item) downloads.push(item);
    });
  } else {
    const item = toItem(media, 1);
    if (item) {
      item.quality = item.type === 'VIDEO' ? 'HD Video' : 'HD Photo';
      downloads.push(item);
    }
  }

  const caption =
    media.edge_media_to_caption?.edges?.[0]?.node?.text ||
    media.caption?.text ||
    '';

  return {
    downloads,
    metadata: {
      shortcode: media.shortcode || media.code,
      caption,
      owner_username: media.owner?.username || media.user?.username,
      is_video: downloads[0]?.type === 'VIDEO',
      is_carousel: !!carouselEdges?.length,
      like_count: media.edge_liked_by?.count ?? media.edge_media_preview_like?.count ?? media.like_count,
      comment_count: media.edge_media_to_comment?.count ?? media.comment_count,
      video_view_count: media.video_view_count,
      video_duration: media.video_duration,
    },
  };
}

async function scrapeViaSession(igUrl, pathType, shortcode) {
  if (!IG_SESSIONID || IG_SESSIONID === 'xxx') {
    return { success: false, error: 'IG_SESSIONID belum diisi di igdl.js — nggak bisa fallback ke mode logged-in.' };
  }

  let proxy = null;
  try {
    proxy = await fetchRandomProxy();
  } catch (e) {
    console.error(`[igdl] Gagal ambil proxy (${e.message}), lanjut tanpa proxy.`);
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
    await page.setUserAgent(SESSION_UA);
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
        if (ct.includes('application/json')) {
          const text = await res.text();
          if (text && text.length < 3_000_000) capturedJsonBodies.push(text);
        }
      } catch (_) {
      }
    });

    await page.goto(`https://www.instagram.com/${pathType}/${shortcode}/`, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const domHtml = await page.content();
    const sjsBlocks = extractDataSjsBlocks(domHtml);
    const media = findPostMediaFromSources([...capturedJsonBodies, ...sjsBlocks], shortcode);

    if (!media) {
      return {
        success: false,
        error: 'Media object nggak ketemu walau udah mode logged-in — kemungkinan post beneran udah dihapus, atau struktur data IG berubah.',
        debug: { jsonBodiesCaptured: capturedJsonBodies.length, sjsBlocksFound: sjsBlocks.length, usedProxy: !!proxy },
      };
    }

    const { downloads, metadata } = normalizePostMedia(media);
    if (!downloads.length) {
      return { success: false, error: 'Media object ketemu tapi nggak ada URL yang bisa diambil.', metadata };
    }

    return {
      success: true,
      title: metadata.caption ? metadata.caption.slice(0, 80) : 'Instagram Media',
      thumbnail: downloads[0].thumbnail,
      downloads,
      metadata,
      sourceUrl: igUrl,
      source: 'session_fallback',
    };
  } catch (e) {
    return { success: false, error: `scrapeViaSession error: ${e.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function igdl(igUrl) {
  if (!igUrl || !/instagram\.com/.test(igUrl)) {
    return { success: false, error: 'URL bukan link instagram yang valid' };
  }

  const cleanUrl = getCleanUrl(igUrl);
  const shortcodeMatch = cleanUrl.match(/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!shortcodeMatch) {
    return {
      success: false,
      error: 'Format URL nggak dikenali — pastiin ini link post/reel/igtv, bukan story/profile.',
    };
  }
  const pathType = shortcodeMatch[1] === 'reels' ? 'reel' : shortcodeMatch[1];
  const shortcode = shortcodeMatch[2];

  const embedResult = await scrapeViaEmbed(igUrl, pathType, shortcode);
  if (embedResult.success) return { ...embedResult, source: 'embed' };

  console.error(`[igdl] embed gagal (${embedResult.error}), fallback ke mode logged-in...`);
  const sessionResult = await scrapeViaSession(igUrl, pathType, shortcode);
  if (sessionResult.success) return sessionResult;

  return {
    success: false,
    error: `embed: ${embedResult.error} | session_fallback: ${sessionResult.error}`,
  };
}

export { igdl };

import { fileURLToPath } from 'url';
import process from 'process';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node igdl.js <instagram_post_or_reel_url>');
    process.exit(1);
  }
  igdl(url).then((res) => console.log(JSON.stringify(res, null, 2)));
}
