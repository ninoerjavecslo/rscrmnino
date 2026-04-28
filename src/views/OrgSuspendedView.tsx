export function OrgSuspendedView() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#f0eef2]">
      <div className="text-center max-w-md px-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto mb-6">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-[#0f172a] mb-2 font-[Manrope,sans-serif]">Account suspended</h1>
        <p className="text-sm text-[#64748b] leading-relaxed">
          This workspace has been suspended. Please contact support to reactivate your account.
        </p>
      </div>
    </div>
  )
}
