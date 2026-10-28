/**
 * Shared decoder primitives for adapter authors. An adapter uses them to
 * parse a payload without throwing. App code does not need them.
 */
/** The reason a parser rejected its input. */
export interface ParseFailure {
    /** A short sentence naming what the input lacked. */
    message: string;
}
/** A parsed value, or the failure that replaced it. */
export type ParseResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    failure: ParseFailure;
};
export declare function ok<T>(value: T): ParseResult<T>;
export declare function fail<T>(message: string): ParseResult<T>;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/** Decode a JSON text into a value, or fail without throwing. */
export declare function decodeJson(text: string): ParseResult<unknown>;
