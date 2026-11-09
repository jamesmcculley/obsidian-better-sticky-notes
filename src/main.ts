import {
	App,
	ItemView,
	Notice,
	Plugin,
	PluginSettingTab,
	Platform,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

function validNoteTitle(title: string): boolean {
	return !!title && !/[\\/:*?"<>|#^\[\]\r\n]/.test(title) && !/[. ]$/.test(title) && title !== "." && title !== "..";
}

const VIEW_TYPE = "better-sticky-notes-view";
const DEFAULT_ROOT = "Better Sticky Notes";
type Period = "daily" | "weekly";
type Kind = "task" | "check" | "bullet";
interface Settings { folder: string }
interface Entry { line: number; id: string; kind: Kind; text: string; done: boolean; doneDate?: string; externalUrl?: string; metadata?: TaskMetadata }
interface TaskMetadata {
	id: string;
	title: string;
	status: "open" | "done" | "note";
	created: string;
	start: string;
	last_modified: string;
	done?: string;
	week_of: string;
	external_url?: string;
	forwarded_to?: string[];
	carried_from?: string;
	related_note?: string;
	source_week?: string;
	[key: string]: unknown;
}
const DEFAULT_SETTINGS: Settings = { folder: DEFAULT_ROOT };

function localStamp(date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function normalizeDoneStamp(value?: string): string | undefined {
	if (!value) return undefined;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} 00:00:00` : value;
}
function stampTime(value?: string): number {
	if (!value) return 0;
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
	if (!match) return 0;
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)).getTime();
}
function isSafeExternalURL(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch { return false; }
}
function newTaskId(): string {
	return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
function dayId(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function monday(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return d;
}
function noteTitle(period: Period, date: Date): string {
	if (period === "weekly") return `Week of ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
	return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function parseLine(raw: string, line: number): Entry | null {
	const idMatch = raw.match(/\s+<!-- bsn-id:([\w-]+) -->\s*$/);
	const id = idMatch?.[1] ?? "";
	const parseable = raw.replace(/\s+<!-- bsn-id:[\w-]+ -->\s*$/, "");
	let m = parseable.match(/^\s*- \[([ xX])\]\s+(.*)$/);
	if (m) return entryFromMatch(m[2], line, id, "check", m[1].toLowerCase() === "x");
	m = parseable.match(/^\s*- \(([ xX])\)\s+(.*)$/);
	if (m) return entryFromMatch(m[2], line, id, "task", m[1].toLowerCase() === "x");
	m = parseable.match(/^\s*- (?!\[|\()(.*)$/);
	if (m) return { line, id, kind: "bullet", text: m[1], done: false };
	return null;
}
function entryFromMatch(value: string, line: number, id: string, kind: Kind, done: boolean): Entry {
	const dm = value.match(/\s+@done\((\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?)\)\s*$/);
	return { line, id, kind, text: value.replace(/\s+@done\([^)]*\)\s*$/, ""), done, doneDate: dm?.[1] };
}
function encodeEntry(entry: Entry, text: string, done: boolean, stamp?: string): string {
	const marker = entry.kind === "check" ? (done ? "- [x] " : "- [ ] ") : entry.kind === "task" ? (done ? "- (x) " : "- ( ) ") : "- ";
	return marker + text + (done && stamp ? ` @done(${stamp})` : "") + (entry.id ? ` <!-- bsn-id:${entry.id} -->` : "");
}
function displayEntryText(text: string): string {
	return text
		.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
function safeFolder(value: string): string {
	const parts = value.trim().replace(/\\/g, "/").split("/").filter(Boolean);
	if (!parts.length || parts.some((part) => part === "." || part === ".." || part.startsWith("."))) throw new Error("Choose a visible folder path inside the vault.");
	return parts.join("/");
}
function markdownBodyStart(lines: string[]): number {
	if (lines[0]?.trim() !== "---") return 0;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---" || lines[i].trim() === "...") return i + 1;
	}
	return lines.length;
}

// A linked note exposes the most recent completion among its related tasks.
function syncRelatedDone(frontmatter: Record<string, unknown>, related: TaskMetadata[]): boolean {
	const stamps = related.filter((task) => task.status === "done")
		.map((task) => normalizeDoneStamp(task.done)).filter((stamp): stamp is string => !!stamp).sort();
	const done = stamps[stamps.length - 1];
	if (frontmatter.done === done) return false;
	if (done) frontmatter.done = done;
	else delete frontmatter.done;
	return true;
}

class VaultNotes {
	constructor(private app: App, private getRoot: () => string) {}
	path(stack: string, id: string): string { return `${this.getRoot()}/${stack}/${id}`; }
	async ensureFolder(path: string): Promise<void> {
		let built = "";
		for (const part of path.split("/")) {
			built = built ? `${built}/${part}` : part;
			// Hidden folders such as .trash are not reliably present in the vault index.
			const existing = await this.app.vault.adapter.stat(built);
			if (existing) {
				if (existing.type !== "folder") throw new Error(`A file blocks the folder: ${built}`);
				continue;
			}
			try {
				if (built.split("/").some((part) => part.startsWith("."))) await this.app.vault.adapter.mkdir(built);
				else await this.app.vault.createFolder(built);
			} catch (error) {
				// Another view may have created the same directory while we awaited I/O.
				if ((await this.app.vault.adapter.stat(built))?.type !== "folder") throw error;
			}
		}
	}
	async ensureNote(period: Period, date: Date): Promise<TFile> {
		const start = period === "weekly" ? monday(date) : date;
		const stack = period === "weekly" ? "Weekly" : "Daily";
		const id = `${dayId(start)}.md`;
		const path = this.path(stack, id);
		await this.ensureFolder(`${this.getRoot()}/${stack}`);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		return this.app.vault.create(path, `# ${noteTitle(period, start)}\n`);
	}
	async getLogbook(): Promise<TFile> {
		const path = this.path("Logbook", "Logbook.md");
		await this.ensureFolder(`${this.getRoot()}/Logbook`);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		return this.app.vault.create(path, "# Logbook\n");
	}
	private isWeeklyNote(file: TFile): boolean {
		return file.path.startsWith(`${this.getRoot()}/Weekly/`);
	}
	async entries(file: TFile): Promise<Entry[]> {
		const trackTasks = this.isWeeklyNote(file);
		if (trackTasks) {
			await this.app.vault.process(file, (data) => {
				const lines = data.split("\n");
				const bodyStart = markdownBodyStart(lines);
				let changed = false;
				for (let i = bodyStart; i < lines.length; i++) {
					let entry = parseLine(lines[i], i);
					if (!entry) continue;
					let entryChanged = false;
					if (!entry.id) { entry = { ...entry, id: newTaskId() }; entryChanged = true; }
					if ((entry.done && !entry.doneDate) || (entry.doneDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.doneDate))) {
						entry = { ...entry, doneDate: normalizeDoneStamp(entry.doneDate) ?? localStamp() };
						entryChanged = true;
					}
					if (entryChanged) { lines[i] = encodeEntry(entry, entry.text, entry.done, entry.doneDate); changed = true; }
				}
				return changed ? lines.join("\n") : data;
			});
		}
		const data = await this.app.vault.read(file);
		const lines = data.split("\n");
		const bodyStart = markdownBodyStart(lines);
		const entries = lines.map((line, i) => i < bodyStart ? null : parseLine(line, i)).filter((x): x is Entry => x !== null);
		return this.syncFrontmatter(file, entries, trackTasks);
	}
	private async syncFrontmatter(file: TFile, entries: Entry[], trackTasks: boolean): Promise<Entry[]> {
		const now = localStamp();
		const fileWeek = /^\d{4}-\d{2}-\d{2}$/.test(file.basename) ? file.basename : dayId(new Date(file.stat.ctime));
		const weekLink = trackTasks ? await this.weekLink(file) : undefined;
		const metadata = new Map<string, TaskMetadata>();
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			let changed = false;
			const oldTasks: TaskMetadata[] = trackTasks && Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
			const nextTasks = trackTasks ? entries.filter((entry) => entry.kind !== "bullet").map((entry) => {
				const old = oldTasks.find((task) => task.id === entry.id);
				const task: TaskMetadata = { ...(old ?? {} as TaskMetadata) } as TaskMetadata;
				const status: TaskMetadata["status"] = entry.done ? "done" : "open";
				const done = entry.done ? normalizeDoneStamp(entry.doneDate) ?? old?.done ?? now : undefined;
				const coreChanged = !old || old.title !== entry.text || old.status !== status || old.done !== done || old.week_of !== weekLink;
				task.id = entry.id;
				task.title = entry.text;
				task.status = status;
				task.created = typeof old?.created === "string" ? old.created : now;
				task.start = typeof old?.start === "string" ? old.start : `${fileWeek} 00:00:00`;
				task.last_modified = coreChanged ? now : (typeof old?.last_modified === "string" ? old.last_modified : now);
				task.week_of = weekLink!;
				if (done) task.done = done; else delete task.done;
				if (typeof old?.external_url === "string") task.external_url = old.external_url;
				else delete task.external_url;
				metadata.set(entry.id, task);
				return task;
			}) : [];
			const metadataChanged = JSON.stringify(oldTasks) !== JSON.stringify(nextTasks);
			const noteCreated = typeof frontmatter.created === "string" ? frontmatter.created : localStamp(new Date(file.stat.ctime || Date.now()));
			const oldStart = typeof frontmatter.start === "string" ? frontmatter.start : `${fileWeek} 00:00:00`;
			const actionable = entries.filter((entry) => entry.kind !== "bullet");
			const allDone = actionable.length > 0 && actionable.every((entry) => entry.done);
			const doneStamps = actionable.map((entry) => normalizeDoneStamp(entry.doneDate)).filter((value): value is string => !!value).sort();
			const latestDone = doneStamps[doneStamps.length - 1];
			if (frontmatter.created !== noteCreated) { frontmatter.created = noteCreated; changed = true; }
			if (frontmatter.start !== oldStart) { frontmatter.start = oldStart; changed = true; }
			if (trackTasks && metadataChanged) { frontmatter.bsn_tasks = nextTasks; changed = true; }
			const noteStatus = allDone ? "done" : actionable.length ? "open" : "empty";
			if (frontmatter.status !== noteStatus) { frontmatter.status = noteStatus; changed = true; }
			if (weekLink && frontmatter.week_of !== weekLink) { frontmatter.week_of = weekLink; changed = true; }
			if (allDone && latestDone) {
				if (frontmatter.done !== latestDone) { frontmatter.done = latestDone; changed = true; }
			} else if (frontmatter.done !== undefined) { delete frontmatter.done; changed = true; }
			const recordedModified = typeof frontmatter.last_modified === "string" ? frontmatter.last_modified : "";
			const diskModified = localStamp(new Date(file.stat.mtime || Date.now()));
			const lastModified = changed ? now : stampTime(diskModified) > stampTime(recordedModified) ? diskModified : (recordedModified || now);
			if (frontmatter.last_modified !== lastModified) { frontmatter.last_modified = lastModified; changed = true; }
			// Obsidian's processFrontMatter writes the same block atomically; only update the date
			// when plugin-owned properties actually changed.
		});
		return entries.map((entry) => {
			const task = metadata.get(entry.id);
			return task ? { ...entry, metadata: task, externalUrl: task.external_url } : entry;
		});
	}
	async updateExternalUrl(file: TFile, entry: Entry, value: string): Promise<void> {
		const url = value.trim();
		if (url && !isSafeExternalURL(url)) throw new Error("Use an http:// or https:// link.");
		const stamp = localStamp();
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const tasks: TaskMetadata[] = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
			const task = tasks.find((item) => item.id === entry.id);
			if (!task) throw new Error("Task metadata is missing. Refresh and try again.");
			if (url) task.external_url = url; else delete task.external_url;
			task.last_modified = stamp;
			frontmatter.last_modified = stamp;
		});
	}
	async setForwarded(file: TFile, entry: Entry, targetLink: string, stamp: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const tasks: TaskMetadata[] = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
			const task = tasks.find((item) => item.id === entry.id);
			if (!task) throw new Error("Task metadata is missing while forwarding.");
			const forwarded = Array.isArray(task.forwarded_to) ? task.forwarded_to : [];
			if (!forwarded.includes(targetLink)) forwarded.push(targetLink);
			task.forwarded_to = forwarded;
			task.last_modified = stamp;
			frontmatter.last_modified = stamp;
		});
	}
	async copyTaskMetadata(entry: Entry, destination: TFile, sourcePath: string, carryForward = true): Promise<void> {
		const stamp = localStamp();
		const link = await this.weekLink(destination);
		await this.app.fileManager.processFrontMatter(destination, (frontmatter) => {
			const tasks: TaskMetadata[] = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
			const source = entry.metadata;
			const status: TaskMetadata["status"] = carryForward ? "open" : entry.done ? "done" : "open";
			const done = carryForward ? undefined : entry.done ? normalizeDoneStamp(entry.doneDate) ?? source?.done : undefined;
			let task = tasks.find((item) => item.id === entry.id);
			if (!task) {
				task = { id: entry.id, title: entry.text, status, created: source?.created ?? stamp, start: source?.start ?? stamp, last_modified: stamp, week_of: link };
				tasks.push(task);
			} else {
				task.created ??= source?.created ?? stamp;
				task.start ??= source?.start ?? stamp;
				task.week_of = link;
			}
			task.title = entry.text;
			task.status = status;
			if (done) task.done = done; else delete task.done;
			if (!task.external_url && (entry.externalUrl || source?.external_url)) task.external_url = entry.externalUrl || source?.external_url;
			task.carried_from ??= sourcePath;
			frontmatter.bsn_tasks = tasks;
			frontmatter.last_modified = stamp;
		});
	}
	async setRelatedNote(file: TFile, id: string, path?: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const tasks: TaskMetadata[] = Array.isArray(frontmatter.bsn_tasks) ? frontmatter.bsn_tasks : [];
			const task = tasks.find((item) => item.id === id);
			if (!task || task.related_note === path) return;
			if (path) task.related_note = path; else delete task.related_note;
			task.last_modified = localStamp();
			frontmatter.last_modified = task.last_modified;
		});
	}
	async syncRelatedTask(target: TFile, source: TFile, entry: Entry): Promise<void> {
		const task = entry.metadata;
		if (!task) return;
		const record: TaskMetadata = {
			id: entry.id,
			title: entry.text,
			status: entry.done ? "done" : "open",
			created: task.created,
			start: task.start,
			last_modified: task.last_modified,
			week_of: task.week_of,
			source_week: source.path,
			...(entry.done ? { done: normalizeDoneStamp(entry.doneDate) ?? task.done } : {}),
			...(entry.externalUrl ? { external_url: entry.externalUrl } : {}),
		};
		await this.app.fileManager.processFrontMatter(target, (frontmatter) => {
			let changed = false;
			const related: TaskMetadata[] = Array.isArray(frontmatter.bsn_related_tasks) ? frontmatter.bsn_related_tasks : [];
			const old = related.find((item) => item.id === entry.id && item.source_week === source.path);
			if (!old) { related.push(record); changed = true; }
			else {
				const oldFields = old as Record<string, unknown>;
				const newFields = record as Record<string, unknown>;
				for (const field of ["title", "status", "created", "start", "last_modified", "week_of", "done", "external_url"]) {
					const value = newFields[field];
					if (value === undefined) {
						if (oldFields[field] !== undefined) { delete oldFields[field]; changed = true; }
					} else if (oldFields[field] !== value) { oldFields[field] = value; changed = true; }
				}
			}
			if (syncRelatedDone(frontmatter, related)) changed = true;
			if (changed) {
				frontmatter.bsn_related_tasks = related;
				frontmatter.last_modified = localStamp();
			}
			if (!frontmatter.created) frontmatter.created = localStamp(new Date(target.stat.ctime || Date.now()));
			if (!frontmatter.start) frontmatter.start = record.start;
			if (!frontmatter.last_modified) frontmatter.last_modified = localStamp();
		});
	}
	async removeRelatedTask(path: string, id: string, sourceWeek: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const related: TaskMetadata[] = Array.isArray(frontmatter.bsn_related_tasks) ? frontmatter.bsn_related_tasks : [];
			const next = related.filter((item) => !(item.id === id && item.source_week === sourceWeek));
			if (next.length === related.length) return;
			frontmatter.bsn_related_tasks = next;
			syncRelatedDone(frontmatter, next);
			frontmatter.last_modified = localStamp();
		});
	}
	async title(file: TFile): Promise<string> {
		const heading = (await this.app.vault.read(file)).match(/^#\s+(.+)$/m)?.[1]?.trim();
		return heading || file.basename;
	}
	async weekLink(file: TFile): Promise<string> {
		return `[[${file.path.replace(/\.md$/i, "")}|${await this.title(file)}]]`;
	}
	async updateLine(file: TFile, entry: Entry, update: (line: string) => string): Promise<void> {
		await this.app.vault.process(file, (data) => {
			const lines = data.split("\n");
			const current = lines[entry.line];
			if (current === undefined || !sameEntry(parseLine(current, entry.line), entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
			lines[entry.line] = update(current);
			return lines.join("\n");
		});
	}
}
function sameEntry(current: Entry | null, expected: Entry): boolean {
	return !!current && current.id === expected.id && current.kind === expected.kind && current.text === expected.text && current.done === expected.done && current.doneDate === expected.doneDate;
}

export default class BetterStickyNotes extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;
	notes!: VaultNotes;
	period: Period = "weekly";
	viewingDate = new Date();
	logbook = false;
	lastTrashPath?: string;

	async onload(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
		try { this.settings.folder = safeFolder(this.settings.folder); } catch { this.settings.folder = DEFAULT_ROOT; }
		this.notes = new VaultNotes(this.app, () => this.settings.folder);
		this.registerView(VIEW_TYPE, (leaf) => new StickyView(leaf, this));
		this.addRibbonIcon("checkbox-glyph", "Open Better Sticky Notes", () => void this.activateView());
		this.addCommand({ id: "open-sticky-notes", name: "Open sticky notes", callback: () => void this.activateView() });
		this.addSettingTab(new StickySettings(this.app, this));
	}
	async onunload(): Promise<void> { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }
	async activateView(popout = false): Promise<void> {
		const existing = popout ? undefined : this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		let leaf: WorkspaceLeaf;
		if (existing) leaf = existing;
		else if (popout && Platform.isDesktopApp) leaf = this.app.workspace.getLeaf("window");
		else leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
	async persist(): Promise<void> { await this.saveData(this.settings); }
	async switchCollection(folder: string): Promise<void> {
		this.settings.folder = safeFolder(folder);
		await this.persist();
		await this.refreshAll();
	}
	async refreshAll(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof StickyView) await view.render();
		}
	}
	async run(action: () => Promise<void>): Promise<void> {
		try { await action(); await this.refreshAll(); }
		catch (error) { new Notice(error instanceof Error ? error.message : "Could not update the note."); }
	}
	async resolveRelatedDocument(text: string, sourcePath: string): Promise<TFile | undefined> {
		const wiki = text.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/);
		const markdown = text.match(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/);
		const target = (wiki?.[1] ?? markdown?.[1] ?? text).trim();
		if (!target || /^[a-z][a-z\d+.-]*:\/\//i.test(target)) return undefined;
		const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\.md$/i, "").trim().toLocaleLowerCase();
		let destination = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
		if (destination && destination.extension !== "md") destination = null;
		if (!destination) {
			const wanted = normalize(target);
			const matches = this.app.vault.getMarkdownFiles().filter((file) => {
				if (normalize(file.path) === wanted || normalize(file.basename) === wanted) return true;
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				const aliasesValue = frontmatter?.aliases;
				const aliases = Array.isArray(aliasesValue) ? aliasesValue : [aliasesValue];
				return (typeof frontmatter?.title === "string" && normalize(frontmatter.title) === wanted) || aliases.some((alias) => typeof alias === "string" && normalize(alias) === wanted);
			});
			if (matches.length === 1) destination = matches[0];
		}
		if (!destination) return undefined;
		return destination;
	}
	async openRelatedDocument(text: string, sourcePath: string): Promise<boolean> {
		const destination = await this.resolveRelatedDocument(text, sourcePath);
		if (!destination) return false;
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(destination);
		this.app.workspace.revealLeaf(leaf);
		return true;
	}
	async syncRelatedTaskDocuments(source: TFile, entries: Entry[]): Promise<Entry[]> {
		const results: Entry[] = [];
		for (const entry of entries) {
			if (entry.kind === "bullet") { results.push(entry); continue; }
			const target = await this.resolveRelatedDocument(entry.text, source.path);
			const targetPath = target && target.path !== source.path ? target.path : undefined;
			const previousPath = entry.metadata?.related_note;
			if (previousPath && previousPath !== targetPath) await this.notes.removeRelatedTask(previousPath, entry.id, source.path);
			if (target && targetPath) await this.notes.syncRelatedTask(target, source, entry);
			if (previousPath !== targetPath) await this.notes.setRelatedNote(source, entry.id, targetPath);
			results.push({ ...entry, metadata: entry.metadata ? { ...entry.metadata, related_note: targetPath } : undefined });
		}
		return results;
	}
	async forwardPreviousWeek(file: TFile, date: Date): Promise<void> {
		const currentWeek = monday(date);
		if (dayId(currentWeek) !== dayId(monday(new Date()))) return;
		const previousWeek = new Date(currentWeek);
		previousWeek.setDate(previousWeek.getDate() - 7);
		const previousPath = this.notes.path("Weekly", `${dayId(previousWeek)}.md`);
		const previous = this.app.vault.getAbstractFileByPath(previousPath);
		if (!(previous instanceof TFile)) return;
		const targetLink = await this.notes.weekLink(file);
		const sourceEntries = await this.notes.entries(previous);
		const destinationEntries = await this.notes.entries(file);
		for (const entry of sourceEntries) {
			if (entry.kind === "bullet" || entry.done) continue;
			const forwarded = entry.metadata?.forwarded_to ?? [];
			const alreadyForwarded = forwarded.includes(targetLink);
			const stamp = localStamp();
			if (!alreadyForwarded) {
				if (!destinationEntries.some((candidate) => candidate.id === entry.id)) {
					await this.app.vault.process(file, (content) => `${content}${content.endsWith("\n") ? "" : "\n"}${encodeEntry(entry, entry.text, false)}\n`);
				}
				await this.notes.copyTaskMetadata(entry, file, previous.path);
				await this.notes.setForwarded(previous, entry, targetLink, stamp);
			}
			const marker = `<!-- bsn-forwarded:${entry.id}:${dayId(currentWeek)} -->`;
			await this.app.vault.process(previous, (content) => {
				if (content.includes(marker)) return content;
				const taskText = entry.text.replace(/[\r\n]+/g, " ");
				return `${content}${content.endsWith("\n") ? "" : "\n"}> Forwarded “${taskText}” to ${targetLink} on ${stamp}. ${marker}\n`;
			});
		}
	}
	async complete(file: TFile, entry: Entry): Promise<void> {
		if (entry.kind === "bullet") return;
		if (!entry.done) {
			const stamp = localStamp();
			await this.notes.updateLine(file, entry, (line) => encodeEntry(entry, entry.text, true, stamp));
			const log = await this.notes.getLogbook();
			const label = `${entry.text} — ${await this.notes.title(file)}`;
			const marker = entry.kind === "task" ? "(x)" : "[x]";
			await this.app.vault.append(log, `- ${marker} ${label} @done(${stamp})\n`);
		} else {
			await this.notes.updateLine(file, entry, () => encodeEntry(entry, entry.text, false));
			if (entry.doneDate) await this.removeLogbook(entry.text, await this.notes.title(file), entry.doneDate);
		}
	}
	async removeLogbook(text: string, source: string, stamp: string): Promise<void> {
		const log = await this.notes.getLogbook();
		await this.app.vault.process(log, (data) => {
			const lines = data.split("\n");
			const i = lines.findIndex((line) => line.includes(`${text} — ${source}`) && line.includes(`@done(${stamp})`));
			if (i >= 0) lines.splice(i, 1);
			return lines.join("\n");
		});
	}
	async replaceLogbookTitle(oldText: string, newText: string, source: string, destination: string, stamp: string): Promise<void> {
		const log = await this.notes.getLogbook();
		await this.app.vault.process(log, (data) => data.split("\n").map((line) => {
			if (!line.includes(`${oldText} — ${source}`) || !line.includes(`@done(${stamp})`)) return line;
			return line.replace(`${oldText} — ${source}`, `${newText} — ${destination}`);
		}).join("\n"));
	}
	async editEntry(file: TFile, entry: Entry, value: string, externalUrl?: string): Promise<void> {
		if (externalUrl?.trim() && !isSafeExternalURL(externalUrl.trim())) throw new Error("Use an http:// or https:// link.");
		await this.notes.updateLine(file, entry, () => encodeEntry(entry, value, entry.done, entry.doneDate));
		if (entry.done && entry.doneDate) {
			const title = await this.notes.title(file);
			await this.replaceLogbookTitle(entry.text, value, title, title, entry.doneDate);
		}
		if (externalUrl !== undefined) await this.notes.updateExternalUrl(file, entry, externalUrl);
	}
	async reorderEntry(file: TFile, entry: Entry, direction: -1 | 1): Promise<void> {
		await this.app.vault.process(file, (data) => {
			const lines = data.split("\n");
			const bodyStart = markdownBodyStart(lines);
			if (!sameEntry(parseLine(lines[entry.line] ?? "", entry.line), entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
			let target = entry.line + direction;
			while (target >= bodyStart && target < lines.length && !parseLine(lines[target], target)) target += direction;
			if (target < bodyStart || target >= lines.length) return data;
			[lines[entry.line], lines[target]] = [lines[target], lines[entry.line]];
			return lines.join("\n");
		});
	}
	async deleteEntry(file: TFile, entry: Entry): Promise<void> {
		const trashFolder = `${this.settings.folder}/.trash`;
		await this.notes.ensureFolder(trashFolder);
		const path = `${trashFolder}/${Date.now()}-${file.basename}-${entry.line}.json`;
		await this.app.vault.adapter.write(path, JSON.stringify({ path: file.path, line: entry.line, content: await this.app.vault.read(file).then((v) => v.split("\n")[entry.line]) }, null, 2));
		await this.app.vault.process(file, (data) => {
			const lines = data.split("\n");
			if (!sameEntry(parseLine(lines[entry.line] ?? "", entry.line), entry)) throw new Error("This note changed outside the plugin. The deleted item is saved in Trash.");
			lines.splice(entry.line, 1);
			return lines.join("\n");
		});
		this.lastTrashPath = path;
		if (entry.metadata?.related_note) await this.notes.removeRelatedTask(entry.metadata.related_note, entry.id, file.path);
	}
	async undoDelete(): Promise<void> {
		if (!this.lastTrashPath) return;
		const trashPath = this.lastTrashPath;
		if ((await this.app.vault.adapter.stat(trashPath))?.type !== "file") throw new Error("No recent deleted item is available to restore.");
		const record = JSON.parse(await this.app.vault.adapter.read(trashPath)) as { path: string; line: number; content: string };
		const original = this.app.vault.getAbstractFileByPath(record.path);
		if (!(original instanceof TFile)) throw new Error("The original note no longer exists.");
		await this.app.vault.process(original, (data) => {
			const lines = data.split("\n"); lines.splice(Math.min(record.line, lines.length), 0, record.content); return lines.join("\n");
		});
		await this.app.vault.adapter.remove(trashPath);
		this.lastTrashPath = undefined;
	}
	async moveEntry(file: TFile, entry: Entry, date: Date): Promise<void> {
		const target = await this.notes.ensureNote(this.period, date);
		if (target.path === file.path) return;
		const line = encodeEntry(entry, entry.text, entry.done, entry.doneDate);
		await this.app.vault.process(target, (data) => data.endsWith("\n") ? data + `${line}\n` : `${data}\n${line}\n`);
		if (entry.kind !== "bullet") await this.notes.copyTaskMetadata(entry, target, file.path, false);
		await this.app.vault.process(file, (data) => { const lines = data.split("\n"); if (!sameEntry(parseLine(lines[entry.line] ?? "", entry.line), entry)) throw new Error("Copied to destination, but source changed and was kept."); lines.splice(entry.line, 1); return lines.join("\n"); });
		if (entry.done && entry.doneDate) await this.replaceLogbookTitle(entry.text, entry.text, await this.notes.title(file), await this.notes.title(target), entry.doneDate);
	}
}

class StickyView extends ItemView {
	private dateInput?: HTMLInputElement;
	private editingKey?: string;
	constructor(leaf: WorkspaceLeaf, private plugin: BetterStickyNotes) { super(leaf); }
	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Better Sticky Notes"; }
	getIcon(): string { return "checkbox-glyph"; }
	async onOpen(): Promise<void> { await this.render(); }
	async render(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty(); root.addClass("bsn-root");
		const navigator = root.createDiv({ cls: "bsn-navigator" });
		const previous = navigator.createEl("button", { text: "‹", attr: { "aria-label": "Previous" } });
		previous.hidden = this.plugin.logbook;
		previous.onclick = () => { this.plugin.viewingDate.setDate(this.plugin.viewingDate.getDate() - 7); void this.render(); };
		this.dateInput = navigator.createEl("input", { type: "date" });
		this.dateInput.hidden = this.plugin.logbook;
		this.dateInput.value = dayId(monday(this.plugin.viewingDate));
		this.dateInput.onchange = () => { if (this.dateInput?.value) { this.plugin.viewingDate = monday(new Date(`${this.dateInput.value}T12:00:00`)); void this.render(); } };
		const next = navigator.createEl("button", { text: "›", attr: { "aria-label": "Next" } });
		next.hidden = this.plugin.logbook;
		next.onclick = () => { this.plugin.viewingDate.setDate(this.plugin.viewingDate.getDate() + 7); void this.render(); };
		const logbook = navigator.createEl("button", { text: this.plugin.logbook ? "Weekly" : "Logbook", cls: "bsn-logbook" });
		logbook.onclick = () => { this.plugin.logbook = !this.plugin.logbook; void this.render(); };

		const file = this.plugin.logbook ? await this.plugin.notes.getLogbook() : await this.plugin.notes.ensureNote("weekly", this.plugin.viewingDate);
		if (!this.plugin.logbook) await this.plugin.forwardPreviousWeek(file, this.plugin.viewingDate);
		let entries = await this.plugin.notes.entries(file);
		if (!this.plugin.logbook) entries = await this.plugin.syncRelatedTaskDocuments(file, entries);
		const list = root.createDiv({ cls: "bsn-list" });
		for (const entry of entries) this.renderEntry(list, file, entry);
		if (!this.plugin.logbook) {
			this.renderTaskInput(root, file);
		}
		if (this.plugin.lastTrashPath) {
			const undo = root.createEl("button", { cls: "bsn-undo", text: "Undo delete" });
			undo.onclick = () => void this.plugin.run(() => this.plugin.undoDelete());
		}
	}
	private renderTaskInput(root: HTMLElement, source: TFile): void {
		const add = root.createEl("input", { cls: "bsn-add", attr: { placeholder: "Add a task or find a note…", "aria-label": "Add a task or find a note", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false" } });
		this.attachNoteSuggestions(root, source, add);
	}
	private attachNoteSuggestions(root: HTMLElement, source: TFile, add: HTMLInputElement, edit?: { entry: Entry; urlInput: HTMLInputElement }): void {
		add.setAttribute("role", "combobox");
		add.setAttribute("aria-autocomplete", "list");
		add.setAttribute("aria-expanded", "false");
		const suggestions = root.createDiv({ cls: "bsn-suggestions", attr: { role: "listbox", id: `bsn-suggestions-${crypto.randomUUID()}` } });
		add.setAttribute("aria-controls", suggestions.id);
		type Choice = { label: string; note?: TFile; create?: boolean };
		let choices: Choice[] = [];
		let selected = 0;
		let busy = false;
		const parsed = () => {
			const raw = add.value.trim();
			if (edit) return { raw, marker: "", title: displayEntryText(raw) };
			const marker = raw.match(/^(- (?:\[ \] |\( \) )?)/)?.[1] ?? "- ( ) ";
			return { raw, marker, title: raw.startsWith("- ") ? raw.slice(marker.length).trim() : raw };
		};
		const close = () => {
			suggestions.empty(); choices = [];
			add.setAttribute("aria-expanded", "false");
			add.removeAttribute("aria-activedescendant");
		};
		const highlight = () => {
			Array.from(suggestions.children).forEach((el, index) => {
				el.setAttribute("aria-selected", String(index === selected));
				el.toggleClass("is-selected", index === selected);
			});
			const active = suggestions.children[selected];
			if (active) { add.setAttribute("aria-activedescendant", active.id); active.scrollIntoView({ block: "nearest" }); }
		};
		const submit = async (choice: Choice) => {
			if (busy) return;
			const { raw, marker, title } = parsed();
			if (!title) return;
			busy = true; add.disabled = true;
			try {
				const externalUrl = edit?.urlInput.value.trim() ?? "";
				if (edit) {
					if (externalUrl && !isSafeExternalURL(externalUrl)) throw new Error("Use an http:// or https:// link.");
					const lines = (await this.app.vault.read(source)).split("\n");
					if (!sameEntry(parseLine(lines[edit.entry.line] ?? "", edit.entry.line), edit.entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
				}
				let note = choice.note;
				if (choice.create) {
					// Recheck immediately before creation in case the vault changed while typing.
					note = await this.plugin.resolveRelatedDocument(title, source.path);
					if (!note) {
						if (!validNoteTitle(title)) throw new Error("Use a note title without slashes, link markers, or filename punctuation.");
						const parent = this.app.fileManager.getNewFileParent(source.path, `${title}.md`);
						const path = `${parent.path === "/" ? "" : parent.path + "/"}${title}.md`;
						const existing = this.app.vault.getAbstractFileByPath(path);
						if (existing) {
							if (!(existing instanceof TFile) || existing.extension !== "md") throw new Error("That path already exists.");
							note = existing;
						} else note = await this.app.vault.create(path, `# ${title}\n`);
					}
				}
				if (note && this.app.vault.getAbstractFileByPath(note.path) !== note) throw new Error("That note no longer exists. Search again.");
				const value = note ? this.app.fileManager.generateMarkdownLink(note, source.path) : raw;
				if (edit) {
					await this.plugin.editEntry(source, edit.entry, value, externalUrl);
					this.editingKey = undefined;
				} else {
					const line = note ? `${marker}${value}` : raw.startsWith("- ") ? raw : `${marker}${raw}`;
					await this.app.vault.process(source, (data) => `${data}${data.endsWith("\n") ? "" : "\n"}${line}\n`);
				}
				add.value = ""; close();
				await this.plugin.refreshAll();
			} catch (error) {
				new Notice(error instanceof Error ? error.message : "Could not save the task.");
			} finally { busy = false; add.disabled = false; }
		};
		const update = () => {
			close(); selected = 0;
			const { title } = parsed();
			if (!title) return;
			const query = title.toLocaleLowerCase();
			const matches = this.app.vault.getMarkdownFiles().filter((note) => note.path.toLocaleLowerCase().includes(query));
			matches.sort((a, b) => Number(b.basename.toLocaleLowerCase() === query) - Number(a.basename.toLocaleLowerCase() === query) || Number(b.basename.toLocaleLowerCase().startsWith(query)) - Number(a.basename.toLocaleLowerCase().startsWith(query)) || a.path.localeCompare(b.path));
			choices = matches.slice(0, 8).map((note) => ({ label: `${note.basename} — ${note.path}`, note }));
			if (!matches.some((note) => note.basename.toLocaleLowerCase() === query) && validNoteTitle(title)) choices.push({ label: `Create note “${title}” and ${edit ? "update" : "add"} task`, create: true });
			choices.push({ label: `${edit ? "Save text only" : "Add task only"}: ${title}` });
			choices.forEach((choice, index) => {
				const option = suggestions.createDiv({ cls: "bsn-suggestion", text: choice.label, attr: { role: "option", id: `${suggestions.id}-${index}` } });
				option.onpointerdown = (event) => event.preventDefault();
				option.onclick = () => void submit(choice);
			});
			add.setAttribute("aria-expanded", "true"); highlight();
		};
		add.oninput = update;
		add.onfocus = update;
		add.onblur = close;
		add.onkeydown = (event) => {
			if (event.isComposing) return;
			if (event.key === "Escape") {
				event.preventDefault();
				if (!choices.length && edit) { this.editingKey = undefined; void this.render(); }
				else close();
			}
			else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				if (!choices.length) { update(); return; }
				selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
				highlight();
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (choices[selected]) void submit(choices[selected]);
				else if (edit) void submit({ label: "Save text only" });
				else update();
			}
		};
	}
	private renderEntry(parent: HTMLElement, file: TFile, entry: Entry): void {
		const key = `${file.path}:${entry.line}`;
		const editing = !this.plugin.logbook && this.editingKey === key;
		const row = parent.createDiv({ cls: `bsn-entry bsn-${entry.kind}${editing ? " is-editing" : ""}` });
		row.toggleClass("is-done", entry.done);
		let input: HTMLInputElement | undefined;
		if (entry.kind !== "bullet" && !this.plugin.logbook) {
			const check = row.createEl("input", { type: "checkbox" }); check.checked = entry.done;
			check.onchange = () => void this.runEntryAction(file, entry, (current) => this.plugin.complete(file, current), input);
		}
		if (editing) {
			const fields = row.createDiv({ cls: "bsn-edit-fields" });
			input = fields.createEl("input", { cls: "bsn-text-edit", type: "text" });
			input.value = entry.text;
			const urlInput = fields.createEl("input", { cls: "bsn-url-edit", type: "url", attr: { placeholder: "External URL (optional)" } });
			urlInput.value = entry.externalUrl ?? "";
			input.setAttribute("aria-label", "Edit task or find a note");
			this.attachNoteSuggestions(fields, file, input, { entry, urlInput });
			urlInput.onkeydown = (event) => {
				if (event.key === "Enter") { event.preventDefault(); this.finishEdit(file, entry, input!, urlInput); }
				if (event.key === "Escape") { this.editingKey = undefined; void this.render(); }
			};
			window.setTimeout(() => { input?.focus(); input?.select(); }, 0);
		} else {
			const label = row.createEl("button", { cls: "bsn-text", text: displayEntryText(entry.text), attr: { type: "button", title: "Open matching note" } });
			label.onclick = async () => {
				try {
					if (!await this.plugin.openRelatedDocument(entry.text, file.path)) {
						new Notice(`No matching note found for “${displayEntryText(entry.text)}”. Try a [[wikilink]] or check the note title.`);
					}
				} catch (error) { new Notice(error instanceof Error ? error.message : "Could not open the related note."); }
			};
		}
		if (entry.kind !== "bullet" && !this.plugin.logbook) {
			const external = row.createEl("button", { text: "↗", cls: "bsn-external", attr: { type: "button", "aria-label": "Open external task link" } });
			const url = entry.externalUrl;
			external.disabled = !url || !isSafeExternalURL(url);
			external.title = external.disabled ? "Add an http(s) URL while editing" : "Open external link in your browser";
			if (url && !external.disabled) external.onclick = () => { window.open(url, "_blank", "noopener,noreferrer"); };
		}
		if (!this.plugin.logbook) {
			const pencil = row.createEl("button", { text: "✎", cls: "bsn-edit", attr: { type: "button", "aria-label": editing ? "Finish editing" : "Edit item" } });
			pencil.onclick = () => {
				if (editing && input) this.finishEdit(file, entry, input, row.querySelector<HTMLInputElement>(".bsn-url-edit") ?? undefined);
				else { this.editingKey = key; void this.render(); }
			};
			if (editing) {
				const actions = row.createDiv({ cls: "bsn-actions" });
				const up = actions.createEl("button", { text: "↑", cls: "bsn-order", attr: { "aria-label": "Move item up" } });
				up.onclick = () => void this.runEntryAction(file, entry, (current) => this.plugin.reorderEntry(file, current, -1), input);
				const down = actions.createEl("button", { text: "↓", cls: "bsn-order", attr: { "aria-label": "Move item down" } });
				down.onclick = () => void this.runEntryAction(file, entry, (current) => this.plugin.reorderEntry(file, current, 1), input);
				const move = actions.createEl("input", { type: "date", cls: "bsn-move-date", attr: { title: "Move to date" } });
				move.onchange = () => { if (move.value) void this.runEntryAction(file, entry, (current) => this.plugin.moveEntry(file, current, new Date(`${move.value}T12:00:00`)), input); };
				const del = actions.createEl("button", { text: "×", cls: "bsn-delete", attr: { "aria-label": "Delete item" } });
				del.onclick = () => void this.runEntryAction(file, entry, (current) => this.plugin.deleteEntry(file, current), input);
			}
		}
	}
	private finishEdit(file: TFile, entry: Entry, input: HTMLInputElement, urlInput?: HTMLInputElement): void {
		const value = input.value.trim();
		if (!value) { new Notice("An item cannot be empty."); input.focus(); return; }
		const externalUrl = urlInput?.value.trim() ?? entry.externalUrl ?? "";
		if (externalUrl && !isSafeExternalURL(externalUrl)) { new Notice("Use an http:// or https:// link."); urlInput?.focus(); return; }
		this.editingKey = undefined;
		void this.plugin.run(() => value === entry.text && externalUrl === (entry.externalUrl ?? "") ? Promise.resolve() : this.plugin.editEntry(file, entry, value, externalUrl));
	}
	private runEntryAction(file: TFile, entry: Entry, action: (current: Entry) => Promise<void>, input?: HTMLInputElement): Promise<void> {
		return this.plugin.run(async () => {
			let current = entry;
			const urlInput = input?.parentElement?.querySelector<HTMLInputElement>(".bsn-url-edit");
			const value = input?.value.trim() ?? entry.text;
			const externalUrl = urlInput?.value.trim() ?? entry.externalUrl ?? "";
			if (externalUrl && !isSafeExternalURL(externalUrl)) throw new Error("Use an http:// or https:// link.");
			if (input && (value !== entry.text || externalUrl !== (entry.externalUrl ?? ""))) {
				if (!value) throw new Error("An item cannot be empty.");
				await this.plugin.editEntry(file, entry, value, externalUrl);
				current = { ...entry, text: value, externalUrl: externalUrl || undefined };
			}
			this.editingKey = undefined;
			await action(current);
		});
	}
}

class StickySettings extends PluginSettingTab {
	constructor(app: App, private plugin: BetterStickyNotes) { super(app, plugin); }
	display(): void {
		const { containerEl } = this; containerEl.empty();
		containerEl.createEl("h2", { text: "Better Sticky Notes" });
		new Setting(containerEl).setName("Notes folder").setDesc("Folder inside this vault containing Daily, Weekly, Logbook, and Trash.").addText((text) => text.setValue(this.plugin.settings.folder).onChange(async (value) => {
			try { this.plugin.settings.folder = safeFolder(value); await this.plugin.persist(); }
			catch (error) { new Notice(error instanceof Error ? error.message : "Invalid folder."); }
		}));
	}
}
