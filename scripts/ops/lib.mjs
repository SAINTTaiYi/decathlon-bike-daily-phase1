import { spawn } from 'node:child_process'

const networkErrorCodes = new Set([
  'EAI_AGAIN', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET', 'ENETDOWN', 'ENETUNREACH',
  'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'
])

export function isNetworkUnavailable(errorOrText) {
  if (!errorOrText) return false
  if (typeof errorOrText === 'string') {
    return /(?:EAI_AGAIN|ECONNABORTED|ECONNREFUSED|ECONNRESET|ENETDOWN|ENETUNREACH|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|network (?:is )?unreachable|request to .* failed|error when performing (?:the )?request|fetch failed|socket hang up|getaddrinfo|could not resolve host|failed to connect|unable to access .*github)/iu.test(errorOrText)
  }
  if (networkErrorCodes.has(errorOrText.code) || networkErrorCodes.has(errorOrText.cause?.code)) return true
  return isNetworkUnavailable(errorOrText.cause) || isNetworkUnavailable(errorOrText.message)
}

export function networkUnavailableError(target, cause) {
  const error = new Error(`NETWORK_UNREACHABLE · ${target} · 当前网络无法访问境外平台或工具，请开启 VPN 后继续；操作已停止，不会盲目重试。`)
  error.code = 'NETWORK_UNREACHABLE'
  error.noRetry = true
  error.cause = cause
  return error
}

export async function fetchExternal(url, options = {}) {
  try {
    return await fetch(url, options)
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      let target = 'external-service'
      try { target = new URL(url).hostname } catch { /* keep generic target */ }
      throw networkUnavailableError(target, error)
    }
    throw error
  }
}

export function redactCommandArgs(args = []) {
  const sensitiveFlags = new Set(['--db-url', '--password', '--token', '--api-token', '--secret'])
  return args.map((value, index) => sensitiveFlags.has(args[index - 1]) ? '[REDACTED]' : value)
}

export function run(command, args, { cwd = process.cwd(), env = process.env, input = '', quiet = false, networkTarget = '' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk; if (!quiet) process.stdout.write(chunk) })
    child.stderr.on('data', (chunk) => { stderr += chunk; if (!quiet) process.stderr.write(chunk) })
    child.on('error', (error) => {
      if (networkTarget && isNetworkUnavailable(error)) reject(networkUnavailableError(networkTarget, error))
      else reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr })
      if (networkTarget && isNetworkUnavailable(`${stdout}\n${stderr}`)) return reject(networkUnavailableError(networkTarget, new Error(stderr.trim())))
      reject(new Error(`COMMAND_FAILED · ${command} ${redactCommandArgs(args).join(' ')} · ${code}\n${stderr}`))
    })
    if (input) child.stdin.write(input)
    child.stdin.end()
  })
}

export async function waitFor(label, check, { attempts = 60, delayMs = 5000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await check()
      if (result) return result
    } catch (error) {
      if (error?.noRetry || attempt === attempts) throw error
    }
    process.stderr.write(`WAIT · ${label} · ${attempt}/${attempts}\n`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error(`TIMEOUT · ${label}`)
}
