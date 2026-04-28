export function OrgNotFoundView({ slug }: { slug: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#f0eef2]">
      <div className="text-center max-w-md px-6">
        <div className="w-14 h-14 rounded-2xl bg-[#0f172a] flex items-center justify-center mx-auto mb-6">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-[#0f172a] mb-2 font-[Manrope,sans-serif]">Workspace not found</h1>
        <p className="text-sm text-[#64748b] leading-relaxed">
          No workspace exists at <span className="font-semibold text-[#0f172a]">{slug}</span>.
          Check the URL or contact your administrator.
        </p>
      </div>
    </div>
  )
}
