export function nextInterfaceVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version))
  if (!match) throw new Error(`当前 package version 不是三段式版本号：${version}`)
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  return patch >= 10
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`
}
