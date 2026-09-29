/**
 * patch-album.js — nambahin dukungan albumMessage ke zapo-js
 *
 * WhatsApp butuh node <enc> buat albumMessage punya atribut
 * mediatype="collection" (persis kayak WA Web/app asli). zapo-js belum
 * ngenalin albumMessage sama sekali di resolver mediatype-nya, jadi node
 * <enc> dikirim tanpa/salah atribut → album gak pernah ke-grup jadi 1 grid.
 *
 * Jalanin SEKALI aja: node patch-album.js
 * (aman dijalanin ulang — bakal skip kalau udah ke-patch)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MARKER = '/* ALBUM_COLLECTION_PATCH */'

function patchConstants(file) {
  if (!fs.existsSync(file)) return `⏭️  Gak ketemu: ${file}`
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes(MARKER)) return `ℹ️  Udah ter-patch: ${file}`

  const oldConstant = "GROUP_HISTORY: 'group_history'\n})"
  const newConstant = `GROUP_HISTORY: 'group_history',\n    ${MARKER}\n    COLLECTION: 'collection'\n})`

  if (!content.includes(oldConstant)) return `⚠️  Pattern constant gak match: ${file}`

  content = content.replace(oldConstant, newConstant)
  fs.writeFileSync(file, content, 'utf8')
  return `✅ Berhasil patch constant: ${file}`
}

function patchResolver(file) {
  if (!fs.existsSync(file)) return `⏭️  Gak ketemu: ${file}`
  let content = fs.readFileSync(file, 'utf8')
  if (content.includes(MARKER)) return `ℹ️  Udah ter-patch: ${file}`

  const oldResolver = '    if (msg.messageHistoryBundle)\n        return WA_ENC_MEDIA_TYPES.GROUP_HISTORY;'
  const newResolver =
    `    ${MARKER}\n` +
    '    if (msg.albumMessage)\n' +
    '        return WA_ENC_MEDIA_TYPES.COLLECTION;\n' +
    oldResolver

  if (!content.includes(oldResolver)) return `⚠️  Pattern resolver gak match: ${file}`

  content = content.replace(oldResolver, newResolver)
  fs.writeFileSync(file, content, 'utf8')
  return `✅ Berhasil patch resolver: ${file}`
}

const results = []

results.push(
  patchConstants(path.join(__dirname, 'node_modules/zapo-js/dist/esm/protocol/message.js'))
)
results.push(
  patchConstants(path.join(__dirname, 'node_modules/zapo-js/dist/protocol/message.js'))
)
results.push(
  patchResolver(path.join(__dirname, 'node_modules/zapo-js/dist/esm/message/encode/content.js'))
)
results.push(
  patchResolver(path.join(__dirname, 'node_modules/zapo-js/dist/message/encode/content.js'))
)

console.log('\n══════════════════════════════════════')
console.log('ZAPO-JS ALBUM COLLECTION PATCH')
console.log('══════════════════════════════════════\n')
console.log(results.join('\n'))
console.log('\n══════════════════════════════════════\n')
