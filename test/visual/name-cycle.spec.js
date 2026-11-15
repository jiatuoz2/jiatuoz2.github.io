const { test, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const { HOLD, DURATION } = require("../../assets/js/name-cycle.js");

const NATIVE = "邹家拓";

// How much ink the cloth canvas carries in the name's box: at its left end, which only the
// long English name reaches, in its middle, and along its top, which only the two-name print
// reaches (a single name sits in the middle of the box). The rows stop short of the box's
// edges, because a gust moves the print by a few pixels.
async function nameInk(page) {
  const banner = page.locator(".profile-banner");
  const shot = await banner.locator("canvas").evaluate((canvas) => {
    const frame = canvas.getBoundingClientRect();
    const box = document.querySelector(".profile-banner .author__name").getBoundingClientRect();
    const scale = canvas.width / frame.width;
    return {
      image: canvas.toDataURL().split(",")[1],
      x: (box.x - frame.x) * scale,
      // The first 12px of material are wound on the spindle, so the print sits that much higher.
      y: (box.y - frame.y - 12) * scale,
      width: box.width * scale,
      height: box.height * scale,
    };
  });
  const png = PNG.sync.read(Buffer.from(shot.image, "base64"));
  const count = (x0, x1, y0, y1) => {
    let ink = 0;
    for (let y = Math.round(shot.y + shot.height * y0); y < Math.round(shot.y + shot.height * y1); y++) {
      for (let x = Math.round(shot.x + shot.width * x0); x < Math.round(shot.x + shot.width * x1); x++) {
        const i = (y * png.width + x) * 4;
        if ((png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3 < 120) ink++;
      }
    }
    return ink;
  };
  return { leftEnd: count(0.13, 0.3, 0.3, 0.7), middle: count(0.4, 0.6, 0.3, 0.7), top: count(0.1, 0.9, 0.1, 0.2) };
}
// A gust bends and relights the print slightly, so held states are compared with a margin.
const expectSameInk = (actual, expected) => {
  for (const [region, value] of Object.entries(expected))
    expect(Math.abs(actual[region] - value), region).toBeLessThanOrEqual(Math.max(12, value * 0.25));
};
const ready = async (page) => {
  const banner = page.locator(".profile-banner");
  await expect(banner).toHaveClass(/cloth-rendered/);
  return banner;
};
// Stops the page's clock before the page loads. From then on time only moves when the test
// moves it, so every sample is taken at a known moment of the cycle however slow the machine.
const stopClock = async (page) => {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
};
// Jumps past the hold (firing its timer, with no frames drawn on the way), then runs the
// frames of one change and a little more.
const pastOneChange = async (page) => {
  await page.clock.fastForward(HOLD + 20);
  await page.clock.runFor(DURATION + 300);
};

test("both names are static text in the page, its title and its structured data", async ({ request, browser, baseURL }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(new RegExp(`<title>[^<]*Zou \\(${NATIVE}\\)[^<]*</title>`));
  expect(html).toMatch(new RegExp(`<meta name="description" content="[^"]*${NATIVE}`));
  expect(html).toMatch(new RegExp(`<meta property="og:title" content="[^"]*${NATIVE}`));
  // The site has no Chinese version, so nothing claims one.
  expect(html).not.toContain("og:locale:alternate");
  expect(html).toMatch(new RegExp(`<span class="author__name-native" lang="zh-Hans" itemprop="alternateName">\\s*${NATIVE}\\s*</span>`));
  const schema = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const person = schema["@graph"].find((node) => node["@type"] === "ProfilePage").mainEntity;
  expect(person.name).toBe('Jiatuo "Charlie" Zou');
  expect(person.alternateName).toEqual([NATIVE, "Jiatuo Zou", "Charlie Zou"]);
  expect(person.sameAs).toHaveLength(4);
  expect(person.url).toBe(new URL("/", person.image).href);
  // Empty verification keys print nothing, and only the 404 page is kept out of indexes.
  expect(html).not.toMatch(/site-verification|msvalidate/);
  expect(html).not.toContain('name="robots"');
  expect(await (await request.get("/404.html")).text()).toContain('<meta name="robots" content="noindex"');
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/^User-agent: \*\s+Disallow:\s+Sitemap: \S+\/sitemap\.xml\s*$/);

  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  const name = page.locator(".profile-banner .author__name");
  await expect(name.locator(".author__name-en")).toBeVisible();
  await expect(name.locator(".author__name-native")).toBeVisible();
  await expect(name).toHaveText(new RegExp(`Zou\\s*${NATIVE}`));
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(`Zou\\s*${NATIVE}`) })).toHaveCount(1);
  await expect(page.locator("#about-me + p")).toContainText(`Zou (${NATIVE})`);
  await context.close();
});

test("reduced motion prints both names once and never cycles", async ({ page }) => {
  await stopClock(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const banner = await ready(page);
  const name = banner.locator(".author__name");
  await expect(name).toHaveAttribute("data-name-cycle", "static");
  const before = await nameInk(page);
  expect(before.top).toBeGreaterThan(30);
  expect(before.middle).toBeGreaterThan(30);
  await pastOneChange(page);
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "static");
  expect(await nameInk(page)).toEqual(before);
  // The page text is the same two names, whatever the cloth shows.
  await expect(name).toHaveText(new RegExp(`Zou\\s*${NATIVE}`));
});

test("the name-cycle parameter holds one name, both names, or a moment of the change", async ({ page }) => {
  await stopClock(page);
  await page.goto("/?name-cycle=en");
  const banner = await ready(page);
  const name = banner.locator(".author__name");
  const height = (await name.boundingBox()).height;
  await expect(name).toHaveAttribute("data-name-cycle", "en");
  const english = await nameInk(page);
  expect(english.leftEnd).toBeGreaterThan(30);
  expect(english.top).toBe(0);

  await page.goto("/?name-cycle=native");
  await ready(page);
  await expect(name).toHaveAttribute("data-name-cycle", "native");
  const native = await nameInk(page);
  expect(native.leftEnd).toBe(0);
  expect(native.middle).toBeGreaterThan(30);
  await pastOneChange(page);
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "native");
  expectSameInk(await nameInk(page), native);
  expect((await name.boundingBox()).height).toBe(height);

  await page.goto("/?name-cycle=static");
  await ready(page);
  await expect(name).toHaveAttribute("data-name-cycle", "static");
  expect((await nameInk(page)).top).toBeGreaterThan(30);
  expect((await name.boundingBox()).height).toBe(height);

  await page.goto("/?name-cycle=native@0.5");
  await ready(page);
  await expect(name).toHaveAttribute("data-name-cycle", "en-native");
  const halfway = await nameInk(page);
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "en-native");
  expectSameInk(await nameInk(page), halfway);
});

test("the cloth swaps the visible name and back, leaving the page and banner state alone", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await stopClock(page);
  await page.goto("/");
  const banner = await ready(page);
  const name = banner.locator(".author__name");
  await expect(name).toHaveAttribute("data-name-cycle", "en");
  await expect(banner.locator("canvas")).toHaveCount(1);
  const height = (await banner.boundingBox()).height;
  const english = await nameInk(page);
  expect(english.leftEnd).toBeGreaterThan(30);

  // Each step lands just after a change has finished and long before the next one starts.
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "native");
  const native = await nameInk(page);
  expect(native.leftEnd).toBe(0);
  expect(native.middle).toBeGreaterThan(30);
  // Only the print changed: same text, same size, and the cloth is not left animating.
  await expect(name).toHaveText(new RegExp(`Zou\\s*${NATIVE}`));
  expect((await banner.boundingBox()).height).toBe(height);
  await expect(banner).toHaveAttribute("data-banner-state", /^(idle|wind|settling)$/);

  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "en");
  expect((await nameInk(page)).leftEnd).toBeGreaterThan(30);

  // Reduced motion prints both names at once, and the cycle resumes when it is lifted.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(name).toHaveAttribute("data-name-cycle", "static");
  expect((await nameInk(page)).top).toBeGreaterThan(30);
  await pastOneChange(page);
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "static");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(name).toHaveAttribute("data-name-cycle", "en");
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", "native");

  // Rolling the scroll up stops the cycle; a rolled banner changes nothing.
  await banner.locator("[data-scroll-grip]").click();
  await page.clock.runFor(5000);
  await expect(banner).toHaveAttribute("data-banner-scroll", "rolled");
  const rolled = await name.getAttribute("data-name-cycle");
  await pastOneChange(page);
  await pastOneChange(page);
  await expect(name).toHaveAttribute("data-name-cycle", rolled);
  expect(errors).toEqual([]);
});

test("printing shows both names in black", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await page.goto("/");
  await ready(page);
  for (const part of [".author__name-en", ".author__name-native"]) {
    await expect(page.locator(`.profile-banner ${part}`)).toBeVisible();
    await expect(page.locator(`.profile-banner ${part}`)).toHaveCSS("color", "rgb(0, 0, 0)");
  }
});

test("the heading stands in for the first print until the cloth is drawn", async ({ page }) => {
  // Without the banner script the cloth never takes over, so the stand-in can be measured.
  await page.route("**/assets/js/profile-banner.js", (route) => route.abort());
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/name-cycle-pending/);
  const centres = () =>
    page.locator(".profile-banner .author__name").evaluate((heading) => {
      const middle = (element) => {
        const box = element.getBoundingClientRect();
        return box.y + box.height / 2;
      };
      return { heading: middle(heading), english: middle(heading.querySelector(".author__name-en")) };
    });
  const native = page.locator(".profile-banner .author__name-native");
  // The first name sits where the one-name print draws it: in the middle of the heading.
  const pending = await centres();
  expect(Math.abs(pending.english - pending.heading)).toBeLessThan(0.75);
  await expect(native).toHaveCSS("opacity", "0");
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(`Zou\\s*${NATIVE}`) })).toHaveCount(1);
  // If the cloth never arrives, the page falls back to both names.
  await page.clock.runFor(4000);
  await expect(page.locator("html")).not.toHaveClass(/name-cycle-pending/);
  await expect(native).toHaveCSS("opacity", "1");
  expect((await centres()).english).toBeLessThan(pending.english - 4);
});

test("the stand-in is not used when both names are printed, and ends once the cloth is drawn", async ({ page }) => {
  await page.goto("/?name-cycle=static");
  await expect(page.locator("html")).not.toHaveClass(/name-cycle-pending/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/name-cycle-pending/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("html")).not.toHaveClass(/name-cycle-pending/);
});

test("a name too wide for one line is printed as the page wraps it, with both names", async ({ page }) => {
  await page.goto("/");
  const banner = await ready(page);
  const name = banner.locator(".author__name");
  await expect(name).toHaveAttribute("data-name-cycle", "en");
  await page.addStyleTag({ content: ".profile-banner .author__name { font-size: 2em !important; }" });
  await expect(name).toHaveAttribute("data-name-cycle", "static");
  expect((await nameInk(page)).top).toBeGreaterThan(30);
});
