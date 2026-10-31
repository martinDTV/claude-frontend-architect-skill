# Creative quality rubric for 3D and motion experiences

How to judge an immersive experience before calling it done, and how the judgement splits between what a machine can verify and what needs eyes. Scores reward intention and coherence; adding particles, passes or effects earns nothing by itself and loses points when it costs legibility or frame time.

## Contents

1. How to use it
2. The criteria
3. What is verified automatically
4. What needs a human
5. Anti-patterns that cap the score
6. Review procedure

## 1. How to use it

Score each criterion 0–3 (absent, weak, solid, exceptional) and write one sentence of evidence per score: a measurement, a screenshot reference, a line of code. The automated part comes from the browser checks and the audit tools (`immersive-experiences.md` section 6, `leak-patterns` 3D rules, `browser-audit`); the human part is a review of the evidence screenshots at three progress values per experience plus a live session on a real device. An experience ships when no criterion is at 0, the automated criteria are all at 2 or more, and the total is at least two thirds of the maximum. A single anti-pattern from section 5 caps the total regardless.

## 2. The criteria

| # | Criterion | 3 looks like | Verified by |
|---|---|---|---|
| 1 | **Art direction** | one idea carried through light, palette, materials and motion; a reviewer can say what it is in a sentence | human |
| 2 | **Meaningful visual complexity** | every element earns its place; density serves the story or the product, nothing is there to impress | human |
| 3 | **Material quality** | finishes read as what they are (glass, lacquer, brushed metal); no plastic look, no clipped highlights, roughness and metalness in physical ranges | tools: `materialIssues`, exposure and tone mapping declared; human: appearance |
| 4 | **Lighting** | shaping (key, fill, rim) plus an environment; the subject separates from the background; shadows soft and fitted | tools: environment present, fitted shadow camera; human: shaping |
| 5 | **Choreography** | shots with intent (establishing, detail, reveal), holds for reading, transitions along arcs, no cuts through geometry | tools: camera checkpoints, orientation slerp, reversible seek; human: pacing |
| 6 | **Transitions** | scene and chapter transitions motivated and short; masks match the mood; nothing pops | tools: transition progress and modes; human: feel |
| 7 | **Interactivity** | pointer, scroll, keys and buttons all work and agree; explore mode hands over cleanly; hover is never the only path | tools: api parity, keyboard navigation, ownership hand-over; human: feel of damping and response |
| 8 | **Narrative coherence** | chapters, captions and camera tell one story; the DOM reads the same story without the canvas | tools: cues and `aria-current` follow progress; human: reading |
| 9 | **Accessibility** | reduced motion keeps the experience usable, keyboard reaches everything essential, focus visible, canvas content mirrored in the DOM, 24 px targets | tools: reduced-motion checks, keyboard checks, `browser-audit` axe and target size; human: screen-reader pass |
| 10 | **Performance** | frame budget met on the device class it targets, adaptive tiers that step down without visible pops, no growth across navigation | tools: metrics, tier changes, re-entry counts, disposal to baseline; human: pops and judder on a real device |
| 11 | **Code quality** | one clock, explicit ownership, registered resources, no competing drivers, no allocation in frame loops, typed uniforms | tools: `leak-patterns` 3D and motion rules, Node tests of the pure modules; human: review of the seams |

## 3. What is verified automatically

- Camera positions and field of view at the documented checkpoints; orientation interpolated along the arc; a seek to 0 after 1 reproduces the first frame exactly.
- Cue activation at boundaries in both directions; chapter index, hash, `aria-current` and the live region after keys and buttons.
- Shader programs compile and link; each material renders a non-empty, distinct image; dissolve and transitions sweep from A to B; post-processing renders at every tier with the expected passes and target sizes; TSL materials compile on the WebGL 2 backend.
- Particle simulation converges on its formations (float read-back), morphs, responds to the pointer; density changes the drawn count; one draw call per system; the CPU baseline's JavaScript time grows with the count while the GPU systems' stays flat.
- Context loss stops the loop; restore rebuilds and resumes.
- Reduced motion: scrub disabled, loop alive, chapter changes cut.
- Disposal returns `renderer.info.memory` to the renderer's own allocations; re-entry has equal counts; every mount is disposed (React Strict Mode included).
- No console errors, no hydration warnings; portrait viewport changes the fov scale; the DOM controls drive the same state as the api.
- Static: no resources created in frame loops, no renderers outside the client lifecycle, no loops without a stop, no competing drivers, clamped pixel ratio, typed uniform writes.

What the automation says nothing about: whether it is beautiful, whether the pacing breathes, whether the materials read as intended, whether the transitions feel motivated, whether the frame rate holds on the phone in a pocket. The screenshots and the metrics are inputs to that judgement, not substitutes.

## 4. What needs a human

Look at the three evidence screenshots per experience (progress 0, 0.5, 1) and a live session:

- **Composition**: subject placement, negative space, where the eye lands first and second.
- **Light**: does the key direction stay consistent across shots; are there crushed blacks or clipped whites that are not intentional.
- **Materials**: glass looks like glass at the thickness chosen; lacquer has a believable clearcoat highlight; brushed metal shows anisotropy along the right axis.
- **Motion**: ease curves, hold lengths, whether a transition arrives too early or too late relative to the caption.
- **Legibility**: captions readable over the darkest and brightest frame; UI controls visible on top of grain and bloom.
- **Device**: a mid-range phone and a laptop without a discrete GPU, at the pixel ratio the tier chose; look for pops when the tier changes.
- **Assistive technology**: a screen reader pass through the DOM mirror; keyboard-only navigation of the whole piece.

## 5. Anti-patterns that cap the score

- More effects than ideas: bloom, grain, aberration, DOF and particles on at once with no restraint (caps at 2/3 of the maximum).
- Text over the canvas unreadable at any frame (caps at half).
- Motion the user did not ask for while reading (auto-rotation, parallax on scroll stop) with no reduced-motion branch (caps at half).
- Essential interaction only on hover or only with a pointer (caps at half).
- Frame time over budget on the target device without an adaptive tier (caps at half).
- GPU memory growing across navigation (fails: ship nothing until fixed).
- Particle count, pass count or triangle count presented as quality (no credit for the number itself).

## 6. Review procedure

1. Run the checks (`check-lab.mjs` in the Nuxt and Next apps) and read the metrics and the disposal reports; anything red is fixed before the review.
2. Open the evidence screenshots side by side per experience; score criteria 1–6 and 8 with one sentence each.
3. Live session on a phone and a laptop: criteria 7, 9 and 10; note pops, judder, unreadable frames.
4. Read the `leak-patterns` report and the diff for criterion 11.
5. Total, apply caps, decide; keep the scored table with the release notes so the next iteration knows what to improve.
