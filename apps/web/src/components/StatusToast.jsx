export default function StatusToast({ notice }) {
  const message = typeof notice === 'string' ? notice : notice?.message || ''
  const tone = typeof notice === 'object' ? notice?.tone : 'default'
  return <div className="status-toast" role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" data-visible={message ? 'true' : 'false'} data-tone={tone}>{message || '状态未改变'}</div>
}
