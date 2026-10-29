import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		alias: {
			'@userscript/': fileURLToPath(new URL('../userscript/source/', import.meta.url))
		}
	},
	test: {
		include: ['tests/**/*.test.ts']
	}
})
