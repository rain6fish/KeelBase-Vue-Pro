// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCancelReqVO;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstancePageReqVO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.runtime.ProcessInstanceQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 流程实例切面的进门路径：工具路径上补调用方、按 id 收束、撤回前拒绝；请求路径上**一律不碰**。
 *
 * <p>请求路径那条断言是这组里最要紧的一条：按 id 读是引擎内部的扇出读（候选人策略、任务监听器、抄送都在审批过程中
 * 用它读发起人的实例），在请求路径上收窄它会让**审批人**的每次审批都读到 null。故「不碰」不是省事，是行为。
 *
 * <p>The process-instance aspect's doors: on the tool path it fills the caller, narrows the by-id read and refuses a
 * withdrawal before the module runs; on the request path it touches **nothing**. That last assertion matters most: the
 * by-id read is the engine's internal fan-out (candidate strategies, task listeners and the copy service read the
 * starter's instance through it during an approval), and narrowing it on the request path would make every approver read
 * null. "Touches nothing" is behaviour here, not a shortcut.
 */
class BpmProcessInstanceGovernanceTest {

    private static final long CALLER = 42L;
    private static final String CALLER_ID = "42";

    private YudaoModuleScope scope;
    private RuntimeService runtime;
    private BpmProcessInstanceGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        runtime = mock(RuntimeService.class);
        aspect = new BpmProcessInstanceGovernance(scope, runtime);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
    }

    @Test
    void thePageFillsTheCallerWhenTheRequestSaidNothing() throws Throwable {
        BpmProcessInstancePageReqVO query = new BpmProcessInstancePageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{null, query});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        assertEquals("page", asTool(() -> aspect.narrowToCaller(call)));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(call).proceed(args.capture());
        assertEquals(CALLER, args.getValue()[0], "a null user id means no condition upstream — supplied here");
    }

    @Test
    void thePageAlsoOverridesARequestThatNamedSomeoneElse() throws Throwable {
        BpmProcessInstancePageReqVO query = new BpmProcessInstancePageReqVO();
        query.setStartUserId(7L);
        when(call.getArgs()).thenReturn(new Object[]{null, query});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        asTool(() -> aspect.narrowToCaller(call));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(call).proceed(args.capture());
        assertEquals(CALLER, args.getValue()[0], "the manager page's own startUserId cannot widen the tool path");
    }

    @Test
    void onTheRequestPathThePageIsLeftToTheModule() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{null, new BpmProcessInstancePageReqVO()});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.narrowToCaller(call), "no tool published a caller");

        verify(call).proceed();
        verifyNoInteractions(scope);
    }

    @Test
    void aReadByIdHandsAnothersInstanceBackAsNothing() throws Throwable {
        HistoricProcessInstance others = mock(HistoricProcessInstance.class);
        when(others.getStartUserId()).thenReturn("7");
        when(call.proceed()).thenReturn(others);

        assertNull(asTool(() -> aspect.withholdOthersInstance(call)), "not yours and not there answer the same way");
    }

    @Test
    void aReadByIdReturnsTheCallersOwnInstance() throws Throwable {
        ProcessInstance mine = mock(ProcessInstance.class);
        when(mine.getStartUserId()).thenReturn(CALLER_ID);
        when(scope.belongsToCaller(CALLER_ID, CALLER)).thenReturn(true);
        when(call.proceed()).thenReturn(mine);

        assertSame(mine, asTool(() -> aspect.withholdOthersInstance(call)));
    }

    @Test
    void aWithdrawalOfAnothersInstanceIsRefusedBeforeTheModuleRuns() throws Throwable {
        BpmProcessInstanceCancelReqVO request = cancelRequest("p1");
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});
        ProcessInstanceQuery query = mock(ProcessInstanceQuery.class);
        ProcessInstance others = mock(ProcessInstance.class);
        when(runtime.createProcessInstanceQuery()).thenReturn(query);
        when(query.processInstanceId("p1")).thenReturn(query);
        when(query.singleResult()).thenReturn(others);
        when(others.getStartUserId()).thenReturn("7");

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> asTool(() -> aspect.requireStarter(call)));

        assertEquals("BpmProcessInstance", refused.subject());
        assertEquals("cancelProcessInstanceByStartUser", refused.action());
        verify(call, never()).proceed();
    }

    @Test
    void aWithdrawalOfTheCallersOwnInstanceProceeds() throws Throwable {
        BpmProcessInstanceCancelReqVO request = cancelRequest("p1");
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});
        ProcessInstanceQuery query = mock(ProcessInstanceQuery.class);
        ProcessInstance mine = mock(ProcessInstance.class);
        when(runtime.createProcessInstanceQuery()).thenReturn(query);
        when(query.processInstanceId("p1")).thenReturn(query);
        when(query.singleResult()).thenReturn(mine);
        when(mine.getStartUserId()).thenReturn(CALLER_ID);
        when(scope.belongsToCaller(CALLER_ID, CALLER)).thenReturn(true);
        when(call.proceed()).thenReturn("cancelled");

        assertEquals("cancelled", asTool(() -> aspect.requireStarter(call)));
        verify(call).proceed();
    }

    @Test
    void aMissingInstanceIsLeftToTheModuleToName() throws Throwable {
        BpmProcessInstanceCancelReqVO request = cancelRequest("gone");
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});
        ProcessInstanceQuery query = mock(ProcessInstanceQuery.class);
        when(runtime.createProcessInstanceQuery()).thenReturn(query);
        when(query.processInstanceId("gone")).thenReturn(query);
        when(query.singleResult()).thenReturn(null);
        when(call.proceed()).thenReturn("module answers");

        assertEquals("module answers", asTool(() -> aspect.requireStarter(call)),
                "null here means missing, and upstream already has a code for that");
    }

    @Test
    void onTheRequestPathTheWithdrawalIsLeftToTheModule() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{CALLER, cancelRequest("p1")});
        when(call.proceed()).thenReturn("cancelled");

        assertEquals("cancelled", aspect.requireStarter(call), "the module's own starter check is inside");

        verify(call).proceed();
        verifyNoInteractions(runtime);
    }

    @Test
    void itDeclaresItselfAndNamesTheEnginesOwnerField() {
        assertEquals("bpm", aspect.module(), "the module its pointcuts name");
        assertEquals("start_user_id", aspect.ownerField(), "the engine's field, not a column on a row");
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

    private static BpmProcessInstanceCancelReqVO cancelRequest(String id) {
        BpmProcessInstanceCancelReqVO request = new BpmProcessInstanceCancelReqVO();
        request.setId(id);
        request.setReason("不请假了");
        return request;
    }

    @FunctionalInterface
    private interface Advice {
        Object run() throws Throwable;
    }
}
