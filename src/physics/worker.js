import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/+esm';
import { createPhysicsCore } from './core.js';

let core = null;
const backlog = [];

function handle(msg) {
    if (msg.type !== 'frame') return;
    core.frame(msg.cmds, msg.ctrl, msg.count, msg.dt, msg.snap);
    self.postMessage({ type: 'snap', snap: msg.snap, ctrl: msg.ctrl }, [msg.snap.buffer, msg.ctrl.buffer]);
}

self.onmessage = (e) => {
    if (!core) backlog.push(e.data);
    else handle(e.data);
};

RAPIER.init().then(() => {
    core = createPhysicsCore(RAPIER);
    self.postMessage({ type: 'ready' });
    for (const msg of backlog) handle(msg);
    backlog.length = 0;
}).catch((err) => {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
});
