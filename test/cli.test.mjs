import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const bin = fileURLToPath(new URL("../dist/index.js", import.meta.url))

test("built cli prints help and exits 0", () => {
  const result = spawnSync(process.execPath, [bin, "--help"], {
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
  assert.ok(result.stdout.trim().length > 0)
})
