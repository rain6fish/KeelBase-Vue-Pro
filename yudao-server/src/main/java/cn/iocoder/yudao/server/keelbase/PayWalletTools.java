// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.pay.controller.admin.wallet.vo.wallet.PayWalletPageReqVO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import cn.iocoder.yudao.module.pay.service.wallet.PayWalletService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * pay 钱包的工具面：**只有一读**（调用方自己的钱包），没有写。它验的是 M3 第一件的出口——一个**属主是两列**的对象，
 * 工具路径上那两列都由切面与这里同一份判据钉住。
 *
 * <p><b>「谁的钱包」不是模型能说的参数。</b>钱包按 `(user_id, user_type)` 归属，两个编号空间会撞号；让模型报一个
 * user id 去问钱包，就是把「这是我的」变成「这是编号 42 的」，而 42 可能同时是另一个会员。故本面**没有参数**：主体
 * 就是正在行动的调用方，命名空间固定为管理端（本宿主的 AI 调用方就是管理端用户）。
 *
 * <p><b>读不建行。</b>模块有一个 `getOrCreateWallet`，不存在时会插入一行——那是「读着像读、其实是写」。本面不用它：
 * 走分页（`getWalletPage`，两个属主条件都填上），没有钱包就答 `hasWallet=false`，而不是替调用方造一个。
 *
 * <p><b>投影。</b>出去的是钱包这一业务事实：编号与四个金额（分）。`userId` / `userType` 不出去——身份是问题的
 * **主语**，不是答案的字段；调用方本来就是「我」。
 *
 * <p>**这是一处声明的收窄，写在两处**：模块的控制台读口给管理员按 `pay:wallet:query` 查任意会员的钱包；本面只答
 * 调用方自己在管理端命名空间里的那一个。与 {@link PayWalletGovernance} 类注释里那句是同一句话。
 *
 * pay's tool face over the wallet: **one read only** (the caller's own wallet), no write. It tests M3's first item's
 * exit — an object whose **owner is a pair of columns**, both pinned on the tool path by the same rule here and in the
 * aspect.
 *
 * <p><b>"Whose wallet" is not a parameter the model may name.</b> A wallet belongs to {@code (user_id, user_type)},
 * and the two id spaces collide; letting the model name a user id would turn "this is mine" into "this is number
 * 42's", where 42 may also be a member. So this face **has no parameters**: the subject is the acting caller, and the
 * namespace is the administrator one (this host's AI callers are console users).
 *
 * <p><b>The read does not create.</b> The module has a {@code getOrCreateWallet} that inserts a row when none exists —
 * a read that writes. This face does not use it: it goes through the page with both owner conditions set, and answers
 * {@code hasWallet=false} instead of creating one for the caller.
 *
 * <p><b>Projection.</b> What leaves is the business fact of a wallet: its number and four amounts, in cents (分).
 * {@code userId} / {@code userType} do not leave — identity is the **subject** of the question, not a field of the
 * answer; the caller is already "me".
 *
 * <p>**This is a declared narrowing, stated in two places**: the module's console read lets an administrator behind
 * {@code pay:wallet:query} look up any member's wallet; this face answers only the caller's own, in the administrator
 * namespace. It is the same sentence as the one in {@link PayWalletGovernance}.
 */
@Configuration
public class PayWalletTools {

    @Bean
    AiTool getMyPayWallet(PayWalletService service) {
        return new WalletTool(service);
    }

    @Bean
    ModuleRoute payWalletRoute() {
        return new WalletRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class WalletTool implements AiTool {

        private final PayWalletService service;

        WalletTool(PayWalletService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_my_pay_wallet";
        }

        @Override
        public String description() {
            return "Read the caller's own wallet in this host's pay module (read-only): balance, frozen amount,"
                    + " lifetime expense and lifetime recharge, all in cents (分). A caller who has no wallet is"
                    + " answered as having none; no wallet is created.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of();
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(caller)));
        }

        private ToolResult run(Long caller) {
            PayWalletPageReqVO query = new PayWalletPageReqVO();
            query.setUserId(caller);
            query.setUserType(UserTypeEnum.ADMIN.getValue());
            // 一个人的钱包至多一个：取一页一条就够，且不必把「他有多少个钱包」变成一个事实。
            // One person has at most one wallet: a page of one is enough, and it need not turn "how many wallets" into a fact.
            query.setPageNo(1);
            query.setPageSize(1);
            PageResult<PayWalletDO> page = service.getWalletPage(query);
            if (page == null || page.getList() == null || page.getList().isEmpty()) {
                return ToolResult.ok(Map.of("hasWallet", false));
            }
            return ToolResult.ok(project(page.getList().get(0)));
        }

        /** The fields that leave this face — a projection is where that decision is legible. */
        private static Map<String, Object> project(PayWalletDO wallet) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasWallet", true);
            safe.put("walletId", wallet.getId());
            safe.put("balance", wallet.getBalance());
            safe.put("freezePrice", wallet.getFreezePrice());
            safe.put("totalExpense", wallet.getTotalExpense());
            safe.put("totalRecharge", wallet.getTotalRecharge());
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。**刻意不收「给某人加余额」这类话**：那是控制台的写，本面没有写。
     *
     * The phrases this module's read answers to. Writes such as "top up someone's balance" are deliberately not
     * triggers: that is a console write, and this face has none.
     */
    static final class WalletRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "get_my_pay_wallet";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的钱包", "钱包余额", "钱包里还有多少钱", "余额还剩多少", "我的余额");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // 没有参数：主体是正在行动的调用方，不是文字里能点名的某个人。
            // No arguments: the subject is the acting caller, not a person the words can name.
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
