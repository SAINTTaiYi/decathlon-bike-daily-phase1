#!/usr/bin/env node
import { run } from './lib.mjs'

const [target, command, ...args] = process.argv.slice(2)
if (!target || !command) {
  throw new Error('USAGE · node scripts/ops/network-guard.mjs <network-target> <command> [...args]')
}

await run(command, args, { networkTarget: target })
