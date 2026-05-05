type EmailAddressValue = string | string[]

type WelcomeOnboardingTemplateData = {
  firstName: string
  productName: string
  actionUrl: string
  previewText?: string
}

type SystemAlertTemplateData = {
  serviceName: string
  severity: string
  message: string
  incidentId: string
}

type BaseEmailPayload<TTemplateId extends string, TTemplateData extends object> = {
  appId: string
  templateId: TTemplateId
  to: EmailAddressValue
  subject: string
  templateData: TTemplateData
  replyTo?: EmailAddressValue
  cc?: EmailAddressValue
  bcc?: EmailAddressValue
}

export type WelcomeOnboardingEmailPayload = BaseEmailPayload<
  'welcome-onboarding',
  WelcomeOnboardingTemplateData
>

export type SystemAlertEmailPayload = BaseEmailPayload<'system-alert', SystemAlertTemplateData>
export type EmailServicePayload = WelcomeOnboardingEmailPayload | SystemAlertEmailPayload
export type EmailServiceBatchPayload = { emails: EmailServicePayload[] }

const DEFAULT_EMAIL_SERVICE_BASE_URL = 'https://blue-island-0357bf210.7.azurestaticapps.net'

const getEmailServiceConfig = () => {
  const baseUrl = (process.env.EMAIL_MICROSERVICE_BASE_URL || DEFAULT_EMAIL_SERVICE_BASE_URL).replace(/\/+$/, '')
  const apiKey = process.env.EMAIL_MICROSERVICE_API_KEY

  if (!apiKey) {
    throw new Error('EMAIL_MICROSERVICE_API_KEY is not configured')
  }

  return { baseUrl, apiKey }
}

const sendEmailRequest = async (payload: EmailServicePayload | EmailServiceBatchPayload) => {
  const { baseUrl, apiKey } = getEmailServiceConfig()
  const response = await fetch(`${baseUrl}/api/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Email service request failed with status ${response.status}`)
  }

  const text = await response.text()
  return text ? JSON.parse(text) : { success: true }
}

export const sendEmail = (payload: EmailServicePayload) => sendEmailRequest(payload)

export const sendEmailBatch = (emails: EmailServicePayload[]) => {
  if (emails.length === 0) throw new Error('At least one email is required')
  if (emails.length > 100) throw new Error('Email batch cannot exceed 100 emails')
  return sendEmailRequest({ emails })
}

export const sendWelcomeOnboardingEmail = (
  payload: Omit<WelcomeOnboardingEmailPayload, 'templateId'>,
) => sendEmail({
  ...payload,
  templateId: 'welcome-onboarding',
})

export const sendSystemAlertEmail = (payload: Omit<SystemAlertEmailPayload, 'templateId'>) =>
  sendEmail({
    ...payload,
    templateId: 'system-alert',
  })
