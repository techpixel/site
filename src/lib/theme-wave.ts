import { bayer } from './dither';

/**
 * The theme toggle's dither wave, carried out over the whole page: the change runs in a view
 * transition, and the new page (::view-transition-new(root), live) is masked in over the
 * snapshot of the old one, cell by cell, in a dithered ring spreading out from the click.
 * The toggle itself is left out of the mask (its own layer, see global.css), so its own wave
 * plays untouched, from the same point.
 *
 * Blend modes can't do this: light mode isn't the dark one inverted (the link colours, the
 * photos), so the page has to really change underneath, and only the reveal is faked.
 *
 * The mask is a small SVG redrawn each frame: one circle per dither level, each filled with
 * a pattern of that level's cells, the lower levels' circles running ahead of the higher
 * ones. So a cell shows once the front, less its level's lag, has passed it: the same
 * "turn" test as the toggle's wave, but drawn by the browser rather than per pixel.
 */

/** A cell of the wave, in CSS pixels. */
const CELL = 4;
/** Cells along the side of the repeating pattern: four of the toggle's 4 × 4 tiles. */
const PATTERN = 16;
const LEVELS = 16;
/** How much of the way out the dithered edge spans, as a fraction of the furthest corner. */
const BAND = 0.3;
/** Eased out, as the toggle's own wave is. */
const DURATION = 700;

const scatter = (x: number, y: number) => {
	const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
	return n - Math.floor(n);
};

let defs: string | undefined;
/** Each level's cells as a pattern: a Bayer threshold, nudged per tile, as the toggle does. */
function patterns(): string {
	if (defs) return defs;
	const matrix = bayer(4);
	const paths = Array.from({ length: LEVELS }, () => '');
	for (let y = 0; y < PATTERN; y++) {
		for (let x = 0; x < PATTERN; x++) {
			const t = ((matrix[y % 4][x % 4] + 0.5) / 16) * 0.55 + scatter(x >> 2, y >> 2) * 0.45;
			const level = Math.min(LEVELS - 1, Math.floor(t * LEVELS));
			paths[level] += `M${x * CELL} ${y * CELL}h${CELL}v${CELL}h-${CELL}z`;
		}
	}
	const side = PATTERN * CELL;
	return (defs = paths
		.map((d, j) => `<pattern id="l${j}" width="${side}" height="${side}" patternUnits="userSpaceOnUse"><path d="${d}"/></pattern>`)
		.join(''));
}

const EMPTY = 'linear-gradient(transparent, transparent)';
let current = 0;

/**
 * Runs `update` (the theme change) inside a view transition, the new theme rippling out from
 * (x, y) in viewport pixels, or the middle of the screen. Without view transitions, or with
 * reduced motion, the theme just changes.
 */
export function themeWave(update: () => void, x = innerWidth / 2, y = innerHeight / 2): void {
	if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
		update();
		return;
	}
	const html = document.documentElement;
	const id = ++current;
	const w = innerWidth;
	const h = innerHeight;
	const far = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y)) || 1;
	const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><defs>${patterns()}</defs>`;

	// Two layers, this frame's mask and the last: a new data URL can take a frame to
	// decode, and the reveal only grows, so the last one covers for it meanwhile.
	let prev = EMPTY;
	const show = (mask: string) => {
		html.style.setProperty('--theme-wave-a', mask);
		html.style.setProperty('--theme-wave-b', prev);
		prev = mask;
	};
	html.style.setProperty('--theme-wave-ms', `${DURATION}ms`);
	show(EMPTY);
	// Set before the old page is captured: the sidebar and "Loading..." drop their own
	// transition layers, so the wave runs across them too, the toggle takes one of its
	// own, out of the mask, and the cross-fade is off.
	html.classList.add('theme-wave');

	let frame = 0;
	let start = 0;
	const step = (now: number) => {
		start ||= now;
		const t = Math.min(1, (now - start) / DURATION);
		const pos = (1 - (1 - t) ** 2.4) * (1 + BAND);
		let circles = '';
		for (let j = 0; j < LEVELS; j++) {
			const r = (pos - ((j + 0.5) / LEVELS) * BAND) * far;
			if (r > 0) circles += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="url(#l${j})"/>`;
		}
		show(`url("data:image/svg+xml,${encodeURIComponent(head + circles + '</svg>')}")`);
		if (t < 1) frame = requestAnimationFrame(step);
	};

	const transition = document.startViewTransition(update);
	transition.ready.then(() => (frame = requestAnimationFrame(step))).catch(() => {});
	transition.finished.finally(() => {
		cancelAnimationFrame(frame);
		if (id !== current) return;
		html.classList.remove('theme-wave');
		for (const p of ['--theme-wave-a', '--theme-wave-b', '--theme-wave-ms']) html.style.removeProperty(p);
	});
}
