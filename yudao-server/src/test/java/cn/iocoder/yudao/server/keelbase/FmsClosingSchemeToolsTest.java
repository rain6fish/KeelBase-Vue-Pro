// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingQueryReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingSchemeRespVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingSchemeService;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 结账方案工具面的五件事：**账套由宿主自己解析**（默认优先、其次第一个），**期间缺省取模块的当前期间**，
 * **不属于任何账套时不编一个编号去问**，**出口投影不带账套编号**，以及**类型码换成人读的名字**。
 *
 * <p>Five things the closing-scheme face does: resolve the account set itself (default first, else the first
 * membership), default the period to the module's current one, answer "not a member" instead of inventing an
 * account-set number, keep that number out of the projection, and turn the type code into a readable label.
 */
class FmsClosingSchemeToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsClosingSchemeService service;
    private FmsClosingPeriodService periods;
    private FmsAccountUserService accountUsers;
    private FmsClosingSchemeTools.ClosingSchemeTool tool;

    @BeforeEach
    void setUp() {
        service = mock(FmsClosingSchemeService.class);
        periods = mock(FmsClosingPeriodService.class);
        accountUsers = mock(FmsAccountUserService.class);
        tool = new FmsClosingSchemeTools.ClosingSchemeTool(service, periods, accountUsers);
    }

    @Test
    void theReadUsesTheCallersDefaultAccountSetAndTheGivenMonth() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(
                membership(7L, false), membership(8L, true)));
        when(service.getClosingSchemeList(any(), eq(CALLER_ID))).thenReturn(List.of(scheme(1, "120.00")));

        ToolResult result = tool.execute(Map.of("month", "2026-09"), caller());

        assertTrue(result.success());
        FmsClosingQueryReqVO query = queryOf();
        assertEquals(8L, query.getAccountSetId(), "the default membership is the caller's account set");
        assertEquals("2026-09", query.getMonth());
    }

    @Test
    void theMonthDefaultsToTheModulesCurrentPeriod() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        when(periods.getCurrentMonth(8L, CALLER_ID)).thenReturn("2026-08");
        when(service.getClosingSchemeList(any(), eq(CALLER_ID))).thenReturn(List.of());

        assertTrue(tool.execute(Map.of(), caller()).success());

        assertEquals("2026-08", queryOf().getMonth(),
                "no month in the words means the module's own current period");
    }

    @Test
    void aCallerWithNoMembershipIsAnsweredRatherThanGuessed() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of());

        ToolResult result = tool.execute(Map.of(), caller());

        assertTrue(result.success());
        assertEquals(Map.of("accountSetMember", false), result.data());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesNeitherTheAccountSetNorAnIdentity() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        when(service.getClosingSchemeList(any(), eq(CALLER_ID))).thenReturn(List.of(scheme(1, "120.00")));

        ToolResult result = tool.execute(Map.of("month", "2026-08"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("month", "schemes"), List.copyOf(out.keySet()),
                "the projection is the whole allow-list — the account set must not reappear");
        assertEquals("2026-08", out.get("month"));
        @SuppressWarnings("unchecked")
        Map<String, Object> one = ((List<Map<String, Object>>) out.get("schemes")).get(0);
        assertEquals(List.of("name", "type", "periodEnd", "balance", "voucherIds"), List.copyOf(one.keySet()));
        assertEquals("常规结账", one.get("type"), "the type code leaves as a readable label");
        assertEquals(List.of(101L), one.get("voucherIds"));
    }

    @Test
    void anIllFormedMonthIsRefusedBeforeTheModuleParsesIt() {
        ToolResult result = tool.execute(Map.of("month", "2026-13"), caller());

        assertFalse(result.success());
        assertEquals("month must look like YYYY-MM", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theRouteReadsTheMonthOutOfTheText() {
        assertEquals(Map.of("month", "2026-09"), new FmsClosingSchemeTools.ClosingSchemeRoute().args(
                Map.of("message", "看看 2026-09 要结转哪些方案")));
        assertEquals(Map.of("month", "2026-10"), new FmsClosingSchemeTools.ClosingSchemeRoute().args(
                Map.of("message", "会计期间=2026-10 的结转金额")));
    }

    @Test
    void aMessageWithoutAPeriodCarriesNoArguments() {
        assertTrue(new FmsClosingSchemeTools.ClosingSchemeRoute().args(
                        Map.of("message", "这个月要结转哪些方案")).isEmpty(),
                "no period means the tool asks the module for its current one");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_fms_closing_schemes", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(1, tool.parameters().size(), "the only argument is the optional month");
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static FmsAccountUserDO membership(long accountSetId, boolean isDefault) {
        FmsAccountUserDO member = new FmsAccountUserDO();
        member.setAccountSetId(accountSetId);
        member.setDefaultStatus(isDefault);
        return member;
    }

    private static FmsClosingSchemeRespVO scheme(int type, String balance) {
        FmsClosingSchemeRespVO respVO = new FmsClosingSchemeRespVO();
        respVO.setId(3L);
        respVO.setAccountSetId(8L);
        respVO.setName("结转本月房租");
        respVO.setType(type);
        respVO.setPeriodEnd(true);
        respVO.setBalance(new BigDecimal(balance));
        respVO.setVoucherIds(List.of(101L));
        return respVO;
    }

    private FmsClosingQueryReqVO queryOf() {
        ArgumentCaptor<FmsClosingQueryReqVO> captor = ArgumentCaptor.forClass(FmsClosingQueryReqVO.class);
        try {
            verify(service).getClosingSchemeList(captor.capture(), eq(CALLER_ID));
        } catch (Throwable impossibleForAMock) {
            throw new AssertionError(impossibleForAMock);
        }
        return captor.getValue();
    }
}
