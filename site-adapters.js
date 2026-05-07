// Per-site adapters — apply site-specific tweaks to picked content.
// Each adapter declares:
//   - matches(hostname): whether it applies to a given URL/host
//   - upgradeImageUrl(url): rewrite a single image URL to the highest-res variant
//   - rewriteImagesInHtml(html): apply upgrade to all <img> in the picked HTML so
//     the AI sees high-res URLs (it uses the same upgrade rule)
//   - banner: { name, tagline, icon } — shown in the side panel when active
//
// Registered as window.ShenmaSiteAdapters and consumed by sidepanel.js.

(() => {
  // ─── Twitter / X ───────────────────────────────────────────────────────────
  // pbs.twimg.com serves images at multiple sizes via either:
  //   a) the `name=` query (small | medium | large | orig | 4096x4096)
  //   b) a legacy `:size` suffix on the path (e.g. `.jpg:small`)
  // The DOM almost always renders the smaller variants. Rewrite to `name=orig`
  // for the original capture.
  function upgradeTwitterImageUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    let u;
    try {
      u = new URL(rawUrl, 'https://x.com');
    } catch {
      return rawUrl;
    }
    if (u.hostname !== 'pbs.twimg.com') return rawUrl;
    if (!/^\/media\//.test(u.pathname)) return rawUrl;

    // Drop legacy `:small`/`:large` etc. suffix.
    u.pathname = u.pathname.replace(/:(?:thumb|small|medium|large|orig)$/i, '');

    // Prefer the modern `?format=&name=` form. If the path still ends with an
    // extension, hoist it into the query so the URL is canonical.
    const extMatch = u.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i);
    if (extMatch) {
      if (!u.searchParams.has('format')) {
        const fmt = extMatch[1].toLowerCase();
        u.searchParams.set('format', fmt === 'jpeg' ? 'jpg' : fmt);
      }
      u.pathname = u.pathname.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
    }
    if (!u.searchParams.has('format')) u.searchParams.set('format', 'jpg');
    u.searchParams.set('name', 'orig');
    return u.toString();
  }

  const TWITTER_ADAPTER = {
    id: 'twitter',
    matches(hostname) {
      const host = String(hostname || '').toLowerCase();
      return host === 'x.com' || host.endsWith('.x.com')
        || host === 'twitter.com' || host.endsWith('.twitter.com');
    },
    upgradeImageUrl: upgradeTwitterImageUrl,
    rewriteImagesInHtml(html) {
      return rewriteImagesInHtmlWith(html, upgradeTwitterImageUrl);
    },
    banner: {
      name: 'X / Twitter',
      tagline: '已启用 pbs.twimg.com 高清图片采集',
      // Twitter "X" glyph as inline SVG
      iconSvg: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2H21.5l-7.5 8.57L22.83 22h-6.84l-5.36-7-6.13 7H1.25l8.02-9.17L1.5 2h7l4.85 6.4L18.244 2zm-1.2 18h1.85L7.04 4H5.07l11.974 16z"/>
      </svg>`,
    },
  };

  // Generic helper — walk an HTML string, apply `upgrade` to img src/srcset/data-src.
  function rewriteImagesInHtmlWith(html, upgrade) {
    if (!html) return html;
    let template;
    try {
      template = document.createElement('template');
      template.innerHTML = String(html);
    } catch {
      return html;
    }
    template.content.querySelectorAll('img').forEach((img) => {
      ['src', 'data-src', 'data-original'].forEach((name) => {
        const v = img.getAttribute(name);
        if (v) img.setAttribute(name, upgrade(v));
      });
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const upgraded = srcset.split(',').map((part) => {
          const trimmed = part.trim();
          if (!trimmed) return '';
          const m = trimmed.match(/^(\S+)(\s+.+)?$/);
          if (!m) return trimmed;
          return upgrade(m[1]) + (m[2] || '');
        }).filter(Boolean).join(', ');
        img.setAttribute('srcset', upgraded);
      }
    });
    return template.innerHTML;
  }

  const ADAPTERS = [TWITTER_ADAPTER];

  function adapterFor(input) {
    if (!input) return null;
    let hostname = '';
    try {
      // Accept hostname strings, full URLs, or { hostname, url } objects.
      if (typeof input === 'string') {
        hostname = input.includes('://') ? new URL(input).hostname : input;
      } else if (input.hostname) {
        hostname = input.hostname;
      } else if (input.url) {
        hostname = new URL(input.url).hostname;
      }
    } catch {
      return null;
    }
    if (!hostname) return null;
    return ADAPTERS.find((a) => a.matches(hostname)) || null;
  }

  function upgradeImageUrl(input, rawUrl) {
    const adapter = adapterFor(input);
    return adapter ? adapter.upgradeImageUrl(rawUrl) : rawUrl;
  }

  function rewriteHtml(input, html) {
    const adapter = adapterFor(input);
    return adapter ? adapter.rewriteImagesInHtml(html) : html;
  }

  window.ShenmaSiteAdapters = {
    adapterFor,
    upgradeImageUrl,
    rewriteHtml,
    list: ADAPTERS.slice(),
  };
})();
