// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCopyPageReqVO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 抄送切面的两扇门：工具路径上把调用方补进第 0 个实参（模块自己按 `user_id` 收束），请求路径上**一律不碰**。
 *
 * <p>要紧的是**它不点切写**：抄送节点在工具发起的那个流程执行里扇出，`BpmCopyTaskDelegate` 带着同一个
 * `ActingCaller` 调 `createProcessInstanceCopy`，在那里拒掉会打坏引擎自己的扇出。故这里只断言读那扇门，写由
 * 各自的父对象回答（`copyTask` 归 {@link BpmTaskGovernance}，抄送节点归引擎）。
 *
 * <p>The copy aspect's two doors: on the tool path it fills the caller into argument 0 (the module scopes by `user_id`
 * itself), and on the request path it touches **nothing**.
 *
 * <p>What matters is that it does **not** point-cut a write: the copy node fans out inside the very process execution a
 * tool started, and `BpmCopyTaskDelegate` calls `createProcessInstanceCopy` with the same `ActingCaller` — refusing there
 * would break the engine's own fan-out. So this test asserts the read door only; the writes are answered by their
 * parents (`copyTask` by {@link BpmTaskGovernance}, the copy node by the engine).
 */
class BpmProcessInstanceCopyGovernanceTest {

    private static final long CALLER = 42L;
    private static final String CALLER_ID = "42";

    private YudaoModuleScope scope;
    private BpmProcessInstanceCopyGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        aspect = new BpmProcessInstanceCopyGovernance(scope);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
    }

    @Test
    void thePageFillsTheCallerWhenTheToolPassedAnother() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{7L, new BpmProcessInstanceCopyPageReqVO()});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        assertEquals("page", asTool(() -> aspect.fillCallerIntoPage(call)));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(call).proceed(args.capture());
        assertEquals(CALLER, args.getValue()[0], "a page that named someone else is held to the caller");
    }

    @Test
    void thePageFillsTheCallerWhenTheToolPassedNone() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{null, new BpmProcessInstanceCopyPageReqVO()});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        asTool(() -> aspect.fillCallerIntoPage(call));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(call).proceed(args.capture());
        assertEquals(CALLER, args.getValue()[0], "a null user id means eqIfPresent adds no condition — the whole table");
    }

    @Test
    void onTheRequestPathThePageIsLeftToTheModule() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{null, new BpmProcessInstanceCopyPageReqVO()});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.fillCallerIntoPage(call), "no tool published a caller");

        verify(call).proceed();
        verifyNoInteractions(scope);
    }

    @Test
    void aCallerRangedOverEveryRowIsNotAddedTo() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        when(call.getArgs()).thenReturn(new Object[]{7L, new BpmProcessInstanceCopyPageReqVO()});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", asTool(() -> aspect.fillCallerIntoPage(call)),
                "an administrator's page is the module's own answer");

        verify(call).proceed();
    }

    @Test
    void itDeclaresItselfAndNamesTheRowsOwnerColumn() {
        assertEquals("bpm", aspect.module(), "the module its pointcut names");
        assertEquals("user_id", aspect.ownerField(), "the row's own column — not an engine field");
    }

    /** Runs the advice as {@code CALLER}, the way a tool publishes the caller through {@link ActingCaller}. */
    private Object asTool(Advice advice) {
        return ActingCaller.as(CALLER_ID, () -> {
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
