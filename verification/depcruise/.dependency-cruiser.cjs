module.exports = {
  forbidden: [
    {
      name: 'feature-internals-are-private',
      comment: 'Import another feature only through its index.ts',
      severity: 'error',
      from: { path: '^(app|src)/features/([^/]+)/' },
      to: {
        path: '^(app|src)/features/([^/]+)/',
        pathNot: ['^$1/features/$2/', '^(app|src)/features/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-code-is-domain-free',
      severity: 'error',
      from: { path: '^(app|src)/(components/ui|lib|utils)/' },
      to: { path: '^(app|src)/features/' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
}
