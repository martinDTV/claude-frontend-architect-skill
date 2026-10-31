// JSX: className arbitrary values, a style object with literals, an SVG with its own colours
export function Art({ tint }: { tint: string }) {
  return (
    <figure className="bg-[#123456] p-[5px]" style={{ color: '#654321', fontFamily: 'Inter, sans-serif', marginTop: '9px' }}>
      <svg viewBox="0 0 10 10" role="img" aria-label="A blue square">
        <rect width="10" height="10" fill="#2244aa" />
        <rect x="2" y="2" width="6" height="6" style={{ fill: '#ffffff' }} />
      </svg>
      <span style={{ background: tint }}>dynamic</span>
      <span className={`text-fg ${tint ? 'opacity-100' : 'opacity-0'}`}>template literal class</span>
    </figure>
  )
}
