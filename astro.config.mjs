// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import seo from './src/data/seo.json' with { type: 'json' };

// https://astro.build/config
export default defineConfig({
	// Drives absolute OG/canonical URLs in src/components/SEO.astro
	site: seo.url,
	integrations: [svelte()],
	// Fetch internal pages as soon as their links are on screen (not on hover), so a
	// click swaps the page in without waiting on the network.
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'viewport',
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
