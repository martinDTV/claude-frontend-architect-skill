// The drawer toggle of the dashboard navbar opens the sidebar as a dialog on small screens: aria-haspopup says so to
// assistive technology (and to the navigation-reachability check). ButtonProps does not type arbitrary aria attributes,
// so the object is cast once here and shared by every page (auto-imported from utils/).
import type { ButtonProps } from '@nuxt/ui'

export const NAV_TOGGLE = { 'aria-haspopup': 'dialog' } as unknown as ButtonProps
