// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingQueryReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingSchemeRespVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.enums.closing.FmsClosingTypeEnum;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingSchemeService;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * FMS 结账方案的工具面：**只有一读**（本期各方案待结转多少、哪些已经生成凭证），没有写。它验的是 M2 里那个形态的
 * 出口——属主是**模块自己的账套判权**，故这个面要回答的不是「哪一行归谁」，而是「我这个账套、这个月还有哪些结转没做」。
 *
 * <p><b>它为什么不是结账概况的重复。</b>结账概况的 `canClose` 只查**结转损益**那一个方案有没有生成凭证；**常规结转方案**
 * 的生成状态不在那几项检查里。于是「哪些常规结转还没做、金额多少」只有这条读答得出——而它正是结账前要问的那一句。
 *
 * <p><b>账套不是模型能说的参数。</b>模块按账套授权，而账套编号是模块的簿记细节。这个读**自己解析调用方自己的账套**
 * （`getAccountUserList`，优先取默认那个、没有默认取第一个），与凭证面、结账面同一个办法；调用方所属的账套一个都没有时，
 * 它答「不属于任何账套」而不是编一个编号去问。**这是一处声明的收窄**：模块本身答得出调用方所属的每一个账套，而这个面
 * 只问默认（其次第一个）那一个 —— 要问另一个账套，是控制台里的事，不是对话里的事。
 *
 * <p><b>会计期间可以不给。</b>不给时用模块自己的当前会计期间（`getCurrentMonth(accountSetId, userId)`，它会校验账套读
 * 权限并要求账套已初始化）。给了就必须是 `YYYY-MM` 的形状：REST 上有 `@Pattern` 管，工具路径没有，故这里先判形状——
 * 否则模块的时间解析会以一句栈信息结束调用。
 *
 * <p><b>为什么没有写。</b>改结转规则、改损益结转设置、删方案都是**配置**动作，由人在控制台做；真正会动账的是「生成结转
 * 凭证」（另一个对象，`fms_closing_voucher` 的生成动作），那是看着这本账的人按下的键。AI 在这里需要的是**读**：这个月还
 * 差哪几笔结转。
 *
 * <p><b>投影。</b>出去的是每个方案的业务事实：名称、类型（中文名而不是数字码）、是否期末结转、待结转金额、本期已生成的
 * 凭证编号。**不带 `accountSetId`** —— 账套是调用方自己的簿记细节，不进入对话；也不带方案编号与科目规则，因为本面无写、
 * 没有后续动作需要它们。
 *
 * FMS's tool face over the closing schemes: **one read only** (how much each scheme still has to transfer this
 * period, and which ones already produced vouchers), no write. The form it tests for M2 is this face's exit — the
 * owner is the **module's own account-set authorisation**, so the question is not "whose row is this" but "what is
 * still outstanding this month in my account set".
 *
 * <p><b>Why it does not repeat the closing overview.</b> The overview's {@code canClose} only checks whether the
 * **profit-loss** scheme produced its voucher; the generation state of the **regular** closing schemes is not
 * among those checks. So "which regular transfers are still outstanding, for how much" is answered by this read
 * alone — and that is exactly the question asked before closing.
 *
 * <p><b>The account set is not a parameter the model may name.</b> The module authorises by account set, and an
 * account-set number is the module's bookkeeping detail. This read **resolves the caller's own account set**
 * ({@code getAccountUserList}, preferring the default, else the first), the same way the voucher and closing
 * faces do; when the caller belongs to none it answers "not a member of any account set" rather than inventing a
 * number to ask about. **This is a declared narrowing**: the module itself answers for every account set the
 * caller belongs to, while this face asks only about the default (else first) one — asking about another is a
 * console job, not a conversation job.
 *
 * <p><b>The month may be omitted.</b> When it is, the module's own current accounting period is used
 * ({@code getCurrentMonth(accountSetId, userId)}, which checks account-set read permission and requires the
 * account set to be initialised). A supplied one must look like {@code YYYY-MM}: REST has {@code @Pattern} for
 * that, the tool path does not, so the shape is checked here — otherwise the module's date parser ends the call
 * with a stack trace.
 *
 * <p><b>Why there is no write.</b> Editing the transfer rules, the profit-loss settings or deleting a scheme are
 * **configuration** actions a person performs in the console; what actually moves the books is generating the
 * closing vouchers (another object — the generate actions of {@code fms_closing_voucher}), and that is a key a
 * person presses with the books in front of them. What the AI needs here is the **read**: which transfers this
 * month are still missing.
 *
 * <p><b>Projection.</b> What leaves is each scheme's business fact: its name, its type (the Chinese label rather
 * than the numeric code), whether it is a period-end transfer, the amount still to transfer, and the voucher ids
 * already generated for this period. The {@code accountSetId} does not leave — it is the caller's own
 * bookkeeping detail and has no place in the conversation; neither do the scheme id or the subject rules, because
 * this face has no write and no follow-up action needs them.
 */
@Configuration
public class FmsClosingSchemeTools {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    @Bean
    AiTool getFmsClosingSchemes(FmsClosingSchemeService service, FmsClosingPeriodService periods,
            FmsAccountUserService accountUsers) {
        return new ClosingSchemeTool(service, periods, accountUsers);
    }

    @Bean
    ModuleRoute fmsClosingSchemesRoute() {
        return new ClosingSchemeRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ClosingSchemeTool implements AiTool {

        private final FmsClosingSchemeService service;
        private final FmsClosingPeriodService periods;
        private final FmsAccountUserService accountUsers;

        ClosingSchemeTool(FmsClosingSchemeService service, FmsClosingPeriodService periods,
                FmsAccountUserService accountUsers) {
            this.service = service;
            this.periods = periods;
            this.accountUsers = accountUsers;
        }

        @Override
        public String name() {
            return "get_fms_closing_schemes";
        }

        @Override
        public String description() {
            return "List the closing schemes of the caller's own account set in this host's own FMS module for"
                    + " one accounting period, with the amount each still has to transfer and the vouchers"
                    + " already generated for it (read-only). The caller's account set is resolved from their"
                    + " membership, and the period defaults to the module's current one.";
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
            String period = month != null ? month : periods.getCurrentMonth(accountSetId, caller);
            List<FmsClosingSchemeRespVO> schemes = service.getClosingSchemeList(
                    new FmsClosingQueryReqVO().setAccountSetId(accountSetId).setMonth(period), caller);
            return ToolResult.ok(project(period, schemes));
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
        private static Map<String, Object> project(String period, List<FmsClosingSchemeRespVO> schemes) {
            List<Map<String, Object>> projected = new ArrayList<>(schemes.size());
            for (FmsClosingSchemeRespVO scheme : schemes) {
                Map<String, Object> one = new LinkedHashMap<>();
                one.put("name", scheme.getName());
                one.put("type", label(scheme.getType()));
                one.put("periodEnd", scheme.getPeriodEnd());
                one.put("balance", scheme.getBalance() == null ? BigDecimal.ZERO : scheme.getBalance());
                one.put("voucherIds", scheme.getVoucherIds() == null ? List.of() : scheme.getVoucherIds());
                projected.add(one);
            }
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("month", period);
            safe.put("schemes", projected);
            return safe;
        }

        /** 类型码换成人读的名字；模块认不出的码原样交回，不猜。 */
        private static Object label(Integer type) {
            FmsClosingTypeEnum known = type == null ? null : FmsClosingTypeEnum.valueOf(type);
            return known == null ? type : known.getName();
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不用裸的「结转」或「结账」**：它们读起来像写（「帮我把损益结转了」），而本面没有写；
     * 那些动作归控制台。期间从文字里读，读不到就不带参数——由工具去问模块的当前期间。
     *
     * The phrases this module's read answers to. A bare "结转" or "结账" is deliberately avoided: it reads like a
     * write ("transfer the profit for me"), and this face has none — those actions belong to the console. The
     * period is read out of the text; when it is not there, no argument is carried and the tool asks the module
     * for its current period.
     */
    static final class ClosingSchemeRoute implements ModuleRoute {

        private static final Pattern NAMED_MONTH =
                Pattern.compile("(?:会计期间|期间|月份)\\s*[=:：]?\\s*(\\d{4}-\\d{1,2})");
        private static final Pattern BARE_MONTH = Pattern.compile("(\\d{4}-(?:0[1-9]|1[0-2]))");

        @Override
        public String toolName() {
            return "get_fms_closing_schemes";
        }

        @Override
        public List<String> triggers() {
            return List.of("结转方案", "结账方案", "要结转哪些", "待结转", "哪些还没结转", "结转金额");
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
