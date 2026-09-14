/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass.
 * Hargai sebagaimana u mau dihargai.
 * ig.js — Instagram Downloader Feature
 */
import { Readable } from 'node:stream'
import { JHIGDL } from '../../scraper/IG-DL.js'

const IG_REGEX = /https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/[^\s]+/i
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchStream(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://snapsave.app/',
      'Accept': '*/*'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000)
  })
  if (!res.ok || !res.body) {
    throw new Error('fetch media gagal: HTTP ' + res.status)
  }
  return Readable.fromWeb(res.body)
}

export default {
  name: 'ig',
  aliases: ['igdl', 'reels', 'instagram'],
  tags: 'downloader',
  description: 'Instagram downloader — reels/post/story/video/carousel',

  async run(ctx) {
    const input = (ctx.text || '').trim()
    if (!input) {
      return ctx.reply(
        '📥 *Instagram Downloader*\n\n' +
        '`.ig <url instagram>`\n\n' +
        'Support:\n' +
        '• Reels\n' +
        '• Post (video/image)\n' +
        '• Story (publik)\n' +
        '• Carousel (multi-media)\n\n' +
        'Contoh: `.ig https://www.instagram.com/p/Db8EFNOINcp/`'
      )
    }

    const match = input.match(IG_REGEX)
    if (!match) {
      return ctx.reply('⚠️ URL tidak valid. Harus URL Instagram (instagram.com / instagr.am).')
    }
    const igUrl = match[0]

    await ctx.react('📥')

    let result
    try {
      result = await JHIGDL(igUrl)
    } catch (e) {
      await ctx.react('❎')
      return ctx.reply('❌ *IGDL Error*\n\n' + String(e.message || e).slice(0, 300))
    }

    if (!result?.success || !Array.isArray(result.data) || !result.data.length) {
      await ctx.react('❎')
      return ctx.reply('⚠️ Tidak ada media yang bisa diunduh dari URL ini.')
    }

    const total = result.data.length
    const nVideo = result.data.filter(m => m.type === 'video').length
    const nImage = total - nVideo

    await ctx.react('⏳')

    let sent = 0
    for (let i = 0; i < total; i++) {
      const media = result.data[i]
      const isVideo = media.type === 'video'

      const caption = i === 0
        ? (
          '📥 *Instagram Downloader*\n' +
          'Ini dia hasilnya, Kak!\n\n' +
          `🎬 Video: ${nVideo} • 🖼️ Gambar: ${nImage}\n` +
          `🔗 ${igUrl.replace(/https?:\/\//, '').slice(0, 60)}`
        )
        : `📎 Media ke-${i + 1}/${total}`

      try {
        const stream = await fetchStream(media.url)
        await ctx.client.message.send(ctx.chat, {
          type: isVideo ? 'video' : 'image',
          media: stream,
          mimetype: isVideo ? 'video/mp4' : 'image/jpeg',
          caption
        })
        sent++
      } catch (e) {
        console.log('[IGDL] send fail #' + (i + 1) + ':', String(e.message || e).slice(0, 150))
      }
    }

    if (sent === 0) {
      await ctx.react('❎')
      return ctx.reply('❌ Semua media gagal dikirim (link CDN expired / host nolak fetch dari server).')
    }

    await ctx.react(sent === total ? '✅' : '⚠️')
    if (sent < total) {
      await ctx.reply(`⚠️ Terkirim ${sent}/${total} media. ${total - sent} gagal (link expired / host nolak).`)
    }
  }
}
