# 阅读记忆多语言语义模型评测

## 结论

`reading-memory-embedding-v1` 固定为 EmbeddingGemma 300M 的 q4 ONNX 产物，使用 768 维、
L2 归一化的 `float32` 向量。这个标识是内部契约；产品界面和业务数据不依赖上游模型名。

本次选择带有明确的发布约束，而不是把未达到的指标记成通过：纯语义检索在九个语言方向中，
Top-12 必要证据覆盖全部达标，Top-3 有帮助证据命中通过八个方向；`zh->zh` 为 15/20，
距离 16/20 的门槛差一条。RD-968 必须用设计中已经要求的全文与语义混合排序补齐这一缺口，
RD-973 必须重跑九方向门禁。任何一个方向仍未达标时，阅读记忆不能开放。

GTE 与 EmbeddingGemma 都只差一个查询，但失败位置不同：GTE 的 Top-3 九方向全部达标，
`ja→en` Top-12 为 17/20；EmbeddingGemma 的 Top-12 九方向全部达标，`zh→zh` Top-3 为
15/20。首期优先保证“问书库”的必要证据覆盖，而且既定混合检索能用同语言全文信号补
`zh→zh`，却不能可靠补跨语言的 `ja→en`。EmbeddingGemma 的 218,726,989 字节下载体积和
742.3 MB 峰值 RSS 也明显低于 GTE，因此固定前者。体积约三倍的 Qwen 虽补上了 `zh→zh`，
但另有三个方向失败，增加模型体积没有让九方向门禁整体通过。

## 固定评测集

评测集包含 60 个独立语义场景，查询语言中、英、日各 20 个；`same`、`complements`、
`contradicts` 各 20 个。每个场景包含：

- 一条阅读中关联查询和一条问书库查询；
- 中、英、日各一条人工标记的必要证据；
- 中、英、日各一条主题或表面文字相似、但不能帮助当前判断的 hard negative。

由此派生 360 次查询：九个“查询语言 → 证据语言”方向，各有 20 条阅读中关联查询和 20 条
问书库查询。方向门禁在目标语言语料中计算，这是跨语言检索评测的可解释口径；完整的中英日
混合语料排名同时记录为更严格的诊断结果，但不替代分方向门禁。

计分规则直接对应 RD-754：

- 阅读中关联：每个方向至少 16/20 的查询在 Top-3 命中目标必要证据；
- 问书库：每个方向至少 18/20 的查询在 Top-12 覆盖目标必要证据；
- 相同、补充、相反分别报告 Top-3，不用微平均掩盖薄弱方向；
- 必要证据是否排在对应 hard negative 前作为诊断指标。

质量集只使用已经标注的证据。1 万资产测试用于测量固定维度向量矩阵的查询嵌入、点积扫描、
Top-K、内存与索引体积；剩余规模数据不冒充人工相关性标注，因此不参与召回分母。

## 候选与 macOS arm64 实测

同一台 macOS arm64 机器上，所有候选均限制 ONNX Runtime 使用四个计算线程。冷启动从独立
Node 进程启动到缓存模型可用，P95 包含单条查询嵌入及 10,000 条向量的 Top-12 扫描，采样
100 次。数值会受硬件和系统负载影响，机器可读原始结果是最终依据。

| 候选                         | 许可证     |     下载 | 维度 | Top-3 达标方向 | Top-12 达标方向 |   冷启动 |   峰值 RSS |  10k P95 |
| ---------------------------- | ---------- | -------: | ---: | -------------: | --------------: | -------: | ---------: | -------: |
| multilingual-e5-small int8   | MIT        | 135.1 MB |  384 |            3/9 |             4/9 | 1,227 ms |   869.3 MB |  22.3 ms |
| multilingual MiniLM L12 int8 | Apache-2.0 | 135.1 MB |  384 |            2/9 |             6/9 | 2,084 ms |   870.1 MB |  24.9 ms |
| GTE multilingual base int8   | Apache-2.0 | 357.4 MB |  768 |            9/9 |             8/9 | 1,363 ms | 1,363.3 MB |  45.6 ms |
| EmbeddingGemma 300M q4       | Gemma      | 218.7 MB |  768 |            8/9 |             9/9 | 1,672 ms |   742.3 MB |  65.2 ms |
| Qwen3 Embedding 0.6B q8      | Apache-2.0 | 625.0 MB | 1024 |            7/9 |             8/9 | 1,393 ms | 2,100.2 MB | 119.6 ms |

模型准备和正式测量分别在一次性 Node 进程中执行，避免前一个候选的内存与热状态污染后续
候选；网络下载时间不计入。向量矩阵使用 little-endian、row-major 的归一化 `float32`，
10,000 条 768 维向量占 30,720,000 字节。

## 平台与许可证边界

模型运行时使用 `@huggingface/transformers@4.2.0` 和
`onnxruntime-node@1.24.3`。独立 workflow 在 `macos-15` 的 arm64 runner 与
`windows-latest` 的 x64 runner 上先构建桌面应用，再校验：

- 固定 revision 的每个文件大小与 SHA-256；
- 中、英、日三条输入的加载、维度、有限数值与 L2 范数；
- Windows 四核、16 GB runner 上的 10,000 条候选性能。

当前工作只验证 Node 桌面运行时。Electron 打包后的 native 资源装载属于 RD-967，最终安装包
双平台验证属于 RD-973。

EmbeddingGemma 允许商业使用和再分发，但不是 Apache/MIT 许可证。本次依据的是
2026-04-01 版 Gemma 条款。后续分发必须把 Section 3.2 使用限制纳入可执行协议并通知下游
用户，向接收者提供完整协议副本，让每个修改文件带有显著修改标记，并在非 hosted 分发中
附带 `NOTICE` 文件，其指定文本为 “Gemma is provided under and subject to the Gemma Terms of
Use found at ai.google.dev/gemma/terms”。这些义务已写入机器可读清单；RD-965 在把模型放入产品
控制的固定版本对象前必须再次校验并真正落实。

上游依据：

- [EmbeddingGemma 模型卡](https://ai.google.dev/gemma/docs/embeddinggemma/model_card)
- [Gemma 使用与再分发条款](https://ai.google.dev/gemma/terms)
- [EmbeddingGemma 固定 ONNX revision](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/tree/5090578d9565bb06545b4552f76e6bc2c93e4a66)
- [multilingual-e5-small 固定 revision](https://huggingface.co/intfloat/multilingual-e5-small/tree/614241f622f53c4eeff9890bdc4f31cfecc418b3)
- [multilingual MiniLM 固定 revision](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/tree/e8f8c211226b894fcb81acc59f3b34ba3efd5f42)
- [GTE multilingual 固定 revision](https://huggingface.co/Alibaba-NLP/gte-multilingual-base/tree/9bbca17d9273fd0d03d5725c7a4b0f6b45142062)
- [Qwen3 Embedding 固定 revision](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B/tree/97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3)

## 复现

普通 CI 只重跑数据结构、计分、结果绑定和清单漂移测试，不下载模型。完整本地评测使用：

```bash
pnpm --filter @yomitomo/ai evaluate:semantic \
  --candidate=all \
  --mode=full \
  --iterations=100 \
  --output=evaluation/semantic-retrieval/results/darwin-arm64-candidates-v1.json
```

`full` 模式会在写出报告后执行性能门禁，并确保所选模型的质量不低于本次记录的基线；任一
门禁失败都会以非零状态退出。模型文件由固定 revision 逐个下载并校验大小和 SHA-256，只有
全部校验通过后，独立评测进程才会以离线模式把模型交给原生推理运行时加载。

相关机器可读文件：

- `packages/ai/evaluation/semantic-retrieval/candidates-v1.json`
- `packages/ai/evaluation/semantic-retrieval/results/darwin-arm64-candidates-v1.json`
- `packages/ai/evaluation/semantic-retrieval/selection-v1.json`
- `packages/ai/evaluation/semantic-retrieval/selected-model-v1.json`
