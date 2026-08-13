import { describe, it } from 'node:test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as assert from 'remix/assert'

import type { Track } from '../app/modules/library/index.ts'
import { resolveSource } from '../app/modules/media/index.ts'

const FIXTURE_LIBRARY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'library',
)

describe('stream-source original-file adapter', () => {
  it('resolves a fixture Track to the original file under LIBRARY_ROOT with MIME from the index', () => {
    let track = fakeTrack({
      path: 'Radiohead/OK Computer/01 - Airbag.mp3',
      mime: 'audio/mpeg',
    })

    let source = resolveSource(track, FIXTURE_LIBRARY)
    assert.ok(source)
    assert.equal(source.mime, 'audio/mpeg')
    assert.equal(
      source.absolutePath,
      path.resolve(FIXTURE_LIBRARY, 'Radiohead', 'OK Computer', '01 - Airbag.mp3'),
    )
  })

  it('refuses a path that escapes LIBRARY_ROOT', () => {
    assert.equal(
      resolveSource(fakeTrack({ path: '../secret.mp3', mime: 'audio/mpeg' }), FIXTURE_LIBRARY),
      null,
    )
    assert.equal(
      resolveSource(
        fakeTrack({ path: 'Radiohead/../../../secret.mp3', mime: 'audio/mpeg' }),
        FIXTURE_LIBRARY,
      ),
      null,
    )
  })

  it('keeps a basename that starts with .. inside LIBRARY_ROOT', () => {
    let source = resolveSource(
      fakeTrack({ path: '..hidden.mp3', mime: 'audio/mpeg' }),
      FIXTURE_LIBRARY,
    )
    assert.ok(source)
    assert.equal(source.absolutePath, path.resolve(FIXTURE_LIBRARY, '..hidden.mp3'))
  })
})

function fakeTrack(input: { path: string; mime: string }): Track {
  return {
    id: 'track-1',
    path: input.path,
    title: 'Airbag',
    artist: 'Radiohead',
    album: 'OK Computer',
    albumArtist: 'Radiohead',
    discNumber: null,
    trackNumber: 1,
    durationMs: null,
    mime: input.mime,
    mtimeMs: 0,
    size: 0,
  }
}
