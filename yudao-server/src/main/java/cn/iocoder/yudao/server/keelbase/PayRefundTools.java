// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pay.dal.dataobject.refund.PayRefundDO;
import cn.iocoder.yudao.module.pay.service.refund.PayRefundService;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pay 退款单的工具面：**只有一读**（调用方自己的退款单，按退款单号或编号点名一行），没有写。
 *
 * <p><b>为什么参数是标识符。</b>退款单的分页没有属主过滤位，把「我的」做成一次分页就是假收窄；能钉住的只有单行读。
 * 调用方报出它本来就该知道的东西——退款单号，或控制台里看到的编号——工具再拿它去换一行。属主由
 * {@link PayRefundGovernance} 在工具路径上判定：不是调用方的行与不存在的行得到同一个答案。
 *
 * <p><b>为什么列不出。</b>本面刻意不提供「列出我的退款单」：那需要分页，而分页没有属主位。
 *
 * <p><b>投影。</b>出去的是这一单的业务事实：编号、退款单号、支付单号、状态、支付金额与退款金额（分）、渠道编码、
 * 创建时间。{@code user_id} / {@code user_type} 不出去；{@code userIp}、渠道侧身份、商户内部编号也不出去。
 *
 * <p>pay's tool face over the refund: **one read only** (the caller's own refund, named by refund number or id), no
 * write.
 *
 * <p><b>Why the parameter is an identifier.</b> The refund page has no owner slot, so turning "mine" into a page would
 * be a false narrowing; only a single-row read can be pinned. The caller names something it should already know — the
 * refund number, or the id it saw in the console. The owner is decided by {@link PayRefundGovernance} on the tool path:
 * another's row and a missing row get the same answer.
 *
 * <p><b>Why it cannot list.</b> This face deliberately offers no "list my refunds": that needs a page, and the page has
 * no owner slot.
 *
 * <p><b>Projection.</b> What leaves is this refund's business fact: id, refund number, payment order number, status, the
 * paid and refunded amounts (cents), channel code and creation time. {@code user_id} / {@code user_type} do not leave,
 * and neither do {@code userIp}, channel-side identities or the merchant's internal ids.
 */
@Configuration
public class PayRefundTools {

    @Bean
    AiTool getMyPayRefund(PayRefundService service) {
        return new RefundTool(service);
    }

    @Bean
    ModuleRoute payRefundRoute() {
        return new RefundRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class RefundTool implements AiTool {

        private final PayRefundService service;

        RefundTool(PayRefundService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_pay_refund";
        }

        @Override
        public String description() {
            return "Read one refund of the caller in this host's pay module (read-only), named by its refund number"
                    + " or its id. The row is answered only when it belongs to the caller; otherwise the answer is"
                    + " the same as for a refund that does not exist. Amounts are in cents (分).";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("refundNo", ToolParameter.STRING, "退款单号"),
                    ToolParameter.optional("refundId", ToolParameter.STRING, "退款单编号（控制台里的数字编号）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String no = str(args.get("refundNo"));
            Long id = asId(str(args.get("refundId")));
            if (no == null && id == null) {
                return ToolResult.fail("give a refund number (refundNo) or a refund id (refundId)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(no, id)));
        }

        private ToolResult run(String no, Long id) {
            PayRefundDO refund = no != null ? service.getRefundByNo(no) : service.getRefund(id);
            if (refund == null) {
                // 别人的行与不存在的行在这里同一个答案——本接缝的可证伪面。
                // Another's row and a missing row give the same answer here — this seam's falsifiable face.
                return ToolResult.ok(Map.of("hasRefund", false));
            }
            return ToolResult.ok(project(refund));
        }

        private static Map<String, Object> project(PayRefundDO refund) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasRefund", true);
            safe.put("refundId", refund.getId());
            safe.put("refundNo", refund.getNo());
            safe.put("orderNo", refund.getOrderNo());
            safe.put("status", refund.getStatus());
            safe.put("payPrice", refund.getPayPrice());
            safe.put("refundPrice", refund.getRefundPrice());
            safe.put("channelCode", refund.getChannelCode());
            safe.put("createTime", refund.getCreateTime() == null
                    ? null : refund.getCreateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不收「列出我的退款单」**：那需要一页，而这一页没有属主过滤位。
     *
     * The phrases this module's read answers to. "List my refunds" is deliberately not a trigger: that needs a page,
     * and this page has no owner slot.
     */
    static final class RefundRoute implements ModuleRoute {

        /** 「退款单号 / 退款单 / 退款订单」后面那个标识符——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:退款单号|退款订单号|退款订单|退款单)\\s*[=:：]?\\s*([A-Za-z0-9_-]{2,})");

        @Override
        public String toolName() {
            return "get_my_pay_refund";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的退款", "查退款单", "退款单", "退款订单", "退款状态", "退款单状态", "退款单号",
                    "这一单退款了吗");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("refundId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("refundNo", matcher.group(1));
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
