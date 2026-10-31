const { test, expect } = require("@playwright/test");
const { PNG } = require("pngjs");

const pageColor = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const DAY = "rgb(255, 255, 255)";
const NIGHT = "rgb(16, 23, 31)";

async function clothLuminance(banner) {
  const image = await banner.locator("canvas").evaluate((canvas) => canvas.toDataURL().split(",")[1]);
  const png = PNG.sync.read(Buffer.from(image, "base64"));
  // Sample bare fabric just inside the left edge, below the sewn top sleeve.
  const offset = (Math.round(png.height * 0.5) * png.width + Math.round(png.width * 0.08)) * 4;
  expect(png.data[offset + 3]).toBeGreaterThan(240);
  return (png.data[offset] + png.data[offset + 1] + png.data[offset + 2]) / 3;
}

const canvasImage = async (banner) =>
  PNG.sync.read(Buffer.from(await banner.locator("canvas").evaluate((canvas) => canvas.toDataURL().split(",")[1]), "base64"));

function differingPixels(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(...[0, 1, 2, 3].map((channel) => Math.abs(a.data[i + channel] - b.data[i + channel]))) > 24) differing++;
  }
  return differing / (a.width * a.height);
}

test("the switch changes the theme and the choice survives navigation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const toggle = page.getByRole("switch", { name: "Night mode" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await pageColor(page)).toBe(DAY);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(await pageColor(page)).toBe(NIGHT);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", NIGHT);
  await page.goto("/publications/");
  expect(await pageColor(page)).toBe(NIGHT);
  await expect(page.getByRole("switch", { name: "Night mode" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Night mode" }).click();
  expect(await pageColor(page)).toBe(DAY);
  await page.reload();
  expect(await pageColor(page)).toBe(DAY);
  expect(errors).toEqual([]);
});

test("the system preference applies until a visitor chooses", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await pageColor(page)).toBe(NIGHT);
  const toggle = page.getByRole("switch", { name: "Night mode" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pageColor(page)).toBe(DAY);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => pageColor(page)).toBe(NIGHT);
  await toggle.click();
  expect(await pageColor(page)).toBe(DAY);
  // A saved choice outranks later system changes in the open page, not just after a reload.
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(250);
  expect(await pageColor(page)).toBe(DAY);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  expect(await pageColor(page)).toBe(DAY);
});

test("the theme is set before the stylesheet can paint", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  const script = html.indexOf("dataset.theme");
  expect(script).toBeGreaterThan(-1);
  expect(script).toBeLessThan(html.indexOf("assets/css/main.css"));
  expect(script).toBeLessThan(html.indexOf("</head>"));
  // It also must not depend on the deferred site script.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("**/assets/js/site.js", (route) => route.abort());
  await page.goto("/");
  expect(await pageColor(page)).toBe(NIGHT);
});

test("the cloth is dyed again by the switch in both directions, including while rolled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  const toggle = page.getByRole("switch", { name: "Night mode" });
  expect(await clothLuminance(banner)).toBeGreaterThan(180);
  await toggle.click();
  await expect.poll(() => clothLuminance(banner)).toBeLessThan(70);
  await toggle.click();
  await expect.poll(() => clothLuminance(banner)).toBeGreaterThan(180);
  await page.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "rolled");
  const rolledDay = await canvasImage(banner);
  await toggle.click();
  // Sampled before unrolling, because unrolling reprints the texture anyway.
  await expect.poll(async () => differingPixels(rolledDay, await canvasImage(banner))).toBeGreaterThan(0.01);
  await page.locator("[data-scroll-grip]").click();
  await expect(banner).toHaveAttribute("data-banner-scroll", "expanded");
  await expect.poll(() => clothLuminance(banner)).toBeLessThan(70);
});

// Uses normal motion deliberately: reduced motion already disables the template's
// text transitions, which would hide stale colors read in the middle of a fade.
test("switching prints the same ink as loading in night mode", async ({ page }) => {
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await page.getByRole("switch", { name: "Night mode" }).click();
  await expect.poll(() => clothLuminance(banner)).toBeLessThan(70);
  const switched = await canvasImage(banner);
  await page.reload();
  await expect(banner).toHaveClass(/cloth-rendered/);
  expect(differingPixels(switched, await canvasImage(banner))).toBeLessThan(0.001);
});

test("a system theme change leaves keyboard-focused links in place and still dyes the cloth", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  await page.keyboard.press("Tab");
  const email = banner.locator('a[href^="mailto:"]');
  await email.focus();
  await expect(banner).not.toHaveClass(/cloth-rendered/);
  const before = await email.boundingBox();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => pageColor(page)).toBe(NIGHT);
  expect((await email.boundingBox()).y).toBeCloseTo(before.y, 0);
  await expect(email).toHaveCSS("transform", "none");
  await email.evaluate((element) => element.blur());
  await expect(banner).toHaveClass(/cloth-rendered/);
  await expect.poll(() => clothLuminance(banner)).toBeLessThan(70);
});

test("night text meets contrast requirements", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const route of ["/", "/publications/", "/cv/", "/404.html"]) {
    await page.goto(route);
    const failures = await page.evaluate(() => {
      const channels = (value) => value.match(/[\d.]+/g).map(Number);
      const luminance = ([r, g, b]) => {
        const [a, c, d] = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * a + 0.7152 * c + 0.0722 * d;
      };
      const ratio = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const clothStop = channels(
        (() => {
          const probe = document.createElement("i");
          probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--banner-cloth-1");
          document.body.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        })()
      );
      const background = (element) => {
        if (element.closest(".banner-fabric")) return clothStop;
        for (let node = element; node; node = node.parentElement) {
          const color = channels(getComputedStyle(node).backgroundColor);
          if (color.length === 3 || color[3] > 0.99) return color.slice(0, 3);
        }
        return [255, 255, 255];
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const failed = [];
      for (let text; (text = walker.nextNode()); ) {
        const element = text.parentElement;
        if (!text.textContent.trim() || element.closest("svg, script, style, dialog, .skip-link, .browser-upgrade, .visually-hidden, .section-icon"))
          continue;
        if (!element.getClientRects().length) continue;
        const style = getComputedStyle(element);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const value = ratio(channels(style.color).slice(0, 3), background(element));
        if (value < (large ? 3 : 4.5))
          failed.push(`${element.className || element.tagName}: ${value.toFixed(2)} "${text.textContent.trim().slice(0, 30)}"`);
      }
      return failed;
    });
    expect(failures, route).toEqual([]);
  }
});

test("printing stays light and the switch needs JavaScript", async ({ page, browser, baseURL }) => {
  await page.emulateMedia({ colorScheme: "dark", media: "print" });
  await page.goto("/");
  expect(await pageColor(page)).toBe(DAY);
  expect(await page.locator(".page__content").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(55, 65, 81)");
  // The canvas keeps its screen pixels, so the native profile has to print instead.
  await expect(page.locator(".profile-banner")).toHaveClass(/cloth-rendered/);
  await expect(page.locator("[data-cloth-canvas]")).toBeHidden();
  await expect(page.locator(".banner-fabric")).toHaveCSS("opacity", "1");
  await expect(page.locator(".profile-banner .author__name")).toHaveCSS("color", "rgb(0, 0, 0)");
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const noScript = await context.newPage();
  await noScript.goto("/");
  await expect(noScript.locator("[data-theme-toggle]")).toBeHidden();
  await context.close();
});

test("the overflow menu survives a momentarily tiny window", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const menu = page.locator(".greedy-nav > button");
  await expect(menu).toBeHidden();
  // The template's updateNav never terminates if the nav measures narrower than its button.
  await page.setViewportSize({ width: 1, height: 800 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.setViewportSize({ width: 1366, height: 800 });
  await expect(menu).toBeHidden();
  await expect(page.locator(".visible-links li")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("the switch fits and works from the keyboard at every width", async ({ page }) => {
  for (const width of [280, 320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const toggle = page.getByRole("switch", { name: "Night mode" });
    await expect(toggle).toBeInViewport({ ratio: 1 });
    const box = await toggle.boundingBox();
    const nav = await page.locator(".visible-links").boundingBox();
    expect(nav.x + nav.width).toBeLessThanOrEqual(box.x + 1);
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Nothing, including the overflow menu button, may cover the switch.
    for (const x of [box.x + 2, box.x + box.width / 2, box.x + box.width - 2]) {
      expect(
        await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest("[data-theme-toggle]"), [x, box.y + box.height / 2])
      ).toBe(true);
    }
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
});
