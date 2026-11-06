# Better Sticky Notes for Obsidian

A compact daily and weekly task view backed by Markdown files in your vault. Works on Obsidian desktop and mobile; the separate pop-out window is available on desktop.

## Install

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/better-sticky-notes/`, then enable **Better Sticky Notes** in Obsidian's Community Plugins settings. For development, run `npm install` and `npm run build` in this folder.

## Use

Open the view from the ribbon icon or the command palette. Choose Daily or Weekly and navigate with the date picker or arrows. Click the title to switch between the note and Logbook. Add items in the field at the bottom; `( )` items are tasks, `[ ]` items are checklists, and `-` items are bullets. Checking an item stamps `@done(yyyy-MM-dd HH:mm:ss)` and adds it to the Logbook. Use a row's date field to move it, or × to delete it; Undo delete restores the most recent item. Change the vault-relative collection folder in plugin settings.

Daily notes live in `Daily/`, Monday-start weekly notes in `Weekly/`, completed items in `Logbook/Logbook.md`, and deleted items in `.trash/`, all under the configured collection folder.

The pop-out is an Obsidian window and closes with its vault. A fully independent window that outlives Obsidian is not supported by the plugin API.
