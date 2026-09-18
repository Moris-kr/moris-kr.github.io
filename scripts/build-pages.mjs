import {cp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

await mkdir('site-dist/gallery-pulse',{recursive:true});
await cp('public','site-dist/gallery-pulse',{recursive:true});
// Content-named assets prevent old module caches from mixing with a new release.
const bundle=await build({entryPoints:['public/app.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false});
const js=bundle.outputFiles[0].contents,css=await readFile('public/style.css');
const hash=data=>createHash('sha256').update(data).digest('hex').slice(0,12);
const appName=`app.${hash(js)}.js`,styleName=`style.${hash(css)}.css`;
await writeFile(`site-dist/gallery-pulse/${appName}`,js);
await writeFile(`site-dist/gallery-pulse/${styleName}`,css);
const html=(await readFile('public/index.html','utf8')).replace('./app.js',`./${appName}`).replace('./style.css',`./${styleName}`);
await writeFile('site-dist/gallery-pulse/index.html',html);
await writeFile('site-dist/.nojekyll','');
await writeFile('site-dist/index.html',`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=/gallery-pulse/">
<link rel="canonical" href="https://moris-kr.github.io/gallery-pulse/">
<title>갤러리 펄스로 이동</title>
</head>
<body><a href="/gallery-pulse/">갤러리 펄스 열기</a></body>
</html>
`);
