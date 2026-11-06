// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.workitem.PmsWorkItemActivityDO;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemActivityService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pms 工具面的第二批：**一个工作项的动态**。
 *
 * <p><b>只答调用方读得到的工作项。</b>本面只收工作项编号，不收「替谁看」。能不能读由切面
 * （{@link PmsWorkItemActivityGovernance}）在工具路径上按项目成员判：不属于调用方的项目与不存在的工作项**同一个答案**
 * ——空表。故这条路不区分「读不到」与「没有」，也不给模型一个探测别的工作项是否存在的地方。
 *
 * <p><b>投影去身份。</b>动态行只带编号、工作项、操作人**编号**、内容与创建时间；操作人姓名与头像来自 controller 的
 * 拼接（`AdminUserApi`），不在 service 的返回里，本面也不去找它们。保留操作人编号与既有 pms 面保留 `assigneeUserId`
 * 是同一条取舍：「谁做了什么」是这条读的内容本身，而**姓名/头像/联系方式**属于边缘要遮的身份字段。
 *
 * <p><b>不提供分页。</b>模块这个读口按工作项取整列表，没有页码。本面用 `limit` 只做**返回条数上限**（默认 20、上限 50），
 * 并在截断时如实给出 `truncated=true`——它不是分页：没有下一页，也没有表级 `total`。
 *
 * pms's second batch of tool faces: **the activity feed of one work item**.
 *
 * <p><b>Only work items the caller may read are answered.</b> The face takes a work item id and no "for whom". Whether
 * it may be read is decided by the aspect ({@link PmsWorkItemActivityGovernance}) on the tool path, by project
 * membership: a work item outside the caller's projects and a missing one answer alike — an empty list. So this path
 * neither separates "not readable" from "nothing there", nor gives a model a place to probe whether another work item
 * exists.
 *
 * <p><b>The projection drops identity.</b> A feed row carries its id, work item, operator **id**, content and creation
 * time; the operator's name and avatar are joined by the controller (`AdminUserApi`), are not part of the service's
 * return, and are not fetched here. Keeping the operator id is the same call the existing pms face makes for
 * `assigneeUserId`: "who did what" is the content of this read, while names, avatars and contacts are the identity
 * fields the edge masks.
 *
 * <p><b>No page.</b> The module's read returns the whole feed of one work item with no page number. The `limit` here is
 * a **row cap** (default 20, at most 50) and says so with `truncated=true` when it bites — it is not a page: there is no
 * next page and no table-wide `total`.
 */
@Configuration
public class PmsWorkItemActivityTools {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    @Bean
    AiTool listWorkItemActivities(PmsWorkItemActivityService service) {
        return new WorkItemActivitiesTool(service);
    }

    @Bean
    ModuleRoute workItemActivitiesRoute() {
        return new WorkItemActivitiesRoute();
    }

    private static Map<String, Object> activity(PmsWorkItemActivityDO row) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", row.getId());
        safe.put("workItemId", row.getWorkItemId());
        safe.put("operatorUserId", row.getOperatorUserId());
        safe.put("content", row.getContent());
        safe.put("createTime", String.valueOf(row.getCreateTime()));
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

    /** R1 — 调用方读得到的那个工作项的动态。 / R1 — the feed of one work item the caller may read. */
    static final class WorkItemActivitiesTool implements AiTool {

        private final PmsWorkItemActivityService service;

        WorkItemActivitiesTool(PmsWorkItemActivityService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_work_item_activities";
        }

        @Override
        public String description() {
            return "List the activity feed of one work item (read-only), oldest first. Returns at most "
                    + MAX_LIMIT + " rows with id, work item id, operator id, content and creation time. The work"
                    + " item id is required. A work item the caller cannot read answers with an empty list, the"
                    + " same as one that does not exist.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("workItemId", ToolParameter.NUMBER, "工作项编号"),
                    ToolParameter.optional("limit", ToolParameter.NUMBER, "最多返回多少行，默认 20，上限 50"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long workItemId = asLong(args.get("workItemId"));
            if (workItemId == null) {
                return ToolResult.fail("workItemId must be a number");
            }
            List<PmsWorkItemActivityDO> rows = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getWorkItemActivityList(workItemId)));
            int limit = limitOf(args);
            List<Map<String, Object>> safe = rows.stream()
                    .limit(limit)
                    .map(PmsWorkItemActivityTools::activity)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", safe.size());
            answer.put("truncated", rows.size() > safe.size());
            answer.put("activities", safe);
            return ToolResult.ok(answer);
        }
    }

    /** 本读所回答的短语。 / The phrases this read answers to. */
    static final class WorkItemActivitiesRoute implements ModuleRoute {

        /** 「工作项编号 / 工作项号 / 工作项」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("工作项(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_work_item_activities";
        }

        @Override
        public List<String> triggers() {
            return List.of("工作项动态", "工作项活动", "工作项历史");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("workItemId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = ID.matcher(typed);
                if (matcher.find()) {
                    args.put("workItemId", matcher.group(1));
                }
            }
            return args;
        }
    }
}
