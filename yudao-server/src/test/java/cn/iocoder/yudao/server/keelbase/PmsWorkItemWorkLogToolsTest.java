// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_ACCESS_DENIED;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.WORK_ITEM_NOT_EXISTS;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.worklog.PmsWorkItemWorkLogRespVO;
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.worklog.PmsWorkItemWorkLogSummaryRespVO;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemWorkLogService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 工时工具面的五件事：**按工作项编号问一次汇总**、**读不到的工作项与不存在的工作项同一个答案**、**其它业务错误不被吞掉**、
 * **投影是整份允许清单、不带身份**，以及**没有本地调用方时不碰任何数据**；另验明细的上限与路由的抽取。
 *
 * <p>Five things the work-log face does: ask for one summary by work item id, answer "no such work item" the same way
 * for a row the caller may not read and one that is missing, let other business errors through, project the whole
 * allow-list without identity, and touch no data when no local caller can be named; plus the record cap and the
 * route's identifier extraction.
 */
class PmsWorkItemWorkLogToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PmsWorkItemWorkLogService service;
    private PmsWorkItemWorkLogTools.WorkLogSummaryTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PmsWorkItemWorkLogService.class);
        tool = new PmsWorkItemWorkLogTools.WorkLogSummaryTool(service);
    }

    @Test
    void theReadAsksByTheWorkItemIdAndNamesTheCaller() {
        when(service.getWorkItemWorkLogSummary(600L, CALLER_ID)).thenReturn(summary(3));

        assertTrue(tool.execute(Map.of("workItemId", "600"), caller()).success());
        verify(service).getWorkItemWorkLogSummary(600L, CALLER_ID);
    }

    @Test
    void anothersWorkItemAndAMissingOneAreTheSameAnswer() {
        when(service.getWorkItemWorkLogSummary(600L, CALLER_ID))
                .thenThrow(new ServiceException(PROJECT_ACCESS_DENIED));
        when(service.getWorkItemWorkLogSummary(404L, CALLER_ID))
                .thenThrow(new ServiceException(WORK_ITEM_NOT_EXISTS));

        ToolResult theirs = tool.execute(Map.of("workItemId", "600"), caller());
        ToolResult missing = tool.execute(Map.of("workItemId", "404"), caller());

        assertTrue(theirs.success());
        assertEquals(Map.of("hasWorkItem", false), theirs.data(),
                "a work item the caller may not read and one that does not exist must be the same answer");
        assertEquals(theirs.data(), missing.data());
    }

    @Test
    void otherBusinessErrorsAreNotSwallowed() {
        when(service.getWorkItemWorkLogSummary(600L, CALLER_ID))
                .thenThrow(new ServiceException(1_053_120_099, "工时记录不合法"));

        // TenantUtils 把业务异常包成 RuntimeException；这里要看的是**它没被当成「读不到」吞掉**。
        // TenantUtils wraps a business exception in a RuntimeException; what matters is that it was **not**
        // swallowed as "no such work item".
        RuntimeException raised = assertThrows(RuntimeException.class,
                () -> tool.execute(Map.of("workItemId", "600"), caller()));

        assertTrue(raised.getCause() instanceof ServiceException, "the business error must surface as itself");
        assertEquals(1_053_120_099, ((ServiceException) raised.getCause()).getCode(),
                "only the access-or-absence codes are normalised");
    }

    @Test
    void noIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give a work item id (workItemId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aNonNumericIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of("workItemId", "not-a-number"), caller());

        assertFalse(result.success());
        assertEquals("give a work item id (workItemId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("workItemId", "600"),
                new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheEffortButNoIdentity() {
        when(service.getWorkItemWorkLogSummary(600L, CALLER_ID)).thenReturn(summary(2));

        ToolResult result = tool.execute(Map.of("workItemId", "600"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasWorkItem", "workItemId", "estimatedHours", "actualHours", "remainingHours",
                        "recordCount", "truncated", "records"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasWorkItem"));
        assertEquals(600L, out.get("workItemId"));
        assertEquals(16, out.get("estimatedHours"));
        assertEquals(8, out.get("actualHours"));
        assertEquals(8, out.get("remainingHours"));
        assertEquals(2, out.get("recordCount"));
        assertEquals(Boolean.FALSE, out.get("truncated"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> records = (List<Map<String, Object>>) out.get("records");
        assertEquals(List.of("id", "actualHours", "remainingHours", "description", "createTime"),
                List.copyOf(records.get(0).keySet()));
        assertFalse(records.get(0).containsKey("creatorUserId"));
        assertFalse(records.get(0).containsKey("creatorUserName"));
        assertFalse(records.get(0).containsKey("workItemName"));
    }

    @Test
    void theLimitCapsTheRecordsButNotTheTotals() {
        when(service.getWorkItemWorkLogSummary(600L, CALLER_ID)).thenReturn(summary(5));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool
                .execute(Map.of("workItemId", "600", "limit", "2"), caller()).data();

        assertEquals(5, out.get("recordCount"), "the count is every row the module returned");
        assertEquals(Boolean.TRUE, out.get("truncated"));
        assertEquals(2, ((List<?>) out.get("records")).size());
        assertEquals(8, out.get("actualHours"), "the logged total is the summary's own, not the kept rows'");
    }

    @Test
    void theRouteExtractsTheNumberAndTakesTheStructuredSlot() {
        PmsWorkItemWorkLogTools.WorkLogSummaryRoute route = new PmsWorkItemWorkLogTools.WorkLogSummaryRoute();

        assertEquals("get_work_item_work_log_summary", route.toolName());
        assertEquals("600", route.args(Map.of("message", "工时汇总 工作项 600")).get("workItemId"));
        assertEquals("777", route.args(Map.of("targetId", "777")).get("workItemId"),
                "with no words naming an identifier, the structured slot is the only one left");
        assertEquals("888", route.args(Map.of("message", "这个任务花了多少工时 任务888")).get("workItemId"));
    }

    @Test
    void theRouteStillNamesTheToolAndGuessesNothing() {
        PmsWorkItemWorkLogTools.WorkLogSummaryRoute route = new PmsWorkItemWorkLogTools.WorkLogSummaryRoute();

        assertTrue(route.triggers().contains("工时汇总"));
        assertTrue(route.args(Map.of("message", "你好")).isEmpty(),
                "no identifier means no arguments, not a guessed one");
    }

    @Test
    void theTriggersSteerClearOfTheExistingProjectAndWorkItemPhrases() {
        PmsWorkItemWorkLogTools.WorkLogSummaryRoute mine = new PmsWorkItemWorkLogTools.WorkLogSummaryRoute();
        List<String> theirs = new PmsProjectTools.MyWorkItemsRoute().triggers();

        for (String trigger : mine.triggers()) {
            for (String existing : theirs) {
                assertFalse(trigger.contains(existing) || existing.contains(trigger),
                        "trigger '" + trigger + "' collides with '" + existing + "'; routes match by contains");
            }
        }
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_work_item_work_log_summary", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(2, tool.parameters().size());
        assertEquals("workItemId", tool.parameters().get(0).name());
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PmsWorkItemWorkLogSummaryRespVO summary(int records) {
        List<PmsWorkItemWorkLogRespVO> rows = java.util.stream.IntStream.range(0, records).mapToObj(i -> {
            PmsWorkItemWorkLogRespVO row = new PmsWorkItemWorkLogRespVO();
            row.setId(900L + i);
            row.setWorkItemId(600L);
            row.setWorkItemName("工作项-工时");
            row.setActualHours(4);
            row.setRemainingHours(8 - i);
            row.setDescription("联调-" + i);
            row.setCreatorUserId(CALLER_ID);
            row.setCreatorUserName("芋道源码");
            row.setCreateTime(LocalDateTime.of(2026, 11, 4, 9, 0));
            row.setUpdateTime(LocalDateTime.of(2026, 11, 4, 9, 0));
            return row;
        }).toList();
        PmsWorkItemWorkLogSummaryRespVO summary = new PmsWorkItemWorkLogSummaryRespVO();
        summary.setEstimatedHours(16);
        summary.setActualHours(8);
        summary.setRemainingHours(8);
        summary.setRecords(rows);
        return summary;
    }
}
