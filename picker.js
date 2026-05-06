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

  function extractCandidateImages(el) {
    const images = [];
    const seen = new Set();
    el.querySelectorAll('img').forEach((img) => {
      const src = img.src || img.dataset.src || img.dataset.original || '';
      if (!src || src.startsWith('data:') || seen.has(src)) return;
      const w = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
      const h = img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
      if (w > 0 && w < 50) return;
      if (h > 0 && h < 50) return;
      seen.add(src);
      images.push(src);
    });
    return images;
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
    const payload = {
      html: (el.outerHTML || '').slice(0, 50000),
      text: (el.innerText || '').slice(0, 10000),
      candidateImages: extractCandidateImages(el),
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

  window.__shenmaPickerCleanup = cleanup;
})();
