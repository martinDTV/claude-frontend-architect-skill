#!/usr/bin/env bash
# GENERALIZATION (set B). Next.js App Router Route Handler, a DIFFERENT carrier from the development
# corpus (which flags a file-level 'use server' Server Action). Here the defect lives in a mutating
# Route Handler: DELETE /api/posts/[id] removes a row from the store with no session read, no
# authorization call and no webhook-signature verification anywhere in the handler body. A GET handler
# in the same file is read-only and (correctly) not a target. This is a real authorization hole an
# auditor should flag on the mutating verb only.
set -euo pipefail
mkdir -p src/app/api/posts/\[id\] src/lib

cat > package.json <<'EOF'
{ "name": "holdout-routes-posts-api", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0" } }
EOF

cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "preserve", "strict": true, "skipLibCheck": true } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/lib/posts.ts <<'EOF'
const store = new Map<string, { id: string; title: string }>()
export const listPosts = () => [...store.values()]
export const removePost = (id: string) => store.delete(id)
EOF

# THE DEFECT: a mutating DELETE handler with no auth/session/signature check anywhere in its body.
cat > src/app/api/posts/\[id\]/route.ts <<'EOF'
import { NextResponse } from 'next/server'
import { listPosts, removePost } from '../../../../lib/posts'

export async function GET() {
  return NextResponse.json({ posts: listPosts() })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  removePost(id)
  return NextResponse.json({ ok: true })
}
EOF

echo "scaffolded holdout-routes-posts-api"
