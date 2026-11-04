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
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletTransactionDO;
import cn.iocoder.yudao.module.pay.service.wallet.PayWalletTransactionService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 钱包流水工具面的四件事：**按流水号问一行**、**没有这一行就答没有（与别人的行同一个答案）**、
 * **投影是整份允许清单、不带身份也不带钱包编号**，以及**没有本地调用方时不碰任何数据**；另验路由的触发词与抽取。
 *
 * <p>Four things the wallet-transaction face does: ask for one row by its transaction number, answer "none" when there
 * is no such row (the same answer as for someone else's), project the whole allow-list without identity or the wallet
 * id, and touch no data when no local caller can be named; plus the route's triggers and identifier extraction.
 */
class PayWalletTransactionToolsTest {

    private static final String CALLER = "42";

    private PayWalletTransactionService service;
    private PayWalletTransactionTools.TransactionTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PayWalletTransactionService.class);
        tool = new PayWalletTransactionTools.TransactionTool(service);
    }

    @Test
    void theReadAsksByTheTransactionNumberItWasGiven() {
        when(service.getWalletTransactionByNo("W-1")).thenReturn(transaction());

        assertTrue(tool.execute(Map.of("transactionNo", "W-1"), caller()).success());
        verify(service).getWalletTransactionByNo("W-1");
    }

    @Test
    void aMissingRowIsAnsweredAsMissing() {
        when(service.getWalletTransactionByNo("W-none")).thenReturn(null);

        ToolResult result = tool.execute(Map.of("transactionNo", "W-none"), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasTransaction", false), result.data(),
                "another person's row and a missing row must be the same answer");
    }

    @Test
    void noIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give a transaction number (transactionNo)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("transactionNo", "W-1"),
                new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheBusinessFactButNoIdentityAndNoWalletId() {
        when(service.getWalletTransactionByNo("W-1")).thenReturn(transaction());

        ToolResult result = tool.execute(Map.of("transactionNo", "W-1"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasTransaction", "transactionId", "transactionNo", "bizType", "bizId", "title",
                        "price", "balance", "createTime"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity and the wallet id must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasTransaction"));
        assertEquals(500L, out.get("transactionId"));
        assertEquals("W-1", out.get("transactionNo"));
        assertEquals(-20, out.get("price"));
        assertEquals(100, out.get("balance"));
        assertFalse(out.containsKey("userId"));
        assertFalse(out.containsKey("userType"));
        assertFalse(out.containsKey("walletId"));
    }

    @Test
    void theRouteExtractsTheNumberAndTakesTheStructuredSlot() {
        PayWalletTransactionTools.TransactionRoute route = new PayWalletTransactionTools.TransactionRoute();

        assertEquals("get_my_pay_wallet_transaction", route.toolName());
        assertEquals("W-9", route.args(Map.of("message", "查一下流水号 W-9")).get("transactionNo"));
        assertEquals("777", route.args(Map.of("targetId", "777")).get("transactionNo"),
                "with no words naming an identifier, the structured slot is the only one left");
    }

    @Test
    void theRouteStillNamesTheTool() {
        PayWalletTransactionTools.TransactionRoute route = new PayWalletTransactionTools.TransactionRoute();

        assertTrue(route.triggers().contains("钱包流水"));
        assertTrue(route.triggers().contains("流水号"));
        assertTrue(route.args(Map.of("message", "你好")).isEmpty(),
                "no identifier means no arguments, not a guessed one");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_my_pay_wallet_transaction", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(1, tool.parameters().size());
        assertEquals("transactionNo", tool.parameters().get(0).name());
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PayWalletTransactionDO transaction() {
        PayWalletTransactionDO transaction = new PayWalletTransactionDO();
        transaction.setId(500L);
        transaction.setNo("W-1");
        transaction.setWalletId(9L);
        transaction.setBizType(10);
        transaction.setBizId("1000");
        transaction.setTitle("钱包余额充值");
        transaction.setPrice(-20);
        transaction.setBalance(100);
        transaction.setCreateTime(LocalDateTime.of(2026, 11, 3, 9, 0));
        return transaction;
    }
}
