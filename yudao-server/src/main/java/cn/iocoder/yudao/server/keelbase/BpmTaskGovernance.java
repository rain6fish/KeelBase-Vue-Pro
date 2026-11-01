// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * BPM 的任务在**模块自己的接缝上**受治理 —— 流程面的**第二个对象**，与流程实例同一台机器、**另一个字段**：实例的属主是
 * `startUserId`，任务的是引擎的 `assignee`（以及转办/委派后记着原审批人的 `owner`）。
 *
 * <p><b>六问的答案（读的是上游这一版的代码）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>`getTaskPage(Long userId, …)`（`BpmTaskServiceImpl:265`）的**第 0 个实参从头到尾没被读过**
 *       —— 方法体只按 `name` / `category` / 租户筛，`userId` 一次都没用。`BpmTaskPageReqVO` 里也**没有受理人字段**：受理人
 *       筛选位就是那个被丢掉的实参。故它返回**整张历史任务表**（按租户），而调用它的 `/manager-page` 只靠
 *       `@PreAuthorize('bpm:task:manager-query')` 把关。相邻两个分页**已经自窄**：`getTaskTodoPage` 与 `getTaskDonePage`
 *       都拿第 0 个实参去做 `taskAssignee(String.valueOf(userId))`。</li>
 *   <li><b>按 id 读是否收窄？</b>否。`getTask` / `getHistoricTask`（`:338` / `:343`）是裸引擎查询，且都带
 *       `includeTaskLocalVariables` —— 读回来的不只是一条待办，还有它上面的 `status` / `reason` / 签字图片地址。谁能看一条任务，
 *       模块自己的答案是**受理人或拥有人**（`isAssignUserTask` / `isOwnerUserTask`，`:541` / `:553`，`getTodoTask` 用的就是这一对）。</li>
 *   <li><b>创建任务的 VO 能让客户端指认别人吗？</b>**没有「创建任务」这条路**：任务由引擎生成。客户端能指认别人的地方只有加签 /
 *       转办 / 委派 / 抄送的目标用户（`BpmTaskSignCreateReqVO.userIds`、`…TransferReqVO.assigneeUserId`、`…DelegateReqVO.delegateUserId`、
 *       `…CopyReqVO.copyUserIds`）—— 那是这几个动作**本身的用途**，不是可伪造的属主字段。</li>
 *   <li><b>按 id 的写各自查什么？</b>完成 / 不通过 / 退回 / 转办 / 委派 / 加签都先过 `validateTask(userId, id)`（`:317`）：
 *       受理人非空且不是自己 ⇒ `TASK_OPERATE_FAIL_ASSIGN_NOT_SELF`；受理人为空时放行（无审批人的自动通过策略要把 `userId` 传 null）。
 *       撤回**自己**的已办：`withdrawTask` 自己按 `.taskAssignee(userId).finished()` 查（`:1302`）。**两处例外**：`deleteSignTask`
 *       （`:1260`）只调 `validateTaskCanSignDelete(id)`、**根本没看 `userId`**；`copyTask`（`:1292`）连存在都不校验，`userId` 也没用。</li>
 *   <li><b>哪些方法必须排除在切点外？</b>见下面「排除名单」。</li>
 *   <li><b>AI 是否要直接操作任务？</b>不要。审批是人的责任：完成 / 不通过 / 退回都要看流程模型给这一节点的表单、按钮与理由要求
 *       （`getTodoTask` 才拼得出），而这些内容本面的工具**刻意不投影**；转办 / 委派 / 加签是把一件事交到**另一个人**手上，
 *       同样是人的判断。工具面因此**只开一条读**（`list_my_bpm_tasks`），写一条都不开 —— 理由见 `BpmTaskTools` 的类注释。</li>
 * </ol>
 *
 * <p><b>排除名单，逐条带理由。</b>
 * <ul>
 *   <li>`processTaskCreated` / `processTaskCanceled` / `processTaskAssigned` / `processTaskCompleted` / `processTaskTimeout` /
 *       `processChildProcessTimeout` / `triggerTask`：引擎事件钩子，不是调用方动作；它们是 `BpmTaskEventListener` 在**同一次事务里**
 *       回调进来的，收窄它们等于改引擎的记账。</li>
 *   <li>`getTask` / `getHistoricTask`：**这是本对象的扇出读，而且扇出就发生在工具路径上**。`processTaskCanceled` 用 `getTask(taskId)`
 *       读**下一节点（别人）**的任务来更新状态（`:1465`），`processTaskCreated` / `processTaskAssigned` 的事务回调也读它
 *       （`:1426` / `:1501`）；一次工具发起的撤回或结束流程，会同步把这两个监听器带起来。按受理人收窄它，会让别人那条任务
 *       「查不到」⇒ 状态更新被静默跳过（那里只是 `log.error` 后 return）。故它**不在切点里** —— 这与流程实例那条
 *       `getProcessInstance` 的结论相反，而相反的原因正是「扇出跑不跑在工具路径上」。</li>
 *   <li>`validateTask` / `validateTaskExists`：模块自己的判据，且 `validateTask` 收的就是 `userId`；切面不发明第二套。</li>
 *   <li>`getTasksByProcessInstanceIds` / 默认方法 `getTaskMapByProcessInstanceIds`：`BpmProcessInstanceTools` 的
 *       `currentTaskName` 借它们读**所有**任务名；在工具路径上按 `assignee` 收窄会把这个读**饿死**（那张表里全是别人的任务）。
 *       CGLIB 下默认方法里的 `this` 就是代理，故连 `getTaskMapByProcessInstanceIds` 一起排除。单测钉住了这一条。</li>
 *   <li>`getTaskListByProcessInstanceId` / `getRunningTaskListByProcessInstanceId` /
 *       `getFinishedTaskListByProcessInstanceIdWithoutCancel` / `getAllChildrenTaskListByParentTaskId` / `getTaskListByParentTaskId`
 *       / `getActivityListByProcessInstanceId` / `getHistoricActivityListByExecutionId` / `getAttachments`：模块内部扇出与装配读。</li>
 *   <li>`moveTaskToEnd`：`rejectTask` 与流程实例撤回内部会调它，不是独立动作。</li>
 *   <li>全部写方法：本面没有写工具（见第六问）。它们**不收窄**不是遗漏 —— 模块自己的 `validateTask(userId, …)` 已经是同一句判据；
 *       而 `deleteSignTask` 与 `copyTask` 那两处**模块漏掉的**判据，本切面不替它编：那是 REST 面上 `bpm:task:update` 之下的一处
 *       上游缺口，写在这里只会是一个没人能执行到的承诺。已如实记在交接件里。</li>
 * </ul>
 *
 * <p><b>声明的收窄。</b>读侧问的就是**模块 controller 自己那一句权限**（`/todo-page`、`/done-page` 是 `bpm:task:query`，
 * `/manager-page` 是 `bpm:task:manager-query`），故它**与模块相等、不更严也不更宽**；行范围上的收窄由模块自己做（待办/已办按
 * `assignee`），管理页**不**按人过滤 —— 那是「全部任务」这个页面的意思，按人收窄会把它变成一句谎话。**今天**本对象的工具面只有
 * 一条读（我的待办），管理页那条通知是为「以后任何工具问全部任务」留的门：它不能比 REST 更松。
 *
 * <p><b>只在工具路径上工作。</b>`ActingCaller` 只由持有运行时 `Principal` 的工具发布；宿主自己的请求路径上它是空的，而那条路径上
 * `@PreAuthorize` 已经问过同一句。故 `ActingCaller` 为空时原样放行：REST 行为与上游一字不差。
 *
 * <p>BPM tasks governed at the module's own seam — the process face's **second object**, on the same machine as process
 * instances but keyed on a different field: an instance's owner is `startUserId`, a task's is the engine's `assignee`
 * (plus `owner`, the original approver after a transfer or delegation).
 *
 * <p><b>The six answers, from upstream's code.</b> (1) `getTaskPage(Long userId, …)` (`BpmTaskServiceImpl:265`) **never
 * reads its first argument**: the body filters by name, category and tenant only, and `BpmTaskPageReqVO` has no assignee
 * field — the assignee filter is that dropped argument. So it returns the whole historic-task table (per tenant), held
 * only by `@PreAuthorize('bpm:task:manager-query')` on `/manager-page`. Its two neighbours already narrow themselves:
 * the todo and done pages pass the same argument into `taskAssignee(String.valueOf(userId))`. (2) Reads by id are not
 * narrowed: `getTask` / `getHistoricTask` (`:338` / `:343`) are bare engine queries **with task local variables** —
 * status, reason and signature image come back with the task. The module's own answer to "who may see a task" is its
 * assignee or its owner (`isAssignUserTask` / `isOwnerUserTask`, `:541` / `:553`). (3) There is **no create-a-task VO**:
 * tasks are created by the engine. A client can name other users only as the *target* of sign / transfer / delegate /
 * copy — what those actions are for, not a forgeable owner field. (4) Every by-id write except two goes through
 * `validateTask(userId, id)` (`:317`): assignee non-blank and not the caller is refused; a blank assignee is allowed
 * because the auto-approve strategy passes a null user. Withdrawal checks `.taskAssignee(userId).finished()` itself
 * (`:1302`). The two exceptions: `deleteSignTask` (`:1260`) calls `validateTaskCanSignDelete(id)` and **never looks at
 * `userId`**, and `copyTask` (`:1292`) checks nothing at all. (5) The exclusions are listed above, each with its reason.
 * (6) The AI should **not** operate tasks. Approving is a human's job: the form, buttons and reason requirement for the
 * node come from `getTodoTask`, which this face deliberately does not project, and transferring, delegating or adding a
 * signer hands the work to another person — also a human's call. So the face opens **one read** and no write.
 *
 * <p><b>The exclusions, with reasons.</b> The engine event hooks are not caller actions and are invoked back through
 * `BpmTaskEventListener` **inside the same transaction**. `getTask` / `getHistoricTask` are this object's fan-out read and
 * **the fan-out happens on the tool path**: `processTaskCanceled` reads the *next* node's (someone else's) task to update
 * its status (`:1465`), and the create/assign transaction callbacks read it too (`:1426` / `:1501`). A tool-initiated
 * withdrawal or rejection raises those listeners synchronously, so narrowing by assignee would make that task "missing" and
 * the status update would be silently skipped (there it only logs and returns). That is the opposite conclusion to the
 * process-instance `getProcessInstance`, and the difference is exactly whether the fan-out runs on the tool path.
 * `getTasksByProcessInstanceIds` and the default `getTaskMapByProcessInstanceIds` are what `BpmProcessInstanceTools`
 * borrows to read **every** task's name; narrowing them by assignee would starve that read, and under CGLIB `this` inside
 * the default method is the proxy — so both are excluded and a unit test pins it. `validateTask*` are the module's own
 * predicate; `moveTaskToEnd` is an internal step; the remaining bulk reads are internal fan-outs and assemblies. The
 * write methods are not cut because this face opens no write tool, and the module's own `validateTask(userId, …)` is
 * already that same question. The two places the module forgets it (`deleteSignTask`, `copyTask`) are upstream's hole
 * under `bpm:task:update` on the REST path; an advice here would be a promise nothing can reach, so it is reported in the
 * hand-off instead of written down as code.
 *
 * <p><b>Declared narrowing.</b> On reads it asks the very permission code the module's own controller asks — `bpm:task:query`
 * for the todo and done pages, `bpm:task:manager-query` for the manager page — so it is **equal to the module, no stricter
 * and no wider**. The row scope is the module's own (todo and done filter by `assignee`); the manager page is deliberately
 * **not** filtered per caller, because "all tasks" is what that page means and narrowing it would make the answer a lie.
 * Today this object's tool face has one read (my todo list); the manager-page advice is the door for any later tool that
 * asks for every task, and it must not be looser than REST.
 *
 * <p><b>It acts on the tool path only.</b> {@code ActingCaller} is published only by a tool holding the runtime's
 * {@code Principal}; on the host's request path it is empty, and there `@PreAuthorize` has already asked the same
 * question. So the advice lets anything through when it is empty: REST behaviour is exactly upstream's.
 */
@Aspect
@Component
public class BpmTaskGovernance implements GovernedModule {

    private final YudaoToolPermissions permissions;

    public BpmTaskGovernance(YudaoToolPermissions permissions) {
        this.permissions = permissions;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "bpm";
    }

    /** The engine's task field, not a column on this host's own table. / 引擎的任务字段，不是本宿主自己表上的列。 */
    @Override
    public String ownerField() {
        return "assignee";
    }

    /**
     * 三个读，各按模块 controller 上那一条权限码收束。一条通知而不是三条，因为这是**同一个问题**——不同的只是权限码，而权限码
     * 从点切已经点名的那个方法名读出来。
     *
     * <p>The three reads, each held to the permission code its own controller names. One advice rather than three, because
     * the question is one question — only the code differs, and it is read off the method name the pointcut already names.
     */
    @Around("execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.getTaskTodoPage(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.getTaskDonePage(..))"
            + " || execution(* cn.iocoder.yudao.module.bpm.service.task.BpmTaskService.getTaskPage(..))")
    public Object requireReadPermission(ProceedingJoinPoint call) throws Throwable {
        String caller = ActingCaller.current();
        if (caller == null) {
            // The host's own request path: @PreAuthorize on the controller has already asked this.
            // 宿主自己的请求路径：controller 上的 @PreAuthorize 已经问过这一句。
            return call.proceed();
        }
        String action = call.getSignature().getName();
        String permission = permissionFor(action);
        String refusal = permissions.refusal(caller, permission);
        if (refusal != null) {
            throw new RuleDeniedException(null, refusal, "BpmTask", action,
                    "该工具调用要求 '" + permission + "' 权限；请改用持有该权限的身份，或让管理员补齐授权");
        }
        return call.proceed();
    }

    /**
     * 这个方法在模块自己的 controller 上对应哪一条权限码 —— 同一套词表，不是两套。管理页是「全部任务」，故它自己的那一句是
     * `manager-query`；待办与已办是 `query`。
     *
     * The permission code this method's endpoint names in the module's own controller — one vocabulary, not two. The
     * manager page is "all tasks", so it names `manager-query`; the todo and done pages name `query`.
     */
    static String permissionFor(String method) {
        return switch (method) {
            case "getTaskPage" -> "bpm:task:manager-query";
            default -> "bpm:task:query";
        };
    }
}
