# Passcode gate

`GatePasscode` on `@nrynss/chaaya/api` sends one secret on a header and, when you pass a jar, a cookie. It does not know a backend's names. `keelGate` on `@nrynss/chaaya/keel` is the adapter that fills Keel's names in. That split is the pattern for any other backend.

## Write an adapter

1. Call `GatePasscode` with the header and cookie that backend reads. Both names are required. An empty name throws.
2. List the `ApiError` codes that mean "this request needs the passcode" in `authCodes`. Wrap the client with `apiWithGate`. Those codes become `GateError`. Every other `ApiError` stays an `ApiError`.
3. `GateError` keeps `detail` and `retryAfterSeconds` from that `ApiError`. A caller can still branch on the body and the retry delay.
4. `authCodes` is a plain array. The check is `includes`, not a property lookup, so a code named `constructor` or `toString` is not treated as listed unless you put it in the array.
5. Export a small function, the way `keelGate` does, so the app never repeats the names.

```ts
import { apiWithGate, GatePasscode } from "@nrynss/chaaya/api"

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

`keelGate` uses header `X-Passcode`, cookie `passcode`, and the code `passcode_required`. Override any of them by passing options. The generic class never mentions those strings.

## Browser and server

Importing the module does not touch `document`. Pass `jar: document` only in the browser, after the page exists. On the server, omit `jar`. Memory still holds a value you `set` in that process, and `apply()` still sets the header. There is no `document.cookie` under SSR.

`remember()` stores a passcode a response exposed. Browser `fetch` forbids the `Set-Cookie` response header, so `getSetCookie` is missing and `get("set-cookie")` is null. That branch does nothing in a browser. It works under Node and undici, which still surface the header. In a browser, store the JSON member `passcode`, or let the browser keep the cookie and read it later through a `document` jar.

`apply()` defaults `credentials` to `include` so the cookie is sent. Pass `credentials: "omit"` to keep the caller's choice.
