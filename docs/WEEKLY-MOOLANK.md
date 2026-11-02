# Weekly Moolank readings

When a visitor finds their Moolank (on the Free insight page or the home page), the site also shows **this week's
reading for their number**, if one has been published for the current week. Outside its week a reading is hidden
automatically, so an old week never stays up by mistake. If there is no reading, nothing is shown.

## Where the readings live

One file: `public/weekly/moolank.json`

```json
{
  "weekStart": "2026-11-02",
  "weekEnd": "2026-11-08",
  "post": "https://www.instagram.com/p/XXXXXXXX/",
  "readings": {
    "1": { "text": "Reading for Moolank 1.", "highlights": [{ "label": "Lucky colour", "value": "Yellow" }, { "label": "Lucky day", "value": "Sunday" }] },
    "2": { "text": "Reading for Moolank 2." },
    "9": { "text": "Reading for Moolank 9." }
  }
}
```

- `weekStart` / `weekEnd`: the first and last day of the week, as `YYYY-MM-DD`. A reading shows from the start of
  `weekStart` to the end of `weekEnd` (visitor's own time).
- `post` (optional): link to the Instagram post. Only `instagram.com` links are shown.
- `readings`: one entry per Moolank, `"1"` to `"9"`. Any number can be left out.
  - `text`: the reading (up to 1,200 characters). A blank line starts a new paragraph.
  - `highlights` (optional): up to 4 short label and value pairs, for example lucky colour, lucky day, lucky number.

The site checks the file before using it and ignores anything malformed.

## Updating it by hand

Send the week's readings (or the Instagram post) to Claude, or edit the file, then deploy. On Vercel a push to the
main branch redeploys the site in about a minute.

## Automating it from Instagram

The idea: each weekly post uses a fixed caption format; an automation reads the newest post, turns the caption into
the file above, and commits it to GitHub; Vercel redeploys on its own.

1. **Make the Instagram account a Professional account** (Business or Creator) and link it to a Facebook Page.
   The Instagram API only works for professional accounts.
2. **Create a Meta developer app** at developers.facebook.com, add the Instagram API product, and generate a
   long-lived access token that can read the account's posts. The token lasts 60 days; the automation refreshes it.
3. **Write every weekly post's caption in one fixed format**, so it can be read reliably (text inside images cannot):

   ```
   #AnkiroWeekly 2 Nov - 8 Nov
   Moolank 1: reading for 1...
   Moolank 2: reading for 2...
   ...
   Moolank 9: reading for 9...
   ```

   An Instagram caption holds 2,200 characters, so about 200 characters per number. For longer readings, keep them
   in a Google Sheet instead and let the automation read the sheet.
4. **Build the automation** in n8n (or Make, or Zapier):
   - Trigger: every Monday morning, or every hour.
   - Fetch the newest posts: `GET https://graph.instagram.com/me/media?fields=id,caption,permalink,timestamp`.
   - Keep the newest post whose caption starts with `#AnkiroWeekly`.
   - Turn the caption into the JSON above (one small code step: dates from the first line, one reading per
     `Moolank N:` line, `post` = the permalink).
   - Save it with the GitHub "create or update file" action to `public/weekly/moolank.json` on the main branch,
     using a fine-grained GitHub token limited to this one repository (Contents: read and write).
5. **Vercel redeploys** automatically after the commit. The new readings are live about a minute later.
6. **Test once**: run the automation by hand after a post, then open the Free insight page and enter a date.

Order of work: this needs the new site (this project) to be the live ankiro.in first, because the file lives here.
