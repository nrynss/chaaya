# Domain events as Keel job progress

Book generation and the interview can be reshaped onto Keel `job.Progress` so `@nrynss/chaaya/job` `JobStream` follows them. A generic named-event client is the other way to keep the old event names. This note is the remap.

`job.Progress` is `stage`, `current`, `total`, and `detail`. Chaaya already parses those on a `progress` frame (`ProgressEvent.detail` is the app's object). A terminal frame is only `done`, `error`, `cancelled`, or `interrupted`. It does not carry `pdf_url`, goodbye text, or a page image. Publish that payload as `detail` on the last progress frame, then let the runner emit the terminal frame.

The helpers in `domain.ts` return the frames to publish and the status after them. They do not open a socket.

## Book

Stages, in order: `structuring`, `illustrating`, `narrating`, `binding`, `filming`. `current`/`total` for a stage event is that stage's place out of 5.

| Old event | Progress | Then |
| --- | --- | --- |
| `stage {"stage":"narrating"}` | `stage: narrating`, `current: 3`, `total: 5`, `detail.event: stage` | keep running |
| `page_approved {"n":3,"image_url":"/media/<id>"}` | `stage: illustrating`, `current: 3`, `total: <page count>`, `detail` keeps `n`, `image_url`, plus `stage_current: 2` and `stage_total: 5` | keep running |
| `narration_unavailable {}` | `stage: narrating`, `current: 3`, `total: 5`, `detail.event: narration_unavailable` | keep running. The film is captioned and silent. |
| `book_ready {"pdf_url","video_url"}` | `stage: filming`, `current: 5`, `total: 5`, `detail` keeps both URLs | `done` |
| `failed {}` | no progress frame | `error` with code `failed` |

While illustrating, `current`/`total` count pages, because that is the number the page screen shows. `detail.stage_current` is still 2 of 5 if a view needs the phase.

Thutapi stories use 8 pages and these five stage names. The helpers take the page count from the caller.

## Interview

| Old event | Progress | Then |
| --- | --- | --- |
| `question` with `turn`, `text`, `chips`, `filled`, `exchanges` | `stage: question`, `current: filled.length`, `total: <checklist size>`, `detail` keeps those fields | keep running |
| `question_audio {"turn","audio_url"}` | `stage: question_audio`, `detail` keeps `turn` and `audio_url`. Pass the checklist counts to leave `current`/`total` where the question put them. | keep running |
| `ended {"reason","text","filled"}` | `stage: ended`, `detail` keeps the goodbye | `done` |
| `error {"error":"internal"}` | no progress frame | `error` with code `internal` |

Thutapi's checklist has 6 slots. The helpers take that size from the caller.

Subscribe with `JobStream` first, then read the job, the same way a job client already catches up. The domain payload for a reload is the last progress `detail` the store kept, not a second event vocabulary.
