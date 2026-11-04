/**
 * Protocol asserts for adapter authors. An adapter maps its backend onto the
 * generic contracts, and these helpers check that mapping without running a
 * stream or touching the network.
 *
 * Each helper throws one error that names the first drift it meets, so a
 * failure points at the field to fix. Each helper is pure. Importing this
 * module does no DOM work and starts no stream, so a server render stays
 * safe.
 *
 * `assertSseFrame` checks the generic frame format, including the id flags a
 * reconnect reads. A kept event frame that carried an id line moves
 * `Last-Event-ID`. An empty `id:` line, or `id: 0`, on a kept event resets
 * it. A frame with no id line leaves it. A comment never moves it, even when
 * the comment carries an id line. A refused frame never moves it either,
 * because the loop applies a frame only after `shouldAccept` keeps it and the
 * map returns progress or terminal. The assert covers the flags. The loop
 * owns the cursor.
 *
 * `assertErrorEnvelope` checks the error target shape. Both failures and
 * refusals aim at it. A refusal that carries a new quote keeps that quote in
 * `detail`, so the caller still reads one shape. A parser that does not
 * recognise a body returns undefined, and the client keeps `http_error`.
 * That fallback is the refusal contract beside this shape.
 *
 * `assertJobProgress` checks the reading shape, and it optionally checks the
 * `frameMap` that produced it. Core reads that map with `Object.hasOwn`, so
 * inherited names such as `toString` never run as handlers. A map entry that
 * is not a function is ignored the same way, so the assert rejects it as
 * drift rather than letting it read as a silent drop.
 */
/**
 * Check one parsed frame against the generic format. An event frame carries a
 * name and a data string. A comment frame carries comment text and neither a
 * name nor data. Both carry a whole-number id. An id line is reported with
 * `idSet`, and an empty one adds `resetId` on id 0. Either flag, when
 * present, is true. Anything else is drift.
 */
export declare function assertSseFrame(value: unknown): void;
/**
 * Check one failure against the error target shape. A bare body carries
 * `code` and `message` with optional `retryable` and `detail`. An envelope
 * wraps that body under `error`. Either form passes. The code is what a
 * caller branches on. The message is what a caller may show. `retryable`
 * says whether the same call is worth repeating. `detail` stays opaque.
 */
export declare function assertErrorEnvelope(value: unknown): void;
/**
 * Check one reading against the `JobProgress` shape, and optionally check
 * the `frameMap` that produced it. Every reading field is optional. An id, a
 * stage, and a status name the work, so each one is a non-empty string when
 * present. The counters share one unit, so each one is finite and 0 or more
 * when present. `detail` stays opaque, and the app alone reads it. A
 * supplied map must be a plain record of handler functions, because the loop
 * ignores any other entry.
 */
export declare function assertJobProgress(value: unknown, frameMap?: unknown): void;
