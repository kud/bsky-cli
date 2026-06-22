import { Box, render, Text, useApp, useInput } from "ink"
import { Spinner } from "@inkjs/ui"
import { useCallback, useEffect, useState } from "react"
import {
  createPost,
  getNotifications,
  getProfile,
  getSession,
  getThread,
  getTimeline,
  like,
  repost,
  type FeedPost,
  type Notification,
  type Profile,
} from "../api/index.js"

const ESC = String.fromCharCode(27)
const ALT_ENTER = `${ESC}[?1049h${ESC}[H`
const ALT_EXIT = `${ESC}[?1049l`

// Nerd Font (Font Awesome) glyphs — by codepoint, never raw bytes.
const ICON_REPLY = String.fromCodePoint(0xf075)
const ICON_REPOST = String.fromCodePoint(0xf079)
const ICON_LIKE = String.fromCodePoint(0xf004)
const ICON_HOME = String.fromCodePoint(0xf015)
const ICON_BELL = String.fromCodePoint(0xf0f3)
const ICON_USER = String.fromCodePoint(0xf007)
const ICON_PENCIL = String.fromCodePoint(0xf040)
const ICON_REFRESH = String.fromCodePoint(0xf021)
const ICON_QUIT = String.fromCodePoint(0xf08b)

const CARD_LINES = 5 // header + 2 text + counts + gap

type View = "home" | "notifications" | "profile" | "compose" | "thread"
type Focus = "sidebar" | "feed"

const TITLES: Record<View, string> = {
  home: "Home",
  notifications: "Notifications",
  profile: "Profile",
  compose: "Compose",
  thread: "Thread",
}

type Item =
  | { label: string; icon: string; kind: "view"; view: View }
  | { label: string; icon: string; kind: "compose" | "refresh" | "quit" }

const ITEMS: Item[] = [
  { label: "Home", icon: ICON_HOME, kind: "view", view: "home" },
  {
    label: "Notifications",
    icon: ICON_BELL,
    kind: "view",
    view: "notifications",
  },
  { label: "Profile", icon: ICON_USER, kind: "view", view: "profile" },
  { label: "New post", icon: ICON_PENCIL, kind: "compose" },
  { label: "Refresh", icon: ICON_REFRESH, kind: "refresh" },
  { label: "Quit", icon: ICON_QUIT, kind: "quit" },
]

const useTermSize = () => {
  const [size, setSize] = useState({
    rows: process.stdout.rows ?? 24,
    cols: process.stdout.columns ?? 80,
  })
  useEffect(() => {
    const onResize = () =>
      setSize({
        rows: process.stdout.rows ?? 24,
        cols: process.stdout.columns ?? 80,
      })
    process.stdout.on("resize", onResize)
    return () => {
      process.stdout.off("resize", onResize)
    }
  }, [])
  return size
}

const ago = (iso: string): string => {
  const s = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  )
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

// Split into exactly two display lines; each is rendered with wrap="truncate"
// so a card's height is always deterministic and the counts sit at the bottom.
const twoLineSplit = (text: string, cols: number): [string, string] => {
  const width = Math.max(20, cols - 32)
  const chars = [...text.replace(/\s+/g, " ").trim()]
  if (chars.length <= width) return [chars.join(""), ""]
  const head = chars.slice(0, width).join("")
  const space = head.lastIndexOf(" ")
  const cut = space > width * 0.6 ? space : width
  const line1 = chars.slice(0, cut).join("").trimEnd()
  const rest = [...chars.slice(cut).join("").trimStart()]
  const line2 =
    rest.length > width
      ? `${rest.slice(0, width - 1).join("")}…`
      : rest.join("")
  return [line1, line2]
}

const Sidebar = ({
  view,
  focus,
  navIndex,
  handle,
  rows,
}: {
  view: View
  focus: Focus
  navIndex: number
  handle: string
  rows: number
}) => (
  <Box
    flexDirection="column"
    width={26}
    height={rows}
    borderStyle="round"
    borderColor={focus === "sidebar" ? "cyanBright" : "gray"}
    paddingX={1}
  >
    <Text color="cyanBright" bold>
      bsky
    </Text>
    <Box flexDirection="column" marginTop={1} flexGrow={1}>
      {ITEMS.map((item, i) => {
        const cursor = focus === "sidebar" && navIndex === i
        const isView = item.kind === "view" && item.view === view
        const color = cursor ? "cyanBright" : isView ? "blueBright" : "white"
        return (
          <Box key={item.label} marginTop={item.kind === "compose" ? 1 : 0}>
            <Text color={color} bold={cursor || isView}>
              {cursor ? "▎ " : "  "}
              {item.icon} {item.label}
            </Text>
          </Box>
        )
      })}
    </Box>
    <Text color="magentaBright">@{handle}</Text>
  </Box>
)

const PostCard = ({
  post,
  active,
  cols,
}: {
  post: FeedPost
  active: boolean
  cols: number
}) => {
  const [line1, line2] = twoLineSplit(post.text, cols)
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text wrap="truncate">
        <Text color="cyanBright" bold>
          {active ? "▎ " : "  "}
        </Text>
        <Text color={active ? "cyanBright" : "whiteBright"} bold>
          {post.displayName ?? post.handle}
        </Text>{" "}
        <Text color="blueBright">@{post.handle}</Text>
        <Text color="gray"> · {ago(post.createdAt)}</Text>
      </Text>
      <Text wrap="truncate" color="white">{`  ${line1}`}</Text>
      <Text wrap="truncate" color="white">
        {line2 ? `  ${line2}` : " "}
      </Text>
      <Text>
        <Text color="cyan">{`  ${ICON_REPLY} ${post.replyCount}`}</Text>
        <Text color="greenBright">{`    ${ICON_REPOST} ${post.repostCount}`}</Text>
        <Text color="redBright">{`    ${ICON_LIKE} ${post.likeCount}`}</Text>
      </Text>
    </Box>
  )
}

const Compose = ({
  replyTo,
  onClose,
}: {
  replyTo?: { uri: string; handle: string }
  onClose: () => void
}) => {
  const [text, setText] = useState("")
  const [status, setStatus] = useState<"edit" | "posting" | "done" | "error">(
    "edit",
  )
  const [error, setError] = useState("")
  const count = [...text].length

  const submit = () => {
    if (!text.trim() || count > 300) return
    setStatus("posting")
    createPost(text, replyTo ? { replyTo: replyTo.uri } : {})
      .then(() => setStatus("done"))
      .catch((e: Error) => {
        setError(e.message)
        setStatus("error")
      })
  }

  useInput((input, key) => {
    if (status === "posting") return
    if (status !== "edit") return onClose()
    if (key.escape) return onClose()
    if (key.return) {
      if (key.shift) return submit()
      return setText((t) => `${t}\n`)
    }
    if (key.ctrl && (input === "d" || key.return)) return submit()
    if (key.backspace || key.delete)
      return setText((t) => [...t].slice(0, -1).join(""))
    if (input && !key.ctrl && !key.meta) setText((t) => t + input)
  })

  if (status === "posting") return <Spinner label="Posting…" />
  if (status === "done")
    return <Text color="greenBright">Posted — press any key</Text>
  if (status === "error")
    return <Text color="redBright">{error} — press any key</Text>

  return (
    <Box flexDirection="column">
      <Text color="whiteBright">
        {replyTo ? `Replying to @${replyTo.handle}` : "What's up?"}
      </Text>
      <Box
        borderStyle="round"
        borderColor="cyanBright"
        paddingX={1}
        marginY={1}
        minHeight={5}
      >
        <Text color="white">
          {text}
          <Text inverse> </Text>
        </Text>
      </Box>
      <Text>
        <Text
          color={count > 300 ? "redBright" : "gray"}
        >{`${count}/300    `}</Text>
        <Text color="whiteBright" bold>
          Shift+Enter
        </Text>
        <Text color="gray"> post </Text>
        <Text color="whiteBright" bold>
          Enter
        </Text>
        <Text color="gray"> newline </Text>
        <Text color="whiteBright" bold>
          Esc
        </Text>
        <Text color="gray"> cancel</Text>
      </Text>
    </Box>
  )
}

const Notifications = () => {
  const [notes, setNotes] = useState<Notification[] | null>(null)
  useEffect(() => {
    getNotifications(30).then(setNotes)
  }, [])
  if (!notes) return <Spinner label="Loading notifications…" />
  return (
    <Box flexDirection="column">
      {notes.map((n, i) => (
        <Text key={i} color="white">
          {n.isRead ? "  " : <Text color="cyanBright">● </Text>}
          <Text color="whiteBright" bold>
            @{n.handle}
          </Text>{" "}
          <Text color="magentaBright">{n.reason}</Text>
          {n.text ? (
            <Text color="gray">{` — ${n.text.replace(/\s+/g, " ").slice(0, 60)}`}</Text>
          ) : null}
        </Text>
      ))}
    </Box>
  )
}

const ProfileView = ({ actor }: { actor: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    getProfile(actor).then(setProfile)
  }, [actor])
  if (!profile) return <Spinner label="Loading profile…" />
  return (
    <Box flexDirection="column">
      <Text color="whiteBright" bold>
        {profile.displayName ?? profile.handle}
      </Text>
      <Text color="blueBright">@{profile.handle}</Text>
      {profile.description ? (
        <Text color="white">{profile.description}</Text>
      ) : null}
      <Box marginTop={1}>
        <Text color="gray">
          <Text color="cyanBright">{profile.followersCount}</Text> followers ·{" "}
          <Text color="cyanBright">{profile.followsCount}</Text> following ·{" "}
          <Text color="cyanBright">{profile.postsCount}</Text> posts
        </Text>
      </Box>
    </Box>
  )
}

const Thread = ({ url, cols }: { url: string; cols: number }) => {
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  useEffect(() => {
    getThread(url).then(setPosts)
  }, [url])
  if (!posts) return <Spinner label="Loading thread…" />
  return (
    <Box flexDirection="column">
      {posts.map((post, i) => (
        <PostCard key={post.uri} post={post} active={i === 0} cols={cols} />
      ))}
    </Box>
  )
}

const Hint = ({ k, label }: { k: string; label: string }) => (
  <Text>
    <Text color="whiteBright" bold>
      {k}
    </Text>
    <Text color="gray">{` ${label}    `}</Text>
  </Text>
)

const App = ({ handle }: { handle: string }) => {
  const { exit } = useApp()
  const { rows, cols } = useTermSize()
  const [view, setView] = useState<View>("home")
  const [focus, setFocus] = useState<Focus>("sidebar")
  const [navIndex, setNavIndex] = useState(0)
  const [feed, setFeed] = useState<FeedPost[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [offset, setOffset] = useState(0)
  const [flash, setFlash] = useState("")
  const [replyTo, setReplyTo] = useState<
    { uri: string; handle: string } | undefined
  >()
  const [threadUrl, setThreadUrl] = useState("")
  const [nonce, setNonce] = useState(0)

  const loadFeed = useCallback(() => {
    getTimeline(50).then((posts) => {
      setFeed(posts)
      setSelected(0)
      setOffset(0)
    })
  }, [])
  useEffect(loadFeed, [loadFeed])

  const refresh = () => {
    setFlash("")
    setNonce((n) => n + 1)
    if (view === "home") loadFeed()
  }

  const visible = Math.max(1, Math.floor((rows - 6) / CARD_LINES))
  useEffect(() => {
    if (selected < offset) setOffset(selected)
    else if (selected >= offset + visible) setOffset(selected - visible + 1)
  }, [selected, offset, visible])

  const windowPosts = feed ? feed.slice(offset, offset + visible) : []
  const current = feed?.[selected]

  const activate = (item: Item) => {
    if (item.kind === "view") {
      setView(item.view)
      if (item.view === "home") {
        setSelected(0)
        setOffset(0)
      }
      setFocus("feed")
    } else if (item.kind === "compose") setView("compose")
    else if (item.kind === "refresh") refresh()
    else exit()
  }

  useInput((input, key) => {
    if (view === "compose") return
    if (view === "thread") {
      if (input === "q") return exit()
      if (key.escape || key.leftArrow) {
        setView("home")
        setFocus("feed")
      }
      return
    }
    if (input === "q") return exit()
    if (key.leftArrow) return setFocus("sidebar")
    if (key.rightArrow) {
      setFocus("feed")
      setSelected(0)
      setOffset(0)
      return
    }

    if (focus === "sidebar") {
      if (key.upArrow) setNavIndex((i) => Math.max(0, i - 1))
      if (key.downArrow) setNavIndex((i) => Math.min(ITEMS.length - 1, i + 1))
      if (key.return) activate(ITEMS[navIndex]!)
      return
    }

    if (view === "home" && feed) {
      if (key.upArrow) setSelected((i) => Math.max(0, i - 1))
      if (key.downArrow) setSelected((i) => Math.min(feed.length - 1, i + 1))
      if (key.return && current) {
        setThreadUrl(current.uri)
        setView("thread")
      }
      if (input === "l" && current)
        like(current.uri).then(() => setFlash("♥ liked"))
      if (input === "r" && current)
        repost(current.uri).then(() => setFlash("⟲ reposted"))
      if (input === "c" && current) {
        setReplyTo({ uri: current.uri, handle: current.handle })
        setView("compose")
      }
    }
  })

  const closeCompose = () => {
    setReplyTo(undefined)
    setView("home")
    setFocus("feed")
    loadFeed()
  }

  return (
    <Box height={rows} flexDirection="row">
      <Sidebar
        view={view}
        focus={focus}
        navIndex={navIndex}
        handle={handle}
        rows={rows}
      />
      <Box
        flexDirection="column"
        flexGrow={1}
        height={rows}
        borderStyle="round"
        borderColor={focus === "feed" ? "cyanBright" : "gray"}
        paddingX={1}
      >
        <Text color="cyanBright" bold>
          {TITLES[view]}
          {flash ? <Text color="greenBright">{`    ${flash}`}</Text> : null}
        </Text>
        <Box
          flexDirection="column"
          flexGrow={1}
          marginTop={1}
          overflow="hidden"
        >
          {view === "compose" ? (
            <Compose replyTo={replyTo} onClose={closeCompose} />
          ) : view === "notifications" ? (
            <Notifications key={nonce} />
          ) : view === "profile" ? (
            <ProfileView key={nonce} actor={handle} />
          ) : view === "thread" ? (
            <Thread url={threadUrl} cols={cols} />
          ) : !feed ? (
            <Spinner label="Loading your timeline…" />
          ) : (
            windowPosts.map((post, i) => (
              <PostCard
                key={post.uri}
                post={post}
                active={focus === "feed" && offset + i === selected}
                cols={cols}
              />
            ))
          )}
        </Box>
        <Text>
          {focus === "sidebar" ? (
            <>
              <Hint k="↑/↓" label="select" />
              <Hint k="Enter" label="open" />
              <Hint k="→" label="feed" />
              <Hint k="q" label="quit" />
            </>
          ) : view === "home" ? (
            <>
              <Hint k="↑/↓" label="move" />
              <Hint k="Enter" label="thread" />
              <Hint k="l" label="like" />
              <Hint k="r" label="repost" />
              <Hint k="c" label="reply" />
              <Hint k="←" label="menu" />
            </>
          ) : (
            <>
              <Hint k="←" label="back" />
              <Hint k="q" label="quit" />
            </>
          )}
        </Text>
      </Box>
    </Box>
  )
}

export const launchTui = async (): Promise<void> => {
  const { handle } = await getSession()
  process.stdout.write(ALT_ENTER)
  const restore = () => process.stdout.write(ALT_EXIT)
  process.on("exit", restore)
  try {
    const { waitUntilExit } = render(<App handle={handle} />)
    await waitUntilExit()
  } finally {
    process.off("exit", restore)
    restore()
  }
}
