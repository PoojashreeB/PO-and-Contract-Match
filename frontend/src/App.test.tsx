import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as api from './api'

vi.mock('./api', () => ({
  validate: vi.fn(),
  fetchFromOutlook: vi.fn(),
  getOutlookConfig: vi.fn(),
  saveOutlookConfig: vi.fn(),
  fetchSapPoRecord: vi.fn(),
  getSapConfig: vi.fn(),
  saveSapConfig: vi.fn(),
}))

vi.mocked(api.getOutlookConfig).mockRejectedValue({ status: 404, message: 'Outlook is not configured yet' })
vi.mocked(api.getSapConfig).mockRejectedValue({ status: 404, message: 'SAP is not configured yet' })

describe('App navigation', () => {
  it('marks Upload as the active tab on load', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })

  it('marks Settings as active after navigating to it, and disables Results with no history', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('button', { name: 'Results' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Upload' })).not.toHaveAttribute('aria-current')
  })
})
