const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.children = []; this.value = ''; this.attrs = {}; }
  createEl(tag, opts = {}) { const el = new Element(); el.text = opts.text; Object.assign(el, opts.attr); this.children.push(el); return el; }
  createDiv(opts) { return this.createEl('div', opts); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  empty() { this.children = []; }
  toggleClass() {}
  scrollIntoView() {}
}
class TFile {
  constructor(path) { this.path = path; this.basename = path.split('/').pop().replace(/\.md$/, ''); this.extension = 'md'; }
}
const notices = [];
const obsidian = { ItemView: class {}, Plugin: class {}, PluginSettingTab: class {}, TFile, Notice: class { constructor(text) { notices.push(text); } } };
const context = { URL, module: { exports: {} }, exports: {}, require: () => obsidian, crypto: require('node:crypto').webcrypto };
vm.runInNewContext(fs.readFileSync('main.js', 'utf8') + '\nmodule.exports.TestView = StickyView;', context);
const View = context.module.exports.TestView;
function setup(files = [], editing = false) {
  const source = new TFile('Weekly/week.md');
  const all = [source, ...files.map(p => new TFile(p))];
  let content = editing ? '# Week\n- (x) Original @done(2026-11-09 12:00:00) <!-- bsn-id:test -->\n' : '# Week'; let created = 0; let refreshes = 0;
  const entry = { line: 1, id: 'test', kind: 'task', text: 'Original', done: true, doneDate: '2026-11-09 12:00:00', externalUrl: 'https://example.com' };
  const edits = [];
  const urlInput = new Element(); urlInput.value = entry.externalUrl;
  const app = { vault: {
    getMarkdownFiles: () => all,
    read: async () => content,
    getAbstractFileByPath: path => all.find(f => f.path === path),
    create: async path => { created++; const f = new TFile(path); all.push(f); return f; },
    process: async (file, fn) => { assert.equal(file, source); content = fn(content); },
  }, fileManager: {
    getNewFileParent: () => ({ path: 'Projects' }),
    generateMarkdownLink: f => `[[${f.path.replace(/\.md$/, '')}]]`,
  } };
  const plugin = { editEntry: async (file, original, value, url) => { assert.equal(file, source); assert.equal(original, entry); edits.push({ value, url, done: original.done, doneDate: original.doneDate }); }, resolveRelatedDocument: async title => all.find(f => f.basename.toLowerCase() === title.toLowerCase()), refreshAll: async () => { refreshes++; } };
  const view = new View({}, plugin); view.app = app;
  const root = new Element();
  if (editing) {
    const input = root.createEl('input'); input.value = entry.text;
    view.attachNoteSuggestions(root, source, input, { entry, urlInput });
  } else view.renderTaskInput(root, source);
  const [input, list] = root.children;
  const type = value => { input.value = value; input.oninput(); };
  const key = key => input.onkeydown({ key, preventDefault() {} });
  const click = text => { const row = list.children.find(r => r.text.includes(text)); assert.ok(row, text); row.onclick(); };
  return { input, list, type, key, click, all, edits, urlInput, setContent: value => { content = value; }, content: () => content, created: () => created, refreshes: () => refreshes };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  let s = setup(['Work/Project ABC.md', 'Personal/Project ABC.md']);
  for (const query of ['P', 'Pr', 'Pro', 'Project ABC']) { s.type(query); assert.equal(s.list.children.filter(r => r.text.includes(' — ')).length, 2); }
  assert.ok(!s.list.children.some(r => r.text.startsWith('Create note')));
  s.click('Work/Project ABC.md'); await settle();
  assert.equal(s.content(), '# Week\n- ( ) [[Work/Project ABC]]\n'); assert.equal(s.created(), 0);
  s = setup(); s.type('Project ABC'); s.key('Enter'); s.key('Enter'); await settle();
  assert.equal(s.created(), 1); assert.equal(s.content(), '# Week\n- ( ) [[Projects/Project ABC]]\n'); assert.equal(s.refreshes(), 1);
  s = setup(); s.type('- [ ] Project ABC'); s.click('Create note'); await settle();
  assert.ok(s.content().includes('- [ ] [[Projects/Project ABC]]'));
  s = setup(); s.type('Project ABC'); s.all.push(new TFile('Elsewhere/Project ABC.md')); s.click('Create note'); await settle();
  assert.equal(s.created(), 0); assert.ok(s.content().includes('[[Elsewhere/Project ABC]]'));
  s = setup(); s.type('Plain task'); s.key('ArrowDown'); s.key('Enter'); await settle();
  assert.equal(s.created(), 0); assert.ok(s.content().includes('- ( ) Plain task'));
  s = setup(); s.type('../bad'); assert.ok(!s.list.children.some(r => r.text.startsWith('Create note')));
  s.input.onblur(); assert.equal(s.content(), '# Week'); assert.equal(s.input.value, '../bad');
  s.type('Draft'); s.key('Escape'); assert.equal(s.list.children.length, 0); assert.equal(s.input.value, 'Draft');
  s = setup(['Projects/Project ABC.md'], true); s.type('Pro'); s.key('Enter'); await settle();
  assert.deepEqual(s.edits, [{ value: '[[Projects/Project ABC]]', url: 'https://example.com', done: true, doneDate: '2026-11-09 12:00:00' }]);
  assert.equal(s.created(), 0);
  s = setup([], true); s.type('New project'); s.click('Create note'); await settle();
  assert.equal(s.created(), 1); assert.equal(s.edits[0].value, '[[Projects/New project]]');
  s = setup([], true); s.type('Rename only'); s.click('Save text only'); await settle();
  assert.equal(s.created(), 0); assert.equal(s.edits[0].value, 'Rename only');
  s = setup([], true); s.type('Draft'); s.key('Escape'); assert.equal(s.edits.length, 0);
  assert.deepEqual(notices, []);
  s = setup([], true); s.urlInput.value = 'javascript:bad'; s.type('New project'); s.click('Create note'); await settle();
  assert.equal(s.created(), 0); assert.equal(s.edits.length, 0); assert.equal(s.input.value, 'New project');
  assert.match(notices.pop(), /https/);
  s = setup([], true); s.type('New project'); s.setContent('# Changed'); s.click('Create note'); await settle();
  assert.equal(s.created(), 0); assert.equal(s.edits.length, 0); assert.match(notices.pop(), /changed outside/);
  console.log('Edit checks passed: existing note, create note, plain text, completion and URL preservation, Escape, invalid URL, stale task.');
  console.log('Task input checks passed: search, duplicate titles, links, creation, concurrent submit, shorthand, creation race, plain task, invalid title, blur, Escape.');
})().catch(error => { console.error(error); process.exitCode = 1; });
