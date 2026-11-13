import { spawn } from 'child_process';
import { rmSync, mkdirSync, writeFileSync } from 'fs';

const userDir = 'C:\\Users\\Romas\\AppData\\Local\\Temp\\chrome_inspect';
rmSync(userDir, { recursive: true, force: true });
mkdirSync(userDir, { recursive: true });

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--remote-debugging-port=9222',
    '--user-data-dir=' + userDir,
    '--headless=new',
    '--disable-gpu',
    '--mute-audio',
    '--window-size=1280,720',
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
        expression: 'document.getElementById("btn-faction-ru").click();'
    });
    await new Promise(r => setTimeout(r, 1500));

    for (let w = 0; w < 4; w++) {
        await send('Runtime.evaluate', {
            expression: `window.BATTLE_ENGINE.instance.switchWeapon(${w});`
        });
        // Wait 900ms for switch animation to finish completely
        await new Promise(r => setTimeout(r, 900));

        const wKey = (await send('Runtime.evaluate', {
            expression: `window.BATTLE_ENGINE.instance.loadoutKeys[${w}]`,
            returnByValue: true
        }))?.result?.value;

        let shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`shot_v5_hip_${wKey}.png`, Buffer.from(shot.data, 'base64'));
        console.log(`Saved shot_v5_hip_${wKey}.png`);

        await send('Runtime.evaluate', {
            expression: `window.BATTLE_ENGINE.instance.isAiming = true;`
        });
        await new Promise(r => setTimeout(r, 500));
        shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`shot_v5_ads_${wKey}.png`, Buffer.from(shot.data, 'base64'));
        console.log(`Saved shot_v5_ads_${wKey}.png`);
        await send('Runtime.evaluate', {
            expression: `window.BATTLE_ENGINE.instance.isAiming = false;`
        });
        await new Promise(r => setTimeout(r, 300));
    }

} finally {
    chrome.kill();
}
