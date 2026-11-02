// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.module.crm.controller.admin.clue.vo.CrmCluePageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.clue.vo.CrmClueSaveReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.clue.vo.CrmClueTransferReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.clue.CrmClueDO;
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
 * 线索的治理**在模块自己的接缝上**——与客户、合同、回款同一条道理：行范围由模块自己的 `crm_permission` 表决定
 * （负责人 + 参与方），而模块的 `@CrmPermission` 切面**在没有登录用户时直接放行**（那条切面的第一条分支就是这个，
 * 注释写的是「系统内部调用」）。AI 工具路径正是这种情形：调用方经 `ActingCaller` 发布，Spring Security 里什么都没有。
 * 于是线索的读与写在 AI 路径上**一行数据权限检查都不经过**。本切面只在这个窗口里工作：有登录用户的请求继续由模块
 * 自己的切面管，这里**不做第二遍**。
 *
 * <p><b>逐条回答 onboarding §2.1 的四问（读的是上游这一版的代码）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>全表。`getCluePage(reqVO, userId)` 把 `sceneType` 原样交给
 *       `CrmPermissionUtils.appendPermissionCondition`，而那里只在「我负责的 / 我参与的 / 下属的」三个分支里加条件；
 *       `sceneType` 为 null 时**一个条件都不加**（分页 VO 自己也写着「为 null 时则表示全部」）。线索的行范围仍是
 *       **属主 + 权限表**这一口径，没有按状态或转换流程另立一档——转换流程只是行上的一个布尔列，不改变谁能看见它。</li>
 *   <li><b>按 id 读是否收窄？</b>模块声明了收窄（`getClue` 上是 `@CrmPermission(..., READ)`），但**只对有登录用户的
 *       请求生效**；AI 路径没有登录用户 ⇒ 那道检查被第一条分支放行。</li>
 *   <li><b>保存 VO 能否指认别人为属主？</b>创建时能：`ownerUserId` 是客户端可填的 `@NotNull`，模块的 `createClue`
 *       直接拿它开权限行（`setUserId(clue.getOwnerUserId())`）。更新时**也能**——与合同不同，`updateClue` 没有把属主
 *       置空（它是在 `updateById` **之后**才把旧值填回 VO，只为操作日志），故属主列会随 VO 重写；但更新那一路只认
 *       负责人（下一问），能走到那里的本来就是现任负责人，而权限行不随之移动，故它改不了「谁能动这一行」。</li>
 *   <li><b>按 id 改写是否查属主？</b>模块自己已经写严了大半：`updateClue` / `deleteClue` / `transferClue` /
 *       `transformClue` 都要 `OWNER`；只有 `updateClueFollowUp` 要 `WRITE`。本切面在 AI 路径上把它们收进**同一档**
 *       （`OWNER`），故跟进那一条**更严**。</li>
 * </ol>
 *
 * <p><b>收窄口径（D3 丙：读宽写严）。</b>
 *
 * <ul>
 *   <li><b>读</b>对齐模块的权限表：调用方在 `crm_permission` 里有这一行（负责人/读写/只读都算），或这一行**没有任何
 *       权限记录**（公海）、或**有记录却没有负责人**（孤儿数据）——后两条与模块自己的 READ 规则相同。这里**明确不比
 *       模块宽**：模块的 `validatePermission` 还会沿「下级」展开（`adminUserApi.getUserListBySubordinate`），本切面
 *       **不展开**（那需要用户管理面的人事关系，属于另一个决定），故它是**声明的收窄**。</li>
 *   <li><b>写</b>只认负责人（`OWNER`）。更新、删除、转移、转化四种模块本就要求 `OWNER`，这里与它一致；`updateClueFollowUp`
 *       模块只要 `WRITE`，这里提到 `OWNER`——它与合同、回款跟进的处置相同。</li>
 * </ul>
 *
 * <p><b>属主列仍要盖章。</b>`CrmClueSaveReqVO.ownerUserId` 是客户端可填的必填项，模块的创建直接拿它去开权限行——不盖章，
 * AI 就能建一条写在别人名下的线索。盖章发生在**校验之前**（`@NotNull` 校验会把它挡在方法体之外）。更新路径**刻意
 * 不**盖章：能走到更新的是现任负责人，模块也会在写完后用旧值填日志。
 *
 * <p>Clue governance at the module's own seam, the same shape as customers, contracts and receivables: the row
 * range lives in the module's own `crm_permission` table (owner plus participants), and the module's
 * `@CrmPermission` aspect **returns early when there is no login user** — so an AI tool call, which has no REST
 * request and no login user (its caller is published through `ActingCaller`), passes **no data-permission check at
 * all**. This aspect works only in that window; requests that do carry a login user keep the module's own checks.
 *
 * <p><b>The four questions of onboarding §2.1, answered from upstream's code.</b> (1) A page with no scene returns
 * the whole table: `getCluePage` hands `sceneType` to `appendPermissionCondition`, which adds a condition only for
 * owner / involved / subordinate and **none at all** when it is null. The clue's row range is still owner plus the
 * permission table — the transform flag is a column on the row, not a second range. (2) A read by id is declared
 * scoped (`@CrmPermission(..., READ)`) but only for requests with a login user, which an AI call is not. (3) The
 * save VO lets a client name someone else as owner on create, where `createClue` opens the permission row from it;
 * on update upstream **also** rewrites the owner column from the VO (unlike contracts, it does not clear the field
 * first — it refills it after the write, for the log only), but update is owner-only below, so whoever reaches it
 * is already the owner and the permission rows do not move. (4) Updates already ask for `OWNER` on update, delete,
 * transfer and transform; only `updateClueFollowUp` asks `WRITE`, and it is brought into the same tier here.
 *
 * <p><b>Narrowing (D3: wide reads, strict writes).</b> A read is allowed when the caller holds a `crm_permission`
 * row for the clue, or when it has no rows at all (public sea) or rows with no owner (orphaned) — both mirror the
 * module's READ rule. It is deliberately **not wider than the module**: the module's `validatePermission` also
 * expands to subordinates, and this aspect does not (that needs the HR relation from the user administration, a
 * separate decision) — hence a **declared narrowing**. A write requires `OWNER`: equal to the module for update,
 * delete, transfer and transform, and stricter for the follow-up, which upstream gates at `WRITE`. The owner column
 * is stamped from the caller on create, before validation, because the save VO lets a client name someone else.
 */
@Aspect
@Component
public class CrmClueGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final CrmPermissionService permissions;

    public CrmClueGovernance(YudaoModuleScope scope, CrmPermissionService permissions) {
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
     * 「全部行」。参与方那一档由工具显式传场景，见 `CrmClueTools`。
     *
     * The page adds no condition at all when `sceneType` is null. The advice supplies the caller's own scene, so "no
     * scene" stops meaning "every row" on the AI path; the participants' view is asked for explicitly by the tool.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.getCluePage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[0] instanceof CrmCluePageReqVO query) {
            if (query.getSceneType() == null) {
                query.setSceneType(CrmSceneTypeEnum.OWNER.getType());
            }
        }
        return call.proceed();
    }

    /**
     * 按 id 读：调用方在权限表里没有这一行，就**当作没有这一行**交回（与不存在同形，不区分「读不到」与「不是你的」）。
     *
     * A read by id: without a permission row for the caller the row is handed back as nothing — the same answer as a
     * row that is not there, so "not found" and "not yours" stay indistinguishable.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.getClue(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof CrmClueDO found && !readable(found.getId(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * 创建：属主从调用方盖上去。发生在校验之前——`ownerUserId` 是必填，晚了就被挡在方法体之外。
     *
     * Create: the owner is stamped from the caller, before validation — the save VO declares it required, and later
     * would be too late.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.createClue(..))")
    public Object stampOwner(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1 && call.getArgs()[0] instanceof CrmClueSaveReqVO row) {
            row.setOwnerUserId(caller);
        }
        return call.proceed();
    }

    /**
     * 写（更新 / 删除 / 转移 / 转化 / 跟进）：只认负责人。跟进在模块侧只要 `WRITE`，这里提到同一档。
     *
     * Writes (update, delete, transfer, transform, follow-up): the owner only. Follow-up is gated at `WRITE` upstream
     * and is brought into the same tier here.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.updateClue(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.deleteClue(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.transferClue(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.transformClue(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.clue.CrmClueService.updateClueFollowUp(..))")
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
        if (args[0] instanceof CrmClueSaveReqVO vo) {
            return vo.getId();
        }
        if (args[0] instanceof CrmClueTransferReqVO vo) {
            return vo.getId();
        }
        return null;
    }

    /**
     * 读：模块自己那两条「大家都能读」的规则照抄 —— 没有权限记录（公海）、有记录却没有负责人（孤儿）。其余情况要求
     * 调用方在表里**有自己的一行**（负责人 / 读写 / 只读都算）。
     *
     * The two "anyone may read" rules are copied from the module: no permission rows at all (public sea), and rows
     * without an owner (orphaned). Otherwise the caller needs a row of their own — owner, write or read alike.
     */
    private boolean readable(Long id, Long caller) {
        List<CrmPermissionDO> rows = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CLUE.getType(), id);
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
     * A write needs the owner. No owner row at all (public sea or orphaned) is refused, the way the module answers any
     * write above READ.
     */
    private void requireOwner(Long id, Long caller, String action) {
        boolean owner = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CLUE.getType(), id).stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        && caller.equals(row.getUserId()));
        if (!owner) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", "Clue", action,
                    "线索只有负责人能改；让负责人操作，或先把线索转给你");
        }
    }
}
