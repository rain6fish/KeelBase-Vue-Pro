// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskApproveReqVO;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskRejectReqVO;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.springframework.stereotype.Component;

/**
 * 流程任务在模块自己的接缝上受治理 —— BPM 的**第二个流程面对象**，也是**第三种属主读法**。请假单的属主是行上的
 * `user_id`；流程实例的属主是引擎字段 `startUserId`（「谁发起」）；任务**没有发起人**，它有的是**分派人**
 * `assignee`（「谁该办」）——同样是引擎字段、同样是一条字符串。
 *
 * <p><b>四问的答案（读的是上游这一版的代码）。</b>
 *
 * <ol>
 *   <li><b>三个分页在 `userId` 为 null 时各返回什么？**两个收，一个漏**。</b>
 *       `getTaskTodoPage` 与 `getTaskDonePage` 一律加 `taskAssignee(String.valueOf(userId))`；`userId` 为 null 时
 *       `String.valueOf` 得到的是**字符串 `"null"`**，查询照样按它过滤 ⇒ **零行**，不是全表。第三个
 *       `getTaskPage`（「全部」页，管理页 `/manager-page` 用的就是它）**根本不读 `userId`** —— 查询里只有名称、
 *       分类与时间，没有任何分派人条件 ⇒ **无论传谁都返回全表**。**这是唯一的洞**，而且是补不上的那种：把调用方
 *       填进第 0 个实参，它看都不看。故本切面对前两者补实参、对第三个**按返回行再收**，并把 `total` 改写成
 *       「本页留下的行数」——一个**声明过的、按页的**总数，不是表的总数（见 §2.1）。</li>
 *   <li><b>任务 id 从哪来、能不能按 id 直读？判「这个人能不能办」看的是 `assignee` 还是候选人/候选组？</b>
 *       id 来自引擎：分页返回 `Task.getId()`（待办）与 `HistoricTaskInstance.getId()`（已办、全部）。按 id 直读有
 *       两条：`getTask(String)` 是 `TaskService.createTaskQuery().taskId(id)`，`getHistoricTask(String)` 是历史孪生
 *       —— **都没有调用方维度，不收窄**，与流程实例那个对象相同。判据是 **`assignee`**：`validateTask` 比对它；
 *       **不是候选人/候选组**——本模块在**任务创建时**就把候选人策略算成一个人写进 `assignee`
 *       （`BpmUserTaskActivityBehavior` 经 `BpmTaskCandidateInvoker` 取人、`TaskHelper.changeTaskAssignee` 落地），
 *       模块里没有任何一处 `addCandidateUser` / `taskCandidateUser`。故任务一旦存在，它的**审批人就是它的分派人**。
 *       唯一还看 `owner` 的地方是**待办详情**那条读（`getTodoTask` → `isAssignUserTask || isAddSignUserTask`，
 *       即加签任务），分页与 `validateTask` 都不看；本切面只认 `assignee`，加签任务的 `owner` 不在工具面上（见下方
 *       的收窄声明）。</li>
 *   <li><b>审批 / 驳回自己校验 `assignee` 吗？`userId` 是判权还是只记账？** **校验，且只用于判权**。两者第一行都是
 *       `validateTask(userId, reqVO.getId())`，不是本人（且 `assignee` 非空）就抛 `TASK_OPERATE_FAIL_ASSIGN_NOT_SELF`；
 *       `userId` 不进评论、不进状态变量——落库的是**理由文本**，不是「谁批的」。故本切面**不发明第二套判据**，只把
 *       同一个答案提前成 {@link RuleDeniedException}，让 AI 读到「下一步该做什么」（模块异常里没有这一层）。
 *       模块在 **`assignee` 为空时放行**（这是给「无审批人自动通过」留的），而工具路径上那就是**一个没分派给任何人
 *       的任务被人办了**；本切面因此**更严**：必须**恰好等于**调用方，空值同样拒绝。</li>
 *   <li><b>哪些方法明确不该由 AI 触碰？**逐条：**</b>`transferTask`（把任务送进别人的待办）；`delegateTask`（同上，
 *       暂时性地，并给对方发通知）；`createSignTask`（给别人造任务，并把当前任务挪去 `owner`）；`deleteSignTask`
 *       （**批量**取消并删除一棵任务子树）；`returnTask`（把流程倒回上游节点，影响发起人与已经批过的人）；
 *       `moveTaskToEnd`（结束整个流程实例，而且**只收 processInstanceId、根本不收用户**）；`copyTask`（给**别人**
 *       造抄送行，它的 `userId` 入参连读都没读）；`withdrawTask`（把已完成的审批**重新打开**，与回退同类——把流程
 *       往回挪）。这八个在**工具路径上一律拒绝**；请求路径一律不碰（模块自己的控制器与权限已经回答）。
 *       另有若干**不是调用方动作**的系统入口不投影、也不在工具面上：`processTaskCreated` / `processTaskCanceled` /
 *       `processTaskAssigned` / `processTaskCompleted` / `processTaskTimeout` / `processChildProcessTimeout`
 *       （引擎事件钩子）与 `triggerTask`（ReceiveTask 触发器），以及模块内部的扇出读
 *       `getTasksByProcessInstanceIds` / `getTaskMapByProcessInstanceIds`（流程实例那条面正在用它们）、
 *       `getTaskListByProcessInstanceId`（整个实例的历史，不带调用方维度）。</li>
 * </ol>
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空，说明这次调用是**工具**发起的：没有请求、
 * 没有登录用户，模块自己的 `@PreAuthorize` 与控制器一条都不经过。请求路径上 `current()` 为 null —— REST 侧由模块
 * 自己回答（`todo-page` / `done-page` 已传登录人，管理页由 `manager-query` 权限把关），这里**不做第二遍**。
 *
 * <p><b>收窄口径（声明的收窄）。</b>只认 **`assignee`**：加签任务里「`owner` 是我、`assignee` 已置空」的那些，本切面
 * **不当成我的** —— 它们在模块自己的审批界面上照样能办，但工具面不给。管理员与「范围是全部行」的角色
 * （{@link YudaoModuleScope#callerToEnforce()} 为 null）**不被本切面加码**，与其它接缝同一种放过方式。故它比模块
 * **更严、不是等于**。
 *
 * <p>Tasks governed at the module's own seam — BPM's **second process-face object**, and the **third reading of an
 * owner**. The leave request's owner is the column `user_id`; a process instance's is the engine field `startUserId`
 * ("who started it"); a task has no starter — what it has is an **assignee** ("who owes the decision"), another engine
 * field, another string.
 *
 * <p><b>The four questions, from upstream's code.</b> (1) Of the three pages, **two narrow and one leaks**:
 * `getTaskTodoPage` and `getTaskDonePage` always add `taskAssignee(String.valueOf(userId))`, and with a null user id
 * that renders the string `"null"` — a filter that matches nothing, so they answer **zero rows**, never everything.
 * The third, `getTaskPage` (the "all" page its manager screen calls), **never reads `userId` at all**: the query carries
 * name, category and time only, so it answers **the whole table whoever asks**. That is the one hole — and one the
 * argument cannot close, because the module ignores it. So the advice fills the caller in for the first two and
 * **filters the returned page** for the third, rewriting `total` to the rows kept: a **declared, page-local** total,
 * not the table's (§2.1). (2) Task ids come from the engine (the pages hand back `Task.getId()` and
 * `HistoricTaskInstance.getId()`); by id there are `getTask(String)` and its history twin, both bare engine queries
 * with **no caller dimension and no narrowing**, as with the instance object. The question "may this person act" is
 * answered by **`assignee`** — `validateTask` compares it — and **not** by candidate users or groups: this module
 * resolves the candidate strategy into one person **at task creation** (`BpmUserTaskActivityBehavior` via
 * `BpmTaskCandidateInvoker`, written by `TaskHelper.changeTaskAssignee`) and never calls `addCandidateUser` /
 * `taskCandidateUser`. The only place `owner` also counts is the **todo detail** read (`getTodoTask` →
 * `isAssignUserTask || isAddSignUserTask`, i.e. sign tasks); the pages and `validateTask` do not look at it, and this
 * aspect recognises `assignee` alone. (3) Approval and rejection **do check the assignee**, and the user id is used
 * **only** for that check: both start with `validateTask(userId, reqVO.getId())` and throw
 * `TASK_OPERATE_FAIL_ASSIGN_NOT_SELF`; the id enters neither the comment nor the status variables — what is recorded
 * is the **reason text**. So this aspect invents no second predicate; it raises the same answer early as a
 * {@link RuleDeniedException}, because the module's exception carries no reason / impact / nextStep. The module
 * **lets a blank `assignee` through** (the auto-approve path), which on the tool path means an unassigned task being
 * decided by anyone; this aspect is therefore **stricter**: the caller must be **exactly** the assignee, blank
 * included. (4) Not for the AI, one by one: `transferTask` (another inbox), `delegateTask` (same, temporarily, plus a
 * notice), `createSignTask` (tasks for others, current one moved to `owner`), `deleteSignTask` (a **batch** cancel and
 * delete of a task subtree), `returnTask` (the flow moves backwards, to the starter and everyone who already
 * approved), `moveTaskToEnd` (ends the whole instance, and takes **no user at all**), `copyTask` (copy rows for
 * **others**; its `userId` parameter is never even read), `withdrawTask` (re-opens a completed approval — the same
 * class as a return). All eight are **refused on the tool path** and left alone on the request path. The engine
 * event hooks and `triggerTask`, and the module's internal fan-out reads, are neither projected nor on a tool face.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means the call came from a **tool**:
 * no request, no login user, none of the module's controllers or `@PreAuthorize` runs. On the request path the module
 * answers for itself (its todo and done pages already carry the login user, its manager page is gated by
 * `manager-query`), and this aspect does **not** check twice.
 *
 * <p><b>Narrowing (declared).</b> `assignee` only: a sign task whose `assignee` has been cleared and whose `owner` is
 * the caller is **not** treated as theirs here — the module's own screens still let them act on it, this face does not.
 * Administrators and roles ranged over every row ({@link YudaoModuleScope#callerToEnforce()} null) are not added to,
 * the same way every seam leaves them alone. So it is **stricter than the module, not equal to it**.
 */
@Aspect
@Component
public class BpmTaskGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final TaskService engineTasks;

    public BpmTaskGovernance(YudaoModuleScope scope, TaskService engineTasks) {
        this.scope = scope;
        this.engineTasks = engineTasks;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "bpm";
    }

    /** The approver lives on the engine's task, spelled `assignee`. / 分派人住在引擎任务上，拼作 `assignee`。 */
    @Override
    public String ownerField() {
        return "assignee";
    }

    /**
     * 待办与已办：调用方的 id 顶掉第 0 个实参，模块自己按 `taskAssignee` 收束。
     *
     * The todo and done pages: the caller's id replaces argument 0, and the module scopes by `taskAssignee` itself.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.getTaskTodoPage(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.getTaskDonePage(..))")
    public Object fillCallerIntoPage(ProceedingJoinPoint call) throws Throwable {
        Long caller = toolCallerToEnforce();
        Object[] args = call.getArgs();
        if (caller == null || args.length < 2) {
            return call.proceed();
        }
        Object[] narrowed = args.clone();
        narrowed[0] = caller;
        return call.proceed(narrowed);
    }

    /**
     * 「全部」页：模块**完全不读** `userId`，实参填了也没用，故只能按返回行再收。留下的行是本页里分派给调用方的那些
     * （加签里 `owner` 是调用方、`assignee` 已置空的**不算**）；`total` 随之改写成**本页留下的行数**——它是**按页的**
     * 总数，不是表的总数。
     *
     * The "all" page: the module **never reads** `userId`, so filling the argument changes nothing and the returned
     * rows are what is left to narrow. The rows kept are this page's tasks assigned to the caller (a sign task whose
     * `assignee` is cleared and whose `owner` is the caller does **not** count); `total` becomes the rows kept — a
     * **page-local** total, not the table's.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.getTaskPage(..))")
    public Object keepOnlyCallersRows(ProceedingJoinPoint call) throws Throwable {
        Object page = call.proceed();
        Long caller = toolCallerToEnforce();
        if (caller == null || !(page instanceof PageResult<?> result)) {
            return page;
        }
        List<?> rows = result.getList();
        List<?> mine = rows.stream()
                .filter(row -> row instanceof HistoricTaskInstance task
                        && scope.belongsToCaller(task.getAssignee(), caller))
                .toList();
        return new PageResult<>(mine, (long) mine.size());
    }

    /**
     * 审批通过：模块自己也比对 `assignee`，这里把同一个答案提前成运行时的拒绝形状——并且比模块**更严**：模块在
     * `assignee` 为空时放行（自动通过那条路），工具路径上空值同样拒绝。
     *
     * Approval: the module already compares the assignee; this raises the same answer early, as the runtime's refusal
     * shape — and is **stricter** than the module, which lets a blank assignee through for its auto-approve path.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.approveTask(..))")
    public Object requireAssigneeForApproval(ProceedingJoinPoint call) throws Throwable {
        return requireAssignee(call, "approveTask");
    }

    /** Rejection: the same door as approval. / 驳回：与审批同一扇门。 */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.rejectTask(..))")
    public Object requireAssigneeForRejection(ProceedingJoinPoint call) throws Throwable {
        return requireAssignee(call, "rejectTask");
    }

    /**
     * 那八个不该由 AI 执行的动作：工具路径上拒绝，请求路径原样放行。
     *
     * The eight actions the AI does not perform: refused on the tool path, untouched on the request path.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.transferTask(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.delegateTask(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.createSignTask(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.deleteSignTask(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.returnTask(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.moveTaskToEnd(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.copyTask(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.withdrawTask(..))")
    public Object refuseOutOfScopeActions(ProceedingJoinPoint call) throws Throwable {
        if (toolCallerToEnforce() == null) {
            return call.proceed();
        }
        String action = call.getSignature().getName();
        throw new RuleDeniedException(null, "这个动作不由 AI 执行", "BpmTask", action, nextStepFor(action));
    }

    /**
     * The refusal, per action: what it changes for someone else, and where a person does it instead. The eight share
     * one shape but not one sentence — an executable error names the next step, and "not allowed" alone is not one.
     *
     * 逐个动作的拒绝理由：它给别人或整个流程改了什么，以及人该去哪里做。八个动作同一种形状、不同一句话——可执行的
     * 错误要说出下一步，光一句「不允许」不算。
     */
    private static String nextStepFor(String action) {
        return switch (action) {
            case "transferTask", "delegateTask" ->
                    "转办与委派会把任务送进别人的待办；请在审批界面上由本人操作";
            case "createSignTask", "deleteSignTask" ->
                    "加签与减签会为别人增删任务；请在审批界面上由本人操作";
            case "returnTask", "withdrawTask" ->
                    "回退与撤回会把流程往回挪，影响发起人与已经批过的人；请在审批界面上由本人操作";
            case "moveTaskToEnd" ->
                    "它直接结束整个流程实例、且不区分是谁；请由流程管理员在流程详情里处理";
            case "copyTask" ->
                    "抄送会给别人新增抄送记录；请在审批界面上由本人操作";
            default ->
                    "这个动作会改动别人的待办或整个流程；请在模块自己的审批界面上由本人操作";
        };
    }

    /** The shared door: the caller must be the task's `assignee`, exactly. / 同一扇门：调用方必须**恰好**是该任务的分派人。 */
    private Object requireAssignee(ProceedingJoinPoint call, String action) throws Throwable {
        Long caller = toolCallerToEnforce();
        if (caller == null) {
            return call.proceed();
        }
        String taskId = taskIdOf(call.getArgs());
        if (taskId == null) {
            // 模块自己的校验会点名缺 id，这里不抢它的话。/ The module's own validation names a missing id; not taken here.
            return call.proceed();
        }
        Task task = engineTasks.createTaskQuery().taskId(taskId).singleResult();
        if (task != null && !scope.belongsToCaller(task.getAssignee(), caller)) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", "BpmTask", action,
                    "只能办理分派给自己的任务；别人的待办请由分派人改派，或在审批界面上由本人处理");
        }
        // 查不到任务时交回模块：它已有 TASK_NOT_EXISTS 这个码。/ A missing task goes back to the module, which owns that code.
        return call.proceed();
    }

    /** The task id sits at argument 1 behind the user id, in a request VO that both writes share by name only. */
    private static String taskIdOf(Object[] args) {
        if (args.length < 2) {
            return null;
        }
        if (args[1] instanceof BpmTaskApproveReqVO approve) {
            return approve.getId();
        }
        if (args[1] instanceof BpmTaskRejectReqVO reject) {
            return reject.getId();
        }
        return null;
    }

    /**
     * The caller a **tool** published, or {@code null} when this call did not come from one. On the request path the
     * module's own controllers and {@code @PreAuthorize} have already answered, so there is nothing to add there.
     *
     * 工具发布的调用方；不是工具发起的调用则为 {@code null}。请求路径上模块自己的控制器与 {@code @PreAuthorize} 已经回答
     * 过，那里没有本切面要补的东西。
     */
    private Long toolCallerToEnforce() {
        return ActingCaller.current() == null ? null : scope.callerToEnforce();
    }
}
