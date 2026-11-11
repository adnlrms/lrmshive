# LRMS-HIVE
**H**ub for **I**nnovation and **V**ersatile materials for **E**ducation
Learning Resource Management Section · Division of Agusan del Norte

A tile-based, installable learning resource website.
**Frontend:** GitHub Pages · **Backend:** Google Apps Script · **Database:** Google Sheets · **Storage:** Google Drive

---

## What's inside

```
index.html               the website (one page)
manifest.webmanifest     makes it installable as an app
sw.js                    offline/fast-loading service worker
assets/css/hive.css      design
assets/js/config.js      ← the only file you must edit (API_URL)
assets/js/app.js         tiles, entry screen, viewer, search, assistant
assets/js/admin.js       admin login + settings tabs
assets/js/api.js         talks to Apps Script (or demo data)
assets/js/search.js      instant search engine
assets/js/seed.js        starter tiles/resources
assets/js/flipbook.js    storybook flipbook
assets/js/report.js      report engine (shared with backend/Report.gs)
assets/js/map.js         Library Map (coverage engine + interactive map)
assets/vendor/leaflet/   Leaflet map library (BSD-2), loaded only on the map page
assets/vendor/           pdf.js (Apache-2.0) and StPageFlip (MIT), loaded only for flipbooks
assets/sample/           sample storybook PDF used by the demo
assets/img/              app icons
backend/Code.gs          Apps Script backend
backend/Seed.gs          starter content for the Sheet
backend/Report.gs        report engine (same code as assets/js/report.js)
backend/appsscript.json  Apps Script settings
```

The site works right away in **demo mode** (no backend): open it, log in as admin with password `demo`. Demo edits stay in that browser only.

---

## Setup (about 20 minutes)

### Step 1 — Google Sheet + Apps Script (the backend)
1. Sign in to the Google account that will **own** the system.
   *Tip:* a DepEd (`@deped.gov.ph`) account may be blocked from publishing web apps to "Anyone". If that happens, use the office Gmail (e.g. agnor.lrmc@gmail.com).
2. Create a new blank Google Sheet. Name it **LRMS-HIVE Database**.
3. In the Sheet: **Extensions › Apps Script**.
4. Delete the sample code in `Code.gs`, then paste the whole content of `backend/Code.gs`.
5. Click **+ › Script**, name it `Seed`, paste `backend/Seed.gs`. Do the same for `Report` with `backend/Report.gs`.
6. Click the gear (**Project Settings**) › tick **Show "appsscript.json"** › open `appsscript.json` in the editor and replace it with `backend/appsscript.json`.
7. Back in the editor, choose the function **setup** in the toolbar and press **Run**. Approve the permissions.
8. Open **Execution log** — it shows the **admin password** (like `Hive-3f9a12bc`). Write it down.
   The Sheet now has tabs: Settings, Sections, Resources, Announcements, News, Events, Schools, Districts, Feedback, Activity, Visitors, Admins, Log.

### Step 2 — Publish the backend
1. **Deploy › New deployment** › type **Web app**.
2. *Execute as:* **Me** · *Who has access:* **Anyone**. Press **Deploy**.
3. Copy the **Web app URL** (ends in `/exec`).

### Step 3 — Put the website on GitHub Pages
1. Create a GitHub repository, e.g. `lrms-hive` (Public).
2. Open `assets/js/config.js` and paste the URL:
   ```js
   API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
3. Upload **all files** (keep the folders) to the repository: **Add file › Upload files**.
   Do **not** upload the `backend` folder if you prefer (it is not needed by the website).
4. **Settings › Pages** › *Source:* Deploy from a branch › *Branch:* `main` / root › Save.
5. After 1–2 minutes the site is live at `https://<your-username>.github.io/lrms-hive/`.

### Step 4 — First login
1. Open the site, fill in the entry form, then press **Admin** (top right).
2. Username `admin`, the password from Step 1.
3. **Admin settings › Accounts & system**:
   - change the password;
   - paste the **Drive storage folder** link (the folder the admin prepared). Uploads go here.
4. Replace the sample links: open any tile, press the honey **pencil** on a resource, paste its Drive link.
   Items marked **"Link not set"** are samples waiting for real links.

---

## Daily use for the admin

| I want to… | Do this |
|---|---|
| Add a resource | Open the tile › **Add a resource here** › paste a Drive link (or upload a file) › Save |
| Add many files at once | Open the tile › **Import from a Drive folder** › paste folder link › tick files › Import |
| Add a custom tile | **Add a tile here** (on the page) or **Admin › Tiles & layout** › choose a kind: **Folder**, **Link** (to a website or any page of the site), **Interactive** (a game, quiz or simulation played on the tile), **Video**, **Text note**, **Picture**, or **Widget** (clock, visitor count, search, assistant, meet the team). Set size (normal, wide, full width, tall, big), color (7 presets or your own), icon and background picture. |
| Arrange tiles | While logged in, **drag the handle** (four squares) on any tile on the page — or in **Admin › Tiles & layout** |
| Group tiles under headings | **Admin › Tiles & layout › Groups** — add, rename, drag to reorder; pick each tile's group from its list |
| Sort tiles automatically | **Admin › Tiles & layout › Sort automatically** — A–Z, Z–A, most items, newest, by color, by group |
| Arrange resources in a section | Drag them on the page, or **Admin › Resources** › pick the section › drag or sort (A–Z, newest, most opened, by grade). A folder tile can also sort its items automatically (edit the tile › *Sort the resources inside*). |
| Embed a game, quiz, simulation or website | Add a resource with its link **or the &lt;iframe&gt; embed code** from the site (Wordwall, Genially, Scratch, PhET, Canva, H5P, Google Slides…) › *How teachers see it* › **Show on the page**. Teachers press **Play** and use it right there, with a Full screen button. |
| Show a video | Paste a YouTube, Vimeo, Facebook, Loom or Google Drive video link, or an .mp4 link — it plays inside the site |
| Make a storybook flipbook | Add a resource of kind **Book** with the storybook PDF (Drive link or upload). It opens as a page-turning flipbook automatically. Google Slides storybooks work too. |
| Set the visitor count | **Admin › Visitors › Visitor counter** › type the number to show (e.g. the old Google Site's count) — new visits keep adding to it |
| See reports | **Admin › Dashboard & reports** — choose a period (this month, last month, school year, custom dates). Shows visits by month, district and school; resources opened and downloaded; most-used subjects and grades; most-used and best-rated resources; teachers' comments; and **searched but not found** words (with a button to add a resource for them). |
| Export for accomplishment reports | **Dashboard & reports** › **Export to Google Sheets** (one sheet, many tabs, saved in the storage folder) or **Download CSV** (opens in Excel). Each chart also has its own CSV. |
| Read teachers' feedback | Teachers tap **Useful**, **Used in class** or **Needs improvement** under any resource and may add a comment. See the ranking and comments in the dashboard; **All feedback (CSV)** downloads everything. Comments are private to admins. |
| Add an event | **Events** (top menu) › **Add an event** while logged in, or **Admin › Events**. Set the kind (Training, Writeshop, Deadline, Catch-Up Friday…), dates, time or whole day, weekly repeat (for Catch-Up Fridays), place, details, and **attach the memo** (link or upload). Teachers see a month calendar, upcoming events on the home page, reminders for today/tomorrow and coming deadlines, and can **add events to Google Calendar or their phone (.ics)**. |
| Put schools and districts on the Library Map | **Map** (top menu) › **Add a school** while logged in, or **Admin › Library map**. Paste coordinates (“9.0453, 125.5432”), a Google Maps link, or degrees-minutes-seconds — or tap the small map, or use **My current location** when you are at the school. Choose *No library / School library / Library Hub*, the number of learners and whether learning resources are enough, lacking or severely lacking. |
| Add many schools at once | **Admin › Library map › Bulk input** — copy rows from Excel or Google Sheets **with the header row** and paste, or choose a CSV file. **Download template** shows the columns. **Check rows** previews everything and flags missing or wrong coordinates before saving. Re-pasting the same schools updates them (matched by School ID, or by name and district). |
| Set coverage and colors | **Admin › Library map › Map settings** — how far a Library Hub reaches (default 10 km) and how far a school library reaches (default 1 km), the colors for hubs, school libraries, reached schools, schools in need and schools lacking resources, the map style, and the ripple animation. Any school or district can have its own coverage distance. |
| Post news | **News** (top menu) › **Add news** while logged in, or **Admin › News**. Add a headline, date, category, story, **many photos at once** (they open in a gallery), a Facebook post link (shown inside the news), and an optional button. Pin important news. |
| Show the LRMS Facebook page | **Admin › News** › *Facebook page link* — its latest posts appear beside the news. You can also add a **Facebook page feed** widget tile. The page and posts must be Public. |
| Add background pictures | **Admin › Backgrounds** — separate pictures for the main page, the loading/welcome screen and other pages. Choose how it blends (fade from the top, soft edges, sides, corners, bottom, or very light wash), the strength, and *Blend with the theme colors*. A live preview shows the result. |
| Use OneDrive / SharePoint files | Paste the share link like any other link. Word, PowerPoint, Excel and PDF files preview inside the site; storybook PDFs open as flipbooks. Short `1drv.ms` links are expanded when you save. |
| Edit the About page | **Admin › About page** — introduction, vision, mission, core values, what the LRMS does, history, org chart picture, and team members with photos |
| Put a tile inside another tile | Edit the tile › *Place this tile in* |
| Show book covers | Edit the tile › *How items are shown* › **Bookshelf** (covers come from the file or the *Cover image link*) |
| Post an announcement | **Admin › Announcements** (can auto-hide after a date) |
| Change the logo | **Admin › Logo & name** › Upload (or paste a Drive link) › choose size, shape (as uploaded / rounded / circle / hexagon) and background › optional second logo (e.g. SDO seal) › Save. The logo also appears in the intro animation, the footer and the browser tab. |
| Change the name / tagline / office line | **Admin › Logo & name** (the tagline and office line each stay on one line on every screen) |
| Edit the footer | **Admin › Footer** (contacts, links, note) |
| Change the welcome form | **Admin › Entry screen** — heading, message, button text, privacy statement, and the CAPITAL-LETTERS setting |
| See who visited | **Admin › Visitors** (download CSV) or the *Visitors* tab of the Sheet |
| Add another admin | **Admin › Accounts & system** (owner only) |

**Drive sharing:** every file/folder you link must be shared as **"Anyone with the link – Viewer"**, otherwise teachers see a "request access" page.

**Editing the Sheet directly** is fine. Changes appear on the site within seconds (the Sheet menu **LRMS-HIVE › Refresh website data now** forces it).

---

## About the Library Map
- **How coverage is worked out:** a school *has library access* if it has its own library or Library Hub, or if it lies within the coverage distance of a Library Hub (default 10 km) or of another school's library (default 1 km). All other mapped schools are counted as **needing library access**. Distances are straight-line, so mountains and rivers are not considered — adjust the distance of a hub that serves a hard-to-reach area.
- **Districts needing a hub:** a district is marked red if it has no Library Hub and some of its schools need access, or if half or more of its schools need access.
- **Plan a new hub:** tap **Plan a new hub**, then tap the map. It shows how many schools in need, and how many learners, a hub at that spot would reach. Admins can save that spot as a hub.
- **Map pictures** come from OpenStreetMap (street map), CARTO (light map) or Esri (satellite), so the map needs internet. The schools, numbers and lists still show without it.
- District locations in the starter data are approximate town centres, and the sample schools are placeholders. Replace both with real data.

## Notes on Microsoft links
- Share OneDrive/SharePoint files as **“Anyone with the link can view”**. If your SharePoint only allows DepEd accounts, teachers see a Microsoft sign-in box inside the preview (they can sign in with their DepEd Microsoft account).
- Folders from OneDrive/SharePoint cannot be shown inside another website; teachers get an Open button.
- The most reliable OneDrive option is **Share › Embed** — paste the code it gives you as the link.

## Putting your own systems on LRMS-HIVE
Systems the LRMS developed (Apps Script web apps, Google Sites, Glide/AppSheet apps, Canva sites, GitHub Pages apps…) go in the **LRAPPS** tile, which shows them as an **app launcher** (any section can use it: *Edit section › How items are shown › App launcher*).

1. **Admin › Resources › Add resource** (or the honey **+** inside LRAPPS). Kind: **App / Game**. Paste the system's link.
2. Press **Test this link**. It tells you whether teachers can open it and whether it can be shown *inside* LRMS-HIVE.
3. Choose **How teachers see it**:
   - **Open directly in a new tab** — best for systems with a login, file downloads, camera/microphone, or Google sign-in. Teachers tap **Launch** and the system opens in its own tab.
   - **Show on the page** / **Open in the viewer** — for systems that allow embedding. Camera, microphone and location are allowed for App/Game items (the browser still asks the teacher first).
4. If a site refuses to be embedded, LRMS-HIVE notices at the link check and switches it to **Launch in a new tab** automatically.

**Apps Script web apps** can be shown inside LRMS-HIVE only if your `doGet` allows it and the deployment's access is *Anyone*:
```js
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
```
Apps that need the teacher's Google account (*Execute as: User accessing*) should use **Open directly in a new tab** — Google sign-in does not work inside frames.

**Check all links** (Admin › Resources) tests every link at once: Drive files that are not shared, pages that are gone, and sites that block embedding are listed with an **Edit** button. Run it after adding many links and about once a month.

## Notes on embedding
- Most learning platforms allow embedding (YouTube, Vimeo, Google Drive/Slides/Docs, Canva, Scratch, PhET, Wordwall, Genially, H5P, LearningApps). Some websites block being shown inside another site; for those, teachers still get **Open in new tab**.
- Apps Script web apps can be embedded only if they allow it (`setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)`).
- Games and videos load only when a teacher presses **Play**, so pages with many embeds stay fast.
- Flipbook PDFs from Drive are passed through your Apps Script (browsers cannot download Drive files directly). Only files linked from a visible Book/PDF resource are served. Keep storybook PDFs under 35 MB; 5–15 MB opens fastest.

## AI assistant (optional)
The **Ask Hive Helper** button works without AI — it answers with the best search matches.
To make it understand natural questions (English or Filipino):
1. Get a free key at **aistudio.google.com › Get API key**.
2. **Admin › AI assistant** › paste key › **Save key** › tick **Use Google Gemini AI** › Save › **Test the AI**.
The key is stored in the script's private properties, never in the Sheet or the website. The AI can only recommend items that exist in your catalog.

---

## Works on every device
Tested on small phones (320 px, iPhone SE size), regular and large phones, phones turned sideways, tablets (portrait and landscape), laptops, desktop monitors and 4K TVs/projectors. The layout, text size and tile columns adjust automatically. The code uses only long-supported browser features, so it also runs in older Android phones and inside the Messenger/Facebook in-app browser.

## How it stays fast
- The whole catalog loads in **one request**, cached on the server (Apps Script cache) and in the browser. Returning visitors see the site **instantly** from the saved copy while it refreshes quietly.
- The **service worker** keeps the site's files on the device, so it opens even on weak signal, and can be installed (**Install** button, or browser menu › *Install app* / *Add to Home Screen*).
- **Search** runs inside the browser: results appear as you type (about 1–5 ms), with typo tolerance ("fridy" → Friday), grade/quarter shorthand (`g7`, `q2`), and DepEd abbreviations (`ap`, `esp`, `tle`, `mapeh`, `dll`, `ppt`…).

## Security
- **Admin access** — passwords are salted and hashed; sessions last 6 hours; 8 wrong tries lock that username for 15 minutes, and too many failures overall slow everyone down. Changing a password or removing an admin signs out that person on every device. Admin login refuses to open when the site is placed inside another website (click-jacking).
- **Content** — everything typed by admins or visitors is shown as text, never as code. Links may only be `https`, `mailto:` or `tel:`; `javascript:` and similar tricks are removed both in the browser and on the server. Embed codes are stripped of scripts and event handlers. A Content Security Policy only lets the site's own scripts run.
- **Database** — cells that start like a formula (`=`, `+`, `@`, `-`) are stored as text, and CSV/Sheets exports are neutralised, so nobody can plant a formula.
- **Abuse limits** — the server caps request size, rate-limits visits, ratings, AI questions and logins, and accepts uploads only of PDF, Office, image, audio, video and text files (no `.html`, `.js`, `.exe`, `.svg`…).
- **Keys** — the Gemini key is kept in Apps Script's private Script Properties, never in the Sheet or the website.
- Keep the Google Sheet and the Apps Script project **private** (only the LRMS owner account). The website only talks to the `/exec` link.

## Deployment checklist
Open **Admin › Accounts & system › Deployment check** — it tests most of these for you.
1. `API_URL` in `assets/js/config.js` is the `/exec` link (not `/dev`), deployment access is **Anyone**, *Execute as* **Me**.
2. You ran **setup** after pasting the newest `Code.gs`, `Seed.gs` and `Report.gs` (adds any new columns).
3. The owner password was changed from the setup password.
4. The Drive storage folder is set and owned by the same account.
5. Every visible resource has a link, and **Check all links** shows nothing red.
6. AI (optional): key saved, **Test the AI** answers.
7. The site opens from `https://…github.io/…` and the **Install** button appears (offline files active after one reload).
8. The website and backend versions match (both 1.6.x). After every website upload, bump `VERSION` in `sw.js`; after every `Code.gs` change, deploy a **New version**.
9. Try it on a phone at the biggest text size, and once as a teacher who is not logged in.

When a new version is uploaded, teachers who have the site open see **“A new version of LRMS-HIVE is ready — Refresh”** instead of being interrupted.

## Updating the website later
Upload changed files to GitHub. Then open `sw.js` and change `VERSION` (e.g. `hive-v1.0.1`) so installed apps pick up the new files.
If you change `Code.gs`, use **Deploy › Manage deployments › Edit (pencil) › Version: New version › Deploy** — the URL stays the same.

**Upgrading to v1.6:** paste the new `Code.gs`, `Seed.gs` and `Report.gs`, run **setup** once (adds the *embedOk*, *linkStatus* and *linkChecked* columns to Resources), deploy a **New version**, upload all website files (including the new `.nojekyll`), then open **Admin › Accounts & system › Deployment check**.

**Upgrading from an earlier version (to v1.5):** paste the new `Code.gs` and `Seed.gs`, add the new `Report.gs` script file, run **setup** once (it only adds new tabs and columns such as *News*, *Events*, *Feedback*, *Activity*, *Schools* and *Districts*, and the visitor counter; your data is kept), then deploy a new version as above. Upload the new website files, including the `assets/vendor` (with `leaflet`) and `assets/sample` folders.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Could not reach the server" | Check `API_URL` in `config.js`; the deployment must be *Anyone* access. |
| Admin password lost | In Apps Script run **resetAdminPassword** › read the Execution log. |
| Preview shows "You need access" | Share the Drive file as *Anyone with the link*. |
| Edits in the Sheet not showing | Sheet menu **LRMS-HIVE › Refresh website data now**. |
| Upload fails | Set the storage folder in *Accounts & system*; files must be under 25 MB. |
| "The server address answered with a web page" | `API_URL` is wrong (use the `/exec` link) or the deployment is not *Anyone*. |
| "The site is very busy" | Too many requests in one minute — it retries by itself; wait a minute. |
| An embedded system shows a blank box or "refused to connect" | That site blocks embedding: set *How teachers see it* to **Open directly in a new tab**. |
| AI answers "The free limit may be used up" | The free Gemini quota resets daily; search answers keep working meanwhile. |
| A teacher still sees the old version | They tap **Refresh** on the update bar, or close and reopen the app. |
