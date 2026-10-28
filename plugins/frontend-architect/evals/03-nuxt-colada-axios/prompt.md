---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt app that must use a shared Axios client with Pinia Colada under SSR and cookie sessions"
expected_outcome: "Per-request Axios instance in a plugin, cookie forwarding, factory services with validation, Colada queries with keys and signals"
tags: ["activation:architect", "domain:vue-nuxt", "domain:state"]
---
Our Nuxt app must use Axios because our company's shared HTTP client package (with interceptors for tracing) is built on it. Show me how to structure the HTTP client, a patients service and composables with Pinia Colada so it works with SSR and cookie sessions.
