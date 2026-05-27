import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/core/main.ts'],
	format: ['cjs'],
	minify: true,
	external: ['obsidian'],
	noExternal: ['modern-screenshot'],
	target: 'es6',
});
