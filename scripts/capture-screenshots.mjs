import { chromium } from 'playwright';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screenshotsDir = join(root, 'docs', 'screenshots');

const svgData = (from, to, label) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="${from}" offset="0"/>
          <stop stop-color="${to}" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#g)"/>
      <circle cx="500" cy="90" r="90" fill="rgba(255,255,255,.18)"/>
      <path d="M80 350 C180 210 260 260 340 170 S520 170 580 90" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="18" stroke-linecap="round"/>
      <text x="42" y="430" fill="rgba(255,255,255,.86)" font-family="Arial, sans-serif" font-size="34" font-weight="700">${label}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const sampleImages = [
  svgData('#f45b8a', '#1b9aaa', 'AI artwork'),
  svgData('#7c3aed', '#f59e0b', 'Prompt study'),
  svgData('#10b981', '#2563eb', 'Visual set'),
];

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function mockChrome(page, overrides = {}) {
  await page.addInitScript((initialStore) => {
    const store = { ...initialStore };
    const normalizeKeys = (keys) => {
      if (!keys) return Object.keys(store);
      if (Array.isArray(keys)) return keys;
      if (typeof keys === 'string') return [keys];
      return Object.keys(keys);
    };

    globalThis.chrome = {
      storage: {
        local: {
          async get(keys) {
            const result = {};
            for (const key of normalizeKeys(keys)) {
              result[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : undefined;
            }
            return result;
          },
          async set(values) {
            Object.assign(store, values);
          },
          async remove(keys) {
            for (const key of normalizeKeys(keys)) delete store[key];
          },
        },
        onChanged: { addListener() {} },
      },
      runtime: {
        id: 'mock-extension',
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage(message, callback) {
          const response = message?.type === 'TEST_CONNECTION'
            ? { success: true, username: 'demo-user' }
            : { success: true, data: { success: true, data: { id: 'demo-user' } } };
          if (typeof callback === 'function') callback(response);
          return Promise.resolve(response);
        },
      },
      tabs: {
        async query() { return [{ id: 1, url: 'https://example.com/gallery' }]; },
        create() {},
        sendMessage() { return Promise.resolve(); },
      },
      scripting: {
        executeScript() { return Promise.resolve([{ result: null }]); },
      },
      sidePanel: {
        setPanelBehavior() { return Promise.resolve(); },
      },
      declarativeNetRequest: {
        updateDynamicRules() { return Promise.resolve(); },
      },
    };
  }, overrides);
}

async function openSidePanel(browser, store = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
  await mockChrome(page, store);
  await page.goto(pathToFileURL(join(root, 'sidepanel.html')).href);
  await page.waitForLoadState('networkidle');
  return page;
}

async function screenshotSidePanel(page, name) {
  await page.screenshot({ path: join(screenshotsDir, name), fullPage: false });
  await page.close();
}

async function main() {
  await mkdir(screenshotsDir, { recursive: true });
  const browser = await launchBrowser();

  let page = await openSidePanel(browser);
  await screenshotSidePanel(page, '01-sidepanel-start.png');

  page = await openSidePanel(browser, {
    siteDomain: 'www.uyoqu.com',
    siteToken: 'demo-token',
    llmProvider: 'openai',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o-mini',
  });
  await page.click('#btn-settings');
  await page.fill('#llm-api-key', 'sk-public-demo-key');
  await screenshotSidePanel(page, '02-settings.png');

  page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
  await mockChrome(page);
  await page.goto(pathToFileURL(join(root, 'tests', 'test-content-extraction.html')).href);
  await page.addScriptTag({ path: join(root, 'picker.js') });
  const box = await page.locator('#test-basic .card').first().boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.screenshot({ path: join(screenshotsDir, '03-select-area.png'), fullPage: false });
  await page.close();

  page = await openSidePanel(browser, {
    siteDomain: 'www.uyoqu.com',
    siteToken: 'demo-token',
    llmProvider: 'openai',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o-mini',
  });
  await page.evaluate((images) => {
    candidateImages = images;
    organizedItems = [
      {
        imageUrl: images[0],
        title: '霓虹雨夜城市',
        prompt: 'cyberpunk city at night, neon lights, rain, reflections, cinematic lighting',
        negativePrompt: 'low quality, blurry',
        model: 'Midjourney v6',
        tags: ['赛博朋克', '城市', '霓虹', '雨夜'],
        summary: '霓虹雨夜里的未来都市',
      },
      {
        imageUrl: images[1],
        title: '幻想水晶山脉',
        prompt: 'a beautiful fantasy landscape, crystal mountains, ethereal lighting, highly detailed',
        negativePrompt: '',
        model: 'Stable Diffusion XL',
        tags: ['fantasy', 'landscape', 'crystal'],
        summary: 'Crystal mountains under soft light',
      },
    ];
    renderResults(organizedItems);
    showStep('results');
  }, sampleImages);
  await screenshotSidePanel(page, '04-results.png');

  page = await openSidePanel(browser, {
    siteDomain: 'www.uyoqu.com',
    siteToken: 'demo-token',
  });
  await page.evaluate(() => {
    showStep('submit');
    submitLogEl.innerHTML = [
      ['获取用户信息…', 'info'],
      ['用户: demo-user', 'success'],
      ['[1/2] 处理: 霓虹雨夜城市…', 'info'],
      ['  上传图片…', 'info'],
      ['  图片上传成功', 'success'],
      ['  创建作品…', 'info'],
      ['  提交成功!', 'success'],
      ['完成! 成功提交 2/2 个作品', 'success'],
    ].map(([text, type]) => `<div class="log-entry ${type}">${text}</div>`).join('');
  });
  await screenshotSidePanel(page, '05-submit-log.png');

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
