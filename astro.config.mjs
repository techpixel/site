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
	vite: {
		plugins: [tailwindcss()],
	},
});
