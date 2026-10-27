const RESEND_URL = 'https://api.resend.com/emails'

export type EmailMessage = {
  from: string
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

export type SendEmailResult =
  { ok: true; id: string } | { ok: false; error: string }

/**
 * Sends one email through Resend. The idempotency key makes Resend return the
 * original message when the same key is sent again within 24 hours.
 */
export async function sendEmail(
  apiKey: string | undefined,
  message: EmailMessage,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<SendEmailResult> {
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured.' }

  let response: Response
  try {
    response = await fetcher(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        ...(message.replyTo ? { reply_to: [message.replyTo] } : {}),
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    })
  } catch (error) {
    return {
      ok: false,
      error: `Could not reach Resend: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const body = (await response.json().catch(() => null)) as {
    id?: string
    message?: string
  } | null

  if (!response.ok || !body?.id) {
    return {
      ok: false,
      error: `Resend responded ${response.status}: ${body?.message ?? 'no error message'}`,
    }
  }
  return { ok: true, id: body.id }
}
