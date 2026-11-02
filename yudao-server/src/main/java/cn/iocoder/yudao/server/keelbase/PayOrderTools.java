// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pay.dal.dataobject.order.PayOrderDO;
import cn.iocoder.yudao.module.pay.service.order.PayOrderService;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pay 支付单的工具面：**只有一读**（调用方自己的支付单，按单号或编号点名一行），没有写。
 *
 * <p><b>为什么参数是一个标识符，而不是「谁的订单」。</b>支付单的分页没有属主过滤位，把「我的」做成一次分页就是
 * 假收窄；能钉住的只有**单行读**。调用方报出它本来就该知道的东西——支付单号，或控制台里看到的编号——工具再拿它去
 * 换一行。属主由 {@link PayOrderGovernance} 在工具路径上判定：不是调用方的行与不存在的行得到同一个答案。
 *
 * <p><b>为什么读得到、却列不出。</b>本面刻意**不提供**「列出我的支付单」：那需要分页，而分页没有属主位。
 * 「这一单是什么状态」是一个真问题；「我有哪些单」要等模块给分页加属主过滤位，或用一条真正的按人行查询——届时再接。
 *
 * <p><b>投影。</b>出去的是这一单的业务事实：编号、支付单号、状态、金额与退款金额（分）、渠道编码、创建时间。
 * {@code user_id} / {@code user_type} 不出去——身份是问题的**主语**，不是答案的字段；{@code userIp}、
 * {@code channelUserId} 这类渠道侧身份也不出去。{@code appId} 是配置编号，对回答「我这一单」没有用，同样不出去。
 *
 * <p>pay's tool face over the payment order: **one read only** (the caller's own order, named by number or id), no
 * write.
 *
 * <p><b>Why the parameter is an identifier, not "whose order".</b> The order page has no owner slot, so turning "mine"
 * into a page would be a false narrowing; the only thing that can be pinned is a **single-row read**. The caller names
 * something it should already know — the payment order number, or the id it saw in the console — and the tool turns it
 * into one row. The owner is decided by {@link PayOrderGovernance} on the tool path: another's row and a missing row
 * get the same answer.
 *
 * <p><b>Why it can read one but not list them.</b> This face deliberately offers **no** "list my payment orders": that
 * needs a page, and the page has no owner slot. "What is the state of this order" is a real question; "which orders do
 * I have" waits for the module to give its page an owner filter, or for a real per-caller query — and is picked up
 * then.
 *
 * <p><b>Projection.</b> What leaves is this order's business fact: id, order number, status, price and refunded amount
 * (cents), channel code and creation time. {@code user_id} / {@code user_type} do not leave — identity is the
 * **subject** of the question, not a field of the answer — and neither do channel-side identities such as
 * {@code userIp} or {@code channelUserId}. {@code appId} is a configuration id that says nothing about "this order of
 * mine", so it stays in as well.
 */
@Configuration
public class PayOrderTools {

    @Bean
    AiTool getMyPayOrder(PayOrderService service) {
        return new OrderTool(service);
    }

    @Bean
    ModuleRoute payOrderRoute() {
        return new OrderRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class OrderTool implements AiTool {

        private final PayOrderService service;

        OrderTool(PayOrderService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_pay_order";
        }

        @Override
        public String description() {
            return "Read one payment order of the caller in this host's pay module (read-only), named by its"
                    + " payment order number or its id. The row is answered only when it belongs to the caller;"
                    + " otherwise the answer is the same as for an order that does not exist. Amounts are in cents (分).";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("orderNo", ToolParameter.STRING, "支付单号（提交支付后生成）"),
                    ToolParameter.optional("orderId", ToolParameter.STRING, "支付单编号（控制台里的数字编号）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String no = str(args.get("orderNo"));
            Long id = asId(str(args.get("orderId")));
            if (no == null && id == null) {
                return ToolResult.fail("give an order number (orderNo) or an order id (orderId)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(no, id)));
        }

        private ToolResult run(String no, Long id) {
            PayOrderDO order = no != null ? service.getOrder(no) : service.getOrder(id);
            if (order == null) {
                // 别人的行与不存在的行在这里同一个答案——这正是本接缝的可证伪面。
                // Another's row and a missing row give the same answer here — this is the seam's falsifiable face.
                return ToolResult.ok(Map.of("hasOrder", false));
            }
            return ToolResult.ok(project(order));
        }

        /** The fields that leave this face — a projection is where that decision is legible. */
        private static Map<String, Object> project(PayOrderDO order) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasOrder", true);
            safe.put("orderId", order.getId());
            safe.put("orderNo", order.getNo());
            safe.put("status", order.getStatus());
            safe.put("price", order.getPrice());
            safe.put("refundPrice", order.getRefundPrice());
            safe.put("channelCode", order.getChannelCode());
            safe.put("createTime", order.getCreateTime() == null
                    ? null : order.getCreateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不收「列出我的支付单」**：那需要一页，而这一页没有属主过滤位。
     *
     * The phrases this module's read answers to. "List my payment orders" is deliberately not a trigger: that needs a
     * page, and this page has no owner slot.
     */
    static final class OrderRoute implements ModuleRoute {

        /** 「支付单号 / 支付单 / 支付订单 / 订单号」后面那个标识符——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:支付单号|支付单|支付订单号|支付订单|订单号)\\s*[=:：]?\\s*([A-Za-z0-9_-]{2,})");

        @Override
        public String toolName() {
            return "get_my_pay_order";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的支付单", "查支付单", "支付单", "支付订单", "支付单状态", "支付订单状态",
                    "这一单支付了吗", "支付单号");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
            if (context.get("targetId") != null) {
                args.put("orderId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("orderNo", matcher.group(1));
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
