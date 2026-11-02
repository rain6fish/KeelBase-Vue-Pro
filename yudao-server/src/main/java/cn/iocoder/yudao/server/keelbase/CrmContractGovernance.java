// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.module.crm.controller.admin.contract.vo.contract.CrmContractPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contract.vo.contract.CrmContractSaveReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contract.vo.contract.CrmContractTransferReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.contract.CrmContractDO;
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
 * 合同的治理**在模块自己的接缝上**——与客户同一条道理，但合同的行范围**不在一个属主列里**：它由模块自己的
 * `crm_permission` 表决定（负责人 + 参与方），而模块的 `@CrmPermission` 切面**在没有登录用户时直接放行**。
 *
 * <p><b>那个放行正是本切面要补的洞。</b>`CrmPermissionAspect` 的第一句是「登录用户为 null ⇒ 直接 return」，
 * 它假设 `/admin-api` 的请求必然有登录用户（系统内部调用才没有）。AI 工具路径**既不是 REST、也没有登录用户**：
 * 调用方经 `ActingCaller` 发布，Spring Security 里什么都没有。于是合同的读与写在 AI 路径上**一行数据权限检查都不
 * 经过**——这不是猜测，是那条切面的注释与首个分支。本切面只在这个窗口里工作：有登录用户的请求继续由模块自己的切面管，
 * 这里**不做第二遍**。
 *
 * <p><b>收窄口径（D3 丙：读宽写严）。</b>
 *
 * <ul>
 *   <li><b>读</b>对齐模块的权限表：调用方在 `crm_permission` 里有这一行（负责人/读写/只读都算），或这一行**没有任何
 *       权限记录**（公海）、或**有记录却没有负责人**（孤儿数据）——后两条与模块自己的 READ 规则相同。这里**明确
 *       不比模块宽**：模块还会沿「下级」展开，本切面不展开（那需要用户管理面的人事关系，属于另一个决定），故它是
 *       **声明的收窄**。</li>
 *   <li><b>写</b>只认负责人（`OWNER`）。模块自己的 `updateContract` 只要 `WRITE`，本合同切面**更严**；`deleteContract`
 *       与 `transferContract` 模块本就要求 `OWNER`，这里与它一致。</li>
 * </ul>
 *
 * <p><b>属主列仍要盖章。</b>`CrmContractSaveReqVO.ownerUserId` 是客户端可填的必填项，模块的创建直接拿它去开权限行
 * ——不盖章，AI 就能建一份写在别人名下的合同。盖章发生在**校验之前**（与客户那条相同，`updateContract` 的样例
 * 已证明过这个次序）。
 *
 * <p>Contract governance at the module's own seam. The row range is not an owner column: the module keeps it in its
 * own `crm_permission` table (owner plus participants), and the module's `@CrmPermission` aspect **returns early when
 * there is no login user** — assuming every `/admin-api` request has one. An AI tool call has neither a REST request
 * nor a login user: the caller is published through `ActingCaller` and Spring Security holds nothing, so on that path
 * **no data-permission check runs at all**. This aspect works only in that window; requests that do carry a login user
 * keep the module's own checks and are not checked twice here.
 *
 * <p>Narrowing (D3: wide reads, strict writes). A read is allowed when the caller holds a `crm_permission` row for the
 * contract, or when the contract has no rows at all (public sea) or rows with no owner (orphaned) — both mirror the
 * module's own READ rule. It is deliberately **not wider than the module**: the module also expands to subordinates,
 * and this aspect does not (that needs the HR relation from the user administration, a separate decision) — hence a
 * **declared narrowing**. A write requires `OWNER`: stricter than the module's `WRITE` for updates, equal to it for
 * delete and transfer. The owner column is stamped from the caller, before validation, because the save VO lets a
 * client name someone else as owner and the module opens the permission row from that field.
 */
@Aspect
@Component
public class CrmContractGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final CrmPermissionService permissions;

    public CrmContractGovernance(YudaoModuleScope scope, CrmPermissionService permissions) {
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
     * 分页：上游的 `sceneType` 为 null 时**一个条件都不加**（与客户同一个洞）。补成「我负责的」，于是「没有场景」在
     * AI 路径上不再等于「全部行」。参与方那一档由工具显式传场景，见 `CrmContractTools`。
     *
     * The page adds no condition at all when `sceneType` is null (the same hole as customers). The advice supplies
     * the caller's own scene, so "no scene" stops meaning "every row" on the AI path; the participants' view is asked
     * for explicitly by the tool.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.getContractPage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[0] instanceof CrmContractPageReqVO query) {
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
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.getContract(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof CrmContractDO found && !readable(found.getId(), caller)) {
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
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.createContract(..))")
    public Object stampOwner(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1 && call.getArgs()[0] instanceof CrmContractSaveReqVO row) {
            row.setOwnerUserId(caller);
        }
        return call.proceed();
    }

    /**
     * 写（更新 / 删除 / 转移 / 提交审批 / 跟进）：只认负责人。
     *
     * Writes (update, delete, transfer, submit-for-approval, follow-up): the owner only.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.updateContract(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.deleteContract(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.transferContract(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.submitContract(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.contract.CrmContractService.updateContractFollowUp(..))")
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
        if (args[0] instanceof CrmContractSaveReqVO vo) {
            return vo.getId();
        }
        if (args[0] instanceof CrmContractTransferReqVO vo) {
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
        List<CrmPermissionDO> rows = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTRACT.getType(), id);
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
        boolean owner = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTRACT.getType(), id).stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        && caller.equals(row.getUserId()));
        if (!owner) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", "Contract", action,
                    "合同只有负责人能改；让负责人操作，或先把合同转给你");
        }
    }
}
