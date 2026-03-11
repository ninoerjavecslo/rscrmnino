export function PlaceholderView({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <div className="page-content">
        <div className="card" style={{maxWidth: 480}}>
          <div className="card-body" style={{textAlign: 'center', padding: '40px 20px'}}>
            <div style={{fontSize: 32, marginBottom: 10}}>🚧</div>
            <div className="text-md" style={{marginBottom: 6}}>{title}</div>
            <div className="text-sm text-muted">This screen is coming next.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
