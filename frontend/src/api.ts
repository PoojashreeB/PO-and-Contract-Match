import type {
  ApiError,
  OutlookConfigInput,
  OutlookConfigResponse,
  OutlookFetchResponse,
  SapConfigInput,
  SapConfigResponse,
  SapPoRecord,
  ValidateResponse,
} from './types'

export interface ValidateFiles {
  poPdfFile: File
  contractPdfFile: File
  sapRecordText: string
}

function messageForStatus(status: number, detail: unknown): string {
  if (status === 401) {
    return 'Invalid API key — check Settings'
  }
  if (status === 400) {
    return typeof detail === 'string' ? detail : 'The request was invalid.'
  }
  if (status === 500) {
    return 'Validation failed on the server. Check the backend logs.'
  }
  return `Unexpected error (status ${status})`
}

export async function validate(
  baseUrl: string,
  apiKey: string,
  files: ValidateFiles,
  signal?: AbortSignal,
): Promise<ValidateResponse> {
  const formData = new FormData()
  formData.append('po_pdf', files.poPdfFile)
  formData.append('contract_pdf', files.contractPdfFile)
  formData.append('sap_record', files.sapRecordText)

  let response: Response
  try {
    response = await fetch(`${baseUrl}/validate`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: formData,
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    const apiError: ApiError = {
      status: 0,
      message:
        'Could not reach the API — check the URL in Settings and that the server is running',
    }
    throw apiError
  }

  if (!response.ok) {
    let detail: unknown
    try {
      const body = await response.json()
      detail = body?.detail
    } catch {
      detail = undefined
    }
    const apiError: ApiError = {
      status: response.status,
      message: messageForStatus(response.status, detail),
    }
    throw apiError
  }

  return (await response.json()) as ValidateResponse
}

function outlookMessageForStatus(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail.length > 0) {
    return detail
  }
  if (status === 401) {
    return 'Outlook authentication failed — check your connection settings'
  }
  if (status === 404) {
    return 'Outlook is not configured, or no matching email was found'
  }
  if (status === 422) {
    return 'The matching email is missing a required attachment'
  }
  if (status === 502) {
    return 'Outlook (Microsoft Graph) returned an error'
  }
  return `Unexpected error (status ${status})`
}

async function outlookRequest<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), 'X-API-Key': apiKey },
    })
  } catch {
    const apiError: ApiError = {
      status: 0,
      message:
        'Could not reach the API — check the URL in Settings and that the server is running',
    }
    throw apiError
  }

  if (!response.ok) {
    let detail: unknown
    try {
      const body = await response.json()
      detail = body?.detail
    } catch {
      detail = undefined
    }
    const apiError: ApiError = {
      status: response.status,
      message: outlookMessageForStatus(response.status, detail),
    }
    throw apiError
  }

  return (await response.json()) as T
}

export async function getOutlookConfig(
  baseUrl: string,
  apiKey: string,
): Promise<OutlookConfigResponse> {
  return outlookRequest<OutlookConfigResponse>(baseUrl, apiKey, '/outlook/config', {
    method: 'GET',
  })
}

export async function saveOutlookConfig(
  baseUrl: string,
  apiKey: string,
  config: OutlookConfigInput,
): Promise<OutlookConfigResponse> {
  return outlookRequest<OutlookConfigResponse>(baseUrl, apiKey, '/outlook/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export async function fetchFromOutlook(
  baseUrl: string,
  apiKey: string,
): Promise<OutlookFetchResponse> {
  return outlookRequest<OutlookFetchResponse>(baseUrl, apiKey, '/outlook/fetch', {
    method: 'POST',
  })
}

function sapMessageForStatus(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail.length > 0) {
    return detail
  }
  if (status === 401) {
    return 'SAP authentication failed — check your connection settings'
  }
  if (status === 404) {
    return 'SAP is not configured, or the PO was not found'
  }
  if (status === 502) {
    return 'SAP returned an error'
  }
  return `Unexpected error (status ${status})`
}

async function sapRequest<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), 'X-API-Key': apiKey },
    })
  } catch {
    const apiError: ApiError = {
      status: 0,
      message:
        'Could not reach the API — check the URL in Settings and that the server is running',
    }
    throw apiError
  }

  if (!response.ok) {
    let detail: unknown
    try {
      const body = await response.json()
      detail = body?.detail
    } catch {
      detail = undefined
    }
    const apiError: ApiError = {
      status: response.status,
      message: sapMessageForStatus(response.status, detail),
    }
    throw apiError
  }

  return (await response.json()) as T
}

export async function getSapConfig(baseUrl: string, apiKey: string): Promise<SapConfigResponse> {
  return sapRequest<SapConfigResponse>(baseUrl, apiKey, '/sap/config', { method: 'GET' })
}

export async function saveSapConfig(
  baseUrl: string,
  apiKey: string,
  config: SapConfigInput,
): Promise<SapConfigResponse> {
  return sapRequest<SapConfigResponse>(baseUrl, apiKey, '/sap/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export async function fetchSapPoRecord(
  baseUrl: string,
  apiKey: string,
  poNumber: string,
): Promise<SapPoRecord> {
  return sapRequest<SapPoRecord>(baseUrl, apiKey, '/sap/po-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ po_number: poNumber }),
  })
}
