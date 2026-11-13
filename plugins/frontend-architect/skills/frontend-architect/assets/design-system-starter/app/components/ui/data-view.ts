// Every data region renders one of these five states; the union makes the missing branch a type error, not a TODO.
export type DataView<Row> =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string; retry?: () => void }
  | { status: 'partial'; rows: Row[]; failed: number; retry?: () => void }
  | { status: 'success'; rows: Row[] }
