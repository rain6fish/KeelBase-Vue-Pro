// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.ITERATION_NOT_EXISTS;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_ACCESS_DENIED;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_NOT_EXISTS;
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
import cn.iocoder.yudao.module.pms.controller.admin.pm.iteration.vo.PmsIterationOverviewRespVO;
import cn.iocoder.yudao.module.pms.service.pm.iteration.PmsIterationService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 迭代工具面的五件事：**按迭代编号问一次概览**、**读不到的迭代与不存在的迭代同一个答案**、**其它业务错误不被吞掉**、
 * **投影是整份允许清单、不带身份**，以及**没有本地调用方时不碰任何数据**；另验路由的抽取与触发词不撞既有短语。
 *
 * <p>Five things the iteration face does: ask for one overview by iteration id, answer "no such iteration" the same
 * way for a row the caller may not read and one that is missing, let other business errors through, project the whole
 * allow-list without identity, and touch no data when no local caller can be named; plus the route's identifier
 * extraction and its triggers steering clear of the existing phrases.
 */
class PmsIterationToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PmsIterationService service;
    private PmsIterationTools.IterationOverviewTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PmsIterationService.class);
        tool = new PmsIterationTools.IterationOverviewTool(service);
    }

    @Test
    void theReadAsksByTheIterationIdAndNamesTheCaller() {
        when(service.getIterationOverview(710L, CALLER_ID)).thenReturn(overview());

        assertTrue(tool.execute(Map.of("iterationId", "710"), caller()).success());
        verify(service).getIterationOverview(710L, CALLER_ID);
    }

    @Test
    void anothersIterationAndAMissingOneAreTheSameAnswer() {
        when(service.getIterationOverview(710L, CALLER_ID))
                .thenThrow(new ServiceException(PROJECT_ACCESS_DENIED));
        when(service.getIterationOverview(404L, CALLER_ID))
                .thenThrow(new ServiceException(ITERATION_NOT_EXISTS));

        ToolResult theirs = tool.execute(Map.of("iterationId", "710"), caller());
        ToolResult missing = tool.execute(Map.of("iterationId", "404"), caller());

        assertTrue(theirs.success());
        assertEquals(Map.of("hasIteration", false), theirs.data(),
                "an iteration the caller may not read and one that does not exist must be the same answer");
        assertEquals(theirs.data(), missing.data());
    }

    @Test
    void aVanishedProjectIsTheSameAnswerToo() {
        when(service.getIterationOverview(710L, CALLER_ID))
                .thenThrow(new ServiceException(PROJECT_NOT_EXISTS));

        ToolResult vanished = tool.execute(Map.of("iterationId", "710"), caller());

        assertTrue(vanished.success());
        assertEquals(Map.of("hasIteration", false), vanished.data(),
                "the project behind the iteration being gone says the same thing as the iteration being gone");
    }

    @Test
    void otherBusinessErrorsAreNotSwallowed() {
        when(service.getIterationOverview(710L, CALLER_ID))
                .thenThrow(new ServiceException(1_053_115_099, "迭代状态不合法"));

        // TenantUtils 把业务异常包成 RuntimeException；这里要看的是**它没被当成「读不到」吞掉**。
        // TenantUtils wraps a business exception in a RuntimeException; what matters is that it was **not**
        // swallowed as "no such iteration".
        RuntimeException raised = assertThrows(RuntimeException.class,
                () -> tool.execute(Map.of("iterationId", "710"), caller()));

        assertTrue(raised.getCause() instanceof ServiceException, "the business error must surface as itself");
        assertEquals(1_053_115_099, ((ServiceException) raised.getCause()).getCode(),
                "only the access-or-absence codes are normalised");
    }

    @Test
    void noIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give an iteration id (iterationId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aNonNumericIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of("iterationId", "not-a-number"), caller());

        assertFalse(result.success());
        assertEquals("give an iteration id (iterationId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("iterationId", "710"),
                new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheStatisticsButNoIdentity() {
        when(service.getIterationOverview(710L, CALLER_ID)).thenReturn(overview());

        ToolResult result = tool.execute(Map.of("iterationId", "710"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasIteration", "iterationId", "totalCount", "pendingCount", "processingCount",
                        "completedCount", "progress", "typeCountMap", "typeStatusCountMap", "statusTrends",
                        "burnDowns", "recentActivities"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasIteration"));
        assertEquals(710L, out.get("iterationId"));
        assertEquals(3, out.get("totalCount"));
        assertEquals(1, out.get("pendingCount"));
        assertEquals(1, out.get("processingCount"));
        assertEquals(1, out.get("completedCount"));
        assertEquals(33, out.get("progress"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activities = (List<Map<String, Object>>) out.get("recentActivities");
        assertEquals(List.of("id", "workItemId", "workItemSerialNumber", "workItemName", "content", "createTime"),
                List.copyOf(activities.get(0).keySet()));
        assertFalse(activities.get(0).containsKey("operatorUserId"));
        assertFalse(activities.get(0).containsKey("operatorUserName"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trends = (List<Map<String, Object>>) out.get("statusTrends");
        assertEquals(List.of("date", "pendingCount", "processingCount", "completedCount"),
                List.copyOf(trends.get(0).keySet()));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> burndowns = (List<Map<String, Object>>) out.get("burnDowns");
        assertEquals(List.of("date", "idealRemaining", "actualRemaining"),
                List.copyOf(burndowns.get(0).keySet()));
    }

    @Test
    void anEmptyOverviewStillSaysTheIterationExists() {
        PmsIterationOverviewRespVO empty = new PmsIterationOverviewRespVO();
        empty.setTotalCount(0).setPendingCount(0).setProcessingCount(0).setCompletedCount(0).setProgress(0);
        when(service.getIterationOverview(710L, CALLER_ID)).thenReturn(empty);

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool.execute(Map.of("iterationId", "710"), caller()).data();

        assertEquals(Boolean.TRUE, out.get("hasIteration"), "an iteration with no work items is not a missing one");
        assertEquals(List.of(), out.get("recentActivities"));
        assertEquals(List.of(), out.get("statusTrends"));
        assertEquals(List.of(), out.get("burnDowns"));
    }

    @Test
    void theRouteExtractsTheNumberAndTakesTheStructuredSlot() {
        PmsIterationTools.IterationOverviewRoute route = new PmsIterationTools.IterationOverviewRoute();

        assertEquals("get_iteration_overview", route.toolName());
        assertEquals("710", route.args(Map.of("message", "迭代概览 迭代 710")).get("iterationId"));
        assertEquals("712", route.args(Map.of("message", "迭代编号：712 的进展")).get("iterationId"));
        assertEquals("777", route.args(Map.of("targetId", "777")).get("iterationId"),
                "with no words naming an identifier, the structured slot is the only one left");
    }

    @Test
    void theRouteStillNamesTheToolAndGuessesNothing() {
        PmsIterationTools.IterationOverviewRoute route = new PmsIterationTools.IterationOverviewRoute();

        assertTrue(route.triggers().contains("迭代概览"));
        assertTrue(route.args(Map.of("message", "你好")).isEmpty(),
                "no identifier means no arguments, not a guessed one");
    }

    @Test
    void theTriggersSteerClearOfTheExistingPmsPhrases() {
        PmsIterationTools.IterationOverviewRoute mine = new PmsIterationTools.IterationOverviewRoute();
        List<String> theirs = new java.util.ArrayList<>();
        theirs.addAll(new PmsProjectTools.MyProjectsRoute().triggers());
        theirs.addAll(new PmsProjectTools.MyWorkItemsRoute().triggers());
        theirs.addAll(new PmsWorkItemActivityTools.WorkItemActivitiesRoute().triggers());
        theirs.addAll(new PmsWorkItemWorkLogTools.WorkLogSummaryRoute().triggers());

        for (String trigger : mine.triggers()) {
            for (String existing : theirs) {
                assertFalse(trigger.contains(existing) || existing.contains(trigger),
                        "trigger '" + trigger + "' collides with '" + existing + "'; routes match by contains");
            }
        }
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_iteration_overview", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(1, tool.parameters().size());
        assertEquals("iterationId", tool.parameters().get(0).name());
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PmsIterationOverviewRespVO overview() {
        Map<Integer, Integer> typeCountMap = new LinkedHashMap<>();
        typeCountMap.put(1, 3);
        Map<Integer, Map<Integer, Integer>> typeStatusCountMap = new LinkedHashMap<>();
        typeStatusCountMap.put(1, Map.of(3, 1, 2, 1, 1, 1));
        PmsIterationOverviewRespVO.TrendItem trend = new PmsIterationOverviewRespVO.TrendItem()
                .setDate("2026-11-07").setPendingCount(1).setProcessingCount(1).setCompletedCount(1);
        PmsIterationOverviewRespVO.BurnDownItem burndown = new PmsIterationOverviewRespVO.BurnDownItem()
                .setDate("2026-11-07").setIdealRemaining(40).setActualRemaining(32);
        PmsIterationOverviewRespVO.ActivityItem activity = new PmsIterationOverviewRespVO.ActivityItem()
                .setId(900L).setWorkItemId(600L).setWorkItemSerialNumber(3).setWorkItemName("工作项-迭代")
                .setOperatorUserId(CALLER_ID).setOperatorUserName("芋道源码")
                .setContent("将状态更新为「已完成」").setCreateTime(LocalDateTime.of(2026, 11, 7, 9, 0));
        return new PmsIterationOverviewRespVO()
                .setTotalCount(3).setPendingCount(1).setProcessingCount(1).setCompletedCount(1).setProgress(33)
                .setTypeCountMap(typeCountMap).setTypeStatusCountMap(typeStatusCountMap)
                .setStatusTrends(List.of(trend)).setBurnDowns(List.of(burndown))
                .setRecentActivities(List.of(activity));
    }
}
