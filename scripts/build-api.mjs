import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('api-dist',{recursive:true});
await build({entryPoints:['worker.mjs'],outfile:'api-dist/_worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await writeFile('api-dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));
await writeFile('api-dist/index.html','<!doctype html><html lang="ko"><meta charset="utf-8"><title>Gallery Pulse API</title><p>Gallery Pulse API</p></html>');
