const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class TFile { constructor(path) { this.path = path; this.basename = 'week'; } }
const context = { module: { exports: {} }, require: () => ({ Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, TFile }) };
vm.runInNewContext(fs.readFileSync('main.js', 'utf8') + '\nmodule.exports.VaultNotes = VaultNotes; module.exports.parseLine = parseLine;', context);
const { default: Plugin, VaultNotes, parseLine } = context.module.exports;
(async () => {
  const storage = new Map([['Notes', { type: 'folder' }], ['Notes/.trash', { type: 'folder' }]]);
  const source = new TFile('Notes/Weekly/week.md');
  let content = '# Week\n- ( ) Keep me\n';
  let folderCreates = 0;
  const adapter = {
    stat: async path => storage.get(path) ?? null,
    mkdir: async path => { folderCreates++; storage.set(path, { type: 'folder' }); },
    write: async (path, text) => storage.set(path, { type: 'file', text }),
    read: async path => storage.get(path).text,
    remove: async path => storage.delete(path),
  };
  const app = { vault: { adapter,
    getAbstractFileByPath: path => path === source.path ? source : null,
    createFolder: async () => { throw new Error('Folder already exists'); },
    read: async file => { assert.equal(file, source); return content; },
    process: async (file, fn) => { assert.equal(file, source); content = fn(content); },
  } };
  const plugin = new Plugin(); plugin.app = app; plugin.settings = { folder: 'Notes' };
  plugin.notes = new VaultNotes(app, () => 'Notes');
  for (let i = 0; i < 2; i++) {
    await plugin.deleteEntry(source, parseLine(content.split('\n')[1], 1));
    assert.equal(content, '# Week\n');
    assert.ok(storage.get(plugin.lastTrashPath));
    await plugin.undoDelete();
    assert.equal(content, '# Week\n- ( ) Keep me\n');
    assert.equal(plugin.lastTrashPath, undefined);
  }
  assert.equal(folderCreates, 0);
  storage.delete('Notes/.trash');
  await plugin.notes.ensureFolder('Notes/.trash'); assert.equal(folderCreates, 1);
  storage.set('Notes/blocked', { type: 'file' });
  await assert.rejects(plugin.notes.ensureFolder('Notes/blocked'), /file blocks/);
  app.vault.createFolder = async path => { storage.set(path, { type: 'folder' }); throw new Error('Folder already exists'); };
  await plugin.notes.ensureFolder('Notes/Race');
  app.vault.createFolder = async () => { throw new Error('Permission denied'); };
  await assert.rejects(plugin.notes.ensureFolder('Notes/Denied'), /Permission denied/);
  console.log('Trash checks passed: hidden folder, repeated delete/undo, folder creation, file collision, creation race, permission failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
