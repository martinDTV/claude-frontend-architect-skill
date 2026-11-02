---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Uses route-attribution.mjs (or the build manifests it reads) on the real build to get per-route initial client JS, rather than guessing from installed package sizes
- States that a build-associated chunk is not the same as transferred or executed JavaScript, and that confirming "lazy" needs the chunk attribution (and the browser/Coverage for transfer)
- Distinguishes the initial set from deferred/dynamic chunks when answering whether Three.js is in the initial bundle

The response FAILS if it does any of the following:
- Claims Three.js is or is not in the bundle purely from the import statement or the package being installed
- Equates npm package size with shipped/transferred bytes
- Recommends a bundler migration or a new analyzer tool as the first step
