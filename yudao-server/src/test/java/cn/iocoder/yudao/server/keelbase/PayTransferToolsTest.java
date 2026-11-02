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
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.transfer.PayTransferDO;
import cn.iocoder.yudao.module.pay.service.transfer.PayTransferService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 转账单工具面的五件事：**按转账单号读**、**按编号读**、**两个标识都不给就拒绝且不碰数据**、**没读到就答没有**，
 * 以及**投影只给业务事实、不带身份与收款账号**。
 *
 * <p>Five things the transfer face does: read by transfer number, read by id, refuse without touching data when
 * neither identifier is given, answer "none" when nothing was found, and project business facts without identity or
 * payee account columns.
 */
class PayTransferToolsTest {

    private static final String CALLER = "42";

    private PayTransferService service;
    private PayTransferTools.TransferTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PayTransferService.class);
        tool = new PayTransferTools.TransferTool(service);
    }

    @Test
    void theReadTakesTheTransferNumberTheCallerNamed() {
        when(service.getTransferByNo("T-1")).thenReturn(transfer());

        assertTrue(tool.execute(Map.of("transferNo", "T-1"), caller()).success());
        verify(service).getTransferByNo("T-1");
    }

    @Test
    void theReadTakesTheTransferIdTheCallerNamed() {
        when(service.getTransfer(1L)).thenReturn(transfer());

        assertTrue(tool.execute(Map.of("transferId", "1"), caller()).success());
        verify(service).getTransfer(1L);
    }

    @Test
    void aTransferThatIsNotThereIsAnsweredRatherThanGuessed() {
        when(service.getTransferByNo("T-missing")).thenReturn(null);

        ToolResult result = tool.execute(Map.of("transferNo", "T-missing"), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasTransfer", false), result.data(),
                "another's row and a missing row answer the same way");
    }

    @Test
    void withoutAnIdentifierNothingIsRead() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give a transfer number (transferNo) or a transfer id (transferId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheBusinessFactAndNoIdentity() {
        when(service.getTransferByNo("T-1")).thenReturn(transfer());

        ToolResult result = tool.execute(Map.of("transferNo", "T-1"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasTransfer", "transferId", "transferNo", "status", "price", "subject", "channelCode",
                        "createTime"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity and the payee account must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasTransfer"));
        assertEquals(1L, out.get("transferId"));
        assertEquals("T-1", out.get("transferNo"));
        assertEquals(10, out.get("status"));
        assertEquals(100, out.get("price"));
        assertEquals("佣金", out.get("subject"));
        assertEquals("wx_app", out.get("channelCode"));
        assertEquals("2026-11-02T14:10:00", out.get("createTime"));
        assertFalse(out.containsKey("userId"));
        assertFalse(out.containsKey("userType"));
        assertFalse(out.containsKey("userName"));
        assertFalse(out.containsKey("userAccount"));
        assertFalse(out.containsKey("userIp"));
        assertFalse(out.containsKey("channelExtras"));
        assertFalse(out.containsKey("appId"));
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("transferNo", "T-1"), new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theRouteExtractsTheIdentifierAndTheStructuredSlot() {
        PayTransferTools.TransferRoute route = new PayTransferTools.TransferRoute();

        assertEquals("get_my_pay_transfer", route.toolName());
        assertTrue(route.triggers().contains("转账单状态"));
        assertEquals(Map.of("transferNo", "T-GATE1"),
                route.args(Map.of("message", "查一下转账单 T-GATE1 的状态")),
                "the typed identifier is the row the question names");
        assertEquals(Map.of("transferId", 9L), route.args(Map.of("targetId", 9L)),
                "a row the runtime resolved arrives on the one generic structured slot");
        assertTrue(route.args(Map.of("message", "转账状态怎么样")).isEmpty(),
                "no identifier means the tool refuses instead of guessing a row");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_my_pay_transfer", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(List.of("transferNo", "transferId"),
                tool.parameters().stream().map(p -> p.name()).toList(),
                "the model may name an identifier, never a person");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PayTransferDO transfer() {
        PayTransferDO transfer = new PayTransferDO();
        transfer.setId(1L);
        transfer.setNo("T-1");
        transfer.setUserId(42L);
        transfer.setUserType(UserTypeEnum.ADMIN.getValue());
        transfer.setStatus(10);
        transfer.setPrice(100);
        transfer.setSubject("佣金");
        transfer.setChannelCode("wx_app");
        transfer.setCreateTime(LocalDateTime.of(2026, 11, 2, 14, 10, 0));
        return transfer;
    }
}
