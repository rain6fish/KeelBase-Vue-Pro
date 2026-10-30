<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  The audit trail, read the way an auditor reads it: who did what, when, and what came of it.

  The rows are the page. Each one is shown as a sentence a person can read — the caller's name (resolved
  from the host's own directory, because the runtime answers an id and nothing more about the person),
  the time, the action in plain words, and the result — and any row can be opened to lay the whole row
  out at once. Two things the earlier version did are undone here. The two result columns (`outcome` and
  `isError`) became one, because for a tool call they said the same thing twice and for a non-tool row
  only one of them was ever filled; and the hash chain, which is *evidence that the trail is intact* and
  not the trail itself, moved below the rows and folds shut.

  The chain still verifies on this page and its verdict still shows in the rows' header, because a broken
  chain is the one thing that outranks everything else here.

  审计轨，按**审计人员读它的方式**读：**谁**做了什么、**什么时候**、**结果**如何。

  那些**行**才是这一页。每一行都写成一句能读的话——调用方的**姓名**（从**宿主自己的名录**解析出来，
  因为运行时对这个人只答一个 id、别无其他）、时间、用人话写的动作、以及结果——而任何一行都能摊开、把
  整行一次看全。此前做过的两件事在这里被撤销：**结果的两列**（`outcome` 与 `isError`）合成一列，因为
  对一次工具调用它们把同一件事说了两遍，而对非工具行只有其中一列有值；以及**哈希链**——它是「这条轨**完整**」
  的**证据**、不是轨本身——挪到行下面、并折起来。

  链仍在本页校验，它的结论仍显示在行的表头，因为**一条断了的链**是这里唯一凌驾于其余一切之上的东西。
-->
<template>
  <ContentWrap :title="t('keelbase.audit.rowsTitle')">
    <template #header>
      <!-- The chain's verdict leads, because a break outranks anything the rows can say. -->
      <!-- 链的结论打头，因为一次断裂压倒这些行能说的一切。 -->
      <el-tag v-if="verify" :type="verify.valid ? 'success' : 'danger'" size="small">
        {{ verify.valid ? t('keelbase.audit.chainValid') : t('keelbase.audit.chainBroken', { at: verify.brokenIndex ?? '-' }) }}
      </el-tag>
      <el-button class="ml-auto" size="small" :loading="rowsLoading" @click="reload">
        {{ t('keelbase.common.refresh') }}
      </el-button>
    </template>

    <!-- F-17：读者问「哈希链校验是干什么的」。这句放在链结论与表格之间，说明它能证什么、不能证什么。 -->
    <div v-if="verify" class="mb-10px text-12px text-[var(--el-text-color-secondary)]">
      {{ t('keelbase.audit.chainWhat') }}
    </div>

    <el-form :inline="true" :model="query" class="-mb-15px" @submit.prevent>
      <el-form-item :label="t('keelbase.audit.userId')">
        <el-input v-model="query.userId" clearable :placeholder="t('keelbase.audit.userIdPlaceholder')" class="!w-200px" @keyup.enter="reload" />
      </el-form-item>
      <el-form-item :label="t('keelbase.audit.since')">
        <el-date-picker
          v-model="since"
          type="datetime"
          :placeholder="t('keelbase.audit.sincePlaceholder')"
          class="!w-220px"
        />
      </el-form-item>
      <el-form-item :label="t('keelbase.audit.isError')">
        <el-select v-model="query.isError" clearable class="!w-140px">
          <el-option :label="t('keelbase.audit.statusError')" value="true" />
          <el-option :label="t('keelbase.audit.statusOk')" value="false" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="reload">{{ t('keelbase.common.filter') }}</el-button>
      </el-form-item>
    </el-form>

    <!-- 覆盖声明（`D57`）：这一页读到哪、到不了哪些路径 —— 只写事实。 -->
    <!-- Coverage statement (`D57`): what this page reads, and which paths it cannot reach. -->
    <div class="mb-10px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.coverage.auditChain') }}</div>

    <!--
      `AW-3` 的**动态**那一半：缺口登记表自己说话。这张卡上每一行都来自运行时（`GET /audit/coverage`），
      故往登记表里加一条、这里就自动多一行 —— 前端没有会漂开的清单。**取不到就出声**：一句取不到的告诫
      会被读成「这里没有问题」，而那正是这个特性要防的事。

      `AW-3`'s **dynamic** half: the gap registry speaks for itself. Every line here comes from the
      runtime (`GET /audit/coverage`), so a new registry entry shows up with no frontend change —
      there is no list here to drift. **A failed read is loud**: a missing caveat reads as "nothing
      is wrong", which is the one thing this feature exists to prevent.
    -->
    <el-alert
      v-if="coverage"
      :type="coverage.verdict === 'complete' ? 'success' : coverage.verdict === 'partial' ? 'warning' : 'info'"
      :closable="false"
      show-icon
      class="mb-10px"
    >
      <template #title>
        {{ t('keelbase.coverage.cardTitle') }} · {{ t(`keelbase.coverage.verdict_${coverage.verdict}`) }}
      </template>
      <div class="coverage-line">{{ t('keelbase.coverage.sources') }}：{{ coverageSourceText }}</div>
      <div v-if="coverage.gaps.length" class="coverage-gaps">
        <div v-for="gap in coverage.gaps" :key="gap.id" class="coverage-row">
          <el-tag :type="gapTagType(gap.severity)" size="small">{{ severityText(gap.severity) }}</el-tag>
          <span>{{ gapText(gap) }}</span>
          <code class="coverage-gap-id">{{ gap.id }}</code>
        </div>
      </div>
      <div v-else class="coverage-line">{{ t('keelbase.coverage.noGaps') }}</div>
      <div class="coverage-line">{{ t('keelbase.coverage.registry', { rev: coverage.registryRevision }) }}</div>
      <!-- F-7：`未知` 原来只有一个词，读者读不出它相对什么而言。这里补一句参照系。 -->
      <div v-if="coverage.verdict === 'unknown'" class="coverage-line coverage-unknown-note">
        {{ t('keelbase.coverage.verdictUnknownNote') }}
      </div>
    </el-alert>
    <el-alert
      v-else-if="coverageLoaded"
      type="warning"
      :closable="false"
      show-icon
      class="mb-10px"
      :title="t('keelbase.coverage.unavailable')"
    />

    <div v-if="rowsError" class="text-[var(--el-color-danger)] mb-10px">{{ rowsError }}</div>
    <!-- A description of this page, said as such — the window is all the face gives. -->
    <!-- **本页**的描述，并如实这么说 —— 这条面给的就是一个窗口。 -->
    <div v-if="rows.length && !rowsError" class="overview">{{ overview }}</div>
    <el-table v-loading="rowsLoading" :data="rows" stripe @expand-change="(row: AuditRow) => void onExpand(row)">
      <!-- Opening a row lays out the whole of it in one place: the sentence the list compresses. -->
      <!-- 摊开一行，就是把列表压住的那句话一次摆全。 -->
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="row-detail">
            <!--
              `YD-42`：一次操作要按**业务词**答得出六问。这六行就是那六问，顺序固定；一格里答不出来时
              它说「未记录」，而**不是**留空 —— 空格会被读成「没有这件事」。
              `YD-42`: one operation has to answer six questions in **business words**. These six lines
              are those questions in a fixed order; a cell that cannot be answered says so instead of
              going blank, because a blank reads as "nothing happened".
            -->
            <div class="six-title">{{ t('keelbase.sixQ.title') }}</div>
            <div v-for="a in sixOf(row)" :key="a.key" class="d-row six-row">
              <span class="d-key">{{ t(`keelbase.sixQ.${a.label}`) }}</span>
              <span :class="{ 'six-missing': !a.answered }">{{ a.text }}</span>
            </div>
            <!-- F-18：运行时一直把「凭什么放行 / 凭什么拒绝」记在这一行上；页面此前没有画。 -->
            <!-- F-18: the runtime has always recorded why this row was allowed or refused; the page never drew it. -->
            <div v-if="checksOf(row).length" class="d-row">
              <span class="d-key">{{ t('keelbase.audit.colChecks') }}</span>
              <span>
                <div class="muted">{{ t('keelbase.audit.checksNote') }}</div>
                <div v-for="c in checksOf(row)" :key="c.name" class="check-row">
                  <el-tag :type="c.ok ? 'success' : 'danger'" size="small">
                    {{ c.ok ? t('keelbase.audit.checkPassed') : t('keelbase.audit.checkFailed') }}
                  </el-tag>
                  <span>{{ checkText(c.name) }}</span>
                  <span v-if="c.note" class="muted">{{ c.note }}</span>
                </div>
              </span>
            </div>
            <!-- The one thing kept in raw form: which row this is. An id is how an auditor points at it. -->
            <!-- 唯一按原样留着的一件东西：这是哪一行。id 正是审计人员指着它说话的方式。 -->
            <div class="d-row">
              <span class="d-key">{{ t('keelbase.audit.colId') }}</span>
              <span>#{{ row.id }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.audit.colTime')" width="200">
        <!-- 带时区：不带时区的时间戳回答不了「何时」。 -->
        <!-- With the zone: a timestamp without one cannot answer "when". -->
        <template #default="{ row }">{{ zonedTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('keelbase.audit.colWho')" width="170">
        <template #default="{ row }">
          <div>{{ callerName(row.userId) }}</div>
          <!-- 没有 id 的行**不画那一行**：`#—` 读起来像一个坏掉的 id，而不是「这次没人可挂」。 -->
          <div v-if="row.userId" class="muted">#{{ row.userId }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.audit.colWhat')" min-width="180">
        <!-- 业务词那一行；工具**注册名**不在这里，它不在读者这一面。 -->
        <!-- The business word; the tool's registered name is not here — it is not on the reader's face. -->
        <template #default="{ row }">
          <div>{{ whatText(row) }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.audit.colObject')" min-width="200">
        <!-- ③ 哪个业务对象：业务名 + 业务主键（表名、裸 id 都不算）。 -->
        <!-- ③ which business object: business name plus business key. -->
        <template #default="{ row }">{{ objectOf(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('keelbase.audit.colResult')" width="150">
        <template #default="{ row }">
          <el-tag :type="outcomeTagType(row.outcome, row.isError)" size="small">{{ resultText(row) }}</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!--
      `/audit/logs` answers a bare list: it takes a window and returns what is in it, with no total
      to page against. So this is a walk forward and back over that window, and it says where it is
      rather than pretending to know how much is left.

      `/audit/logs` 回的是一个裸列表：它收一个窗口、把窗口里的东西给回来，**没有总数**可供分页。故
      这里是沿那个窗口前后走一步，并且**如实说出自己在哪**，而不是假装知道还剩多少。
    -->
    <div class="pager">
      <el-button size="small" :disabled="offset === 0 || rowsLoading" @click="step(-1)">
        {{ t('keelbase.audit.prev') }}
      </el-button>
      <span class="pager-pos">{{ t('keelbase.audit.window', { from: rows.length ? offset + 1 : 0, n: rows.length }) }}</span>
      <el-button size="small" :disabled="!hasMore || rowsLoading" @click="step(1)">
        {{ t('keelbase.audit.next') }}
      </el-button>
    </div>
  </ContentWrap>

  <!--
    The walk over the chain — evidence, folded shut by default so it does not read as the headline.
    It is drawn below the rows on purpose: the rows are what an auditor came for, and the chain is
    what lets them trust them.

    走一遍链——**证据**，默认折起来，免得被读成标题。它刻意画在行**下面**：行是审计人员来读的东西，
    而链是让他们**信**那些行的东西。
  -->
  <ContentWrap :title="t('keelbase.audit.chainTitle')">
    <template #header>
      <span v-if="verify" class="text-13px text-[var(--el-text-color-secondary)]">
        {{ t('keelbase.audit.chainChecked', { n: verify.checked }) }}
      </span>
      <el-button class="ml-auto" size="small" :loading="verifyLoading" @click="loadVerify">
        {{ t('keelbase.common.refresh') }}
      </el-button>
    </template>

    <div v-if="verifyError" class="text-[var(--el-color-danger)]">{{ verifyError }}</div>
    <div v-else-if="!verify" class="text-[var(--el-text-color-secondary)]">{{ t('keelbase.common.loading') }}</div>
    <el-empty v-else-if="verify.chain.length === 0" :description="t('keelbase.audit.chainEmpty')" />
    <el-collapse v-else>
      <el-collapse-item name="chain">
        <template #title>
          <span class="text-13px">
            {{ verify.valid ? t('keelbase.audit.chainValid') : t('keelbase.audit.chainBroken', { at: verify.brokenIndex ?? '-' }) }}
          </span>
        </template>
        <div class="chain">
          <div v-for="n in verify.chain" :key="n.id" class="chain-node" :class="{ broken: n.broken }">
            <span class="chain-id">#{{ n.id }}</span>
            <span class="chain-time">{{ timeText(n.createdAt) }}</span>
            <span class="chain-action">{{ actionText(n.action) }}</span>
            <code class="chain-hash">{{ short(n.prevHash) }} → {{ short(n.hash) }}</code>
            <el-tag v-if="n.broken" type="danger" size="small">{{ t('keelbase.audit.broken') }}</el-tag>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </ContentWrap>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ContentWrap } from '@/components/ContentWrap'
import {
  auditApi,
  confirmationApi,
  coverageApi,
  effectApi,
  toolApi,
  type AuditRow,
  type AuthorizationBasis,
  type ChainVerification,
  type ConfirmationItem,
  type CoverageStatement,
  type EffectRow,
  type ToolInventoryItem,
} from '@/keelbase/governanceApi'
import { runtimeErrorMessage } from '@/keelbase/runtime'
import {
  actionLabelKey,
  executedMeaningKey,
  outcomeLabelKey,
  outcomeMeaningKey,
  outcomeTagType,
  toolEffect,
  toolLabelKey,
} from '@/keelbase/labels'
import { resolveCallerNames } from '@/keelbase/callerNames'
import { maskTitle } from '@/keelbase/mask'
import { resolveRecordName, toolResultType } from '@/keelbase/recordNames'
import { composeSix, objectLine, zonedTime } from '@/keelbase/sixQuestions.mjs'
import { timeText } from '@/keelbase/time'

defineOptions({ name: 'KeelbaseGovernanceAuditChain' })

const { t, te } = useI18n()

/**
 * F-5：缺口陈述按 `gap.id` 取词条。登记表新增一条时词条还不存在，此时回落到运行时原文 ——
 * 「新条目不用改前端就出现」这条性质不变，已知的才按读者语言说。
 *
 * Known ids render from the console's own messages; an id the console does not know yet falls back to
 * the record's own statement, so a new registry entry still shows up without a frontend change.
 */
function gapText(gap: { id: string; statement: string }): string {
  const key = `keelbase.coverage.gap.${gap.id}`
  return te(key) ? t(key) : gap.statement
}

const LIMIT = 20

/** The order a summary reads outcomes in: what happened first, what is waiting last. */
/** 概览里结局的次序：先「已经发生的」，把「在等的」放在后面。 */
const OVERVIEW_ORDER = [
  'executed', 'approved', 'pending', 'attempted', 'blocked', 'refused', 'declined', 'failed', 'timeout', 'revoked',
]

const verify = ref<ChainVerification | null>(null)
const verifyLoading = ref(false)
const verifyError = ref('')

const rows = ref<AuditRow[]>([])
const rowsLoading = ref(false)
const rowsError = ref('')

/**
 * 缺口登记表读回来的那份声明（`AW-3`）。`coverageLoaded` 单拎出来，是为了让「取不到」**不静默**：
 * 一句取不到的告诫，读者会把这一页读成完整 —— 那正是这个特性要防的事。
 *
 * The gap registry's statement, read back (`AW-3`). `coverageLoaded` is separate so a failed read is
 * **not silent**: a missing caveat reads as completeness, which is the one thing this feature exists
 * to prevent.
 */
const coverage = ref<CoverageStatement | null>(null)
const coverageLoaded = ref(false)
const offset = ref(0)
const hasMore = ref(false)
const since = ref<Date | null>(null)

/** Caller names for the ids on screen, filled in after the rows land. */
/** 屏幕上那些 id 的调用方姓名，在行落地之后补上。 */
const names = ref<Record<string, string>>({})

/**
 * What each tool is, by the name it registers — read once from the inventory the runtime serves. A
 * business reader needs this: the row's action says 「工具调用」 and its tool says `create_crm_customer`,
 * and neither tells them it created a customer.
 *
 * 每个工具是什么，按它注册的名字 —— 从运行时那条清单读一次。业务读者**需要**它：行为那列写着「工具调用」、
 * 工具那列写着 `create_crm_customer`，两者都没告诉他：它新建了一个客户。
 */
const inventory = ref<Record<string, ToolInventoryItem>>({})

/**
 * The ledger of what the AI wrote, fetched beside the audit rows. It is what makes 「点开能看到新建了哪个
 * 客户」 answerable at all: the audit row names the tool, and only the ledger knows the record.
 *
 * 副作用台账 —— 与审计行一起取回来。它正是「点开能看到新建了哪个客户」答得上来的原因：审计行只说出工具，
 * **只有台账知道那条记录**。
 */
const effects = ref<EffectRow[]>([])

/**
 * 确认队列里的一窗，只读 —— 被**扣下**或被**拒**的调用不写台账，但运行时把那次提议记在确认记录里
 * （工具名 + 它当时要用的参数）。没有这一窗，第三问（哪个业务对象）在**恰恰最该追问**的那次调用上
 * 只能答「未记录」，尽管库里记着 `{"id":9004,…}`。
 *
 * 一句边界，与台账同一条：两条轨之间没有共同的键，故只在「同一工具、五秒之内、恰好一个候选」时才配上；
 * 配不上就不画，不猜。取的是**最新**一窗（该面按最新在前排，故直接取第 1 页即是新的那一窗）。
 *
 * One window of the confirmation queue, read-only — a **held** or **refused** call writes no ledger row,
 * but the runtime records that proposal in a confirmation record (the tool plus the arguments it would
 * have run with). Without this window the third question can only say 「未记录」 on exactly the call a
 * reader most wants to ask about, while the record sits in the database as `{"id":9004,…}`.
 *
 * The same boundary as the ledger: the two trails share no key, so a pair is drawn only when it is the
 * same tool, within five seconds, and **exactly one** candidate; otherwise nothing is drawn rather than a
 * guess. The **newest** window is read — that face orders newest first, so page 1 is that window.
 */
const proposals = ref<ConfirmationItem[]>([])

/**
 * What each matched record is called, asked of this host on the row that needs it. Resolved when a row
 * is opened rather than for the whole page: one request per row a reader actually looks at, and the
 * host is asked only about records the ledger already named.
 *
 * 对上的每条记录叫什么 —— 在**需要它的那一行**上问宿主。**摊开时**才解析、不是整页都解析：读者真去看的
 * 那一行才发一次请求，而宿主只会被问到台账**已经点过名**的那些记录。
 */
const recordNames = ref<Record<string, string>>({})

/** Ask the host about a reference once; cached by type and key so re-opening a row costs nothing. */
/** 问宿主一次某个引用；按类型与主键缓存，再摊开同一行不再发请求。 */
async function askRecordName(resultType: string | null | undefined, resultId: string | number | null | undefined) {
  if (resultId === null || resultId === undefined) return
  const key = `${resultType ?? ''}#${resultId}`
  if (recordNames.value[key] !== undefined) return
  const name = await resolveRecordName(resultType, resultId)
  recordNames.value = { ...recordNames.value, [key]: name }
}

/**
 * Ask the host about the row's record once, when the row is opened — **whichever road the row took**: a
 * write that landed somewhere has a ledger row, and a held or refused call has only its proposal. Both
 * carry a type and a key; the name comes from the same narrow read face either way.
 *
 * 行被摊开时，问宿主一次那条记录 —— **这一行走的哪条路都算**：真写成了的有台账行，被扣下或被拒的只有提议。
 * 两条路都带着类型与主键，名字来自同一条窄读面。
 */
async function onExpand(row: AuditRow) {
  const e = recordOf(row)
  if (e) {
    await askRecordName(e.resultType, e.resultId)
    return
  }
  const proposal = proposalArgumentOf(row)
  if (proposal) await askRecordName(proposal.resultType, proposal.resultId)
}

/** How many ledger rows to look through when matching. Bounded on purpose, and said on the page. */
/** 配对时翻多少条台账行。**刻意有界**，并在页面上说出来。 */
const EFFECT_WINDOW = 50

/** 给被扣下/被拒的调用配对时翻多少条确认记录。同一个上界。 */
/** How many confirmation records to look through when matching a held or refused call. Same bound. */
const PROPOSAL_WINDOW = 50

const query = reactive<{ userId: string; isError: string }>({ userId: '', isError: '' })

function callerName(id: string | null | undefined): string {
  if (!id) return '—'
  return names.value[String(id)] ?? String(id)
}

/**
 * The row's authorization basis, in whichever shape it arrives: this host sends the stored canonical
 * JSON as a string, and the type also allows an already-parsed object. A string that does not parse
 * is treated as no basis rather than as an empty one — the row still renders, and nothing is invented
 * for it.
 *
 * 这一行的授权依据，到的是哪种形状都接住：本宿主把存下的规范 JSON 当字符串发，类型也允许已解析的对象。
 * 解析不了的字符串当作**没有依据**、而不是空依据 —— 行照常渲染，也不替它编一个。
 */
function basisOf(row: AuditRow): AuthorizationBasis | null {
  const raw = row.authorization
  if (!raw) return null
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as AuthorizationBasis
  } catch {
    return null
  }
}

/** The checks this row's gate recorded — empty when it recorded no basis. */
/** 这一行的闸门记下的检查 —— 没有记下依据时为空。 */
function checksOf(row: AuditRow) {
  return basisOf(row)?.checks ?? []
}

/**
 * A check's name in the reader's language. An unknown name falls back to the runtime's own word, so a
 * vocabulary that widens does not need a frontend change to stay readable.
 *
 * 一道检查的名字，用读者的语言。不认识的名称回落到运行时自己的词，故词表放宽时前端不必跟着改。
 */
function checkText(name: string): string {
  const key = `keelbase.audit.check.${name}`
  return te(key) ? t(key) : name
}

function actionText(action: string | null | undefined): string {
  const key = actionLabelKey(action)
  return key ? t(key) : (action || '—')
}

/** One word for what came of the row: the outcome's word, or the plain status when there is none. */
/** 给这一行的**结局**一个词：outcome 的词；没有时就给朴素的状态词。 */
function resultText(row: AuditRow): string {
  const key = outcomeLabelKey(row.outcome)
  if (key) return t(key)
  return row.isError ? t('keelbase.audit.statusError') : t('keelbase.audit.statusOk')
}

/** The row's outcome as a vocabulary word, falling back to the plain status for a non-tool row. */
/** 这一行的**结局**，按词表取值；非工具行回落到朴素的状态词。 */
function effectiveOutcome(row: AuditRow): string {
  if (outcomeLabelKey(row.outcome)) return row.outcome as string
  return row.isError ? 'failed' : 'executed'
}

/**
 * 工具名，用读者的语言。**不认识的工具不印注册名** —— 注册名是一台机器里的标识符（`create_crm_customer`），
 * 而这一面只认业务词，所以它说「一个本控制台没有名字的工具」。原样印注册名，正是 `YD-42` 的反向可证要抓的
 * 那一种泄漏，而「编一个业务名」比泄漏更糟。
 *
 * The tool in the reader's language. An unknown tool's **registered name is not printed** — a registered
 * name is an identifier inside one machine (`create_crm_customer`), and this face reads in business words
 * only, so it says it has no name for it. Printing the registered name is exactly the leak `YD-42`'s
 * reverse proof catches, and inventing a business word would be worse.
 */
function toolText(name: string | null | undefined): string {
  if (!name) return '—'
  const key = toolLabelKey(name)
  return key ? t(key) : t('keelbase.audit.toolUnnamed')
}

/** What this row did, in the reader's language: the tool if there is one, else the action. */
/** 这一行**做了什么**，用读者的语言：有工具就用工具，没有就用动作。 */
function whatText(row: AuditRow): string {
  return row.tool ? toolText(row.tool) : actionText(row.action)
}

/**
 * 第五问（谁确认）的依据在**每一行自己记下的 `authorization`** 里，由 `gateFromRow` 读 —— 不在这页里
 * 写死，也不问工具清单：清单答的是**此刻**的闸，而一行审计说的是**当时**那一次。
 *
 * The fifth question's basis is the `authorization` **each row recorded**, read by `gateFromRow` — not
 * typed into this page, and not asked of the tool inventory: the inventory answers the gate **now**,
 * while an audit row is about **that one time**.
 */

/**
 * The write record this row landed on, when **exactly one** candidate matches. The two trails carry no
 * shared key — the audit says what a call came to, the ledger says what it wrote — so the only honest
 * match is tool plus a close timestamp, and only when that leaves one candidate. A guess here would put
 * one record beside another person's action, which is worse than showing nothing at all.
 *
 * 这一行落在哪条写入记录上 —— **恰好只有一个**候选项时。两条轨之间没有共同的键（审计说「一次调用怎么了」、
 * 台账说「它写了什么」），故唯一诚实的对法是**工具 ＋ 相近的时刻**，且只在它**只剩一个**候选时成立。
 * 在这里猜，会把**一条记录摆到另一个人的动作旁边** —— 那比什么都不显示更糟。
 */
function recordOf(row: AuditRow): EffectRow | null {
  if (!row.tool) return null
  const at = Date.parse(row.createdAt)
  const near = effects.value.filter(
    (e) => e.toolName === row.tool && Math.abs(Date.parse(e.createdAt) - at) <= 5000,
  )
  return near.length === 1 ? near[0] : null
}

/**
 * 这次调用**本来**落在哪条记录上，当它被扣下或被拒时 —— 与 `recordOf` 同一条规则（同一工具、五秒之内、
 * 恰好一个候选），只是读的是确认记录：台账只记「真的写成了什么」，确认记录记「提议了什么」。
 *
 * 时间对哪一端都算：扣下那一刻写的审计行离确认记录的 `createdAt` 近，裁决那一刻写的离 `decidedAt` 近。
 *
 * Which record the call **was about** when it was held or refused — the same rule as `recordOf` (same
 * tool, within five seconds, exactly one candidate), read from the confirmation records: the ledger only
 * says what was really written, a confirmation says what was proposed.
 *
 * Either end of the clock counts: the audit row written when the call was held is near the record's
 * `createdAt`, and the one written when it was decided is near its `decidedAt`.
 */
function proposalOf(row: AuditRow): ConfirmationItem | null {
  if (!row.tool) return null
  const at = Date.parse(row.createdAt)
  const near = proposals.value.filter((c) => {
    if (c.toolName !== row.tool) return false
    if (Math.abs(Date.parse(c.createdAt) - at) <= 5000) return true
    return Boolean(c.decidedAt) && Math.abs(Date.parse(c.decidedAt as string) - at) <= 5000
  })
  return near.length === 1 ? near[0] : null
}

/**
 * 那次提议的对象，按第三问要的两样给出：记录**类型**（从工具自己的声明查，见 `recordNames`）与主键
 * （提议参数里的 `id`）。参数里没有 id 的提议（新建类，行当时还不存在）就说不出对象，回 `null`，这一格
 * 照旧说「未记录」—— 那才是当时的事实。
 *
 * The object of that proposal, in the two parts the third question asks for: the record **type** (looked
 * up from the tool's own declaration, see `recordNames`) and the key (the `id` among the proposed
 * arguments). A proposal whose arguments carry no id (a create — the row did not exist yet) has no object
 * to name, so it returns `null` and the cell keeps saying 「未记录」 — which is what was true then.
 */
function proposalArgumentOf(row: AuditRow): { resultType: string; resultId: number | string } | null {
  const proposal = proposalOf(row)
  const id = proposal?.arguments?.id
  if (!proposal || id === null || id === undefined) return null
  return { resultType: toolResultType(proposal.toolName), resultId: id as number | string }
}

/** Whether that record is still there — read off the ledger row, never re-derived. */
/** 那条记录**还在不在** —— 按台账行读，绝不自己重算。 */
function recordState(e: EffectRow): string {
  if (!e.targetExists) return t('keelbase.effects.stateGone')
  if (e.targetSoftDeleted) return t('keelbase.effects.stateDeleted')
  return t('keelbase.effects.statePresent')
}

/** The host's own answer for what that record is called, asked when the row was opened. Masked where drawn. */
/** 宿主自己答的「这条记录叫什么」，行被摊开时问的。画出来时掩码。 */
function hostNowNameOf(e: EffectRow | null): string {
  if (!e) return ''
  return recordNames.value[`${e.resultType ?? ''}#${e.resultId}`] || e.targetTitle || ''
}

/**
 * The same answer for a held or refused call's object — no ledger row, so nothing else could name it.
 *
 * 被扣下或被拒那次的对象，同样问宿主 —— 它没有台账行，别处没有名字可拿。
 */
function proposalNameOf(ref: { resultType: string; resultId: number | string } | null): string {
  if (!ref) return ''
  return recordNames.value[`${ref.resultType ?? ''}#${ref.resultId}`] || ''
}

/**
 * ③ 哪个业务对象，给表格那一列。**业务名 + 业务主键**：运行时的类型名（`crm_customer` 这类）不出现在
 * 读者这一面，控制台不认识的类型说「未登记」而不是把表名印出来。
 *
 * ③ which business object, for the table column: **business name plus business key**. The runtime's own
 * type name does not appear on the reader's face; a type this console does not know says so rather than
 * printing the table name.
 */
function objectOf(row: AuditRow): string {
  const e = recordOf(row)
  const proposal = e ? null : proposalArgumentOf(row)
  return objectLine({
    effect: e,
    proposal,
    hostNowName: hostNowNameOf(e),
    proposalName: proposalNameOf(proposal),
    mask: maskTitle,
    t,
    te,
  }).text
}

/**
 * 六问的**全部答案**，一行操作一份。`YD-42` 的判据就是这六格：答得出、且只用业务词。
 *
 * All six answers for one operation. `YD-42`'s criterion is exactly these six cells: answerable, and in
 * business words only.
 */
function sixOf(row: AuditRow) {
  const e = recordOf(row)
  const proposal = e ? null : proposalArgumentOf(row)
  return composeSix({
    row,
    callerName: row.userId ? callerName(row.userId) : '',
    effect: e,
    proposal,
    hostNowName: hostNowNameOf(e),
    proposalName: proposalNameOf(proposal),
    recordState: e ? recordState(e) : '',
    mask: maskTitle,
    resultWord: resultText(row),
    resultMeaning: meaningText(row),
    t,
    te,
  })
}

/**
 * 这个结局**意味着什么**，一句话 —— 一个词载不动的那部分。`executed` 按工具**自己声明的性质**分句
 * （见 `toolEffect`）：一次查询并没有把一次写放进系统，而说它放了，正是这一页最不该给审计人员的读法。
 *
 * What the outcome means, in one line — the part a single word cannot carry. `executed` is split by what
 * the tool itself declares (§ `toolEffect`): a query did not put a write into the system, and saying it
 * did is the one reading this page must not give an auditor.
 */
function meaningText(row: AuditRow): string {
  const outcome = effectiveOutcome(row)
  if (outcome === 'executed') {
    return t(executedMeaningKey(toolEffect(row.tool ? inventory.value[row.tool] : null)))
  }
  const key = outcomeMeaningKey(outcome)
  return key ? t(key) : ''
}

/**
 * A summary of **this page**, said as such. The window is all this face gives — there is no total
 * behind it to divide by — so it is drawn as a description of what is on screen rather than as a
 * statistic, which would be a claim the runtime cannot back.
 *
 * **本页**的概览，并**如实这么说**。这条面给的就是一个窗口 —— 它背后没有总数可供去除 —— 故这一段画的是
 * **屏幕上这些行**的描述，而不是一个统计量：后者是运行时**撑不住**的主张。
 */
const overview = computed(() => {
  const counts = new Map<string, number>()
  for (const row of rows.value) {
    const key = effectiveOutcome(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const parts = OVERVIEW_ORDER.filter((o) => counts.has(o)).map(
    (o) => `${t(`keelbase.vocab.outcome.${o}`)} ${counts.get(o)}`,
  )
  const tools = new Set(rows.value.map((r) => r.tool).filter(Boolean)).size
  const callers = new Set(rows.value.map((r) => r.userId).filter(Boolean)).size
  const head = t('keelbase.audit.overviewRows', { n: rows.value.length })
  const scope = t('keelbase.audit.overviewScope', { tools, callers })
  return `${head}${parts.length ? '：' + parts.join(' · ') : ''} ｜ ${scope}`
})

function short(v: string | null | undefined): string {
  return (v || '—').slice(0, 10)
}

/** 这份声明**真的问过**哪些源 —— 是「问过谁」，不是「系统里有什么」，故照运行时的答复画。 */
/** The sources this statement **actually consulted** — "what was asked", not "what exists". */
const coverageSourceText = computed(() =>
  (coverage.value?.sources ?? [])
    .map((s) => `${s.id}=${s.state}${s.rows === null || s.rows === undefined ? '' : `(${s.rows})`}`)
    .join(' · '),
)

/** 缺口的严重度用读者的语言；不在词表里的原样显示 —— 前端没跟上不能让一个等级变成空白。 */
/** Severity in the reader's language; one outside the vocabulary is shown as itself, never blanked. */
function severityText(severity: string): string {
  const key = `keelbase.coverage.severity_${severity}`
  return te(key) ? t(key) : severity
}

/** 缺口的严重度，用屏幕上读得懂的那种标签颜色。 */
/** A gap's severity, in the tag colour that reads as the same thing on screen. */
function gapTagType(severity: string): 'danger' | 'warning' | 'info' {
  if (severity === 'high') return 'danger'
  if (severity === 'medium') return 'warning'
  return 'info'
}

/**
 * 按与行**同一个时间窗**读登记表的声明。它刻意不放进 `loadRows`：这里失败不能连累那些行，也不能
 * **无声**过去 —— 卡片会变成一条明确的警告。
 *
 * Read the registry's statement over the same window the rows are read over. It is kept out of
 * `loadRows` on purpose: a failure here must not take the rows down with it, and it must not pass
 * silently either — the card turns into an explicit warning.
 */
async function loadCoverage() {
  try {
    coverage.value = await coverageApi.read({ since: since.value ? since.value.toISOString() : undefined })
  } catch {
    coverage.value = null
  } finally {
    coverageLoaded.value = true
  }
}

async function loadVerify() {
  verifyLoading.value = true
  verifyError.value = ''
  try {
    verify.value = await auditApi.verify()
  } catch (e) {
    verify.value = null
    verifyError.value = runtimeErrorMessage(e, t('keelbase.common.loadFailed'))
  } finally {
    verifyLoading.value = false
  }
}

async function loadRows() {
  rowsLoading.value = true
  rowsError.value = ''
  try {
    const data = await auditApi.logs({
      userId: query.userId || undefined,
      isError: query.isError || undefined,
      since: since.value ? since.value.toISOString() : undefined,
      limit: LIMIT,
      offset: offset.value,
    })
    rows.value = data
    // A full window means there may be more; a short one means this is the end of it.
    // 窗口满了就**可能**还有；不满就说明这里是它的尽头。
    hasMore.value = data.length === LIMIT
    // Names are an enrichment: the rows are already rendered, and an id stands in until the host's
    // directory answers. The lookup never rejects, so a failure here leaves the ids in place.
    // 姓名是**补上去的**：行已经渲染，在宿主的名录答复之前由 id 顶着。那次查询从不 reject，故它失败时
    // 留下的就是那些 id。
    const resolved = await resolveCallerNames(data.map((r) => r.userId))
    names.value = { ...names.value, ...resolved }
    // The inventory is read once and kept: it answers the same for every window, and it is what turns a
    // tool's registered name into something a business reader can act on.
    // 清单只读一次并留着：它对每个窗口都一样，而它正是把工具的注册名变成业务读者看得懂的东西的那一步。
    if (!Object.keys(inventory.value).length) {
      const tools = await toolApi.inventory()
      inventory.value = Object.fromEntries(tools.map((toolItem) => [toolItem.name, toolItem]))
    }
    // The ledger, for the drill-down only: it is the one face that knows which record a write landed
    // on. Bounded to one window of it, and the page says so where it uses it.
    //
    // ⚠ The window has to be the **newest** one. `/ai/tool-effects` orders oldest first, so asking for
    // page 1 under a bounded limit returned the *oldest* rows — every fresh write fell outside the
    // window and its drill-down said 「未记录」 while the ledger held the record. The total is read
    // first and the last page is asked for, so the window follows the money.
    //
    // 台账，只给下钻用：它是唯一知道「这次写落在哪条记录上」的那条面。只取一窗，且页面在用到它的地方
    // 把这一点说出来。
    //
    // ⚠ 这一窗必须是**最新**的那一窗。`/ai/tool-effects` 按最旧在前排，故在有界 limit 下取第 1 页拿到的
    // 是**最旧**的行 —— 每一次新的写都落在窗口外，下钻说「未记录」，而台账其实记着。故先读总数、再取最后一页。
    const head = await effectApi.list(1, 1)
    const lastPage = Math.max(1, Math.ceil(head.total / EFFECT_WINDOW))
    const ledger = await effectApi.list(lastPage, EFFECT_WINDOW)
    effects.value = ledger.items
    // 确认队列，给那些从没进过台账的调用用。它有自己的闸（`read Confirmation`），故一个能打开审计页、
    // 却被那道闸拒的调用方照样拿到这一页：被扣下/被拒的调用第三问说「未记录」，也就是它原来的样子。
    //
    // The confirmation queue, for the calls that never reached the ledger. It has its own guard
    // (`read Confirmation`), so a caller the audit page reaches but that guard refuses still gets the
    // page: the third question on a held or refused call then says 「未记录」, which is where it was.
    try {
      const held = await confirmationApi.listAll(1, PROPOSAL_WINDOW)
      proposals.value = held.items
    } catch {
      proposals.value = []
    }
  } catch (e) {
    rows.value = []
    hasMore.value = false
    rowsError.value = runtimeErrorMessage(e, t('keelbase.common.loadFailed'))
  } finally {
    rowsLoading.value = false
  }
}

function reload() {
  offset.value = 0
  void loadRows()
  // 声明跟的是**时间窗**、不是页码 —— 翻一页还是同一个窗口。
  // The statement follows the window, not the page cursor — a new page is the same window.
  void loadCoverage()
}

function step(delta: number) {
  offset.value = Math.max(0, offset.value + delta * LIMIT)
  void loadRows()
}

onMounted(() => {
  void loadVerify()
  void loadRows()
  void loadCoverage()
})
</script>

<style scoped>
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.overview {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
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
.six-title {
  margin: 2px 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.six-row .d-key {
  min-width: 148px;
  white-space: nowrap;
}
.six-missing {
  color: var(--el-color-warning);
}
.check-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
}
.chain {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
}
.chain-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
}
.chain-node.broken {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
.chain-id {
  font-weight: 600;
  min-width: 44px;
}
.chain-time {
  color: var(--el-text-color-secondary);
  min-width: 150px;
}
.chain-action {
  flex: 1;
}
.chain-hash {
  font-family: monospace;
  color: var(--el-text-color-secondary);
}
.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.pager-pos {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.coverage-line {
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.coverage-gaps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0;
}
.coverage-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.coverage-gap-id {
  font-family: monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
