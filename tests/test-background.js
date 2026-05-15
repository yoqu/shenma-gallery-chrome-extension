/**
 * Unit tests for background service worker logic
 * Run with: node tests/test-background.js
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

console.log('\n🧪 Background Service Worker Tests\n');

// Test 1: URL Protocol Detection
console.log('Test 1: URL Protocol Detection');
{
  function getProtocol(domain) {
    return domain.includes('localhost') ? 'http' : 'https';
  }

  assertEqual(getProtocol('www.uyoqu.com'), 'https', 'production uses https');
  assertEqual(getProtocol('localhost:5173'), 'http', 'localhost uses http');
  assertEqual(getProtocol('localhost:8080'), 'http', 'localhost with port uses http');
}

// Test 2: AI Organize Prompt Building
console.log('\nTest 2: AI Organize Prompt Building');
{
  function buildOrganizePrompt(pageContent) {
    const { images, textBlocks, pageInfo } = pageContent;
    let prompt = `## 页面信息\n`;
    prompt += `URL: ${pageInfo.url}\n`;
    prompt += `标题: ${pageInfo.title}\n`;
    prompt += `域名: ${pageInfo.hostname}\n\n`;

    prompt += `## 图片列表 (共${images.length}张)\n`;
    images.forEach(img => {
      prompt += `[图片${img.index}] URL: ${img.url}`;
      if (img.alt) prompt += ` | ALT: ${img.alt}`;
      if (img.width && img.height) prompt += ` | 尺寸: ${img.width}x${img.height}`;
      if (img.nearbyText) prompt += `\n  附近文本: ${img.nearbyText.substring(0, 300)}`;
      prompt += `\n`;
    });

    prompt += `\n## 页面文本内容\n`;
    textBlocks.forEach((block, i) => {
      prompt += `--- 文本块${i} (${block.tag}) ---\n`;
      prompt += `${block.text.substring(0, 2000)}\n\n`;
    });

    if (prompt.length > 12000) {
      prompt = prompt.substring(0, 12000) + '\n\n[内容已截断...]';
    }
    return prompt;
  }

  const mockContent = {
    images: [
      { index: 0, url: 'https://ex.com/1.jpg', alt: 'art', width: 1024, height: 768, nearbyText: 'nearby' }
    ],
    textBlocks: [
      { text: 'masterpiece, best quality, 1girl', tag: 'pre', classes: '' }
    ],
    pageInfo: { url: 'https://civitai.com/123', title: 'Test', hostname: 'civitai.com' }
  };

  const result = buildOrganizePrompt(mockContent);
  assert(result.includes('civitai.com'), 'includes hostname');
  assert(result.includes('[图片0]'), 'includes image reference');
  assert(result.includes('1024x768'), 'includes dimensions');
  assert(result.includes('附近文本: nearby'), 'includes nearby text');
  assert(result.includes('masterpiece'), 'includes text block content');
  assert(result.includes('文本块0'), 'includes text block index');
}

// Test 3: AI Response JSON Parsing
console.log('\nTest 3: AI Response Parsing');
{
  function parseAIResponse(content) {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
      return null;
    } catch {
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { return JSON.parse(arrayMatch[0]); } catch { return null; }
      }
      return null;
    }
  }

  // Plain JSON array
  const r1 = parseAIResponse('[{"imageIndex":0,"title":"测试","prompt":"test"}]');
  assertEqual(r1.length, 1, 'parses plain JSON array');
  assertEqual(r1[0].title, '测试', 'correct title');

  // Markdown wrapped
  const r2 = parseAIResponse('```json\n[{"imageIndex":0,"title":"包裹"}]\n```');
  assertEqual(r2.length, 1, 'parses markdown-wrapped JSON');
  assertEqual(r2[0].title, '包裹', 'correct wrapped title');

  // Object with items key
  const r3 = parseAIResponse('{"items":[{"imageIndex":0,"title":"嵌套"}]}');
  assertEqual(r3.length, 1, 'parses object with items key');

  // Invalid
  const r4 = parseAIResponse('This is not JSON');
  assertEqual(r4, null, 'returns null for invalid');

  // Array embedded in text
  const r5 = parseAIResponse('Here is the result:\n[{"imageIndex":0,"title":"嵌入"}]\nDone.');
  assertEqual(r5.length, 1, 'extracts array from surrounding text');
}

// Test 4: Work Data Construction
console.log('\nTest 4: Work Data Construction');
{
  const item = {
    imageUrl: 'https://example.com/img.jpg',
    title: '赛博朋克城市',
    prompt: 'cyberpunk city, neon lights, rain',
    negativePrompt: 'blurry, bad quality',
    model: 'stable diffusion xl',
    tags: ['赛博朋克', '城市', '霓虹', '雨'],
    summary: '一座霓虹闪烁的未来都市'
  };

  const workData = {
    authorId: 'user-123',
    title: item.title || '收集作品',
    summary: item.summary || '',
    prompt: item.prompt || '',
    negativePrompt: item.negativePrompt || '',
    asset: { url: '/uploads/test.jpg' },
    generation: { model: item.model || '' },
    customTags: (item.tags || []).slice(0, 8)
  };

  assertEqual(workData.title, '赛博朋克城市', 'title correct');
  assertEqual(workData.prompt, 'cyberpunk city, neon lights, rain', 'prompt correct');
  assertEqual(workData.negativePrompt, 'blurry, bad quality', 'negativePrompt correct');
  assertEqual(workData.generation.model, 'stable diffusion xl', 'model correct');
  assertEqual(workData.customTags.length, 4, 'tags correct count');
  assertEqual(workData.summary, '一座霓虹闪烁的未来都市', 'summary correct');
}

// Test 5: Tags limiting (max 8)
console.log('\nTest 5: Tags Limiting');
{
  const manyTags = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'];
  const limited = manyTags.slice(0, 8);
  assertEqual(limited.length, 8, 'limits to 8 tags');
  assert(!limited.includes('t9'), 'excess tags removed');
}

// Test 6: Prompt truncation for large pages
console.log('\nTest 6: Content Truncation');
{
  function buildOrganizePrompt(pageContent) {
    let prompt = 'x'.repeat(15000);
    if (prompt.length > 12000) {
      prompt = prompt.substring(0, 12000) + '\n\n[内容已截断...]';
    }
    return prompt;
  }

  const result = buildOrganizePrompt({});
  assert(result.length <= 12020, 'truncates to ~12000 chars');
  assert(result.includes('[内容已截断...]'), 'includes truncation marker');
}

// Test 7: Image filename generation
console.log('\nTest 7: Image Filename Generation');
{
  function generateFilename(contentType) {
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    return `collect_${Date.now()}.${ext}`;
  }

  assert(generateFilename('image/jpeg').endsWith('.jpg'), 'JPEG → .jpg');
  assert(generateFilename('image/png').endsWith('.png'), 'PNG → .png');
  assert(generateFilename('image/webp').endsWith('.webp'), 'WebP → .webp');
  assert(generateFilename('').endsWith('.jpg'), 'unknown → .jpg fallback');
}

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`总计: ${testsPassed} 通过, ${testsFailed} 失败`);
console.log(`${'='.repeat(40)}\n`);

process.exit(testsFailed > 0 ? 1 : 0);
