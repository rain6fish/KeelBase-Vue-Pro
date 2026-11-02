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
# 退出码：任一条门非 0 ⇒ 本脚本 exit 1；全部通过（含被跳过的）⇒ exit 0。
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
# Exit status: any gate non-zero ⇒ this script exits 1; all passing (skips included) ⇒ 0.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT" || exit 1

LIST_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --list) LIST_ONLY=1 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg（只认 --list / --help）" >&2; exit 2 ;;
  esac
done

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
READINGS="$LOG_DIR/readings.txt"
: > "$READINGS"

echo "════════════════════════════════════════════════════════════════════"
echo " 真栈场景门 · 一键全跑"
echo " HOST_URL      = ${HOST_URL:-<未设，各门用各自默认值>}"
echo " PG_CONTAINER  = ${PG_CONTAINER:-<未设，各门默认 keelbase-yudao-pg>}"
echo " 门数          = ${#GATES[@]}"
echo " 日志目录      = $LOG_DIR"
echo " 开始          = $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════════════"

FAILED=()
PASSED=()
SKIPPED=()
SUMMARY=()
START_ALL=$(date +%s)
i=0

for name in "${GATES[@]}"; do
  i=$((i + 1))
  log="$LOG_DIR/$name.log"
  reason="$(skip_reason "$name")"

  if [ -n "$reason" ]; then
    echo
    echo "── [$i/${#GATES[@]}] $name · SKIP"
    echo "   $reason"
    SKIPPED+=("$name")
    SUMMARY+=("SKIP  $name  —  $reason")
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
  grep -E '^READING ' "$log" | sed "s|^|$name\t|" >> "$READINGS" || true

  if [ "$rc" -eq 0 ]; then
    PASSED+=("$name")
    printf ' ── 结果：通过  exit=%d  %ds  %s\n' "$rc" "$dt" "$counts"
    SUMMARY+=("PASS  $name  $counts  ${dt}s")
  else
    FAILED+=("$name")
    printf ' ── 结果：失败  exit=%d  %ds  %s  →  %s\n' "$rc" "$dt" "$counts" "$log"
    SUMMARY+=("FAIL  $name  $counts  ${dt}s  exit=$rc")
  fi
done

DT_ALL=$(( $(date +%s) - START_ALL ))

echo
echo "════════════════════════════════════════════════════════════════════"
echo " 汇总"
echo "════════════════════════════════════════════════════════════════════"
for line in "${SUMMARY[@]}"; do printf '  %s\n' "$line"; done
echo "────────────────────────────────────────────────────────────────────"
printf ' %d passed / %d failed' "${#PASSED[@]}" "${#FAILED[@]}"
[ "${#SKIPPED[@]}" -gt 0 ] && printf ' / %d skipped' "${#SKIPPED[@]}"
printf '   （共 %d 道，用时 %dm%02ds）\n' "${#GATES[@]}" $((DT_ALL / 60)) $((DT_ALL % 60))
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo " 失败："
  for name in "${FAILED[@]}"; do echo "   - $name   日志 $LOG_DIR/$name.log"; done
fi
[ "${#SKIPPED[@]}" -gt 0 ] && { echo " 跳过（前置不在本轮）:"; for name in "${SKIPPED[@]}"; do echo "   - $name"; done; }
[ -s "$READINGS" ] && echo " 读数（按门收束的 READING 行，两轮应逐字相同）：$READINGS"
echo " 结束 = $(date '+%Y-%m-%d %H:%M:%S')"

[ "${#FAILED[@]}" -eq 0 ] || exit 1
exit 0
