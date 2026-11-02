import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every consultation is a voice call. The public pages must not offer chat or video consultations again. Staff screens
 * and the old request system's names and prices, which label requests made before the change, are left out.
 */
const STAFF = /Admin|RequestManage|RequestParts|\.test\./
const files = ['src/pages', 'src/components', 'src/components/scene', 'src/config', 'src/data']
  .flatMap((dir) => readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !STAFF.test(f)).map((f) => join(dir, f)))
  .filter((f) => !/consultationModes\.ts$|config\/pricing\.ts$/.test(f))
  .concat('index.html')

describe('voice calls only', () => {
  it.each(files)('%s offers no chat or video consultation', (file) => {
    const text = readFileSync(file, 'utf8')
    expect(text).not.toMatch(/\bvideo\b|chat, voice|chat or voice/i)
  })
})
