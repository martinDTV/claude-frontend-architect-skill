# perf-budget fixtures — acceptance criteria (defined before the rules)

Each case states the expected state/verdict the tests assert. Numbers are illustrative; the assertions check
states, verdicts and sign of change, never exact machine timings.

## Compare (before/after), same profile unless noted
- A (heavy import initial -> deferred): `initialClientJsKb` COMPARED, verdict **improved** (333.6 -> 48.5, large negative %). `initialCssKb` and `sharedChunks` unchanged -> **inconclusive**.
- B (CLS): cls-good -> cls-bad is **regressed**; cls-bad -> cls-good is **improved**.
- C (handler): slow -> fast interaction `interaction:open menu` **improved**; fast -> slow **regressed**.
- D (hydration): heavy -> light `hydration:toLoad` and `hydration:jsTransferBytes` **improved**.
- E (shared counted once): sharedChunks and initialClientJsKb unchanged -> **inconclusive**, never a spurious delta.
- H (insufficient): compare H-5run -> H-1run with minSamples 3 -> **INSUFFICIENT_DATA**, no verdict.
- J (different profiles): desktop -> mobile-emulated -> **INVALID_CONFIGURATION**, never read as improvement.
- K (tiny delta, within noise): 2000 -> 1975 ms (-1.25%) -> **inconclusive**, not "improved".

## Evaluate (budget + results)
- F (one breach, one pass): /heavy initialClientJsKb 260 > 200 -> **FAIL** (confirmed, failOn), /light 31 -> **PASS**.
- G (metric unavailable): RSC route attribution unavailable -> **UNAVAILABLE** (not PASS, not 0).
- I (unit mismatch): budget lcp in kb vs measured ms -> **INVALID_CONFIGURATION**.

## Invariants the suite proves
- A deliberately regressive change produces a FAIL/regressed; a non-verifiable case never produces a false PASS.
- Absence of data is UNAVAILABLE or INSUFFICIENT_DATA, never zero, never PASS.
- Different profiles/units are never compared as if equivalent.
- Lab interaction latency is labelled as such, never field INP.
