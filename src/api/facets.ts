import { resolveHandle } from "./resolve.js"

type LinkFeature = { $type: "app.bsky.richtext.facet#link"; uri: string }
type TagFeature = { $type: "app.bsky.richtext.facet#tag"; tag: string }
type MentionFeature = { $type: "app.bsky.richtext.facet#mention"; did: string }

export type Facet = {
  index: { byteStart: number; byteEnd: number }
  features: Array<LinkFeature | TagFeature | MentionFeature>
}

const byteLen = (text: string) => Buffer.byteLength(text, "utf8")
const span = (text: string, index: number, match: string) => {
  const byteStart = byteLen(text.slice(0, index))
  return { byteStart, byteEnd: byteStart + byteLen(match) }
}

export const extractFacets = async (text: string): Promise<Facet[]> => {
  const facets: Facet[] = []
  let match: RegExpExecArray | null

  const urlRegex =
    /(?:https?:\/\/[^\s]+|(?<![/\w])[\w][\w.-]*\.(?:com|io|org|net|dev|app|sh|co|uk|fr|de|me|ai|tech|info|biz|cc)(?:\/[^\s]*)?)/g
  while ((match = urlRegex.exec(text)) !== null) {
    const uri = match[0].startsWith("http") ? match[0] : `https://${match[0]}`
    facets.push({
      index: span(text, match.index, match[0]),
      features: [{ $type: "app.bsky.richtext.facet#link", uri }],
    })
  }

  const tagRegex = /(?<![&\w])#(\w+)/g
  while ((match = tagRegex.exec(text)) !== null) {
    facets.push({
      index: span(text, match.index, match[0]),
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: match[1]! }],
    })
  }

  const mentionRegex = /(?<![\w@])@([a-zA-Z0-9._-]+\.[a-zA-Z]+)/g
  const mentions: Array<{ index: Facet["index"]; handle: string }> = []
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      index: span(text, match.index, match[0]),
      handle: match[1]!,
    })
  }
  for (const mention of mentions) {
    try {
      const did = await resolveHandle(mention.handle)
      facets.push({
        index: mention.index,
        features: [{ $type: "app.bsky.richtext.facet#mention", did }],
      })
    } catch {
      // unresolvable handle — leave as plain text
    }
  }

  return facets
}
