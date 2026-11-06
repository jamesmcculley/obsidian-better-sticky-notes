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
function normalizeDoneStamp(value) {
  if (!value) return void 0;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} 00:00:00` : value;
}
function stampTime(value) {
  var _a, _b, _c;
  if (!value) return 0;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number((_a = match[4]) != null ? _a : 0), Number((_b = match[5]) != null ? _b : 0), Number((_c = match[6]) != null ? _c : 0)).getTime();
}
function isSafeExternalURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (e) {
    return false;
  }
}
function newTaskId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
  var _a;
  const idMatch = raw.match(/\s+<!-- bsn-id:([\w-]+) -->\s*$/);
  const id = (_a = idMatch == null ? void 0 : idMatch[1]) != null ? _a : "";
  const parseable = raw.replace(/\s+<!-- bsn-id:[\w-]+ -->\s*$/, "");
  let m = parseable.match(/^\s*- \[([ xX])\]\s+(.*)$/);
  if (m) return entryFromMatch(m[2], line, id, "check", m[1].toLowerCase() === "x");
  m = parseable.match(/^\s*- \(([ xX])\)\s+(.*)$/);
  if (m) return entryFromMatch(m[2], line, id, "task", m[1].toLowerCase() === "x");
  m = parseable.match(/^\s*- (?!\[|\()(.*)$/);
  if (m) return { line, id, kind: "bullet", text: m[1], done: false };
  return null;
}
function entryFromMatch(value, line, id, kind, done) {
  const dm = value.match(/\s+@done\((\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?)\)\s*$/);
  return { line, id, kind, text: value.replace(/\s+@done\([^)]*\)\s*$/, ""), done, doneDate: dm == null ? void 0 : dm[1] };
}
function encodeEntry(entry, text, done, stamp) {
  const marker = entry.kind === "check" ? done ? "- [x] " : "- [ ] " : entry.kind === "task" ? done ? "- (x) " : "- ( ) " : "- ";
  return marker + text + (done && stamp ? ` @done(${stamp})` : "") + (entry.id ? ` <!-- bsn-id:${entry.id} -->` : "");
}
function displayEntryText(text) {
  return text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
function safeFolder(value) {
  const parts = value.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".." || part.startsWith("."))) throw new Error("Choose a visible folder path inside the vault.");
  return parts.join("/");
}
function markdownBodyStart(lines) {
  var _a;
  if (((_a = lines[0]) == null ? void 0 : _a.trim()) !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---" || lines[i].trim() === "...") return i + 1;
  }
  return lines.length;
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
  isWeeklyNote(file) {
    return file.path.startsWith(`${this.getRoot()}/Weekly/`);
  }
  async entries(file) {
    const trackTasks = this.isWeeklyNote(file);
    if (trackTasks) {
      await this.app.vault.process(file, (data2) => {
        var _a;
        const lines2 = data2.split("\n");
        const bodyStart2 = markdownBodyStart(lines2);
        let changed = false;
        for (let i = bodyStart2; i < lines2.length; i++) {
          let entry = parseLine(lines2[i], i);
          if (!entry) continue;
          let entryChanged = false;
          if (!entry.id) {
            entry = { ...entry, id: newTaskId() };
            entryChanged = true;
          }
          if (entry.done && !entry.doneDate || entry.doneDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.doneDate)) {
            entry = { ...entry, doneDate: (_a = normalizeDoneStamp(entry.doneDate)) != null ? _a : localStamp() };
            entryChanged = true;
          }
          if (entryChanged) {
            lines2[i] = encodeEntry(entry, entry.text, entry.done, entry.doneDate);
            changed = true;
          }
        }
        return changed ? lines2.join("\n") : data2;
      });
    }
    const data = await this.app.vault.read(file);
    const lines = data.split("\n");
    const bodyStart = markdownBodyStart(lines);
    const entries = lines.map((line, i) => i < bodyStart ? null : parseLine(line, i)).filter((x) => x !== null);
    return this.syncFrontmatter(file, entries, trackTasks);
  }
  async syncFrontmatter(file, entries, trackTasks) {
    const now = localStamp();
    const fileWeek = /^\d{4}-\d{2}-\d{2}$/.test(file.basename) ? file.basename : dayId(new Date(file.stat.ctime));
    const weekLink = trackTasks ? await this.weekLink(file) : void 0;
    const metadata = /* @__PURE__ */ new Map();
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      let changed = false;
      const oldTasks = trackTasks && Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
      const nextTasks = trackTasks ? entries.filter((entry) => entry.kind !== "bullet").map((entry) => {
        var _a, _b;
        const old = oldTasks.find((task2) => task2.id === entry.id);
        const task = { ...old != null ? old : {} };
        const status = entry.done ? "done" : "open";
        const done = entry.done ? (_b = (_a = normalizeDoneStamp(entry.doneDate)) != null ? _a : old == null ? void 0 : old.done) != null ? _b : now : void 0;
        const coreChanged = !old || old.title !== entry.text || old.status !== status || old.done !== done || old.week_of !== weekLink;
        task.id = entry.id;
        task.title = entry.text;
        task.status = status;
        task.created = typeof (old == null ? void 0 : old.created) === "string" ? old.created : now;
        task.start = typeof (old == null ? void 0 : old.start) === "string" ? old.start : `${fileWeek} 00:00:00`;
        task.last_modified = coreChanged ? now : typeof (old == null ? void 0 : old.last_modified) === "string" ? old.last_modified : now;
        task.week_of = weekLink;
        if (done) task.done = done;
        else delete task.done;
        if (typeof (old == null ? void 0 : old.external_url) === "string") task.external_url = old.external_url;
        else delete task.external_url;
        metadata.set(entry.id, task);
        return task;
      }) : [];
      const metadataChanged = JSON.stringify(oldTasks) !== JSON.stringify(nextTasks);
      const noteCreated = typeof frontmatter.created === "string" ? frontmatter.created : localStamp(new Date(file.stat.ctime || Date.now()));
      const oldStart = typeof frontmatter.start === "string" ? frontmatter.start : `${fileWeek} 00:00:00`;
      const actionable = entries.filter((entry) => entry.kind !== "bullet");
      const allDone = actionable.length > 0 && actionable.every((entry) => entry.done);
      const doneStamps = actionable.map((entry) => normalizeDoneStamp(entry.doneDate)).filter((value) => !!value).sort();
      const latestDone = doneStamps[doneStamps.length - 1];
      if (frontmatter.created !== noteCreated) {
        frontmatter.created = noteCreated;
        changed = true;
      }
      if (frontmatter.start !== oldStart) {
        frontmatter.start = oldStart;
        changed = true;
      }
      if (trackTasks && metadataChanged) {
        frontmatter.bsn_tasks = nextTasks;
        changed = true;
      }
      const noteStatus = allDone ? "done" : actionable.length ? "open" : "empty";
      if (frontmatter.status !== noteStatus) {
        frontmatter.status = noteStatus;
        changed = true;
      }
      if (weekLink && frontmatter.week_of !== weekLink) {
        frontmatter.week_of = weekLink;
        changed = true;
      }
      if (allDone && latestDone) {
        if (frontmatter.done !== latestDone) {
          frontmatter.done = latestDone;
          changed = true;
        }
      } else if (frontmatter.done !== void 0) {
        delete frontmatter.done;
        changed = true;
      }
      const recordedModified = typeof frontmatter.last_modified === "string" ? frontmatter.last_modified : "";
      const diskModified = localStamp(new Date(file.stat.mtime || Date.now()));
      const lastModified = changed ? now : stampTime(diskModified) > stampTime(recordedModified) ? diskModified : recordedModified || now;
      if (frontmatter.last_modified !== lastModified) {
        frontmatter.last_modified = lastModified;
        changed = true;
      }
    });
    return entries.map((entry) => {
      const task = metadata.get(entry.id);
      return task ? { ...entry, metadata: task, externalUrl: task.external_url } : entry;
    });
  }
  async updateExternalUrl(file, entry, value) {
    const url = value.trim();
    if (url && !isSafeExternalURL(url)) throw new Error("Use an http:// or https:// link.");
    const stamp = localStamp();
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const tasks = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
      const task = tasks.find((item) => item.id === entry.id);
      if (!task) throw new Error("Task metadata is missing. Refresh and try again.");
      if (url) task.external_url = url;
      else delete task.external_url;
      task.last_modified = stamp;
      frontmatter.last_modified = stamp;
    });
  }
  async setForwarded(file, entry, targetLink, stamp) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const tasks = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
      const task = tasks.find((item) => item.id === entry.id);
      if (!task) throw new Error("Task metadata is missing while forwarding.");
      const forwarded = Array.isArray(task.forwarded_to) ? task.forwarded_to : [];
      if (!forwarded.includes(targetLink)) forwarded.push(targetLink);
      task.forwarded_to = forwarded;
      task.last_modified = stamp;
      frontmatter.last_modified = stamp;
    });
  }
  async copyTaskMetadata(entry, destination, sourcePath, carryForward = true) {
    const stamp = localStamp();
    const link = await this.weekLink(destination);
    await this.app.fileManager.processFrontMatter(destination, (frontmatter) => {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const tasks = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
      const source = entry.metadata;
      const status = carryForward ? "open" : entry.done ? "done" : "open";
      const done = carryForward ? void 0 : entry.done ? (_a = normalizeDoneStamp(entry.doneDate)) != null ? _a : source == null ? void 0 : source.done : void 0;
      let task = tasks.find((item) => item.id === entry.id);
      if (!task) {
        task = { id: entry.id, title: entry.text, status, created: (_b = source == null ? void 0 : source.created) != null ? _b : stamp, start: (_c = source == null ? void 0 : source.start) != null ? _c : stamp, last_modified: stamp, week_of: link };
        tasks.push(task);
      } else {
        (_e = task.created) != null ? _e : task.created = (_d = source == null ? void 0 : source.created) != null ? _d : stamp;
        (_g = task.start) != null ? _g : task.start = (_f = source == null ? void 0 : source.start) != null ? _f : stamp;
        task.week_of = link;
      }
      task.title = entry.text;
      task.status = status;
      if (done) task.done = done;
      else delete task.done;
      if (!task.external_url && (entry.externalUrl || (source == null ? void 0 : source.external_url))) task.external_url = entry.externalUrl || (source == null ? void 0 : source.external_url);
      (_h = task.carried_from) != null ? _h : task.carried_from = sourcePath;
      frontmatter.bsn_tasks = tasks;
      frontmatter.last_modified = stamp;
    });
  }
  async setRelatedNote(file, id, path) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const tasks = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
      const task = tasks.find((item) => item.id === id);
      if (!task || task.related_note === path) return;
      if (path) task.related_note = path;
      else delete task.related_note;
      task.last_modified = localStamp();
      frontmatter.last_modified = task.last_modified;
    });
  }
  async syncRelatedTask(target, source, entry) {
    var _a;
    const task = entry.metadata;
    if (!task) return;
    const record = {
      id: entry.id,
      title: entry.text,
      status: entry.done ? "done" : "open",
      created: task.created,
      start: task.start,
      last_modified: task.last_modified,
      week_of: task.week_of,
      source_week: source.path,
      ...entry.done ? { done: (_a = normalizeDoneStamp(entry.doneDate)) != null ? _a : task.done } : {},
      ...entry.externalUrl ? { external_url: entry.externalUrl } : {}
    };
    await this.app.fileManager.processFrontMatter(target, (frontmatter) => {
      let changed = false;
      const related = Array.isArray(frontmatter.bsn_related_tasks) ? frontmatter.bsn_related_tasks : [];
      const old = related.find((item) => item.id === entry.id && item.source_week === source.path);
      if (!old) {
        related.push(record);
        changed = true;
      } else {
        const oldFields = old;
        const newFields = record;
        for (const field of ["title", "status", "created", "start", "last_modified", "week_of", "done", "external_url"]) {
          const value = newFields[field];
          if (value === void 0) {
            if (oldFields[field] !== void 0) {
              delete oldFields[field];
              changed = true;
            }
          } else if (oldFields[field] !== value) {
            oldFields[field] = value;
            changed = true;
          }
        }
      }
      if (changed) {
        frontmatter.bsn_related_tasks = related;
        frontmatter.last_modified = localStamp();
      }
      if (!frontmatter.created) frontmatter.created = localStamp(new Date(target.stat.ctime || Date.now()));
      if (!frontmatter.start) frontmatter.start = record.start;
      if (!frontmatter.last_modified) frontmatter.last_modified = localStamp();
    });
  }
  async removeRelatedTask(path, id, sourceWeek) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian.TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const related = Array.isArray(frontmatter.bsn_related_tasks) ? frontmatter.bsn_related_tasks : [];
      const next = related.filter((item) => !(item.id === id && item.source_week === sourceWeek));
      if (next.length === related.length) return;
      frontmatter.bsn_related_tasks = next;
      frontmatter.last_modified = localStamp();
    });
  }
  async title(file) {
    var _a, _b;
    const heading = (_b = (_a = (await this.app.vault.read(file)).match(/^#\s+(.+)$/m)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
    return heading || file.basename;
  }
  async weekLink(file) {
    return `[[${file.path.replace(/\.md$/i, "")}|${await this.title(file)}]]`;
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
  return !!current && current.id === expected.id && current.kind === expected.kind && current.text === expected.text && current.done === expected.done && current.doneDate === expected.doneDate;
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
  async resolveRelatedDocument(text, sourcePath) {
    var _a, _b;
    const wiki = text.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/);
    const markdown = text.match(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/);
    const target = ((_b = (_a = wiki == null ? void 0 : wiki[1]) != null ? _a : markdown == null ? void 0 : markdown[1]) != null ? _b : text).trim();
    if (!target || /^[a-z][a-z\d+.-]*:\/\//i.test(target)) return void 0;
    const normalize = (value) => value.replace(/\\/g, "/").replace(/\.md$/i, "").trim().toLocaleLowerCase();
    let destination = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
    if (destination && destination.extension !== "md") destination = null;
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
    if (!destination) return void 0;
    return destination;
  }
  async openRelatedDocument(text, sourcePath) {
    const destination = await this.resolveRelatedDocument(text, sourcePath);
    if (!destination) return false;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(destination);
    this.app.workspace.revealLeaf(leaf);
    return true;
  }
  async syncRelatedTaskDocuments(source, entries) {
    var _a;
    const results = [];
    for (const entry of entries) {
      if (entry.kind === "bullet") {
        results.push(entry);
        continue;
      }
      const target = await this.resolveRelatedDocument(entry.text, source.path);
      const targetPath = target && target.path !== source.path ? target.path : void 0;
      const previousPath = (_a = entry.metadata) == null ? void 0 : _a.related_note;
      if (previousPath && previousPath !== targetPath) await this.notes.removeRelatedTask(previousPath, entry.id, source.path);
      if (target && targetPath) await this.notes.syncRelatedTask(target, source, entry);
      if (previousPath !== targetPath) await this.notes.setRelatedNote(source, entry.id, targetPath);
      results.push({ ...entry, metadata: entry.metadata ? { ...entry.metadata, related_note: targetPath } : void 0 });
    }
    return results;
  }
  async forwardPreviousWeek(file, date) {
    var _a, _b;
    const currentWeek = monday(date);
    if (dayId(currentWeek) !== dayId(monday(/* @__PURE__ */ new Date()))) return;
    const previousWeek = new Date(currentWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);
    const previousPath = this.notes.path("Weekly", `${dayId(previousWeek)}.md`);
    const previous = this.app.vault.getAbstractFileByPath(previousPath);
    if (!(previous instanceof import_obsidian.TFile)) return;
    const targetLink = await this.notes.weekLink(file);
    const sourceEntries = await this.notes.entries(previous);
    const destinationEntries = await this.notes.entries(file);
    for (const entry of sourceEntries) {
      if (entry.kind === "bullet" || entry.done) continue;
      const forwarded = (_b = (_a = entry.metadata) == null ? void 0 : _a.forwarded_to) != null ? _b : [];
      const alreadyForwarded = forwarded.includes(targetLink);
      const stamp = localStamp();
      if (!alreadyForwarded) {
        if (!destinationEntries.some((candidate) => candidate.id === entry.id)) {
          await this.app.vault.process(file, (content) => `${content}${content.endsWith("\n") ? "" : "\n"}${encodeEntry(entry, entry.text, false)}
`);
        }
        await this.notes.copyTaskMetadata(entry, file, previous.path);
        await this.notes.setForwarded(previous, entry, targetLink, stamp);
      }
      const marker = `<!-- bsn-forwarded:${entry.id}:${dayId(currentWeek)} -->`;
      await this.app.vault.process(previous, (content) => {
        if (content.includes(marker)) return content;
        const taskText = entry.text.replace(/[\r\n]+/g, " ");
        return `${content}${content.endsWith("\n") ? "" : "\n"}> Forwarded \u201C${taskText}\u201D to ${targetLink} on ${stamp}. ${marker}
`;
      });
    }
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
  async editEntry(file, entry, value, externalUrl) {
    if ((externalUrl == null ? void 0 : externalUrl.trim()) && !isSafeExternalURL(externalUrl.trim())) throw new Error("Use an http:// or https:// link.");
    await this.notes.updateLine(file, entry, () => encodeEntry(entry, value, entry.done, entry.doneDate));
    if (entry.done && entry.doneDate) {
      const title = await this.notes.title(file);
      await this.replaceLogbookTitle(entry.text, value, title, title, entry.doneDate);
    }
    if (externalUrl !== void 0) await this.notes.updateExternalUrl(file, entry, externalUrl);
  }
  async reorderEntry(file, entry, direction) {
    await this.app.vault.process(file, (data) => {
      var _a;
      const lines = data.split("\n");
      const bodyStart = markdownBodyStart(lines);
      if (!sameEntry(parseLine((_a = lines[entry.line]) != null ? _a : "", entry.line), entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
      let target = entry.line + direction;
      while (target >= bodyStart && target < lines.length && !parseLine(lines[target], target)) target += direction;
      if (target < bodyStart || target >= lines.length) return data;
      [lines[entry.line], lines[target]] = [lines[target], lines[entry.line]];
      return lines.join("\n");
    });
  }
  async deleteEntry(file, entry) {
    var _a;
    const trashFolder = `${this.settings.folder}/.trash`;
    await this.notes.ensureFolder(trashFolder);
    const path = `${trashFolder}/${Date.now()}-${file.basename}-${entry.line}.json`;
    await this.app.vault.create(path, JSON.stringify({ path: file.path, line: entry.line, content: await this.app.vault.read(file).then((v) => v.split("\n")[entry.line]) }, null, 2));
    await this.app.vault.process(file, (data) => {
      var _a2;
      const lines = data.split("\n");
      if (!sameEntry(parseLine((_a2 = lines[entry.line]) != null ? _a2 : "", entry.line), entry)) throw new Error("This note changed outside the plugin. The deleted item is saved in Trash.");
      lines.splice(entry.line, 1);
      return lines.join("\n");
    });
    this.lastTrashPath = path;
    if ((_a = entry.metadata) == null ? void 0 : _a.related_note) await this.notes.removeRelatedTask(entry.metadata.related_note, entry.id, file.path);
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
    if (entry.kind !== "bullet") await this.notes.copyTaskMetadata(entry, target, file.path, false);
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
    if (!this.plugin.logbook) await this.plugin.forwardPreviousWeek(file, this.plugin.viewingDate);
    let entries = await this.plugin.notes.entries(file);
    if (!this.plugin.logbook) entries = await this.plugin.syncRelatedTaskDocuments(file, entries);
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
    var _a;
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
      const fields = row.createDiv({ cls: "bsn-edit-fields" });
      input = fields.createEl("input", { cls: "bsn-text-edit", type: "text" });
      input.value = entry.text;
      const urlInput = fields.createEl("input", { cls: "bsn-url-edit", type: "url", attr: { placeholder: "External URL (optional)" } });
      urlInput.value = (_a = entry.externalUrl) != null ? _a : "";
      input.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.finishEdit(file, entry, input, urlInput);
        }
        if (event.key === "Escape") {
          input.value = entry.text;
          this.editingKey = void 0;
          void this.render();
        }
      };
      urlInput.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.finishEdit(file, entry, input, urlInput);
        }
        if (event.key === "Escape") {
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
    if (entry.kind !== "bullet" && !this.plugin.logbook) {
      const external = row.createEl("button", { text: "\u2197", cls: "bsn-external", attr: { type: "button", "aria-label": "Open external task link" } });
      const url = entry.externalUrl;
      external.disabled = !url || !isSafeExternalURL(url);
      external.title = external.disabled ? "Add an http(s) URL while editing" : "Open external link in your browser";
      if (url && !external.disabled) external.onclick = () => {
        window.open(url, "_blank", "noopener,noreferrer");
      };
    }
    if (!this.plugin.logbook) {
      const pencil = row.createEl("button", { text: "\u270E", cls: "bsn-edit", attr: { type: "button", "aria-label": editing ? "Finish editing" : "Edit item" } });
      pencil.onclick = () => {
        var _a2;
        if (editing && input) this.finishEdit(file, entry, input, (_a2 = row.querySelector(".bsn-url-edit")) != null ? _a2 : void 0);
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
  finishEdit(file, entry, input, urlInput) {
    var _a, _b;
    const value = input.value.trim();
    if (!value) {
      new import_obsidian.Notice("An item cannot be empty.");
      input.focus();
      return;
    }
    const externalUrl = (_b = (_a = urlInput == null ? void 0 : urlInput.value.trim()) != null ? _a : entry.externalUrl) != null ? _b : "";
    if (externalUrl && !isSafeExternalURL(externalUrl)) {
      new import_obsidian.Notice("Use an http:// or https:// link.");
      urlInput == null ? void 0 : urlInput.focus();
      return;
    }
    this.editingKey = void 0;
    void this.plugin.run(() => {
      var _a2;
      return value === entry.text && externalUrl === ((_a2 = entry.externalUrl) != null ? _a2 : "") ? Promise.resolve() : this.plugin.editEntry(file, entry, value, externalUrl);
    });
  }
  runEntryAction(file, entry, action, input) {
    return this.plugin.run(async () => {
      var _a, _b, _c, _d, _e;
      let current = entry;
      const urlInput = (_a = input == null ? void 0 : input.parentElement) == null ? void 0 : _a.querySelector(".bsn-url-edit");
      const value = (_b = input == null ? void 0 : input.value.trim()) != null ? _b : entry.text;
      const externalUrl = (_d = (_c = urlInput == null ? void 0 : urlInput.value.trim()) != null ? _c : entry.externalUrl) != null ? _d : "";
      if (externalUrl && !isSafeExternalURL(externalUrl)) throw new Error("Use an http:// or https:// link.");
      if (input && (value !== entry.text || externalUrl !== ((_e = entry.externalUrl) != null ? _e : ""))) {
        if (!value) throw new Error("An item cannot be empty.");
        await this.plugin.editEntry(file, entry, value, externalUrl);
        current = { ...entry, text: value, externalUrl: externalUrl || void 0 };
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
