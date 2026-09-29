/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass.
 * Hargai sebagaimana u mau dihargai.
 * jhai.js — engine rich response Meta AI untuk zapo.
 *
 * v3.2 — sendThinking(ctx, title, opts):
 *  opts.ttl (detik) → expirationSeconds per-message. Bubble thinking
 *  lenyap SENDIRI tanpa placeholder "pesan dihapus" (pengganti revoke,
 *  biar nol jejak). Morph via edit resmi DITINGGAL (terbukti FC selalu
 *  kalau edit telat ke card GenAI yang udah render).
 *
 * Payload thinking proven: GenAIBotProgressStatusPrimitive + is_in_progress.
 * Grup otomatis customNodes biz; privat tanpa node.
 */

import crypto from 'node:crypto'
import { generateVerificationMetadata } from './jhrich.js'
import { tokenize, LANGS } from './highlight.js'

const SUB_BOT_JID = '867051314767696@bot'   // pola bebek.js
const UNI_BOT_JID = '236911050403982@bot'   // pola jhrich.js

// ===== BIZ NODES (grup aja, pola carousel) =====

function buildGroupNodes(jid) {
  return [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' }, content: [] }]
        }
      ]
    }
  ]
}

function sendOptions(ctx, extra = {}) {
  const opts = { additionalAttributes: { type: 'text' }, ...extra }
  if (`${ctx.chat || ''}`.endsWith('@g.us')) {
    opts.customNodes = buildGroupNodes(ctx.chat)
  }
  return opts
}

// ===== SUBMESSAGES (proven bebek.js) =====

export function subText(text) {
  return { messageType: 2, messageText: text }
}

export function subCode(code, lang = 'javascript') {
  return {
    messageType: 5,
    codeMetadata: {
      codeLanguage: LANGS[lang] || lang || 'javascript',
      codeBlocks: tokenize(code)
    }
  }
}

export function subTable(rows) {
  return {
    messageType: 4,
    tableMetadata: {
      rows: rows.map((r, i) => ({ items: r, isHeading: i === 0 }))
    }
  }
}

export function buildSubContent(submessages, botJid = SUB_BOT_JID) {
  return {
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid },
            forwardOrigin: 4
          }
        }
      }
    }
  }
}

export async function sendSubRich(ctx, submessages) {
  return await ctx.client.message.send(ctx.chat, buildSubContent(submessages), sendOptions(ctx))
}

// bypass-edit protocolMessage type 14 (pola jhrich) — pakai cuma buat
// edit INSTAN saat send; JANGAN buat edit telat ke card yang udah render (FC)
export async function editReplace(ctx, id, content) {
  return await ctx.client.message.send(
    ctx.chat,
    {
      botForwardedMessage: {
        message: {
          protocolMessage: {
            key: { remoteJid: ctx.chat, fromMe: true, id },
            type: 14,
            editedMessage: content
          }
        }
      }
    },
    sendOptions(ctx)
  )
}

// ===== UNIFIED RESPONSE (proven jhrich.js) =====

export function thinkingPrimitive(title = 'Sedang berpikir...') {
  return {
    __typename: 'GenAIBotProgressStatusPrimitive',
    title,
    is_in_progress: true
  }
}

export function textPrimitive(text, inlineEntities) {
  return {
    __typename: 'GenAIMarkdownTextUXPrimitive',
    text,
    ...(inlineEntities?.length ? { inline_entities: inlineEntities } : {})
  }
}

export function hyperlinkEntity(key, displayName, url) {
  return {
    key,
    metadata: {
      display_name: displayName,
      is_trusted: true,
      url,
      __typename: 'GenAIInlineLinkItem'
    }
  }
}

export function single(primitive) {
  return { view_model: { primitive, __typename: 'GenAISingleLayoutViewModel' } }
}

export function vStack(primitives) {
  return { view_model: { primitives, __typename: 'GenAIVStackLayoutViewModel' } }
}

export function buildAIContent(sections) {
  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: '',
        verificationMetadata: generateVerificationMetadata(),
        botResponseId: crypto.randomUUID()
      }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          unifiedResponse: {
            data: Buffer.from(
              JSON.stringify({
                __typename: 'GenAIUnifiedResponse',
                response_id: crypto.randomUUID(),
                sections: sections.map((s) => ({
                  __typename: 'GenAIUnifiedResponseSection',
                  ...s
                }))
              })
            ).toString('base64')
          },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: UNI_BOT_JID },
            forwardOrigin: 4
          }
        }
      }
    }
  }
}

export async function sendAIRich(ctx, sections) {
  return await ctx.client.message.send(ctx.chat, buildAIContent(sections), sendOptions(ctx))
}

// ===== THINKING (proven + bypass-edit instan + opsional TTL) =====

export async function sendThinking(ctx, title = 'Sedang berpikir...', opts = {}) {
  const content = buildAIContent([vStack([thinkingPrimitive(title)])])

  const sendOpts = sendOptions(ctx)
  if (opts.ttl) sendOpts.expirationSeconds = opts.ttl

  const sent = await ctx.client.message.send(ctx.chat, content, sendOpts)
  const id = sent?.id || sent?.key?.id || null
  if (!id) return sent

  // bypass-edit INSTAN (pola jhrich): auto-render shimmer detik itu juga.
  // AMAN karena edit terjadi sebelum card sempet render hidup.
  try {
    await ctx.client.message.send(
      ctx.chat,
      {
        botForwardedMessage: {
          message: {
            protocolMessage: {
              key: { remoteJid: ctx.chat, fromMe: true, id },
              type: 14,
              editedMessage: content
            }
          }
        }
      },
      sendOptions(ctx)
    )
  } catch (e) {
    console.log('[JHAi] thinking bypass-edit fail:', String(e?.message || e).slice(0, 120))
  }

  return sent
}
