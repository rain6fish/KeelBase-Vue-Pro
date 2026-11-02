// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.module.fms.controller.admin.ledger.vo.FmsLedgerListReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.FmsReportListReqVO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * FMS 读数面切面的三件事：**四个读入口在工具路径上把 `userId` 钉成行动调用方**，**请求路径上原样放行**，以及
 * **指不出本地用户时拒绝而不是猜**。四个对象共用一条通知，因为它们回答的是同一个问题——模块按账套判权，
 * 切面欠的只是「判权时问的是正在行动的那个人」。
 *
 * <p>The three things the reporting aspect does: pin {@code userId} to the acting caller on the tool path for
 * each of the four reads, leave the request path untouched, and refuse rather than guess when no local user id
 * can be named. The four objects share one advice because they answer the same question — the module
 * authorises by account set, and the advice owes only "the check asks the person who is acting".
 */
class FmsReportingGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsReportingGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new FmsReportingGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void theBalanceSheetIsHeldToTheActingCaller() throws Throwable {
        FmsReportListReqVO query = new FmsReportListReqVO().setAccountSetId(5L)
                .setStartMonth("2026-08").setEndMonth("2026-09");
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("rows");

        assertEquals("rows", inCaller(CALLER));

        Object[] pinned = pinnedArgs();
        assertEquals(query, pinned[0], "the query is left alone");
        assertEquals(CALLER_ID, pinned[1],
                "the module must check the acting caller, not a user id the path carried");
    }

    @Test
    void theIncomeStatementIsHeldToTheActingCaller() throws Throwable {
        FmsReportListReqVO query = new FmsReportListReqVO().setAccountSetId(5L)
                .setStartMonth("2026-08").setEndMonth("2026-09");
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("items");

        assertEquals("items", inCaller(CALLER));

        assertArrayEquals(new Object[]{query, CALLER_ID}, pinnedArgs(),
                "only the person is pinned; the query stays as the path wrote it");
    }

    @Test
    void theCashFlowStatementIsHeldToTheActingCaller() throws Throwable {
        FmsReportListReqVO query = new FmsReportListReqVO().setAccountSetId(5L)
                .setStartMonth("2026-08").setEndMonth("2026-09");
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("items");

        assertEquals("items", inCaller(CALLER));

        assertArrayEquals(new Object[]{query, CALLER_ID}, pinnedArgs(),
                "only the person is pinned; the query stays as the path wrote it");
    }

    @Test
    void theSubjectBalancesAreHeldToTheActingCaller() throws Throwable {
        FmsLedgerListReqVO query = new FmsLedgerListReqVO().setAccountSetId(5L)
                .setStartMonth("2026-08").setEndMonth("2026-09");
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("balances");

        assertEquals("balances", inCaller(CALLER));

        assertArrayEquals(new Object[]{query, CALLER_ID}, pinnedArgs(),
                "only the person is pinned; the query stays as the path wrote it");
    }

    @Test
    void anEntryWithoutAUserIdIsLeftAlone() throws Throwable {
        FmsReportListReqVO query = new FmsReportListReqVO().setAccountSetId(5L)
                .setStartMonth("2026-08").setEndMonth("2026-09");
        when(call.getArgs()).thenReturn(new Object[]{query});
        when(call.proceed()).thenReturn("rows");

        assertEquals("rows", inCaller(CALLER));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void theRequestPathIsLeftAlone() throws Throwable {
        when(call.proceed()).thenReturn("rows");

        assertEquals("rows", aspect.pinCallerToTheModule(call));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getBalanceSheet");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class, () -> inCaller("not-a-number"));

        verify(call, never()).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void theModuleDeclaresItselfAndHasNoOwnerColumn() {
        assertEquals("fms", aspect.module());
        assertTrue(aspect.ownerField().startsWith("none"),
                "the module authorises by account set; there is no column for the advice to read");
    }

    /** Runs the advice with a published acting caller, the way the tool path does. */
    private Object inCaller(String caller) {
        return ActingCaller.as(caller, () -> {
            try {
                return aspect.pinCallerToTheModule(call);
            } catch (RuntimeException refused) {
                throw refused;
            } catch (Throwable other) {
                throw new RuntimeException(other);
            }
        });
    }

    private Object[] pinnedArgs() {
        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        try {
            verify(call).proceed(captor.capture());
        } catch (Throwable impossibleForAMock) {
            throw new AssertionError(impossibleForAMock);
        }
        return captor.getValue();
    }
}
