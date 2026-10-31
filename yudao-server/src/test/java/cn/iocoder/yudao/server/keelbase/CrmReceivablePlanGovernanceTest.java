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
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 回款计划切面的进门路径各收一次：分页补上「只看本人的」、按 id 读按计划自己的权限表交回、「这个客户的计划」按客户判、
 * 按 id 写只认负责人（含模块侧没有注解的「标记已回款」）、创建时属主盖章。
 *
 * <p>为什么「按客户判」要单列一条：上游只有 `getReceivablePlanPageByCustomerId` 这一处按 `CRM_CUSTOMER` 判，其余
 * 全按计划自己的 `CRM_RECEIVABLE_PLAN` 行 —— 把这条分叉写错，就会把「从客户页看计划」和「计划本身的读写」混成一套。
 *
 * <p>切面在这里直接调用，不经 Spring AOP；要证的是这段通知对这几条路径做了什么，注解有没有生效由上下文测试与真栈门禁管。
 *
 * The doors into receivable-plan rows, one test each: the page gets "own rows only" filled in, a read by id is
 * answered from the plan's own permission table, "this customer's plans" is judged by the customer, a write by id
 * needs the owner (including the mark-as-paid write that carries no annotation upstream), and a create is stamped
 * with the caller. The customer-scoped read has its own case because it is the only place upstream asks
 * `CRM_CUSTOMER`; the rest ask the plan's own `CRM_RECEIVABLE_PLAN` rows.
 */
class CrmReceivablePlanGovernanceTest {

    private static final long CALLER = 42L;
    private static final long PLAN = 7L;
    private static final long CUSTOMER = 5L;

    private YudaoModuleScope scope;
    private CrmPermissionService permissions;
    private CrmReceivablePlanGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        permissions = mock(CrmPermissionService.class);
        aspect = new CrmReceivablePlanGovernance(scope, permissions);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
        when(scope.creatingCaller()).thenReturn(CALLER);
    }

    @Test
    void thePageGetsOwnRowsOnlyWhenNoSceneWasNamed() throws Throwable {
        CrmReceivablePlanPageReqVO query = new CrmReceivablePlanPageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.narrowToCaller(call));
        assertEquals(CrmSceneTypeEnum.OWNER.getType(), query.getSceneType(),
                "upstream's default is every row, so the scene has to be supplied");
    }

    @Test
    void aSceneTheCallerNamedIsLeftAlone() throws Throwable {
        CrmReceivablePlanPageReqVO query = new CrmReceivablePlanPageReqVO();
        query.setSceneType(CrmSceneTypeEnum.INVOLVED.getType());
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");

        aspect.narrowToCaller(call);

        assertEquals(CrmSceneTypeEnum.INVOLVED.getType(), query.getSceneType(),
                "the participants' view was asked for explicitly and must survive the advice");
    }

    @Test
    void withNoCallerNothingIsTouched() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        CrmReceivablePlanPageReqVO query = new CrmReceivablePlanPageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");
        CrmReceivablePlanDO row = plan(PLAN);
        ProceedingJoinPoint read = mock(ProceedingJoinPoint.class);
        when(read.proceed()).thenReturn(row);

        aspect.narrowToCaller(call);
        assertNull(query.getSceneType(), "a REST request keeps the module's own handling");
        assertSame(row, aspect.withholdOthersRow(read), "a caller that needs no holding keeps the row");
    }

    @Test
    void anothersPlanIsHandedBackAsNothing() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE_PLAN.getType(), PLAN))
                .thenReturn(List.of(ownerRow(99L)));
        CrmReceivablePlanDO row = plan(PLAN);
        when(call.proceed()).thenReturn(row);

        assertNull(aspect.withholdOthersRow(call), "not yours answers the way not-there answers");
    }

    @Test
    void aPlanWithNoPermissionRowsStaysReadableLikeTheModulesPublicSea() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE_PLAN.getType(), PLAN))
                .thenReturn(List.of());
        CrmReceivablePlanDO row = plan(PLAN);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "public sea is the module's own READ rule");
    }

    @Test
    void anothersCustomerAnswersWithAnEmptyPage() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CUSTOMER.getType(), CUSTOMER))
                .thenReturn(List.of(ownerRow(99L)));
        CrmReceivablePlanPageReqVO query = new CrmReceivablePlanPageReqVO();
        query.setCustomerId(CUSTOMER);
        when(call.getArgs()).thenReturn(new Object[]{query});

        PageResult<?> page = (PageResult<?>) aspect.withholdOtherCustomersPlans(call);

        assertEquals(0, page.getTotal(), "an unreadable customer answers like one with no plans");
        assertEquals(List.of(), page.getList());
    }

    @Test
    void aParticipantCanReadButAnOwnerIsRequiredToWrite() throws Throwable {
        CrmPermissionDO participant = permission(CALLER, CrmPermissionLevelEnum.READ);
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE_PLAN.getType(), PLAN))
                .thenReturn(List.of(ownerRow(99L), participant));
        CrmReceivablePlanDO row = plan(PLAN);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "a participant may read");

        CrmReceivablePlanSaveReqVO update = new CrmReceivablePlanSaveReqVO();
        update.setId(PLAN);
        when(call.getArgs()).thenReturn(new Object[]{update});
        signature("updateReceivablePlan");

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "a write is owner-only, stricter than the module's WRITE level");
    }

    @Test
    void markingAPlanPaidAsAnothersOwnerIsRefused() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE_PLAN.getType(), PLAN))
                .thenReturn(List.of(ownerRow(99L)));
        when(call.getArgs()).thenReturn(new Object[]{PLAN, 88L});
        signature("updateReceivablePlanReceivableId");

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "mark-as-paid carries no annotation upstream, so this aspect closes it");
    }

    @Test
    void theOwnerIsStampedFromTheCallerBeforeValidation() throws Throwable {
        CrmReceivablePlanSaveReqVO create = new CrmReceivablePlanSaveReqVO();
        create.setOwnerUserId(99L);
        when(call.getArgs()).thenReturn(new Object[]{create});
        when(call.proceed()).thenReturn(1L);

        aspect.stampOwner(call);

        assertEquals(CALLER, create.getOwnerUserId(), "a client may not name someone else as owner");
    }

    private void signature(String name) {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn(name);
        when(call.getSignature()).thenReturn(signature);
    }

    private static CrmPermissionDO ownerRow(Long userId) {
        return permission(userId, CrmPermissionLevelEnum.OWNER);
    }

    private static CrmPermissionDO permission(Long userId, CrmPermissionLevelEnum level) {
        CrmPermissionDO row = new CrmPermissionDO();
        row.setUserId(userId);
        row.setLevel(level.getLevel());
        return row;
    }

    private static CrmReceivablePlanDO plan(Long id) {
        CrmReceivablePlanDO row = new CrmReceivablePlanDO();
        row.setId(id);
        return row;
    }
}
