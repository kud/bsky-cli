import { getSession, xrpc } from "./session.js"
import { getPostRef, parsePostUrl, resolveHandle } from "./resolve.js"

const now = () => new Date().toISOString()

const createRecord = async (
  collection: string,
  record: Record<string, unknown>,
): Promise<{ uri: string }> => {
  const { did } = await getSession()
  return xrpc("com.atproto.repo.createRecord", {
    method: "POST",
    body: { repo: did, collection, record },
  })
}

const deleteByUri = async (uri: string): Promise<void> => {
  const { did } = await getSession()
  const [, , , collection, rkey] = uri.split("/")
  await xrpc<unknown>("com.atproto.repo.deleteRecord", {
    method: "POST",
    body: { repo: did, collection, rkey },
  })
}

const toAtUri = async (url: string): Promise<string> => {
  const { did, rkey } = await parsePostUrl(url)
  return `at://${did}/app.bsky.feed.post/${rkey}`
}

export const like = async (url: string): Promise<void> => {
  const { ref } = await getPostRef(url)
  await createRecord("app.bsky.feed.like", {
    $type: "app.bsky.feed.like",
    subject: ref,
    createdAt: now(),
  })
}

export const repost = async (url: string): Promise<void> => {
  const { ref } = await getPostRef(url)
  await createRecord("app.bsky.feed.repost", {
    $type: "app.bsky.feed.repost",
    subject: ref,
    createdAt: now(),
  })
}

export const follow = async (handle: string): Promise<void> => {
  const did = await resolveHandle(handle)
  await createRecord("app.bsky.graph.follow", {
    $type: "app.bsky.graph.follow",
    subject: did,
    createdAt: now(),
  })
}

const postViewer = async (
  url: string,
): Promise<{ like?: string; repost?: string }> => {
  const uri = await toAtUri(url)
  const { posts } = await xrpc<{
    posts: Array<{ viewer?: { like?: string; repost?: string } }>
  }>("app.bsky.feed.getPosts", { params: { uris: uri } })
  return posts[0]?.viewer ?? {}
}

export const unlike = async (url: string): Promise<void> => {
  const viewer = await postViewer(url)
  if (!viewer.like) throw new Error("You haven't liked that post.")
  await deleteByUri(viewer.like)
}

export const unrepost = async (url: string): Promise<void> => {
  const viewer = await postViewer(url)
  if (!viewer.repost) throw new Error("You haven't reposted that post.")
  await deleteByUri(viewer.repost)
}

export const unfollow = async (handle: string): Promise<void> => {
  const did = await resolveHandle(handle)
  const { viewer } = await xrpc<{ viewer?: { following?: string } }>(
    "app.bsky.actor.getProfile",
    { params: { actor: did } },
  )
  if (!viewer?.following) throw new Error(`You don't follow ${handle}.`)
  await deleteByUri(viewer.following)
}
