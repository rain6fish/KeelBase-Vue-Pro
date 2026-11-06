// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService;
import java.util.Collections;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pms 在**工作项动态**上的接缝——本线的**第二种形态**：按标识符读一条，属主事后判。
 *
 * <p><b>为什么这一处要接。</b>动态的读口是 `getWorkItemActivityList(Long workItemId)`：它**不收调用方**，也不判任何权限。
 * 控制台那条 REST 路径之所以安全，是因为 controller 在调用它**之前**自己先问了 `workItemService.getWorkItem(workItemId,
 * getLoginUserId())`；而工具路径没有 controller，直接调 service ⇒ 一条动态都不判权就能读到任何项目的工作项动态。本切面把
 * 那次「先问工作项能不能读」搬进 service 这一层，于是两条路径共享同一道判据，而不是各写一份。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>动态行上有一个 `operator_user_id`（操作人），但**它不是可见性的答案**：能看到哪些动态，由
 *       工作项所属项目**是不是私有、以及调用方是不是成员**回答（`PmsProjectMemberServiceImpl.validateProjectReadable`：
 *       公开项目人人可读，私有项目要成员或超级管理员）。故 {@link #ownerField()} 报的不是某一列。</li>
 *   <li><b>分页怎么收。</b>没有分页。这个读口按工作项取整列表，没有页码、没有 `total`，故不存在「分页没有属主位」的问题。</li>
 *   <li><b>按 id 读是否收窄。</b>**不收**——这正是要补的那一处。切面在工具路径上先读工作项、判可读，再放行原读。</li>
 *   <li><b>写查什么权限。</b>本面是只读的。动态的写口（`createWorkItemActivity` 等）由模块内部在已判权的业务动作里调用，
 *       不收调用方；本切面**不点切**它们，也不给它们造一个工具面——没有属主参数的写口接不出「谁在写」。</li>
 * </ol>
 *
 * <p><b>别人的工作项与不存在的工作项同一个答案。</b>两者都交回**空表**：判不出来就不作答，而不是先把区别漏出去。这与
 * 模块自己的 REST 回答不同（那里一个是 403、一个是 404），故本面是**声明的收窄**：控制台如实说出「不是你的」，工具面不说。
 *
 * <p><b>请求路径原样放行。</b>`ActingCaller` 为空时 `YudaoModuleScope.callerToEnforce()` 也返回空，故 REST 路径保持
 * 模块自己的行为（controller 的预检 + 它的错误码），本切面一字不加。超级管理员与「角色声明全部行」的调用方同样被放过 ——
 * 那正是模块自己的规则。
 *
 * <p><b>为什么不点切批量读。</b>`getWorkItemActivityListByWorkItemIds(Collection, int)` 不收调用方、只被迭代概况在
 * **已判过项目可读**的调用链里使用。本面没有任何工具调它；若将来加一条，它必须走本切面能判可读的那条口（或把这条切点
 * 与清单一起长），不得绕过。
 *
 * pms's seam over the **work item activity feed** — this line's **second form**: read one list by identifier, decide
 * ownership afterwards.
 *
 * <p><b>Why this one has to be connected.</b> The feed's read is `getWorkItemActivityList(Long workItemId)`: it takes
 * **no caller** and runs **no permission check**. The console's REST path is safe only because the controller asks
 * `workItemService.getWorkItem(workItemId, getLoginUserId())` **before** calling it; a tool path has no controller, so
 * that direct call would read any project's feed unchecked. This aspect moves that "can the work item be read" question
 * into the service layer, so both paths share one criterion instead of two copies.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) The row carries an `operator_user_id`, but that is
 * **not** the visibility answer: which feed is visible is answered by the work item's project — private projects need
 * membership or the super administrator, open projects are readable by anyone. So {@link #ownerField()} names no column.
 * (2) There is no page: the read returns the whole feed of one work item, with no page number and no `total`. (3) A read
 * by id is **not** narrowed — that is the gap. (4) The face is read-only; the feed's write ports take no caller and are
 * called inside already-authorised business actions, so they are neither pointed at nor given a tool face.
 *
 * <p><b>Another's work item and a missing one answer alike</b> — both come back as an **empty list**: an answer that
 * cannot be decided is not given, rather than leaking the difference. The module's REST path tells them apart (403
 * versus 404); this face is therefore a **declared narrowing**.
 *
 * <p><b>The request path passes through.</b> With no acting caller, `YudaoModuleScope.callerToEnforce()` is null, so the
 * REST path keeps the module's own behaviour untouched. The super administrator and callers whose roles declare every
 * row are let through too — that is the module's own rule.
 *
 * <p><b>Why the batch read is not pointed at.</b> `getWorkItemActivityListByWorkItemIds(Collection, int)` takes no caller
 * and is used by the iteration overview inside a call chain that already checked the project. No tool here calls it; a
 * future one must go through the port this aspect can judge, and the pointcut and this sentence grow together.
 */
@Aspect
@Component
public class PmsWorkItemActivityGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final PmsWorkItemService workItems;

    public PmsWorkItemActivityGovernance(YudaoModuleScope scope, PmsWorkItemService workItems) {
        this.scope = scope;
        this.workItems = workItems;
    }

    /**
     * 本类治理的模块，按构建的叫法。 / The module this class governs, as the build names it.
     */
    @Override
    public String module() {
        return "pms";
    }

    /**
     * 动态没有属主列可读：一行归谁看，由它所属**项目**的可见性回答。 / No owner column to read: a row's audience is
     * answered by the visibility of the **project** it belongs to.
     */
    @Override
    public String ownerField() {
        return "none (the feed's audience is its work item's project, not a column)";
    }

    /**
     * 工具路径上先判工作项可读；读不到与不存在都交回空表。请求路径（没有行动调用方）原样放行。
     *
     * On the tool path the work item is checked first; unreadable and missing both come back as an empty list. The
     * request path (no acting caller) passes through untouched.
     */
    @Around("execution(* cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemActivityService.getWorkItemActivityList(..))")
    public Object withholdOtherProjectsFeed(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        if (caller == null) {
            // 宿主自己的请求路径：controller 已经判过；超级管理员与全行范围也在这里被放过。
            // The host's own request path: the controller already checked; the super administrator and every-row
            // callers are let through here too.
            return call.proceed();
        }
        Object[] args = call.getArgs();
        if (args.length == 0 || !(args[0] instanceof Long workItemId)) {
            // 形状变了就放行而不是猜：猜一个实参的位置，比不做更坏。
            // A changed shape passes through rather than being guessed: guessing an argument's position is worse.
            return call.proceed();
        }
        try {
            workItems.getWorkItem(workItemId, caller);
        } catch (ServiceException notReadable) {
            // 不是你的、不存在：同一个答案。 / Not yours, not there: the same answer.
            return Collections.emptyList();
        }
        return call.proceed();
    }
}
