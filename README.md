# Better Sticky Notes for Obsidian

A compact daily and weekly task view backed by Markdown files in your vault. Works on Obsidian desktop and mobile; the separate pop-out window is available on desktop.

## Install

Create `<vault>/.obsidian/plugins/better-sticky-notes/`, then download these three files directly into it:

- [main.js](https://raw.githubusercontent.com/jamesmcculley/obsidian-better-sticky-notes/main/main.js)
- [manifest.json](https://raw.githubusercontent.com/jamesmcculley/obsidian-better-sticky-notes/main/manifest.json)
- [styles.css](https://raw.githubusercontent.com/jamesmcculley/obsidian-better-sticky-notes/main/styles.css)

Enable **Better Sticky Notes** in Obsidian's Community Plugins settings. For development, clone the repository, run `npm install`, then `npm run build`.

## Use

Open the view from the ribbon icon or the command palette. It opens weekly notes by default; navigate weeks with the date picker or arrows. Use the **Logbook** button to switch views. Click an item name to open a matching vault note (plain names such as `Doc1`, `[[wikilinks]]`, and Markdown links are supported). Click the pencil to edit an item or reveal its reorder, move, and delete controls. Add items in the field at the bottom; `( )` items are tasks, `[ ]` items are checklists, and `-` items are bullets. Checking an item stamps `@done(yyyy-MM-dd HH:mm:ss)` and adds it to the Logbook. Undo delete restores the most recent item. Change the vault-relative collection folder in plugin settings.

Monday-start weekly notes live in `Weekly/`, completed items in `Logbook/Logbook.md`, and deleted items in `.trash/`, all under the configured collection folder. Weekly notes get frontmatter for `created`, `start`, `last_modified`, `status`, `done`, and `week_of`. The `bsn_tasks` frontmatter list tracks each task's status and dates, its weekly-note reference, and an optional `external_url`. If a task name resolves to a vault note, that note also gets a `bsn_related_tasks` frontmatter list with the task status, dates, week link, and external URL. Open a task's external-link button in the system browser; set or change its URL from the pencil editor. When the current week opens, unfinished tasks from the previous week are copied forward, and the previous note records where each task was forwarded.

The pop-out is an Obsidian window and closes with its vault. A fully independent window that outlives Obsidian is not supported by the plugin API.
