// The home page's intro (the headline sliding in, the beach sweeping in under it) runs on
// one clock, so the two stay in step however long each takes to get going: whichever
// starts first sets the time. Keyed on the page's <main>, which the client router
// replaces on every navigation, so coming back to the page starts it afresh.
const starts = new WeakMap<Element, number>();

export function sweepStart(el: Element): number {
	const key = el.closest('main') ?? document.documentElement;
	let start = starts.get(key);
	if (start === undefined) starts.set(key, (start = performance.now()));
	return start;
}

/** How far right of its place Warp's slide-in starts the shape, in shape widths. */
export const SLIDE_FROM = 1.05;
