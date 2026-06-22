import { defineCommand } from "citty"
import {
  createPost,
  createThread,
  deletePost,
  follow,
  getNotifications,
  getProfile,
  getSession,
  getThread,
  getTimeline,
  like,
  listMyPosts,
  postWebUrl,
  repost,
  searchPosts,
  unfollow,
  unlike,
  unrepost,
  type FeedPost,
} from "@kud/bsky"

const ESC = String.fromCharCode(27)
const tty = process.stdout.isTTY
const style = (open: string, close: string) => (t: string) =>
  tty ? `${ESC}[${open}m${t}${ESC}[${close}m` : t
const dim = style("2", "22")
const bold = style("1", "22")
const cyan = style("36", "39")

const ago = (iso: string): string => {
  const sec = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  )
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

const fail = (error: unknown): never => {
  console.error((error as Error).message ?? String(error))
  process.exit(1)
}

const printPosted = async (uri: string): Promise<void> => {
  const { handle } = await getSession()
  console.log(`✓ ${postWebUrl(handle, uri.split("/").pop()!)}`)
}

const showFeed = (posts: FeedPost[]): void => {
  for (const post of posts) {
    const name = post.displayName
      ? `${post.displayName} ${dim(`@${post.handle}`)}`
      : `@${post.handle}`
    console.log(`\n${bold(name)} ${dim(`· ${ago(post.createdAt)}`)}`)
    console.log(post.text)
    console.log(
      dim(`♥ ${post.likeCount}  ⟲ ${post.repostCount}  💬 ${post.replyCount}`),
    )
  }
}

const post = defineCommand({
  meta: { name: "post", description: "Publish a post" },
  args: {
    text: { type: "positional", description: "Post text", required: true },
    image: { type: "string", description: "Path to an image to attach" },
    alt: { type: "string", description: "Alt text for the image" },
    "reply-to": { type: "string", description: "URL of a post to reply to" },
    quote: { type: "string", description: "URL of a post to quote" },
    lang: { type: "string", description: "Language code (e.g. en)" },
    yes: {
      type: "boolean",
      description: "Accepted for compatibility",
      default: false,
    },
  },
  run: async ({ args }) => {
    try {
      const { uri } = await createPost(args.text, {
        image: args.image,
        alt: args.alt,
        replyTo: args["reply-to"],
        quote: args.quote,
        lang: args.lang,
      })
      await printPosted(uri)
    } catch (error) {
      fail(error)
    }
  },
})

const thread = defineCommand({
  meta: {
    name: "thread",
    description: "Publish a self-thread (one arg per post)",
  },
  run: async ({ args }) => {
    const texts = (args._ as string[]).filter(Boolean)
    if (texts.length < 2)
      fail(new Error('Usage: bsky thread "post 1" "post 2" …'))
    try {
      const results = await createThread(texts)
      console.log(`✓ Posted a ${results.length}-post thread`)
      await printPosted(results[0]!.uri)
    } catch (error) {
      fail(error)
    }
  },
})

const reply = defineCommand({
  meta: { name: "reply", description: "Reply to a post" },
  args: {
    url: {
      type: "positional",
      description: "URL of the post to reply to",
      required: true,
    },
    text: { type: "positional", description: "Reply text", required: true },
  },
  run: async ({ args }) => {
    try {
      const { uri } = await createPost(args.text, { replyTo: args.url })
      await printPosted(uri)
    } catch (error) {
      fail(error)
    }
  },
})

const quote = defineCommand({
  meta: { name: "quote", description: "Quote-post a post" },
  args: {
    url: {
      type: "positional",
      description: "URL of the post to quote",
      required: true,
    },
    text: { type: "positional", description: "Your text", required: true },
  },
  run: async ({ args }) => {
    try {
      const { uri } = await createPost(args.text, { quote: args.url })
      await printPosted(uri)
    } catch (error) {
      fail(error)
    }
  },
})

const del = defineCommand({
  meta: {
    name: "delete",
    description: "Delete one of your posts (URL or rkey)",
  },
  args: {
    target: {
      type: "positional",
      description: "Post URL or rkey",
      required: true,
    },
  },
  run: async ({ args }) => {
    try {
      await deletePost(args.target)
      console.log("✓ Deleted")
    } catch (error) {
      fail(error)
    }
  },
})

const list = defineCommand({
  meta: { name: "list", description: "List your recent posts" },
  args: { limit: { type: "string", description: "How many", default: "25" } },
  run: async ({ args }) => {
    try {
      const posts = await listMyPosts(Number(args.limit))
      const { handle } = await getSession()
      for (const p of posts) {
        console.log(
          `\n${dim(ago(p.createdAt).padStart(3))}  ${p.text.replace(/\n/g, " ")}`,
        )
        console.log(`     ${cyan(postWebUrl(handle, p.rkey))}`)
      }
    } catch (error) {
      fail(error)
    }
  },
})

const action = (
  name: string,
  description: string,
  argName: "url" | "handle",
  fn: (value: string) => Promise<void>,
) =>
  defineCommand({
    meta: { name, description },
    args: {
      [argName]: { type: "positional", description: argName, required: true },
    },
    run: async ({ args }) => {
      try {
        await fn((args as Record<string, string>)[argName]!)
        console.log(`✓ ${name}`)
      } catch (error) {
        fail(error)
      }
    },
  })

const timeline = defineCommand({
  meta: { name: "timeline", description: "Show your home timeline" },
  args: { limit: { type: "string", description: "How many", default: "25" } },
  run: async ({ args }) => {
    try {
      showFeed(await getTimeline(Number(args.limit)))
    } catch (error) {
      fail(error)
    }
  },
})

const notifications = defineCommand({
  meta: { name: "notifications", description: "Show your notifications" },
  args: { limit: { type: "string", description: "How many", default: "25" } },
  run: async ({ args }) => {
    try {
      const notes = await getNotifications(Number(args.limit))
      for (const n of notes) {
        const dot = n.isRead ? " " : cyan("●")
        const text = n.text
          ? dim(` — ${n.text.replace(/\n/g, " ").slice(0, 60)}`)
          : ""
        console.log(`${dot} ${bold(`@${n.handle}`)} ${n.reason}${text}`)
      }
    } catch (error) {
      fail(error)
    }
  },
})

const profile = defineCommand({
  meta: { name: "profile", description: "Show a profile (defaults to you)" },
  args: {
    actor: { type: "positional", description: "Handle", required: false },
  },
  run: async ({ args }) => {
    try {
      const { handle } = await getSession()
      const p = await getProfile(args.actor ?? handle)
      console.log(`\n${bold(p.displayName ?? p.handle)} ${dim(`@${p.handle}`)}`)
      if (p.description) console.log(p.description)
      console.log(
        dim(
          `${p.followersCount} followers · ${p.followsCount} following · ${p.postsCount} posts`,
        ),
      )
    } catch (error) {
      fail(error)
    }
  },
})

const view = defineCommand({
  meta: { name: "view", description: "View a post and its replies" },
  args: {
    url: { type: "positional", description: "Post URL", required: true },
  },
  run: async ({ args }) => {
    try {
      showFeed(await getThread(args.url))
    } catch (error) {
      fail(error)
    }
  },
})

const search = defineCommand({
  meta: { name: "search", description: "Search posts" },
  args: {
    query: { type: "positional", description: "Search query", required: true },
    limit: { type: "string", description: "How many", default: "25" },
  },
  run: async ({ args }) => {
    try {
      showFeed(await searchPosts(args.query, Number(args.limit)))
    } catch (error) {
      fail(error)
    }
  },
})

export const subCommands = {
  post,
  thread,
  reply,
  quote,
  delete: del,
  list,
  search,
  like: action("like", "Like a post", "url", like),
  unlike: action("unlike", "Remove your like", "url", unlike),
  repost: action("repost", "Repost a post", "url", repost),
  unrepost: action("unrepost", "Remove your repost", "url", unrepost),
  follow: action("follow", "Follow an account", "handle", follow),
  unfollow: action("unfollow", "Unfollow an account", "handle", unfollow),
  timeline,
  notifications,
  profile,
  view,
}
