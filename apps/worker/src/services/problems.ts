export class ApiProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiProblem'
  }
}

export function problem(status: number, code: string, message: string): Response {
  return Response.json({ error: code, message }, { status })
}
