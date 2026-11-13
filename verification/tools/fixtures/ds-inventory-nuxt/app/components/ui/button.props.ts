// Shared prop definitions, spread into more than one component (the inventory cannot resolve these statically
// without following the import: expected to be reported as resolved-through-import, heuristic).
export const buttonProps = {
  size: { type: String as () => 'xs' | 'sm' | 'md', default: 'md' },
  disabled: { type: Boolean, default: false },
} as const
