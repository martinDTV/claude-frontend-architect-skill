# Cinematic motion: cameras, sequences, clips, cues

Camera work, sequencing and synchronised state for 3D experiences, built on the time architecture of `immersive-3d-architecture.md`: every rig, sequence and cue is a pure function of a progress value or of the loop's frame, so the same choreography plays on a timeline, scrubs on scroll, reverses, and lands on exact checkpoints the browser checks can assert.

## Contents

1. Camera language and the rig
2. Paths: Catmull-Rom, Bézier, arc length
3. Shot sequences: scroll or time, reversible, deterministic
4. Cue sheets: HTML, lights, uniforms in sync
5. Skeletal and morph animation: the clip player
6. Frame-rate independent interpolation
7. Scene transitions
8. Coordination rules (GSAP + Three.js)
9. Tests

## 1. Camera language and the rig

A shot is a camera state: position, look-at target, field of view, roll. The vocabulary of a cinematographer maps onto operations on shots:

| Term | Operation | Notes |
|---|---|---|
| **Dolly** | move the position along the view direction | `dolly(shot, distance)`; the target stays |
| **Orbit** | move the position on a sphere around the target | `orbit(target, radius, azimuth, elevation)`; blend azimuths along the arc, not through the centre |
| **Tracking** | move the position along a path while the target moves or stays | `trackingShot(path, t, target)`; look-ahead on the path when the target is "forward" |
| **Push-in / pull-out** | change the fov while dollying the other way (the vertigo effect) or alone | fov is a shot property and interpolates like the rest |
| **Cut** | jump to a shot | `apply(shot)` with no blend |
| **Transition** | interpolate between two shots | `blend(a, b, t)`: position lerp, orientation **slerp**, fov lerp |

Orientation is interpolated as a quaternion, never by lerping the target point: a target that passes near the camera flips the view, and a lerped target crosses the scene at a speed the eye reads as a mistake. The rig claims `camera.position`, `camera.quaternion` and `camera.fov` on the loop, so an `OrbitControls` added later is refused instead of fighting it.

```ts
// @verify creative:cinematic/camera-rig.ts nuxt:lib/lab/cinematic/camera-rig.ts next:lib/lab/cinematic/camera-rig.ts
import * as THREE from 'three'
import type { UpdateLoop } from '../engine/update-loop'

export interface Vec3Like {
  x: number
  y: number
  z: number
}
export interface OrbitParams {
  target: Vec3Like
  radius: number
  azimuth: number
  elevation: number
}
export interface Shot {
  position: Vec3Like
  target: Vec3Like
  /** vertical field of view in degrees; defaults to the camera's */
  fov?: number
  /** roll around the view axis in radians */
  roll?: number
  name?: string
  /** present on shots built with orbit(): a blend between two such shots travels along the arc, never through the subject */
  orbit?: OrbitParams
}
export type Ease = (t: number) => number
export const linear: Ease = (t) => t
export const smooth: Ease = (t) => t * t * (3 - 2 * t)
export const smoother: Ease = (t) => t * t * t * (t * (t * 6 - 15) + 10)

const UP = new THREE.Vector3(0, 1, 0)
const _m = new THREE.Matrix4()
const _pa = new THREE.Vector3()
const _pb = new THREE.Vector3()
const _ta = new THREE.Vector3()
const _tb = new THREE.Vector3()
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _roll = new THREE.Quaternion()
const _axis = new THREE.Vector3()

/** The look-at orientation of a shot as a quaternion (with roll applied around the view axis). */
export function shotQuaternion(shot: Shot, out = new THREE.Quaternion()): THREE.Quaternion {
  _pa.set(shot.position.x, shot.position.y, shot.position.z)
  _ta.set(shot.target.x, shot.target.y, shot.target.z)
  _m.lookAt(_pa, _ta, UP)
  out.setFromRotationMatrix(_m)
  if (shot.roll) {
    _axis.subVectors(_ta, _pa).normalize()
    _roll.setFromAxisAngle(_axis, shot.roll)
    out.premultiply(_roll)
  }
  return out
}

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera
  /** cut: the camera takes the shot at once */
  apply(shot: Shot): void
  /** transition: position lerp, orientation slerp, fov lerp, through an easing; t in [0, 1] */
  blend(from: Shot, to: Shot, t: number, ease?: Ease): void
  /** the camera's current state as a shot (useful to transition away from wherever the user left it) */
  current(): Shot
  dispose(): void
}

/** Distance along the view direction; a positive distance moves the camera towards the target. */
export function dolly(shot: Shot, distance: number): Shot {
  _pa.set(shot.position.x, shot.position.y, shot.position.z)
  _ta.set(shot.target.x, shot.target.y, shot.target.z)
  _axis.subVectors(_ta, _pa).normalize().multiplyScalar(distance)
  _pa.add(_axis)
  return { ...shot, position: { x: _pa.x, y: _pa.y, z: _pa.z } }
}

/** A position on the sphere around `target`; azimuth and elevation in radians, elevation 0 = horizon. */
export function orbit(target: Vec3Like, radius: number, azimuth: number, elevation: number, extra: Partial<Shot> = {}): Shot {
  const cosE = Math.cos(elevation)
  return {
    ...extra,
    target,
    position: { x: target.x + radius * cosE * Math.sin(azimuth), y: target.y + radius * Math.sin(elevation), z: target.z + radius * cosE * Math.cos(azimuth) },
    orbit: { target, radius, azimuth, elevation },
  }
}

/** The shortest angular path from a to b (so a blend from 350° to 10° turns 20°, not 340°). */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + delta * t
}

/** Blends two orbit shots along the arc (azimuth and elevation interpolate), not through the sphere. */
export function orbitBlend(target: Vec3Like, radius: [number, number], azimuth: [number, number], elevation: [number, number], t: number, extra: Partial<Shot> = {}): Shot {
  const lerp = (a: number, b: number) => a + (b - a) * t
  return orbit(target, lerp(radius[0], radius[1]), lerp(azimuth[0], azimuth[1]), lerp(elevation[0], elevation[1]), extra)
}

export function createCameraRig(camera: THREE.PerspectiveCamera, loop?: UpdateLoop, owner = 'camera-rig'): CameraRig {
  const claims = ['camera.position', 'camera.quaternion', 'camera.fov']
  for (const c of claims) loop?.claim(c, owner)
  const setFov = (fov: number | undefined) => {
    if (fov === undefined || fov === camera.fov) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  return {
    camera,
    apply(shot) {
      camera.position.set(shot.position.x, shot.position.y, shot.position.z)
      camera.quaternion.copy(shotQuaternion(shot, _qa))
      setFov(shot.fov)
    },
    blend(from, to, t, ease = smooth) {
      const k = ease(Math.min(1, Math.max(0, t)))
      if (from.orbit && to.orbit) {
        // two orbit shots: travel along the sphere (radius, azimuth and elevation interpolate), the target glides
        const lerp = (a: number, b: number) => a + (b - a) * k
        const target = { x: lerp(from.orbit.target.x, to.orbit.target.x), y: lerp(from.orbit.target.y, to.orbit.target.y), z: lerp(from.orbit.target.z, to.orbit.target.z) }
        const arc = orbit(target, lerp(from.orbit.radius, to.orbit.radius), lerpAngle(from.orbit.azimuth, to.orbit.azimuth, k), lerp(from.orbit.elevation, to.orbit.elevation))
        camera.position.set(arc.position.x, arc.position.y, arc.position.z)
      } else {
        _pa.set(from.position.x, from.position.y, from.position.z)
        _pb.set(to.position.x, to.position.y, to.position.z)
        camera.position.lerpVectors(_pa, _pb, k)
      }
      shotQuaternion(from, _qa)
      shotQuaternion(to, _qb)
      camera.quaternion.slerpQuaternions(_qa, _qb, k)
      const fa = from.fov ?? camera.fov
      const fb = to.fov ?? camera.fov
      setFov(fa + (fb - fa) * k)
    },
    current() {
      _axis.set(0, 0, -1).applyQuaternion(camera.quaternion)
      _tb.copy(camera.position).add(_axis)
      return { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, target: { x: _tb.x, y: _tb.y, z: _tb.z }, fov: camera.fov }
    },
    dispose() {
      for (const c of claims) loop?.release(c, owner)
    },
  }
}
```

## 2. Paths: Catmull-Rom, Bézier, arc length

A camera that travels along a spline must move at a speed the eye accepts. `curve.getPoint(t)` is not it: Catmull-Rom and Bézier parameters are not arc length, so the camera speeds up through loose spans and crawls through tight ones. `getPointAt(u)` is arc-length parametrised (Three.js samples the curve into a length table, `arcLengthDivisions`, 200 by default); the helpers below only ever use it. The look-ahead frame (position at `u`, target at `u + lead`) is what a "tracking shot down the corridor" is.

```ts
// @verify creative:cinematic/paths.ts nuxt:lib/lab/cinematic/paths.ts next:lib/lab/cinematic/paths.ts
import * as THREE from 'three'
import type { Shot, Vec3Like } from './camera-rig'

export interface PathOptions {
  closed?: boolean
  /** 'centripetal' avoids cusps and self-intersections between close points; 'chordal' is smoother on even spacing */
  type?: 'centripetal' | 'chordal' | 'catmullrom'
  tension?: number
  /** samples of the arc-length table; raise for long paths with tight turns */
  arcLengthDivisions?: number
}

/** A Catmull-Rom path through the given points, arc-length parametrised. */
export function createPath(points: Vec3Like[], options: PathOptions = {}): THREE.CatmullRomCurve3 {
  if (points.length < 2) throw new Error('a path needs at least two points')
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), options.closed ?? false, options.type ?? 'centripetal', options.tension ?? 0.5)
  curve.arcLengthDivisions = options.arcLengthDivisions ?? 200
  curve.updateArcLengths()
  return curve
}

/** A cubic Bézier, arc-length parametrised like the rest. */
export function createBezier(p0: Vec3Like, c0: Vec3Like, c1: Vec3Like, p1: Vec3Like, arcLengthDivisions = 200): THREE.CubicBezierCurve3 {
  const v = (p: Vec3Like) => new THREE.Vector3(p.x, p.y, p.z)
  const curve = new THREE.CubicBezierCurve3(v(p0), v(c0), v(c1), v(p1))
  curve.arcLengthDivisions = arcLengthDivisions
  curve.updateArcLengths()
  return curve
}

const _p = new THREE.Vector3()
const _l = new THREE.Vector3()

/**
 * The camera shot at fraction `u` of the path length: position on the path, target a little further along it
 * (`lead`, as a fraction of the length) or a fixed target when the shot looks at something.
 */
export function trackingShot(path: THREE.Curve<THREE.Vector3>, u: number, options: { lead?: number; target?: Vec3Like; fov?: number; roll?: number } = {}): Shot {
  const k = Math.min(1, Math.max(0, u))
  path.getPointAt(k, _p)
  let target: Vec3Like
  if (options.target) target = options.target
  else {
    const lead = options.lead ?? 0.02
    // at the very end of an open path look along the final tangent instead of at a point behind the camera
    if (k + lead <= 1) path.getPointAt(k + lead, _l)
    else _l.copy(_p).add(path.getTangentAt(1).multiplyScalar(lead * path.getLength()))
    target = { x: _l.x, y: _l.y, z: _l.z }
  }
  return { position: { x: _p.x, y: _p.y, z: _p.z }, target, fov: options.fov, roll: options.roll }
}

/** Evenly spaced samples along the length (debug lines, placing objects along a route). */
export function samplePath(path: THREE.Curve<THREE.Vector3>, count: number): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => path.getPointAt(count === 1 ? 0 : i / (count - 1)))
}
```

## 3. Shot sequences: scroll or time, reversible, deterministic

A sequence is a list of shots with a weight per transition. `seek(progress)` maps the global progress to a segment and its local eased `t`, blends the two shots, and returns which segment it is in. Nothing is stored between calls except the last progress, so seeking to 1 then back to 0 reproduces the first frame exactly, and the same progress always yields the same camera. Holds (a shot that stays while content reads) are segments from a shot to itself.

The same object serves both drivers. On a timeline: `toTimeline(gsap, duration)` returns a GSAP timeline that tweens the sequence's progress; `play()`, `reverse()`, `pause()` and `ScrollTrigger` scrub all work on it because it is a plain timeline. On scroll with no GSAP at all: compute progress from the scroll position and call `seek`.

```ts
// @verify creative:cinematic/sequence.ts nuxt:lib/lab/cinematic/sequence.ts next:lib/lab/cinematic/sequence.ts
import { linear, smooth, type CameraRig, type Ease, type Shot } from './camera-rig'

export interface Segment {
  from: Shot
  to: Shot
  /** relative duration; a hold is a segment whose `to` is its `from` */
  weight: number
  ease: Ease
  name: string
}
export interface SequenceState {
  progress: number
  segment: number
  /** eased local progress inside the segment */
  local: number
  name: string
}
export interface ShotSequence {
  readonly segments: readonly Segment[]
  /** applies the camera state for a global progress in [0, 1] and returns where it landed */
  seek(progress: number): SequenceState
  readonly state: SequenceState
  /** the progress at which segment `index` starts */
  startOf(index: number): number
  /** a GSAP timeline whose progress drives `seek`; works with play/reverse and with ScrollTrigger scrub */
  toTimeline(gsap: { timeline(vars?: object): GsapTimelineLike }, duration: number): GsapTimelineLike
}
export interface GsapTimelineLike {
  to(target: object, vars: object): GsapTimelineLike
  progress(value?: number): unknown
  kill(): void
}

export interface SequenceStep {
  shot: Shot
  /** weight of the transition INTO this shot (ignored for the first) */
  weight?: number
  ease?: Ease
  /** weight of a hold ON this shot after arriving */
  hold?: number
}

export function createShotSequence(rig: CameraRig, steps: SequenceStep[]): ShotSequence {
  if (steps.length === 0) throw new Error('a sequence needs at least one shot')
  const segments: Segment[] = []
  const first = steps[0]
  if (first && first.hold) segments.push({ from: first.shot, to: first.shot, weight: first.hold, ease: linear, name: `${first.shot.name ?? 'shot-0'}:hold` })
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]
    const step = steps[i]
    if (!prev || !step) continue
    segments.push({ from: prev.shot, to: step.shot, weight: step.weight ?? 1, ease: step.ease ?? smooth, name: step.shot.name ?? `shot-${i}` })
    if (step.hold) segments.push({ from: step.shot, to: step.shot, weight: step.hold, ease: linear, name: `${step.shot.name ?? `shot-${i}`}:hold` })
  }
  const total = segments.reduce((sum, s) => sum + s.weight, 0)
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((sum, s) => sum + s.weight, 0) / (total || 1))
  let state: SequenceState = { progress: 0, segment: 0, local: 0, name: segments[0]?.name ?? first?.shot.name ?? 'shot-0' }

  const seek = (progress: number): SequenceState => {
    const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
    if (segments.length === 0 || total === 0) {
      if (first) rig.apply(first.shot)
      state = { progress: p, segment: 0, local: p, name: first?.shot.name ?? 'shot-0' }
      return state
    }
    let index = segments.length - 1
    for (let i = 0; i < segments.length; i++) {
      const start = starts[i] ?? 0
      const end = start + (segments[i]?.weight ?? 0) / total
      if (p < end || i === segments.length - 1) {
        index = i
        break
      }
    }
    const segment = segments[index]
    const start = starts[index] ?? 0
    const span = (segment?.weight ?? 1) / total
    const raw = span > 0 ? Math.min(1, Math.max(0, (p - start) / span)) : 1
    if (segment) {
      rig.blend(segment.from, segment.to, raw, segment.ease)
      state = { progress: p, segment: index, local: segment.ease(raw), name: segment.name }
    }
    return state
  }

  return {
    segments,
    seek,
    get state() {
      return state
    },
    startOf: (index) => starts[index] ?? 1,
    toTimeline(gsap, duration) {
      const proxy = { progress: state.progress }
      const tl = gsap.timeline({ paused: true })
      tl.to(proxy, { progress: 1, duration, ease: 'none', onUpdate: () => seek(proxy.progress) })
      return tl
    },
  }
}
```

## 4. Cue sheets: HTML, lights, uniforms in sync

A chapter title fades in when the camera arrives, a light warms up while a material dissolves, a caption leaves when the next shot starts. These are cues on the same progress axis as the sequence, so they are exactly as reversible and deterministic as the camera. A cue has a range, `enter` and `leave` callbacks that fire in both directions, and an `update(local)` called while inside. Seeking across several cues in one step (a fast scroll, a keyboard jump to chapter four) fires the enters and leaves in order, forwards or backwards.

```ts
// @verify creative:cinematic/cues.ts nuxt:lib/lab/cinematic/cues.ts next:lib/lab/cinematic/cues.ts
export interface Cue {
  name: string
  /** global progress range [start, end) */
  start: number
  end: number
  enter?: (direction: 1 | -1) => void
  leave?: (direction: 1 | -1) => void
  /** local progress inside the range, 0..1 */
  update?: (local: number, direction: 1 | -1) => void
}
export interface CueSheet {
  add(cue: Cue): () => void
  /** evaluates every cue for the new progress; returns the names currently active */
  seek(progress: number): string[]
  readonly active: readonly string[]
  readonly progress: number
  /** fires leave on every active cue (unmount) */
  reset(): void
}

export function createCueSheet(): CueSheet {
  const cues: Cue[] = []
  const active = new Set<Cue>()
  let last = -1
  const inside = (cue: Cue, p: number) => p >= cue.start && (p < cue.end || (cue.end >= 1 && p >= 1))
  // active names in the order of the sheet (by start), whatever direction they were entered from
  const names = () => cues.filter((c) => active.has(c)).map((c) => c.name)
  return {
    add(cue) {
      cues.push(cue)
      cues.sort((a, b) => a.start - b.start)
      return () => {
        const i = cues.indexOf(cue)
        if (i >= 0) cues.splice(i, 1)
        if (active.delete(cue)) cue.leave?.(1)
      }
    },
    seek(progress) {
      const p = Math.min(1, Math.max(0, progress))
      const direction: 1 | -1 = p >= last ? 1 : -1
      // leave first (in reverse order of start when going backwards), then enter, then update
      const ordered = direction === 1 ? cues : [...cues].reverse()
      for (const cue of ordered) if (active.has(cue) && !inside(cue, p)) { active.delete(cue); cue.leave?.(direction) }
      for (const cue of ordered) if (!active.has(cue) && inside(cue, p)) { active.add(cue); cue.enter?.(direction) }
      for (const cue of ordered) {
        if (!active.has(cue)) continue
        const span = cue.end - cue.start
        cue.update?.(span > 0 ? Math.min(1, Math.max(0, (p - cue.start) / span)) : 1, direction)
      }
      last = p
      return names()
    },
    get active() {
      return names()
    },
    get progress() {
      return Math.max(0, last)
    },
    reset() {
      for (const cue of [...active].reverse()) cue.leave?.(-1)
      active.clear()
      last = -1
    },
  }
}
```

## 5. Skeletal and morph animation: the clip player

`AnimationMixer` plays `AnimationClip`s (from a GLTF or built in code) on a root object: skeletal tracks (`bone.quaternion`), morph target influences (`mesh.morphTargetInfluences[name]`), any numeric property. The player below adds what experiences need and the mixer does not provide by itself: a scrub mode (`seek(name, progress)`) so a GLTF animation can follow scroll like the camera does, cross-fades with weights that sum to one, and a single `update(delta)` from the loop's `animation` phase. Morph targets without a clip are driven directly by name.

```ts
// @verify creative:cinematic/clip-player.ts nuxt:lib/lab/cinematic/clip-player.ts next:lib/lab/cinematic/clip-player.ts
import * as THREE from 'three'

export interface ClipPlayer {
  readonly mixer: THREE.AnimationMixer
  readonly names: string[]
  /** plays a clip from the start (fading in over `fade` seconds when another was playing) */
  play(name: string, options?: { fade?: number; loop?: boolean; timeScale?: number }): THREE.AnimationAction
  /** cross-fades from the currently playing clip to `name` */
  crossfade(name: string, duration: number): void
  /** scrub: puts the clip at `progress` of its duration and holds it there (paused) */
  seek(name: string, progress: number): void
  /** call from the animation phase */
  update(delta: number): void
  weights(): Record<string, number>
  readonly current: string | null
  dispose(): void
}

export function createClipPlayer(root: THREE.Object3D, clips: THREE.AnimationClip[]): ClipPlayer {
  const mixer = new THREE.AnimationMixer(root)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip))
  let current: string | null = null
  const get = (name: string) => {
    const action = actions.get(name)
    if (!action) throw new Error(`no clip named "${name}" (have ${[...actions.keys()].join(', ')})`)
    return action
  }
  return {
    mixer,
    names: [...actions.keys()],
    play(name, options = {}) {
      const action = get(name)
      action.reset()
      action.setLoop(options.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = options.loop === false
      action.timeScale = options.timeScale ?? 1
      action.paused = false
      action.enabled = true
      if (current && current !== name && options.fade) {
        get(current).crossFadeTo(action, options.fade, true)
        action.play()
      } else {
        for (const [other, a] of actions) if (other !== name) a.stop()
        action.setEffectiveWeight(1)
        action.play()
      }
      current = name
      return action
    },
    crossfade(name, duration) {
      if (current === name) return
      const to = get(name)
      to.reset().setEffectiveWeight(1).play()
      if (current) get(current).crossFadeTo(to, duration, true)
      current = name
    },
    seek(name, progress) {
      const action = get(name)
      if (current !== name) {
        for (const [, a] of actions) a.stop()
        action.reset().setEffectiveWeight(1).play()
        current = name
      }
      action.paused = true
      action.time = Math.min(1, Math.max(0, progress)) * action.getClip().duration
      mixer.update(0)
    },
    update(delta) {
      mixer.update(delta)
    },
    weights() {
      const out: Record<string, number> = {}
      for (const [name, a] of actions) out[name] = a.isRunning() || a.paused ? a.getEffectiveWeight() : 0
      return out
    },
    get current() {
      return current
    },
    dispose() {
      mixer.stopAllAction()
      for (const clip of clips) mixer.uncacheClip(clip)
      mixer.uncacheRoot(root)
    },
  }
}

export interface MorphDriver {
  readonly names: string[]
  set(name: string, weight: number): void
  get(name: string): number
  /** blends towards a set of weights by `t`, leaving unnamed targets untouched */
  blendTo(weights: Record<string, number>, t: number): void
}

/** Direct control of a mesh's morph targets by name (the geometry's morphAttributes must carry names). */
export function createMorphDriver(mesh: THREE.Mesh): MorphDriver {
  mesh.updateMorphTargets()
  const dictionary = mesh.morphTargetDictionary ?? {}
  const influences = mesh.morphTargetInfluences ?? []
  const indexOf = (name: string) => {
    const i = dictionary[name]
    if (i === undefined) throw new Error(`no morph target "${name}" (have ${Object.keys(dictionary).join(', ')})`)
    return i
  }
  return {
    names: Object.keys(dictionary),
    set: (name, weight) => {
      influences[indexOf(name)] = weight
    },
    get: (name) => influences[indexOf(name)] ?? 0,
    blendTo(weights, t) {
      const k = Math.min(1, Math.max(0, t))
      for (const [name, target] of Object.entries(weights)) {
        const i = indexOf(name)
        const now = influences[i] ?? 0
        influences[i] = now + (target - now) * k
      }
    },
  }
}
```

## 6. Frame-rate independent interpolation

`value += (target - value) * 0.1` per frame is the most common camera-follow code and it is wrong: it moves twice as fast at 120 Hz as at 60 Hz. Exponential damping with the frame's delta (`1 - exp(-lambda * dt)`) converges on the same curve whatever the frame rate; `THREE.MathUtils.damp` is the scalar version, the helpers below do vectors and quaternions and the shortest-arc slerp a follow camera needs.

```ts
// @verify creative:cinematic/interpolation.ts nuxt:lib/lab/cinematic/interpolation.ts next:lib/lab/cinematic/interpolation.ts
import * as THREE from 'three'

/** Fraction of the remaining distance to cover this frame for a response rate `lambda` (1/s); frame-rate independent. */
export function dampFactor(lambda: number, delta: number): number {
  return 1 - Math.exp(-lambda * delta)
}

export function dampVector(current: THREE.Vector3, target: THREE.Vector3, lambda: number, delta: number): THREE.Vector3 {
  return current.lerp(target, dampFactor(lambda, delta))
}

const _q = new THREE.Quaternion()

/** Slerp along the shortest arc (negating the target when the dot product is negative avoids the long way round). */
export function slerpShortest(current: THREE.Quaternion, target: THREE.Quaternion, t: number): THREE.Quaternion {
  _q.copy(target)
  if (current.dot(_q) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w)
  return current.slerp(_q, t)
}

export function dampQuaternion(current: THREE.Quaternion, target: THREE.Quaternion, lambda: number, delta: number): THREE.Quaternion {
  return slerpShortest(current, target, dampFactor(lambda, delta))
}

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const remap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => outMin + ((clamp01((value - inMin) / (inMax - inMin || 1))) * (outMax - outMin))
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1))
  return t * t * (3 - 2 * t)
}
```

## 7. Scene transitions

Cutting between two 3D scenes (a product hall to a close-up stage, chapter two to chapter three) is a render of both into targets and a full-screen blend driven by progress: a crossfade, a directional wipe, a radial iris, or a noise dissolve, all one shader with a `uMode`. The two render targets are `own` resources sized with the viewport; during the transition both scenes render every frame (two full passes), so transitions are short and the pipeline skips the second scene when progress is 0 or 1. The shader lives in `shader-engineering.md` (`maskTransitionFragment`); the helper below owns the targets and the quad and plugs into `runtime.setRender`.

```ts
// @verify creative:cinematic/scene-transition.ts nuxt:lib/lab/cinematic/scene-transition.ts next:lib/lab/cinematic/scene-transition.ts
import * as THREE from 'three'
import { fullscreenVertex, maskTransitionFragment, type TransitionMode, TRANSITION_MODES } from '../shaders/glsl/transitions'
import type { ResourceRegistry } from '../engine/resource-registry'

export interface SceneView {
  scene: THREE.Scene
  camera: THREE.Camera
}
export interface SceneTransition {
  readonly material: THREE.ShaderMaterial
  progress: number
  mode: TransitionMode
  /** renders A, B or the blend, depending on progress */
  render(renderer: THREE.WebGLRenderer, a: SceneView, b: SceneView): void
  setSize(width: number, height: number, pixelRatio: number): void
  dispose(): void
}

export function createSceneTransition(registry: ResourceRegistry, options: { mode?: TransitionMode; softness?: number } = {}): SceneTransition {
  const targetOptions = { depthBuffer: true, stencilBuffer: false, samples: 0 }
  const targetA = registry.own(new THREE.WebGLRenderTarget(1, 1, targetOptions), 'transition-target-a')
  const targetB = registry.own(new THREE.WebGLRenderTarget(1, 1, targetOptions), 'transition-target-b')
  const uniforms = {
    uFrom: { value: targetA.texture },
    uTo: { value: targetB.texture },
    uProgress: { value: 0 },
    uMode: { value: TRANSITION_MODES.indexOf(options.mode ?? 'dissolve') },
    uSoftness: { value: options.softness ?? 0.15 },
    uAspect: { value: 1 },
  }
  const material = registry.own(new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: maskTransitionFragment, uniforms, depthTest: false, depthWrite: false }), 'transition-material')
  const quad = new THREE.Mesh(registry.own(new THREE.PlaneGeometry(2, 2), 'transition-quad'), material)
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  let mode: TransitionMode = options.mode ?? 'dissolve'
  return {
    material,
    progress: 0,
    get mode() {
      return mode
    },
    set mode(value) {
      mode = value
      uniforms.uMode.value = TRANSITION_MODES.indexOf(value)
    },
    render(renderer, a, b) {
      const p = Math.min(1, Math.max(0, this.progress))
      if (p <= 0) return renderer.render(a.scene, a.camera)
      if (p >= 1) return renderer.render(b.scene, b.camera)
      const previous = renderer.getRenderTarget()
      renderer.setRenderTarget(targetA)
      renderer.render(a.scene, a.camera)
      renderer.setRenderTarget(targetB)
      renderer.render(b.scene, b.camera)
      renderer.setRenderTarget(previous)
      uniforms.uProgress.value = p
      renderer.render(quadScene, quadCamera)
    },
    setSize(width, height, pixelRatio) {
      const w = Math.max(1, Math.floor(width * pixelRatio))
      const h = Math.max(1, Math.floor(height * pixelRatio))
      targetA.setSize(w, h)
      targetB.setSize(w, h)
      uniforms.uAspect.value = width / Math.max(1, height)
    },
    dispose() {
      // the registry disposes the targets, the material and the quad geometry with the runtime
      quadScene.clear()
    },
  }
}
```

## 8. Coordination rules (GSAP + Three.js)

- **GSAP drives numbers, the loop renders.** A tween writes `proxy.progress` or `uniform.value` in the `animation` phase (GSAP is driven from the loop, `immersive-3d-architecture.md` section 5); nothing in a tween callback calls `renderer.render`.
- **Tween proxies, not Three.js objects, when more than one property moves together.** `gsap.to(sequenceProxy, { progress: 1 })` with `onUpdate: () => sequence.seek(proxy.progress)` keeps the camera, the cues and the materials on one axis. Tweening `camera.position` directly is fine for a single isolated move and forbidden while a rig owns the camera (the loop's claim says so).
- **Scroll scrubs the timeline, never the camera.** `ScrollTrigger` with `scrub` updates the timeline's progress; the sequence reads it. Reduced motion: no scrub, `seek(1)` or `seek(chapterStart)` on navigation.
- **Playback is state.** `play()`, `reverse()`, `seek()` are the only ways the experience moves; a keyboard "next chapter" tweens the progress to `startOf(n)` with the same easing as scroll would.
- **One mixer per animated root, updated once per frame** in the `animation` phase; scrubbing sets `action.time` and updates with 0.
- **Lights, uniforms and DOM are cues**, not separate timelines. A cue's `update(local)` writes `light.intensity` or `uniforms.uDissolve.value`; the DOM part toggles classes or `aria-current`.

## 9. Tests

The rig, paths, sequences, cues, clips and interpolation run in Node against real Three.js math (no renderer). The scene transition and the whole choreography are driven in Chromium by the lab pages of `immersive-experiences.md`.

```ts
// @verify creative:cinematic/camera-rig.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createUpdateLoop, PropertyOwnershipError } from '../engine/update-loop'
import { createCameraRig, dolly, orbit, orbitBlend, shotQuaternion, type Shot } from './camera-rig'

const A: Shot = { name: 'wide', position: { x: 0, y: 2, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 40 }
const B: Shot = { name: 'side', position: { x: 10, y: 2, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 28 }

describe('camera rig', () => {
  it('cuts to a shot and blends position, orientation and fov back and forth exactly', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    const rig = createCameraRig(camera)
    rig.apply(A)
    expect(camera.position.toArray()).toEqual([0, 2, 10])
    expect(camera.fov).toBe(40)
    const start = camera.quaternion.clone()
    rig.blend(A, B, 1)
    expect(camera.position.toArray()).toEqual([10, 2, 0])
    expect(camera.fov).toBe(28)
    expect(camera.quaternion.angleTo(shotQuaternion(B))).toBeLessThan(1e-6)
    rig.blend(A, B, 0)
    expect(camera.position.toArray()).toEqual([0, 2, 10])
    expect(camera.quaternion.angleTo(start)).toBeLessThan(1e-6)
  })

  it('interpolates orientation along the arc: at the midpoint the camera is half-way in angle, not through the target', () => {
    const camera = new THREE.PerspectiveCamera()
    const rig = createCameraRig(camera)
    const qa = shotQuaternion(A)
    const qb = shotQuaternion(B)
    rig.blend(A, B, 0.5, (t) => t)
    const total = qa.angleTo(qb)
    expect(camera.quaternion.angleTo(qa)).toBeCloseTo(total / 2, 5)
    expect(camera.quaternion.angleTo(qb)).toBeCloseTo(total / 2, 5)
  })

  it('blends two orbit shots along the arc (the camera never crosses the subject) and other shots in a straight line', () => {
    const camera = new THREE.PerspectiveCamera()
    const rig = createCameraRig(camera)
    const centre = { x: 0, y: 1, z: 0 }
    const front = orbit(centre, 5, 0, 0.2, { name: 'front' })
    const back = orbit(centre, 5, Math.PI, 0.2, { name: 'back' })
    rig.blend(front, back, 0.5, (t) => t)
    expect(Math.hypot(camera.position.x - centre.x, camera.position.y - centre.y, camera.position.z - centre.z)).toBeCloseTo(5, 6)
    expect(Math.abs(camera.position.x)).toBeGreaterThan(4) // on the side of the sphere, not at the centre
    const almostFull = orbit(centre, 5, (350 * Math.PI) / 180, 0)
    const little = orbit(centre, 5, (10 * Math.PI) / 180, 0)
    rig.blend(almostFull, little, 0.5, (t) => t)
    expect(camera.position.x).toBeCloseTo(0, 6) // the short way round: azimuth 0 at the midpoint
    expect(camera.position.z).toBeCloseTo(5, 6)
    rig.blend(A, B, 0.5, (t) => t) // A and B carry no orbit: straight line between the positions
    expect(camera.position.x).toBeCloseTo(5, 6)
    expect(camera.position.z).toBeCloseTo(5, 6)
  })

  it('dolly moves along the view direction and orbit keeps the radius', () => {
    const closer = dolly(A, 4)
    expect(closer.position.z).toBeLessThan(A.position.z)
    const d0 = Math.hypot(A.position.x, A.position.y, A.position.z)
    const d1 = Math.hypot(closer.position.x, closer.position.y, closer.position.z)
    expect(d0 - d1).toBeCloseTo(4, 6)
    for (const az of [0, 1, 2, 3]) {
      const s = orbit({ x: 1, y: 1, z: 1 }, 5, az, 0.3)
      expect(Math.hypot(s.position.x - 1, s.position.y - 1, s.position.z - 1)).toBeCloseTo(5, 6)
    }
    const mid = orbitBlend({ x: 0, y: 0, z: 0 }, [5, 5], [0, Math.PI], [0, 0], 0.5)
    expect(Math.hypot(mid.position.x, mid.position.y, mid.position.z)).toBeCloseTo(5, 6) // along the arc, not through the centre
  })

  it('claims the camera on the loop and refuses a second driver', () => {
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {} })
    const rig = createCameraRig(new THREE.PerspectiveCamera(), loop)
    expect(() => loop.claim('camera.position', 'orbit-controls')).toThrow(PropertyOwnershipError)
    rig.dispose()
    expect(() => loop.claim('camera.position', 'orbit-controls')).not.toThrow()
  })
})
```

```ts
// @verify creative:cinematic/paths.test.ts
import { describe, expect, it } from 'vitest'
import { createBezier, createPath, samplePath, trackingShot } from './paths'

describe('paths', () => {
  const corridor = createPath([{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -5 }, { x: 3, y: 1, z: -9 }, { x: 8, y: 1, z: -9 }])

  it('is arc-length parametrised: equal steps in u are equal distances', () => {
    const samples = samplePath(corridor, 41)
    const distances = samples.slice(1).map((p, i) => p.distanceTo(samples[i]!))
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length
    for (const d of distances) expect(Math.abs(d - mean) / mean).toBeLessThan(0.03)
    expect(samples[0]!.toArray()).toEqual([0, 1, 0])
    expect(samples.at(-1)!.distanceTo({ x: 8, y: 1, z: -9 } as never)).toBeLessThan(1e-6)
  })

  it('tracking shots look ahead along the path and along the final tangent at the end', () => {
    const start = trackingShot(corridor, 0, { lead: 0.05 })
    expect(start.target.z).toBeLessThan(start.position.z) // looking down the corridor (−z)
    const end = trackingShot(corridor, 1, { lead: 0.05 })
    expect(end.target.x).toBeGreaterThan(end.position.x) // the last span heads +x
    const fixed = trackingShot(corridor, 0.5, { target: { x: 0, y: 0, z: 0 } })
    expect(fixed.target).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('Bézier paths share the same parametrisation', () => {
    const curve = createBezier({ x: 0, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }, { x: 4, y: 4, z: 0 }, { x: 4, y: 0, z: 0 })
    const half = curve.getPointAt(0.5)
    expect(half.x).toBeCloseTo(2, 2)
    expect(curve.getLength()).toBeGreaterThan(4)
    expect(() => createPath([{ x: 0, y: 0, z: 0 }])).toThrow()
  })
})
```

```ts
// @verify creative:cinematic/sequence.test.ts
import gsap from 'gsap'
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { createUpdateLoop } from '../engine/update-loop'
import { driveGsapFromLoop } from '../engine/gsap-clock'
import { createCameraRig, type Shot } from './camera-rig'
import { createShotSequence } from './sequence'

const shots: Shot[] = [
  { name: 'establishing', position: { x: 0, y: 3, z: 12 }, target: { x: 0, y: 0, z: 0 }, fov: 45 },
  { name: 'detail', position: { x: 2, y: 1, z: 3 }, target: { x: 0, y: 0.5, z: 0 }, fov: 30 },
  { name: 'reverse', position: { x: -4, y: 1.5, z: -3 }, target: { x: 0, y: 0.5, z: 0 }, fov: 35 },
]
const build = () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const rig = createCameraRig(camera)
  const sequence = createShotSequence(rig, [{ shot: shots[0]!, hold: 1 }, { shot: shots[1]!, weight: 2 }, { shot: shots[2]!, weight: 1, hold: 1 }])
  return { camera, sequence }
}

afterEach(() => {
  gsap.globalTimeline.clear()
})

describe('shot sequence', () => {
  it('maps progress to segments with weights and holds, and is deterministic and reversible', () => {
    const { camera, sequence } = build()
    // weights: hold 1, transition 2, transition 1, hold 1 → total 5
    expect(sequence.segments.map((s) => s.name)).toEqual(['establishing:hold', 'detail', 'reverse', 'reverse:hold'])
    expect(sequence.startOf(1)).toBeCloseTo(0.2, 6)
    expect(sequence.startOf(2)).toBeCloseTo(0.6, 6)
    expect(sequence.seek(0.1).name).toBe('establishing:hold')
    expect(camera.position.toArray()).toEqual([0, 3, 12]) // a hold does not move
    const mid = sequence.seek(0.4)
    expect(mid.segment).toBe(1)
    expect(mid.local).toBeCloseTo(0.5, 6) // smoothstep(0.5) = 0.5
    const midPosition = camera.position.toArray()
    sequence.seek(1)
    expect(camera.position.toArray()).toEqual([-4, 1.5, -3])
    expect(camera.fov).toBe(35)
    sequence.seek(0.4)
    expect(camera.position.toArray()).toEqual(midPosition)
    sequence.seek(0)
    expect(camera.position.toArray()).toEqual([0, 3, 12])
    expect(sequence.seek(Number.NaN).progress).toBe(0)
    expect(sequence.seek(7).progress).toBe(1)
  })

  it('plays on a GSAP timeline driven by the loop and lands on the same checkpoints as seek', () => {
    const { camera, sequence } = build()
    const loop = createUpdateLoop({ schedule: () => {}, unschedule: () => {}, maxDelta: 10 })
    const restore = driveGsapFromLoop(loop, gsap)
    const tl = sequence.toTimeline(gsap, 10)
    ;(tl as unknown as { play(): void }).play()
    loop.step(0)
    loop.step(4000) // 40% of 10 s
    const played = camera.position.toArray()
    const direct = build()
    direct.sequence.seek(0.4)
    for (let i = 0; i < 3; i++) expect(played[i]).toBeCloseTo(direct.camera.position.toArray()[i]!, 6)
    loop.step(10000)
    expect(camera.position.toArray()).toEqual([-4, 1.5, -3])
    tl.kill()
    restore()
  })
})
```

```ts
// @verify creative:cinematic/cues.test.ts
import { describe, expect, it } from 'vitest'
import { createCueSheet } from './cues'

describe('cue sheet', () => {
  const sheet = () => {
    const log: string[] = []
    const cues = createCueSheet()
    for (const [name, start, end] of [['title', 0, 0.3], ['detail', 0.25, 0.6], ['outro', 0.6, 1]] as const) {
      cues.add({ name, start, end, enter: (d) => log.push(`+${name}${d > 0 ? '>' : '<'}`), leave: (d) => log.push(`-${name}${d > 0 ? '>' : '<'}`), update: (t) => log.push(`${name}@${t.toFixed(2)}`) })
    }
    return { log, cues }
  }

  it('enters, updates and leaves in both directions, overlapping ranges included', () => {
    const { log, cues } = sheet()
    expect(cues.seek(0)).toEqual(['title'])
    expect(cues.seek(0.27)).toEqual(['title', 'detail'])
    expect(cues.seek(0.5)).toEqual(['detail'])
    expect(cues.seek(0.27)).toEqual(['title', 'detail']) // backwards into title again
    expect(log).toEqual(['+title>', 'title@0.00', '+detail>', 'title@0.90', 'detail@0.06', '-title>', 'detail@0.71', '+title<', 'detail@0.06', 'title@0.90'])
  })

  it('a jump across several cues fires every enter and leave in order; reset leaves everything', () => {
    const { log, cues } = sheet()
    cues.seek(0)
    log.length = 0
    expect(cues.seek(1)).toEqual(['outro'])
    expect(log).toEqual(['-title>', '+outro>', 'outro@1.00'])
    log.length = 0
    cues.seek(0.1) // backwards jump: leave outro, enter title
    expect(log).toEqual(['-outro<', '+title<', 'title@0.33'])
    cues.reset()
    expect(cues.active).toEqual([])
    expect(log.at(-1)).toBe('-title<')
  })

  it('removing a cue while active leaves it', () => {
    const cues = createCueSheet()
    const left: string[] = []
    const remove = cues.add({ name: 'x', start: 0, end: 1, leave: () => left.push('x') })
    cues.seek(0.5)
    remove()
    expect(left).toEqual(['x'])
    expect(cues.seek(0.6)).toEqual([])
  })
})
```

```ts
// @verify creative:cinematic/clip-player.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createClipPlayer, createMorphDriver } from './clip-player'

/** A rig built in code: one bone-like child moving on x, a quaternion track, and a morph-target mesh. */
function buildRig() {
  const root = new THREE.Group()
  const part = new THREE.Object3D()
  part.name = 'part'
  root.add(part)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const positions = geometry.attributes.position as THREE.BufferAttribute
  const inflated = positions.clone()
  for (let i = 0; i < inflated.count; i++) inflated.setXYZ(i, inflated.getX(i) * 2, inflated.getY(i) * 2, inflated.getZ(i) * 2)
  inflated.name = 'inflate'
  geometry.morphAttributes.position = [inflated]
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  mesh.name = 'blob'
  root.add(mesh)
  const slide = new THREE.AnimationClip('slide', 2, [new THREE.VectorKeyframeTrack('part.position', [0, 2], [0, 0, 0, 4, 0, 0])])
  const turn = new THREE.AnimationClip('turn', 1, [new THREE.QuaternionKeyframeTrack('part.quaternion', [0, 1], [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2])])
  const inflate = new THREE.AnimationClip('inflate', 1, [new THREE.NumberKeyframeTrack('blob.morphTargetInfluences[inflate]', [0, 1], [0, 1])])
  return { root, part, mesh, clips: [slide, turn, inflate] }
}

describe('clip player', () => {
  it('scrubs a clip to a progress and plays it forward with the loop delta', () => {
    const { root, part, clips } = buildRig()
    const player = createClipPlayer(root, clips)
    expect(player.names).toEqual(['slide', 'turn', 'inflate'])
    player.seek('slide', 0.5)
    expect(part.position.x).toBeCloseTo(2, 6)
    player.seek('slide', 0.25)
    expect(part.position.x).toBeCloseTo(1, 6)
    player.play('slide', { loop: false })
    player.update(0.5)
    expect(part.position.x).toBeCloseTo(1, 6)
    player.update(5) // clamps at the end when loop is off
    expect(part.position.x).toBeCloseTo(4, 6)
    player.dispose()
  })

  it('cross-fades with weights that sum to one and rotates through the quaternion track', () => {
    const { root, part, clips } = buildRig()
    const player = createClipPlayer(root, clips)
    player.play('slide')
    player.crossfade('turn', 1)
    player.update(0.5)
    const w = player.weights()
    expect(w.slide! + w.turn!).toBeCloseTo(1, 6)
    expect(w.turn).toBeGreaterThan(0.4)
    expect(player.current).toBe('turn')
    player.update(1)
    expect(player.weights().slide).toBeCloseTo(0, 6)
    // the quaternion track turned the part a quarter around y
    const euler = new THREE.Euler().setFromQuaternion(part.quaternion)
    expect(Math.abs(euler.y)).toBeGreaterThan(0.5)
  })

  it('drives morph targets by name, from a clip and directly', () => {
    const { root, mesh, clips } = buildRig()
    const player = createClipPlayer(root, clips)
    const morph = createMorphDriver(mesh)
    expect(morph.names).toEqual(['inflate'])
    player.seek('inflate', 0.75)
    expect(morph.get('inflate')).toBeCloseTo(0.75, 6)
    player.dispose()
    morph.set('inflate', 0)
    morph.blendTo({ inflate: 1 }, 0.5)
    expect(morph.get('inflate')).toBeCloseTo(0.5, 6)
    expect(() => morph.set('nope', 1)).toThrow(/no morph target/)
  })
})
```

```ts
// @verify creative:cinematic/interpolation.test.ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { dampFactor, dampQuaternion, dampVector, remap, slerpShortest, smoothstep } from './interpolation'

describe('interpolation', () => {
  it('damping reaches the same place at 30, 60 and 144 Hz', () => {
    const run = (hz: number) => {
      const v = new THREE.Vector3(0, 0, 0)
      const target = new THREE.Vector3(10, 0, 0)
      for (let t = 0; t < 1; t += 1 / hz) dampVector(v, target, 4, 1 / hz)
      return v.x
    }
    const [a, b, c] = [run(30), run(60), run(144)]
    expect(Math.abs(a - b)).toBeLessThan(0.15)
    expect(Math.abs(b - c)).toBeLessThan(0.15)
    expect(b).toBeCloseTo(10 * (1 - Math.exp(-4)), 0)
    expect(dampFactor(4, 0)).toBe(0)
  })

  it('slerps along the shortest arc and damps quaternions', () => {
    const from = new THREE.Quaternion()
    const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (170 * Math.PI) / 180)
    const negated = target.clone()
    negated.set(-negated.x, -negated.y, -negated.z, -negated.w) // the same rotation, the long way for a naive slerp
    const q = slerpShortest(from.clone(), negated, 0.5)
    expect(q.angleTo(from)).toBeCloseTo((85 * Math.PI) / 180, 4)
    const d = dampQuaternion(new THREE.Quaternion(), target, 5, 1)
    expect(d.angleTo(target)).toBeLessThan(from.angleTo(target))
  })

  it('remap and smoothstep clamp their input', () => {
    expect(remap(5, 0, 10, 100, 200)).toBe(150)
    expect(remap(-1, 0, 10, 100, 200)).toBe(100)
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
    expect(smoothstep(0, 1, 2)).toBe(1)
  })
})
```
