const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { PNG } = require("pngjs");
function expectPrintedCloth(buffer) {
  const png = PNG.sync.read(buffer);
  let fabric = 0;
  let ink = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const luminance = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
    if (luminance < 245) fabric++;
    if (luminance < 120) ink++;
  }
  expect(fabric / (png.width * png.height)).toBeGreaterThan(0.6);
  expect(ink / (png.width * png.height)).toBeGreaterThan(0.01);
}

test("cloth renders at high resolution with native contact information", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await expect(banner.locator(".banner-rod")).toBeVisible();
  await expect(banner.locator(".banner-cord")).toHaveCount(2);
  await expect(banner.locator(".author__name")).toContainText("Zou");
  await expect(banner.locator(".banner-email-address")).toHaveText("jz3331@columbia.edu");
  await expect(banner.locator(".banner-links a")).toHaveCount(5);
  const density = await banner.locator("canvas").evaluate((canvas) => canvas.width / canvas.getBoundingClientRect().width);
  expect(density).toBeGreaterThanOrEqual(1.99);
  expectPrintedCloth(await banner.locator("canvas").screenshot({ animations: "disabled" }));
  // Check the real material silhouette, rather than a stationary CSS mask.
  const material = await banner.locator("canvas").evaluate((canvas) => ({
    image: canvas.toDataURL().split(",")[1],
    width: canvas.getBoundingClientRect().width - 32,
    height: canvas.getBoundingClientRect().height - 32,
    density: canvas.width / canvas.getBoundingClientRect().width,
  }));
  const pixels = PNG.sync.read(Buffer.from(material.image, "base64"));
  const alpha = (x, y) => pixels.data[(Math.round(y * material.density) * pixels.width + Math.round(x * material.density)) * 4 + 3];
  const hemY = 16 + material.height * 0.96 - 12;
  expect(alpha(16 + material.width * 0.08, hemY)).toBeLessThan(10);
  expect(alpha(16 + material.width * 0.5, hemY)).toBeGreaterThan(240);
  await banner.screenshot({ path: path.join("output/playwright", `profile-banner-${testInfo.project.name}.png`) });
});

test("pressure bends every part of the cloth, including links, and releases naturally", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "mouse pressure is enhanced for fine pointers");
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  const cloth = banner.locator(".banner-cloth");
  const box = await cloth.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.28);
  await expect(banner).toHaveAttribute("data-banner-state", "hover");
  await expect.poll(async () => Number(await banner.getAttribute("data-cloth-depth"))).toBeGreaterThan(18);
  for (const name of ["Google Scholar", "GitHub", "Curriculum Vitae"]) {
    const link = banner.getByRole("link", { name, exact: true });
    const bounds = await link.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 5 });
    await expect(banner).toHaveAttribute("data-banner-state", "hover");
    await expect.poll(async () => Number(await banner.getAttribute("data-cloth-depth"))).toBeGreaterThan(18);
  }
  await banner.screenshot({ path: path.join("output/playwright", "profile-banner-hover.png") });
  await page.mouse.move(900, 400);
  await expect(banner).toHaveAttribute("data-banner-state", "settling");
  await expect(banner).toHaveAttribute("data-banner-state", "idle");
  await expect(banner).toHaveAttribute("data-cloth-depth", "0.00");
});

test("clicking a moving printed link activates its native anchor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "mouse hit testing during cloth pressure");
  await page.route("**/assets/pdf/cv.pdf", (route) => route.fulfill({ contentType: "text/html", body: "<h1>CV opened</h1>" }));
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  const cv = banner.getByRole("link", { name: "Curriculum Vitae" });
  const initial = await cv.boundingBox();
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await expect(banner).toHaveAttribute("data-banner-state", "hover");
  await expect.poll(async () => Number(await banner.getAttribute("data-cloth-depth"))).toBeGreaterThan(18);
  const moving = await cv.boundingBox();
  await page.mouse.click(moving.x + moving.width / 2, moving.y + moving.height / 2);
  await expect(page.getByRole("heading", { name: "CV opened" })).toBeVisible();
  await expect(page).toHaveURL(/\/assets\/pdf\/cv\.pdf$/);
});

test("small intermittent gusts settle and offscreen motion stops", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one timing check covers shared wind physics");
  await page.clock.install();
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await expect(banner).toHaveAttribute("data-banner-state", "idle");
  await page.clock.runFor(3500);
  await expect(banner).toHaveAttribute("data-banner-state", "wind");
  const depth = Number(await banner.getAttribute("data-cloth-depth"));
  expect(depth).toBeGreaterThan(0);
  expect(depth).toBeLessThan(8);
  await page.clock.runFor(10000);
  await expect(banner).toHaveAttribute("data-banner-state", "idle");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".paper-box").last().scrollIntoViewIfNeeded();
  await page.clock.runFor(500);
  await expect(banner).toHaveAttribute("data-banner-state", "paused");
});

test("reduced motion stays still and keyboard users get visible native links", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await banner.hover();
  await expect(banner).toHaveAttribute("data-banner-state", "paused");
  await expect(banner).toHaveAttribute("data-cloth-depth", "0.00");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const email = banner.locator('a[href^="mailto:"]');
  await email.focus();
  await expect(email).toBeFocused();
  await expect(banner).toHaveAttribute("data-banner-state", "paused");
  expect(await banner.locator(".banner-fabric").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(await email.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
});

test("mouse pressure still works without graphics acceleration", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop mouse interaction with the software renderer");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === "webgl" ? null : original.call(this, kind, ...args);
    };
  });
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await expect(banner).toHaveAttribute("data-cloth-renderer", "canvas");
  const link = banner.getByRole("link", { name: "GitHub", exact: true });
  const bounds = await link.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(banner).toHaveAttribute("data-banner-state", "hover");
  await expect.poll(async () => Number(await banner.getAttribute("data-cloth-depth"))).toBeGreaterThan(18);
  expectPrintedCloth(await banner.locator("canvas").screenshot({ animations: "disabled" }));
  await banner.screenshot({ path: path.join("output/playwright", "profile-banner-software.png") });
  await banner.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "rolled");
  expect((await banner.boundingBox()).height).toBeLessThan(120);
  await banner.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
});

test("lost graphics context preserves contacts and cloth interaction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop graphics context recovery");
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await expect(banner).toHaveAttribute("data-cloth-renderer", "webgl");
  await banner.locator("canvas").evaluate((canvas) => canvas.getContext("webgl").getExtension("WEBGL_lose_context").loseContext());
  const link = banner.getByRole("link", { name: "Google Scholar", exact: true });
  const bounds = await link.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(banner).toHaveAttribute("data-cloth-renderer", "canvas");
  await expect(banner).toHaveAttribute("data-banner-state", "hover");
  await expect.poll(async () => Number(await banner.getAttribute("data-cloth-depth"))).toBeGreaterThan(18);
  await expect(banner.locator(".banner-links a")).toHaveCount(5);
  expectPrintedCloth(await banner.locator("canvas").screenshot({ animations: "disabled" }));
});

test("scroll rolls into one cylinder and unrolls with usable contacts", async ({ page }, testInfo) => {
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
  const expanded = await banner.boundingBox();
  if (testInfo.project.name === "desktop") expect(expanded.width).toBeGreaterThanOrEqual(250);
  const toggle = banner.locator("[data-scroll-grip]");
  await expect(toggle).toHaveAccessibleName("Roll up profile scroll");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(banner.locator("button")).toHaveCount(0);
  await banner.locator(".author__avatar").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "rolled");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await banner.boundingBox()).height).toBeLessThan(120);
  expect(await page.locator("#profile-scroll").evaluate((element) => element.inert)).toBe(true);
  await banner.screenshot({ path: path.join("output/playwright", `scroll-rolled-${testInfo.project.name}.png`), animations: "disabled" });
  await banner.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
  expect(Math.abs((await banner.boundingBox()).height - expanded.height)).toBeLessThan(2);
  expect(await page.locator("#profile-scroll").evaluate((element) => element.inert)).toBe(false);
  await expect(banner.locator(".banner-links a")).toHaveCount(5);
  await banner.locator('a[href^="mailto:"]').focus();
  await expect(banner.locator('a[href^="mailto:"]')).toBeFocused();
});

test("rolling can reverse midway and reduced motion changes it immediately", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one animation timeline covers the shared roll controller");
  await page.clock.install();
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
  await banner.locator("[data-scroll-grip]").click();
  await page.clock.runFor(350);
  const progress = Number(await banner.getAttribute("data-scroll-progress"));
  expect(progress).toBeGreaterThan(0);
  expect(progress).toBeLessThan(1);
  await banner.locator("[data-scroll-grip]").click();
  await page.clock.runFor(4000);
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await banner.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "rolled");
  await expect(banner).toHaveAttribute("data-scroll-progress", "1.000");
  await banner.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
  await expect(banner).toHaveAttribute("data-scroll-progress", "0.000");
});
