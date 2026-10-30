#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Builds the host's admin UI and lays the KeelBase visual layer over the built page — without editing
# a single upstream file.
#
# The order is the point. The UI is built from an untouched checkout; then the vendored tokens are
# compiled and linked into the built page **last**, so they override the app's own stylesheets. The
# checkout is never modified — the visual layer exists only in the artefact.
#
#   bash scripts/build-host-ui.sh              # fetch if needed, install, build, inject
#   bash scripts/build-host-ui.sh --skip-build # inject into an existing out dir (no install/build)
#
# 构建宿主的后台界面，并把 KeelBase 视觉层铺到**构建产物**上——不改任何上游文件。
# 顺序是关键：先在**未改动**的检出上构建；随后编译入库的令牌，并**最后**链进构建好的页面，
# 从而覆盖应用自己的样式表。检出始终不动——视觉层只存在于产物里。
#   --skip-build = 在已有的产物目录上做注入（不装依赖、不构建）。
#
# Two facts differ from the RuoYi host, and both shape this script:
#
#   1. The admin UI is not in this repository. Upstream keeps `yudao-ui/yudao-ui-admin-vue3` as a
#      placeholder directory (a README and a few leftovers); the real tree lives in its own repository.
#      So this script fetches it. The checkout goes under `target/`, which upstream's .gitignore
#      already ignores — nothing is added to any tracked file to keep it out of the index.
#   2. The app writes its own theme colour onto `<html>` as an **inline style** at mount
#      (`ConfigGlobal` → `appStore.setCssVarTheme()`), and an inline style beats any stylesheet on
#      its own. A last-linked stylesheet therefore carries everything *except* the primary colour
#      family. `!important` does beat a non-important inline style, so the compiled tokens have it
#      added to that family alone — the rest of the layer stays overridable at runtime.
#
# 有两条与 RuoYi 宿主不同的事实，它们决定了这个脚本的形状：
#   1. **界面不在本仓**——上游把 `yudao-ui/yudao-ui-admin-vue3` 留成占位目录（一个 README 加几件残留），
#      真正的树在它自己的仓里。故本脚本按需拉取，检出落在 `target/`（上游 `.gitignore` 已忽略）——
#      **不为把它挡在索引外而改动任何受跟踪文件**。
#   2. 应用在挂载时把自己的主题色写成 `<html>` 的**内联样式**，而内联样式本身就压过任何样式表。
#      于是「最后链一个 CSS」能带上除**主色族**以外的一切；`!important` 能压过非重要的内联样式，
#      所以只给该族加上它——其余层保持在运行时可被覆盖。
#
# The tokens themselves are vendored by scripts/sync-ui-theme.sh; edit them in Web-Admin-Vue, never
# here. 令牌由 scripts/sync-ui-theme.sh 入库；要改请改 Web-Admin-Vue，不要改这里。
#
# 可覆盖：
#   KEELBASE_YUDAO_UI        检出位置（默认 <repo>/target/yudao-ui-admin-vue3）
#   KEELBASE_YUDAO_UI_REPO   克隆地址（默认 Gitee 镜像）
#   KEELBASE_YUDAO_UI_REF    要取的提交 / 分支 / 标签（默认钉在上游 9bd6a91 —— 四份补丁所针对的那个提交）
#
#   默认值钉在**提交**上，不是分支上：四份补丁是在那一个上游提交上写的，上游 master 一往前动，补丁就地失效。
#   抬这个默认值是**刻意的编辑**，必须**与补丁一起**做：四份补丁要重基到新提交，不能只改这一行。
#
# Overridable:
#   KEELBASE_YUDAO_UI        checkout location   (default <repo>/target/yudao-ui-admin-vue3)
#   KEELBASE_YUDAO_UI_REPO   clone URL           (default the Gitee mirror)
#   KEELBASE_YUDAO_UI_REF    commit / branch / tag to fetch
#                            (default pinned to upstream 9bd6a91, the commit the four patches target)
#
#   The default is pinned to a **commit**, not a branch: the four patches were written against that one
#   upstream commit, and upstream master moving past it makes them stop applying. Raising the pin is a
#   deliberate edit made **together with the patches** — all four have to be rebased onto the new
#   commit; this line is never changed on its own.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="${KEELBASE_YUDAO_UI:-$REPO_ROOT/target/yudao-ui-admin-vue3}"
UI_REPO="${KEELBASE_YUDAO_UI_REPO:-https://gitee.com/yudaocode/yudao-ui-admin-vue3.git}"
UI_REF="${KEELBASE_YUDAO_UI_REF:-9bd6a91286573af70874ebd9c23d73177dd8001d}"
BUILD_SCRIPT="${KEELBASE_YUDAO_UI_BUILD:-build:prod}"
OUT_NAME="${KEELBASE_YUDAO_UI_OUT:-dist-prod}"
PNPM_VERSION="${KEELBASE_YUDAO_UI_PNPM:-9.15.9}"
REGISTRY="${KEELBASE_YUDAO_UI_REGISTRY:-https://registry.npmmirror.com}"

THEME_SCSS="$REPO_ROOT/keelbase-ui/theme/element-theme.scss"
HOST_SCSS="$REPO_ROOT/keelbase-ui/theme/host-yudao.scss"
THEME_CSS_NAME="keelbase-theme.css"
HOST_CSS_NAME="keelbase-host.css"
BOUNDARY_NAME="keelbase-governance-boundary.json"
MARKER="<!-- keelbase-theme -->"
HOST_MARKER="<!-- keelbase-host -->"
if [[ ! -f "$HOST_SCSS" ]]; then HOST_CSS_NAME=""; fi

SKIP_BUILD=0
if [[ "${1:-}" == "--skip-build" ]]; then SKIP_BUILD=1; fi

if [[ ! -f "$THEME_SCSS" ]]; then
  echo "vendored tokens missing: $THEME_SCSS" >&2
  echo "run: bash scripts/sync-ui-theme.sh" >&2
  exit 2
fi

# --- 1. the checkout ------------------------------------------------------------------------------
# 删掉一个检出目录，哪怕更早的一次运行只删了它一半 —— 半删状态下目标**非空**，而 `git clone` 拒绝非空的
# 目标。它**不对目录在不在作判断**（见调用处）；末尾那条收尾检查只**把「删不掉」说出来**，不改权威归属。
#
# ⚠ Windows 那两步的写法是**踩着两个坑**定下来的（2026-10-15 实测，两个坑都会**静默**）：
#   · `robocopy` 必须配 `MSYS_NO_PATHCONV=1`（**只给这一行**）：不关参数改写时，Git Bash 会把 `/MIR`
#     等开关先变成 Windows 路径，robocopy 于是**以 16（用法错误）退出、什么都不删**；
#   · `rd` 的两个开关都要写**双斜杠**：默认转换下 `//s` 到 cmd 手里正好是 `/s`，而裸的 `/s` 会被改写成
#     盘符路径；「整条命令套一对引号」的旧写法同样不成立 —— cmd 会剥掉外层引号，`rd` 报语法错（123）。
#   两处失败原先都被 `|| true` 吞掉 ⇒ **一次什么也没干的清理会被读成成功**，故补了下面的收尾检查。
#
# Remove a checkout directory even when an earlier run left it half-deleted — in that state the
# destination is non-empty and `git clone` refuses it. It takes no view on whether the directory is
# there (see the caller); the check at the end only *says out loud* that it could not remove it, and
# does not move the authority.
#
# ⚠ The two Windows steps read the way they do because of two traps, both measured 2026-10-15 and both
# **silent**:
#   · `robocopy` needs `MSYS_NO_PATHCONV=1` (**on that line only**): with conversion on, Git Bash turns
#     `/MIR` and the other switches into Windows paths first, so robocopy exits 16 (usage) and deletes
#     nothing;
#   · both `rd` switches need **doubled slashes**: under the default conversion `//s` reaches cmd as
#     `/s`, while a bare `/s` is rewritten into a drive path. Quoting the whole command — the form this
#     used to take — fails too: cmd strips the outer quotes and `rd` reports a syntax error (123).
#   Both failures were swallowed by `|| true`, so **a wipe that did nothing read as success** — hence
#   the check below.
wipe_checkout() {
  local dir="$1" tmp win
  rm -rf "$dir" 2>/dev/null || true
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*)
      if command -v robocopy >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
        tmp="$(mktemp -d)"
        MSYS_NO_PATHCONV=1 robocopy "$(cygpath -w "$tmp")" "$(cygpath -w "$dir")" \
          /MIR /NFL /NDL /NJH /NJS /NP >/dev/null 2>&1 || true
        rm -rf "$tmp" 2>/dev/null || true
      fi
      win="$(cygpath -w "$dir" 2>/dev/null || printf '%s' "$dir")"
      cmd //c rd //s //q "$win" >/dev/null 2>&1 || true
      ;;
  esac
  # 收尾检查：删不掉就说出来。**不改权威** —— 目标能不能用仍以 `git clone` 为准（见调用处）；这条只是
  # 把「是哪一步没成」说清楚，别让它以一次看起来无关的克隆失败露面。
  #
  # Post-condition: say so when the directory is still there. It does not move the authority — whether
  # the destination is usable is still `git clone`'s call (see the caller). It just names which step
  # failed, instead of letting that surface as an unrelated-looking clone failure.
  if [ -e "$dir" ]; then
    echo "wipe_checkout: $dir 仍在 —— git clone 会以「非空」拒绝它；请手工删掉再重跑。" >&2
    echo "wipe_checkout: $dir is still there — git clone will refuse it as non-empty; remove it by hand and re-run." >&2
  fi
  return 0
}

# 这个目录**自己**是不是一个检出？`-d "$UI_DIR/.git"` 不够 —— 一次「清完了、克隆没成」会留下一个
# **不完整的** `.git`（2026-10-16 在本仓实测：那个目录里只剩它，于是 git **向上**解析到本仓）。那时本步
# 会跳过克隆、对着一个并不存在的树做复位，死在 `pathspec '.' did not match any file(s) known to git` 上
# —— 那句话既不说成因、也不说办法。故判据问 git 自己：只有当它的答案就是它自己时，才算一个检出。
#
# Is this directory its own checkout? `-d "$UI_DIR/.git"` is not enough: a wipe that finished while its
# clone did not leaves an incomplete `.git` behind (measured in this repository on 2026-10-16 — that
# directory held nothing else, so git resolved upward to this repository). The step then skips the clone
# and resets a tree that is not there, dying on `pathspec '.' did not match any file(s) known to git`,
# which names neither the cause nor the fix. So the test asks git: this is a checkout only when git's
# answer is itself.
is_own_checkout() {
  [ -n "$1" ] && [ -d "$1" ] || return 1
  local top
  top="$(git -C "$1" rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -n "$top" ] && [ "$(cd "$top" 2>/dev/null && pwd -P)" = "$(cd "$1" && pwd -P)" ]
}

if [[ "$SKIP_BUILD" == "0" ]] && ! is_own_checkout "$UI_DIR"; then
  # Clear whatever is there before cloning, and do not gate that on a test of the directory. A
  # half-deleted checkout is one that `[[ -e ]]` can report as absent while `git clone` still refuses it
  # as "not empty" — and that disagreement is exactly how this step used to fail, reported as "no
  # checkout at …" against a path that was, in git's view, occupied. `git clone` is the authority on
  # whether the destination is usable, so its output is the signal, not the exit status of a wipe whose
  # view of the filesystem is the thing that is unreliable.
  #
  # 克隆前先清掉那里的东西，且**不以目录测试为门**：一份删了一半的检出，`[[ -e ]]` 可能报「不在」，而
  # `git clone` 仍以「非空」拒绝它 —— 这个不一致正是这一步曾经的失败方式，而且被报成对着一个（在 git 看来）
  # 已被占用的路径说「no checkout at …」。目标能不能用**以 `git clone` 为准**，故信号是它的输出，而不是
  # 一次清理的退出码 —— 那次清理对文件系统的看法恰恰是不可靠的那个。
  wipe_checkout "$UI_DIR"
  echo "fetching the admin UI into $UI_DIR (upstream keeps it out of this repository)…"
  mkdir -p "$(dirname "$UI_DIR")"
  clone_args=(--depth 1)
  if ! git clone "${clone_args[@]}" "$UI_REPO" "$UI_DIR"; then
    echo "cloning the admin UI failed: $UI_REPO -> $UI_DIR" >&2
    echo "the checkout is fetched only when it is missing, so either retry, or point KEELBASE_YUDAO_UI at a checkout you already have" >&2
    exit 2
  fi

  # 钉住的默认值按**提交**取，不走 `--branch`：`--branch` 只接受 ref，而补丁所针对的 `9bd6a91` 是
  # master 上的普通提交、上游也没有对应 tag；克隆 master 现在会落到补丁已贴不上的树（2026-10-23 实测：
  # 默认 clone 在 `0003` 处失败，上游 HEAD 为 `b30cd8c`）。故先克隆默认分支，再把钉住的提交浅取回来、
  # 分离检出；覆盖值传分支或标签时走的是同一条路径。
  #
  # The pinned default is fetched as a **commit**, not through `--branch`: `--branch` takes a ref only,
  # and `9bd6a91` — the commit our patches target — is a plain commit on master with no tag upstream;
  # cloning master now lands on a tree the patches no longer fit (measured 2026-10-23: the default
  # clone fails at `0003`, upstream HEAD `b30cd8c`). So clone the default branch, then shallow-fetch the
  # pinned commit and check it out detached; an override naming a branch or tag takes the same path.
  if [[ -n "$UI_REF" ]]; then
    if ! git -C "$UI_DIR" fetch --depth 1 origin "$UI_REF"; then
      echo "取不到钉住的界面提交 $UI_REF（来自 $UI_REPO）——默认分支的克隆已丢弃，重跑即可重试。" >&2
      echo "could not fetch the pinned UI ref $UI_REF from $UI_REPO — the default-branch clone was discarded; re-run to retry." >&2
      wipe_checkout "$UI_DIR"
      exit 2
    fi
    git -C "$UI_DIR" checkout --quiet --detach FETCH_HEAD
  fi
fi

# 同上：判「有没有检出」问 git，不看 `.git` 在不在。
# Same as above: ask git whether there is a checkout, rather than whether a `.git` entry exists.
if ! is_own_checkout "$UI_DIR"; then
  echo "no checkout at $UI_DIR — run without --skip-build, or set KEELBASE_YUDAO_UI" >&2
  exit 2
fi

UI_SHA="$(git -C "$UI_DIR" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "admin UI checkout: $UI_DIR @ $UI_SHA"

# --- 1b. our overlay and patches, laid over a reset tree -------------------------------------------
# Until now the layer never touched the host's source. Two of the things asked of it cannot be done
# from outside — the dashboard card's contents and the logo import are source, not styling — so this
# repository now carries deltas and the build lays them on. The checkout is disposable and refetched,
# so it is reset to upstream first: without that, a second run applies the patches twice and fails,
# and the script could not be used to iterate.
#
# Both directions fail loudly on purpose. An overlay whose target no longer exists, and a patch that
# no longer applies, both mean upstream moved and our delta has to be revisited — never that the
# delta should be skipped, which would leave the artefact quietly half-ours.
#
# 在这之前，这一层从不碰宿主的源码。有两件被要求的事从外面做不到——首页卡片的内容与 logo 的引用是**源码**，
# 不是样式——故本仓现在承载增量，由构建铺上去。检出是一次性的、每次重新取，故先复位到上游：没有这一步，
# 第二次跑会把补丁应用两遍而失败，这个脚本也就没法用来反复迭代。
#
# 两个方向都**刻意**响亮地失败。覆盖目标已不存在、补丁已应用不上，都意味着上游动了、我们的增量需要重做
# ——而不是「跳过它」，那会让产物悄悄变成半我们的。
OVERLAY="$REPO_ROOT/keelbase-ui/host-overlay"
PATCHES="$REPO_ROOT/keelbase-ui/host-patches"
REMOVALS="$REPO_ROOT/keelbase-ui/host-removals.txt"

if [[ "$SKIP_BUILD" == "0" && ( -d "$OVERLAY" || -d "$PATCHES" || -f "$REMOVALS" ) ]]; then
  # One writer at a time. Everything below resets, removes, copies and patches **the same checkout**,
  # and two of these runs interleaved see each other's half-finished tree: the second then reads a
  # reset-in-progress as "upstream moved" and sends its reader off to rebase a patch that is fine. That
  # is a right-sounding sentence given for the wrong reason, and it costs whoever believes it a real
  # detour — measured: two runs six seconds apart, the first exiting 0 and the second reporting the
  # patch as inapplicable. The lock is a directory, because `mkdir` is atomic on every filesystem this
  # runs on, and it is released by the EXIT trap below (which the later trap at §4 extends rather than
  # replaces).
  #
  # 同一时刻只允许**一个写者**。下面每一步都在**同一个检出**上复位、删除、铺、打补丁；两次这样的运行
  # 交错时，后一次读到前一次**做了一半**的树，于是把「复位进行中」读成「上游动了」，并让读者去重基一个
  # **本来没问题**的补丁 —— 那是一句**听着对、理由错**的话，而信它的人要为它真绕一段路（实测：两次相隔
  # 六秒的运行，前一次 exit 0、后一次报「补丁贴不上」）。锁用一个目录，因为 `mkdir` 在这个脚本会跑的
  # 每种文件系统上都是原子的；释放交给下面的 EXIT trap（§4 那条 trap 是**扩展**它、不是替换它）。
  LOCK="$UI_DIR/.keelbase-build.lock"
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "another build is laying our delta on $UI_DIR right now (lock: $LOCK)." >&2
    echo "wait for it to finish; if it crashed, remove that directory and run again." >&2
    exit 3
  fi
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

  if ! git -C "$UI_DIR" diff --quiet || ! git -C "$UI_DIR" diff --cached --quiet; then
    echo "resetting the checkout to upstream before laying our delta on it…"
    git -C "$UI_DIR" checkout -- .
  fi

  # --- 1b. the paths this host does not ship --------------------------------------------------------
  # Third direction of the same delta, and the same rule as the other two: it must fail loudly if
  # upstream moved. A path that is no longer there means this list has to be revisited — skipping the
  # entry would leave the artefact quietly carrying a module the product does not ship.
  #
  # It runs after the reset and before the patch, so the patch is applied to a tree that already lacks
  # these paths and therefore must not reference them. The reset is what makes it idempotent: the files
  # are upstream's, so they come back on every refetch and are removed again on every build.
  #
  # 同一份增量的第三个方向，规矩与前两个相同：上游挪动了就必须**响亮地失败**。路径不在了，意味着这份
  # 清单需要重做——跳过那一条，会让产物悄悄带着一个产品不发出去的模块。
  #
  # 它跑在复位之后、补丁之前，于是补丁应用到的树上这些路径已经不在、补丁也就不该引用它们。**复位**正是它
  # 幂等的原因：这些文件是上游的，每重新取一次就回来一次，每次构建再删一次。
  if [[ -f "$REMOVALS" ]]; then
    while IFS= read -r rel || [[ -n "$rel" ]]; do
      rel="${rel#"${rel%%[![:space:]]*}"}"   # trim leading whitespace
      rel="${rel%"${rel##*[![:space:]]}"}"   # trim trailing whitespace
      [[ -z "$rel" || "$rel" == \#* ]] && continue
      case "$rel" in
        /* | *..*)
          echo "removal list entry is not a plain repo-relative path: $rel" >&2
          exit 1
          ;;
      esac
      if [[ ! -e "$UI_DIR/$rel" ]]; then
        echo "removal list names a path upstream no longer has: $rel" >&2
        echo "upstream moved it — the removal list has to be revisited, not skipped" >&2
        exit 1
      fi
      rm -rf "${UI_DIR:?}/$rel"
      echo "removed $rel"
    done < "$REMOVALS"
  fi

  # The overlay adds files the checkout does not have; it does not replace upstream's. That is
  # deliberate, and it is what makes the coupling loud: a file we add is referenced only from a patch,
  # so if upstream moves the code that references it, the patch fails to apply and says so. A
  # replacement would have no such tripwire — upstream renaming the file would leave our copy sitting
  # there unused while the app went on using theirs, silently. If a replacement is ever needed, it
  # belongs in this directory *together with* the patch that points at it.
  # 覆盖目录**新增**检出里没有的文件，不替换上游的。这是刻意的，也正是让这层耦合响亮的原因：我们新增的文件
  # 只被补丁引用，故上游一旦挪动引用它的那段代码，补丁就应用不上、并会明说。替换则没有这样的绊线——上游把
  # 文件改名后，我们那份会静静躺在那里不被用，而应用继续用它的。真需要替换时，它应当与**指向它的那条补丁**
  # 一同放进本目录。
  if [[ -d "$OVERLAY" ]]; then
    while IFS= read -r -d '' f; do
      rel="${f#"$OVERLAY"/}"
      # The directory has to exist first. Upstream has no `src/keelbase/` and no
      # `src/views/keelbase/governance/`, so a plain `cp` into either fails — and until this line
      # existed it failed *quietly*: the loop's status is the trailing `echo`'s, so the build went on
      # without the files and reported success. An overlay entry that cannot be placed is the same
      # class of error the patch and the removal list get, so it fails the same way.
      # 目录得先存在。上游没有 `src/keelbase/`、也没有 `src/views/keelbase/governance/`，故直接 `cp`
      # 进去会失败——而在这一行存在之前，它失败得**悄无声息**：循环的退出码取的是末尾那个 `echo` 的，
      # 于是构建在没有这些文件的情况下继续跑，并报成功。放不进去的覆盖项，与补丁、删除清单是同一类错误，
      # 故让它以同样的方式失败。
      mkdir -p "$(dirname "$UI_DIR/$rel")"
      if ! cp "$f" "$UI_DIR/$rel"; then
        echo "could not place overlay file: $rel" >&2
        exit 1
      fi
      echo "added $rel"
    done < <(find "$OVERLAY" -type f -print0)
  fi

  if [[ -d "$PATCHES" ]]; then
    for p in "$PATCHES"/*.patch; do
      [[ -e "$p" ]] || continue
      if ! git -C "$UI_DIR" apply --check "$p" 2>/dev/null; then
        echo "patch does not apply cleanly: $(basename "$p")" >&2
        echo "upstream changed the code it edits — the patch has to be rebased, not skipped" >&2
        exit 1
      fi
      git -C "$UI_DIR" apply "$p"
      echo "applied $(basename "$p")"
    done
  fi

  # --- 1c. the hosts this product does not name -----------------------------------------------------
  # A fourth thing the delta has to do, and it runs last because it has to see the tree the patch
  # produced. Links into the platform this host was forked from survive in module pages that never
  # render — the docs banner is off by a flag — so what is left is a string in a lazily-loaded chunk.
  # There are hundreds of them and they cannot be patched one by one; the sweep blanks the URL on
  # every listed host, and section 2b asserts none reached the artefact.
  #
  # 增量要做的第四件事，且它跑在最后——因为它必须看见补丁产出的那棵树。指向**被 fork 的那个平台**的
  # 链接，活在从不渲染的模块页里——文档提示条由开关关掉——于是剩下的是懒加载分片里的一个字符串。它们有
  # 几百处、没法逐个打补丁；清扫把清单上每个主机上的 URL 清空，2b 段再断言没有一条进产物。
  if [[ -f "$REPO_ROOT/keelbase-ui/host-vendor-hosts.txt" ]]; then
    node "$REPO_ROOT/scripts/sweep-vendor-hosts.mjs" "$UI_DIR"
  fi
fi

# --- 2. build the app, from an untouched tree ------------------------------------------------------
if [[ "$SKIP_BUILD" == "0" ]]; then
  # The upstream tree ships a pnpm lockfile (v9) and no npm one, so pnpm is the faithful package
  # manager — and it is pinned to the major that lockfile belongs to. This machine's corepack default
  # is pnpm 12, which refuses this lockfile twice over: it rejects the 159 tarball URLs the lockfile
  # records against the npmmirror host (ERR_PNPM_TARBALL_URL_MISMATCH — and by its own wording it
  # refuses "whatever the configured policies"), and it blocks dependency build scripts outright
  # (ERR_PNPM_IGNORED_BUILDS, esbuild among them). Pinning avoids both instead of special-casing each.
  # The registry is still passed on the install, because the mirror is what the lockfile names and it
  # is markedly faster from here; npm stays the fallback, not the first choice.
  # 上游只带 pnpm 的 lockfile（v9）、不带 npm 的，故 pnpm 才是忠实的包管理器，并钉在属于那份 lockfile
  # 的大版本上。本机 corepack 默认是 pnpm 12，它对这份 lockfile 有两道拒绝：一，lockfile 把 159 个
  # tarball 记在 npmmirror 主机上，它认为与 registry 发布的元数据不符而拒
  # （ERR_PNPM_TARBALL_URL_MISMATCH，且按其原文「无论配了什么策略」都拒）；二，它默认禁止依赖的构建
  # 脚本（ERR_PNPM_IGNORED_BUILDS，esbuild 在其中）。钉版本一次避开两道，不必逐个特判。装依赖时仍显式
  # 传 registry——那面镜像是 lockfile 自己记的，且从这里快得多；npm 只作兜底，不作首选。
  # corepack asks before downloading a package manager; there is no one to answer here.
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  if command -v corepack >/dev/null 2>&1; then PM=(corepack "pnpm@$PNPM_VERSION"); else PM=(pnpm); fi
  if ! "${PM[@]}" --version >/dev/null 2>&1; then
    echo "no pnpm — falling back to npm (the lockfile is pnpm's, so the tree may resolve differently)" >&2
    PM=(npm)
  fi

  # Unconditional, not gated on node_modules existing: a checkout whose last install died partway
  # leaves a node_modules that looks present and is not usable, and the failure surfaces only later,
  # as a missing module during the build. pnpm makes a satisfied install a no-op.
  # Upstream renders a doc-alert banner on most pages, pointing at its own documentation site. It is
  # gated by a build-time flag, so it is turned off here rather than hidden with CSS: the element then
  # never renders at all. It goes through the environment because Vite lets a variable that already
  # exists win over the .env file — which is what keeps this a build-flag change and not an edit to an
  # upstream file. Override with KEELBASE_YUDAO_UI_DOCALERT=true to get upstream's behaviour back.
  # 上游在多数页面上渲染一条文档提示条，指向它自己的文档站。它由一个构建期开关控制，故在此**关掉**
  # 而不是用 CSS 藏起来：元素因此根本不渲染。走环境变量，是因为 Vite 让已存在的变量优先于 `.env` 文件
  # ——这正是让这件事停留在「改构建开关」而**不是**改上游文件的原因。用
  # KEELBASE_YUDAO_UI_DOCALERT=true 可恢复上游行为。
  export VITE_APP_DOCALERT_ENABLE="${KEELBASE_YUDAO_UI_DOCALERT:-false}"

  # The product's name, not the platform's. Same mechanism and same reason as the flag above: the app
  # reads its title from this variable, so the build sets it rather than editing the .env file that
  # carries upstream's. It lands in the page title and in every place the UI shows the system's name.
  # 产品的名字，不是平台的名字。机制与理由同上：应用从这个变量取标题，故由构建设置它，而不是去改承载上游
  # 值的那份 .env。它会落到页面标题，以及界面里每一处显示系统名的地方。
  export VITE_APP_TITLE="${KEELBASE_YUDAO_UI_TITLE:-KeelBase}"

  # The tenant the login form pre-fills. It is not a label: it is the name the login looks the tenant
  # up by, so it has to be the name the database actually carries — which is why it moves together
  # with `sql/keelbase-brand-names.sql` and not on its own.
  # 登录表单预填的租户名。它不是标签：它是登录**按名字查租户**时用的那个名字，故必须与库里实际的名字一致——
  # 这正是它要与 `sql/keelbase-brand-names.sql` **一起**改、而不能单独改的原因。
  export VITE_APP_DEFAULT_LOGIN_TENANT="${KEELBASE_YUDAO_UI_TENANT:-KeelBase}"

  # Upstream's base `.env` carries a Baidu analytics id and `main.ts` loads that script
  # unconditionally, so every page view of this console is reported to Baidu — under *their* account.
  # Empty means the plugin returns early and no request is made. Set
  # KEELBASE_YUDAO_UI_BAIDU_CODE to use an account of our own.
  # 上游的基础 `.env` 里带着一个百度统计 id，而 `main.ts` 无条件加载那段脚本，故这个控制台的**每次浏览**
  # 都会报到百度——**记在它们的账号**上。留空即插件早退、不发任何请求；要用自己的账号就设
  # KEELBASE_YUDAO_UI_BAIDU_CODE。
  export VITE_APP_BAIDU_CODE="${KEELBASE_YUDAO_UI_BAIDU_CODE:-}"

  # Where the built page sends its API calls. Upstream's own `.env.prod` pins this to
  # `http://localhost:48080`, which is right for the machine that builds it and wrong for every
  # machine that serves it: the page would ask the *visitor's* own machine for the API, and every
  # call fails as a network error while the page itself loads fine. Empty means "same origin", so the
  # page asks whichever host served it — and the outer nginx decides where /admin-api goes. Override
  # with KEELBASE_YUDAO_UI_BASE_URL when the API lives on a different origin than the page.
  # 构建产物把接口打到哪里。上游自己的 `.env.prod` 把它钉在 `http://localhost:48080`（Vite 用
  # `VITE_BASE_URL + VITE_API_URL` 拼出 base）。那对**构建它的机器**是对的，对**任何服务它的机器**
  # 都是错的：页面会去问**访问者自己的机器**要接口，于是页面本身加载正常、每次调用却以网络错误收场。
  # 留空＝同源，页面就问服务它的那个主机，而 `/admin-api` 去哪由外层 nginx 决定。页面与接口不同源时，
  # 用 KEELBASE_YUDAO_UI_BASE_URL 覆盖。
  export VITE_BASE_URL="${KEELBASE_YUDAO_UI_BASE_URL:-}"

  echo "installing the app's dependencies (this is upstream's own toolchain)…"
  ( cd "$UI_DIR" && "${PM[@]}" --registry="$REGISTRY" install )

  # The offline icon set is derived from the checkout's own source, and the console's Icon component
  # no longer asks a CDN — so an icon reference upstream adds after the set was last generated would
  # render blank. It is verified here, the same loud failure the patch and the removal list get.
  # 离线图标集由检出自身的源码派生，而控制台的 Icon 组件已不再问 CDN——故上游在集合上次生成之后新增的
  # 一处图标引用会渲染成空白。在此校验——与补丁、删除清单同样的响亮失败。
  if [[ -f "$REPO_ROOT/scripts/gen-offline-icons.mjs" ]]; then
    node "$REPO_ROOT/scripts/gen-offline-icons.mjs" --check "$UI_DIR" || {
      echo "the offline icon set is stale — regenerate: node scripts/gen-offline-icons.mjs" >&2
      exit 1
    }
  fi

  ( cd "$UI_DIR" && "${PM[@]}" run "$BUILD_SCRIPT" )
fi

DIST="$UI_DIR/$OUT_NAME"
INDEX="$DIST/index.html"
if [[ ! -f "$INDEX" ]]; then
  echo "no built page at $INDEX — run without --skip-build, or set KEELBASE_YUDAO_UI_OUT" >&2
  exit 2
fi

# --- 2a. no rendered line of copy may carry a literal Markdown marker ------------------------------
# 2026-10-26 实测：`**本部署**`、`**没有会话**` 一类**成对的星号**与反引号被原样画在中文页面上。字符串级
# 抓不住它——词条里的 `{'@'}Bean` 正是为了**渲染成** `@Bean`，星号也只是数据；记号在渲染那一刻才变成
# 读者眼前的字面。故这里走真实的渲染路径：词条交给 vue-i18n，模板交给 Vue 自己的解析器。见
# `scripts/check-rendered-copy.mjs`。
#
# Measured on 2026-10-26: **paired asterisks** like `**本部署**` and backticks were drawn literally on
# Chinese pages. A string-level scan cannot see it — `{'@'}Bean` is written to **render as** `@Bean`,
# and the asterisks are only data; the markers become literal text at render time. So this takes the real
# rendering path: messages through vue-i18n, templates through Vue's own parser. See
# `scripts/check-rendered-copy.mjs`.
if [[ -f "$REPO_ROOT/scripts/check-rendered-copy.mjs" ]]; then
  node "$REPO_ROOT/scripts/check-rendered-copy.mjs" "$UI_DIR"
fi

# 解析那一半的姊妹闸：把每个模板**真挂载**一遍，让表达式被求值——解析看不见 `{{ '*' + '*' }}` 或
# `:title="a + '**' + b"`。作用域同一份，边界（不执行 `<script>`、不用接口数据）写在那份脚本头部。
#
# The parse half's sibling: every template is **mounted**, so its expressions are evaluated — a parse
# cannot see `{{ '*' + '*' }}` or `:title="a + '**' + b"`. Same scope, and its boundary (no `<script>`,
# no API data) is stated in that script's header.
if [[ -f "$REPO_ROOT/scripts/check-rendered-components.mjs" ]]; then
  node "$REPO_ROOT/scripts/check-rendered-components.mjs" "$UI_DIR"
fi

# --- 2b. the page must not carry an absolute API base pointing at a build machine -----------------
# Upstream's `.env.prod` ships `VITE_BASE_URL=http://localhost:48080`. If that survives into the
# artifact, the page loads fine while every call goes to the *visitor's own* machine and fails as a
# network error — silent, because the page still renders. It is therefore asserted here rather than
# discovered on a deployed host. `VITE_BASE_URL` is emptied above for this reason; this is the check
# that it stayed empty.
# 产物里不得带指向构建机的绝对接口地址。上游 `.env.prod` 写着 `VITE_BASE_URL=http://localhost:48080`；
# 它若活到产物里，页面加载正常、而每次调用都打到**访问者自己的机器**上、以网络错误收场——而且是**静默**的，
# 因为页面照常渲染。所以在这里断言，而不是等部署到机器上才发现。上面正是为此把 `VITE_BASE_URL` 清空；
# 这一段是「它确实还是空的」的检查。
if grep -rqsE "localhost:48080|127\.0\.0\.1:48080" "$DIST"; then
  echo "the built page still points its API at a build machine:" >&2
  grep -rlE "localhost:48080|127\.0\.0\.1:48080" "$DIST" | sed 's/^/  /' >&2
  echo "  leave VITE_BASE_URL empty (or set KEELBASE_YUDAO_UI_BASE_URL) and rebuild" >&2
  exit 1
fi

# --- 2c. the page must not name another product's host ---------------------------------------------
# The sweep in 1c walks the sources; this is what makes the guarantee hold rather than depend on that
# walk being complete. A vendor link is not a request — the pages that carry one never render — so it
# shows up nowhere except in a chunk, which is precisely why it is asserted here instead of noticed.
# 1c 的清扫走的是源码；**这一段**才是让保证成立的东西，而不是依赖那次遍历足够全。厂商链接不是请求——
# 载着它的页面从不渲染——故它哪儿都不显形，只藏在某个分片里；这正是要在这里断言、而不是靠碰巧看见的原因。
if [[ -f "$REPO_ROOT/keelbase-ui/host-vendor-hosts.txt" ]]; then
  VENDOR_RE="$(grep -vE '^[[:space:]]*(#|$)' "$REPO_ROOT/keelbase-ui/host-vendor-hosts.txt" | sed 's/\./\\./g' | paste -sd'|' -)"
  if [[ -n "$VENDOR_RE" ]] && grep -rqsE "$VENDOR_RE" "$DIST"; then
    echo "the built page still names a vendor host:" >&2
    grep -rlE "$VENDOR_RE" "$DIST" | sed 's/^/  /' >&2
    echo "  a host added upstream reaches here — extend keelbase-ui/host-vendor-hosts.txt or the sweep" >&2
    exit 1
  fi
fi

# --- 3. find a sass to compile the tokens with -----------------------------------------------------
# the UI's own toolchain first (step 2 installed it anyway), then the sibling checkout the tokens are
# authored in, then whatever is on PATH.
SASS=""
for candidate in \
  "$UI_DIR/node_modules/.bin/sass" \
  "$REPO_ROOT/../KeelBase/Web-Admin-Vue/node_modules/.bin/sass"
do
  if [[ -x "$candidate" ]]; then SASS="$candidate"; break; fi
done
if [[ -z "$SASS" ]] && command -v sass >/dev/null 2>&1; then SASS="$(command -v sass)"; fi
if [[ -z "$SASS" ]]; then
  echo "no sass found — install the UI's dependencies (see the checkout's own install)" >&2
  exit 2
fi

# --- 4. compile, then mark the primary family as unoverridable-at-mount ----------------------------
# Fact 2 in the header: only the primary family is written inline by the app at mount, so only it
# needs `!important`. The transform is deliberately narrow — it rewrites declarations of
# `--el-color-primary` / `-light-N` / `-dark-N` and nothing else. The tokens never reference the
# family inside `var()`, so a line-level rewrite cannot catch a value by accident.
#
# The `sourceMappingURL` line is dropped on the way through. Sass names the map after a temporary
# file, so leaving it in would (a) point at something that is not in the artefact and (b) change the
# stylesheet's bytes on every build, which changes the hash in the page and defeats caching.
# 顺带丢掉 `sourceMappingURL` 那一行。sass 用临时文件给这份 map 命名，留着它既会（a）指向一个**不在
# 产物里**的文件，又会（b）让样式表的字节每次构建都变——页面里的哈希随之变、缓存也就失效了。
raw="$(mktemp)"
tmp=""
trap 'rm -f "$raw" ${tmp:+"$tmp"}; if [ -n "${LOCK:-}" ]; then rmdir "$LOCK" 2>/dev/null || true; fi' EXIT
"$SASS" "$THEME_SCSS" "$raw"
awk '
  /^\/\*# sourceMappingURL=/ { next }
  /^[ \t]*--el-color-primary(-light-[0-9]+|-dark-[0-9]+)?[ \t]*:[^;]*;[ \t]*$/ { sub(/;[ \t]*$/, " !important;") }
  { print }
' "$raw" > "$DIST/$THEME_CSS_NAME"

got="$(grep -c '^[ \t]*--el-color-primary.*!important;' "$DIST/$THEME_CSS_NAME" || true)"
want="$(grep -c '^[ \t]*--el-color-primary' "$raw" || true)"
if [[ "$got" != "$want" ]]; then
  echo "expected $want primary declarations to carry !important, found $got" >&2
  exit 1
fi
echo "compiled $THEME_CSS_NAME ($want primary declarations pinned)"

# --- 4b. compile the host adapter -------------------------------------------------------------------
# yudao drives the sidebar, the top bar and the tab strip through a namespace of its own, which the
# Element Plus tokens do not reach; this file restates those in the product's language. It carries
# its own `!important` where it needs one, so it is copied through untransformed.
# yudao 用一套自己的命名空间驱动侧边栏 / 顶栏 / 标签条，Element Plus 令牌够不到那几个；这个文件把它们
# 改用产品自己的语言陈述。它自带该有的 `!important`，故此处原样编译、不做转换。
if [[ -f "$HOST_SCSS" ]]; then
  "$SASS" "$HOST_SCSS" "$DIST/$HOST_CSS_NAME"
  echo "compiled $HOST_CSS_NAME"
fi

# The avatar the stylesheet points at. It sits next to the stylesheet in the artefact, so the CSS can
# name it relatively and stay correct whatever the build's base path is — a relative URL inside a
# stylesheet resolves against the stylesheet, not against the page, which is what the page's own
# relative links cannot do.
# 样式表所指的那个头像。它与样式表并排落在产物里，故 CSS 可以用相对路径引用它，且不论构建的 base 是什么
# 都成立——样式表里的相对 URL 是相对**样式表**解析的，而不是相对页面，这正是页面上那些相对链接做不到的事。
AVATAR_SVG="$REPO_ROOT/keelbase-ui/assets/keelbase-avatar.svg"
if [[ -f "$AVATAR_SVG" ]]; then
  cp "$AVATAR_SVG" "$DIST/keelbase-avatar.svg"
  echo "copied keelbase-avatar.svg"
fi

# --- 5. link them into the built page, last, idempotently --------------------------------------------
# The href must be absolute, and it must carry the app's own base path. A relative href resolves
# against the *current route*, not the document root: the app uses history routing, so the moment a
# user reaches a deep route the relative link points at a path that does not exist and the whole
# layer disappears silently — no error, just upstream's look back. The prefix is read off an asset
# link Vite already emitted, so it follows whatever base the build was configured with.
# href 必须是绝对路径，且要带上应用自己的 base。相对 href 是相对**当前路由**解析的，而不是文档根：
# 应用走 history 路由，用户一到深层路由，相对链接就指向一个不存在的路径，**整层静默消失**——不报错，
# 只是上游的样子又回来了。前缀从 Vite 已经产出的资源链接上读，于是它跟着构建配置的 base 走。
BASE_PREFIX="$(sed -n 's/.*\(href\|src\)="\([^"]*\)assets\/.*/\2/p' "$INDEX" | head -1)"
if [[ -z "$BASE_PREFIX" ]]; then BASE_PREFIX="/"; fi
echo "base prefix read from $INDEX: $BASE_PREFIX"

# The href carries a content hash. Vite hashes its own assets; these two files keep their names, so
# without a version a browser that has cached one will keep serving it after the layer changes — which
# shows up as "the edit did nothing" and wastes exactly the time it takes to suspect the CSS.
# href 带内容哈希。Vite 给自己的产物做了哈希；这两个文件名字是固定的，故不带上版本号时，浏览器缓存过
# 的那份在视觉层改了之后还会继续被用——表现出来就是「改了跟没改一样」，白白耗掉本该花在内容上的排查。
THEME_HASH="$(md5sum "$DIST/$THEME_CSS_NAME" | cut -c1-8)"
HOST_HASH=""
if [[ -n "$HOST_CSS_NAME" ]]; then HOST_HASH="$(md5sum "$DIST/$HOST_CSS_NAME" | cut -c1-8)"; fi

tmp="$(mktemp)"
awk -v theme_css="$THEME_CSS_NAME" -v host_css="$HOST_CSS_NAME" -v prefix="$BASE_PREFIX" \
    -v theme_hash="$THEME_HASH" -v host_hash="$HOST_HASH" \
    -v m_theme="$MARKER" -v m_host="$HOST_MARKER" '
  index($0, m_theme) || index($0, m_host) { getline; next }   # drop a marker and the line under it
  {
    if (!done && $0 ~ /<\/head>/) {
      print "    " m_theme
      print "    <link rel=\"stylesheet\" href=\"" prefix theme_css "?v=" theme_hash "\" />"
      if (host_css != "") {
        print "    " m_host
        print "    <link rel=\"stylesheet\" href=\"" prefix host_css "?v=" host_hash "\" />"
      }
      done = 1
    }
    print
  }
' "$INDEX" > "$tmp"
mv "$tmp" "$INDEX"

# --- 5b. the governance boundary, carried as data ---------------------------------------------------
# `YD-27`: the console has to *present* which AI paths this deployment's governance holds and which it
# does not, and to do that from the same computation CI runs rather than from a description written
# beside it. That computation is `scripts/check-ungoverned-tool-beans.mjs`, and its `--emit` is written
# straight into the artefact — nothing is hand-copied and there is no committed copy to go stale. It runs
# here, beside the theme layer, so what ships is the boundary of the sources this build was made from.
#
# A violation is **recorded, not fatal here**. This build's job is to carry the record; a build that
# stopped would take away the very page that shows a reader the violation. CI is where it fails loudly.
#
# `YD-27`：控制台要**呈现**本部署的治理扣住哪些 AI 路径、哪些不扣，且必须来自 CI 跑的那同一次计算，而不是
# 旁边手写的一段描述。那次计算就是 `scripts/check-ungoverned-tool-beans.mjs`，它的 `--emit` 直接写进产物
# —— 没有一处是手抄的，也没有一份会烂掉的提交副本。它在这里跑、与主题层并列，故随产物出去的是**这个构建所用
# 源码**的那条边界。
#
# 有违反是**记录下来、不在这里致命**。这次构建的职责是把记录带出去；停下来会把「把违反展示给读者」的那一页
# 一并带走。响亮失败的地方是 CI。
#
# 这份记录是一条**公开面**（2026-10-25 定）：它随产物出去、不做鉴权，未登录也取得到。判据是它写的是什么——
# 构建事实（扫描根、文件数、`文件:行`、每条 AI 路径的治理姿态），**没有一句调用方的数据**，也**不问服务端
# 要任何东西**；这与 `/app/capabilities`、`/app/provenance` 是同一类「应用自述」，而源码本就以 Apache-2.0
# 公开，那几行路径不构成泄露。页面路由与菜单（`sql/keelbase-boundary-menu.sql`，授予 `common`）用的是同一条
# 判据：不含调用方数据的面发出去不增加可达面。**不要**只给这个文件加鉴权而把 JS 产物留在公开处——那样挡不住
# 这里任何一条事实，只会让页面在未登录时静默空白。
#
# This record is a **public face** (ruled 2026-10-25): it ships with the artefact, is not authenticated, and
# even an anonymous fetch gets it. The test is what it says — build facts (scan roots, file count,
# `file:line` coordinates, each AI path's governance posture) with not one caller's data in it, and it asks
# the server for nothing. It is the same kind of self-description as `/app/capabilities` and
# `/app/provenance`, and the sources are published under Apache-2.0 anyway, so those coordinates leak
# nothing. The page's route and menu (`sql/keelbase-boundary-menu.sql`, granted to `common`) are handed out
# by the same test: a face carrying no caller's data adds no reach. **Do not** authenticate this file alone
# while leaving the JS artefact public — that withholds none of the facts here and only makes the page
# render blank for a signed-out visitor.
if [[ -f "$REPO_ROOT/scripts/check-ungoverned-tool-beans.mjs" ]]; then
  set +e
  node "$REPO_ROOT/scripts/check-ungoverned-tool-beans.mjs" --emit "$DIST/$BOUNDARY_NAME"
  boundary_rc=$?
  set -e
  if [[ "$boundary_rc" != "0" ]]; then
    echo "note: the governance boundary recorded a violation in $BOUNDARY_NAME; CI is where that fails" >&2
  else
    echo "wrote $BOUNDARY_NAME into $DIST (the boundary of the sources this build was made from)"
  fi
fi

# --- 6. assert, rather than report ------------------------------------------------------------------
assert_one() {
  local marker="$1" href="$2" count
  count="$(grep -c -F -- "$marker" "$INDEX" || true)"
  if [[ "$count" != "1" ]]; then
    echo "expected exactly one '$marker' in $INDEX, found $count" >&2
    exit 1
  fi
  if ! grep -q -F -- "$href" "$INDEX"; then
    echo "link missing from $INDEX: $href" >&2
    exit 1
  fi
}
assert_one "$MARKER" "$BASE_PREFIX$THEME_CSS_NAME"
if [[ -n "$HOST_CSS_NAME" ]]; then assert_one "$HOST_MARKER" "$BASE_PREFIX$HOST_CSS_NAME"; fi

# 这份记录必须在：没有它那一页什么都不画，而「文件不在」与「端点拒绝」是两种不同的坏法 —— 这次构建正是能
# 注意到它的地方。
#
# The record has to be there: the page renders nothing without it, and a missing file is a different
# failure from a refused endpoint — this build is where that gets noticed.
if [[ ! -s "$DIST/$BOUNDARY_NAME" ]]; then
  echo "missing $DIST/$BOUNDARY_NAME — the console's boundary page would render nothing" >&2
  echo "  (scripts/check-ungoverned-tool-beans.mjs writes it; if that gate is gone, that is why)" >&2
  exit 1
fi

echo "linked $BASE_PREFIX$THEME_CSS_NAME${HOST_CSS_NAME:+ and $BASE_PREFIX$HOST_CSS_NAME} into $INDEX"
echo "note: the layer is in the artefact only — the UI's own dev server renders upstream's look."
