# 阅读记忆模型下载

`reading-memory-embedding-v1` 使用现有公共模型仓库直接下载，不经过 Yomitomo Download Worker，
不需要创建 R2 bucket、配置发布凭据或复制模型权重。

## 固定来源

两个来源都是 `onnx-community/embeddinggemma-300m-ONNX`：

| 来源 | 仓库 | 固定 revision |
| --- | --- | --- |
| ModelScope | https://modelscope.cn/models/onnx-community/embeddinggemma-300m-ONNX | `8a5a38f48e040757f2ccca1782d11c4279e0a34b` |
| Hugging Face | https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX | `5090578d9565bb06545b4552f76e6bc2c93e4a66` |

下载地址由 `apps/desktop/src/reading-memory-model-sources.ts` 统一构造。两个平台的 revision
不同，但当前使用的五个文件大小与 SHA-256 相同；不能把 Hugging Face commit 直接用作
ModelScope revision，也不能把同名模型的其他格式或量化版本作为替代。

设置页默认选择 ModelScope，用户可切换到 Hugging Face。不根据界面语言推断所在地。
中断后可以选择另一来源继续下载；运行中的下载需要先取消。没有自动测速或自动换源。
大陆实际速度和成功率需要在当地不同运营商网络验证，仓库存在与 HTTP 成功不构成速度保证。

## 客户端契约

- 清单和完整的 NOTICE、Gemma 条款、转换说明位于 `apps/desktop/model-releases/reading-memory-embedding-v1/`，随客户端内置。
- 模型文件不随安装包分发；用户明确下载后才请求所选平台，下载量为 218,726,989 字节。
- 内置清单有固定 SHA-256；下载文件按该清单核验大小、SHA-256 和相对路径。
- 下载只允许跳转到 HTTPS 的 Hugging Face / ModelScope 及其 CDN 域名，最多跟随五次重定向。
- 模型先写入 `userData/models/.reading-memory-embedding-v1.partial`，全部文件和随附声明就绪后再原子重命名。
- 续传使用 Range；源不支持 Range 时从头下载该文件。完成后始终验证完整文件摘要。
- 下载来源不参与模型身份或向量版本。换源不更换模型，也不需要重建索引。
- 安装后的模型加载和校验均离线执行，不向模型平台发送阅读内容。

## 验证与更新

普通测试不联网下载完整模型。生命周期测试覆盖取消、跨源续传、重定向、摘要失败和磁盘错误；
清单测试核对评测选定的五个文件与随附声明；打包 smoke 继续使用真实模型缓存验证本地推理。

来源变更前，先通过平台 API 比较固定 revision 的每个文件大小、摘要，再验证匿名 GET 与
Range 请求。发布前应实测完整下载和安装，以及大陆电信、联通、移动的下载成功率与耗时。

更换权重、tokenizer、推理参数或向量格式需要新的模型版本和相应评测。仅调整镜像地址时保留
模型版本与文件摘要。修改内置清单后同步更新桌面端固定摘要；不依赖远端可变清单。
