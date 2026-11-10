#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Run the server against this line's datastore, on JDK 25, with everything passed as parameters.
#
#   bash scripts/run-server.sh
#
# Nothing here is written into upstream's `application-local.yaml`: that file stays untouched, and the
# same checkout can be pointed at another stack without editing anything. See KEELBASE-DEV.md for why
# each parameter is needed.
#
# 在 JDK 25 上、对着本线的数据存储跑服务，一切都走参数。
#
#   bash scripts/run-server.sh
#
# 这里没有任何东西写进上游的 `application-local.yaml`：那个文件保持一字未动，同一份检出可以指向另一套栈而
# 不必改任何东西。每个参数为什么需要，见 KEELBASE-DEV.md。
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

PORT="${PORT:-48080}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-54329}"
PG_DB="${PG_DB:-ruoyi-vue-pro}"
PG_USER="${PG_USER:-root}"
PG_PASSWORD="${PG_PASSWORD:-password}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-56389}"
AUDIT_KEY="${KEELBASE_AUDIT_KEY:-dev-audit-key-not-for-deployment}"

PG_URL="jdbc:postgresql://$PG_HOST:$PG_PORT/$PG_DB"

# KeelBase's model loop is **off unless a key is given**, and that default is the point rather than a
# convenience: the scenario gates assert *which* tool ran (`list_crm_customers`, and so on), which a
# model would turn into a guess. With a key, two things change. `/ai/task` gains the governed multi-step
# loop. And on `/ai/chat` the model becomes the **last** planner in this host's chain — behind the
# host's own routes and behind the runtime's rules, so a phrase either of those already knows never
# reaches a model at all. It is *not* that the rule-based planner stands down: that is the shape a
# deployment with no planner of its own gets, and this one is not that. `YudaoToolFaceConfiguration`
# deliberately takes the single `ToolCallPlanner` slot so the runtime's router yields — and taking it
# suppresses the model-backed planner by the same condition, which is why this host composes the model
# into its fallback explicitly (see `ModuleRoutePlanner`'s constructor). The key is read from the
# environment, never written here.
# KeelBase 的模型回路**不给 key 就不开**，而这个默认是**要点**、不是图省事：场景门禁断言的是**哪个**工具跑了
# （`list_crm_customers` 之类），换成模型就把这件事变成猜。给了 key 会变两件事：`/ai/task` 拿到那条受治理的多步
# 循环；而 `/ai/chat` 上模型成为本宿主那条链的**最后一环** —— 排在宿主自己的路由与运行时的规则**之后**，故这两者
# 认得出来的短语**根本不问模型**。这里**不是**「规则版 planner 让位给模型版」——那是**自己没有规划器**的部署拿到的
# 形状，而本部署不是：`YudaoToolFaceConfiguration` **刻意**占住那唯一一个 `ToolCallPlanner` 槽（好让运行时的规则
# 路由器让位），而**占住它按同一条条件把模型版也一并顶掉**了 —— 所以本宿主把模型**显式**组合进自己的兜底
# （见 `ModuleRoutePlanner` 的构造参数）。key 从环境读，**不写在这里**。
AI_ARGS=()
if [ -n "${KEELBASE_MODEL_API_KEY:-}" ]; then
  # The builder the model loop needs is the host's **own** bean (`YudaoChatClientConfiguration`), not
  # the autoconfiguration the host disables on purpose. That one wants a single `ChatModel` and this
  # project makes several — its own AI module and the report module both contribute — so switching it
  # back on fails startup, which is exactly what this parameter used to do.
  # 模型回路要的那个 builder 是**宿主自己的** bean（`YudaoChatClientConfiguration`），不是宿主**故意关掉**的
  # 那个自动配置——那个要唯一一个 `ChatModel`、而本项目会造多个（它自己的 AI 模块与 report 模块各出一份），
  # 把它开回来就会启动失败，而这个参数从前正是那么干的。
  AI_ARGS+=("--keelbase.ai.enabled=true")
  AI_ARGS+=("--spring.ai.openai.api-key=$KEELBASE_MODEL_API_KEY")
  AI_ARGS+=("--spring.ai.openai.base-url=${KEELBASE_MODEL_BASE_URL:-https://api.deepseek.com}")
  AI_ARGS+=("--spring.ai.openai.chat.options.model=${KEELBASE_MODEL_NAME:-deepseek-v4-flash}")
fi

# The `keelbase` profile carries what this deployment *is* — its business modules and their names —
# and it is a file of ours rather than a value here for one reason: those labels are Chinese, and argv
# is where a Chinese string stops being the string (the platform's argument encoding decides).
# 那个 `keelbase` profile 带着**本部署是什么** —— 它的业务模块与它们的名字 —— 而它是一份**我们自己的文件**、
# 不是这里的一个取值，理由只有一条：那些 label 是中文，而 argv 正是中文串**不再是那个串**的地方
# （平台参数编码说了算）。
JAR="$ROOT/yudao-server/target/yudao-server.jar"

# 起栈之前先核一件本仓从前没人核的事：这件产物里带的运行时，是不是**发布的那一份字节**。
# 2026-10-26 实测：POM 钉着 `0.1.11`、Central 上也有、tag 也对得上，而产物里嵌的却是本机 `mvn install`
# 装进去的同版本重编产物（`4b203bb3…` 对 `8a2c34dc…`）。内容等价，所以构建、发布、CI 全绿，没有一处会报。
# 于是这道检查放在**真正要跑的那一刻**：跑的东西不是发布版，这一次读数就不该被当成「发布版跑过了」。
# 不联网、或发布库上没有这个坐标，一律红 —— 那是「判不了」，不读成「没事」。要显式跳过用下面的开关。
# Before the stack starts, check the one thing nobody in this repository checked: whether the runtime inside this
# artefact is **the published bytes**. Measured 2026-10-26: the POM pinned `0.1.11`, Central carried it, the tag
# matched — and the artefact embedded an identical-version local `mvn install` (`4b203bb3…` against `8a2c34dc…`).
# The contents are equivalent, so the build, the release and CI all stayed green and nothing reported it. The check
# therefore sits **at the moment it is actually used**: if what runs is not the published copy, this reading must not
# be taken as "the published runtime was run". No network, or the coordinate is not published, is red too — that is
# "cannot decide", never "fine". The switch below skips it, out loud.
if [ "${KEELBASE_SKIP_RUNTIME_BYTES:-0}" = "1" ]; then
  echo "⚠ 跳过运行时字节核对（KEELBASE_SKIP_RUNTIME_BYTES=1）—— 本次读数不能说明跑的是发布版。" >&2
  echo "⚠ skipped the runtime-bytes check — this run does not say it ran the published runtime." >&2
else
  node "$HERE/check-runtime-pin-bytes.mjs" --jar "$JAR" || exit $?
fi

exec bash "$HERE/jdk25.sh" java -jar "$JAR" \
  --server.port="$PORT" \
  --spring.profiles.active=local,keelbase \
  --spring.flyway.baseline-on-migrate=true --spring.flyway.baseline-version=0 \
  --spring.datasource.dynamic.datasource.master.type=com.zaxxer.hikari.HikariDataSource \
  --spring.datasource.dynamic.datasource.master.url="$PG_URL" \
  --spring.datasource.dynamic.datasource.master.username="$PG_USER" \
  --spring.datasource.dynamic.datasource.master.password="$PG_PASSWORD" \
  --spring.datasource.dynamic.datasource.slave.lazy=true \
  --spring.datasource.dynamic.datasource.slave.url="$PG_URL" \
  --spring.datasource.dynamic.datasource.slave.username="$PG_USER" \
  --spring.datasource.dynamic.datasource.slave.password="$PG_PASSWORD" \
  --spring.data.redis.host="$REDIS_HOST" --spring.data.redis.port="$REDIS_PORT" \
  --spring.datasource.dynamic.druid.validation-query="SELECT 1" \
  --spring.datasource.druid.validation-query="SELECT 1" \
  --keelbase.audit.hmac-key="$AUDIT_KEY" \
  --keelbase.wire.exclude-packages=cn.iocoder.yudao \
  --keelbase.memory.max-per-owner="${MEMORY_CAP:-200}" \
  --keelbase.knowledge.chunk-size=800 --keelbase.knowledge.chunk-overlap=120 \
  --yudao.tenant.ignore-tables=products \
  --yudao.access-log.enable="${ACCESS_LOG:-true}" \
  ${AI_ARGS[@]+"${AI_ARGS[@]}"}
