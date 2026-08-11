const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/

function parseVersion(version, message) {
  const match = versionPattern.exec(String(version))
  if (!match) throw new Error(message)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function nextInterfaceVersion(version) {
  const [major, minor, patch] = parseVersion(version, `当前 package version 不是三段式版本号：${version}`)
  return patch >= 10
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`
}

/**
 * 正式发布版本号解析。默认沿用界面自然递增；传入 --set-version 时改用显式版本号。
 *
 * 显式版本号存在的唯一理由：被否决并回滚的版本号已经烧掉（V5.8.4、V5.8.5 都在 Production
 * 出现过又被回滚），自然递增会重新用到它们，导致同一版本号指代两份不同的线上代码。
 * 仍然强制严格单调递增，杜绝降级或重复发布同一版本号。
 */
export function resolveReleaseVersion(currentVersion, explicitVersion) {
  if (explicitVersion === undefined || explicitVersion === null || explicitVersion === '') {
    return nextInterfaceVersion(currentVersion)
  }
  const target = parseVersion(explicitVersion, `--set-version 必须是三段式版本号：${explicitVersion}`)
  const current = parseVersion(currentVersion, `当前 package version 不是三段式版本号：${currentVersion}`)
  for (let index = 0; index < 3; index += 1) {
    if (target[index] > current[index]) return String(explicitVersion)
    if (target[index] < current[index]) break
  }
  throw new Error(`--set-version 必须严格大于当前版本 ${currentVersion}：${explicitVersion}`)
}
