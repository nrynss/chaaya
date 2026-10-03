# Auth

The export is `@nrynss/chaaya/auth`. This page is `/docs/auth`, the same name. The feature is a passcode gate. `GatePasscode` sends one secret on a header and, when you pass a jar, a cookie. It does not know a backend's names. `keelGate` on `@nrynss/chaaya/keel` is the adapter that fills Keel's names in. That split is the pattern for any other backend.

## Write an adapter

1. Call `GatePasscode` with the header and cookie that backend reads. Both names are required. An empty name throws.
2. List the `ApiError` codes that mean "this request needs the passcode" in `authCodes`. Wrap the client with `apiWithGate`. Those codes become `GateError`. Every other `ApiError` stays an `ApiError`.
3. `GateError` extends `ApiError`, so `instanceof ApiError` still matches. `instanceof GateError` is how a caller tells an auth refusal from any other `ApiError`. `detail` and `retryAfterSeconds` stay on the same object.
4. `authCodes` is a plain array. The check is `includes`, not a property lookup, so a code named `constructor` or `toString` is not treated as listed unless you put it in the array.
5. Export a small function, the way `keelGate` does, so the app never repeats the names.

```ts
import { apiWithGate, GatePasscode } from "@nrynss/chaaya/auth"

function appGate() {
  return new GatePasscode({
    headerName: "X-App-Passcode",
    cookieName: "app_gate",
    authCodes: ["passcode_required"],
  })
}

const passcode = appGate()
passcode.set("open-sesame")
const call = apiWithGate(passcode)
```

Keel is the same function with different names:

```ts
import { apiWithKeelGate, keelGate } from "@nrynss/chaaya/keel"

const call = apiWithKeelGate(keelGate())
```

`keelGate` uses header `X-Passcode`, cookie `passcode`, and the code `passcode_required`. Override any of them by passing options. An empty string for `headerName` or `cookieName` uses that default. `GatePasscode` throws on an empty name instead. The generic class never mentions those strings.

## Browser and server

Importing the module does not touch `document`. Pass `jar: document` only in the browser, after the page exists. On the server, omit `jar`. Memory still holds a value you `set` in that process, and `apply()` still sets the header. There is no `document.cookie` under SSR.

`remember()` stores a passcode a response exposed. Browsers implement `Headers.getSetCookie`, and a fetch response returns `[]` from it, because `Set-Cookie` is a forbidden response-header name and the browser strips it before script sees it. `get("set-cookie")` is null for the same reason. That branch does nothing in a browser. It works under Node and undici, which still surface the header. When both a `Set-Cookie` line and a `passcode` member are present, the cookie wins. In a browser, store the JSON member `passcode`, or let the browser keep the cookie and read it later through a `document` jar. A cookie value written as an RFC 6265 quoted-string is stored without the surrounding quotes.

`apply({})` leaves `credentials` unset. Pass `credentials: "include"` when the cookie must be sent. Pass `credentials: "omit"` to send none.

## The reference adapter

`keelGate` in [`src/lib/adapters/keel/gate.ts`](../src/lib/adapters/keel/gate.ts) is the canonical generic-primitive-plus-adapter. It fills Keel's header, cookie, and `passcode_required`, and nothing else. Copy that file for another backend. The generic class never mentions those names.

The adapter guide is [adapters.md](adapters.md). It points at this file rather than inventing a second passcode example. `plainGate` in that guide is the same shape with different names, and it does not import Keel.
