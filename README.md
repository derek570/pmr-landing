# PMR Bike Couriers website

Static site for PMR Bike Couriers, served by GitHub Pages from `main`. There's no
build step: edit the HTML, CSS, and JavaScript directly.

| Page | File |
|---|---|
| Home | `index.html` |
| Services | `services.html` |
| About us | `about.html` |
| Gallery | `gallery.html` (photos come from `assets/gallery/gallery.json`) |
| Contact | `contact.html` (phone, email and social links; the quote form opens WhatsApp, with an email fallback) |

The header and footer are repeated in every page. When you change one, change all five.

## Update the gallery

Each folder in `iCloud Drive/PMR Website Gallery/` becomes one scrolling reel on the
gallery page. The `READ ME.txt` in that folder explains the layout for John.

1. Put the photos into the iCloud folders.
2. Run the importer, which resizes the photos and rewrites `gallery.json`:

   ```sh
   python3 scripts/import-gallery.py --dry-run   # check what it found
   python3 scripts/import-gallery.py
   ```

3. Check `gallery.html` locally (`python3 -m http.server`), then commit.

The importer replaces every reel in `assets/gallery/`, so the iCloud folder is the
only source of truth. Photos still in `assets/img/` aren't touched.

## Review mode

Review mode lets John comment on any part of any page. He double-taps (or
double-clicks) the text or photo he means. The comment then records the section and
what he tapped. Each section marked `data-review="..."` also gets a **Comment**
button. Comments are either a comment or change, or new content to add. Anyone in
review mode can mark one done or delete it.

While the site is a private draft that only John has the link to, review mode is
on for every visitor. `DRAFT_OPEN` in `js/review.js` turns it on, and the Worker
variable `OPEN_REVIEW` accepts comments without the key. **Exit review** turns it
off in that browser, and `?review=<key>` turns it back on. With both settings off,
only `?review=<key>` turns review mode on.

Comments are stored by the `pmr-site-review` Cloudflare Worker in the D1 database
`pmr-site-review`. The source is in `review-worker/`.

- The key is the Worker secret `REVIEW_KEY`. Derek's local copy is
  `review-worker/.review-key`, which isn't committed.
- To rotate the key, run `wrangler secret put REVIEW_KEY` in `review-worker/` and
  send John a new link. Old links stop working at once.
- To read comments from the terminal:

  ```sh
  cd review-worker
  npx wrangler d1 execute pmr-site-review --remote \
    --command "SELECT page, section_label, kind, author, body, status FROM comments ORDER BY created_at"
  ```

- To deploy Worker changes, run `npx wrangler deploy` in `review-worker/`.
- Schema changes live in `review-worker/migrations/`. Apply one with
  `npx wrangler d1 execute pmr-site-review --remote --file migrations/<file>`.

To add a commentable section, give the element `data-review="unique-key"` and
`data-review-label="Page: what it is"`.

## Before launch

- Remove `noindex` from every page and update `robots.txt`.
- Set `DRAFT_OPEN` to `false` in `js/review.js`, and set `OPEN_REVIEW` to `"false"`
  in `review-worker/wrangler.jsonc`, then redeploy the Worker. Otherwise every
  visitor sees review mode and can post comments.
- Alternatively, remove `<script src="js/review.js">` from every page.

## Contact routes

Every red button opens WhatsApp to 07495 749 650 (`wa.me/447495749650`), with a
message prefilled for that button. The `.btn--wa` class adds the WhatsApp icon.
Phone and email appear only on `contact.html`. Every other page links to it
through an **Other ways to contact us** button.

On a computer (mouse or trackpad as the main pointer), `pcContactRoute()` in
`js/main.js` sends red buttons to the contact page instead, relabels "WhatsApp
us" as "Contact us" and hides the grey duplicate. The quote form then sends by
email. Phones and tablets keep WhatsApp.
