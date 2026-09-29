/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass.
 * Hargai sebagaimana u mau dihargai.
 * tiktok.js — TikTok Downloader (video + slide/multiple post pakai carousel)
 */

import { JHTT } from '../../scraper/TIKTOK.js'
import { onRichReply } from '../../handlers/messageHandler.js'
import { sendCarousel } from '../../lib/carousel.js'

const TIKTOK_URL_REGEX = /https?:\/\/(vm\.tiktok\.com|vt\.tiktok\.com|www\.tiktok\.com)\/[^\s]+/i

const SLIDESHOW_CACHE = new Map()
const CACHE_TTL = 10 * 60 * 1000

function extractUrl(ctx) {
  const text = (ctx.text || '').trim()
  const match = text.match(TIKTOK_URL_REGEX)

  if (match) return match[0]

  const quoted = ctx.message?.extendedTextMessage?.contextInfo?.quotedMessage
  const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || ''
  const quotedMatch = quotedText.match(TIKTOK_URL_REGEX)

  if (quotedMatch) return quotedMatch[0]

  return null
}

function formatNumber(value) {
  if (!value) return '0'

  return new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function cleanText(value, fallback = '-') {
  if (!value) return fallback

  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
}

function formatCaption(data) {
  const title = cleanText(data.title)
  const authorName = cleanText(data.author?.name)
  const username = data.author?.username
    ? `@${cleanText(data.author.username)}`
    : '-'

  const stats = data.stats || {}

  const contentInfo = [
    `- *Caption:* _${title}_`,
    `- *Name:* _${authorName} (${username})_`,
    `- *Views:* _${formatNumber(stats.playCount)}_`,
    `- *Comments:* _${formatNumber(stats.commentCount)}_`,
    `- *Shares:* _${formatNumber(stats.shareCount)}_`
  ]

  if (data.type === 'video') {
    const duration = data.videoDuration
      ? `${data.videoDuration}s`
      : '-'

    contentInfo.push(`- *Duration:* _${duration}_`)
  }

  if (data.type === 'carousel') {
    contentInfo.push(
      `- *Total Slides:* _${data.images?.length || 0}_`
    )
  }

  const header = [
    '┌───「 📱 *TIKTOK DOWNLOADER* 」───┐',
    '',
    ...contentInfo,
    '',
    '└────────────────────────────────┘'
  ]

  let instruction = '🎬 *Video TikTok siap didownload.*'
  if (data.type === 'carousel' && (data.images?.length || 0) >= 2) {
    instruction = '👇🏻 *Scroll dan geser untuk melihat semua slide.*'
  } else if (data.type === 'carousel') {
    instruction = '🖼️ *Single image TikTok.*'
  }

  return [
    header.join('\n'),
    '',
    instruction,
    '',
    '> ✨ _*Powered by FionyVerse*_'
  ].join('\n')
}

async function downloadMedia(url) {
  const axios = (await import('axios')).default

  const { data: buffer } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.181 Mobile Safari/537.36'
    }
  })

  const buf = Buffer.from(buffer)

  if (!buf.length) {
    throw new Error('Empty buffer dari URL media')
  }

  return buf
}

async function sendVideo(ctx, data) {
  const videoUrl = data.hdDownloadUrl || data.downloadUrl
  const caption = formatCaption(data)

  await ctx.react('⏳')

  const videoBuffer = await downloadMedia(videoUrl)

  await ctx.client.message.send(ctx.chat, {
    type: 'video',
    media: videoBuffer,
    mimetype: 'video/mp4',
    caption
  })

  await ctx.react('✅')
}

async function sendSingleImage(ctx, data) {
  const image = (data.images || [])[0]
  if (!image) throw new Error('Carousel type tapi images kosong')

  const imageUrl = image.downloadUrl || image.url
  const caption = formatCaption(data)

  await ctx.react('⏳')

  const imageBuffer = await downloadMedia(imageUrl)

  await ctx.client.message.send(ctx.chat, {
    type: 'image',
    media: imageBuffer,
    mimetype: 'image/jpeg',
    caption
  })

  await ctx.react('✅')
}

onRichReply('rich:tt-slideshow', async (ctx) => {
  const entry = SLIDESHOW_CACHE.get(ctx.chat)

  if (!entry || Date.now() - entry.ts > CACHE_TTL) {
    return ctx.reply(
      '⚠️ Session slideshow udah kedaluwarsa (>10 menit).\n' +
      'Kirim ulang link TikTok-nya ya, Kak.'
    )
  }

  SLIDESHOW_CACHE.delete(ctx.chat)

  await ctx.react('⏳')

  try {
    const buffer = await downloadMedia(entry.downloadUrl)

    await ctx.client.message.send(ctx.chat, {
      type: 'video',
      media: buffer,
      mimetype: 'video/mp4',
      caption: [
        formatCaption({
          ...entry.data,
          type: 'video'
        }),
        '',
        '🎬 *Slideshow Version*'
      ].join('\n')
    })

    await ctx.react('✅')
  } catch (error) {
    await ctx.react('❎')

    return ctx.reply(
      '❌ Gagal convert slideshow: ' +
      String(error.message || error).slice(0, 150)
    )
  }
})

async function sendCarouselSlides(ctx, data) {
  const images = (data.images || []).slice(0, 25)

  if (images.length < 2) {
    throw new Error('Carousel TikTok butuh minimal 2 slide.')
  }

  const tiktokUrl = data.author?.username
    ? `https://www.tiktok.com/@${data.author.username}/video/${data.id}`
    : null

  const cards = images.map((image, index) => ({
    imageUrl: image.downloadUrl || image.url,
    body: [
      `*Slide ${index + 1} dari ${images.length}*`,
      '',
      data.title
        ? cleanText(data.title).slice(0, 120)
        : 'TikTok slideshow'
    ].join('\n'),
    footer: data.author?.username
      ? `👤 @${data.author.username}`
      : '📱 TikTok',
    buttons: [
      ...(tiktokUrl
        ? [
            {
              type: 'url',
              displayText: '🌐 Buka di TikTok',
              url: tiktokUrl
            }
          ]
        : []),
      {
        type: 'reply',
        displayText: '🎬 Convert Slideshow',
        id: 'rich:tt-slideshow'
      }
    ]
  }))

  await sendCarousel(ctx, {
    text: formatCaption(data),
    cards
  })

  SLIDESHOW_CACHE.set(ctx.chat, {
    downloadUrl: data.downloadUrl,
    data,
    ts: Date.now()
  })
}

export default {
  name: 'tiktok',
  aliases: ['tt', 'ttdown'],
  tags: 'downloader',
  description: 'Download TikTok (video + slide/multiple post via carousel)',

  async run(ctx) {
    const url = extractUrl(ctx)

    if (!url) {
      return ctx.reply(
        [
          '📱 *TIKTOK DOWNLOADER*',
          '',
          '- Kirim link TikTok',
          '- Atau reply pesan yang berisi link TikTok',
          '',
          '*Supported:*',
          '- Video HD quality',
          '- Slide atau multiple post (carousel)',
          '- Single image (dikirim sebagai foto)',
          '- Convert slideshow ke video',
          '',
          '*Contoh:*',
          '`.tiktok https://vt.tiktok.com/ZSqCj9Pjv/`'
        ].join('\n')
      )
    }

    await ctx.react('⏳')

    const result = await JHTT(url)

    if (!result.status) {
      await ctx.react('❎')

      return ctx.reply(
        '❌ Gagal download: ' +
        (result.error || 'Unknown error')
      )
    }

    const data = result.data

    try {
      if (data.type === 'video') {
        await sendVideo(ctx, data)
        return
      }

      if (data.type === 'carousel') {
        const imageCount = (data.images || []).length

        if (imageCount === 1) {
          await sendSingleImage(ctx, data)
          return
        }

        if (imageCount >= 2) {
          await sendCarouselSlides(ctx, data)
          await ctx.react('✅')
          return
        }

        await ctx.react('❎')
        return ctx.reply('⚠️ Post carousel tanpa image — kemungkinan link expired atau private.')
      }

      await ctx.react('❎')

      return ctx.reply(
        '⚠️ Tipe konten tidak didukung: ' +
        (data.type || 'unknown')
      )
    } catch (error) {
      await ctx.react('❎')

      return ctx.reply(
        '❌ Error: ' +
        String(error.message || error).slice(0, 250)
      )
    }
  }
}