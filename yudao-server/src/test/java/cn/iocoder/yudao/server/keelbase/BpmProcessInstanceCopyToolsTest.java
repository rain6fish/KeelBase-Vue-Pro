// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCopyPageReqVO;
import cn.iocoder.yudao.module.bpm.dal.dataobject.task.BpmProcessInstanceCopyDO;
import cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceCopyService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 抄送工具面的三件事：**收件人是调用方本人**（以模块自己的那个入参传递，参数表里没有别人的位置）、**出口只投影
 * 五个业务字段**（身份与意见原文都不在其中）、以及**没有参数**（故没有任何一格可以填成别人）。
 *
 * <p>Three things the copy face does: the recipient is the caller (passed as the module's own page argument — the
 * parameter list holds no slot for anyone else), the projection carries five business fields only (identity and opinion
 * text are not among them), and there are no parameters at all (so nothing can be filled in wrong).
 */
class BpmProcessInstanceCopyToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private BpmProcessInstanceCopyService copies;
    private BpmProcessInstanceCopyTools.ListTool tool;

    @BeforeEach
    void setUp() {
        copies = mock(BpmProcessInstanceCopyService.class);
        tool = new BpmProcessInstanceCopyTools.ListTool(copies);
    }

    @Test
    void theReadAsksTheModuleForTheCallersOwnRows() {
        when(copies.getProcessInstanceCopyPage(eq(CALLER_ID), any()))
                .thenReturn(new PageResult<>(List.of(copy(9L, "c1", "报销审批", "抄送人")), 1L));

        ToolResult result = tool.execute(Map.of(), caller());

        assertTrue(result.success());
        ArgumentCaptor<BpmProcessInstanceCopyPageReqVO> query =
                ArgumentCaptor.forClass(BpmProcessInstanceCopyPageReqVO.class);
        verify(copies).getProcessInstanceCopyPage(eq(CALLER_ID), query.capture());
        assertEquals(50, query.getValue().getPageSize(), "a bounded page, not the table");
    }

    @Test
    void theProjectionCarriesNeitherIdentityNorTheCopyOpinion() {
        when(copies.getProcessInstanceCopyPage(eq(CALLER_ID), any()))
                .thenReturn(new PageResult<>(List.of(copy(9L, "c1", "报销审批", "抄送人")), 1L));

        ToolResult result = tool.execute(Map.of(), caller());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(1, rows.size());
        Map<String, Object> out = rows.get(0);
        assertEquals(List.of("id", "processInstanceId", "processName", "activityName", "createTime"),
                List.copyOf(out.keySet()),
                "five business fields — the recipient, the starter and the reason must not reappear");
        assertEquals(9L, out.get("id"));
        assertEquals("c1", out.get("processInstanceId"));
        assertEquals("报销审批", out.get("processName"));
        assertEquals("抄送人", out.get("activityName"));
    }

    @Test
    void anEmptyPageIsAnAnswerNotAFailure() {
        when(copies.getProcessInstanceCopyPage(eq(CALLER_ID), any())).thenReturn(new PageResult<>(List.of(), 0L));

        ToolResult result = tool.execute(Map.of(), caller());

        assertTrue(result.success());
        assertEquals(List.of(), result.data(), "nothing copied to the caller is a fact, not an error");
    }

    @Test
    void theRouteCarriesNoArgumentsAndTheFaceDeclaresItsContract() {
        assertTrue(new BpmProcessInstanceCopyTools.ListRoute().args(Map.of("message", "抄送流程有哪些")).isEmpty(),
                "there is no argument for someone else's id to be put into");
        assertTrue(new BpmProcessInstanceCopyTools.ListRoute().triggers().contains("我的抄送"));
        assertEquals("list_my_bpm_process_copies", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertTrue(tool.parameters().isEmpty(), "no parameters: the recipient is the published caller");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static BpmProcessInstanceCopyDO copy(Long id, String processInstanceId, String processName,
                                                 String activityName) {
        BpmProcessInstanceCopyDO row = new BpmProcessInstanceCopyDO();
        row.setId(id);
        row.setProcessInstanceId(processInstanceId);
        row.setProcessInstanceName(processName);
        row.setActivityName(activityName);
        row.setUserId(CALLER_ID);
        row.setStartUserId(7L);
        row.setReason("请知悉");
        row.setCreateTime(LocalDateTime.of(2026, 11, 1, 9, 30));
        return row;
    }
}
