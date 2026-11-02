// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.aspectj.lang.annotation.Around;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 任务切面的进门路径：工具路径上按模块 controller 那一句权限码收束；请求路径上**一律不碰**。
 *
 * <p>另有一条钉子：**引擎内部读不得进切点**。`getTask` / `getHistoricTask` 在工具发起的那次事务里被
 * `processTaskCanceled`（读下一个人手上的任务）与 create/assign 的事务回调同步调用；按受理人收窄它，那条状态更新会被
 * 静默跳过。`getTasksByProcessInstanceIds` 则是 `BpmProcessInstanceTools` 借来读全部任务名的，收窄会把它饿死。
 *
 * <p>The task aspect's doors: on the tool path it holds the read to the permission code the module's own controller
 * names; on the request path it touches **nothing**. One test is a pin rather than a behaviour: **the engine's internal
 * reads must stay out of the pointcuts** — `getTask` / `getHistoricTask` are called synchronously inside a tool-initiated
 * transaction by `processTaskCanceled` (reading the next person's task) and by the create/assign callbacks, so narrowing
 * them by assignee silently skips that status update; `getTasksByProcessInstanceIds` is what `BpmProcessInstanceTools`
 * borrows to read every task's name, and narrowing it would starve that read.
 */
class BpmTaskGovernanceTest {

    private static final String CALLER = "42";

    private YudaoToolPermissions permissions;
    private BpmTaskGovernance aspect;
    private ProceedingJoinPoint call;
    private Signature signature;

    @BeforeEach
    void setUp() {
        permissions = mock(YudaoToolPermissions.class);
        aspect = new BpmTaskGovernance(permissions);
        call = mock(ProceedingJoinPoint.class);
        signature = mock(Signature.class);
        when(call.getSignature()).thenReturn(signature);
    }

    @Test
    void theTodoPageAsksTheCodeItsControllerNames() throws Throwable {
        when(signature.getName()).thenReturn("getTaskTodoPage");
        when(permissions.refusal(CALLER, "bpm:task:query")).thenReturn(null);
        when(call.proceed()).thenReturn("page");

        assertEquals("page", asTool(() -> aspect.requireReadPermission(call)));

        verify(permissions).refusal(CALLER, "bpm:task:query");
    }

    @Test
    void theManagerPageAsksItsOwnWiderCode() throws Throwable {
        when(signature.getName()).thenReturn("getTaskPage");
        when(permissions.refusal(CALLER, "bpm:task:manager-query")).thenReturn(null);
        when(call.proceed()).thenReturn("page");

        assertEquals("page", asTool(() -> aspect.requireReadPermission(call)));

        verify(permissions).refusal(CALLER, "bpm:task:manager-query");
    }

    @Test
    void aReadWithoutTheCodeIsRefusedBeforeTheModuleRuns() throws Throwable {
        when(signature.getName()).thenReturn("getTaskDonePage");
        when(permissions.refusal(CALLER, "bpm:task:query"))
                .thenReturn("not permitted: this caller lacks the 'bpm:task:query' permission");

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> asTool(() -> aspect.requireReadPermission(call)));

        assertEquals("BpmTask", refused.subject());
        assertEquals("getTaskDonePage", refused.action());
        verify(call, never()).proceed();
    }

    @Test
    void onTheRequestPathNothingIsAsked() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.requireReadPermission(call), "the controller's @PreAuthorize already answered");

        verify(call).proceed();
        verifyNoInteractions(permissions);
    }

    @Test
    void eachReadMapsToTheCodeItsEndpointUses() {
        assertEquals("bpm:task:query", BpmTaskGovernance.permissionFor("getTaskTodoPage"));
        assertEquals("bpm:task:query", BpmTaskGovernance.permissionFor("getTaskDonePage"));
        assertEquals("bpm:task:manager-query", BpmTaskGovernance.permissionFor("getTaskPage"));
    }

    @Test
    void itDeclaresItselfAndNamesTheEnginesTaskField() {
        assertEquals("bpm", aspect.module(), "the module its pointcuts name");
        assertEquals("assignee", aspect.ownerField(), "the engine's task field, not a column on a row");
    }

    /**
     * 引擎内部读与扇出读**一个都不许出现在切点里**。这条用反射读注解，而不是跑一条真链路：它要守的是「谁哪天顺手把
     * `getTask` 加进切点」，而那件事不会有任何可见症状，直到别人的任务状态不再更新。
     *
     * None of the engine's internal or fan-out reads may appear in a pointcut. This reads the annotations by reflection
     * rather than driving a real call: what it guards is "someone adds `getTask` to the pointcut one day", which has no
     * visible symptom until another person's task stops being marked cancelled.
     */
    @Test
    void thePointcutsLeaveTheEnginesInternalReadsAndTheBorrowedBulkReadAlone() {
        List<String> cut = new ArrayList<>();
        for (Method method : BpmTaskGovernance.class.getDeclaredMethods()) {
            Around around = method.getAnnotation(Around.class);
            if (around != null) {
                cut.add(around.value());
            }
        }
        String all = String.join(" ", cut);

        for (String banned : List.of("getTask(", "getHistoricTask(", "getTasksByProcessInstanceIds",
                "getTaskMapByProcessInstanceIds", "processTask", "triggerTask", "moveTaskToEnd", "validateTask")) {
            assertFalse(all.contains("BpmTaskService." + banned),
                    "pointcut names BpmTaskService." + banned + " — the engine calls it inside a tool's own"
                            + " transaction, so narrowing it skips the module's own bookkeeping");
        }
        assertTrue(all.contains("BpmTaskService.getTaskTodoPage(..)"), "the todo page is cut");
        assertTrue(all.contains("BpmTaskService.getTaskDonePage(..)"), "the done page is cut");
        assertTrue(all.contains("BpmTaskService.getTaskPage(..)"), "the manager page is cut");
    }

    /** Runs the advice as {@code CALLER}, the way a tool publishes the caller through {@link ActingCaller}. */
    private Object asTool(Advice advice) {
        return ActingCaller.as(CALLER, () -> {
            try {
                return advice.run();
            } catch (RuntimeException failed) {
                throw failed;
            } catch (Throwable other) {
                throw new AssertionError("the advice raised a checked failure", other);
            }
        });
    }

    @FunctionalInterface
    private interface Advice {
        Object run() throws Throwable;
    }
}
