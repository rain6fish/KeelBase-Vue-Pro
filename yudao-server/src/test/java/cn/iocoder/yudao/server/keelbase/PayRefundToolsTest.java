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
import cn.iocoder.yudao.module.pay.dal.dataobject.refund.PayRefundDO;
import cn.iocoder.yudao.module.pay.service.refund.PayRefundService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 退款单工具面的五件事：**按退款单号读**、**按编号读**、**两个标识都不给就拒绝且不碰数据**、**没读到就答没有**，
 * 以及**投影只给业务事实、不带任何身份列**。
 *
 * <p>Five things the refund face does: read by refund number, read by id, refuse without touching data when neither
 * identifier is given, answer "none" when nothing was found, and project business facts without any identity column.
 */
class PayRefundToolsTest {

    private static final String CALLER = "42";

    private PayRefundService service;
    private PayRefundTools.RefundTool tool;

    @BeforeEach
    void setUp() {
        service = mock(PayRefundService.class);
        tool = new PayRefundTools.RefundTool(service);
    }

    @Test
    void theReadTakesTheRefundNumberTheCallerNamed() {
        when(service.getRefundByNo("R-1")).thenReturn(refund());

        assertTrue(tool.execute(Map.of("refundNo", "R-1"), caller()).success());
        verify(service).getRefundByNo("R-1");
    }

    @Test
    void theReadTakesTheRefundIdTheCallerNamed() {
        when(service.getRefund(1L)).thenReturn(refund());

        assertTrue(tool.execute(Map.of("refundId", "1"), caller()).success());
        verify(service).getRefund(1L);
    }

    @Test
    void aRefundThatIsNotThereIsAnsweredRatherThanGuessed() {
        when(service.getRefundByNo("R-missing")).thenReturn(null);

        ToolResult result = tool.execute(Map.of("refundNo", "R-missing"), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasRefund", false), result.data(),
                "another's row and a missing row answer the same way");
    }

    @Test
    void withoutAnIdentifierNothingIsRead() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give a refund number (refundNo) or a refund id (refundId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheBusinessFactAndNoIdentity() {
        when(service.getRefundByNo("R-1")).thenReturn(refund());

        ToolResult result = tool.execute(Map.of("refundNo", "R-1"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasRefund", "refundId", "refundNo", "orderNo", "status", "payPrice", "refundPrice",
                        "channelCode", "createTime"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasRefund"));
        assertEquals(1L, out.get("refundId"));
        assertEquals("R-1", out.get("refundNo"));
        assertEquals("P-1", out.get("orderNo"));
        assertEquals(10, out.get("status"));
        assertEquals(100, out.get("payPrice"));
        assertEquals(20, out.get("refundPrice"));
        assertEquals("wx_app", out.get("channelCode"));
        assertEquals("2026-11-02T14:05:00", out.get("createTime"));
        assertFalse(out.containsKey("userId"));
        assertFalse(out.containsKey("userType"));
        assertFalse(out.containsKey("userIp"));
        assertFalse(out.containsKey("reason"));
        assertFalse(out.containsKey("appId"));
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("refundNo", "R-1"), new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theRouteExtractsTheIdentifierAndTheStructuredSlot() {
        PayRefundTools.RefundRoute route = new PayRefundTools.RefundRoute();

        assertEquals("get_my_pay_refund", route.toolName());
        assertTrue(route.triggers().contains("退款单状态"));
        assertEquals(Map.of("refundNo", "R-GATE1"),
                route.args(Map.of("message", "查一下退款单 R-GATE1 的状态")),
                "the typed identifier is the row the question names");
        assertEquals(Map.of("refundId", 9L), route.args(Map.of("targetId", 9L)),
                "a row the runtime resolved arrives on the one generic structured slot");
        assertTrue(route.args(Map.of("message", "退款状态怎么样")).isEmpty(),
                "no identifier means the tool refuses instead of guessing a row");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_my_pay_refund", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(List.of("refundNo", "refundId"),
                tool.parameters().stream().map(p -> p.name()).toList(),
                "the model may name an identifier, never a person");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static PayRefundDO refund() {
        PayRefundDO refund = new PayRefundDO();
        refund.setId(1L);
        refund.setNo("R-1");
        refund.setOrderNo("P-1");
        refund.setUserId(42L);
        refund.setUserType(UserTypeEnum.ADMIN.getValue());
        refund.setStatus(10);
        refund.setPayPrice(100);
        refund.setRefundPrice(20);
        refund.setChannelCode("wx_app");
        refund.setCreateTime(LocalDateTime.of(2026, 11, 2, 14, 5, 0));
        return refund;
    }
}
