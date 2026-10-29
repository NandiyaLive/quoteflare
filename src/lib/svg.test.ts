import { describe, expect, it } from 'vitest'
import { isSafeSvg } from './svg'

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`

describe('isSafeSvg', () => {
  it('accepts a plain drawing', () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(true)
    expect(
      isSafeSvg(
        `<?xml version="1.0"?><!-- logo -->${wrap('<defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs><path d="M0 0h5" fill="url(#a)"/>')}`,
      ),
    ).toBe(true)
  })

  it('accepts a stylesheet with local references only', () => {
    expect(isSafeSvg(wrap('<style><![CDATA[.a{fill:url(#g)}]]></style>'))).toBe(
      true,
    )
  })

  it('accepts local and embedded raster references', () => {
    expect(isSafeSvg(wrap('<use href="#a"/>'))).toBe(true)
    expect(isSafeSvg(wrap('<image href="data:image/png;base64,AAAA"/>'))).toBe(
      true,
    )
  })

  it.each([
    ['a script element', wrap('<script>1</script>')],
    ['an event handler', wrap('<rect onclick="x()"/>')],
    ['a foreignObject', wrap('<foreignObject><div/></foreignObject>')],
    ['an external use', wrap('<use href="https://evil.test/a.svg#x"/>')],
    ['a javascript link', wrap('<use xlink:href="javascript:alert(1)"/>')],
    ['an encoded javascript link', wrap('<rect fill="&#106;avascript:x"/>')],
    [
      'an svg data link',
      wrap('<image href="data:image/svg+xml;base64,AAAA"/>'),
    ],
    [
      'a stylesheet import',
      wrap('<style>@import url(https://evil.test/a.css);</style>'),
    ],
    [
      'a remote style url',
      wrap('<rect style="fill:url(https://evil.test/a)"/>'),
    ],
    ['an entity declaration', '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'],
    ['an animation', wrap('<animate attributeName="href" to="javascript:x"/>')],
    ['a non-svg root', '<html><svg/></html>'],
    ['stray markup', wrap('<rect/><')],
  ])('rejects %s', (_, svg) => {
    expect(isSafeSvg(svg)).toBe(false)
  })
})
