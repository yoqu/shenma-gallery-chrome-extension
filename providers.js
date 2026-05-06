// Predefined LLM provider presets — OpenAI-compatible chat-completions endpoints.
// All models listed are vision-capable (multimodal) where the picker requires image
// understanding; text-only options are flagged in the comment for clarity.
//
// Sources of truth (verified ~2026-05):
//   OpenAI       https://platform.openai.com/docs/api-reference
//   DeepSeek     https://api-docs.deepseek.com/
//   Doubao(火山) https://www.volcengine.com/docs/82379/1099475
//   Bailian(阿里)https://help.aliyun.com/zh/model-studio/getting-started/models
//   Kimi (Moonshot) https://platform.moonshot.cn/docs
//   GLM (智谱)   https://bigmodel.cn/dev/api
//
// Each entry exposes:
//   id          stable key (used in storage)
//   name        zh-CN display label
//   baseUrl     OpenAI-compatible /v1 endpoint
//   models[]    suggested model IDs (first one used as default fill)
//   keyHint     short note about where to obtain the API key
//   docsUrl     link to provider docs

window.LLM_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4.1-mini',
      'gpt-4.1',
      'o4-mini',
    ],
    keyHint: '在 platform.openai.com → API keys 创建 sk- 开头的密钥',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    keyHint: 'DeepSeek 当前模型为纯文本，无法识图；如需识图请改用其他服务商',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'doubao',
    name: '豆包 / 火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      'doubao-1-5-vision-pro-32k-250115',
      'doubao-1-5-vision-pro-250328',
      'doubao-1-5-thinking-vision-pro-250428',
      'doubao-seed-1-6-250615',
    ],
    keyHint: '在火山方舟控制台「在线推理」开通模型并获取 API Key（接入点为模型 ID）',
    docsUrl: 'https://www.volcengine.com/docs/82379/1099455',
  },
  {
    id: 'bailian',
    name: '百炼 / 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen-vl-max-latest',
      'qwen-vl-plus-latest',
      'qwen2.5-vl-72b-instruct',
      'qwen2.5-vl-7b-instruct',
      'qwen-plus-latest',
    ],
    keyHint: '在阿里云百炼控制台「API-Key 管理」创建 sk- 开头的密钥',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api',
  },
  {
    id: 'kimi',
    name: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      'moonshot-v1-8k-vision-preview',
      'moonshot-v1-32k-vision-preview',
      'moonshot-v1-128k-vision-preview',
      'kimi-latest',
    ],
    keyHint: '在 platform.moonshot.cn → 用户中心 → API Key 管理 创建',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-4v-plus',
      'glm-4v',
      'glm-4.5v',
      'glm-4-plus',
    ],
    keyHint: '在 bigmodel.cn → 个人中心 → API Keys 创建',
    docsUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'Qwen/Qwen2.5-VL-72B-Instruct',
      'Qwen/Qwen2.5-VL-32B-Instruct',
      'Qwen/Qwen2.5-VL-7B-Instruct',
      'deepseek-ai/deepseek-vl2',
    ],
    keyHint: '在 cloud.siliconflow.cn → API 密钥 创建（聚合多家开源模型）',
    docsUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    models: [],
    keyHint: '任意兼容 OpenAI Chat Completions 协议的服务，如自部署 vLLM / Ollama',
    docsUrl: '',
  },
];
