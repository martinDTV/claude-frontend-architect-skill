#!/usr/bin/env node
// Generates the GLTF fixtures of the asset pipeline (1.5, increment 4): an original multi-part product ("atelier"
// speaker) written as GLB by hand (plain with an embedded PNG texture, Draco-compressed, meshopt-compressed, and
// KTX2-textured), plus a truncated file for the error path. Everything is procedural: no third-party asset, no
// licence to track; the encoders are draco3d (Apache-2.0) and meshoptimizer (MIT), dev dependencies of the creative
// project. Deterministic: the manifest records byte sizes and SHA-256 so a re-run can be compared.
//
//   node verification/assets/make-fixtures.mjs
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const creative = join(here, '..', 'creative')
const require = createRequire(join(creative, 'package.json'))
const nm = join(creative, 'node_modules')
const THREE = await import(pathToFileURL(join(nm, 'three', 'build', 'three.module.js')).href)
const { KTX2Exporter } = await import(pathToFileURL(join(nm, 'three', 'examples', 'jsm', 'exporters', 'KTX2Exporter.js')).href)
const draco3d = require('draco3d')
const { MeshoptEncoder } = await import(pathToFileURL(join(nm, 'meshoptimizer', 'meshopt_encoder.module.js')).href)
const out = join(here, 'fixtures')
mkdirSync(out, { recursive: true })

// ---------------------------------------------------------------- the product: six parts, one texture, one clip
const parts = []
const add = (name, geometry, material, { parent = null, translation = [0, 0, 0], morph = null } = {}) => {
  geometry = geometry.toNonIndexed ? geometry : geometry
  if (!geometry.index) throw new Error(`${name}: indexed geometry expected`)
  const position = geometry.getAttribute('position').array
  const normal = geometry.getAttribute('normal').array
  const uv = geometry.getAttribute('uv').array
  const index = geometry.index.array
  parts.push({ name, position: Float32Array.from(position), normal: Float32Array.from(normal), uv: Float32Array.from(uv), index: Uint32Array.from(index), material, parent, translation, morph })
}
const materials = {
  rubber: { name: 'rubber', baseColorFactor: [0.05, 0.05, 0.06, 1], metallicFactor: 0, roughnessFactor: 0.9 },
  paint: { name: 'paint', baseColorFactor: [0.12, 0.14, 0.18, 1], metallicFactor: 0.9, roughnessFactor: 0.35 },
  grille: { name: 'grille', baseColorFactor: [0.75, 0.72, 0.68, 1], metallicFactor: 1, roughnessFactor: 0.5 },
  brass: { name: 'brass', baseColorFactor: [0.85, 0.6, 0.25, 1], metallicFactor: 1, roughnessFactor: 0.3 },
  cap: { name: 'cap', baseColorFactor: [0.9, 0.9, 0.92, 1], metallicFactor: 0.2, roughnessFactor: 0.25 },
  label: { name: 'label', baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.6, textured: true },
}
const materialOrder = Object.keys(materials)
add('base', new THREE.CylinderGeometry(0.62, 0.66, 0.12, 48, 1), 'rubber', { translation: [0, 0.06, 0] })
add('body', new THREE.CylinderGeometry(0.58, 0.6, 1.1, 48, 1, true), 'paint', { translation: [0, 0.67, 0] })
const grilleGeometry = new THREE.CylinderGeometry(0.585, 0.585, 0.7, 64, 4, true)
add('grille', grilleGeometry, 'grille', { translation: [0, 0.62, 0], morph: 'inflate' })
add('cap', new THREE.CylinderGeometry(0.6, 0.58, 0.1, 48, 1), 'cap', { translation: [0, 1.27, 0] })
add('knob', new THREE.CylinderGeometry(0.08, 0.08, 0.16, 24, 1), 'brass', { parent: 'cap', translation: [0.35, 0.12, 0] })
add('label', new THREE.PlaneGeometry(0.42, 0.18), 'label', { parent: 'body', translation: [0, -0.2, 0.605] })
// morph target on the grille: a radial inflate (deltas along the normal)
for (const p of parts) if (p.morph) p.morphDelta = Float32Array.from(p.normal, (n) => n * 0.06)

// ---------------------------------------------------------------- the texture: a 64×64 label, PNG and KTX2
const SIZE = 64
const rgba = new Uint8Array(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const stripe = ((x >> 3) + (y >> 3)) % 2 === 0
    const ring = Math.hypot(x - 32, y - 32)
    const mark = ring > 14 && ring < 20
    rgba[i] = mark ? 220 : stripe ? 235 : 205
    rgba[i + 1] = mark ? 120 : stripe ? 228 : 196
    rgba[i + 2] = mark ? 40 : stripe ? 214 : 180
    rgba[i + 3] = 255
  }
}
function crc32(buf) {
  let c
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 }))
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function png(width, height, pixels) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
const labelPng = png(SIZE, SIZE, rgba)
const ktxTexture = new THREE.DataTexture(rgba, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
ktxTexture.colorSpace = THREE.SRGBColorSpace
ktxTexture.needsUpdate = true
const labelKtx2 = Buffer.from(await new KTX2Exporter().parse(ktxTexture))

// ---------------------------------------------------------------- GLB writer
const align4 = (n) => (n + 3) & ~3
function buildGlb({ variant, texture }) {
  const json = { asset: { version: '2.0', generator: 'frontend-architect make-fixtures (procedural, no third-party asset)' }, scenes: [{ nodes: [] }], scene: 0, nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [], animations: [], extensionsUsed: [], extensionsRequired: [] }
  const bin = []
  let binLength = 0
  const pushView = (bytes, { target, byteStride } = {}) => {
    const offset = align4(binLength)
    const pad = offset - binLength
    if (pad) bin.push(Buffer.alloc(pad))
    bin.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    binLength = offset + bytes.byteLength
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength }
    if (target) view.target = target
    if (byteStride) view.byteStride = byteStride
    json.bufferViews.push(view)
    return json.bufferViews.length - 1
  }
  const bounds = (array, size) => {
    const min = Array(size).fill(Infinity)
    const max = Array(size).fill(-Infinity)
    for (let i = 0; i < array.length; i += size) for (let k = 0; k < size; k++) { min[k] = Math.min(min[k], array[i + k]); max[k] = Math.max(max[k], array[i + k]) }
    return { min, max }
  }
  const pushAccessor = (array, type, componentType, { view = null, offset = 0, withBounds = false, normalized } = {}) => {
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type]
    const accessor = { componentType, count: array.length / size, type }
    if (view !== null) { accessor.bufferView = view; if (offset) accessor.byteOffset = offset }
    if (withBounds) Object.assign(accessor, bounds(array, size))
    if (normalized) accessor.normalized = true
    json.accessors.push(accessor)
    return json.accessors.length - 1
  }
  // texture
  let textureIndex = null
  if (texture === 'png') {
    const view = pushView(new Uint8Array(labelPng))
    json.images = [{ bufferView: view, mimeType: 'image/png', name: 'label' }]
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }]
    json.textures = [{ sampler: 0, source: 0 }]
    textureIndex = 0
  } else if (texture === 'ktx2') {
    const view = pushView(new Uint8Array(labelKtx2))
    json.images = [{ bufferView: view, mimeType: 'image/ktx2', name: 'label' }]
    json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }]
    json.textures = [{ sampler: 0, extensions: { KHR_texture_basisu: { source: 0 } } }]
    json.extensionsUsed.push('KHR_texture_basisu')
    json.extensionsRequired.push('KHR_texture_basisu')
    textureIndex = 0
  }
  for (const key of materialOrder) {
    const m = materials[key]
    const pbr = { baseColorFactor: m.baseColorFactor, metallicFactor: m.metallicFactor, roughnessFactor: m.roughnessFactor }
    if (m.textured && textureIndex !== null) pbr.baseColorTexture = { index: textureIndex }
    json.materials.push({ name: m.name, pbrMetallicRoughness: pbr, doubleSide: key === 'grille' || key === 'body' })
  }
  // geometry per part
  let dracoEncoder = null
  if (variant === 'draco') json.extensionsUsed.push('KHR_draco_mesh_compression'), json.extensionsRequired.push('KHR_draco_mesh_compression')
  if (variant === 'meshopt') json.extensionsUsed.push('EXT_meshopt_compression'), json.extensionsRequired.push('EXT_meshopt_compression')
  const nodeIndex = new Map()
  for (const part of parts) {
    const attributes = {}
    let indices
    const primitive = { attributes, mode: 4, material: materialOrder.indexOf(part.material) }
    if (variant === 'draco') {
      dracoEncoder ??= draco3d.createEncoderModuleSync ? draco3d.createEncoderModuleSync() : null
      const enc = draco
      const encoder = new enc.Encoder()
      const builder = new enc.MeshBuilder()
      const mesh = new enc.Mesh()
      const count = part.position.length / 3
      const ids = {
        POSITION: builder.AddFloatAttributeToMesh(mesh, enc.POSITION, count, 3, part.position),
        NORMAL: builder.AddFloatAttributeToMesh(mesh, enc.NORMAL, count, 3, part.normal),
        TEXCOORD_0: builder.AddFloatAttributeToMesh(mesh, enc.TEX_COORD, count, 2, part.uv),
      }
      builder.AddFacesToMesh(mesh, part.index.length / 3, part.index)
      encoder.SetSpeedOptions(5, 5)
      encoder.SetAttributeQuantization(enc.POSITION, 14)
      encoder.SetAttributeQuantization(enc.NORMAL, 10)
      encoder.SetAttributeQuantization(enc.TEX_COORD, 12)
      encoder.SetEncodingMethod(enc.MESH_EDGEBREAKER_ENCODING)
      const encoded = new enc.DracoInt8Array()
      const length = encoder.EncodeMeshToDracoBuffer(mesh, encoded)
      if (length <= 0) throw new Error(`${part.name}: draco encoding failed`)
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i++) bytes[i] = encoded.GetValue(i)
      enc.destroy(encoded); enc.destroy(mesh); enc.destroy(builder); enc.destroy(encoder)
      const view = pushView(bytes)
      attributes.POSITION = pushAccessor(part.position, 'VEC3', 5126, { withBounds: true })
      attributes.NORMAL = pushAccessor(part.normal, 'VEC3', 5126)
      attributes.TEXCOORD_0 = pushAccessor(part.uv, 'VEC2', 5126)
      indices = pushAccessor(part.index, 'SCALAR', 5125)
      primitive.extensions = { KHR_draco_mesh_compression: { bufferView: view, attributes: ids } }
    } else if (variant === 'meshopt') {
      const encodeAttribute = (array, stride) => {
        const source = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
        const count = array.byteLength / stride
        const compressed = MeshoptEncoder.encodeVertexBuffer(source, count, stride)
        const view = pushView(compressed)
        // the fallback view points at the fallback buffer (1, absent); the extension points at the compressed bytes
        json.bufferViews.push({ buffer: 1, byteOffset: 0, byteLength: array.byteLength, byteStride: stride, target: 34962, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: json.bufferViews[view].byteOffset, byteLength: compressed.byteLength, byteStride: stride, mode: 'ATTRIBUTES', count } } })
        return json.bufferViews.length - 1
      }
      const indexArray = part.position.length / 3 > 65535 ? part.index : Uint16Array.from(part.index)
      const stride = indexArray.BYTES_PER_ELEMENT
      const source = new Uint8Array(indexArray.buffer, indexArray.byteOffset, indexArray.byteLength)
      const compressedIndex = MeshoptEncoder.encodeIndexBuffer(source, indexArray.length, stride)
      const indexView = pushView(compressedIndex)
      json.bufferViews.push({ buffer: 1, byteOffset: 0, byteLength: indexArray.byteLength, target: 34963, extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: json.bufferViews[indexView].byteOffset, byteLength: compressedIndex.byteLength, byteStride: stride, mode: 'TRIANGLES', count: indexArray.length } } })
      const indexFallback = json.bufferViews.length - 1
      attributes.POSITION = pushAccessor(part.position, 'VEC3', 5126, { view: encodeAttribute(part.position, 12), withBounds: true })
      attributes.NORMAL = pushAccessor(part.normal, 'VEC3', 5126, { view: encodeAttribute(part.normal, 12) })
      attributes.TEXCOORD_0 = pushAccessor(part.uv, 'VEC2', 5126, { view: encodeAttribute(part.uv, 8) })
      indices = pushAccessor(indexArray, 'SCALAR', stride === 2 ? 5123 : 5125, { view: indexFallback })
    } else {
      attributes.POSITION = pushAccessor(part.position, 'VEC3', 5126, { view: pushView(part.position, { target: 34962 }), withBounds: true })
      attributes.NORMAL = pushAccessor(part.normal, 'VEC3', 5126, { view: pushView(part.normal, { target: 34962 }) })
      attributes.TEXCOORD_0 = pushAccessor(part.uv, 'VEC2', 5126, { view: pushView(part.uv, { target: 34962 }) })
      const indexArray = part.position.length / 3 > 65535 ? part.index : Uint16Array.from(part.index)
      indices = pushAccessor(indexArray, 'SCALAR', indexArray.BYTES_PER_ELEMENT === 2 ? 5123 : 5125, { view: pushView(indexArray, { target: 34963 }) })
    }
    primitive.indices = indices
    const mesh = { name: part.name, primitives: [primitive] }
    if (part.morphDelta) {
      primitive.targets = [{ POSITION: pushAccessor(part.morphDelta, 'VEC3', 5126, { view: pushView(part.morphDelta, { target: 34962 }), withBounds: true }) }]
      mesh.weights = [0]
      mesh.extras = { targetNames: [part.morph] }
    }
    json.meshes.push(mesh)
    json.nodes.push({ name: part.name, mesh: json.meshes.length - 1, translation: part.translation })
    nodeIndex.set(part.name, json.nodes.length - 1)
  }
  // hierarchy: a root node, children under their parents
  json.nodes.push({ name: 'atelier', children: [] })
  const root = json.nodes.length - 1
  for (const part of parts) {
    const i = nodeIndex.get(part.name)
    if (part.parent) (json.nodes[nodeIndex.get(part.parent)].children ??= []).push(i)
    else json.nodes[root].children.push(i)
  }
  json.scenes[0].nodes.push(root)
  // animation: the cap lifts and settles, the knob turns half a turn, the grille inflates and relaxes (2 s)
  const times = Float32Array.from([0, 1, 2])
  const timeAccessor = pushAccessor(times, 'SCALAR', 5126, { view: pushView(times), withBounds: true })
  const capT = parts.find((p) => p.name === 'cap').translation
  const capTrack = Float32Array.from([...capT, capT[0], capT[1] + 0.5, capT[2], ...capT])
  const q = (angle) => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]
  const knobTrack = Float32Array.from([...q(0), ...q(Math.PI / 2), ...q(Math.PI)])
  const weightTrack = Float32Array.from([0, 1, 0])
  json.animations.push({
    name: 'reveal',
    samplers: [
      { input: timeAccessor, output: pushAccessor(capTrack, 'VEC3', 5126, { view: pushView(capTrack) }), interpolation: 'LINEAR' },
      { input: timeAccessor, output: pushAccessor(knobTrack, 'VEC4', 5126, { view: pushView(knobTrack) }), interpolation: 'LINEAR' },
      { input: timeAccessor, output: pushAccessor(weightTrack, 'SCALAR', 5126, { view: pushView(weightTrack) }), interpolation: 'LINEAR' },
    ],
    channels: [
      { sampler: 0, target: { node: nodeIndex.get('cap'), path: 'translation' } },
      { sampler: 1, target: { node: nodeIndex.get('knob'), path: 'rotation' } },
      { sampler: 2, target: { node: nodeIndex.get('grille'), path: 'weights' } },
    ],
  })
  json.buffers.push({ byteLength: align4(binLength) })
  if (variant === 'meshopt') {
    const fallbackLength = json.bufferViews.filter((v) => v.buffer === 1).reduce((s, v) => Math.max(s, v.byteOffset + v.byteLength), 0)
    json.buffers.push({ byteLength: fallbackLength, extensions: { EXT_meshopt_compression: { fallback: true } } })
  }
  if (!json.extensionsUsed.length) { delete json.extensionsUsed; delete json.extensionsRequired }
  // assemble
  const jsonText = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPadded = Buffer.concat([jsonText, Buffer.alloc(align4(jsonText.length) - jsonText.length, 0x20)])
  const binBuffer = Buffer.concat([...bin, Buffer.alloc(align4(binLength) - binLength)])
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binBuffer.length, 8)
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonPadded.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binBuffer.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binBuffer])
}

const draco = await draco3d.createEncoderModule({})
await MeshoptEncoder.ready
const files = {
  'atelier.glb': buildGlb({ variant: 'plain', texture: 'png' }),
  'atelier.draco.glb': buildGlb({ variant: 'draco', texture: 'png' }),
  'atelier.meshopt.glb': buildGlb({ variant: 'meshopt', texture: 'png' }),
  'atelier.ktx2.glb': buildGlb({ variant: 'plain', texture: 'ktx2' }),
  'atelier.untextured.glb': buildGlb({ variant: 'plain', texture: null }),
  'label.ktx2': labelKtx2,
  'label.png': labelPng,
}
files['atelier.truncated.glb'] = files['atelier.glb'].subarray(0, Math.floor(files['atelier.glb'].length * 0.6))
const manifest = { generator: 'verification/assets/make-fixtures.mjs', parts: parts.map((p) => ({ name: p.name, parent: p.parent, material: p.material, vertices: p.position.length / 3, triangles: p.index.length / 3, morph: p.morph })), triangles: parts.reduce((s, p) => s + p.index.length / 3, 0), animation: { name: 'reveal', duration: 2, channels: ['cap.translation', 'knob.rotation', 'grille.weights'] }, texture: { size: SIZE, png: labelPng.length, ktx2: labelKtx2.length }, files: {} }
for (const [name, buffer] of Object.entries(files)) {
  writeFileSync(join(out, name), buffer)
  manifest.files[name] = { bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') }
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`fixtures written to ${out}`)
for (const [name, info] of Object.entries(manifest.files)) console.log(`  ${name.padEnd(24)} ${String(info.bytes).padStart(7)} bytes  ${info.sha256.slice(0, 12)}`)
console.log(`  triangles ${manifest.triangles}, parts ${parts.length}`)
