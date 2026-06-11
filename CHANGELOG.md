# Changelog

## 0.7.0 - 2026-06-08

### Features

- Added desktop language switching, bilingual website documentation, and localized assistant role presentation so the app UI, documentation, and assistant descriptions stay consistent for Chinese and English usage. (#324, #326, #327)
- Added persistent reader chat, body search, a unified floating toolbar, a redesigned article header, empty note states, and adaptive annotation layouts to improve daily reading workflows for long articles, EPUBs, and PDFs. (#314, #315, #321, #322, #329, #330)
- Continued deepening the annotation and discussion flow with inline selection-input actions, reply routing to the root assistant, and more actionable review suggestions in the insight flow. (#251, #316, #323)
- Reworked the settings page and library information architecture with customizable library content sources, source-aware popovers, directional transition animations, assistant usage statistics, and a dusk indigo theme. (#260, #261, #262, #263, #264, #274)
- Added a desktop release-notes dialog, local annotation writes, redesigned PDF/web article media covers, ebook import cover feedback, and localized release-note resources. (#258, #273, #275, #294)
- Gradually migrated AI, WeRead, article import, model pricing, inline images, and annotation memory flows to Effect orchestration for clearer runtime error boundaries and recovery paths. (#265, #266, #267, #268, #269, #270, #271)

### Performance

- Reused EPUB indexes, reading memory views, and precomputed annotation-match context to reduce repeated scans during long-book reading, assistant generation, and memory queries. (#281, #303, #305)
- Pushed assistant summary aggregation down to SQL and optimized reading memory queries plus batch operations in the article repository, reducing local database hot-path cost. (#279, #280, #298)
- Deepened the article-source import lifecycle and source reader controller to reduce state coupling during import, open, and cross-source reading flows. (#296, #301)

### Fixes

- Fixed settings page surfaces, settings menu layout, title bar text constraints, reader title bar, annotation cards, and general UI polish issues. (#311, #312, #320, #325, #328, #329)
- Fixed reading library list cards, web cover toolbar, flat cover progress bar, PDF cover ratio, and horizontal scrolling in the website product carousel. (#254, #256, #292, #318, #319)
- Fixed discussion avatar spacing, the add-thought input, empty-reply opening position, and thought auto-scroll range. (#252, #253, #272, #313)
- Fixed SQLite native root isolation, article summary count range, provider keyring regression risk, data restore failure paths, and article import worker failure coverage. (#276, #277, #293, #299, #307, #308)

### Engineering

- Split desktop main, renderer, source reader, settings, PDFium, reader shell, and global CSS boundaries to reduce single-file complexity and clarify domain boundaries. (#282, #284, #285, #286, #287, #288, #289, #296, #317)
- Split shared/core/AI domain modules, assistant runtime kernel, provider assembly, and reading memory view assembly, while adding exports and runtime tests. (#290, #291, #297, #302, #303)
- Added native root verification, a PR template, output directory ignore rules, and updated pnpm and dependency versions. (#300, #306)
- Added tests for data management, store-db restore, provider secrets, article import worker, reader chat, and reader shell state to cover more local data and reading paths. (#276, #277, #307, #308, #322)

## 0.6.0 - 2026-06-01

### Features

- Added the reading memory foundation, writing paragraphs, selections, threads, and annotation memory from the reading process into local storage, then prioritizing existing reasoning chains in later assistant generation. (#166, #167, #168, #169, #170, #171, #172, #173, #174, #175, #176, #177, #178, #179)
- Upgraded the AI assistant runtime into a traceable tool-call flow with selection actions, thread replies, co-reading tool loops, invocation diagnostics, and a deep runtime migration to AI SDK. (#182, #183, #184, #185, #186, #187, #201, #202, #242)
- Upgraded annotation discussions into a standalone discussion window and insight flow, supporting assistant participation, insight drafts, review-assistant feedback, published insight cards, and insight statistics. (#225, #226, #227, #228, #229, #230, #231, #232, #235, #236, #237, #238, #241, #243, #248)
- Added the desktop theme contract, theme selector, and reader paper background controls to unify reading visuals across web articles, EPUBs, and PDFs while preserving original PDF page colors on dark paper. (#204, #205, #210, #211, #233, #234, #239)
- Improved reading library and import workflows with web article covers and progress, batch file import, polished import dialogs, card statistic tips, and cleaned PDF/EPUB display metadata. (#209, #216, #218, #219, #220, #221, #222, #223, #224)

### Performance

- Cached lexical related passages to reduce repeated related-passage retrieval during long-article and long-book co-reading. (#215)
- Optimized article import to avoid blocking UI responsiveness during imports. (#246)
- Skipped duplicate annotation memory backfills to avoid rerunning the same historical data migration after startup. (#212)

### Fixes

- Fixed PDF annotation anchors, list text overflow, PDF dark paper colors, EPUB arrow-key paging, and reader header dragging regressions. (#191, #199, #200, #239, #244)
- Fixed duplicate thoughts, thread memory sources, and tool-call stability issues in reading memory and the assistant runtime. (#180, #181, #188)
- Fixed reading library page-size persistence, WeRead detail covers, ebook chapter note counts, ebook header cover hover, and implicit annotation metadata inference. (#196, #206, #208, #214, #247)
- Polished annotation cards, assistant avatars, annotation actions, keyboard shortcut tooltips, cover hover, the About page, theme paper, and general UI interactions. (#190, #192, #193, #194, #195, #203, #245)

### Engineering

- Enabled type-aware linting and updated dependencies, extracted selection context utilities, migrated the deep runtime to AI SDK, and reduced duplicated runtime-boundary logic. (#189, #213, #242)
- Removed the old focus co-reading flow and trimmed native module files from desktop build artifacts to reduce release package redundancy. (#197, #249)
- Updated user documentation, website download sections, and third-party license notices so website version entry points match the desktop app's built-in open-source license information. (#217, #240, #249)

## 0.5.0 - 2026-05-26

### Features

- Added desktop PDF import and reading, including local PDF library import, outline support, selection, unified annotation visuals, assistant dock, and PDF-focused co-reading. (#122, #123, #124, #125, #130, #131, #133, #134)
- Added WeRead note sync, reading statistics, and API key setup guidance so WeRead insights can be brought into Yomitomo's local reading library. (#139, #140, #159)
- Completed more reading basics with keyboard paging, bundled reading fonts, and autosave status feedback for settings, making daily EPUB, PDF, and settings workflows more stable and visible. (#141, #145, #153)
- Changed the desktop article update flow to typed IPC and partial article patches, reducing disruption to reading state, settings drafts, and multi-window sync from full store replacement. (#117, #118, #119, #120, #121)

### Performance

- Optimized desktop startup, statistics page loading, secondary module preloading, and reduced full-store reads during imports. (#112, #113, #137, #142)
- Added indexes for EPUB context and indexed range queries to reduce repeated scan cost for long-book chapter location, context retrieval, and annotation generation. (#143, #161)
- Reduced reader annotation scans and layout work during scrolling, and added PDF open performance tracing to help locate large-document loading bottlenecks. (#115, #138, #144)

### Fixes

- Fixed PDF selection, outline behavior, annotation flow, and PDF thought expansion alignment. (#130, #136, #162)
- Fixed reader body font-size inheritance, external link opening, animation layout cost, medium-width annotation layout, and assistant menu clipping. (#110, #114, #116, #146, #160)
- Fixed the desktop profile dialog closing after save and a file import dialog regression risk, with related test coverage added. (#109, #155)

### Engineering

- Split desktop article summary records, store persistence, article settings, main IPC registration, file import dialogs, PDFium reader utilities, and source reader session boundaries to reduce coupling between the main process and reader. (#135, #147, #148, #149, #150, #151, #154, #156)
- Split shared type exports and reader-ui module boundaries, and centralized agent annotation actions to reduce cross-package import surface and duplicated action logic. (#152, #157, #158)
- Cleaned PDF.js dependencies and function-scope warnings, and added docs for reader interaction flow, agent theater data flow, and desktop store patch rules. (#127, #128, #129, #132)
- Added dev resource isolation, release proxy worker, website docs/changelog pages, and an animated logo experiment to improve release and website infrastructure. (#107, #108, #111, #126)

## 0.4.0 - 2026-05-21

### Features

- Added the desktop app update flow and connected the About page, onboarding page, and website download entry points to GitHub Release artifacts. (#51, #100, #101)
- Added the `apps/web` product website with the Yomitomo landing page, macOS / Windows download links, SEO metadata, sitemap, robots, and social preview images. (#94, #100, #101)
- Added data management to Settings, including opening the data directory, logs, and database file, backing up/restoring SQLite data, and showing clear prompts for incompatible database versions. (#93, #95, #96)
- Changed provider settings to store API keys securely, support explicitly viewing saved keys, fetch model lists, configure task routing, and simplify the model settings form. (#52, #97, #98, #99)
- Upgraded reader thoughts and discussions with selection `@assistant` routing, review-assistant comments, annotation discussion cards, floating outlines, dual note sidebars, and pending assistant states. (#78, #85, #90, #91, #102, #104)

### Changes

- Removed the post-reading output flow so the product focus converges on source anchors, thought threads, comment discussions, and assistant co-reading. (#76)
- Split the reading library into web article and EPUB ebook entry points, optimizing the home layout, return source, library cards, and EPUB import record size. (#54, #86, #87, #88)
- Further polished reader layout and interactions, including source reader layout, annotation connector lines, thought counts, co-reading controls, avatar hover, and thought input interactions. (#77, #83, #84, #89, #103, #105)

### Performance

- Reused DOM text indexes for EPUB reading to reduce repeated computation during paging, page updates, and annotation rendering. (#74, #79, #80)
- Optimized annotation hot paths, runtime import hotspots, and reading library article payload loading to reduce startup and interaction cost for large books and large libraries. (#81, #82, #92)

### Fixes

- Fixed EPUB annotation rendering, paging speed, page position restoration, page updates, and stacked annotation connector-line stability. (#72, #73, #74, #75, #79)
- Fixed provider name retention after API key deletion, dev database migration history retention, database compatibility error display, and target annotation ownership preservation. (#71, #93, #95, #103)
- Fixed lost source state after returning to the reading library, invisible pending assistant states, thought-input interaction details, and co-reading control states. (#84, #88, #104, #105)

### Engineering

- Split main app state, source bookcase, settings panels, reader components, annotation comment input, assistant annotation queue, agent runtime, provider settings, and EPUB runtime boundaries to reduce core UI and runtime complexity. (#53, #55, #56, #58, #60, #61, #63, #65, #66, #68, #69, #70)
- Extracted reading card workflow state, source agent request pipeline, and code health hotspot boundaries, and added a runtime performance hotspot audit document. (#57, #62, #64, #67, #82)

## 0.3.0 - 2026-05-15

### Features

- Added local EPUB import and reading to the desktop app, including import dialogs, cover and chapter metadata persistence, and opening ebooks through the Foliate reader. (#26, #27, #47)
- Added structured book indexes, paragraph-aware text anchors, and segment-level annotation tasks to the EPUB reading flow so annotations, highlights, and AI targets bind reliably to chapters, paragraphs, and segment ranges. (#28, #29, #34, #36)
- Added spoiler range control, reading context packaging, selection context, thread-first reply context, descriptor routing, and EPUB reading memory to AI co-reading to reduce context drift in long books. (#30, #31, #32, #33, #35, #37)
- Added same-chapter lexical related passages, an evaluation matrix, and long-segment splitting to EPUB co-reading to improve chapter routing, evidence recall, and long-paragraph co-reading stability. (#39, #40, #41)
- Added the assistant reading dock, scroll-edge blur, annotation navigation shortcuts, long-annotation collapse, and assistant dock animation to the reader. (#20, #21, #42, #43, #44)
- Added customizable selection copy and add-annotation shortcuts in settings, reused by both the web reader and EPUB reader. (#25)

### Performance

- Added EPUB performance metrics for import, indexing, annotation generation, and key reader steps. (#45)
- Reduced EPUB highlight recomputation to lower repeated compute cost during paging, scrolling, and annotation changes. (#46)

### Fixes

- Fixed embedded reader height, unstable focus in close-reading assistant controls, and excessive automatic annotations in short-article scenarios. (#22, #23, #24)
- Fixed reading library groups going out of sync after sort order changes. (#48)
- Corrected desktop third-party license notices and the production dependency list. (#49)

### Engineering

- Added the Turbo `typecheck` task to orchestrate TypeScript type checks across workspace packages. (#38)

## 0.2.0 - 2026-05-11

### Features

- Added URL-based web article import to the desktop reading library, with persisted body images during import and basic reader body typography. (#1)
- Added selection copy shortcuts, annotation action/type icons, and right-side annotation filters to the reader, making highlights, annotations, and evidence easier to scan. (#6, #8, #9)
- Made message send shortcuts configurable in settings and kept the behavior consistent across reader send, cancel, and prompt text. (#5, #11)
- Added asynchronous annotation type and reading intent inference for user annotations, and allowed `@assistant` messages to be split into multi-assistant task plans. (#13)
- Added the focused co-reading flow with chapter cards, manual assistant assignment, chapter messages, and article-analysis-based routing generation. (#14)

### Fixes

- Fixed persisted user annotation intent and shortcuts, restored shortcut hints, single-click annotation card expansion, and SubmitShortcutKeys component layout. (#7)
- Fixed provider editor select menus being covered by the dialog overlay in compact layouts. (#10)
- Fixed assistant reading chapters omitting the beginning of the body and shallow footer headings distorting chapter planning. (#12)
- Fixed overlong automatic annotation labels and user annotation comment restoration after merging focused co-reading. (#13, #14)
- Fixed lint/format tasks running as single root-level tasks instead of workspace-package-level orchestration. (#3)

### Documentation

- Updated development agent documentation for lint/format workflows, and cleaned Chrome extension references, privacy text, third-party notices, and distribution materials. (#2, #3)

### Miscellaneous

- Removed the Chrome extension workspace, runtime, desktop pairing bridge, and store assets so the product line converges on the desktop app. (#2)
- Added GitHub Actions CI to run lint, format check, tests, and build on PRs and pushes to main, with the check timezone pinned. (#4)

## 0.1.0 - 2026-05-10

Yomitomo's first release provided a local-first AI reading companion experience. The desktop app imported articles, saved reading data, managed LLM providers and reading assistants, and provided reading, annotation, and statistics workflows.

### Core Features

- Article reader: import articles and use reading view, outline, font size, content width, and the annotation sidebar.
- Highlights and annotations: select text to create highlights, add annotation types, continue comments, and maintain discussion threads.
- AI reading assistants: configure reading assistants so they can generate annotations or replies around the source text, selections, and discussions.
- Proactive close reading: select one or more assistants to orchestrate close reading and annotations for article chapters.
- Reading library: save article body text, original-source links, annotations, comments, and reading state.
- Reading statistics: produce local reading trends by article, annotation, and discussion insight.
- Local-first: reading data, provider configuration, and assistant configuration stay on the user's machine.

### Desktop App

- Built on Electron with reading library, settings, assistants, providers, statistics, and log views.
- Uses SQLite to store articles, annotations, comments, providers, and assistants.
- Supports OpenAI-compatible, OpenAI Responses, Anthropic, Gemini, and other LLM providers.
- Supports creating and managing reading assistants and review assistants, each connected to a specific provider and model.
- Supports reviewing and managing reading materials centrally in the desktop app.
- Supports review assistants for checking factual attribution, evidence chains, and coverage.
