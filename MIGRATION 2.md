# Agency OS — Migration Reference

## Imports
```tsx
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
```

## Buttons
| Old | New |
|-----|-----|
| `className="btn btn-primary"` | `<Button>` |
| `className="btn btn-primary btn-sm"` | `<Button size="sm">` |
| `className="btn btn-primary btn-xs"` | `<Button size="xs">` |
| `className="btn btn-secondary"` | `<Button variant="outline">` |
| `className="btn btn-secondary btn-sm"` | `<Button variant="outline" size="sm">` |
| `className="btn btn-secondary btn-xs"` | `<Button variant="outline" size="xs">` |
| `className="btn btn-ghost"` | `<Button variant="ghost">` |
| `className="btn btn-ghost btn-sm"` | `<Button variant="ghost" size="sm">` |
| `className="btn btn-danger"` or red inline style button | `<Button variant="destructive">` |
| `className="btn btn-lg"` | `<Button size="lg">` |

Note: buttons with `style={{ background: 'var(--red)', color: '#fff' }}` → `<Button variant="destructive">`

## Badges
| Old | New |
|-----|-----|
| `className="badge badge-green"` | `<Badge variant="green">` |
| `className="badge badge-amber"` | `<Badge variant="amber">` |
| `className="badge badge-blue"` | `<Badge variant="blue">` |
| `className="badge badge-navy"` | `<Badge variant="navy">` |
| `className="badge badge-red"` | `<Badge variant="red">` |
| `className="badge badge-gray"` | `<Badge variant="gray">` |
| `className="badge"` (no color) | `<Badge variant="secondary">` |

## Cards
| Old | New |
|-----|-----|
| `<div className="card">` | `<Card>` |
| `<div className="card-body">` | `<CardContent>` |
| `<div className="card"><div className="card-body">` | `<Card><CardContent>` |

## Layout — replace with Tailwind
| Old class | Tailwind replacement |
|-----------|---------------------|
| `page-header` | `flex items-center justify-between px-6 py-4 bg-white border-b border-border` |
| `page-content` | `flex-1 overflow-auto p-6` |
| `section-bar` | `flex items-center justify-between mb-3` |
| `stats-strip` | `grid grid-cols-4 gap-4 mb-6` |
| `stats-strip-3` | `grid grid-cols-3 gap-4 mb-6` |
| `stat-card` | `bg-white rounded-lg border border-border p-4` |
| `stat-card-label` | `text-xs text-muted-foreground font-medium uppercase tracking-wide` |
| `stat-card-value` | `text-2xl font-bold font-mono mt-1 text-foreground` |
| `stat-card-sub` | `text-xs text-muted-foreground mt-1` |
| `flex-between` | `flex items-center justify-between` |
| `flex-center` | `flex items-center justify-center` |
| `flex-col` | `flex flex-col` |
| `flex-1` | `flex-1` |
| `w-full` | `w-full` |
| `truncate` | `truncate` |
| `grid-2` | `grid grid-cols-2 gap-4` |
| `grid-3` | `grid grid-cols-3 gap-4` |
| `grid-4` | `grid grid-cols-4 gap-4` |
| `gap-4` | `gap-4` |
| `gap-10` | `gap-10` |
| `mb-12` | `mb-12` |
| `mt-4` | `mt-4` |
| `mt-12` | `mt-12` |

## Text utilities
| Old | New |
|-----|-----|
| `className="text-muted"` | `className="text-muted-foreground"` |
| `className="text-mono"` | `className="font-mono"` |
| `className="text-label"` | `className="text-xs uppercase tracking-wide text-muted-foreground font-medium"` |
| `className="text-sm"` | `className="text-sm"` |
| `className="text-xs"` | `className="text-xs"` |
| `className="text-green"` | `className="text-[#16a34a]"` |
| `className="text-red"` | `className="text-[#dc2626]"` |
| `className="text-amber"` | `className="text-[#d97706]"` |
| `className="text-navy"` | `className="text-[#0f172a]"` |

## Alerts
| Old | New |
|-----|-----|
| `className="alert alert-red"` | `className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]"` |
| `className="alert alert-amber"` | `className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e]"` |
| `className="alert alert-blue"` | `className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm text-[#2563eb]"` |

## Forms
| Old | New |
|-----|-----|
| `className="form-group"` | `className="mb-4"` (or just remove, use spacing) |
| `className="form-label"` | `<Label>` from `@/components/ui/label` |
| `className="form-row"` | `className="grid grid-cols-2 gap-4"` |
| `className="form-row-3"` | `className="grid grid-cols-3 gap-4"` |
| `className="form-hint"` | `className="text-xs text-muted-foreground mt-1"` |
| `className="form-error"` | `className="text-xs text-destructive mt-1"` |

## Tables
| Old | New |
|-----|-----|
| `className="th-right"` | `className="text-right"` |
| `className="td-right"` | `className="text-right"` |
| `className="table-link"` | `className="font-medium text-primary hover:underline cursor-pointer"` |
| `className="text-mono"` on td | `className="font-mono"` |

## Common inline styles → Tailwind
| Old inline style | New Tailwind |
|-----------------|-------------|
| `style={{ display: 'flex', alignItems: 'center', gap: 8 }}` | `className="flex items-center gap-2"` |
| `style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}` | `className="flex items-center justify-between"` |
| `style={{ marginBottom: 16 }}` | `className="mb-4"` |
| `style={{ marginBottom: 8 }}` | `className="mb-2"` |
| `style={{ marginBottom: 4 }}` | `className="mb-1"` |
| `style={{ marginTop: 4 }}` | `className="mt-1"` |
| `style={{ color: 'var(--c3)' }}` | `className="text-muted-foreground"` |
| `style={{ color: 'var(--c2)' }}` | `className="text-[#374151]"` |
| `style={{ color: 'var(--c4)' }}` | `className="text-muted-foreground"` |
| `style={{ color: 'var(--green)' }}` | `className="text-[#16a34a]"` |
| `style={{ color: 'var(--red)' }}` | `className="text-[#dc2626]"` |
| `style={{ color: 'var(--amber)' }}` | `className="text-[#d97706]"` |
| `style={{ color: 'var(--navy)' }}` | `className="text-primary"` |
| `style={{ fontWeight: 700 }}` or `600` | `className="font-bold"` or `"font-semibold"` |
| `style={{ fontSize: 13 }}` | `className="text-[13px]"` |
| `style={{ fontSize: 12 }}` | `className="text-xs"` |
| `style={{ fontSize: 14 }}` | `className="text-sm"` |
| `style={{ fontSize: 11 }}` | `className="text-[11px]"` |
| `style={{ padding: '28px 20px' }}` | `className="px-5 py-7"` |
| `style={{ textAlign: 'center' }}` | `className="text-center"` |
| `style={{ textAlign: 'right' }}` | `className="text-right"` |
| `style={{ width: '100%' }}` | `className="w-full"` |
| `style={{ flex: 1 }}` | `className="flex-1"` |
| `style={{ gap: 8 }}` | `className="gap-2"` |
| `style={{ gap: 12 }}` | `className="gap-3"` |
| `style={{ gap: 16 }}` | `className="gap-4"` |
| `style={{ borderRadius: 8 }}` | `className="rounded-lg"` |
| `style={{ borderRadius: 6 }}` | `className="rounded"` |
| `style={{ cursor: 'pointer' }}` | `className="cursor-pointer"` |
| `style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}` | `className="truncate"` |

## Modals & Dialogs
The shared `<Modal>` component in `src/components/Modal.tsx` already handles all modals.
Import: `import { Modal } from '../components/Modal'`
Props: `open?, title, onClose, children, footer?, maxWidth?`

For delete confirmations use `<ConfirmDialog>`:
Import: `import { ConfirmDialog } from '../components/ConfirmDialog'`
Props: `open, title?, message, onConfirm, onCancel, confirmLabel?`

## What NOT to change
- Keep `src/components/Select.tsx` as-is (complex component, don't replace)
- Keep sidebar/topbar layout components as-is
- Keep `design-system.css` for now (it coexists fine)
- Don't touch store files or lib files
- Don't touch recharts usage
