import type { ReactNode } from 'react'
import { Modal } from './Modal'

export function ConfirmDialog({ open, title = 'Confirm', message, onConfirm, onCancel, confirmLabel = 'Delete' }: {
  open: boolean
  title?: string
  message: ReactNode
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      maxWidth={400}
      footer={
        <>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--c2)', fontSize: 14 }}>{message}</p>
    </Modal>
  )
}
