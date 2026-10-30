<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  调用方自己的会话，以及打开的那一个的轨迹。

  **本页展示不了的东西写在页面上**，而不是留给读者自己发现：一条追踪是这条会话自己的故事 —— 回合、这些回合
  提议过的工具调用、有人作过的裁决、以及那些写产生的副作用，按事情发生的先后并成一条时间线，前提是运行时把
  这些行与会话关联起来（本运行时自 `V11__conversation_link` 起会关联）。**没有会话**时写下的行（一次任务运行、
  一个 MCP 调用方）不属于这条会话、故不出现，调用的参数串也不出现（本运行时不存它）；这些缺席就是页上那句
  覆盖声明说的。运行时若送一条 `type = notice` 的步来**披露**它放不进这里的东西，那一步**作为披露呈现**、
  不是当作序列里的又一步，因为把它当一步读，会让人以为这条轨迹是完整的。

  列表是**调用方自己的**，轨迹**拒绝别人的**，两者都由服务端决定；页面既不筛也不复查。

  The caller's own conversations, and the trace of whichever one is opened.

  What this page cannot show is stated on it rather than left to be noticed: a trace is the
  conversation's own story — its turns, the tool calls those turns proposed, the decisions a person
  took, and the side effects those writes produced, merged into one timeline in the order things
  happened, whenever the runtime links those rows to the conversation (this runtime does so since
  `V11__conversation_link`). A row written with no conversation (a task run, an MCP caller) is not
  this conversation's and does not appear, and neither does the call's argument string (this runtime
  does not store it); those absences are what the coverage statement on the page says. If a runtime
  sends a step of type `notice` to disclose what it cannot place here, that step is drawn as a
  disclosure rather than as one more step in the sequence, because reading it as a step would
  suggest the trace is complete.

  The list is the caller's own and the trace refuses another user's, both decided by the server; the
  page does not filter or re-check either.
-->
<template>
  <ContentWrap :title="t('keelbase.trace.title')">
    <template #header>
      <el-tag v-if="conversations.length" size="small" effect="plain">
        {{ t('keelbase.trace.count', { n: conversations.length }) }}
      </el-tag>
      <el-button class="ml-auto" size="small" :loading="loading" @click="load">{{ t('keelbase.common.refresh') }}</el-button>
    </template>

    <div v-if="error" class="text-[var(--el-color-danger)] mb-10px">{{ error }}</div>
    <!-- 覆盖声明（`D57`）：这一页读到哪、到不了哪些路径 —— 只写事实。 -->
    <!-- Coverage statement (`D57`): what this page reads, and which paths it cannot reach. -->
    <div class="mb-10px text-12px text-[var(--el-text-color-secondary)]">{{ t('keelbase.coverage.trace') }}</div>
    <el-empty v-if="!loading && !conversations.length" :description="t('keelbase.trace.empty')" />
    <el-table v-else v-loading="loading" :data="conversations" stripe @row-click="open">
      <!-- F-2：先给**可辨认**的那一列 —— 名字由用户起；没有名字就如实写「未命名」，不拿消息正文凑一个
           （那是内容摘要，AU-4 刻意不带）。 -->
      <!-- F-2: the identifying column comes first — a name the user gave. With no name the row says
           so; it never improvises one from message text, which is the content digest AU-4 withholds. -->
      <el-table-column :label="t('keelbase.trace.colTitle')" min-width="240">
        <template #default="{ row }">
          <div class="flex items-center gap-6px">
            <span :class="row.title ? '' : 'text-[var(--el-text-color-secondary)]'">
              {{ row.title || t('keelbase.trace.untitled') }}
            </span>
            <el-button link size="small" @click.stop="rename(row)">{{ t('keelbase.trace.rename') }}</el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('keelbase.trace.colId')" prop="id" min-width="240" show-overflow-tooltip />
      <el-table-column :label="t('keelbase.trace.colModel')" width="220">
        <template #default="{ row }">{{ row.provider }} / {{ row.model }}</template>
      </el-table-column>
      <!-- 条数取整段对话记录（`messageCount`）；列表只带最新两条回合，故不能拿 `messages.length` 当总数。 -->
      <!-- The count is the whole transcript's (`messageCount`); the list carries only the newest two
           turns, so `messages.length` is not the total. -->
      <el-table-column :label="t('keelbase.trace.colMessages')" width="120" align="center">
        <template #default="{ row }">{{ row.messageCount ?? row.messages.length }}</template>
      </el-table-column>
      <el-table-column :label="t('keelbase.trace.colLast')" width="200">
        <template #default="{ row }">{{ timeText(row.lastActivityAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('keelbase.trace.colOpen')" width="110" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" :loading="opening === row.id" @click.stop="open(row)">
            {{ t('keelbase.trace.open') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </ContentWrap>

  <ContentWrap v-if="trace" :title="t('keelbase.trace.stepsTitle')">
    <template #header>
      <!-- F-2：面板标题给**同一个名字** —— 与列表同一来源、同一回落，读者才认得出打开的是哪条会话。 -->
      <!-- F-2: the panel's heading carries the same name, from the same source and with the same
           fallback, so the reader can tell which conversation they opened. -->
      <span :class="trace.conversation.title ? '' : 'text-[var(--el-text-color-secondary)]'">
        {{ trace.conversation.title || t('keelbase.trace.untitled') }}
      </span>
      <span class="text-12px text-[var(--el-text-color-secondary)]">{{ trace.conversation.id }}</span>
      <el-button class="ml-auto" size="small" @click="trace = null">{{ t('keelbase.trace.close') }}</el-button>
    </template>
    <div v-if="traceError" class="text-[var(--el-color-danger)]">{{ traceError }}</div>
    <div v-else class="steps">
      <div v-for="s in trace.steps" :key="s.id" class="step" :class="{ notice: s.type === 'notice' }">
        <span class="step-time">{{ timeText(s.time) }}</span>
        <el-tag v-if="s.type !== 'notice'" size="small" effect="plain">{{ stepTypeText(s.type) }}</el-tag>
        <!-- A `notice` step is the runtime disclosing what it cannot place here, so it is drawn as a
             disclosure and not as one more thing that happened. -->
        <!-- 一条 `notice` 步，是运行时在**披露**它放不进这里的东西，故按披露画、不按「又发生了一件事」画。 -->
        <el-tag v-else size="small" type="warning">{{ t('keelbase.trace.noticeTag') }}</el-tag>
        <div class="step-body">
          <span class="step-content" :class="{ 'text-[var(--el-color-warning)]': s.type === 'notice' }">{{ stepTextOf(s) }}</span>
          <!-- F-18：被拦下 / 失败的那一步，运行时自己的记录行在这里——它点名了成因。 -->
          <!-- F-18: for a blocked or failed step, the runtime's own record line names the cause. -->
          <span v-if="s.detail && s.success === false" class="step-detail">
            {{ t('keelbase.trace.detailLine', { detail: s.detail }) }}
          </span>
        </div>
      </div>
    </div>
  </ContentWrap>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ContentWrap } from '@/components/ContentWrap'
import {
  conversationApi,
  type ConversationData,
  type ConversationTrace,
  type TraceStep,
} from '@/keelbase/governanceApi'
import { runtimeErrorMessage } from '@/keelbase/runtime'
import { traceStepLabelKey } from '@/keelbase/labels'
import { stepText } from '@/keelbase/traceStepText'
import { timeText } from '@/keelbase/time'

defineOptions({ name: 'KeelbaseGovernanceConversationTrace' })

const { t } = useI18n()

/** The step's kind in the reader's words; an unknown type is shown as itself. */
/** 这一步的**种类**用读者的话说；不认识的类型原样显示。 */
function stepTypeText(type: string): string {
  const key = traceStepLabelKey(type)
  return key ? t(key) : type
}

/**
 * What the step says. The runtime's own `content` when it sent one; otherwise the step's fields —
 * the tool and how the call ended, the decision, or the record and its status — and never the call's
 * arguments.
 *
 * 这一步说什么。运行时给了 `content` 就用它；否则用该步的字段 —— 哪个工具、这次调用怎么收场，
 * 裁决是什么，或者哪条记录、它什么状态 —— 且绝不带调用的参数。
 */
function stepTextOf(step: TraceStep): string {
  return stepText(step, (key) => t(key))
}

const conversations = ref<ConversationData[]>([])
const loading = ref(false)
const error = ref('')

const trace = ref<ConversationTrace | null>(null)
const traceError = ref('')
const opening = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    conversations.value = await conversationApi.list()
  } catch (e) {
    conversations.value = []
    error.value = runtimeErrorMessage(e, t('keelbase.common.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function open(row: ConversationData) {
  opening.value = row.id
  traceError.value = ''
  try {
    trace.value = await conversationApi.trace(row.id)
  } catch (e) {
    trace.value = null
    traceError.value = runtimeErrorMessage(e, t('keelbase.common.loadFailed'))
  } finally {
    opening.value = null
  }
}

/** 名字的上限与服务端同一条（`ConversationTitle.MAX_LENGTH`），故输入框先挡住过长的那一种。 */
/** The title ceiling is the server's own (`ConversationTitle.MAX_LENGTH`), so the prompt refuses it first. */
const TITLE_MAX_LENGTH = 200

/**
 * 给一条会话起名；留空等于清除。属主由服务端按 id 判，页面不复查。
 *
 * Name a conversation; blank clears it. The server decides ownership by the id, and the page does not
 * re-check what the server already enforces.
 */
async function rename(row: ConversationData) {
  let title: string
  try {
    const { value } = await ElMessageBox.prompt(t('keelbase.trace.renamePrompt'), t('keelbase.trace.rename'), {
      inputValue: row.title ?? '',
      inputValidator: (v: string) =>
        (v ?? '').trim().length <= TITLE_MAX_LENGTH || t('keelbase.trace.renameTooLong', { n: TITLE_MAX_LENGTH }),
    })
    title = String(value ?? '')
  } catch {
    return
  }
  try {
    await conversationApi.rename(row.id, title)
  } catch (e) {
    ElMessage.error(runtimeErrorMessage(e, t('keelbase.trace.renameFailed')))
    return
  }
  ElMessage.success(t('keelbase.trace.renamed'))
  // 名字是**服务端的状态**，故重拉列表，而不是就地把这一行改掉：另一个标签页里改的名字才能出现在这里，
  // 这一行的其它字段（条数、最近活动）也跟着服务端走。
  // The name is **server state**, so the list is refetched rather than patched in place: a name changed
  // in another tab shows up here, and the row's other fields (count, last activity) follow the server too.
  await load()
  // 打开着的那条若是它，一并重取 —— 面板标题也就跟着名字走。
  // If that conversation is the one open below, refetch it too, so the panel's heading follows the name.
  if (trace.value?.conversation.id === row.id) {
    await open(row)
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.step.notice {
  background: var(--el-color-warning-light-9);
}
.step-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 150px;
}
.step-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.step-content {
  font-size: 13px;
  word-break: break-word;
}
.step-detail {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
</style>
