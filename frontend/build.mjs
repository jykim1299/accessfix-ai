import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('dist',{recursive:true});
await build({entryPoints:['src/main.tsx'],bundle:true,outfile:'dist/app.js',minify:true,sourcemap:false,target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
await fs.copyFile('index.html','dist/index.html');
console.log('AccessFix UI built in frontend/dist');
