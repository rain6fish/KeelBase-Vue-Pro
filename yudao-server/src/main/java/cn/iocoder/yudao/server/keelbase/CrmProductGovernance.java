// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.product.vo.product.CrmProductSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.product.CrmProductDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 产品（产品目录）的治理**在模块自己的接缝上**——与合同、回款、联系人同一条道理：行范围由模块自己的
 * `crm_permission` 表决定（`CRM_PRODUCT`，创建时开一行 `OWNER`），而模块的 `@CrmPermission` 切面**在没有登录用户时
 * 直接放行**（首条分支的注释写的是「系统内部调用」）。AI 工具路径正是这种情形：调用方经 `ActingCaller` 发布，
 * Spring Security 里什么都没有。本切面只在这个窗口里工作：有登录用户的请求继续由模块自己的切面管，这里**不做第二遍**。
 *
 * <p><b>逐条回答 onboarding §2.1 的四问（读的是上游这一版的 `CrmProductService` / `Impl` / `Mapper` / `VO`）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b><b>全表</b>，而且比合同那几处更彻底：`getProductPage(CrmProductPageReqVO)`
 *       **只有一个入参**——没有 `userId`、没有 `sceneType`，`CrmProductMapper.selectPage` 只按名称 / 状态过滤，
 *       **从不拼权限条件**。也就是说产品的分页在上游对每一个有 `crm:product:query` 的人都是全表。本切面因此
 *       **不能**像合同那样「把 null 场景补成我负责的」（没有这个入参），只能在模块答完之后按权限行**后过滤**，
 *       并按本页留下的行数**重算 total**。</li>
 *   <li><b>按 id 读是否收窄？</b>声明了收窄（`getProduct` 上是 `@CrmPermission(CRM_PRODUCT, #id, READ)`），但**只对
 *       有登录用户的请求生效**；AI 路径没有登录用户 ⇒ 被那条切面的首条分支放行。</li>
 *   <li><b>保存 VO 能否指认别人为属主？</b>创建时能：`ownerUserId` 是客户端可填的 `@NotNull`，`createProduct`
 *       直接拿它开权限行（`setUserId(product.getOwnerUserId())`）。更新时不能：模块先 `updateReqVO.setOwnerUserId(null)`，
 *       再用库里旧值填回日志上下文。</li>
 *   <li><b>按 id 改写是否查属主？</b>不全查：`updateProduct` 只要 `WRITE`（参与方也能改）；`deleteProduct` 要
 *       `OWNER`；`createProduct` **无注解**（权限行由它自己按入参开）。</li>
 * </ol>
 *
 * <p><b>收窄口径（D3 丙：读宽写严）。</b>
 *
 * <ul>
 *   <li><b>读</b>对齐模块的权限表：调用方在 `crm_permission` 里有这一行（负责人 / 读写 / 只读都算），或这一行
 *       **没有任何权限记录**（公海）、或**有记录却没有负责人**（孤儿数据）—— 后两条与模块自己的 READ 规则相同。
 *       本切面**明确不比模块宽**：模块的 `validatePermission` 还会沿「下级」展开（`adminUserApi.getUserListBySubordinate`），
 *       本切面**不展开**（那需要用户管理面的人事关系，属于另一个决定），故它是**声明的收窄**。</li>
 *   <li><b>写</b>只认负责人（`OWNER`）。模块的 `updateProduct` 只要 `WRITE`，本切面**更严**；`deleteProduct` 模块
 *       本就要求 `OWNER`，这里与它一致。</li>
 *   <li><b>分页**还要更窄**：它是后过滤，且 total 只数本页。**这是又一处声明的收窄**：上游的分页对任何有
 *       `crm:product:query` 的人都是全表，而本切面让 REST 与 AI 一起只看到自己读得到的行。一页装不下时，调用方
 *       看到的总量描述的是**这一页**、不是整张表——要一个真正的按人总量，得由模块自己的查询带调用方条件，
 *       切面编不出来（与 `Demo01ContactGovernance` 同一口径）。</li>
 * </ul>
 *
 * <p><b>属主列要盖章。</b>创建时 `ownerUserId` 是客户端可填的必填项，模块直接拿它开权限行 —— 不盖章，AI 就能建一件
 * 写在别人名下的产品。盖章发生在**校验之前**（`@NotNull` 会把漏填挡在方法体之外）；更新路径模块自己把属主置空，
 * 这里不需要也**刻意不**在更新上盖章。
 *
 * <p><b>不走本接缝的读。</b>`getProductListByStatus`（`/simple-list` 那个下拉）、`getProductList` / `getProductMap`
 * 与 `validProductList` 都是**内部与参照数据**的读：后三者被合同、商机的保存用来校验 / 回显所选产品，前者给所有
 * 登录用户的下拉框供数。上游把它们当作共享目录，本切面照旧不碰——把它们收窄会把「给合同定价」也一起关掉。
 *
 * <p>Product (the catalogue) governance at the module's own seam, the same shape as contracts, receivables and
 * contacts: the row range lives in the module's own `crm_permission` table (`CRM_PRODUCT`, an `OWNER` row opened on
 * create), and the module's `@CrmPermission` aspect **returns early when there is no login user** — exactly an AI
 * tool call, whose caller travels through `ActingCaller` while Spring Security holds nothing. This aspect works
 * only in that window; requests that do carry a login user keep the module's own checks.
 *
 * <p><b>The four questions of onboarding §2.1, answered from upstream's code.</b> (1) A page returns the **whole
 * table**, more thoroughly than elsewhere: `getProductPage` takes **one** argument — no `userId`, no `sceneType` —
 * and the mapper filters on name and status only, never joining the permission rows; so the catalogue page is
 * global to everyone holding `crm:product:query`. The advice therefore cannot supply a scene the way the contract
 * advice does: it lets the module answer and then keeps only the rows the caller may read, recomputing `total`
 * from the rows this page kept. (2) A read by id is declared scoped (`@CrmPermission(..., READ)`) but only for
 * requests with a login user, which an AI call is not. (3) The save VO lets a client name someone else as owner on
 * create — `ownerUserId` is a client-fillable `@NotNull` and `createProduct` opens the permission row from it; on
 * update the module nulls the field first. (4) Writes do not all check the owner: update asks `WRITE`, delete asks
 * `OWNER`, and create carries no annotation at all.
 *
 * <p><b>Narrowing (D3: wide reads, strict writes).</b> A read is allowed when the caller holds a `crm_permission`
 * row for the product, or when it has no rows at all (public sea) or rows with no owner (orphaned) — both mirror
 * the module's READ rule. It is deliberately **not wider than the module**: the module also expands to
 * subordinates and this aspect does not, hence a **declared narrowing**. A write requires `OWNER`: stricter than
 * the module's `WRITE` for updates, equal to it for delete. The page is **narrower still** — a post-filter whose
 * `total` counts only the rows kept from this page, not the table; upstream's page is global to anyone with the
 * query code, while this aspect shows REST and AI callers alike only their own readable rows. The owner column is
 * stamped from the caller on create, before validation; updates need no stamp, since the module already refuses to
 * change the owner there. Reads that stay global on purpose: `getProductListByStatus` (the dropdown), and the
 * internal `getProductList` / `getProductMap` / `validProductList` that contracts and businesses use to price
 * themselves — upstream treats those as shared reference data.
 */
@Aspect
@Component
public class CrmProductGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final CrmPermissionService permissions;

    public CrmProductGovernance(YudaoModuleScope scope, CrmPermissionService permissions) {
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
     * 分页：上游没有场景入参可补，故在模块答完之后按权限行收窄。**total 重算成本页留下的行数**——一页装不下时它
     * 描述的是这一页、不是整张表（与 `Demo01ContactGovernance` 同一口径，理由写在类注释里）。
     *
     * The page has no scene argument to supply, so it is narrowed after the module has answered, against the
     * permission rows of the ids this page holds. The total is recomputed from the rows this page kept — a
     * page-local total, declared as such in the class comment.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.product.CrmProductService.getProductPage(..))")
    @SuppressWarnings("unchecked")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object outcome = call.proceed();
        if (caller == null || !(outcome instanceof PageResult<?> page)) {
            return outcome;
        }
        List<CrmProductDO> rows = ((PageResult<CrmProductDO>) page).getList();
        if (rows.isEmpty()) {
            return outcome;
        }
        // 一页一次查询：按这一页的 id 批量取权限行，而不是每行问一次。
        // One query per page: the permission rows for this page's ids in one read, not one per row.
        List<Long> ids = rows.stream().map(CrmProductDO::getId).toList();
        Map<Long, List<CrmPermissionDO>> byProduct = permissions
                .getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), ids).stream()
                .collect(Collectors.groupingBy(CrmPermissionDO::getBizId));
        List<CrmProductDO> mine = rows.stream()
                .filter(row -> readable(byProduct.getOrDefault(row.getId(), List.of()), caller))
                .toList();
        return new PageResult<>(mine, (long) mine.size());
    }

    /**
     * 按 id 读：调用方在权限表里没有这一行，就**当作没有这一行**交回（与不存在同形，不区分「读不到」与「不是你的」）。
     *
     * A read by id: without a permission row for the caller the row is handed back as nothing — the same answer as
     * a row that is not there, so "not found" and "not yours" stay indistinguishable.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.product.CrmProductService.getProduct(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof CrmProductDO found && !readable(found.getId(), caller)) {
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
    @Around("execution(* cn.iocoder.yudao.module.crm.service.product.CrmProductService.createProduct(..))")
    public Object stampOwner(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null && call.getArgs().length >= 1 && call.getArgs()[0] instanceof CrmProductSaveReqVO row) {
            row.setOwnerUserId(caller);
        }
        return call.proceed();
    }

    /**
     * 写（更新 / 删除）：只认负责人。
     *
     * Writes (update, delete): the owner only.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.product.CrmProductService.updateProduct(..))"
            + " || execution(* cn.iocoder.yudao.module.crm.service.product.CrmProductService.deleteProduct(..))")
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
        if (args[0] instanceof CrmProductSaveReqVO vo) {
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
        return readable(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), id), caller);
    }

    /** The same rule over rows already fetched — what the page advice uses once it has them in hand. */
    private static boolean readable(List<CrmPermissionDO> rows, Long caller) {
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
    private void requireOwner(Long id, Long caller, String action) {
        boolean owner = permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), id).stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        && caller.equals(row.getUserId()));
        if (!owner) {
            throw new RuleDeniedException(null, "该行不在你的数据范围内", "Product", action,
                    "产品只有负责人能改；让负责人操作");
        }
    }
}
