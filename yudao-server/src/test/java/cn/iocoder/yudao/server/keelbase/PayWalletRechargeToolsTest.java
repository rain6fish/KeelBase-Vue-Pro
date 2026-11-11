// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletRechargeDO;
import cn.iocoder.yudao.module.pay.service.wallet.PayWalletRechargeService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 充值单工具面的四件事：**按编号问一行**、**没有这一行就答没有（与别人的行同一个答案）**、
 * **投影是整份允许清单、不带身份也不带钱包编号**，以及**没有本地调用方时不碰任何数据**；另验路由的触发词与抽取。
 *
 * <p>Four things the wallet-recharge face does: ask for one row by its id, answer "none" when there is no such row
 * (the same answer as for someone else's), project the whole allow-list without identity or the wallet id, and touch
 * no data when no local caller can be named; plus the route's triggers and identifier extraction.
 */
class PayWalletRechargeToolsTest {

    private static final String CALLER = "42";

    private PayWalletRechargeService service;
    private PayWalletRechargeTools.RechargeTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PayWalletRechargeService.class);
        tool = new PayWalletRechargeTools.RechargeTool(service);
    }

    @Test
    void theReadAsksByTheRechargeIdItWasGiven() {
        when(service.getWalletRecharge(600L)).thenReturn(recharge());

        assertTrue(tool.execute(Map.of("rechargeId", "600"), caller()).success());
        verify(service).getWalletRecharge(600L);
    }

    @Test
    void aMissingRowIsAnsweredAsMissing() {
        when(service.getWalletRecharge(404L)).thenReturn(null);

        ToolResult result = tool.execute(Map.of("rechargeId", "404"), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasRecharge", false), result.data(),
                "another person's row and a missing row must be the same answer");
    }

    @Test
    void noIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give a recharge id (rechargeId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aNonNumericIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of("rechargeId", "not-a-number"), caller());

        assertFalse(result.success());
        assertEquals("give a recharge id (rechargeId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("rechargeId", "600"),
                new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheBusinessFactButNoIdentityAndNoWalletId() {
        when(service.getWalletRecharge(600L)).thenReturn(recharge());

        ToolResult result = tool.execute(Map.of("rechargeId", "600"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasRecharge", "rechargeId", "packageId", "totalPrice", "payPrice", "bonusPrice",
                        "payStatus", "payOrderId", "payChannelCode", "payTime", "refundStatus", "refundTime",
                        "createTime"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity and the wallet id must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasRecharge"));
        assertEquals(600L, out.get("rechargeId"));
        assertEquals(120, out.get("totalPrice"));
        assertEquals(100, out.get("payPrice"));
        assertEquals(20, out.get("bonusPrice"));
        assertFalse(out.containsKey("userId"));
        assertFalse(out.containsKey("userType"));
        assertFalse(out.containsKey("walletId"));
    }

    @Test
    void theRouteExtractsTheNumberAndTakesTheStructuredSlot() {
        PayWalletRechargeTools.RechargeRoute route = new PayWalletRechargeTools.RechargeRoute();

        assertEquals("get_my_pay_wallet_recharge", route.toolName());
        assertEquals("600", route.args(Map.of("message", "查一下充值单 600")).get("rechargeId"));
        assertEquals("777", route.args(Map.of("targetId", "777")).get("rechargeId"),
                "with no words naming an identifier, the structured slot is the only one left");
    }

    @Test
    void theRouteStillNamesTheTool() {
        PayWalletRechargeTools.RechargeRoute route = new PayWalletRechargeTools.RechargeRoute();

        assertTrue(route.triggers().contains("充值单"));
        assertTrue(route.triggers().contains("充值单号"));
        assertTrue(route.args(Map.of("message", "你好")).isEmpty(),
                "no identifier means no arguments, not a guessed one");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_my_pay_wallet_recharge", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(1, tool.parameters().size());
        assertEquals("rechargeId", tool.parameters().get(0).name());
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PayWalletRechargeDO recharge() {
        PayWalletRechargeDO recharge = new PayWalletRechargeDO();
        recharge.setId(600L);
        recharge.setWalletId(9L);
        recharge.setPackageId(3L);
        recharge.setTotalPrice(120);
        recharge.setPayPrice(100);
        recharge.setBonusPrice(20);
        recharge.setPayStatus(true);
        recharge.setPayOrderId(800L);
        recharge.setPayChannelCode("wx_lite");
        recharge.setPayTime(LocalDateTime.of(2026, 11, 3, 9, 0));
        recharge.setRefundStatus(null);
        recharge.setRefundTime(null);
        recharge.setCreateTime(LocalDateTime.of(2026, 11, 3, 8, 59));
        return recharge;
    }
}
