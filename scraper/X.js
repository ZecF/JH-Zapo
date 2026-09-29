export async function JHTwitterDL(url) {
  const axios = (await import('axios')).default
  const cheerio = await import('cheerio')
  const qs = (await import('qs')).default

  const baseRes = {
    status: true,
    author_skrep: "JH a.k.a Dhika",
    kesayangan: "Fiony Alveria♡",
    data: {}
  }

  if (!url || typeof url !== 'string') {
    return { ...baseRes, status: false, error: 'URL Twitter/X tidak valid.' }
  }
  
  if (!/(twitter\.com|x\.com)\/\w+\/status\/\d+/i.test(url)) {
    return { ...baseRes, status: false, error: 'URL bukan URL status Twitter/X.' }
  }

  const jantung = {
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
    'accept': '*/*',
    'referer': 'https://x2twitter.com/en'
  }

  try {
    const { data: verifyData } = await axios.post(
      'https://x2twitter.com/api/userverify',
      qs.stringify({ url }),
      { headers: jantung, timeout: 15000 }
    )

    const token = verifyData?.token
    if (!token) {
      return { ...baseRes, status: false, error: 'Gagal mendapatkan token verifikasi dari source.' }
    }

    const { data: searchData } = await axios.post(
      'https://x2twitter.com/api/ajaxSearch',
      qs.stringify({ q: url, lang: 'en', cftoken: token }),
      { headers: jantung, timeout: 20000 }
    )

    const $ = cheerio.load(searchData?.data || '')
    const videos = []
    const images = []

    $('a.abutton, .download-items__btn a').each((_, el) => {
      const a = $(el)
      const href = a.attr("href")
      const title = (a.attr("title") || "").toLowerCase()
      const text = a.text().trim().toLowerCase()

      if (!href || href === "/" || href === "#") return

      if (title.includes("photo") || text.includes("photo") || text.includes("gambar")) {
        if (!images.includes(href)) {
          images.push(href)
        }
      } else if (title.includes("mp4") || text.includes("mp4") || title.includes("video")) {
        videos.push({ quality: a.text().trim(), url: href })
      }
    })

    if (videos.length === 0 && images.length === 0) {
      return { ...baseRes, status: false, error: 'Media tidak ditemukan (mungkin private, dihapus, atau link salah).' }
    }

    baseRes.data = { videos, images }
    return baseRes

  } catch (error) {
    return { ...baseRes, status: false, error: error.response?.data || error.message }
  }
}

export default JHTwitterDL
