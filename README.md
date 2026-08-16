# @local/dsh-github-tool — GitHub 接入插件

DeepSeek Harness 持久化插件：直连 GitHub（**github_api** / **github_push_files** / **github_graphql** / **github_create_discussion** 工具）。

## 功能
- `github_api`：通用 GitHub REST 调用（GET/POST/PUT/PATCH/DELETE），token 认证
- `github_push_files`：多文件单次提交（git data API：blob → tree → commit → ref 全流程），
  支持 `localPath` 本地文件直传（二进制安全，如 PNG）
- `github_graphql`：通用 GitHub GraphQL 调用（query + variables）
- `github_create_discussion`：一键发讨论帖（自动解析仓库 ID + 讨论分类，返回帖子 URL）
- 插件配置卡（设置 → 插件 → 插件配置 →「GitHub 接入」）：API 地址 / 用户名 / 默认仓库 /
  默认分支 / 代理 / 默认提交信息 / Token，官方卡片同款 UI（暂存编辑、已覆盖标记、恢复默认）
- Token 走 DSH 凭据系统（`ctx.credentials`）加密存储，不落配置文件
- 可选 HTTP 代理（CONNECT 隧道）应对受限网络

## 文件
- `lib/index.js` — 宿主：设置命名空间 + 自有设置路由（GET 分层快照 / POST 字段级 mutate）+ 工具注册
- `lib/client.js` — 客户端：插件配置卡片（官方 CardForm 语义，数据走自有路由；settings wire
  只服务硬编码白名单命名空间，第三方插件需自建路由）
- `cordis.patch.yml` — bundle patch（注入宿主组合）

## 安装（本机 profile）
```json
// ~/.dsh/profiles/web/package.json
"dependencies": { "@local/dsh-github-tool": "link:<本目录>" },
"dsh": { "profile": { "bundles": ["@local/dsh-github-tool"] } }
```
并建立 `node_modules/@local/dsh-github-tool` → 本目录 的符号链接。

## Token
GitHub → Settings → Developer settings → Personal access tokens（勾选 `repo` 权限），
在插件配置卡的「GitHub 接入」卡片中填入；凭据引用默认 `GITHUB_TOKEN`。
