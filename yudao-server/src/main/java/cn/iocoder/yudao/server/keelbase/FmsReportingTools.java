// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.fms.controller.admin.ledger.vo.FmsLedgerListReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.ledger.vo.subjectbalance.FmsLedgerSubjectBalanceRespVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.FmsReportItemRespVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.FmsReportListReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.balance.FmsBalanceSheetRowRespVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import cn.iocoder.yudao.module.fms.service.ledger.FmsLedgerService;
import cn.iocoder.yudao.module.fms.service.report.FmsBalanceSheetService;
import cn.iocoder.yudao.module.fms.service.report.FmsCashFlowStatementService;
import cn.iocoder.yudao.module.fms.service.report.FmsIncomeStatementService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * FMS 读数面的工具面：**四个读**（资产负债表、利润表、现金流量表、科目余额表），没有写。四个对象共用一张面，因为
 * 它们回答的是同一件事——调用方自己那个账套的账，而不是某一行的归属。
 *
 * <p><b>账套不是模型能说的参数。</b>模块按账套授权，账套编号是模块的簿记细节。四个读都**自己解析调用方自己的账套**
 * （`getAccountUserList`，优先默认、其次第一个），与凭证面、结账期间面同一个办法；一个账套都没有时答「不属于任何
 * 账套」，而不是编一个编号去问。**这是一处声明的收窄**：模块本身答得出调用方所属的每一个账套，而这张面只问默认
 * （其次第一个）那一个——要问另一个账套，是控制台里的事。
 *
 * <p><b>期间可以不给。</b>不给时用模块自己的当前会计期间（`getCurrentMonth(accountSetId, userId)`，它会校验账套读
 * 权限并要求账套已初始化）；给一个就必须是 `YYYY-MM` 的形状。REST 上有 `@Pattern` 管，工具路径没有，故这里先判形状。
 * 只给一个时，另一个补成同一个期间——「这个月的资产负债表」就是一张月报。
 *
 * <p><b>为什么没有写。</b>三张报表有公式更新与现金流量表人工调整，账簿没有写；那些写是会计在控制台里改口径与调整
 * 金额的事，REST 上既要求账套可写 level、又叠着 `fms:report:*:update`。AI 在这里需要的是**读**。
 *
 * <p><b>投影与限数。</b>出去的是报表与余额本身：项目名、行次、金额；配置编号、公式、层级、可编辑标记都不带——那是
 * 控制台的编辑态，不是对话里的事实。科目余额表可能很长，故给 `limit`（缺省 200、上限 500），并明说是否截断。
 *
 * FMS's tool face over the reading surfaces: **four reads** (balance sheet, income statement, cash flow
 * statement, subject balances), no write. They share one face because they answer the same thing — the books
 * of the caller's own account set, not whose row it is.
 *
 * <p><b>The account set is not a parameter the model may name.</b> The module authorises by account set, and
 * an account-set number is the module's bookkeeping detail. All four reads **resolve the caller's own account
 * set** ({@code getAccountUserList}, default first, else the first), the same way the voucher and closing
 * faces do; with no membership they answer "not a member of any account set" instead of inventing a number.
 * **This is a declared narrowing**: the module can answer for every account set the caller belongs to, while
 * this face asks only about the default (else first) one — asking about another is a console job.
 *
 * <p><b>The period may be omitted.</b> When it is, the module's own current accounting period is used
 * ({@code getCurrentMonth(accountSetId, userId)}, which checks account-set read permission and requires an
 * initialised account set). A supplied one must look like {@code YYYY-MM}: REST has {@code @Pattern} for
 * that, the tool path does not, so the shape is checked here. If only one is given the other becomes the same
 * period — "this month's balance sheet" is a monthly report.
 *
 * <p><b>Why there is no write.</b> The statements have formula updates and cash-flow manual adjustments; the
 * ledger has none. Those writes are an accountant changing the basis and adjusting amounts in the console,
 * and on REST they require a writable account-set level plus {@code fms:report:*:update}. What the AI needs
 * here is the **read**.
 *
 * <p><b>Projection and limit.</b> What leaves is the statement and the balances: item name, row number,
 * amounts. Configuration ids, formulas, levels and the editable flag stay behind — they are the console's
 * edit state, not a fact for the conversation. The subject-balance table can be long, so it takes a
 * {@code limit} (default 200, maximum 500) and says whether it truncated.
 */
@Configuration
public class FmsReportingTools {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");
    private static final Pattern CHINESE_MONTH = Pattern.compile("(\\d{4})年(\\d{1,2})月");
    private static final int DEFAULT_BALANCE_LIMIT = 200;
    private static final int MAX_BALANCE_LIMIT = 500;

    @Bean
    AiTool getFmsBalanceSheet(FmsBalanceSheetService service, FmsAccountUserService accountUsers,
            FmsClosingPeriodService closing) {
        return new BalanceSheetTool(service, accountUsers, closing);
    }

    @Bean
    ModuleRoute fmsBalanceSheetRoute() {
        return new BalanceSheetRoute();
    }

    @Bean
    AiTool getFmsIncomeStatement(FmsIncomeStatementService service, FmsAccountUserService accountUsers,
            FmsClosingPeriodService closing) {
        return new IncomeStatementTool(service, accountUsers, closing);
    }

    @Bean
    ModuleRoute fmsIncomeStatementRoute() {
        return new IncomeStatementRoute();
    }

    @Bean
    AiTool getFmsCashFlowStatement(FmsCashFlowStatementService service, FmsAccountUserService accountUsers,
            FmsClosingPeriodService closing) {
        return new CashFlowStatementTool(service, accountUsers, closing);
    }

    @Bean
    ModuleRoute fmsCashFlowStatementRoute() {
        return new CashFlowStatementRoute();
    }

    @Bean
    AiTool getFmsSubjectBalances(FmsLedgerService service, FmsAccountUserService accountUsers,
            FmsClosingPeriodService closing) {
        return new SubjectBalancesTool(service, accountUsers, closing);
    }

    @Bean
    ModuleRoute fmsSubjectBalancesRoute() {
        return new SubjectBalancesRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class BalanceSheetTool implements AiTool {

        private final FmsBalanceSheetService service;
        private final FmsAccountUserService accountUsers;
        private final FmsClosingPeriodService closing;

        BalanceSheetTool(FmsBalanceSheetService service, FmsAccountUserService accountUsers,
                FmsClosingPeriodService closing) {
            this.service = service;
            this.accountUsers = accountUsers;
            this.closing = closing;
        }

        @Override
        public String name() {
            return "get_fms_balance_sheet";
        }

        @Override
        public String description() {
            return "Read the caller's own account set's balance sheet for a period range (read-only)."
                    + " The account set is resolved from their membership; the period defaults to the"
                    + " module's current accounting period.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("startMonth", ToolParameter.STRING,
                            "开始会计期间（YYYY-MM；缺省为模块的当前会计期间）"),
                    ToolParameter.optional("endMonth", ToolParameter.STRING,
                            "结束会计期间（YYYY-MM；缺省为开始期间）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String start = str(args.get("startMonth"));
            String end = str(args.get("endMonth"));
            if (!monthShape(start) || !monthShape(end)) {
                return ToolResult.fail("months must look like YYYY-MM");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(caller, start, end)));
        }

        private ToolResult run(Long caller, String start, String end) {
            Long accountSetId = defaultAccountSet(accountUsers.getAccountUserList(caller));
            if (accountSetId == null) {
                return notAMember();
            }
            String[] months = resolveMonths(start, end, accountSetId, caller, closing);
            if (months == null) {
                return ToolResult.fail("startMonth must not be after endMonth");
            }
            List<FmsBalanceSheetRowRespVO> rows = service.getBalanceSheet(new FmsReportListReqVO()
                    .setAccountSetId(accountSetId).setStartMonth(months[0]).setEndMonth(months[1]), caller);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("startMonth", months[0]);
            out.put("endMonth", months[1]);
            out.put("rows", projectBalanceRows(rows));
            return ToolResult.ok(out);
        }
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class IncomeStatementTool implements AiTool {

        private final FmsIncomeStatementService service;
        private final FmsAccountUserService accountUsers;
        private final FmsClosingPeriodService closing;

        IncomeStatementTool(FmsIncomeStatementService service, FmsAccountUserService accountUsers,
                FmsClosingPeriodService closing) {
            this.service = service;
            this.accountUsers = accountUsers;
            this.closing = closing;
        }

        @Override
        public String name() {
            return "get_fms_income_statement";
        }

        @Override
        public String description() {
            return "Read the caller's own account set's income statement for a period range (read-only)."
                    + " The account set is resolved from their membership; the period defaults to the"
                    + " module's current accounting period.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("startMonth", ToolParameter.STRING,
                            "开始会计期间（YYYY-MM；缺省为模块的当前会计期间）"),
                    ToolParameter.optional("endMonth", ToolParameter.STRING,
                            "结束会计期间（YYYY-MM；缺省为开始期间）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String start = str(args.get("startMonth"));
            String end = str(args.get("endMonth"));
            if (!monthShape(start) || !monthShape(end)) {
                return ToolResult.fail("months must look like YYYY-MM");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(caller, start, end)));
        }

        private ToolResult run(Long caller, String start, String end) {
            Long accountSetId = defaultAccountSet(accountUsers.getAccountUserList(caller));
            if (accountSetId == null) {
                return notAMember();
            }
            String[] months = resolveMonths(start, end, accountSetId, caller, closing);
            if (months == null) {
                return ToolResult.fail("startMonth must not be after endMonth");
            }
            List<FmsReportItemRespVO> items = service.getIncomeStatement(new FmsReportListReqVO()
                    .setAccountSetId(accountSetId).setStartMonth(months[0]).setEndMonth(months[1]), caller);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("startMonth", months[0]);
            out.put("endMonth", months[1]);
            out.put("items", projectStatementItems(items));
            return ToolResult.ok(out);
        }
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class CashFlowStatementTool implements AiTool {

        private final FmsCashFlowStatementService service;
        private final FmsAccountUserService accountUsers;
        private final FmsClosingPeriodService closing;

        CashFlowStatementTool(FmsCashFlowStatementService service, FmsAccountUserService accountUsers,
                FmsClosingPeriodService closing) {
            this.service = service;
            this.accountUsers = accountUsers;
            this.closing = closing;
        }

        @Override
        public String name() {
            return "get_fms_cash_flow_statement";
        }

        @Override
        public String description() {
            return "Read the caller's own account set's cash flow statement for a period range (read-only)."
                    + " The account set is resolved from their membership; the period defaults to the"
                    + " module's current accounting period.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("startMonth", ToolParameter.STRING,
                            "开始会计期间（YYYY-MM；缺省为模块的当前会计期间）"),
                    ToolParameter.optional("endMonth", ToolParameter.STRING,
                            "结束会计期间（YYYY-MM；缺省为开始期间）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String start = str(args.get("startMonth"));
            String end = str(args.get("endMonth"));
            if (!monthShape(start) || !monthShape(end)) {
                return ToolResult.fail("months must look like YYYY-MM");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(caller, start, end)));
        }

        private ToolResult run(Long caller, String start, String end) {
            Long accountSetId = defaultAccountSet(accountUsers.getAccountUserList(caller));
            if (accountSetId == null) {
                return notAMember();
            }
            String[] months = resolveMonths(start, end, accountSetId, caller, closing);
            if (months == null) {
                return ToolResult.fail("startMonth must not be after endMonth");
            }
            List<FmsReportItemRespVO> items = service.getCashFlowStatement(new FmsReportListReqVO()
                    .setAccountSetId(accountSetId).setStartMonth(months[0]).setEndMonth(months[1]), caller);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("startMonth", months[0]);
            out.put("endMonth", months[1]);
            out.put("items", projectStatementItems(items));
            return ToolResult.ok(out);
        }
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class SubjectBalancesTool implements AiTool {

        private final FmsLedgerService service;
        private final FmsAccountUserService accountUsers;
        private final FmsClosingPeriodService closing;

        SubjectBalancesTool(FmsLedgerService service, FmsAccountUserService accountUsers,
                FmsClosingPeriodService closing) {
            this.service = service;
            this.accountUsers = accountUsers;
            this.closing = closing;
        }

        @Override
        public String name() {
            return "get_fms_subject_balances";
        }

        @Override
        public String description() {
            return "Read the caller's own account set's subject balance table for a period range (read-only),"
                    + " one row per subject: opening, period, year-to-date and ending debit/credit amounts."
                    + " The account set is resolved from their membership; the period defaults to the"
                    + " module's current accounting period. Returns at most `limit` rows (default 200).";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("startMonth", ToolParameter.STRING,
                            "开始会计期间（YYYY-MM；缺省为模块的当前会计期间）"),
                    ToolParameter.optional("endMonth", ToolParameter.STRING,
                            "结束会计期间（YYYY-MM；缺省为开始期间）"),
                    ToolParameter.optional("limit", ToolParameter.NUMBER,
                            "最多返回多少行（缺省 200，上限 500）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String start = str(args.get("startMonth"));
            String end = str(args.get("endMonth"));
            if (!monthShape(start) || !monthShape(end)) {
                return ToolResult.fail("months must look like YYYY-MM");
            }
            int limit = limitOf(args.get("limit"));
            if (limit < 0) {
                return ToolResult.fail("limit must be a positive integer");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(caller, start, end, limit)));
        }

        private ToolResult run(Long caller, String start, String end, int limit) {
            Long accountSetId = defaultAccountSet(accountUsers.getAccountUserList(caller));
            if (accountSetId == null) {
                return notAMember();
            }
            String[] months = resolveMonths(start, end, accountSetId, caller, closing);
            if (months == null) {
                return ToolResult.fail("startMonth must not be after endMonth");
            }
            List<FmsLedgerSubjectBalanceRespVO> nodes = service.getSubjectBalanceList(new FmsLedgerListReqVO()
                    .setAccountSetId(accountSetId).setStartMonth(months[0]).setEndMonth(months[1]), caller);
            List<Map<String, Object>> rows = new ArrayList<>();
            flattenBalances(nodes, rows);
            boolean truncated = rows.size() > limit;
            if (truncated) {
                rows = new ArrayList<>(rows.subList(0, limit));
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("startMonth", months[0]);
            out.put("endMonth", months[1]);
            out.put("truncated", truncated);
            out.put("rows", rows);
            return ToolResult.ok(out);
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不用裸的「账簿」**：它读起来像明细账或总账，而本面只声明科目余额表。
     *
     * The phrases this module's reads answer to. A bare "账簿" is deliberately avoided: it reads like the
     * detail or general ledger, while this face declares the subject-balance table only.
     */
    static final class BalanceSheetRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_fms_balance_sheet";
        }

        @Override
        public List<String> triggers() {
            return List.of("资产负债表", "资产负债");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return monthsFrom(context);
        }
    }

    static final class IncomeStatementRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_fms_income_statement";
        }

        @Override
        public List<String> triggers() {
            return List.of("利润表", "损益表", "利润");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return monthsFrom(context);
        }
    }

    static final class CashFlowStatementRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_fms_cash_flow_statement";
        }

        @Override
        public List<String> triggers() {
            return List.of("现金流量表", "现金流量", "现金流");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return monthsFrom(context);
        }
    }

    static final class SubjectBalancesRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_fms_subject_balances";
        }

        @Override
        public List<String> triggers() {
            return List.of("科目余额表", "科目余额", "余额表");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return monthsFrom(context);
        }
    }

    private static Map<String, Object> monthsFrom(Map<String, Object> context) {
        if (!(context.get("message") instanceof String typed) || typed.isBlank()) {
            return Map.of();
        }
        String normalized = CHINESE_MONTH.matcher(typed).replaceAll(match ->
                match.group(1) + "-" + (match.group(2).length() == 1 ? "0" + match.group(2) : match.group(2)));
        Matcher matcher = MONTH.matcher(normalized);
        List<String> found = new ArrayList<>();
        while (matcher.find()) {
            found.add(matcher.group());
        }
        if (found.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("startMonth", found.get(0));
        args.put("endMonth", found.size() > 1 ? found.get(1) : found.get(0));
        return args;
    }

    /**
     * 缺的期间补成模块的当前期间；两个都给了就按字符串比较大小（`YYYY-MM` 的字典序就是时间序）。返回 null 表示
     * 开始晚于结束。
     *
     * A missing period becomes the module's current one; when both are given they are compared as strings
     * (the lexicographic order of {@code YYYY-MM} is chronological). Null means the start is after the end.
     */
    private static String[] resolveMonths(String start, String end, Long accountSetId, Long caller,
            FmsClosingPeriodService closing) {
        String current = start == null || end == null
                ? closing.getCurrentMonth(accountSetId, caller) : null;
        String from = start != null ? start : current;
        String to = end != null ? end : current;
        if (from == null || to == null) {
            return null;
        }
        return from.compareTo(to) > 0 ? null : new String[]{from, to};
    }

    /** The caller's own account set: the default one if there is one, else the first; none at all is none. */
    private static Long defaultAccountSet(List<FmsAccountUserDO> mine) {
        return mine.stream()
                .filter(member -> Boolean.TRUE.equals(member.getDefaultStatus()))
                .findFirst()
                .or(() -> mine.stream().findFirst())
                .map(FmsAccountUserDO::getAccountSetId)
                .orElse(null);
    }

    private static ToolResult notAMember() {
        // 一个账套都没有时不编一个编号去问：那会把「不属于任何账套」变成一次别人的账。
        // With no account set, no number is invented: that would turn "belongs to none" into someone else's books.
        return ToolResult.ok(Map.of("accountSetMember", false));
    }

    private static List<Map<String, Object>> projectBalanceRows(List<FmsBalanceSheetRowRespVO> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (FmsBalanceSheetRowRespVO row : rows) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("assetName", row.getAssetName());
            safe.put("assetRowNo", row.getAssetRowNo());
            safe.put("assetOpeningAmount", row.getAssetOpeningAmount());
            safe.put("assetClosingAmount", row.getAssetClosingAmount());
            safe.put("liabilityName", row.getLiabilityName());
            safe.put("liabilityRowNo", row.getLiabilityRowNo());
            safe.put("liabilityOpeningAmount", row.getLiabilityOpeningAmount());
            safe.put("liabilityClosingAmount", row.getLiabilityClosingAmount());
            out.add(safe);
        }
        return out;
    }

    private static List<Map<String, Object>> projectStatementItems(List<FmsReportItemRespVO> items) {
        List<Map<String, Object>> out = new ArrayList<>(items.size());
        for (FmsReportItemRespVO item : items) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("name", item.getName());
            safe.put("rowNo", item.getRowNo());
            safe.put("currentAmount", item.getCurrentAmount());
            safe.put("yearAmount", item.getYearAmount());
            out.add(safe);
        }
        return out;
    }

    private static void flattenBalances(List<FmsLedgerSubjectBalanceRespVO> nodes,
            List<Map<String, Object>> out) {
        for (FmsLedgerSubjectBalanceRespVO node : nodes) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("nodeType", node.getNodeType());
            safe.put("subjectCode", node.getSubjectCode());
            safe.put("subjectName", node.getSubjectName());
            safe.put("level", node.getLevel());
            safe.put("openingDebitAmount", node.getOpeningDebitAmount());
            safe.put("openingCreditAmount", node.getOpeningCreditAmount());
            safe.put("periodDebitAmount", node.getPeriodDebitAmount());
            safe.put("periodCreditAmount", node.getPeriodCreditAmount());
            safe.put("yearDebitAmount", node.getYearDebitAmount());
            safe.put("yearCreditAmount", node.getYearCreditAmount());
            safe.put("endingDebitAmount", node.getEndingDebitAmount());
            safe.put("endingCreditAmount", node.getEndingCreditAmount());
            safe.put("endingBalanceDirection", node.getEndingBalanceDirection());
            out.add(safe);
            if (node.getChildren() != null && !node.getChildren().isEmpty()) {
                flattenBalances(node.getChildren(), out);
            }
        }
    }

    private static boolean monthShape(String value) {
        return value == null || MONTH.matcher(value).matches();
    }

    private static int limitOf(Object raw) {
        if (raw == null) {
            return DEFAULT_BALANCE_LIMIT;
        }
        try {
            int value = Integer.parseInt(String.valueOf(raw).trim());
            return value < 1 ? -1 : Math.min(value, MAX_BALANCE_LIMIT);
        } catch (NumberFormatException notANumber) {
            return -1;
        }
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
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
