export default defineAppConfig({
  ui: {
    colors: { primary: 'brand', neutral: 'slate' },
    button: { slots: { base: 'rounded-[var(--radius-md)] font-medium' }, variants: { size: { xs: { base: 'px-2 py-1 text-xs' }, sm: { base: 'px-3 py-1.5 text-sm' } } } },
  },
})
