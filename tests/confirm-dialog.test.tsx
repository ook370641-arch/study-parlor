import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConfirmDialog } from '../src/components/ConfirmDialog'

describe('ConfirmDialog', () => {
  beforeEach(() => {
    cleanup()
  })

  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Test"
        icon="warning"
        confirmLabel="OK"
        confirmVariant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        Body
      </ConfirmDialog>
    )
    expect(screen.queryByText('Test')).toBeNull()
  })

  it('renders when open', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Test Title"
        icon="warning"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        Body text
      </ConfirmDialog>
    )
    expect(screen.getByText('Test Title')).toBeTruthy()
    expect(screen.getByText('Body text')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('再想想')).toBeTruthy()
  })

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        title="Test"
        icon="warning"
        confirmLabel="OK"
        confirmVariant="danger"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Body
      </ConfirmDialog>
    )
    fireEvent.click(screen.getByText('再想想'))
    expect(onCancel).toHaveBeenCalled()
  })
})
