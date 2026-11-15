import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { describeFailure } from '#/lib/action-errors'
import { base64urlDecode, base64urlEncode } from '#/lib/web-push'
import {
  removePushSubscription,
  savePushSubscription,
} from '#/server/push-actions'

type Status = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on'

const supported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  return registration?.pushManager.getSubscription() ?? null
}

export function PushNotifications({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      let next: Status = 'off'
      if (!supported()) next = 'unsupported'
      else if (Notification.permission === 'denied') next = 'blocked'
      else if (await currentSubscription()) next = 'on'
      if (!cancelled) setStatus(next)
    }
    check().catch(() => !cancelled && setStatus('unsupported'))
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    if (!publicKey) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off')
        toast.error('Notifications were not allowed on this device.')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64urlDecode(publicKey),
        }))
      const p256dh = subscription.getKey('p256dh')
      const auth = subscription.getKey('auth')
      if (!p256dh || !auth) throw new Error('The browser gave no push keys.')
      await savePushSubscription({
        data: {
          endpoint: subscription.endpoint,
          p256dh: base64urlEncode(new Uint8Array(p256dh)),
          auth: base64urlEncode(new Uint8Array(auth)),
          userAgent: navigator.userAgent.slice(0, 300),
        },
      })
      setStatus('on')
      toast.success('Notifications are on for this device.')
    } catch (error) {
      console.error(error)
      toast.error(describeFailure(error, 'Could not turn notifications on.'))
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        await removePushSubscription({ data: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setStatus('off')
      toast.success('Notifications are off for this device.')
    } catch (error) {
      console.error(error)
      toast.error(describeFailure(error, 'Could not turn notifications off.'))
    } finally {
      setBusy(false)
    }
  }

  let message =
    'Get the morning lead summary as a notification on this device, at the same time as the email.'
  if (!publicKey) {
    message =
      'Push is not set up on the server. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY first.'
  } else if (status === 'unsupported') {
    message =
      'This browser cannot receive push notifications. On an iPhone, add Quoteflare to the Home Screen and open it from there.'
  } else if (status === 'blocked') {
    message =
      'Notifications are blocked for this site. Allow them in the browser or phone settings, then reload.'
  } else if (status === 'on') {
    message = 'This device gets the morning lead summary as a notification.'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {publicKey && (status === 'off' || status === 'on') && (
        <CardContent>
          {status === 'on' ? (
            <Button variant="outline" disabled={busy} onClick={disable}>
              Turn off notifications on this device
            </Button>
          ) : (
            <Button disabled={busy} onClick={enable}>
              Enable notifications on this device
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}
