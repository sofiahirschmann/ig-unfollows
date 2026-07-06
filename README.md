# ig-unfollows · select + unfollow edition

Find the Instagram accounts you follow that **don't follow you back** — then tick the ones
you want and unfollow them right there, without leaving the tab.

This is an expansion of [`ig-unfollows`](https://github.com/cocohernandez/code-with-coco/tree/main/ig-unfollows)
by **coco hernandez** (itself inspired by [@abir-taheer's gist](https://gist.github.com/abir-taheer)).
The original printed the non-mutuals to the console. This version keeps that spirit — no apps,
no logins, no shady "unfollower tracker" services — and adds a friendly UI on top:

- 🔎 **Auto-detects your account** from your login cookie — no typing your username
- 🧾 **A floating panel** listing everyone who doesn't follow you back, with avatars, verified badges, and links to each profile
- ✅ **Search + select** individual accounts, or **select all**
- 🧹 **Unfollow in place**, one at a time, with human-like pacing so Instagram doesn't action-block you
- ⏱️ **Adjustable delay**, a **live progress bar**, and a **stop** button you can hit any time
- 🌸 Built as a single self-contained script — nothing loads from the network

## Try the UI first (no Instagram needed)

Open [`demo.html`](demo.html) in a browser. It runs the exact same panel on pretend data with a
fake unfollow, so you can click around safely before using the real thing.

## Use it for real

1. Open **[instagram.com](https://www.instagram.com)** in your browser and make sure you're logged in.
2. Open your browser's developer console:
   - **Chrome / Edge / Brave:** `⌘⌥J` (Mac) or `Ctrl+Shift+J` (Windows)
   - **Firefox:** `⌘⌥K` / `Ctrl+Shift+K`
   - **Safari:** enable the Develop menu first (Settings → Advanced → *Show features for web developers*), then `⌘⌥C`
3. Grab the whole script and copy it:
   - On GitHub: open [`ig-unfollows.js`](ig-unfollows.js), click the **Raw** button, then select all (`⌘A` / `Ctrl+A`) and copy (`⌘C` / `Ctrl+C`).
   - Or open your local copy of `ig-unfollows.js` and copy everything.
4. Paste it into the console and press enter. (First time in Chrome, if it blocks the paste, type **`allow pasting`** + enter, then paste again.)
5. It counts your followers/following (you'll see a "counting…" card, plus some red console warnings — that's normal), then the panel pops up in the top-right. Filter, tick who you want gone, and hit **unfollow selected**.

## Staying un-blocked 🌸

Instagram limits how fast you can unfollow. If you go too quickly it temporarily blocks the
action (and the panel will stop early and tell you). To stay safe:

- Keep the delay at **6 seconds or more** (the default).
- Clear people in **small batches** — a few dozen at a time, not hundreds in one sitting.
- If you get rate-limited, take a break for a few hours before trying again.

## How it works

The script talks to Instagram's own internal web API using your logged-in session:

- **`GET /api/v1/friendships/{id}/followers`** and **`/following`** — paged, to build both lists
- Your own user id comes from the **`ds_user_id`** cookie
- **`POST /api/v1/friendships/destroy/{id}/`** with your **`csrftoken`** — the unfollow

Everything runs locally in your browser. Nothing is sent anywhere except to Instagram itself,
exactly as if you'd clicked the buttons by hand.

## Notes & caveats

- You'll see red warnings in the console while it fetches — that's just Instagram grumbling about
  the request volume. It keeps going.
- Unfollows **can't be undone** from here; you'd have to re-follow each account manually.
- Instagram changes its internal API from time to time. If fetching or unfollowing suddenly breaks,
  the endpoints above are the place to look.
- Use it on **your own** account, responsibly.

## License

MIT — do whatever, keep the credit to the original. Made with ♡ as a remix of *code with coco*.
