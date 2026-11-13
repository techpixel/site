/**
 * `count` colours from the darker of `a` and `b` (sRGB, 0–255) to the lighter, evenly
 * spaced in OKLab, so lightness, hue and chroma all run from one end to the other: one
 * colour in shades, for the dithered photos, whose darkest shade is then exactly the page's
 * ink and the shades near it lean its way, so the photo's darks melt into the page.
 * Whichever way round the two come (the light theme swaps the page's colours), the ramp
 * runs dark to light, so a photo never comes out as its negative.
 */
export function shades(a: number[], b: number[], count: number): number[][] {
	let from = toOklab(a);
	let to = toOklab(b);
	if (from[0] > to[0]) [from, to] = [to, from];
	return Array.from({ length: count }, (_, k) => {
		const t = count > 1 ? k / (count - 1) : 1;
		return fromOklab(from.map((v, i) => v + (to[i] - v) * t));
	});
}

const toLinear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) =>
	Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));

function toOklab([r, g, b]: number[]): number[] {
	const [lr, lg, lb] = [r, g, b].map(toLinear);
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [L, a, bb];
}

function fromOklab([L, a, b]: number[]): number[] {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	].map(fromLinear);
}
