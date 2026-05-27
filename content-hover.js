// In-page hover overlay for the "AI 反推中文提示词" feature.
// Shows a small floating button at the top-right corner of any reasonably-
// sized image when the user hovers it. Clicking the button asks the
// background worker to open the side panel and start the recognition flow.

(() => {
  if (window.__shenmaReverseHoverInstalled) return;
  window.__shenmaReverseHoverInstalled = true;

  // Skip embedded extension pages / sub-frames where the side panel context
  // already lives.
  try {
    if (location.protocol === 'chrome-extension:' || location.protocol === 'about:') return;
  } catch {
    return;
  }

  const BTN_ID = '__shenma-reverse-btn';
  const STYLE_ID = '__shenma-reverse-style';
  const MIN_SIZE = 80;       // ignore tiny icons / emoji
  const HOVER_GRACE_MS = 180;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BTN_ID} {
      position: fixed;
      z-index: 2147483646;
      pointer-events: auto;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 5px 9px 5px 7px;
      font-family: Inter, "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: #ffffff;
      background: linear-gradient(135deg, oklch(0.74 0.23 12), oklch(0.62 0.22 350));
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04);
      cursor: pointer;
      user-select: none;
      transition: transform 140ms cubic-bezier(0.2,0.8,0.2,1), opacity 140ms;
      opacity: 0.94;
    }
    #${BTN_ID}:hover { opacity: 1; transform: translateY(-1px) scale(1.04); }
    #${BTN_ID}:active { transform: translateY(0) scale(0.98); }
    #${BTN_ID}[data-state="busy"] {
      cursor: progress;
      opacity: 0.7;
    }
    #${BTN_ID} svg { width: 13px; height: 13px; display: block; }
    #${BTN_ID} .__shenma-reverse-label { white-space: nowrap; line-height: 1; }
  `;
  document.documentElement.appendChild(style);

  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', '使用 AI 反推中文提示词');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
      <path d="M19 17l.6 1.7L21 19l-1.4.3L19 21l-.6-1.7L17 19l1.4-.3z"/>
    </svg>
    <span class="__shenma-reverse-label">AI 反推中文提示词</span>
  `;
  document.documentElement.appendChild(btn);

  let currentImg = null;
  let hoverTimer = null;
  let hideTimer = null;
  let busy = false;

  function isEligibleImage(el) {
    if (!el || el.tagName !== 'IMG') return false;
    if (el.id === BTN_ID || el.closest?.(`#${BTN_ID}`)) return false;
    // Skip extension's own UI artifacts.
    if (el.closest?.('#__shenma-overlay, #__shenma-tooltip')) return false;
    // Suppress while the area-picker overlay is active — picker drives its own UI.
    if (window.__shenmaPickerCleanup) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return false;
    const src = el.currentSrc || el.src || '';
    if (!src) return false;
    if (src.startsWith('chrome-extension://')) return false;
    return true;
  }

  function resolveImageUrl(img) {
    if (!img) return '';
    return (
      img.currentSrc ||
      img.src ||
      img.dataset?.src ||
      img.dataset?.original ||
      img.getAttribute?.('data-src') ||
      img.getAttribute?.('data-original') ||
      ''
    );
  }

  function positionButton(img) {
    if (!img) return;
    const rect = img.getBoundingClientRect();
    // Anchor at top-right of the image, with a small inset.
    const top = Math.max(6, rect.top + 6);
    const right = Math.min(window.innerWidth - 6, rect.right - 6);
    btn.style.top = `${Math.round(top)}px`;
    btn.style.left = `${Math.round(right - btn.offsetWidth)}px`;
  }

  function showButton(img) {
    if (busy) return;
    currentImg = img;
    btn.style.display = 'inline-flex';
    // Two-pass: first paint so we can measure width, then snap to right edge.
    requestAnimationFrame(() => positionButton(img));
  }

  function hideButton() {
    if (busy) return;
    currentImg = null;
    btn.style.display = 'none';
  }

  function onMouseOver(e) {
    const t = e.target;
    if (t === btn || btn.contains(t)) {
      // Keep showing while hovering the button itself.
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      return;
    }
    if (!isEligibleImage(t)) {
      scheduleHide();
      return;
    }
    if (t === currentImg) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      return;
    }
    if (hoverTimer) clearTimeout(hoverTimer);
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    hoverTimer = setTimeout(() => showButton(t), 60);
  }

  function onMouseOut(e) {
    const related = e.relatedTarget;
    if (related === btn || (related && btn.contains(related))) return;
    if (related === currentImg) return;
    scheduleHide();
  }

  function scheduleHide() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideButton, HOVER_GRACE_MS);
  }

  function onScrollOrResize() {
    if (currentImg && btn.style.display !== 'none') {
      positionButton(currentImg);
    }
  }

  async function onButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !currentImg) return;
    const url = resolveImageUrl(currentImg);
    if (!url) return;

    busy = true;
    btn.setAttribute('data-state', 'busy');
    btn.querySelector('.__shenma-reverse-label').textContent = '已发送，查看侧栏…';

    try {
      await chrome.runtime.sendMessage({
        type: 'REVERSE_PROMPT_FROM_PAGE',
        imageUrl: url,
        pageUrl: location.href,
        pageTitle: document.title,
      });
    } catch (err) {
      btn.querySelector('.__shenma-reverse-label').textContent = '发送失败';
    } finally {
      setTimeout(() => {
        busy = false;
        btn.removeAttribute('data-state');
        btn.querySelector('.__shenma-reverse-label').textContent = 'AI 反推中文提示词';
        hideButton();
      }, 1400);
    }
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  btn.addEventListener('click', onButtonClick, true);
  btn.addEventListener('mouseenter', () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
})();
