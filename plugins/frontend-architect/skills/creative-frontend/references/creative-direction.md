# Creative direction: from a brief to a buildable plan

How a creative and technical brief becomes an experience the modules of this skill can build and the checks can verify. The method produces fourteen artefacts in a fixed order, each small enough to write in a session and precise enough to implement without guessing; four complexity profiles orient the choices without capping them; and the plan lands in the capability protocol that already exists (`frontend-architect`'s `references/capabilities.md`), not in a new planning tool. The atelier experience (`immersive-experiences.md`, `declarative-3d.md`) is the worked example throughout.

## Contents

1. Inputs: the brief
2. The fourteen artefacts
3. Complexity profiles
4. How the plan maps to the capability protocol
5. The worked example: the atelier speaker
6. What this method refuses to do

## 1. Inputs: the brief

A brief answers these before any plan is written; a missing answer is a question to the client, not an assumption.

```markdown
# Creative brief

- Subject: what is on screen (product, place, idea, data) and what must stay legible about it
- Audience and context: who, on which devices, in which moment (hero of a landing, a chapter of a story, a configurator)
- Intent: the one sentence the experience should leave behind
- Brand constraints: palette, type, tone, motion personality (restrained, fluid, kinetic), references the brand already owns
- Content: copy per chapter, calls to action, data to show, languages
- Assets available: models (format, polycount, licence), textures, HDRIs, animations, logos; who produces what is missing
- Technical constraints: frameworks, hosting, budgets (weight, time to first frame, frame time per device class), analytics, SEO needs
- Accessibility requirements: reduced motion, keyboard, screen readers, contrast, cognitive load
- Timeline and review points
```

## 2. The fourteen artefacts

| # | Artefact | Form | Verified by |
|---|---|---|---|
| 1 | **Visual concept** | one paragraph and three adjectives; what the experience is like, not a list of effects | human review |
| 2 | **Authorised references** | three to six references with their source, what is borrowed from each (a light rig, a pacing, a palette) and what is not; only references the team may cite | human review |
| 3 | **Storyboard** | one frame per beat: composition, subject, caption, what moves; six to twelve frames for a scroll story | the evidence screenshots at the same progress values |
| 4 | **Scene architecture** | spaces, what each contains, which resources are shared, which are own; one update loop, ownership per resource (`immersive-3d-architecture.md`) | the disposal report, re-entry counts |
| 5 | **Camera plan** | shots per space with position, target, fov, holds and transition weights; which are orbit shots (arc blends); where the user takes over (`cinematic-motion.md`) | camera checkpoints |
| 6 | **Lighting plan** | environment (studio, procedural sky, HDRI), key direction and intensity, fill and rim, shadows yes/no and where, exposure and tone mapping (`rendering-quality.md`) | `materialIssues`, exposure declared; human review of clipping |
| 7 | **Materials and shaders** | one hero finish, one matte family, one accent; which are physical presets and which are custom shaders, and why (`shader-engineering.md`) | compile and read-back in the shader lab |
| 8 | **Animation and choreography** | which properties move, driven by progress or by time, on which axis; GSAP timelines and cues; the clip plan for GLTF animations | sequence and cue tests, timeline reversibility |
| 9 | **Interaction** | what the pointer, keys, scroll and buttons do, state machines for configurators and chapters, the DOM equivalent of each (`interactive-3d.md`) | api parity, keyboard checks |
| 10 | **Transitions** | between chapters and spaces: mask mode, duration, what both sides show at the boundary | transition progress and mode |
| 11 | **Asset strategy** | formats (Draco, meshopt, KTX2), budgets per asset, priorities and preloads, fallback chains, what is procedural (`asset-pipeline.md`) | the asset lab's measurements |
| 12 | **Performance budgets** | per device class: frame budget, pixel ratio ceiling, post tier, particle density, weight; the adaptive ladder | GPU and SwiftShader measurements, the density controller |
| 13 | **Accessible alternatives** | the reduced-motion version beat by beat, the no-WebGL version, keyboard paths, the DOM mirror of canvas content | reduced-motion contexts, `browser-audit` |
| 14 | **Verification plan** | which lab checks apply, which new checkpoints are needed, the rubric criteria that need eyes and on which devices (`creative-quality-rubric.md`) | the plan is the acceptance gate |

Order matters: 1–3 decide what is being made, 4–10 decide how it is built, 11–14 decide what it costs and how it is proven. A plan that starts at 7 (effects first) is the most common way to end up with an experience nobody can read.

## 3. Complexity profiles

Profiles are starting points for the artefacts; they add no dependency and cap nothing. A project picks the lowest profile that serves the intent and moves up where the storyboard demands it.

| Profile | Typical shape | Artefacts that change |
|---|---|---|
| **Essential** | one space, one or two shots, physical materials, no post or bloom only, scroll reveal or a turntable, DOM carries the story | camera plan is two shots; lighting is studio + key; assets one model under 1 MB; budget 16.7 ms on laptops and phones |
| **Advanced** | one or two spaces, a shot sequence with holds, one custom shader (dissolve, hologram), bloom and grain, a configurator or chapters | storyboard of six frames; materials with one hero shader; asset strategy with Draco and a fallback chain |
| **Cinematic** | several spaces with transitions, a full shot sequence per space, cue-driven light and focus, particles for one beat, DOF on the hero shot | lighting plan per space; transition plan; particle density on the adaptive ladder; verification adds camera checkpoints per space |
| **Experimental** | GPGPU or compute-driven visuals, WebGPU + TSL, custom post passes, physics | the technical contract names what is unverified (real WebGPU on the audience's devices), the fallback chain reaches a WebGL 2 or DOM version, the budget has a device matrix |

## 4. How the plan maps to the capability protocol

The plan is not a new tool: it is the content of the capabilities a task needs. `frontend-architect`'s planner (`scripts/capabilities.mjs`) names them; this reference says what to produce for each.

| Capability | Artefacts | Owner | External collaborators the protocol may recommend |
|---|---|---|---|
| `creative-direction` | 1, 2, 3 | `creative-frontend` | design skills for references and critique of the storyboard frames when the session lists them (Frontend Design, Impeccable, UI UX Pro Max), recommendation only |
| `visual-direction` | 6, 7 (look) | `creative-frontend` | the same design skills for the 2D layer over the canvas |
| `3d-experience` | 4, 5, 7 (shaders), 10, 11, 12 | `creative-frontend` | none: the Three.js skills found on this machine have no verifiable source and are not registered |
| `motion-design` | 8 | `creative-frontend` | the official GSAP skills, gated on GSAP being named or a dependency |
| `ui-implementation`, `accessibility-review` | 9, 13 | `frontend-architect`, `frontend-reviewer` | as in `capabilities.md` |
| `browser-verification` | 14 | `frontend-architect` | none |

Everything about external skills keeps the protocol's three claims apart: listed in the session, recommended by the plan, invoked with the Skill tool and observed. A reference board or a storyboard critique from an external skill is a recommendation until the transcript shows the invocation.

## 5. The worked example: the atelier speaker

Brief in one line: a small wireless speaker, premium but friendly, shown to people deciding whether to buy; the page must read on a phone, the 3D is the hero, the copy is three short beats.

1. Concept: *quiet confidence*; adjectives: dense, warm, exact.
2. References (owned by the team): a studio product shot with one warm key and a cool rim; an exploded-view diagram; the pacing of a slow turntable.
3. Storyboard: hero turntable → exploded view with part labels → reassembly → colour choice.
4. Scene architecture: one space; the model from the asset cache (shared geometries, own materials per instance for highlights); environment own; one loop.
5. Camera: an establishing orbit shot, a close orbit on the cap, a low reverse; holds on the exploded beat; arc blends between orbit shots; explore mode hands the camera to controls.
6. Lighting: studio environment at 0.9, key 2.2 warm from front-left, rim 1.0 cool from behind, no shadows (the base sits on nothing), AgX at exposure 0.8.
7. Materials: GLTF PBR as authored (paint, brass, rubber, ceramic plate, woven grille); highlights by emissive only; no custom shader on the product itself.
8. Choreography: explode timeline with a 60 ms stagger, bottom to top, reversible; turntable at 0.25 rad/s, off under reduced motion; the GLTF `reveal` clip for the cap and knob on the detail beat.
9. Interaction: hover highlights a part, click selects it and the DOM label names it; a button explodes; keys reach every control.
10. Transitions: none between spaces (one space); the exploded beat is a timeline, not a cut.
11. Assets: `atelier.draco.glb` (16 KB) with `atelier.glb` as the fallback when the Draco decoder fails; decoders shipped from `public/draco`; preload on the hero.
12. Budgets: laptop 16.7 ms at pixel ratio 1.5, phone 16.7 ms at 1.25 with post off, floor at 33 ms; one draw call per part (six).
13. Accessible: reduced motion = exploded view as a cut and no turntable; the DOM lists the parts with their labels; the canvas is `aria-hidden`.
14. Verification: the `r3f` and `tres` checks (load, hover and selection through the framework's events, explode offsets and exact reassembly, disposal, re-entry, reduced motion), the asset lab for the variants, the rubric's human half on the evidence screenshots.

## 6. What this method refuses to do

- Decide effects before the storyboard.
- Promise a frame rate without a device class and a measurement.
- Count references the team may not cite.
- Treat a passing check as a verdict on beauty: artefacts 1–3 and the rubric's human half stay with a person.
- Spawn a planning tool: the artefacts are prose and tables in the project's own docs (an ADR when a choice is expensive to reverse), and the capability plan already lists who does what.
