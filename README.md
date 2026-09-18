# Chaaya

> **Chaaya** (ഛായ): likeness, shade.

A Svelte 5 kit of behaviour, not looks. Each app that uses it keeps its own
visual identity. Chaaya supplies the parts that are hard to get right and the
same in every app.

## Scope

- **Theme tokens.** A fixed set of role names and the three-state theme
  mechanism (system, forced light, forced dark). Each app supplies its own
  values.
- **Audio.** Microphone capture and playback with seeking.
- **Job progress.** A client for the server-sent events that Keel's `stream`
  and `job` packages publish.
- **API client.** One error envelope, branched on stable codes.

Accessible primitives such as dialogs and tooltips come from
[Bits UI](https://bits-ui.com), not from this package.

Published as `@nrynss/chaaya`.

## Exports

- `@nrynss/chaaya`: the package name.
- `@nrynss/chaaya/tokens`: the fixed role names and a checker that reports a
  role a theme block leaves out.
- `@nrynss/chaaya/tokens/reference.css`: the reference stylesheet a new app
  copies.
- `@nrynss/chaaya/wire`: the error envelope and job event types, with a parser
  for each that returns a typed failure instead of throwing.
- `@nrynss/chaaya/theme`: the three-state theme mechanism and the head
  script that paints the stored mode before first paint.
- `@nrynss/chaaya/api`: the fetch client that turns a failed response into
  a typed error branched on a stable code.
- `@nrynss/chaaya/job`: the job stream client that follows a job's events to
  its end and stops at the first terminal event. It also carries the
  JobFollower ordering rules, the isTerminalStatus check, and the JobReport
  union one accepted event belongs to.
- `@nrynss/chaaya/audio`: microphone capture in compressed and PCM modes,
  chunked upload that survives a network drop and a reload, playback through
  one element unlocked by the first gesture, the PcmStreamPlayer for arriving
  blocks, and live levels and waveform peaks. Capture adds the resampleLinear
  and resampleChunks rate conversion and the encodeWav file writer. Upload
  adds the beginBody and completeBody builders, the uploadPath, chunkPath and
  completePath route builders, and the parseUploadSnapshot and
  parseUploadReceipt readers. It also carries the sha256Hex digest and
  ChunkBuffer splitter, the retryDelayMs backoff and isRetryableStatus check,
  and the refusal and toUploadFailure error mapping.
- `@nrynss/chaaya/guard`: the SessionGuard that closes one live session
  exactly once when its page goes away.
- `@nrynss/chaaya/transcript`: timed words, the TranscriptEditor that cuts and
  reverts ranges over them, the mapping between the source and edited
  timelines, the waveform regions derived from the cuts, and the
  TranscriptFollower that binds the words to playback.
- `@nrynss/chaaya/testing`: a contrast gate and an accessibility gate a
  consumer points at its own stylesheet and container.

## Docs

The routes under `/docs` show each export with a working example. Every page
is styled only by the reference stylesheet, so the behaviour shows without
suggesting a look.

- [tokens](/docs/tokens): the fixed role names and a checker that reports a
  role a theme block leaves out.
- [theme](/docs/theme): the three-state theme mechanism and the head script
  that paints the stored mode before first paint.
- [wire](/docs/wire): the error envelope and job event types, with a parser
  for each that returns a typed failure instead of throwing.
- [api](/docs/api): the fetch client that turns a failed response into a
  typed error branched on a stable code.
- [job](/docs/job): the job stream client that follows a job's events to its
  end and stops at the first terminal event.
- [audio capture](/docs/audio-capture): microphone capture in compressed and
  PCM modes, recorded from a generated signal.
- [audio upload](/docs/audio-upload): chunked upload that survives a network
  drop and a reload, streamed to the route beside the page.
- [audio playback](/docs/audio-playback): playback through one element
  unlocked by the first gesture, with seeking.
- [audio stream](/docs/audio-stream): the PcmStreamPlayer that schedules
  arriving blocks gaplessly on a supplied context, with a flush that cuts
  cleanly.
- [audio levels](/docs/audio-levels): live levels read from a generated tone.
- [audio peaks](/docs/audio-peaks): waveform peaks computed directly and in
  a worker, with agreement between the two.
- [session guard](/docs/session-guard): the guard that closes one live
  session exactly once when its page goes away.
- [transcript](/docs/transcript): timed words, the editor that cuts and
  reverts ranges, the regions drawn from the cuts, and the follower that
  binds the words to playback.
- [testing](/docs/testing): the contrast gate and the accessibility gate run
  against the page itself.

## Status

Pre-release.

## License

Apache-2.0. See [LICENSE](LICENSE).
