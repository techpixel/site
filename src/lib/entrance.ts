// A fresh load fades the whole page in (global.css `page-in`); a client-side page change
// cross-fades instead. So something that turns up late (drawn by a script, or waiting on an
// image) fades in on its own only once the page itself is in: while the page's fade is
// still running it just joins that, as a fade inside a fade shows as a flicker.
export const pageFadingIn = () =>
	document.body
		.getAnimations()
		.some((a) => a instanceof CSSAnimation && a.animationName === 'page-in' && a.playState === 'running');

/**
 * Makes `change` (a class or state change that would start `el`'s opacity transition) take
 * effect at once instead, for while the page is still fading in.
 */
export function withoutTransition(el: HTMLElement, change: () => void) {
	el.style.transition = 'none';
	change();
	void el.offsetWidth; // apply the change before the transition comes back
	el.style.transition = '';
}
