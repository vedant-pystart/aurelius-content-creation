import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.setTimeout(120_000);

test('captures the decoded MP4 frame from the reported quote', async ({ page }) => {
  const pixels = await exportPixels(page, 'wipe', true);
  expect(pixels.filter((value, i) => i % 4 !== 3 && value > 150).length).toBeGreaterThan(1000);
});

async function exportPixels(page: Page, motion: string, showChrome: boolean, resolution = '1080', sampleTime?: number) {
  await page.goto('/');
  await page.evaluate(({ motion, showChrome }) => {
    const project = JSON.parse(localStorage.getItem('aurelius-motion-project-v1')!);
    Object.assign(project.scenes[0], { title: 'Rest is not\nfalling behind.', motion, showChrome, background: '#12110F', textColor: '#F9E9B4', fontSize: 140, hold: 3, speed: 1.4, stagger: 90 });
    localStorage.setItem('aurelius-motion-project-v1', JSON.stringify(project));
  }, { motion, showChrome });
  await page.reload();
  await page.getByRole('combobox', { name: 'Export resolution' }).selectOption(resolution);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download video', exact: true }).click();
  const download = await pending;
  const bytes = (await readFile((await download.path())!)).toString('base64');
  const decoded = await page.evaluate(async ({ bytes, sampleTime }) => {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type: 'video/mp4' }));
    const video = document.createElement('video'); video.muted = true;
    const ready = new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('MP4 decode failed')); });
    video.src = url; await ready;
    const seek = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
    video.currentTime = sampleTime ?? video.duration - .05; await seek;
    const canvas = document.createElement('canvas'); canvas.width = 270; canvas.height = 480;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0, 270, 480);
    const pixels = Array.from(ctx.getImageData(0, 140, 270, 220).data);
    const png = canvas.toDataURL('image/png');
    URL.revokeObjectURL(url); return { pixels, png };
  }, { bytes, sampleTime });
  if (motion === 'wipe' && showChrome && !sampleTime) {
    await test.info().attach('decoded-final-wipe', { body: Buffer.from(decoded.png.split(',')[1]!, 'base64'), contentType: 'image/png' });
  }
  return decoded.pixels;
}

for (const showChrome of [true, false]) {
  test('completed masks match the full static text, chrome=' + showChrome, async ({ page }) => {
    const reference = await exportPixels(page, 'none', showChrome);
    for (const motion of ['wipe', 'reveal', 'type', 'rise', 'cascade', 'impact', 'drift', 'zoom', 'blur-pop', 'bounce', 'glitch', 'fade']) {
      const pixels = await exportPixels(page, motion, showChrome);
      const meanError = pixels.reduce((sum, value, i) => sum + Math.abs(value - reference[i]!), 0) / pixels.length;
      expect(meanError, motion + ' must leave all final letters visible').toBeLessThan(1);
    }
  });
}

for (const resolution of ['720', '1080', '2160']) {
  test('header drawing cannot change a midway wipe at ' + resolution, async ({ page }) => {
    const reference = await exportPixels(page, 'wipe', false, resolution, .7);
    const pixels = await exportPixels(page, 'wipe', true, resolution, .7);
    const meanError = pixels.reduce((sum, value, i) => sum + Math.abs(value - reference[i]!), 0) / pixels.length;
    expect(meanError).toBeLessThan(1);
  });
}
