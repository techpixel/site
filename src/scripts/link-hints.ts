// Move each link's hint with the pointer. On every page load, since the client router
// swaps pages in without reloading.
document.addEventListener('astro:page-load', () => {
	for (const link of document.querySelectorAll<HTMLElement>('.has-hint')) {
		const hint = link.querySelector<HTMLElement>(':scope > .link-hint');
		if (!hint) continue;
		link.addEventListener('pointermove', (e) => {
			hint.style.setProperty('--x', `${e.clientX}px`);
			hint.style.setProperty('--y', `${e.clientY}px`);
			hint.classList.add('following');
		});
		// Keyboard focus has no pointer to follow, so the hint goes back beside the link.
		link.addEventListener('focus', () => {
			if (!link.matches(':hover')) hint.classList.remove('following');
		});
	}
});
