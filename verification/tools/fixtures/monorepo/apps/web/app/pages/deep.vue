<script setup lang="ts">
// deep import into a package that declares `exports`: Node and bundlers refuse this subpath
import { theme } from '@acme/ui/src/internal/theme'
// an allowed subpath export
import { Button as SubButton } from '@acme/ui/button'
const t = theme
</script>
<template><p>{{ t }} {{ SubButton('x') }}</p></template>
