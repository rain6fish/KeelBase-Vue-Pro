// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pms.controller.admin.pm.project.vo.project.PmsProjectPageReqVO;
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.workitem.PmsWorkItemPageReqVO;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.project.PmsProjectDO;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.workitem.PmsWorkItemDO;
import cn.iocoder.yudao.module.pms.service.pm.project.PmsProjectService;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pms 的工具面，第一批：我的项目、某个项目里我的工作项。
 *
 * <p><b>两个读，都不接受「查谁」。</b>项目与工作项的读者由 {@code pms_project_member} 决定，而那个「谁」在工具路径上
 * 由切面钉成行动调用方（{@link PmsProjectGovernance}）。故本面**没有** subject 参数：主体就是调用方自己。
 * 工作项那个读只有一个 {@code projectId}，仍然由模块校验调用方能不能看这个项目。
 *
 * <p><b>为什么先做这两个。</b>它们是锚点：迭代、公告、工时、活动流水的可见性全部**经项目成员**判定；不先有
 * 「我的项目」，后面每一个问题都没有入口。
 *
 * <p><b>投影。</b>项目只带编号、名称、状态、类型、起止与最近访问；工作项只带编号、项目、类型、序号、名称、优先级、
 * 负责人编号、状态、迭代与进度。两者都不带描述正文——那是一次「查清单」，不是「读全文」。
 *
 * pms's tool face, first batch: my projects, and my work items in one project.
 *
 * <p><b>Two reads, neither accepting "for whom".</b> Who may read a project or a work item is decided by
 * {@code pms_project_member}, and on the tool path that "who" is pinned to the acting caller by the seam
 * ({@link PmsProjectGovernance}). So these tools have **no** subject parameter; the subject is the caller. The work-item
 * read takes only a {@code projectId}, and the module still checks whether the caller may see that project.
 *
 * <p><b>Why these two first.</b> They are the anchor: iterations, announcements, work logs and activity all gate on
 * project membership; without "my projects" there is no way into any later question.
 *
 * <p><b>The projection.</b> Projects carry id, name, status, type, start/end and last visit; work items carry id,
 * project, type, serial number, name, priority, assignee id, status, iteration and progress. Neither carries the
 * description body — this is a listing, not a reading.
 */
@Configuration
public class PmsProjectTools {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    @Bean
    AiTool listMyProjects(PmsProjectService service) {
        return new MyProjectsTool(service);
    }

    @Bean
    ModuleRoute myProjectsRoute() {
        return new MyProjectsRoute();
    }

    @Bean
    AiTool listMyWorkItems(PmsWorkItemService service) {
        return new MyWorkItemsTool(service);
    }

    @Bean
    ModuleRoute myWorkItemsRoute() {
        return new MyWorkItemsRoute();
    }

    private static Map<String, Object> project(PmsProjectDO row) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", row.getId());
        safe.put("name", row.getName());
        safe.put("status", row.getStatus());
        safe.put("type", row.getType());
        safe.put("level", row.getLevel());
        safe.put("openStatus", row.getOpenStatus());
        safe.put("startTime", String.valueOf(row.getStartTime()));
        safe.put("endTime", String.valueOf(row.getEndTime()));
        safe.put("accessTime", String.valueOf(row.getAccessTime()));
        return safe;
    }

    private static Map<String, Object> workItem(PmsWorkItemDO row) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", row.getId());
        safe.put("projectId", row.getProjectId());
        safe.put("type", row.getType());
        safe.put("serialNumber", row.getSerialNumber());
        safe.put("name", row.getName());
        safe.put("priority", row.getPriority());
        safe.put("assigneeUserId", row.getAssigneeUserId());
        safe.put("status", row.getStatus());
        safe.put("lifecycleStatus", row.getLifecycleStatus());
        safe.put("iterationId", row.getIterationId());
        safe.put("startTime", String.valueOf(row.getStartTime()));
        safe.put("endTime", String.valueOf(row.getEndTime()));
        safe.put("progress", row.getProgress());
        return safe;
    }

    private static Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value).trim());
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }

    private static int limitOf(Map<String, Object> args) {
        Long asked = asLong(args.get("limit"));
        return asked == null ? DEFAULT_LIMIT : (int) Math.max(1, Math.min(MAX_LIMIT, asked));
    }

    /** R1 — 调用方自己的项目。 / R1 — the caller's own projects. */
    static final class MyProjectsTool implements AiTool {

        private final PmsProjectService service;

        MyProjectsTool(PmsProjectService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_my_projects";
        }

        @Override
        public String description() {
            return "List the projects the caller participates in (read-only), newest visit first. Returns at"
                    + " most " + MAX_LIMIT + " rows with id, name, status, type and dates. The subject is the"
                    + " caller: there is no parameter naming someone else.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("limit", ToolParameter.NUMBER, "最多返回多少行，默认 20，上限 50"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            PmsProjectPageReqVO query = new PmsProjectPageReqVO();
            query.setPageNo(1);
            query.setPageSize(limitOf(args));

            PageResult<PmsProjectDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getProjectPage(query, asLong(principal.userId()))));
            List<Map<String, Object>> rows = page.getList().stream()
                    .map(PmsProjectTools::project)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("projects", rows);
            return ToolResult.ok(answer);
        }
    }

    /** 本读所回答的短语。 / The phrases this read answers to. */
    static final class MyProjectsRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_projects";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的项目", "我参与的项目", "项目列表", "我负责的项目");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return new LinkedHashMap<>();
        }
    }

    /** R1 — 某个项目里调用方看得到的工作项。 / R1 — the work items the caller can see in one project. */
    static final class MyWorkItemsTool implements AiTool {

        private final PmsWorkItemService service;

        MyWorkItemsTool(PmsWorkItemService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_my_work_items";
        }

        @Override
        public String description() {
            return "List the work items of one project that the caller may read (read-only). Returns at most "
                    + MAX_LIMIT + " rows with id, type, serial number, name, priority, assignee id, status and"
                    + " progress. The project id is required and the module refuses a project the caller cannot"
                    + " see.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("projectId", ToolParameter.NUMBER, "项目编号"),
                    ToolParameter.optional("limit", ToolParameter.NUMBER, "最多返回多少行，默认 20，上限 50"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long projectId = asLong(args.get("projectId"));
            if (projectId == null) {
                return ToolResult.fail("projectId must be a number");
            }
            PmsWorkItemPageReqVO query = new PmsWorkItemPageReqVO();
            query.setProjectId(projectId);
            query.setPageNo(1);
            query.setPageSize(limitOf(args));

            PageResult<PmsWorkItemDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getWorkItemPage(query, asLong(principal.userId()))));
            List<Map<String, Object>> rows = page.getList().stream()
                    .map(PmsProjectTools::workItem)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("workItems", rows);
            return ToolResult.ok(answer);
        }
    }

    /** 本读所回答的短语。 / The phrases this read answers to. */
    static final class MyWorkItemsRoute implements ModuleRoute {

        /** 「项目编号 / 项目号 / 项目」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("项目(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_my_work_items";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的任务", "我的工作项", "工作项列表", "项目待办");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("projectId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = ID.matcher(typed);
                if (matcher.find()) {
                    args.put("projectId", matcher.group(1));
                }
            }
            return args;
        }
    }
}
