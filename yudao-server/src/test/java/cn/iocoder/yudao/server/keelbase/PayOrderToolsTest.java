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
import cn.iocoder.yudao.module.pay.dal.dataobject.order.PayOrderDO;
import cn.iocoder.yudao.module.pay.service.order.PayOrderService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 支付单工具面的五件事：**按支付单号读**、**按编号读**、**两个标识都不给就拒绝且不碰数据**、**没读到就答没有**，
 * 以及**投影只给业务事实、不带任何身份列**。
 *
 * <p>Five things the payment-order face does: read by order number, read by id, refuse without touching data when
 * neither identifier is given, answer "none" when nothing was found, and project business facts without any identity
 * column.
 */
class PayOrderToolsTest {

    private static final String CALLER = "42";

    private PayOrderService service;
    private PayOrderTools.OrderTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PayOrderService.class);
        tool = new PayOrderTools.OrderTool(service);
    }

    @Test
    void theReadTakesTheOrderNumberTheCallerNamed() {
        when(service.getOrder("P-1")).thenReturn(order());

        assertTrue(tool.execute(Map.of("orderNo", "P-1"), caller()).success());
        verify(service).getOrder("P-1");
    }

    @Test
    void theReadTakesTheOrderIdTheCallerNamed() {
        when(service.getOrder(1L)).thenReturn(order());

        assertTrue(tool.execute(Map.of("orderId", "1"), caller()).success());
        verify(service).getOrder(1L);
    }

    @Test
    void anOrderThatIsNotThereIsAnsweredRatherThanGuessed() {
        when(service.getOrder("P-missing")).thenReturn(null);

        ToolResult result = tool.execute(Map.of("orderNo", "P-missing"), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasOrder", false), result.data(),
                "another's row and a missing row answer the same way");
    }

    @Test
    void withoutAnIdentifierNothingIsRead() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give an order number (orderNo) or an order id (orderId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheBusinessFactAndNoIdentity() {
        when(service.getOrder("P-1")).thenReturn(order());

        ToolResult result = tool.execute(Map.of("orderNo", "P-1"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasOrder", "orderId", "orderNo", "status", "price", "refundPrice", "channelCode",
                        "createTime"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasOrder"));
        assertEquals(1L, out.get("orderId"));
        assertEquals("P-1", out.get("orderNo"));
        assertEquals(10, out.get("status"));
        assertEquals(100, out.get("price"));
        assertEquals(20, out.get("refundPrice"));
        assertEquals("wx_app", out.get("channelCode"));
        assertEquals("2026-11-02T13:45:00", out.get("createTime"));
        assertFalse(out.containsKey("userId"));
        assertFalse(out.containsKey("userType"));
        assertFalse(out.containsKey("userIp"));
        assertFalse(out.containsKey("channelUserId"));
        assertFalse(out.containsKey("appId"));
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("orderNo", "P-1"), new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theRouteExtractsTheIdentifierAndTheStructuredSlot() {
        PayOrderTools.OrderRoute route = new PayOrderTools.OrderRoute();

        assertEquals("get_my_pay_order", route.toolName());
        assertTrue(route.triggers().contains("支付单状态"));
        assertEquals(Map.of("orderNo", "P-GATE1"),
                route.args(Map.of("message", "查一下支付单 P-GATE1 的状态")),
                "the typed identifier is the row the question names");
        assertEquals(Map.of("orderId", 9L),
                route.args(Map.of("targetId", 9L)),
                "a row the runtime resolved arrives on the one generic structured slot");
        assertTrue(route.args(Map.of("message", "支付单状态怎么样")).isEmpty(),
                "no identifier means the tool refuses instead of guessing a row");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_my_pay_order", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(List.of("orderNo", "orderId"),
                tool.parameters().stream().map(p -> p.name()).toList(),
                "the model may name an identifier, never a person");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PayOrderDO order() {
        PayOrderDO order = new PayOrderDO();
        order.setId(1L);
        order.setNo("P-1");
        order.setUserId(42L);
        order.setUserType(UserTypeEnum.ADMIN.getValue());
        order.setStatus(10);
        order.setPrice(100);
        order.setRefundPrice(20);
        order.setChannelCode("wx_app");
        order.setCreateTime(LocalDateTime.of(2026, 11, 2, 13, 45, 0));
        return order;
    }
}
