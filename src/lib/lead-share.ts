import { parseProfileUrl } from '#/lib/leads'

/**
 * Picks the shared value to parse. Android puts the link in `url` or inside
 * `text`, and iOS Shortcuts send `url`. The first value that parses as a
 * profile wins. When none does, the raw value is returned so the page can
 * show it and let the user correct it.
 */
export function pickSharedInput(shared: {
  url?: string
  text?: string
}): string {
  const candidates = [shared.url, shared.text]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value !== '')
  for (const candidate of candidates) {
    if (parseProfileUrl(candidate).ok) return candidate
  }
  return candidates[0] ?? ''
}
