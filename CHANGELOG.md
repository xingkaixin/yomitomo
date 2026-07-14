# Changelog

## 0.12.0 - 2026-07-14

### Features

- Added an assistant execution-mode slider in model routing, letting you choose between fast responses and deeper tool-backed verification for reader annotations, follow-up questions, and co-reading tasks. (#618)
- Rebuilt collection-picker drag and drop with keyboard handles, localized announcements, and a button fallback, while keeping collection organization behavior consistent across input methods. (#616)
- Made the Library grid respond to its available content width, so cards and loading skeletons use the same layout from compact to wide windows. (#634)
- Refreshed the website with scroll-driven reveals, a localized mobile product preview, a clearer evidence-chain layout, and richer structured data for product and scenario pages. (#619, #632, #637, #638)

### Performance

- Simplified website reveal animations to reduce duplicated observers and animation work while preserving progressive enhancement. (#622)

### Fixes

- Hardened web-article imports against DNS rebinding and reserved-address bypasses by binding requests and rendered imports to validated IP addresses. (#623)
- Removed API key fragments from AI runtime logs; logs now record only the provider identity and whether credentials are configured. (#624)
- Made database restore atomic by validating a temporary copy before replacement, retaining a rollback snapshot, and reopening the previous database if switching fails. (#625)
- Kept reading statistics accurate when annotation details are not loaded by storing thought and discussion totals separately on article summaries. (#626)
- Made keyboard chat shortcuts open and close immediately, while pointer interactions retain interruptible panel motion. (#630)
- Improved reduced-motion behavior, muted-text contrast, keyboard skip navigation, and image layout stability on the website. (#631, #636, #640)

### Engineering

- Upgraded command-line typechecking to native TypeScript 7 while keeping the Astro website on TypeScript 6 until its compiler API supports TypeScript 7. (#615)
- Updated pnpm and workspace dependencies, fixed desktop resource-path resolution for Vite shared chunks, and added desktop E2E to the documented local CI gate. (#617, #627)
- Narrowed desktop IPC registrar dependencies, refreshed annotation data-flow documentation, clarified shell/library style ownership, simplified Library transitions, compacted the app header, and unified default theme surfaces around warm paper neutrals and a shared cinnabar accent. (#628, #629, #633, #635, #639, #641)

## 0.11.0 - 2026-07-05

### Features

- Added fan-stacked annotation cards with shuffle behavior, making dense annotation rails easier to scan while keeping overlapping notes reachable. (#590)

### Fixes

- Disabled telemetry heartbeats during automation so local and CI E2E runs do not send desktop heartbeat events. (#591)

### Engineering

- Added desktop UI harnesses, isolated E2E test data, and expanded E2E coverage for library import, reader navigation, annotations, progress, settings, AI, EPUB/PDF import, and responsive layouts. (#592–#605)
- Split the desktop renderer App shell, web source helpers, PDFium document logic, reader search navigation, and selection adjustment rules into shared, test-covered boundaries. (#606, #607, #610, #611, #612)
- Split reader conversation CSS, removed legacy style overrides, documented desktop style ownership, and decomposed article repository domains. (#608, #609, #613)

## 0.10.0 - 2026-06-28

### Features

- Added a Text content type to the Library. You can paste text directly or upload `.txt` / `.md` files (multiple at once). Import detects the encoding, infers a title and author for you to confirm, and renders Markdown YAML front matter as a metadata block at the top of the content. Text gets its own manuscript cover and can be filtered by type and added to collections. (#588)
- Added privacy boundary notices to import and model routing. The import dialog states that files stay on this device and are not uploaded, while model routing settings state that, once configured and used, the relevant content is sent to the endpoint you set. (#587)
- Added draggable endpoint handles to selections, so text selected in web articles, ebooks, and PDFs can be extended or shrunk from either end. (#584, #585, #586)
- Added ebook click-to-page hot zones, with smoother table-of-contents hover and jump navigation. (#565, #558, #559)
- Added an adaptive ebook spread layout, and the default PDF zoom now adapts to window width while reserving space for the annotation rail. (#556, #555)
- Added a localized production application menu on desktop whose items follow the system language. (#563)

### Performance

- Reduced reader rendering hotspots for smoother scrolling and interaction. (#564)
- Reduced repeated ebook pagination measurement work. (#557)

### Fixes

- Disabled double-click selection in article and PDF content, so page-turn taps no longer trigger word or paragraph selection. (#582, #583)
- Fixed wider covers being squeezed after a refresh; the cover ratio is now restored correctly from cached images. (#581)
- Hardened desktop security boundaries and locked the renderer store while the app is locked. (#567, #562)
- Routed dark reader colors through theme tokens, preserved the WeRead synckey with zero thoughts, and aligned update-dialog progress and triggers. (#561, #560, #554)

### Engineering

- Split the desktop store modules, refactored several sedimentation-window and reader components by responsibility, added tests for critical reader paths, and updated workspace dependencies. (#580, #569–#579, #568, #566)

## 0.9.2 - 2026-06-26

### Fixes

- Preserved production-minified search clear animation durations in the Library, so `1s` / `.4s` CSS values are interpreted as seconds instead of milliseconds and the clear dissolve no longer ends too early. (#552)

## 0.9.1 - 2026-06-25

### Features

- Reworked search and Ask affordances to use in-place morph and dissolve transitions: the reading-library search (main list and collections) and reader search gained dedicated clear actions, and the reader chat panel now shares a bottom-right morph with the Ask button, all reduced-motion-safe. (#541, #542, #544)

### Fixes

- Sped up restoring the last-read PDF page and let progress-slider jumps cancel a stale saved-page restore. (#549, #550)
- Broadcast article saves from sedimentation windows to the main window so Library summaries no longer go stale after distillation edits. (#548)
- Stabilized annotation-rail scrolling, kept web-translation drag selection visible, aligned the discussion mention-chip caret, and honored reduced motion in the source reader. (#547, #546, #538, #537)
- Kept the dock icon source consistent and soft-deleted reading memory (FTS rows and projections) for annotations and comments removed during a full article save. (#536, #535)
- Hardened telemetry heartbeat ingestion by rejecting non-JSON and oversized requests and constraining `clientDay` before writing Analytics Engine rows. (#545)

### Engineering

- Exposed app theme tone, split desktop style files, and switched annotation persistence to explicit save operations to reduce coupling. (#543, #539, #534)

## 0.9.0 - 2026-06-24

### Features

- Reworked the Library into one mixed reading list for web articles, ebooks, PDFs, WeRead items, and collections, with pinned items, session-aware type filters, richer empty states, multi-source add actions, collection cover previews, and import-completion motion. (#492, #493, #494, #495, #496, #499, #500, #515)
- Deepened distillation review and draft organization with single-pass structured streaming, organized discussion drafts, proposal validation, inline proposal previews, draft anchor highlighting, assistant mention chips, refined reader chat controls, and redesigned annotation/distillation cards. (#482, #485, #486, #488, #489, #491, #501, #520)
- Added automatic WeRead sync, clearer WeRead sync copy, provider model routing setup, automatic update checks with a persistent update entry, and an opt-out anonymous desktop heartbeat for active version/system distribution. (#506, #507, #483, #516, #510)
- Refreshed product presentation with the new brand mark, updated reader screenshots/help docs, the mobile docs TOC bottom sheet, and stronger keyboard/modal lifecycle behavior in the website masthead and reader demo. (#497, #519, #521, #490, #529, #530)

### Performance

- Reused lexical document frequencies in related-passage scoring to reduce repeated corpus scans. (#504)
- Reduced SQLite growth by deduplicating ebook content, avoiding repeated inline avatar storage, and adding database cleanup. (#512)
- Added Chromium cache maintenance and a 90-day log-retention default to keep long-running local data smaller. (#514, #511)

### Fixes

- Restored stable web-article translation selection and consumed reader focus navigation only once. (#481, #502)
- Kept failed assistant requests and WeRead settings reset timers from lingering in active or saving states. (#484, #517)
- Restored PDF highlight clicks linking back to annotation/distillation surfaces and cleaned long ebook titles while hiding pending page totals. (#513, #509, #508)
- Stabilized reader tooltip delay sharing, App Lock reduced-motion shimmer behavior, import-completion motion, and website reader-demo visual details. (#522, #526, #528, #498)

### Engineering

- Split reading-library home boundaries and source-reader web translation/debug boundaries to reduce cross-feature coupling. (#503, #505)
- Established shared popup and motion contracts across Base UI popups, page transitions, segmented controls, copy-icon swaps, inline composers, and reader-demo modals. (#523, #525, #527, #524, #531, #530)
- Tightened dev app lifecycle handling when the parent process exits, refreshed post-0.8.0 docs, and stabilized distillation sound assertions. (#487, #519, #518)

## 0.8.0 - 2026-06-20

### Features

- Added AZW3 and MOBI ebook import and reading alongside EPUB, including Kindle metadata, cover, chapter extraction, original source preservation, Foliate MOBI support, and text-based annotation location for Kindle content. (#473, #474)
- Improved Data Management settings with clearer local data, log, and database entries, log retention and clearing controls, and safer database backup and restore flows. (#458)
- Added a website FAQ section backed by shared bilingual data and FAQPage JSON-LD, and expanded structured data with Organization publisher information and screenshot URLs. (#479)

### Performance

- Made ebook pagination incremental, deferred PDF text indexing, avoided extra PDF source-buffer copies, and paginated the local article catalog for larger libraries. (#449, #447, #448, #469)
- Bounded reading-memory substring fallback and lazy-loaded assistant diagnostics trace details to keep long histories and trace views responsive. (#471, #472)
- Reduced packaged app size by tightening desktop build resources, using WOFF2 reading fonts, and compressing bundled assistant persona imagery. (#476)

### Fixes

- Hardened import and lock boundaries by blocking local/private-network article imports by default, limiting article HTML responses to 5MB, limiting oversized EPUB decompressed entries, preserving backup targets, and enforcing App Lock on guarded IPC. (#445, #442, #443, #444, #441)
- Kept reader state more stable across width changes and search interactions, including annotation layout recalculation and more responsive in-reader search. (#466, #465)
- Fixed library source counts, PDF header author overflow, update-check toast feedback, import success dialog timing, and the unsupported AZW3/MOBI annotation selector. (#475, #459, #468, #457, #477)

### Engineering

- Split IPC contract/schema fragments, preload API fragments, persistence boundaries, source reader wiring, settings draft state, reader style bundles, and assistant reading tools to reduce desktop coupling. (#454, #455, #451, #452, #456, #450, #453)
- Switched annotation persistence to single-row writes and retired provider key fallback behavior after keyring-backed provider storage became the only supported path. (#446, #461)
- Added Electron launch smoke coverage to CI, app-updater tests, CI-aligned `mise run check`, release-guide download worker checks, UI primitive status docs, and Astro 6.4.6. (#467, #463, #462, #464, #460, #470)

## 0.7.2 - 2026-06-17

### Features

- Added an optional app lock in Settings, including PIN setup, lock-screen unlock, secure keyring-backed PIN storage, and lock feedback sound. (#438)
- Added paragraph-level translation feedback for web articles so translated paragraphs show clearer state when translation results are applied. (#437)
- Improved reader table-of-contents navigation with active-section highlighting, automatic focus for the active item, and smoother TOC toggle animation. (#432, #434, #435)
- Routed website downloads and app update checks/assets through the Cloudflare download worker, including update manifests, release assets, blockmaps, and Analytics Engine event capture. (#430)
- Refined website loading and visual presentation with the indigo ink palette and optimized landing-page resource loading. (#427, #429)

### Fixes

- Stabilized reader chat streaming so in-flight assistant messages keep their session state and render consistently during updates. (#439)
- Kept the copy label visible after copying a selection so feedback does not disappear immediately after the copy action. (#431)


## 0.7.1 - 2026-06-17

### Fixes

- Fixed packaged desktop assistant avatars rendering as cropped `file://` text instead of images in reader chat, annotation discussion inputs, add-thought flows, and distillation review discussions.

## 0.7.0 - 2026-06-16

### Features

- Added desktop language switching, split app locale resources, bilingual website documentation, and localized assistant persona presentations so UI, docs, and assistant copy stay aligned for Chinese and English usage. (#324, #326, #327, #356, #374)
- Added persistent reader chat, in-reader full-text search, a unified floating toolbar, a redesigned article header, polished empty-note states, adaptive annotation layouts, smooth stacked annotation card switching, and unified selection highlight/underline emphasis. (#314, #315, #321, #322, #329, #330, #394, #418)
- Added bilingual web-article translation with cascade cleanup of related translation annotations on delete or retranslate, and enforced assistant response language near final prompts. (#407, #406, #414)
- Continued deepening annotation and discussion flows with inline selection-input actions, root-assistant reply routing, distillation draft and review-proposal UX, distillation transition motion, an ink-writing ceremony for add-thought runs, and assistant writing animations. (#251, #316, #323, #336, #337, #411, #420)
- Reworked Settings and Library information architecture with customizable library content sources, source-aware dialogs, direction-aware transitions, assistant usage in stats, the dusk indigo theme, and remembered paper tone selections; redesigned assistant card grids and profile detail dialogs, and moved setting descriptions into info tooltips. (#260, #261, #262, #263, #264, #274, #332, #349, #409)
- Added release-notes dialogs, local annotation writes, redesigned PDF/web media covers, and ebook import cover feedback; extended hand-drawn ink visuals to the reader paper picker and theme dialog, and replaced the brand subtitle with phonetic pronunciation. (#258, #273, #275, #382, #383, #384)
- Added unified toast feedback (including WeRead sync), sound-effect controls with volume, and audible/visual feedback for highlights, copy, library import/delete, distillation commits, and assistant thought playback. (#385, #386, #387, #389, #390, #403, #404, #412, #415, #393)
- Migrated AI, WeRead, article import, model pricing, inline images, and annotation memory flows to Effect orchestration, with validated desktop IPC inputs and structured IPC errors. (#265, #266, #267, #268, #269, #270, #271, #375, #376)
- Expanded the website with a reader-style landing page, blog scenario articles, and assistant header stickers. (#338, #346, #421)

### Performance

- Reused EPUB indexes, reading-memory views, and precomputed annotation-match context; pushed assistant summary aggregation to SQL; and optimized reading-memory queries plus article-repository batch operations. (#281, #279, #280, #298, #303, #305)
- Memoized Markdown rendering in the renderer to reduce repeated layout work in discussion and annotation cards. (#372)
- Deepened the article-source import lifecycle and source-reader workspace split to reduce state coupling during import, open, and cross-source reading. (#296, #301, #352, #396)

### Fixes

- Fixed Settings and Reader polish across settings surfaces, menu layout, titlebar text constraints, reader titlebar, annotation cards, assistant cards, and dialog close hit areas. (#311, #312, #320, #325, #328, #332, #344)
- Fixed reading-library list cards, web cover toolbar overlays, flat-cover progress bars, PDF cover ratios, PDF TOC overlay styling, and reader viewport height stability. (#254, #256, #292, #318, #319, #334, #341)
- Fixed annotation-rail grouping by geometry, dense-rail proximity to highlights, distillation card anchoring to the rail, annotation navigation state, and annotation delete surfaces. (#388, #392, #413, #417, #335, #419)
- Fixed discussion avatar spacing, the add-thought composer, assistant reply-queue animation, preserved disabled-assistant reply rules, and thought deletion sync on cards. (#252, #253, #272, #313, #333, #405, #419)
- Fixed assistant contributions missing from stats summaries, SQLite native-root isolation and runtime dependency packaging, article summary count scope, repeated memory-backfill retries, data-restore failure paths, and article import worker failure coverage. (#276, #277, #293, #299, #307, #308, #368, #416, #425)
- Sanitized web-article HTML with DOMPurify and Markdown before HTML injection, and enabled the renderer sandbox. (#350, #366, #367)
- Fixed website landing-page responsive layout and product-carousel horizontal scrolling. (#256, #347)
- Limited pronunciation triggers to the phonetic label and unified reader toolbar tooltip copy. (#408, #410)

### Engineering

- Split desktop main, renderer, source reader, settings, PDFium, reader shell, global CSS, and domain-scoped store normalizers. (#282, #284, #285, #286, #287, #288, #289, #296, #317, #400)
- Split shared/core/AI domain modules, assistant runtime, reading-context provider, stream IPC, and explicit public exports, with added runtime and import tests. (#290, #291, #297, #302, #303, #369, #371, #397, #398, #399, #401, #402)
- Migrated UI primitives to Base UI and removed Radix; aligned typography, theme tokens, semantic z-index, and reduced-motion preferences. (#339, #340, #342, #343, #357, #358, #359, #360, #361, #362, #363, #364)
- Replaced hold-to-delete with confirm dialogs; centralized date formatting; added E2E smoke baseline, store-normalizer, and IPC/agent tests. (#351, #373, #378, #380)
- Added workspace typecheck to CI; macOS release pipelines now sign, notarize, and validate notarized apps; added native-root verification, a PR template, and output-directory ignore rules. (#300, #306, #355, #422, #423, #424)
- Updated pnpm and dependencies and refreshed desktop module-path documentation. (#365, #379)

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
