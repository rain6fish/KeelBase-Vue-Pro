#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Is the skin the host UI build will use actually intact — and does the artefact in front of us agree
# that it was built for that skin?
#
# Background (audit of the Harbor rename, 2026-11-19). `KEELBASE_UI_SKIN` was named in
# `scripts/build-host-ui.sh` and nowhere else: no test and no CI job went red when the default skin
# broke, when a skin entry disappeared, or when a token was reverted to its pre-rename prefix. And
# `--skip-build` reused whatever `dist-prod` was lying there, so a `dist-prod` built before the rename
# — its stylesheets still carrying `--materio-` tokens — could be handed to a deployment as if it
# were current. This script is the negative control for both. `scripts/build-host-ui.sh` calls it
# before it reuses an existing artefact and again after it compiles the skin, so the criterion has
# one definition and two execution sites.
#
# The assertions, by id (each one prints `ok` or `FAIL`, and every failure is named):
#
#   [D1] `scripts/build-host-ui.sh` declares the default skin, and it is the one this check treats as
#        the default. This is the reading the audit said was missing: change `:-harbor` to `:-product`
#        and nothing else in the repository notices.
#   [S0] the skin's source directory exists
#   [S1] the theme entry exists          (`$SKIN.scss`, or `theme/element-theme.scss` for product)
#   [S2] the host adapter entry exists   (`host-yudao-$SKIN.scss`, or `theme/host-yudao.scss`)
#   [S3] the skin's source carries its token prefix at least once (skins that declare one)
#   [S4] the skin's source carries no `var(--materio` — the pre-rename prefix, measured 14 times in
#        comments only, which is why the needle is the `var(` form and not the bare token name
#   [S5] the skin's source carries none of the *other* skin's prefix
#   [A1] an injected `keelbase-theme.css` carries the skin's prefix
#   [A2] that stylesheet carries no `var(--materio`
#   [A3] an injected `keelbase-host.css` carries no `var(--materio`
#   [A4] no injected artefact carries the other skin's prefix
#
# A skin that has no artefact yet is not a failure: nothing has been injected, and the build that
# follows is what produces it (§4c of `build-host-ui.sh` re-runs this after compiling).
#
# Exit codes — the check and its self-test live in separate spaces on purpose, so a red can never be
# confused for "the keeper itself is broken":
#
#   check:     0 = every assertion holds, 1 = at least one assertion failed, 2 = cannot decide
#              (unknown skin, or the repository tree the assertions read is not there)
#   self-test: 0 = every control behaved as expected, 2 = the fixture could not be built,
#              3 = a control did NOT redden (or a green control did not stay green) — the keeper is
#              broken, not the tree
#
# Per-skin layout. `harbor` is the default and the only skin that lives under `skins/`; `product` is
# the earlier skin and lives in `theme/`. Both facts mirror the `case "$SKIN"` in
# `scripts/build-host-ui.sh` and are deliberately not changed here.
#
# 构建要用的皮肤是否完好，以及眼前这份产物是否也认为自己是这套皮肤构建出来的？
#
# 背景（2026-11-19 Harbor 更名审计）。`KEELBASE_UI_SKIN` 只出现在 `scripts/build-host-ui.sh` 一处：
# 默认皮肤坏了、皮肤入口不在了、令牌被改回改名前的样子——没有测试、也没有 CI 会变红。而 `--skip-build`
# 会直接复用躺在那里 `dist-prod`，于是更名前构建的产物（样式表里还是 `--materio-` 令牌）可能被当成
# 现行的东西交给部署。本脚本是这两件事的负向控制。`scripts/build-host-ui.sh` 在复用它之前调用一次、
# 编译完皮肤之后再调用一次，故判据只有一处定义、两处执行。
#
# 断言按 id 列出（每条打印 `ok` 或 `FAIL`，失败逐条点名）：
#
#   [D1] `scripts/build-host-ui.sh` 里声明了默认皮肤，且与本检查认定的默认值一致。这正是审计说缺的
#        那一读数：把 `:-harbor` 改成 `:-product`，全仓再没有别的地方会注意到。
#   [S0] 皮肤源目录存在
#   [S1] 主题入口存在（`$SKIN.scss`；product 为 `theme/element-theme.scss`）
#   [S2] 宿主适配入口存在（`host-yudao-$SKIN.scss`；product 为 `theme/host-yudao.scss`）
#   [S3] 皮肤源里至少出现一次自己的令牌前缀（声明了前缀的皮肤）
#   [S4] 皮肤源里没有 `var(--materio` —— 改名**前**的前缀；它在本仓只出现在 14 处注释里，故探针取
#        `var(` 形式而不是光秃秃的令牌名
#   [S5] 皮肤源里没有任何**另一套**皮肤的前缀
#   [A1] 已注入的 `keelbase-theme.css` 带本皮肤的前缀
#   [A2] 该样式表里没有 `var(--materio`
#   [A3] 已注入的 `keelbase-host.css` 里没有 `var(--materio`
#   [A4] 没有任何已注入产物带着另一套皮肤的前缀
#
# 还没有产物的皮肤不算失败：那是「尚未注入」，随后那次构建正是产出它的地方（`build-host-ui.sh`
# §4c 编译完会再跑一次本检查）。
#
# 退出码 —— 真实检查与自检**刻意分处两个区段**，免得「红」被当成「看门人自己坏了」：
#
#   真实检查：0 = 全部断言成立，1 = 至少一条断言失败，2 = 判不了（未知皮肤，或断言要读的那棵树不在）
#   自检：    0 = 每个对照都按预期表现，2 = 临时夹具建不起来，3 = 有对照**没有**变红（或绿对照没保持绿）
#             —— 坏的是看门人，不是这棵树
#
# 每套皮肤的布局：`harbor` 是默认、也是唯一住在 `skins/` 下的皮肤；`product` 是更早那套，住在
# `theme/`。这两件事都照 `scripts/build-host-ui.sh` 里的 `case "$SKIN"`，本脚本**刻意不改**。
#
#   bash scripts/check-ui-skin.sh               # 检查 $KEELBASE_UI_SKIN（默认 harbor）
#   bash scripts/check-ui-skin.sh --self-test   # 在临时目录里证明每条断言都会变红
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

DEFAULT_SKIN="harbor"
LEGAL_SKINS="harbor, product"

# Per-skin layout: directory, theme entry, host entry, token prefix. An empty prefix means the skin
# keeps Element Plus' own custom-property names and has no prefix of its own to look for.
# 每套皮肤：目录、主题入口、宿主入口、令牌前缀。前缀留空 = 该皮肤沿用 Element Plus 自己的自定义属性名，
# 没有属于自己、可以找的前缀。
skin_layout() {
  case "$1" in
    harbor)  printf '%s\t%s\t%s\t%s' 'keelbase-ui/skins/harbor' 'harbor.scss' 'host-yudao-harbor.scss' '--harbor-' ;;
    product) printf '%s\t%s\t%s\t%s' 'keelbase-ui/theme' 'element-theme.scss' 'host-yudao.scss' '' ;;
    *) return 1 ;;
  esac
}

FAILS=0

pass_line() { printf '  ok    %s\n' "$*"; }
fail_line() { printf '  FAIL  %s\n' "$*" >&2; FAILS=$((FAILS + 1)); }
skip_line() { printf '  --    %s\n' "$*"; }

# Three literal needles counted in **one** pass over the given files, printed one count per line in the
# order given. One `awk` rather than `grep | wc` per needle per file: on Windows each process start
# costs hundreds of milliseconds, and the self-test drives this over fourteen fixtures.
# 三个字面串、对给定文件**只遍历一趟**，按给定顺序每行打印一个计数。用一次 `awk`，而不是每个串每个文件
# 各起一条 `grep | wc`：Windows 上每次起进程要几百毫秒，而自检要在十四份夹具上驱动它。
count_needles() {
  local n1="$1" n2="$2" n3="$3"
  shift 3
  awk -v n1="$n1" -v n2="$n2" -v n3="$n3" '
    function hits(s, n,   c, i) {
      if (n == "") return 0
      c = 0
      while ((i = index(s, n)) > 0) { c++; s = substr(s, i + length(n)) }
      return c
    }
    { c1 += hits($0, n1); c2 += hits($0, n2); c3 += hits($0, n3) }
    END { print c1 + 0; print c2 + 0; print c3 + 0 }
  ' "$@"
}

skin_source_files() {
  [ -d "$1" ] || return 0
  find "$1" -type f \( -name '*.scss' -o -name '*.css' \) 2>/dev/null | sort
}

# The whole criterion, as a function of (root, skin, dist) so the self-test can drive it over fixtures
# with the very same code the real check runs.
# 整条判据，写成 (根目录, 皮肤, 产物目录) 的函数，于是自检能用**真实检查跑的同一份代码**在夹具上驱动它。
run_check() {
  local root="$1" skin="$2" dist="$3"
  local layout dir rel_theme rel_host prefix other_prefix
  local skins_dir theme host build_script declared
  local files=() theme_css host_css n

  FAILS=0

  if ! layout="$(skin_layout "$skin")"; then
    echo "unknown KEELBASE_UI_SKIN: $skin (expected harbor or product)" >&2
    echo "未知的 KEELBASE_UI_SKIN：$skin（取值 harbor 或 product）" >&2
    echo "legal values / 合法取值: $LEGAL_SKINS" >&2
    return 2
  fi
  IFS=$'\t' read -r dir rel_theme rel_host prefix <<< "$layout"
  other_prefix=""
  if [ "$skin" = "harbor" ]; then other_prefix="$(skin_layout product | cut -f4)"; else other_prefix="$(skin_layout harbor | cut -f4)"; fi

  # [D1] — the default itself, read out of the declaration that defines it rather than guessed from a
  # comment or a mention. A drifted default is exactly the silent breakage the audit found.
  # [D1] —— 默认值本身，从**定义它的那条声明**里读，不从注释或某处提及里去猜。默认值漂了，正是审计发现的
  # 那种无声的坏法。
  build_script="$root/scripts/build-host-ui.sh"
  if [ ! -f "$build_script" ]; then
    fail_line "[D1] no build script at $build_script — the default skin cannot be read"
  else
    declared="$(sed -n 's/^SKIN="\${KEELBASE_UI_SKIN:-\([A-Za-z0-9_-]*\)}".*/\1/p' "$build_script" | head -1)"
    if [ -z "$declared" ]; then
      fail_line "[D1] $build_script no longer declares the default as SKIN=\"\${KEELBASE_UI_SKIN:-<skin>}\" — this check cannot read it, and a default nothing reads is a default nothing guards"
    elif ! skin_layout "$declared" >/dev/null; then
      fail_line "[D1] $build_script defaults to an unknown skin: $declared (legal: $LEGAL_SKINS)"
    elif [ "$declared" != "$DEFAULT_SKIN" ]; then
      fail_line "[D1] $build_script defaults to '$declared' while this check treats '$DEFAULT_SKIN' as the default — move the two together, and move the documentation with them"
    else
      pass_line "[D1] the build defaults to '$declared', the same skin this check guards"
    fi
  fi

  skins_dir="$root/$dir"
  theme="$skins_dir/$rel_theme"
  host="$skins_dir/$rel_host"

  if [ -d "$skins_dir" ]; then
    pass_line "[S0] skin directory: $dir"
  else
    fail_line "[S0] skin directory missing: $dir (skin: $skin)"
  fi
  if [ -f "$theme" ]; then
    pass_line "[S1] theme entry: $dir/$rel_theme"
  else
    fail_line "[S1] theme entry missing: $dir/$rel_theme (skin: $skin)"
  fi
  if [ -f "$host" ]; then
    pass_line "[S2] host adapter entry: $dir/$rel_host"
  else
    fail_line "[S2] host adapter entry missing: $dir/$rel_host (skin: $skin)"
  fi

  mapfile -t files < <(skin_source_files "$skins_dir")
  if [ "${#files[@]}" -eq 0 ]; then
    fail_line "[S3] no .scss/.css under $dir — nothing carries a token prefix at all (skin: $skin)"
  else
    local s_prefix s_materio s_other
    { read -r s_prefix; read -r s_materio; read -r s_other; } \
      < <(count_needles "$prefix" 'var(--materio' "$other_prefix" "${files[@]}")
    if [ -n "$prefix" ]; then
      if [ "$s_prefix" -gt 0 ]; then
        pass_line "[S3] the skin's source carries $prefix ($s_prefix occurrence(s))"
      else
        fail_line "[S3] $dir carries no $prefix — the skin is not the one it is named for, or its tokens were renamed back"
      fi
    else
      skip_line "[S3] skin '$skin' declares no token prefix of its own (it keeps Element Plus' names)"
    fi
    if [ "$s_materio" -eq 0 ]; then
      pass_line "[S4] no var(--materio in the skin's source"
    else
      fail_line "[S4] $dir still uses var(--materio ($s_materio occurrence(s)) — that is the pre-rename prefix"
    fi
    if [ -n "$other_prefix" ]; then
      if [ "$s_other" -eq 0 ]; then
        pass_line "[S5] the skin's source carries none of $other_prefix"
      else
        fail_line "[S5] $dir carries $other_prefix ($s_other occurrence(s)) — that belongs to the other skin"
      fi
    else
      skip_line "[S5] the other skin declares no token prefix — nothing to look for"
    fi
  fi

  # The artefact half. Absent means nothing has been injected yet, which is not a failure: the build
  # that follows is what writes these two files.
  # 产物那一半。文件不在 = 尚未注入，不算失败：随后那次构建正是写这两个文件的地方。
  theme_css="$dist/keelbase-theme.css"
  host_css="$dist/keelbase-host.css"
  if [ -f "$theme_css" ]; then
    local t_prefix t_materio t_other h_materio=0 h_other=0
    { read -r t_prefix; read -r t_materio; read -r t_other; } \
      < <(count_needles "$prefix" 'var(--materio' "$other_prefix" "$theme_css")
    if [ -f "$host_css" ]; then
      local h_prefix
      { read -r h_prefix; read -r h_materio; read -r h_other; } \
        < <(count_needles "$prefix" 'var(--materio' "$other_prefix" "$host_css")
    fi
    if [ -n "$prefix" ]; then
      if [ "$t_prefix" -gt 0 ]; then
        pass_line "[A1] $theme_css carries $prefix ($t_prefix occurrence(s))"
      else
        fail_line "[A1] $theme_css carries no $prefix — this artefact was not built with the '$skin' skin"
      fi
    else
      skip_line "[A1] skin '$skin' declares no token prefix — nothing to look for in the artefact"
    fi
    if [ "$t_materio" -eq 0 ]; then
      pass_line "[A2] no var(--materio in $theme_css"
    else
      fail_line "[A2] $theme_css still uses var(--materio ($t_materio occurrence(s)) — this artefact predates the rename"
    fi
    if [ -f "$host_css" ]; then
      if [ "$h_materio" -eq 0 ]; then
        pass_line "[A3] no var(--materio in $host_css"
      else
        fail_line "[A3] $host_css still uses var(--materio ($h_materio occurrence(s)) — this artefact predates the rename"
      fi
    else
      skip_line "[A3] no $host_css — nothing injected for the host adapter"
    fi
    if [ -n "$other_prefix" ]; then
      n=$((t_other + h_other))
      if [ "$n" -eq 0 ]; then
        pass_line "[A4] no injected artefact carries $other_prefix"
      else
        fail_line "[A4] an injected artefact carries $other_prefix ($n occurrence(s)) — it belongs to the other skin"
      fi
    else
      skip_line "[A4] the other skin declares no token prefix — nothing to look for"
    fi
  else
    skip_line "[A1..A4] no artefact at $theme_css — nothing injected yet"
  fi

  if [ "$FAILS" -eq 0 ]; then
    printf 'SKIN CHECK PASS (skin: %s)\n' "$skin"
    return 0
  fi
  printf 'SKIN CHECK FAIL (skin: %s, %d assertion(s) failed)\n' "$skin" "$FAILS" >&2
  return 1
}

# ── self-test ────────────────────────────────────────────────────────────────────
# A fixture tree holding only the files the assertions read, copied per case and broken in exactly one
# place. Each case states the exit code it expects and the assertion id its output must name — so a
# control passes only when the *right* assertion reddened, not merely when something did.
# 一份只放断言要读的那些文件的夹具树，每个用例复制一份、**只改坏一处**。每个用例写明期望的退出码与输出
# 里必须点到的断言 id —— 于是对照只有在**该红的那条**红了才算通过，而不是「只要有东西红了」。
self_test() {
  local tmp base total=0 bad=0
  local rc

  tmp="$(mktemp -d 2>/dev/null)" || { echo 'self-test: cannot create a temporary directory' >&2; return 2; }
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  base="$tmp/base"
  mkdir -p "$base/scripts" \
           "$base/keelbase-ui/skins/harbor" \
           "$base/keelbase-ui/theme" \
           "$base/dist" || { echo 'self-test: cannot build the fixture' >&2; return 2; }

  printf '%s\n' '#!/usr/bin/env bash' 'SKIN="${KEELBASE_UI_SKIN:-harbor}"' > "$base/scripts/build-host-ui.sh"
  printf '%s\n' ':root{--harbor-primary:#1d4ed8;}' > "$base/keelbase-ui/skins/harbor/harbor.scss"
  printf '%s\n' '.host{color:var(--harbor-text);}' > "$base/keelbase-ui/skins/harbor/host-yudao-harbor.scss"
  printf '%s\n' ':root{--el-color-primary:#1d4ed8;}' > "$base/keelbase-ui/theme/element-theme.scss"
  printf '%s\n' '.host{color:var(--el-text-color);}' > "$base/keelbase-ui/theme/host-yudao.scss"
  printf '%s\n' ':root{--harbor-primary:#1d4ed8;}' > "$base/dist/keelbase-theme.css"
  printf '%s\n' '.host{color:var(--harbor-text);}' > "$base/dist/keelbase-host.css"

  # `label | expected exit | assertion id the output must name | mutation script`
  # The mutation runs inside the case's copy with `$c` naming it.
  # `标签 | 期望退出码 | 输出里必须点到的断言 id | 改坏脚本`
  # 改坏脚本在用例副本里执行，`$c` 指那份副本。
  local -a labels=( \
    'a clean harbor tree stays green' \
    'the skin directory is gone' \
    'the theme entry is gone' \
    'the host adapter entry is gone' \
    'the source carries the pre-rename prefix' \
    'the source uses var(--materio' \
    'the build script defaults to the other skin' \
    'the artefact carries the pre-rename prefix' \
    'the artefact carries none of the skin prefix' \
    'the host artefact carries the pre-rename prefix' \
    'a product source carries the harbor prefix' \
    'a product artefact carries the harbor prefix' \
    'an unknown skin is refused' \
    'a clean product tree stays green' )
  local -a want_rc=( 0 1 1 1 1 1 1 1 1 1 1 1 2 0 )
  local -a want_id=( 'SKIN CHECK PASS' '[S0]' '[S1]' '[S2]' '[S3]' '[S4]' '[D1]' '[A2]' '[A1]' '[A3]' '[S5]' '[A4]' 'unknown KEELBASE_UI_SKIN' 'SKIN CHECK PASS' )
  local -a skins=( harbor harbor harbor harbor harbor harbor harbor harbor harbor harbor product product nope product )
  local -a mutate=( \
    ':' \
    'rm -rf "$c/keelbase-ui/skins/harbor"' \
    'rm -f "$c/keelbase-ui/skins/harbor/harbor.scss"' \
    'rm -f "$c/keelbase-ui/skins/harbor/host-yudao-harbor.scss"' \
    'printf "%s\n" ":root{--materio-primary:#1d4ed8;}" > "$c/keelbase-ui/skins/harbor/harbor.scss"; printf "%s\n" ".host{color:#000;}" > "$c/keelbase-ui/skins/harbor/host-yudao-harbor.scss"' \
    'printf "%s\n" ".x{color:var(--materio-text);}" >> "$c/keelbase-ui/skins/harbor/harbor.scss"' \
    'printf "%s\n" "#!/usr/bin/env bash" "SKIN=\"\${KEELBASE_UI_SKIN:-product}\"" > "$c/scripts/build-host-ui.sh"' \
    'printf "%s\n" ":root{--materio-primary:#1d4ed8;}" > "$c/dist/keelbase-theme.css"' \
    'printf "%s\n" ":root{--brand-primary:#1d4ed8;}" > "$c/dist/keelbase-theme.css"' \
    'printf "%s\n" ".h{color:var(--materio-text);}" > "$c/dist/keelbase-host.css"' \
    'printf "%s\n" ".x{color:var(--harbor-text);}" >> "$c/keelbase-ui/theme/element-theme.scss"' \
    'printf "%s\n" ":root{--harbor-primary:#1d4ed8;}" > "$c/dist/keelbase-theme.css"; printf "%s\n" ".h{color:var(--harbor-text);}" > "$c/dist/keelbase-host.css"' \
    ':' \
    'printf "%s\n" ":root{--el-color-primary:#1d4ed8;}" > "$c/dist/keelbase-theme.css"; printf "%s\n" ".h{color:var(--el-text-color);}" > "$c/dist/keelbase-host.css"' )

  local i label out
  for i in "${!labels[@]}"; do
    label="${labels[$i]}"
    local c="$tmp/case-$i"
    cp -R "$base" "$c" || { echo 'self-test: cannot copy the fixture' >&2; return 2; }
    # shellcheck disable=SC2086
    ( c="$c"; eval "${mutate[$i]}" ) || { echo "self-test: mutation for '$label' failed" >&2; return 2; }

    out="$(run_check "$c" "${skins[$i]}" "$c/dist" 2>&1)"
    rc=$?
    total=$((total + 1))
    if [ "$rc" != "${want_rc[$i]}" ]; then
      bad=$((bad + 1))
      printf '[self-test] FAIL  %s — expected exit %s, got %s\n%s\n' "$label" "${want_rc[$i]}" "$rc" "$out" >&2
      continue
    fi
    if ! printf '%s' "$out" | grep -q -F -- "${want_id[$i]}"; then
      bad=$((bad + 1))
      printf '[self-test] FAIL  %s — exited %s as expected, but the output never named %s\n%s\n' \
        "$label" "$rc" "${want_id[$i]}" "$out" >&2
      continue
    fi
    printf '[self-test] ok    %s (exit %s, named %s)\n' "$label" "$rc" "${want_id[$i]}"
  done

  if [ "$bad" -ne 0 ]; then
    printf 'SELF-TEST FAIL (%d of %d control(s) did not behave as expected)\n' "$bad" "$total" >&2
    return 3
  fi
  printf 'SELF-TEST PASS (%d/%d controls behaved as expected)\n' "$total" "$total"
  return 0
}

# ── entry point ─────────────────────────────────────────────────────────────────

SELF_TEST=0
for arg in "$@"; do
  case "$arg" in
    --self-test) SELF_TEST=1 ;;
    -h|--help)
      sed -n '3,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (usage: bash scripts/check-ui-skin.sh [--self-test])" >&2
      exit 64
      ;;
  esac
done

if [ "$SELF_TEST" = "1" ]; then
  self_test
  exit $?
fi

SKIN="${KEELBASE_UI_SKIN:-$DEFAULT_SKIN}"
UI_DIR="${KEELBASE_YUDAO_UI:-$REPO_ROOT/target/yudao-ui-admin-vue3}"
OUT_NAME="${KEELBASE_YUDAO_UI_OUT:-dist-prod}"

echo "checking the '$SKIN' skin ($REPO_ROOT; artefact: $UI_DIR/$OUT_NAME)"
run_check "$REPO_ROOT" "$SKIN" "$UI_DIR/$OUT_NAME"
exit $?
