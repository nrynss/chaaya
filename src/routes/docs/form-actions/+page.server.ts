import { ApiError } from "$lib/api/index.js"
import { failFromApiError } from "$lib/sveltekit/index.js"

/** A fixed refusal, so the page can show the action data without a backend. */
export const actions = {
	default: async () => {
		const failure = new ApiError("This request was refused.", "rate_limited", 429, { scope: "form" }, 12)
		return failFromApiError(failure)
	},
}
