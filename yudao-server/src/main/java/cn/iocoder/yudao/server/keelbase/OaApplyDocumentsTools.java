// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.oa.controller.admin.leave.vo.OaLeaveApplyPageReqVO;
import cn.iocoder.yudao.module.oa.dal.dataobject.leave.OaLeaveApplyDO;
import cn.iocoder.yudao.module.oa.service.leave.OaLeaveApplyService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * oa 申请单据的**只读**工具面：列本人的请假、按编号读一条。路由各配一条。
 *
 * <p><b>为什么只有读。</b>写的那一半现在打不通，也不该在这里：{@code submitXxx} 要在流程引擎里找一个
 * **本宿主没有部署**的流程定义；而审批动作属于 BPM 的任务面（{@code approve_oa_leave} 已经是那样一条）。声明一个
 * 只会失败的工具，比不声明更糟。
 *
 * <p><b>身份是被带着走的。</b>分页口 {@code getLeaveApplyPage(userId, vo)} 把调用方当入参，故这里把
 * {@code ActingCaller} 里的调用方**传下去**，分页由模块自己收窄；按 id 读的那条不收 userId，由
 * {@link OaApplyDocumentsGovernance} 在事后判属主——不是本工具自己判。
 *
 * <p><b>投影只出去业务事实。</b>不出去 {@code creator}/{@code updater} 这类身份字段——边缘脱敏是管理端的红线。
 *
 * <p>English: the OA application documents' <b>read-only</b> tool face — list the caller's own leave
 * requests and read one by identifier, each with its route.
 *
 * <p><b>Why reads only.</b> The write half does not work yet and should not live here anyway: {@code
 * submitXxx} needs a process definition this host has not deployed, and approving belongs to BPM's task
 * face ({@code approve_oa_leave} is that path). Declaring a tool that can only fail is worse than not.
 *
 * <p><b>Identity travels.</b> The page takes the caller as an argument, so this face carries the caller
 * from {@code ActingCaller} down and the module narrows the page itself; the read by id takes no user id
 * and is held by {@link OaApplyDocumentsGovernance} afterwards — not by this tool.
 *
 * <p><b>The projection carries business facts only</b>, not {@code creator}/{@code updater}: masking
 * identity at the edge is the console's red line.
 */
@Configuration
public class OaApplyDocumentsTools {

    @Bean
    AiTool listMyOaLeaveApplies(OaLeaveApplyService service) {
        return new ListTool(service);
    }

    @Bean
    AiTool getMyOaLeaveApply(OaLeaveApplyService service) {
        return new GetTool(service);
    }

    @Bean
    ModuleRoute oaLeaveApplyListRoute() {
        return new ListRoute();
    }

    @Bean
    ModuleRoute oaLeaveApplyGetRoute() {
        return new GetRoute();
    }

    /** R1——读：无需确认、无可撤销。 / R1 — a read: no confirmation, nothing to revoke. */
    static final class ListTool implements AiTool {

        private final OaLeaveApplyService service;

        ListTool(OaLeaveApplyService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_my_oa_leave_applies";
        }

        @Override
        public String description() {
            return "List the leave requests this host's OA module holds for the caller (read-only)."
                    + " Returns only the caller's own rows; the module scopes the page itself.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            OaLeaveApplyPageReqVO query = new OaLeaveApplyPageReqVO();
            query.setPageSize(100);
            Long caller = asId(principal.userId());
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getLeaveApplyPage(caller, query))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        private static Map<String, Object> project(OaLeaveApplyDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("title", row.getTitle());
            safe.put("type", row.getType());
            safe.put("days", row.getDays());
            safe.put("status", row.getStatus());
            safe.put("startTime", text(row.getStartTime()));
            safe.put("endTime", text(row.getEndTime()));
            return safe;
        }
    }

    /** 本模块读所回答的短语。 / The phrases this module's read answers to. */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_oa_leave_applies";
        }

        @Override
        public List<String> triggers() {
            return List.of("看我的请假", "我的请假", "请假记录", "请假列表", "列请假");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /**
     * R1——按编号读一条。别人的行与不存在的编号交回同一个答案：{@code null}，再由工具说成「没有这一条」。
     *
     * R1 — one row by identifier. Another's row and a missing identifier answer the same thing — {@code
     * null} — which this tool renders as "no such row".
     */
    static final class GetTool implements AiTool {

        private final OaLeaveApplyService service;

        GetTool(OaLeaveApplyService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_oa_leave_apply";
        }

        @Override
        public String description() {
            return "Read one of the caller's own leave requests by its id (read-only). A row that is not"
                    + " the caller's answers exactly as a row that does not exist.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(ToolParameter.required("id", ToolParameter.NUMBER, "请假单编号"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long id = asLong(args.get("id"));
            if (id == null) {
                return ToolResult.ok(Map.of());
            }
            OaLeaveApplyDO row = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(), () -> service.getLeaveApply(id)));
            if (row == null) {
                return ToolResult.ok(Map.of());
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", row.getId());
            out.put("title", row.getTitle());
            out.put("type", row.getType());
            out.put("days", row.getDays());
            out.put("reason", row.getReason());
            out.put("status", row.getStatus());
            out.put("startTime", text(row.getStartTime()));
            out.put("endTime", text(row.getEndTime()));
            return ToolResult.ok(out);
        }
    }

    static final class GetRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_my_oa_leave_apply";
        }

        @Override
        public List<String> triggers() {
            return List.of("查请假单", "看请假详情", "请假单详情", "读请假");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("id", context.get("targetId"));
            }
            return args;
        }
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : value.toString();
    }

    private static Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.valueOf(text.trim());
            } catch (NumberFormatException notANumber) {
                return null;
            }
        }
        return null;
    }

    private static Long asId(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
