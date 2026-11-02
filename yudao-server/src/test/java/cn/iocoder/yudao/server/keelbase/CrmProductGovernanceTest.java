// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.product.vo.product.CrmProductSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.product.CrmProductDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 产品切面的四条进门路径各收一次。产品与合同、回款同形（行范围在 `crm_permission` 的 `CRM_PRODUCT` 行上），但分页
 * 不一样：上游**没有场景入参可补**，故这里多钉一条 —— 这一页被按权限行后过滤，且 `total` 只数本页留下的行。
 *
 * <p>为什么读要单列两条：模块自己有两条例外（公海＝没有任何权限行、孤儿＝有行却没有负责人），本切面**照抄**它们 ——
 * 不抄就是把「页面上看得到」变成「助手看不到」，而抄错方向就是把公海关起来。这里的用例把这两档分开钉住。
 *
 * <p>切面在这里直接调用，不经 Spring AOP；要证的是这段通知做了什么，注解有没有生效由上下文测试与真栈门禁管。
 *
 * One test per door into the product rows, plus the case this object has and the others do not: upstream's page
 * takes no scene argument, so the advice narrows the page after the fact and the total counts only the rows this
 * page kept. The read has two cases of its own because the module has two exceptions (public sea = no permission
 * rows, orphaned = rows without an owner) and this aspect copies them.
 */
class CrmProductGovernanceTest {

    private static final long CALLER = 42L;
    private static final long PRODUCT = 7L;
    private static final long OTHERS_PRODUCT = 8L;

    private YudaoModuleScope scope;
    private CrmPermissionService permissions;
    private CrmProductGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        permissions = mock(CrmPermissionService.class);
        aspect = new CrmProductGovernance(scope, permissions);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
        when(scope.creatingCaller()).thenReturn(CALLER);
    }

    @Test
    void thePageKeepsOnlyTheCallersRowsAndCountsThatPage() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(),
                List.of(PRODUCT, OTHERS_PRODUCT)))
                .thenReturn(List.of(ownerRow(PRODUCT, CALLER), ownerRow(OTHERS_PRODUCT, 99L)));
        when(call.proceed()).thenReturn(new PageResult<>(
                List.of(product(PRODUCT), product(OTHERS_PRODUCT)), 20L));

        Object outcome = aspect.narrowToCaller(call);

        PageResult<?> page = (PageResult<?>) outcome;
        assertEquals(List.of(PRODUCT), page.getList().stream().map(row -> ((CrmProductDO) row).getId()).toList(),
                "upstream's page is global; the advice keeps the caller's own readable rows");
        assertEquals(1L, page.getTotal(),
                "the total counts the rows this page kept — a page-local total, declared as such in the aspect");
    }

    @Test
    void anExemptCallerSeesTheModulesOwnPageUntouched() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        PageResult<CrmProductDO> moduleAnswer = new PageResult<>(
                List.of(product(PRODUCT), product(OTHERS_PRODUCT)), 20L);
        when(call.proceed()).thenReturn(moduleAnswer);

        assertSame(moduleAnswer, aspect.narrowToCaller(call),
                "an administrator or an every-row role is left alone");
    }

    @Test
    void anothersProductIsHandedBackAsNothing() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), PRODUCT))
                .thenReturn(List.of(ownerRow(99L)));
        when(call.proceed()).thenReturn(product(PRODUCT));

        assertNull(aspect.withholdOthersRow(call), "not yours answers the way not-there answers");
    }

    @Test
    void aProductWithNoPermissionRowsStaysReadableLikeTheModulesPublicSea() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), PRODUCT))
                .thenReturn(List.of());
        CrmProductDO row = product(PRODUCT);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "public sea is the module's own READ rule");
    }

    @Test
    void aParticipantCanReadButAnOwnerIsRequiredToWrite() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), PRODUCT))
                .thenReturn(List.of(ownerRow(99L), permission(CALLER, CrmPermissionLevelEnum.READ)));
        CrmProductDO row = product(PRODUCT);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "a participant may read");

        CrmProductSaveReqVO update = new CrmProductSaveReqVO();
        update.setId(PRODUCT);
        when(call.getArgs()).thenReturn(new Object[]{update});
        Signature updateSignature = signature("updateProduct");
        when(call.getSignature()).thenReturn(updateSignature);

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "a write is owner-only, stricter than the module's WRITE level");
    }

    @Test
    void deleteAsksTheSameOwnerQuestion() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_PRODUCT.getType(), PRODUCT))
                .thenReturn(List.of(ownerRow(99L)));
        when(call.getArgs()).thenReturn(new Object[]{PRODUCT});
        Signature deleteSignature = signature("deleteProduct");
        when(call.getSignature()).thenReturn(deleteSignature);

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "delete is owner-only upstream too, and stays so here");
    }

    @Test
    void theOwnerIsStampedFromTheCallerBeforeValidation() throws Throwable {
        CrmProductSaveReqVO create = new CrmProductSaveReqVO();
        create.setOwnerUserId(99L);
        when(call.getArgs()).thenReturn(new Object[]{create});
        when(call.proceed()).thenReturn(1L);

        aspect.stampOwner(call);

        assertEquals(CALLER, create.getOwnerUserId(), "a client may not name someone else as owner");
    }

    @Test
    void withNoCallerNothingIsHeld() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        when(scope.creatingCaller()).thenReturn(null);
        CrmProductDO row = product(PRODUCT);
        ProceedingJoinPoint read = mock(ProceedingJoinPoint.class);
        when(read.proceed()).thenReturn(row);
        ProceedingJoinPoint write = mock(ProceedingJoinPoint.class);
        when(write.getArgs()).thenReturn(new Object[]{PRODUCT});
        when(write.proceed()).thenReturn("written");

        assertSame(row, aspect.withholdOthersRow(read), "a REST request keeps the module's own handling");
        assertEquals("written", aspect.requireOwnership(write), "no caller to hold means no second check");
    }

    private static Signature signature(String name) {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn(name);
        return signature;
    }

    private static CrmPermissionDO ownerRow(Long userId) {
        return permission(userId, CrmPermissionLevelEnum.OWNER);
    }

    private static CrmPermissionDO ownerRow(Long productId, Long userId) {
        CrmPermissionDO row = ownerRow(userId);
        row.setBizId(productId);
        return row;
    }

    private static CrmPermissionDO permission(Long userId, CrmPermissionLevelEnum level) {
        CrmPermissionDO row = new CrmPermissionDO();
        row.setUserId(userId);
        row.setLevel(level.getLevel());
        return row;
    }

    private static CrmProductDO product(Long id) {
        CrmProductDO row = new CrmProductDO();
        row.setId(id);
        return row;
    }
}
