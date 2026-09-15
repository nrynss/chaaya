# Chaaya

> **Chaaya** (ഛായ) — likeness, shade.

A Svelte 5 kit of behaviour, not looks. Each app that uses it keeps its own
visual identity; Chaaya supplies the parts that are hard to get right and the
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

## Status

Pre-release.

## License

Apache-2.0. See [LICENSE](LICENSE).
