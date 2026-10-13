const { devices } = require("@playwright/test");

module.exports = {
  testDir: __dirname,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.SITE_URL || "http://127.0.0.1:4000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.NO_WEBSERVER
    ? undefined
    : {
        command: "bundle exec jekyll serve --host 127.0.0.1 --port 4000 --quiet",
        url: "http://127.0.0.1:4000",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1366, height: 1100 },
        launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      },
    },
    { name: "mobile", use: { ...devices["iPhone 12"] } },
  ],
};
