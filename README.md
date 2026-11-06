# Better Sticky Notes for Obsidian

A compact daily and weekly task view backed by Markdown files in your vault. Works on Obsidian desktop and mobile; the separate pop-out window is available on desktop.

## Install

Create `<vault>/.obsidian/plugins/better-sticky-notes/`, then download these three files directly into it:

- [main.js](https://raw.githubusercontent.com/jamesmcculley/obsidian-better-sticky-notes/main/main.js)
- [manifest.json](https://raw.githubusercontent.com/jamesmcculley/obsidian-better-sticky-notes/main/manifest.json)
- [styles.css](https://raw.githubusercontent.com/jamesmcculley/obsidian-better-sticky-notes/main/styles.css)

Enable **Better Sticky Notes** in Obsidian's Community Plugins settings. For development, clone the repository, run `npm install`, then `npm run build`.

## Use

Open the view from the ribbon icon or the command palette. Choose Daily or Weekly and navigate with the date picker or arrows. Click the title to switch between the note and Logbook. Click an item name to open a matching vault note (plain names such as `Doc1`, `[[wikilinks]]`, and Markdown links are supported); click a name with no matching note to edit it. Add items in the field at the bottom; `( )` items are tasks, `[ ]` items are checklists, and `-` items are bullets. Checking an item stamps `@done(yyyy-MM-dd HH:mm:ss)` and adds it to the Logbook. Use a row's date field to move it, or × to delete it; Undo delete restores the most recent item. Change the vault-relative collection folder in plugin settings.

Daily notes live in `Daily/`, Monday-start weekly notes in `Weekly/`, completed items in `Logbook/Logbook.md`, and deleted items in `.trash/`, all under the configured collection folder.

The pop-out is an Obsidian window and closes with its vault. A fully independent window that outlives Obsidian is not supported by the plugin API.
