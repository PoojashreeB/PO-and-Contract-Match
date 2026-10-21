import { useState } from 'react'
import { Database, Mail } from 'lucide-react'
import { fetchFromOutlook, fetchSapPoRecord } from '../api'
import type { ValidateFiles } from '../api'
import { base64ToFile } from '../download'
import { getApiKey, getApiUrl } from '../storage'
import type { ApiError } from '../types'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { FileDropzone } from './ui/FileDropzone'
import { Spinner } from './ui/Spinner'
import { TextField } from './ui/TextField'

interface UploadFormProps {
  isLoading: boolean
  errorMessage: string | null
  onSubmit: (files: ValidateFiles) => void
  onCancel: () => void
}

export function UploadForm({ isLoading, errorMessage, onSubmit, onCancel }: UploadFormProps) {
  const [poPdfFile, setPoPdfFile] = useState<File | null>(null)
  const [contractPdfFile, setContractPdfFile] = useState<File | null>(null)
  const [sapJsonFile, setSapJsonFile] = useState<File | null>(null)
  const [sapJsonError, setSapJsonError] = useState<string | null>(null)
  const [sapRecordText, setSapRecordText] = useState<string | null>(null)
  const [isFetchingOutlook, setIsFetchingOutlook] = useState(false)
  const [outlookFetchError, setOutlookFetchError] = useState<string | null>(null)
  const [sapPoNumber, setSapPoNumber] = useState('')
  const [isFetchingSap, setIsFetchingSap] = useState(false)
  const [sapFetchError, setSapFetchError] = useState<string | null>(null)

  async function handleSapFileChange(file: File | null) {
    setSapJsonFile(file)
    setSapJsonError(null)
    setSapRecordText(null)
    if (!file) return

    const text = await file.text()
    try {
      JSON.parse(text)
      setSapRecordText(text)
    } catch {
      setSapJsonError('This file is not valid JSON.')
    }
  }

  async function handleFetchFromOutlook() {
    setOutlookFetchError(null)
    setIsFetchingOutlook(true)
    try {
      const result = await fetchFromOutlook(getApiUrl(), getApiKey())
      setPoPdfFile(base64ToFile(result.po_pdf_base64, 'po.pdf', 'application/pdf'))
      setContractPdfFile(base64ToFile(result.contract_pdf_base64, 'contract.pdf', 'application/pdf'))
    } catch (error) {
      setOutlookFetchError((error as ApiError).message)
    } finally {
      setIsFetchingOutlook(false)
    }
  }

  async function handleFetchFromSap() {
    const poNumber = sapPoNumber.trim()
    if (!poNumber) return
    setSapFetchError(null)
    setIsFetchingSap(true)
    try {
      const record = await fetchSapPoRecord(getApiUrl(), getApiKey(), poNumber)
      const text = JSON.stringify(record, null, 2)
      setSapJsonFile(new File([text], `sap_po_${poNumber}.json`, { type: 'application/json' }))
      setSapJsonError(null)
      setSapRecordText(text)
    } catch (error) {
      setSapFetchError((error as ApiError).message)
    } finally {
      setIsFetchingSap(false)
    }
  }

  const canSubmit = Boolean(poPdfFile && contractPdfFile && sapRecordText) && !isLoading

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!poPdfFile || !contractPdfFile || !sapRecordText) return
    onSubmit({ poPdfFile, contractPdfFile, sapRecordText })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Card title="Upload documents">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-700/40">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Provide the PO and Contract manually, or fetch both from Outlook.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={isFetchingOutlook ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            onClick={() => void handleFetchFromOutlook()}
            disabled={isFetchingOutlook}
          >
            {isFetchingOutlook ? 'Fetching from Outlook…' : 'Fetch from Outlook'}
          </Button>
        </div>
        {outlookFetchError && (
          <div className="mb-4">
            <Alert>{outlookFetchError}</Alert>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-700/40">
          <div className="min-w-0 flex-1">
            <TextField
              id="sap-po-number"
              label="SAP PO number"
              type="text"
              placeholder="4500000123"
              value={sapPoNumber}
              onChange={(e) => setSapPoNumber(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={isFetchingSap ? <Spinner className="h-4 w-4" /> : <Database className="h-4 w-4" />}
            onClick={() => void handleFetchFromSap()}
            disabled={isFetchingSap || !sapPoNumber.trim()}
          >
            {isFetchingSap ? 'Fetching from SAP…' : 'Fetch from SAP'}
          </Button>
        </div>
        {sapFetchError && (
          <div className="mb-4">
            <Alert>{sapFetchError}</Alert>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <FileDropzone
            id="po-pdf"
            label="Purchase Order (PDF)"
            accept="application/pdf"
            value={poPdfFile}
            onChange={setPoPdfFile}
          />
          <FileDropzone
            id="contract-pdf"
            label="Contract (PDF)"
            accept="application/pdf"
            value={contractPdfFile}
            onChange={setContractPdfFile}
          />
          <div>
            <FileDropzone
              id="sap-json"
              label="SAP Record (JSON)"
              accept="application/json"
              value={sapJsonFile}
              onChange={(file) => void handleSapFileChange(file)}
            />
            {sapJsonError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{sapJsonError}</p>}
          </div>
        </div>

        {!canSubmit && !isLoading && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Select all three files (SAP record must be valid JSON) to continue.
          </p>
        )}
      </Card>

      {errorMessage && <Alert>{errorMessage}</Alert>}

      {isLoading ? (
        <div className="flex items-center gap-3">
          <Spinner className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Validating — this can take a minute or two…
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={!canSubmit} className="self-start">
          Validate
        </Button>
      )}
    </form>
  )
}
