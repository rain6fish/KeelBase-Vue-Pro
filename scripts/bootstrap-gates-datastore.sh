#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# 为「跑全部真栈场景门」准备一套**专用**的数据存储：PostgreSQL(pgvector) + Redis 容器，并按门禁要的表灌库。
#
#   bash scripts/bootstrap-gates-datastore.sh              # 起栈；库是空的就灌
#   bash scripts/bootstrap-gates-datastore.sh --reset      # 删 schema 重灌（破坏性）
#   bash scripts/bootstrap-gates-datastore.sh --force      # 容器已存在就删掉重建
#   bash scripts/bootstrap-gates-datastore.sh --help       # 用法
#
# 灌库次序（任一步失败即停，并打印失败的那份 SQL 文件）：
#
#   1. `sql/postgresql/ruoyi-vue-pro.sql` —— 上游自己的脚本，按上游所写原样导入；
#   2. `deploy/demo-ecs/seed-manifest.txt` 里**全部 `load` 行**，按清单顺序（顺序即依赖顺序）；
#   3. `sql/keelbase-bpm.sql`；
#   4. `sql/keelbase-fms.sql`。
#
# **为什么 3、4 要额外装**：那份清单是**demo 部署**的取舍 —— 它把 bpm 与 fms 都归成 `skip`（bpm 的菜单不展示、
# `bpm_*` 表不导入；fms 不在部署 jar 里）。而场景门禁要覆盖它们：BPM 四道门、FMS 两道门，各要真表才能跑。
# 所以清单仍是「demo 该灌什么」的单源，本脚本在它之上**只补门禁需要的那两份**，不改清单、不改部署脚本。
#
# 容器与端口都可覆盖，默认值避开本机保留段与其它会话（PG `39871` · Redis `39872`）。创建时打一个
# `keelbase.gates-datastore=1` 标签：同名的容器**如果不是本脚本建的**，不 `--force` 就拒绝动手 —— 那是别人的。
#
# 结束时打印可直接复制的 `PG_PORT` / `PG_CONTAINER` / `PG_DB`，以及起宿主用的一行示例。
#
# 收尾：`docker rm -f <PG_CONTAINER> <REDIS_CONTAINER>`（本脚本不自动删，门禁跑完再删）。
#
# ---
#
# Prepare a **dedicated** datastore for running every real-stack scenario gate: PostgreSQL (pgvector) and
# Redis containers, loaded with the tables the gates need.
#
#   bash scripts/bootstrap-gates-datastore.sh              # bring up; load if empty
#   bash scripts/bootstrap-gates-datastore.sh --reset      # drop the schema and reload (destructive)
#   bash scripts/bootstrap-gates-datastore.sh --force      # remove existing containers and recreate
#   bash scripts/bootstrap-gates-datastore.sh --help       # usage
#
# Load order (stop at the first failure, printing the SQL file that failed):
#
#   1. `sql/postgresql/ruoyi-vue-pro.sql` — upstream's own script, loaded as upstream wrote it;
#   2. every `load` line of `deploy/demo-ecs/seed-manifest.txt`, in that file's order (which is the
#      dependency order);
#   3. `sql/keelbase-bpm.sql`;
#   4. `sql/keelbase-fms.sql`.
#
# **Why 3 and 4 are extra**: that manifest is the **demo deployment**'s choice — it classifies both bpm and
# fms as `skip` (bpm's menus are hidden and its tables are not seeded; fms is not in the deployment jar).
# The scenario gates cover them: four BPM gates and two FMS gates each need real tables. So the manifest
# stays the single source for "what the demo seeds", and this script adds only the two files the gates need
# on top of it — without touching the manifest or the deployment script.
#
# Container names and ports are overridable; the defaults avoid this machine's reserved ranges and the other
# sessions' stacks (PG `39871`, Redis `39872`). Containers are created with a `keelbase.gates-datastore=1`
# label: a container of the same name **that this script did not create** is left alone unless `--force` is
# passed — it belongs to someone else.
#
# The end prints copyable `PG_PORT` / `PG_CONTAINER` / `PG_DB` lines and a one-line host example.
#
# Cleanup: `docker rm -f <PG_CONTAINER> <REDIS_CONTAINER>` (this script does not remove them; do it after
# the gates have run).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

PG_CONTAINER="${PG_CONTAINER:-gates-pg}"
REDIS_CONTAINER="${REDIS_CONTAINER:-gates-redis}"
PG_PORT="${PG_PORT:-39871}"
REDIS_PORT="${REDIS_PORT:-39872}"
PG_DB="${PG_DB:-gates}"
PG_USER="${PG_USER:-root}"
PG_PASSWORD="${PG_PASSWORD:-password}"
PG_IMAGE="${PG_IMAGE:-pgvector/pgvector:pg17}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"
LABEL_KEY=keelbase.gates-datastore

UPSTREAM="$ROOT/sql/postgresql/ruoyi-vue-pro.sql"
MANIFEST="$ROOT/deploy/demo-ecs/seed-manifest.txt"
GATE_ONLY_SQL=("$ROOT/sql/keelbase-bpm.sql" "$ROOT/sql/keelbase-fms.sql")

RESET=0
FORCE=0

usage() {
  sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//'
  echo
  echo "可覆盖的环境变量 / overridable environment:"
  echo "  PG_CONTAINER=$PG_CONTAINER  REDIS_CONTAINER=$REDIS_CONTAINER"
  echo "  PG_PORT=$PG_PORT  REDIS_PORT=$REDIS_PORT  PG_DB=$PG_DB"
  echo "  PG_USER=$PG_USER  PG_PASSWORD=******  PG_IMAGE=$PG_IMAGE  REDIS_IMAGE=$REDIS_IMAGE"
}

for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --force) FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "unknown argument: $arg（只认 --reset / --force / --help）" >&2
      echo "unknown argument: $arg (accepts --reset / --force / --help only)" >&2
      exit 2
      ;;
  esac
done

die() { echo "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "找不到 docker —— 本脚本靠它起容器 / docker not found"

psql_() {
  docker exec -i -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" psql -U "$PG_USER" "$@"
}
psql_db() { psql_ -d "$PG_DB" "$@"; }
psql_admin() { psql_ -d postgres "$@"; }

container_state() {
  # prints: absent | running | stopped
  if ! docker container inspect "$1" >/dev/null 2>&1; then
    echo absent; return
  fi
  if [ "$(docker container inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; then
    echo running
  else
    echo stopped
  fi
}

container_label() {
  docker container inspect -f "{{ index .Config.Labels \"$LABEL_KEY\" }}" "$1" 2>/dev/null
}

port_taken_by_container() {
  docker ps --format '{{.Ports}}' | grep -qE "(:|^)${1}->"
}

ensure_container() {
  local name="$1" port="$2" image="$3" label_ours
  shift 3
  local state
  state="$(container_state "$name")"

  if [ "$state" != absent ]; then
    label_ours="$(container_label "$name")"
    if [ "$label_ours" != "1" ]; then
      if [ "$FORCE" != 1 ]; then
        die "容器 $name 已存在，且不是本脚本建的（没有 $LABEL_KEY=1 标签）——不动别人的容器。
Container $name exists and was not created by this script (no $LABEL_KEY=1 label) — leaving it alone.
换个名字/端口（PG_CONTAINER / PG_PORT 等），或确认可删后加 --force。"
      fi
      echo "  --force ⇒ 删掉已存在的容器 $name（标签='$label_ours'）"
      docker rm -f "$name" >/dev/null || die "删不掉容器 $name"
      state=absent
    elif [ "$FORCE" = 1 ]; then
      echo "  --force ⇒ 重建本脚本的容器 $name"
      docker rm -f "$name" >/dev/null || die "删不掉容器 $name"
      state=absent
    fi
  fi

  if [ "$state" = absent ]; then
    if port_taken_by_container "$port"; then
      die "端口 $port 已被另一个容器占用 —— 用 PG_PORT / REDIS_PORT 换一个（可用范围见 netsh 保留段）
Port $port is already mapped by another container — pick another PG_PORT / REDIS_PORT."
    fi
    echo "  创建容器 $name（$image，127.0.0.1:$port）"
    docker run -d --name "$name" --label "$LABEL_KEY=1" "$@" "$image" >/dev/null \
      || die "docker run 失败：$name"
  elif [ "$state" = stopped ]; then
    echo "  启动已停止的容器 $name"
    docker start "$name" >/dev/null || die "docker start 失败：$name"
  else
    echo "  容器 $name 已在跑，复用（--force 可重建）"
  fi
}

echo "== 1) 起栈 =="
ensure_container "$PG_CONTAINER" "$PG_PORT" "$PG_IMAGE" \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$PG_DB" \
  -p "127.0.0.1:$PG_PORT:5432"
ensure_container "$REDIS_CONTAINER" "$REDIS_PORT" "$REDIS_IMAGE" \
  -p "127.0.0.1:$REDIS_PORT:6379"

echo "== 2) 等 PG / Redis 就绪 =="
for i in $(seq 1 60); do
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    echo "  PostgreSQL ready after ${i}s"; break
  fi
  sleep 1
  [ "$i" = 60 ] && die "PostgreSQL 60s 未就绪 / not ready after 60s"
done
for i in $(seq 1 30); do
  if [ "$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null)" = "PONG" ]; then
    echo "  Redis ready after ${i}s"; break
  fi
  sleep 1
  [ "$i" = 30 ] && die "Redis 30s 未就绪 / not ready after 30s"
done

echo "== 3) 库与向量扩展 =="
if psql_admin -tAc "select 1 from pg_database where datname='$PG_DB'" | grep -q 1; then
  echo "  库 $PG_DB 已存在"
else
  psql_admin -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$PG_DB\" OWNER $PG_USER;" >/dev/null \
    || die "建库失败 / CREATE DATABASE failed"
  echo "  已建库 $PG_DB"
fi

psql_db -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;' >/dev/null \
  || die "向量扩展创建失败 / CREATE EXTENSION vector failed"
echo "  $(psql_db -tAc "select 'vector ' || extversion from pg_extension where extname='vector';" | tr -d '\r')"

if [ "$RESET" = 1 ]; then
  echo "== 3b) --reset ⇒ 删 schema 重灌（破坏性：$PG_DB 里的东西全没）=="
  psql_db -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null \
    || die "DROP SCHEMA 失败 / drop schema failed"
  psql_db -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;' >/dev/null \
    || die "重建向量扩展失败 / CREATE EXTENSION vector failed after reset"
fi

COUNT="$(psql_db -tAc "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')"
[ -n "$COUNT" ] || die "数不出表数 —— psql 没给出结果 / could not count tables"
echo "  现有表数 / tables now = $COUNT"

if [ "$COUNT" -gt 5 ] && [ "$RESET" != 1 ]; then
  echo "== 4) 已有 schema，跳过灌库（要重灌用 --reset）=="
  echo "  schema already present; skipping the load (use --reset to reload)"
else
  if [ ! -f "$UPSTREAM" ]; then
    die "找不到 $UPSTREAM"
  fi
  if [ ! -f "$MANIFEST" ]; then
    die "找不到清单 $MANIFEST —— 没有清单就不灌增补 / manifest missing"
  fi

  load_sql() {
    local file="$1" label
    label="$(basename "$file")"
    [ -f "$file" ] || die "找不到 SQL 文件：$file / SQL file missing"
    printf '  %s\n' "$label"
    docker exec -i -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
      psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q < "$file" \
      || die "⚠ 灌库失败：$file —— 上面是 psql 的原话
⚠ load failed: $file"
  }

  echo "== 4a) 上游 schema（$(wc -c < "$UPSTREAM") 字节）=="
  load_sql "$UPSTREAM"

  echo "== 4b) 清单里的 load 行（按清单顺序）=="
  ADDITIONS=()
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    ADDITIONS+=("$ROOT/sql/$name")
  done < <(awk '$1 == "load" { print $2 }' "$MANIFEST" | tr -d '\r')
  [ "${#ADDITIONS[@]}" -gt 0 ] || die "清单里没有 load 行 / manifest has no load lines"
  for f in "${ADDITIONS[@]}"; do
    load_sql "$f"
  done

  echo "== 4c) 门禁额外要的两份（demo 清单里是 skip）=="
  for f in "${GATE_ONLY_SQL[@]}"; do
    load_sql "$f"
  done
fi

echo "== 5) 校验 =="
FINAL_COUNT="$(psql_db -tAc "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')"
[ -n "$FINAL_COUNT" ] || die "数不出表数 —— psql 没给出结果 / could not count tables"
echo "  表数 / tables = $FINAL_COUNT"
if [ "$FINAL_COUNT" -le 100 ]; then
  die "表数只有 $FINAL_COUNT（应 > 100）—— 灌库不完整，检查上面每一份的输出
Table count is $FINAL_COUNT (expected > 100) — the load is incomplete; check the output above."
fi

echo
echo "== 完成。可直接复制的环境变量 =="
echo "PG_PORT=$PG_PORT"
echo "PG_CONTAINER=$PG_CONTAINER"
echo "PG_DB=$PG_DB"
echo
echo "起宿主 / start the host:"
echo "  PG_PORT=$PG_PORT PG_DB=$PG_DB REDIS_PORT=$REDIS_PORT PORT=48171 bash scripts/run-server.sh &"
echo "跑全部门 / run every gate:"
echo "  HOST_URL=http://127.0.0.1:48171 PG_CONTAINER=$PG_CONTAINER PG_DB=$PG_DB bash scripts/run-all-scenarios.sh"
echo
echo "收尾 / cleanup:"
echo "  docker rm -f $PG_CONTAINER $REDIS_CONTAINER"
