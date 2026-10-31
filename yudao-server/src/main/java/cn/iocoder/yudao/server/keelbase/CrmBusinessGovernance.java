// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.module.crm.controller.admin.business.vo.business.CrmBusinessPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.business.vo.business.CrmBusinessSaveReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.business.vo.business.CrmBusinessTransferReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.business.vo.business.CrmBusinessUpdateStatusReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.business.CrmBusinessDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
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
 * 商机的治理**在模块自己的接缝上**——与合同、回款同一条道理：行范围由模块自己的 `crm_permission` 表决定
 * （负责人 + 参与方），而模块的 `@CrmPermission` 切面**在没有登录用户时直接放行**（那切面的第一条分支就是这个，
 * 注释写的是「系统内部调用」）。AI 工具路径正是这种情形：调用方经 `ActingCaller` 发布，Spring Security 里什么都没有。
 * 于是商机的读与写在 AI 路径上**一行数据权限检查都不经过**。本切面只在这个窗口里工作：有登录用户的请求继续由模块
 * 自己的切面管，这里**不做第二遍**。
 *
 * <p><b>逐条回答 onboarding §2.1 的四问（读的是上游这一版的代码）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>全表。`getBusinessPage(reqVO, userId)` 原样交给
 *       `CrmBusinessMapper.selectPage(pageReqVO, userId)`，后者把 `sceneType` 交给
 *       `CrmPermissionUtils.appendPermissionCondition`，而那里只在「我负责的 / 我参与的 / 下属的」三个分支里加条件；
 *       `sceneType` 为 null 时**一个条件都不加**（分页 VO 自己也写着「为 null 时则表示全部」）。</li>
 *   <li><b>按 id 读是否收窄？</b>模块声明了收窄（`getBusiness` 上是 `@CrmPermission(..., READ)`），但**只对有登录
 *       用户的请求生效**；AI 路径没有登录用户 ⇒ 那道检查被第一条分支放行。</li>
 *   <li><b>保存 VO 能否指认别人为属主？</b>创建时能：`ownerUserId` 是客户端可填的 `@NotNull`，模块的
 *       `createBusiness` 直接拿它开权限行（`setUserId(business.getOwnerUserId())`）。更新时不能：模块先把它与
 *       `statusTypeId` 一起置空，再用库里旧值填回属主。</li>
 *   <li><b>按 id 改写是否查属主？</b>不全查：`updateBusiness`、`updateBusinessFollowUp`、`updateBusinessStatus`
 *       都只要 `WRITE`（不是负责人也能改）；`deleteBusiness` 与 `transferBusiness` 要 `OWNER`。</li>
 * </ol>
 *
 * <p><b>阶段流转按它自己的语义处理。</b>`updateBusinessStatus` 不是整行更新：它只写 `statusId` / `endStatus`，
 * 并校验状态属于该商机的状态组、商机尚未结束、状态确有变化。本切面**不拒绝它、也不把它套进「按 id 更新」那一档，
 * 而是要求负责人（`OWNER`）**——它把一笔带钱的商机从一个阶段推到另一个阶段（含赢单 / 输单），是同一行上的业务
 * 动作，模块只要求 `WRITE`，这里更严。
 *
 * <p><b>收窄口径（D3 丙：读宽写严）。</b>
 *
 * <ul>
 *   <li><b>读</b>对齐模块的权限表：调用方在 `crm_permission` 里有这一行（负责人/读写/只读都算），或这一行**没有任何
 *       权限记录**（公海）、或**有记录却没有负责人**（孤儿数据）——后两条与模块自己的 READ 规则相同。这里**明确
 *       不比模块宽**：模块的 `validatePermission` 还会沿「下级」展开（`adminUserApi.getUserListBySubordinate`），
 *       本切面**不展开**（那需要用户管理面的人事关系，属于另一个决定），故它是**声明的收窄**。</li>
 *   <li><b>写</b>只认负责人（`OWNER`）。模块的更新类写只要 `WRITE`，本切面**更严**；`deleteBusiness` 与
 *       `transferBusiness` 模块本就要求 `OWNER`，这里与它一致。</li>
 * </ul>
 *
 * <p><b>属主列仍要盖章。</b>创建时 `ownerUserId` 是客户端可填的必填项，模块直接拿它开权限行——不盖章，AI 就能建
 * 一条写在别人名下的商机。盖章发生在**校验之前**（`@NotNull` 校验会把它挡在方法体之外）；更新路径由模块自己置空
 * 属主，这里不需要也**刻意不**在更新上盖章。
 *
 * <p><b>批量的「下次联系时间」不收。</b>`updateBusinessContactNextTime(ids, time)` 由跟进面
 * （`CrmFollowUpRecordService`）调用，那个对象的姿态与收窄在它自己那一档里定，本切面不替它做主。
 *
 * <p>Business governance at the module's own seam, the same shape as contracts and receivables: the row range
 * lives in the module's own `crm_permission` table (owner plus participants), and the module's `@CrmPermission`
 * aspect **returns early when there is no login user** — so an AI tool call, which has no REST request and no
 * login user (its caller is published through `ActingCaller`), passes **no data-permission check at all**. This
 * aspect works only in that window; requests that do carry a login user keep the module's own checks.
 *
 * <p><b>The four questions of onboarding §2.1, answered from upstream's code.</b> (1) A page with no scene
 * returns the whole table: `getBusinessPage` hands `sceneType` to `appendPermissionCondition`, which adds a
 * condition only for owner / involved / subordinate and **none at all** when it is null. (2) A read by id is
 * declared scoped (`@CrmPermission(..., READ)`) but only for requests with a login user, which an AI call is
 * not. (3) The save VO does let a client name someone else as owner on create — `ownerUserId` is a
 * client-fillable `@NotNull`, and `createBusiness` opens the permission row from it; on update the module nulls
 * it (together with `statusTypeId`). (4) Writes do not all check the owner: `updateBusiness`,
 * `updateBusinessFollowUp` and `updateBusinessStatus` ask only `WRITE`, while `deleteBusiness` and
 * `transferBusiness` ask `OWNER`.
 *
 * <p><b>The stage transition is governed by its own meaning.</b> `updateBusinessStatus` is not a whole-row
 * replacement: it writes only `statusId` / `endStatus`, after checking that the status belongs to the
 * business's status group, that the business has not ended, and that the status actually changes. This aspect
 * neither refuses it nor folds it into the "update by id" tier: it requires the **owner**, because moving a
 * money-bearing business to another stage (won or lost included) is a business act on the same row — stricter
 * than the module's `WRITE`.
 *
 * <p><b>Narrowing (D3: wide reads, strict writes).</b> A read is allowed when the caller holds a
 * `crm_permission` row for the business, or when it has no rows at all (public sea) or rows with no owner
 * (orphaned) — both mirror the module's READ rule. It is deliberately **not wider than the module**: the
 * module's `validatePermission` also expands to subordinates, and this aspect does not — hence a **declared
 * narrowing**. A write requires `OWNER`: stricter than the module's `WRITE` on the update-shaped writes, equal
 * to it on delete and transfer. The owner column is stamped from the caller on create, before validation,
 * because the save VO lets a client name someone else; updates need no stamp, since the module already refuses
 * to move the owner there. The batch "next contact time" write is left to the follow-up face, whose own posture
 * decides it.
 */
@Aspect
@Component
public class CrmBusinessGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final CrmPermissionService permissions;

    public CrmBusinessGovernance(YudaoModuleScope scope, CrmPermissionService permissions) {
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
     * 「全部行」。参与方那一档由工具显式传场景，见 `CrmBusinessTools`。
     *
     * The page adds no condition at all when `sceneType` is null. The advice supplies the caller's own scene,
     * so "no scene" stops meaning "every row" on the AI path; the participants' view is asked for explicitly
     * by the tool.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.getBusinessPage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[0] instanceof CrmBusinessPageReqVO query) {
            if (query.getSceneType() == null) {
                query.setSceneType(CrmSceneTypeEnum.OWNER.getType());
            }
        }
        return call.proceed();
    }

    /**
     * 按 id 读：调用方在权限表里没有这一行，就**当作没有这一行**交回（与不存在同形，不区分「读不到」与「不是你的」）。
     *
     * A read by id: without a permission row for the caller the row is handed back as nothing — the same answer
     * as a row that is not there, so "not found" and "not yours" stay indistinguishable.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.getBusiness(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof CrmBusinessDO found && !readable(found.getId(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * 创建：属主从调用方盖上去。发生在校验之前——`ownerUserId` 是必填，晚了就被挡在方法体之外。
     *
     * Create: the owner is stamped from the caller, before validation — the save VO declares it required, and
     * later would be too late.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.createBusiness(..))")
    public Object stampOwner(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1 && call.getArgs()[0] instanceof CrmBusinessSaveReqVO row) {
            row.setOwnerUserId(caller);
        }
        return call.proceed();
    }

    /**
     * 写（更新 / 跟进 / 阶段流转 / 删除 / 转移）：只认负责人。阶段流转见类注释——它写的是状态的几列，不是整行。
     *
     * Writes (update, follow-up, stage transition, delete, transfer): the owner only. The stage transition is
     * explained in the class comment — it writes the status columns, not the whole row.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.updateBusiness(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.updateBusinessFollowUp(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.updateBusinessStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.deleteBusiness(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.business.CrmBusinessService.transferBusiness(..))")
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
        if (args[0] instanceof CrmBusinessSaveReqVO vo) {
            return vo.getId();
        }
        if (args[0] instanceof CrmBusinessTransferReqVO vo) {
            return vo.getId();
        }
        if (args[0] instanceof CrmBusinessUpdateStatusReqVO vo) {
            return vo.getId();
        }
        return null;
    }

    /**
     * 读：模块自己那两条「大家都能读」的规则照抄 —— 没有权限记录（公海）、有记录却没有负责人（孤儿）。其余情况要求
     * 调用方在表里**有自己的一行**（负责人 / 读写 / 只读都算）。
     *
     * The two "anyone may read" rules are copied from the module: no permission rows at all (public sea), and
     * rows without an owner (orphaned). Otherwise the caller needs a row of their own — owner, write or read
     * alike.
     */
    private boolean readable(Long id, Long caller) {
        List<CrmPermissionDO> rows = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_BUSINESS.getType(), id);
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
        boolean owner = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_BUSINESS.getType(), id).stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        && caller.equals(row.getUserId()));
        if (!owner) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", "Business", action,
                    "商机只有负责人能改；让负责人操作，或先把商机转给你");
        }
    }
}
