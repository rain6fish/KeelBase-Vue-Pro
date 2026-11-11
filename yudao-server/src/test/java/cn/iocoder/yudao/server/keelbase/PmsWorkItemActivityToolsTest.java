// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.workitem.PmsWorkItemActivityDO;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemActivityService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 工作项动态的那个读：只收工作项编号，投影不带姓名与头像，`limit` 是行数上限而不是分页。
 *
 * <p>The work-item feed read: it takes a work item id only, the projection carries no names or avatars, and `limit`
 * is a row cap rather than a page.
 */
class PmsWorkItemActivityToolsTest {

    private static final Principal USER = new Principal("42", Principal.ROLE_USER);

    private PmsWorkItemActivityService service;
    private PmsWorkItemActivityTools.WorkItemActivitiesTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PmsWorkItemActivityService.class);
        tool = new PmsWorkItemActivityTools.WorkItemActivitiesTool(service);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theFeedIsProjectedAndAskedForTheWorkItemTheCallerNamed() {
        when(service.getWorkItemActivityList(7L)).thenReturn(List.of(activity(1L, 7L)));

        ToolResult result = tool.execute(Map.of("workItemId", 7), USER);

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        assertEquals(false, answer.get("truncated"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("activities");
        assertEquals(List.of("id", "workItemId", "operatorUserId", "content", "createTime"),
                List.copyOf(rows.get(0).keySet()));
        assertEquals("动态-1", rows.get(0).get("content"));
        verify(service).getWorkItemActivityList(7L);
    }

    @Test
    @SuppressWarnings("unchecked")
    void anEmptyAnswerIsStillAnAnswer() {
        when(service.getWorkItemActivityList(7L)).thenReturn(List.of());

        ToolResult result = tool.execute(Map.of("workItemId", 7), USER);

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(0, answer.get("count"));
        assertEquals(false, answer.get("truncated"));
        assertEquals(List.of(), answer.get("activities"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void theLimitIsACapAndSaysWhenItBit() {
        when(service.getWorkItemActivityList(7L)).thenReturn(List.of(
                activity(1L, 7L), activity(2L, 7L), activity(3L, 7L)));

        ToolResult result = tool.execute(Map.of("workItemId", 7, "limit", 2), USER);

        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(2, answer.get("count"));
        assertEquals(true, answer.get("truncated"), "the caller is told the cap bit; there is still no next page");
    }

    @Test
    @SuppressWarnings("unchecked")
    void theLimitIsClampedToTheDeclaredRange() {
        List<PmsWorkItemActivityDO> many = new ArrayList<>();
        for (long id = 1; id <= 60; id += 1) {
            many.add(activity(id, 7L));
        }
        when(service.getWorkItemActivityList(7L)).thenReturn(many);

        Map<String, Object> high = (Map<String, Object>) tool.execute(Map.of("workItemId", 7, "limit", 999), USER).data();
        Map<String, Object> low = (Map<String, Object>) tool.execute(Map.of("workItemId", 7, "limit", 0), USER).data();

        assertEquals(PmsWorkItemActivityTools.MAX_LIMIT, high.get("count"));
        assertEquals(1, low.get("count"));
    }

    @Test
    void aMissingWorkItemIdIsRefusedBeforeAnyRead() {
        ToolResult result = tool.execute(Map.of(), USER);

        assertFalse(result.success());
        verify(service, never()).getWorkItemActivityList(any());
    }

    @Test
    void theRouteReadsTheWorkItemOutOfTheMessage() {
        Map<String, Object> args = new PmsWorkItemActivityTools.WorkItemActivitiesRoute()
                .args(Map.of("message", "看看工作项编号 9 的动态"));

        assertEquals("9", args.get("workItemId"));
    }

    @Test
    void theRouteTakesTheTargetSlot() {
        Map<String, Object> args = new PmsWorkItemActivityTools.WorkItemActivitiesRoute()
                .args(Map.of("targetId", 11));

        assertEquals(11, args.get("workItemId"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_work_item_activities", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(2, tool.parameters().size());
    }

    private static PmsWorkItemActivityDO activity(long id, long workItemId) {
        PmsWorkItemActivityDO row = new PmsWorkItemActivityDO();
        row.setId(id);
        row.setWorkItemId(workItemId);
        row.setProjectId(3L);
        row.setOperatorUserId(42L);
        row.setContent("动态-" + id);
        row.setCreateTime(LocalDateTime.of(2026, 11, 5, 9, 0));
        return row;
    }
}
