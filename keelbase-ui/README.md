# keelbase-ui — the visual layer this host renders with

These files are the KeelBase visual layer: two complete skins, either of which can be compiled into
the host's UI **without editing a single upstream file**. `harbor` is the default; `product` — the
Element Plus token set (colours, radii, typography) authored for the product's own front end — is
still available.

## Two skins

| `KEELBASE_UI_SKIN` | lives in | what it is |
|---|---|---|
| `harbor` (default) | `skins/harbor/` | the product's own skin, whose starting point is Materio Free 2.3.0 and which has been heavily adapted since; every token prefix is `--harbor-` |
| `product` | `theme/` | the earlier KeelBase product skin, kept available |

The default is the `KEELBASE_UI_SKIN:-harbor` line in `scripts/build-host-ui.sh`. The build compiles
and links only the chosen skin's pair of stylesheets, and both skins use the same two artefact names,
so building the other skin into the same output directory replaces the first — an artefact never
carries both. Any other value stops the build with `unknown KEELBASE_UI_SKIN: <value> (expected
harbor or product)` and exit code 2.

## The product skin is a generated copy

The `product` skin's tokens are authored once, in `Web-Admin-Vue`:

    Web-Admin-Vue/src/styles/element-theme.scss
    Web-Admin-Vue/src/styles/themes/{_blue,_teal,_graphite}.scss

Edit them **there**, then re-vendor and verify:

    bash scripts/sync-ui-theme.sh          # write the copy
    bash scripts/sync-ui-theme.sh --check  # verify only; non-zero on drift

The copy must stay byte-identical (line endings normalised), so do not edit these files in place —
`--check` exists to catch exactly that. The `harbor` skin does not take part in this sync: it is
vendored here, and its file headers record the provenance.

## What the product skin's tokens are

Pure CSS custom properties, applied through `<html data-theme>` and `<html class="dark">`: three
switchable themes (deep indigo default / teal / graphite) crossed with light and dark. Nothing here
compiles into build-time variables, which is why the layer can be dropped in *after* the app's own
stylesheets and take effect at runtime — no upstream SCSS needs to change.

In this host only the **default (deep indigo) theme** is live: the app has no `data-theme` switcher,
so the `teal` and `graphite` blocks never match. They travel with the copy anyway, so the three
themes stay one authored thing rather than a fork.

## Two stylesheets per skin

Each skin ships a pair: one stylesheet for the Element Plus surface, one for yudao's shell.

| skin | file | covers |
|---|---|---|
| `harbor` | `skins/harbor/harbor.scss` → `keelbase-theme.css` | the **Element Plus token surface** — colours, radii, typography, card and button treatment |
| `harbor` | `skins/harbor/host-yudao-harbor.scss` → `keelbase-host.css` | **yudao's own layout namespaces** — `--left-menu-*`, `--top-header-*`, `--logo-*` |
| `product` | `theme/element-theme.scss` → `keelbase-theme.css` | the same Element Plus surface, with the product's values |
| `product` | `theme/host-yudao.scss` → `keelbase-host.css` | the same yudao namespaces, with the product's values |

In each skin the second file exists because the first cannot reach the sidebar, the top bar or the
tab strip: yudao drives all three through a namespace of its own and defaults it to a dark navy
neither skin uses. It is a **translation, not a copy** — `Web-Admin-Vue` states the same look
against class names (`.admin-aside`, `.el-menu-nav`) that do not exist here, so those rules cannot
be vendored. Every *value* in it is a reference into that skin's own tokens (`var(--el-*)` for
`product`, `var(--harbor-*)` for `harbor`), so each palette still has one source; only the structure
is restated. Both adapters are authored here, not synced.

## How the layer is applied

**Build-time injection** — the layer lives in the artefact, never in the source.

    bash scripts/build-host-ui.sh                          # fetch if needed, install, build, inject (harbor)
    KEELBASE_UI_SKIN=product bash scripts/build-host-ui.sh # the same, with the product skin
    bash scripts/build-host-ui.sh --skip-build             # inject into an existing out dir

`--skip-build` skips fetching, installing and building the app, but it still compiles and injects the
selected skin's stylesheets into the existing out dir. It does need the checkout to already carry our
delta — the locale messages and the rest — which only a full build lays down; without it the build
stops and says so.

The checkout the app is built from is never modified. The trade is that the UI's own dev server
renders upstream's look; only the built artefact carries the layer.

The injected links carry a content hash (`keelbase-host.css?v=…`). Vite hashes its own assets; these
two files keep their names, so without a version a browser that has cached one keeps serving it after
the layer changes — which presents as "the edit did nothing".

The sidebar is also where the product's own row rhythm lands: 42px for a group, 38px for a child, and
a right padding so the rows do not run under the scrollbar, which here is an overlay rather than a
reserved strip.

**One thing the build also turns off.** Upstream renders a doc-alert banner on most pages, pointing at
its own documentation site. It is gated by a build-time flag (`VITE_APP_DOCALERT_ENABLE`), so the
build sets that flag through the environment instead of hiding the banner with CSS — the element then
never renders at all. Vite lets an environment variable that already exists win over the `.env` file,
which is what keeps this a build flag rather than an edit to an upstream file. Set
`KEELBASE_YUDAO_UI_DOCALERT=true` to get upstream's behaviour back.

## Seeing the layer locally

The layer lives in the artefact, so checking it means serving the artefact. Serving the files alone is
not enough: the built page asks for its API at the **same origin** on purpose (the build empties
`VITE_BASE_URL` so the page asks whichever host served it, and the outer nginx decides where
`/admin-api` goes). On a deployed host that is exactly the point; locally it means a plain static
server answers every API call with the SPA fallback — `index.html`, HTTP 200 — which the app reads as
a successful response whose body carries no data. Sign-in then fails with an error that names neither
the API nor the proxy, and the fault looks like it is in the client.

`scripts/serve-host-ui.mjs` fills that gap: static files at the root, and the same forwarding the
deployment's nginx does (`/admin-api`, `/app-api`, `/app`, `/ai`, `/audit`) to a backend you point it
at. An API path is never answered with the SPA fallback, and an API call that cannot reach the backend
is reported as a failure (`502`) — so the next symptom is never a silently empty response.

    node scripts/serve-host-ui.mjs                        # page on :18099, backend http://127.0.0.1:48080
    node scripts/serve-host-ui.mjs --port 18100 --backend http://127.0.0.1:48080

## Two facts that differ from the RuoYi host

1. **The admin UI is not in this repository.** Upstream keeps `yudao-ui/yudao-ui-admin-vue3` as a
   placeholder directory, so the build script fetches the real tree into `target/` — a path upstream's
   `.gitignore` already ignores, so nothing is added to any tracked file to keep it out of the index.

2. **The app writes its own theme colour onto `<html>` as an inline style at mount**
   (`ConfigGlobal` → `appStore.setCssVarTheme()`). An inline style beats a plain stylesheet on its
   own, so a last-linked stylesheet carries everything *except* the primary colour family. `!important`
   does beat a non-important inline style, so the build adds it to that family alone — the rest of the
   layer stays overridable at runtime, and the host's own theme picker keeps working for everything
   else. The side effect is that the host's primary-colour picker no longer visibly changes the page:
   this layer pins it on purpose.

## Four deltas the layer cannot express

A stylesheet can restyle what the host renders. It cannot change what the host renders from its own
source — and four of the things this product needs are exactly that: the dashboard card's contents are
a static array in a component, the logo is a source import, the IM module is not shipped at all, and
several hundred module pages name a host this product does not own. They are therefore carried as
deltas and laid over the checkout before it is built.

    keelbase-ui/host-overlay/          files we add to the checkout
    keelbase-ui/host-patches/          a patch applied to the checkout
    keelbase-ui/host-removals.txt      paths we take out of the checkout
    keelbase-ui/host-vendor-hosts.txt  hosts whose URLs are blanked, then asserted absent

The checkout is disposable and refetched, so the build resets it to upstream first and then lays the
delta on. All of them fail loudly on purpose: an overlay whose file was moved upstream, a patch that
no longer applies, a removal whose path is no longer there, and a vendor host that survives into the
artefact, all mean our delta needs revisiting — never that it should be skipped, which would leave the
artefact quietly half-ours.

**The last one is a sweep, not a list of paths**, because the links into the platform this host was
forked from are spread over ~350 files and cannot be patched one by one.
`scripts/sweep-vendor-hosts.mjs` blanks the URL on every listed host after the patch has been
applied, and the build then asserts none reached the built page. The assertion is the point: those
links never render, so a missed one shows up nowhere except inside a lazily-loaded chunk.

**The overlay adds, it does not replace.** That is what keeps the coupling loud: a file we add is
referenced only from a patch, so upstream moving the code that references it makes the patch fail and
say so. A replacement would have no such tripwire — upstream renaming the file would leave our copy
sitting there unused while the app went on using theirs, silently.

**Taking a route out and taking the files out are two different jobs, and both are needed.** The route
is the patch's job: it imports the removed files by literal path, so leaving it behind fails the build.
The files are the removal list's job, and the route is not what puts them in the bundle — that is
`utils/routerHelper.ts`, which pulls every view in through `import.meta.glob('../views/**/*.{vue,tsx}')`
so backend menu records can name one by path. Delete the route alone and the IM module would still be
built and deployed; it is unreachable either way, which is why the cost was only ever the bytes.

## The icons, and the CDN they used to come from

The console renders Iconify icons, and upstream registers only three collections (`ep`, `fa`,
`fa-solid`). Every other icon it was handed it fetched **at runtime** from Iconify's public API —
`api.iconify.design` / `api.simplesvg.com` — so each visitor's browser talked to a host nobody here
controls. That is a vendor trace, and it is a request, not just a string.

Two changes close it. The Icon component now imports from `@iconify/vue/offline`, whose bundle
contains no fetch at all; and the icons the product actually renders are gathered into a collection
the page ships with.

    node scripts/gen-offline-icons.mjs           # write keelbase-ui/host-overlay/src/assets/keelbase-icons.ts
    node scripts/gen-offline-icons.mjs --check   # verify only; non-zero on drift

The generator scans the checkout's source for icon references (so the checkout has to carry our
delta — run a build first). The upstream tree spans ~35 collections; bundling them whole would add
~70 MB, so only the referenced icons are kept (~250 icons, ~100 KB). `host-icons-extra.txt` lists
the few icons that come from **data** — the database's menu rows carry an icon name, which no source
scan can see. The build runs `--check` after installing, so an icon reference upstream adds later
fails the build rather than rendering blank — which, with the offline component, is what a missing
registration looks like.

**The two builds do not share a registry.** `@iconify/vue` and `@iconify/vue/offline` each keep
their own `storage`, so `addCollection` has to come from the same entry point the component does —
hence `plugins/svgIcon/index.ts` imports it from `.../offline` too.

## 图标，以及它们原先来自的那个 CDN

控制台渲染 Iconify 图标，而上游只注册了三个集合（`ep`、`fa`、`fa-solid`）。交给它的其余每一个图标，
它都在**运行时**从 Iconify 的公共 API 取——`api.iconify.design` / `api.simplesvg.com`——于是每位访客
的浏览器都在访问一个这里没人控制的主机。那是厂商痕迹，而且是一次请求，不只是字符串。

两处改动把它关掉。Icon 组件改为从 `@iconify/vue/offline` 导入，那份包里根本没有任何 fetch；产品真正
渲染的图标则收进一个随页面发出的集合。

    node scripts/gen-offline-icons.mjs           # 写出 keelbase-ui/host-overlay/src/assets/keelbase-icons.ts
    node scripts/gen-offline-icons.mjs --check   # 只校验；有漂移则非零

生成器扫描检出源码里的图标引用（故检出须带着我们的增量——先跑一次构建）。上游树跨约 35 个集合，整套
打包要加约 70MB，故只保留被引用的那些（约 250 个图标、约 100KB）。`host-icons-extra.txt` 列出少数来自
**数据**的图标——数据库菜单行带一个图标名，扫源码看不见。构建在装依赖之后跑 `--check`，于是上游日后新增
的一处图标引用会让构建失败，而不是渲染成空白——在离线组件下，漏注册就长这样。

**两份构建不共用注册表。** `@iconify/vue` 与 `@iconify/vue/offline` 各留各的 `storage`，故
`addCollection` 必须与组件来自同一个入口——因此 `plugins/svgIcon/index.ts` 也从 `.../offline` 导入它。

## Choosing an avatar, and the mark that stands in for none

`assets/keelbase-avatar.svg` is generated by [DiceBear](https://www.dicebear.com) (`shapes` style).
Its own embedded metadata declares the artwork **CC0 1.0**; the packages it comes from declare MIT.
Either way it is free for commercial use, and the attribution is in `NOTICE`.

It is what an avatar carrying **no image of its own** falls back to. The stylesheet used to give it to
*every* `.el-avatar` and hide the image underneath, which made all of them render as the same picture:
choosing one changed nothing the console showed, so the feature read as broken. The rule is now
`:not(:has(> img))`, which is the only way a stylesheet can ask that question — where a browser cannot
parse it the rule is dropped and Element Plus's placeholder icon shows instead, which is a
degradation rather than a wrong image. `host-overlay/src/assets/imgs/keelbase-avatar.svg` is the same
bytes for the components that import a default from source.

The twenty avatars a person picks from are
`host-overlay/public/keelbase-preset-01.svg` … `-20.svg`: five each of four DiceBear styles —
`identicon`, `rings`, `shapes`, `weave`. All four are **CC0 1.0**, so no attribution is owed and
`NOTICE` says one line. Each file carries its own style and licence in its metadata.

    curl -s 'https://api.dicebear.com/10.x/<style>/svg?seed=keelbase-<style>-<nn>&size=256' \
      -o host-overlay/public/keelbase-preset-<nn>.svg

The seeds are `keelbase-identicon-01`…`-05`, `keelbase-rings-01`…`-05`, `keelbase-shapes-01`…`-05`,
`keelbase-weave-01`…`-05`, in that order — so unlike the sets before them these can be regenerated,
and the set is reproducible from this file alone.

**They are on `10.x`, not `9.x`.** `weave` does not exist on the 9.x API — the request 404s — so the
whole set is generated from one version rather than mixing them.

**The `preset-` prefix is not decoration.** The ten `keelbase-avatar-NN.svg` these replaced are still
shipped (retired, below), and reusing their names would have made a stored avatar that names one
resolve to a different picture — silently, because it would still render.

**The 128 px caveat is gone.** These are SVG, so the profile page's 120 px circle no longer draws from
a source barely larger than itself. That is the one thing the raster set before them could not do,
since an export from DiceBear's site keeps no seed and so could not be re-exported larger.

Between this set and the one before there were twenty **PNG** presets, taken from an export the user
supplied and dropped in byte for byte. They are not shipped. They were offered for a few hours, and
the deployment's database was checked before they were dropped — nothing stored names one. Had
anything, they would be on the retired list rather than in the bin; the names could not be reused for
these, for the reason in the paragraph above.

Four earlier presets — `-blue` `-teal` `-graphite` `-warm` — are **retired but still shipped**, and
still recognised. They are no longer offered, but an avatar stored while they were can name one:
dropping the files would leave that person's avatar unresolvable, and dropping the names would make
the dialog offer their own old choice back under "last uploaded", as though they had uploaded it.
Retiring a choice is not the same as deleting it.

`host-overlay/src/utils/keelbaseAvatar.ts` holds the offered list, the retired one, and the one place
that remembers the last image a person uploaded (per browser, keyed by user). The change-avatar
dialog and the profile page both read it, so they cannot drift apart on how a preset is recognised.

`host-overlay/src/assets/imgs/keelbase-logo.svg` is the product's brand mark, with the same path and
colour as Web-Admin-Vue's own logo component and favicon, so the mark keeps one source.

## The names the deployment shows

The system's name comes from the build's environment (`VITE_APP_TITLE`), so it lands in the page
title and everywhere the UI prints it without any source being edited.

Two other names are **not** labels and cannot be changed here. The **tenant name** is what the login
looks the tenant up by, and the seeded administrator's **nickname** is what the top bar and the
greeting show. Both live in the database, and the login pre-fill has to agree with the tenant record
or sign-in stops working. They move together, through `sql/keelbase-brand-names.sql` — run it against
an existing database after upstream's seed; a fresh install runs upstream's seed and then it. A demo
deployment then gives that administrator a person's name (`sql/keelbase-demo-accounts.sql`): the six
answers quote the approver back, and a brand name in that cell names nobody.

Upstream's seed file is left untouched: it is upstream's, it is several thousand lines, and it is
duplicated across dialects, so a rename belongs in a file that says what it changes rather than as
edits scattered through theirs.

## Two traps the build had to learn

**The href has to be absolute.** A relative `href` resolves against the *current route*, not the
document root. The app uses history routing, so at the root route it works — which is the first thing
anyone checks — and the moment a user reaches a deep route the link points at a path that does not
exist and the whole
layer vanishes **silently**: no error, no 404 the user sees, just upstream's look back. The build now
reads the base prefix off an asset link Vite already emitted and writes an absolute href.

**`!important` alone is not enough against yudao's own menu rules.** Those are scoped, which makes
them e.g. `.v-menu[data-v-…] .el-menu .el-menu-item:hover` — five class-level terms. A plain
`html body .el-menu .el-menu-item:not(.is-active):hover` has four, because `:not()` contributes only
the weight of its argument, and both sides are `!important`, so yudao's wins and its white hover text
comes back on a light ground. The adapter carries a `.v-menu` ancestor in those selectors for the
weight. This is worth knowing before editing it: dropping what looks like a redundant class silently
loses the state again.

**A selector list is unforgiving.** One selector the browser cannot parse invalidates its entire rule,
silently — the other selectors in that list stop applying too and nothing reports it. Sass compiles a
nested `:has()` without complaint, and nesting `:has()` is not allowed, so a rule that paired one with
a perfectly good selector lost both. The adapter therefore keeps **one selector per rule**, so every
rule stands or falls on its own. The repetition is the point.
