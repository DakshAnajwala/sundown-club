/** Makes the small WebP thumbnails the hub's game rail uses (the full pictures only load for the selected game). Run by hand when a media picture changes: node tools/make-thumbs.mjs */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const SRC = { blackjack: 'bj-clean.jpg', parking: 'rooftop-dusk.webp', holdem: 'holdem.jpg', videopoker: 'videopoker.jpg', racing: 'nightdrive.jpg' };
mkdirSync('apps/hub/media/thumbs', { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
for (const [id, file] of Object.entries(SRC)) {
  const mime = file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const data = readFileSync(`apps/hub/media/${file}`).toString('base64');
  const out = await p.evaluate(async (d, m) => {
    const img = new Image(); img.src = `data:${m};base64,${d}`; await img.decode();
    const w = 480, h = Math.round((img.naturalHeight / img.naturalWidth) * w);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/webp', 0.78).split(',')[1];
  }, data, mime);
  writeFileSync(`apps/hub/media/thumbs/${id}.webp`, Buffer.from(out, 'base64'));
  console.log(id, Math.round(Buffer.from(out, 'base64').length / 1024) + ' KB');
}
await b.close();
