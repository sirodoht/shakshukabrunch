# Shakshuka Sunday

A playful, live brunch hub for the second brunch on Sunday, 18 October 2026.
The first brunch, on 19 July 2026, is preserved at `/first-brunch`.
The site includes the day plan, RSVP and contribution tracking, a recipe that
scales with confirmed guests, a shared song queue, a live event board, and photo uploads.

## Run it

```sh
bun install
bun run dev
```

Then open `http://localhost:3000`.

## Brunch data

Guest data is stored locally in `data/state.json`. Each brunch has its own RSVP,
song, and photo lists under a stable ID:

```json
{
  "version": 2,
  "activeBrunchId": "first-brunch",
  "brunches": {
    "first-brunch": {
      "rsvps": [],
      "songs": [],
      "photos": []
    }
  }
}
```

Photo files live in `data/uploads/<brunch-id>/`; their URLs are
`/uploads/<brunch-id>/<filename>`. The main page loads the brunch selected by
`activeBrunchId`. The archive always loads `first-brunch`, independently of
which brunch is active.

New photo uploads also get an 800px WebP preview stored in
`data/previews/<brunch-id>/<uuid>.webp` and served at `/previews/<brunch-id>/<uuid>.webp`.
The current page uses this same preview for its gallery and printing; opening a
photo full screen uses the unchanged original. Existing photos without previews
continue to work. Deleting a photo removes both versions. Image URLs support
long-lived browser caching and conditional requests.

With the app stopped, create another brunch using:

```sh
bun run brunch:create second-brunch
```

Add `--activate` to also select the new brunch for the main page:

```sh
bun run brunch:create second-brunch --activate
```

To select an existing brunch, change `activeBrunchId` in `data/state.json` to its
ID while the app is stopped. This only selects its data; page dates and other
event copy still live in the HTML and scripts.

On startup, the app automatically migrates the original single-brunch JSON and
flat uploads directory into `first-brunch`. It preserves the originals in
`data/backups/before-multibrunch/` before moving photos or rewriting JSON.
Migration is safe to rerun and does not clear malformed or missing data.
The JSON, uploads, and migration backups are all ignored by Git.

The existing `/api/state`, RSVP, song, and photo endpoints operate on the active
brunch. The same endpoints are available under `/api/brunches/<brunch-id>/`
(for example, `/api/brunches/first-brunch/state`). The main page uses the returned
brunch ID for subsequent writes so a tab cannot accidentally submit to another
brunch after the active selection changes.

## First brunch archive

`/first-brunch` (also `/first-brunch/`) keeps a fixed copy of the original page's
HTML, styles, and scripts in `public/first-brunch/`. It loads
`/api/brunches/first-brunch/state` and `/uploads/first-brunch/` photos from the
original data store. There are no duplicate data or photo files in the archive.
Edits to the first brunch's data appear in the archive when reloaded.

All submission forms and RSVP buttons are omitted. Recipe controls are disabled,
the event board is frozen at 30 September 2026, and the archive only reads data.
The guest list, gallery viewing, playlist links, and Print still work.
Archive routes only accept GET and HEAD.

## Checks

```sh
bun run check
bun test
```
