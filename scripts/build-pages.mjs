import {cp,mkdir,writeFile} from 'node:fs/promises';

await mkdir('site-dist/gallery-pulse',{recursive:true});
await cp('public','site-dist/gallery-pulse',{recursive:true});
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
