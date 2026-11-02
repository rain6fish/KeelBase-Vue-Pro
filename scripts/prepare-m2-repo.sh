#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# 备一份**能离线构建本仓**的 Maven 本地库：整份复制一份基线库，再核对本仓 pom 钉住的
# `keelbase4j-*` 版本在不在里面；缺了就说缺哪几件、下一条命令是什么。
#
#   bash scripts/prepare-m2-repo.sh <source-m2> <target-m2>            # 只复制 + 核对
#   bash scripts/prepare-m2-repo.sh <source-m2> <target-m2> --fetch    # 缺什么就联网解析什么
#   bash scripts/prepare-m2-repo.sh <source-m2> <target-m2> --fetch --force
#
# 退出码：0 = 目标库里钉住的版本齐全；2 = 缺版本且没给 `--fetch`（并打印下一步命令）；
#         1 = 复制或联网解析失败、或解析后仍缺；64 = 用法错误。
#
# 为什么是「复制 + 核对」而不是「让 Maven 自己下」。完全离线时 0.1.16 解析不到（基线库只有 0.1.14），
# 冷跑就必须联网。这个脚本把那一层变成**预备动作**：基线库照原样复制（源库一个字不改），缺的版本按
# 根 pom 自己声明的镜像补齐，然后把「到底补了哪几件」当作断言核一遍——而不是事后说一句「应该够了」。
#
# 版本不写死。要哪几件、哪一版，一律从仓内 `pom.xml` 读——所有 `cn.com.keelbase` 依赖，外加它们
# 各自声明的父 POM（父 POM 也要在库里，否则离线解析会以「Non-resolvable parent POM」失败）。
# 抬 pin 之后重跑本脚本即可，不需要改它。
#
# Prepare a Maven repository this repository can build from **offline**: copy a baseline repository,
# then check that the `keelbase4j-*` versions the poms pin are actually in it; say which ones are
# missing and what to run next.
#
#   bash scripts/prepare-m2-repo.sh <source-m2> <target-m2>            # copy + check only
#   bash scripts/prepare-m2-repo.sh <source-m2> <target-m2> --fetch    # resolve whatever is missing
#
# Exit codes: 0 = every pinned coordinate is present; 2 = missing and `--fetch` was not given (the
# next command is printed); 1 = copy/fetch failed, or something is still missing; 64 = bad usage.
#
# Why copy-and-check rather than "let Maven download". Offline, 0.1.16 cannot be resolved (the
# baseline has only 0.1.14), so a cold run needs the network. This script turns that layer into a
# preparation step: the baseline is copied as-is (the source is never written), the missing versions
# are resolved through the mirrors the root pom itself declares, and what was added is then asserted
# rather than assumed.
#
# No version is written into this script. Which coordinates and which version are read from the
# repository's `pom.xml` files — every `cn.com.keelbase` dependency, plus the parent POM each one
# declares (the parent must be in the repository too, or offline resolution fails with
# "Non-resolvable parent POM"). After a version bump, re-run this script; it does not change.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MVN="${MVN:-mvn}"
DEP_PLUGIN='org.apache.maven.plugins:maven-dependency-plugin:3.8.1:get'
GROUP_PATH='cn/com/keelbase'

usage() {
  cat <<'EOF'
用法 / usage:
  bash scripts/prepare-m2-repo.sh <source-m2> <target-m2> [--fetch] [--force]

  <source-m2>   基线本地库，只读；不会被修改 / baseline local repository, read-only
  <target-m2>   目标本地库；已存在时要加 --force / target; pass --force if it exists
  --fetch       缺钉住的版本时联网解析进目标库 / resolve missing pinned versions online
  --force       目标已存在时仍然往里复制（不删除已有内容）/ copy into an existing target (nothing is deleted)

退出码 / exit codes: 0 齐全 · 2 缺版本且没给 --fetch · 1 失败 · 64 用法错误
EOF
}

die() { # code message
  printf '✗ %s\n' "$2" >&2
  exit "$1"
}

src=''
dst=''
fetch=0
force=0
for arg in "$@"; do
  case "$arg" in
    --fetch) fetch=1 ;;
    --force) force=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die 64 "未知参数 / unknown option: $arg" ;;
    *) if [ -z "$src" ]; then src=$arg
       elif [ -z "$dst" ]; then dst=$arg
       else die 64 "多余参数 / too many arguments: $arg"; fi ;;
  esac
done
[ -n "$src" ] && [ -n "$dst" ] || { usage >&2; exit 64; }

[ -d "$src" ] || die 1 "源库不存在或不是目录 / source is not a directory: $src"

src_real="$(cd "$src" && pwd -P)"
dst_real="$(cd "$dst" 2>/dev/null && pwd -P || true)"

if [ -z "$dst_real" ]; then
  mkdir -p "$dst" || die 1 "建不出目标目录 / cannot create target: $dst"
  dst_real="$(cd "$dst" && pwd -P)"
fi

[ "$src_real" = "$dst_real" ] && die 64 "源与目标相同 / source and target are the same"
case "$dst_real/" in
  "$src_real"/*) die 64 "目标在源之内（复制会自我递归）/ target is inside source: $dst_real" ;;
esac

if [ -e "$dst" ] && [ -n "$(ls -A "$dst" 2>/dev/null || true)" ] && [ "$force" -ne 1 ]; then
  die 1 "目标已存在且非空，加 --force 才覆盖 / target exists and is not empty; pass --force: $dst"
fi

# Maven 在 Git Bash 下更认 `D:/…` 这种形式；有 cygpath 就转成它。
# Maven prefers `D:/…` under Git Bash; convert when cygpath is available.
if command -v cygpath >/dev/null 2>&1; then
  repo_arg="$(cygpath -m "$dst_real")"
else
  repo_arg="$dst_real"
fi

echo "== 1) 复制基线库 / copy the baseline: $src_real -> $dst_real"
cp -a "$src_real"/. "$dst_real"/ || die 1 "复制失败 / copy failed"

# 从 pom 里读钉住的坐标：所有 cn.com.keelbase 依赖写成 `artifact version`。
# 一次 awk 吃完所有 pom —— 本机起一个进程约 2 秒，逐文件起会把几十份 pom 变成一分半钟。
# Read the pinned coordinates from the poms: every cn.com.keelbase dependency as `artifact version`.
# One awk over all of them — a process here costs ~2 s, and one per file turns dozens of poms into
# ninety seconds.
pinned_from_poms() {
  local poms=() pom
  while IFS= read -r -d '' pom; do poms+=("$pom"); done \
    < <(find "$ROOT" -name pom.xml -not -path '*/target/*' -print0)
  [ "${#poms[@]}" -gt 0 ] || return 0
  awk '
    FNR == 1 { in_dep = 0; grp = ""; art = ""; ver = "" }
    /<dependency>/ { in_dep = 1; grp = ""; art = ""; ver = ""; next }
    in_dep && /<\/dependency>/ { if (grp == "cn.com.keelbase" && art ~ /^keelbase4j/ && ver != "") print art, ver; in_dep = 0; next }
    in_dep && /<groupId>/    { if (grp == "") { s = $0; sub(/.*<groupId>[[:space:]]*/, "", s);    sub(/[[:space:]]*<\/groupId>.*/, "", s);    grp = s } }
    in_dep && /<artifactId>/ { if (art == "") { s = $0; sub(/.*<artifactId>[[:space:]]*/, "", s); sub(/[[:space:]]*<\/artifactId>.*/, "", s); art = s } }
    in_dep && /<version>/    { if (ver == "") { s = $0; sub(/.*<version>[[:space:]]*/, "", s);    sub(/[[:space:]]*<\/version>.*/, "", s);    ver = s } }
  ' "${poms[@]}" | sort -u
}

# 子 POM 的父 POM 也得在库里。父 POM 的名字从**子产物**的 pom 里读（不是聚合 pom ——
# `keelbase4j-0.1.14.pom` 也匹配 `keelbase4j-*`，而它的父是 spring-boot-starter-parent）。
# The children's parent POM has to be present too. Its name is read from a **child** artifact's pom —
# not the aggregator, whose own parent is spring-boot-starter-parent (and which also matches
# `keelbase4j-*`). Falls back to the family name only when no child pom is found.
parent_artifact_of() { # artifact
  local artifact=$1 dir pom=''
  for dir in "$dst_real/$GROUP_PATH/$artifact" "$src_real/$GROUP_PATH/$artifact"; do
    for pom in "$dir"/*/"$artifact"-*.pom; do
      # 不用 `[ -f ] && break`：set -e 下未匹配的 glob 会让 `&&` 整体返回 1，脚本直接退出。
      # Not `[ -f ] && break`: under set -e an unmatched glob makes the `&&` list return 1 and
      # errexit ends the script instead of falling back.
      if [ -f "$pom" ]; then break 2; fi
    done
    pom=''
  done
  if [ -n "$pom" ]; then
    awk '/<parent>/ { p = 1; next }
         p && /<\/parent>/ { exit }
         p && /<artifactId>/ { s = $0; sub(/.*<artifactId>[[:space:]]*/, "", s); sub(/[[:space:]]*<\/artifactId>.*/, "", s); print s; exit }' "$pom"
  else
    echo keelbase4j
  fi
}

echo "== 2) 读钉住的坐标 / read pinned coordinates from pom.xml"
coords=''
pinned="$(pinned_from_poms)"
[ -n "$pinned" ] || die 1 "pom 里找不到 cn.com.keelbase 依赖 / no cn.com.keelbase dependency found in any pom"
declare -A parent_of=()
while read -r artifact version; do
  [ -n "$artifact" ] || continue
  case "$version" in
    *'${'*) die 1 "版本是未展开的属性 / unexpanded property version: $artifact $version" ;;
  esac
  if [ -z "${parent_of[$artifact]:-}" ]; then
    parent_of[$artifact]="$(parent_artifact_of "$artifact")"
  fi
  coords="${coords}${artifact} ${version} jar"$'\n'
  coords="${coords}${parent_of[$artifact]} ${version} pom"$'\n'
done <<< "$pinned"
coords="$(printf '%s' "$coords" | sort -u | sed '/^$/d')"

printf '%s\n' "$coords" | while read -r a v p; do
  printf '   %-24s %-10s %s\n' "$a" "$v" "$p"
done

present() { # artifact version packaging
  local a=$1 v=$2 pkg=$3 dir="$dst_real/$GROUP_PATH/$1/$2"
  [ -f "$dir/$a-$v.pom" ] || return 1
  [ "$pkg" = pom ] && return 0
  compgen -G "$dir/$a-$v*.jar" >/dev/null
}

missing=''
while read -r a v p; do
  [ -n "$a" ] || continue
  present "$a" "$v" "$p" || missing="${missing}${a} ${v} ${p}"$'\n'
done <<< "$coords"

if [ -z "$missing" ]; then
  echo "== 3) 核对 / check: 钉住的版本齐全 / every pinned coordinate is present"
  exit 0
fi

missing_list="$(printf '%s' "$missing" | sed '/^$/d')"

if [ "$fetch" -ne 1 ]; then
  echo "== 3) 核对 / check: 目标库缺这些 / missing from the target repository:" >&2
  printf '%s\n' "$missing_list" | while read -r a v p; do printf '   %-24s %s\n' "$a" "$v" >&2; done
  echo "下一步 / next:" >&2
  echo "  bash scripts/prepare-m2-repo.sh '$src' '$dst' --fetch --force" >&2
  exit 2
fi

echo "== 3) 联网解析缺的版本 / resolve the missing coordinates (root pom's mirrors)"
while read -r a v p; do
  [ -n "$a" ] || continue
  spec="cn.com.keelbase:$a:$v"
  [ "$p" = pom ] && spec="$spec:pom"
  echo "   $spec"
  # 不用管道：退出码必须是真的 / no pipe: the exit status has to be the real one.
  "$MVN" -B -ntp -f "$ROOT/pom.xml" "-Dmaven.repo.local=$repo_arg" "$DEP_PLUGIN" "-Dartifact=$spec" \
    || die 1 "解析失败 / resolution failed: $spec"
done <<< "$missing_list"

echo "== 4) 复核 / re-check"
still=''
while read -r a v p; do
  [ -n "$a" ] || continue
  present "$a" "$v" "$p" || still="${still}${a} ${v} ${p}"$'\n'
done <<< "$coords"

if [ -n "$still" ]; then
  echo "✗ 解析之后仍缺 / still missing after resolution:" >&2
  printf '%s' "$still" | sed '/^$/d' >&2
  exit 1
fi

echo "✓ 目标库就绪 / target repository is ready: $dst_real"
exit 0
