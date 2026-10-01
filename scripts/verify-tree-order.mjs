import {rolldown} from 'rolldown';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const out=resolve('scripts/balance/.cache/verify-tree-order.mjs');
const bundle=await rolldown({input:'scripts/verify-tree-order.ts',platform:'node',logLevel:'silent'});
await bundle.write({file:out,format:'esm'});await bundle.close();await import(pathToFileURL(out).href);
