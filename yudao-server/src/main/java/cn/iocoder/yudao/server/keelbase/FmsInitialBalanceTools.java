// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.fms.controller.admin.config.vo.initialbalance.FmsTrialBalanceRespVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import cn.iocoder.yudao.module.fms.service.config.FmsInitialBalanceService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * FMS 期初余额的工具面：**只有一读**（试算平衡），没有写。它验的是 M2 里那个形态的出口——属主是**模块自己的账套判权**，
 * 故这个面要回答的不是「哪一行归谁」，而是「我这一本账的期初平不平、差多少」。
 *
 * <p><b>账套不是模型能说的参数。</b>模块按账套授权，而账套编号是模块的簿记细节。这个读**自己解析调用方自己的账套**
 * （`getAccountUserList`，优先取默认那个、没有默认取第一个），与凭证面、结账面同一个办法；调用方所属的账套一个都没有时，
 * 它答「不属于任何账套」而不是编一个编号去问。**这是一处声明的收窄**：模块本身答得出调用方所属的每一个账套，而这个面
 * 只问默认（其次第一个）那一个 —— 要问另一个账套，是控制台里的事，不是对话里的事。
 *
 * <p><b>为什么读试算平衡，而不是逐科目明细。</b>要判断「这本账能不能开张」的事实只有一件：借贷各多少、差多少、平不平。
 * 模块的试算平衡口（`getTrialBalance`）正好就是这三个数，而它**已经在用传进来的 `userId` 判账套读权限**；逐科目明细是
 * 人对着表格逐行填数时看的东西，不是对话要的答案。出口也不带科目名、不带账套编号 —— 那些是簿记细节。
 *
 * <p><b>为什么没有写。</b>期初余额是建账时一次性录入的一批数：由人在控制台逐科目填、或从 Excel 导入，且模块要求账套
 * 可写 level、已初始化、期间未关账（`saveInitialBalance` / `importInitialBalance`）。把它交给对话去写，等于让 AI 改一本
 * 还没开张的账；AI 在这里需要的是**读**：这些数对不对得上。
 *
 * <p><b>投影。</b>出去的是试算平衡这一业务事实：期初与本年累计各自的借贷合计、差额，以及是否平衡。不带 `accountSetId`
 * —— 账套是调用方自己的簿记细节，不进入对话。
 *
 * FMS's tool face over the opening balances: **one read only** (the trial balance), no write. The form it tests
 * for M2 is this face's exit — the owner is the **module's own account-set authorisation**, so the question is
 * not "whose row is this" but "is this book's opening balance square, and by how much is it off".
 *
 * <p><b>The account set is not a parameter the model may name.</b> The module authorises by account set, and an
 * account-set number is the module's bookkeeping detail. This read **resolves the caller's own account set**
 * ({@code getAccountUserList}, preferring the default, else the first), the same way the voucher and closing
 * faces do; when the caller belongs to none it answers "not a member of any account set" rather than inventing
 * a number to ask about. **This is a declared narrowing**: the module itself answers for every account set the
 * caller belongs to, while this face asks only about the default (else first) one — asking about another is a
 * console job, not a conversation job.
 *
 * <p><b>Why the trial balance and not the per-subject sheet.</b> The facts that decide "can this book open" are
 * three: the debit total, the credit total, the difference — and whether they cancel. The module's trial-balance
 * port ({@code getTrialBalance}) is exactly those, and it **already checks account-set read permission with the
 * {@code userId} it is handed**; the per-subject sheet is what a person reads while typing the numbers in, not
 * the answer a conversation asks for. The projection carries neither subject names nor the account-set number —
 * those are bookkeeping details.
 *
 * <p><b>Why there is no write.</b> Opening balances are a batch entered once when the books are opened: filled
 * per subject in the console or imported from Excel, and the module requires a writable level, an initialised
 * account set and an open period ({@code saveInitialBalance} / {@code importInitialBalance}). Handing that to a
 * conversation would let the AI edit a book that has not opened yet; what the AI needs here is the **read**:
 * whether the numbers add up.
 *
 * <p><b>Projection.</b> What leaves is the business fact of a trial balance: the opening and year-to-date debit
 * and credit totals, the two differences, and whether it is balanced. The {@code accountSetId} does not leave —
 * it is the caller's own bookkeeping detail and has no place in the conversation.
 */
@Configuration
public class FmsInitialBalanceTools {

    @Bean
    AiTool getFmsTrialBalance(FmsInitialBalanceService service, FmsAccountUserService accountUsers) {
        return new TrialBalanceTool(service, accountUsers);
    }

    @Bean
    ModuleRoute fmsTrialBalanceRoute() {
        return new TrialBalanceRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class TrialBalanceTool implements AiTool {

        private final FmsInitialBalanceService service;
        private final FmsAccountUserService accountUsers;

        TrialBalanceTool(FmsInitialBalanceService service, FmsAccountUserService accountUsers) {
            this.service = service;
            this.accountUsers = accountUsers;
        }

        @Override
        public String name() {
            return "get_fms_trial_balance";
        }

        @Override
        public String description() {
            return "Report whether the caller's own account set in this host's own FMS module balances its"
                    + " opening and year-to-date debit against credit, and by how much it is off"
                    + " (read-only). The caller's account set is resolved from their membership.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(), () -> run(caller)));
        }

        private ToolResult run(Long caller) {
            Long accountSetId = defaultAccountSet(accountUsers.getAccountUserList(caller));
            if (accountSetId == null) {
                // 一个账套都没有时不编一个编号去问：那会把「不属于任何账套」变成一次别人的账。
                // With no account set, no number is invented: that would turn "belongs to none" into someone else's books.
                return ToolResult.ok(Map.of("accountSetMember", false));
            }
            return ToolResult.ok(project(service.getTrialBalance(accountSetId, caller)));
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
        private static Map<String, Object> project(FmsTrialBalanceRespVO trial) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("openingDebitAmount", trial.getOpeningDebitAmount());
            safe.put("openingCreditAmount", trial.getOpeningCreditAmount());
            safe.put("openingDifferenceAmount", trial.getOpeningDifferenceAmount());
            safe.put("yearDebitAmount", trial.getYearDebitAmount());
            safe.put("yearCreditAmount", trial.getYearCreditAmount());
            safe.put("yearDifferenceAmount", trial.getYearDifferenceAmount());
            safe.put("balanced", trial.getBalanced());
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不用裸的「期初余额」**：它读起来像要么在问明细清单、要么在要求录数，而本面既不列明细
     * 也不写；它只答「平不平、差多少」。无参数可读——账套由宿主解析，这里没有模型能说的东西。
     *
     * The phrases this module's read answers to. A bare "期初余额" is deliberately avoided: read alone it sounds
     * like either a request for the per-subject sheet or an instruction to enter numbers, and this face does
     * neither — it answers "square or not, and by how much". There is no argument to read: the account set is
     * resolved by the host, and nothing here is the model's to name.
     */
    static final class TrialBalanceRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_fms_trial_balance";
        }

        @Override
        public List<String> triggers() {
            return List.of("试算平衡", "期初平不平", "期初平衡", "期初对不对", "期初差额");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // 本面无参数：路由每次都交回一个**可写**的空表，而不是不可变的空表。
            // No argument here: the route hands back a **mutable** empty map, never an immutable one.
            return new LinkedHashMap<>();
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
