import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("exports an MP4 artifact from the motion composer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Export resolution" }).selectOption("720");
  await page.getByRole("button", { name: "＋ Add text" }).click();
  await page.getByRole("textbox", { name: "Text box content" }).fill("Built for the long game");
  await page.getByRole("textbox", { name: "Text box content" }).blur();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download video" }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toMatch(/\.mp4$/);
  expect((await artifact.createReadStream())?.readable).toBeTruthy();
});

test("offers scaled export resolutions", async ({ page }) => {
  await page.goto("/");
  const resolution = page.getByRole("combobox", { name: "Export resolution" });
  await expect(resolution).toHaveValue("1080");
  await resolution.selectOption("2160");
  await expect(resolution).toHaveValue("2160");
  await expect(resolution.locator("option")).toHaveText(["720p", "1080p", "4K"]);
});

test("uses a lightweight preview render surface", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator(".preview-render-canvas");
  await expect(canvas).toBeVisible();
  const dimensions = await canvas.evaluate((node) => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }));
  expect(dimensions.width).toBeLessThanOrEqual(540);
  expect(dimensions.height).toBeLessThanOrEqual(960);
});

test("uses the Aurelius Video Studio identity and fits the stage inside a laptop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await expect(page).toHaveTitle("Aurelius Video Studio");
  await expect(page.getByRole("heading", { name: "Aurelius Video Studio" })).toBeVisible();
  const stage = await page.getByTestId("motion-stage").boundingBox();
  expect(stage).not.toBeNull();
  expect(stage!.y + stage!.height).toBeLessThanOrEqual(800);
});

test("uses public assets as reusable backdrops and overlays", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add AppStore.svg to canvas" }).click();
  await expect(page.getByTestId("motion-stage").locator(".overlay-item img[alt='AppStore.svg']")).toBeVisible();
  await expect(page.locator(".motion-backdrop-image")).toHaveCount(0);
});

test("renders exports at 60 frames per second through the full clip", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.addEventListener("aurelius:export-frame", ((event: CustomEvent<{ frame: number; fps: number }>) => {
      document.body.dataset.exportFps = String(event.detail.fps);
      document.body.dataset.exportFrames = String(event.detail.frame);
    }) as EventListener);
  });
  await page.getByRole("combobox", { name: "Export resolution" }).selectOption("720");
  const seconds = Number(await page.getByRole("spinbutton", { name: "Clip length in seconds" }).inputValue());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download video" }).click();
  await download;
  await expect(page.locator("body")).toHaveAttribute("data-export-fps", "60");
  const frames = Number(await page.locator("body").getAttribute("data-export-frames"));
  expect(frames).toBeGreaterThanOrEqual(Math.floor(seconds * 60) - 1);
});

test("downloads a decodable MP4 with the real background and a completed animation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Entry duration in seconds" }).fill("2.2");
  await page.getByRole("spinbutton", { name: "Clip length in seconds" }).fill("4");
  const expectedDuration = Number(await page.getByRole("spinbutton", { name: "Clip length in seconds" }).inputValue());
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download video" }).click();
  const download = await pending, path = await download.path();
  expect(path).toBeTruthy();
  const encoded = (await readFile(path!)).toString("base64");
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Exported MP4 did not decode")); });
    const canvas = document.createElement("canvas"), width = 180, height = 320, context = canvas.getContext("2d")!;
    canvas.width = width; canvas.height = height;
    const sample = async (time: number) => {
      await new Promise<void>((resolve, reject) => { video.onseeked = () => resolve(); video.onerror = () => reject(new Error("Could not seek exported MP4")); video.currentTime = time; });
      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const cornerBrightness = pixels[0]! + pixels[1]! + pixels[2]!;
      let darkPixels = 0;
      for (let y = 95; y < 225; y += 1) for (let x = 18; x < 162; x += 1) {
        const offset = (y * width + x) * 4;
        if (pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]! < 360) darkPixels += 1;
      }
      return { cornerBrightness, darkPixels };
    };
    const result = { duration: video.duration, first: await sample(.02), last: await sample(Math.max(.02, video.duration - .04)) };
    URL.revokeObjectURL(url);
    return result;
  }, encoded);
  expect(decoded.duration).toBeGreaterThanOrEqual(expectedDuration - .05);
  expect(decoded.duration).toBeLessThan(expectedDuration + .15);
  expect(decoded.first.cornerBrightness).toBeGreaterThan(600);
  expect(decoded.last.cornerBrightness).toBeGreaterThan(600);
  expect(decoded.last.darkPixels).toBeGreaterThan(decoded.first.darkPixels + 40);
});

test("exports moving video backdrops instead of black frames", async ({ page }) => {
  await page.goto("/");
  const source = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
    canvas.width = 180; canvas.height = 320;
    const stream = canvas.captureStream(30), chunks: Blob[] = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType })); });
    recorder.start();
    for (let frame = 0; frame < 24; frame += 1) {
      context.fillStyle = frame < 12 ? "#D02020" : "#2050D0";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#FFFFFF"; context.fillRect(frame * 7, 130, 26, 60);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    recorder.stop(); stream.getTracks().forEach((track) => track.stop());
    const blob = await done, bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return { base64: btoa(binary), type: blob.type };
  });
  await page.locator(".media-drop input").setInputFiles({ name: "moving.webm", mimeType: source.type, buffer: Buffer.from(source.base64, "base64") });
  const editor = page.getByRole("dialog", { name: "Edit backdrop" });
  await expect(editor.getByText(/seconds selected/)).toBeVisible();
  await editor.getByRole("button", { name: "Next: frame" }).click();
  await editor.getByRole("button", { name: "Done" }).click();
  await page.getByRole("combobox", { name: "Export resolution" }).selectOption("1080");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download video" }).click();
  const download = await pending, path = await download.path(), encoded = (await readFile(path!)).toString("base64");
  const samples = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)), url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" })), video = document.createElement("video");
    video.muted = true; video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Video-backdrop export did not decode")); });
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!; canvas.width = 90; canvas.height = 160;
    const sample = async (time: number) => { await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = time; }); context.drawImage(video, 0, 0, 90, 160); const pixel = context.getImageData(3, 3, 1, 1).data; return [pixel[0], pixel[1], pixel[2]]; };
    const result = [await sample(.08), await sample(video.duration - .08)]; URL.revokeObjectURL(url); return result;
  }, encoded);
  expect(samples[0]!.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(100);
  expect(samples[1]!.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(100);
  expect(Math.abs(samples[0]![0]! - samples[1]![0]!) + Math.abs(samples[0]![2]! - samples[1]![2]!)).toBeGreaterThan(40);
});

test("keeps export prominent and can remove header and footer", async ({ page }) => {
  await page.goto("/");
  const header = page.locator(".composer-stage > header");
  await expect(header.getByRole("button", { name: "Download video" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Show header and footer" }).uncheck();
  await expect(page.locator(".stage-header")).toBeHidden();
  await expect(page.locator(".stage-footer")).toBeHidden();
});

test("keeps the lightweight preview fluid and clears an image selection on blank canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".preview-render-canvas")).toHaveAttribute("data-preview-fps", "60");
  const stage = page.getByTestId("motion-stage");
  await stage.evaluate((element) => { const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'], "selection.svg", { type: "image/svg+xml" }), transfer = new DataTransfer(); transfer.items.add(file); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  const overlay = stage.locator(".overlay-item");
  await overlay.click();
  await expect(overlay).toHaveClass(/selected/);
  await stage.click({ position: { x: 8, y: 8 } });
  await expect(overlay).not.toHaveClass(/selected/);
});

test("adds a selectable, draggable text box with focused controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Text settings")).toHaveCount(0);
  await page.getByRole("button", { name: "＋ Add text" }).click();
  await expect(page.getByText("Text settings")).toBeVisible();
  const box = page.getByLabel("Text box A line worth remembering");
  await expect(box).toBeVisible();
  await box.click();
  await expect(box).toHaveAttribute("contenteditable", "true");
  await box.fill("A sharper line");
  await box.blur();
  await expect(page.getByLabel("Text box A sharper line")).toBeVisible();
  await page.getByRole("combobox", { name: "Text box entrance" }).selectOption("impact");
  await page.getByRole("checkbox", { name: "Lock text box position" }).check();
  await expect(page.getByLabel("Text box A sharper line")).toHaveClass(/locked/);
  await page.locator(".duplicate-text-box").click();
  await expect(page.locator(".text-box")).toHaveCount(2);
});

test("removes an image overlay from its visible remove control", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("motion-stage");
  await stage.evaluate((element) => { const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>'], "remove-me.svg", { type: "image/svg+xml" }), transfer = new DataTransfer(); transfer.items.add(file); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await expect(stage.locator(".overlay-item")).toHaveCount(1);
  await stage.locator(".overlay-item").hover();
  await stage.getByRole("button", { name: "Remove remove-me.svg" }).click();
  await expect(stage.locator(".overlay-item")).toHaveCount(0);
});

test("restores the current motion graphic after a reload", async ({ page }) => {
  await page.goto("/");
  const title = page.locator(".title-editor");
  await title.click();
  await title.evaluate((node) => { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents(node); selection?.removeAllRanges(); selection?.addRange(range); });
  await page.keyboard.type("Make the work impossible to ignore.");
  await page.getByRole("combobox").first().focus();
  await page.reload();
  await expect(page.locator(".title-editor")).toHaveText("Make the work impossible to ignore.");
});

test("restores a locally uploaded backdrop after a reload", async ({ page }) => {
  await page.goto("/");
  await page.locator(".media-drop input").setInputFiles({ name: "saved-backdrop.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#8B5E34"/></svg>') });
  await expect(page.locator(".preview-render-canvas")).toBeVisible();
  await page.reload();
  await expect(page.locator(".preview-render-canvas")).toBeVisible();
});

test("uses Command-H to apply the default accent highlight", async ({ page }) => {
  await page.goto("/");
  const title = page.locator(".title-editor");
  await title.click();
  await title.evaluate((node) => { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents(node); selection?.removeAllRanges(); selection?.addRange(range); });
  await page.keyboard.press("Meta+h");
  await expect.poll(() => page.getByTestId("motion-stage").locator(".phrase-accent").count()).toBeGreaterThan(0);
});

test("restarts the live preview with the chosen timing", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("motion-stage"), copy = stage.locator(".stage-copy");
  await copy.evaluate((node) => node.setAttribute("data-before-timing-change", "true"));
  const entry = page.getByRole("spinbutton", { name: "Entry duration in seconds" });
  await entry.fill("2.8");
  await expect(copy).not.toHaveAttribute("data-before-timing-change", "true");
  await expect(copy.locator("span").first()).toHaveCSS("animation-duration", "2.8s");
  const stagger = page.getByRole("spinbutton", { name: "Word stagger in milliseconds" });
  await stagger.fill("400");
  await expect.poll(() => copy.locator("span").evaluateAll((spans) => spans.map((span) => getComputedStyle(span).animationDelay))).toContain("0.4s");
});

test("keeps a clip long enough for its final word to finish", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Entry duration in seconds" }).fill("2.8");
  await page.getByRole("spinbutton", { name: "Word stagger in milliseconds" }).fill("400");
  await expect(page.getByRole("spinbutton", { name: "Clip length in seconds" })).not.toHaveValue("3");
});

test("can use a static composition with no text animation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /None Static composition/ }).click();
  const copy = page.getByTestId("motion-stage").locator(".stage-copy");
  await expect(copy).toHaveClass(/motion-none/);
  await expect(copy.locator("span").first()).toHaveCSS("animation-name", "none");
});

test("makes a stable animated text graphic over an uploaded backdrop", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("motion-stage");
  await expect(stage).toBeVisible();
  await stage.getByRole("button", { name: "Pause preview" }).click();
  await expect(stage.getByRole("button", { name: "Play preview" })).toBeVisible();
  await stage.getByRole("button", { name: "Play preview" }).click();
  await expect(stage.getByRole("button", { name: "Pause preview" })).toBeVisible();
  await page.waitForTimeout(150);
  const replayDelays = await stage.locator(".stage-copy span").evaluateAll((words) => [...new Set(words.map((word) => getComputedStyle(word).animationDelay))]);
  expect(replayDelays.length).toBeGreaterThan(1);
  await expect(stage.locator(".title-editor[contenteditable=true]")).toHaveCount(1);
  await expect(stage.locator(".stage-copy [contenteditable=true]")).toHaveCount(0);
  const titleBox = page.locator(".title-editor");
  await titleBox.click();
  await titleBox.evaluate((node) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type("Move with purpose  every day");
  await page.locator(".composer-stage > header > select").focus();
  await expect.poll(() => titleBox.evaluate((node) => node.textContent)).toBe("Move with purpose  every day");
  await page.getByText("Fine tune text", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Animate each word" })).toBeChecked();
  await page.waitForTimeout(150);
  const wordDelays = await stage.locator(".stage-copy span").evaluateAll((words) => [...new Set(words.map((word) => getComputedStyle(word).animationDelay))]);
  expect(wordDelays.length).toBeGreaterThan(1);
  await page.getByRole("textbox", { name: "Highlight phrase" }).fill("purpose");
  await page.getByRole("checkbox", { name: "Color" }).check();
  await expect(stage.locator(".phrase-accent")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Glow" }).check();
  await page.getByRole("checkbox", { name: "Delayed start" }).check();
  await expect(stage.locator(".phrase-glow.phrase-delay")).toHaveCount(1);
  await page.getByRole("button", { name: "Lower" }).click();
  await expect.poll(() => stage.locator(".stage-copy").evaluate((node) => node.style.top)).toBe("68%");
  await page.getByRole("checkbox", { name: "Show platform safe zones" }).check();
  await expect(stage.locator(".safe-zones")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download cover" })).toBeVisible();
  const entrySeconds = page.getByRole("spinbutton", { name: "Entry duration in seconds" });
  await expect(entrySeconds).toHaveValue("1.4");
  await entrySeconds.fill("1.5");
  await entrySeconds.press("Tab");
  await expect(stage).toHaveCSS("--speed", "1.5s");
  const staggerSeconds = page.getByRole("spinbutton", { name: "Word stagger in milliseconds" });
  await staggerSeconds.fill("450");
  await staggerSeconds.press("Tab");
  await expect(staggerSeconds).toHaveValue("450");
  const letterSpacing = page.getByRole("slider", { name: "Letter spacing" });
  await letterSpacing.press("ArrowRight");
  await expect(stage).toHaveCSS("--tracking", "-0.05em");
  await page.getByRole("button", { name: /Revert fine tuning to defaults/ }).click();
  await expect(entrySeconds).toHaveValue("1.4");
  await expect(stage).toHaveCSS("--tracking", "-0.055em");
  const reelBox = await stage.boundingBox();
  const previewFontSize = await page.locator(".stage-copy").evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  expect(previewFontSize).toBeCloseTo(reelBox!.width * 88 / 1080, 1);
  await page.locator(".composer-stage > header > select").selectOption("portrait");
  const portraitBox = await stage.boundingBox();
  expect(portraitBox!.width / portraitBox!.height).toBeGreaterThan(reelBox!.width / reelBox!.height);
  await page.getByRole("textbox", { name: "Text color hex" }).fill("#D4AF37");
  await expect(stage).toHaveCSS("--ink", "#D4AF37");
  const token = await stage.evaluate((node) => { node.setAttribute("data-instance", crypto.randomUUID()); return node.getAttribute("data-instance"); });

  const rise = page.getByRole("button", { name: /Editorial rise/ });
  await expect(rise.locator("span")).toHaveCSS("animation-name", "none");
  await rise.hover();
  await expect(rise.locator("span")).toHaveCSS("animation-name", "preview-rise");
  await page.getByRole("button", { name: /Type-on/ }).click();
  await page.waitForTimeout(2500);
  const typeFontSize = await page.locator(".stage-copy").evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  const firstTypedWordWidth = await page.locator(".stage-copy > div").first().locator("span").first().evaluate((word) => word.getBoundingClientRect().width);
  expect(firstTypedWordWidth).toBeLessThan(typeFontSize * 3);
  await page.getByRole("button", { name: /Impact/ }).click();
  await expect(stage).toHaveAttribute("data-instance", token!);

  await page.locator(".media-drop input").setInputFiles({ name: "backdrop.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#8B5E34"/></svg>') });
  await expect(stage.locator(".preview-render-canvas")).toBeVisible();
  await expect(stage.locator(".stage-copy")).toContainText("Move with purpose");
  await stage.evaluate((element) => { const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><circle cx="100" cy="50" r="45" fill="#D4AF37"/></svg>'], "badge.svg", { type: "image/svg+xml" }), transfer = new DataTransfer(); transfer.items.add(file); element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); });
  await expect(stage.locator(".overlay-item img[alt='badge.svg']")).toBeVisible();
  await stage.locator(".overlay-item").hover();
  await expect(stage.getByRole("button", { name: "Resize badge.svg" })).toBeVisible();
  await stage.locator(".overlay-item").click();
  await page.keyboard.press("Backspace");
  await expect(stage.locator(".overlay-item")).toHaveCount(0);
  await page.getByRole("button", { name: "✎ Crop backdrop" }).click();
  const backdropEditor = page.getByRole("dialog", { name: "Edit backdrop" });
  await expect(backdropEditor).toBeVisible();
  await expect(backdropEditor.getByText("Frame your image")).toBeVisible();
  await backdropEditor.getByRole("button", { name: "Show full video" }).click();
  await expect(stage).toHaveClass(/fit-contain/);
  await backdropEditor.getByRole("button", { name: "Done" }).click();
  await expect(backdropEditor).toBeHidden();
  await stage.getByRole("button", { name: "Crop backdrop" }).click();
  await expect(backdropEditor).toBeVisible();
  await backdropEditor.getByRole("button", { name: "Close backdrop editor" }).click();
  await page.locator('input[type="range"]').first().press("ArrowRight");
  await expect(stage.locator(".preview-render-canvas")).toBeVisible();
  await page.getByRole("button", { name: "+ Scene" }).click();
  await expect(page.locator(".scene-strip button")).toHaveCount(2);
});
