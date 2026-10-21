import { useEffect, useState } from 'react'
import { CheckCircle2, Database, Mail, Server } from 'lucide-react'
import { getApiKey, getApiUrl, setApiKey, setApiUrl } from '../storage'
import { getOutlookConfig, getSapConfig, saveOutlookConfig, saveSapConfig } from '../api'
import type { ApiError } from '../types'
import { Alert } from './ui/Alert'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { TextField } from './ui/TextField'

export function SettingsPanel() {
  const [apiUrl, setApiUrlState] = useState(getApiUrl())
  const [apiKey, setApiKeyState] = useState(getApiKey())
  const [saved, setSaved] = useState(false)

  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [mailbox, setMailbox] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [clientSecretSet, setClientSecretSet] = useState(false)
  const [outlookSaved, setOutlookSaved] = useState(false)
  const [outlookError, setOutlookError] = useState<string | null>(null)

  const [sapBaseUrl, setSapBaseUrl] = useState('')
  const [sapClient, setSapClient] = useState('')
  const [sapUsername, setSapUsername] = useState('')
  const [sapPassword, setSapPassword] = useState('')
  const [sapVerifyTls, setSapVerifyTls] = useState(true)
  const [sapPasswordSet, setSapPasswordSet] = useState(false)
  const [sapSaved, setSapSaved] = useState(false)
  const [sapError, setSapError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSapConfig(apiUrl, apiKey)
      .then((config) => {
        if (cancelled) return
        setSapBaseUrl(config.base_url)
        setSapClient(config.client)
        setSapUsername(config.username)
        setSapVerifyTls(config.verify_tls)
        setSapPasswordSet(config.password_set)
      })
      .catch((error: ApiError) => {
        if (cancelled || error.status === 404) return
        setSapError(error.message)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    getOutlookConfig(apiUrl, apiKey)
      .then((config) => {
        if (cancelled) return
        setTenantId(config.tenant_id)
        setClientId(config.client_id)
        setMailbox(config.mailbox)
        setSubjectFilter(config.subject_filter)
        setClientSecretSet(config.client_secret_set)
      })
      .catch((error: ApiError) => {
        if (cancelled || error.status === 404) return
        setOutlookError(error.message)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSave() {
    setApiUrl(apiUrl.trim())
    setApiKey(apiKey.trim())
    setSaved(true)
  }

  async function handleSaveOutlookConfig() {
    setOutlookError(null)
    try {
      const result = await saveOutlookConfig(apiUrl, apiKey, {
        tenant_id: tenantId,
        client_id: clientId,
        client_secret: clientSecret,
        mailbox,
        subject_filter: subjectFilter,
      })
      setClientSecretSet(result.client_secret_set)
      setClientSecret('')
      setOutlookSaved(true)
    } catch (error) {
      setOutlookError((error as ApiError).message)
    }
  }

  async function handleSaveSapConfig() {
    setSapError(null)
    try {
      const result = await saveSapConfig(apiUrl, apiKey, {
        base_url: sapBaseUrl.trim(),
        client: sapClient.trim(),
        username: sapUsername.trim(),
        password: sapPassword,
        verify_tls: sapVerifyTls,
      })
      setSapPasswordSet(result.password_set)
      setSapPassword('')
      setSapSaved(true)
    } catch (error) {
      setSapError((error as ApiError).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Settings</h2>

      <Card title="API Connection" icon={<Server className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
        <div className="flex flex-col gap-3">
          <TextField
            id="api-url"
            label="API base URL"
            type="text"
            placeholder="http://localhost:8000"
            value={apiUrl}
            onChange={(e) => {
              setApiUrlState(e.target.value)
              setSaved(false)
            }}
          />
          <TextField
            id="api-key"
            label="API key"
            type="password"
            placeholder="X-API-Key value"
            value={apiKey}
            onChange={(e) => {
              setApiKeyState(e.target.value)
              setSaved(false)
            }}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
            {saved && (
              <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}>
                Saved
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Card title="Outlook Connection" icon={<Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
        <div className="flex flex-col gap-3">
          <TextField
            id="outlook-tenant-id"
            label="Tenant ID"
            type="text"
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value)
              setOutlookSaved(false)
            }}
          />
          <TextField
            id="outlook-client-id"
            label="Client ID"
            type="text"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              setOutlookSaved(false)
            }}
          />
          <TextField
            id="outlook-client-secret"
            label="Client Secret"
            type="password"
            placeholder={clientSecretSet ? 'Client Secret: configured ✓' : ''}
            value={clientSecret}
            onChange={(e) => {
              setClientSecret(e.target.value)
              setOutlookSaved(false)
            }}
          />
          <TextField
            id="outlook-mailbox"
            label="Mailbox"
            type="text"
            value={mailbox}
            onChange={(e) => {
              setMailbox(e.target.value)
              setOutlookSaved(false)
            }}
          />
          <TextField
            id="outlook-subject-filter"
            label="Subject Filter"
            type="text"
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value)
              setOutlookSaved(false)
            }}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSaveOutlookConfig()}>
              Save Outlook Connection
            </Button>
            {outlookSaved && (
              <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}>
                Saved
              </Badge>
            )}
          </div>
          {outlookError && <Alert>{outlookError}</Alert>}
        </div>
      </Card>

      <Card title="SAP Connection" icon={<Database className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Reads POs through the S/4HANA Purchase Order API (API_PURCHASEORDER_PROCESS_SRV).
          </p>
          <TextField
            id="sap-base-url"
            label="SAP Server URL"
            type="text"
            placeholder="https://sap.example.com:44300"
            value={sapBaseUrl}
            onChange={(e) => {
              setSapBaseUrl(e.target.value)
              setSapSaved(false)
            }}
          />
          <TextField
            id="sap-client"
            label="SAP Client"
            type="text"
            placeholder="100"
            value={sapClient}
            onChange={(e) => {
              setSapClient(e.target.value)
              setSapSaved(false)
            }}
          />
          <TextField
            id="sap-username"
            label="SAP Username"
            type="text"
            value={sapUsername}
            onChange={(e) => {
              setSapUsername(e.target.value)
              setSapSaved(false)
            }}
          />
          <TextField
            id="sap-password"
            label="SAP Password"
            type="password"
            placeholder={sapPasswordSet ? 'SAP Password: configured ✓' : ''}
            value={sapPassword}
            onChange={(e) => {
              setSapPassword(e.target.value)
              setSapSaved(false)
            }}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={sapVerifyTls}
              onChange={(e) => {
                setSapVerifyTls(e.target.checked)
                setSapSaved(false)
              }}
            />
            Verify the SAP server's TLS certificate
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSaveSapConfig()}>
              Save SAP Connection
            </Button>
            {sapSaved && (
              <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}>
                Saved
              </Badge>
            )}
          </div>
          {sapError && <Alert>{sapError}</Alert>}
        </div>
      </Card>
    </div>
  )
}
