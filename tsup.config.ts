import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['main.ts'],
	format: ['cjs'],
	minify: true,
	external: ['obsidian'],
	noExternal: ['modern-screenshot'],
	target: 'es6',
});
