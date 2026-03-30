export function buildLogoHtml(logo: string | null | undefined, name: string | null | undefined): string {
  return logo
    ? `<img src="${logo}" alt="Logo" style="height:30px;max-width:160px;object-fit:contain;object-position:left">`
    : `<div style="font-size:18px;font-weight:800;color:#E85C1A;letter-spacing:-.5px">${name || 'Renderspace'}</div>`
}

export function openHtmlAsPdf(html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
