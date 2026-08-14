import { describe, it } from 'node:test'

import * as assert from 'remix/assert'

import { mergePlayhead, sameTrackAudioAction, streamHref } from '../app/assets/player.tsx'

describe('player audio sync', () => {
  it('does not reload the stream when only the playhead persists', () => {
    assert.equal(
      sameTrackAudioAction(
        { trackId: 'airbag', playing: true, playheadMs: 5_000 },
        { trackId: 'airbag', playing: true, playheadMs: 5_200 },
      ),
      'none',
    )
    assert.equal(streamHref('/media/tracks/airbag#t=5'), '/media/tracks/airbag')
  })

  it('applies play and pause on the current Track without treating it as a Track change', () => {
    assert.equal(
      sameTrackAudioAction(
        { trackId: 'airbag', playing: true, playheadMs: 5_000 },
        { trackId: 'airbag', playing: false, playheadMs: 5_000 },
      ),
      'transport',
    )
    assert.equal(
      sameTrackAudioAction(
        { trackId: 'airbag', playing: false, playheadMs: 5_000 },
        { trackId: 'airbag', playing: true, playheadMs: 5_000 },
      ),
      'transport',
    )
  })

  it('does not roll the live playhead back to a stale persisted position', () => {
    assert.equal(mergePlayhead(38_000, 37_000, 'none'), 38_000)
    assert.equal(mergePlayhead(38_000, 37_000, 'transport'), 38_000)
    assert.equal(mergePlayhead(0, 90_000, 'load'), 90_000)
  })

  it('loads audio when the current Track changes', () => {
    assert.equal(
      sameTrackAudioAction(
        { trackId: 'airbag', playing: true, playheadMs: 5_000 },
        { trackId: 'hey-you', playing: true, playheadMs: 0 },
      ),
      'load',
    )
  })
})
