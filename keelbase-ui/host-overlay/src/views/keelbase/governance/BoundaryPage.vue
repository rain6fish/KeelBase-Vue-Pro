<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  哪些 AI 路径被治理扣住、哪些不被扣住 —— 一页说清楚。

  **这一页不自己下判断，也不重算任何东西。** 它读的是 UI 构建时由门禁 `check-ungoverned-tool-beans.mjs`
  的 `--emit` 铺进产物的一份记录（`/keelbase-governance-boundary.json`）—— 与 CI 跑的是**同一次计算**。
  记录里只有**标识与枚举**（结论、射程、路径 id、每个 `holds` 项、违规 bean 的坐标），**没有散文**：词由
  这一页按读者的语言给，因为管理台双语是一条红线。
  ⚠ 词条里凡出现**字面 `@`**，必须写成 `{'@'}` —— vue-i18n 把 `@` 当**链接消息**的引导符，未转义的那条消息
  **编译失败**（`SyntaxError`），而 `t()` 是**渲染期**懒编译的 ⇒ 那一下会把**整页渲染**打死，屏幕上只留一个
  空注释、什么也不说。本页的 `reads` 与 `notHeldOneBean` 就踩过这一脚（2026-10-16 实测，见执行日志）。

  底线那半（`stated`）不可能由一次运行**推出** —— 它是设计事实：运行时的缝扣住哪五样；上游那条路今天为什么
  无害（本构建里唯一的 `ToolCallback` bean 是上游自己的示例），以及它**离「不再无害」只差一个 `@Bean`**。
  门禁只能**确认**它。页面上如实画出来，包括那句「只差一个 bean」的告诫。
  `stated.paths`（`D57`）再把**每一条 AI 路径**的治理姿态、缺口与**代码出处**列成一张表：运行时那条缝、
  `D42` 上游解析器路、`D44`-B 的 ai1 MCP、SKILL、ai1 RAG —— 五条各自「扣住什么、扣不住什么」都在这里，
  不留「默认没写 = 已覆盖」。

  再往下一节是**治理覆盖账本**（M0）：部署范围里每个业务 service 一个姿态（接缝受治理 / 只有工具面 / 已排期 /
  明确不接）。它与上面同一份记录的性质 —— 取自构建带着的 `conformance/governance-coverage.tsv`，由同一个门禁
  的 `--emit` 铺进产物；账本里的「理由」是散文、不进产物，故这一页不画它。

  Which AI paths this build's governance holds, and which it does not.

  This page decides nothing and recomputes nothing: it reads the record the UI build lays into the artefact
  from the gate's own `--emit` (`/keelbase-governance-boundary.json`) — the same computation CI runs. The
  record carries identifiers and enums only (verdict, scope, path ids, each `holds` entry, an offender's
  coordinates) and no prose, because the console is bilingual by a standing rule and its words come from its
  own i18n.
  ⚠ A literal `@` in a message **has** to be written `{'@'}` — vue-i18n reads `@` as the linked-message sigil,
  the unescaped message fails to compile (`SyntaxError`), and `t()` compiles lazily *at render time*, so that
  one failure takes the whole page's render down and leaves an empty comment saying nothing. This page's
  `reads` and `notHeldOneBean` were bitten by exactly that (measured 2026-10-16; see the execution log).

  The `stated` half cannot be derived by a run — it is a design fact: which five things the runtime's seam
  holds, why upstream's path is harmless today (the only `ToolCallback` bean in this build is upstream's own
  sample), and that it is one `@Bean` away from not being. The gate can only confirm it. What is drawn here
  includes that warning.

  Below that sits the **onboarding ledger** (M0): one posture per business service in the deployed scope
  (onboarded at the seam / tool face only / scheduled / out of scope). It is the same kind of record as the
  paths above — carried from `conformance/governance-coverage.tsv` into the artefact by the same gate's
  `--emit`; the ledger's reason column is prose and stays out of the artefact, so the page does not draw it.
-->
<template>
  <ContentWrap :title="t('keelbase.boundary.title')">
    <template #header>
      <el-tag
        v-if="boundary"
        :type="boundary.computed.verdict === 'ok' ? 'success' : 'danger'"
        size="small"
        effect="plain"
      >
        {{
          boundary.computed.verdict === 'ok'
            ? t('keelbase.boundary.verdictOk')
            : t('keelbase.boundary.verdictViolated', { n: boundary.computed.offenders.length })
        }}
      </el-tag>
    </template>

    <div v-if="error" class="text-[var(--el-color-danger)] mb-10px">{{ error }}</div>
    <div v-else-if="missing" class="text-[var(--el-text-color-secondary)]">
      {{ t('keelbase.boundary.missing') }}
    </div>

    <template v-if="boundary">
      <div class="text-12px text-[var(--el-text-color-secondary)] mb-4px">
        {{ t('keelbase.boundary.scope', { files: boundary.computed.scope.filesScanned, roots: boundary.computed.scope.roots.length }) }}
      </div>
      <div class="text-12px text-[var(--el-text-color-secondary)] mb-4px">
        {{ t('keelbase.boundary.reads', { types: boundary.computed.readsTypes.join(' / ') }) }}
      </div>
      <div class="text-12px text-[var(--el-text-color-secondary)] mb-14px">
        {{ t('keelbase.boundary.excluded', { paths: boundary.computed.scope.excludedPaths.join(', ') }) }}
      </div>

      <!-- 一页结论：先给读者一句能复述的答案，再展开下面那张表。
           M7 F-9：此前只有五条路径铺开，读者读完整页仍说不出「哪些扣」，只能反推「扣不住之外的」。
           这两行把同一份记录归并成两个集合 —— 仍不重算任何东西，只按 `posture` 分组。
           / In one line: the restatable answer first, the table second. Same record, grouped by `posture`. -->
      <div class="font-medium mt-16px mb-4px">{{ t('keelbase.boundary.summaryTitle') }}</div>
      <div class="mb-2px">
        <span class="text-12px mr-6px">{{ t('keelbase.boundary.summaryHeld') }}</span>
        <el-tag
          v-for="id in heldPathIds"
          :key="id"
          size="small"
          :type="postureTagType(postureOf(id))"
          class="mr-4px mb-4px"
        >
          {{ t(`keelbase.boundary.path.${id}`) }}
        </el-tag>
      </div>
      <div class="mb-2px">
        <span class="text-12px mr-6px">{{ t('keelbase.boundary.summaryNotHeld') }}</span>
        <el-tag
          v-for="id in notHeldPathIds"
          :key="id"
          size="small"
          type="danger"
          effect="plain"
          class="mr-4px mb-4px"
        >
          {{ t(`keelbase.boundary.path.${id}`) }}
        </el-tag>
      </div>
      <div class="text-12px text-[var(--el-text-color-secondary)] mb-10px">
        {{
          t('keelbase.boundary.summaryNote', {
            total: boundary.stated.paths.length,
            held: heldPathIds.length,
            none: notHeldPathIds.length
          })
        }}
      </div>

      <!-- F-17：「已知缺口」这一列读者不知道是干什么用的；「上游模型→工具解析器」也没人解释。一句图例。 -->
      <div class="text-12px text-[var(--el-text-color-secondary)] mb-12px">{{ t('keelbase.boundary.legend') }}</div>

      <!-- 每条 AI 路径及其治理姿态 —— `stated.paths` 是设计事实，页面只画、不重算。 -->
      <!-- Every AI path and its posture — `stated.paths` is a design fact; the page only draws it. -->
      <div class="font-medium mt-16px mb-4px">{{ t('keelbase.boundary.pathsTitle') }}</div>
      <div class="text-12px mb-6px">{{ t('keelbase.boundary.pathsWhat') }}</div>
      <el-table :data="boundary.stated.paths" stripe class="boundary-matrix">
        <!-- 代码出处收进展开行：读者要先看结论，给开发者的坐标放在随手可得但不挡路的地方。
             M7 F-8：此前它是一整列（260px），与「扣住/不扣」并排，把主结论稀释掉了。
             / The code coordinates moved into an expandable row: available, but not in the reading path. -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="text-12px mb-4px">{{ t('keelbase.boundary.sourceTitle') }}</div>
            <div v-for="s in row.sources" :key="s" class="text-12px text-[var(--el-text-color-secondary)]">{{ s }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('keelbase.boundary.colPath')" min-width="190">
          <template #default="{ row }">{{ t(`keelbase.boundary.path.${row.id}`) }}</template>
        </el-table-column>
        <el-table-column :label="t('keelbase.boundary.colPosture')" width="170">
          <template #default="{ row }">
            <el-tag :type="postureTagType(row.posture)" size="small">{{ t(`keelbase.boundary.posture.${row.posture}`) }}</el-tag>
          </template>
        </el-table-column>
        <!-- 路径 × 关卡矩阵：一列一道关，勾只由本行自己的 `holds` 推出（`holds.includes(control)`）。
             原来把这一行的关卡画成标签串，读者要比对好几行才看得出「哪条路少了哪道关」；摆成矩阵后
             横向一读就是答案。页面仍不重算任何东西 —— `stated.paths` 里没有的关卡就不会被打勾。 -->
        <!-- Path × control matrix: one column per control, a tick comes from the row's own `holds`
             (`holds.includes(control)`). The tags used to read as a run-on string, so seeing which path
             misses which control meant comparing rows; as a matrix the answer is one horizontal read.
             Nothing is derived here — a control absent from `stated.paths` simply never ticks. -->
        <el-table-column :label="t('keelbase.boundary.colHolds')" align="center">
          <el-table-column
            v-for="c in CONTROLS"
            :key="c"
            :label="t(`keelbase.boundary.holds.${c}`)"
            width="110"
            align="center"
          >
            <template #default="{ row }">
              <span v-if="row.holds.includes(c)" class="text-[var(--el-color-success)]">✓</span>
              <span v-else class="text-[var(--el-text-color-placeholder)]">—</span>
            </template>
          </el-table-column>
        </el-table-column>
        <el-table-column :label="t('keelbase.boundary.colGap')" min-width="300">
          <template #default="{ row }">{{ t(`keelbase.boundary.gap.${row.gap}`) }}</template>
        </el-table-column>
      </el-table>

      <!-- 它扣不住的：独立成块，读者从上到下走一遍就能读到上游那条路与「只差一个 bean」的告诫。
           内容来自 `stated.notHeld`，路径名来自 `path.<id>` —— 与上面那张表同一份记录，页面不另算。 -->
      <!-- Not held by it: its own block, so a reader walking the page top to bottom meets upstream's
           path and the "one bean away" warning. The content comes from `stated.notHeld`, the path name
           from `path.<id>` — the same record as the table above; the page derives nothing new. -->
      <!-- M7 F-10：这一段原来是一整段可以逐字照抄的散文；读者抄下来就算答对。改成四条带标签的事实，
           每一行各自回答一个问题，抄一整段不再能替代理解。 / Was one copyable paragraph; now four labelled facts. -->
      <div class="font-medium mt-16px mb-6px">{{ t('keelbase.boundary.notHeldTitle') }}</div>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item :label="t('keelbase.boundary.notHeldWho')">
          <el-tag size="small" effect="plain">
            {{ t(`keelbase.boundary.path.${boundary.stated.notHeld.id}`) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('keelbase.boundary.notHeldHow')">
          {{ t('keelbase.boundary.notHeldWhat') }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('keelbase.boundary.notHeldWhyLabel')">
          {{ t('keelbase.boundary.notHeldWhy') }}
        </el-descriptions-item>
        <el-descriptions-item v-if="boundary.stated.notHeld.oneBeanAway" :label="t('keelbase.boundary.notHeldWhenLabel')">
          {{ t('keelbase.boundary.notHeldOneBean') }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 治理覆盖账本（M0）：每个业务 service 一个姿态。与上面那两张表同一份记录的性质 —— 取自构建里带着的
           账本、由门禁 `check-ungoverned-tool-beans.mjs` 的 `--emit` 铺进产物；页面只画、不重算。
           账本里的「理由」是散文，不进产物，故这一页不画它；「未接入」那一态在这里是可读的事实，不是待办编号。
           / The onboarding ledger (M0): one posture per business service, carried the same way as the record
           above; drawn, never recomputed. The ledger's reason column is prose and stays out of the artefact,
           so this page does not draw it — "scheduled" here is a readable fact, not a to-do number. -->
      <template v-if="boundary.coverage">
        <div class="font-medium mt-16px mb-4px">{{ t('keelbase.boundary.ledgerTitle') }}</div>
        <div class="text-12px mb-6px">{{ t('keelbase.boundary.ledgerWhat') }}</div>
        <div class="text-12px text-[var(--el-text-color-secondary)] mb-6px">
          {{
            t('keelbase.boundary.ledgerTotals', {
              services: boundary.coverage.totals.services,
              seam: boundary.coverage.totals.seam,
              toolOnly: boundary.coverage.totals['tool-only'],
              gap: boundary.coverage.totals.gap,
              exempt: boundary.coverage.totals.exempt
            })
          }}
        </div>
        <el-table :data="boundary.coverage.rows" stripe class="ledger-table">
          <el-table-column :label="t('keelbase.boundary.ledgerColModule')" prop="module" width="150" />
          <el-table-column :label="t('keelbase.boundary.ledgerColObject')" prop="object" min-width="190" />
          <el-table-column :label="t('keelbase.boundary.ledgerColPosture')" width="240">
            <template #default="{ row }">
              <el-tag :type="ledgerTagType(row.posture)" size="small">
                {{ t(`keelbase.boundary.ledgerPosture.${row.posture}`) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 会绕过它的 bean：有才画，且是这一页唯一「坏了」的样子 / only when there are any -->
      <template v-if="boundary.computed.offenders.length">
        <div class="font-medium mt-16px mb-6px">{{ t('keelbase.boundary.offendersTitle') }}</div>
        <el-table :data="boundary.computed.offenders" stripe>
          <el-table-column :label="t('keelbase.boundary.colFile')" prop="file" min-width="320" />
          <el-table-column :label="t('keelbase.boundary.colLine')" prop="line" width="90" />
        </el-table>
      </template>
    </template>
  </ContentWrap>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ContentWrap } from '@/components/ContentWrap'

defineOptions({ name: 'KeelbaseGovernanceBoundary' })

const { t } = useI18n()

/** The record, as the gate writes it. Identifiers and enums only — no prose, in any language. */
/** 那份记录，如门禁所写。只有标识与枚举 —— 任何一种语言的散文都不在里面。 */
type PathRow = {
  id: 'runtime-seam' | 'upstream-resolver' | 'ai1-mcp' | 'ai1-skill' | 'ai1-rag'
  posture: 'governed' | 'partially-governed' | 'not-governed'
  holds: string[]
  doesNotHold: string[]
  gap: 'none' | 'one-bean-away' | 'declaration-quality' | 'shell-on-host' | 'retrieval-unlogged'
  /** 代码出处（`文件:行`）—— 与产物同源，读者可核对。 / code coordinates (`file:line`), from the same record. */
  sources: string[]
}

/** 治理覆盖账本的一行（M0）：只有标识与枚举，没有散文。 / One ledger row (M0): identifiers and enums only. */
type LedgerRow = {
  module: string
  object: string
  posture: 'seam' | 'tool-only' | 'gap' | 'exempt'
}

type LedgerTotals = { services: number; seam: number; 'tool-only': number; gap: number; exempt: number }

type Coverage = {
  schema: string
  totals: LedgerTotals
  modules: ({ module: string } & LedgerTotals)[]
  rows: LedgerRow[]
}

type Boundary = {
  schema: string
  coverage: Coverage | null
  computed: {
    scope: { roots: string[]; filesScanned: number; excludedPaths: string[] }
    reads: string
    readsTypes: string[]
    offenders: { file: string; line: number }[]
    verdict: 'ok' | 'violated'
  }
  stated: {
    held: { id: string; holds: string[] }
    notHeld: { id: string; whyHarmlessNow: string; oneBeanAway: boolean }
    paths: PathRow[]
  }
}

/**
 * 矩阵的列顺序 = 记录里 `holds` 关键词表的顺序。是否打勾只看本行自己的 `holds`，这里只决定**排布**。
 *
 * The matrix's column order is the record's `holds` vocabulary; whether a cell ticks is read from the
 * row's own `holds`, so this constant decides layout only.
 */
const CONTROLS = [
  'authorization',
  'identity',
  'confirmation',
  'audit',
  'refusal',
  'side-effect-ledger',
] as const

/** 姿态 → 标签颜色：受治理绿、部分受治理黄、未纳入红。 / posture → tag colour. */
function postureTagType(posture: PathRow['posture']): 'success' | 'warning' | 'danger' {
  if (posture === 'governed') return 'success'
  if (posture === 'partially-governed') return 'warning'
  return 'danger'
}

/** 账本姿态 → 标签颜色：seam 绿、tool-only 黄、gap 红、exempt 灰。 / ledger posture → tag colour. */
function ledgerTagType(posture: LedgerRow['posture']): 'success' | 'warning' | 'danger' | 'info' {
  if (posture === 'seam') return 'success'
  if (posture === 'tool-only') return 'warning'
  if (posture === 'gap') return 'danger'
  return 'info'
}

const boundary = ref<Boundary | null>(null)
const error = ref('')
const missing = ref(false)

/** 按 `posture` 把五条路径归成两个集合：受治理的（含部分）与完全不设防的。
 *  只是分组，不重算 —— 与表格同一份记录。 / Grouped by `posture`; nothing is recomputed. */
const heldPathIds = computed(() =>
  (boundary.value?.stated.paths ?? [])
    .filter((p) => p.posture === 'governed' || p.posture === 'partially-governed')
    .map((p) => p.id)
)
const notHeldPathIds = computed(() =>
  (boundary.value?.stated.paths ?? []).filter((p) => p.posture === 'not-governed').map((p) => p.id)
)
function postureOf(id: string): PathRow['posture'] {
  return (boundary.value?.stated.paths ?? []).find((p) => p.id === id)?.posture ?? 'not-governed'
}

// The UI build lays this file in from the gate's own `--emit`; nothing here recomputes it. `no-store`
// because a console that showed a remembered boundary would be showing a build that is no longer the one
// running. / 这个文件是 UI 构建用门禁自己的 `--emit` 铺进来的，这里不重算；`no-store`，因为一个显示
// 「记住的」边界的控制台，显示的会是不再在跑的那一版。
const SOURCE = '/keelbase-governance-boundary.json'

onMounted(async () => {
  try {
    const res = await fetch(SOURCE, { cache: 'no-store' })
    // A build without the record is a different fact from a failed read, and it is said differently.
    // 构建里没有这份记录，与「读失败」是两件事，故说的也是两句。
    if (res.status === 404) {
      missing.value = true
      return
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    boundary.value = (await res.json()) as Boundary
  } catch {
    error.value = t('keelbase.boundary.loadFailed')
  }
})
</script>

<style scoped>
/* 矩阵有九列（路径 + 姿态 + 六道关 + 缺口），英文关卡名比中文长：表头缩到 12px，避免长单词在 110px 的列里
   被从中间断开（真栈实测过 `authorizatio n`）。只动表头字号与断行，数据与文案未动。
   The matrix has nine columns and the English control names are longer than the Chinese ones: a 12px
   header keeps a long word from breaking mid-word inside a 110px column. Header size only. */
.boundary-matrix :deep(th .cell) {
  font-size: 12px;
  word-break: normal;
}
</style>
