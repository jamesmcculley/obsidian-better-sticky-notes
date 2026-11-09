const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class TFile { constructor(path) { this.path = path; this.stat = { ctime: Date.now() }; } }
const context = { module: { exports: {} }, require: () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, TFile }) };
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
  console.log('Done frontmatter checks passed: completion, backfill, multiple tasks, reopen, unlink, legacy dates, unrelated properties.');
})().catch(error => { console.error(error); process.exitCode = 1; });
