// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 流程抄送在模块自己的接缝上受治理 —— BPM 的**第四个流程面对象**，也是**唯一一个属主是普通业务列**的那个。
 * 请假单的属主是行上的 `user_id`，流程实例与任务的是引擎字段（`startUserId` / `assignee`）；抄送**回到了行上**：
 * `bpm_process_instance_copy.user_id` 就是「被抄送的人」。
 *
 * <p><b>四问的答案（读的是上游这一版的代码）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？**全表**。</b>`getProcessInstanceCopyPage(userId, pageReqVO)` 原样转给
 *       `BpmProcessInstanceCopyMapper.selectPage(userId, reqVO)`（`BpmProcessInstanceCopyServiceImpl:88`），而那条查询
 *       用的是 `eqIfPresent(getUserId, loginUserId)`（`BpmProcessInstanceCopyMapper:15`）—— `userId` 为 null 时
 *       **一个条件都不加**。REST 侧从来不会这么调：控制器传的是 `getLoginUserId()`
 *       （`BpmProcessInstanceCopyController:141`）⇒ 模块自己已经把这条读收窄到登录人。工具路径上没有登录用户，
 *       故本切面只补**身份**：把调用方填进第 0 个实参。</li>
 *   <li><b>按 id 读是否收窄？没有这一扇门。</b>这个 service 只有四条方法：两条 create、一条分页读、一条按流程实例删
 *       （`BpmProcessInstanceCopyService`）。没有 `getCopy(Long)`，所以「按 id 直读」这条争议在本对象上不存在。</li>
 *   <li><b>写是否由父对象 / 引擎带出？是，两条，且都不经工具。</b>其一是**引擎的抄送节点**：
 *       `BpmCopyTaskDelegate.execute` 在流程执行里调 `createProcessInstanceCopy`（仿钉钉/飞书模式的活动才用它）。
 *       其二是**人给抄送**：`BpmTaskServiceImpl:1293` 的 `copyTask`，而它已经被 {@link BpmTaskGovernance} 在工具路径上
 *       整条拒绝（`refuseOutOfScopeActions`）。删除那条（`deleteProcessInstanceCopy`）只从 `BpmModelServiceImpl` 删流程
 *       定义时来，是管理面。
 *       <b>故本切面不点切写，理由是一条实测过的陷阱：</b>抄送节点是在**工具发起的那个流程执行里**扇出的——例如
 *       `approve_oa_leave` 工具审批完一单请假、流程流到抄送节点，`BpmCopyTaskDelegate` 就在**同一个线程、同一个
 *       `ActingCaller`** 下调 `createProcessInstanceCopy`。在那里一刀拒掉，打坏的是引擎自己的扇出，不是某个 AI 动作。
 *       这与 {@link BpmProcessInstanceGovernance} 不点切 `getProcessInstance` 是同一条理由。</li>
 *   <li><b>AI 是否需要直接操作它？读需要，写不需要。</b>抄送是**另一种收件箱**：这些流程不在我的待办里、也不需要我
 *       办，但确实发到了我这里。它与 `list_my_bpm_todos` 是两条不同的业务事实，不是同一条的重复投影。写则相反：
 *       给**别人**加抄送不是「只影响自己」，也没有任何工具面声明它。</li>
 * </ol>
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空，说明这次调用是**工具**发起的：没有请求、
 * 没有登录用户，模块自己的 `@PreAuthorize` 与控制器一条都不经过。请求路径上 {@code current()} 为 null —— REST 侧
 * 控制器已经传了登录人，这里**不做第二遍**。
 *
 * <p><b>收窄口径（声明的收窄）。</b>只认 `user_id`（被抄送人）。这里与模块**相等、不是更严**：模块的 REST 读传的
 * 就是登录人，本切面在工具路径上补的也是同一个值 —— 这正是「模块已自窄、切面只欠身份」那一类（onboarding §4 第 3
 * 条），不是另一个判据。管理员与「范围是全部行」的角色（{@link YudaoModuleScope#callerToEnforce()} 为 null）不被本
 * 切面加码，与其它接缝同一种放过方式。
 *
 * <p>Process-instance copies governed at the module's own seam — BPM's **fourth process-face object**, and the only one
 * whose owner is an ordinary business column. The leave request's owner is the row's `user_id`; instances and tasks take
 * theirs from engine fields (`startUserId` / `assignee`); copies are back on a row: `bpm_process_instance_copy.user_id`
 * is the person copied.
 *
 * <p><b>The four questions, from upstream's code.</b> (1) A page with no filter returns the **whole table**:
 * `getProcessInstanceCopyPage(userId, pageReqVO)` passes straight to the mapper (`BpmProcessInstanceCopyServiceImpl:88`),
 * whose query uses `eqIfPresent(getUserId, loginUserId)` (`BpmProcessInstanceCopyMapper:15`) — with a null id it adds
 * **no condition at all**. The REST path never does that: the controller hands in `getLoginUserId()`
 * (`BpmProcessInstanceCopyController:141`), so the module has already narrowed this read to the signed-in person. The
 * tool path has no signed-in user, so this aspect supplies **identity only** — the caller goes into argument 0.
 * (2) There is **no read by id** to argue about: the service has four methods (two creates, one page, one delete by
 * process instance), no `getCopy(Long)`. (3) Both writes come from a parent and **neither is a tool's**: the engine's
 * copy node (`BpmCopyTaskDelegate.execute` calls `createProcessInstanceCopy` during a process execution, for the
 * DingTalk/Feishu-style copy activity), and a person copying **someone else** (`BpmTaskServiceImpl:1293`'s `copyTask`,
 * already refused outright on the tool path by {@link BpmTaskGovernance}). The delete comes only from
 * `BpmModelServiceImpl` removing a process definition — the admin face.
 * <b>So this aspect does not point-cut a write, for one measured reason:</b> the copy node fans out inside the very
 * process execution a **tool** started — e.g. the `approve_oa_leave` tool approves a leave, the flow reaches a copy
 * node, and `BpmCopyTaskDelegate` calls `createProcessInstanceCopy` on **the same thread with the same `ActingCaller`**.
 * A blanket refusal there breaks the engine's own fan-out, not an AI action — the same reason
 * {@link BpmProcessInstanceGovernance} leaves `getProcessInstance` alone. (4) The AI needs the **read** and not the
 * write: copies are a **different inbox** — instances that were not sent to me to decide, but were sent to me to know
 * about — so this is not a duplicate projection of `list_my_bpm_todos`. Writing, conversely, puts a copy in **someone
 * else's** list, which is not "affects only me", and no tool face declares it.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means the call came from a **tool**: no
 * request, no login user, none of the module's controllers or `@PreAuthorize` runs. On the request path `current()` is
 * null and the module's controller already carries the login user, so this aspect does not check twice.
 *
 * <p><b>Narrowing (declared).</b> `user_id` (the person copied) only, and here it is **equal to the module, not stricter**:
 * the controller hands in the same login user the advice fills in on the tool path — the "module already narrows, the
 * advice owes only identity" case (onboarding §4, item 3), not a second predicate. Administrators and roles ranged over
 * every row ({@link YudaoModuleScope#callerToEnforce()} null) are not added to, the same way every seam leaves them
 * alone.
 */
@Aspect
@Component
public class BpmProcessInstanceCopyGovernance implements GovernedModule {

    private final YudaoModuleScope scope;

    public BpmProcessInstanceCopyGovernance(YudaoModuleScope scope) {
        this.scope = scope;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "bpm";
    }

    /** The recipient is the row's own column. / 收件人是行上自己的那一列。 */
    @Override
    public String ownerField() {
        return "user_id";
    }

    /**
     * 抄送分页：调用方的 id 顶掉第 0 个实参，模块自己按 `user_id` 收束（null ⇒ 全表，正是这里要堵的那条）。
     *
     * The copy page: the caller's id replaces argument 0 and the module scopes by `user_id` itself — null meaning the
     * whole table is exactly what this closes.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceCopyService.getProcessInstanceCopyPage(..))")
    public Object fillCallerIntoPage(ProceedingJoinPoint call) throws Throwable {
        Long caller = toolCallerToEnforce();
        Object[] args = call.getArgs();
        if (caller == null || args.length < 1) {
            return call.proceed();
        }
        Object[] narrowed = args.clone();
        narrowed[0] = caller;
        return call.proceed(narrowed);
    }

    /**
     * The caller a **tool** published, or {@code null} when this call did not come from one. On the request path the
     * module's own controller has already answered, so there is nothing to add there.
     *
     * 工具发布的调用方；不是工具发起的调用则为 {@code null}。请求路径上模块自己的控制器已经回答过，那里没有本切面
     * 要补的东西。
     */
    private Long toolCallerToEnforce() {
        return ActingCaller.current() == null ? null : scope.callerToEnforce();
    }
}
