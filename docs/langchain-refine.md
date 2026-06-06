# LangChain × MiniMax 大纲精炼

> 让 LLM 帮我们把浏览器启发式检测出来的大纲"过滤 + 清洗"，再交还给用户编辑/导出。
> 该特性是**手动触发**（UI 顶部 `AI 精炼` 按钮），不会自动消耗 token。

---

## 1. 角色分工

| 模块 | 关注点 |
|---|---|
| 前端 `pdfjs-dist` | 解析 PDF、按字号/编号/字体/位置多特征打分，得到 `detected` 候选 |
| 前端 `PdfOutlinePreviewPage` | 展示 / 编辑 / 增删 / 拖拽；点击 `AI 精炼` 才把当前 outline 整组送后端 |
| 后端 `/api/outline/refine` | 接收 candidates，调用 LangChain + MiniMax，返回清洗后的 outline |
| 前端 | 用返回的 outline **整体替换** `outlineNodes`（用户后续仍可继续编辑） |
| 后端 `/api/outline/export` | 不变，继续把最终 outline 写回 PDF |

LLM **不**写 PDF，**不**调 Vercel Blob，**不**持久化任何状态。每次调用是无状态的。

---

## 2. 触发流程

```
[Builder 页面]
  点击 "AI 精炼" 按钮
      ↓
  handleRefineOutline()
      ↓ 拿当前 outlineNodes
  POST /api/outline/refine { candidates, fileName }
      ↓
  服务端 refineOutlineWithLLM()
      ↓ 调 LangChain ChatOpenAI（baseURL 指向 MiniMax）
  MiniMax 推理 → 结构化 JSON
      ↓
  返回 { outline: [{title, pageNumber, level}, ...], model, reasoning }
      ↓
  前端用返回的 outline 整体替换
```

按钮位置：在 `Upload PDF` 旁、`Download Payload` 前。
禁用条件：未解析文档 / `outlineNodes` 为空 / 正在请求中。

---

## 3. 接口契约

### 3.1 Request

`POST /api/outline/refine`

```json
{
  "candidates": [
    { "id": "detected-1", "title": "1  Introduction", "level": 1, "pageNumber": 3, "confidence": 0.92 },
    { "id": "detected-2", "title": "1.1  Background", "level": 2, "pageNumber": 7, "confidence": 0.78 }
  ],
  "fileName": "report.pdf",
  "instruction": "Keep at most 3 levels. Drop the appendix."
}
```

schema：[packages/shared/src/refine.ts](../packages/shared/src/refine.ts)

| 字段 | 类型 | 限制 |
|---|---|---|
| `candidates` | array(1~2000) | 必填，每项含 id/title/pageNumber/level/(confidence) |
| `fileName` | string? | 仅用于服务端日志，不会回传给 LLM |
| `instruction` | string? | 透传给 system prompt 后的追加指令，便于产品后续扩"自定义筛选条件" |

### 3.2 Response

```json
{
  "outline": [
    { "title": "1 Introduction", "pageNumber": 3, "level": 1 },
    { "title": "1.1 Background", "pageNumber": 7, "level": 2 }
  ],
  "model": "MiniMax-Text-01",
  "reasoning": "Removed appendix and table-of-contents entries."
}
```

### 3.3 错误码

| 状态 | 含义 |
|---|---|
| 400 | body 不是合法 JSON / 字段不通过 zod |
| 503 | `MINIMAX_API_KEY` 未配置（按钮仍可点，UI 给出明确提示） |
| 502 | 上游 LLM 调用失败（4xx/5xx/超时），body 含 `error` 字段 |
| 200 + `outline: []` | LLM 判断没有可保留的标题，UI 保留旧数据并提示 |

---

## 4. 服务端实现

文件：[apps/api/src/services/refineOutline.ts](../apps/api/src/services/refineOutline.ts)

### 4.1 客户端选型

```ts
new ChatOpenAI({
  apiKey: config.apiKey,
  model: config.model,
  temperature: 0.2,
  maxRetries: 1,
  configuration: { baseURL: config.baseUrl },
})
```

- 选 `ChatOpenAI` 而非 `ChatMinimax`，因为 MiniMax 提供 **OpenAI 兼容**接口，直接改 `baseURL` 即可。
- `temperature: 0.2` 让筛选更稳定；`maxRetries: 1` 防止 60s 超时。
- 模型名走 `MINIMAX_MODEL` env，默认 `MiniMax-Text-01`。

### 4.2 结构化输出

```ts
model.withStructuredOutput(zodSchema, { name: 'pdf_outline_refinement' })
```

- 强制 LLM 返回符合 zod 的 JSON，避免我们做脆弱的字符串解析。
- 失败时 LangChain 会抛错，被外层 `try/catch` 转为 502。

### 4.3 提示词（system prompt）

要点：
1. **过滤**：去掉非标题（正文、页脚、引用、版权水印、带句末标点的"假标题"）。
2. **清洗**：合并多空白、去掉首尾杂字符、保留编号前缀（`1.`, `1.2.3`, `第N章`, `Chapter N`, 罗马数字）。
3. **保真**：`pageNumber` 必须与原值一致，禁止编造。
4. **层级**：以 `level` 为基准，必要时 ±1，范围 [1,6]。
5. **限流**：最多 200 节点；过多时按 quality 截断。
6. **纯净输出**：只允许 JSON，禁止任何解释性散文（除 `reasoning` 字段外）。

完整文本见 `refineOutline.ts` 的 `systemPrompt` 常量。

### 4.4 候选裁剪

```ts
const HARD_LIMIT = 400
按 confidence 降序，截到 400
```

理由：100k 上下文模型足够处理 400 候选（约 30K tokens），又不会因为 2000 候选的极端情况烧光配额 / 超时。被丢弃的数量会写进 `reasoning` 末尾。

### 4.5 本地规范化（兜底）

拿到 LLM 输出后，服务端还会：
- `level` 截到 [1,6] 并 `Math.round`
- `title` 二次 `replace(/\s+/g, ' ')` + 去掉首尾 `-:·•●—–:` 等
- 同名去重（小写比较）
- 空标题丢弃

即便 LLM 输出有小毛病，落到前端时也是干净的。

### 4.6 没配 API key 的兜底

```ts
if (!config) return 503
```

前端拿到 503 弹"AI refinement is disabled. Set MINIMAX_API_KEY..."。**不**做"无 LLM 仍跑"的降级，避免用户点了按钮后感觉"成功了"但其实没经过 AI。

---

## 5. 前端实现

文件：[apps/web/src/features/pdf-outline/PdfOutlinePreviewPage.tsx](../apps/web/src/features/pdf-outline/PdfOutlinePreviewPage.tsx) + [apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts)

### 5.1 通用 `postJson` 助手

在 `lib/api.ts` 里加了一个 `postJson<TReq, TRes>(path, body)` 帮手，封装 fetch + 头 + 错误解析。所有后续 POST 调用都可复用。

### 5.2 按钮

```tsx
<Button
  variant="outline"
  onClick={() => void handleRefineOutline()}
  disabled={isRefining || outlineNodes.length === 0}
>
  <Sparkles className={isRefining ? 'animate-pulse' : undefined} />
  {isRefining ? 'Refining...' : 'AI 精炼'}
</Button>
```

### 5.3 状态机

| isRefining | 含义 |
|---|---|
| `false` | 空闲，可点 |
| `true` | 请求中，按钮禁用 + Sparkles 动画 + `setExportMessage('Asking the LLM...')` |

成功后 `setExportMessage` 显示精炼摘要（含 dropped 数量，可选 reason）。失败显示错误信息并保留原数据。

### 5.4 替换策略

精炼成功后：

```ts
setOutlineNodes(refined)              // 整体替换
setActivePreset('detected')          // 高亮 "Detected" tab
resetCollapsedNodes()
resetExpandedNodes()
```

- **整体替换**而不是合并：避免 LLM 已经过滤掉的"假标题"因为有手动编辑而被误保留。
- 但已用 `source: 'detected'` 标记，用户仍可继续手动增删。

---

## 6. 部署 / 配置

### 6.1 环境变量

`apps/api/.env.example` 已列出：

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `MINIMAX_API_KEY` | 是 | — | MiniMax 平台申请 |
| `MINIMAX_BASE_URL` | 否 | `https://api.minimaxi.com/v1` | 兼容 OpenAI 协议即可 |
| `MINIMAX_MODEL` | 否 | `MiniMax-Text-01` | 视后台支持的模型调整 |

Vercel：到 API 项目 → Settings → Environment Variables 加上面三个。

### 6.2 依赖

`apps/api/package.json`：

```json
"@langchain/core": "^0.3.61",
"@langchain/openai": "^0.5.5"
```

需要 `pnpm install` 安装。

### 6.3 CORS

新路由挂在 `/api/outline/refine`，自动继承 `app.ts` 里 `/api/*` 的 CORS 白名单（同 `localhost` / `*.vercel.app` / `CORS_ORIGINS`）。**无需**改 CORS 配置。

### 6.4 超时

Vercel Hobby 函数默认 10s，Pro 60s。`maxRetries: 1` + 400 候选 + 单次结构化调用基本 < 8s。若发现频繁 502，可考虑：
- 进一步把 `HARD_LIMIT` 调到 200
- 用流式响应 + 前端渐进替换（不在本次范围）

---

## 7. 测试建议

| 场景 | 验证点 |
|---|---|
| 未配 `MINIMAX_API_KEY` | 点按钮 → 看到 503 文案，原数据不动 |
| 正常 PDF（约 30 候选） | LLM 返回 ~25 节点，UI 替换，按钮恢复 |
| 巨型 PDF（>400 候选） | `reasoning` 出现 "Truncated N low-confidence candidates" |
| LLM 5xx | UI 报错 "AI refinement failed..."，原数据保留 |
| LLM 抽风返回空 | `outline: []` → UI "The LLM returned an empty outline. The original list is preserved." |
| 二次精炼 | 精炼后再点一次，按钮正常工作，id 走 `refined-N` |

---

## 8. 已知边界

1. **无网络**：直接 502 / 超时。
2. **模型不识别中文标题**：会让某些 `第N章` 被当成普通句子去掉。可在 system prompt 加一句 "Treat 第N章/第N节 as valid headings" 之类。
3. **超长标题**：限制 200 字符；超出在服务端规范化阶段会被丢掉。
4. **乱编号**：LLM 可能给出 pageNumber=0 这种，规范化阶段用 `Math.max(1, ...)` 兜底（见 `refineOutline.ts:normalizeLevel` 附近）。

---

## 9. 未来可扩展点

- `instruction` 字段已透传，可让 UI 加一个"额外要求"输入框（"保留前 10 章"、"只保留中文章节"）。
- 改成 SSE 流式返回，让 UI 边收边替换。
- 在 backend 落 trace（OpenTelemetry / LangSmith），看 prompt / tokens / 命中率。
- 用 LangChain 的 `ChatPromptTemplate` 抽出模板，便于评测时调参。
