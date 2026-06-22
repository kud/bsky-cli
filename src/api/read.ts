import { xrpc } from "./session.js"
import { parsePostUrl, resolveHandle } from "./resolve.js"

export type FeedPost = {
  uri: string
  handle: string
  displayName?: string
  text: string
  createdAt: string
  likeCount: number
  repostCount: number
  replyCount: number
}

type RawPost = {
  uri: string
  author: { handle: string; displayName?: string }
  record: { text: string; createdAt: string }
  likeCount?: number
  repostCount?: number
  replyCount?: number
}

const toFeedPost = (post: RawPost): FeedPost => ({
  uri: post.uri,
  handle: post.author.handle,
  displayName: post.author.displayName,
  text: post.record.text,
  createdAt: post.record.createdAt,
  likeCount: post.likeCount ?? 0,
  repostCount: post.repostCount ?? 0,
  replyCount: post.replyCount ?? 0,
})

export const getTimeline = async (limit = 25): Promise<FeedPost[]> => {
  const { feed } = await xrpc<{ feed: Array<{ post: RawPost }> }>(
    "app.bsky.feed.getTimeline",
    { params: { limit } },
  )
  return feed.map((item) => toFeedPost(item.post))
}

export const getAuthorFeed = async (
  actor: string,
  limit = 25,
): Promise<FeedPost[]> => {
  const did = await resolveHandle(actor)
  const { feed } = await xrpc<{ feed: Array<{ post: RawPost }> }>(
    "app.bsky.feed.getAuthorFeed",
    { params: { actor: did, limit } },
  )
  return feed.map((item) => toFeedPost(item.post))
}

export const getThread = async (
  url: string,
  limit = 25,
): Promise<FeedPost[]> => {
  const { did, rkey } = await parsePostUrl(url)
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`
  const { thread } = await xrpc<{
    thread: { post: RawPost; replies?: Array<{ post: RawPost }> }
  }>("app.bsky.feed.getPostThread", { params: { uri, depth: 1 } })
  return [
    toFeedPost(thread.post),
    ...(thread.replies ?? [])
      .slice(0, limit)
      .map((reply) => toFeedPost(reply.post)),
  ]
}

export type Notification = {
  reason: string
  handle: string
  text?: string
  isRead: boolean
  indexedAt: string
}

export const getNotifications = async (limit = 25): Promise<Notification[]> => {
  const { notifications } = await xrpc<{
    notifications: Array<{
      reason: string
      author: { handle: string }
      record: { text?: string }
      isRead: boolean
      indexedAt: string
    }>
  }>("app.bsky.notification.listNotifications", { params: { limit } })
  return notifications.map((n) => ({
    reason: n.reason,
    handle: n.author.handle,
    text: n.record?.text,
    isRead: n.isRead,
    indexedAt: n.indexedAt,
  }))
}

export type Profile = {
  handle: string
  displayName?: string
  description?: string
  followersCount: number
  followsCount: number
  postsCount: number
}

export const getProfile = async (actor: string): Promise<Profile> => {
  const did = await resolveHandle(actor)
  const p = await xrpc<{
    handle: string
    displayName?: string
    description?: string
    followersCount?: number
    followsCount?: number
    postsCount?: number
  }>("app.bsky.actor.getProfile", { params: { actor: did } })
  return {
    handle: p.handle,
    displayName: p.displayName,
    description: p.description,
    followersCount: p.followersCount ?? 0,
    followsCount: p.followsCount ?? 0,
    postsCount: p.postsCount ?? 0,
  }
}

export const searchPosts = async (
  q: string,
  limit = 25,
): Promise<FeedPost[]> => {
  const { posts } = await xrpc<{ posts: RawPost[] }>(
    "app.bsky.feed.searchPosts",
    {
      params: { q, limit },
    },
  )
  return posts.map(toFeedPost)
}

export type Actor = {
  handle: string
  displayName?: string
  description?: string
}

export const searchActors = async (q: string, limit = 25): Promise<Actor[]> => {
  const { actors } = await xrpc<{ actors: Actor[] }>(
    "app.bsky.actor.searchActors",
    { params: { q, limit } },
  )
  return actors.map((a) => ({
    handle: a.handle,
    displayName: a.displayName,
    description: a.description,
  }))
}
