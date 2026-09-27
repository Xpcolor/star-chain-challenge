import {build} from 'esbuild';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function prepareRenderer() {
  const entry=fileURLToPath(new URL('../dist/battle-scene.mjs',import.meta.url));
  if(!existsSync(entry))throw new Error('Missing battle scene source');
  await build({entryPoints:[entry],outfile:fileURLToPath(new URL('../dist/battle-scene.bundle.mjs',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
  const studio=fileURLToPath(new URL('../dist/asset-studio.mjs',import.meta.url));
  if(existsSync(studio))await build({entryPoints:[studio],outfile:fileURLToPath(new URL('../dist/asset-studio.bundle.mjs',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
  const sample=fileURLToPath(new URL('../dist/visual-sample.mjs',import.meta.url));
  if(existsSync(sample))await build({entryPoints:[sample],outfile:fileURLToPath(new URL('../dist/visual-sample.bundle.mjs',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
}
if(process.argv[1]===fileURLToPath(import.meta.url))await prepareRenderer();
