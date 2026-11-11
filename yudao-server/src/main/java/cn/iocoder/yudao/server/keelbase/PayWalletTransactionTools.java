// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletTransactionDO;
import cn.iocoder.yudao.module.pay.service.wallet.PayWalletTransactionService;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pay 钱包流水的工具面：**只有一读**（调用方自己的流水，按流水号点名一行），没有写。
 *
 * <p><b>为什么参数是流水号，而不是「谁的流水」。</b>流水行的属主不在这一行上——它只有 `wallet_id`，属主对在钱包行上。
 * 让模型报一个人的编号去问流水，就是把「这是我的」变成「这是编号 42 的」，而 42 可能同时是另一个会员。调用方报出它本来
 * 就知道的东西（收据、到账通知里那个流水号），工具再拿它去换一行；属主由 {@link PayWalletTransactionGovernance} 沿
 * `wallet_id` 走一跳、在工具路径上判定：不是调用方的行与不存在的行得到同一个答案。
 *
 * <p><b>为什么读得到、却列不出。</b>本面刻意**不提供**「列出我的流水」：那需要分页，而分页的钱包编号是经
 * `getOrCreateWallet` 换出来的——一次读可能替调用方建出一个钱包，且 `walletId` 一给就绕过属主两列。故分页与统计在工具
 * 路径上被拒绝。「这一笔是什么」是一个真问题；「我有哪些流水」要等模块自己给出一条只读的按人行查询——届时再接。
 *
 * <p><b>投影。</b>出去的是这一笔的业务事实：编号、流水号、业务类型与业务编号、说明、金额与交易后余额（分）、创建时间。
 * 身份（`user_id` / `user_type`）与钱包编号都不出去——身份是问题的**主语**，不是答案的字段；钱包编号对「我这一笔」
 * 没有增量，{@link PayWalletTools} 已经答过「我的钱包是哪一行」。
 *
 * <p>pay's tool face over the wallet transaction: **one read only** (the caller's own flow, named by its transaction
 * number), no write.
 *
 * <p><b>Why the parameter is a transaction number, not "whose flow".</b> The row does not carry the owner — only
 * {@code wallet_id}, with the owner pair on the wallet row. Letting the model name a user id would turn "this is mine"
 * into "this is number 42's", where 42 may also be a member. The caller names something it should already know (the
 * number on a receipt or a payment notice), and the tool turns it into one row; the owner is decided by
 * {@link PayWalletTransactionGovernance} one hop away, on the tool path: another's row and a missing row get the same
 * answer.
 *
 * <p><b>Why it can read one but not list them.</b> This face deliberately offers **no** "list my flows": that needs a
 * page, and the page's wallet id is produced by {@code getOrCreateWallet} — a read that may create a wallet for the
 * caller — and a supplied {@code walletId} bypasses the owner fields. The page and the summary are therefore refused on
 * the tool path. "What is this one" is a real question; "which flows do I have" waits for the module to expose a
 * read-only per-caller query, and is picked up then.
 *
 * <p><b>Projection.</b> What leaves is this flow's business fact: id, transaction number, business type and id, title,
 * amount (cents) and the balance after it, creation time. Identity ({@code user_id} / {@code user_type}) and the wallet
 * id stay in — identity is the **subject** of the question, not a field of the answer, and the wallet id adds nothing to
 * "this flow of mine"; {@link PayWalletTools} has already answered which wallet row is the caller's.
 */
@Configuration
public class PayWalletTransactionTools {

    @Bean
    AiTool getMyPayWalletTransaction(PayWalletTransactionService service) {
        return new TransactionTool(service);
    }

    @Bean
    ModuleRoute payWalletTransactionRoute() {
        return new TransactionRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class TransactionTool implements AiTool {

        private final PayWalletTransactionService service;

        TransactionTool(PayWalletTransactionService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_pay_wallet_transaction";
        }

        @Override
        public String description() {
            return "Read one wallet transaction of the caller in this host's pay module (read-only), named by its"
                    + " transaction number. The row is answered only when the wallet behind it belongs to the caller;"
                    + " otherwise the answer is the same as for a transaction that does not exist. Amounts are in cents (分).";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("transactionNo", ToolParameter.STRING, "流水号（钱包流水里的编号，通常以 W 开头）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String no = str(args.get("transactionNo"));
            if (no == null) {
                return ToolResult.fail("give a transaction number (transactionNo)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(no)));
        }

        private ToolResult run(String no) {
            PayWalletTransactionDO transaction = service.getWalletTransactionByNo(no);
            if (transaction == null) {
                // 别人的流水与不存在的流水在这里同一个答案——这正是本接缝的可证伪面。
                // Another's flow and a missing flow give the same answer here — this is the seam's falsifiable face.
                return ToolResult.ok(Map.of("hasTransaction", false));
            }
            return ToolResult.ok(project(transaction));
        }

        /** The fields that leave this face — a projection is where that decision is legible. */
        private static Map<String, Object> project(PayWalletTransactionDO transaction) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasTransaction", true);
            safe.put("transactionId", transaction.getId());
            safe.put("transactionNo", transaction.getNo());
            safe.put("bizType", transaction.getBizType());
            safe.put("bizId", transaction.getBizId());
            safe.put("title", transaction.getTitle());
            safe.put("price", transaction.getPrice());
            safe.put("balance", transaction.getBalance());
            safe.put("createTime", transaction.getCreateTime() == null
                    ? null : transaction.getCreateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不收「列出我的流水」**：那需要一页，而这一页的钱包编号不是查询条件。
     * 短语也刻意避开钱包面的「我的钱包」「钱包余额」——不同工具面的触发词不得互相包含。
     *
     * The phrases this module's read answers to. "List my flows" is deliberately not a trigger: that needs a page whose
     * wallet id is not a query condition. The phrases also steer clear of the wallet face's "我的钱包" / "钱包余额" —
     * no two tool faces may claim phrases that contain one another.
     */
    static final class TransactionRoute implements ModuleRoute {

        /** 「流水号 / 流水单号 / 交易流水号」后面那个标识符——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:流水号|流水单号|交易流水号)\\s*[=:：]?\\s*([A-Za-z0-9_-]{2,})");

        @Override
        public String toolName() {
            return "get_my_pay_wallet_transaction";
        }

        @Override
        public List<String> triggers() {
            return List.of("钱包流水", "余额流水", "我的流水", "流水号", "查流水");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
            if (context.get("targetId") != null) {
                args.put("transactionNo", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("transactionNo", matcher.group(1));
                }
            }
            return args;
        }
    }

    private static String str(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
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
