// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCancelReqVO;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstancePageReqVO;
import cn.iocoder.yudao.module.bpm.enums.task.BpmProcessInstanceStatusEnum;
import cn.iocoder.yudao.module.bpm.framework.flowable.core.enums.BpmnVariableConstants;
import cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceService;
import cn.iocoder.yudao.module.bpm.service.task.BpmTaskService;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 流程实例工具面的四件事：**读只投影五个业务字段**（流程变量与表单内容一个都不出去）、**调用方以发起人身份随
 * 调用传入**、**撤回以文本携带实例 id**（Flowable 的 id 是 UUID）、以及**没有 id 的撤回不触达模块**。
 *
 * <p>第一条是这组里最要紧的：`getProcessInstancePage` 的查询本身带 `includeProcessVariables`，实例上整张变量表
 * 一取即得。把投影钉成恰好五个键，任何人往里加第六个（或把变量表带出来）都会当场红。
 *
 * <p>Three things the process-instance face does: the read projects **five business fields only** (no process
 * variables, no form content), the caller travels as the starter argument, and the withdrawal carries the
 * instance id as **text** (Flowable's ids are UUIDs) while a withdrawal without an id never reaches the module.
 *
 * <p>The first matters most: `getProcessInstancePage` queries with `includeProcessVariables`, so the whole
 * variable map is one call away. Pinning the projection to exactly five keys makes any sixth one — or a
 * variable map sneaking out — go red on the spot.
 */
class BpmProcessInstanceToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;
    private static final String INSTANCE = "262de6a9-d59d-11f1-9e88-681def59d09d";

    private BpmProcessInstanceService instances;
    private BpmTaskService tasks;
    private BpmProcessInstanceTools.ListTool listTool;
    private BpmProcessInstanceTools.CancelTool cancelTool;

    @BeforeEach
    void setUp() {
        instances = mock(BpmProcessInstanceService.class);
        tasks = mock(BpmTaskService.class);
        listTool = new BpmProcessInstanceTools.ListTool(instances, tasks);
        cancelTool = new BpmProcessInstanceTools.CancelTool(instances);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theListProjectsFiveBusinessFieldsWithoutVariablesOrForm() {
        HistoricProcessInstance instance = mock(HistoricProcessInstance.class);
        when(instance.getId()).thenReturn("p1");
        when(instance.getBusinessKey()).thenReturn("b1");
        when(instance.getStartTime()).thenReturn(Date.from(Instant.parse("2026-11-02T00:00:00Z")));
        when(instance.getProcessVariables()).thenReturn(Map.of(
                BpmnVariableConstants.PROCESS_INSTANCE_VARIABLE_STATUS, 1,
                "gateNote", "gate-secret-form-value"));
        Task task = mock(Task.class);
        when(task.getName()).thenReturn("Review");
        when(tasks.getTaskMapByProcessInstanceIds(any())).thenReturn(Map.of("p1", List.of(task)));
        when(instances.getProcessInstancePage(anyLong(), any())).thenAnswer(invocation -> {
            assertEquals(CALLER, ActingCaller.current(), "the caller is published for the module's own narrowing");
            assertEquals(CALLER_ID, invocation.<Long>getArgument(0),
                    "the caller travels as the starter argument the module's page takes");
            BpmProcessInstancePageReqVO query = invocation.getArgument(1);
            assertEquals(50, query.getPageSize(), "a bounded page, not the table");
            return new PageResult<>(List.of(instance), 1L);
        });

        ToolResult result = listTool.execute(Map.of(), caller());

        assertTrue(result.success());
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(1, rows.size());
        assertEquals(List.of("id", "businessKey", "startTime", "status", "currentTaskName"),
                List.copyOf(rows.get(0).keySet()),
                "five business fields — the variable map and the form must not reappear");
        assertEquals("p1", rows.get(0).get("id"));
        assertEquals("b1", rows.get(0).get("businessKey"));
        assertEquals("2026-11-02T00:00:00Z", rows.get(0).get("startTime"));
        assertEquals(1, rows.get(0).get("status"), "the status variable is the one field taken, by name");
        assertEquals("Review", rows.get(0).get("currentTaskName"));
        assertFalse(String.valueOf(result.data()).contains("gate-secret-form-value"),
                "no process variable other than the named status may leave this face");
    }

    @Test
    void anEmptyPageIsAnAnswerNotAFailure() {
        when(instances.getProcessInstancePage(anyLong(), any())).thenReturn(new PageResult<>(List.of(), 0L));

        ToolResult result = listTool.execute(Map.of(), caller());

        assertTrue(result.success());
        assertEquals(List.of(), result.data(), "nothing started by the caller is a fact, not an error");
        verifyNoInteractions(tasks);
    }

    @Test
    void theFaceDeclaresItsContracts() {
        assertEquals("list_my_bpm_instances", listTool.name());
        assertEquals("R1", listTool.riskLevel());
        assertTrue(listTool.parameters().isEmpty(), "the starter is the published caller, not an argument");

        assertEquals("cancel_my_bpm_instance", cancelTool.name());
        assertEquals("R3", cancelTool.riskLevel());
        assertEquals("bpm_process_instance", cancelTool.resultType());
        assertEquals(List.of("id", "reason"), cancelTool.parameters().stream().map(ToolParameter::name).toList());
        assertTrue(cancelTool.parameters().get(0).required(), "the instance to withdraw is required");
        assertFalse(cancelTool.parameters().get(1).required(),
                "a default reason keeps an approved write from failing on the module's @NotEmpty");
    }

    @Test
    void theRoutesAnswerTheCallersOwnWordsAndCarryTheInstanceAsText() {
        BpmProcessInstanceTools.ListRoute listRoute = new BpmProcessInstanceTools.ListRoute();
        assertTrue(listRoute.triggers().contains("我发起的流程"));
        assertTrue(listRoute.args(Map.of("message", "我发起的流程")).isEmpty());

        BpmProcessInstanceTools.CancelRoute cancelRoute = new BpmProcessInstanceTools.CancelRoute();
        assertTrue(cancelRoute.triggers().contains("撤回流程"));
        assertEquals(Map.of("id", INSTANCE), cancelRoute.args(Map.of("targetId", INSTANCE)),
                "the instance id travels as text — typed for numbers, the slot refused this very request");
        assertTrue(cancelRoute.args(Map.of()).isEmpty(), "no slot means no id, and the tool refuses it");
    }

    @Test
    void aCancelWithoutAnIdFailsWithoutCallingTheModule() {
        ToolResult result = cancelTool.execute(Map.of(), caller());

        assertFalse(result.success());
        verifyNoInteractions(instances);
    }

    @Test
    void theCancelTravelsAsTheCallerAndReturnsTheInstanceIdAsText() {
        ToolResult result = cancelTool.execute(Map.of("id", INSTANCE), caller());

        assertTrue(result.success());
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(INSTANCE, out.get("id"), "the ledger's result id is the real Flowable UUID, not a proxy");
        assertEquals(BpmProcessInstanceStatusEnum.CANCEL.getStatus(), out.get("status"));

        ArgumentCaptor<BpmProcessInstanceCancelReqVO> request =
                ArgumentCaptor.forClass(BpmProcessInstanceCancelReqVO.class);
        verify(instances).cancelProcessInstanceByStartUser(eq(CALLER_ID), request.capture());
        assertEquals(INSTANCE, request.getValue().getId());
        assertEquals("通过 AI 助手撤回", request.getValue().getReason(),
                "an omitted reason is supplied here, so an approved write does not trip the VO's @NotEmpty");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }
}
