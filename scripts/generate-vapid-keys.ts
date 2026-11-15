// Prints a VAPID key pair for Web Push.
//   bun scripts/generate-vapid-keys.ts
// Set the public key as the VAPID_PUBLIC_KEY variable and store the private
// key with `wrangler secret put VAPID_PRIVATE_KEY`.
import { generateVapidKeys } from '../src/lib/web-push'

const keys = await generateVapidKeys()
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
