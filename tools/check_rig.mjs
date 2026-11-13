import { spawn } from 'child_process';
import { rmSync, mkdirSync } from 'fs';

const userDir = 'C:\\Users\\Romas\\AppData\\Local\\Temp\\chrome_chk';
rmSync(userDir, { recursive: true, force: true });
mkdirSync(userDir, { recursive: true });

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--remote-debugging-port=9222',
    '--user-data-dir=' + userDir,
    '--headless=new',
    '--disable-gpu',
    'http://127.0.0.1:8085/index.html'
]);

try {
    let page = null;
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch('http://127.0.0.1:9222/json');
            const list = await res.json();
            page = list.find(t => t.type === 'page');
            if (page) break;
        } catch {}
        await new Promise(r => setTimeout(r, 200));
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 1;
    function send(method, params = {}) {
        return new Promise(resolve => {
            const id = msgId++;
            const handler = (event) => {
                const data = JSON.parse(event.data);
                if (data.id === id) {
                    ws.removeEventListener('message', handler);
                    resolve(data.result);
                }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });
    }
    await new Promise(r => ws.onopen = r);

    for (let i = 0; i < 40; i++) {
        const evalRes = await send('Runtime.evaluate', {
            expression: 'Boolean(window.BATTLE_ENGINE && window.BATTLE_ENGINE.ready && window.BATTLE_ENGINE.instance)',
            returnByValue: true
        });
        if (evalRes?.result?.value) break;
        await new Promise(r => setTimeout(r, 500));
    }

    await send('Runtime.evaluate', {
        expression: "document.getElementById('btn-faction-ru').click();"
    });
    await new Promise(r => setTimeout(r, 1500));

    const rigInfo = await send('Runtime.evaluate', {
        expression: `
            (() => {
                const e = window.BATTLE_ENGINE.instance;
                const rig = e.viewmodelRoot.getObjectByName('fp_arms_rig');
                const cam = e.camera;
                const list = [];
                const inst = e.assets.instantiateSkinned('soldier_ru', 1.82);
                let wrR;
                inst.model.traverse(o => {
                    if (o.isBone && o.name?.includes('RightHand') && !o.name?.includes('Thumb') && !o.name?.includes('Index') && !o.name?.includes('Middle')) {
                        wrR = o;
                    }
                });
                let gloveMesh;
                inst.model.traverse(o => {
                    if (o.name?.includes('11006') && !o.name?.includes('LOD')) gloveMesh = o;
                });
                inst.model.updateMatrixWorld(true);
                const invWr = wrR.matrixWorld.clone().invert();
                const geom = gloveMesh.geometry;
                const pos = geom.attributes.position;
                const skinIdx = geom.attributes.skinIndex;
                const skinW = geom.attributes.skinWeight;
                const bones = gloveMesh.skeleton.bones;
                const wrIdx = bones.indexOf(wrR);

                const palmVerts = [];
                const v = new THREE.Vector3();
                for (let i = 0; i < pos.count; i++) {
                    let w = 0;
                    for (const c of ['getX', 'getY', 'getZ', 'getW']) {
                        if (skinIdx[c](i) === wrIdx) w += skinW[c](i);
                    }
                    if (w > 0.6) {
                        v.fromBufferAttribute(pos, i);
                        gloveMesh.localToWorld(v);
                        v.applyMatrix4(invWr);
                        palmVerts.push(v.clone());
                    }
                }
                const box = new THREE.Box3().setFromPoints(palmVerts);
                return {
                    wrIdx,
                    vertCount: palmVerts.length,
                    min: [box.min.x.toFixed(3), box.min.y.toFixed(3), box.min.z.toFixed(3)],
                    max: [box.max.x.toFixed(3), box.max.y.toFixed(3), box.max.z.toFixed(3)]
                };
            })()
        `,
        returnByValue: true
    });
    console.log('Rig info:', JSON.stringify(rigInfo?.result?.value, null, 2));

} finally {
    chrome.kill();
}
