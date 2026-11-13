// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
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
	// Downloaded at build time and served from the site itself, so the first paint doesn't
	// wait on Google's stylesheet and a second origin.
	fonts: [
		{
			provider: fontProviders.google(),
			name: 'Familjen Grotesk',
			cssVariable: '--font-familjen-grotesk',
			weights: ['400 700'],
			styles: ['normal', 'italic'],
		},
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
