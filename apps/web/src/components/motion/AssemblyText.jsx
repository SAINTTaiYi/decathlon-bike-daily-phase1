import { createElement } from 'react'

export default function AssemblyText({ as = 'span', text, seed = 0, className = '', ...props }) {
  const characters = [...String(text)]
  return createElement(as, {
    ...props,
    className,
    'data-assembly-text': 'true',
    'aria-label': String(text)
  }, characters.map((character, index) => createElement('i', {
    key: `${character}-${index}`,
    'aria-hidden': 'true',
    'data-assembly-char': 'true',
    style: { '--assembly-char-delay': `${((index * 7 + seed * 5) % 11) * 65}ms` }
  }, character === ' ' ? '\u00a0' : character)))
}
