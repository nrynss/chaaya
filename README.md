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
  its end and stops at the first terminal event.
- `@nrynss/chaaya/audio`: microphone capture in compressed and PCM modes,
  chunked upload that survives a network drop and a reload, playback through
  one element unlocked by the first gesture, and live levels and waveform
  peaks.
- `@nrynss/chaaya/testing`: a contrast gate and an accessibility gate a
  consumer points at its own stylesheet and container.

## Status

Pre-release.

## License

Apache-2.0. See [LICENSE](LICENSE).
