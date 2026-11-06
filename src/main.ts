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

const VIEW_TYPE = "better-sticky-notes-view";
const DEFAULT_ROOT = "Better Sticky Notes";
type Period = "daily" | "weekly";
type Kind = "task" | "check" | "bullet";
interface Settings { folder: string }
interface Entry { line: number; kind: Kind; text: string; done: boolean; doneDate?: string }
const DEFAULT_SETTINGS: Settings = { folder: DEFAULT_ROOT };

function localStamp(date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
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
	let m = raw.match(/^\s*- \[([ xX])\]\s+(.*)$/);
	if (m) return entryFromMatch(m[2], line, "check", m[1].toLowerCase() === "x");
	m = raw.match(/^\s*- \(([ xX])\)\s+(.*)$/);
	if (m) return entryFromMatch(m[2], line, "task", m[1].toLowerCase() === "x");
	m = raw.match(/^\s*- (?!\[|\()(.*)$/);
	if (m) return { line, kind: "bullet", text: m[1], done: false };
	return null;
}
function entryFromMatch(value: string, line: number, kind: Kind, done: boolean): Entry {
	const dm = value.match(/\s+@done\((\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?)\)\s*$/);
	return { line, kind, text: value.replace(/\s+@done\([^)]*\)\s*$/, ""), done, doneDate: dm?.[1] };
}
function encodeEntry(entry: Entry, text: string, done: boolean, stamp?: string): string {
	const marker = entry.kind === "check" ? (done ? "- [x] " : "- [ ] ") : entry.kind === "task" ? (done ? "- (x) " : "- ( ) ") : "- ";
	return marker + text + (done && stamp ? ` @done(${stamp})` : "");
}
function safeFolder(value: string): string {
	const parts = value.trim().replace(/\\/g, "/").split("/").filter(Boolean);
	if (!parts.length || parts.some((part) => part === "." || part === ".." || part.startsWith("."))) throw new Error("Choose a visible folder path inside the vault.");
	return parts.join("/");
}

class VaultNotes {
	constructor(private app: App, private getRoot: () => string) {}
	path(stack: string, id: string): string { return `${this.getRoot()}/${stack}/${id}`; }
	async ensureFolder(path: string): Promise<void> {
		let built = "";
		for (const part of path.split("/")) {
			built = built ? `${built}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(built)) await this.app.vault.createFolder(built);
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
	async entries(file: TFile): Promise<Entry[]> {
		const data = await this.app.vault.read(file);
		return data.split("\n").map((line, i) => parseLine(line, i)).filter((x): x is Entry => x !== null);
	}
	async title(file: TFile): Promise<string> {
		const heading = (await this.app.vault.read(file)).match(/^#\s+(.+)$/m)?.[1]?.trim();
		return heading || file.basename;
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
	return !!current && current.kind === expected.kind && current.text === expected.text && current.done === expected.done && current.doneDate === expected.doneDate;
}

export default class BetterStickyNotes extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;
	notes!: VaultNotes;
	period: Period = "daily";
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
	async editEntry(file: TFile, entry: Entry, value: string): Promise<void> {
		await this.notes.updateLine(file, entry, () => encodeEntry(entry, value, entry.done, entry.doneDate));
		if (entry.done && entry.doneDate) {
			const title = await this.notes.title(file);
			await this.replaceLogbookTitle(entry.text, value, title, title, entry.doneDate);
		}
	}
	async reorderEntry(file: TFile, entry: Entry, direction: -1 | 1): Promise<void> {
		await this.app.vault.process(file, (data) => {
			const lines = data.split("\n");
			if (!sameEntry(parseLine(lines[entry.line] ?? "", entry.line), entry)) throw new Error("This note changed outside the plugin. Refresh and try again.");
			let target = entry.line + direction;
			while (target >= 0 && target < lines.length && !parseLine(lines[target], target)) target += direction;
			if (target < 0 || target >= lines.length) return data;
			[lines[entry.line], lines[target]] = [lines[target], lines[entry.line]];
			return lines.join("\n");
		});
	}
	async deleteEntry(file: TFile, entry: Entry): Promise<void> {
		const trashFolder = `${this.settings.folder}/.trash`;
		await this.notes.ensureFolder(trashFolder);
		const path = `${trashFolder}/${Date.now()}-${file.basename}-${entry.line}.json`;
		await this.app.vault.create(path, JSON.stringify({ path: file.path, line: entry.line, content: await this.app.vault.read(file).then((v) => v.split("\n")[entry.line]) }, null, 2));
		await this.app.vault.process(file, (data) => {
			const lines = data.split("\n");
			if (!sameEntry(parseLine(lines[entry.line] ?? "", entry.line), entry)) throw new Error("This note changed outside the plugin. The deleted item is saved in Trash.");
			lines.splice(entry.line, 1);
			return lines.join("\n");
		});
		this.lastTrashPath = path;
	}
	async undoDelete(): Promise<void> {
		if (!this.lastTrashPath) return;
		const trashFile = this.app.vault.getAbstractFileByPath(this.lastTrashPath);
		if (!(trashFile instanceof TFile)) throw new Error("No recent deleted item is available to restore.");
		const record = JSON.parse(await this.app.vault.read(trashFile)) as { path: string; line: number; content: string };
		const original = this.app.vault.getAbstractFileByPath(record.path);
		if (!(original instanceof TFile)) throw new Error("The original note no longer exists.");
		await this.app.vault.process(original, (data) => {
			const lines = data.split("\n"); lines.splice(Math.min(record.line, lines.length), 0, record.content); return lines.join("\n");
		});
		await this.app.vault.delete(trashFile);
		this.lastTrashPath = undefined;
	}
	async moveEntry(file: TFile, entry: Entry, date: Date): Promise<void> {
		const target = await this.notes.ensureNote(this.period, date);
		if (target.path === file.path) return;
		const line = encodeEntry(entry, entry.text, entry.done, entry.doneDate);
		await this.app.vault.process(target, (data) => data.endsWith("\n") ? data + `${line}\n` : `${data}\n${line}\n`);
		await this.app.vault.process(file, (data) => { const lines = data.split("\n"); if (!sameEntry(parseLine(lines[entry.line] ?? "", entry.line), entry)) throw new Error("Copied to destination, but source changed and was kept."); lines.splice(entry.line, 1); return lines.join("\n"); });
		if (entry.done && entry.doneDate) await this.replaceLogbookTitle(entry.text, entry.text, await this.notes.title(file), await this.notes.title(target), entry.doneDate);
	}
}

class StickyView extends ItemView {
	private dateInput?: HTMLInputElement;
	constructor(leaf: WorkspaceLeaf, private plugin: BetterStickyNotes) { super(leaf); }
	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Better Sticky Notes"; }
	getIcon(): string { return "checkbox-glyph"; }
	async onOpen(): Promise<void> { await this.render(); }
	async render(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty(); root.addClass("bsn-root");
		const header = root.createDiv({ cls: "bsn-header" });
		const title = header.createEl("button", { cls: "bsn-title", text: this.plugin.logbook ? "Logbook" : noteTitle(this.plugin.period, this.plugin.viewingDate) });
		title.onclick = () => { this.plugin.logbook = !this.plugin.logbook; void this.render(); };
		const period = header.createEl("select", { cls: "bsn-period" });
		for (const p of ["daily", "weekly"] as Period[]) { const option = period.createEl("option", { text: p === "daily" ? "Daily" : "Weekly", value: p }); option.selected = p === this.plugin.period; }
		period.onchange = () => { this.plugin.period = period.value as Period; this.plugin.logbook = false; void this.render(); };
		const navigator = root.createDiv({ cls: "bsn-navigator" });
		const previous = navigator.createEl("button", { text: "‹", attr: { "aria-label": "Previous" } });
		previous.onclick = () => { this.plugin.viewingDate.setDate(this.plugin.viewingDate.getDate() - (this.plugin.period === "weekly" ? 7 : 1)); void this.render(); };
		this.dateInput = navigator.createEl("input", { type: "date" });
		this.dateInput.value = dayId(this.plugin.period === "weekly" ? monday(this.plugin.viewingDate) : this.plugin.viewingDate);
		this.dateInput.onchange = () => { if (this.dateInput?.value) { this.plugin.viewingDate = new Date(`${this.dateInput.value}T12:00:00`); void this.render(); } };
		const next = navigator.createEl("button", { text: "›", attr: { "aria-label": "Next" } });
		next.onclick = () => { this.plugin.viewingDate.setDate(this.plugin.viewingDate.getDate() + (this.plugin.period === "weekly" ? 7 : 1)); void this.render(); };
		const today = navigator.createEl("button", { text: this.plugin.period === "weekly" ? "This week" : "Today" });
		today.onclick = () => { this.plugin.viewingDate = new Date(); this.plugin.logbook = false; void this.render(); };
		const pop = navigator.createEl("button", { text: "Pop out", attr: { "aria-label": "Open separate window" } });
		pop.hidden = !Platform.isDesktopApp;
		pop.onclick = () => void this.plugin.activateView(true);

		const file = this.plugin.logbook ? await this.plugin.notes.getLogbook() : await this.plugin.notes.ensureNote(this.plugin.period, this.plugin.viewingDate);
		const entries = await this.plugin.notes.entries(file);
		const list = root.createDiv({ cls: "bsn-list" });
		for (const entry of entries) this.renderEntry(list, file, entry);
		if (!this.plugin.logbook) {
			const add = root.createEl("input", { cls: "bsn-add", attr: { placeholder: "Add a task…" } });
			add.onkeydown = (event) => {
				if (event.key !== "Enter" || !add.value.trim()) return;
				const raw = add.value.trim(); add.value = "";
				const line = raw.startsWith("- [ ] ") || raw.startsWith("- ( ) ") || raw.startsWith("- ") ? raw : `- ( ) ${raw}`;
				void this.plugin.run(async () => { await this.app.vault.append(file, `${line}\n`); });
			};
			add.onblur = () => { if (!add.value.trim()) return; const raw = add.value.trim(); add.value = ""; void this.plugin.run(async () => this.app.vault.append(file, `${raw.startsWith("- ") ? raw : `- ( ) ${raw}`}\n`).then(() => undefined)); };
		}
		if (this.plugin.lastTrashPath) {
			const undo = root.createEl("button", { cls: "bsn-undo", text: "Undo delete" });
			undo.onclick = () => void this.plugin.run(() => this.plugin.undoDelete());
		}
	}
	private renderEntry(parent: HTMLElement, file: TFile, entry: Entry): void {
		const row = parent.createDiv({ cls: `bsn-entry bsn-${entry.kind}` });
		if (entry.kind !== "bullet" && !this.plugin.logbook) {
			const check = row.createEl("input", { type: "checkbox" }); check.checked = entry.done;
			check.onchange = () => void this.plugin.run(() => this.plugin.complete(file, entry));
		}
		const text = row.createEl("input", { cls: "bsn-text", type: "text" }); text.value = entry.text; text.readOnly = this.plugin.logbook;
		text.onblur = () => {
			if (text.value === entry.text || this.plugin.logbook) return;
			const value = text.value.trim();
			if (!value) { text.value = entry.text; new Notice("An item cannot be empty."); return; }
			void this.plugin.run(() => this.plugin.editEntry(file, entry, value));
		};
		if (!this.plugin.logbook) {
			const up = row.createEl("button", { text: "↑", cls: "bsn-order", attr: { "aria-label": "Move item up" } });
			up.onclick = () => void this.plugin.run(() => this.plugin.reorderEntry(file, entry, -1));
			const down = row.createEl("button", { text: "↓", cls: "bsn-order", attr: { "aria-label": "Move item down" } });
			down.onclick = () => void this.plugin.run(() => this.plugin.reorderEntry(file, entry, 1));
			const move = row.createEl("input", { type: "date", cls: "bsn-move-date", attr: { title: "Move to date" } });
			move.onchange = () => { if (move.value) void this.plugin.run(() => this.plugin.moveEntry(file, entry, new Date(`${move.value}T12:00:00`))); };
			const del = row.createEl("button", { text: "×", cls: "bsn-delete", attr: { "aria-label": "Delete item" } });
			del.onclick = () => void this.plugin.run(() => this.plugin.deleteEntry(file, entry));
		}
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
