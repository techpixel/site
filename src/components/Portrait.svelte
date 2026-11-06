<script lang="ts">
	import { onMount } from 'svelte';
	import { ditherBayer } from '../lib/dither';
	import { sweepStart, SLIDE_FROM } from '../lib/sweep';

	interface Props {
		/** The photo in full tone; it is dithered here, on the screen's own pixels. */
		src: string;
		alt: string;
		width: number;
		height: number;
		/** Size of one dither cell, in device pixels (1 is the finest). */
		cell?: number;
		/**
		 * Draw the lit cells in this colour and leave the dark ones clear, for a dithered
		 * photo used as a tint over the page rather than as a picture. The plain image
		 * never shows then, even without JavaScript. A CSS custom property (`--name`) is
		 * read off the canvas, and the cells are redrawn when the theme changes.
		 */
		ink?: string;
		/**
		 * ms for the cells to come in one by one from the right, with some scatter, following
		 * the left edge of a Warp sliding in over the same time on the same clock. 0 = none.
		 */
		reveal?: number;
	}

	let { src, alt, width, height, cell = 1, ink, reveal = 0 }: Props = $props();

	/*
	 * The dithered look only holds when one cell of the pattern is one device pixel: a
	 * pre-dithered export resampled to any other size turns to moiré. So the full-tone photo
	 * is drawn onto a canvas sized to the box in device pixels (divided by `cell`, then scaled
	 * back up with hard edges) and dithered there, and drawn again whenever the box's size, the page zoom or the screen's density changes. Without
	 * JavaScript the plain image shows; with it the image only feeds the canvas, hidden by
	 * opacity so it stays the photo for assistive tech. Ported from techpixel/portfolio.
	 */
	let img: HTMLImageElement;
	let canvas: HTMLCanvasElement;
	let drawn = $state(false);

	onMount(() => {
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;

		// The canvas in device pixels.
		let w = 0;
		let h = 0;
		let frame = 0;

		// The reveal: each cell gets a turn, the progress at which Warp's sliding shape (its
		// left edge SLIDE_FROM widths out at the start) reaches the cell's column, give or take
		// some scatter, and shows once the eased progress passes it. Its clock is the one the
		// headline runs on; a redraw mid-reveal (a resize) carries on from where it is.
		const revealing = reveal > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
		let revealStart = 0;
		let revealFrame = 0;
		let final: ImageData | undefined;
		let turns: Float32Array | undefined;
		const SCATTER = 0.08;
		const scatter = (x: number, y: number) => {
			const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
			return n - Math.floor(n);
		};
		const step = (now: number) => {
			revealFrame = 0;
			if (!final || !turns) return;
			const p = Math.min(1, (now - revealStart) / reveal);
			if (p >= 1) {
				ctx.putImageData(final, 0, 0);
				return;
			}
			const out = new ImageData(new Uint8ClampedArray(final.data), final.width, final.height);
			for (let k = 0; k < turns.length; k++) if (turns[k] > p) out.data[k * 4 + 3] = 0;
			ctx.putImageData(out, 0, 0);
			revealFrame = requestAnimationFrame(step);
		};

		const draw = () => {
			frame = 0;
			if (!w || !h || !img.complete || !img.naturalWidth) return;
			const cw = Math.max(1, Math.round(w / cell));
			const ch = Math.max(1, Math.round(h / cell));
			canvas.width = cw;
			canvas.height = ch;
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			// Cover the box, as object-fit: cover does for the image beneath.
			const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
			const iw = img.naturalWidth * scale;
			const ih = img.naturalHeight * scale;
			ctx.drawImage(img, (cw - iw) / 2, (ch - ih) / 2, iw, ih);
			const pixels = ctx.getImageData(0, 0, cw, ch);
			ditherBayer(pixels);
			if (ink) tint(pixels, ink.startsWith('--') ? getComputedStyle(canvas).getPropertyValue(ink) : ink);
			if (revealing && (!revealStart || performance.now() - revealStart < reveal)) {
				final = pixels;
				turns = new Float32Array(cw * ch);
				for (let y = 0; y < ch; y++) {
					for (let x = 0; x < cw; x++) {
						// When the edge reaches the column, undoing Warp's quartic ease-out so
						// the sweep keeps pace with it. The scatter is in time, not distance:
						// the ease crawls at the end, where a spread in distance would hold a
						// ragged band at the left edge for most of the reveal.
						const edge = 1 - ((x + 1) / cw / SLIDE_FROM) ** 0.25;
						turns[y * cw + x] = Math.min(1, edge + (scatter(x, y) - 0.5) * SCATTER);
					}
				}
				if (!revealStart) revealStart = sweepStart(canvas);
				ctx.clearRect(0, 0, cw, ch);
				if (!revealFrame) revealFrame = requestAnimationFrame(step);
			} else {
				ctx.putImageData(pixels, 0, 0);
			}
			drawn = true;
		};
		// Lit cells take the ink, dark ones go clear. The canvas parses the colour.
		const tint = ({ data }: ImageData, color: string) => {
			ctx.fillStyle = color;
			const hex = ctx.fillStyle;
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			for (let i = 0; i < data.length; i += 4) {
				const on = data[i] > 127;
				data[i] = r;
				data[i + 1] = g;
				data[i + 2] = b;
				data[i + 3] = on ? 255 : 0;
			}
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(draw);
		};

		// Exact device pixels where the observer reports them (Chrome, Firefox); otherwise
		// from the CSS size and the pixel ratio.
		const measure = (entry?: ResizeObserverEntry) => {
			const exact = entry?.devicePixelContentBoxSize?.[0];
			if (exact) {
				w = exact.inlineSize;
				h = exact.blockSize;
			} else {
				w = Math.round(canvas.clientWidth * devicePixelRatio);
				h = Math.round(canvas.clientHeight * devicePixelRatio);
			}
		};
		const remeasure = () => {
			measure();
			schedule();
		};
		const observer = new ResizeObserver(([entry]) => {
			measure(entry);
			schedule();
		});
		try {
			observer.observe(canvas, { box: 'device-pixel-content-box' });
		} catch {
			observer.observe(canvas);
		}
		// The pixel ratio can change (zoom) with no change to the CSS box.
		addEventListener('resize', remeasure);
		img.addEventListener('load', schedule);
		if (img.complete) schedule();
		// The theme (data-theme on <html>) can change the ink.
		const themeWatch = new MutationObserver(schedule);
		if (ink?.startsWith('--')) themeWatch.observe(document.documentElement, { attributeFilter: ['data-theme'] });

		return () => {
			observer.disconnect();
			themeWatch.disconnect();
			removeEventListener('resize', remeasure);
			img.removeEventListener('load', schedule);
			cancelAnimationFrame(frame);
			cancelAnimationFrame(revealFrame);
		};
	});
</script>

<img
	bind:this={img}
	{src}
	{alt}
	{width}
	{height}
	decoding="async"
	loading="eager"
	class="absolute inset-0 size-full object-cover transition-opacity"
	class:opacity-0={drawn || ink}
/>
<canvas
	bind:this={canvas}
	class="absolute inset-0 size-full [image-rendering:pixelated]"
	class:invisible={!drawn}
	aria-hidden="true"
></canvas>
