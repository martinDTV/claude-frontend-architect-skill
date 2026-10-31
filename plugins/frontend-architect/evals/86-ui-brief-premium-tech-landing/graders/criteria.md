---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Writes a design contract first: audience and environments, requirements with ids, a direction statement of at most three lines with adjectives and references that are not generic ("editorial", "tactile", a named kind of object or publication), decisions per area citing requirements, a fluid display step with a clamp, light and dark roles, a motion policy that decides reduced motion ("cut" or final frames), an imagery policy that rules out stock photography and people, and names the validator (`design-contract.mjs` or the reference).
- Structures the page as: a hero with one sentence that says what the product is and shows it (drawn, rendered or photographed to the policy), one section per idea (three at most) on an asymmetric grid, a specifications table, the action with a short form, native questions, a footer; the action visible in every section (quiet header link, a 44px sticky bar on phones that never covers focused controls, text links per section).
- Plans motion that explains the product: one intro once on load, at most one scroll-bound effect that illustrates a feature (for example a reading drawn along the scroll), once-only reveals; GSAP inside `useGSAP` (or an equivalent scoped context) with `gsap.matchMedia` so the reduced-motion branch sets final frames and creates no ScrollTrigger; cleanup that leaves zero triggers, pin spacers and tweens on route change; diagnostics on `window` or an equivalent so a check reads state instead of screenshots.
- Answers the 3D question with criteria (physical product the drawing cannot carry, a DOM equivalent, lazy loading, a reduced-motion still, a measured frame budget on a mid-range phone) and recommends against it for an e-ink monitor unless a specific shot needs it.
- Covers performance and reflow: self-hosted fonts, fixed aspect boxes (no layout shift, with a number to stay under), inline SVG or sized images, 320px and 200% text with at least one concrete pitfall (rem widths, implicit grid columns, non-wrapping buttons), controls kept clear of fixed bars and sticky headers.
- Gives a verification plan that separates what the browser check proves (server render with one h1, intro and triggers, layout shift, form validation, Tab order, route change cleanup, reduced motion, dark roles against the contract, audit with zero confirmed findings), what it flags, and what a person judges (whether the sentence is right, whether the illustration carries a hero), and names the evidence left.
- Treats external design skills as optional collaborators: names which could help (visual direction or critique), says whether they are available in the session, and writes "not invoked" for anything not invoked with the Skill tool; never reports them as used without the tool result.

The response FAILS if it does any of the following:
- Proposes a centred hero with a gradient and three icon cards, a carousel, a stock photo, or a testimonial slider as the structure.
- Recommends 3D or heavy motion without criteria, or motion that runs on every scroll for decoration, or ignores reduced motion.
- Leaves out layout shift, the phone bar, or the cleanup on route change.
- Presents visual quality as a score or claims it is verified without saying by which check and with what evidence.
- Claims an external skill ran without naming the Skill tool invocation and its result.
