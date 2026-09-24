import { expect, test } from "@playwright/test";

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

test("uses public assets as reusable backdrops and overlays", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use AppStore.svg as backdrop" }).click();
  await expect(page.locator(".motion-backdrop-image")).toHaveAttribute("src", /\/assets\/AppStore\.svg$/);
  await page.getByRole("button", { name: "Add Whiteandbrowntitle.png as overlay" }).click();
  await expect(page.getByTestId("motion-stage").locator(".overlay-item img[alt='Whiteandbrowntitle.png']")).toBeVisible();
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
  await page.locator(".composer-stage > header").getByRole("combobox").focus();
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
  await page.locator(".composer-stage > header").getByRole("combobox").selectOption("portrait");
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
