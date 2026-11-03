// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pay.dal.dataobject.transfer.PayTransferDO;
import cn.iocoder.yudao.module.pay.service.transfer.PayTransferService;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pay 转账单的工具面：**只有一读**（调用方自己的转账单，按转账单号或编号点名一行），没有写。
 *
 * <p><b>属主是哪一对。</b>行上唯一的一对用户列是 {@code user_id} + {@code user_type}；{@code userName} /
 * {@code userAccount} 是收款人姓名与收款账号（渠道侧信息），**不是**本宿主的身份。工具路径钉「行动调用方 + 管理员」，
 * 由 {@link PayTransferGovernance} 判定：不是调用方的行与不存在的行得到同一个答案。
 *
 * <p><b>为什么参数是标识符。</b>转账单的分页没有属主过滤位，把「我的」做成一次分页就是假收窄；能钉住的只有单行读。
 * 调用方报出它本来就该知道的东西——转账单号，或控制台里看到的编号。
 *
 * <p><b>投影。</b>出去的是这一单的业务事实：编号、转账单号、状态、金额（分）、标题、渠道编码、创建时间。
 * {@code user_id} / {@code user_type} 不出去；收款账号 / 姓名、{@code userIp}、{@code channelExtras}、渠道单号与
 * 商户内部编号也不出去。
 *
 * <p>pay's tool face over the transfer: **one read only** (the caller's own transfer, named by transfer number or id),
 * no write.
 *
 * <p><b>Which pair is the owner.</b> The only user columns on the row are {@code user_id} + {@code user_type};
 * {@code userName} / {@code userAccount} are the payee's name and account (channel-side information), **not** this
 * host's identity. The tool path pins "the acting caller + administrator" and {@link PayTransferGovernance} decides:
 * another's row and a missing row get the same answer.
 *
 * <p><b>Why the parameter is an identifier.</b> The transfer page has no owner slot, so turning "mine" into a page
 * would be a false narrowing; only a single-row read can be pinned. The caller names something it should already know —
 * the transfer number, or the id it saw in the console.
 *
 * <p><b>Projection.</b> What leaves is this transfer's business fact: id, transfer number, status, amount (cents),
 * subject, channel code and creation time. {@code user_id} / {@code user_type} do not leave, and neither do the payee's
 * account or name, {@code userIp}, {@code channelExtras}, channel-side numbers or the merchant's internal ids.
 */
@Configuration
public class PayTransferTools {

    @Bean
    AiTool getMyPayTransfer(PayTransferService service) {
        return new TransferTool(service);
    }

    @Bean
    ModuleRoute payTransferRoute() {
        return new TransferRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class TransferTool implements AiTool {

        private final PayTransferService service;

        TransferTool(PayTransferService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_pay_transfer";
        }

        @Override
        public String description() {
            return "Read one transfer of the caller in this host's pay module (read-only), named by its transfer"
                    + " number or its id. The row is answered only when it belongs to the caller; otherwise the answer"
                    + " is the same as for a transfer that does not exist. The amount is in cents (分).";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("transferNo", ToolParameter.STRING, "转账单号"),
                    ToolParameter.optional("transferId", ToolParameter.STRING, "转账单编号（控制台里的数字编号）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            String no = str(args.get("transferNo"));
            Long id = asId(str(args.get("transferId")));
            if (no == null && id == null) {
                return ToolResult.fail("give a transfer number (transferNo) or a transfer id (transferId)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(no, id)));
        }

        private ToolResult run(String no, Long id) {
            PayTransferDO transfer = no != null ? service.getTransferByNo(no) : service.getTransfer(id);
            if (transfer == null) {
                // 别人的行与不存在的行在这里同一个答案——本接缝的可证伪面。
                // Another's row and a missing row give the same answer here — this seam's falsifiable face.
                return ToolResult.ok(Map.of("hasTransfer", false));
            }
            return ToolResult.ok(project(transfer));
        }

        private static Map<String, Object> project(PayTransferDO transfer) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasTransfer", true);
            safe.put("transferId", transfer.getId());
            safe.put("transferNo", transfer.getNo());
            safe.put("status", transfer.getStatus());
            safe.put("price", transfer.getPrice());
            safe.put("subject", transfer.getSubject());
            safe.put("channelCode", transfer.getChannelCode());
            safe.put("createTime", transfer.getCreateTime() == null
                    ? null : transfer.getCreateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不收「列出我的转账单」**：那需要一页，而这一页没有属主过滤位。
     *
     * The phrases this module's read answers to. "List my transfers" is deliberately not a trigger: that needs a page,
     * and this page has no owner slot.
     */
    static final class TransferRoute implements ModuleRoute {

        /** 「转账单号 / 转账单 / 转账订单」后面那个标识符——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:转账单号|转账订单号|转账订单|转账单)\\s*[=:：]?\\s*([A-Za-z0-9_-]{2,})");

        @Override
        public String toolName() {
            return "get_my_pay_transfer";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的转账", "查转账单", "转账单", "转账订单", "转账状态", "转账单状态", "转账单号",
                    "转账到账了吗");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("transferId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("transferNo", matcher.group(1));
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
