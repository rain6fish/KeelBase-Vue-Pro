// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskApproveReqVO;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskPageReqVO;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskRejectReqVO;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 任务切面的进门路径：工具路径上补调用方、按 `assignee` 收「全部」页、审批与驳回前拒绝别人的任务、八个动作直接拒绝；
 * 请求路径上**一律不碰**。
 *
 * <p>「全部」页那条是这组里最要紧的一条：模块**根本不读** `userId`，所以实参补了也白补，收窄只能落在返回行上——
 * 断言看的是留下的行与 `total`，而不是实参。
 *
 * <p>The task aspect's doors: on the tool path it fills the caller, narrows the "all" page by `assignee`, refuses a
 * decision on someone else's task and refuses the eight actions outright; on the request path it touches **nothing**.
 * The "all"-page assertion matters most: the module **never reads** `userId`, so filling the argument does nothing and
 * the narrowing can only land on the returned rows — which is what the assertion reads, together with `total`.
 */
class BpmTaskGovernanceTest {

    private static final long CALLER = 42L;
    private static final String CALLER_ID = "42";

    private YudaoModuleScope scope;
    private TaskService engineTasks;
    private BpmTaskGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        engineTasks = mock(TaskService.class);
        aspect = new BpmTaskGovernance(scope, engineTasks);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
    }

    @Test
    void theTodoPageFillsTheCallerWhenTheToolPassedAnother() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{7L, new BpmTaskPageReqVO()});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        assertEquals("page", asTool(() -> aspect.fillCallerIntoPage(call)));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(call).proceed(args.capture());
        assertEquals(CALLER, args.getValue()[0], "a page that named someone else is held to the caller");
    }

    @Test
    void theDonePageFillsTheCallerToo() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{null, new BpmTaskPageReqVO()});
        when(call.proceed(any(Object[].class))).thenReturn("page");

        asTool(() -> aspect.fillCallerIntoPage(call));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(call).proceed(args.capture());
        assertEquals(CALLER, args.getValue()[0], "a null user id upstream is the string \"null\" — never everyone");
    }

    @Test
    void theFullPageKeepsOnlyTheCallersRows() throws Throwable {
        HistoricTaskInstance mine = historic("42");
        HistoricTaskInstance others = historic("7");
        HistoricTaskInstance unassigned = historic(null);
        when(call.proceed()).thenReturn(new PageResult<>(List.of(mine, others, unassigned), 3L));
        when(scope.belongsToCaller("42", CALLER)).thenReturn(true);
        when(scope.belongsToCaller("7", CALLER)).thenReturn(false);
        when(scope.belongsToCaller(null, CALLER)).thenReturn(false);

        @SuppressWarnings("unchecked")
        PageResult<HistoricTaskInstance> kept = (PageResult<HistoricTaskInstance>) asTool(
                () -> aspect.keepOnlyCallersRows(call));

        assertEquals(List.of(mine), kept.getList(), "the module ignores userId here, so the rows are narrowed instead");
        assertEquals(1L, kept.getTotal(), "the total is this page's, not the table's — declared");
    }

    @Test
    void onTheRequestPathThePagesAreLeftToTheModule() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{null, new BpmTaskPageReqVO()});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.fillCallerIntoPage(call), "no tool published a caller");

        verify(call).proceed();
        verifyNoInteractions(scope);
    }

    @Test
    void anApprovalOfAnothersTaskIsRefusedBeforeTheModuleRuns() throws Throwable {
        BpmTaskApproveReqVO request = approveRequest("t1");
        Task others = task("7");
        TaskQuery query = finding("t1");
        when(query.singleResult()).thenReturn(others);
        when(engineTasks.createTaskQuery()).thenReturn(query);
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> asTool(() -> aspect.requireAssigneeForApproval(call)));

        assertEquals("BpmTask", refused.subject());
        assertEquals("approveTask", refused.action());
        verify(call, never()).proceed();
    }

    @Test
    void anApprovalOfTheCallersOwnTaskProceeds() throws Throwable {
        BpmTaskApproveReqVO request = approveRequest("t1");
        Task mine = task("42");
        TaskQuery query = finding("t1");
        when(query.singleResult()).thenReturn(mine);
        when(engineTasks.createTaskQuery()).thenReturn(query);
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});
        when(scope.belongsToCaller("42", CALLER)).thenReturn(true);
        when(call.proceed()).thenReturn("approved");

        assertEquals("approved", asTool(() -> aspect.requireAssigneeForApproval(call)));
        verify(call).proceed();
    }

    @Test
    void anUnassignedTaskIsNotTheCallersToApprove() throws Throwable {
        BpmTaskApproveReqVO request = approveRequest("t1");
        Task unassigned = task(null);
        TaskQuery query = finding("t1");
        when(query.singleResult()).thenReturn(unassigned);
        when(engineTasks.createTaskQuery()).thenReturn(query);
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});
        when(scope.belongsToCaller(null, CALLER)).thenReturn(false);

        assertThrows(RuleDeniedException.class, () -> asTool(() -> aspect.requireAssigneeForApproval(call)),
                "the module lets a blank assignee through for auto-approve; the tool path does not");
        verify(call, never()).proceed();
    }

    @Test
    void aRejectionOfAnothersTaskIsRefused() throws Throwable {
        BpmTaskRejectReqVO request = rejectRequest("t1");
        Task others = task("7");
        TaskQuery query = finding("t1");
        when(query.singleResult()).thenReturn(others);
        when(engineTasks.createTaskQuery()).thenReturn(query);
        when(call.getArgs()).thenReturn(new Object[]{CALLER, request});

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> asTool(() -> aspect.requireAssigneeForRejection(call)));

        assertEquals("rejectTask", refused.action());
        verify(call, never()).proceed();
    }

    @Test
    void onTheRequestPathTheDecisionIsLeftToTheModule() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{CALLER, approveRequest("t1")});
        when(call.proceed()).thenReturn("approved");

        assertEquals("approved", aspect.requireAssigneeForApproval(call), "the module's own assignee check is inside");

        verify(call).proceed();
        verifyNoInteractions(engineTasks);
    }

    @Test
    void theUntouchableActionsAreRefusedOnTheToolPath() throws Throwable {
        List<String> actions = List.of("transferTask", "delegateTask", "createSignTask", "deleteSignTask",
                "returnTask", "moveTaskToEnd", "copyTask", "withdrawTask");
        for (String action : actions) {
            Signature signature = mock(Signature.class);
            when(signature.getName()).thenReturn(action);
            when(call.getSignature()).thenReturn(signature);

            RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                    () -> asTool(() -> aspect.refuseOutOfScopeActions(call)), action);

            assertEquals(action, refused.action(), action);
            assertTrue(refused.nextStep() != null && !refused.nextStep().isBlank(), action + " names a next step");
        }
        verify(call, never()).proceed();
    }

    @Test
    void onTheRequestPathTheUntouchableActionsAreLeftToTheModule() throws Throwable {
        when(call.proceed()).thenReturn("done");

        assertEquals("done", aspect.refuseOutOfScopeActions(call), "no tool published a caller");

        verify(call).proceed();
        verifyNoInteractions(scope);
    }

    @Test
    void itDeclaresItselfAndNamesTheEnginesOwnerField() {
        assertEquals("bpm", aspect.module(), "the module its pointcuts name");
        assertEquals("assignee", aspect.ownerField(), "the engine's field, not a column on a row");
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

    private static TaskQuery finding(String taskId) {
        TaskQuery query = mock(TaskQuery.class);
        when(query.taskId(taskId)).thenReturn(query);
        return query;
    }

    private static Task task(String assignee) {
        Task task = mock(Task.class);
        when(task.getAssignee()).thenReturn(assignee);
        return task;
    }

    private static HistoricTaskInstance historic(String assignee) {
        HistoricTaskInstance task = mock(HistoricTaskInstance.class);
        when(task.getAssignee()).thenReturn(assignee);
        return task;
    }

    private static BpmTaskApproveReqVO approveRequest(String id) {
        BpmTaskApproveReqVO request = new BpmTaskApproveReqVO();
        request.setId(id);
        request.setReason("同意");
        return request;
    }

    private static BpmTaskRejectReqVO rejectRequest(String id) {
        BpmTaskRejectReqVO request = new BpmTaskRejectReqVO();
        request.setId(id);
        request.setReason("不同意");
        return request;
    }

    @FunctionalInterface
    private interface Advice {
        Object run() throws Throwable;
    }
}
