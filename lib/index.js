/**
 * @local/dsh-github-tool — persistent GitHub access for DeepSeek Harness.
 *
 * Bundle plugin in the dsh-vision-toolkit form:
 * - plugin configuration card (Settings > Plugins > 插件配置) backed by the
 *   plugin's own settings route: GET layered snapshot (value/base/user) and
 *   POST field-level mutate ops; the settings wire only serves a hardcoded
 *   namespace allowlist, so third-party plugins expose their own route;
 * - model tools: `github_api` (generic REST) and `github_push_files` (commit
 *   files to a repo via the git data API — "upload project");
 * - credential-backed token (stored via ctx.credentials, never in settings);
 * - optional HTTP proxy support for restricted networks.
 * @module @local/dsh-github-tool
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import fsp from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

export const name = '@local/dsh-github-tool';
export const inject = ['tools', 'settings', 'credentials'];

/** Settings document namespace (renders in the Web settings UI). */
export const GITHUB_SETTINGS_NAMESPACE = settingsNamespace('github-tool');

/** Visual configuration schema. */
export const Config = z.object({
  apiBase: z.string().default('https://api.github.com'),
  username: z.string().default(''),
  defaultRepo: z.string().default(''),
  defaultBranch: z.string().default('main'),
  proxy: z.string().default(''),
  credential: z.string().default('GITHUB_TOKEN'),
  defaultCommitMessage: z.string().default('chore: update via DSH'),
});

const SETTINGS_ROUTE = '/_dsh/github-tool/settings';
const DEFAULT_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'dsh-github-tool',
  'X-GitHub-Api-Version': '2022-11-28',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One authenticated GitHub REST call with optional HTTP proxy (CONNECT tunnel). */
export function ghRequest({ method, url, token, body, proxy, timeoutMs = 60000, signal }) {
  return new Promise((resolve, reject) => {
    const headers = {
      ...DEFAULT_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    let payload;
    if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const finish = (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = text;
        try {
          data = JSON.parse(text);
        } catch {
          // non-JSON body kept as text
        }
        resolve({ status: res.statusCode, data });
      });
      res.on('error', reject);
    };
    const doTls = (socket) => {
      const req = https.request(url, {
        method,
        headers,
        signal,
        ...(socket ? { createConnection: () => socket } : {}),
      }, finish);
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    };
    if (proxy) {
      const [proxyHost, proxyPort] = String(proxy).replace(/^https?:\/\//, '').split(':');
      const port = Number(proxyPort || 443);
      const connectReq = http.request({
        host: proxyHost,
        port,
        method: 'CONNECT',
        path: `${url.hostname}:${url.port || 443}`,
        headers: { Host: `${url.hostname}:${url.port || 443}` },
        signal,
      });
      connectReq.setTimeout(timeoutMs, () => connectReq.destroy(new Error(`proxy connect timed out after ${timeoutMs}ms`)));
      connectReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`proxy CONNECT failed with HTTP ${res.statusCode}`));
          return;
        }
        doTls(socket);
      });
      connectReq.on('error', reject);
      connectReq.end();
    } else {
      doTls();
    }
  });
}

export function ghUrl(apiBase, path, query) {
  const base = String(apiBase || 'https://api.github.com').replace(/\/+$/, '');
  const url = new URL(path.replace(/^\/+/, ''), base + '/');
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function statusMessage(res) {
  const detail = res && res.data && typeof res.data === 'object' && res.data.message ? `: ${res.data.message}` : '';
  return `GitHub API HTTP ${res ? res.status : '?'}${detail}`;
}

/** Layered settings snapshot for the plugin card (value/base/user + credential view). */
function settingsSnapshot(webCtx, credentialInfo) {
  const descriptor = webCtx.settings.describe().find((row) => row.ns === GITHUB_SETTINGS_NAMESPACE);
  return {
    writable: webCtx.settings.writable,
    settings: {
      value: descriptor?.value ?? {},
      revision: descriptor?.revision ?? 0,
      ...(descriptor?.base === undefined ? {} : { base: descriptor.base }),
      ...(descriptor?.user === undefined ? {} : { user: descriptor.user }),
    },
    credential: {
      ref: String(descriptor?.value?.credential ?? 'GITHUB_TOKEN'),
      configured: credentialInfo?.configured === true,
      source: credentialInfo?.source,
      writable: credentialInfo?.writable === true,
    },
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function collectBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Web settings route: GET snapshot, POST field-level mutate ops. */
async function handleSettingsRequest(webCtx, req, res) {
  try {
    const credentialInfo = await webCtx.credentials.describe(credentialRef(String(
      webCtx.settings.describe().find((row) => row.ns === GITHUB_SETTINGS_NAMESPACE)?.value?.credential ?? 'GITHUB_TOKEN',
    ))).catch(() => undefined);
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, value: settingsSnapshot(webCtx, credentialInfo) });
      return;
    }
    if (req.method === 'POST') {
      const body = JSON.parse(await collectBody(req));
      if (body?.action !== 'mutate') {
        sendJson(res, 400, { ok: false, error: { message: 'unknown action' } });
        return;
      }
      // Field-level path ops ({op:'set'|'unset', path:[field]}) — mirrors the
      // official settings.mutate wire so only touched fields enter the user layer.
      if (!webCtx.settings.writable) throw new Error('settings provider is read-only');
      await webCtx.settings.mutate(GITHUB_SETTINGS_NAMESPACE, Array.isArray(body.ops) ? body.ops : [], body.expectedRevision);
      sendJson(res, 200, { ok: true, value: settingsSnapshot(webCtx, credentialInfo) });
      return;
    }
    sendJson(res, 405, { ok: false, error: { message: 'method not allowed' } });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: { message: String(err?.message ?? err) } });
  }
}

/** Plugin entry. */
export async function apply(ctx, config = {}) {
  const disposers = [];
  const settings = ctx.settings.register(GITHUB_SETTINGS_NAMESPACE, Config, {
    base: config,
    applies: 'live',
  });

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposeRoute = webCtx.webServer.register({
        kind: 'exact',
        path: SETTINGS_ROUTE,
        handler: (req, res) => handleSettingsRequest(webCtx, req, res),
      });
      return () => disposeRoute();
    }, 'dsh-github-tool: settings route');
  });

  async function resolveToken() {
    const cfg = settings.get();
    const resolved = await ctx.credentials.resolve(credentialRef(String(cfg.credential || 'GITHUB_TOKEN')));
    return resolved?.value;
  }

  const toolApi = defineTool({
    name: 'github_api',
    description: 'Call the GitHub REST API with the configured token (直连 GitHub). ' +
      'path is the API path without the leading slash (e.g. "repos/octocat/Hello-World" or "user/repos?per_page=5"). ' +
      'method defaults to GET; body (JSON object) is sent for POST/PUT/PATCH. ' +
      'Returns the JSON response or raw text. Auth uses the token configured in Settings > GitHub.',
    parameters: {
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method. Defaults to GET.' },
      path: { type: 'string', required: true, description: 'GitHub API path without the leading slash, e.g. repos/owner/name or user.' },
      query: { type: 'json', description: 'Optional query parameters (object).' },
      body: { type: 'json', description: 'Optional JSON body (object).' },
      timeoutMs: { type: 'number', description: 'Optional per-call timeout in ms (default 60000).' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const cfg = settings.get();
      const token = await resolveToken();
      if (!token) {
        return { ok: false, message: '未配置 GitHub Token，请在 设置 > GitHub 里填入（credential 字段对应的凭据）' };
      }
      const method = String(args.method || 'GET').toUpperCase();
      const url = ghUrl(cfg.apiBase, String(args.path), args.query);
      try {
        const res = await ghRequest({
          method,
          url,
          token,
          body: args.body,
          proxy: String(cfg.proxy || ''),
          timeoutMs: Number(args.timeoutMs) || 60000,
          signal: exec.signal,
        });
        if (res.status >= 200 && res.status < 300) {
          return { ok: true, status: res.status, data: res.data };
        }
        return { ok: false, status: res.status, message: statusMessage(res), data: res.data };
      } catch (err) {
        return { ok: false, message: 'GitHub 请求失败: ' + String(err?.message ?? err) };
      }
    },
  });

  const toolPushFiles = defineTool({
    name: 'github_push_files',
    description: 'Commit one or more files to a GitHub repository via the git data API (上传/更新项目文件). ' +
      'Creates a single commit containing all files. ' +
      'repo: "owner/name" (defaults to Settings > GitHub username/defaultRepo); ' +
      'branch defaults to Settings > GitHub defaultBranch. ' +
      'files: [{ path: "dir/file.txt", content: "text" }] or [{ path, localPath: "C:\\\\abs\\\\file.png" }] ' +
      '(localPath reads the local file directly and is binary-safe; content is ignored when localPath is set). ' +
      'Returns the commit sha and html_url.',
    parameters: {
      repo: { type: 'string', description: 'Repository "owner/name". Defaults to configured username + defaultRepo.' },
      branch: { type: 'string', description: 'Target branch. Defaults to configured defaultBranch.' },
      commit_message: { type: 'string', required: true, description: 'Commit message.' },
      files: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', required: true }, content: { type: 'string' }, localPath: { type: 'string', description: 'Absolute local file path (binary-safe). When set, content is ignored.' } } }, description: 'Files to write (path relative to repo root).' },
      timeoutMs: { type: 'number', description: 'Optional per-call timeout in ms.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const cfg = settings.get();
      const token = await resolveToken();
      if (!token) {
        return { ok: false, message: '未配置 GitHub Token，请在 设置 > GitHub 里填入' };
      }
      const files = Array.isArray(args.files) ? args.files : [];
      if (files.length === 0) return { ok: false, message: 'files 不能为空' };
      const owner = cfg.username || (String(args.repo || '').split('/')[0] || '');
      const repoName = String(args.repo || '').includes('/') ? String(args.repo).split('/')[1] : (cfg.defaultRepo || '');
      if (!owner || !repoName) {
        return { ok: false, message: '缺少仓库信息：请传 repo="owner/name" 或在 设置 > GitHub 配置 username 和 defaultRepo' };
      }
      const repo = `${owner}/${repoName}`;
      const branch = String(args.branch || cfg.defaultBranch || 'main');
      const proxy = String(cfg.proxy || '');
      const timeoutMs = Number(args.timeoutMs) || 120000;
      const signal = exec.signal;
      const base = `repos/${repo}`;
      try {
        const call = (method, path, body, query) => ghRequest({
          method, url: ghUrl(cfg.apiBase, `${base}/${path}`.replace(/\/+$/, ''), query), token, body, proxy, timeoutMs, signal,
        });
        // 1. resolve branch head
        const headRes = await call('GET', `git/ref/heads/${branch}`);
        let headSha;
        if (headRes.status === 404) {
          const repoInfo = await call('GET', '');
          if (repoInfo.status !== 200) return { ok: false, status: repoInfo.status, message: statusMessage(repoInfo) };
          const defaultBranch = repoInfo.data?.default_branch;
          const def = await call('GET', `git/ref/heads/${defaultBranch}`);
          if (def.status !== 200) return { ok: false, status: def.status, message: `默认分支 ${defaultBranch} 无法解析` };
          headSha = def.data?.object?.sha;
        } else if (headRes.status !== 200) {
          return { ok: false, status: headRes.status, message: statusMessage(headRes) };
        } else {
          headSha = headRes.data?.object?.sha;
        }
        const headCommit = await call('GET', `git/commits/${headSha}`);
        if (headCommit.status !== 200) return { ok: false, status: headCommit.status, message: statusMessage(headCommit) };
        const baseTree = headCommit.data?.tree?.sha;

        // 2. create blobs
        const blobs = [];
        for (const file of files) {
          let raw;
          if (file.localPath) {
            try {
              raw = await fsp.readFile(String(file.localPath));
            } catch (err) {
              return { ok: false, message: `无法读取本地文件 ${file.localPath}: ${String(err?.message ?? err)}` };
            }
          } else {
            raw = Buffer.from(String(file.content ?? ''), 'utf8');
          }
          const blob = await call('POST', 'git/blobs', {
            content: raw.toString('base64'),
            encoding: 'base64',
          });
          if (blob.status !== 201) return { ok: false, status: blob.status, message: `blob 创建失败 (${file.path}): ${statusMessage(blob)}` };
          blobs.push({ path: String(file.path), mode: '100644', type: 'blob', sha: blob.data?.sha });
        }

        // 3. new tree
        const tree = await call('POST', 'git/trees', { base_tree: baseTree, tree: blobs });
        if (tree.status !== 201) return { ok: false, status: tree.status, message: statusMessage(tree) };

        // 4. commit
        const commit = await call('POST', 'git/commits', {
          message: String(args.commit_message || cfg.defaultCommitMessage || 'chore: update via DSH'),
          tree: tree.data?.sha,
          parents: [headSha],
        });
        if (commit.status !== 201) return { ok: false, status: commit.status, message: statusMessage(commit) };

        // 5. update ref
        const ref = await call('PATCH', `git/refs/heads/${branch}`, { sha: commit.data?.sha, force: false });
        if (ref.status !== 200) return { ok: false, status: ref.status, message: statusMessage(ref) };

        return {
          ok: true,
          repo,
          branch,
          commit_sha: commit.data?.sha,
          html_url: `https://github.com/${repo}/commit/${commit.data?.sha}`,
          files_uploaded: files.length,
        };
      } catch (err) {
        return { ok: false, message: '上传失败: ' + String(err?.message ?? err) };
      }
    },
  });

  const toolGraphql = defineTool({
    name: 'github_graphql',
    description: 'Call the GitHub GraphQL API with the configured token (直连 GitHub GraphQL). ' +
      'query: a GraphQL query/mutation string; variables: optional JSON object. ' +
      'Useful for operations the REST API lacks, e.g. creating Discussions. ' +
      'Returns { data, errors } as GitHub responds.',
    parameters: {
      query: { type: 'string', required: true, description: 'GraphQL query or mutation string.' },
      variables: { type: 'json', description: 'Optional JSON variables object.' },
      timeoutMs: { type: 'number', description: 'Optional per-call timeout in ms.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const cfg = settings.get();
      const token = await resolveToken();
      if (!token) {
        return { ok: false, message: '未配置 GitHub Token，请在 设置 > GitHub 里填入' };
      }
      const url = new URL('graphql', String(cfg.apiBase || 'https://api.github.com').replace(/\/+$/, '') + '/');
      try {
        const res = await ghRequest({
          method: 'POST',
          url,
          token,
          body: { query: String(args.query), variables: args.variables ?? {} },
          proxy: String(cfg.proxy || ''),
          timeoutMs: Number(args.timeoutMs) || 60000,
          signal: exec.signal,
        });
        if (res.status !== 200) {
          return { ok: false, status: res.status, message: statusMessage(res), data: res.data };
        }
        const errors = Array.isArray(res.data?.errors) ? res.data.errors : [];
        return { ok: errors.length === 0, data: res.data?.data ?? null, errors };
      } catch (err) {
        return { ok: false, message: 'GraphQL 请求失败: ' + String(err?.message ?? err) };
      }
    },
  });

  const toolCreateDiscussion = defineTool({
    name: 'github_create_discussion',
    description: 'Create a Discussion post in a GitHub repository (发讨论帖). ' +
      'Resolves the repository and its discussion categories automatically; ' +
      'when category_id is omitted the first available category is used. ' +
      'repo: "owner/name" (defaults to Settings > GitHub username/defaultRepo). ' +
      'Returns the discussion url.',
    parameters: {
      repo: { type: 'string', description: 'Repository "owner/name". Defaults to configured username + defaultRepo.' },
      category_id: { type: 'string', description: 'Optional GraphQL discussion category id. Omit to use the first category.' },
      title: { type: 'string', required: true, description: 'Discussion title.' },
      body: { type: 'string', required: true, description: 'Discussion body (Markdown supported).' },
      timeoutMs: { type: 'number', description: 'Optional per-call timeout in ms.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const cfg = settings.get();
      const token = await resolveToken();
      if (!token) {
        return { ok: false, message: '未配置 GitHub Token，请在 设置 > GitHub 里填入' };
      }
      const owner = cfg.username || (String(args.repo || '').split('/')[0] || '');
      const repoName = String(args.repo || '').includes('/') ? String(args.repo).split('/')[1] : (cfg.defaultRepo || '');
      if (!owner || !repoName) {
        return { ok: false, message: '缺少仓库信息：请传 repo="owner/name" 或在 设置 > GitHub 配置 username 和 defaultRepo' };
      }
      const proxy = String(cfg.proxy || '');
      const timeoutMs = Number(args.timeoutMs) || 60000;
      const signal = exec.signal;
      const url = new URL('graphql', String(cfg.apiBase || 'https://api.github.com').replace(/\/+$/, '') + '/');
      const gql = async (query, variables) => {
        const res = await ghRequest({ method: 'POST', url, token, body: { query, variables }, proxy, timeoutMs, signal });
        if (res.status !== 200) throw new Error(statusMessage(res));
        if (Array.isArray(res.data?.errors) && res.data.errors.length > 0) {
          throw new Error(res.data.errors.map((e) => e.message).join('; '));
        }
        return res.data?.data;
      };
      try {
        // 1. resolve repository id + categories
        const info = await gql(
          'query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ id discussionCategories(first:20){ nodes{ id name } } } }',
          { owner, name: repoName },
        );
        const repoId = info?.repository?.id;
        if (!repoId) throw new Error(`仓库 ${owner}/${repoName} 不存在或无法访问`);
        const categories = info.repository.discussionCategories?.nodes ?? [];
        if (categories.length === 0) throw new Error('该仓库没有可用的 Discussion 分类（请先在仓库设置中创建分类）');
        let categoryId = String(args.category_id || '');
        const chosen = categoryId
          ? categories.find((c) => c.id === categoryId)
          : categories[0];
        if (!chosen) {
          throw new Error(`分类 ${categoryId} 不存在；可用分类: ${categories.map((c) => `${c.name} (${c.id})`).join(', ')}`);
        }
        // 2. create discussion
        const created = await gql(
          'mutation($rid:ID!,$cid:ID!,$title:String!,$body:String!){ createDiscussion(input:{ repositoryId:$rid, categoryId:$cid, title:$title, body:$body }){ discussion{ url } } }',
          { rid: repoId, cid: chosen.id, title: String(args.title), body: String(args.body) },
        );
        const discussion = created?.createDiscussion?.discussion;
        if (!discussion?.url) throw new Error('创建 Discussion 失败：未返回 URL');
        return { ok: true, repo: `${owner}/${repoName}`, category: chosen.name, url: discussion.url };
      } catch (err) {
        return { ok: false, message: '创建 Discussion 失败: ' + String(err?.message ?? err) };
      }
    },
  });

  disposers.push(
    ctx.tools.register(toolApi),
    ctx.tools.register(toolPushFiles),
    ctx.tools.register(toolGraphql),
    ctx.tools.register(toolCreateDiscussion),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}
