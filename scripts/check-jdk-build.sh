#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# 断言 PATH 上的 JDK 构建号不低于给定下限，低于则退出 1。
#
# 断言读的是厂商构建号，不是版本串。JSSE 两个 CVE 的修复构建是 Temurin 25.0.5+8，而 Oracle 的风险矩阵
# 用同样的写法（「25.0.5」）把它列在受影响版本里 —— 只 grep 版本号会对已修的构建答「受影响」。`+` 之后的
# 构建号才分得开两者，所以这里从 `Temurin-<版本>+<构建号>` 那一行取它。
#
# 是「不低于」，不是「等于」：同一大版本更新的构建同样是已修的，一道在更新的已修构建出现当天变红的闸，
# 是一道红得说不出自己名字的闸，最后会被改数字消掉。通过的构建号总会打印出来，日志因此记着跑的是哪一个。
#
# 用法：
#
#   bash scripts/check-jdk-build.sh 25.0.5+8
#
# 冒烟测试可以指向一份 `java -version` 输出文件，而不是真的去探测 PATH：
#
#   JDK_VERSION_OUTPUT_FILE=/tmp/fake-version.txt bash scripts/check-jdk-build.sh 25.0.5+8
#
# Assert the JDK on PATH is at or above a vendor build number; exit 1 when it is below.
#
# The assertion reads the vendor build number, not the version string. The JSSE CVE fixes land in
# Temurin 25.0.5+8, while Oracle's risk matrix lists "25.0.5" among the affected versions in the same
# notation — grepping the version alone answers "affected" for a fixed build. The number after `+`
# is what separates them, so that is what is read, off the `Temurin-<version>+<build>` line.
# Adoptium also reports the release-name form `Temurin-25.0.5+8.0.LTS`; the build is the numeric run
# right after `+`, and the optional `.LTS` suffix is not part of the comparison.
#
# "At or above", not "equal": a newer build of the same major is fixed too, and a gate that turns
# red the day a newer fixed build ships is a red that cannot name itself — the kind that gets
# silenced by editing the number down. The build that passed is printed either way.
#
# Usage:
#
#   bash scripts/check-jdk-build.sh 25.0.5+8
#
# For a smoke test, point it at a file of `java -version` output instead of probing PATH:
#
#   JDK_VERSION_OUTPUT_FILE=/tmp/fake-version.txt bash scripts/check-jdk-build.sh 25.0.5+8
set -euo pipefail

usage() {
  echo "usage: bash scripts/check-jdk-build.sh <major>.<minor>.<patch>[.<update>]+<build>  e.g. 25.0.5+8" >&2
  echo "用法：bash scripts/check-jdk-build.sh <主>.<次>.<修订>[.<更新>]+<构建号>，如 25.0.5+8" >&2
  exit 2
}

require="${1:-}${2:+${2}}"
[[ $require == *+* ]] || usage

# Split `MAJOR.MINOR.PATCH[.UPDATE]+BUILD` into five numbers; a missing UPDATE means 0. Leading
# zeros are normalized by awk so bash arithmetic never reads them as octal.
split_spec() {
  sed -nE \
    -e 's/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)\+([0-9]+)$/\1 \2 \3 \4 \5/p' \
    -e 's/^([0-9]+)\.([0-9]+)\.([0-9]+)\+([0-9]+)$/\1 \2 \3 0 \4/p' <<<"$1" |
    awk 'NF == 5 { printf "%d %d %d %d %d\n", $1, $2, $3, $4, $5 }'
}

req_fields=$(split_spec "$require")
[[ -n $req_fields ]] || usage

if [[ -n ${JDK_VERSION_OUTPUT_FILE:-} ]]; then
  java_version=$(cat "$JDK_VERSION_OUTPUT_FILE")
else
  java_version=$(java -version 2>&1 || true)
fi
printf '%s\n' "$java_version"

# The vendor prefix is part of the match on purpose: another vendor reports its own numbering, and
# comparing it against a Temurin fix line would compare two different schemes.
build_line=$(grep -E 'Temurin-[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?\+[0-9]+' <<<"$java_version" | head -n1 || true)
if [[ -z $build_line ]]; then
  echo "check-jdk-build: 没有找到 'Temurin-<版本>+<构建号>' 行；本闸读的正是构建号，报不出它的 JDK 过不了。" >&2
  echo "check-jdk-build: no 'Temurin-<version>+<build>' line in \`java -version\`; that build number is what this gate reads." >&2
  exit 1
fi

running=$(sed -nE 's/.*(Temurin-[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?\+[0-9]+).*/\1/p' <<<"$build_line" | head -n1)
cur_fields=$(split_spec "${running#Temurin-}")
if [[ -z $cur_fields ]]; then
  echo "check-jdk-build: 无法从 '$running' 拆出版本号与构建号。" >&2
  echo "check-jdk-build: could not split '$running' into a version and a build number." >&2
  exit 1
fi

read -r req_major req_minor req_patch req_update req_build <<<"$req_fields"
read -r cur_major cur_minor cur_patch cur_update cur_build <<<"$cur_fields"

state=equal
for i in 1 2 3 4 5; do
  case $i in
    1) cur=$cur_major; req=$req_major ;;
    2) cur=$cur_minor; req=$req_minor ;;
    3) cur=$cur_patch; req=$req_patch ;;
    4) cur=$cur_update; req=$req_update ;;
    5) cur=$cur_build; req=$req_build ;;
  esac
  if ((cur > req)); then
    state=above
    break
  elif ((cur < req)); then
    state=below
    break
  fi
done

if [[ $state == below ]]; then
  echo "check-jdk-build: $running 低于修复线 $require（JSSE 两个 CVE 的修复构建）。" >&2
  echo "check-jdk-build: $running is BELOW the $require fix line (the JSSE CVE fixes)." >&2
  exit 1
fi

echo "check-jdk-build: $running 不低于修复线 $require。"
echo "check-jdk-build: $running is at or above the $require fix line."
