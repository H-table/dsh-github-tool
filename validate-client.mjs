// Validate the __ModuleLoader__ protocol of dsh-github-tool/lib/client.js
import fs from 'node:fs';

const ReactMock = {
  createElement: (...args) => ({ kind: 'element', args }),
  useState: () => [null, () => {}],
  useEffect: () => {},
  useSyncExternalStore: () => null,
};

global.window = { __ModuleLoader__: { load: (p) => { global.__payload = p; } }, location: { reload: () => {} } };
global.require = (id) => {
  if (id === 'react') return ReactMock;
  throw new Error('unresolved require: ' + id);
};
const styleEl = { dataset: {}, textContent: '', remove: () => {} };
global.document = { createElement: () => styleEl, head: { appendChild: () => {} } };

const code = fs.readFileSync('E:/ProjectCode/DeepSeekHarnessWorkbook/dsh-github-tool/lib/client.js', 'utf8');
new Function('window', 'require', code)(global.window, global.require);
const payload = global.__payload;
if (!payload) { console.error('FAIL: no __ModuleLoader__.load'); process.exit(1); }
console.log('registered id:', payload.id);
const mod = payload.factory(global.require);
console.log('inject:', JSON.stringify(mod.inject), '| apply:', typeof mod.apply);

const calls = [];
const routeSnapshot = {
  writable: true,
  settings: {
    value: {
      apiBase: 'https://api.github.com',
      username: 'octocat',
      defaultRepo: 'hello-world',
      defaultBranch: 'main',
      proxy: '',
      credential: 'GITHUB_TOKEN',
      defaultCommitMessage: 'chore: update via DSH',
    },
    revision: 1,
    base: {},
    user: {},
  },
  credential: { ref: 'GITHUB_TOKEN', configured: true, source: undefined, writable: true },
};
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, value: routeSnapshot }),
});
const mockCtx = {
  effect: (fn, label) => { const d = fn(); calls.push('effect:' + label + ':' + typeof d); },
  get: (name) => name === 'connection'
    ? { api: { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: { GITHUB_TOKEN: { configured: true, writable: true } } } } }),
        set: async () => {},
      } } }
    : undefined,
  slots: {
    inject: (name, cb) => { calls.push('inject:' + name); cb(); },
    register: (...args) => { calls.push('register:' + args[0].name + '#id=' + args[0].id); return () => {}; },
  },
};
mod.apply(mockCtx);
console.log('apply calls:', calls.join(' | '));
console.log('DONE');
