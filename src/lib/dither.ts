/**
 * Ordered dithering to black and white, in place, with a Bayer matrix: each pixel's luma
 * is compared with a threshold that repeats in a `size` × `size` tile, so flat tones become
 * the regular crosshatch the portrait was first exported with. It runs on a canvas sized to
 * the screen's own pixels, so one cell of the pattern is one device pixel at any zoom.
 *
 * Pixels that are mostly transparent stay clear (fully), so the image can be drawn into a
 * part of the canvas. `origin` is where the image data sits on the canvas, so the tile stays
 * anchored to the screen rather than to the image when the image moves. `black` and `white`
 * are the luma (0–255) that map to full black and full white, for stretching the tones.
 */
export function ditherBayer(
	image: ImageData,
	{
		size = 8,
		black = 0,
		white = 255,
		origin = { x: 0, y: 0 },
	}: { size?: 2 | 4 | 8 | 16; black?: number; white?: number; origin?: { x: number; y: number } } = {},
): void {
	const matrix = bayer(size);
	const cells = size * size;
	const span = white - black || 1;
	const { data, width, height } = image;
	for (let y = 0; y < height; y++) {
		const row = matrix[(y + origin.y) % size];
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (data[i + 3] < 128) {
				data[i + 3] = 0;
				continue;
			}
			// Rec. 709 luma, with black..white stretched to 0..1.
			const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] - black) / span;
			const on = luma > (row[(x + origin.x) % size] + 0.5) / cells;
			data[i] = data[i + 1] = data[i + 2] = on ? 255 : 0;
			data[i + 3] = 255;
		}
	}
}

/** The `size` × `size` Bayer matrix, values 0 to size² − 1, doubled up from [[0, 2], [3, 1]]. */
export function bayer(size: number): number[][] {
	let m = [[0]];
	while (m.length < size) {
		const n = m.length;
		const next = Array.from({ length: 2 * n }, () => new Array<number>(2 * n));
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				const v = 4 * m[y][x];
				next[y][x] = v;
				next[y][x + n] = v + 2;
				next[y + n][x] = v + 3;
				next[y + n][x + n] = v + 1;
			}
		}
		m = next;
	}
	return m;
}
