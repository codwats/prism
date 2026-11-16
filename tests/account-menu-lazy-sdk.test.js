import test from 'node:test';
import assert from 'node:assert/strict';

// The account menu sits in the header of every page. An anonymous visitor must
// be able to open it without loading the Supabase SDK: only Log in may load it
// (ensureAuthReady). Drives the real initLayout() against a minimal fake DOM.

class FakeEl {
  constructor(tag, attrs = {}) {
    this.localName = tag;
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.id = attrs.id || '';
    this.style = { setProperty() {} };
    this.classList = { add() {}, toggle() {} };
    this.hidden = 'hidden' in attrs;
    this.listeners = {};
    this.children = [];
    this.firstChild = null;
  }
  get src() { return this.attrs.src || ''; }
  set src(v) { this.attrs.src = v; }
  set innerHTML(html) {
    // Register every tag carrying an id or data-auth, which is all the code under test looks up.
    for (const [, tag, rest] of html.matchAll(/<([a-z][a-z-]*)\b([^>]*)>/g)) {
      const attrs = Object.fromEntries([...rest.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? '']));
      if (attrs.id || attrs['data-auth']) dom.all.push(new FakeEl(tag, attrs));
    }
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  removeEventListener() {}
  dispatch(type, extra = {}) {
    for (const cb of this.listeners[type] || []) cb({ type, target: this, preventDefault() {}, ...extra });
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild(c) { this.children.push(c); return c; }
  insertBefore(c) { return this.appendChild(c); }
  after() {}
  remove() {}
}

const dom = { all: [] };

function installDom({ storedSession }) {
  dom.all = [];
  const head = new FakeEl('head');
  head.querySelector = (sel) => (sel.includes('supabase') ? head.children.find((c) => c.src.includes('supabase')) || null : null);
  const waPage = new FakeEl('wa-page');
  globalThis.document = {
    head,
    body: new FakeEl('body'),
    documentElement: new FakeEl('html'),
    querySelector: (sel) => (sel === 'wa-page' ? waPage : null),
    querySelectorAll: (sel) => {
      const auth = sel.match(/^\[data-auth="([^"]+)"\]$/)?.[1];
      return auth ? dom.all.filter((el) => el.attrs['data-auth'] === auth) : [];
    },
    getElementById: (id) => dom.all.find((el) => el.id === id) || null,
    createElement: (tag) => new FakeEl(tag),
    addEventListener() {},
  };
  const store = new Map(storedSession ? [['sb-clqxysoimlsjfmnjbxsa-auth-token', '{"access_token":"x"}']] : []);
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window = {
    location: { hash: '', pathname: '/index.html', origin: 'http://localhost', reload() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {},
    dispatchEvent() {},
    localStorage: globalThis.localStorage,
  };
  globalThis.location = globalThis.window.location;
  return head;
}

const sdkTags = (head) => head.children.filter((c) => c.src.includes('supabase')).length;

test('anonymous visitor: page load and opening the account menu never load the SDK; Log in does', async () => {
  const head = installDom({ storedSession: false });
  const { initLayout } = await import('../js/layout.js');
  initLayout({ activePage: 'home' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sdkTags(head), 0, 'page load must not inject the SDK');

  const menu = document.getElementById('account-menu');
  assert.ok(menu, 'the header carries the account menu');
  document.getElementById('btn-account').dispatch('click');
  menu.dispatch('wa-show');
  document.getElementById('btn-settings').dispatch('click');
  assert.equal(sdkTags(head), 0, 'opening the menu or Settings must not inject the SDK');

  // Anonymous: auth paints at once, so the menu shows Log in and drops the skeleton.
  const shown = (state) => {
    const els = document.querySelectorAll(`[data-auth="${state}"]`);
    assert.ok(els.length, `menu has ${state} items`);
    return els.every((el) => el.style.display === '');
  };
  assert.ok(shown('logged-out'), 'Log in is shown');
  assert.equal(document.getElementById('auth-loading').style.display, 'none', 'skeleton hidden by updateAuthUI');
  assert.ok(!shown('logged-in'), 'logged-in items stay hidden');

  document.getElementById('btn-login').dispatch('click');
  assert.equal(sdkTags(head), 1, 'Log in loads the SDK on demand');
});

test('keyboard-chosen menu items replay a click; pointer, link and checkbox choices do not', async () => {
  const { clickItemsOnKeyboardSelect } = await import('../js/core/utils.js');
  const listeners = {};
  const dropdown = { addEventListener: (type, cb) => { (listeners[type] ||= []).push(cb); } };
  clickItemsOnKeyboardSelect(dropdown);
  const fire = (type, e) => listeners[type].forEach((cb) => cb(e));
  const clicks = [];
  const item = (props) => {
    const el = { localName: 'wa-dropdown-item', ...props, closest: () => el };
    el.click = () => { clicks.push(el.name); fire('click', { target: el }); fire('wa-select', { detail: { item: el } }); };
    return el;
  };

  const plain = item({ name: 'plain' });
  fire('wa-select', { detail: { item: plain } }); // keyboard
  assert.deepEqual(clicks, ['plain']);

  fire('click', { target: plain }); // pointer
  fire('wa-select', { detail: { item: plain } });
  assert.deepEqual(clicks, ['plain']);

  fire('wa-select', { detail: { item: item({ name: 'link', href: 'profile.html' }) } });
  fire('wa-select', { detail: { item: item({ name: 'box', type: 'checkbox' }) } });
  assert.deepEqual(clicks, ['plain']);
});
