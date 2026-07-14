export default function FixedDigits({ value, min = 2, className = '' }) {
  const text = String(value).padStart(min, '0')
  return (
    <span className={`fixed-digits ${className}`.trim()} aria-label={text}>
      {[...text].map((digit, index) => <span key={`${digit}-${index}`} className="fixed-digit" aria-hidden="true">{digit}</span>)}
    </span>
  )
}
