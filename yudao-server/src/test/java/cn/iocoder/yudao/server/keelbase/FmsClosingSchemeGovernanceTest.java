// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

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
 * 结账方案切面的三件事：**工具路径上把 `userId` 钉成行动调用方**，**请求路径上原样放行**，以及**指不出本地用户时
 * 拒绝而不是猜**。
 *
 * <p>与结账期间、期初余额同一个形态：属主是模块自己的账套判权，故切面不改查询、不改结果，它只保证模块判权时问的是
 * **正在行动的那个人**；查询条件在第 0 槽，原样不动。
 *
 * <p>The three things the closing-scheme aspect does: pin {@code userId} to the acting caller on the tool path,
 * leave the request path untouched, and refuse rather than guess when no local user id can be named. Same form as
 * the closing period and the opening balances: the owner is the module's own account-set authorisation, so the
 * advice neither rewrites the query nor the result — it only guarantees the module asks about the person who is
 * acting, and the query in argument 0 is left alone.
 */
class FmsClosingSchemeGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsClosingSchemeGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new FmsClosingSchemeGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void theListIsHeldToTheActingCaller() throws Throwable {
        FmsClosingQueryReqVO query = new FmsClosingQueryReqVO().setAccountSetId(5L).setMonth("2026-08");
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("schemes");

        assertEquals("schemes", inCaller(CALLER));

        Object[] pinned = pinnedArgs();
        assertEquals(query, pinned[0], "the query is left alone");
        assertEquals(CALLER_ID, pinned[1],
                "the module must check the acting caller, not a user id the path carried");
    }

    @Test
    void theRequestPathIsLeftAlone() throws Throwable {
        when(call.proceed()).thenReturn("schemes");

        assertEquals("schemes", aspect.pinCallerToTheModule(call));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getClosingSchemeList");
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
