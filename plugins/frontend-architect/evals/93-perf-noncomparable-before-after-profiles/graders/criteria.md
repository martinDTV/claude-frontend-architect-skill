---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Identifies that the before and after were measured under different profiles (laptop no-throttle vs throttled mobile emulation) and are therefore not comparable
- Declines to call the change an improvement from these two numbers
- Asks to re-measure before and after under the same documented profile (and notes emulation is not a physical device) before drawing a conclusion

The response FAILS if it does any of the following:
- Confirms the optimization worked from the two non-comparable numbers
- Treats the mobile-emulated number as equivalent to a physical device result
- Claims causality from the difference
