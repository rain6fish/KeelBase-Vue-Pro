<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  The ledger of what AI has written, and the one action that can be taken on it.

  The reference console also shows a tool inventory and a content-safety policy above this table.
  Neither is drawn: this runtime serves no `/ai/tools`, and its content-safety settings belong to the
  reference's own settings store. Rows whose effects can be claimed or whose disputes can be
  acknowledged are likewise not surfaced — those two routes do not exist here. So the page is the
  ledger and the revoke, which is what this host can back.

  The user filter is the manager's; the server scopes every caller regardless of what it asks for, so
  a non-manager sees their own rows here too and the page does not pretend otherwise.

  AI 写了什么的台账，以及能在它上面做的唯一一件事。

  参照实现还在这张表上方显示工具清单与内容安全策略。两者都不画：本运行时没有 `/ai/tools` 这条路由，
  而它的内容安全设置属于参照实现自己的配置存储。可认领的、可确认争议的那些行同样不露出——那两条路由
  在这里不存在。故这一页就是台账与撤销，也就是本宿主撑得住的东西。

  用户筛选是管理员用的；**服务端**对每个调用方都施加了范围，无论它请求什么，故非管理员在这里看到的
  也是自己那些行，页面不假装不是。
-->
<template>
  <ContentWrap :title="t('keelbase.tools.ledgerTitle')">
    <template #header>
      <el-tag v-if="total" size="small" effect="plain">{{ t('keelbase.actionCenter.writesTotal', { n: total }) }}</el-tag>
      <el-button class="ml-auto" size="small" :loading="loading" @click="refresh">
        {{ t('keelbase.common.refresh') }}
      </el-button>
    </template>

    <el-form :inline="true" class="-mb-15px" @submit.prevent>
      <el-form-item :label="t('keelbase.tools.userId')">
        <el-input v-model="userId" clearable :placeholder="t('keelbase.tools.userIdPlaceholder')" class="!w-200px" @keyup.enter="refresh" />
        <!-- The filter takes an id; when the host's directory can name that id, say who it is. -->
        <!-- 该筛选收的是 id；当宿主的名录能把这个 id 配上名时，把那**是谁**说出来。 -->
        <span v-if="filteredName" class="ml-8px text-12px text-[var(--el-text-color-secondary)]">{{ filteredName }}</span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="refresh">{{ t('keelbase.common.filter') }}</el-button>
      </el-form-item>
    </el-form>

    <div v-if="error" class="text-[var(--el-color-danger)] mb-10px">{{ error }}</div>
    <!-- 覆盖声明（`D57`）：这一页读到哪、到不了哪些路径 —— 只写事实。 -->
    <!-- Coverage statement (`D57`): what this page reads, and which paths it cannot reach. -->
    <div class="mb-10px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.coverage.effectsLedger') }}</div>
    <!-- F-15：这行说明原来只放在表头的 `title` 悬浮提示里，读者根本看不到。挪到页面上。 -->
    <div class="mb-8px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.effects.columnsHint') }}</div>
    <el-table v-loading="loading" :data="rows" stripe>
      <!-- Opened, this row lays out the record the write landed on. Here the row **is** the effect, so
           the two trails agree without a guess. The record's own text is masked — what a record is
           about is the thing this console must not print (CLAUDE.md §5.5 ②). -->
      <!-- 摊开时，这一行把「这次写落在哪条记录上」摆出来。这里这一行**本身就是**那条副作用，故两条轨
           **无需猜测**就一致。记录自己的文字是**掩码的** —— 一条记录讲的是什么，正是本控制台不得打印的东西
           （`CLAUDE.md` §5.5 ②）。 -->
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="row-detail">
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colTool') }}</span><span>{{ toolText(row.toolName) }}</span></div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colResultType') }}</span><span>{{ row.resultType || '—' }}</span></div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colTargetId') }}</span><span>#{{ row.resultId ?? '—' }}</span></div>
            <div class="d-row">
              <span class="d-key">{{ t('keelbase.effects.colTarget') }}</span>
              <span>
                {{ targetText(row) }}
                <!-- 掩码那句话属于**真有过名字**的情形；理由见行动中心那一份。 -->
                <!-- The masking note belongs to a name that exists; see the Action Center's copy. -->
                <span v-if="targetNamed(row)" class="muted">{{ t('keelbase.effects.maskedNote') }}</span>
              </span>
            </div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colState') }}</span><span>{{ stateText(row) }}</span></div>
            <div class="d-row"><span class="d-key">{{ t('keelbase.effects.colTime') }}</span><span>{{ timeText(row.createdAt) }}</span></div>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colId')" prop="id" width="90" align="center" />
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
          {{ targetText(row) }} <span class="muted">#{{ row.resultId ?? '—' }}</span>
        </template>
      </el-table-column>
      <!-- F-4：两列原来直接把枚举值打在表上（`crm_customer` / `local_compensate`），读者不知道是什么。
           现在两列都先给**读者语言的词**，注册值留在下面一行小字里 —— 业务读者读得懂，工程师仍看得到
           原始值；不认识的取值只显示它自己，不隐藏、也不从拼写去猜。 -->
      <!-- F-4: both columns lead with a word in the reader's language and keep the registered value on a
           muted second line — readable for a business reader, still honest for an engineer. An unknown
           value is shown as itself: never hidden, and never guessed from its spelling. -->
      <el-table-column :label="t('keelbase.effects.colResultType')" width="180">
        <template #header>
          <span :title="t('keelbase.effects.colResultTypeHint')">{{ t('keelbase.effects.colResultType') }}</span>
        </template>
        <template #default="{ row }">
          <div>{{ resultTypeText(row.resultType) }}</div>
          <div v-if="resultTypeText(row.resultType) !== (row.resultType || '—')" class="muted">{{ row.resultType }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colRevokeClass')" width="180">
        <template #header>
          <span :title="t('keelbase.effects.colRevokeClassHint')">{{ t('keelbase.effects.colRevokeClass') }}</span>
        </template>
        <template #default="{ row }">
          <div>{{ revokeClassText(row.revokeClass) }}</div>
          <div v-if="revokeClassText(row.revokeClass) !== (row.revokeClass || '—')" class="muted">{{ row.revokeClass }}</div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colStatus')" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'revoked' ? 'info' : 'success'" size="small">
            {{ row.status === 'revoked' ? t('keelbase.effects.statusRevoked') : t('keelbase.effects.statusExecuted') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colTime')" width="190">
        <template #default="{ row }">{{ timeText(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('keelbase.effects.colActions')" width="110" align="center">
        <template #default="{ row }">
          <!-- The audit reader gets no write control; the server would refuse the call anyway. -->
          <!-- 审计读者不给写控件；服务端本来也会拒这次调用。 -->
          <el-button v-if="row.revocable && canWrite" link type="danger" @click="revoke(row)">
            {{ t('keelbase.effects.revoke') }}
          </el-button>
          <span v-else class="text-[var(--el-text-color-secondary)]">—</span>
        </template>
      </el-table-column>
    </el-table>

    <Pagination v-if="total > 0" v-model:page="page" v-model:limit="limit" :total="total" @pagination="load" />
  </ContentWrap>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ContentWrap } from '@/components/ContentWrap'
import Pagination from '@/components/Pagination/index.vue'
import { effectApi, type EffectRow } from '@/keelbase/governanceApi'
import { runtimeErrorMessage } from '@/keelbase/runtime'
import { resolveCallerNames } from '@/keelbase/callerNames'
import { resolveRecordNames } from '@/keelbase/recordNames'
import { resultTypeLabelKey, revokeClassLabelKey, toolLabelKey } from '@/keelbase/labels'
import { timeText } from '@/keelbase/time'
import { maskTitle } from '@/keelbase/mask'
import { useConsoleWriteAllowed } from '@/keelbase/consoleRole'

defineOptions({ name: 'KeelbaseGovernanceTools' })

const { t } = useI18n()

/**
 * 结果类型 / 可撤档位：控制台认识的值给**读者语言的词**，不认识就原样显示注册值 —— 只补名字、不改事实。
 *
 * A declared result type or a revoke class: a word in the reader's language when this console knows the
 * value, the registered value itself otherwise — a name is added, never changed.
 */
function resultTypeText(value: string | null | undefined): string {
  if (!value) return '—'
  const key = resultTypeLabelKey(value)
  return key ? t(key) : value
}

function revokeClassText(value: string | null | undefined): string {
  if (!value) return '—'
  const key = revokeClassLabelKey(value)
  return key ? t(key) : value
}
/** The audit reader sees no write control (revoke); the server's verdict is unchanged. */
/** 审计读者不出现写控件（撤销）；服务端裁决不变。 */
const { canWrite } = useConsoleWriteAllowed()

/** The tool in the reader's language, falling back to the registered name. */
/** 工具名，用读者的语言；不认识就保留注册名。 */
function toolText(name: string | null | undefined): string {
  if (!name) return '—'
  const key = toolLabelKey(name)
  return key ? t(key) : name
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

/** Whether the record this write landed on is still there — read off the row, never re-derived. */
/** 这次写落在的那条记录**还在不在** —— 按行读，绝不自己重算。 */
function stateText(row: EffectRow): string {
  if (!row.targetExists) return t('keelbase.effects.stateGone')
  if (row.targetSoftDeleted) return t('keelbase.effects.stateDeleted')
  return t('keelbase.effects.statePresent')
}

const rows = ref<EffectRow[]>([])
/** 名录给发起人配好的名字，按 id 索引；取不到时列回落成 id 本身。 */
/** Names the directory holds for the callers, keyed by id; the column falls back to the id. */
const names = ref<Record<string, string>>({})
/**
 * 宿主给这一行**落在哪条记录**配好的名字（已掩码），按 `类型#主键` 索引。
 *
 * 运行时的 `targetTitle` 对客户这类记录是 **null**（2026-11-04 真栈实测），于是这一格过去只剩 `— #1`。
 * 现在按行问宿主那条窄读面；答不上时才说「未登记名称」，不再把「没问」画成一个破折号。
 *
 * The host's name (masked) for **the record this row landed on**, keyed by `type#key`. The runtime's
 * `targetTitle` is **null** for a customer row (measured on a real stack, 2026-11-04), so this cell used to
 * carry `— #1`. Each row now asks the host's narrow read face; when it cannot answer, the cell says
 * "name not registered" instead of drawing a dash over "never asked".
 */
const targetNames = ref<Record<string, string>>({})
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const error = ref('')
const userId = ref('')
/** The name behind the id being filtered, when the directory knows one. */
/** 正在筛选的那个 id 背后的名字，当名录认识一个时。 */
const filteredName = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await effectApi.list(page.value, limit.value, userId.value || undefined)
    rows.value = res.items
    total.value = res.total
    names.value = { ...names.value, ...(await resolveCallerNames(res.items.map((r) => r.userId))) }
    targetNames.value = {
      ...targetNames.value,
      ...Object.fromEntries(await resolveRecordNames(res.items.map((r) => ({ type: r.resultType, id: r.resultId })))),
    }
    if (userId.value) {
      const resolved = await resolveCallerNames([userId.value])
      const name = resolved[userId.value]
      filteredName.value = name && name !== userId.value ? name : ''
    } else {
      filteredName.value = ''
    }
  } catch (e) {
    rows.value = []
    total.value = 0
    error.value = runtimeErrorMessage(e, t('keelbase.common.loadFailed'))
  } finally {
    loading.value = false
  }
}

function refresh() {
  page.value = 1
  void load()
}

function revoke(row: EffectRow) {
  ElMessageBox.confirm(
    t('keelbase.effects.revokeConfirm', { title: row.targetTitle || `#${row.resultId}` }),
    t('keelbase.effects.revoke'),
    { type: 'warning' },
  )
    .then(async () => {
      try {
        await effectApi.revoke(row.id)
        ElMessage.success(t('keelbase.effects.revoked'))
        await load()
      } catch (e) {
        ElMessage.error(runtimeErrorMessage(e, t('keelbase.effects.revokeFailed')))
      }
    })
    .catch(() => undefined)
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
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
</style>
