# Transcript stream

`createTranscriptBridge` turns a generic timed-word stream into the
`TranscriptWord` array `TranscriptEditor` is constructed with. It does not
import Keel or the editor. Event names are the caller's.

A frame this bridge understands is one of:

- a comment (`kind: "comment"`), ignored
- the `doneEvent` name, which marks the list finished and ignores the payload
- one JSON word: `{ "start", "end", "text", "speaker"? , "index"? }`
- a JSON array of those words, or `{ "words": [ ... ] }`, which replaces the list

An empty snapshot (`[]` or `{ "words": [] }`) is still a snapshot. It replaces the list with nothing, which clears words already applied.

`start` and `end` are finite source seconds with `end >= start`. `text` is a
string. An `index` replaces that word, or appends when it equals the length.
A gap, a backwards span, or a payload that claims to be a word and fails a
field returns `invalid` and leaves the list alone. A payload that is not a
word at all, such as `{ "percent": 1 }`, is `ignore`.

`events` limits which names are read. Omit it to accept every named event.
`doneEvent` still matches when it is absent from `events`. That is deliberate,
and it is not how `createEventStream` works. The stream drops a frame whose
name is missing from its own `events` list before `terminal` can see it. Put
the done name in both places when the socket should close:

```ts
import { createEventStream } from "@nrynss/chaaya/sse"
import { TranscriptEditor, createTranscriptBridge } from "@nrynss/chaaya/transcript"

const bridge = createTranscriptBridge({
  events: ["word"],
  doneEvent: "done",
})

let editor: TranscriptEditor | undefined

const stream = createEventStream("/transcript/events", {
  events: ["word", "done"],
  terminal: ["done"],
  onFrame(event) {
    const applied = bridge.apply(event)
    if (applied.type === "done") {
      editor = new TranscriptEditor(bridge.ordered())
      stream.close()
    }
  },
})
```

`ordered()` returns a copy sorted by start, then end, then arrival. The stored
list stays in arrival order.

## The editor stays fixed

`TranscriptEditor` does not grow. Cuts are indexes into the word list it was
given. This bridge does not add a setter. Construct the editor when `done` is
set, or from a snapshot that will not shift earlier indexes. Appending at the
end does not move earlier indexes. A snapshot can, and any cuts made against
the previous list would point at the wrong words.

Partial hypotheses are just words. Filter them in `parse` if the server marks
them. `parse` may return one word, a list, or null. A throw is `invalid`.

There is no Keel transcript event in here. A backend that uses other field
names passes `parse` and keeps those names at the edge.
