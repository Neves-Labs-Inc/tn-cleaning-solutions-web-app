export function buildMapsUrl(address: string): string {
  const trimmed = address.trim()
  if (!trimmed) return ''

  return `https://maps.google.com/?q=${encodeURIComponent(trimmed)}`
}
