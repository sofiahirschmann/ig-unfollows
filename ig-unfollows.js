// ─────────────────────────────────────────────────────────────
//   ig-unfollows  ·  select + unfollow edition
//   find the accounts you follow that don't follow you back —
//   then tick the ones you want and unfollow them in place.
// ─────────────────────────────────────────────────────────────
//
//   what this is:
//   a single script you paste into your browser console on
//   instagram.com. it compares your followers against your
//   following, then opens a little floating panel listing every
//   account that doesn't follow you back. check the ones you want
//   gone and hit unfollow — it does them one at a time, slowly,
//   so instagram doesn't throw a tantrum.
//
//   no app installs, no third-party logins, no shady "track your
//   unfollowers" services. just you, the browser, and some js.
//
//   heads up:
//   you must be signed into instagram in this same tab — the
//   script talks to instagram's own internal API, which only
//   answers logged-in sessions. you may see red console warnings
//   while it runs; that's just instagram grumbling, it's fine.
//
//   unfollowing in bulk too fast can get you temporarily action-
//   blocked. the default 6s gap (with jitter) keeps things calm.
//   if you're clearing a lot, do it in small batches.
//
// ─────────────────────────────────────────────────────────────
//   an expansion of "ig-unfollows" by coco hernandez ♡
//   original: github.com/cocohernandez/code-with-coco
//   original inspired by @abir-taheer's gist on github
// ─────────────────────────────────────────────────────────────

(function () {
  "use strict";

  const APP_ID = "936619743392459";
  const PAGE_SIZE = 200;
  const FETCH_SLEEP = [400, 900]; // ms between follower/following pages
  const DEFAULT_DELAY = 6; // seconds between unfollows
  const HOST_ID = "ig-unfollows-host";

  const PINK = "#ff7ad9";
  const PURPLE = "#9d6cff";

  // ── little utils ────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (min, max) => Math.floor(Math.random() * (max - min)) + min;
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  };

  // ── instagram internal API ──────────────────────────────────
  const getOpts = {
    credentials: "include",
    headers: { "X-IG-App-ID": APP_ID },
    method: "GET",
  };

  const fetchAllPages = async (list, userId, onProgress) => {
    const users = [];
    let nextMaxId = "";
    while (true) {
      const params = new URLSearchParams({ count: PAGE_SIZE });
      if (nextMaxId) params.set("max_id", nextMaxId);
      const url = `https://www.instagram.com/api/v1/friendships/${userId}/${list}/?${params}`;
      const data = await fetch(url, getOpts).then((r) => r.json());
      users.push(...(data.users || []));
      if (onProgress) onProgress(list, users.length);
      if (!data.next_max_id) return users;
      nextMaxId = data.next_max_id;
      await sleep(jitter(FETCH_SLEEP[0], FETCH_SLEEP[1]));
    }
  };

  // your own id, straight from the login cookie — no username typing needed
  const getMyUserId = () => getCookie("ds_user_id");

  // fallback: look someone up by username (used only if the cookie is missing)
  const getUserIdByName = async (username) => {
    const lower = username.toLowerCase();
    const url = `https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=${lower}&include_reel=false`;
    const data = await fetch(url, getOpts).then((r) => r.json());
    return data.users?.find((r) => r.user.username.toLowerCase() === lower)?.user?.pk;
  };

  // the actual unfollow. returns { ok, message }.
  const unfollowUser = async (pk) => {
    const csrf = getCookie("csrftoken");
    if (!csrf) return { ok: false, message: "no csrf token — are you logged in?" };
    try {
      const res = await fetch(
        `https://www.instagram.com/api/v1/friendships/destroy/${pk}/`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "X-CSRFToken": csrf,
            "X-IG-App-ID": APP_ID,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "ok") return { ok: true };
      if (data.feedback_required || res.status === 429 || res.status === 400)
        return { ok: false, message: "instagram is rate-limiting — slow down / take a break" };
      return { ok: false, message: data.message || `failed (${res.status})` };
    } catch (e) {
      return { ok: false, message: e.message || "network error" };
    }
  };

  // ── compute who doesn't follow back ─────────────────────────
  const computeNonMutuals = async (userId, onProgress) => {
    const [followers, following] = await Promise.all([
      fetchAllPages("followers", userId, onProgress),
      fetchAllPages("following", userId, onProgress),
    ]);
    const followerSet = new Set(followers.map((u) => u.username.toLowerCase()));
    return following
      .filter((u) => !followerSet.has(u.username.toLowerCase()))
      .map((u) => ({
        pk: u.pk,
        username: u.username,
        full_name: u.full_name || "",
        profile_pic_url: u.profile_pic_url || "",
        is_verified: !!u.is_verified,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  };

  // ── the panel ───────────────────────────────────────────────
  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .wrap {
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      width: 380px; max-width: calc(100vw - 40px); max-height: calc(100vh - 40px);
      display: flex; flex-direction: column;
      background: #fff; color: #1a1a2e;
      border: 1px solid #f0d9f4; border-radius: 20px;
      box-shadow: 0 18px 50px rgba(157,108,255,.28), 0 4px 14px rgba(0,0,0,.08);
      overflow: hidden; animation: pop .28s cubic-bezier(.2,.9,.3,1.2);
    }
    @keyframes pop { from { transform: translateY(-8px) scale(.98); opacity: 0 } to { transform: none; opacity: 1 } }
    .head {
      padding: 16px 18px 14px; color: #fff;
      background: linear-gradient(120deg, ${PINK}, ${PURPLE});
      display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
    }
    .title { font-size: 15px; font-weight: 700; letter-spacing: .2px; line-height: 1.3; }
    .subtitle { font-size: 12px; opacity: .92; margin-top: 3px; font-weight: 500; }
    .x { cursor: pointer; border: 0; background: rgba(255,255,255,.22); color: #fff;
      width: 26px; height: 26px; border-radius: 8px; font-size: 16px; line-height: 1; flex: 0 0 auto; }
    .x:hover { background: rgba(255,255,255,.38); }
    .toolbar { padding: 12px 14px 10px; display: flex; flex-direction: column; gap: 9px; border-bottom: 1px solid #f4eefb; }
    .search { width: 100%; padding: 9px 12px; border: 1px solid #ecdff6; border-radius: 11px;
      font-size: 13px; outline: none; background: #faf7ff; }
    .search:focus { border-color: ${PURPLE}; background: #fff; }
    .toolrow { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; }
    .selall { display: flex; align-items: center; gap: 7px; cursor: pointer; color: #5b4b7a; font-weight: 600; user-select: none; }
    .count { color: ${PURPLE}; font-weight: 700; }
    .list { overflow-y: auto; flex: 1 1 auto; padding: 6px 8px; }
    .list::-webkit-scrollbar { width: 8px; }
    .list::-webkit-scrollbar-thumb { background: #ecdff6; border-radius: 8px; }
    .row { display: flex; align-items: center; gap: 10px; padding: 8px 8px; border-radius: 12px; }
    .row:hover { background: #faf6ff; }
    .row.done { opacity: .5; }
    .row.done .uname { text-decoration: line-through; }
    .cb { width: 17px; height: 17px; accent-color: ${PURPLE}; cursor: pointer; flex: 0 0 auto; }
    .av { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: #f2e9fb; flex: 0 0 auto; }
    .meta { flex: 1 1 auto; min-width: 0; }
    .uname { font-size: 13.5px; font-weight: 600; color: #1a1a2e; display: flex; align-items: center; gap: 4px; }
    .uname a { color: inherit; text-decoration: none; }
    .uname a:hover { text-decoration: underline; }
    .verified { color: ${PURPLE}; font-size: 12px; }
    .fname { font-size: 11.5px; color: #9089a3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st { font-size: 15px; flex: 0 0 auto; width: 18px; text-align: center; }
    .st.err { color: #e8607a; font-size: 12px; }
    .empty { text-align: center; color: #9089a3; font-size: 13px; padding: 40px 20px; }
    .foot { padding: 12px 14px; border-top: 1px solid #f4eefb; background: #fdfbff; display: flex; flex-direction: column; gap: 10px; }
    .delayrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b5b8a; }
    .delayrow input { width: 56px; padding: 5px 7px; border: 1px solid #ecdff6; border-radius: 8px; font-size: 12px; text-align: center; }
    .btn { border: 0; border-radius: 12px; padding: 11px 14px; font-size: 13.5px; font-weight: 700; cursor: pointer; width: 100%; }
    .btn.go { color: #fff; background: linear-gradient(120deg, ${PINK}, ${PURPLE}); }
    .btn.go:disabled { opacity: .5; cursor: default; }
    .btn.stop { color: #fff; background: #e8607a; }
    .prog { font-size: 12px; color: #6b5b8a; text-align: center; min-height: 15px; }
    .bar { height: 6px; background: #f0e7fb; border-radius: 6px; overflow: hidden; }
    .bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, ${PINK}, ${PURPLE}); transition: width .25s; }
    .hidden { display: none !important; }
  `;

  function initials(name, username) {
    const base = (name || username || "?").trim();
    const parts = base.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("").toUpperCase() || "?";
  }
  function avatarFallback(user) {
    // pastel svg avatar so rows never show a broken image
    const hue = ([...user.username].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='38' height='38'>
      <rect width='38' height='38' rx='19' fill='hsl(${hue},70%,88%)'/>
      <text x='19' y='24' font-size='14' font-family='sans-serif' font-weight='600'
        fill='hsl(${hue},55%,42%)' text-anchor='middle'>${esc(initials(user.full_name, user.username))}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function renderPanel(users, opts = {}) {
    const onUnfollow = opts.onUnfollow || ((u) => unfollowUser(u.pk));
    const demo = !!opts.demo;

    // one panel at a time
    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    root.appendChild(wrap);

    // state
    const state = users.map((u) => ({ user: u, checked: false, status: "idle", msg: "" }));
    let running = false;
    let stopFlag = false;

    wrap.innerHTML = `
      <div class="head">
        <div>
          <div class="title">not following you back${demo ? " · demo" : ""}</div>
          <div class="subtitle">${users.length} account${users.length === 1 ? "" : "s"} you follow don't follow you</div>
        </div>
        <button class="x" title="close">×</button>
      </div>
      <div class="toolbar">
        <input class="search" placeholder="filter by username or name…" />
        <div class="toolrow">
          <label class="selall"><input type="checkbox" class="cb selall-cb" /> select all</label>
          <span class="count"><span class="sel-n">0</span> selected</span>
        </div>
      </div>
      <div class="list"></div>
      <div class="foot">
        <div class="delayrow">
          <span>wait</span>
          <input type="number" class="delay" min="2" max="120" value="${DEFAULT_DELAY}" />
          <span>seconds between each unfollow (be gentle 🌸)</span>
        </div>
        <div class="bar hidden"><i></i></div>
        <div class="prog"></div>
        <button class="btn go" disabled>unfollow selected</button>
        <button class="btn stop hidden">stop</button>
      </div>
    `;

    const $ = (sel) => wrap.querySelector(sel);
    const listEl = $(".list");
    const searchEl = $(".search");
    const selAllEl = $(".selall-cb");
    const selNEl = $(".sel-n");
    const goBtn = $(".go");
    const stopBtn = $(".stop");
    const progEl = $(".prog");
    const barWrap = $(".bar");
    const barFill = $(".bar > i");
    const delayEl = $(".delay");

    $(".x").onclick = () => host.remove();

    function rowFor(s) {
      return listEl.querySelector(`[data-pk="${s.user.pk}"]`);
    }

    function updateSelectionUI() {
      const selectable = state.filter((s) => s.status === "idle");
      const selected = selectable.filter((s) => s.checked);
      selNEl.textContent = selected.length;
      goBtn.textContent = selected.length
        ? `unfollow selected (${selected.length})`
        : "unfollow selected";
      goBtn.disabled = running || selected.length === 0;
      selAllEl.checked = selectable.length > 0 && selected.length === selectable.length;
    }

    function paintStatus(s) {
      const row = rowFor(s);
      if (!row) return;
      const st = row.querySelector(".st");
      row.classList.toggle("done", s.status === "done");
      st.className = "st" + (s.status === "error" ? " err" : "");
      st.textContent =
        s.status === "pending" ? "…" :
        s.status === "done" ? "✓" :
        s.status === "error" ? "⚠" : "";
      st.title = s.msg || "";
      const cb = row.querySelector(".cb");
      if (s.status !== "idle") { cb.checked = false; cb.disabled = true; }
    }

    function renderList() {
      const q = searchEl.value.trim().toLowerCase();
      const shown = state.filter(
        (s) =>
          !q ||
          s.user.username.toLowerCase().includes(q) ||
          s.user.full_name.toLowerCase().includes(q)
      );
      if (shown.length === 0) {
        listEl.innerHTML = `<div class="empty">${
          state.length === 0 ? "🎉 everyone you follow follows you back!" : "no matches."
        }</div>`;
        return;
      }
      listEl.innerHTML = shown
        .map((s) => {
          const u = s.user;
          return `
          <div class="row ${s.status === "done" ? "done" : ""}" data-pk="${esc(u.pk)}">
            <input type="checkbox" class="cb" ${s.checked ? "checked" : ""} ${s.status !== "idle" ? "disabled" : ""} />
            <img class="av" src="${esc(u.profile_pic_url) || avatarFallback(u)}" />
            <div class="meta">
              <div class="uname">
                <a href="https://www.instagram.com/${esc(u.username)}/" target="_blank" rel="noopener">@${esc(u.username)}</a>
                ${u.is_verified ? '<span class="verified">✔</span>' : ""}
              </div>
              ${u.full_name ? `<div class="fname">${esc(u.full_name)}</div>` : ""}
            </div>
            <div class="st ${s.status === "error" ? "err" : ""}">${
              s.status === "done" ? "✓" : s.status === "error" ? "⚠" : ""
            }</div>
          </div>`;
        })
        .join("");
      // fallback avatar if IG image fails to load
      listEl.querySelectorAll(".av").forEach((img) => {
        img.onerror = () => {
          const s = state.find((x) => String(x.user.pk) === img.closest(".row").dataset.pk);
          if (s) { img.onerror = null; img.src = avatarFallback(s.user); }
        };
      });
    }

    // events (delegated)
    listEl.addEventListener("change", (e) => {
      if (!e.target.classList.contains("cb")) return;
      const pk = e.target.closest(".row").dataset.pk;
      const s = state.find((x) => String(x.user.pk) === pk);
      if (s && s.status === "idle") s.checked = e.target.checked;
      updateSelectionUI();
    });
    searchEl.addEventListener("input", renderList);
    selAllEl.addEventListener("change", () => {
      const on = selAllEl.checked;
      const q = searchEl.value.trim().toLowerCase();
      state.forEach((s) => {
        if (s.status !== "idle") return;
        const match =
          !q ||
          s.user.username.toLowerCase().includes(q) ||
          s.user.full_name.toLowerCase().includes(q);
        if (match) s.checked = on;
      });
      renderList();
      updateSelectionUI();
    });

    stopBtn.onclick = () => {
      stopFlag = true;
      stopBtn.textContent = "stopping…";
      stopBtn.disabled = true;
    };

    goBtn.onclick = async () => {
      const queue = state.filter((s) => s.checked && s.status === "idle");
      if (queue.length === 0 || running) return;
      const ok = confirm(
        `unfollow ${queue.length} account${queue.length === 1 ? "" : "s"}?\n\n` +
        `this can't be undone from here — you'd have to re-follow each one manually.`
      );
      if (!ok) return;

      running = true;
      stopFlag = false;
      let done = 0, failed = 0;
      const delayMs = Math.max(2, Number(delayEl.value) || DEFAULT_DELAY) * 1000;

      goBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      stopBtn.disabled = false;
      stopBtn.textContent = "stop";
      barWrap.classList.remove("hidden");
      searchEl.disabled = selAllEl.disabled = delayEl.disabled = true;

      for (let i = 0; i < queue.length; i++) {
        if (stopFlag) break;
        const s = queue[i];
        s.status = "pending";
        paintStatus(s);
        progEl.textContent = `unfollowing ${i + 1} / ${queue.length} — @${s.user.username}`;
        barFill.style.width = `${(i / queue.length) * 100}%`;

        const res = await onUnfollow(s.user);
        if (res && res.ok) { s.status = "done"; done++; }
        else { s.status = "error"; s.msg = (res && res.message) || "failed"; failed++; }
        s.checked = false;
        paintStatus(s);

        // if IG starts rate-limiting, stop early rather than dig the hole deeper
        if (res && !res.ok && /rate-limit/i.test(res.msg || res.message || "")) {
          stopFlag = true;
          break;
        }
        if (i < queue.length - 1 && !stopFlag) {
          await sleep(delayMs + jitter(0, 1500));
        }
      }

      barFill.style.width = "100%";
      running = false;
      stopBtn.classList.add("hidden");
      goBtn.classList.remove("hidden");
      searchEl.disabled = selAllEl.disabled = delayEl.disabled = false;
      progEl.textContent =
        `done · ${done} unfollowed` +
        (failed ? ` · ${failed} failed (hover the ⚠ for why)` : "") +
        (stopFlag ? " · stopped early" : "");
      updateSelectionUI();
    };

    renderList();
    updateSelectionUI();
    return { host, remove: () => host.remove() };
  }

  // ── loading toast while we count ─────────────────────────────
  function showLoading() {
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLES}</style>
      <div class="wrap" style="width:320px">
        <div class="head"><div><div class="title">counting your follows…</div>
        <div class="subtitle prog2">reaching out to instagram</div></div></div>
      </div>`;
    return {
      update: (t) => {
        const p = root.querySelector(".prog2");
        if (p) p.textContent = t;
      },
      done: () => host.remove(),
    };
  }

  // ── entry point (real instagram) ────────────────────────────
  async function start() {
    if (!location.hostname.endsWith("instagram.com")) {
      alert("open instagram.com and run this there while logged in.");
      return;
    }
    let userId = getMyUserId();
    if (!userId) {
      const name = prompt("couldn't read your login cookie. type your instagram username:");
      if (!name) return;
      userId = await getUserIdByName(name.trim());
      if (!userId) { alert(`couldn't find @${name}`); return; }
    }

    const loader = showLoading();
    try {
      const users = await computeNonMutuals(userId, (list, n) =>
        loader.update(`fetched ${n} ${list}…`)
      );
      loader.done();
      console.log(
        `%cig-unfollows · ${users.length} accounts don't follow you back`,
        `color:${PURPLE};font-weight:bold;font-size:13px`
      );
      renderPanel(users);
    } catch (e) {
      loader.done();
      console.error(e);
      alert("something went wrong talking to instagram. make sure you're logged in and try again.");
    }
  }

  // expose for the demo page + power users
  window.__igUnfollows = {
    start,
    renderPanel,
    computeNonMutuals,
    unfollowUser,
    getMyUserId,
  };

  // auto-run on instagram (skip when a demo page sets this flag)
  if (location.hostname.endsWith("instagram.com") && !window.__IG_UNFOLLOWS_DEMO__) {
    start();
  }
})();
