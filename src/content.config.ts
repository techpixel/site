import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';
import { parse } from 'yaml';

/**
 * Project entries listed on /work, from src/data/projects.yaml. The org sections
 * around them (Hack Club, Purdue Hackers, Orchard…) are written in the page itself.
 */
const projects = defineCollection({
	// The store keys entries by id and hands them back sorted, so the list's position
	// is kept as `order` for the page to sort by.
	loader: file('src/data/projects.yaml', {
		parser: (text) => (parse(text) as Record<string, unknown>[]).map((entry, order) => ({ ...entry, order })),
	}),
	schema: z.object({
		order: z.number(),
		name: z.string(),
		/** Shown in parentheses after the name, e.g. "HC 2026". */
		time: z.string(),
		section: z.enum(['hack-club', 'personal', 'older']),
		/** Personal projects: also listed on /work, not just /projects. */
		featured: z.boolean().default(false),
		/** Role on the project, shown under the name (e.g. "Lead UI/UX Designer & Engineer"). */
		title: z.string().optional(),
		/** Personal projects only: the name links here. */
		href: z.string().url().optional(),
		/** Hack Club projects: small links under the name, in this order (label → url). */
		links: z.record(z.string(), z.string().url()).default({}),
		tags: z.array(z.string()).default([]),
		/** Key of a mark in src/pages/work.astro's logo map (an SVG in src/assets). */
		logo: z.string().optional(),
		/** Placeholder letter mark, for projects whose logo isn't exported yet. */
		mark: z.string().max(2).optional(),
		/** Hover accent (also the overlay's cue colour). */
		color: z.string().optional(),
		/** Key of a component in src/components/overlays, shown on hover. */
		overlay: z.string().optional(),
	}),
});

export const collections = { projects };
