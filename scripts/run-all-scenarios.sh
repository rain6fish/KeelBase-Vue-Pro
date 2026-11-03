#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# 一键跑完本仓全部真栈场景门，逐条打印开始 / 结果 / 真实退出码，末尾汇总。
#
#   HOST_URL=http://127.0.0.1:18093 PG_CONTAINER=sg-pg PG_DB=sg_1102 \
#     bash scripts/run-all-scenarios.sh
#
#   bash scripts/run-all-scenarios.sh --list     # 只列出会跑哪些门，一条都不跑
#
#   bash scripts/run-all-scenarios.sh --repeat 2 # 连跑两轮，逐字节比对每道门的读数
#
# 它做什么，以及三条刻意的选择：
#
#   * **发现**：`scripts/run-*-scenarios.mjs`（复数）与 `scripts/run-*-scenario.mjs`（单数）。第二个 glob 只
#     为 `run-revoke-scenario.mjs` 那一个文件——它头部写着 `bash scripts/run-server.sh &` + `node
#     scripts/run-revoke-scenario.mjs`，是一道真栈门，只是命名早于「scenarios」这个后缀。不改名（那是别人的
#     文件），故把 glob 放宽一格。**没有别的排除**：本仓这些 `run-*` 脚本全都要活宿主，没有单元级混在里面
#     （`run-app-conformance`、`run-host-generator` 名字里没有 `scenario`，本来就不在射程）。
#   * **顺序**：下面 `ORDER` 里写死。新的门不必改这个脚本也会被跑到——它按字母序接在 `ORDER` 之后。写死的
#     部分只是「先便宜的、先基础面、把要真模型的挪到最后」，好让一次跑完的日志读起来是有层次的。
#   * **失败不停**。第一条红了继续跑完其余门，一次看全；退出码逐条记下来，**不经过管道**（管道会把 `node`
#     的退出码换成 `tee` 的）。
#
# **`--repeat N`**（默认 `N=1`）把全部门连跑 N 轮。每轮各自保留日志、退出码与 `READING` 行（`round-<n>/`）；全部轮次
# 结束后逐门比对**通过 / 失败 / 跳过**，并把各门 `READING` 行按固定顺序拼成的 `readings.txt` **逐字节比对**（`cmp`，
# 不拿含时间戳的整份日志去比）。任一轮有门失败、或两轮读数不一致 ⇒ exit 1，并指出是哪道门、差在第几行。
# 它**不重置**栈：门若留下残留，第二轮会照实不一样——那正是要比出来的东西。
#
# 退出码：任一条门非 0 ⇒ 本脚本 exit 1；全部通过（含被跳过的）且各轮读数一致 ⇒ exit 0；参数不合法 ⇒ exit 2。
#
# ---
#
# One command for every real-stack scenario gate in this repository: each gate's start, its result and
# its **real** exit code, then a summary.
#
#   HOST_URL=http://127.0.0.1:18093 PG_CONTAINER=sg-pg PG_DB=sg_1102 \
#     bash scripts/run-all-scenarios.sh
#
#   bash scripts/run-all-scenarios.sh --list     # list the gates this run would execute; run none
#
#   bash scripts/run-all-scenarios.sh --repeat 2 # two rounds, compared byte for byte
#
# Three deliberate choices:
#
#   * **Discovery** covers `scripts/run-*-scenarios.mjs` (plural) and `scripts/run-*-scenario.mjs`
#     (singular). The second glob exists for exactly one file, `run-revoke-scenario.mjs`: its header
#     says `bash scripts/run-server.sh &` and `node scripts/run-revoke-scenario.mjs`, so it is a real-stack
#     gate whose name predates the `scenarios` suffix. It is not renamed here — it is someone else's file —
#     so the pattern is widened by one. **Nothing else is excluded**: every `run-*` script in this
#     repository needs a live host; none is unit-level (`run-app-conformance` and `run-host-generator`
#     carry no `scenario` in their names and were never in range).
#   * **Order** is the `ORDER` list below. A gate added later still gets run without editing this script —
#     it is appended after `ORDER` in alphabetical order. What the list fixes is only "cheap first,
#     foundational faces first, anything needing a real model last", so a full run's log reads in layers.
#   * **A failure does not stop the run.** The first red gate does not abort the rest, so one pass shows
#     everything; each exit code is recorded **without a pipe** (a pipe would replace `node`'s status with
#     `tee`'s).
#
# **`--repeat N`** (default `N=1`) runs every gate N times. Each round keeps its own logs, exit codes and
# `READING` lines (`round-<n>/`). Afterwards the script compares each gate's pass / fail / skip status and
# compares each round's `readings.txt` — every gate's `READING` lines, concatenated in gate order —
# **byte for byte** (`cmp`, never the timestamped full logs). A gate failing in any round, or any readings
# mismatch ⇒ exit 1, naming the gate and the line that differs. It does **not** reset the stack: a gate
# leaving residue will make round 2 differ, truthfully — that is what the comparison is for.
#
# Exit status: any gate non-zero ⇒ this script exits 1; all passing (skips included) with every round
# agreeing ⇒ 0; a bad argument ⇒ 2.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT" || exit 1

LIST_ONLY=0
REPEAT=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --list) LIST_ONLY=1 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --repeat)
      [ "$#" -ge 2 ] || { echo "--repeat 需要跟一个正整数" >&2; exit 2; }
      shift
      REPEAT="$1"
      ;;
    --repeat=*) REPEAT="${1#--repeat=}" ;;
    *) echo "unknown argument: $1（只认 --list / --repeat N / --help）" >&2; exit 2 ;;
  esac
  shift
done

case "$REPEAT" in
  ''|*[!0-9]*) echo "--repeat 要的是正整数，收到：$REPEAT" >&2; exit 2 ;;
esac
if [ "$REPEAT" -lt 1 ]; then
  echo "--repeat 要的是正整数，收到：$REPEAT" >&2
  exit 2
fi

# Gates whose prerequisite is not something this script can arrange. A gate named here is **skipped with
# its reason printed**, never silently dropped and never counted as a pass.
# 前置不由本脚本安排的门：被拒绝参加本轮、理由照打，既不算通过、也不算失败。
skip_reason() {
  case "$1" in
    run-model-loop-scenarios.mjs)
      if [ "${SCENARIOS_MODEL_HOST:-0}" != "1" ]; then
        printf '%s' "需要按「模型回路已打开」起的宿主（run-server.sh 只在给了 KEELBASE_MODEL_API_KEY 时才开）；确认宿主是那样起的，就带 SCENARIOS_MODEL_HOST=1 重跑"
      fi
      ;;
  esac
}

# Fixed order. Names are basenames of files under scripts/.
# 固定顺序；名字是 scripts/ 下的文件名。
ORDER=(
  run-console-navigation-scenarios.mjs
  run-system-notice-scenarios.mjs
  run-notify-message-scenarios.mjs
  run-infra-file-scenarios.mjs
  run-demo01-contact-scenarios.mjs
  run-crm-customer-scenarios.mjs
  run-crm-clue-scenarios.mjs
  run-crm-business-scenarios.mjs
  run-crm-contact-scenarios.mjs
  run-crm-contract-scenarios.mjs
  run-crm-receivable-scenarios.mjs
  run-crm-receivable-plan-scenarios.mjs
  run-crm-product-scenarios.mjs
  run-flagship-crm-scenarios.mjs
  run-bypass-audit-scenarios.mjs
  run-bpm-oa-leave-scenarios.mjs
  run-bpm-task-scenarios.mjs
  run-bpm-process-instance-scenarios.mjs
  run-bpm-process-copy-scenarios.mjs
  run-fms-voucher-scenarios.mjs
  run-fms-read-seams-scenarios.mjs
  run-generated-module-scenarios.mjs
  run-tenant-scenarios.mjs
  run-revoke-scenario.mjs
  run-ai1-crm-scenarios.mjs
  run-assistant-drawer-scenarios.mjs
  run-mcp-governance-scenarios.mjs
  run-model-loop-scenarios.mjs
)

# Discover, then order: everything on the list that exists, then anything new, alphabetically.
# 发现后排序：表上有的按表序，表上没有的（新加的门）按字母序接在后面。
discover() {
  local found=() name listed
  for f in "$HERE"/run-*-scenarios.mjs "$HERE"/run-*-scenario.mjs; do
    [ -f "$f" ] || continue
    found+=("$(basename "$f")")
  done
  for name in "${ORDER[@]}"; do
    [ -f "$HERE/$name" ] && printf '%s\n' "$name"
  done
  for name in $(printf '%s\n' "${found[@]}" | sort); do
    listed=0
    for known in "${ORDER[@]}"; do [ "$known" = "$name" ] && listed=1 && break; done
    [ "$listed" = 1 ] || printf '%s\n' "$name"
  done
}

mapfile -t GATES < <(discover)

if [ "${#GATES[@]}" -eq 0 ]; then
  echo "在 $HERE 下没有发现场景门——pattern 或目录不对" >&2
  exit 2
fi

if [ "$LIST_ONLY" = 1 ]; then
  echo "会跑 ${#GATES[@]} 道门（HOST_URL=${HOST_URL:-<未设，各门自己的默认值>}）："
  i=0
  for name in "${GATES[@]}"; do
    i=$((i + 1))
    reason="$(skip_reason "$name")"
    if [ -n "$reason" ]; then
      printf '  %2d. %-46s SKIP  %s\n' "$i" "$name" "$reason"
    else
      printf '  %2d. %s\n' "$i" "$name"
    fi
  done
  exit 0
fi

LOG_DIR="${SCENARIO_LOG_DIR:-$(mktemp -d -t scenario-all-XXXXXX)}"
mkdir -p "$LOG_DIR" || exit 1

# Per-round bookkeeping, by "<round>|<gate>".
declare -A STATUS_OF=()
declare -A RC_OF=()
ROUND_DIRS=()
ANY_FAILURE=0

# First line at which two files differ (1-based). Byte comparison is `cmp`; this only locates the line so
# the report can say what differs.
first_diff_line() {
  awk '
    FILENAME == ARGV[1] { a[FNR]=$0; n=FNR; next }
    done { next }
    {
      if (FNR <= n) { if ($0 != a[FNR]) { print FNR; done=1; exit } }
      else { print FNR; done=1; exit }
    }
    END { if (!done && FNR < n) print FNR + 1 }
  ' "$1" "$2"
}

run_round() {
  local n="$1" dir="$2" tag="" readings="$dir/readings.txt"
  [ "$REPEAT" -gt 1 ] && tag=" · 第 $n/$REPEAT 轮"
  : > "$readings"

  echo "════════════════════════════════════════════════════════════════════"
  echo " 真栈场景门 · 一键全跑$tag"
  echo " HOST_URL      = ${HOST_URL:-<未设，各门用各自默认值>}"
  echo " PG_CONTAINER  = ${PG_CONTAINER:-<未设，各门默认 keelbase-yudao-pg>}"
  echo " 门数          = ${#GATES[@]}"
  [ "$REPEAT" -gt 1 ] && echo " 轮次          = $n/$REPEAT"
  echo " 日志目录      = $dir"
  echo " 开始          = $(date '+%Y-%m-%d %H:%M:%S')"
  echo "════════════════════════════════════════════════════════════════════"

  local FAILED=() PASSED=() SKIPPED=() SUMMARY=()
  local START_ALL i name log reason counts rc dt t0 status
  START_ALL=$(date +%s)
  i=0

  for name in "${GATES[@]}"; do
    i=$((i + 1))
    log="$dir/$name.log"
    reason="$(skip_reason "$name")"

    if [ -n "$reason" ]; then
      echo
      echo "── [$i/${#GATES[@]}] $name · SKIP"
      echo "   $reason"
      SKIPPED+=("$name")
      SUMMARY+=("SKIP  $name  —  $reason")
      status="SKIP"
      [ "$REPEAT" -gt 1 ] && printf 'SKIP\n' > "$dir/$name.rc"
      STATUS_OF["$n|$name"]="$status"
      continue
    fi

    echo
    echo "── [$i/${#GATES[@]}] $name · 开始 $(date '+%H:%M:%S')"
    t0=$(date +%s)
    set -o pipefail
    node "$HERE/$name" 2>&1 | tee "$log"
    rc=${PIPESTATUS[0]}
    dt=$(( $(date +%s) - t0 ))

    counts="$(grep -Eo '^[0-9]+ ok / [0-9]+ failed$' "$log" | tail -1 || true)"
    [ -n "$counts" ] || counts="(该门没有打印 ok/failed 汇总行)"
    grep -E '^READING ' "$log" | sed "s|^|$name\t|" >> "$readings" || true

    if [ "$rc" -eq 0 ]; then
      PASSED+=("$name")
      status="PASS"
      printf ' ── 结果：通过  exit=%d  %ds  %s\n' "$rc" "$dt" "$counts"
      SUMMARY+=("PASS  $name  $counts  ${dt}s")
    else
      FAILED+=("$name")
      status="FAIL"
      printf ' ── 结果：失败  exit=%d  %ds  %s  →  %s\n' "$rc" "$dt" "$counts" "$log"
      SUMMARY+=("FAIL  $name  $counts  ${dt}s  exit=$rc")
    fi
    STATUS_OF["$n|$name"]="$status"
    RC_OF["$n|$name"]="$rc"
    if [ "$REPEAT" -gt 1 ]; then
      printf '%s\n' "$rc" > "$dir/$name.rc"
      grep -E '^READING ' "$log" > "$dir/$name.readings" || true
    fi
  done

  local DT_ALL=$(( $(date +%s) - START_ALL ))

  echo
  echo "════════════════════════════════════════════════════════════════════"
  echo " 汇总${tag:+（第 $n/$REPEAT 轮）}"
  echo "════════════════════════════════════════════════════════════════════"
  for line in "${SUMMARY[@]}"; do printf '  %s\n' "$line"; done
  echo "────────────────────────────────────────────────────────────────────"
  printf ' %d passed / %d failed' "${#PASSED[@]}" "${#FAILED[@]}"
  [ "${#SKIPPED[@]}" -gt 0 ] && printf ' / %d skipped' "${#SKIPPED[@]}"
  printf '   （共 %d 道，用时 %dm%02ds）\n' "${#GATES[@]}" $((DT_ALL / 60)) $((DT_ALL % 60))
  if [ "${#FAILED[@]}" -gt 0 ]; then
    echo " 失败："
    for name in "${FAILED[@]}"; do echo "   - $name   日志 $dir/$name.log"; done
  fi
  [ "${#SKIPPED[@]}" -gt 0 ] && { echo " 跳过（前置不在本轮）:"; for name in "${SKIPPED[@]}"; do echo "   - $name"; done; }
  [ -s "$readings" ] && echo " 读数（按门收束的 READING 行，两轮应逐字相同）：$readings"
  echo " 结束 = $(date '+%Y-%m-%d %H:%M:%S')"

  [ "${#FAILED[@]}" -eq 0 ] || ANY_FAILURE=1
}

for n in $(seq 1 "$REPEAT"); do
  if [ "$REPEAT" -eq 1 ]; then
    dir="$LOG_DIR"
  else
    dir="$LOG_DIR/round-$n"
    mkdir -p "$dir" || exit 1
  fi
  ROUND_DIRS+=("$dir")
  [ "$n" -gt 1 ] && echo
  run_round "$n" "$dir"
done

MISMATCH=0

if [ "$REPEAT" -gt 1 ]; then
  echo
  echo "════════════════════════════════════════════════════════════════════"
  echo " 各轮比对（基线 = 第 1 轮）"
  echo "════════════════════════════════════════════════════════════════════"

  # a) Each gate's pass / fail / skip must be the same in every round.
  for name in "${GATES[@]}"; do
    base="${STATUS_OF["1|$name"]}"
    for n in $(seq 2 "$REPEAT"); do
      cur="${STATUS_OF["$n|$name"]}"
      [ "$cur" = "$base" ] && continue
      MISMATCH=1
      brc=""; crc=""
      [ "$base" = PASS ] || [ "$base" = FAIL ] && brc=" (exit=${RC_OF["1|$name"]})"
      [ "$cur" = PASS ] || [ "$cur" = FAIL ] && crc=" (exit=${RC_OF["$n|$name"]})"
      printf ' 状态不一致   %s：第 1 轮 %s%s，第 %d 轮 %s%s\n' "$name" "$base" "$brc" "$n" "$cur" "$crc"
    done
  done

  # b) Every gate's READING lines, concatenated in gate order, byte for byte.
  base_readings="${ROUND_DIRS[0]}/readings.txt"
  for idx in $(seq 1 $((REPEAT - 1))); do
    cur_readings="${ROUND_DIRS[$idx]}/readings.txt"
    cmp -s "$base_readings" "$cur_readings" && continue
    MISMATCH=1
    ln="$(first_diff_line "$base_readings" "$cur_readings")"
    [ -n "$ln" ] || ln=1
    la="$(sed -n "${ln}p" "$base_readings")"
    lb="$(sed -n "${ln}p" "$cur_readings")"
    gate_hint=""
    [ -n "$la" ] && gate_hint="${la%%$'\t'*}"
    [ -z "$gate_hint" ] && [ -n "$lb" ] && gate_hint="${lb%%$'\t'*}"
    printf ' 读数不一致   第 1 轮 vs 第 %d 轮 · 第一处不同在第 %s 行' "$((idx + 1))" "$ln"
    [ -n "$gate_hint" ] && printf '（门：%s）' "$gate_hint"
    printf '\n'
    printf '   第 1 轮：%s\n' "${la:-<该轮读数到此结束>}"
    printf '   第 %d 轮：%s\n' "$((idx + 1))" "${lb:-<该轮读数到此结束>}"
    echo "   完整差异（diff -u）："
    diff -u "$base_readings" "$cur_readings" | sed -n '1,20p' | sed 's/^/     /'
  done

  if [ "$MISMATCH" -eq 0 ]; then
    echo " 一致：每道门的状态相同，READING 行逐字节相同"
  else
    echo " 不一致：见上面逐条列出的门与行"
  fi
fi

if [ "$REPEAT" -gt 1 ]; then
  echo
  echo " 各轮读数文件（保留）："
  for d in "${ROUND_DIRS[@]}"; do echo "   - $d/readings.txt"; done
fi

if [ "$ANY_FAILURE" -ne 0 ] || [ "$MISMATCH" -ne 0 ]; then
  exit 1
fi
exit 0
