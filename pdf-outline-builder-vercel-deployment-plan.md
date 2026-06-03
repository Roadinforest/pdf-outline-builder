# PDF Outline Builder 独立站点 + Vercel 部署技术方案（Hono + React）

## 1. 背景与目标

当前 `PDF Outline Builder` 已经在本项目中完成了核心能力：

- 浏览器侧读取 PDF
- 自动生成目录候选
- 树状编辑目录
- 将目录写回 PDF 并导出

现阶段它仍然嵌在个人站点里，部署方式是：

- 前端：`Vite + React` 静态构建
- 后端：自托管 `Node + Python(pypdf)` 服务

接下来的目标是把它抽离成一个单独产品，并部署到 Vercel，同时尽量保持：

- 前端仍然使用 `React`
- 不引入 `Next.js`
- 后端改为轻量的 `Hono`
- 继续保留“浏览器识别目录、服务端只做导出”的低成本思路

---

## 2. 结论先行

### 推荐结论

推荐把新产品拆成两个 Vercel Project：

1. `web`：`Vite + React` 前端站点
2. `api`：`Hono` API 服务

并采用以下部署模型：

- 前端静态资源部署到 Vercel
- API 由 Hono 跑在 Vercel Functions 上
- PDF 原文件与导出文件存到 `Vercel Blob`
- 浏览器负责目录识别与编辑
- 后端只接收 `blobUrl + outline JSON`，负责写回 PDF 并导出

### 为什么不建议“单个 Hono 项目同时扛前后端”

虽然 Hono 在 Vercel 上支持零配置部署，但官方也明确说明：

- 静态资源应放在 `public/**`
- `Hono` 的 `serveStatic()` 在 Vercel 上不会生效

这意味着如果你想把 `Vite` 打出来的整套前端直接交给 Hono 统一托管，会比“前后端分项目部署”更绕。

所以更稳的结构不是：

```text
一个 Hono 项目 = API + 静态站点托管
```

而是：

```text
一个仓库
  ├─ apps/web  -> Vercel Project A
  └─ apps/api  -> Vercel Project B
```

这也是最适合 Vercel 的微服务形态。

---

## 3. 方案边界

本方案解决的是：

- 抽离成独立网站
- 在 Vercel 上部署
- 保持轻量框架组合
- 控制服务端成本
- 为后续商业化或产品化留下空间

本方案暂不追求：

- 大规模 OCR
- 批处理队列
- 超大 PDF 长时间后台任务
- 多租户账户系统

如果后面要做这些，最终大概率还是会引入“外部 PDF 微服务”。

---

## 4. 官方约束与关键判断

这个方案成立，依赖几个关键事实：

### 4.1 Hono 可以直接部署到 Vercel

Vercel 官方文档说明：

- `Hono` 可以零配置部署到 Vercel
- Hono 应用导出默认实例即可
- 部署后服务端路由自动成为 `Vercel Functions`

这意味着 `Hono` 非常适合承担独立 API 服务。

### 4.2 Blob 可以配合任意前端框架

Vercel Blob 官方文档明确指出：

- Blob client upload 适用于任意前端框架

所以你的前端完全没必要为了上传能力换到 `Next.js`。

### 4.3 Vercel Function 请求/响应体上限仍是 4.5MB

这对 PDF 类产品是核心约束。

如果前端把 PDF 作为 multipart 直接 POST 给函数，就很容易触发上限。  
因此必须改成：

```text
Browser -> 直传 Blob
Browser -> 把 blobUrl + outline JSON 发给 API
```

### 4.4 Vercel Functions 可以承担中等时长 PDF 导出

当前官方限制下，启用 Fluid Compute 后，Node Function 在 Hobby 计划默认/最大都可到 `300s`，并且 Node Runtime 最高内存可到 `2GB`。  
这说明：

- 小到中等 PDF 的“下载 Blob -> 写目录 -> 上传 Blob”是有机会跑通的
- 但如果未来要上 OCR、批处理、大体积扫描件，Vercel Function 不会是最终终点

### 4.5 不建议再用 Vercel KV 作为核心状态存储

`Vercel KV` 已经 sunset。  
所以任务状态、导出记录这类数据，建议直接落：

- `Postgres`，或
- 外部 Redis / Upstash / Supabase / Neon

---

## 5. 推荐总体架构

## 5.1 架构图

```text
Browser
  |
  | 1. 打开前端站点
  v
Vercel Project: web
(Vite + React)
  |
  | 2. 请求 API 获取 Blob 上传能力
  v
Vercel Project: api
(Hono on Vercel Functions)
  |
  | 3. 浏览器直传 PDF 到 Blob
  v
Vercel Blob
  |
  | 4. 浏览器本地识别目录并编辑
  |
  | 5. 提交 sourceBlobUrl + outline JSON
  v
Hono Export API
  |
  | 6. 下载源 PDF，写入 outline，重新上传
  v
Vercel Blob
  |
  | 7. 写任务记录 / 返回结果
  v
Postgres
  |
  | 8. 前端查询任务结果
  v
Browser 下载新 PDF
```

## 5.2 逻辑拆分

系统拆成 5 层：

1. 前端交互层
2. 文件上传层
3. 目录识别层
4. PDF 导出层
5. 任务状态层

### 1. 前端交互层

职责：

- 上传 PDF
- 预览 PDF
- 展示已有目录
- 生成目录候选
- 树状编辑目录
- 发起导出
- 显示导出结果

### 2. 文件上传层

职责：

- 给浏览器下发 Blob 上传能力
- 避免大文件经过 Function body

### 3. 目录识别层

职责：

- 使用 `pdfjs-dist` 读取 PDF 文本
- 基于字体、位置、编号模式推断标题层级
- 保持现有“用户校对”工作流

### 4. PDF 导出层

职责：

- 从 Blob 拉取源 PDF
- 把目录写成 PDF outline / bookmarks
- 把新 PDF 上传回 Blob

### 5. 任务状态层

职责：

- 记录任务创建时间与状态
- 存储结果文件地址
- 存储失败原因

---

## 6. 为什么选 Hono + React，而不是 Next.js

### 6.1 对你当前项目的贴合度更高

你现在已经有：

- `Vite + React + TypeScript`
- 浏览器侧 PDF.js 工作流
- 独立的前端预览页

所以抽离时，最省迁移成本的是：

- 保留 React 组件和状态逻辑
- 保留 Vite 打包思路
- 新增一个 Hono API 子项目

而不是把整套页面、路由、部署模型迁移到 `Next.js App Router`。

### 6.2 Hono 更适合“轻 API 服务”

你这里的后端不是典型 SSR 站点，它只是：

- 签发上传 token
- 校验导出请求
- 写回 PDF
- 返回任务状态

这类后端非常适合用 Hono，而不需要一个更重的全栈框架。

### 6.3 前后端边界更清楚

抽成两个 Project 后，职责非常清晰：

- `web`：纯前端产品
- `api`：纯后端服务

后面即使把导出部分从 Vercel Functions 迁到 Railway / Fly.io / VPS，前端也几乎不用重构。

---

## 7. 技术选型

## 7.1 前端

- `React 18`
- `TypeScript`
- `Vite`
- `React Router`
- `pdfjs-dist`
- `TanStack Query` 或轻量自定义请求层
- `Zustand` 或 React 内建状态管理

### 继续复用的现有逻辑

可以直接迁移的核心模块：

- `src/preview/pdfOutline.ts`
- `src/preview/PdfOutlinePreviewPage.tsx`
- 目录树编辑逻辑
- worker cache busting 方案

### 前端职责边界

前端必须承担：

- PDF 本地读取
- PDF 页面预览
- 文本提取
- 自动目录识别
- 人工校对

前端不承担：

- 把目录真正写回 PDF 文件
- 保存长期任务状态
- 文件存储

## 7.2 后端

- `Hono`
- `TypeScript`
- 运行在 `Vercel Functions`
- 使用 Fetch API 风格的 Request/Response

### Hono 负责的 API

- `/api/health`
- `/api/blob/upload`
- `/api/outline/export`
- `/api/jobs/:id`

## 7.3 文件存储

- `Vercel Blob`

用途：

- 存原始 PDF
- 存导出后的 PDF
- 可选存中间 outline JSON 快照

## 7.4 数据库存储

推荐：

- `Postgres`

可选：

- `Supabase Postgres`
- `Neon`
- `Railway Postgres`

不推荐：

- 把任务状态只存在内存里
- 继续规划 `Vercel KV`

## 7.5 PDF 导出库

优先顺序建议：

1. 先调研并验证纯 JS 路线
2. 如果 JS 写 outline 不稳定，再保留 Python 微服务兜底

### 方案 A：纯 Node.js

候选：

- `pdf-lib`
- 其他支持 PDF bookmarks / outlines 的 JS 库

优点：

- 运行时统一
- 更适合 Vercel
- 运维简单

风险：

- 书签写入的成熟度和兼容性要重新验证

### 方案 B：外部 Python 微服务

技术：

- `FastAPI`
- `pypdf` 或 `PyMuPDF`

优点：

- 延续你当前已经可用的导出链路
- PDF 兼容性通常更稳

风险：

- 不再是“纯 Vercel”
- 需要额外部署一套微服务

---

## 8. 推荐仓库结构

## 8.1 单仓库双项目

推荐直接用 monorepo：

```text
pdf-outline-builder/
  apps/
    web/
      src/
        pages/
        components/
        features/
          pdf-outline/
        lib/
        router/
      public/
      package.json
      vite.config.ts
      tsconfig.json
    api/
      src/
        index.ts
        routes/
          health.ts
          blob-upload.ts
          outline-export.ts
          jobs.ts
        services/
          blob.ts
          export-pdf.ts
          jobs.ts
          validators.ts
        db/
          client.ts
          schema.ts
      package.json
      tsconfig.json
      vercel.json
  packages/
    shared/
      src/
        types/
          outline.ts
          job.ts
        schemas/
          outline.ts
          export.ts
      package.json
  package.json
  pnpm-workspace.yaml
```

## 8.2 为什么推荐 monorepo

优点：

- 前后端类型共享更自然
- 同一仓库管理更方便
- 仍然可以在 Vercel 中拆成两个 Project
- 便于后续把 PDF 微服务作为第三个项目接进来

---

## 9. Vercel 项目拆分方案

## 9.1 两个独立 Project

### Project A: `pdf-outline-web`

- Root Directory: `apps/web`
- Framework: `Vite`
- 输出：静态站点
- 域名：`pdf.woodin.top` 或单独域名

### Project B: `pdf-outline-api`

- Root Directory: `apps/api`
- Framework: `Other`
- Hono 默认导出应用
- 域名：`api.pdf.woodin.top`

## 9.2 为什么不建议先做单域同项目

理论上可以把前端和 Hono API 强塞到一个 Vercel Project 里，但会带来几个问题：

- Vite 静态产物与 Hono 项目构建耦合
- 项目结构更绕
- API 与站点回滚节奏绑死
- 后续迁移 PDF 重服务时边界不清楚

所以第一版就拆两项目，更清爽。

## 9.3 前端如何拿到 API 地址

前端配置环境变量：

```bash
VITE_API_BASE_URL=https://api.pdf.woodin.top
```

开发环境：

```bash
VITE_API_BASE_URL=http://localhost:8787
```

---

## 10. 页面规划

## 10.1 页面列表

### `/`

产品首页：

- 说明用途
- 展示能力边界
- 上传入口

### `/builder`

主工作台：

- 上传 PDF
- 预览 PDF
- 目录树编辑
- 导出按钮

### `/jobs/:id`

任务结果页：

- 显示处理中
- 显示失败原因
- 显示下载链接

### `/docs`

帮助页：

- 文件大小限制
- 隐私说明
- 常见问题

---

## 11. 核心业务流程

## 11.1 上传流程

### 目标

避免 PDF 文件穿过 Vercel Function 请求体。

### 流程

1. 前端请求 `POST /api/blob/upload`
2. API 返回 client upload 相关信息
3. 浏览器使用 Blob SDK 直传 PDF
4. Blob 返回文件 URL
5. 前端把 `blobUrl` 放入当前工作台状态

### 为什么这样设计

因为 Vercel Function 请求/响应体上限是 `4.5MB`，直接传 PDF 会非常脆弱。

---

## 11.2 目录识别流程

### 流程

1. 浏览器读取用户本地 PDF
2. 使用 `pdfjs-dist` 获取页面文本、位置、字号
3. 识别已有 outline
4. 如无 outline，则根据规则生成候选目录
5. 用户在树状界面中修正

### 识别策略

优先沿用当前规则：

- 字号更大
- 字重更粗
- 页内位置更靠上
- 编号模式更像标题
- 与正文段落长度差异明显

### 为什么继续放浏览器做

- 降低服务端成本
- 降低导出函数压力
- 避免服务端重复解析全文
- 兼容你的 2G 服务器经验和“轻服务端”目标

---

## 11.3 导出流程

### 流程

1. 前端把 `sourceBlobUrl + outline + documentMeta` 发给 `POST /api/outline/export`
2. API 创建任务记录
3. API 下载源 PDF
4. API 写入 outline/bookmarks
5. API 上传新 PDF 到 Blob
6. API 更新任务状态
7. 前端轮询 `GET /api/jobs/:id`
8. 用户下载新 PDF

### 两种导出模式

#### 模式 A：同步导出

适合：

- PDF 较小
- 目录项数量有限
- 处理时间能稳定控制在几十秒内

返回：

- 直接返回 `completed`
- 或返回 `jobId` 但请求内已经完成

#### 模式 B：伪异步导出

适合：

- 想保留任务状态页
- 想兼容未来更重的处理链路

做法：

- API 立即创建 `queued` 任务
- 同一请求内执行导出
- 完成后更新为 `completed`

注意：

Vercel 没有内建队列产品，这里的“任务系统”更多是状态管理，不是真正的解耦异步执行。

---

## 12. API 设计

## 12.1 `GET /api/health`

用途：

- 健康检查
- 部署验证

响应：

```json
{
  "status": "ok",
  "service": "pdf-outline-api"
}
```

## 12.2 `POST /api/blob/upload`

用途：

- 给前端生成 Blob 上传能力

请求：

```json
{
  "fileName": "book.pdf",
  "contentType": "application/pdf",
  "size": 10485760
}
```

响应：

```json
{
  "handleUploadUrl": "https://api.pdf.woodin.top/api/blob/upload",
  "pathname": "uploads/2026/06/book-abc123.pdf",
  "maxSize": 52428800
}
```

说明：

- 前端实际上传通过 `@vercel/blob/client`
- 后端负责授权与约束，不直接接收文件二进制

## 12.3 `POST /api/outline/export`

请求：

```json
{
  "sourceBlobUrl": "https://blob.vercel-storage.com/...",
  "document": {
    "fileName": "book.pdf",
    "pageCount": 128,
    "fingerprint": "pdf-xxx"
  },
  "outline": [
    {
      "id": "node_1",
      "level": 1,
      "title": "Chapter 1",
      "pageNumber": 1,
      "order": 1
    }
  ]
}
```

响应：

```json
{
  "jobId": "job_123",
  "status": "processing"
}
```

## 12.4 `GET /api/jobs/:id`

响应：

```json
{
  "id": "job_123",
  "status": "completed",
  "downloadUrl": "https://blob.vercel-storage.com/...",
  "error": null,
  "createdAt": "2026-06-03T10:00:00.000Z",
  "updatedAt": "2026-06-03T10:00:08.000Z"
}
```

状态枚举：

- `queued`
- `processing`
- `completed`
- `failed`

---

## 13. 数据模型

## 13.1 `jobs`

```sql
create table jobs (
  id text primary key,
  source_blob_url text not null,
  output_blob_url text,
  file_name text not null,
  fingerprint text,
  page_count integer,
  status text not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 13.2 `job_outlines`

```sql
create table job_outlines (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  node_order integer not null,
  level integer not null,
  title text not null,
  page_number integer not null
);
```

### 为什么要单独存 outline

- 便于排查导出错误
- 便于重试
- 便于后续做“历史任务回看”

---

## 14. Hono API 设计建议

## 14.1 路由层

推荐把 Hono 路由按职责拆开：

```ts
app.route('/api/health', healthRoute)
app.route('/api/blob/upload', blobUploadRoute)
app.route('/api/outline/export', outlineExportRoute)
app.route('/api/jobs', jobsRoute)
```

## 14.2 Service 层

至少拆出这几个 service：

- `blobService`
- `jobService`
- `outlineExportService`
- `validatorService`

### `blobService`

负责：

- 生成 client upload 所需参数
- 校验 blob URL
- 上传导出文件

### `jobService`

负责：

- 创建任务
- 更新任务状态
- 查询任务

### `outlineExportService`

负责：

- 下载源 PDF
- 验证 outline 数据
- 调用 PDF 写回逻辑
- 上传结果 PDF

### `validatorService`

负责：

- 校验 pageNumber 是否越界
- 校验 title 非空
- 校验 level 连续性
- 校验 sourceBlobUrl 是否属于允许来源

---

## 15. PDF 导出实现路线

## 15.1 第一优先：纯 JS 导出

目标：

- API 全部保持在 `Hono + Node Runtime`
- 避免混入 Python runtime

### 验证重点

需要在抽离项目初始化阶段优先验证：

1. 能否写入标准 PDF outline / bookmarks
2. Adobe Reader 是否识别
3. macOS Preview 是否识别
4. Chrome 内建 PDF 查看器是否识别
5. 对已有 metadata 是否有副作用

### 通过条件

只有在以下条件满足时，才建议坚持纯 JS：

- 小样本 PDF 全部写回成功
- 至少 3 个常用阅读器识别正常
- 不会明显破坏原 PDF

## 15.2 第二优先：外部 Python 微服务

如果纯 JS 不稳定，推荐改成：

```text
Vercel web + Vercel Hono API + 外部 Python Export Service
```

此时架构变为：

- Hono 负责鉴权、任务创建、状态查询
- Python 服务专门负责 PDF 写回

### 为什么不推荐“Vercel Hono 里再 spawn Python”

- Vercel 函数打包复杂
- 运行时不可控
- 冷启动与依赖链更重
- 排错困难

这条路不适合作为正式产品主路径。

---

## 16. Vercel 部署方案

## 16.1 Monorepo 部署

Vercel 官方支持 monorepo，并允许一个仓库连接多个 Project。  
所以推荐：

- 同一 Git 仓库
- `apps/web` 导入为一个 Vercel Project
- `apps/api` 导入为另一个 Vercel Project

## 16.2 `web` 项目设置

- Root Directory: `apps/web`
- Build Command: `pnpm build`
- Output Directory: `dist`

环境变量：

```bash
VITE_API_BASE_URL=https://api.pdf.woodin.top
```

## 16.3 `api` 项目设置

- Root Directory: `apps/api`
- Framework Preset: `Other`
- 入口：Hono 默认导出应用

环境变量：

```bash
BLOB_READ_WRITE_TOKEN=...
DATABASE_URL=...
APP_ORIGIN=https://pdf.woodin.top
```

## 16.4 自定义域名

建议：

- 前端：`pdf.woodin.top`
- API：`api.pdf.woodin.top`

这样好处是：

- 边界清楚
- 日志分离
- 未来替换后端实现更方便

---

## 17. 本地开发方案

## 17.1 开发命令

建议使用 `pnpm workspace`：

```bash
pnpm install
pnpm --filter web dev
pnpm --filter api dev
```

### 本地地址

- 前端：`http://localhost:5173`
- API：`http://localhost:8787`

## 17.2 Hono 本地运行方式

有两种：

### 方式 A

直接跑 Hono 本地 dev server

### 方式 B

使用 `vercel dev`

如果要尽量贴近线上 Vercel Functions 行为，优先 `vercel dev`。

## 17.3 Blob 本地联调

Blob client upload 的 `onUploadCompleted` 在本地不天然可回调。  
如需完整联调，建议：

- 用 `ngrok` 暴露本地 API
- 或先只测上传 token 与前端上传路径

---

## 18. 安全设计

## 18.1 上传限制

必须限制：

- 只允许 `application/pdf`
- 文件大小上限，例如 `50MB`
- 单用户并发导出次数

## 18.2 导出请求校验

后端必须校验：

- `sourceBlobUrl` 必须属于你的 Blob 域名
- `outline` 节点数限制
- `pageNumber` 必须在合法页数范围内
- `title` 不能为空且长度有限

## 18.3 防止匿名滥用

MVP 阶段即使不做登录，也建议至少有：

- 简单 rate limit
- 每 IP 每分钟导出次数限制
- reCAPTCHA / Turnstile 预留位

## 18.4 文件生命周期

建议对文件设置自动清理策略：

- 原 PDF 保留 `24h ~ 72h`
- 导出文件保留 `24h ~ 7d`

这样能控制存储成本和隐私风险。

---

## 19. 性能与限制

## 19.1 适合 Vercel 直接处理的场景

- 文本型 PDF
- 页数中等
- 文件大小中等
- 用户单文件交互式处理

## 19.2 不适合长期停留在纯 Vercel Functions 的场景

- 扫描型 PDF OCR
- 超大 PDF
- 批量导入导出
- 长耗时后台任务
- 复杂企业文档流水线

## 19.3 建议的 MVP 限制

- 文件大小：`<= 50MB`
- 页数：`<= 300`
- 单次只处理一个文件
- 不支持 OCR

---

## 20. 分阶段实施计划

## Phase 1：独立产品骨架

目标：

- 搭好 `web + api + shared` monorepo
- 前端工作台能独立运行
- Hono 健康检查与上传接口可用

交付：

- `apps/web`
- `apps/api`
- `packages/shared`
- Vercel 双项目部署打通

## Phase 2：上传与浏览器识别迁移

目标：

- 前端接入 Blob 直传
- 迁移 PDF.js 预览与目录树
- 保留当前 worker cache-busting 方案

交付：

- `/builder`
- Blob 上传成功
- 本地目录候选生成成功

## Phase 3：导出链路打通

目标：

- 接通 `/api/outline/export`
- 支持导出带书签的新 PDF
- 任务结果可查询

交付：

- 导出完成
- Blob 下载链接返回
- 基础失败提示

## Phase 4：兼容性与稳定性

目标：

- 补充错误处理
- 增强导出兼容性
- 增加自动清理

交付：

- 更完整的 jobs 状态页
- 错误信息可追踪
- 文件生命周期清理策略

## Phase 5：重处理演进

目标：

- 如有需要，导出逻辑迁到外部 Python 服务

触发条件：

- JS 导出不稳定
- 需要 OCR
- 需要大文件
- 需要批处理

---

## 21. 风险清单

## 21.1 最大风险：JS 写 PDF outline 的兼容性

这是整套 Hono + Vercel 方案的最大技术风险。  
如果 JS 库无法稳定写回标准 bookmarks，那么就必须尽早切到外部 Python 微服务。

## 21.2 第二风险：函数处理时间与大文件

即使 Blob 解决了上传问题，导出函数本身仍会受到：

- 运行时长
- 内存
- 网络拉取 Blob 的耗时

影响。

## 21.3 第三风险：浏览器端 PDF 解析的设备差异

目录识别放浏览器侧虽然省后端，但用户设备差异会带来体验波动：

- 手机更慢
- 低配电脑更慢
- 大 PDF 首次解析更慢

---

## 22. 最终推荐

如果你要的是：

- 不上 Next.js
- 保持轻量
- 优先部署到 Vercel
- 后续还能继续微服务化

那么最推荐的路径就是：

```text
React + Vite 前端
        +
Hono API on Vercel
        +
Vercel Blob
        +
Postgres
```

并且从一开始就按“双项目 monorepo”来做。

### 最务实的技术判断

1. 前端继续保持浏览器识别目录，这是对的
2. 后端先只做导出与状态管理，这是对的
3. 上传必须改成 Blob client upload，这是必须的
4. 导出实现先验证纯 JS，如果不稳，就尽快切外部 Python 微服务

---

## 23. 推荐实施顺序

建议按这个顺序做，不要一开始就铺太大：

1. 新建 monorepo：`apps/web + apps/api + packages/shared`
2. 把现有 `PdfOutlinePreviewPage` 和 `pdfOutline.ts` 迁到 `apps/web`
3. 用 Hono 建 `health` 与 `blob/upload`
4. 接通 Blob 直传
5. 建 `outline/export` 与 `jobs/:id`
6. 先验证纯 JS 书签写回
7. 如果验证不过，立即把导出替换成 Python 微服务

---

## 24. 参考依据

以下判断基于官方资料：

- Vercel 官方 Hono 部署文档：支持零配置部署，Hono 路由会成为 Vercel Functions
- Vercel 官方 Hono 文档还说明静态资源应走 `public/**`，`serveStatic()` 在 Vercel 上不会生效
- Vercel Blob 官方文档：client upload 适用于任意前端框架
- Vercel Functions 限制文档：请求/响应体上限为 `4.5MB`
- Vercel Monorepo 文档：一个仓库可连接多个 Vercel Project
- Vercel 关于 KV 的官方说明：`Vercel KV` 已 sunset，应改用其他存储方案
