// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.module.crm.controller.admin.receivable.vo.receivable.CrmReceivablePageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.receivable.vo.receivable.CrmReceivableSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.receivable.CrmReceivableDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 回款切面的四条进门路径各收一次：分页补上「只看本人的」、按 id 读按权限表交回、按 id 写只认负责人、创建时属主盖章。
 *
 * <p>为什么回款的读要单列两条：模块自己有两条例外（公海＝没有任何权限行、孤儿＝有行却没有负责人），本切面**照抄**
 * 它们 —— 不抄就是把「页面上看得到」变成「助手看不到」，而抄错方向就是把公海关起来。这里的用例把这三档分开钉住。
 *
 * <p>切面在这里直接调用，不经 Spring AOP；要证的是这段通知对四条路径做了什么，注解有没有生效由上下文测试与真栈门禁管。
 *
 * Four doors into the receivable rows, one test each: the page gets "own rows only" filled in, a read by id is
 * answered from the permission table, a write by id needs the owner, and a create is stamped with the caller.
 * The read has two cases of its own because the module has two exceptions (public sea = no permission rows,
 * orphaned = rows without an owner) and this aspect copies them — not copying them would hide from the
 * assistant what the page shows, and copying them in the wrong direction would lock the public sea.
 * Everything here narrows; nothing widens.
 */
class CrmReceivableGovernanceTest {

    private static final long CALLER = 42L;
    private static final long RECEIVABLE = 7L;

    private YudaoModuleScope scope;
    private CrmPermissionService permissions;
    private CrmReceivableGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        permissions = mock(CrmPermissionService.class);
        aspect = new CrmReceivableGovernance(scope, permissions);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
        when(scope.creatingCaller()).thenReturn(CALLER);
    }

    @Test
    void thePageGetsOwnRowsOnlyWhenNoSceneWasNamed() throws Throwable {
        CrmReceivablePageReqVO query = new CrmReceivablePageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.narrowToCaller(call));
        assertEquals(CrmSceneTypeEnum.OWNER.getType(), query.getSceneType(),
                "upstream's default is every row, so the scene has to be supplied");
    }

    @Test
    void aSceneTheCallerNamedIsLeftAlone() throws Throwable {
        CrmReceivablePageReqVO query = new CrmReceivablePageReqVO();
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
        CrmReceivablePageReqVO query = new CrmReceivablePageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");
        CrmReceivableDO row = receivable(RECEIVABLE);
        ProceedingJoinPoint read = mock(ProceedingJoinPoint.class);
        when(read.proceed()).thenReturn(row);

        aspect.narrowToCaller(call);
        assertNull(query.getSceneType(), "a REST request keeps the module's own handling");
        assertSame(row, aspect.withholdOthersRow(read), "a caller that needs no holding keeps the row");
    }

    @Test
    void anothersReceivableIsHandedBackAsNothing() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE.getType(), RECEIVABLE))
                .thenReturn(List.of(ownerRow(99L)));
        CrmReceivableDO row = receivable(RECEIVABLE);
        when(call.proceed()).thenReturn(row);

        assertNull(aspect.withholdOthersRow(call), "not yours answers the way not-there answers");
    }

    @Test
    void aReceivableWithNoPermissionRowsStaysReadableLikeTheModulesPublicSea() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE.getType(), RECEIVABLE))
                .thenReturn(List.of());
        CrmReceivableDO row = receivable(RECEIVABLE);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "public sea is the module's own READ rule");
    }

    @Test
    void aParticipantCanReadButAnOwnerIsRequiredToWrite() throws Throwable {
        CrmPermissionDO participant = permission(CALLER, CrmPermissionLevelEnum.READ);
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_RECEIVABLE.getType(), RECEIVABLE))
                .thenReturn(List.of(ownerRow(99L), participant));
        CrmReceivableDO row = receivable(RECEIVABLE);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "a participant may read");

        CrmReceivableSaveReqVO update = new CrmReceivableSaveReqVO();
        update.setId(RECEIVABLE);
        when(call.getArgs()).thenReturn(new Object[]{update});
        org.aspectj.lang.Signature signature = mock(org.aspectj.lang.Signature.class);
        when(signature.getName()).thenReturn("updateReceivable");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "a write is owner-only, stricter than the module's WRITE level");
    }

    @Test
    void theOwnerIsStampedFromTheCallerBeforeValidation() throws Throwable {
        CrmReceivableSaveReqVO create = new CrmReceivableSaveReqVO();
        create.setOwnerUserId(99L);
        when(call.getArgs()).thenReturn(new Object[]{create});
        when(call.proceed()).thenReturn(1L);

        aspect.stampOwner(call);

        assertEquals(CALLER, create.getOwnerUserId(), "a client may not name someone else as owner");
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

    private static CrmReceivableDO receivable(Long id) {
        CrmReceivableDO row = new CrmReceivableDO();
        row.setId(id);
        return row;
    }
}
