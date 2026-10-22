import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPanel } from './SettingsPanel'
import * as api from '../api'
import type { ApiError, OutlookConfigResponse } from '../types'

vi.mock('../api', () => ({
  getOutlookConfig: vi.fn(),
  saveOutlookConfig: vi.fn(),
  getSapConfig: vi.fn(),
  saveSapConfig: vi.fn(),
}))

const mockGetOutlookConfig = vi.mocked(api.getOutlookConfig)
const mockSaveOutlookConfig = vi.mocked(api.saveOutlookConfig)
const mockGetSapConfig = vi.mocked(api.getSapConfig)
const mockSaveSapConfig = vi.mocked(api.saveSapConfig)

function notConfiguredError(): ApiError {
  return { status: 404, message: 'Outlook is not configured yet' }
}

describe('SettingsPanel — Outlook Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetSapConfig.mockRejectedValue({ status: 404, message: 'SAP is not configured yet' })
  })

  it('leaves the fields blank when Outlook is not configured yet (404)', async () => {
    mockGetOutlookConfig.mockRejectedValue(notConfiguredError())

    render(<SettingsPanel />)

    await waitFor(() => expect(mockGetOutlookConfig).toHaveBeenCalled())
    expect(screen.getByLabelText('Tenant ID')).toHaveValue('')
    expect(screen.queryByText(/outlook is not configured/i)).not.toBeInTheDocument()
  })

  it('pre-fills the non-secret fields from the existing config', async () => {
    const existing: OutlookConfigResponse = {
      tenant_id: 'tenant-123',
      client_id: 'client-abc',
      mailbox: 'procurement@clientco.com',
      subject_filter: 'PO and Contract',
      client_secret_set: true,
    }
    mockGetOutlookConfig.mockResolvedValue(existing)

    render(<SettingsPanel />)

    expect(await screen.findByDisplayValue('tenant-123')).toBeInTheDocument()
    expect(screen.getByDisplayValue('client-abc')).toBeInTheDocument()
    expect(screen.getByDisplayValue('procurement@clientco.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PO and Contract')).toBeInTheDocument()
  })

  it('shows an error banner for a non-404 failure while loading the config', async () => {
    mockGetOutlookConfig.mockRejectedValue({ status: 500, message: 'Validation failed on the server.' })

    render(<SettingsPanel />)

    expect(await screen.findByText('Validation failed on the server.')).toBeInTheDocument()
  })

  it('saves the Outlook config and clears the secret field on success', async () => {
    const user = userEvent.setup()
    mockGetOutlookConfig.mockRejectedValue(notConfiguredError())
    mockSaveOutlookConfig.mockResolvedValue({
      tenant_id: 't',
      client_id: 'c',
      mailbox: 'm@clientco.com',
      subject_filter: 'PO',
      client_secret_set: true,
    })

    render(<SettingsPanel />)
    await waitFor(() => expect(mockGetOutlookConfig).toHaveBeenCalled())

    await user.type(screen.getByLabelText('Tenant ID'), 't')
    await user.type(screen.getByLabelText('Client ID'), 'c')
    await user.type(screen.getByLabelText('Client Secret'), 's')
    await user.type(screen.getByLabelText('Mailbox'), 'm@clientco.com')
    await user.type(screen.getByLabelText('Subject Filter'), 'PO')
    await user.click(screen.getByRole('button', { name: 'Save Outlook Connection' }))

    await waitFor(() => expect(mockSaveOutlookConfig).toHaveBeenCalled())
    expect(mockSaveOutlookConfig.mock.calls[0][2]).toEqual({
      tenant_id: 't',
      client_id: 'c',
      client_secret: 's',
      mailbox: 'm@clientco.com',
      subject_filter: 'PO',
    })
    expect(screen.getByLabelText('Client Secret')).toHaveValue('')
  })
})

describe('SettingsPanel — SAP Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetOutlookConfig.mockRejectedValue(notConfiguredError())
  })

  it('pre-fills the SAP fields from the existing config without the password', async () => {
    mockGetSapConfig.mockResolvedValue({
      ashost: 'sap.example.com',
      sysnr: '57',
      client: '100',
      username: 'TECH_USER',
      gwhost: '',
      gwserv: '',
      password_set: true,
    })

    render(<SettingsPanel />)

    expect(await screen.findByDisplayValue('sap.example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('SAP System Number')).toHaveValue('57')
    expect(screen.getByLabelText('SAP Client')).toHaveValue('100')
    expect(screen.getByLabelText('SAP Username')).toHaveValue('TECH_USER')
    expect(screen.getByLabelText('SAP Password')).toHaveValue('')
    expect(screen.getByLabelText('SAP Password')).toHaveAttribute('placeholder', 'SAP Password: configured ✓')
  })

  it('saves the SAP config and clears the password field on success', async () => {
    const user = userEvent.setup()
    mockGetSapConfig.mockRejectedValue({ status: 404, message: 'SAP is not configured yet' })
    mockSaveSapConfig.mockResolvedValue({
      ashost: 'sap.example.com',
      sysnr: '57',
      client: '100',
      username: 'TECH_USER',
      gwhost: '',
      gwserv: '',
      password_set: true,
    })

    render(<SettingsPanel />)
    await waitFor(() => expect(mockGetSapConfig).toHaveBeenCalled())

    await user.type(screen.getByLabelText('SAP Application Server'), 'sap.example.com')
    await user.type(screen.getByLabelText('SAP System Number'), '57')
    await user.type(screen.getByLabelText('SAP Client'), '100')
    await user.type(screen.getByLabelText('SAP Username'), 'TECH_USER')
    await user.type(screen.getByLabelText('SAP Password'), 'secret')
    await user.type(screen.getByLabelText('SAP Gateway Host (optional)'), '10.0.0.5')
    await user.type(screen.getByLabelText('SAP Gateway Service (optional)'), 'sapgw57')
    await user.click(screen.getByRole('button', { name: 'Save SAP Connection' }))

    await waitFor(() => expect(mockSaveSapConfig).toHaveBeenCalled())
    expect(mockSaveSapConfig.mock.calls[0][2]).toEqual({
      ashost: 'sap.example.com',
      sysnr: '57',
      client: '100',
      username: 'TECH_USER',
      password: 'secret',
      gwhost: '10.0.0.5',
      gwserv: 'sapgw57',
    })
    expect(screen.getByLabelText('SAP Password')).toHaveValue('')
  })

  it('shows an error banner when saving the SAP config fails', async () => {
    const user = userEvent.setup()
    mockGetSapConfig.mockRejectedValue({ status: 404, message: 'SAP is not configured yet' })
    mockSaveSapConfig.mockRejectedValue({ status: 401, message: 'Invalid API key — check Settings' })

    render(<SettingsPanel />)
    await user.click(screen.getByRole('button', { name: 'Save SAP Connection' }))

    expect(await screen.findByText('Invalid API key — check Settings')).toBeInTheDocument()
  })
})

describe('SettingsPanel — API Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetOutlookConfig.mockRejectedValue(notConfiguredError())
    mockGetSapConfig.mockRejectedValue({ status: 404, message: 'SAP is not configured yet' })
  })

  it('normalizes the saved URL and reloads the connections from it', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel />)
    await waitFor(() => expect(mockGetSapConfig).toHaveBeenCalledTimes(1))

    const urlField = screen.getByLabelText('API base URL')
    await user.clear(urlField)
    await user.type(urlField, '127.0.0.1:8000/')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(urlField).toHaveValue('http://127.0.0.1:8000')
    await waitFor(() => expect(mockGetSapConfig).toHaveBeenCalledTimes(2))
    expect(mockGetSapConfig.mock.calls[1][0]).toBe('http://127.0.0.1:8000')
    expect(mockGetOutlookConfig.mock.calls.at(-1)?.[0]).toBe('http://127.0.0.1:8000')
  })
})
