import { AnimatePresence, motion } from 'framer-motion'

// Amicro 风格 Toast：snappy spring 入场 + 快速退场。
// a11y：aria-live 区域常驻（外层容器），视觉层随 AnimatePresence 挂载/卸载。
export default function StatusToast({ notice }) {
  const message = typeof notice === 'string' ? notice : notice?.message || ''
  const tone = typeof notice === 'object' && notice ? notice.tone : 'default'
  return (
    <div
      className="status-toast-live"
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <AnimatePresence initial={false}>
        {message ? (
          <motion.div
            key={tone === 'error' ? 'error' : 'default'}
            className="status-toast"
            data-tone={tone}
            initial={{ opacity: 0, y: 14, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: .97, transition: { duration: .18, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: 'spring', stiffness: 400, damping: 28, mass: .8 }}
          >
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
