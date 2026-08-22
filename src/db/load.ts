import * as v from "valibot"
import { dbSchema, type DB } from "./schema"

const MAX_REPORTED_ISSUES = 10

export function parseDb(value: unknown): DB {
  const result = v.safeParse(dbSchema, value)
  if (result.success) return result.output

  const lines = result.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
  const more = result.issues.length - lines.length
  if (more > 0) lines.push(`…and ${more} more`)
  throw new Error(`invalid DB — ${lines.join("; ")}`)
}

export async function fetchDb(url: string): Promise<DB> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
  return parseDb(await response.json())
}
