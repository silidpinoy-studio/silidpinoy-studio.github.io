# Publishing SilidPinoy Studio to GitHub Pages

Everything in this folder is the complete site. There is no build step — these
files are served exactly as they are, so publishing is just copying them onto
GitHub.

## 1. Get the address you want

`silidpinoy-studio.github.com` is **not** possible: `github.com` belongs to
GitHub and nobody can create subdomains under it. GitHub Pages lives under
`github.io`. To get a clean root URL:

| Piece | Must be named |
|---|---|
| GitHub account or organization | `silidpinoy-studio` |
| Repository | `silidpinoy-studio.github.io` |

That combination serves at **https://silidpinoy-studio.github.io/**.

If the username `silidpinoy-studio` is already taken, don't rename anything —
organization names are a separate namespace, so create a free organization with
that name and put the repository inside it.

Any other repository name works too, it just lands on a subpath instead:
`https://<your-username>.github.io/<repo>/`. The app uses only relative links,
so both URLs work identically.

## 2. Create the repository

1. Sign in to github.com.
2. Create the account/organization `silidpinoy-studio`.
3. **New repository** → name it `silidpinoy-studio.github.io` → visibility
   **Public** → Create.

Free GitHub Pages only serves from public repositories. If you later switch the
repository to private, the site stops working unless you are on a paid plan.

## 3. Upload the files

On the new repository page: **Add file → Upload files**, then drag in every
file from this folder (all 5 HTML pages, the 9 JavaScript files, the two
images, and `README.md`).

Uploading from the website cannot send `.nojekyll` because dotfiles are hidden
in the file picker. Create it by hand instead:

**Add file → Create new file** → name it exactly `.nojekyll` → leave it empty →
Commit. (If you push with `git`, `git add .` picks it up automatically.)

`.nojekyll` tells Pages to skip Jekyll processing. Nothing here starts with an
underscore so it is not strictly required, but it avoids surprises later.

## 4. Turn Pages on

**Settings → Pages → Build and deployment**:

- Source: **Deploy from a branch**
- Branch: **main**, folder **/ (root)**
- **Save**

Wait about a minute, then open **https://silidpinoy-studio.github.io/**.

## Updating the site

Edit or re-upload a changed file in the repository — Pages redeploys on its own
within a minute or so. After that, hard-refresh the page (Ctrl+F5) because
browsers cache these files aggressively.

**This folder is a snapshot.** Editing the app at the repository root does not
update `publish/`. After changing the app, refresh the copy before uploading:

```bash
npm run publish:sync
```

That rewrites every payload file from the project root and lists what changed,
so the snapshot can never lag behind the app without saying so. The test suite
fails on a stale snapshot too, which is the safer of the two guards to rely on.

## Notes

- **Editing files in `publish/` alone changes nothing on the live site** until
  the change is uploaded to GitHub.
- **`template-engine.html` is included but not linked from any menu.** It opens
  at `https://silidpinoy-studio.github.io/template-engine.html` if you want to
  look at it.
- **The site needs internet access.** Tailwind, the Fraunces/Plus Jakarta Sans
  fonts, and Lucide load from CDNs. On a weak connection the layout degrades but
  the tools still run.
- **No API keys are in these files.** Each teacher pastes their own Google
  Gemini key, which stays in their own browser, so nothing secret lives in the
  repository.
- Free Pages limits (about 1 GB of site files, 100 GB of traffic per month) are
  far beyond what this app will ever use.
