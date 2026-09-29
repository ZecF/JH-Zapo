/**
 * © JamvanHax0r — Fiony Bot
 * Hapus credit gak bikin u jago dumbass. 
 * Hargai sebagaimana u mau dihargai.
 * ping.js — Cek latensi bot dan resource dasar VPS
 */

import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fmtUptime(seconds) {
  const s = Math.floor(Number(seconds) || 0)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60

  const parts = []

  if (d) parts.push(`${d} hari`)
  if (h) parts.push(`${h} jam`)
  if (m) parts.push(`${m} mnt`)

  parts.push(`${sec} dtk`)
  return parts.join(' ')
}

function fmtBytes(bytes) {
  const value = Number(bytes) || 0
  const units = ['B', 'KB', 'MB', 'GB', 'TB']

  let size = value
  let index = 0

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index++
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function fmtPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function usageIcon(percent) {
  const value = Number(percent) || 0

  if (value >= 90) return '🔴'
  if (value >= 75) return '🟠'
  if (value >= 50) return '🟡'
  return '🟢'
}

function getCpuSnapshot() {
  const cpus = os.cpus()

  let idle = 0
  let total = 0

  for (const cpu of cpus) {
    const times = cpu.times

    idle += times.idle
    total +=
      times.user +
      times.nice +
      times.sys +
      times.irq +
      times.idle
  }

  return { idle, total }
}

async function getCpuUsage() {
  const first = getCpuSnapshot()

  await sleep(300)

  const second = getCpuSnapshot()

  const idleDiff = second.idle - first.idle
  const totalDiff = second.total - first.total

  if (totalDiff <= 0) return 0

  return ((totalDiff - idleDiff) / totalDiff) * 100
}

async function getDiskUsage() {
  try {
    const { stdout } = await execFileAsync(
      'df',
      ['-Pk', '/'],
      {
        timeout: 5000,
        maxBuffer: 1024 * 1024
      }
    )

    const lines = stdout.trim().split('\n')
    const data = lines.at(-1)?.trim().split(/\s+/)

    if (!data || data.length < 5) return null

    const total = Number(data[1]) * 1024
    const used = Number(data[2]) * 1024
    const percent = Number.parseFloat(data[4].replace('%', ''))

    return {
      total,
      used,
      percent
    }
  } catch {
    return null
  }
}

async function getSwapUsage() {
  try {
    const { stdout } = await execFileAsync(
      'cat',
      ['/proc/meminfo'],
      {
        timeout: 3000,
        maxBuffer: 1024 * 1024
      }
    )

    const totalMatch = stdout.match(/^SwapTotal:\s+(\d+)\s+kB$/m)
    const freeMatch = stdout.match(/^SwapFree:\s+(\d+)\s+kB$/m)

    const total = Number(totalMatch?.[1] || 0) * 1024
    const free = Number(freeMatch?.[1] || 0) * 1024
    const used = Math.max(0, total - free)
    const percent = total > 0 ? (used / total) * 100 : 0

    return {
      total,
      used,
      percent
    }
  } catch {
    return {
      total: 0,
      used: 0,
      percent: 0
    }
  }
}

export default {
  name: 'ping',
  aliases: ['pong', 'p'],
  tags: 'general',
  description: 'Cek latensi, runtime, resource VPS, dan spek server',

  async run(ctx) {
    const latency = Date.now() - (ctx.receivedAt ?? Date.now())

    const [
      cpuUsage,
      disk,
      swap
    ] = await Promise.all([
      getCpuUsage(),
      getDiskUsage(),
      getSwapUsage()
    ])

    const mem = process.memoryUsage()

    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()
    const usedMemory = totalMemory - freeMemory
    const memoryPercent = (usedMemory / totalMemory) * 100

    const load = os.loadavg()
    const cpuCount = os.cpus().length || 1
    const loadPercent = (load[0] / cpuCount) * 100

    const cpuModel =
      os.cpus()[0]?.model?.trim().slice(0, 45) ?? '-'

    const diskText = disk
      ? `${usageIcon(disk.percent)} ${fmtBytes(disk.used)} / ${fmtBytes(disk.total)} (${fmtPercent(disk.percent)})`
      : '⚪ Tidak tersedia'

    const swapText =
      swap.total > 0
        ? `${usageIcon(swap.percent)} ${fmtBytes(swap.used)} / ${fmtBytes(swap.total)} (${fmtPercent(swap.percent)})`
        : '⚪ Tidak aktif'

    const warnings = []

    if (cpuUsage >= 85) warnings.push('CPU tinggi')
    if (memoryPercent >= 85) warnings.push('RAM tinggi')
    if (disk?.percent >= 85) warnings.push('Disk hampir penuh')
    if (loadPercent >= 100) warnings.push('Load tinggi')

    const warningText = warnings.length
      ? `\n\n⚠️ *Warning:* ${warnings.join(', ')}`
      : ''

    await ctx.reply(
      `🏓 *PONG!*\n` +
        `├ ⚡ Latensi: ${latency} ms\n` +
        `├ ⏱️ Runtime bot: ${fmtUptime(process.uptime())}\n` +
        `├ 🖥️ Uptime VPS: ${fmtUptime(os.uptime())}\n` +
        `├ 🧠 Memori bot: ${fmtBytes(mem.rss)} RSS\n` +
        `├ 💻 RAM VPS: ${usageIcon(memoryPercent)} ${fmtBytes(usedMemory)} / ${fmtBytes(totalMemory)} (${fmtPercent(memoryPercent)})\n` +
        `├ 🧮 CPU VPS: ${usageIcon(cpuUsage)} ${fmtPercent(cpuUsage)} • ${os.cpus().length} core\n` +
        `├ 📈 Load: ${load.map((value) => value.toFixed(2)).join(' / ')}\n` +
        `├ 💾 Disk: ${diskText}\n` +
        `├ 🔁 Swap: ${swapText}\n` +
        `├ 🧩 CPU: ${cpuModel}\n` +
        `└ 🟢 Node ${process.version} • ${os.platform()}/${os.arch()}` +
        warningText
    )
  }
}