// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.pay.controller.admin.wallet.vo.wallet.PayWalletPageReqVO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import cn.iocoder.yudao.module.pay.service.wallet.PayWalletService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 钱包工具面的四件事：**只问调用方自己在管理端命名空间里的那一个**、**没有钱包就答没有而不去建**、
 * **投影带编号与四个金额、不带身份**，以及**没有本地调用方时不做任何数据访问**。
 *
 * <p>Four things the wallet face does: ask only for the caller's own wallet in the administrator namespace, answer
 * "none" instead of creating one, project the number and four amounts without an identity, and touch no data when no
 * local caller can be named.
 */
class PayWalletToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayWalletService service;
    private PayWalletTools.WalletTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PayWalletService.class);
        tool = new PayWalletTools.WalletTool(service);
    }

    @Test
    void theReadAsksForTheCallersOwnWalletInTheAdminNamespace() {
        when(service.getWalletPage(any())).thenReturn(new PageResult<>(List.of(wallet()), 1L));

        assertTrue(tool.execute(Map.of(), caller()).success());

        PayWalletPageReqVO query = queryOf();
        assertEquals(CALLER_ID, query.getUserId());
        assertEquals(UserTypeEnum.ADMIN.getValue(), query.getUserType(),
                "the member namespace is not the console caller's to read");
        assertEquals(1, query.getPageNo());
        assertEquals(1, query.getPageSize(), "one person has at most one wallet");
    }

    @Test
    void aCallerWithNoWalletIsAnsweredRatherThanCreated() {
        when(service.getWalletPage(any())).thenReturn(new PageResult<>(List.of(), 0L));

        ToolResult result = tool.execute(Map.of(), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasWallet", false), result.data());
    }

    @Test
    void theProjectionCarriesTheIdAndTheAmountsButNoIdentity() {
        when(service.getWalletPage(any())).thenReturn(new PageResult<>(List.of(wallet()), 1L));

        ToolResult result = tool.execute(Map.of(), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasWallet", "walletId", "balance", "freezePrice", "totalExpense", "totalRecharge"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasWallet"));
        assertEquals(1L, out.get("walletId"));
        assertEquals(100, out.get("balance"));
        assertFalse(out.containsKey("userId"));
        assertFalse(out.containsKey("userType"));
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of(), new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theRouteDeclaresItsTriggersAndNoArguments() {
        PayWalletTools.WalletRoute route = new PayWalletTools.WalletRoute();

        assertEquals("get_my_pay_wallet", route.toolName());
        assertTrue(route.triggers().contains("我的钱包"));
        assertTrue(route.args(Map.of("message", "我的钱包还剩多少钱")).isEmpty(),
                "the subject is the acting caller, not a person the words can name");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_my_pay_wallet", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertTrue(tool.parameters().isEmpty(),
                "a subject the model can name would turn 'mine' into 'number 42's'");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PayWalletDO wallet() {
        PayWalletDO wallet = new PayWalletDO();
        wallet.setId(1L);
        wallet.setUserId(CALLER_ID);
        wallet.setUserType(UserTypeEnum.ADMIN.getValue());
        wallet.setBalance(100);
        wallet.setFreezePrice(0);
        wallet.setTotalExpense(20);
        wallet.setTotalRecharge(120);
        return wallet;
    }

    private PayWalletPageReqVO queryOf() {
        ArgumentCaptor<PayWalletPageReqVO> captor = ArgumentCaptor.forClass(PayWalletPageReqVO.class);
        verify(service).getWalletPage(captor.capture());
        return captor.getValue();
    }
}
