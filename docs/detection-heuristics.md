# PDF 大纲启发式检测规则

> 适用范围：`apps/web/src/features/pdf-outline/pdfOutline.ts` 中的 `parsePdfOutline` → `buildSuggestedOutline`。
> 目的：把 PDF 内**没有书签**或**需要补充**的章节标题挑出来，作为"检测到的大纲（detected）"喂给用户编辑，最终由后端用 `pdf-lib` 写回。

---

## 1. 流水线总览

```
PDF 字节流
   ↓ pdfjs-dist getDocument
TextContent（每页 TextItem 列表）
   ↓ buildPageLines：seg 化 → 按 y 聚行 → 行内合并
TextLine[] { fontName, pageNumber, size, text, x, y }
   ↓ buildSuggestedOutline：多特征打分 + 字号分箱
PdfOutlineNode[] { id, level, pageNumber, source:'detected', title, confidence }
```

- 与之并行的还有一条**嵌入式书签**路径（`embedded` 路径，`document.getOutline()`），不在本文档范围。
- 启发式只关心"被文本内容暗示"的标题，**不**尝试识别图像/封面。

---

## 2. 文本行抽取（`buildPageLines`）

源数据是 `pdfjs-dist` 的 `TextItem`，每个 item 携带 `transform: [a, b, c, d, e, f]`（即 PDF 文本矩阵）和 `height`、`width`、`fontName`、`str`。

### 2.1 字号估算

```ts
size = max(|a|, |d|, |height|)
```

- 取文本矩阵的水平缩放、垂直缩放、官方 height 三者绝对值的最大值。
- 抗"旋转文本"或"被 transform 缩放过"的 PDF。

### 2.2 坐标

- `x = transform[4]`
- `y = transform[5]`
- `width = |transform_width|`

### 2.3 排序

先按 y **降序**（PDF 坐标系 y 越大越靠上），y 差 ≤ 1.5 时按 x **升序**。
→ 视觉上的"从上到下、从左到右"。

### 2.4 行聚类（核心）

按 y 差把 segments 聚成同一行：

```
tolerance = clamp(2, 8, size * 0.45)
若 |seg.y - currentY| ≤ tolerance → 同一行
否则新开一行
```

- `size * 0.45` 让大字号行有更大的容差（避免行间距稍大被误拆）。
- 下限 2、上限 8 防止过松或过紧。

### 2.5 行内空格合并（`shouldInsertSpace`）

把同一行的 segments 按 x 排序，逐段拼起来：

| 条件 | 是否补空格 |
|---|---|
| `gap ≤ 2` | 否（同一字符被拆开的情况） |
| `gap > 2` 且前后都是字母/数字 | **是**（英文单词间常见） |
| `gap > 12` 且下一字符不是 `，。！？；：,.!?;:)` 之一 | 是（中英文混排大间距） |
| 其它 | 否 |

`previousEndX` 累计每段结束 x，处理"段 A 结束后段 B 才在更右处开始"的情形。

### 2.6 行的最终特征

```ts
{ fontName: 段中第一个非空 fontName,
  pageNumber,
  size: max(段 sizes),
  text: 拼接并 collapse 多空白,
  x: min(段 x),       // 行最左
  y: median(段 y) }   // 行中线
```

最后过滤掉 `text.length === 0` 的行。

---

## 3. 编号识别（`numberingPatterns` → `getNumberingLevel`）

先用一组正则匹配显式编号。命中即返回对应的 `level`（`null` 表示未命中）。

| Level | 正则 | 命中示例 |
|---|---|---|
| 1 | `^第[\d一二三四五六七八九十百千零]+[章节篇部分]` | `第三章` `第十部分` |
| 1 | `^\d+\s+[A-Z][A-Za-z0-9\s-]{1,}` | `1 Introduction` `2  Background` |
| 1 | `^\d+\.(?!\d)` | `1.` `12.`（不接续数字，避免和 `1.2` 冲突） |
| 2 | `^\d+\.\d+(?!\.)` | `1.2` `3.10` |
| 3 | `^\d+\.\d+\.\d+` | `1.2.3` `2.15.7` |
| 2 | `^[一二三四五六七八九十]+[、.]` | `一、` `三、` `十、` |
| 3 | `^[（(][一二三四五六七八九十]+[)）]` | `（一）` `(三)` |

**匹配顺序即优先级**：按数组顺序遍历，命中即返回，不继续向下尝试。
例如"3.1.2" 会先匹配 `1.` 失败、再 `1.2` 失败（`(?!\.)` 阻断了 `1.2.`）、再命中 `1.2.3` → level 3。

---

## 4. 候选打分（`buildSuggestedOutline` 核心）

每行 `TextLine` 都计算一个 `score`，规则如下：

### 4.1 起步分 = 0

### 4.2 加分项（鼓励成为标题）

| 信号 | 条件 | 加分 |
|---|---|---|
| 显式编号 | `getNumberingLevel(text) !== null` | **+1.4** |
| 字号偏大（强） | `size ≥ medianSize × 1.18` | **+1.15** |
| 字号偏大（弱） | `size ≥ medianSize × 1.08` | **+0.65** |
| 短文本 | `len(text) ≤ 36` | **+0.45** |
| 中等长度 | `36 < len(text) ≤ 60` | **+0.20** |
| 左侧缩进 | `x ≤ 72`（≈ 1 英寸） | **+0.15** |
| 粗体字体 | fontName 匹配 `/bold\|heavy\|black\|semibold/i` | **+0.25** |

> `medianSize` = 所有 TextLine 字号的中位数，作为"正文字号"的代理。

### 4.3 减分项（强惩罚）

| 信号 | 条件 | 减分 |
|---|---|---|
| 句子结尾标点 | 末尾是 `。！？!?` 之一 | **−0.35** |
| 类正文（body copy） | 见 `isLikelyBodyCopy` | **−0.95** |

#### `isLikelyBodyCopy(text)` 定义

```ts
normalized = text.replace(/\s+/g, ' ').trim()
return normalized.length > 90
   || (count(，,、,,,) >= 3 && normalized.length > 40)
```

- 触发条件**任一**：
  - 长度 > 90 字符（标题一般不会这么长）
  - 标点 `，,、` 累计 ≥ 3 **且** 长度 > 40（典型一句话）

### 4.4 阈值

```ts
.filter(candidate => candidate.score >= 1.25)
```

- 低于 1.25 直接丢弃，视为"不太像标题"。
- 单凭"显式编号"（+1.4）就能通过；但若同时是 body copy（−0.95 + 可能−0.35）也会被压回去。

### 4.5 同页去重

```ts
filter((candidate, index, list) => {
  const previous = list[index - 1]
  return !previous
    || previous.line.pageNumber !== candidate.line.pageNumber
    || previous.line.text !== candidate.line.text
})
```

- 同一页连续出现两次完全一样的文本，只保留第一个。
- 防"标题在奇偶页重复印"的双面版式。

---

## 5. 层级推断

候选通过后，取**前 3 大字号**作为 sizeBands：

```ts
sizeBands = unique(round(size * 2) / 2)   // 0.5 精度
            .sort((a, b) => b - a)        // 降序
            .slice(0, 3)                  // 最多 3 个
```

- 比如一篇文档里有 `{28, 22, 16, 14}` 四档标题 → sizeBands = `[28, 22, 16]`。

### 5.1 显式编号优先

```ts
level = explicitLevel ?? assignLevelFromSize(size, sizeBands)
```

- 一旦匹配到 `numberingPatterns`，编号直接决定层级，不看字号。

### 5.2 否则按字号分箱

```ts
for (i = 0; i < sizeBands.length; i++) {
  if (|sizeBands[i] - size| ≤ 0.75) return i + 1
}
return min(sizeBands.length + 1, 4)  // 兜底，最多 4 级
```

- 容差 0.75 防止字号 0.1 抖动。
- 兜底不超过 4 级（与 UI 限制一致）。

---

## 6. 置信度归一化

```ts
confidence = min(0.99, round(score / 2.5, 2))
```

- 把 score 线性映射到 `[0, 0.99]`。
- score = 2.5 时为 1.0，封顶 0.99 避免虚假的"100% 准确"。
- 实际可达最高分 ≈ 1.4(编号) + 1.15(字号强) + 0.45(短) + 0.25(粗体) + 0.15(左对齐) = **3.4** → 0.99。
- 显式编号 + 字号强 = 2.55 → 0.99。
- 显式编号 + 字号弱 = 2.05 → 0.82。

UI 用这个值给候选节点一个"可信度"提示，便于用户取舍。

---

## 7. 调参速查

| 现象 | 调整方向 |
|---|---|
| 漏掉很多标题 | 把 `score >= 1.25` 降到 `1.0`；或把 `1.18` 字号阈值降到 `1.12` |
| 误把正文当标题 | 强化 `isLikelyBodyCopy`：把长度阈值从 90 降到 60；或把 `score >= 1.25` 抬到 `1.5` |
| 标题层级错乱 | 检查 `numberingPatterns` 顺序；考虑把 `^\d+\.(?!\d)` 的负向断言收紧 |
| 中英文混排空格不对 | 改 `shouldInsertSpace` 的 `gap > 12` 阈值 |
| 行被错拆/合错行 | 调 `tolerance = clamp(2, 8, size * 0.45)` 的上下限或 0.45 系数 |
| 字号档位少 | 放宽 `slice(0, 3)` 到 `slice(0, 5)`；注意 UI 限制为 4 级 |
| 检测出太多候选 | 进一步加阈值，或在同页去重之外再按"前后 3 行不能都是候选"过滤 |

---

## 8. 已知边界

1. **扫描件/影印件**：pdfjs 抽不出文本 → `lines` 为空 → 不可能命中任何规则，结果会空。`warnings` 里会提示"可能是扫描件或样式过重"。
2. **纯图标题**：完全靠字号/位置，识别不到图标或徽标里的文字。
3. **下标/上标混排**：行聚类容差可能把它们并到主行。
4. **跨栏版式**：两栏正文会被拼成一行（因为 y 接近），可能误判为长标题；body copy 惩罚会兜底。
5. **英文章节 `Chapter 1`**：当前 `numberingPatterns` 不识别，需要新增 `^Chapter\s+\d+` 之类。

---

## 9. 相关代码位置

| 关注点 | 位置 |
|---|---|
| 入口 | [pdfOutline.ts:379](apps/web/src/features/pdf-outline/pdfOutline.ts#L379) `parsePdfOutline` |
| 行抽取 | [pdfOutline.ts:215](apps/web/src/features/pdf-outline/pdfOutline.ts#L215) `buildPageLines` |
| 编号模式 | [pdfOutline.ts:64](apps/web/src/features/pdf-outline/pdfOutline.ts#L64) `numberingPatterns` |
| 编号解析 | [pdfOutline.ts:90](apps/web/src/features/pdf-outline/pdfOutline.ts#L90) `getNumberingLevel` |
| 主体打分 | [pdfOutline.ts:303](apps/web/src/features/pdf-outline/pdfOutline.ts#L303) `buildSuggestedOutline` |
| body copy 判断 | [pdfOutline.ts:102](apps/web/src/features/pdf-outline/pdfOutline.ts#L102) `isLikelyBodyCopy` |
| 字号分箱 | [pdfOutline.ts:293](apps/web/src/features/pdf-outline/pdfOutline.ts#L293) `assignLevelFromSize` |
| 类型/数据 | [pdfOutline.ts:11-32](apps/web/src/features/pdf-outline/pdfOutline.ts#L11) `OutlineSource` / `PdfOutlineNode` / `ParsedPdfDocument` |
