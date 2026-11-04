'use client'

import { useSession } from '@/lib/session'

export function PostToolbar() {
  const { user } = useSession()
  // UX only: hide the publish control for non-editors. The route handler enforces the real check.
  const canPublish = user.role === 'editor'
  return (
    <div>
      <button>Preview</button>
      {canPublish && <button>Publish</button>}
    </div>
  )
}
