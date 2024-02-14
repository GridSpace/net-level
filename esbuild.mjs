#!/usr/bin/env node
import * as esbuild from 'esbuild';

esbuild.build({
    entryPoints: ['./lib/client.js'],
    outfile: './dist/client.mjs',
    platform: 'node',
    format: 'esm',
    minify: true,
    bundle: true
});
