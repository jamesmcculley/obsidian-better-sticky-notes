/* Better Sticky Notes for Obsidian */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BetterStickyNotes
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE = "better-sticky-notes-view";
var DEFAULT_ROOT = "Better Sticky Notes";
var DEFAULT_SETTINGS = { folder: DEFAULT_ROOT };
function localStamp(date = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function dayId(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function monday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
}
function noteTitle(period, date) {
  if (period === "weekly") return `Week of ${date.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" })}`;
  return date.toLocaleDateString(void 0, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function parseLine(raw, line) {
  let m = raw.match(/^\s*- \[([ xX])\]\s+(.*)$/);
  if (m) return entryFromMatch(m[2], line, "check", m[1].toLowerCase() === "x");
  m = raw.match(/^\s*- \(([ xX])\)\s+(.*)$/);
  if (m) return entryFromMatch(m[2], line, "task", m[1].toLowerCase() === "x");
  m = raw.match(/^\s*- (?!\[|\()(.*)$/);
  if (m) return { line, kind: "bullet", text: m[1], done: false };
  return null;
}
function entryFromMatch(value, line, kind, done) {
  const dm = value.match(/\s+@done\((\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?)\)\s*$/);
  return { line, kind, text: value.replace(/\s+@done\([^)]*\)\s*$/, ""), done, doneDate: dm == null ? void 0 : dm[1] };
}
function encodeEntry(entry, text, done, stamp) {
  const marker = entry.kind === "check" ? done ? "- [x] " : "- [ ] " : entry.kind === "task" ? done ? "- (x) " : "- ( ) " : "- ";
  return marker + text + (done && stamp ? ` @done(${stamp})` : "");
}
function displayEntryText(text) {
  return text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
function safeFolder(value) {
  const parts = value.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".." || part.startsWith("."))) throw new Error("Choose a visible folder path inside the vault.");
  return parts.join("/");
}
var VaultNotes = class {
  constructor(app, getRoot) {
    this.app = app;
    this.getRoot = getRoot;
  }
  path(stack, id) {
    return `${this.getRoot()}/${stack}/${id}`;
  }
  async ensureFolder(path) {
    let built = "";
    for (const part of path.split("/")) {
      built = built ? `${built}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(built)) await this.app.vault.createFolder(built);
    }
  }
  async ensureNote(period, date) {
    const start = period === "weekly" ? monday(date) : date;
    const stack = period === "weekly" ? "Weekly" : "Daily";
    const id = `${dayId(start)}.md`;
    const path = this.path(stack, id);
    await this.ensureFolder(`${this.getRoot()}/${stack}`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) return existing;
    return this.app.vault.create(path, `# ${noteTitle(period, start)}
`);
  }
  async getLogbook() {
    const path = this.path("Logbook", "Logbook.md");
    await this.ensureFolder(`${this.getRoot()}/Logbook`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) return existing;
    return this.app.vault.create(path, "# Logbook\n");
  }
  async entries(file) {
    const data = await this.app.vault.read(file);
    return data.split("\n").map((line, i) => parseLine(line, i)).filter((x) => x !== null);
  }
  async title(file) {
    var _a, _b;
    const heading = (_b = (_a = (await this.app.vault.read(file)).match(/^#\s+(.+)$/m)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
    return heading || file.basename;
  }
  async updateLine(file, entry, update) {
    await this.app.vault.process(file, (data) => {
      const lines = data.split("\n");
      const current = lines[entry.line];
      if (current === void 0 || !sameEntry(parseLine(current, entry.line), entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
      lines[entry.line] = update(current);
      return lines.join("\n");
    });
  }
};
function sameEntry(current, expected) {
  return !!current && current.kind === expected.kind && current.text === expected.text && current.done === expected.done && current.doneDate === expected.doneDate;
}
var BetterStickyNotes = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.period = "weekly";
    this.viewingDate = /* @__PURE__ */ new Date();
    this.logbook = false;
  }
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
    try {
      this.settings.folder = safeFolder(this.settings.folder);
    } catch (e) {
      this.settings.folder = DEFAULT_ROOT;
    }
    this.notes = new VaultNotes(this.app, () => this.settings.folder);
    this.registerView(VIEW_TYPE, (leaf) => new StickyView(leaf, this));
    this.addRibbonIcon("checkbox-glyph", "Open Better Sticky Notes", () => void this.activateView());
    this.addCommand({ id: "open-sticky-notes", name: "Open sticky notes", callback: () => void this.activateView() });
    this.addSettingTab(new StickySettings(this.app, this));
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }
  async activateView(popout = false) {
    const existing = popout ? void 0 : this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    let leaf;
    if (existing) leaf = existing;
    else if (popout && import_obsidian.Platform.isDesktopApp) leaf = this.app.workspace.getLeaf("window");
    else leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  async persist() {
    await this.saveData(this.settings);
  }
  async switchCollection(folder) {
    this.settings.folder = safeFolder(folder);
    await this.persist();
    await this.refreshAll();
  }
  async refreshAll() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof StickyView) await view.render();
    }
  }
  async run(action) {
    try {
      await action();
      await this.refreshAll();
    } catch (error) {
      new import_obsidian.Notice(error instanceof Error ? error.message : "Could not update the note.");
    }
  }
  async openRelatedDocument(text, sourcePath) {
    var _a, _b;
    const wiki = text.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/);
    const markdown = text.match(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/);
    const target = ((_b = (_a = wiki == null ? void 0 : wiki[1]) != null ? _a : markdown == null ? void 0 : markdown[1]) != null ? _b : text).trim();
    if (!target || /^[a-z][a-z\d+.-]*:\/\//i.test(target)) return false;
    const normalize = (value) => value.replace(/\\/g, "/").replace(/\.md$/i, "").trim().toLocaleLowerCase();
    let destination = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
    if (!destination) {
      const wanted = normalize(target);
      const matches = this.app.vault.getMarkdownFiles().filter((file) => {
        var _a2;
        if (normalize(file.path) === wanted || normalize(file.basename) === wanted) return true;
        const frontmatter = (_a2 = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a2.frontmatter;
        const aliasesValue = frontmatter == null ? void 0 : frontmatter.aliases;
        const aliases = Array.isArray(aliasesValue) ? aliasesValue : [aliasesValue];
        return typeof (frontmatter == null ? void 0 : frontmatter.title) === "string" && normalize(frontmatter.title) === wanted || aliases.some((alias) => typeof alias === "string" && normalize(alias) === wanted);
      });
      if (matches.length === 1) destination = matches[0];
    }
    if (!destination) return false;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(destination);
    this.app.workspace.revealLeaf(leaf);
    return true;
  }
  async complete(file, entry) {
    if (entry.kind === "bullet") return;
    if (!entry.done) {
      const stamp = localStamp();
      await this.notes.updateLine(file, entry, (line) => encodeEntry(entry, entry.text, true, stamp));
      const log = await this.notes.getLogbook();
      const label = `${entry.text} \u2014 ${await this.notes.title(file)}`;
      const marker = entry.kind === "task" ? "(x)" : "[x]";
      await this.app.vault.append(log, `- ${marker} ${label} @done(${stamp})
`);
    } else {
      await this.notes.updateLine(file, entry, () => encodeEntry(entry, entry.text, false));
      if (entry.doneDate) await this.removeLogbook(entry.text, await this.notes.title(file), entry.doneDate);
    }
  }
  async removeLogbook(text, source, stamp) {
    const log = await this.notes.getLogbook();
    await this.app.vault.process(log, (data) => {
      const lines = data.split("\n");
      const i = lines.findIndex((line) => line.includes(`${text} \u2014 ${source}`) && line.includes(`@done(${stamp})`));
      if (i >= 0) lines.splice(i, 1);
      return lines.join("\n");
    });
  }
  async replaceLogbookTitle(oldText, newText, source, destination, stamp) {
    const log = await this.notes.getLogbook();
    await this.app.vault.process(log, (data) => data.split("\n").map((line) => {
      if (!line.includes(`${oldText} \u2014 ${source}`) || !line.includes(`@done(${stamp})`)) return line;
      return line.replace(`${oldText} \u2014 ${source}`, `${newText} \u2014 ${destination}`);
    }).join("\n"));
  }
  async editEntry(file, entry, value) {
    await this.notes.updateLine(file, entry, () => encodeEntry(entry, value, entry.done, entry.doneDate));
    if (entry.done && entry.doneDate) {
      const title = await this.notes.title(file);
      await this.replaceLogbookTitle(entry.text, value, title, title, entry.doneDate);
    }
  }
  async reorderEntry(file, entry, direction) {
    await this.app.vault.process(file, (data) => {
      var _a;
      const lines = data.split("\n");
      if (!sameEntry(parseLine((_a = lines[entry.line]) != null ? _a : "", entry.line), entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
      let target = entry.line + direction;
      while (target >= 0 && target < lines.length && !parseLine(lines[target], target)) target += direction;
      if (target < 0 || target >= lines.length) return data;
      [lines[entry.line], lines[target]] = [lines[target], lines[entry.line]];
      return lines.join("\n");
    });
  }
  async deleteEntry(file, entry) {
    const trashFolder = `${this.settings.folder}/.trash`;
    await this.notes.ensureFolder(trashFolder);
    const path = `${trashFolder}/${Date.now()}-${file.basename}-${entry.line}.json`;
    await this.app.vault.create(path, JSON.stringify({ path: file.path, line: entry.line, content: await this.app.vault.read(file).then((v) => v.split("\n")[entry.line]) }, null, 2));
    await this.app.vault.process(file, (data) => {
      var _a;
      const lines = data.split("\n");
      if (!sameEntry(parseLine((_a = lines[entry.line]) != null ? _a : "", entry.line), entry)) throw new Error("This note changed outside the plugin. The deleted item is saved in Trash.");
      lines.splice(entry.line, 1);
      return lines.join("\n");
    });
    this.lastTrashPath = path;
  }
  async undoDelete() {
    if (!this.lastTrashPath) return;
    const trashFile = this.app.vault.getAbstractFileByPath(this.lastTrashPath);
    if (!(trashFile instanceof import_obsidian.TFile)) throw new Error("No recent deleted item is available to restore.");
    const record = JSON.parse(await this.app.vault.read(trashFile));
    const original = this.app.vault.getAbstractFileByPath(record.path);
    if (!(original instanceof import_obsidian.TFile)) throw new Error("The original note no longer exists.");
    await this.app.vault.process(original, (data) => {
      const lines = data.split("\n");
      lines.splice(Math.min(record.line, lines.length), 0, record.content);
      return lines.join("\n");
    });
    await this.app.vault.delete(trashFile);
    this.lastTrashPath = void 0;
  }
  async moveEntry(file, entry, date) {
    const target = await this.notes.ensureNote(this.period, date);
    if (target.path === file.path) return;
    const line = encodeEntry(entry, entry.text, entry.done, entry.doneDate);
    await this.app.vault.process(target, (data) => data.endsWith("\n") ? data + `${line}
` : `${data}
${line}
`);
    await this.app.vault.process(file, (data) => {
      var _a;
      const lines = data.split("\n");
      if (!sameEntry(parseLine((_a = lines[entry.line]) != null ? _a : "", entry.line), entry)) throw new Error("Copied to destination, but source changed and was kept.");
      lines.splice(entry.line, 1);
      return lines.join("\n");
    });
    if (entry.done && entry.doneDate) await this.replaceLogbookTitle(entry.text, entry.text, await this.notes.title(file), await this.notes.title(target), entry.doneDate);
  }
};
var StickyView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Better Sticky Notes";
  }
  getIcon() {
    return "checkbox-glyph";
  }
  async onOpen() {
    await this.render();
  }
  async render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("bsn-root");
    const navigator = root.createDiv({ cls: "bsn-navigator" });
    const previous = navigator.createEl("button", { text: "\u2039", attr: { "aria-label": "Previous" } });
    previous.hidden = this.plugin.logbook;
    previous.onclick = () => {
      this.plugin.viewingDate.setDate(this.plugin.viewingDate.getDate() - 7);
      void this.render();
    };
    this.dateInput = navigator.createEl("input", { type: "date" });
    this.dateInput.hidden = this.plugin.logbook;
    this.dateInput.value = dayId(monday(this.plugin.viewingDate));
    this.dateInput.onchange = () => {
      var _a;
      if ((_a = this.dateInput) == null ? void 0 : _a.value) {
        this.plugin.viewingDate = monday(/* @__PURE__ */ new Date(`${this.dateInput.value}T12:00:00`));
        void this.render();
      }
    };
    const next = navigator.createEl("button", { text: "\u203A", attr: { "aria-label": "Next" } });
    next.hidden = this.plugin.logbook;
    next.onclick = () => {
      this.plugin.viewingDate.setDate(this.plugin.viewingDate.getDate() + 7);
      void this.render();
    };
    const logbook = navigator.createEl("button", { text: this.plugin.logbook ? "Weekly" : "Logbook", cls: "bsn-logbook" });
    logbook.onclick = () => {
      this.plugin.logbook = !this.plugin.logbook;
      void this.render();
    };
    const file = this.plugin.logbook ? await this.plugin.notes.getLogbook() : await this.plugin.notes.ensureNote("weekly", this.plugin.viewingDate);
    const entries = await this.plugin.notes.entries(file);
    const list = root.createDiv({ cls: "bsn-list" });
    for (const entry of entries) this.renderEntry(list, file, entry);
    if (!this.plugin.logbook) {
      const add = root.createEl("input", { cls: "bsn-add", attr: { placeholder: "Add a task\u2026" } });
      add.onkeydown = (event) => {
        if (event.key !== "Enter" || !add.value.trim()) return;
        const raw = add.value.trim();
        add.value = "";
        const line = raw.startsWith("- [ ] ") || raw.startsWith("- ( ) ") || raw.startsWith("- ") ? raw : `- ( ) ${raw}`;
        void this.plugin.run(async () => {
          await this.app.vault.append(file, `${line}
`);
        });
      };
      add.onblur = () => {
        if (!add.value.trim()) return;
        const raw = add.value.trim();
        add.value = "";
        void this.plugin.run(async () => this.app.vault.append(file, `${raw.startsWith("- ") ? raw : `- ( ) ${raw}`}
`).then(() => void 0));
      };
    }
    if (this.plugin.lastTrashPath) {
      const undo = root.createEl("button", { cls: "bsn-undo", text: "Undo delete" });
      undo.onclick = () => void this.plugin.run(() => this.plugin.undoDelete());
    }
  }
  renderEntry(parent, file, entry) {
    const key = `${file.path}:${entry.line}`;
    const editing = !this.plugin.logbook && this.editingKey === key;
    const row = parent.createDiv({ cls: `bsn-entry bsn-${entry.kind}${editing ? " is-editing" : ""}` });
    row.toggleClass("is-done", entry.done);
    let input;
    if (entry.kind !== "bullet" && !this.plugin.logbook) {
      const check = row.createEl("input", { type: "checkbox" });
      check.checked = entry.done;
      check.onchange = () => void this.runEntryAction(file, entry, (current) => this.plugin.complete(file, current), input);
    }
    if (editing) {
      input = row.createEl("input", { cls: "bsn-text-edit", type: "text" });
      input.value = entry.text;
      input.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.finishEdit(file, entry, input);
        }
        if (event.key === "Escape") {
          input.value = entry.text;
          this.editingKey = void 0;
          void this.render();
        }
      };
      window.setTimeout(() => {
        input == null ? void 0 : input.focus();
        input == null ? void 0 : input.select();
      }, 0);
    } else {
      const label = row.createEl("button", { cls: "bsn-text", text: displayEntryText(entry.text), attr: { type: "button", title: "Open matching note" } });
      label.onclick = async () => {
        try {
          if (!await this.plugin.openRelatedDocument(entry.text, file.path)) {
            new import_obsidian.Notice(`No matching note found for \u201C${displayEntryText(entry.text)}\u201D. Try a [[wikilink]] or check the note title.`);
          }
        } catch (error) {
          new import_obsidian.Notice(error instanceof Error ? error.message : "Could not open the related note.");
        }
      };
    }
    if (!this.plugin.logbook) {
      const pencil = row.createEl("button", { text: "\u270E", cls: "bsn-edit", attr: { type: "button", "aria-label": editing ? "Finish editing" : "Edit item" } });
      pencil.onclick = () => {
        if (editing && input) this.finishEdit(file, entry, input);
        else {
          this.editingKey = key;
          void this.render();
        }
      };
      if (editing) {
        const actions = row.createDiv({ cls: "bsn-actions" });
        const up = actions.createEl("button", { text: "\u2191", cls: "bsn-order", attr: { "aria-label": "Move item up" } });
        up.onclick = () => void this.runEntryAction(file, entry, (current) => this.plugin.reorderEntry(file, current, -1), input);
        const down = actions.createEl("button", { text: "\u2193", cls: "bsn-order", attr: { "aria-label": "Move item down" } });
        down.onclick = () => void this.runEntryAction(file, entry, (current) => this.plugin.reorderEntry(file, current, 1), input);
        const move = actions.createEl("input", { type: "date", cls: "bsn-move-date", attr: { title: "Move to date" } });
        move.onchange = () => {
          if (move.value) void this.runEntryAction(file, entry, (current) => this.plugin.moveEntry(file, current, /* @__PURE__ */ new Date(`${move.value}T12:00:00`)), input);
        };
        const del = actions.createEl("button", { text: "\xD7", cls: "bsn-delete", attr: { "aria-label": "Delete item" } });
        del.onclick = () => void this.runEntryAction(file, entry, (current) => this.plugin.deleteEntry(file, current), input);
      }
    }
  }
  finishEdit(file, entry, input) {
    const value = input.value.trim();
    if (!value) {
      new import_obsidian.Notice("An item cannot be empty.");
      input.focus();
      return;
    }
    this.editingKey = void 0;
    void this.plugin.run(() => value === entry.text ? Promise.resolve() : this.plugin.editEntry(file, entry, value));
  }
  runEntryAction(file, entry, action, input) {
    return this.plugin.run(async () => {
      let current = entry;
      if (input && input.value.trim() !== entry.text) {
        const value = input.value.trim();
        if (!value) throw new Error("An item cannot be empty.");
        await this.plugin.editEntry(file, entry, value);
        current = { ...entry, text: value };
      }
      this.editingKey = void 0;
      await action(current);
    });
  }
};
var StickySettings = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Better Sticky Notes" });
    new import_obsidian.Setting(containerEl).setName("Notes folder").setDesc("Folder inside this vault containing Daily, Weekly, Logbook, and Trash.").addText((text) => text.setValue(this.plugin.settings.folder).onChange(async (value) => {
      try {
        this.plugin.settings.folder = safeFolder(value);
        await this.plugin.persist();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : "Invalid folder.");
      }
    }));
  }
};
