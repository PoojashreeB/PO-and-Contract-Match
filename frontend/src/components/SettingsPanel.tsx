import { useEffect, useState } from 'react'
import { CheckCircle2, Database, Mail, Server } from 'lucide-react'
import {
  DEFAULT_API_URL,
  ENV_API_KEY,
  getApiKey,
  getApiUrl,
  getSavedApiKey,
  normalizeApiKey,
  normalizeApiUrl,
  setApiKey,
  setApiUrl,
} from '../storage'
import { getOutlookConfig, getSapConfig, saveOutlookConfig, saveSapConfig } from '../api'
import type { ApiError } from '../types'
import { Alert } from './ui/Alert'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { TextField } from './ui/TextField'

export function SettingsPanel() {
  const [apiUrl, setApiUrlState] = useState(getApiUrl())
  const [apiKey, setApiKeyState] = useState(getSavedApiKey())
  const [saved, setSaved] = useState(false)
  // The connection last saved; the SAP and Outlook cards (re)load from it.
  const [connection, setConnection] = useState({ url: getApiUrl(), key: getApiKey() })

  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [mailbox, setMailbox] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [clientSecretSet, setClientSecretSet] = useState(false)
  const [outlookSaved, setOutlookSaved] = useState(false)
  const [outlookError, setOutlookError] = useState<string | null>(null)

  const [sapAshost, setSapAshost] = useState('')
  const [sapSysnr, setSapSysnr] = useState('')
  const [sapClient, setSapClient] = useState('')
  const [sapUsername, setSapUsername] = useState('')
  const [sapPassword, setSapPassword] = useState('')
  const [sapGwhost, setSapGwhost] = useState('')
  const [sapGwserv, setSapGwserv] = useState('')
  const [sapPasswordSet, setSapPasswordSet] = useState(false)
  const [sapSaved, setSapSaved] = useState(false)
  const [sapError, setSapError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSapError(null)
    // Without a key every call is a 401; wait until one is saved.
    if (!connection.key) return
    getSapConfig(connection.url, connection.key)
      .then((config) => {
        if (cancelled) return
        setSapAshost(config.ashost)
        setSapSysnr(config.sysnr)
        setSapClient(config.client)
        setSapUsername(config.username)
        setSapGwhost(config.gwhost)
        setSapGwserv(config.gwserv)
        setSapPasswordSet(config.password_set)
      })
      .catch((error: ApiError) => {
        if (cancelled || error.status === 404) return
        setSapError(error.message)
      })
    return () => {
      cancelled = true
    }
  }, [connection])

  useEffect(() => {
    let cancelled = false
    setOutlookError(null)
    if (!connection.key) return
    getOutlookConfig(connection.url, connection.key)
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
  }, [connection])

  function handleSave() {
    const url = normalizeApiUrl(apiUrl)
    const key = normalizeApiKey(apiKey)
    setApiUrl(url)
    setApiKey(key)
    setApiUrlState(url)
    setApiKeyState(key)
    setConnection({ url, key: key || ENV_API_KEY })
    setSaved(true)
  }

  async function handleSaveOutlookConfig() {
    setOutlookError(null)
    try {
      const result = await saveOutlookConfig(normalizeApiUrl(apiUrl), normalizeApiKey(apiKey) || ENV_API_KEY, {
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
      const result = await saveSapConfig(normalizeApiUrl(apiUrl), normalizeApiKey(apiKey) || ENV_API_KEY, {
        ashost: sapAshost.trim(),
        sysnr: sapSysnr.trim(),
        client: sapClient.trim(),
        username: sapUsername.trim(),
        password: sapPassword,
        gwhost: sapGwhost.trim(),
        gwserv: sapGwserv.trim(),
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
            placeholder={DEFAULT_API_URL}
            value={apiUrl}
            onChange={(e) => {
              setApiUrlState(e.target.value)
              setSaved(false)
            }}
          />
          <div>
            <TextField
              id="api-key"
              label="Backend API key (API_KEY in .env)"
              type="password"
              placeholder={ENV_API_KEY ? 'Using API_KEY from .env' : 'API_KEY value from .env'}
              value={apiKey}
              onChange={(e) => {
                setApiKeyState(e.target.value)
                setSaved(false)
              }}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Not the OpenRouter key.
              {ENV_API_KEY && ' Leave empty to use API_KEY from .env.'}
            </p>
          </div>
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
            Reads POs over RFC from tables EKKO, EKPO and LFA1.
          </p>
          <TextField
            id="sap-ashost"
            label="SAP Application Server"
            type="text"
            placeholder="sapserver.example.com"
            value={sapAshost}
            onChange={(e) => {
              setSapAshost(e.target.value)
              setSapSaved(false)
            }}
          />
          <TextField
            id="sap-sysnr"
            label="SAP System Number"
            type="text"
            placeholder="00"
            value={sapSysnr}
            onChange={(e) => {
              setSapSysnr(e.target.value)
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
          <TextField
            id="sap-gwhost"
            label="SAP Gateway Host (optional)"
            type="text"
            placeholder="Only if the server name doesn't resolve here"
            value={sapGwhost}
            onChange={(e) => {
              setSapGwhost(e.target.value)
              setSapSaved(false)
            }}
          />
          <TextField
            id="sap-gwserv"
            label="SAP Gateway Service (optional)"
            type="text"
            placeholder="sapgw00"
            value={sapGwserv}
            onChange={(e) => {
              setSapGwserv(e.target.value)
              setSapSaved(false)
            }}
          />
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
