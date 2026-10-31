// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCancelReqVO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.springframework.stereotype.Component;

/**
 * 流程实例在模块自己的接缝上受治理 —— BPM 的**第一个流程面对象**。请假单（{@link BpmOALeaveGovernance}）的属主是行上的
 * `user_id`；流程实例**没有这一列**：它住在引擎表里，而「谁发起的」是引擎自己的字段 `startUserId`（字符串）。
 *
 * <p><b>四问的答案（读的是上游这一版的代码）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>**全表**。`getProcessInstancePage(userId, pageReqVO)` 只在 `userId` 非空时加
 *       `startedBy(userId)`，否则看 `pageReqVO.startUserId`；两者都为 null 时**一个条件都不加**。管理页
 *       （`/manager-page`）正是这么调的：传 null。故在工具路径上，调用方的 id 被补进第 0 个实参——「没有过滤」在
 *       AI 路径上不再等于「全部行」。</li>
 *   <li><b>按 id 读是否收窄？</b>否。`getProcessInstance(String)` 与 `getHistoricProcessInstance(String)` 都是裸的
 *       引擎查询，没有调用方维度；发起人字段是 `startUserId`。本切面在工具路径上把别人的实例**交回 null**，与不存在
 *       同形。</li>
 *   <li><b>撤回校验发起人吗？</b>模块**自己校验**：`cancelProcessInstanceByStartUser` 比
 *       `Objects.equals(instance.getStartUserId(), String.valueOf(userId))`，不是本人就抛
 *       `PROCESS_INSTANCE_CANCEL_FAIL_NOT_SELF`；`userId` 只用于这条判断，不进审计（审计里只有理由文本）。故工具路径
 *       上这里**不重复发明判据**，只把同一个问题的答案提前成 {@link RuleDeniedException}——模块的异常没有
 *       reason / impact / nextStep，AI 侧读不到「下一步该做什么」。</li>
 *   <li><b>哪些方法不该由 AI 触碰？</b>`createProcessInstance`（起流程，留给模块自己的 REST 路径）；
 *       `cancelProcessInstanceByAdmin`（管理员的撤回，宿主级操作）；`updateProcessInstanceReject`（引擎事件里的
 *       不通过处理）；`updateProcessInstanceVariables` / `removeProcessInstanceVariables`（写流程变量，含表单数据）；
 *       `processProcessInstanceCompleted` / `processProcessInstanceCreated`（引擎事件钩子，不是调用方动作）；
 *       `getApprovalDetail` / `getNextApprovalNodes` / `getProcessInstanceBpmnModelView`（读的是**变量与表单内容**，
 *       本对象的工具面刻意不投影）；以及两个批量读 `getProcessInstances` / `getHistoricProcessInstances`（模块内部的
 *       扇出，收窄会饿死调用它们的人，且不在工具面上）。</li>
 * </ol>
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空，说明这次调用是**工具**发起的：没有请求、
 * 没有登录用户，模块自己的 `@PreAuthorize` 与控制器一条都不经过。请求路径上 {@code current()} 为 null——REST 侧
 * 由模块自己回答（`/my-page` 已传登录人、管理页由 `manager-query` 权限把关），这里**不做第二遍**。还有一条更要紧的
 * 理由：`getProcessInstance` 是引擎内部的**扇出读**——候选人策略、任务监听器、抄送服务都在审批过程中用它读**发起人**
 * 的实例；在请求路径上按 `startUserId` 收窄它，会让**审批人**的每次审批都读到 null。故按 id 读的收束只发生在工具
 * 路径上，那里没有引擎扇出。
 *
 * <p><b>收窄口径（声明的收窄）。</b>读与撤回都只认**发起人**（`startUserId`）。模块允许审批人、管理员看别人的实例，
 * 那是流程引擎的用途；本切面在工具面上不放宽到审批人，故它**比模块更严、不是等于**。要走审批，走模块自己的 REST
 * 界面。这是本对象欠的那句「声明的收窄」。
 *
 * <p>Process instances governed at the module's own seam — BPM's **first process-face object**. The leave request's
 * owner is a column (`user_id`); a process instance has none: it lives in the engine's tables, and "who started it" is
 * the engine's own field `startUserId` (a string).
 *
 * <p><b>The four questions, from upstream's code.</b> (1) A page with no filter returns the **whole table**:
 * `getProcessInstancePage` adds `startedBy` only when `userId` is non-null, otherwise it reads `pageReqVO.startUserId`,
 * and with both null it adds **no condition at all** — which is exactly how `/manager-page` calls it. On the tool path
 * the caller's id fills argument 0, so "no filter" stops meaning "every row". (2) A read by id is **not** narrowed:
 * both single-id reads are bare engine queries, and the starter is `startUserId`. On the tool path another's instance
 * is handed back as `null`, the same answer as a missing one. (3) Withdrawal **already checks the starter**: the module
 * compares `instance.getStartUserId()` with `String.valueOf(userId)` and throws
 * `PROCESS_INSTANCE_CANCEL_FAIL_NOT_SELF`; `userId` is used for that check only and never enters the audit. So this
 * aspect invents no second predicate — it only raises the same answer as a {@link RuleDeniedException} before the call,
 * because the module's exception carries no reason / impact / nextStep for the AI to act on. (4) Not for the AI:
 * `createProcessInstance`, `cancelProcessInstanceByAdmin`, `updateProcessInstanceReject`,
 * `updateProcessInstanceVariables` / `removeProcessInstanceVariables`, the two engine event hooks,
 * `getApprovalDetail` / `getNextApprovalNodes` / `getProcessInstanceBpmnModelView` (they expose variables and form
 * content), and the two bulk reads (an internal fan-out, and not on the tool face).
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means the call was made by a **tool**:
 * no request, no login user, so none of the module's controllers or `@PreAuthorize` runs. On the request path the
 * module answers for itself (its "my" page already carries the login user, its manager page is gated by
 * `manager-query`), and this aspect does **not** check twice. There is a stronger reason too: `getProcessInstance` is
 * an **engine fan-out read** — candidate strategies, task listeners and the copy service call it during an approval to
 * read the **starter's** instance; narrowing it by `startUserId` on the request path would make every approver read
 * `null`. So the by-id narrowing happens only on the tool path, where no engine fan-out runs.
 *
 * <p><b>Narrowing (declared).</b> Reads and withdrawal are for the **starter** only. The module lets approvers and
 * administrators see other people's instances — that is what the engine is for — and this aspect deliberately does not
 * widen to approvals on the tool face, so it is **stricter than the module, not equal to it**. Approvals go through the
 * module's own REST screens. That is this object's sentence, owed once per module.
 */
@Aspect
@Component
public class BpmProcessInstanceGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final RuntimeService runtime;

    public BpmProcessInstanceGovernance(YudaoModuleScope scope, RuntimeService runtime) {
        this.scope = scope;
        this.runtime = runtime;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "bpm";
    }

    /** The starter lives on the engine's instance, spelled `startUserId`. / 发起人住在引擎实例上，拼作 `startUserId`。 */
    @Override
    public String ownerField() {
        return "start_user_id";
    }

    /**
     * 分页：调用方的 id 顶掉第 0 个实参。`userId` 为 null 时模块**不加任何条件**（管理页就是这么调的），故补上之后
     * 「没过滤」在工具路径上不再等于「全部行」；`pageReqVO.startUserId` 也随之失效（模块只在 userId 为 null 时才看它）。
     *
     * The page: the caller's id replaces argument 0. With a null `userId` the module adds **no condition** (that is how
     * its manager page calls it), so supplying it stops "no filter" from meaning "every row" on the tool path; the
     * request's own `startUserId` falls away too, since the module reads it only when `userId` is null.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceService.getProcessInstancePage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
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
     * 按 id 读（运行中与历史各一条）：别人的实例**交回 null**，与「不存在」同形。只在工具路径上做——引擎内部用它读
     * 发起人的实例，收窄会打断审批，见类注释。
     *
     * A read by id (the running and the historic form): another's instance comes back as `null`, the same answer as a
     * missing one. Tool path only — the engine fans out through this read during approvals, see the class comment.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceService.getProcessInstance(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceService.getHistoricProcessInstance(..))")
    public Object withholdOthersInstance(ProceedingJoinPoint call) throws Throwable {
        Object instance = call.proceed();
        Long caller = toolCallerToEnforce();
        String starter = starterOf(instance);
        if (caller != null && starter != null && !scope.belongsToCaller(starter, caller)) {
            return null;
        }
        return instance;
    }

    /**
     * 撤回：模块自己已经比对发起人，这里把同一个答案提前成运行时的拒绝形状，让 AI 读到可执行的下一步。工具路径之外
     * （REST）原样放行——模块自己的检查就在它里面。
     *
     * Withdrawal: the module already compares the starter; this raises the same answer early, as the runtime's refusal
     * shape, so the AI has a next step to act on. Outside the tool path the call passes through — the module's own
     * check sits inside it.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceService.cancelProcessInstanceByStartUser(..))")
    public Object requireStarter(ProceedingJoinPoint call) throws Throwable {
        Long caller = toolCallerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[1] instanceof BpmProcessInstanceCancelReqVO request) {
            ProcessInstance instance = runtime.createProcessInstanceQuery()
                    .processInstanceId(request.getId())
                    .singleResult();
            if (instance != null && !scope.belongsToCaller(instance.getStartUserId(), caller)) {
                throw new RuleDeniedException(null, "该行不在你的数据范围内",
                        "BpmProcessInstance", "cancelProcessInstanceByStartUser",
                        "只能撤回自己发起的流程；别人发起的流程由发起人撤回，或请管理员在控制台处理");
            }
        }
        return call.proceed();
    }

    /**
     * The caller a **tool** published, or {@code null} when this call did not come from one. On the request path the
     * module's own controllers and `@PreAuthorize` have already answered, and the engine's internal reads must keep
     * seeing every instance — so there is nothing for this aspect to add there.
     *
     * 工具发布的调用方；不是工具发起的调用则为 {@code null}。请求路径上模块自己的控制器与 `@PreAuthorize` 已经回答过，
     * 引擎内部的读又必须能看见每一个实例——那里没有本切面要补的东西。
     */
    private Long toolCallerToEnforce() {
        return ActingCaller.current() == null ? null : scope.callerToEnforce();
    }

    private static String starterOf(Object instance) {
        if (instance instanceof ProcessInstance running) {
            return running.getStartUserId();
        }
        if (instance instanceof HistoricProcessInstance historic) {
            return historic.getStartUserId();
        }
        return null;
    }
}
