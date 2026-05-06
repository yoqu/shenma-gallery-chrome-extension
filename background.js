// Background service worker - handles qushenma API calls (bypasses CORS)
// and wires the toolbar action to open the side panel.

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
});

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
