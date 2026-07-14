import { hash, verify, Algorithm } from '@node-rs/argon2'

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32
}

function peppered(password: string, pepper: string): string {
  return `${password}\u0000${pepper}`
}

export function hashPassword(password: string, pepper: string): Promise<string> {
  return hash(peppered(password, pepper), options)
}

export function verifyPassword(passwordHash: string, password: string, pepper: string): Promise<boolean> {
  return verify(passwordHash, peppered(password, pepper), options)
}
