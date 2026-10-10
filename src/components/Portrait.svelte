<script lang="ts">
	import { onMount } from 'svelte';
	import { ditherBayer } from '../lib/dither';

	interface Props {
		/** The photo in full tone; it is dithered here, on the screen's own pixels. */
		src: string;
		alt: string;
		width: number;
		height: number;
		/** Size of one dither cell, in device pixels (1 is the finest). */
		cell?: number;
	}

	let { src, alt, width, height, cell = 1 }: Props = $props();

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
			ctx.putImageData(pixels, 0, 0);
			drawn = true;
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

		return () => {
			observer.disconnect();
			removeEventListener('resize', remeasure);
			img.removeEventListener('load', schedule);
			cancelAnimationFrame(frame);
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
	class:opacity-0={drawn}
/>
<canvas
	bind:this={canvas}
	class="absolute inset-0 size-full [image-rendering:pixelated]"
	class:invisible={!drawn}
	aria-hidden="true"
></canvas>
