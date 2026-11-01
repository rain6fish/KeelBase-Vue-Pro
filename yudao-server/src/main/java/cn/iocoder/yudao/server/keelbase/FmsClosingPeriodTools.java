// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingOverviewRespVO;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingQueryReqVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * FMS 结账期间的工具面：**只有一读**（结账概况），没有写。它验的是 M2 里那个形态的出口——属主是**模块自己的
 * 账套判权**，故这个面要回答的不是「哪一行归谁」，而是「调用方自己的那个账套、这个月能不能结」。
 *
 * <p><b>账套不是模型能说的参数。</b>模块按账套授权，而账套编号是模块的簿记细节。这个读**自己解析调用方自己的
 * 账套**（`getAccountUserList`，优先取默认那个、没有默认取第一个），与凭证面同一个办法；调用方所属的账套一个都
 * 没有时，它答「不属于任何账套」而不是编一个编号去问。**这是一处声明的收窄**：模块本身答得出调用方所属的每一个
 * 账套，而这个面只问默认（其次第一个）那一个——要问另一个账套，是控制台里的事，不是对话里的事。
 *
 * <p><b>会计期间可以不给。</b>不给时用模块自己的当前会计期间（`getCurrentMonth(accountSetId, userId)`，它会
 * 校验账套读权限并要求账套已初始化）。给了就必须是 `YYYY-MM` 的形状：REST 上有 `@Pattern` 管，工具路径没有，
 * 故这里先判形状——否则模块的时间解析会以一句栈信息结束调用。
 *
 * <p><b>为什么没有写（结账 / 反结账）。</b>结账会锁住一个会计期间，反结账是对已经关账的账再来一次；两者在 REST 上
 * 既要求账套可写 level，又叠着 `fms:closing:close` / `:cancel` 两条权限码。它们该由人在控制台里、看着概况做。
 * AI 在这里需要的恰恰是**读**：这个月差哪几项才能结。
 *
 * <p><b>投影。</b>出去的是结账这一业务事实：期间、是否已结、能否结，以及各项检查的结果。不带 `accountSetId`
 * ——账套是调用方自己的簿记细节，不进入对话。`profitLossVoucherId` 是凭证编号、不是人的身份，保留。
 *
 * FMS's tool face over the closing period: **one read only** (the closing overview), no write. The form it
 * tests for M2 is this face's exit — the owner is the **module's own account-set authorisation**, so the
 * question is not "whose row is this" but "can the caller's own account set close this month".
 *
 * <p><b>The account set is not a parameter the model may name.</b> The module authorises by account set,
 * and an account-set number is the module's bookkeeping detail. This read **resolves the caller's own
 * account set** ({@code getAccountUserList}, preferring the default, else the first), the same way the
 * voucher face does; when the caller belongs to none it answers "not a member of any account set" rather
 * than inventing a number to ask about. **This is a declared narrowing**: the module itself answers for
 * every account set the caller belongs to, while this face asks only about the default (else first) one —
 * asking about another is a console job, not a conversation job.
 *
 * <p><b>The month may be omitted.</b> When it is, the module's own current accounting period is used
 * ({@code getCurrentMonth(accountSetId, userId)}, which checks account-set read permission and requires
 * the account set to be initialised). A supplied one must look like {@code YYYY-MM}: REST has
 * {@code @Pattern} for that, the tool path does not, so the shape is checked here — otherwise the
 * module's date parser ends the call with a stack trace.
 *
 * <p><b>Why there is no write (close / cancel).</b> Closing locks an accounting period and cancelling
 * reopens an already-closed book; on REST both require a writable account-set level and stack the
 * {@code fms:closing:close} / {@code :cancel} permission codes on top. They belong to a person in the
 * console with the overview in front of them. What the AI needs here is exactly the **read**: which
 * checks still block this month.
 *
 * <p><b>Projection.</b> What leaves is the business fact of closing: the period, whether it is closed,
 * whether it can be, and each check's result. The {@code accountSetId} does not leave — it is the caller's
 * own bookkeeping detail and has no place in the conversation. {@code profitLossVoucherId} is a voucher
 * number, not a person's identity, so it stays.
 */
@Configuration
public class FmsClosingPeriodTools {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    @Bean
    AiTool getFmsClosingOverview(FmsClosingPeriodService service, FmsAccountUserService accountUsers) {
        return new OverviewTool(service, accountUsers);
    }

    @Bean
    ModuleRoute fmsClosingOverviewRoute() {
        return new OverviewRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class OverviewTool implements AiTool {

        private final FmsClosingPeriodService service;
        private final FmsAccountUserService accountUsers;

        OverviewTool(FmsClosingPeriodService service, FmsAccountUserService accountUsers) {
            this.service = service;
            this.accountUsers = accountUsers;
        }

        @Override
        public String name() {
            return "get_fms_closing_overview";
        }

        @Override
        public String description() {
            return "Report whether the caller's current accounting period in this host's own FMS module is"
                    + " ready to be closed (read-only). The caller's account set is resolved from their"
                    + " membership, and the month defaults to the module's current period.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(ToolParameter.optional("month", ToolParameter.STRING,
                    "会计期间（YYYY-MM；缺省为模块的当前会计期间）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String month = str(args.get("month"));
            if (month != null && !MONTH.matcher(month).matches()) {
                return ToolResult.fail("month must look like YYYY-MM");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(caller, month)));
        }

        private ToolResult run(Long caller, String month) {
            Long accountSetId = defaultAccountSet(accountUsers.getAccountUserList(caller));
            if (accountSetId == null) {
                // 一个账套都没有时不编一个编号去问：那会把「不属于任何账套」变成一次别人的账。
                // With no account set, no number is invented: that would turn "belongs to none" into someone else's books.
                return ToolResult.ok(Map.of("accountSetMember", false));
            }
            String period = month != null ? month : service.getCurrentMonth(accountSetId, caller);
            FmsClosingOverviewRespVO overview = service.getClosingOverview(
                    new FmsClosingQueryReqVO().setAccountSetId(accountSetId).setMonth(period), caller);
            return ToolResult.ok(project(overview));
        }

        /**
         * 调用方自己的账套：优先取默认，没有默认就是第一个；一个都没有就是没有。
         *
         * The caller's own account set: the default one if there is one, else the first; none at all is
         * simply none.
         */
        private static Long defaultAccountSet(List<FmsAccountUserDO> mine) {
            return mine.stream()
                    .filter(member -> Boolean.TRUE.equals(member.getDefaultStatus()))
                    .findFirst()
                    .or(() -> mine.stream().findFirst())
                    .map(FmsAccountUserDO::getAccountSetId)
                    .orElse(null);
        }

        /** The fields that leave this face — a projection is where that decision is legible. */
        private static Map<String, Object> project(FmsClosingOverviewRespVO overview) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("month", overview.getMonth());
            safe.put("closed", overview.getClosed());
            safe.put("canClose", overview.getCanClose());
            safe.put("voucherReviewRequired", overview.getVoucherReviewRequired());
            safe.put("voucherCount", overview.getVoucherCount());
            safe.put("pendingVoucherCount", overview.getPendingVoucherCount());
            safe.put("profitLossBalance", overview.getProfitLossBalance());
            safe.put("balanceSheetDifference", overview.getBalanceSheetDifference());
            safe.put("profitLossVoucherId", overview.getProfitLossVoucherId());
            safe.put("initialBalanceBalanced", overview.getInitialBalanceBalanced());
            safe.put("voucherNumberContinuous", overview.getVoucherNumberContinuous());
            safe.put("profitLossVoucherGenerated", overview.getProfitLossVoucherGenerated());
            safe.put("incomeStatementBalanced", overview.getIncomeStatementBalanced());
            safe.put("incomeStatementUnmappedSubjectCount", overview.getIncomeStatementUnmappedSubjectCount());
            safe.put("balanceSheetProfitLossTransferred", overview.getBalanceSheetProfitLossTransferred());
            safe.put("balanceSheetBalanced", overview.getBalanceSheetBalanced());
            safe.put("balanceSheetUnmappedSubjectCount", overview.getBalanceSheetUnmappedSubjectCount());
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不用裸的「结账」**：它读起来像一条写（「帮我结账」），而本面没有写；那些动作
     * 归控制台。期间从文字里读，读不到就不带参数——由工具去问模块的当前期间。
     *
     * The phrases this module's read answers to. A bare "结账" is deliberately avoided: it reads like a
     * write ("close it for me"), and this face has none — those actions belong to the console. The period
     * is read out of the text; when it is not there, no argument is carried and the tool asks the module
     * for its current period.
     */
    static final class OverviewRoute implements ModuleRoute {

        private static final Pattern NAMED_MONTH =
                Pattern.compile("(?:会计期间|期间|月份)\\s*[=:：]?\\s*(\\d{4}-\\d{1,2})");
        private static final Pattern BARE_MONTH = Pattern.compile("(\\d{4}-(?:0[1-9]|1[0-2]))");

        @Override
        public String toolName() {
            return "get_fms_closing_overview";
        }

        @Override
        public List<String> triggers() {
            return List.of("结账概况", "结账检查", "结账状态", "能结账吗", "可以结账吗", "能不能结账",
                    "当前会计期间", "本月结账");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher named = NAMED_MONTH.matcher(typed);
                Matcher bare = BARE_MONTH.matcher(typed);
                if (named.find()) {
                    args.put("month", named.group(1));
                } else if (bare.find()) {
                    args.put("month", bare.group(1));
                }
            }
            return args;
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
