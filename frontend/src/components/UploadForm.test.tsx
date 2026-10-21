import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadForm } from './UploadForm'

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

describe('UploadForm', () => {
  it('keeps Validate disabled until both PDFs are chosen', async () => {
    const user = userEvent.setup()
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()

    await user.upload(screen.getByLabelText('Purchase Order (PDF)'), makeFile('po.pdf', 'x', 'application/pdf'))
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()

    await user.upload(
      screen.getByLabelText('Contract (PDF)'),
      makeFile('contract.pdf', 'x', 'application/pdf'),
    )
    expect(screen.getByRole('button', { name: 'Validate' })).toBeEnabled()
  })

  it('has no SAP JSON upload, PO number field or Outlook fetch', () => {
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.queryByLabelText('SAP Record (JSON)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('SAP PO number')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fetch from Outlook' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fetch from SAP' })).not.toBeInTheDocument()
  })

  it('calls onSubmit with the chosen files when the form is submitted', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
    )

    const poFile = makeFile('po.pdf', 'x', 'application/pdf')
    const contractFile = makeFile('contract.pdf', 'x', 'application/pdf')
    await user.upload(screen.getByLabelText('Purchase Order (PDF)'), poFile)
    await user.upload(screen.getByLabelText('Contract (PDF)'), contractFile)

    await user.click(screen.getByRole('button', { name: 'Validate' }))

    expect(onSubmit).toHaveBeenCalledWith({ poPdfFile: poFile, contractPdfFile: contractFile })
  })

  it('shows the loading state and a Cancel button while isLoading is true', () => {
    render(<UploadForm isLoading={true} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/fetching the PO from SAP/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<UploadForm isLoading={true} errorMessage={null} onSubmit={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows the error banner when errorMessage is set', () => {
    render(
      <UploadForm
        isLoading={false}
        errorMessage="PO 4599999999 was not found in SAP (PO number read from the PO document: 4599999999)"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/4599999999 was not found in SAP/)).toBeInTheDocument()
  })
})
