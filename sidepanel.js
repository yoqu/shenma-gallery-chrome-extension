// Side panel controller — owns the entire UI: settings, picker trigger,
// AI analysis, results editing, and submit. The page-side picker only
// handles the highlight overlay and reports the picked element back here.

// ============ DOM refs ============
const stage = document.querySelector('.stage');
const drawer = document.getElementById('settings-drawer');
const btnSettings = document.getElementById('btn-settings');
const btnBack = document.getElementById('btn-back');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnTestConnection = document.getElementById('btn-test-connection');
const btnLogin = document.getElementById('btn-login');
const btnFetchToken = document.getElementById('btn-fetch-token');
const btnLogout = document.getElementById('btn-logout');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');

const btnPick = document.getElementById('btn-pick');
const btnCancelPick = document.getElementById('btn-cancel-pick');
const btnRepick = document.getElementById('btn-repick');
const btnSelectAll = document.getElementById('btn-select-all');
const btnSubmit = document.getElementById('btn-submit');
const btnSubmitBack = document.getElementById('btn-submit-back');

const aiStatus = document.getElementById('ai-status');
const poolList = document.getElementById('img-pool-list');
const resultsList = document.getElementById('results-list');
const resultsCount = document.getElementById('results-count');
const submitLogEl = document.getElementById('submit-log');
const debugLogEl = document.getElementById('debug-log');

const siteDomain = document.getElementById('site-domain');
const siteToken = document.getElementById('site-token');
const llmProvider = document.getElementById('llm-provider');
const llmBaseUrl = document.getElementById('llm-base-url');
const llmBaseUrlOptions = document.getElementById('llm-base-url-options');
const llmApiKey = document.getElementById('llm-api-key');
const llmApiKeyHint = document.getElementById('llm-api-key-hint');
const llmModel = document.getElementById('llm-model');
const llmModelOptions = document.getElementById('llm-model-options');

const editModal = document.getElementById('edit-modal');
const lightbox = document.getElementById('lightbox');

// ============ State ============
let settings = {};
let organizedItems = [];
let candidateImages = [];
let pickingTabId = null;
let editingIndex = -1;
let debugEntryCount = 0;

// ============ Lifecycle ============
document.addEventListener('DOMContentLoaded', async () => {
  populateProviders();
  await loadSettings();
  await checkConnection();
  showStep('idle');
});

// React to settings changing in another window/instance.
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area !== 'local') return;
  // Only re-pull what's relevant.
  if (changes.siteToken || changes.siteDomain) {
    loadSettings().then(() => checkConnection());
  }
});

// ============ Step machine ============
function showStep(name) {
  stage.querySelectorAll('.step').forEach(el => el.classList.toggle('active', el.dataset.step === name));
}

function summarizeText(text, maxLen = 180) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function summarizeNode(node) {
  if (!node) return null;
  const className = typeof node.className === 'string'
    ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
    : '';
  const attrs = {};
  ['role', 'data-testid', 'aria-label', 'href', 'src', 'alt'].forEach((name) => {
    const value = node.getAttribute?.(name);
    if (value) attrs[name] = value.slice(0, 120);
  });
  const rect = node.getBoundingClientRect?.();
  return {
    tag: node.tagName ? node.tagName.toLowerCase() : '',
    id: node.id || '',
    className,
    attrs,
    textLength: (node.innerText || '').length,
    htmlLength: (node.outerHTML || '').length,
    textPreview: summarizeText(node.innerText || '', 220),
    htmlPreview: summarizeText(node.outerHTML || '', 320),
    rect: rect ? {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    } : null,
  };
}

function appendDebugLog(level, title, details = null) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const detailText = details == null
    ? ''
    : (typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  const text = detailText ? `[${stamp}] ${title}\n${detailText}` : `[${stamp}] ${title}`;

  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug']?.(`[Shenma] ${title}`, details || '');

  if (!debugLogEl) return;
  const entry = document.createElement('div');
  entry.className = `debug-entry ${level}`;
  entry.textContent = text;
  debugLogEl.appendChild(entry);
  debugEntryCount += 1;
  while (debugEntryCount > 40 && debugLogEl.firstElementChild) {
    debugLogEl.removeChild(debugLogEl.firstElementChild);
    debugEntryCount -= 1;
  }
  debugLogEl.scrollTop = debugLogEl.scrollHeight;
}

function debugLog(title, details = null, level = 'info') {
  appendDebugLog(level, title, details);
}

// ============ Provider presets ============
const PROVIDERS = Array.isArray(window.LLM_PROVIDERS) ? window.LLM_PROVIDERS : [];

function populateProviders() {
  if (!llmProvider) return;
  while (llmProvider.options.length > 1) llmProvider.remove(1);
  PROVIDERS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    llmProvider.appendChild(opt);
  });
  if (llmBaseUrlOptions) {
    llmBaseUrlOptions.innerHTML = '';
    PROVIDERS.filter((p) => p.baseUrl).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.baseUrl;
      opt.label = p.name;
      llmBaseUrlOptions.appendChild(opt);
    });
  }
  llmProvider.addEventListener('change', () => applyProviderPreset(llmProvider.value, { force: true }));
}

function findProvider(id) { return PROVIDERS.find((p) => p.id === id) || null; }

function inferProviderId(baseUrl) {
  if (!baseUrl) return '';
  const norm = baseUrl.replace(/\/+$/, '');
  const hit = PROVIDERS.find((p) => p.baseUrl && norm === p.baseUrl.replace(/\/+$/, ''));
  return hit ? hit.id : '';
}

function refreshModelOptions(provider) {
  if (!llmModelOptions) return;
  llmModelOptions.innerHTML = '';
  if (!provider) return;
  provider.models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    llmModelOptions.appendChild(opt);
  });
}

function setKeyHint(provider) {
  if (!llmApiKeyHint) return;
  if (provider && provider.keyHint) {
    const link = provider.docsUrl
      ? ` <a href="${provider.docsUrl}" target="_blank" rel="noopener">控制台 →</a>`
      : '';
    llmApiKeyHint.innerHTML = provider.keyHint + link;
    llmApiKeyHint.classList.remove('hidden');
  } else {
    llmApiKeyHint.textContent = '';
    llmApiKeyHint.classList.add('hidden');
  }
}

// force=true overwrites existing fields (user picked from dropdown);
// force=false only fills empty fields (called when restoring saved settings).
function applyProviderPreset(providerId, { force = false } = {}) {
  const provider = findProvider(providerId);
  refreshModelOptions(provider);
  setKeyHint(provider);
  if (!provider) return;
  if (provider.baseUrl && (force || !llmBaseUrl.value.trim())) {
    llmBaseUrl.value = provider.baseUrl;
  }
  if (provider.models.length && (force || !llmModel.value.trim())) {
    llmModel.value = provider.models[0];
  }
}

// ============ Settings persistence ============
async function loadSettings() {
  const s = await chrome.storage.local.get([
    'siteDomain', 'siteToken', 'llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel',
  ]);
  settings = s;
  siteDomain.value = s.siteDomain || 'www.qushenma.com';
  siteToken.value = s.siteToken || '';
  llmBaseUrl.value = s.llmBaseUrl || '';
  llmApiKey.value = s.llmApiKey || '';
  llmModel.value = s.llmModel || '';

  const resolvedId = s.llmProvider || inferProviderId(llmBaseUrl.value);
  if (resolvedId && llmProvider) {
    llmProvider.value = resolvedId;
    applyProviderPreset(resolvedId, { force: false });
  }
}

btnSaveSettings.addEventListener('click', async () => {
  await chrome.storage.local.set({
    siteDomain: siteDomain.value.trim(),
    siteToken: siteToken.value.trim(),
    llmProvider: llmProvider ? llmProvider.value : '',
    llmBaseUrl: llmBaseUrl.value.trim(),
    llmApiKey: llmApiKey.value.trim(),
    llmModel: llmModel.value.trim(),
  });
  await loadSettings();
  showToast('设置已保存', 'success');
  checkConnection();
});

btnTestConnection.addEventListener('click', () => checkConnection(true));

// ============ Connection / auth ============
async function checkConnection(showResult = false) {
  const s = await chrome.storage.local.get(['siteDomain', 'siteToken']);
  if (!s.siteToken) {
    setConnState('disconnected', '未登录');
    btnLogin.classList.remove('hidden');
    btnFetchToken.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    if (showResult) showToast('请先登录', 'error');
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      domain: s.siteDomain || 'www.qushenma.com',
      token: s.siteToken,
    });
    if (response?.success) {
      setConnState('connected', `已连接 (${response.username})`);
      btnLogin.classList.add('hidden');
      btnFetchToken.classList.add('hidden');
      btnLogout.classList.remove('hidden');
      if (showResult) showToast('连接成功!', 'success');
    } else {
      setConnState('disconnected', 'Token 失效');
      btnLogin.classList.remove('hidden');
      btnFetchToken.classList.remove('hidden');
      btnLogout.classList.add('hidden');
      if (showResult) showToast(`失败: ${response?.error || '未知'}`, 'error');
    }
  } catch (e) {
    setConnState('disconnected', '连接错误');
    btnLogin.classList.remove('hidden');
    btnFetchToken.classList.remove('hidden');
    btnLogout.classList.add('hidden');
  }
}

function setConnState(state, text) {
  connectionStatus.className = `status-dot ${state}`;
  statusText.textContent = text;
}

btnLogin.addEventListener('click', async () => {
  const s = await chrome.storage.local.get(['siteDomain']);
  const domain = s.siteDomain || 'www.qushenma.com';
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  chrome.tabs.create({ url: `${protocol}://${domain}/` });
});

btnFetchToken.addEventListener('click', async () => {
  btnFetchToken.disabled = true;
  btnFetchToken.textContent = '获取中...';
  try {
    const s = await chrome.storage.local.get(['siteDomain']);
    const domain = s.siteDomain || 'www.qushenma.com';
    const protocol = domain.includes('localhost') ? 'http' : 'https';
    const tabs = await chrome.tabs.query({ url: `${protocol}://${domain}/*` });
    let token = null;
    if (tabs.length > 0) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => window.localStorage.getItem('shenma-gallery-token'),
      });
      token = results?.[0]?.result || null;
    }
    if (!token) {
      showToast('未找到登录信息，请先在网站上登录', 'error');
      return;
    }
    await chrome.storage.local.set({ siteToken: token });
    siteToken.value = token;
    showToast('授权获取成功!', 'success');
    checkConnection();
  } catch (e) {
    showToast(`获取失败: ${e.message}`, 'error');
  } finally {
    btnFetchToken.disabled = false;
    btnFetchToken.textContent = '获取授权';
  }
});

btnLogout.addEventListener('click', async () => {
  await chrome.storage.local.remove(['siteToken']);
  siteToken.value = '';
  showToast('已退出', 'info');
  checkConnection();
});

// ============ Settings drawer ============
btnSettings.addEventListener('click', () => drawer.classList.add('open'));
btnBack.addEventListener('click', () => drawer.classList.remove('open'));

// ============ Picker trigger ============
btnPick.addEventListener('click', startPicking);
btnRepick.addEventListener('click', startPicking);
btnCancelPick.addEventListener('click', cancelPicking);

async function startPicking() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast('无法获取当前页面', 'error');
      return;
    }
    if (tab.url && /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      showToast('该页面无法注入收集脚本', 'error');
      return;
    }
    pickingTabId = tab.id;
    showStep('picking');
    debugLog('开始选择区域', {
      tabId: tab.id,
      url: tab.url || '',
      title: tab.title || '',
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['picker.js'],
    });
  } catch (e) {
    pickingTabId = null;
    showStep('idle');
    showToast(`启动失败: ${e.message}`, 'error');
  }
}

async function cancelPicking() {
  if (pickingTabId != null) {
    try {
      await chrome.tabs.sendMessage(pickingTabId, { type: 'PICKER_CANCEL' });
    } catch {
      // Picker may already be gone — ignore.
    }
  }
  pickingTabId = null;
  showStep('idle');
}

// Picker → side panel: incoming messages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  // Only accept messages from the tab we're picking in.
  if (pickingTabId != null && sender.tab && sender.tab.id !== pickingTabId) return;

  if (msg.type === 'PICKER_DEBUG') {
    debugLog(`页面侧 ${msg.event || 'debug'}`, msg.payload || {});
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'PICKER_PICKED') {
    pickingTabId = null;
    handlePickedElement(msg.payload || {});
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'PICKER_CANCELLED') {
    pickingTabId = null;
    showStep('idle');
    sendResponse({ ok: true });
    return;
  }
});

// ============ AI analysis ============
async function handlePickedElement(payload) {
  const html = String(payload.html || '').slice(0, 50000);
  const text = String(payload.text || '').slice(0, 10000);
  candidateImages = Array.isArray(payload.candidateImages) ? payload.candidateImages : [];
  const pickDebug = payload.debug || null;
  const pageInfo = pickDebug?.page || {};

  debugLog('收到选区', {
    htmlLength: html.length,
    textLength: text.length,
    candidateImages: candidateImages.length,
    page: pageInfo,
    selection: pickDebug ? {
      node: pickDebug.node || null,
      picked: pickDebug.picked || null,
      ancestor: pickDebug.ancestor || null,
      signal: pickDebug.signal || null,
    } : null,
  });

  showStep('ai');
  setAIStatus('正在准备发送给 AI…');

  const llm = await chrome.storage.local.get(['llmBaseUrl', 'llmApiKey', 'llmModel']);
  if (!llm.llmBaseUrl || !llm.llmApiKey || !llm.llmModel) {
    setAIStatus('请先在设置中配置 AI 大模型 (Base URL / API Key / 模型)');
    setTimeout(() => showStep('idle'), 2400);
    showToast('AI 未配置，已打开设置', 'error');
    drawer.classList.add('open');
    return;
  }
  if (isTweetPage(pageInfo) && looksLikeTextOnlyModel(llm)) {
    debugLog('模型能力提示', {
      baseUrl: llm.llmBaseUrl,
      model: llm.llmModel,
      hint: '当前模型更像文本模型，X / Twitter 这类图文页建议使用视觉模型',
    }, 'warn');
    showToast('当前模型更像文本模型，X / Twitter 这类页面建议换视觉模型', 'info');
  }

  try {
    debugLog('发送 AI 请求', {
      baseUrl: llm.llmBaseUrl,
      model: llm.llmModel,
      htmlLength: html.length,
      textLength: text.length,
      candidateImages: candidateImages.length,
    });
    const items = await callAI(html, text, llm);
    if (items && items.length > 0) {
      debugLog('AI 识别成功', {
        items: items.length,
        firstItem: summarizeNodeLike(items[0]),
      }, 'success');
      items.forEach((item, idx) => {
        if (!item.model || !String(item.model).trim()) item.model = 'gpt-image-2';
        if (!item.title || !String(item.title).trim()) item.title = deriveTitle(item, idx);
      });
      organizedItems = items;
      renderResults(items);
      showStep('results');
    } else {
      debugLog('AI 未识别出作品', {
        htmlLength: html.length,
        textLength: text.length,
        candidateImages: candidateImages.length,
      selection: pickDebug ? {
        node: pickDebug.node || null,
        picked: pickDebug.picked || null,
        ancestor: pickDebug.ancestor || null,
        signal: pickDebug.signal || null,
      } : null,
    }, 'warn');
      setAIStatus('AI 未识别出作品，请尝试选择其它区域');
      setTimeout(() => showStep('idle'), 2400);
    }
  } catch (e) {
    debugLog('AI 分析失败', { message: e.message }, 'error');
    setAIStatus(`AI 分析失败: ${e.message}`);
    setTimeout(() => showStep('idle'), 3000);
  }
}

function setAIStatus(text) { aiStatus.textContent = text; }

async function callAI(html, text, llm, context = {}) {
  const pageInfo = context.pageInfo || {};
  const selectionDebug = context.pickDebug || null;
  const host = String(pageInfo.hostname || '').toLowerCase();
  const isTweetPage = host.endsWith('x.com') || host.endsWith('twitter.com');
  const systemPrompt = `你是 AI 艺术内容搬运助手。从用户选中的网页 HTML 中按**原文**提取每个图片及其元信息。

【最重要的规则——违反即视为失败】
- 全程**禁止翻译、禁止改写、禁止改变意思、禁止润色、禁止补充原文没有的内容**
- 原文是中文就保留中文，原文是英文就保留英文，原文是日文就保留日文，混用就混用
- 识别不到的字段一律留**空字符串**或空数组，**严禁猜测、严禁瞎填默认值**（例如：模型识别不到时不要写 "gpt-image-2" / "ai" / "未知" 等占位符，直接留 ""）

返回 JSON 数组，每个元素字段：
- imageUrl: 图片完整 URL（从 img 的 src / data-src / data-original 取，原样保留，不要拼接、不要改协议）
- title: 标题（**每个作品必填，严禁留空、严禁写"未命名"/"无标题"**，按以下优先级取值）
  1. 原文里明确的标题文本（h1/h2/h3、卡片标题、作品名、显眼的加粗短句、图片 alt/title 属性等）—— 直接抄，不翻译
  2. 原文没标题就**从该作品的 prompt 里提炼一个 8-20 字的短句**作为标题（描述画面主体、风格或主角；语言与 prompt 保持一致：prompt 是中文用中文，是英文用英文）
  3. prompt 也为空时，**从图片附近文本中归纳一个简短标题**（语言与该文本一致）
- prompt: 正向提示词（**原样照抄**，原文什么语言就什么语言；连标点、换行、参数尾巴 \`--ar 16:9 --v 6\` 等也保留；没有就留空字符串）
- negativePrompt: 负面提示词（同上原样照抄；没有留空字符串）
- model: AI 模型名（**优先用原文中明确出现的模型名**，比如 "Midjourney v6"、"Flux.1 dev"、"Stable Diffusion XL"、"DALL-E 3"、"NovelAI"、"即梦"、"可灵" 等；**原文没明确写的，统一默认填 "gpt-image-2"**，不要留空、不要写"未知"/"ai"等其他占位）
- tags: 3-8 个标签（**直接复用原文里的标签 / 关键词**，原文什么语言就什么语言；如果原文确实没有任何标签性质的文本，可以从原文已出现的关键词里挑 2-3 个，禁止自己造词）
- summary: 一句话描述（用**原文语言**简短概括内容，≤30 字；不要翻译；没什么可写就留空字符串）

提取规则：
1. img 标签的 src / data-src / data-original 即为图片 URL
2. 提示词通常在图片附近的 pre / code / blockquote / 特定 class 容器内
3. 每个图片 + 提示词为一组作品
4. 忽略广告 / 导航 / 头像 / icon / 装饰图等
5. 无提示词的图片也收录（prompt 留空字符串）

返回格式: [{"imageUrl":"","title":"","prompt":"","negativePrompt":"","model":"","tags":[],"summary":""}]
无有效内容返回 []${isTweetPage ? `

补充规则（X / Twitter 页面）：
- 这类页面通常是一条 tweet 搭配若干媒体图。
- 优先把单条 tweet/article 当作一条作品，不要把整列时间线当成一个作品。
- 使用 tweet 正文作为 prompt / summary，使用候选图片 URL 作为 imageUrl。
- 即使看不出图片细节，只要推文正文和候选图片 URL 明确，也不要直接返回 []。` : ''}`;

  let userMsg = `## 选中区域HTML\n\`\`\`html\n${html.substring(0, 15000)}\n\`\`\`\n`;
  if (text) userMsg += `\n## 纯文本\n${text.substring(0, 5000)}\n`;
  if (pageInfo && Object.keys(pageInfo).length > 0) {
    userMsg += `\n## 页面信息\n\`\`\`json\n${JSON.stringify(pageInfo, null, 2)}\n\`\`\`\n`;
  }
  if (selectionDebug) {
    userMsg += `\n## 选区摘要\n\`\`\`json\n${JSON.stringify({
      node: selectionDebug.node || null,
      picked: selectionDebug.picked || null,
      ancestor: selectionDebug.ancestor || null,
      signal: selectionDebug.signal || null,
    }, null, 2)}\n\`\`\`\n`;
  }
  if (candidateImages.length > 0) {
    userMsg += `\n## 候选图片 URL\n\`\`\`json\n${JSON.stringify(candidateImages.slice(0, 12), null, 2)}\n\`\`\`\n`;
  }
  if (isTweetPage) {
    userMsg += `

## X / Twitter 识别提示
这是一条社交媒体帖子页面。请把推文正文当作主要文本，把候选图片 URL 当作附件图片，不要把 emoji、头像、按钮图标、站点导航图标当成作品图片。`;
  }

  setAIStatus('正在等待 AI 响应…');
  const resp = await fetch(`${llm.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${llm.llmApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llm.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!resp.ok) throw new Error(`AI 接口返回 ${resp.status}`);

  setAIStatus('正在解析返回结果…');
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回空内容');
  debugLog('AI 原始返回', {
    contentLength: content.length,
    preview: summarizeText(content, 500),
  });
  const parsed = parseJSON(content);
  if (!parsed) {
    debugLog('AI 返回无法解析为 JSON', {
      preview: summarizeText(content, 800),
    }, 'warn');
  }
  return parsed;
}

function parseJSON(content) {
  try {
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const str = m ? m[1].trim() : content.trim();
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : (parsed.items || null);
  } catch {
    const m = content.match(/\[[\s\S]*\]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return null;
  }
}

function summarizeNodeLike(item) {
  if (!item || typeof item !== 'object') return item;
  return {
    imageUrl: summarizeText(item.imageUrl || '', 120),
    title: summarizeText(item.title || '', 60),
    promptLength: String(item.prompt || '').length,
    negativePromptLength: String(item.negativePrompt || '').length,
    model: summarizeText(item.model || '', 40),
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : [],
    summary: summarizeText(item.summary || '', 60),
  };
}

function isTweetPage(pageInfo = {}) {
  const host = String(pageInfo.hostname || '').toLowerCase();
  return host.endsWith('x.com') || host.endsWith('twitter.com');
}

function looksLikeTextOnlyModel(llm) {
  const hint = `${String(llm?.llmBaseUrl || '')} ${String(llm?.llmModel || '')}`.toLowerCase();
  if (!hint.trim()) return false;
  if (hint.includes('deepseek')) {
    return !/(vision|vl|multimodal|image)/.test(hint);
  }
  if (/(text[-\s]?only|reasoner|chat)/.test(hint) && !/(vision|vl|multimodal|image)/.test(hint)) {
    return true;
  }
  return false;
}

// ============ Results render (with drag-drop) ============
function renderResults(items) {
  // Candidate pool
  poolList.innerHTML = '';
  candidateImages.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'pool-item';
    thumb.draggable = true;
    thumb.dataset.url = url;
    thumb.innerHTML = `<img src="${escapeAttr(url)}">`;
    thumb.title = `候选图片 ${i + 1} · 点击放大 · 拖到右侧条目`;

    thumb.addEventListener('click', () => showLightbox(url));
    thumb.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/uri-list', url);
      e.dataTransfer.setData('text/plain', url);
      e.dataTransfer.setData('application/x-shenma-source', 'pool');
      thumb.classList.add('dragging');
    });
    thumb.addEventListener('dragend', () => thumb.classList.remove('dragging'));
    poolList.appendChild(thumb);
  });

  // Hide pool card if no candidates.
  const poolCard = poolList.closest('.pool-card');
  if (poolCard) poolCard.style.display = candidateImages.length > 0 ? '' : 'none';

  // Result items
  resultsList.innerHTML = '';
  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'result-item selected';
    div.dataset.index = i;
    const tagsHtml = (item.tags || []).slice(0, 4)
      .map(t => `<span class="result-tag">${esc(t)}</span>`).join('');
    div.innerHTML = `
      <input type="checkbox" checked data-index="${i}">
      <div class="result-img" draggable="true" data-index="${i}" title="点击放大 · 拖拽交换 · 候选池可拖入">
        ${item.imageUrl
          ? `<img src="${escapeAttr(item.imageUrl)}" onerror="this.parentElement.innerHTML='<div class=no-img>无图</div>'">`
          : '<div class="no-img">无图</div>'}
      </div>
      <div class="result-info">
        <div class="result-title">${esc(item.title || '未命名')}</div>
        <div class="result-prompt">${esc(item.prompt || '无提示词')}</div>
        <div class="result-meta-row">
          ${item.model ? `<span class="result-meta">${esc(item.model)}</span>` : ''}
          ${tagsHtml}
        </div>
      </div>
      <button class="result-edit" data-index="${i}" title="编辑表单">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    `;

    const imgSlot = div.querySelector('.result-img');
    const editBtn = div.querySelector('.result-edit');

    div.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.target.closest('.result-img')) return;
      if (e.target.closest('.result-edit')) return;
      const cb = div.querySelector('input');
      cb.checked = !cb.checked;
      div.classList.toggle('selected', cb.checked);
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(i);
    });

    imgSlot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.imageUrl) showLightbox(item.imageUrl);
    });

    imgSlot.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', i.toString());
      e.dataTransfer.setData('application/x-shenma-source', 'item');
      imgSlot.classList.add('dragging');
    });
    imgSlot.addEventListener('dragend', () => {
      imgSlot.classList.remove('dragging');
      resultsList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    div.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !div.contains(e.relatedTarget)) {
        div.classList.remove('drag-over');
      }
    });
    div.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      div.classList.remove('drag-over');
      const source = e.dataTransfer.getData('application/x-shenma-source');
      if (source === 'pool') {
        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (url) {
          organizedItems[i].imageUrl = url;
          renderResults(organizedItems);
        }
      } else if (source === 'item') {
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (Number.isInteger(fromIndex) && fromIndex !== i) {
          const tmp = organizedItems[fromIndex].imageUrl;
          organizedItems[fromIndex].imageUrl = organizedItems[i].imageUrl;
          organizedItems[i].imageUrl = tmp;
          renderResults(organizedItems);
        }
      }
    });

    resultsList.appendChild(div);
  });

  resultsCount.textContent = `${items.length} 个作品`;
}

btnSelectAll.addEventListener('click', () => {
  const cbs = resultsList.querySelectorAll('input[type="checkbox"]');
  const allChecked = Array.from(cbs).every(cb => cb.checked);
  cbs.forEach(cb => {
    cb.checked = !allChecked;
    cb.closest('.result-item').classList.toggle('selected', !allChecked);
  });
});

// ============ Edit modal ============
function openEditModal(index) {
  if (index == null || index < 0 || index >= organizedItems.length) return;
  editingIndex = index;
  const item = organizedItems[index];
  const set = (field, value) => {
    const el = editModal.querySelector(`[data-field="${field}"]`);
    if (el) el.value = value || '';
  };
  set('imageUrl', item.imageUrl);
  set('title', item.title);
  set('prompt', item.prompt);
  set('negativePrompt', item.negativePrompt);
  set('model', item.model);
  set('tags', Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || ''));
  set('summary', item.summary);
  updateEditPreview(item.imageUrl);
  editModal.classList.add('open');
}

function closeEditModal() {
  editModal.classList.remove('open');
  editingIndex = -1;
}

function saveEditModal() {
  if (editingIndex < 0) return;
  const get = (field) => {
    const el = editModal.querySelector(`[data-field="${field}"]`);
    return el ? el.value : '';
  };
  const item = organizedItems[editingIndex];
  item.imageUrl = get('imageUrl').trim();
  item.title = get('title').trim();
  item.prompt = get('prompt');
  item.negativePrompt = get('negativePrompt');
  item.model = get('model').trim();
  item.tags = get('tags').split(',').map(t => t.trim()).filter(Boolean);
  item.summary = get('summary');
  closeEditModal();
  renderResults(organizedItems);
}

function updateEditPreview(url) {
  const previewImg = editModal.querySelector('.edit-preview-img');
  const previewEmpty = editModal.querySelector('.edit-preview-empty');
  if (url) {
    previewImg.src = url;
    previewImg.style.display = 'block';
    previewEmpty.style.display = 'none';
  } else {
    previewImg.removeAttribute('src');
    previewImg.style.display = 'none';
    previewEmpty.style.display = 'flex';
  }
}

editModal.querySelector('.modal-close').onclick = closeEditModal;
editModal.querySelector('.modal-backdrop').onclick = closeEditModal;
editModal.querySelector('[data-action="cancel"]').onclick = closeEditModal;
editModal.querySelector('[data-action="save"]').onclick = saveEditModal;
editModal.querySelector('[data-field="imageUrl"]').addEventListener('input', (e) => {
  updateEditPreview(e.target.value.trim());
});
editModal.querySelector('.edit-img-preview').addEventListener('click', () => {
  const url = editModal.querySelector('[data-field="imageUrl"]').value.trim();
  if (url) showLightbox(url);
});

// ============ Lightbox ============
function showLightbox(url) {
  if (!url) return;
  const img = lightbox.querySelector('.lightbox-img');
  const link = lightbox.querySelector('.lightbox-open');
  img.src = url;
  link.href = url;
  lightbox.classList.add('open');
}

function hideLightbox() { lightbox.classList.remove('open'); }
lightbox.querySelector('.lightbox-close').onclick = hideLightbox;
lightbox.querySelector('.lightbox-backdrop').onclick = hideLightbox;

// ESC: close lightbox first, then modal, then drawer.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (lightbox.classList.contains('open')) { hideLightbox(); return; }
  if (editModal.classList.contains('open')) { closeEditModal(); return; }
  if (drawer.classList.contains('open')) { drawer.classList.remove('open'); return; }
});

// ============ Submit ============
btnSubmit.addEventListener('click', submitSelected);
btnSubmitBack.addEventListener('click', () => showStep('idle'));

async function submitSelected() {
  const cbs = resultsList.querySelectorAll('input:checked');
  const indices = Array.from(cbs).map(cb => parseInt(cb.dataset.index));
  if (indices.length === 0) {
    showToast('请至少选择一个作品', 'error');
    return;
  }
  const s = await chrome.storage.local.get(['siteDomain', 'siteToken']);
  if (!s.siteToken) {
    showToast('请先登录', 'error');
    drawer.classList.add('open');
    return;
  }

  const selected = indices.map(i => organizedItems[i]);
  showStep('submit');
  submitLogEl.innerHTML = '';

  const domain = s.siteDomain || 'www.qushenma.com';
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${domain}`;
  let successCount = 0;

  function log(text, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = text;
    submitLogEl.appendChild(div);
    submitLogEl.scrollTop = submitLogEl.scrollHeight;
  }

  function apiCall(url, method = 'GET', body = null) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url,
        method,
        headers: {
          'Authorization': `Bearer ${s.siteToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      }, resolve);
    });
  }

  function uploadImage(imageUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'UPLOAD_IMAGE',
        imageUrl,
        uploadUrl: `${baseUrl}/api/media/upload`,
        token: s.siteToken,
      }, resolve);
    });
  }

  try {
    log('获取用户信息…');
    const meResult = await apiCall(`${baseUrl}/api/auth/me`);
    if (!meResult.success) { log(`请求失败: ${meResult.error}`, 'error'); return; }
    const meData = meResult.data;
    if (!meData.success) { log(`认证失败: ${meData.message}`, 'error'); return; }
    const authorId = meData.data.id;
    log(`用户: ${meData.data.nickname || meData.data.username}`, 'success');

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      log(`\n[${i + 1}/${selected.length}] 处理: ${item.title || '未命名'}…`);
      if (!item.imageUrl) { log('  无图片，跳过', 'error'); continue; }

      log('  上传图片…');
      const upResult = await uploadImage(item.imageUrl);
      if (!upResult.success) { log(`  上传失败: ${upResult.error}`, 'error'); continue; }
      const assetData = {
        url: upResult.data.url,
        mimeType: upResult.data.mimeType,
        fileSize: upResult.data.fileSize,
        width: upResult.data.width,
        height: upResult.data.height,
        aspectRatio: upResult.data.aspectRatio,
        fileHash: upResult.data.fileHash,
      };
      log('  图片上传成功', 'success');

      log('  创建作品…');
      const workData = {
        authorId,
        title: item.title || `收集作品 ${i + 1}`,
        summary: item.summary || '',
        prompt: item.prompt || '',
        negativePrompt: item.negativePrompt || '',
        asset: assetData,
        generation: { model: item.model || '' },
        customTags: (item.tags || []).slice(0, 8),
      };

      const createResult = await apiCall(`${baseUrl}/api/works`, 'POST', workData);
      if (!createResult.success) { log(`  创建出错: ${createResult.error}`, 'error'); continue; }
      if (!createResult.data.success) { log(`  创建失败: ${createResult.data.message}`, 'error'); continue; }

      const workId = createResult.data.data.id;
      await apiCall(`${baseUrl}/api/works/${workId}/publish`, 'POST');
      successCount++;
      log('  提交成功!', 'success');
    }

    log(`\n${'─'.repeat(28)}`);
    log(`完成! 成功提交 ${successCount}/${selected.length} 个作品`, 'success');
  } catch (e) {
    log(`流程出错: ${e.message}`, 'error');
  }
}

// ============ Helpers ============
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function deriveTitle(item, idx) {
  const sources = [item.prompt, item.summary, (item.tags || []).join(' ')];
  for (const raw of sources) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const seg = t.split(/[\n\r。.!?！？,，;；、|｜]/)[0].trim();
    if (!seg) continue;
    const arr = Array.from(seg);
    return arr.length > 24 ? arr.slice(0, 24).join('') + '…' : seg;
  }
  return `收集作品 ${idx + 1}`;
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
