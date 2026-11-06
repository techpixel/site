import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';
import { parse } from 'yaml';

/**
 * Projects, from src/data/projects.yaml: the cards on /work (entries with a cover) and
 * the lists on /projects.
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
		/** Shown in parentheses after the name on /projects, e.g. "2026". */
		time: z.string(),
		/** personal → listed on /projects; older → its "Older Projects" group. */
		section: z.enum(['personal', 'older']).optional(),
		/** Role on the project (e.g. "Lead UI/UX Designer & Engineer"); not shown at the moment. */
		title: z.string().optional(),
		/** The name links here on /projects, and the card on /work when there's no website. */
		href: z.string().url().optional(),
		/** Label → url. `website` is where the card on /work links. */
		links: z.record(z.string(), z.string().url()).default({}),
		/** /work: entries with a cover show as a card, src/assets/covers/<cover>.webp. */
		cover: z.string().optional(),
		/** The card's title; defaults to the name. */
		heading: z.string().optional(),
		/** The card's pills. */
		tags: z.array(z.string()).default([]),
		/** The card's line under the title on /work, in italics. */
		subtitle: z.string().optional(),
		/** The card's text; a blank line starts a new paragraph, *stars* italicise. */
		blurb: z.string().optional(),
	}),
});

export const collections = { projects };
