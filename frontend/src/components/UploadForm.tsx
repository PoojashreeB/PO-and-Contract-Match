import { useState } from 'react'
import type { ValidateFiles } from '../api'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { FileDropzone } from './ui/FileDropzone'
import { Spinner } from './ui/Spinner'

interface UploadFormProps {
  isLoading: boolean
  errorMessage: string | null
  onSubmit: (files: ValidateFiles) => void
  onCancel: () => void
}

export function UploadForm({ isLoading, errorMessage, onSubmit, onCancel }: UploadFormProps) {
  const [poPdfFile, setPoPdfFile] = useState<File | null>(null)
  const [contractPdfFile, setContractPdfFile] = useState<File | null>(null)

  const canSubmit = Boolean(poPdfFile && contractPdfFile) && !isLoading

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!poPdfFile || !contractPdfFile) return
    onSubmit({ poPdfFile, contractPdfFile })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Card title="Upload documents">
        <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
          The PO number is read from the PO document, and its details are fetched from SAP when
          you click Validate.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        {!canSubmit && !isLoading && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Add both PDFs to continue.
          </p>
        )}
      </Card>

      {errorMessage && <Alert>{errorMessage}</Alert>}

      {isLoading ? (
        <div className="flex items-center gap-3">
          <Spinner className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Reading the documents, fetching the PO from SAP and validating — this can take a
            minute or two…
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
