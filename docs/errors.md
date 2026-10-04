# Errors

Where errors sit in the kit's coverage is [scope.md](scope.md).

Core does not parse an error envelope. Each adapter brings its own parser. The shape below is a target, not a wire format. Nothing in core rejects a payload that looks different.

```ts
type ChaayaError = {
  code: string
  message: string
  retryable?: boolean
  detail?: unknown
}
```

`code` is stable and machine-readable. `message` is a sentence a person can read. `retryable` says whether the same call is worth repeating. `detail` is whatever the adapter still needs to keep.

The type is exported from `@nrynss/chaaya/core` as `ChaayaError`. Using it is optional. `ApiError` stays the client's own failure. A terminal `JobStream` action may carry a `ChaayaError`.

These envelopes map onto it without leftover fields that the caller has to invent:

- `{ error: { code, message, detail } }` puts `code`, `message`, and `detail` on the target. `retryable` stays unset unless the adapter knows.
- RFC 7807 problem details use `type` as `code` and `detail` as `message`. The rest of the document can sit in `detail`.
- A `thiserror`-style `{ error, kind }` uses `kind` as `code` and `error` as `message`.

Agree on this shape at the adapter boundary so callers do not learn a new failure object for every backend.

## Form actions

`ApiError` is what `api()` throws. `@nrynss/chaaya/sveltekit` hands that object to SvelteKit. `failFromApiError()` returns `fail()`. `errorFromApiError()` throws `error()`. `toActionData()` is the shared data: `code`, `message`, `detail`, and, when present, `retryAfterSeconds`. `code` is unchanged. The module does not import an adapter. A caller passes an `ApiError`, or a response body plus the app's `parseError`. The copy-paste is in [form-actions.md](form-actions.md).
