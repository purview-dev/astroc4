import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	// Where src/content/i18n/fr.json is read from.
	i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
