import { readFileSync } from "node:fs"
import { extname } from "node:path"
import { getSession, PDS, xrpc } from "./session.js"
import { extractFacets } from "./facets.js"
import {
  getPostRef,
  parsePostUrl,
  type PostRef,
  type ReplyRef,
} from "./resolve.js"

const MAX = 300

export const checkLength = (text: string): void => {
  const length = [...text].length
  if (length > MAX)
    throw new Error(`Post is ${length} chars — Bluesky limit is ${MAX}.`)
}

const mimeType = (filePath: string): string => {
  const ext = extname(filePath).toLowerCase()
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".gif") return "image/gif"
  if (ext === ".webp") return "image/webp"
  throw new Error(`Unsupported image format: ${ext}`)
}

export const uploadBlob = async (imagePath: string): Promise<unknown> => {
  const { accessJwt } = await getSession()
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      "Content-Type": mimeType(imagePath),
      Authorization: `Bearer ${accessJwt}`,
    },
    body: readFileSync(imagePath),
  })
  if (!res.ok)
    throw new Error(`Image upload failed (${res.status}): ${await res.text()}`)
  const { blob } = (await res.json()) as { blob: unknown }
  return blob
}

export type PostOptions = {
  image?: string
  alt?: string
  replyTo?: string
  quote?: string
  lang?: string
}

export type PostResult = { uri: string; cid: string }

const buildRecord = async (
  text: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => {
  checkLength(text)
  const facets = await extractFacets(text)
  return {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    ...(facets.length > 0 && { facets }),
    ...extra,
  }
}

const create = async (record: Record<string, unknown>): Promise<PostResult> => {
  const { did } = await getSession()
  return xrpc<PostResult>("com.atproto.repo.createRecord", {
    method: "POST",
    body: { repo: did, collection: "app.bsky.feed.post", record },
  })
}

export const createPost = async (
  text: string,
  opts: PostOptions = {},
): Promise<PostResult> => {
  const extra: Record<string, unknown> = {}

  if (opts.replyTo) {
    const { ref, root } = await getPostRef(opts.replyTo)
    extra.reply = { root, parent: ref } satisfies ReplyRef
  }
  if (opts.image) {
    extra.embed = {
      $type: "app.bsky.embed.images",
      images: [{ image: await uploadBlob(opts.image), alt: opts.alt ?? "" }],
    }
  } else if (opts.quote) {
    const { ref } = await getPostRef(opts.quote)
    extra.embed = { $type: "app.bsky.embed.record", record: ref }
  }
  if (opts.lang) extra.langs = [opts.lang]

  return create(await buildRecord(text, extra))
}

/** Post a sequence as a self-thread; each post replies to the previous. */
export const createThread = async (texts: string[]): Promise<PostResult[]> => {
  texts.forEach(checkLength)
  const results: PostResult[] = []
  let root: PostRef | undefined
  let parent: PostRef | undefined
  for (const text of texts) {
    const extra = root && parent ? { reply: { root, parent } } : {}
    const res = await create(await buildRecord(text, extra))
    results.push(res)
    root ??= res
    parent = res
  }
  return results
}

export const deletePost = async (input: string): Promise<void> => {
  const { did } = await getSession()
  const rkey = /^[a-z0-9]+$/i.test(input)
    ? input
    : (await parsePostUrl(input)).rkey
  await xrpc<unknown>("com.atproto.repo.deleteRecord", {
    method: "POST",
    body: { repo: did, collection: "app.bsky.feed.post", rkey },
  })
}

export type MyPost = {
  uri: string
  rkey: string
  text: string
  createdAt: string
}

export const listMyPosts = async (limit = 25): Promise<MyPost[]> => {
  const { did } = await getSession()
  const { records } = await xrpc<{
    records: Array<{ uri: string; value: { text: string; createdAt: string } }>
  }>("com.atproto.repo.listRecords", {
    params: { repo: did, collection: "app.bsky.feed.post", limit },
  })
  return records.map((record) => ({
    uri: record.uri,
    rkey: record.uri.split("/").pop()!,
    text: record.value.text,
    createdAt: record.value.createdAt,
  }))
}

export const postWebUrl = (handle: string, rkey: string): string =>
  `https://bsky.app/profile/${handle}/post/${rkey}`
