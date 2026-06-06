// Standalone smoke test for refineOutlineWithLLM.
// Usage:  pnpm --filter @pdf-outline-builder/api exec tsx src/test-refine.ts
//
// Iterates over a few realistic candidate sets and prints what the LLM returns.
// Lets us see raw responses, not just parsed results, so we can pick the right
// structured-output strategy for the upstream LLM.

import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { refineOutlineWithLLM } from './services/refineOutline.js'

// In case the test is launched from a different cwd, also try the api package's .env.
loadEnv({ path: resolve(process.cwd(), '.env') })

const SAMPLE_EN = [
  { confidence: 0.9, id: 'd-1', level: 1, pageNumber: 1, title: 'Abstract' },
  { confidence: 0.4, id: 'd-2', level: 1, pageNumber: 2, title: 'This paper proposes a novel approach to the problem of distribution shift in deep learning models, with particular attention to medical imaging applications.' },
  { confidence: 0.85, id: 'd-3', level: 1, pageNumber: 3, title: '1. Introduction' },
  { confidence: 0.7, id: 'd-4', level: 2, pageNumber: 4, title: '1.1 Motivation' },
  { confidence: 0.7, id: 'd-5', level: 2, pageNumber: 5, title: '1.2 Contributions' },
  { confidence: 0.6, id: 'd-6', level: 1, pageNumber: 6, title: '2. Related Work' },
  { confidence: 0.6, id: 'd-7', level: 2, pageNumber: 7, title: '2.1 Domain Adaptation' },
  { confidence: 0.55, id: 'd-8', level: 1, pageNumber: 10, title: '3. Method' },
  { confidence: 0.5, id: 'd-9', level: 1, pageNumber: 12, title: '3.1 Problem Setup' },
  { confidence: 0.3, id: 'd-10', level: 1, pageNumber: 12, title: 'Figure 1: High-level overview of the proposed pipeline.' },
  { confidence: 0.3, id: 'd-11', level: 1, pageNumber: 13, title: 'Please refer to the appendix for additional experiments and ablation studies.' },
]

const SAMPLE_ZH = [
  { confidence: 0.9, id: 'z-1', level: 1, pageNumber: 1, title: '摘要' },
  { confidence: 0.4, id: 'z-2', level: 1, pageNumber: 1, title: '本文提出了一种新的方法，用于解决深度学习模型中的分布偏移问题。' },
  { confidence: 0.85, id: 'z-3', level: 1, pageNumber: 2, title: '第一章  绪论' },
  { confidence: 0.7, id: 'z-4', level: 2, pageNumber: 3, title: '1.1 研究背景' },
  { confidence: 0.7, id: 'z-5', level: 2, pageNumber: 4, title: '1.2 研究意义' },
  { confidence: 0.6, id: 'z-6', level: 1, pageNumber: 6, title: '第二章  相关工作' },
  { confidence: 0.55, id: 'z-7', level: 1, pageNumber: 9, title: '第三章  方法' },
  { confidence: 0.5, id: 'z-8', level: 2, pageNumber: 10, title: '3.1 问题定义' },
  { confidence: 0.3, id: 'z-9', level: 1, pageNumber: 10, title: '图 3-1  本文方法整体框架图' },
  { confidence: 0.3, id: 'z-10', level: 1, pageNumber: 14, title: '详见附录 A 中的补充实验。' },
  { confidence: 0.6, id: 'z-11', level: 2, pageNumber: 6, title: '（一）  传统方法' },
  { confidence: 0.6, id: 'z-12', level: 2, pageNumber: 7, title: '（二）  深度学习方法' },
  { confidence: 0.55, id: 'z-13', level: 1, pageNumber: 12, title: '第四章  实验' },
  { confidence: 0.5, id: 'z-14', level: 2, pageNumber: 13, title: '4.1 数据集' },
  { confidence: 0.5, id: 'z-15', level: 2, pageNumber: 14, title: '4.2 评价指标' },
  { confidence: 0.3, id: 'z-16', level: 1, pageNumber: 15, title: '表 4-1  不同方法在 ImageNet 上的准确率对比' },
  { confidence: 0.55, id: 'z-17', level: 1, pageNumber: 18, title: '第五章  结论与展望' },
]

const SAMPLE_LARGE = [
  ...SAMPLE_EN,
  ...SAMPLE_ZH,
  ...Array.from({ length: 30 }, (_, i) => ({
    confidence: 0.4,
    id: `noise-${i + 1}`,
    level: 1,
    pageNumber: 20 + i,
    title: `${i + 1}.${i + 1}  Random heading from page ${20 + i} of the document, sometimes with extra words.`,
  })),
  ...Array.from({ length: 15 }, (_, i) => ({
    confidence: 0.3,
    id: `body-${i + 1}`,
    level: 1,
    pageNumber: 30 + i,
    title: `In this section we discuss the design choices for the proposed architecture, including the choice of activation function, the use of residual connections, and the impact of data augmentation strategies on overall model performance.`,
  })),
]


async function runOne(label: string, candidates: typeof SAMPLE_EN) {
  console.log(`\n=== ${label} (${candidates.length} candidates) ===`)
  try {
    const result = await refineOutlineWithLLM({ candidates })
    console.log('OK, model =', result.model)
    if (result.reasoning) {
      console.log('reasoning =', result.reasoning)
    }
    console.log('outline.length =', result.outline.length)
    for (const node of result.outline) {
      console.log(`  L${node.level}  p${node.pageNumber}  ${node.title}`)
    }
    return true
  } catch (error) {
    console.error('FAIL:', error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'))
    }
    return false
  }
}

async function main() {
  console.log('--- refineOutlineWithLLM ---')
  console.log('env.MINIMAX_BASE_URL =', process.env.MINIMAX_BASE_URL)
  console.log('env.MINIMAX_MODEL    =', process.env.MINIMAX_MODEL)
  console.log('key loaded?          =', Boolean(process.env.MINIMAX_API_KEY))
  console.log()

  const results = [
    await runOne('EN small', SAMPLE_EN),
    await runOne('ZH small', SAMPLE_ZH),
    await runOne('Mixed large', SAMPLE_LARGE),
  ]

  const passed = results.filter(Boolean).length
  console.log(`\n=== ${passed}/${results.length} passed ===`)
  if (passed !== results.length) {
    process.exitCode = 1
  }
}

await main()

