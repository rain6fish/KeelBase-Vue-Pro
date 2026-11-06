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
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.worklog.PmsWorkItemWorkLogRespVO;
import cn.iocoder.yudao.module.pms.controller.admin.pm.workitem.vo.worklog.PmsWorkItemWorkLogSummaryRespVO;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemWorkLogService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_ACCESS_DENIED;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_NOT_EXISTS;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.WORK_ITEM_NOT_EXISTS;

/**
 * pms 工作项工时的工具面：**只有一读**（一个工作项的工时汇总，按工作项编号点名），没有写。
 *
 * <p><b>为什么参数是工作项编号，而不是「谁的工时」。</b>工时行的可见性不在这一行上——它由一个外键
 * {@code work_item_id} 指向的工作项所在的**项目成员表**回答。让模型报一个人的编号去问工时，就是把「这条工作项你看不看得到」
 * 换成「这是编号 42 的」；调用方报出它本来就知道的东西（工作项编号），工具拿它去换一次汇总。可见性由
 * {@link PmsProjectGovernance} 把 userId 实参钉成行动调用方、再由模块自己的
 * {@code getWorkItem(workItemId, userId)} 判定：读不到的工作项与不存在的那个**交回同一个答案**。
 *
 * <p><b>为什么读得到汇总、却列不出一页。</b>工时没有分页口：模块给的是「一个工作项的汇总 + 它的明细行」，
 * 过滤位是工作项本身，不是属主位。本面因此只开这一个读；明细行只作上限截断，截断不改变汇总的三个数
 * （已登记工时是全部行的和，不是被截断那段的和）。
 *
 * <p><b>投影。</b>出去的是这次汇总说了什么：工作项编号、预估 / 已登记 / 剩余工时、明细行数与是否被截断，
 * 以及每条明细的编号、本次工时、剩余工时、说明与登记时间。身份（{@code creatorUserId} / {@code creatorUserName}，
 * 以及 {@code creator} / {@code updater}）不出去——身份是问题的主语，不是答案的字段。
 *
 * <p>pms's tool face over work-item effort: **one read only** (one work item's work-log summary, named by the work
 * item id), no write.
 *
 * <p><b>Why the parameter is a work item id, not "whose work log".</b> A work-log row does not carry its audience;
 * the work item its {@code work_item_id} names decides, through the **project membership** table. Letting the model
 * name a user id would turn "may you see this work item" into "this is number 42's". The caller names something it
 * already knows, and the tool turns it into one summary. Visibility is decided by {@link PmsProjectGovernance}, which
 * pins the user-id argument to the acting caller, and then by the module's own
 * {@code getWorkItem(workItemId, userId)}: a work item the caller cannot read and one that does not exist get the
 * **same answer**.
 *
 * <p><b>Why it can read a summary but not list a page.</b> Work logs have no page: the module offers "one work item's
 * summary plus its detail rows", and the filter is the work item itself, not an owner slot. The detail rows are capped
 * here, and the cap does not distort the three totals (the logged hours are the sum of every row, not of the kept
 * ones).
 *
 * <p><b>Projection.</b> What leaves is what the summary says: work item id, estimated / actual / remaining hours,
 * record count and whether it was truncated, plus each record's id, hours, remaining hours, description and logged
 * time. Identity ({@code creatorUserId} / {@code creatorUserName}, and {@code creator} / {@code updater}) stays in —
 * identity is the question's subject, not the answer's field.
 */
@Configuration
public class PmsWorkItemWorkLogTools {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    /**
     * 读不到的理由与读不到的行**同一个答案**：这几条错误码都只说「没一个你能看的工作项」，不区分「不存在」与「不该你看」。
     *
     * The reasons a read comes back empty share **one answer** with a missing row: these codes all say "no work item
     * you may read", never distinguishing "absent" from "not yours".
     */
    private static final List<Integer> NOT_YOURS_OR_MISSING = List.of(
            WORK_ITEM_NOT_EXISTS.getCode(), PROJECT_ACCESS_DENIED.getCode(), PROJECT_NOT_EXISTS.getCode());

    @Bean
    AiTool getWorkItemWorkLogSummary(PmsWorkItemWorkLogService service) {
        return new WorkLogSummaryTool(service);
    }

    @Bean
    ModuleRoute getWorkItemWorkLogSummaryRoute() {
        return new WorkLogSummaryRoute();
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

    private static String time(LocalDateTime moment) {
        return moment == null ? null : moment.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    /** R1——读：无需确认、无可撤销。 / R1 — a read: no confirmation, nothing to revoke. */
    static final class WorkLogSummaryTool implements AiTool {

        private final PmsWorkItemWorkLogService service;

        WorkLogSummaryTool(PmsWorkItemWorkLogService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_work_item_work_log_summary";
        }

        @Override
        public String description() {
            return "Read one work item's effort summary (read-only): estimated, logged and remaining hours, plus at"
                    + " most " + MAX_LIMIT + " work-log records (id, hours, remaining hours, description, logged time)."
                    + " The work item id is required; a work item the caller may not read answers exactly like one"
                    + " that does not exist.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("workItemId", ToolParameter.NUMBER, "工作项编号"),
                    ToolParameter.optional("limit", ToolParameter.NUMBER, "最多返回多少条明细，默认 20，上限 50"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asLong(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            Long workItemId = asLong(args.get("workItemId"));
            if (workItemId == null) {
                return ToolResult.fail("give a work item id (workItemId)");
            }
            int limit = limitOf(args);
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(workItemId, caller, limit)));
        }

        private ToolResult run(Long workItemId, Long caller, int limit) {
            PmsWorkItemWorkLogSummaryRespVO summary;
            try {
                summary = service.getWorkItemWorkLogSummary(workItemId, caller);
            } catch (ServiceException refused) {
                if (NOT_YOURS_OR_MISSING.contains(refused.getCode())) {
                    // 别人的工作项与不存在的工作项在这里同一个答案——这正是本接缝的可证伪面。
                    // Another's work item and a missing one give the same answer here — the seam's falsifiable face.
                    return ToolResult.ok(Map.of("hasWorkItem", false));
                }
                throw refused;
            }
            return ToolResult.ok(project(summary, workItemId, limit));
        }

        /** 出去的那些字段——投影就是这个决定可读的地方。 Fields that leave this face — the projection is where the decision is legible. */
        private static Map<String, Object> project(PmsWorkItemWorkLogSummaryRespVO summary, Long workItemId, int limit) {
            List<PmsWorkItemWorkLogRespVO> all = summary.getRecords() == null ? List.of() : summary.getRecords();
            List<Map<String, Object>> records = all.stream().limit(limit).map(record -> {
                Map<String, Object> safe = new LinkedHashMap<>();
                safe.put("id", record.getId());
                safe.put("actualHours", record.getActualHours());
                safe.put("remainingHours", record.getRemainingHours());
                safe.put("description", record.getDescription());
                safe.put("createTime", time(record.getCreateTime()));
                return safe;
            }).toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("hasWorkItem", true);
            answer.put("workItemId", workItemId);
            answer.put("estimatedHours", summary.getEstimatedHours());
            answer.put("actualHours", summary.getActualHours());
            answer.put("remainingHours", summary.getRemainingHours());
            answer.put("recordCount", all.size());
            answer.put("truncated", all.size() > limit);
            answer.put("records", records);
            return answer;
        }
    }

    /**
     * 本读所回答的短语。刻意**避开**既有的「我的任务」「我的工作项」「项目待办」与「项目列表」：路由按声明顺序取第一个
     * 「消息包含其触发词」的路由，`contains` 会让一个短词吃掉包含它的长词。故这里的短语都含「工时」，那几个都不含。
     *
     * The phrases this read answers to. They deliberately steer clear of the existing 「我的任务」/「我的工作项」/
     * 「项目待办」/「项目列表」: routes are taken in declaration order with {@code contains}, so a short trigger
     * swallows any longer one that includes it. Every phrase here carries 「工时」, and none of those do.
     */
    static final class WorkLogSummaryRoute implements ModuleRoute {

        /** 「工作项 / 任务 / 工作项编号」后面那个整数——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:工作项|任务)(?:编号|号)?\\s*[=:：]?\\s*(\\d{1,19})");

        @Override
        public String toolName() {
            return "get_work_item_work_log_summary";
        }

        @Override
        public List<String> triggers() {
            return List.of("工时汇总", "工时记录", "工作项工时", "花了多少工时", "工时多少");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
            if (context.get("targetId") != null) {
                args.put("workItemId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("workItemId", matcher.group(1));
                }
            }
            return args;
        }
    }
}
