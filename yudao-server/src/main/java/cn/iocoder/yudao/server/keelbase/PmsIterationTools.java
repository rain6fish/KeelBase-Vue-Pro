// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pms.controller.admin.pm.iteration.vo.PmsIterationOverviewRespVO;
import cn.iocoder.yudao.module.pms.service.pm.iteration.PmsIterationService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.ITERATION_NOT_EXISTS;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_ACCESS_DENIED;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_NOT_EXISTS;

/**
 * pms 迭代的工具面：**只有一读**（一个迭代的概览统计，按迭代编号点名），没有写。
 *
 * <p><b>为什么参数是迭代编号，而不是「谁的项目」。</b>迭代行本身不带可见性：谁能读它，由它的 {@code project_id}
 * 指向的项目在**项目成员表**里回答。让模型报一个人的编号去问迭代，就是把「这个迭代你看不看得到」换成「这是编号 42 的」；
 * 调用方报出它本来就知道的东西（迭代编号），工具拿它去换一次统计。可见性由 {@link PmsProjectGovernance} 把 userId 实参
 * 钉成行动调用方、再由模块自己的 {@code getIteration(id, userId)} 判定：读不到的迭代与不存在的那个**交回同一个答案**。
 *
 * <p><b>为什么读得到统计、却列不出一页。</b>概览的过滤位是迭代本身（一个迭代 → 它工作项的分布），不是属主位；
 * 本面因此只开这一个读。分页口 {@code getIterationPage} 确实收调用方、有属主过滤位，但它是「列出我的迭代」——
 * 那是另一个问题，留给它自己的工具，不在本件里顺手开。
 *
 * <p><b>投影。</b>出去的是这次统计说了什么：工作项总数与各状态数、完成百分比、类型分布、状态趋势、燃尽数据，
 * 以及最近动态的编号、工作项编号与序号、工作项名称、内容与时间。身份（{@code operatorUserId} /
 * {@code operatorUserName}）不出去——身份是问题的主语，不是答案的字段。控制台请求路径仍由 controller 补昵称，
 * 本面不碰它。
 *
 * <p>pms's tool face over iterations: **one read only** (one iteration's overview statistics, named by the
 * iteration id), no write.
 *
 * <p><b>Why the parameter is an iteration id, not "whose project".</b> An iteration row does not carry its
 * audience; the project its {@code project_id} names answers that through the **project membership** table.
 * Letting the model name a user id would turn "may you see this iteration" into "this is number 42's". The
 * caller names something it already knows, and the tool turns it into one set of statistics. Visibility is
 * decided by {@link PmsProjectGovernance}, which pins the user-id argument to the acting caller, and then by the
 * module's own {@code getIteration(id, userId)}: an iteration the caller cannot read and one that does not exist
 * get the **same answer**.
 *
 * <p><b>Why it can read statistics but not list a page.</b> The overview's filter is the iteration itself (one
 * iteration → the distribution of its work items), not an owner slot; so this face opens that one read. The page
 * read {@code getIterationPage} does take the caller and has an owner slot, but it answers "list my iterations" —
 * a different question, left to its own tool rather than opened here in passing.
 *
 * <p><b>Projection.</b> What leaves is what the statistics say: total work items and the per-status counts,
 * the completion percentage, the type distribution, the status trend, the burndown, and each recent activity's
 * id, work-item id and serial number, work-item name, content and time. Identity
 * ({@code operatorUserId} / {@code operatorUserName}) stays in — identity is the question's subject, not the
 * answer's field. The console request path still has its names filled by the controller; this face does not
 * touch it.
 */
@Configuration
public class PmsIterationTools {

    /**
     * 读不到的理由与读不到的行**同一个答案**：这几条错误码都只说「没一个你能看的迭代」，不区分「不存在」与「不该你看」。
     *
     * The reasons a read comes back empty share **one answer** with a missing row: these codes all say "no
     * iteration you may read", never distinguishing "absent" from "not yours".
     */
    private static final List<Integer> NOT_YOURS_OR_MISSING = List.of(
            ITERATION_NOT_EXISTS.getCode(), PROJECT_ACCESS_DENIED.getCode(), PROJECT_NOT_EXISTS.getCode());

    @Bean
    AiTool getIterationOverview(PmsIterationService service) {
        return new IterationOverviewTool(service);
    }

    @Bean
    ModuleRoute getIterationOverviewRoute() {
        return new IterationOverviewRoute();
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

    private static String time(LocalDateTime moment) {
        return moment == null ? null : moment.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    /** R1——读：无需确认、无可撤销。 / R1 — a read: no confirmation, nothing to revoke. */
    static final class IterationOverviewTool implements AiTool {

        private final PmsIterationService service;

        IterationOverviewTool(PmsIterationService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_iteration_overview";
        }

        @Override
        public String description() {
            return "Read one iteration's overview (read-only): total work items, pending / processing / completed"
                    + " counts, completion percentage, type distribution, the status trend, the burndown and the"
                    + " recent activity lines. The iteration id is required; an iteration the caller may not read"
                    + " answers exactly like one that does not exist.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(ToolParameter.required("iterationId", ToolParameter.NUMBER, "迭代编号"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asLong(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            Long iterationId = asLong(args.get("iterationId"));
            if (iterationId == null) {
                return ToolResult.fail("give an iteration id (iterationId)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(iterationId, caller)));
        }

        private ToolResult run(Long iterationId, Long caller) {
            PmsIterationOverviewRespVO overview;
            try {
                overview = service.getIterationOverview(iterationId, caller);
            } catch (ServiceException refused) {
                if (NOT_YOURS_OR_MISSING.contains(refused.getCode())) {
                    // 别人的迭代与不存在的迭代在这里同一个答案——这正是本接缝的可证伪面。
                    // Another's iteration and a missing one give the same answer here — the seam's falsifiable face.
                    return ToolResult.ok(Map.of("hasIteration", false));
                }
                throw refused;
            }
            return ToolResult.ok(project(overview, iterationId));
        }

        /** 出去的那些字段——投影就是这个决定可读的地方。 Fields that leave this face — the projection is where the decision is legible. */
        private static Map<String, Object> project(PmsIterationOverviewRespVO overview, Long iterationId) {
            List<PmsIterationOverviewRespVO.ActivityItem> activities =
                    overview.getRecentActivities() == null ? List.of() : overview.getRecentActivities();
            List<Map<String, Object>> recent = activities.stream().map(activity -> {
                Map<String, Object> safe = new LinkedHashMap<>();
                safe.put("id", activity.getId());
                safe.put("workItemId", activity.getWorkItemId());
                safe.put("workItemSerialNumber", activity.getWorkItemSerialNumber());
                safe.put("workItemName", activity.getWorkItemName());
                safe.put("content", activity.getContent());
                safe.put("createTime", time(activity.getCreateTime()));
                return safe;
            }).toList();
            List<Map<String, Object>> trends = overview.getStatusTrends() == null ? List.of()
                    : overview.getStatusTrends().stream().map(trend -> {
                        Map<String, Object> safe = new LinkedHashMap<>();
                        safe.put("date", trend.getDate());
                        safe.put("pendingCount", trend.getPendingCount());
                        safe.put("processingCount", trend.getProcessingCount());
                        safe.put("completedCount", trend.getCompletedCount());
                        return safe;
                    }).toList();
            List<Map<String, Object>> burndowns = overview.getBurnDowns() == null ? List.of()
                    : overview.getBurnDowns().stream().map(burndown -> {
                        Map<String, Object> safe = new LinkedHashMap<>();
                        safe.put("date", burndown.getDate());
                        safe.put("idealRemaining", burndown.getIdealRemaining());
                        safe.put("actualRemaining", burndown.getActualRemaining());
                        return safe;
                    }).toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("hasIteration", true);
            answer.put("iterationId", iterationId);
            answer.put("totalCount", overview.getTotalCount());
            answer.put("pendingCount", overview.getPendingCount());
            answer.put("processingCount", overview.getProcessingCount());
            answer.put("completedCount", overview.getCompletedCount());
            answer.put("progress", overview.getProgress());
            answer.put("typeCountMap", overview.getTypeCountMap());
            answer.put("typeStatusCountMap", overview.getTypeStatusCountMap());
            answer.put("statusTrends", trends);
            answer.put("burnDowns", burndowns);
            answer.put("recentActivities", recent);
            return answer;
        }
    }

    /**
     * 本读所回答的短语。刻意**避开**既有的「我的任务」「我的工作项」「项目待办」「项目列表」与「工时」那几条：
     * 路由按声明顺序取第一个「消息包含其触发词」的路由，`contains` 会让一个短词吃掉包含它的长词。故这里的短语都含「迭代」，
     * 那几个都不含。
     *
     * The phrases this read answers to. They deliberately steer clear of the existing 「我的任务」/「我的工作项」/
     * 「项目待办」/「项目列表」 and the work-log phrases: routes are taken in declaration order with {@code contains},
     * so a short trigger swallows any longer one that includes it. Every phrase here carries 「迭代」, and none of
     * those do.
     */
    static final class IterationOverviewRoute implements ModuleRoute {

        /** 「迭代 / 迭代编号」后面那个整数——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("迭代(?:编号|号)?\\s*[=:：]?\\s*(\\d{1,19})");

        @Override
        public String toolName() {
            return "get_iteration_overview";
        }

        @Override
        public List<String> triggers() {
            return List.of("迭代概览", "迭代进展", "迭代进度", "迭代完成情况", "迭代情况");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
            if (context.get("targetId") != null) {
                args.put("iterationId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("iterationId", matcher.group(1));
                }
            }
            return args;
        }
    }
}
