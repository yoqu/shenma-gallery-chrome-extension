(() => {
  const DROP_TAGS = new Set([
    'script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'object', 'embed', 'template',
  ]);
  const VOID_TAGS = new Set(['br', 'hr', 'img', 'meta', 'link', 'input']);
  const SEMANTIC_TAGS = new Set([
    'article', 'section', 'figure', 'figcaption', 'main', 'header', 'footer', 'aside', 'nav',
    'details', 'summary', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'p', 'a', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 'small',
  ]);
  const INLINE_TAGS = new Set(['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'code', 'small', 'mark', 'abbr', 'label', 'time']);
  const SKIP_ROLES = new Set(['presentation', 'none']);
  const KIND_RULES = [
    ['negativePrompt', /\b(negative[\s_-]?prompt|neg[\s_-]?prompt)\b/],
    ['prompt', /\b(prompt|caption|caption-text|prompt-text|description|desc)\b/],
    ['title', /\b(title|headline|heading|name)\b/],
    ['summary', /\b(summary|subtitle|intro|abstract)\b/],
    ['meta', /\b(meta|info|detail|details|params?|settings?)\b/],
    ['tag', /\b(tag|keyword|keywords|label|chip)\b/],
    ['author', /\b(author|byline|creator|uploader|user|profile)\b/],
    ['tweet', /\b(tweet|post|thread)\b/],
    ['caption', /\b(caption|alt|subtitle)\b/],
  ];

  const DEFAULT_OPTIONS = {
    maxHtmlChars: 12000,
    maxTextChars: 6000,
    maxTextNodeChars: 280,
    maxNodes: 260,
    maxDepth: 8,
    maxChildrenPerNode: 24,
  };

  function preprocessSelectionForAi(html, text, options = {}) {
    const normalizedOptions = { ...DEFAULT_OPTIONS, ...options };
    const rawHtml = String(html || '');
    const rawText = String(text || '');
    const simplifiedHtml = simplifyHtmlForAi(rawHtml, normalizedOptions);
    const compactText = compactTextForAi(rawText, normalizedOptions.maxTextChars);
    return {
      html: simplifiedHtml || rawHtml.slice(0, normalizedOptions.maxHtmlChars),
      text: compactText,
      stats: {
        rawHtmlLength: rawHtml.length,
        simplifiedHtmlLength: simplifiedHtml.length,
        rawTextLength: rawText.length,
        compactTextLength: compactText.length,
        htmlReduction: rawHtml.length ? Math.round((1 - simplifiedHtml.length / rawHtml.length) * 100) : 0,
      },
    };
  }

  function simplifyHtmlForAi(html, options = {}) {
    const raw = String(html || '').trim();
    if (!raw) return '';
    const normalizedOptions = { ...DEFAULT_OPTIONS, ...options };

    const template = document.createElement('template');
    template.innerHTML = raw;

    const state = {
      parts: [],
      length: 0,
      nodesSeen: 0,
      done: false,
      ...normalizedOptions,
    };

    for (const node of Array.from(template.content.childNodes)) {
      serializeNode(node, state, 0, false);
      if (state.done) break;
    }

    return state.parts.join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, state.maxHtmlChars);
  }

  function compactTextForAi(text, maxChars = DEFAULT_OPTIONS.maxTextChars) {
    const raw = String(text || '');
    if (!raw) return '';

    const lines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const deduped = [];
    let prev = '';
    let approxLength = 0;
    for (const line of lines) {
      if (line === prev) continue;
      deduped.push(line);
      approxLength += line.length + 1;
      prev = line;
      if (approxLength >= maxChars) break;
    }

    return deduped.join('\n').slice(0, maxChars);
  }

  function serializeNode(node, state, depth, inPre) {
    if (state.done || state.nodesSeen >= state.maxNodes || depth > state.maxDepth || !node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.nodeValue, inPre ? state.maxTextNodeChars * 2 : state.maxTextNodeChars, inPre);
      if (text) append(state, text);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node;
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag) || isHidden(el)) return;

    state.nodesSeen += 1;

    if (tag === 'img') {
      const attrs = buildAttrs(el, tag, 'image');
      if (attrs) append(state, `<img${attrs}>`);
      return;
    }
    if (tag === 'br' || tag === 'hr') {
      append(state, `<${tag}>`);
      return;
    }

    const normalizedTag = normalizeTag(tag);
    const kind = inferKind(el, normalizedTag);
    const attrs = buildAttrs(el, normalizedTag, kind);
    const isBlock = isBlockTag(normalizedTag);
    const nextInPre = inPre || normalizedTag === 'pre' || normalizedTag === 'code';

    if (normalizedTag === 'div' || normalizedTag === 'span') {
      if (!attrs && !kind) {
        serializeChildren(el, state, depth + 1, nextInPre);
        return;
      }
    }

    if (isBlock) append(state, '\n');
    append(state, `<${normalizedTag}${attrs}>`);

    if (!VOID_TAGS.has(normalizedTag)) {
      serializeChildren(el, state, depth + 1, nextInPre);
      append(state, `</${normalizedTag}>`);
    }

    if (isBlock) append(state, '\n');
  }

  function serializeChildren(el, state, depth, inPre) {
    const children = Array.from(el.childNodes);
    const limit = Math.min(children.length, state.maxChildrenPerNode);
    for (let i = 0; i < limit; i += 1) {
      serializeNode(children[i], state, depth, inPre);
      if (state.done) return;
    }
    if (children.length > limit) append(state, ' …');
  }

  function normalizeTag(tag) {
    if (SEMANTIC_TAGS.has(tag)) return tag;
    if (INLINE_TAGS.has(tag)) return tag;
    if (/^h[1-6]$/.test(tag)) return tag;
    return 'div';
  }

  function isBlockTag(tag) {
    return !INLINE_TAGS.has(tag) || tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'li' || tag === 'tr' || tag === 'td' || tag === 'th';
  }

  function isHidden(el) {
    if (el.hidden) return true;
    const ariaHidden = el.getAttribute?.('aria-hidden');
    if (String(ariaHidden || '').toLowerCase() === 'true') return true;
    const role = String(el.getAttribute?.('role') || '').toLowerCase();
    if (SKIP_ROLES.has(role)) return true;
    const style = String(el.getAttribute?.('style') || '').toLowerCase().replace(/\s+/g, '');
    if (style.includes('display:none') || style.includes('visibility:hidden')) return true;
    return false;
  }

  function buildAttrs(el, tag, kind = '') {
    const attrs = [];
    if (kind) attrs.push(`data-kind="${escapeAttr(kind)}"`);

    const pushAttr = (name, value, maxLen = 160) => {
      const text = sanitizeAttrValue(value, maxLen);
      if (text) attrs.push(`${name}="${escapeAttr(text)}"`);
    };

    if (tag === 'img') {
      pushAttr('src', el.getAttribute('src') || '', 300);
      pushAttr('data-src', el.getAttribute('data-src') || '', 300);
      pushAttr('data-original', el.getAttribute('data-original') || '', 300);
      pushAttr('alt', el.getAttribute('alt') || '', 120);
      pushAttr('title', el.getAttribute('title') || '', 120);
      pushAttr('width', el.getAttribute('width') || '', 32);
      pushAttr('height', el.getAttribute('height') || '', 32);
      return attrs.length ? ` ${attrs.join(' ')}` : '';
    }

    if (tag === 'a') {
      pushAttr('href', el.getAttribute('href') || '', 300);
      pushAttr('title', el.getAttribute('title') || '', 120);
      pushAttr('aria-label', el.getAttribute('aria-label') || '', 120);
    } else {
      pushAttr('role', el.getAttribute('role') || '', 40);
      pushAttr('aria-label', el.getAttribute('aria-label') || '', 120);
      pushAttr('data-testid', el.getAttribute('data-testid') || '', 120);
    }

    return attrs.length ? ` ${attrs.join(' ')}` : '';
  }

  function inferKind(el, tag) {
    const haystack = [
      el.id || '',
      typeof el.className === 'string' ? el.className : '',
      el.getAttribute?.('data-testid') || '',
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('role') || '',
    ].join(' ').toLowerCase();

    for (const [kind, pattern] of KIND_RULES) {
      if (pattern.test(haystack)) return kind;
    }

    if (tag === 'img') return 'image';
    if (/^h[1-6]$/.test(tag)) return 'title';
    if (tag === 'pre' || tag === 'code') return 'code';
    return '';
  }

  function normalizeText(text, maxLen, inPre) {
    const raw = String(text || '');
    if (!raw.trim()) return '';
    const normalized = inPre
      ? raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
      : raw.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, maxLen);
  }

  function sanitizeAttrValue(value, maxLen = 160) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function append(state, value) {
    if (state.done || !value) return;
    const remaining = state.maxHtmlChars - state.length;
    if (remaining <= 0) {
      state.done = true;
      return;
    }

    const chunk = String(value).slice(0, remaining);
    state.parts.push(chunk);
    state.length += chunk.length;
    if (chunk.length < String(value).length) state.done = true;
  }

  window.ShenmaHtmlPreprocessor = {
    preprocessSelectionForAi,
    simplifyHtmlForAi,
    compactTextForAi,
  };
})();
