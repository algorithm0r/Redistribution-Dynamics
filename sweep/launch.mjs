// launch.mjs — spawn N worker processes pointed at a coordinator.
//   node launch.mjs [N] [COORD_URL]
//   node launch.mjs 12                              # 12 workers -> localhost:8090
//   node launch.mjs 5 http://<coord-host>:8090      # e.g. on mint, pointing at the main box
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = parseInt(process.argv[2] || '12');
const COORD = process.argv[3] || process.env.COORD || 'http://localhost:8090';

console.log(`launching ${N} workers -> ${COORD}`);
for (let i = 0; i < N; i++) {
    const w = spawn('node', [path.join(HERE, 'worker.mjs'), COORD], { stdio: 'inherit' });
    w.on('exit', code => console.log(`worker ${i} exited (${code})`));
}
