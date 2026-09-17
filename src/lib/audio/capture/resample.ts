import type { CaptureChunk } from "./types.js"

/**
 * Rate conversion for a captured take. The audio thread renders at the rate
 * its context runs at, which a browser may set from the device rather than
 * from the requested rate. These functions bring the frames to the rate the
 * take declares, so a player reads them at the right speed.
 */

/** Taps for the halving filter, 63 taps, cutoff near 90 percent of 12 kHz. */
const HALF_TAPS: readonly number[] = [
	-0.00012863601070831003, -0.0008747772872174757, -0.00015369247795044426,
	0.001094167589715454, 0.0006283571908239346, -0.0013662717761083638,
	-0.0014640751700871386, 0.0014903123275167402, 0.00275363391044994,
	-0.0011566621836252213, -0.004446166157835347, 5.9250815137823036e-18,
	0.006298330998812332, 0.002323238414334186, -0.007855045075750085,
	-0.006048395125350952, 0.00846124474231811, 0.011225788195746605,
	-0.007291980832314985, -0.01767161657740633, 0.0033650041097306664,
	0.024959906477714948, 0.004550254347311708, -0.03246092343310347,
	-0.018372419474592835, 0.03942198808318043, 0.04245801340650876,
	-0.04507759988997738, -0.09264064856525625, 0.048769174723360086,
	0.31397535560231893, 0.4504682798348831, 0.31397535560231893,
	0.048769174723360086, -0.09264064856525625, -0.045077599889977386,
	0.04245801340650876, 0.03942198808318044, -0.018372419474592835,
	-0.03246092343310347, 0.004550254347311708, 0.02495990647771495,
	0.0033650041097306655, -0.017671616577406332, -0.00729198083231499,
	0.011225788195746607, 0.008461244742318116, -0.00604839512535095,
	-0.007855045075750086, 0.0023232384143341872, 0.006298330998812332,
	5.925081513782309e-18, -0.004446166157835347, -0.001156662183625222,
	0.00275363391044994, 0.0014903123275167394, -0.0014640751700871386,
	-0.001366271776108365, 0.0006283571908239346, 0.0010941675897154547,
	-0.00015369247795044445, -0.0008747772872174757, -0.00012863601070831003
]

/**
 * Taps for the thirding filter, 63 taps, cutoff near 90 percent of 8 kHz.
 * The halving table serves ratios two, four and six, this one serves three.
 */
const THIRD_TAPS: readonly number[] = [
	-0.0006643934115504907, 9.629160160991198e-19, 0.0007938078085046855,
	0.001092751464361543, 0.0004271493397529445, -0.0009913698079563576,
	-0.002067835199866723, -0.0014883834922157484, 0.0009537734568411486,
	0.0035552328409017646, 0.0036371478623506786, -3.944941988476012e-18,
	-0.005152295329390083, -0.007140938490785623, -0.002720744201729048,
	0.006040566995759137, 0.011950520075967981, 0.008145456623187523,
	-0.004956997140321156, -0.017648745104594455, -0.017379943205911047,
	9.158252452338302e-18, 0.023501653950448724, 0.03241891091407348,
	0.012489340398804196, -0.028604681322334975, -0.05996698559758141,
	-0.04501925824953985, 0.032087849910176706, 0.14990182445209732,
	0.2568448305620118, 0.2999235077970751, 0.2568448305620118,
	0.14990182445209732, 0.032087849910176706, -0.045019258249539854,
	-0.059966985597581415, -0.02860468132233498, 0.012489340398804198,
	0.032418910914073486, 0.023501653950448724, 9.158252452338304e-18,
	-0.017379943205911044, -0.01764874510459446, -0.0049569971403211595,
	0.008145456623187525, 0.01195052007596799, 0.006040566995759136,
	-0.002720744201729048, -0.007140938490785627, -0.005152295329390083,
	-3.9449419884760156e-18, 0.0036371478623506786, 0.003555232840901767,
	0.0009537734568411486, -0.0014883834922157476, -0.002067835199866723,
	-0.0009913698079563583, 0.0004271493397529445, 0.0010927514643615437,
	0.0007938078085046865, 9.629160160991198e-19, -0.0006643934115504907
]

/** Maps an out-of-range frame index back onto the input by reflection. */
function foldIndex(index: number, length: number): number {
	if (length <= 1) return 0
	const period = 2 * (length - 1)
	let folded = index % period
	if (folded < 0) folded += period
	return folded >= length ? period - folded : folded
}

/** Low-passes the input, then keeps every factor-th frame. */
function decimateFiltered(
	samples: Float32Array,
	factor: number,
	taps: readonly number[]
): Float32Array {
	const frames = Math.max(1, Math.round(samples.length / factor))
	const target = new Float32Array(frames)
	const half = (taps.length - 1) / 2
	for (let index = 0; index < frames; index += 1) {
		const center = index * factor
		let total = 0
		for (let tap = 0; tap < taps.length; tap += 1) {
			total += taps[tap] * samples[foldIndex(Math.round(center - half + tap), samples.length)]
		}
		target[index] = total
	}
	return target
}

/** Interpolates between frames, with no filter above the new Nyquist rate. */
function interpolate(
	samples: Float32Array,
	fromRate: number,
	toRate: number
): Float32Array {
	const frames = Math.max(1, Math.round((samples.length * toRate) / fromRate))
	const target = new Float32Array(frames)
	const step = fromRate / toRate
	for (let index = 0; index < frames; index += 1) {
		const position = index * step
		const lower = Math.floor(position)
		const upper = Math.min(lower + 1, samples.length - 1)
		const fraction = position - lower
		target[index] = samples[lower] * (1 - fraction) + samples[upper] * fraction
	}
	return target
}

/** Resamples mono frames to another rate. Equal rates hand the same array
 * straight back, because no frame has to move. An integer downsampling ratio
 * filters before it decimates, so content above the new Nyquist rate cannot
 * fold back into the voice band. A ratio built from halves and thirds runs
 * one filter stage per step, and any leftover ratio interpolates instead.
 * Any other ratio interpolates from the source frames. */
export function resampleLinear(
	samples: Float32Array,
	fromRate: number,
	toRate: number
): Float32Array {
	if (fromRate === toRate || samples.length === 0) return samples
	if (fromRate > toRate && Number.isInteger(fromRate / toRate)) {
		let current = samples
		let rate = fromRate
		let factor = fromRate / toRate
		while (factor % 2 === 0) {
			current = decimateFiltered(current, 2, HALF_TAPS)
			rate /= 2
			factor /= 2
		}
		while (factor % 3 === 0) {
			current = decimateFiltered(current, 3, THIRD_TAPS)
			rate /= 3
			factor /= 3
		}
		if (factor === 1) return current
		return interpolate(current, rate, toRate)
	}
	return interpolate(samples, fromRate, toRate)
}

/**
 * Resamples every block of a take and renumbers the offsets. Equal rates hand
 * the same list back, so a take that already matches costs nothing.
 */
export function resampleChunks(
	chunks: readonly CaptureChunk[],
	fromRate: number,
	toRate: number
): readonly CaptureChunk[] {
	if (fromRate === toRate) return chunks
	const converted: CaptureChunk[] = []
	let offset = 0
	for (const chunk of chunks) {
		const samples = resampleLinear(chunk.samples, fromRate, toRate)
		converted.push({ samples, offset, contextTime: chunk.contextTime })
		offset += samples.length
	}
	return converted
}
