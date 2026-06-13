<claude-mem-context>
# Memory Context

# [pdf-outline-builder] recent context, 2026-06-14 12:08am GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (28,846t read) | 0t work

### Jun 6, 2026
1019 2:44p 🔴 Polymorphic factory lost zod type narrowing; inlined the dispatch in callStructured
1020 2:46p ✅ Added topP: 0.9 sampling to both LLM clients
1021 " ✅ topP: 0.9 confirmed typechecks clean across the monorepo
S889 Harden /api/outline/refine response handling against malformed LLM structured output, then await user validation (Jun 6, 2:48 PM)
1022 2:49p ✅ Defensive post-LLM parsing: handle null/empty outline and per-field type coercion
1023 " ⚖️ Primary session shifts to autonomous end-to-end testing loop for /api/outline/refine
S890 Primary session built a standalone test harness (apps/api/src/test-refine.ts) to drive the autonomous refineOutline test-and-fix loop (Jun 6, 2:49 PM)
1024 2:54p ⚖️ User reiterates autonomous test-and-fix loop directive for /api/outline/refine
1025 " 🔵 End-to-end test of refineOutlineWithLLM passes on first run with MiniMax-M3
S891 Primary session converged the autonomous test-and-fix loop: 3/3 refineOutline scenarios pass on MiniMax-M3, hardened with two-stage fallback, and test harness excluded from production builds (Jun 6, 2:54 PM)
1026 5:46p 🟣 Test harness expanded with Chinese-language candidates and large stress-test fixtures
1028 " ✅ Replay: test-refine.ts Edit applied a second time (byte-identical to prior runOne refactor)
1027 5:47p 🔄 Test runner refactored into parameterized multi-fixture harness with pass/fail tally
1029 5:48p 🔵 Multi-scenario refineOutlineWithLLM test passes 3/3 on first run — integration is production-ready
1030 5:49p 🟣 Two-stage structured→text fallback added to refineOutline callStructured
1031 5:50p 🔵 Regression test passes 3/3 with two-stage fallback in place — structured path still primary
1032 " 🔵 Full monorepo build passes after two-stage fallback refactor
1033 " 🔴 Test harness excluded from production TypeScript build via tsconfig.json exclude
1035 " ✅ Replay: Read of apps/api/tsconfig.json shows pre-edit state (no exclude)
1036 " 🔴 Live web-UI test surfaces the Stage 2 parseJsonObject null path — test harness missed real-world failure mode
1034 5:51p 🔴 Verified: test-refine.ts no longer appears in apps/api/dist after tsconfig exclude fix
S892 User hit the Stage 2 "model did not return a JSON object" error in live web-UI test; asked to fix it and add LLM input+output console logging for observability (Jun 6, 5:53 PM)
S895 Continue autonomous test-and-fix loop on "AI refinement failed: the model did not return a JSON object". After the first live re-test revealed a deeper bug than the 4-tier extractJsonCandidate addressed (Stage 2 response is a LangChain AIMessage envelope, real outline lives at .kwargs.content), the primary session is layering on a deeper diagnostic inspector before shipping the actual 5th-tier fix. (Jun 6, 5:57 PM)
1037 5:57p 🔴 Major rewrite of refineOutline.ts: two distinct prompts, 4-tier JSON extraction, request-correlated LLM input+output logging
1038 " 🔵 Test harness apps/api/src/test-refine.ts cannot be run from project root via pnpm exec tsx
1039 5:59p 🔵 Live production failure: Stage 2 response is a serialized LangChain AIMessage, not raw text
1040 " ✅ Re-run of test-refine.ts harness from apps/api/ for EN small head inspection
S894 Fix live "AI refinement failed: the model did not return a JSON object" production error and add LLM input+output observability to the api project (refineOutlineWithLLM). Continuing the autonomous test-and-fix loop after first live re-test exposed a deeper bug than the 4-tier extractJsonCandidate addressed. (Jun 6, 5:59 PM)
S893 Fix live production error "AI refinement failed: the model did not return a JSON object" and add LLM input+output observability to the api project (refineOutlineWithLLM endpoint). Originally framed as autonomous test-and-fix loop ("你自己构造一个请求，一直测试 + 调整 ，直到该接口没有问题"). (Jun 6, 5:59 PM)
S896 Continue autonomous test-and-fix loop on "AI refinement failed: the model did not return a JSON object". The 4-tier extractJsonCandidate was insufficient for live production (Stage 2 response is a serialized LangChain AIMessage whose real outline lives at kwargs.content). Ship the 5th+ tier that handles the AIMessage envelope shape and add a last-resort deep walk as belt-and-suspenders. (Jun 6, 6:16 PM)
S897 Fix the live "AI refinement failed: the model did not return a JSON object" production error and add LLM input+output observability to the api project (refineOutlineWithLLM). The root cause turned out to be a parse-path bug, not a model-quality issue: MiniMax-M3 was returning a perfectly correct outline, but LangChain's JSON.stringify was serializing the AIMessage into the {lc, type, id, kwargs:{content: "<escaped JSON>"}} envelope and extractJsonCandidate only scanned record.content directly. (Jun 6, 6:19 PM)
1041 6:19p ✅ New apps/api/src/test-extract.ts unit test + apps/api/src/services/_testableRefine.ts test-bridge duplicating extractor logic
1043 " ✅ Redundant pnpm typecheck pass after test-extract.ts + _testableRefine.ts added
1044 " 🔵 End-to-end smoke test 3/3 passed post-upgrade; Chinese fixture correctly preserves 第三章/第四章/第五章 academic headings
1042 6:21p 🔴 JSON extractor unit tests pass 10/10, including the LC-serialised AIMessage production-failure case
1045 6:22p 🔴 apps/api/tsconfig.json exclude rule extended to keep _testableRefine.ts out of production dist/
1046 6:24p 🔵 Confirmed: _testableRefine.ts no longer leaks into dist/ after the tsconfig exclude fix
1047 " ✅ Repeat clean-rebuild verification of tsconfig exclude rule
1048 6:33p 🔵 LLM refineOutline fails: structured output path null-length crash, JSON-text fallback not parsed
1049 6:34p 🟣 User requests: load AI-refined outline into Outline tree editor
1050 6:45p 🔴 refineOutline: unwrap nested-JSON content, balance braces correctly, cap LLM output
1051 " 🔵 Frontend "AI 精炼 → outline tree editor" wiring already exists in PdfOutlinePreviewPage.tsx
1052 6:51p ✅ User requested optimization of recent changes without breaking functionality
1053 " ✅ User requested AI-parse loading state that blocks other UI actions
1054 " 🟣 AI-refine loading overlay blocks the page during LLM refinement
1055 " ✅ User requested AI-result notification and AI Version badge on the outline tree editor
1056 7:07p 🟣 AI refinement toast notification plus AI Version badge on Outline tree editor
### Jun 13, 2026
1220 11:00p 🟣 Requested: Add bilingual (Chinese/English) translation to PDF Outline Builder website with English as default
1222 " 🔵 Discovered project structure for PDF Outline Builder monorepo before i18n implementation
1223 11:01p 🔵 Cataloged hardcoded user-facing strings across all 5 web app pages and shared layout for i18n translation
1224 " 🟣 Created i18n types module defining Locale, default 'en', storage key, and display labels
1225 11:02p 🟣 Created comprehensive English translation dictionary with nested type-safe structure
1226 " 🟣 Created Chinese (zh) translation dictionary mirroring English schema
1227 11:03p 🟣 Implemented complete custom i18n infrastructure: typed Dictionary, Context provider with browser detection, hooks, and barrel exports
1228 " 🟣 Wired I18nProvider into app root, added LanguageToggle UI to PreviewLayout, and translated HomePage
1229 11:04p 🟣 Translated DocsPage, NotFoundPage, and JobStatusPage with i18n hooks; cleaned up unused useI18n import
1230 11:05p 🔄 Added newSection translation key to all three i18n files (en, zh, types) to support new outline node titles
S933 给 PDF Outline Builder 网站加上中英文翻译,默认英文 (Add Chinese and English translation to the PDF Outline Builder website, with English as default) (Jun 13, 11:06 PM)
1231 11:07p ✅ User requested X and Xiaohongshu promotion strategy advice
1232 11:49p 🟣 Request to add website icon next to PDF Outline Builder label
</claude-mem-context>