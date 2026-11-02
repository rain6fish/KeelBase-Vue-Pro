// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskPageReqVO;
import cn.iocoder.yudao.module.bpm.service.task.BpmTaskService;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 任务工具面的三件事：**读只投影四个字段**、**调用方以受理人身份随调用传入**、**契约（R1、无参数）**。
 *
 * <p>四个字段那条是这组里最要紧的：任务上还挂着审批理由、状态与签字图片地址，`getTask` 的查询本来就带
 * `includeTaskLocalVariables`。把投影钉成恰好四个键，任何人往里加第五个都会当场红。
 *
 * <p>The three things the task face does: project **four fields only**, carry the caller as the assignee argument, and
 * declare its contract (R1, no parameters). The four-field assertion matters most: approval reason, status and the
 * signature image URL hang off the task, and `getTask` already queries with `includeTaskLocalVariables`. Pinning the
 * projection to exactly four keys makes any fifth one go red on the spot.
 */
class BpmTaskToolsTest {

    private static final String CALLER = "42";

    private BpmTaskService service;
    private BpmTaskTools.ListTool listTool;

    @BeforeEach
    void setUp() {
        service = mock(BpmTaskService.class);
        listTool = new BpmTaskTools.ListTool(service);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theListProjectsFourFieldsAndTravelsAsTheAssignee() {
        Task task = mock(Task.class);
        when(task.getId()).thenReturn("t1");
        when(task.getName()).thenReturn("请假审批");
        when(task.getCreateTime()).thenReturn(Date.from(Instant.parse("2026-11-01T08:00:00Z")));
        when(task.getProcessInstanceId()).thenReturn("p1");
        when(service.getTaskTodoPage(anyLong(), any())).thenAnswer(invocation -> {
            assertEquals(CALLER, ActingCaller.current(), "the caller is published for the module's own narrowing");
            assertEquals(42L, invocation.<Long>getArgument(0),
                    "the caller travels as the assignee argument the module's page takes");
            BpmTaskPageReqVO query = invocation.getArgument(1);
            assertEquals(20, query.getPageSize(), "a todo list stays a list");
            return new PageResult<>(List.of(task), 1L);
        });

        ToolResult result = listTool.execute(Map.of(), caller());

        assertTrue(result.success());
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(1, rows.size());
        assertEquals(List.of("id", "name", "createTime", "processInstanceId"), List.copyOf(rows.get(0).keySet()));
        assertEquals("t1", rows.get(0).get("id"));
        assertEquals("2026-11-01T08:00:00Z", rows.get(0).get("createTime"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_my_bpm_tasks", listTool.name());
        assertEquals("R1", listTool.riskLevel());
        assertTrue(listTool.parameters().isEmpty(),
                "it asks what I have waiting, so there is no 'which part' argument to declare");
    }

    @Test
    void theRouteAnswersTheCallersOwnWordsAndNeedsNoArguments() {
        BpmTaskTools.ListRoute route = new BpmTaskTools.ListRoute();

        assertEquals("list_my_bpm_tasks", route.toolName());
        assertTrue(route.triggers().contains("我的待办"));
        assertTrue(route.args(Map.of("message", "看看我的待办")).isEmpty(),
                "no arguments means nothing for the engine to refuse as invalid_arguments before a human is asked");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }
}
