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
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingOverviewRespVO;
import cn.iocoder.yudao.module.fms.controller.admin.closing.vo.FmsClosingQueryReqVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 结账期间工具面的四件事：**账套由宿主自己解析**（默认优先、其次第一个），**期间缺省取模块的当前期间**，
 * **不属于任何账套时不编一个编号去问**，以及**出口投影不带账套编号**。
 *
 * <p>Four things the closing-period face does: resolve the account set itself (default first, else the
 * first membership), default the period to the module's current one, answer "not a member" instead of
 * inventing an account-set number, and keep that number out of the projection.
 */
class FmsClosingPeriodToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsClosingPeriodService service;
    private FmsAccountUserService accountUsers;
    private FmsClosingPeriodTools.OverviewTool tool;

    @BeforeEach
    void setUp() {
        service = mock(FmsClosingPeriodService.class);
        accountUsers = mock(FmsAccountUserService.class);
        tool = new FmsClosingPeriodTools.OverviewTool(service, accountUsers);
    }

    @Test
    void theReadUsesTheCallersDefaultAccountSetAndTheGivenMonth() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(
                membership(7L, false), membership(8L, true)));
        when(service.getClosingOverview(any(), eq(CALLER_ID))).thenReturn(overview("2026-09"));

        ToolResult result = tool.execute(Map.of("month", "2026-09"), caller());

        assertTrue(result.success());
        FmsClosingQueryReqVO query = queryOf();
        assertEquals(8L, query.getAccountSetId(), "the default membership is the caller's account set");
        assertEquals("2026-09", query.getMonth());
    }

    @Test
    void theMonthDefaultsToTheModulesCurrentPeriod() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        when(service.getCurrentMonth(8L, CALLER_ID)).thenReturn("2026-08");
        when(service.getClosingOverview(any(), eq(CALLER_ID))).thenReturn(overview("2026-08"));

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
        when(service.getClosingOverview(any(), eq(CALLER_ID))).thenReturn(overview("2026-08"));

        ToolResult result = tool.execute(Map.of("month", "2026-08"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("month", "closed", "canClose", "voucherReviewRequired", "voucherCount",
                        "pendingVoucherCount", "profitLossBalance", "balanceSheetDifference",
                        "profitLossVoucherId", "initialBalanceBalanced", "voucherNumberContinuous",
                        "profitLossVoucherGenerated", "incomeStatementBalanced",
                        "incomeStatementUnmappedSubjectCount", "balanceSheetProfitLossTransferred",
                        "balanceSheetBalanced", "balanceSheetUnmappedSubjectCount"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — the account set must not reappear");
        assertEquals("2026-08", out.get("month"));
        assertEquals(Boolean.TRUE, out.get("canClose"));
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
        assertEquals(Map.of("month", "2026-09"), new FmsClosingPeriodTools.OverviewRoute().args(
                Map.of("message", "看看 2026-09 的结账概况")));
        assertEquals(Map.of("month", "2026-10"), new FmsClosingPeriodTools.OverviewRoute().args(
                Map.of("message", "会计期间=2026-10 能不能结账")));
    }

    @Test
    void aMessageWithoutAPeriodCarriesNoArguments() {
        assertTrue(new FmsClosingPeriodTools.OverviewRoute().args(
                        Map.of("message", "这个月能结账吗")).isEmpty(),
                "no period means the tool asks the module for its current one");
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_fms_closing_overview", tool.name());
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

    private static FmsClosingOverviewRespVO overview(String month) {
        return new FmsClosingOverviewRespVO()
                .setMonth(month)
                .setClosed(false)
                .setCanClose(true)
                .setVoucherReviewRequired(true)
                .setVoucherCount(3L)
                .setPendingVoucherCount(0L)
                .setProfitLossBalance(BigDecimal.ZERO)
                .setBalanceSheetDifference(BigDecimal.ZERO)
                .setProfitLossVoucherId(11L)
                .setInitialBalanceBalanced(true)
                .setVoucherNumberContinuous(true)
                .setProfitLossVoucherGenerated(true)
                .setIncomeStatementBalanced(true)
                .setIncomeStatementUnmappedSubjectCount(0)
                .setBalanceSheetProfitLossTransferred(true)
                .setBalanceSheetBalanced(true)
                .setBalanceSheetUnmappedSubjectCount(0);
    }

    private FmsClosingQueryReqVO queryOf() {
        ArgumentCaptor<FmsClosingQueryReqVO> captor = ArgumentCaptor.forClass(FmsClosingQueryReqVO.class);
        verify(service).getClosingOverview(captor.capture(), eq(CALLER_ID));
        return captor.getValue();
    }
}
