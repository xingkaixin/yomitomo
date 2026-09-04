# Third Party Notices

This file lists third-party production dependencies, vendored components, and bundled fonts used by Yomitomo Desktop.
It is generated from pnpm dependency metadata, vendor upstream metadata, and bundled font notices with:

```bash
pnpm licenses:generate
```

The project source code is licensed under MIT. Third-party packages, vendored components, and bundled fonts remain under their own licenses.

pnpm package licenses are limited to:

- `@yomitomo/desktop...`

Direct dependencies declared only by non-desktop apps are excluded from the generated desktop notice:

- `apps/download/package.json`
- `apps/web/package.json`

Vendored components are discovered from:

- `apps/desktop/src/renderer/src/vendor/*/UPSTREAM.md`

Bundled font notices are discovered from:

- `apps/desktop/resources/licenses/fonts/THIRD_PARTY_FONT_NOTICES.md`

## License Summary

| License | Packages |
| --- | ---: |
| (AFL-2.1 OR BSD-3-Clause) | 1 |
| (MIT AND Zlib) | 1 |
| (MIT OR CC0-1.0) | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| Apache-2.0 | 25 |
| BlueOak-1.0.0 | 2 |
| BSD-2-Clause | 9 |
| BSD-3-Clause | 15 |
| CC0-1.0 | 1 |
| ISC | 12 |
| LGPL-3.0-or-later | 1 |
| MIT | 158 |
| MIT-0 | 2 |
| OFL-1.1 | 11 |
| Python-2.0 | 1 |

## Packages

| Package | Versions | License | Homepage |
| --- | --- | --- | --- |
| @ai-sdk/anthropic | 4.0.49 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @ai-sdk/gateway | 4.0.73 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @ai-sdk/google | 4.0.63 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @ai-sdk/openai | 4.0.57 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @ai-sdk/openai-compatible | 3.0.43 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @ai-sdk/provider | 4.0.10 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @ai-sdk/provider-utils | 5.0.36 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| @asamuzakjp/css-color | 6.0.7 | MIT | [link](https://github.com/asamuzaK/cssColor#readme) |
| @asamuzakjp/dom-selector | 8.3.2 | MIT | [link](https://github.com/asamuzaK/domSelector#readme) |
| @babel/helper-string-parser | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-helper-string-parser) |
| @babel/helper-validator-identifier | 7.29.7 | MIT | [link](https://github.com/babel/babel#readme) |
| @babel/parser | 7.29.8 | MIT | [link](https://babel.dev/docs/en/next/babel-parser) |
| @babel/runtime | 7.29.7 | MIT | [link](https://babel.dev/docs/en/next/babel-runtime) |
| @babel/types | 7.29.8 | MIT | [link](https://babel.dev/docs/en/next/babel-types) |
| @base-ui/utils | 0.3.2 | MIT | [link](https://github.com/mui/base-ui#readme) |
| @bramus/specificity | 2.4.2 | MIT | [link](https://github.com/bramus/specificity#readme) |
| @csstools/color-helpers | 6.1.1 | MIT-0 | [link](https://github.com/csstools/postcss-plugins/tree/main/packages/color-helpers#readme) |
| @csstools/css-calc | 3.3.0 | MIT | [link](https://github.com/csstools/postcss-plugins/tree/main/packages/css-calc#readme) |
| @csstools/css-color-parser | 4.2.2 | MIT | [link](https://github.com/csstools/postcss-plugins/tree/main/packages/css-color-parser#readme) |
| @csstools/css-parser-algorithms | 4.0.0 | MIT | [link](https://github.com/csstools/postcss-plugins/tree/main/packages/css-parser-algorithms#readme) |
| @csstools/css-syntax-patches-for-csstree | 1.1.12 | MIT-0 | [link](https://github.com/csstools/postcss-plugins/tree/main/packages/css-syntax-patches-for-csstree#readme) |
| @csstools/css-tokenizer | 4.0.0 | MIT | [link](https://github.com/csstools/postcss-plugins/tree/main/packages/css-tokenizer#readme) |
| @date-fns/tz | 1.5.0 | MIT | [link](https://github.com/date-fns/date-fns#readme) |
| @embedpdf/engines | 2.15.0 | MIT | [link](https://www.embedpdf.com/docs/engines/introduction) |
| @embedpdf/fonts-arabic | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/fonts-hebrew | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/fonts-jp | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/fonts-kr | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/fonts-latin | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/fonts-sc | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/fonts-tc | 1.0.0 | OFL-1.1 | [link](https://www.embedpdf.com/docs) |
| @embedpdf/models | 2.15.0 | MIT | [link](https://www.embedpdf.com/docs) |
| @embedpdf/pdfium | 2.15.0 | MIT | [link](https://www.embedpdf.com/docs/pdfium/introduction) |
| @exodus/bytes | 1.15.1 | MIT | [link](https://github.com/ExodusOSS/bytes) |
| @floating-ui/core | 1.8.0 | MIT | [link](https://floating-ui.com) |
| @floating-ui/dom | 1.8.0 | MIT | [link](https://floating-ui.com) |
| @floating-ui/react-dom | 2.1.9 | MIT | [link](https://floating-ui.com/docs/react-dom) |
| @floating-ui/utils | 0.2.12 | MIT | [link](https://floating-ui.com) |
| @hugeicons/core-free-icons | 4.3.0 | MIT |  |
| @hugeicons/react | 1.1.10 | MIT | [link](https://hugeicons.com) |
| @huggingface/jinja | 0.5.9 | MIT | [link](https://github.com/huggingface/huggingface.js#readme) |
| @huggingface/tokenizers | 0.1.3 | Apache-2.0 | [link](https://github.com/huggingface/tokenizers.js#readme) |
| @huggingface/transformers | 4.2.0 | Apache-2.0 | [link](https://github.com/huggingface/transformers.js#readme) |
| @img/colour | 1.1.0 | MIT | [link](https://github.com/lovell/colour#readme) |
| @img/sharp-darwin-arm64 | 0.35.4 | Apache-2.0 | [link](https://sharp.pixelplumbing.com) |
| @img/sharp-libvips-darwin-arm64 | 1.3.3 | LGPL-3.0-or-later | [link](https://sharp.pixelplumbing.com) |
| @jridgewell/gen-mapping | 0.3.13 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping) |
| @jridgewell/remapping | 2.3.5 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping) |
| @jridgewell/resolve-uri | 3.1.2 | MIT | [link](https://github.com/jridgewell/resolve-uri#readme) |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec) |
| @jridgewell/trace-mapping | 0.3.31 | MIT | [link](https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping) |
| @mixmark-io/domino | 2.2.0 | BSD-2-Clause | [link](https://github.com/mixmark-io/domino#readme) |
| @mozilla/readability | 0.6.0 | Apache-2.0 | [link](https://github.com/mozilla/readability) |
| @msgpackr-extract/msgpackr-extract-darwin-arm64 | 3.0.4 | MIT | [link](https://github.com/kriszyp/msgpackr-extract#readme) |
| @napi-rs/keyring | 2.0.0 | MIT | [link](https://github.com/Brooooooklyn/keyring-node#readme) |
| @napi-rs/keyring-darwin-arm64 | 2.0.0 | MIT | [link](https://github.com/Brooooooklyn/keyring-node#readme) |
| @noble/hashes | 2.4.0 | MIT | [link](https://paulmillr.com/noble/) |
| @opentelemetry/api | 1.9.1 | Apache-2.0 | [link](https://github.com/open-telemetry/opentelemetry-js/tree/main/api) |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/float | 1.0.2 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/path | 1.1.2 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause | [link](https://github.com/dcodeIO/protobuf.js#readme) |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause | [link](https://github.com/protobufjs/protobuf.js#readme) |
| @standard-schema/spec | 1.1.0 | MIT | [link](https://standardschema.dev) |
| @sveltejs/acorn-typescript | 1.0.10 | MIT | [link](https://github.com/sveltejs/acorn-typescript#readme) |
| @types/better-sqlite3 | 9.6.0 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/better-sqlite3) |
| @types/estree | 1.0.9 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree) |
| @types/node | 26.4.1 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) |
| @types/trusted-types | 2.0.7 | MIT | [link](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/trusted-types) |
| @typescript/typescript-darwin-arm64 | 7.0.2 | Apache-2.0 | [link](https://www.typescriptlang.org/) |
| @vercel/oidc | 3.2.0 | Apache-2.0 | [link](https://vercel.com) |
| @vue/compiler-core | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/compiler-core#readme) |
| @vue/compiler-dom | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/compiler-dom#readme) |
| @vue/compiler-sfc | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/compiler-sfc#readme) |
| @vue/compiler-ssr | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/compiler-ssr#readme) |
| @vue/reactivity | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/reactivity#readme) |
| @vue/runtime-core | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/runtime-core#readme) |
| @vue/runtime-dom | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/runtime-dom#readme) |
| @vue/server-renderer | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/server-renderer#readme) |
| @vue/shared | 3.5.34 | MIT | [link](https://github.com/vuejs/core/tree/main/packages/shared#readme) |
| @workflow/serde | 4.1.0 | Apache-2.0 | [link](https://github.com/vercel/workflow#readme) |
| @xmldom/xmldom | 0.9.12 | MIT | [link](https://github.com/xmldom/xmldom) |
| acorn | 8.18.0 | MIT | [link](https://github.com/acornjs/acorn) |
| adm-zip | 0.6.0 | MIT | [link](https://github.com/cthackers/adm-zip) |
| ai | 7.0.91 | Apache-2.0 | [link](https://ai-sdk.dev/docs) |
| argparse | 2.0.1 | Python-2.0 | [link](https://github.com/nodeca/argparse#readme) |
| aria-query | 5.3.1 | Apache-2.0 | [link](https://github.com/A11yance/aria-query#readme) |
| axobject-query | 4.1.0 | Apache-2.0 | [link](https://github.com/A11yance/axobject-query#readme) |
| better-sqlite3 | 13.0.3 | MIT | [link](http://github.com/WiseLibs/better-sqlite3) |
| bidi-js | 1.0.3 | MIT | [link](https://github.com/lojjic/bidi-js#readme) |
| boolbase | 2.0.0 | ISC | [link](https://github.com/fb55/boolbase) |
| boolean | 3.2.0 | MIT | [link](https://github.com/thenativeweb/boolean#readme) |
| builder-util-runtime | 9.7.0 | MIT | [link](https://github.com/electron-userland/electron-builder) |
| clsx | 2.1.1 | MIT | [link](https://github.com/lukeed/clsx#readme) |
| commander | 12.1.0 | MIT | [link](https://github.com/tj/commander.js#readme) |
| core-util-is | 1.0.3 | MIT | [link](https://github.com/isaacs/core-util-is#readme) |
| css-select | 7.0.0 | BSD-2-Clause | [link](https://github.com/fb55/css-select#readme) |
| css-tree | 3.2.1 | MIT | [link](https://github.com/csstree/csstree#readme) |
| css-what | 8.0.0 | BSD-2-Clause | [link](https://github.com/fb55/css-what#readme) |
| cssom | 0.5.0 | MIT | [link](https://github.com/NV/CSSOM#readme) |
| csstype | 3.2.3 | MIT | [link](https://github.com/frenic/csstype#readme) |
| data-urls | 7.0.0 | MIT | [link](https://github.com/jsdom/data-urls#readme) |
| date-fns | 4.4.0 | MIT | [link](https://github.com/date-fns/date-fns#readme) |
| debug | 4.4.3 | MIT | [link](https://github.com/debug-js/debug#readme) |
| decimal.js | 10.6.0 | MIT | [link](https://github.com/MikeMcl/decimal.js#readme) |
| define-data-property | 1.1.4 | MIT | [link](https://github.com/ljharb/define-data-property#readme) |
| define-properties | 1.2.1 | MIT | [link](https://github.com/ljharb/define-properties#readme) |
| defuddle | 0.19.3 | MIT | [link](https://github.com/kepano/defuddle) |
| detect-libc | 2.1.2 | Apache-2.0 | [link](https://github.com/lovell/detect-libc#readme) |
| detect-node | 2.1.0 | MIT | [link](https://github.com/iliakan/detect-node) |
| devalue | 5.9.2 | MIT | [link](https://github.com/sveltejs/devalue#readme) |
| dom-serializer | 2.0.0, 3.1.1 | MIT | [link](https://github.com/cheeriojs/dom-serializer#readme) |
| domelementtype | 2.3.0, 3.0.0 | BSD-2-Clause | [link](https://github.com/fb55/domelementtype#readme) |
| domhandler | 5.0.3, 6.0.1 | BSD-2-Clause | [link](https://github.com/fb55/domhandler#readme) |
| dompurify | 3.4.14 | (MPL-2.0 OR Apache-2.0) | [link](https://github.com/cure53/DOMPurify) |
| domutils | 3.2.2, 4.0.2 | BSD-2-Clause | [link](https://github.com/fb55/domutils#readme) |
| drizzle-orm | 0.45.2 | Apache-2.0 | [link](https://orm.drizzle.team) |
| effect | 4.0.0-beta.98 | MIT | [link](https://effect.website) |
| electron-updater | 6.8.9 | MIT | [link](https://github.com/electron-userland/electron-builder) |
| entities | 4.5.0, 7.0.1, 8.0.0 | BSD-2-Clause | [link](https://github.com/fb55/entities#readme) |
| es-define-property | 1.0.1 | MIT | [link](https://github.com/ljharb/es-define-property#readme) |
| es-errors | 1.3.0 | MIT | [link](https://github.com/ljharb/es-errors#readme) |
| es6-error | 4.1.1 | MIT | [link](https://github.com/bjyoungblood/es6-error) |
| escape-string-regexp | 4.0.0 | MIT | [link](https://github.com/sindresorhus/escape-string-regexp#readme) |
| esm-env | 1.2.2 | MIT | [link](https://github.com/benmccann/esm-env) |
| esrap | 2.2.12 | MIT | [link](https://github.com/sveltejs/esrap#readme) |
| estree-walker | 2.0.2 | MIT | [link](https://github.com/Rich-Harris/estree-walker#readme) |
| eventsource-parser | 3.1.1 | MIT | [link](https://github.com/rexxars/eventsource-parser#readme) |
| fast-check | 4.9.0 | MIT | [link](https://fast-check.dev/) |
| find-my-way-ts | 0.1.6 | MIT | [link](https://github.com/tim-smart/find-my-way-ts#readme) |
| flatbuffers | 25.9.23 | Apache-2.0 | [link](https://google.github.io/flatbuffers/) |
| foliate-js | vendored 78914ae | MIT | [link](https://github.com/johnfactotum/foliate-js) |
| fs-extra | 10.1.0 | MIT | [link](https://github.com/jprichardson/node-fs-extra) |
| global-agent | 3.0.0 | BSD-3-Clause | [link](https://github.com/gajus/global-agent#readme) |
| globalthis | 1.0.4 | MIT | [link](https://github.com/ljharb/System.global#readme) |
| gopd | 1.2.0 | MIT | [link](https://github.com/ljharb/gopd#readme) |
| graceful-fs | 4.2.11 | ISC | [link](https://github.com/isaacs/node-graceful-fs#readme) |
| guid-typescript | 1.0.9 | ISC | [link](https://github.com/NicolasDeveloper/guid-typescript#readme) |
| has-property-descriptors | 1.0.2 | MIT | [link](https://github.com/inspect-js/has-property-descriptors#readme) |
| html-encoding-sniffer | 6.0.0 | MIT | [link](https://github.com/jsdom/html-encoding-sniffer#readme) |
| html-escaper | 3.0.3 | MIT | [link](https://github.com/WebReflection/html-escaper) |
| htmlparser2 | 10.1.0 | MIT | [link](https://github.com/fb55/htmlparser2#readme) |
| immediate | 3.0.6 | MIT | [link](https://github.com/calvinmetcalf/immediate#readme) |
| inherits | 2.0.4 | ISC | [link](https://github.com/isaacs/inherits#readme) |
| ini | 7.0.0 | ISC | [link](https://github.com/npm/ini#readme) |
| is-potential-custom-element-name | 1.0.1 | MIT | [link](https://github.com/mathiasbynens/is-potential-custom-element-name) |
| is-reference | 3.0.3 | MIT | [link](https://github.com/Rich-Harris/is-reference#readme) |
| isarray | 1.0.0 | MIT | [link](https://github.com/juliangruber/isarray) |
| JetBrains Mono | 2.304 | OFL-1.1 | [link](https://github.com/JetBrains/JetBrainsMono) |
| js-yaml | 4.3.2 | MIT | [link](https://github.com/nodeca/js-yaml#readme) |
| jsdom | 30.0.1 | MIT | [link](https://github.com/jsdom/jsdom#readme) |
| json-schema | 0.4.0 | (AFL-2.1 OR BSD-3-Clause) | [link](https://github.com/kriszyp/json-schema#readme) |
| json-stringify-safe | 5.0.1 | ISC | [link](https://github.com/isaacs/json-stringify-safe) |
| jsonfile | 6.2.1 | MIT | [link](https://github.com/jprichardson/node-jsonfile#readme) |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) | [link](https://github.com/Stuk/jszip#readme) |
| kubernetes-types | 1.30.0 | Apache-2.0 | [link](https://github.com/silverlyra/kubernetes-types#readme) |
| lazy-val | 1.0.5 | MIT | [link](https://github.com/develar/lazy-val) |
| lie | 3.3.0 | MIT | [link](https://github.com/calvinmetcalf/lie#readme) |
| linkedom | 0.18.13 | ISC | [link](https://github.com/WebReflection/linkedom#readme) |
| locate-character | 3.0.0 | MIT | [link](https://gitlab.com/Rich-Harris/locate-character#README) |
| lodash.escaperegexp | 4.1.2 | MIT | [link](https://lodash.com/) |
| lodash.isequal | 4.5.0 | MIT | [link](https://lodash.com/) |
| long | 5.3.2 | Apache-2.0 | [link](https://github.com/dcodeIO/long.js#readme) |
| lru-cache | 11.5.2 | BlueOak-1.0.0 | [link](https://github.com/isaacs/node-lru-cache#readme) |
| magic-string | 0.30.21 | MIT | [link](https://github.com/Rich-Harris/magic-string#readme) |
| matcher | 3.0.0 | MIT | [link](https://github.com/sindresorhus/matcher#readme) |
| mathml-to-latex | 1.8.0 | MIT | [link](https://github.com/asnunes/mathml-to-latex#readme) |
| mdn-data | 2.27.1 | CC0-1.0 | [link](https://developer.mozilla.org) |
| ms | 2.1.3 | MIT | [link](https://github.com/vercel/ms#readme) |
| msgpackr | 2.1.0 | MIT | [link](https://github.com/kriszyp/msgpackr#readme) |
| msgpackr-extract | 3.0.4 | MIT | [link](https://github.com/kriszyp/msgpackr-extract#readme) |
| multipasta | 0.2.8 | MIT | [link](https://github.com/tim-smart/multipasta#readme) |
| nanoid | 3.3.18 | MIT | [link](https://github.com/ai/nanoid#readme) |
| node-addon-api | 8.9.2 | MIT | [link](https://github.com/nodejs/node-addon-api) |
| node-gyp-build-optional-packages | 5.2.2 | MIT | [link](https://github.com/prebuild/node-gyp-build) |
| Noto Sans SC | bundled | OFL-1.1 | [link](https://fonts.google.com/noto/specimen/Noto+Sans+SC) |
| Noto Serif SC | bundled | OFL-1.1 | [link](https://fonts.google.com/noto/specimen/Noto+Serif+SC) |
| nth-check | 3.0.1 | BSD-2-Clause | [link](https://github.com/fb55/nth-check) |
| object-keys | 1.1.1 | MIT | [link](https://github.com/ljharb/object-keys#readme) |
| onnxruntime-common | 1.24.0-dev.20251116-b39e144322, 1.24.3 | MIT | [link](https://github.com/Microsoft/onnxruntime#readme) |
| onnxruntime-node | 1.24.3 | MIT | [link](https://github.com/Microsoft/onnxruntime#readme) |
| onnxruntime-web | 1.26.0-dev.20260416-b7804b056c | MIT | [link](https://github.com/Microsoft/onnxruntime#readme) |
| pako | 1.0.11 | (MIT AND Zlib) | [link](https://github.com/nodeca/pako) |
| parse5 | 8.0.1 | MIT | [link](https://parse5.js.org) |
| picocolors | 1.1.1 | ISC | [link](https://github.com/alexeyraspopov/picocolors#readme) |
| platform | 1.3.6 | MIT | [link](https://github.com/bestiejs/platform.js#readme) |
| postcss | 8.5.28 | MIT | [link](https://postcss.org/) |
| preact | 10.29.2 | MIT | [link](https://preactjs.com) |
| process-nextick-args | 2.0.1 | MIT | [link](https://github.com/calvinmetcalf/process-nextick-args) |
| protobufjs | 7.6.6 | BSD-3-Clause | [link](https://protobufjs.github.io/protobuf.js/) |
| punycode | 2.3.1 | MIT | [link](https://mths.be/punycode) |
| pure-rand | 8.4.2 | MIT | [link](https://github.com/dubzzz/pure-rand#readme) |
| readable-stream | 2.3.8 | MIT | [link](https://github.com/nodejs/readable-stream#readme) |
| require-from-string | 2.0.2 | MIT | [link](https://github.com/floatdrop/require-from-string#readme) |
| reselect | 5.3.0 | MIT | [link](https://github.com/reduxjs/reselect#readme) |
| roarr | 2.15.4 | BSD-3-Clause | [link](https://github.com/gajus/roarr#readme) |
| safe-buffer | 5.1.2 | MIT | [link](https://github.com/feross/safe-buffer) |
| sax | 1.6.1 | BlueOak-1.0.0 | [link](https://github.com/isaacs/sax-js#readme) |
| saxes | 6.0.0 | ISC | [link](https://github.com/lddubeau/saxes#readme) |
| scheduler | 0.27.0 | MIT | [link](https://react.dev/) |
| semver | 7.7.4, 7.8.5 | ISC | [link](https://github.com/npm/node-semver#readme) |
| semver-compare | 1.0.0 | MIT | [link](https://github.com/substack/semver-compare) |
| serialize-error | 7.0.1 | MIT | [link](https://github.com/sindresorhus/serialize-error#readme) |
| setimmediate | 1.0.5 | MIT | [link](https://github.com/YuzuJS/setImmediate#readme) |
| sharp | 0.35.4 | Apache-2.0 | [link](https://sharp.pixelplumbing.com) |
| Source Serif 4 | 4.005 | OFL-1.1 | [link](https://github.com/adobe-fonts/source-serif) |
| source-map-js | 1.2.1 | BSD-3-Clause | [link](https://github.com/7rulnik/source-map-js) |
| sprintf-js | 1.1.3 | BSD-3-Clause | [link](https://github.com/alexei/sprintf.js#readme) |
| string_decoder | 1.1.1 | MIT | [link](https://github.com/nodejs/string_decoder) |
| supports-color | 10.2.2 | MIT | [link](https://github.com/chalk/supports-color#readme) |
| svelte | 5.55.9 | MIT | [link](https://svelte.dev) |
| symbol-tree | 3.2.4 | MIT | [link](https://github.com/jsdom/js-symbol-tree#symbol-tree) |
| temml | 0.13.5 | MIT | [link](https://temml.org) |
| tiny-typed-emitter | 2.1.0 | MIT | [link](https://github.com/binier/tiny-typed-emitter#readme) |
| tldts | 7.4.11 | MIT | [link](https://github.com/remusao/tldts#readme) |
| tldts-core | 7.4.11 | MIT | [link](https://github.com/remusao/tldts#readme) |
| toml | 4.3.0 | MIT | [link](https://github.com/BinaryMuse/toml-node#readme) |
| tough-cookie | 6.0.2 | BSD-3-Clause | [link](https://github.com/salesforce/tough-cookie) |
| tr46 | 6.0.0 | MIT | [link](https://github.com/jsdom/tr46#readme) |
| turndown | 7.2.4 | MIT | [link](https://github.com/mixmark-io/turndown#readme) |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) | [link](https://github.com/sindresorhus/type-fest#readme) |
| uhyphen | 0.2.0 | ISC | [link](https://github.com/WebReflection/uhyphen#readme) |
| undici | 7.29.0, 7.29.1, 8.10.1 | MIT | [link](https://undici.nodejs.org) |
| undici-types | 8.3.0 | MIT | [link](https://undici.nodejs.org) |
| universalify | 2.0.1 | MIT | [link](https://github.com/RyanZim/universalify#readme) |
| use-sync-external-store | 1.6.0 | MIT | [link](https://github.com/facebook/react#readme) |
| util-deprecate | 1.0.2 | MIT | [link](https://github.com/TooTallNate/util-deprecate) |
| uuid | 14.0.2 | MIT | [link](https://github.com/uuidjs/uuid#readme) |
| vue | 3.5.34 | MIT | [link](https://vuejs.org/) |
| w3c-xmlserializer | 5.0.0 | MIT | [link](https://github.com/jsdom/w3c-xmlserializer#readme) |
| webidl-conversions | 8.0.1 | BSD-2-Clause | [link](https://github.com/jsdom/webidl-conversions#readme) |
| whatwg-mimetype | 5.0.0 | MIT | [link](https://github.com/jsdom/whatwg-mimetype#readme) |
| whatwg-url | 16.0.1, 17.1.0 | MIT | [link](https://github.com/jsdom/whatwg-url#readme) |
| xml-name-validator | 5.0.0 | Apache-2.0 | [link](https://github.com/jsdom/xml-name-validator#readme) |
| xmlchars | 2.2.0 | MIT | [link](https://github.com/lddubeau/xmlchars#readme) |
| yaml | 2.9.0 | ISC | [link](https://eemeli.org/yaml/) |
| zimmerframe | 1.1.4 | MIT | [link](https://github.com/sveltejs/zimmerframe#readme) |
| zod | 4.5.4 | MIT | [link](https://zod.dev) |
