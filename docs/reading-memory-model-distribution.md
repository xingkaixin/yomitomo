# 阅读记忆模型分发

本文记录 `reading-memory-embedding-v1` 的第一方分发契约、R2 初始化、发布和验证方式。
桌面端只应消费这里的版本清单，不直接依赖上游模型地址。

## 分发契约

- 清单地址：`https://download.yomitomo.app/models/reading-memory-embedding-v1/manifest.json`
- 文件地址：`/models/reading-memory-embedding-v1/objects/sha256/{sha256}/{path}`
- R2 bucket：`yomitomo-model-assets`
- Worker binding：`MODEL_ASSETS`

版本清单由 RD-964 的固定模型选择和仓库内许可证文件确定性生成。所有模型、NOTICE、Gemma
条款和转换说明都使用带 SHA-256 的不可变地址；固定版本清单也只允许首次创建，不能覆盖。
上游 Hugging Face 地址仅作为发布器的受控来源，不由 Download Worker 代理。

发布器会先把所有来源复制到临时目录并核对大小与 SHA-256，再按以下顺序操作：

1. 使用 `If-None-Match: *` 创建内容地址对象；已存在对象只能通过相同大小、摘要元数据和远端内容回读校验。
2. 回读并重新计算每个远端对象的 SHA-256。
3. 仅在所有对象验证通过后，以相同规则创建并回读版本清单。

因此，失败可能留下不可见的内容地址对象，但不会让清单引用缺失或错误内容。发布器不提供删除或覆盖能力。

## 首次初始化

先确认 Wrangler 已登录目标 Cloudflare account，再创建专用 bucket：

```bash
pnpm --filter @yomitomo/download exec wrangler whoami
pnpm --filter @yomitomo/download exec wrangler r2 bucket create yomitomo-model-assets
```

在 Cloudflare R2 管理页创建只允许读写该 bucket 的 S3 API token，并把以下值配置为 GitHub
Actions repository secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

`apps/download/wrangler.jsonc` 已声明 `MODEL_ASSETS` binding。创建 bucket 后部署 Download
Worker：

```bash
pnpm --filter @yomitomo/download deploy:cf
```

## 发布

合并模型清单、许可证或发布器改动后，从 `main` 手动运行 GitHub Actions 的
`Publish Reading Memory Model`。工作流拒绝从其他分支发布，并通过并发组保证同一时刻只有一个发布任务。

本地使用同一发布器时，需要设置上述三个环境变量，然后运行：

```bash
pnpm --filter @yomitomo/download model:publish
```

重复运行是只读验证：内容完全相同时成功，任何对象或清单不同时失败，不会替换远端数据。

条件写保证本发布器不能覆盖同名对象，但不会限制其他持写权限的客户端。若生产威胁模型要求
存储层也禁止覆盖或删除，应在首次发布和校验完成后，为
`reading-memory-embedding-v1/` 前缀配置 R2 Bucket Lock。保留规则在有效期内不能绕过，设置前必须
确认保护范围和期限，因此不由发布脚本自动创建。

## 发布后验证

先取得清单中的一个文件 URL，再检查完整读取、HEAD 和单段 Range：

```bash
manifest_url='https://download.yomitomo.app/models/reading-memory-embedding-v1/manifest.json'
object_url="$(curl -fsS "$manifest_url" | jq -r '.artifact.files[0].url')"

curl -fsS "$manifest_url" | jq '.internalId, .distributionDownloadSizeBytes'
curl -fsSI "$object_url"
curl -fsS -D - -o /dev/null -H 'Range: bytes=0-0' "$object_url"
```

预期：清单和对象返回 `Cache-Control: public, max-age=31536000, immutable`；HEAD 返回准确的
`Content-Length`；Range 返回 `206`、`Accept-Ranges: bytes` 和正确的 `Content-Range`。
不存在对象、非法 Range 或摘要元数据不符必须返回非成功状态和 `Cache-Control: no-store`。

如需更新模型内容，必须创建新的产品模型版本、目录和固定清单，不能修改
`reading-memory-embedding-v1` 已发布对象。
