// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletRechargeDO;
import cn.iocoder.yudao.module.pay.service.wallet.PayWalletRechargeService;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pay 钱包充值单的工具面：**只有一读**（调用方自己的充值单，按编号点名一行），没有写。
 *
 * <p><b>为什么参数是充值单编号，而不是「谁的充值单」。</b>充值单行的属主不在这一行上——它只有 `wallet_id`，属主对在
 * 钱包行上。让模型报一个人的编号去问充值单，就是把「这是我的」变成「这是编号 42 的」，而 42 可能同时是另一个会员。
 * 调用方报出它本来就知道的东西（充值记录里那个编号），工具再拿它去换一行；属主由
 * {@link PayWalletRechargeGovernance} 沿 `wallet_id` 走一跳、在工具路径上判定：不是调用方的行与不存在的行得到同一个
 * 答案。
 *
 * <p><b>为什么读得到、却列不出。</b>本面刻意**不提供**「列出我的充值单」：那需要分页，而分页的钱包编号是经
 * `getOrCreateWallet` 换出来的——一次读可能替调用方建出一个钱包。故分页在工具路径上被拒绝。「这一笔充值是什么」
 * 是一个真问题；「我有哪些充值」要等模块自己给出一条只读的按人行查询——届时再接。
 *
 * <p><b>投影。</b>出去的是这一笔的业务事实：编号、金额（到账/实付/赠送，分）、支付状态与支付单编号、渠道、支付时间、
 * 退款状态与退款时间、创建时间。身份（`user_id` / `user_type`）与钱包编号都不出去——身份是问题的**主语**，不是答案的
 * 字段；钱包编号对「我这一笔」没有增量，{@link PayWalletTools} 已经答过「我的钱包是哪一行」。
 *
 * <p>pay's tool face over the wallet recharge: **one read only** (the caller's own recharge, named by its id), no
 * write.
 *
 * <p><b>Why the parameter is a recharge id, not "whose recharge".</b> The row does not carry the owner — only
 * {@code wallet_id}, with the owner pair on the wallet row. Letting the model name a user id would turn "this is
 * mine" into "this is number 42's", where 42 may also be a member. The caller names something it should already know,
 * and the tool turns it into one row; the owner is decided by {@link PayWalletRechargeGovernance} one hop away, on the
 * tool path: another's row and a missing row get the same answer.
 *
 * <p><b>Why it can read one but not list them.</b> This face deliberately offers **no** "list my recharges": that
 * needs a page, whose wallet id is produced by {@code getOrCreateWallet} — a read that may create a wallet for the
 * caller. The page is therefore refused on the tool path. "What is this one" is a real question; "which recharges do I
 * have" waits for the module to expose a read-only per-caller query.
 *
 * <p><b>Projection.</b> What leaves is this recharge's business fact: id, prices (total / paid / bonus, cents), pay
 * status and order id, channel, pay time, refund status and time, creation time. Identity and the wallet id stay in.
 */
@Configuration
public class PayWalletRechargeTools {

    @Bean
    AiTool getMyPayWalletRecharge(PayWalletRechargeService service) {
        return new RechargeTool(service);
    }

    @Bean
    ModuleRoute payWalletRechargeRoute() {
        return new RechargeRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class RechargeTool implements AiTool {

        private final PayWalletRechargeService service;

        RechargeTool(PayWalletRechargeService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_pay_wallet_recharge";
        }

        @Override
        public String description() {
            return "Read one wallet recharge of the caller in this host's pay module (read-only), named by its"
                    + " recharge id. The row is answered only when the wallet behind it belongs to the caller;"
                    + " otherwise the answer is the same as for a recharge that does not exist. Amounts are in cents (分).";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("rechargeId", ToolParameter.STRING, "充值单编号（钱包充值记录里的整数编号）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            Long id = asId(str(args.get("rechargeId")));
            if (id == null) {
                return ToolResult.fail("give a recharge id (rechargeId)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(id)));
        }

        private ToolResult run(Long id) {
            PayWalletRechargeDO recharge = service.getWalletRecharge(id);
            if (recharge == null) {
                // 别人的充值单与不存在的充值单在这里同一个答案——这正是本接缝的可证伪面。
                // Another's recharge and a missing recharge give the same answer here — the seam's falsifiable face.
                return ToolResult.ok(Map.of("hasRecharge", false));
            }
            return ToolResult.ok(project(recharge));
        }

        /** The fields that leave this face — a projection is where that decision is legible. */
        private static Map<String, Object> project(PayWalletRechargeDO recharge) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasRecharge", true);
            safe.put("rechargeId", recharge.getId());
            safe.put("packageId", recharge.getPackageId());
            safe.put("totalPrice", recharge.getTotalPrice());
            safe.put("payPrice", recharge.getPayPrice());
            safe.put("bonusPrice", recharge.getBonusPrice());
            safe.put("payStatus", recharge.getPayStatus());
            safe.put("payOrderId", recharge.getPayOrderId());
            safe.put("payChannelCode", recharge.getPayChannelCode());
            safe.put("payTime", recharge.getPayTime() == null
                    ? null : recharge.getPayTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            safe.put("refundStatus", recharge.getRefundStatus());
            safe.put("refundTime", recharge.getRefundTime() == null
                    ? null : recharge.getRefundTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            safe.put("createTime", recharge.getCreateTime() == null
                    ? null : recharge.getCreateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不收「列出我的充值单」**：那需要一页，而这一页的钱包编号不是查询条件。
     * 短语也刻意避开钱包面与流水面的「我的钱包」「钱包余额」「钱包流水」——不同工具面的触发词不得互相包含。
     *
     * The phrases this module's read answers to. "List my recharges" is deliberately not a trigger: that needs a page
     * whose wallet id is not a query condition. The phrases also steer clear of the wallet and transaction faces'
     * "我的钱包" / "钱包余额" / "钱包流水" — no two tool faces may claim phrases that contain one another.
     */
    static final class RechargeRoute implements ModuleRoute {

        /** 「充值单 / 充值单号 / 充值订单」后面那个整数编号——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:充值单号|充值单|充值订单|充值编号)\\s*[=:：]?\\s*(\\d{1,19})");

        @Override
        public String toolName() {
            return "get_my_pay_wallet_recharge";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的充值", "查充值单", "充值单", "充值订单", "充值状态", "充值单状态",
                    "充值单号", "这一笔充值到账了吗");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
            if (context.get("targetId") != null) {
                args.put("rechargeId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("rechargeId", matcher.group(1));
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
