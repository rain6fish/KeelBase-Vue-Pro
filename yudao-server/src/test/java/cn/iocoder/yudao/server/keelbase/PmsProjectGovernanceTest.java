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
import cn.iocoder.yudao.module.pms.controller.admin.pm.project.vo.project.PmsProjectPageReqVO;
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.workitem.PmsWorkItemPageReqVO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * pms 切面只做一件事：**把最后一个实参钉成行动调用方**；请求路径原样放行，指不出本地用户时拒绝而不是猜。
 *
 * <p>这正是本对象要验的形态：可见性由模块自己按成员表判，故切面不改查询、不改结果，它只保证模块判权时问的是
 * **正在行动的那个人**。
 *
 * <p>The pms aspect does one thing: **the last argument becomes the acting caller**. The request path passes through,
 * and a caller that cannot be read as a local user id is refused rather than guessed. The module authorises by its own
 * membership table, so the advice neither rewrites the query nor the result — it only guarantees the module asks about
 * the person who is acting.
 */
class PmsProjectGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PmsProjectGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new PmsProjectGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void theProjectPageIsHeldToTheActingCaller() throws Throwable {
        PmsProjectPageReqVO query = new PmsProjectPageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        assertEquals("page", inCaller(CALLER));

        Object[] pinned = pinnedArgs();
        assertEquals(query, pinned[0], "the query is left alone");
        assertEquals(CALLER_ID, pinned[1], "the module must check the acting caller, not a user id it was handed");
    }

    @Test
    void theProjectReadByIdIsHeldToTheActingCaller() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{9L, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("project");

        assertEquals("project", inCaller(CALLER));

        assertArrayEquals(new Object[]{9L, CALLER_ID}, pinnedArgs(), "the row is left alone; only the person is pinned");
    }

    @Test
    void theWorkItemPageIsHeldToTheActingCaller() throws Throwable {
        PmsWorkItemPageReqVO query = new PmsWorkItemPageReqVO();
        query.setProjectId(9L);
        when(call.getArgs()).thenReturn(new Object[]{query, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("items");

        assertEquals("items", inCaller(CALLER));

        Object[] pinned = pinnedArgs();
        assertEquals(query, pinned[0]);
        assertEquals(CALLER_ID, pinned[1]);
    }

    @Test
    void theWorkLogSummaryIsHeldToTheActingCaller() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{600L, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("summary");

        assertEquals("summary", inCaller(CALLER));

        assertArrayEquals(new Object[]{600L, CALLER_ID}, pinnedArgs(),
                "the work item is left alone; only the person is pinned");
    }

    @Test
    void theWorkLogReadByIdIsHeldToTheActingCaller() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{905L, 7L});
        when(call.proceed(any(Object[].class))).thenReturn("workLog");

        assertEquals("workLog", inCaller(CALLER));

        assertArrayEquals(new Object[]{905L, CALLER_ID}, pinnedArgs());
    }

    @Test
    void aShapeWithoutATrailingUserIdIsLeftAlone() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{9L, "not-a-user"});
        when(call.proceed()).thenReturn("unchanged");

        assertEquals("unchanged", inCaller(CALLER));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void theRequestPathIsLeftAlone() throws Throwable {
        when(call.proceed()).thenReturn("project");

        assertEquals("project", aspect.pinTheUserIdArgument(call));

        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getProjectPage");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class, () -> inCaller("not-a-number"));

        verify(call, never()).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void theModuleDeclaresItselfAndHasNoOwnerColumn() {
        assertEquals("pms", aspect.module());
        assertTrue(aspect.ownerField().startsWith("none"),
                "the module authorises by membership; there is no column for the advice to read");
    }

    /** Runs the advice with a published acting caller, the way the tool path does. */
    private Object inCaller(String caller) {
        return ActingCaller.as(caller, () -> {
            try {
                return aspect.pinTheUserIdArgument(call);
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
