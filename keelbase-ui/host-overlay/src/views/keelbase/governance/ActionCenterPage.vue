<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  What the AI is waiting on this person for, and what it has already written on their behalf.

  The reference console also lists recent conversations here and offers a history drawer per row.
  Neither is drawn: this runtime has no route for a conversation list, and the drawer reads a
  business-object history it does not keep. What is drawn is what the runtime answers — the pending
  decisions and the effect ledger, both scoped to the caller by the server.

  A pending row whose mode is not `immediate` is not decidable here, and the page says where it
  belongs instead of showing a button that cannot work.

  这个人在等 AI 的哪一笔，以及 AI 已经替他写了什么。

  参照实现还会在这里列出最近会话、并为每一行给一个历史抽屉。两者都不画：本运行时没有会话列表这条
  路由，抽屉读的是一份它不保留的业务对象历史。画出来的是运行时答得出来的——待决的那些，以及副作用
  台账，两者的范围都由**服务端**按调用方定。

  `mode` 不是 `immediate` 的待决行**不能在这里裁决**，页面说的是它归哪儿，而不是给一个按不动的按钮。
-->
<template>
  <ContentWrap :title="t('keelbase.actionCenter.pendingTitle')">
    <template #header>
      <el-tag v-if="pending.length" size="small" type="warning" effect="plain">
        {{ t('keelbase.actionCenter.pendingCount', { n: pending.length }) }}
      </el-tag>
      <el-button class="ml-auto" size="small" :loading="pendingLoading" @click="loadPending">
        {{ t('keelbase.common.refresh') }}
      </el-button>
    </template>

    <!-- 覆盖声明（`D57`）：这一页读到哪、到不了哪些路径 —— 只写事实。 -->
    <!-- Coverage statement (`D57`): what this page reads, and which paths it cannot reach. -->
    <div class="mb-10px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.coverage.actionCenter') }}</div>

    <div v-if="pendingLoading && !pending.length" class="text-[var(--el-text-color-secondary)]">
      {{ t('keelbase.common.loading') }}
    </div>
    <el-empty v-else-if="!pending.length" :description="t('keelbase.actionCenter.pendingEmpty')" />
    <div v-else>
      <div v-for="c in pending" :key="c.token" class="row">
        <div class="row-main">
          <div class="row-head">
            <span class="font-weight-medium">{{ toolText(c.toolName) }}</span>
            <el-tag v-if="c.riskLevel" size="small" effect="plain">{{ c.riskLevel }}</el-tag>
            <el-tag v-if="c.mode !== 'immediate'" size="small" type="info" effect="plain">{{ c.mode }}</el-tag>
          </div>
          <!-- F-18：为什么需要一个人点头，以及它停在哪一步 —— 两句都由行上已有的字段说。 -->
          <!-- F-18: why a person is needed, and which step it stopped at — both from fields the row already carries. -->
          <div class="row-reason">{{ reasonText(c) }}</div>
          <div class="row-step">{{ stepLine(c) }}</div>
          <!--
            A human-readable summary is a field the runtime sends as null: it has no presentation
            layer. The arguments are shown verbatim instead — they are what the call would carry,
            which is the honest substitute for a sentence about them.

            给人读的摘要是运行时**送 null** 的字段：它没有展示层。故改为原样显示参数——那是这次调用
            真会带的东西，也是那句摘要的诚实替代品。上面那句话把这块是**什么**说清楚，好让一块裸 JSON
            读起来是「这次调用会带的东西」，而不是一段没头没尾的文本。
          -->
          <div class="args-label">{{ t('keelbase.actionCenter.argsLabel') }}</div>
          <pre class="args">{{ formatArgs(c.arguments) }}</pre>
          <div class="row-meta">
            {{ timeText(c.createdAt) }}
            <template v-if="c.expiresAt"> · {{ t('keelbase.actionCenter.expiresAt', { at: timeText(c.expiresAt) }) }}</template>
          </div>
        </div>
        <!-- The audit reader gets no write control at all; the server would refuse it anyway. -->
        <!-- 审计读者一个写控件都不给；服务端本来也会拒。 -->
        <div v-if="c.mode === 'immediate' && canWrite" class="row-actions">
          <el-button size="small" type="primary" :loading="deciding === c.token" :disabled="deciding !== null" @click="decide(c, 'approve')">
            {{ t('keelbase.actionCenter.approve') }}
          </el-button>
          <el-button size="small" :loading="deciding === c.token" :disabled="deciding !== null" @click="decide(c, 'decline')">
            {{ t('keelbase.actionCenter.decline') }}
          </el-button>
        </div>
        <div v-else-if="c.mode !== 'immediate'" class="row-actions text-12px text-[var(--el-text-color-secondary)]">
          {{ t('keelbase.actionCenter.notDecidableHere') }}
        </div>
        <!-- F-18：只读角色看到的是同一行、没有按钮 —— 这里把「为什么没有」说出来，而不是留白。 -->
        <!-- F-18: a read-only role sees the same row with no buttons — say why instead of leaving it blank. -->
        <div v-else class="row-actions text-12px text-[var(--el-text-color-secondary)]">
          {{ t('keelbase.actionCenter.readOnlyNote') }}
        </div>
      </div>
    </div>
  </ContentWrap>

  <!-- F-18：判决落下的那些行不该消失。这里只渲染运行时已经返回、而页面过去没要的字段。 -->
  <!-- F-18: rows that were decided should not vanish. This renders only fields the runtime already
       returns and the page never asked for. -->
  <ContentWrap :title="t('keelbase.actionCenter.historyTitle')">
    <template #header>
      <el-tag v-if="decided.length" size="small" effect="plain">
        {{ t('keelbase.actionCenter.historyCount', { n: decided.length }) }}
      </el-tag>
      <el-button class="ml-auto" size="small" :loading="pendingLoading" @click="loadPending">
        {{ t('keelbase.common.refresh') }}
      </el-button>
    </template>

    <div class="mb-10px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.actionCenter.historyHint') }}</div>

    <el-empty v-if="!decided.length" :description="t('keelbase.actionCenter.historyEmpty')" />
    <div v-else>
      <div v-for="h in decided" :key="h.token" class="row">
        <div class="row-main">
          <div class="row-head">
            <span class="font-weight-medium">{{ toolText(h.toolName) }}</span>
            <el-tag :type="historyTagType(h)" size="small">{{ historyOutcome(h) }}</el-tag>
          </div>
          <div class="row-step">{{ t('keelbase.actionCenter.stepReached', { step: historyStep(h) }) }}</div>
          <div v-if="historyReason(h)" class="row-reason">
            {{ t('keelbase.actionCenter.reasonLabel', { reason: historyReason(h) }) }}
          </div>
          <div class="row-meta">{{ t('keelbase.actionCenter.decidedLabel', { at: timeText(h.decidedAt) }) }}</div>
        </div>
      </div>
    </div>
    <div class="mt-8px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.actionCenter.notHereNote') }}</div>
  </ContentWrap>

  <ContentWrap :title="t('keelbase.actionCenter.writesTitle')">
    <template #header>
      <el-tag v-if="total" size="small" effect="plain">{{ t('keelbase.actionCenter.writesTotal', { n: total }) }}</el-tag>
      <el-button class="ml-auto" size="small" :loading="effectsLoading" @click="loadEffects">
        {{ t('keelbase.common.refresh') }}
      </el-button>
    </template>

    <div v-if="effectsError" class="text-[var(--el-color-danger)] mb-10px">{{ effectsError }}</div>
    <el-table v-loading="effectsLoading" :data="effects" stripe @expand-change="onExpand">
      <!-- One panel, because the row is the evidence for both. Opened, it lays out the record the
           write landed on — the one place the two trails agree without a guess, because here the row
           **is** the effect; the record's own text is masked, since what a record is about is the thing
           this console must not print (CLAUDE.md §5.5 ②). Below it, the business leg (YD-T18 / D50):
           an AI write leaves a row here and a row in YuDao's own operate log, and both carry the same
           business object id — so the second is shown beside the first. It is labelled a correlation
           and not a link: nothing writes a shared id, every traceId in that log is empty, and the
           AI-caused row carries no user at all. Whether a caller may read it is the host's own
           decision — this host grants `system:operate-log:query` to its `common` role — so the leg's
           scope is the host's, and a refusal is shown as it comes.

           一个面板，因为这一行**同时**是这两件事的证据。摊开时先摆「这次写落在哪条记录上」—— 那是两条轨
           **无需猜测**就一致的地方（这里这一行**本身就是**那条副作用）；记录自己的文字是**掩码的**，因为一条
           记录讲的是什么，正是本控制台不得打印的东西（`CLAUDE.md` §5.5 ②）。它下面就是**业务那一腿**
           （`YD-T18` / `D50`）：一次 AI 写在这边留一行、在芋道自己的操作日志里也留一行，两者握着同一个业务
           对象 id —— 故把第二行摆在第一行旁边。它被标成**相关**、不是链接：没有任何东西写共享 id，那张日志里
           每个 `traceId` 都是空的，而 AI 引起的那行根本不带用户。**谁能读是宿主的决定** —— 本宿主把
           `system:operate-log:query` 授给了 `common` 角色 —— 故这一腿的范围是**宿主自己的**，被拒就照原样显示。
      -->
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="row-detail">
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colTool') }}</span><span>{{ toolText(row.toolName) }}</span></div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colResultType') }}</span><span>{{ row.resultType || '—' }}</span></div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colTargetId') }}</span><span>{{ idText(row.resultId) }}</span></div>
            <div class="d-row">
              <span class="d-key">{{ t('keelbase.effects.colTarget') }}</span>
              <span>
                {{ targetText(row) }}
                <!-- 掩码那句话属于**真有过名字**的情形。运行时与宿主都没答内容时说「已掩码」，是在描述
                     一件没人做过的事。 -->
                <!-- The masking note belongs to a name that exists. Where neither the runtime nor the
                     host answers one, saying "masked" would describe an act nobody performed. -->
                <span v-if="targetNamed(row)" class="muted">{{ t('keelbase.effects.maskedNote') }}</span>
              </span>
            </div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colState') }}</span><span>{{ stateText(row) }}</span></div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colTime') }}</span><span>{{ timeText(row.createdAt) }}</span></div>
          </div>
          <div class="biz">
            <div class="biz-hint">{{ t('keelbase.effects.businessLogHint') }}</div>
            <div v-if="!businessLogApi.mappedType(row.resultType)" class="biz-note">
              {{ t('keelbase.effects.businessLogUnmapped') }}
            </div>
            <div v-else-if="bizError[row.id]" class="biz-note text-[var(--el-color-danger)]">{{ bizError[row.id] }}</div>
            <div v-else-if="!bizLoaded[row.id]" class="biz-note">{{ t('keelbase.common.loading') }}</div>
            <el-empty
              v-else-if="!(bizRows[row.id]?.length)"
              :description="t('keelbase.effects.businessLogEmpty')"
              :image-size="48"
            />
            <el-table v-else :data="bizRows[row.id]" size="small" border>
              <el-table-column :label="t('keelbase.effects.businessLogColWhen')" width="180">
                <template #default="{ row: r }">{{ timeText(r.createTime) }}</template>
              </el-table-column>
              <el-table-column :label="t('keelbase.effects.businessLogColWhat')" prop="subType" width="140" />
              <el-table-column :label="t('keelbase.effects.businessLogColWho')" width="110">
                <template #default="{ row: r }">{{ whoText(r) }}</template>
              </el-table-column>
              <el-table-column :label="t('keelbase.effects.businessLogColAction')" prop="action" show-overflow-tooltip />
            </el-table>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colTool')" width="220">
        <template #default="{ row }">{{ toolText(row.toolName) }}</template>
      </el-table-column>
      <!-- 谁发起的这次写：运行时答 `userId`；宿主名录认得出时把它译成名字（口径见 `callerNames.ts`），
           认不出就原样显示 id。 -->
      <!-- Who caused the write: the runtime answers `userId`; the host's directory turns it into a name
           when it knows one (the rule `callerNames.ts` states), and otherwise the id stands as it is. -->
      <el-table-column :label="t('keelbase.effects.colWho')" width="170">
        <template #default="{ row }">
          <div>{{ callerName(row.userId) }}</div>
          <div v-if="row.userId" class="muted">#{{ row.userId }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colTarget')" width="240">
        <template #default="{ row }">
          {{ targetText(row) }} <span class="muted">{{ idText(row.resultId) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colResultType')" prop="resultType" width="150" />
      <el-table-column :label="t('keelbase.effects.colStatus')" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colTime')" width="190">
        <template #default="{ row }">{{ timeText(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colActions')" width="110" align="center">
        <template #default="{ row }">
          <!-- The server decides revocability, and the page believes it rather than re-deriving it. -->
          <!-- 可撤性由**服务端**定，页面信它，而不是自己重算一遍。 -->
          <el-button v-if="row.revocable && canWrite" link type="danger" @click="confirmRevoke(row)">
            {{ t('keelbase.effects.revoke') }}
          </el-button>
          <span v-else class="text-[var(--el-text-color-secondary)]">—</span>
        </template>
      </el-table-column>
    </el-table>

    <Pagination
      v-if="total > 0"
      v-model:page="page"
      v-model:limit="limit"
      :total="total"
      @pagination="loadEffects"
    />
  </ContentWrap>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ContentWrap } from '@/components/ContentWrap'
import Pagination from '@/components/Pagination/index.vue'
import { businessLogApi, confirmationApi, effectApi, type BusinessLogRow, type ConfirmationItem, type EffectRow } from '@/keelbase/governanceApi'
import { resolveCallerNames } from '@/keelbase/callerNames'
import { resolveRecordNames } from '@/keelbase/recordNames'
import { runtimeErrorMessage } from '@/keelbase/runtime'
import { toolLabelKey } from '@/keelbase/labels'
import { maskTitle } from '@/keelbase/mask'
import { timeText } from '@/keelbase/time'
import { useConsoleWriteAllowed } from '@/keelbase/consoleRole'

defineOptions({ name: 'KeelbaseGovernanceActionCenter' })

const { t } = useI18n()
/** The audit reader sees no write control (revoke, approve, decline); the server's verdict is unchanged. */
/** 审计读者不出现写控件（撤销、批准、拒绝）；服务端裁决不变。 */
const { canWrite } = useConsoleWriteAllowed()

/** The tool in the reader's language, falling back to the registered name. */
/** 工具名，用读者的语言；不认识就保留注册名。 */
function toolText(name: string | null | undefined): string {
  if (!name) return '—'
  const key = toolLabelKey(name)
  return key ? t(key) : name
}

/**
 * 宿主那一行记下的调用方：先取它**自己配好的名字**，其次它记下的 id，都没有则**如实留空**。
 *
 * 不说得比宿主多：这一列是「宿主为这次写记下了谁」，故名字由**它**给（它的操作日志页本就拿自己的用户表
 * 译过一遍），控制台不另发一次查询去凑一个更好看的名字。宿主没记的那些行 —— 本次改动之前写下的、以及它确实
 * 说不出调用方的那些 —— 留一个破折号，而不是拿别的轨上的 id 去补。
 */
function whoText(row: BusinessLogRow): string {
  if (row.userName) return row.userName
  return row.userId === null || row.userId === undefined ? '—' : String(row.userId)
}

/**
 * 记录编号：有编号时给 `#id`，没有时给一个破折号 —— **不给占位符配井号**（那读起来像个坏掉的 id）。
 */
function idText(value: number | string | null | undefined): string {
  return value === null || value === undefined ? '—' : `#${value}`
}

/**
 * 这一格写什么：宿主答得出就给它的名字（已掩码），否则用运行时给的标题，再没有就说「未登记名称」。
 * 破折号留给**真没有对象**的行，不再用来表示「没问到」。
 *
 * What this cell says: the host's name when it has one (masked), else the runtime's title, else "name
 * not registered". The dash is left to rows that really carry no object, not to "we did not ask".
 */
function targetText(row: EffectRow): string {
  const named = targetNames.value[`${row.resultType ?? ''}#${row.resultId ?? ''}`]
  if (named) return named
  if (row.targetTitle) return maskTitle(row.targetTitle)
  return t('keelbase.effects.targetUnnamed')
}

/** 这一格真有个名字（宿主或运行时给的），掩码那句说明才该出现。 / Whether the cell holds a real name. */
function targetNamed(row: EffectRow): boolean {
  return Boolean(targetNames.value[`${row.resultType ?? ''}#${row.resultId ?? ''}`] || row.targetTitle)
}

/**
 * 这一行的发起人：名录认得就显示名字，认不得就原样显示 id —— 页面**只补名字、不改事实**。
 *
 * The caller behind the row: a name when the directory knows it, the id itself otherwise — this only
 * adds a name, it never changes the fact.
 */
function callerName(id: string | null | undefined): string {
  if (!id) return '—'
  return names.value[String(id)] ?? String(id)
}

/** Whether the record this write landed on is still there — read off the row, never re-derived. */
/** 这次写落在的那条记录**还在不在** —— 按行读，绝不自己重算。 */
function stateText(row: EffectRow): string {
  if (!row.targetExists) return t('keelbase.effects.stateGone')
  if (row.targetSoftDeleted) return t('keelbase.effects.stateDeleted')
  return t('keelbase.effects.statePresent')
}

const pending = ref<ConfirmationItem[]>([])
/** Decisions that have already been taken — the endpoint answers them when `status` is left out. */
/** 已经裁决过的记录 —— 不带 `status` 时端点就会把它们答回来。 */
const decided = ref<ConfirmationItem[]>([])
const pendingLoading = ref(false)
const deciding = ref<string | null>(null)

const effects = ref<EffectRow[]>([])
/** 名录给发起人配好的名字，按 id 索引；取不到时列回落成 id 本身。 */
/** Names the directory holds for the callers, keyed by id; the column falls back to the id. */
const names = ref<Record<string, string>>({})
/**
 * 宿主给这一行**落在哪条记录**配好的名字（已掩码），按 `类型#主键` 索引。口径与写入台账页同一份：
 * 运行时的 `targetTitle` 对客户这类记录是 **null**（2026-11-04 真栈实测）。
 *
 * The host's name (masked) for **the record this row landed on**, keyed by `type#key`; the same rule as
 * the write ledger's page. The runtime's `targetTitle` is **null** for a customer row (measured on a real
 * stack, 2026-11-04), so the cell used to carry a dash and a key and nothing else.
 */
const targetNames = ref<Record<string, string>>({})
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const effectsLoading = ref(false)
const effectsError = ref('')

const bizRows = ref<Record<number, BusinessLogRow[]>>({})
const bizLoaded = ref<Record<number, boolean>>({})
const bizLoading = ref<Record<number, boolean>>({})
const bizError = ref<Record<number, string>>({})

function formatArgs(args: Record<string, unknown> | null): string {
  if (!args || Object.keys(args).length === 0) return '—'
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return '—'
  }
}

/**
 * Why this row needs a person. Built from what the row already carries (`mode` + `riskLevel`) —
 * no new field, and no guess about a check list the runtime does not store on the row.
 *
 * 这一行为什么需要一个人。由行上已有的 `mode` + `riskLevel` 拼出 —— 不加字段，也不去猜运行时
 * 并没有存在行上的那份检查清单。
 */
function reasonText(c: ConfirmationItem): string {
  if (c.mode === 'approval') return t('keelbase.actionCenter.reasonApproval')
  if (c.mode === 'run') return t('keelbase.actionCenter.reasonRun')
  return t('keelbase.actionCenter.reasonImmediate')
}

/** Which step the row stopped at, and who it is waiting for. */
/** 这一行停在哪一步、在等谁。 */
function stepLine(c: ConfirmationItem): string {
  const who = c.mode === 'immediate'
    ? t('keelbase.actionCenter.stepWaitingYou')
    : t('keelbase.actionCenter.stepWaitingOther')
  return `${t('keelbase.actionCenter.stepConfirm')} · ${t('keelbase.actionCenter.stepHere')} · ${who}`
}

/** The word for a decided row: the decision axis first, then whether the approved write ran. */
/** 一条已裁决记录的词：先看决策轴，再看批准的那次写到底跑没跑成。 */
function historyOutcome(h: ConfirmationItem): string {
  if (h.status === 'declined') return t('keelbase.actionCenter.outcomeDeclined')
  if (h.status === 'timeout') return t('keelbase.actionCenter.outcomeTimeout')
  if (h.status === 'approved') {
    if (h.executionState === 'failed') return t('keelbase.actionCenter.outcomeFailed')
    if (h.executionState === 'succeeded') return t('keelbase.actionCenter.outcomeExecuted')
    return t('keelbase.actionCenter.outcomeApproved')
  }
  return h.status
}

function historyTagType(h: ConfirmationItem): 'success' | 'warning' | 'info' | 'danger' {
  if (h.status !== 'approved') return 'info'
  if (h.executionState === 'failed') return 'danger'
  if (h.executionState === 'succeeded') return 'success'
  return 'warning'
}

/** Where the row got to: the decision gate closed, or the write reached execution and how that went. */
/** 这一行走到了哪：裁决门关上了，或者这次写到了执行、结果如何。 */
function historyStep(h: ConfirmationItem): string {
  if (h.status !== 'approved') return t('keelbase.actionCenter.stepConfirm')
  if (h.executionState === 'succeeded') return t('keelbase.actionCenter.stepLedger')
  if (h.executionState === 'failed') {
    return `${t('keelbase.actionCenter.stepExecute')} · ${t('keelbase.actionCenter.stepFailed')}`
  }
  if (h.executionState === 'running') {
    return `${t('keelbase.actionCenter.stepExecute')} · ${t('keelbase.actionCenter.stepRunning')}`
  }
  return t('keelbase.actionCenter.stepExecute')
}

/** Why an approved write did not run — the runtime's own message, or the honest "no reason recorded". */
/** 批准的那次写为什么没跑成 —— 运行时自己的那句话，或诚实的「没有记下原因」。 */
function historyReason(h: ConfirmationItem): string {
  if (h.executionState !== 'failed') return ''
  return h.executionError || t('keelbase.actionCenter.unknownReason')
}

function statusLabel(status: string): string {
  if (status === 'revoked') return t('keelbase.effects.statusRevoked')
  return t('keelbase.effects.statusExecuted')
}

function statusTag(status: string): 'success' | 'info' {
  return status === 'revoked' ? 'info' : 'success'
}

async function loadPending() {
  pendingLoading.value = true
  // One call asks only for what is waiting; the other leaves `status` out, which is how the same
  // endpoint answers the caller's decided rows. The two are **settled independently**: a history read
  // that fails (403, a broken envelope) must not empty the card that is waiting on the person — that
  // card is the one they came to act on.
  //
  // 一次只问在等的那些；另一次不带 `status`，同一端点就会把调用方**已裁决**的行答回来。两次**各自结算**：
  // 「历史」那一半失败（403、坏信封）不得把「等这个人处理」的那张卡清空 —— 那张卡正是他来这里要做的事。
  const [waiting, all] = await Promise.allSettled([confirmationApi.mine('pending'), confirmationApi.mine()])
  if (waiting.status === 'fulfilled') {
    pending.value = waiting.value
  } else {
    pending.value = []
    ElMessage.error(runtimeErrorMessage(waiting.reason, t('keelbase.common.loadFailed')))
  }
  if (all.status === 'fulfilled') {
    decided.value = all.value.filter((r) => r.status !== 'pending')
  } else {
    decided.value = []
    // Say it once: if the pending half already reported, a second toast would describe the same outage.
    // 只说一次：待决那一半已经报过时，再来一条只是在描述同一次故障。
    if (waiting.status === 'fulfilled') {
      ElMessage.warning(runtimeErrorMessage(all.reason, t('keelbase.common.loadFailed')))
    }
  }
  pendingLoading.value = false
}

async function loadEffects() {
  effectsLoading.value = true
  effectsError.value = ''
  try {
    const res = await effectApi.list(page.value, limit.value)
    effects.value = res.items
    total.value = res.total
    names.value = { ...names.value, ...(await resolveCallerNames(res.items.map((r) => r.userId))) }
    targetNames.value = {
      ...targetNames.value,
      ...Object.fromEntries(await resolveRecordNames(res.items.map((r) => ({ type: r.resultType, id: r.resultId })))),
    }
  } catch (e) {
    effects.value = []
    total.value = 0
    effectsError.value = runtimeErrorMessage(e, t('keelbase.common.loadFailed'))
  } finally {
    effectsLoading.value = false
  }
}

/**
 * Load the host's business-log row(s) for a row whose module this page can name. Fetched when the row
 * is expanded, not with the ledger: the call is the host's admin API and most rows are never opened.
 *
 * 为这一页认得出模块的那些行，取宿主那一侧的业务日志行。**展开时才取**、不随台账取：这个调用打的是宿主的
 * admin API，而多数行根本不会被打开。
 */
async function onExpand(row: EffectRow, expandedRows: EffectRow[]) {
  const isOpen = expandedRows.some((r) => r.id === row.id)
  if (!isOpen || bizLoaded.value[row.id] || bizLoading.value[row.id]) return
  const businessType = businessLogApi.mappedType(row.resultType)
  if (!businessType || row.resultId === null || row.resultId === undefined) return
  bizLoading.value = { ...bizLoading.value, [row.id]: true }
  try {
    const res = await businessLogApi.byObject(businessType, row.resultId)
    bizRows.value = { ...bizRows.value, [row.id]: res.list ?? [] }
  } catch (e) {
    bizError.value = { ...bizError.value, [row.id]: runtimeErrorMessage(e, t('keelbase.common.loadFailed')) }
  } finally {
    bizLoaded.value = { ...bizLoaded.value, [row.id]: true }
    bizLoading.value = { ...bizLoading.value, [row.id]: false }
  }
}

async function decide(item: ConfirmationItem, decision: 'approve' | 'decline') {
  deciding.value = item.token
  try {
    const res = await confirmationApi.decide(item.token, decision)
    // `ok=false` means nothing moved (already decided, past the window, not this caller's row).
    // Saying "approved" here would describe a decision the server did not take.
    //
    // `ok=false` 指这一行什么都没改（已被裁决、过了窗口、不是这个调用方的行）。在这里说「已批准」，
    // 等于描述一次服务端并没有作出的裁决。
    if (res?.ok === false) {
      ElMessage.error(res.message || t('keelbase.actionCenter.decideFailed'))
      await loadPending()
      return
    }
    if (decision === 'decline') {
      ElMessage.success(t('keelbase.actionCenter.declined'))
    } else if (res?.success === true) {
      ElMessage.success(t('keelbase.actionCenter.executedOk'))
    } else if (res?.success === false) {
      // Approved, but the write did not run. The reason is the runtime's own message; when it
      // recorded none (a crash or a hang), say exactly that instead of inventing one.
      //
      // 已批准，但写没跑成。原因是运行时自己的那句话；它没记下原因时（崩溃或挂起），就照实这么说。
      ElMessage.warning(
        res.message
          ? t('keelbase.actionCenter.approvedNotRun', { reason: res.message })
          : t('keelbase.actionCenter.approvedNotRunUnknown'),
      )
    } else {
      // No answer about execution (an older runtime, or an empty body). Say exactly that rather
      // than announcing "approved" — the write below is the part we do not know.
      // 对执行结果没有答复（旧运行时，或空正文）。就照实这么说，而不是宣布「已批准」—— 下面那件事
      // 正是我们不知道的。
      ElMessage.warning(t('keelbase.actionCenter.approvedNoResult'))
    }
    // An approval runs the write, so the ledger is refreshed alongside the pending list.
    // 批准会**真的执行**那笔写，故台账与待决列表一起刷新。
    await Promise.all([loadPending(), loadEffects()])
  } catch (e) {
    ElMessage.error(runtimeErrorMessage(e, t('keelbase.actionCenter.decideFailed')))
    await loadPending()
  } finally {
    deciding.value = null
  }
}

function confirmRevoke(row: EffectRow) {
  ElMessageBox.confirm(
    t('keelbase.effects.revokeConfirm', { title: row.targetTitle || `#${row.resultId}` }),
    t('keelbase.effects.revoke'),
    { type: 'warning' },
  )
    .then(async () => {
      try {
        await effectApi.revoke(row.id)
        ElMessage.success(t('keelbase.effects.revoked'))
        await loadEffects()
      } catch (e) {
        ElMessage.error(runtimeErrorMessage(e, t('keelbase.effects.revokeFailed')))
      }
    })
    .catch(() => undefined)
}

onMounted(() => {
  void loadPending()
  void loadEffects()
})
</script>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.row:last-child {
  border-bottom: none;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}
.row-reason {
  margin-top: 6px;
  font-size: 13px;
}
.row-step {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.row-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
}
.args-label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.row-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 8px 8px 40px;
}
.d-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}
.d-key {
  min-width: 72px;
  color: var(--el-text-color-secondary);
}
.args {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow: auto;
}
.biz {
  padding: 8px 12px;
}
.biz-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.biz-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
