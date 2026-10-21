export type Severity = 'match' | 'minor' | 'major'
export type OverallStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL'
export type ValidationType = 'PO_vs_SAP' | 'PO_vs_Contract'

export interface DiscrepancyItem {
  field: string
  source_a: string
  source_b: string
  severity: Severity
  note: string
}

export interface ValidationReport {
  validation_type: ValidationType
  summary: string
  discrepancies: DiscrepancyItem[]
  overall_status: OverallStatus
}

export interface ValidateResponse {
  sap_validation: ValidationReport
  contract_validation: ValidationReport
  report_pdf_base64: string
}

export interface HistoryEntry extends ValidateResponse {
  timestamp: string
}

export interface ApiError {
  status: number
  message: string
}

export interface OutlookConfigInput {
  tenant_id: string
  client_id: string
  client_secret: string
  mailbox: string
  subject_filter: string
}

export interface OutlookConfigResponse {
  tenant_id: string
  client_id: string
  mailbox: string
  subject_filter: string
  client_secret_set: boolean
}

export interface OutlookFetchResponse {
  po_pdf_base64: string
  contract_pdf_base64: string
}

export interface SapConfigInput {
  base_url: string
  client: string
  username: string
  password: string
  verify_tls: boolean
}

export interface SapConfigResponse {
  base_url: string
  client: string
  username: string
  verify_tls: boolean
  password_set: boolean
}

export type SapPoRecord = Record<string, string>
