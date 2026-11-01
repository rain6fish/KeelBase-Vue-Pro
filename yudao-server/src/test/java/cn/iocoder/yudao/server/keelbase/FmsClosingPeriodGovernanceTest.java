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
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingQueryReqVO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * FMS 结账期间切面的三件事：**工具路径上把 `userId` 钉成行动调用方**（两个读各一次），**请求路径上原样放行**，
 * 以及**指不出本地用户时拒绝而不是猜**。
 *
 * <p>这正是本对象要验的形态：属主是模块自己的账套判权，故切面不改查询、不改结果，它只保证模块判权时问的是
 * **正在行动的那个人**。
 *
 * <p>The three things the closing-period aspect does: pin {@code userId} to the acting caller on the tool
 * path (once per read), leave the request path untouched, and refuse rather than guess when no local user
 * id can be named. That is the form this object exists to test: the owner is the module's own account-set
 * authorisation, so the advice neither rewrites the query nor the result — it only guarantees the module
 * asks about the person who is acting.
 */
class FmsClosingPeriodGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsClosingPeriodGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new FmsClosingPeriodGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void theOverviewIsHeldToTheActingCaller() throws Throwable {
        FmsClosingQueryReqVO query = new FmsClosingQueryReqVO().setAccountSetId(5L).setMonth("2026-08");
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("overview");

        assertEquals("overview", inCaller(CALLER));

        Object[] pinned = pinnedArgs();
        assertEquals(query, pinned[0], "the query is left alone");
        assertEquals(CALLER_ID, pinned[1],
                "the module must check the acting caller, not a user id the path carried");
    }

    @Test
    void theCurrentMonthIsHeldToTheActingCaller() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{5L, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("2026-08");

        assertEquals("2026-08", inCaller(CALLER));

        assertArrayEquals(new Object[]{5L, CALLER_ID}, pinnedArgs(),
                "the account set is left alone; only the person is pinned");
    }

    @Test
    void theStartTimeOverloadIsLeftAlone() throws Throwable {
        // 同名重载的最后一个实参是时间戳：那是别的业务在用的内部校验口，切面不许动它。
        // The last argument of this same-named overload is a timestamp: it is another business's internal
        // gate, and the advice must not touch it.
        when(call.getArgs()).thenReturn(new Object[]{5L, java.time.LocalDateTime.of(2026, 1, 1, 0, 0)});
        when(call.proceed()).thenReturn("2026-08");

        assertEquals("2026-08", inCaller(CALLER));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void theRequestPathIsLeftAlone() throws Throwable {
        when(call.proceed()).thenReturn("overview");

        assertEquals("overview", aspect.pinCallerToTheModule(call));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getClosingOverview");
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
