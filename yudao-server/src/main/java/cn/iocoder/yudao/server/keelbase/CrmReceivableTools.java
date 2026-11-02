// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.controller.admin.receivable.vo.receivable.CrmReceivablePageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.receivable.vo.receivable.CrmReceivableSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.receivable.CrmReceivableDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.service.receivable.CrmReceivableService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 回款的工具面：**读自己负责或参与的**，**写登记一笔**。回款是「钱」那一类对象，故它的写走 R3 —— 引擎扣下等人。
 *
 * <p><b>为什么读要带场景（`D3` 丙 读宽）。</b>上游的分页**不带场景时一个条件都不加**（等于全部行）。工具因此必须自己
 * 说要哪一档：默认「我负责的」，显式 `scope=involved` 时问「我参与的」—— 参与方在 `crm_permission` 里有一行、但
 * 不是负责人。`CrmReceivableGovernance` 在 AI 路径上把 null 场景补成「我负责的」，于是「没说要哪档」永远不会等于
 * 「全部」。
 *
 * <p><b>为什么写只给「登记一笔」。</b>改、删、提交审批都是**对已有钱的对象动手**；AI 侧先只开一条有明确产出的写，
 * 与合同那条同形：入参声明齐全、结果带 `id`、属主由切面盖章、调用方身份随 `ActingCaller` 传进去。
 *
 * <p><b>回款日期是必填，且不给默认。</b>合同工具可以不传金额（金额不是它的必填），回款的日期却是保存 VO 的必填项；
 * 而「这笔钱哪天到的」猜不得 —— 解析不出来就明确失败，而不是替调用方填今天。
 *
 * <p><b>投影。</b>出去的是回款这条业务事实：编号、客户、合同、属主、审批状态、金额、到账日期、回款方式。备注不出去。
 *
 * The receivable tool face: read what the caller owns or takes part in, and register one payment. A receivable
 * is money, so its write is R3 — the engine holds it for a person. The read must state its scene, because
 * upstream's page adds **no condition at all** when none is given: the tool asks for "mine" by default and
 * for "involved" when `scope=involved` is named. The write is create-only for now, shaped like the contract
 * tool's: declared parameters, an `id` in the result, the owner stamped by the aspect, the caller carried
 * through `ActingCaller`. The payment date is required and has no default — guessing when money arrived is
 * not the tool's call — so an unreadable date fails instead of becoming today.
 */
@Configuration
public class CrmReceivableTools {

    /** The permission code the REST path requires for the same write — the same vocabulary, not a second one. */
    private static final String CREATE_PERMISSION = "crm:receivable:create";

    @Bean
    AiTool listCrmReceivables(CrmReceivableService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute crmReceivableListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createCrmReceivable(CrmReceivableService service, YudaoToolPermissions permissions) {
        return new CreateTool(service, permissions);
    }

    @Bean
    ModuleRoute crmReceivableCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final CrmReceivableService service;

        ListTool(CrmReceivableService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_crm_receivables";
        }

        @Override
        public String description() {
            return "List the receivables this host's own CRM module holds (read-only). Returns the rows the"
                    + " caller owns (default) or takes part in (`scope=involved`); remarks are not projected.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("scope", ToolParameter.STRING, "owner（默认，我负责的）或 involved（我参与的）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            boolean involved = "involved".equalsIgnoreCase(String.valueOf(args.get("scope")));
            CrmReceivablePageReqVO query = new CrmReceivablePageReqVO();
            query.setPageSize(50);
            query.setSceneType(involved ? CrmSceneTypeEnum.INVOLVED.getType() : CrmSceneTypeEnum.OWNER.getType());
            Long caller = asId(principal.userId());
            // The identity travels as the argument the module's own query takes, so the page is scoped by the module
            // rather than post-filtered here.
            // 身份以模块自己查询所取的入参传递，于是分页由模块收束，而不是在这里事后过滤。
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getReceivablePage(query, caller))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(CrmReceivableDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("no", row.getNo());
            safe.put("customerId", row.getCustomerId());
            safe.put("contractId", row.getContractId());
            safe.put("ownerUserId", row.getOwnerUserId());
            safe.put("auditStatus", row.getAuditStatus());
            safe.put("price", row.getPrice());
            safe.put("returnTime", row.getReturnTime() == null ? null : row.getReturnTime().toString());
            safe.put("returnType", row.getReturnType());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_crm_receivables";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出回款", "回款列表", "CRM 回款", "看回款", "有哪些回款");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final CrmReceivableService service;
        private final YudaoToolPermissions permissions;

        CreateTool(CrmReceivableService service, YudaoToolPermissions permissions) {
            this.service = service;
            this.permissions = permissions;
        }

        @Override
        public String name() {
            return "create_crm_receivable";
        }

        @Override
        public String description() {
            return "Register a payment received against an approved contract in the CRM module this host"
                    + " already ships. The engine holds the call for a human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "crm_receivable";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("contractId", ToolParameter.NUMBER, "合同编号（回款关联的合同，须已审批通过）"),
                    ToolParameter.required("price", ToolParameter.NUMBER, "回款金额"),
                    ToolParameter.required("returnTime", ToolParameter.STRING,
                            "回款日期（yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss）"),
                    ToolParameter.optional("returnType", ToolParameter.NUMBER, "回款方式（字典 crm_receivable_return_type）"),
                    ToolParameter.optional("planId", ToolParameter.NUMBER, "回款计划编号"),
                    ToolParameter.optional("remark", ToolParameter.STRING, "备注"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            String refusal = permissions.refusal(principal.userId(), CREATE_PERMISSION);
            if (refusal != null) {
                return ToolResult.fail(refusal);
            }
            Long contractId = asLong(args.get("contractId"));
            if (contractId == null) {
                return ToolResult.fail("contractId is required and must be a number");
            }
            BigDecimal price = asDecimal(args.get("price"));
            if (price == null) {
                return ToolResult.fail("price is required and must be a number");
            }
            LocalDateTime returnTime = parseTime(args.get("returnTime"));
            if (returnTime == null) {
                return ToolResult.fail("returnTime is required and must be yyyy-MM-dd or yyyy-MM-dd HH:mm:ss");
            }
            CrmReceivableSaveReqVO row = new CrmReceivableSaveReqVO();
            row.setContractId(contractId);
            row.setPrice(price);
            row.setReturnTime(returnTime);
            Integer returnType = asInt(args.get("returnType"));
            if (returnType != null) {
                row.setReturnType(returnType);
            }
            Long planId = asLong(args.get("planId"));
            if (planId != null) {
                row.setPlanId(planId);
            }
            row.setRemark(str(args.get("remark")));
            // The owner is not set here on purpose: CrmReceivableGovernance stamps it from the caller, the way it
            // does for the module's own REST path. The customer is not set either — the module reads it off the
            // contract (`validateRelationDataExists`).
            // 属主**刻意不在这里设**：由 CrmReceivableGovernance 从调用方盖上去，与它对模块 REST 路径的做法相同。
            // 客户也**不设**——模块自己从合同上读（`validateRelationDataExists`）。
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createReceivable(row));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        /** The three required arguments, as a caller writes them. / 三个必填项在文字里的写法。 */
        private static final Pattern CONTRACT_ID = Pattern.compile("合同(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern PRICE = Pattern.compile("金额\\s*[=:：]?\\s*(\\d+(?:\\.\\d+)?)");
        private static final Pattern RETURN_TIME =
                Pattern.compile("日期\\s*[=:：]?\\s*(\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{2}:\\d{2}:\\d{2})?)");

        @Override
        public String toolName() {
            return "create_crm_receivable";
        }

        @Override
        public List<String> triggers() {
            return List.of("登记回款", "新建回款", "创建回款", "记录回款");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // 会话只有一个结构化槽，它讲的是「目标」、不是合同编号；拿它填 `contractId` 是在猜这个槽的意思。
            // 用户在文字里明确写出的合同、金额与日期 ——「合同=12 金额=100 日期=2026-10-31」—— 由这里读出来：
            // 三者缺一个这笔回款就登记不了，而引擎会在**人批准之前**就拒掉一份漏了它们的提议。
            //
            // The chat carries one structured slot and it names a target, not a contract; filling `contractId`
            // from it would be a guess at what the slot means. What the caller wrote explicitly —
            // `合同=12 金额=100 日期=2026-10-31` — is read here instead: a receivable cannot be registered
            // without all three, and the engine refuses a proposal that omits them **before** a person is asked.
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Long contractId = asLong(match(typed, CONTRACT_ID));
                if (contractId != null) {
                    args.put("contractId", contractId);
                }
                BigDecimal price = asDecimal(match(typed, PRICE));
                if (price != null) {
                    args.put("price", price);
                }
                String returnTime = match(typed, RETURN_TIME);
                if (!returnTime.isBlank()) {
                    args.put("returnTime", returnTime);
                }
            }
            return args;
        }

        private static String match(String text, Pattern pattern) {
            Matcher matcher = pattern.matcher(text);
            return matcher.find() ? matcher.group(1) : "";
        }
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
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

    private static Integer asInt(Object value) {
        Long id = asLong(value);
        return id == null ? null : id.intValue();
    }

    private static BigDecimal asDecimal(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException notANumber) {
            return null;
        }
    }

    /**
     * 回款日期：`yyyy-MM-dd` 或 `yyyy-MM-dd HH:mm:ss`。解析不出来交回 null，由调用方明确拒绝 —— 不替调用方填今天。
     *
     * The payment date, `yyyy-MM-dd` or `yyyy-MM-dd HH:mm:ss`; an unreadable value comes back as null for the
     * caller to refuse, rather than being replaced with today.
     */
    private static LocalDateTime parseTime(Object value) {
        String text = str(value);
        if (text == null || text.isBlank()) {
            return null;
        }
        String trimmed = text.trim();
        try {
            return trimmed.length() <= 10
                    ? LocalDate.parse(trimmed).atStartOfDay()
                    : LocalDateTime.parse(trimmed.replace(' ', 'T'));
        } catch (DateTimeParseException notADate) {
            return null;
        }
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
