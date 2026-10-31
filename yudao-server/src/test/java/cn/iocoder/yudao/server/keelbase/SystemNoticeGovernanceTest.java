// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 公告切面的两条进门路径各收一次：**工具路径**上问出 REST 那句权限判据，**请求路径**上原样放行。
 *
 * <p>四条写各对一条权限码，且码取自模块自己的 controller —— 这里逐个钉住，是因为码写错的症状是「问了一个没人
 * 有的问题」，而那种错在真栈上只表现为「管理员也发不了公告」。
 *
 * <p>切面在这里直接调用，不经 Spring AOP；注解有没有生效由上下文测试与真栈门禁管。
 *
 * One test per door into the notice writes: on the **tool path** the aspect asks the question REST
 * asks, and on the **request path** it lets the call through unchanged. The four writes map to four
 * permission codes, and each code is pinned here because a wrong code's symptom is "the administrator
 * cannot publish either" — visible only on a real stack.
 */
class SystemNoticeGovernanceTest {

    private static final String CALLER = "42";

    private YudaoToolPermissions permissions;
    private SystemNoticeGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        permissions = mock(YudaoToolPermissions.class);
        aspect = new SystemNoticeGovernance(permissions);
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void eachWriteAsksForThePermissionItsControllerNames() throws Throwable {
        String[][] expectations = {
                {"createNotice", "system:notice:create"},
                {"updateNotice", "system:notice:update"},
                {"deleteNotice", "system:notice:delete"},
                {"deleteNoticeList", "system:notice:delete"},
        };
        for (String[] expectation : expectations) {
            // The signature mock is built *before* the stubbing call: creating a mock inside an unfinished
            // `when(...)` makes Mockito report an unfinished stubbing.
            // signature 这个 mock 要在 stubbing 调用**之前**建好：在未完成的 `when(...)` 里造 mock，Mockito 会报
            // unfinished stubbing。
            Signature named = signature(expectation[0]);
            when(call.getSignature()).thenReturn(named);
            when(call.proceed()).thenReturn("done");
            when(permissions.refusal(CALLER, expectation[1])).thenReturn(null);

            assertEquals("done", asCaller(),
                    expectation[0] + " runs once the caller holds " + expectation[1]);
        }
        // deleteNotice and deleteNoticeList share one code, so the code is asked twice; the other two once.
        // deleteNotice 与 deleteNoticeList 共用一个码，故这个码被问了两次；另外两个各一次。
        verify(permissions, times(1)).refusal(CALLER, "system:notice:create");
        verify(permissions, times(1)).refusal(CALLER, "system:notice:update");
        verify(permissions, times(2)).refusal(CALLER, "system:notice:delete");
    }

    @Test
    void aCallerWithoutThePermissionIsRefusedBeforeTheWriteRuns() throws Throwable {
        Signature update = signature("updateNotice");
        when(call.getSignature()).thenReturn(update);
        when(permissions.refusal(CALLER, "system:notice:update"))
                .thenReturn("not permitted: this caller lacks the 'system:notice:update' permission");

        RuleDeniedException refused = assertThrows(RuleDeniedException.class, this::asCaller);

        assertEquals("not permitted: this caller lacks the 'system:notice:update' permission",
                refused.getReason(), "the refusal names the code the caller can go and obtain");
        assertEquals("Notice", refused.subject());
        assertEquals("updateNotice", refused.action());
        verify(call, never()).proceed();
    }

    @Test
    void theRequestPathIsLeftToItsOwnPreAuthorize() throws Throwable {
        when(call.proceed()).thenReturn("done");

        assertEquals("done", aspect.requireWritePermission(call),
                "no tool published a caller, so the controller's annotation has already answered");
        verifyNoInteractions(permissions);
    }

    @Test
    void itDeclaresItselfGovernedAndSaysItHasNoOwnerColumn() {
        assertEquals("system", aspect.module(), "the module its pointcuts name");
        assertTrue(aspect.ownerField().startsWith("none"),
                "a notice is a broadcast; naming the absence keeps the next reader from hunting a column");
    }

    /** Runs the advice as {@code CALLER}, the way a tool publishes the caller through {@link ActingCaller}. */
    private Object asCaller() {
        return ActingCaller.as(CALLER, () -> {
            try {
                return aspect.requireWritePermission(call);
            } catch (RuntimeException refused) {
                throw refused;
            } catch (Throwable other) {
                throw new AssertionError("the advice raised a checked failure", other);
            }
        });
    }

    private static Signature signature(String name) {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn(name);
        return signature;
    }
}
