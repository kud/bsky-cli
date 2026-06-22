import { xrpc } from "./session.js"

export type PostRef = { uri: string; cid: string }
export type ReplyRef = { root: PostRef; parent: PostRef }

export const resolveHandle = async (handle: string): Promise<string> => {
  if (handle.startsWith("did:")) return handle
  const clean = handle.replace(/^@/, "")
  const { did } = await xrpc<{ did: string }>(
    "com.atproto.identity.resolveHandle",
    { params: { handle: clean }, auth: false },
  )
  return did
}

/** Parse a bsky.app post URL or an at:// URI into its repo (did) and rkey. */
export const parsePostUrl = async (
  input: string,
): Promise<{ did: string; rkey: string }> => {
  if (input.startsWith("at://")) {
    const [did, , rkey] = input.slice("at://".length).split("/")
    if (!did || !rkey) throw new Error(`Unrecognised at:// URI: ${input}`)
    return { did: await resolveHandle(did), rkey }
  }
  const match = input.match(/\/profile\/([^/]+)\/post\/([^/?#]+)/)
  if (!match) throw new Error(`Unrecognised post URL: ${input}`)
  return { did: await resolveHandle(match[1]!), rkey: match[2]! }
}

/** Fetch a post's {uri, cid} and the thread root it belongs to. */
export const getPostRef = async (
  input: string,
): Promise<{ ref: PostRef; root: PostRef }> => {
  const { did, rkey } = await parsePostUrl(input)
  const record = await xrpc<{
    uri: string
    cid: string
    value: { reply?: { root: PostRef } }
  }>("com.atproto.repo.getRecord", {
    params: { repo: did, collection: "app.bsky.feed.post", rkey },
    auth: false,
  })
  const ref: PostRef = { uri: record.uri, cid: record.cid }
  return { ref, root: record.value.reply?.root ?? ref }
}
