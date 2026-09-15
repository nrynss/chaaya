/**
 * A browser spec measures the take it saved with a local tool, and this
 * repository carries no node type package yet. These declarations name the
 * few module calls the specs make, and they merge with a full node type
 * package when one arrives. The specs take every value from an import, so
 * nothing here declares a global.
 */
declare module "node:child_process" {
	export function execFileSync(
		command: string,
		args: readonly string[],
		options: { encoding: "utf8" }
	): string
}

declare module "node:fs" {
	export function writeFileSync(file: string, data: Uint8Array): void
}

declare module "node:url" {
	export function fileURLToPath(url: string | URL): string
}
