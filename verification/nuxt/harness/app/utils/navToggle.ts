// The drawer toggle of the dashboard navbar opens the sidebar as a dialog on small screens: aria-haspopup says so to
// assistive technology (and to the navigation-reachability check). ButtonProps does not type arbitrary aria attributes,
// so the object is cast once here and shared by every page (auto-imported from utils/).
import type { ButtonProps } from '@nuxt/ui'

export const NAV_TOGGLE = { 'aria-haspopup': 'dialog' } as unknown as ButtonProps

/** The page header grows with the text instead of clipping: a minimum height, wrapping, the title on as many lines as it needs. */
export const NAVBAR_UI = { root: 'h-auto min-h-(--ui-header-height) flex-wrap gap-y-1 py-1.5', title: 'whitespace-normal' }
/** The toolbar keeps its breathing room when its controls wrap on a narrow panel. */
export const TOOLBAR_UI = { root: 'py-2' }
