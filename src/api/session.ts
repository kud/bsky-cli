export const PDS = "https://bsky.social"

const HANDLE = process.env.BLUESKY_HANDLE
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD

export type Session = { accessJwt: string; did: string; handle: string }

let cached: Session | undefined

export const getSession = async (): Promise<Session> => {
  if (cached) return cached
  if (!HANDLE || !APP_PASSWORD) {
    throw new Error(
      "Missing credentials. Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (an App Password from Bluesky → Settings → App Passwords).",
    )
  }
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: HANDLE, password: APP_PASSWORD }),
  })
  if (!res.ok)
    throw new Error(`Auth failed (${res.status}): ${await res.text()}`)
  cached = (await res.json()) as Session
  return cached
}

type XrpcOptions = {
  method?: "GET" | "POST"
  params?: Record<string, string | number | undefined>
  body?: unknown
  auth?: boolean
}

export const xrpc = async <T>(
  nsid: string,
  { method = "GET", params, body, auth = true }: XrpcOptions = {},
): Promise<T> => {
  const session = auth ? await getSession() : undefined

  const query = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ""

  const headers: Record<string, string> = {}
  if (session) headers.Authorization = `Bearer ${session.accessJwt}`
  if (method === "POST") headers["Content-Type"] = "application/json"

  const res = await fetch(`${PDS}/xrpc/${nsid}${query}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  })
  if (!res.ok)
    throw new Error(`${nsid} failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<T>
}
