import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadForm } from './UploadForm'
import * as api from '../api'

vi.mock('../api', () => ({
  fetchFromOutlook: vi.fn(),
  fetchSapPoRecord: vi.fn(),
}))

const mockFetchFromOutlook = vi.mocked(api.fetchFromOutlook)
const mockFetchSapPoRecord = vi.mocked(api.fetchSapPoRecord)

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

describe('UploadForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps Validate disabled until both PDFs and the PO number are given', async () => {
    const user = userEvent.setup()
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()

    await user.upload(screen.getByLabelText('Purchase Order (PDF)'), makeFile('po.pdf', 'x', 'application/pdf'))
    await user.upload(
      screen.getByLabelText('Contract (PDF)'),
      makeFile('contract.pdf', 'x', 'application/pdf'),
    )
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()

    await user.type(screen.getByLabelText('SAP PO number'), '   ')
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled()

    await user.type(screen.getByLabelText('SAP PO number'), '4500000123')
    expect(screen.getByRole('button', { name: 'Validate' })).toBeEnabled()
  })

  it('has no SAP JSON upload', () => {
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.queryByLabelText('SAP Record (JSON)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fetch from SAP' })).not.toBeInTheDocument()
  })

  it('fetches the SAP record on Validate and submits it with the chosen files', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    mockFetchSapPoRecord.mockResolvedValue({ po_number: '4500000123', vendor_code: '89234' })
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
    )

    const poFile = makeFile('po.pdf', 'x', 'application/pdf')
    const contractFile = makeFile('contract.pdf', 'y', 'application/pdf')
    await user.upload(screen.getByLabelText('Purchase Order (PDF)'), poFile)
    await user.upload(screen.getByLabelText('Contract (PDF)'), contractFile)
    await user.type(screen.getByLabelText('SAP PO number'), ' 4500000123 ')

    expect(mockFetchSapPoRecord).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(mockFetchSapPoRecord.mock.calls[0][2]).toBe('4500000123')
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.poPdfFile).toBe(poFile)
    expect(submitted.contractPdfFile).toBe(contractFile)
    expect(JSON.parse(submitted.sapRecordText)).toEqual({ po_number: '4500000123', vendor_code: '89234' })
  })

  it('shows a fetching label on Validate while the SAP record is loading', async () => {
    const user = userEvent.setup()
    let resolveFetch: (value: Record<string, string>) => void = () => {}
    mockFetchSapPoRecord.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )
    const onSubmit = vi.fn()
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
    )

    await user.upload(screen.getByLabelText('Purchase Order (PDF)'), makeFile('po.pdf', 'x', 'application/pdf'))
    await user.upload(screen.getByLabelText('Contract (PDF)'), makeFile('contract.pdf', 'y', 'application/pdf'))
    await user.type(screen.getByLabelText('SAP PO number'), '4500000123')
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    expect(await screen.findByRole('button', { name: 'Fetching PO from SAP…' })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()

    resolveFetch({ po_number: '4500000123' })
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })

  it('shows the SAP error and does not submit when the PO lookup fails', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    mockFetchSapPoRecord.mockRejectedValue({ status: 404, message: 'PO 4500000999 was not found in SAP' })
    render(
      <UploadForm isLoading={false} errorMessage={null} onSubmit={onSubmit} onCancel={vi.fn()} />,
    )

    await user.upload(screen.getByLabelText('Purchase Order (PDF)'), makeFile('po.pdf', 'x', 'application/pdf'))
    await user.upload(screen.getByLabelText('Contract (PDF)'), makeFile('contract.pdf', 'y', 'application/pdf'))
    await user.type(screen.getByLabelText('SAP PO number'), '4500000999')
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    expect(await screen.findByText('PO 4500000999 was not found in SAP')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Validate' })).toBeEnabled()
  })

  it('shows the loading state and a Cancel button while isLoading is true', () => {
    render(<UploadForm isLoading={true} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText(/this can take a minute or two/i)).toBeInTheDocument()
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
      <UploadForm isLoading={false} errorMessage="Invalid API key — check Settings" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.getByText('Invalid API key — check Settings')).toBeInTheDocument()
  })

  it('populates the PO and Contract file slots when Fetch from Outlook succeeds', async () => {
    const user = userEvent.setup()
    mockFetchFromOutlook.mockResolvedValue({
      po_pdf_base64: btoa('%PDF po content'),
      contract_pdf_base64: btoa('%PDF contract content'),
    })

    render(<UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Fetch from Outlook' }))

    expect(await screen.findByText('po.pdf')).toBeInTheDocument()
    expect(screen.getByText('contract.pdf')).toBeInTheDocument()
  })

  it('shows a fetching label while the Outlook request is in flight', async () => {
    const user = userEvent.setup()
    let resolveFetch: (value: { po_pdf_base64: string; contract_pdf_base64: string }) => void = () => {}
    mockFetchFromOutlook.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    render(<UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Fetch from Outlook' }))

    expect(await screen.findByRole('button', { name: 'Fetching from Outlook…' })).toBeDisabled()

    resolveFetch({ po_pdf_base64: btoa('a'), contract_pdf_base64: btoa('b') })
    expect(await screen.findByRole('button', { name: 'Fetch from Outlook' })).toBeEnabled()
  })

  it('shows an error banner when Fetch from Outlook fails', async () => {
    const user = userEvent.setup()
    mockFetchFromOutlook.mockRejectedValue({
      status: 404,
      message: 'Outlook is not configured, or no matching email was found',
    })

    render(<UploadForm isLoading={false} errorMessage={null} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Fetch from Outlook' }))

    expect(
      await screen.findByText('Outlook is not configured, or no matching email was found'),
    ).toBeInTheDocument()
  })
})
