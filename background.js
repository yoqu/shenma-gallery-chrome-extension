// Background service worker - handles qushenma API calls (bypasses CORS),
// wires the toolbar action to open the side panel, and brokers the new
// "AI 反推中文提示词" feature (context menu + in-page hover button).

const CONTEXT_MENU_ID = 'shenma-reverse-prompt';
const PENDING_KEY = 'shenmaPendingReverseTask';

// Toolbar icon click → open side panel (replaces the old popup).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

// Remove Origin header from extension requests to avoid Spring CORS rejection
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'remove' }
      ]
    },
    condition: {
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: ['xmlhttprequest']
    }
  }]
}).catch(() => {});

// Right-click → "反推中文提示词" on any image.
function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'AI 反推中文提示词',
      contexts: ['image'],
    });
  });
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup?.addListener(ensureContextMenu);
// Service worker may have re-spawned without onInstalled firing; create it now.
ensureContextMenu();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const imageUrl = info.srcUrl || info.linkUrl || '';
  if (!imageUrl) return;
  await dispatchReverseTask({
    imageUrl,
    pageUrl: info.pageUrl || tab?.url || '',
    pageTitle: tab?.title || '',
    tabId: tab?.id,
    windowId: tab?.windowId,
    source: 'context-menu',
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'TEST_CONNECTION') {
    testConnection(msg.domain, msg.token).then(sendResponse);
    return true;
  }

  if (msg.type === 'API_REQUEST') {
    handleApiRequest(msg).then(sendResponse);
    return true;
  }

  if (msg.type === 'UPLOAD_IMAGE') {
    handleImageUpload(msg).then(sendResponse);
    return true;
  }

  if (msg.type === 'REVERSE_PROMPT_FROM_PAGE') {
    // From the in-page hover button on any tab.
    dispatchReverseTask({
      imageUrl: msg.imageUrl || '',
      pageUrl: msg.pageUrl || sender.tab?.url || '',
      pageTitle: msg.pageTitle || sender.tab?.title || '',
      tabId: sender.tab?.id,
      windowId: sender.tab?.windowId,
      source: 'hover',
    }).then((res) => sendResponse(res)).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'FETCH_IMAGE_DATA_URL') {
    fetchImageAsDataUrl(msg.imageUrl).then(sendResponse);
    return true;
  }
});

async function dispatchReverseTask(task) {
  if (!task.imageUrl) return { ok: false, error: 'no image url' };
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    imageUrl: task.imageUrl,
    pageUrl: task.pageUrl || '',
    pageTitle: task.pageTitle || '',
    source: task.source || 'unknown',
    createdAt: Date.now(),
  };

  // Persist as fallback so the side panel can pick it up after it loads.
  try {
    await chrome.storage.local.set({ [PENDING_KEY]: payload });
  } catch {}

  // Open / focus the side panel so the user immediately sees the recognition flow.
  try {
    if (task.windowId != null && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: task.windowId });
    } else if (task.tabId != null && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: task.tabId });
    }
  } catch (e) {
    // sidePanel.open requires user gesture context — on context menu and
    // user-initiated message, this should be allowed. Silently ignore if not.
  }

  // Best-effort push to any already-open side panel listener.
  try {
    chrome.runtime.sendMessage({ type: 'REVERSE_PROMPT_DISPATCH', payload }).catch?.(() => {});
  } catch {}

  return { ok: true };
}

async function testConnection(domain, token) {
  try {
    const protocol = domain.includes('localhost') ? 'http' : 'https';
    const resp = await fetch(`${protocol}://${domain}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resp.json();
    if (data.success && data.data) {
      return { success: true, username: data.data.nickname || data.data.username };
    }
    return { success: false, error: data.message || '认证失败' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Generic API request proxy
async function handleApiRequest(msg) {
  try {
    const { url, method, headers, body } = msg;
    const resp = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await resp.json();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Image upload proxy - fetches image and uploads to qushenma
async function handleImageUpload(msg) {
  try {
    const { imageUrl, uploadUrl, token } = msg;

    // Fetch the image
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return { success: false, error: `获取图片失败: ${imgResp.status}` };

    const blob = await imgResp.blob();
    const contentType = blob.type || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

    // Upload to qushenma
    const formData = new FormData();
    formData.append('file', blob, `collect_${Date.now()}.${ext}`);

    const uploadResp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await uploadResp.json();
    if (data.success && data.data) {
      return { success: true, data: data.data };
    }
    return { success: false, error: data.message || '上传失败' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Fetch any image URL (cross-origin allowed thanks to host_permissions),
// then return a base64 data URL the side panel can hand to the vision LLM.
async function fetchImageAsDataUrl(imageUrl) {
  try {
    if (!imageUrl) return { success: false, error: 'no image url' };
    if (imageUrl.startsWith('data:')) {
      return { success: true, dataUrl: imageUrl, contentType: parseDataUrlMime(imageUrl) };
    }
    const resp = await fetch(imageUrl, { credentials: 'omit' });
    if (!resp.ok) return { success: false, error: `获取图片失败: ${resp.status}` };
    const blob = await resp.blob();
    if (blob.size > 12 * 1024 * 1024) {
      return { success: false, error: '图片过大（>12MB），无法识别' };
    }
    const contentType = blob.type || 'image/jpeg';
    const buf = await blob.arrayBuffer();
    const dataUrl = `data:${contentType};base64,${arrayBufferToBase64(buf)}`;
    return { success: true, dataUrl, contentType, size: blob.size };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function parseDataUrlMime(url) {
  const m = /^data:([^;,]+)/.exec(url);
  return m ? m[1] : 'image/jpeg';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
