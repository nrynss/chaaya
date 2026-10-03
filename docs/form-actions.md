# Form actions

The export is `@nrynss/chaaya/sveltekit`. It turns an `ApiError` into the value SvelteKit's `fail()` returns and the value `error()` throws. The `code` on that value is the `ApiError` code. A page and a client branch on the same string.

This module imports no adapter. Pass an `ApiError`, or pass a response body with the app's `parseError`. Keel's parser stays on `@nrynss/chaaya/keel`. There is no component and no CSS.

## From an ApiError

```ts
import { ApiError, api, type ApiErrorParser } from "@nrynss/chaaya/api"
import { failFromApiError } from "@nrynss/chaaya/sveltekit"

const parseError: ApiErrorParser = (text) => {
  const body = JSON.parse(text) as { code?: string; message?: string }
  if (typeof body.code !== "string" || typeof body.message !== "string") return undefined
  return { code: body.code, message: body.message }
}

export const actions = {
  save: async ({ request }) => {
    const data = await request.formData()
    try {
      await api("/things", {
        method: "POST",
        body: JSON.stringify({ name: data.get("name") }),
        headers: { "content-type": "application/json" },
        parseError,
      })
      return { ok: true }
    } catch (cause) {
      if (cause instanceof ApiError) return failFromApiError(cause)
      throw cause
    }
  },
}
```

A Keel app imports `api` from `@nrynss/chaaya/keel`. That client already parses Keel's envelope, so the `catch` is the same. The helper still does not import Keel.

The page reads `form.code`. It does not import a Chaaya component.

```svelte
<script lang="ts">
  let { form } = $props()
</script>

{#if form?.code}
  <p>{form.message}</p>
{/if}
```

## From a response the action fetched itself

```ts
const response = await fetch("/things", { method: "POST", body })
if (!response.ok) {
  return failFromApiError({
    response,
    text: await response.text(),
    parseError,
  })
}
```

`readApiError` from `@nrynss/chaaya/api` is what `api()` uses on a non-2xx body. The helper calls that same function, so a parser result, a parser throw, and a body with no parser stay `http_error` or the parsed code exactly as the client would.

## error()

Use this from a `load` that should render the error page, or from an action that should not return form data.

```ts
import { ApiError, api } from "@nrynss/chaaya/api"
import { errorFromApiError } from "@nrynss/chaaya/sveltekit"

export const load = async () => {
  try {
    return await api("/things", { parseError })
  } catch (cause) {
    if (cause instanceof ApiError) errorFromApiError(cause)
    throw cause
  }
}
```

`error()` only accepts a status from 400 to 599. `fail()` in this helper uses the same range. The mapping is `actionStatus`:

| ApiError | Status passed to SvelteKit |
| --- | --- |
| status is an integer from 400 to 599 | that status |
| code `timeout` and any other status | 504 |
| code `network` and any other status | 503 |
| anything else | 502 |

The code is not rewritten. A timeout still has code `timeout` when the status becomes 504. Pass a second argument to choose the status. A number outside 400 to 599 throws `RangeError` before SvelteKit sees it.

```ts
return failFromApiError(cause, 400)
```

`$page.error` is typed as `App.Error`, and the default is `{ message: string }`. The thrown body also carries `code`, `detail`, and `retryAfterSeconds`. Extend `App.Error` so the page can see them:

```ts
import type { ActionErrorData } from "@nrynss/chaaya/sveltekit"

declare global {
  namespace App {
    interface Error {
      code?: ActionErrorData["code"]
      detail?: ActionErrorData["detail"]
      retryAfterSeconds?: ActionErrorData["retryAfterSeconds"]
    }
  }
}

export {}
```

## Adding fields

`toActionData()` is the same object `failFromApiError()` puts on the failure. Spread it when the action also returns the submitted values.

```ts
import { fail } from "@sveltejs/kit"
import { actionStatus, toActionData } from "@nrynss/chaaya/sveltekit"

const data = toActionData(cause)
return fail(actionStatus(cause), { ...data, name: String(formData.get("name") ?? "") })
```

## Related

A `+server.ts` that emits job frames uses [`createJobStreamResponse`](job-stream-response.md) on the same export.
