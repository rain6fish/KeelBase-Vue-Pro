// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.receivable.vo.plan.CrmReceivablePlanPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.receivable.vo.plan.CrmReceivablePlanSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.receivable.CrmReceivablePlanDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 回款计划的治理**在模块自己的接缝上**——与回款、合同同一条道理：行范围由模块自己的 `crm_permission` 表决定，
 * 而模块的 `@CrmPermission` 切面**在没有登录用户时直接放行**（首条分支的注释写的是「系统内部调用」）。AI 工具路径
 * 正是这种情形：调用方经 `ActingCaller` 发布，Spring Security 里什么都没有。本切面只在这个窗口里工作：有登录用户的请求
 * 继续由模块自己的切面管，这里**不做第二遍**。
 *
 * <p><b>回款计划按谁的权限行判 —— 回答这个问题，再照它写。</b>默认**按回款计划自己的权限行**（`CRM_RECEIVABLE_PLAN`）：
 * `getReceivablePlan`（READ）、`updateReceivablePlan`（WRITE）、`deleteReceivablePlan`（OWNER）的注解 `bizType`
 * 都是它；分页 `getReceivablePlanPage` 的 mapper 也拿 `CRM_RECEIVABLE_PLAN` 拼条件。**按客户判的只有一处** ——
 * `getReceivablePlanPageByCustomerId`（`@CrmPermission(CRM_CUSTOMER, #pageReqVO.customerId, READ)`）：它从客户页
 * 进去问「这个客户有哪些回款计划」，问的本就是客户权限。故本切面对这一条问**客户的权限行**，对其余问**计划自己的权限行**
 * —— 不把「计划挂在客户 / 合同下面」推成「计划的权限都按客户或合同算」，上游不是那样写的。`createReceivablePlan`
 * 自己的注解也是空的，权限行由它按入参 `ownerUserId` 开（`CRM_RECEIVABLE_PLAN`）。
 *
 * <p><b>逐条回答 onboarding §2.1 的四问（读的是上游这一版的 `CrmReceivablePlanServiceImpl`）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>全表。`getReceivablePlanPage(reqVO, userId)` 把 `sceneType` 原样交给
 *       `CrmPermissionUtils.appendPermissionCondition`，那里只在「我负责的 / 我参与的 / 下属的」三档里加条件；
 *       `sceneType` 为 null 时**一个条件都不加**（分页 VO 自己写着「为 null 时则表示全部」）。</li>
 *   <li><b>按 id 读是否收窄？</b>声明了收窄（`getReceivablePlan` 上是 `@CrmPermission(CRM_RECEIVABLE_PLAN, #id, READ)`），
 *       但只对有登录用户的请求生效；AI 路径没有登录用户 ⇒ 被那条切面的首条分支放行。<b>真实口径是按计划自己的权限行判</b>，
 *       见上一段。</li>
 *   <li><b>保存 VO 能否指认别人为属主？</b>创建时能：`ownerUserId` 是客户端可填的 `@NotNull`，模块的
 *       `createReceivablePlan` 直接拿它开权限行（`setUserId(createReqVO.getOwnerUserId())`）。更新时不能：模块先把它
 *       连同客户、合同一起置空，只在日志上下文里把旧值填回。</li>
 *   <li><b>按 id 改写是否查属主？</b>不全查：更新只要 `WRITE`（不是负责人也能改）；删除要 `OWNER`；把计划标记为
 *       「已产生回款」的 `updateReceivablePlanReceivableId` **一条注解都没有**——它由回款创建流程调用，连 REST 都不直接到达。</li>
 * </ol>
 *
 * <p><b>收窄口径（D3 丙：读宽写严）。</b>
 *
 * <ul>
 *   <li><b>读</b>照抄模块的两条例外 —— 没有权限行（公海）、有行却没有负责人（孤儿）都算可读；其余要求调用方在
 *       `crm_permission` 里有自己的一行（负责人 / 读写 / 只读都算）。「这个客户的回款计划」那一条按**客户**套同一套规则，
 *       读不到就交回空页（与「这个客户没有计划」同形）。</li>
 *   <li><b>写</b>只认负责人（`OWNER`）。模块的更新只要 `WRITE`，本切面**更严**；删除模块本就要求 `OWNER`，这里与它一致；
 *       `updateReceivablePlanReceivableId` 模块没检查，这里**补上**——它会把一笔计划翻成「已回款」，是对已有钱的对象
 *       动手。</li>
 *   <li><b>不沿「下级」展开</b>：模块的 `validatePermission` 还会沿下级展开（`adminUserApi.getUserListBySubordinate`），
 *       本切面**不展开**（那需要用户管理面的人事关系，属于另一个决定），故它是**声明的收窄**。</li>
 * </ul>
 *
 * <p><b>属主列要盖章。</b>创建时 `ownerUserId` 是客户端可填的必填项，模块直接拿它开权限行——不盖章，AI 就能建一笔写在
 * 别人名下的计划。盖章发生在**校验之前**（`@NotNull` 校验会把它挡在方法体之外）；更新路径由模块自己置空属主，这里不需要
 * 也**刻意不**在更新上盖章。
 *
 * <p>Receivable-plan governance at the module's own seam, like receivables and contracts: the row range lives in
 * the module's `crm_permission` table, and the module's `@CrmPermission` aspect **returns early when there is no
 * login user** — exactly an AI tool call, whose caller travels through `ActingCaller` while Spring Security holds
 * nothing. This aspect works only in that window; requests that do carry a login user keep the module's own
 * checks.
 *
 * <p><b>Whose permission rows a plan is judged by — the question answered before the code.</b> By **the plan's
 * own rows** (`CRM_RECEIVABLE_PLAN`): `getReceivablePlan` (READ), `updateReceivablePlan` (WRITE) and
 * `deleteReceivablePlan` (OWNER) all name it, and the page mapper builds its condition from it. Only
 * `getReceivablePlanPageByCustomerId` asks the **customer's** row (`@CrmPermission(CRM_CUSTOMER, …)`), because it
 * is entered from the customer page and asks which plans a customer has. This aspect follows that split rather
 * than deriving "plans hang under customers and contracts, therefore those decide", which upstream does not
 * write. `createReceivablePlan` carries no annotation and opens its own `CRM_RECEIVABLE_PLAN` row from the
 * owner argument.
 *
 * <p><b>The four questions of onboarding §2.1, answered from upstream's code.</b> (1) A page with no scene adds
 * no condition at all — the whole table. (2) A read by id is declared scoped, but only for requests with a login
 * user, which an AI call is not. (3) The save VO lets a client name someone else as owner on create — the module
 * opens the permission row from it; on update the module nulls the owner (and customer and contract), so update
 * cannot move it. (4) Writes do not all check the owner: update asks `WRITE`, delete asks `OWNER`, and
 * `updateReceivablePlanReceivableId` (which flips a plan to "paid") carries **no annotation at all**.
 *
 * <p><b>Narrowing (D3: wide reads, strict writes).</b> A read is allowed when the caller holds a
 * `crm_permission` row for the plan, or when it has no rows at all (public sea) or rows with no owner
 * (orphaned) — both mirror the module's READ rule; the one customer-scoped read applies the same rule to the
 * customer and hands back an empty page when it fails. A write requires `OWNER`: stricter than the module's
 * `WRITE` for updates, equal to it for delete, and it closes `updateReceivablePlanReceivableId`'s missing check.
 * It is deliberately **not wider than the module**: the module's `validatePermission` also expands to
 * subordinates, and this aspect does not — hence a **declared narrowing**. The owner column is stamped from the
 * caller on create, before validation; updates need no stamp, since the module already refuses to change the
 * owner there.
 */
@Aspect
@Component
public class CrmReceivablePlanGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final CrmPermissionService permissions;

    public CrmReceivablePlanGovernance(YudaoModuleScope scope, CrmPermissionService permissions) {
        this.scope = scope;
        this.permissions = permissions;
    }

    @Override
    public String module() {
        return "crm";
    }

    @Override
    public String ownerField() {
        return "owner_user_id";
    }

    /**
     * 分页：上游的 `sceneType` 为 null 时**一个条件都不加**。补成「我负责的」，于是「没有场景」在 AI 路径上不再等于
     * 「全部行」。参与方那一档由工具显式传场景，见 `CrmReceivablePlanTools`。
     *
     * The page adds no condition at all when `sceneType` is null. The advice supplies the caller's own scene, so
     * "no scene" stops meaning "every row" on the AI path; the participants' view is asked for explicitly by the
     * tool.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.getReceivablePlanPage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[0] instanceof CrmReceivablePlanPageReqVO query) {
            if (query.getSceneType() == null) {
                query.setSceneType(CrmSceneTypeEnum.OWNER.getType());
            }
        }
        return call.proceed();
    }

    /**
     * 按 id 读：调用方在**计划自己的**权限表里没有这一行，就**当作没有这一行**交回（与不存在同形）。
     *
     * A read by id: without the caller's own row on the **plan's** permission rows the plan is handed back as
     * nothing — the same answer as a row that is not there.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.getReceivablePlan(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof CrmReceivablePlanDO found
                && !readable(CrmBizTypeEnum.CRM_RECEIVABLE_PLAN.getType(), found.getId(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * 「这个客户有哪些回款计划」：上游按**客户**的权限行判（`@CrmPermission(CRM_CUSTOMER, …)`），读不到就读不到
     * —— 交回空页，与「这个客户没有回款计划」同形。
     *
     * Receivable plans of one customer: upstream judges this by the **customer's** row, so an unreadable customer
     * answers with an empty page — the same shape as "this customer has no plans".
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.getReceivablePlanPageByCustomerId(..))")
    public Object withholdOtherCustomersPlans(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 1 && args[0] instanceof CrmReceivablePlanPageReqVO query) {
            Long customerId = query.getCustomerId();
            if (customerId != null && !readable(CrmBizTypeEnum.CRM_CUSTOMER.getType(), customerId, caller)) {
                return PageResult.empty();
            }
        }
        return call.proceed();
    }

    /**
     * 创建：属主从调用方盖上去。发生在校验之前——`ownerUserId` 是必填，晚了就被挡在方法体之外。
     *
     * Create: the owner is stamped from the caller, before validation — the save VO declares it required, and
     * later would be too late.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.createReceivablePlan(..))")
    public Object stampOwner(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1
                && call.getArgs()[0] instanceof CrmReceivablePlanSaveReqVO row) {
            row.setOwnerUserId(caller);
        }
        return call.proceed();
    }

    /**
     * 写（更新 / 删除 / 标记已回款）：只认负责人。标记已回款在模块侧没有注解，这里把它补进同一档——它会把计划翻成
     * 「已产生回款」，属于对已有钱的对象动手。
     *
     * Writes (update, delete, mark-as-paid): the owner only. Marking a plan paid carries no annotation upstream,
     * so it is brought into the same tier here — it flips the plan to "a payment exists" for money already owed.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.updateReceivablePlan(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.deleteReceivablePlan(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.receivable.CrmReceivablePlanService.updateReceivablePlanReceivableId(..))")
    public Object requireOwnership(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        if (caller != null) {
            Long id = idOf(call.getArgs());
            if (id != null) {
                requireOwner(id, caller, call.getSignature().getName());
            }
        }
        return call.proceed();
    }

    /** The row id carried by this write's arguments, whichever of the module's shapes it uses. */
    private static Long idOf(Object[] args) {
        if (args.length == 0) {
            return null;
        }
        if (args[0] instanceof Long id) {
            return id;
        }
        if (args[0] instanceof CrmReceivablePlanSaveReqVO vo) {
            return vo.getId();
        }
        return null;
    }

    /**
     * 读：模块自己那两条「大家都能读」的规则照抄 —— 没有权限行（公海）、有行却没有负责人（孤儿）。其余情况要求调用方
     * 在表里**有自己的一行**（负责人 / 读写 / 只读都算）。
     *
     * The two "anyone may read" rules are copied from the module: no permission rows at all (public sea), and rows
     * without an owner (orphaned). Otherwise the caller needs a row of their own — owner, write or read alike.
     */
    private boolean readable(Integer bizType, Long id, Long caller) {
        List<CrmPermissionDO> rows = permissions.getPermissionListByBiz(bizType, id);
        if (rows.isEmpty()) {
            return true;
        }
        boolean hasOwner = rows.stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel()));
        if (!hasOwner) {
            return true;
        }
        return rows.stream().anyMatch(row -> caller.equals(row.getUserId()));
    }

    /**
     * 写：只认负责人。没有负责人行（含公海与孤儿）一律拒绝 —— 模块对超出 READ 的写也是这样答的。
     *
     * A write needs the owner. No owner row at all (public sea or orphaned) is refused, the way the module
     * answers any write above READ.
     */
    private void requireOwner(Long id, Long caller, String action) {
        boolean owner = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE_PLAN.getType(), id).stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        && caller.equals(row.getUserId()));
        if (!owner) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", "ReceivablePlan", action,
                    "回款计划只有负责人能改；让负责人操作");
        }
    }
}
