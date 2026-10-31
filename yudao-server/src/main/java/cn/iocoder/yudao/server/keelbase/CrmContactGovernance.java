// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactSaveReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactTransferReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.contact.CrmContactDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.Collection;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 联系人的治理**在模块自己的接缝上**——与合同、回款同一条道理：行范围由模块自己的 `crm_permission` 表决定，而模块的
 * `@CrmPermission` 切面**在没有登录用户时直接放行**（首条分支的注释写的是「系统内部调用」）。AI 工具路径正是这种情形：
 * 调用方经 `ActingCaller` 发布，Spring Security 里什么都没有。本切面只在这个窗口里工作：有登录用户的请求继续由模块
 * 自己的切面管，这里**不做第二遍**。
 *
 * <p><b>逐条回答 onboarding §2.1 的四问（读的是上游这一版的 `CrmContactServiceImpl`）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>全表。`getContactPage(reqVO, userId)` 把 `sceneType` 原样交给
 *       `CrmPermissionUtils.appendPermissionCondition`，那里只在「我负责的 / 我参与的 / 下属的」三档里加条件；
 *       `sceneType` 为 null 时**一个条件都不加**（分页 VO 自己写着「为 null 时则表示全部」）。</li>
 *   <li><b>按 id 读是否收窄？</b>声明了收窄（`getContact` 上是 `@CrmPermission(CRM_CONTACT, #id, READ)`），但只对
 *       有登录用户的请求生效；AI 路径没有登录用户 ⇒ 被那条切面的首条分支放行。<b>真实口径是按联系人自己的权限行判</b>：
 *       `getContact`、`updateContact`、`deleteContact`、`transferContact` 与两条跟进写的注解 `bizType` **都是
 *       `CRM_CONTACT`**。**按客户判的只有两处** —— `getContactPageByCustomerId` 与 `getContactListByCustomerId`
 *       （`@CrmPermission(CRM_CUSTOMER, #…customerId, READ)`）：它们从客户页进去问「这个客户有哪些联系人」，问的
 *       本就是客户权限。故本切面对这两条问**客户的权限行**，对其余问**联系人的权限行** —— 不把「联系人挂在客户下面」
 *       推成「联系人的权限都按客户算」，上游不是那样写的。</li>
 *   <li><b>保存 VO 能否指认别人为属主？</b>能，创建与更新都能：`ownerUserId` 是客户端可填的 `@NotNull`。而且创建时
 *       **属主列**来自 VO（`BeanUtils.toBean`），**权限行**却来自第二个入参 `userId`（控制器传登录用户）—— 两者可以
 *       分叉。更新则直接用 VO 的属主改写列（模块只在日志上下文里把旧值填回去）。故本切面在创建与更新上都盖章。</li>
 *   <li><b>按 id 改写是否查属主？</b>不全查：更新只要 `WRITE`；两条跟进写（`updateContactFollowUp` /
 *       `updateContactContactNextTime`）也要 `WRITE`；删除与转移要 `OWNER`；`createContact` **一条注解都没有**（权限
 *       行由它自己按入参开）；`updateOwnerUserIdByCustomerId` 按**客户**的 `OWNER`。</li>
 * </ol>
 *
 * <p><b>收窄口径（D3 丙：读宽写严）。</b>
 *
 * <ul>
 *   <li><b>读</b>照抄模块的两条例外 —— 没有权限行（公海）、有行却没有负责人（孤儿）都算可读；其余要求调用方在
 *       `crm_permission` 里有自己的一行（负责人 / 读写 / 只读都算）。「这个客户的联系人」那两条按**客户**套同一套
 *       规则，读不到就交回空页 / 空表（与「没有」同形）。</li>
 *   <li><b>写</b>只认负责人（`OWNER`）。模块的更新与两条跟进写只要 `WRITE`，本切面**更严**；删除与转移模块本就要求
 *       `OWNER`，这里与它一致；`updateOwnerUserIdByCustomerId` 按客户的 `OWNER`。批量写（`updateContactContactNextTime`）
 *       **每一个 id** 都要过这一问。</li>
 *   <li><b>创建</b>除盖章外，还要求调用方**读得到目标客户**（客户的读权限，含上面两条例外）。上游只校验客户**存在**
 *       —— `validateRelationDataExists` 里 `getCustomer(id) == null` 时再去 `validateCustomer(id)`，那一步也只是
 *       `selectById` —— 故这一条比上游**更严**：否则 AI 能把联系人挂到它看不见的客户名下，而那正是上面「按客户判」
 *       那两条读所按的东西。</li>
 *   <li><b>不沿「下级」展开</b>：模块的 `validatePermission` 还会沿下级展开（`adminUserApi.getUserListBySubordinate`），
 *       本切面**不展开**（那需要用户管理面的人事关系，属于另一个决定），故它是**声明的收窄**。</li>
 * </ul>
 *
 * <p><b>属主列要盖章。</b>创建与更新都盖，理由见第 3 问的两个源。要换负责人走 `transferContact`（它要求 `OWNER`），
 * 不是走更新。盖章发生在**校验之前**：`ownerUserId` 是 `@NotNull`，晚了就被 bean 校验挡在方法体之外。
 *
 * <p>Contact governance at the module's own seam, the same shape as contracts and receivables: the row range
 * lives in the module's `crm_permission` table, and the module's `@CrmPermission` aspect **returns early when
 * there is no login user** — exactly an AI tool call, whose caller travels through `ActingCaller` while Spring
 * Security holds nothing. This aspect works only in that window; requests that do carry a login user keep the
 * module's own checks.
 *
 * <p><b>The four questions of onboarding §2.1, answered from upstream's `CrmContactServiceImpl`.</b> (1) A page
 * with no scene adds no condition at all — the whole table. (2) A read by id is declared scoped, but only for
 * requests with a login user, and the row range it asks for is the **contact's own** permission row: `getContact`,
 * `updateContact`, `deleteContact`, `transferContact` and both follow-up writes all name `CRM_CONTACT`. Only
 * `getContactPageByCustomerId` and `getContactListByCustomerId` ask the **customer's** row, because they are
 * entered from the customer page and ask which contacts a customer has. This aspect follows that split rather
 * than deriving "contacts hang under customers, therefore customers decide", which upstream does not write.
 * (3) The save VO lets a client name someone else as owner on create and on update; on create the owner column
 * comes from the VO while the permission row comes from the second argument, so the two can diverge, and on
 * update the VO writes the column directly. (4) Writes do not all check the owner: update and both follow-up
 * writes ask `WRITE`, delete and transfer ask `OWNER`, create carries no annotation at all, and
 * `updateOwnerUserIdByCustomerId` asks the customer's `OWNER`.
 *
 * <p><b>Narrowing (D3: wide reads, strict writes).</b> Reads copy the module's two exceptions (public sea, and rows
 * without an owner) and otherwise need the caller's own row; the two customer-scoped reads apply the same rule to
 * the customer and hand back an empty page or list when it fails. Writes require `OWNER` — stricter than upstream's
 * `WRITE` for update and the follow-ups, equal for delete and transfer — and a bulk write is checked id by id.
 * Create additionally requires the caller to be able to read the target customer: upstream only checks that the
 * customer *exists*, and without this an AI caller could hang a contact from a customer it cannot see. The aspect
 * does not expand to subordinates, hence a **declared narrowing**. The owner column is stamped from the caller on
 * both create and update, before validation.
 */
@Aspect
@Component
public class CrmContactGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final CrmPermissionService permissions;

    public CrmContactGovernance(YudaoModuleScope scope, CrmPermissionService permissions) {
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
     * 「全部行」。参与方那一档由工具显式传场景，见 `CrmContactTools`。
     *
     * The page adds no condition at all when `sceneType` is null. The advice supplies the caller's own scene, so
     * "no scene" stops meaning "every row" on the AI path; the participants' view is asked for explicitly by the
     * tool.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.getContactPage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[0] instanceof CrmContactPageReqVO query) {
            if (query.getSceneType() == null) {
                query.setSceneType(CrmSceneTypeEnum.OWNER.getType());
            }
        }
        return call.proceed();
    }

    /**
     * 按 id 读：调用方在**联系人自己的**权限表里没有这一行，就**当作没有这一行**交回（与不存在同形）。
     *
     * A read by id: without the caller's own row on the **contact's** permission rows the contact is handed back
     * as nothing — the same answer as a row that is not there.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.getContact(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof CrmContactDO found
                && !readable(CrmBizTypeEnum.CRM_CONTACT.getType(), found.getId(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * 「这个客户有哪些联系人」：这两条上游按**客户**的权限行判（`@CrmPermission(CRM_CUSTOMER, …)`），读到不就读不到
     * —— 交回空页 / 空表，与「这个客户没有联系人」同形。
     *
     * Contacts of one customer: upstream judges these two by the **customer's** row, so an unreadable customer
     * answers with an empty page or list — the same shape as "this customer has no contacts".
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.getContactPageByCustomerId(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.getContactListByCustomerId(..))")
    public Object withholdOtherCustomersContacts(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 1) {
            Object first = args[0];
            Long customerId = first instanceof CrmContactPageReqVO query ? query.getCustomerId()
                    : first instanceof Long id ? id : null;
            if (customerId != null && !readable(CrmBizTypeEnum.CRM_CUSTOMER.getType(), customerId, caller)) {
                return first instanceof CrmContactPageReqVO ? PageResult.empty() : List.of();
            }
        }
        return call.proceed();
    }

    /**
     * 创建：属主从调用方盖上去（发生在校验之前——`ownerUserId` 是必填）；并且只允许挂到调用方**读得到**的客户名下。
     * 客户的这一问按 `callerToEnforce()`，种子管理员与「全部行」角色照旧被放过。
     *
     * Create: the owner is stamped from the caller before validation, and the contact may only hang from a
     * customer the caller can read — asked through `callerToEnforce()`, so the seed administrator and an
     * every-row role stay exempt.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.createContact(..))")
    public Object stampOwner(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1 && call.getArgs()[0] instanceof CrmContactSaveReqVO row) {
            row.setOwnerUserId(caller);
            Long enforcing = scope.callerToEnforce();
            Long customerId = row.getCustomerId();
            if (enforcing != null && customerId != null
                    && !readable(CrmBizTypeEnum.CRM_CUSTOMER.getType(), customerId, caller)) {
                throw new RuleDeniedException(null, "该行不在你的数据范围内", "Customer", "createContact",
                        "联系人只能挂到你看得到的客户名下；换一个客户，或先让客户负责人把你加进团队");
            }
        }
        return call.proceed();
    }

    /**
     * 更新：属主同样从调用方盖上去。模块会直接把 VO 的属主写进列（旧值只在日志上下文里填回），不盖就能把属主列指到
     * 别人身上；换负责人应当走 `transferContact`。
     *
     * Update: the owner is stamped too. The module writes the VO's owner straight into the column (restoring the
     * old value only in the log context), so without a stamp the column could be pointed at someone else; moving
     * the owner is `transferContact`'s job.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.updateContact(..))")
    public Object stampOwnerOnUpdate(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1 && call.getArgs()[0] instanceof CrmContactSaveReqVO row) {
            row.setOwnerUserId(caller);
        }
        return call.proceed();
    }

    /**
     * 写（更新 / 删除 / 转移 / 两条跟进写）：只认联系人自己的负责人。批量写逐个 id 过这一问。
     *
     * Writes (update, delete, transfer, both follow-ups): the contact's own owner only; a bulk write is checked
     * id by id.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.updateContact(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.deleteContact(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.transferContact(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.updateContactFollowUp(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.updateContactContactNextTime(..))")
    public Object requireOwnership(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        if (caller != null) {
            String action = call.getSignature().getName();
            for (Long id : idsOf(call.getArgs())) {
                requireOwner(CrmBizTypeEnum.CRM_CONTACT.getType(), id, caller, "Contact", action,
                        "联系人只有负责人能改；让负责人操作，或先转给你");
            }
        }
        return call.proceed();
    }

    /**
     * 把某客户下所有联系人的负责人改掉：上游按**客户**的 `OWNER` 判，本切面同样按客户的负责人，且不弱于上游。
     *
     * Re-owning every contact of a customer: upstream asks the **customer's** `OWNER`, and so does this aspect.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contact.CrmContactService.updateOwnerUserIdByCustomerId(..))")
    public Object requireCustomerOwnership(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 1 && args[0] instanceof Long customerId) {
            requireOwner(CrmBizTypeEnum.CRM_CUSTOMER.getType(), customerId, caller, "Customer",
                    call.getSignature().getName(), "客户只有负责人能改；让负责人操作，或先把客户转给你");
        }
        return call.proceed();
    }

    /** The contact ids this write names, whichever of the module's shapes it uses. */
    private static List<Long> idsOf(Object[] args) {
        if (args.length == 0) {
            return List.of();
        }
        Object first = args[0];
        if (first instanceof Long id) {
            return List.of(id);
        }
        if (first instanceof CrmContactSaveReqVO vo) {
            return vo.getId() == null ? List.of() : List.of(vo.getId());
        }
        if (first instanceof CrmContactTransferReqVO vo) {
            return vo.getId() == null ? List.of() : List.of(vo.getId());
        }
        if (first instanceof Collection<?> many) {
            return many.stream().filter(Long.class::isInstance).map(Long.class::cast).toList();
        }
        return List.of();
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
     * A write needs the owner. No owner row at all (public sea or orphaned) is refused, the way the module answers
     * any write above READ.
     */
    private void requireOwner(Integer bizType, Long id, Long caller, String subject, String action, String nextStep) {
        boolean owner = permissions.getPermissionListByBiz(bizType, id).stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        && caller.equals(row.getUserId()));
        if (!owner) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", subject, action, nextStep);
        }
    }
}
