/*
 * Shared preview-only gate.
 *
 * Preview and production ship the same build artifact, so dev-only surfaces
 * (PaletteLab, the Shiphub connection simulator) cannot be stripped at build
 * time. They check the host at runtime instead and simply never render on
 * workshop.skin.
 */
export function isPreviewHost() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.workers.dev')
}
