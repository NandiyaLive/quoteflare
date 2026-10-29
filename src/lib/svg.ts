const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'style',
  'symbol',
  'use',
  'image',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'lineargradient',
  'radialgradient',
  'stop',
  'pattern',
  'clippath',
  'mask',
  'filter',
])

const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
const ATTRIBUTE =
  /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
const LOCAL_REFERENCE = /^#[\w.-]+$/
const EMBEDDED_RASTER =
  /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/
const UNSAFE_VALUE = /javascript:|vbscript:|data:|&|url\(\s*(?!['"]?#)/i
const UNSAFE_CSS =
  /@import|expression\(|behavior:|-moz-binding|javascript:|url\(\s*(?!['"]?#)/i

const isAllowedElement = (name: string) => {
  const lower = name.toLowerCase()
  return ALLOWED_ELEMENTS.has(lower) || /^fe[a-z]+$/.test(lower)
}

function hasUnsafeAttribute(source: string) {
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (name.startsWith('on')) return true
    if (name === 'href' || name === 'xlink:href') {
      if (!LOCAL_REFERENCE.test(value) && !EMBEDDED_RASTER.test(value.trim())) {
        return true
      }
    } else if (
      name === 'style' ? UNSAFE_CSS.test(value) : UNSAFE_VALUE.test(value)
    ) {
      return true
    }
  }
  return false
}

/**
 * Accepts only drawing elements and rejects script, external references and
 * entity tricks. Anything the parser below cannot account for counts as unsafe.
 */
export function isSafeSvg(source: string) {
  const text = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*<\?xml[^>]*\?>/, '')
    .replace(/<!DOCTYPE[^[>]*>/i, '')

  for (const style of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (UNSAFE_CSS.test(style[1].replace(/<!\[CDATA\[|\]\]>/g, ''))) {
      return false
    }
  }

  const withoutCdata = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  let first = true
  for (const tag of withoutCdata.matchAll(TAG)) {
    const [, closing, name, attributes] = tag
    if (!isAllowedElement(name)) return false
    if (first && name.toLowerCase() !== 'svg') return false
    first = false
    if (!closing && hasUnsafeAttribute(attributes)) return false
  }

  return !first && !withoutCdata.replace(TAG, '').includes('<')
}
