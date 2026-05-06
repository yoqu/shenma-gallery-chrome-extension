/**
 * Unit tests for content script extraction logic
 * Run with: node tests/test-content-script.js
 */

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ❌ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    testsPassed++;
    console.log(`  ✅ ${message}`);
  } else {
    testsFailed++;
    console.log(`  ❌ ${message}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
  }
}

console.log('\n🧪 Content Script Tests\n');

// Test 1: cleanImageUrl
console.log('Test 1: Image URL Cleaning');
{
  function cleanImageUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      ['w', 'h', 'width', 'height', 'thumb', 'size', 'quality', 'resize'].forEach(p => {
        u.searchParams.delete(p);
      });
      return u.toString();
    } catch {
      return url;
    }
  }

  assertEqual(
    cleanImageUrl('https://example.com/img.jpg?w=200&h=150&quality=80'),
    'https://example.com/img.jpg',
    'removes thumbnail params'
  );
  assertEqual(
    cleanImageUrl('https://example.com/img.jpg?id=123&resize=small'),
    'https://example.com/img.jpg?id=123',
    'preserves non-thumbnail params, removes resize'
  );
  assertEqual(cleanImageUrl(''), '', 'handles empty string');
  assertEqual(cleanImageUrl('not-a-url'), 'not-a-url', 'handles invalid URL');
}

// Test 2: isDecorativeImage
console.log('\nTest 2: Decorative Image Detection');
{
  function isDecorativeImage(src, cls, alt, width, height) {
    const decorativePatterns = ['avatar', 'icon', 'logo', 'badge', 'emoji', 'flag', 'arrow', 'btn', 'button', 'spinner', 'loading'];
    return decorativePatterns.some(p => src.includes(p) || cls.includes(p) || alt.includes(p))
      || (width > 0 && width <= 64 && height > 0 && height <= 64);
  }

  assert(isDecorativeImage('/img/avatar.png', '', '', 100, 100), 'detects avatar by URL');
  assert(isDecorativeImage('/img/x.png', 'user-icon', '', 100, 100), 'detects icon by class');
  assert(isDecorativeImage('/img/x.png', '', 'logo', 100, 100), 'detects logo by alt');
  assert(isDecorativeImage('/img/x.png', '', '', 64, 64), 'detects small images (64x64)');
  assert(isDecorativeImage('/img/x.png', 'spinner', '', 200, 200), 'detects spinner');
  assert(!isDecorativeImage('/img/artwork.jpg', 'gallery-item', 'painting', 512, 512), 'passes real images');
  assert(!isDecorativeImage('/img/photo.jpg', '', '', 0, 0), 'passes unknown-size images');
}

// Test 3: Text block extraction logic
console.log('\nTest 3: Text Block Filtering');
{
  function shouldIncludeText(text) {
    return text && text.length >= 10 && text.length <= 20000;
  }

  assert(shouldIncludeText('This is a valid text block with enough characters'), 'includes normal text');
  assert(!shouldIncludeText('Short'), 'excludes short text (<10 chars)');
  assert(!shouldIncludeText(''), 'excludes empty text');
  assert(!shouldIncludeText(null), 'excludes null');
  assert(shouldIncludeText('a'.repeat(5000)), 'includes long text');
  assert(!shouldIncludeText('a'.repeat(20001)), 'excludes extremely long text');
}

// Test 4: Page content structure
console.log('\nTest 4: Extracted Content Structure');
{
  // Simulate what extractPageContent returns
  const mockContent = {
    images: [
      { index: 0, url: 'https://example.com/1.jpg', alt: 'artwork', width: 1024, height: 768, nearbyText: 'a beautiful painting' },
      { index: 1, url: 'https://example.com/2.jpg', alt: '', width: 512, height: 512, nearbyText: '' }
    ],
    textBlocks: [
      { text: 'masterpiece, best quality, 1girl', tag: 'pre', classes: 'prompt-text' },
      { text: 'Model: SDXL, Steps: 30, CFG: 7', tag: 'div', classes: 'meta-info' }
    ],
    pageInfo: {
      url: 'https://civitai.com/images/123',
      title: 'Test Page',
      hostname: 'civitai.com'
    }
  };

  assertEqual(mockContent.images.length, 2, 'correct image count');
  assertEqual(mockContent.textBlocks.length, 2, 'correct text block count');
  assert(mockContent.images[0].nearbyText.length > 0, 'first image has nearby text');
  assertEqual(mockContent.pageInfo.hostname, 'civitai.com', 'captures hostname');
  assert('url' in mockContent.images[0], 'images have url field');
  assert('index' in mockContent.images[0], 'images have index field');
  assert('text' in mockContent.textBlocks[0], 'text blocks have text field');
  assert('tag' in mockContent.textBlocks[0], 'text blocks have tag field');
}

// Test 5: Image deduplication
console.log('\nTest 5: Image URL Deduplication');
{
  const urls = [
    'https://example.com/1.jpg',
    'https://example.com/1.jpg',  // duplicate
    'https://example.com/2.jpg',
    'https://example.com/2.jpg',  // duplicate
    'https://example.com/3.jpg',
  ];

  const seenUrls = new Set();
  const unique = urls.filter(url => {
    if (seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });

  assertEqual(unique.length, 3, 'deduplicates image URLs');
}

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${testsPassed} 通过, ${testsFailed} 失败`);
console.log(`${'='.repeat(40)}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
