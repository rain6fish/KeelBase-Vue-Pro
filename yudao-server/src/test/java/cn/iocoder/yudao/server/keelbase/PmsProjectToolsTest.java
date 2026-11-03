// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.pms.controller.admin.pm.project.vo.project.PmsProjectPageReqVO;
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.workitem.PmsWorkItemPageReqVO;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.project.PmsProjectDO;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.workitem.PmsWorkItemDO;
import cn.iocoder.yudao.module.pms.service.pm.project.PmsProjectService;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * pms 的两个读：主体就是调用方，投影只带清单字段。
 *
 * <p>这里钉三件事：**service 拿到的那个 userId 是调用方**（不是模型给的）、分页收在 1–50、工作项那个读**必须给项目**。
 *
 * <p>The two pms reads: the subject is the caller, and the projection carries listing fields only. Three things are
 * pinned — the {@code userId} the service receives is the caller's, the page is clamped to 1–50, and the work-item read
 * requires a project.
 */
class PmsProjectToolsTest {

    private static final String CALLER = "42";
    private static final Principal ADMIN = new Principal(CALLER, Principal.ROLE_ADMIN);

    private PmsProjectService projectService;
    private PmsWorkItemService workItemService;
    private PmsProjectTools.MyProjectsTool projects;
    private PmsProjectTools.MyWorkItemsTool workItems;

    @BeforeEach
    void setUp() {
        projectService = mock(PmsProjectService.class);
        workItemService = mock(PmsWorkItemService.class);
        projects = new PmsProjectTools.MyProjectsTool(projectService);
        workItems = new PmsProjectTools.MyWorkItemsTool(workItemService);
    }

    @Test
    @SuppressWarnings("unchecked")
    void myProjectsAreProjectedAndAskedAboutTheCaller() {
        when(projectService.getProjectPage(any(), eq(42L)))
                .thenReturn(new PageResult<>(List.of(project(9L)), 1L));

        ToolResult result = projects.execute(Map.of(), ADMIN);

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("projects");
        assertEquals(List.of("id", "name", "status", "type", "level", "openStatus", "startTime", "endTime",
                "accessTime"), List.copyOf(rows.get(0).keySet()));

        ArgumentCaptor<PmsProjectPageReqVO> query = ArgumentCaptor.forClass(PmsProjectPageReqVO.class);
        verify(projectService).getProjectPage(query.capture(), eq(42L));
        assertEquals(1, query.getValue().getPageNo());
        assertEquals(PmsProjectTools.DEFAULT_LIMIT, query.getValue().getPageSize());
    }

    @Test
    void theLimitIsClamped() {
        when(projectService.getProjectPage(any(), eq(42L))).thenReturn(new PageResult<>(List.of(), 0L));

        projects.execute(Map.of("limit", 999), ADMIN);
        projects.execute(Map.of("limit", 0), ADMIN);

        ArgumentCaptor<PmsProjectPageReqVO> query = ArgumentCaptor.forClass(PmsProjectPageReqVO.class);
        verify(projectService, org.mockito.Mockito.times(2)).getProjectPage(query.capture(), eq(42L));
        assertEquals(PmsProjectTools.MAX_LIMIT, query.getAllValues().get(0).getPageSize());
        assertEquals(1, query.getAllValues().get(1).getPageSize());
    }

    @Test
    void myWorkItemsRequireAProject() {
        ToolResult result = workItems.execute(Map.of(), ADMIN);

        assertFalse(result.success());
        verify(workItemService, never()).getWorkItemPage(any(), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void myWorkItemsAreProjectedAndAskedAboutTheCaller() {
        when(workItemService.getWorkItemPage(any(), eq(42L)))
                .thenReturn(new PageResult<>(List.of(workItem(3L)), 1L));

        ToolResult result = workItems.execute(Map.of("projectId", 9), ADMIN);

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("workItems");
        assertEquals(List.of("id", "projectId", "type", "serialNumber", "name", "priority", "assigneeUserId",
                "status", "lifecycleStatus", "iterationId", "startTime", "endTime", "progress"),
                List.copyOf(rows.get(0).keySet()));

        ArgumentCaptor<PmsWorkItemPageReqVO> query = ArgumentCaptor.forClass(PmsWorkItemPageReqVO.class);
        verify(workItemService).getWorkItemPage(query.capture(), eq(42L));
        assertEquals(9L, query.getValue().getProjectId());
    }

    @Test
    void theRouteReadsTheProjectOutOfTheMessage() {
        Map<String, Object> args = new PmsProjectTools.MyWorkItemsRoute()
                .args(Map.of("message", "看看项目 9 的我的任务"));

        assertEquals("9", args.get("projectId"));
    }

    @Test
    void theFacesDeclareTheirContract() {
        assertEquals("list_my_projects", projects.name());
        assertEquals("R1", projects.riskLevel());
        assertEquals("list_my_work_items", workItems.name());
        assertEquals("R1", workItems.riskLevel());
    }

    private static PmsProjectDO project(Long id) {
        PmsProjectDO row = new PmsProjectDO();
        row.setId(id);
        row.setName("项目-" + id);
        row.setStatus(1);
        row.setType(1);
        row.setLevel(1);
        row.setOpenStatus(false);
        row.setStartTime(LocalDateTime.of(2026, 11, 1, 9, 0));
        row.setEndTime(LocalDateTime.of(2026, 12, 1, 9, 0));
        row.setAccessTime(LocalDateTime.of(2026, 11, 3, 9, 0));
        return row;
    }

    private static PmsWorkItemDO workItem(Long id) {
        PmsWorkItemDO row = new PmsWorkItemDO();
        row.setId(id);
        row.setProjectId(9L);
        row.setType(1);
        row.setSerialNumber(1);
        row.setName("工作项-" + id);
        row.setPriority(2);
        row.setAssigneeUserId(42L);
        row.setStatus(1);
        row.setLifecycleStatus(1);
        row.setIterationId(5L);
        row.setStartTime(LocalDateTime.of(2026, 11, 1, 9, 0));
        row.setEndTime(LocalDateTime.of(2026, 11, 5, 9, 0));
        row.setProgress(30);
        return row;
    }
}
