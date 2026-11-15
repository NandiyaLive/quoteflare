// Regenerates the PWA icons from public/favicon.svg.
// Run with: bun scripts/generate-pwa-assets.ts
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

// Matches --background in dark mode (oklch(0.145 0 0)) and the manifest.
const BACKGROUND = '#0a0a0a'

// The icons sit on a dark background, so draw the navy parts of the logo white.
const svg = (await readFile('public/favicon.svg', 'utf8'))
  .replace(/@media\s*\(prefers-color-scheme:dark\)\{[^}]*\{[^}]*\}\}/, '')
  .replace('.n{fill:#02163f}', '.n{fill:#fff}')

// Render large, then trim transparent margins so scaling is relative to the
// artwork itself.
const mark = await sharp(Buffer.from(svg), { density: 600 })
  .resize({ width: 2000 })
  .png()
  .toBuffer()
  .then((b) => sharp(b).trim().png().toBuffer())

async function compose(
  width: number,
  height: number,
  markWidthRatio: number,
  out: string,
) {
  const markWidth = Math.round(width * markWidthRatio)
  const resized = await sharp(mark)
    .resize({
      width: markWidth,
      height: Math.round(height * 0.9),
      fit: 'inside',
    })
    .toBuffer()
  await sharp({
    create: { width, height, channels: 3, background: BACKGROUND },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(out)
}

// Regular icons keep the logo at 76% of the canvas. The maskable icon keeps
// it inside the 80% circle that Android may crop to, at 58%.
await compose(192, 192, 0.76, 'public/icon-192.png')
await compose(512, 512, 0.76, 'public/icon-512.png')
await compose(512, 512, 0.58, 'public/icon-maskable-512.png')
await compose(180, 180, 0.7, 'public/apple-touch-icon.png')

console.log('Generated PWA icons')
