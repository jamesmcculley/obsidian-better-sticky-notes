const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class TFile { constructor(path) { this.path = path; this.basename = path.split('/').pop().replace(/\.md$/, ''); this.extension = 'md'; this.stat = { ctime: Date.now() }; } }
const context = { crypto: require('node:crypto').webcrypto, module: { exports: {} }, require: () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, TFile }) };
vm.runInNewContext(fs.readFileSync('main.js', 'utf8') + '\nmodule.exports.VaultNotes = VaultNotes;', context);
(async () => {
  const target = new TFile('Project.md'); const source = new TFile('Weekly/week.md');
  const fm = { custom: 'preserved' };
  const notes = new context.module.exports.VaultNotes({
    fileManager: { processFrontMatter: async (file, fn) => { assert.equal(file, target); fn(fm); } },
    vault: { getAbstractFileByPath: path => path === target.path ? target : null },
  }, () => '');
  const entry = (id, done, stamp) => ({ id, text: '[[Project]]', done, doneDate: stamp, metadata: { created: '2026-11-01 00:00:00', start: '2026-11-01 00:00:00', last_modified: '2026-11-09 12:00:00', week_of: '[[Weekly/week]]' } });
  await notes.syncRelatedTask(target, source, entry('one', true, '2026-11-09 12:34:56'));
  assert.equal(fm.done, '2026-11-09 12:34:56');
  assert.equal(fm.bsn_related_tasks[0].done, fm.done);
  delete fm.done; // Existing metadata is backfilled even when the nested record is unchanged.
  await notes.syncRelatedTask(target, source, entry('one', true, '2026-11-09 12:34:56'));
  assert.equal(fm.done, '2026-11-09 12:34:56');
  await notes.syncRelatedTask(target, source, entry('two', true, '2026-11-10 10:00:00'));
  assert.equal(fm.done, '2026-11-10 10:00:00');
  await notes.syncRelatedTask(target, source, entry('two', false));
  assert.equal(fm.done, '2026-11-09 12:34:56');
  await notes.removeRelatedTask(target.path, 'one', source.path);
  assert.ok(!('done' in fm));
  await notes.syncRelatedTask(target, source, entry('two', true, '2026-11-11'));
  assert.equal(fm.done, '2026-11-11 00:00:00');
  await notes.syncRelatedTask(target, source, entry('two', false));
  assert.ok(!('done' in fm)); assert.equal(fm.custom, 'preserved');
  // Exercise the real completion action without a view refresh. Model a metadata
  // cache that only accepts decoded destinations, as Obsidian's resolver expects.
  for (const text of ['[[Project ABC]]', '[Project ABC](Project%20ABC.md)', '[Project ABC](<Project ABC.md>)']) {
    const taskNote = new TFile('Project ABC.md');
    const weekly = new TFile('Weekly/2026-11-09.md');
    const log = new TFile('Logbook/Logbook.md');
    const files = [taskNote, weekly, log];
    const contents = new Map([[taskNote, '# Project ABC\n'], [weekly, `# Week\n- ( ) ${text} <!-- bsn-id:test -->\n`], [log, '# Logbook\n']]);
    const frontmatter = new Map(files.map(f => [f, {}]));
    const app = {
      vault: {
        read: async file => contents.get(file),
        process: async (file, fn) => contents.set(file, fn(contents.get(file))),
        append: async (file, value) => contents.set(file, contents.get(file) + value),
        getMarkdownFiles: () => files,
        getAbstractFileByPath: path => files.find(f => f.path === path),
        adapter: { stat: async () => ({ type: 'folder' }) },
      },
      fileManager: { processFrontMatter: async (file, fn) => fn(frontmatter.get(file)) },
      metadataCache: {
        getFirstLinkpathDest: path => files.find(f => f.path === path || f.basename === path) ?? null,
        getFileCache: file => ({ frontmatter: frontmatter.get(file) }),
      },
    };
    const plugin = new context.module.exports.default(); plugin.app = app;
    plugin.notes = new context.module.exports.VaultNotes(app, () => '');
    // Use a root that makes this source a weekly note, without leading slash paths.
    plugin.notes.isWeeklyNote = file => file === weekly;
    plugin.notes.getLogbook = async () => log;
    let current = (await plugin.notes.entries(weekly))[0];
    await plugin.complete(weekly, current);
    const stamp = contents.get(weekly).match(/@done\(([^)]+)\)/)[1];
    assert.equal(frontmatter.get(taskNote).done, stamp, text);
    assert.equal(frontmatter.get(weekly).bsn_tasks[0].done, stamp);
    current = (await plugin.notes.entries(weekly))[0];
    await plugin.complete(weekly, current);
    assert.ok(!('done' in frontmatter.get(taskNote)), text);
    assert.ok(!contents.get(log).includes('@done('));
  }
  console.log('Completion action checks passed without render: wikilinks, encoded Markdown links, angle-bracket destinations, and reopening.');
  console.log('Done frontmatter checks passed: completion, backfill, multiple tasks, reopen, unlink, legacy dates, unrelated properties.');
})().catch(error => { console.error(error); process.exitCode = 1; });
