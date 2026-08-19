/**
 * @local/dsh-github-tool — browser half.
 *
 * Registers ONE plugin-configuration card under Settings > Plugins > 插件配置
 * (the `settings.plugin.item` slot), reproducing the official dsh plugin-card
 * UI exactly: a collapsible card whose staged form writes the `github-tool`
 * settings namespace through the plugin's own loopback settings route (the
 * settings wire only serves a hardcoded namespace allowlist, so third-party
 * namespaces must use their own route; revision-fenced field writes/clears
 * mirror the official settings.mutate semantics), with a write-only Token
 * control addressed through the credentials domain. The settings page section
 * is intentionally NOT registered — like the official bash / agent-loop /
 * web-search cards, this plugin configures itself only from the plugin
 * configuration page.
 */
window.__ModuleLoader__.load({ id: "@local/dsh-github-tool", factory: (require) => {
var __modules = Object.create(null); var __cache = Object.create(null);
__modules["./index.js"] = function(module, exports, require, __load_) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.apply = void 0;
const React = require("react");

exports.inject = ['slots', 'connection'];

const ROUTE = '/_dsh/github-tool/settings';
const DEFAULT_CREDENTIAL_REF = 'GITHUB_TOKEN';

/**
 * One call to the plugin's own settings route. The settings wire
 * (`settings.describe` in dsh-host-apiproxy) only serves a hardcoded
 * allowlist of namespaces, so a third-party namespace is never exposed to the
 * Web client; this loopback route is the plugin-owned equivalent — same
 * layered value, same revision fencing, same field-level mutate ops.
 */
async function requestRoute(payload) {
  const init = payload === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
  const response = await fetch(ROUTE, { credentials: 'same-origin', ...init });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body?.error?.message ?? `request failed with HTTP ${response.status}`);
  }
  return body.value;
}

/** SettingsScope-compatible adapter over the plugin's own settings route. */
function createRouteScope(route) {
  let snapshot = {
    status: 'loading',
    writable: false,
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    mode: 'host',
  };
  const listeners = new Set();
  function notify() {
    for (const listener of listeners) listener();
  }
  function accept(value) {
    snapshot = {
      status: 'ready',
      writable: value.writable === true,
      value: value.settings?.value ?? {},
      base: value.settings?.base ?? {},
      user: value.settings?.user ?? {},
      revision: value.settings?.revision,
      mode: 'host',
    };
    notify();
  }
  async function load() {
    try {
      accept(await route(undefined));
    } catch (err) {
      snapshot = { ...snapshot, status: 'unavailable' };
      notify();
    }
  }
  async function mutate(ops) {
    const revision = snapshot.revision;
    try {
      accept(await route({
        action: 'mutate',
        ops,
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      }));
    } catch (err) {
      await load();
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (field, value) => mutate([{ op: 'set', path: [field], value }]),
    unset: (field) => mutate([{ op: 'unset', path: [field] }]),
    load,
  };
}

/* Official plugin-card chrome + staged-field styles (same tokens/values as the
 * shipped dsh-client-ui-settings-plugins cards; prefixed to stay collision-free). */
const CSS = '.pcc-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}' +
  '.pcc-field+.pcc-field{border-top:1px solid var(--dsw-alias-border-l2)}' +
  '.pcc-head{align-items:center;gap:8px;display:flex}' +
  '.pcc-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}' +
  '.pcc-badges{align-items:center;gap:8px;display:inline-flex}' +
  '.pcc-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}' +
  '.pcc-badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}' +
  '.pcc-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}' +
  '.pcc-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}' +
  '.pcc-reset:disabled{cursor:default}' +
  '.pcc-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}' +
  '.pcc-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}' +
  '.pcc-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}' +
  '.pcc-inputInvalid{border-color:var(--dsw-alias-label-error)}' +
  '.pcc-invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}' +
  '.pcc-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}' +
  '.pcc-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}' +
  '.pcc-card:hover{border-color:var(--dsw-alias-label-dimmed)}' +
  '.pcc-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
  '.pcc-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
  '.pcc-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}' +
  '.pcc-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
  '.pcc-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
  '.pcc-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}' +
  '.pcc-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}' +
  '.pcc-chevronOpen{transform:rotate(180deg)}' +
  '.pcc-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}' +
  '.pcc-readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}' +
  '.pcc-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}' +
  '.pcc-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}' +
  '.pcc-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}' +
  '.pcc-discard,.pcc-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}' +
  '.pcc-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}' +
  '.pcc-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}' +
  '.pcc-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}' +
  '.pcc-discard:disabled,.pcc-save:disabled{opacity:.4;cursor:default}' +
  '.pcc-discard:focus-visible,.pcc-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}';

function installStyles() {
  const style = document.createElement('style');
  style.dataset.pluginCss = 'dsh-github-tool';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => { style.remove(); };
}

/* ---- staged-field specs (official card-form semantics) ---- */

/** A free-text field: an empty draft clears the field. */
function textField(field) {
  return {
    field,
    format: (value) => typeof value === 'string' ? value : '',
    parse: (text) => {
      const trimmed = text.trim();
      return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed };
    },
  };
}

/* ---- staged form model (mirror of the official CardForm) ---- */

/**
 * Stages one card's edits over one settings namespace and writes them on save.
 * Writes go through the bound scope, so each is a durable, revision-fenced
 * document mutation; the outcome is read back from the scope rather than
 * predicted. A save that did not land keeps its drafts.
 */
function createForm(scope, specs, secrets) {
  const specMap = new Map(specs.map((spec) => [spec.field, spec]));
  const secretMap = new Map(secrets.map((spec) => [spec.field, spec]));
  const staged = new Map();
  const listeners = new Set();
  let saving = false;
  let failed = false;

  const snapshotOf = () => scope.getSnapshot();
  const sectionValue = (field) => snapshotOf().value?.[field];
  const baseValue = (field) => snapshotOf().base?.[field];
  const userLayer = () => snapshotOf().user;
  const stored = (field) => {
    const user = userLayer();
    return user !== undefined && Object.hasOwn(user, field);
  };
  const specOf = (field) => {
    const spec = specMap.get(field);
    if (spec === undefined) throw new Error('plugin card has no field ' + field);
    return spec;
  };

  function publish() {
    for (const listener of listeners) listener();
  }

  /** Every staged edit a save would write, in staging order. */
  function plan() {
    const plan = [];
    for (const [field, edit] of staged) {
      const secret = secretMap.get(field);
      if (secret !== undefined) {
        const value = edit.text.trim();
        if (value !== '') plan.push({ field, run: () => secret.write(value) });
        continue;
      }
      const spec = specOf(field);
      if (edit.clear) {
        if (stored(field)) plan.push({ field, run: () => clearField(field) });
        continue;
      }
      if (edit.text === spec.format(sectionValue(field))) continue;
      const write = spec.parse(edit.text);
      if (write === undefined) plan.push({ field, run: undefined });
      else if (write.kind === 'clear') plan.push({ field, run: () => clearField(field) });
      else plan.push({ field, run: () => storeField(field, write.value) });
    }
    return plan;
  }

  function shell() {
    const snapshot = snapshotOf();
    const planned = plan();
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: planned.length > 0,
      invalid: planned.some((item) => item.run === undefined),
      saving,
      failed,
    };
  }

  function field(field) {
    const edit = staged.get(field);
    if (secretMap.has(field)) {
      return { text: edit?.text ?? '', overridden: false, invalid: false };
    }
    const spec = specOf(field);
    if (edit === undefined) {
      return { text: spec.format(sectionValue(field)), overridden: stored(field), invalid: false };
    }
    const write = edit.clear ? { kind: 'clear' } : spec.parse(edit.text);
    return {
      text: edit.text,
      overridden: write?.kind === 'set',
      invalid: write === undefined,
    };
  }

  function stage(field, edit) {
    staged.set(field, edit);
    failed = false;
    publish();
  }

  async function clearField(field) {
    await scope.unset(field);
    return !stored(field);
  }

  async function storeField(field, value) {
    await scope.set(field, value);
    return userLayer()?.[field] === value;
  }

  async function save() {
    const planned = plan();
    const writes = planned.flatMap((item) => item.run === undefined ? [] : [item.run]);
    if (planned.length === 0 || saving || writes.length !== planned.length) return;
    saving = true;
    failed = false;
    publish();
    let landed = true;
    for (const write of writes) landed = await write() && landed;
    if (landed) staged.clear();
    saving = false;
    failed = !landed;
    publish();
  }

  scope.subscribe(() => publish());

  return {
    shell,
    field,
    actions: () => ({
      edit: (field, text) => stage(field, { text, clear: false }),
      resetField: (field) => stage(field, { text: specOf(field).format(baseValue(field)), clear: true }),
      save,
      discard: () => {
        if (staged.size === 0 && !failed) return;
        staged.clear();
        failed = false;
        publish();
      },
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/* ---- official card chrome ---- */

/* The official dsh chevron-down icon (ic_ds_chevron_down_outline_14), inlined
 * so the card header renders pixel-identically to the shipped plugin cards. */
function ChevronDown(props) {
  return React.createElement('svg', {
    width: 14,
    height: 14,
    className: props.className,
    viewBox: '0 0 14 14',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  }, React.createElement('path', {
    d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
    fill: 'currentColor',
  }));
}

function PluginCard(props) {
  const [open, setOpen] = React.useState(false);
  const { state } = props;
  if (!state.available) return null;
  const blocked = !state.dirty || state.invalid || state.saving;
  return React.createElement('li', { className: 'pcc-card' + (open ? ' pcc-cardOpen' : '') },
    React.createElement('button', {
      type: 'button',
      className: 'pcc-header',
      'aria-expanded': open,
      'aria-label': (open ? '收起设置' : '展开设置') + '：' + props.title,
      onClick: () => setOpen(!open),
    },
      React.createElement('span', { className: 'pcc-headText' },
        React.createElement('span', { className: 'pcc-name' }, props.title),
        React.createElement('span', { className: 'pcc-description' }, props.description)),
      state.dirty ? React.createElement('span', { className: 'pcc-pending' }, '未保存') : null,
      React.createElement(ChevronDown, { className: 'pcc-chevron' + (open ? ' pcc-chevronOpen' : '') })),
    open ? React.createElement('div', { className: 'pcc-body' },
      !state.writable ? React.createElement('p', { className: 'pcc-readOnly', role: 'status' }, '本部署的设置为只读。') : null,
      props.children,
      React.createElement('div', { className: 'pcc-footer' },
        state.failed ? React.createElement('p', { className: 'pcc-failed', role: 'status' }, '本部署没有接受这些值，已保留供你修改。') : null,
        React.createElement('button', { type: 'button', className: 'pcc-discard', disabled: !state.dirty || state.saving, onClick: props.onDiscard }, '放弃修改'),
        React.createElement('button', { type: 'button', className: 'pcc-save', disabled: blocked, onClick: props.onSave }, state.saving ? '保存中…' : '保存'))) : null);
}

/** A staged text/number field with the override badge and reset (official fields style). */
function ValueField(props) {
  return React.createElement('div', { className: 'pcc-field' },
    React.createElement('div', { className: 'pcc-head' },
      React.createElement('label', { className: 'pcc-label', htmlFor: props.id }, props.label),
      props.overridden ? React.createElement('span', { className: 'pcc-badges' },
        React.createElement('span', { className: 'pcc-badge' }, props.overriddenLabel),
        React.createElement('button', { type: 'button', className: 'pcc-reset', disabled: props.disabled, onClick: props.onReset }, props.resetLabel)) : null),
    React.createElement('input', {
      id: props.id,
      className: props.invalid ? 'pcc-input pcc-inputInvalid' : 'pcc-input',
      type: 'text',
      ...(props.numeric === true ? { inputMode: 'numeric' } : {}),
      ...(props.invalid ? { 'aria-invalid': true } : {}),
      value: props.text,
      placeholder: props.placeholder ?? '',
      disabled: props.disabled,
      onChange: (event) => props.onEdit(event.target.value),
    }),
    React.createElement('p', { className: props.invalid ? 'pcc-invalid' : 'pcc-hint' },
      props.invalid ? props.invalidLabel : props.hint));
}

/** A write-only credential control: never echoes the value, blank draft writes nothing. */
function SecretField(props) {
  return React.createElement('div', { className: 'pcc-field' },
    React.createElement('div', { className: 'pcc-head' },
      React.createElement('label', { className: 'pcc-label', htmlFor: props.id }, props.label),
      React.createElement('span', { className: 'pcc-badges' },
        React.createElement('span', { className: props.configured ? 'pcc-badge' : 'pcc-badgeMuted' }, props.stateLabel))),
    React.createElement('input', {
      id: props.id,
      className: 'pcc-input',
      type: 'password',
      autoComplete: 'off',
      value: props.text,
      disabled: props.disabled,
      onChange: (event) => props.onEdit(event.target.value),
    }),
    React.createElement('p', { className: 'pcc-hint' }, props.hint));
}

/* ---- card controller over the `github-tool` namespace + credentials domain ---- */

function GithubCardController(ctx) {
  const scope = createRouteScope((payload) => requestRoute(payload));
  const api = ctx.get('connection')?.api;
  const credential = { ref: DEFAULT_CREDENTIAL_REF, configured: false, writable: true };
  const form = createForm(scope, [
    textField('apiBase'),
    textField('username'),
    textField('defaultRepo'),
    textField('defaultBranch'),
    textField('proxy'),
    textField('credential'),
    textField('defaultCommitMessage'),
  ], [{
    field: 'token',
    write: (text) => writeToken(text),
  }]);
  const actions = form.actions();
  const listeners = new Set();
  let state = null;

  function refOf() {
    const declared = scope.getSnapshot().value?.credential;
    return typeof declared === 'string' && declared.length > 0 ? declared : DEFAULT_CREDENTIAL_REF;
  }

  function publish() {
    state = project();
    for (const listener of listeners) listener();
  }

  function project() {
    return {
      ...form.shell(),
      apiBase: form.field('apiBase'),
      username: form.field('username'),
      defaultRepo: form.field('defaultRepo'),
      defaultBranch: form.field('defaultBranch'),
      proxy: form.field('proxy'),
      credential: form.field('credential'),
      defaultCommitMessage: form.field('defaultCommitMessage'),
      token: form.field('token'),
      tokenConfigured: credential.configured,
      tokenWritable: credential.writable,
    };
  }

  /** Ask the credentials domain about the reference the section currently names. */
  async function readCredential() {
    if (api === undefined) return;
    const ref = refOf();
    if (ref !== credential.ref) {
      credential.ref = ref;
      credential.configured = false;
      credential.writable = true;
      publish();
    }
    let response;
    try {
      response = await api.credentials.describe({ refs: [ref] });
    } catch (err) {
      return;
    }
    if (!response?.result?.ok || ref !== refOf()) return;
    const view = response.result.value?.credentials?.[ref];
    const next = { ref, configured: view?.configured ?? false, writable: view?.writable ?? true };
    if (next.configured === credential.configured && next.writable === credential.writable) return;
    credential.ref = next.ref;
    credential.configured = next.configured;
    credential.writable = next.writable;
    publish();
  }

  /** Write the staged key, then re-read whether the Host now holds one. */
  async function writeToken(value) {
    if (api === undefined) return false;
    try {
      await api.credentials.set({ ref: refOf(), value });
    } catch (err) {
      // fall through: read back what the Host actually holds
    }
    await readCredential();
    return credential.configured;
  }

  form.subscribe(publish);
  scope.subscribe(() => { void readCredential(); });
  publish();
  void scope.load();
  void readCredential();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
    credentialRef: () => credential.ref,
    refresh: () => { void scope.load(); },
    refreshCredential: () => { void readCredential(); },
    edit: actions.edit,
    resetField: actions.resetField,
    save: actions.save,
    discard: actions.discard,
  };
}

function GithubCard(props) {
  const controller = props.controller;
  const state = React.useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const disabled = !state.writable;
  const field = (key, label, hint, extra = {}) => React.createElement(ValueField, {
    id: 'plugin-config-github-' + key,
    label,
    hint,
    overriddenLabel: '已覆盖',
    resetLabel: '恢复默认',
    invalidLabel: '请输入有效值，或留空使用默认值。',
    disabled,
    ...state[key],
    onEdit: (text) => controller.edit(key, text),
    onReset: () => controller.resetField(key),
    ...extra,
  });
  return React.createElement(PluginCard, {
    title: 'GitHub 接入',
    description: '配置 GitHub API 连接、默认仓库与凭据。',
    state,
    onSave: controller.save,
    onDiscard: controller.discard,
  },
    React.createElement(SecretField, {
      id: 'plugin-config-github-token',
      label: 'GitHub Token',
      hint: '不写入设置文件；留空表示保持当前密钥。',
      disabled: !state.tokenWritable,
      text: state.token.text,
      configured: state.tokenConfigured,
      stateLabel: state.tokenConfigured ? '已配置密钥。' : '未配置密钥。',
      onEdit: (text) => controller.edit('token', text),
    }),
    field('apiBase', 'API 地址 (apiBase)', 'GitHub API 地址，一般无需修改。'),
    field('username', '用户名 (username)', '未传 repo 参数时使用的仓库属主。'),
    field('defaultRepo', '默认仓库 (defaultRepo)', '未传 repo 参数时使用的默认仓库。'),
    field('defaultBranch', '默认分支 (defaultBranch)', '未显式指定分支时使用。'),
    field('proxy', '代理 (proxy，可选)', 'HTTP(S) 代理，如 127.0.0.1:7897；留空表示直连。'),
    field('credential', '凭据名称 (credential)', 'Token 在凭据系统中存储使用的引用名称。'),
    field('defaultCommitMessage', '默认提交信息 (defaultCommitMessage)', '未显式传提交信息时使用。'));
}

exports.apply = function(ctx) {
  ctx.effect(installStyles, 'dsh-github-tool: styles');
  const controller = new GithubCardController(ctx);
  const remote = ctx.get('remote');
  if (remote !== undefined && typeof remote.$on === 'function') {
    ctx.effect(() => remote.$on('settings/document-updated', (namespace) => {
      if (namespace === undefined || String(namespace) === 'github-tool') controller.refresh();
    }), 'dsh-github-tool: settings invalidations');
    ctx.effect(() => remote.$on('credentials/updated', (ref) => {
      if (String(ref) === controller.credentialRef()) controller.refreshCredential();
    }), 'dsh-github-tool: credential invalidations');
  }
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'github-tool',
    id: 'github-tool',
    order: 30,
    inject: () => ({ controller }),
  }, GithubCard));
};
};
function __resolve(from, request) {
  if (!request.startsWith(".")) return request;
  var parts = from.slice(2).split("/"); parts.pop();
  for (var part of request.split("/")) { if (part === "." || part === "") continue; if (part === "..") parts.pop(); else parts.push(part); }
  return "./" + parts.join("/");
}
function __load(id) {
  if (__modules[id] === undefined) return require(id);
  if (__cache[id] !== undefined) return __cache[id].exports;
  var module = __cache[id] = { exports: {} };
  __modules[id](module, module.exports, require, function(request) { var resolved = __resolve(id, request); return __modules[resolved] === undefined ? require(request) : __load(resolved); });
  return module.exports;
}
return __load("./index.js"); } });
