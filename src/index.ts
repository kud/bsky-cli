import { defineCommand, runMain } from "citty"
import { subCommands } from "./commands.js"

const main = defineCommand({
  meta: {
    name: "bsky",
    description:
      "A Bluesky client for your terminal — post, thread, reply, browse, and manage",
  },
  subCommands,
  run: async ({ args }) => {
    if ((args._ as string[]).length === 0) {
      const { launchTui } = await import("./tui/app.js")
      await launchTui()
    }
  },
})

runMain(main)
