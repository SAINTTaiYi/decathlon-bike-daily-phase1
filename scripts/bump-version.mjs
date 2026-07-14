import { readFile, writeFile } from 'node:fs/promises'
import { projectRoot } from './version-files.mjs'
import { nextInterfaceVersion } from './version-number.mjs'

const args = process.argv.slice(2)
const values = { change: [] }
for (let index = 0; index < args.length; index += 1) {
  const key = args[index]
  if (key === '--') continue
  if (!key.startsWith('--')) continue
  const name = key.slice(2)
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${key} 缺少内容`)
  if (name === 'change') values.change.push(value)
  else values[name] = value
  index += 1
}

if (!values.title || !values.summary || !values.change.length) {
  console.error('用法：pnpm version:patch -- --title "更新标题" --summary "更新摘要" --change "更新项一" [--change "更新项二"]')
  process.exit(1)
}

const packagePath = `${projectRoot}/package.json`
const releasePath = `${projectRoot}/apps/web/src/data/releaseNotes.js`
const webPackagePath = `${projectRoot}/apps/web/package.json`
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const webPackageJson = JSON.parse(await readFile(webPackagePath, 'utf8'))
const nextVersion = nextInterfaceVersion(packageJson.version)
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '.')
const quoted = (value) => JSON.stringify(String(value), null, 0)
const releaseSource = `export const APP_VERSION = ${quoted(nextVersion)}\n\nexport const currentRelease = {\n  version: APP_VERSION,\n  date: ${quoted(date)},\n  title: ${quoted(values.title)},\n  summary: ${quoted(values.summary)},\n  changes: [\n${values.change.map((change) => `    ${quoted(change)}`).join(',\n')}\n  ]\n}\n`

packageJson.version = nextVersion
webPackageJson.version = nextVersion
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
await writeFile(webPackagePath, `${JSON.stringify(webPackageJson, null, 2)}\n`)
await writeFile(releasePath, releaseSource)
console.log(`VERSION BUMPED · V${nextVersion}`)
console.log('修改完成后运行 pnpm version:stamp，再运行 pnpm build。')
