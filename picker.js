// Page-side picker — only handles the highlight overlay.
// Sends the picked element's HTML/text/candidate images back to the side panel
// via chrome.runtime.sendMessage, then removes itself. All result UI lives
// in the side panel, not here.

(function () {
  // Re-injection: tear down the previous instance and start fresh.
  if (window.__shenmaPickerCleanup) {
    try { window.__shenmaPickerCleanup(); } catch {}
  }

  const OVERLAY_ID = '__shenma-overlay';
  const TOOLTIP_ID = '__shenma-tooltip';
  const STYLE_ID = '__shenma-picker-style';
  const IS_X_HOST = /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(location.hostname);

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed; pointer-events: none; z-index: 2147483646;
      border: 2px solid oklch(0.70 0.22 2 / 0.85);
      background: oklch(0.70 0.22 2 / 0.06);
      box-shadow: 0 0 0 1px oklch(0.70 0.22 2 / 0.18), 0 0 20px oklch(0.60 0.22 2 / 0.14);
      border-radius: 4px;
      transition: top 50ms cubic-bezier(0.2, 0.8, 0.2, 1),
                  left 50ms cubic-bezier(0.2, 0.8, 0.2, 1),
                  width 50ms cubic-bezier(0.2, 0.8, 0.2, 1),
                  height 50ms cubic-bezier(0.2, 0.8, 0.2, 1);
      display: none;
    }
    #${TOOLTIP_ID} {
      position: fixed; z-index: 2147483646;
      background: #111116; color: #BDBCB6;
      font-size: 11px;
      font-family: "JetBrains Mono", Monaco, monospace;
      padding: 4px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      pointer-events: none;
      display: none;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  document.body.appendChild(tooltip);

  let currentTarget = null;
  let active = true;

  function isOurUI(el) {
    return el && (el.id === OVERLAY_ID || el.id === TOOLTIP_ID);
  }

  function summarizeText(text, maxLen = 160) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  }

  function summarizeNode(el) {
    if (!el) return null;
    const className = typeof el.className === 'string'
      ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
      : '';
    const attrs = {};
    ['role', 'data-testid', 'aria-label', 'href', 'src', 'alt'].forEach((name) => {
      const value = el.getAttribute?.(name);
      if (value) attrs[name] = value.slice(0, 120);
    });
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className,
      attrs,
      textLength: (el.innerText || '').length,
      htmlLength: (el.outerHTML || '').length,
      textPreview: summarizeText(el.innerText || '', 220),
      htmlPreview: summarizeText(el.outerHTML || '', 320),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function findAncestor(el, predicate, maxDepth = 8) {
    let cur = el;
    let depth = 0;
    while (cur && depth <= maxDepth) {
      if (predicate(cur)) return cur;
      cur = cur.parentElement;
      depth += 1;
    }
    return null;
  }

  function debugSend(event, payload) {
    safeSend({ type: 'PICKER_DEBUG', event, payload });
  }

  function highlight(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    tooltip.textContent = `${tag}${id}${cls} (${Math.round(rect.width)}×${Math.round(rect.height)})`;
    tooltip.style.display = 'block';
    tooltip.style.top = Math.max(0, rect.top - 28) + 'px';
    tooltip.style.left = rect.left + 'px';
  }

  function onMove(e) {
    if (!active) return;
    const el = e.target;
    if (isOurUI(el)) return;
    currentTarget = el;
    highlight(el);
  }

  function onClick(e) {
    if (!active) return;
    if (isOurUI(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const pointTarget = pickElementAtPoint(e.clientX, e.clientY);
    if (pointTarget) {
      currentTarget = pointTarget;
    }
    confirmPick(currentTarget);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      cancel();
      return;
    }
    if (e.key === 'ArrowUp' && currentTarget?.parentElement) {
      e.preventDefault();
      currentTarget = currentTarget.parentElement;
      highlight(currentTarget);
    } else if (e.key === 'ArrowDown' && currentTarget?.firstElementChild) {
      e.preventDefault();
      currentTarget = currentTarget.firstElementChild;
      highlight(currentTarget);
    }
  }

  function onWheel(e) {
    if (!active || !currentTarget) return;
    e.preventDefault();
    if (e.deltaY < 0 && currentTarget.parentElement && currentTarget.parentElement !== document.body) {
      currentTarget = currentTarget.parentElement;
    } else if (e.deltaY > 0 && currentTarget.firstElementChild) {
      currentTarget = currentTarget.firstElementChild;
    }
    highlight(currentTarget);
  }

  function pickElementAtPoint(x, y) {
    const elements = document.elementsFromPoint(x, y) || [];
    return elements.find((el) => !isOurUI(el)) || null;
  }

  function extractCandidateImages(el) {
    const images = [];
    const seen = new Set();
    el.querySelectorAll('img').forEach((img) => {
      const src = img.src || img.dataset.src || img.dataset.original || '';
      if (!src || src.startsWith('data:') || seen.has(src) || isLikelyDecorativeImage(img, src)) return;
      const w = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
      const h = img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
      if (w > 0 && w < 50) return;
      if (h > 0 && h < 50) return;
      seen.add(src);
      images.push(src);
    });
    return images;
  }

  function isLikelyDecorativeImage(img, src) {
    const lower = String(src || '').toLowerCase();
    const alt = String(img?.alt || '').toLowerCase();
    const role = String(img?.getAttribute?.('role') || '').toLowerCase();
    const w = img?.naturalWidth || parseInt(img?.getAttribute?.('width')) || 0;
    const h = img?.naturalHeight || parseInt(img?.getAttribute?.('height')) || 0;

    if (!src) return true;
    if (lower.startsWith('data:')) return true;
    if (lower.endsWith('.svg') || lower.includes('.svg?')) return true;
    if (lower.includes('abs.twimg.com/emoji/')) return true;
    if (lower.includes('profile_images/')) return true;
    if (lower.includes('/emoji/')) return true;
    if (alt.includes('emoji') || alt.includes('avatar') || alt.includes('icon')) return true;
    if (role === 'presentation' || role === 'none') return true;
    if (w > 0 && h > 0 && w <= 80 && h <= 80) return true;
    return false;
  }

  function scoreTweetCandidate(node) {
    if (!node) return -Infinity;
    const textLength = (node.innerText || '').trim().length;
    const photoCount = node.querySelectorAll('[data-testid="tweetPhoto"]').length;
    const textCount = node.querySelectorAll('[data-testid="tweetText"]').length;
    const imageCount = extractCandidateImages(node).length;
    const mediaCount = node.querySelectorAll('video, [data-testid="playButton"], [aria-label*="video"]').length;
    const rect = node.getBoundingClientRect?.();
    const area = rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0;

    return (
      imageCount * 120 +
      photoCount * 120 +
      mediaCount * 80 +
      textCount * 50 +
      Math.min(textLength / 20, 80) +
      Math.min(area / 100000, 40)
    );
  }

  function refineSelection(el) {
    if (!el) return null;
    const isTweetHost = IS_X_HOST || /primaryColumn|timeline/i.test(el.id || '') || /x\.com|twitter\.com/i.test(location.hostname);
    if (!isTweetHost) return el;

    const tweetCandidates = new Set();
    if (el.matches?.('article[data-testid="tweet"], article[role="article"], [data-testid="tweet"]')) {
      tweetCandidates.add(el);
    }
    el.querySelectorAll?.('article[data-testid="tweet"], article[role="article"], [data-testid="tweet"]').forEach((node) => {
      tweetCandidates.add(node);
    });

    let best = null;
    let bestScore = -Infinity;
    tweetCandidates.forEach((candidate) => {
      const score = scoreTweetCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    return best || el;
  }

  function safeSend(message) {
    // MV3 sendMessage returns a Promise that rejects if no receiver is
    // listening (e.g. side panel closed). We just want best-effort delivery.
    try {
      const p = chrome.runtime.sendMessage(message);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }

  function confirmPick(el) {
    if (!el) { cancel(); return; }
    const picked = refineSelection(el) || el;
    const candidateImages = extractCandidateImages(picked);
    const article = findAncestor(el, (node) =>
      node.matches?.('article[data-testid="tweet"], article[role="article"], article, [role="article"]'),
    );
    const debugPayload = {
      page: {
        url: location.href,
        title: document.title,
        hostname: location.hostname,
      },
      node: summarizeNode(el),
      picked: summarizeNode(picked),
      ancestor: article && article !== el ? summarizeNode(article) : null,
      signal: {
        imageCount: picked.querySelectorAll('img').length,
        linkCount: picked.querySelectorAll('a').length,
        buttonCount: picked.querySelectorAll('button').length,
        tweetTextCount: picked.querySelectorAll('[data-testid="tweetText"]').length,
        tweetPhotoCount: picked.querySelectorAll('[data-testid="tweetPhoto"]').length,
        candidateImageCount: candidateImages.length,
      },
      candidateImages: candidateImages.slice(0, 8),
    };
    debugSend('picked', debugPayload);
    const payload = {
      html: (picked.outerHTML || '').slice(0, 50000),
      text: (picked.innerText || '').slice(0, 10000),
      candidateImages,
      debug: debugPayload,
    };
    cleanup();
    safeSend({ type: 'PICKER_PICKED', payload });
  }

  function cancel() {
    cleanup();
    safeSend({ type: 'PICKER_CANCELLED' });
  }

  function cleanup() {
    if (!active) return;
    active = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mousedown', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('wheel', onWheel, { capture: true });
    chrome.runtime.onMessage.removeListener(onSidepanelMessage);
    overlay?.remove();
    tooltip?.remove();
    style?.remove();
    window.__shenmaPickerCleanup = null;
  }

  function onSidepanelMessage(msg) {
    if (msg && msg.type === 'PICKER_CANCEL') {
      cleanup();
    }
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mousedown', onClick, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  chrome.runtime.onMessage.addListener(onSidepanelMessage);

  debugSend('ready', {
    page: {
      url: location.href,
      title: document.title,
      hostname: location.hostname,
    },
  });

  window.__shenmaPickerCleanup = cleanup;
})();
