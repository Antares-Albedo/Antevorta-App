// Génère les icônes PNG de la PWA (192 et 512 px) sans dépendance externe.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function draw(size) {
  const bg = [30, 41, 59, 255]
  const fg = [248, 250, 252, 255]
  const accent = [96, 165, 250, 255]
  const u = size / 64
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 * u && x < x1 * u && y >= y0 * u && y < y1 * u
  return (x, y) => {
    // cadre du plan
    const frame = (inRect(x, y, 14, 14, 50, 50) && !inRect(x, y, 19, 19, 45, 45))
    const cross = inRect(x, y, 14, 30, 34, 34) || inRect(x, y, 32, 14, 36, 50)
    const dx = x - 34 * u
    const dy = y - 46 * u
    const r = Math.hypot(dx, dy)
    const arc = dx >= 0 && dy <= 0 && r > 7 * u && r < 9 * u
    if (arc) return accent
    if (frame || cross) return fg
    return bg
  }
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), png(size, draw(size)))
  console.log(`icon-${size}.png généré`)
}
