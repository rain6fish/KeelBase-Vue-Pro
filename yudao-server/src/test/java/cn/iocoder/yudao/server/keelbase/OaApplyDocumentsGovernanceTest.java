// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.module.oa.dal.dataobject.leave.OaLeaveApplyDO;
import cn.iocoder.yudao.module.oa.dal.dataobject.officialdoc.OaOfficialDocReceiveDO;
import cn.iocoder.yudao.module.oa.dal.dataobject.seal.OaSealApplyDO;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * oa 申请单据切面的四种属主形状，逐个断言。**这条单测就是第三形态的可证伪判据**：真栈门看得见「工具跑过了」，
 * 看不见「交回的是空」——运行时的聊天答案不带工具结果——故「别人的行与不存在的行同一个答案」只能在这里钉住。
 *
 * <p>English: the OA application documents' four owner shapes, asserted one by one. <b>This unit test is the
 * third form's falsifiable criterion</b>: a real-stack gate can see that the tool ran but not that the answer
 * was empty — the runtime's chat answer carries no tool result — so "another's row answers as a missing one"
 * is pinned here.
 */
class OaApplyDocumentsGovernanceTest {

    private static final long CALLER = 42L;
    private static final long DEPT = 100L;

    private YudaoModuleScope scope;
    private AdminUserApi adminUsers;
    private OaApplyDocumentsGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        adminUsers = mock(AdminUserApi.class);
        aspect = new OaApplyDocumentsGovernance(scope, adminUsers);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
        when(scope.creatingCaller()).thenReturn(CALLER);
        AdminUserRespDTO caller = new AdminUserRespDTO();
        caller.setId(CALLER);
        caller.setDeptId(DEPT);
        when(adminUsers.getUser(CALLER)).thenReturn(caller);
    }

    // ── creator 形状（十件）────────────────────────────────────────────────────────────────────────

    @Test
    void anothersCreatorOwnedRowIsHandedBackAsNothing() throws Throwable {
        OaLeaveApplyDO others = new OaLeaveApplyDO();
        others.setId(9L);
        others.setCreator("7");
        when(call.proceed()).thenReturn(others);

        assertNull(aspect.withholdOthersRow(call));
    }

    @Test
    void theCallersOwnCreatorOwnedRowComesBack() throws Throwable {
        OaLeaveApplyDO mine = new OaLeaveApplyDO();
        mine.setId(9L);
        mine.setCreator(String.valueOf(CALLER));
        when(scope.belongsToCaller(String.valueOf(CALLER), CALLER)).thenReturn(true);
        when(call.proceed()).thenReturn(mine);

        assertSame(mine, aspect.withholdOthersRow(call));
    }

    // ── user_id 形状（三件）──────────────────────────────────────────────────────────────────────

    @Test
    void anothersUserIdOwnedRowIsHandedBackAsNothing() throws Throwable {
        OaSealApplyDO others = new OaSealApplyDO();
        others.setId(9L);
        others.setUserId(7L);
        when(call.proceed()).thenReturn(others);

        assertNull(aspect.withholdOthersRow(call));
    }

    @Test
    void theCallersOwnUserIdOwnedRowComesBack() throws Throwable {
        OaSealApplyDO mine = new OaSealApplyDO();
        mine.setId(9L);
        mine.setUserId(CALLER);
        when(scope.belongsToCaller(String.valueOf(CALLER), CALLER)).thenReturn(true);
        when(call.proceed()).thenReturn(mine);

        assertSame(mine, aspect.withholdOthersRow(call));
    }

    // ── dept_id 形状（收文，一件）────────────────────────────────────────────────────────────────

    @Test
    void aReceivedDocumentInTheCallersDepartmentComesBack() throws Throwable {
        OaOfficialDocReceiveDO mine = receive(DEPT);
        when(call.proceed()).thenReturn(mine);

        assertSame(mine, aspect.withholdOthersRow(call));
    }

    @Test
    void aReceivedDocumentInAnotherDepartmentIsHandedBackAsNothing() throws Throwable {
        when(call.proceed()).thenReturn(receive(200L));

        assertNull(aspect.withholdOthersRow(call));
    }

    @Test
    void anUnreadableCallerDepartmentNarrows() throws Throwable {
        when(adminUsers.getUser(CALLER)).thenThrow(new IllegalStateException("roles unreadable"));
        when(call.proceed()).thenReturn(receive(DEPT));

        assertNull(aspect.withholdOthersRow(call), "unreadable narrows — it never widens");
    }

    // ── 无调用方（请求路径）与状态回写 ───────────────────────────────────────────────────────────

    @Test
    void withNoCallerTheRowIsLeftAlone() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        OaLeaveApplyDO others = new OaLeaveApplyDO();
        others.setCreator("7");
        when(call.proceed()).thenReturn(others);

        assertSame(others, aspect.withholdOthersRow(call));
    }

    @Test
    void aStatusWriteOnTheToolPathIsRefusedBeforeItRuns() throws Throwable {
        assertThrows(RuleDeniedException.class, () -> aspect.refuseStatusWrite(call));
        verify(call, never()).proceed();
    }

    @Test
    void aStatusWriteOffTheToolPathProceeds() throws Throwable {
        when(scope.creatingCaller()).thenReturn(null);
        when(call.proceed()).thenReturn("written");

        assertEquals("written", aspect.refuseStatusWrite(call));
    }

    @Test
    void theModuleDeclaresItselfAndItsOwnerColumn() {
        assertEquals("oa", aspect.module());
        assertEquals("creator", aspect.ownerField());
    }

    private static OaOfficialDocReceiveDO receive(long deptId) {
        OaOfficialDocReceiveDO row = new OaOfficialDocReceiveDO();
        row.setId(9L);
        row.setReceiveDeptId(deptId);
        return row;
    }
}
