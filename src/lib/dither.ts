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

/** Cells along a tile's side. */
export const TILE_CELLS = 4;

/**
 * Tile dithering, after the tiles in the digital-passports Figma (node 20:9051): each tile
 * is a 4 × 4 grid of cells, every cell one of `colors` colours, darkest to lightest
 * (levels 0 to colors − 1). Between one colour and the next, a tile goes from solid,
 * through a checker of the two (as in the Figma), to solid in the next, by `partials`
 * partial checkers on the way, half before the checker and half after: first the
 * checker's cells (the top-left and its diagonals) step up, then the rest. Which cells
 * have stepped up follows the image, the lightest cells first, for detail finer than a
 * tile. (A checker of colours
 * further apart reads darker than the tones around it, so there are none.)
 *
 * `cells` holds the image at one pixel per cell, and the returned image is the same size,
 * each cell's level in its red channel. The luma is stretched so the image's darkest
 * `clip` (a fraction of its cells) and lightest percent reach the ends of the ramp, then
 * bent by `gamma` (below 1 lifts the darks off the darkest colour), and each tile's tone falls between two steps
 * by a Bayer threshold repeating over the tiles. Mostly transparent pixels stay clear.
 */
export function ditherTiles(
	cells: ImageData,
	{
		colors = 4,
		partials = 4,
		clip = 0.01,
		gamma = 1,
	}: { colors?: number; partials?: number; clip?: number; gamma?: number } = {},
): ImageData {
	const { data, width, height } = cells;
	const out = new ImageData(width, height);
	const luma = new Float32Array(width * height);
	const lumas: number[] = [];
	for (let p = 0; p < luma.length; p++) {
		const i = p * 4;
		luma[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
		if (data[i + 3] >= 128) lumas.push(luma[p]);
	}
	lumas.sort((a, b) => a - b);
	const black = lumas[Math.floor(lumas.length * clip)] ?? 0;
	const white = lumas[Math.floor(lumas.length * 0.99)] ?? 255;
	const span = white - black || 1;
	// Steps from one colour to the next: solid, the partials and the full checker, split
	// evenly between the two halves (the checker filling in, then the rest).
	const half = Math.floor(partials / 2) + 1;
	const per = 2 * half;
	const matrix = bayer(4);
	const tiles = (n: number) => Math.ceil(n / TILE_CELLS);
	for (let ty = 0; ty < tiles(height); ty++) {
		for (let tx = 0; tx < tiles(width); tx++) {
			// The tile's cells within the image, checker cells first, each set lightest first.
			const own: { p: number; checker: boolean }[] = [];
			let sum = 0;
			for (let cy = 0; cy < TILE_CELLS; cy++) {
				for (let cx = 0; cx < TILE_CELLS; cx++) {
					const x = tx * TILE_CELLS + cx;
					const y = ty * TILE_CELLS + cy;
					if (x >= width || y >= height) continue;
					const p = y * width + x;
					if (data[p * 4 + 3] < 128) continue;
					own.push({ p, checker: (cx + cy) % 2 === 0 });
					sum += luma[p];
				}
			}
			if (!own.length) continue;
			own.sort((m, n) => Number(n.checker) - Number(m.checker) || luma[n.p] - luma[m.p]);
			// The tile's tone in steps, out of per × (colors − 1).
			const lit = Math.max(0, Math.min(1, (sum / own.length - black) / span)) ** gamma;
			const tone = lit * (colors - 1) * per;
			const threshold = (matrix[ty % 4][tx % 4] + 0.5) / 16;
			const steps = Math.max(0, Math.min((colors - 1) * per, Math.floor(tone + threshold)));
			const base = Math.min(colors - 1, Math.floor(steps / per));
			// Of a partial tile's cells, scaled to the cells it has at the image's edges.
			const up = base === colors - 1 ? 0 : Math.round(((steps % per) / per) * own.length);
			own.forEach(({ p }, k) => {
				out.data[p * 4] = base + (k < up ? 1 : 0);
				out.data[p * 4 + 3] = 255;
			});
		}
	}
	return out;
}
