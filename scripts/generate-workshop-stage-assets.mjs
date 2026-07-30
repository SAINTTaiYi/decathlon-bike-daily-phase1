import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const outputDir = new URL('../apps/web/public/images/ops/stages/', import.meta.url)
mkdirSync(outputDir, { recursive: true })

const common = `fill="none" stroke="#fffdf8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
const faint = `fill="none" stroke="#fffdf8" stroke-opacity=".22" vector-effect="non-scaling-stroke"`
const signal = `fill="none" stroke="#ffc31a" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`

function wheel(cx, cy, r, spokes = 12) {
  const lines = Array.from({ length: spokes }, (_, index) => {
    const angle = (Math.PI * 2 * index) / spokes
    const x = (cx + Math.cos(angle) * r).toFixed(2)
    const y = (cy + Math.sin(angle) * r).toFixed(2)
    return `<path d="M${cx} ${cy}L${x} ${y}" stroke-opacity=".3"/>`
  }).join('')
  return `<g ${common} stroke-width="3"><circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(10, r * .08)}" ${signal} stroke-width="6"/>${lines}</g>`
}

const assets = [
  {
    file: 'pulse-drivetrain.svg',
    label: 'Workshop KPI drivetrain assembly',
    purpose: 'KPI / overview stage foreground',
    body: `<g transform="translate(360 430)"><circle r="252" ${faint} stroke-width="2"/><circle r="205" ${faint} stroke-width="2" stroke-dasharray="3 18"/>${wheel(0, 0, 164, 16)}<circle r="112" ${common} stroke-width="8"/><circle r="86" ${signal} stroke-width="4" stroke-dasharray="10 8"/><g ${common} stroke-width="18"><path d="M0 0L126-82"/><path d="M0 0L-92 136"/></g><g ${signal} stroke-width="8"><rect x="116" y="-99" width="72" height="24" rx="12" transform="rotate(-33 116 -99)"/><rect x="-142" y="120" width="72" height="24" rx="12" transform="rotate(-56 -142 120)"/></g><g ${common} stroke-width="5"><path d="M-246-238h92M154-238h92M-246 238h92M154 238h92"/><path d="M-238-246v92M238-246v92M-238 154v92M238 154v92"/></g></g>`
  },
  {
    file: 'pickup-wheel-rack.svg',
    label: 'Pickup wheel and handover rack',
    purpose: 'Pending pickup stage foreground',
    body: `<g>${wheel(276, 470, 202, 18)}<g ${common} stroke-width="8"><path d="M276 470L430 286L530 470Z"/><path d="M430 286L470 196L544 196"/><path d="M530 470L582 548H164"/><path d="M190 676H590"/><path d="M220 548V676M540 548V676"/></g><g ${signal} stroke-width="6"><path d="M432 282L518 336"/><rect x="486" y="316" width="126" height="94" rx="8" fill="#151415"/><path d="M514 344h70M514 368h44"/></g><g ${faint} stroke-width="3"><path d="M112 744h496"/><path d="M146 714v60M574 714v60"/></g></g>`
  },
  {
    file: 'handover-clipboard.svg',
    label: 'Workshop handover clipboard',
    purpose: 'Other handover stage foreground',
    body: `<g><path d="M176 118h368a24 24 0 0 1 24 24v596a24 24 0 0 1-24 24H176a24 24 0 0 1-24-24V142a24 24 0 0 1 24-24Z" fill="#151415" stroke="#fffdf8" stroke-width="8"/><rect x="272" y="76" width="176" height="92" rx="30" fill="#151415" stroke="#ffc31a" stroke-width="8"/><g ${common} stroke-width="7"><path d="M220 248h280M220 326h214M220 404h248M220 568h280M220 646h174"/><rect x="220" y="470" width="56" height="56" rx="6"/><path d="m232 496 14 14 28-34" ${signal}/></g><g ${faint} stroke-width="3"><path d="M112 214 76 178M608 214l36-36M112 666l-36 36M608 666l36 36"/></g></g>`
  },
  {
    file: 'repair-service-stand.svg',
    label: 'Bicycle repair stand and frame',
    purpose: 'Repair stage foreground',
    body: `<g><g ${common} stroke-width="10"><path d="M360 108v590M254 736h212M292 698h136"/><path d="M360 190h146l-28 64H360"/><path d="M506 190l74-58"/></g><g ${signal} stroke-width="7"><rect x="332" y="222" width="56" height="96" rx="12" fill="#151415"/><path d="M360 318 246 430 410 430 360 318ZM246 430l-54 126M410 430l112 126M192 556h330"/></g><g ${common} stroke-width="6"><circle cx="192" cy="556" r="132"/><circle cx="522" cy="556" r="132"/><path d="M246 430 192 556 410 430 522 556 346 556Z"/><path d="M410 430l-42-94h-62M522 556l44-136"/></g><g transform="translate(570 258) rotate(-30)" ${common} stroke-width="7"><path d="M0 0c40 22 78-16 58-54l-32 32-28-28 32-32C-8-102-46-64-24-24L-94 46l24 24Z"/></g></g>`
  },
  {
    file: 'resale-second-life.svg',
    label: 'Second-life bicycle and valuation tag',
    purpose: 'Used bicycle stage foreground',
    body: `<g>${wheel(188, 574, 154, 14)}${wheel(532, 574, 154, 14)}<g ${common} stroke-width="8"><path d="M188 574 292 366 420 574 188 574 352 446 532 574"/><path d="M292 366h116M352 446l-42-132M532 574l48-232M548 342h82"/><path d="M282 314h64"/></g><g ${signal} stroke-width="7"><path d="M446 182h154l58 58-172 172-98-98Z" fill="#151415"/><circle cx="558" cy="240" r="18"/><path d="M470 292h118M470 326h74"/></g><g ${faint} stroke-width="3"><path d="M102 770h516"/><path d="M126 742v56M594 742v56"/></g></g>`
  },
  {
    file: 'sales-counter-stack.svg',
    label: 'Workshop sales counter and receipt stack',
    purpose: 'Sales stage foreground',
    body: `<g><g ${common} stroke-width="7"><path d="M142 644h436v110H142Z" fill="#151415"/><path d="M174 530h372v114H174Z" fill="#151415"/><path d="M214 414h292v116H214Z" fill="#151415"/><path d="M270 154h180v260H270Z" fill="#151415"/><path d="M306 214h108M306 260h108M306 306h74"/></g><g ${signal} stroke-width="8"><path d="M198 612v-48M266 612v-94M334 612V486M402 612V540M470 612V456"/><circle cx="514" cy="238" r="94" fill="#151415"/><path d="M514 180v116M456 238h116"/></g><g ${faint} stroke-width="3"><path d="M100 790h520"/><path d="M128 766v48M592 766v48"/><circle cx="102" cy="192" r="54"/><circle cx="618" cy="520" r="44"/></g></g>`
  }
]

const records = []
for (const asset of assets) {
  const id = asset.file.replace(/\.svg$/u, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 880" data-original-workshop-object="${id}"><title>${asset.label}</title>${asset.body}</svg>\n`
  writeFileSync(new URL(asset.file, outputDir), svg)
  records.push({ ...asset, sha256: createHash('sha256').update(svg).digest('hex') })
}

const sourceLines = [
  '# Workshop stage object sources',
  '',
  '- Source: original deterministic vector illustrations authored for this repository by `scripts/generate-workshop-stage-assets.mjs`.',
  '- External inputs: none. No Obsidian Assembly image, logo, font, screenshot, silhouette, or proprietary asset is copied or traced.',
  '- Format: transparent self-hosted SVG, 720 × 880 viewBox.',
  '- Use: decorative foreground objects in the six Workshop parallax stages; consuming `<img>` elements use empty alternative text.',
  '- License: project-owned assets distributed under the repository product terms.',
  '',
  '| File | Purpose | SHA-256 |',
  '| --- | --- | --- |',
  ...records.map((record) => `| \`${record.file}\` | ${record.purpose} | \`${record.sha256}\` |`),
  ''
]
writeFileSync(new URL('SOURCES.md', outputDir), sourceLines.join('\n'))
console.log(JSON.stringify(records.map(({ file, sha256 }) => ({ file, sha256 })), null, 2))
