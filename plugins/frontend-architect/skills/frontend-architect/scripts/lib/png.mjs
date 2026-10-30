// Minimal PNG decoder and pixel diff for the visual-regression check: 8-bit RGB/RGBA, non-interlaced
// images (what Playwright screenshots are). Zero dependencies: chunks parsed by hand, IDAT inflated with
// node:zlib, scanlines unfiltered per the PNG specification (filters 0–4).
import { deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function decodePng(buffer) {
  if (!buffer || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (only 8-bit)`)
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG color type ${colorType} (only RGB and RGBA)`)
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported')
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`)
      line[i] = v & 255
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels
      const di = (y * width + x) * 4
      pixels[di] = line[si]
      pixels[di + 1] = line[si + 1]
      pixels[di + 2] = line[si + 2]
      pixels[di + 3] = channels === 4 ? line[si + 3] : 255
    }
    prev = line
  }
  return { width, height, pixels }
}

/**
 * Compares two decoded images. A pixel differs when any channel differs by more than `threshold`
 * (0–255). Returns the ratio of differing pixels and up to `maxRegions` bounding boxes of differing
 * areas (grid-based clustering so the output stays small).
 */
export function diffImages(a, b, { threshold = 32, cell = 16, maxRegions = 10 } = {}) {
  if (a.width !== b.width || a.height !== b.height) return { sizeChanged: true, baseSize: `${a.width}×${a.height}`, size: `${b.width}×${b.height}`, ratio: 1, differing: 0, total: 0, regions: [] }
  const total = a.width * a.height
  let differing = 0
  const cols = Math.ceil(a.width / cell)
  const rows = Math.ceil(a.height / cell)
  const hits = new Uint32Array(cols * rows)
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4
      if (Math.abs(a.pixels[i] - b.pixels[i]) > threshold || Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) > threshold || Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > threshold || Math.abs(a.pixels[i + 3] - b.pixels[i + 3]) > threshold) {
        differing++
        hits[Math.floor(y / cell) * cols + Math.floor(x / cell)]++
      }
    }
  }
  // merge adjacent cells with differences into regions (4-connectivity flood fill on the cell grid)
  const seen = new Uint8Array(cols * rows)
  const regions = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const idx = r * cols + c
    if (!hits[idx] || seen[idx]) continue
    let minR = r, maxR = r, minC = c, maxC = c, count = 0
    const stack = [idx]
    seen[idx] = 1
    while (stack.length) {
      const k = stack.pop()
      const kr = Math.floor(k / cols)
      const kc = k % cols
      count += hits[k]
      minR = Math.min(minR, kr); maxR = Math.max(maxR, kr); minC = Math.min(minC, kc); maxC = Math.max(maxC, kc)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = kr + dr
        const nc = kc + dc
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
        const n = nr * cols + nc
        if (hits[n] && !seen[n]) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    regions.push({ x: minC * cell, y: minR * cell, w: Math.min(a.width, (maxC + 1) * cell) - minC * cell, h: Math.min(a.height, (maxR + 1) * cell) - minR * cell, pixels: count })
  }
  regions.sort((p, q) => q.pixels - p.pixels)
  return { sizeChanged: false, ratio: total ? differing / total : 0, differing, total, regions: regions.slice(0, maxRegions) }
}

/** Encodes an RGBA buffer as an uncompressed-filter PNG (used by tests to build deterministic images). */
export function encodePng({ width, height, pixels }) {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
