import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fetchFromOutlook, getOutlookConfig, saveOutlookConfig, validate } from './api'
import type { ApiError, OutlookConfigInput } from './types'

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type })
}

const files = {
  poPdfFile: makeFile('po.pdf', '%PDF-1.4', 'application/pdf'),
  contractPdfFile: makeFile('contract.pdf', '%PDF-1.4', 'application/pdf'),
}

describe('validate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the correct multipart form data and X-API-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sap_validation: {}, contract_validation: {}, report_pdf_base64: 'abc' }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await validate('http://localhost:8000', 'my-key', files)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/validate')
    expect(options.method).toBe('POST')
    expect(options.headers['X-API-Key']).toBe('my-key')
    const body = options.body as FormData
    expect(body.get('po_pdf')).toBeInstanceOf(File)
    expect(body.get('contract_pdf')).toBeInstanceOf(File)
    expect(body.has('sap_record')).toBe(false)
  })

  it('returns the parsed response on success', async () => {
    const payload = { sap_validation: { overall_status: 'PASS' }, contract_validation: {}, report_pdf_base64: 'abc' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })))

    const result = await validate('http://localhost:8000', 'my-key', files)
    expect(result).toEqual(payload)
  })

  it('maps a 401 response to an "invalid API key" error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'nope' }), { status: 401 })),
    )

    await expect(validate('http://localhost:8000', 'wrong-key', files)).rejects.toMatchObject({
      status: 401,
      message: 'Invalid API key — check Settings',
    } satisfies ApiError)
  })

  it.each([
    [400, 'SAP is not configured yet — set up the SAP connection in Settings'],
    [404, 'PO 4599999999 was not found in SAP (PO number read from the PO document: 4599999999)'],
    [422, 'Could not read a PO number from the PO document'],
    [502, 'Could not reach SAP: timed out'],
  ])('maps a %i response to the API detail message', async (status, detail) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail }), { status })),
    )

    await expect(validate('http://localhost:8000', 'my-key', files)).rejects.toMatchObject({
      status,
      message: detail,
    } satisfies ApiError)
  })

  it('maps a 500 response to a generic server-error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'stack trace...' }), { status: 500 })),
    )

    await expect(validate('http://localhost:8000', 'my-key', files)).rejects.toMatchObject({
      status: 500,
      message: 'Validation failed on the server. Check the backend logs.',
    } satisfies ApiError)
  })

  it('maps a network failure to a "could not reach the API" error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(validate('http://localhost:8000', 'my-key', files)).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the API — check the URL in Settings and that the server is running',
    } satisfies ApiError)
  })

  it('re-throws AbortError without wrapping it', async () => {
    const abortError = new DOMException('cancelled', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

    await expect(validate('http://localhost:8000', 'my-key', files)).rejects.toBe(abortError)
  })
})

describe('getOutlookConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a GET request with the X-API-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant_id: 't',
          client_id: 'c',
          mailbox: 'm@clientco.com',
          subject_filter: 'PO',
          client_secret_set: true,
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getOutlookConfig('http://localhost:8000', 'my-key')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/outlook/config', {
      method: 'GET',
      headers: { 'X-API-Key': 'my-key' },
    })
    expect(result.client_secret_set).toBe(true)
  })

  it('maps a 404 response using the API detail message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Outlook is not configured yet' }), { status: 404 }),
      ),
    )

    await expect(getOutlookConfig('http://localhost:8000', 'my-key')).rejects.toMatchObject({
      status: 404,
      message: 'Outlook is not configured yet',
    } satisfies ApiError)
  })
})

describe('saveOutlookConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const config: OutlookConfigInput = {
    tenant_id: 't',
    client_id: 'c',
    client_secret: 's',
    mailbox: 'm@clientco.com',
    subject_filter: 'PO',
  }

  it('sends a POST request with the config as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant_id: 't',
          client_id: 'c',
          mailbox: 'm@clientco.com',
          subject_filter: 'PO',
          client_secret_set: true,
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await saveOutlookConfig('http://localhost:8000', 'my-key', config)

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/outlook/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'my-key' },
      body: JSON.stringify(config),
    })
  })
})

describe('fetchFromOutlook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the base64 PDFs on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ po_pdf_base64: 'po-b64', contract_pdf_base64: 'contract-b64' }), {
          status: 200,
        }),
      ),
    )

    const result = await fetchFromOutlook('http://localhost:8000', 'my-key')
    expect(result).toEqual({ po_pdf_base64: 'po-b64', contract_pdf_base64: 'contract-b64' })
  })

  it('maps a 422 response using the API detail message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: 'PO attachment not found in the matching email' }),
          { status: 422 },
        ),
      ),
    )

    await expect(fetchFromOutlook('http://localhost:8000', 'my-key')).rejects.toMatchObject({
      status: 422,
      message: 'PO attachment not found in the matching email',
    } satisfies ApiError)
  })

  it('maps a network failure to a "could not reach the API" error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchFromOutlook('http://localhost:8000', 'my-key')).rejects.toMatchObject({
      status: 0,
      message: 'Could not reach the API — check the URL in Settings and that the server is running',
    } satisfies ApiError)
  })
})

describe('responses that are not JSON', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const htmlPage = () => new Response('<!doctype html><html></html>', { status: 200 })

  it('explains an HTML response to validate as a wrong API URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlPage()))

    await expect(validate('', 'my-key', files)).rejects.toMatchObject({
      status: 200,
      message: expect.stringContaining("doesn't point to the backend"),
    })
  })

  it('explains an HTML response when loading a saved connection in Settings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlPage()))

    await expect(getOutlookConfig('', 'my-key')).rejects.toMatchObject({
      status: 200,
      message: expect.stringContaining("doesn't point to the backend"),
    })
  })
})
