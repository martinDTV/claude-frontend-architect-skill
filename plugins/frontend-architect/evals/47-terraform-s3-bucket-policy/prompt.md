---
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
description: "Infrastructure question about an S3 bucket policy in Terraform; no frontend skill should fire"
expected_outcome: "A least-privilege bucket policy in Terraform; frontend skills not invoked"
tags: ["activation:none", "suite:activation"]
---
In Terraform, define an S3 bucket for private user uploads: block public access, enforce TLS, allow only a specific IAM role to put and get objects, and enable default encryption. Show the bucket policy.
