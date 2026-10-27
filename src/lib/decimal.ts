export const percentToBps = (value: string) => {
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export const bpsToPercent = (bps: number) => String(bps / 100)

export const decimalToMinor = (value: string) => {
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export const minorToDecimal = (minor: number) =>
  `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`

export const formatMinor = (minor: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(
    minor / 100,
  )
