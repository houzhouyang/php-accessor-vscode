const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/** @type {import('esbuild').BuildOptions} */
const options = {
	entryPoints: ['./src/extension.ts'],
	bundle: true,
	outfile: 'dist/extension.js',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	target: 'node14',
	sourcemap: !production,
	minify: production,
	plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
	try {
		if (watch) {
			const context = await esbuild.context(options);
			await context.watch();
			console.log('Watching...');
		} else {
			await esbuild.build(options);
			console.log('Build complete');
		}
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
}

main();
