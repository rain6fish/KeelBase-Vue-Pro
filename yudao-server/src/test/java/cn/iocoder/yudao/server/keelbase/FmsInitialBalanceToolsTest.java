// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.fms.controller.admin.config.vo.initialbalance.FmsTrialBalanceRespVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import cn.iocoder.yudao.module.fms.service.config.FmsInitialBalanceService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 期初余额工具面的三件事：**账套由宿主自己解析**（默认优先、其次第一个），**不属于任何账套时不编一个编号去问**，
 * 以及**出口投影不带账套编号**。
 *
 * <p>Three things the opening-balance face does: resolve the account set itself (default first, else the first
 * membership), answer "not a member" instead of inventing an account-set number, and keep that number out of the
 * projection.
 */
class FmsInitialBalanceToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsInitialBalanceService service;
    private FmsAccountUserService accountUsers;
    private FmsInitialBalanceTools.TrialBalanceTool tool;

    @BeforeEach
    void setUp() {
        service = mock(FmsInitialBalanceService.class);
        accountUsers = mock(FmsAccountUserService.class);
        tool = new FmsInitialBalanceTools.TrialBalanceTool(service, accountUsers);
    }

    @Test
    void theReadUsesTheCallersDefaultAccountSet() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(
                membership(7L, false), membership(8L, true)));
        when(service.getTrialBalance(8L, CALLER_ID)).thenReturn(trialBalance());

        ToolResult result = tool.execute(Map.of(), caller());

        assertTrue(result.success());
        verify(service).getTrialBalance(eq(8L), eq(CALLER_ID));
    }

    @Test
    void theFirstMembershipIsUsedWhenNoneIsDefault() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(
                membership(7L, false), membership(8L, false)));
        when(service.getTrialBalance(7L, CALLER_ID)).thenReturn(trialBalance());

        assertTrue(tool.execute(Map.of(), caller()).success());

        verify(service).getTrialBalance(eq(7L), eq(CALLER_ID));
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
        when(service.getTrialBalance(8L, CALLER_ID)).thenReturn(trialBalance());

        ToolResult result = tool.execute(Map.of(), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("openingDebitAmount", "openingCreditAmount", "openingDifferenceAmount",
                        "yearDebitAmount", "yearCreditAmount", "yearDifferenceAmount", "balanced"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — the account set must not reappear");
        assertEquals(0, new BigDecimal("1500.00").compareTo((BigDecimal) out.get("openingDebitAmount")));
        assertEquals(Boolean.FALSE, out.get("balanced"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_fms_trial_balance", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertTrue(tool.parameters().isEmpty(), "the read takes no argument the model may name");
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

    private static FmsTrialBalanceRespVO trialBalance() {
        FmsTrialBalanceRespVO trial = new FmsTrialBalanceRespVO();
        trial.setOpeningDebitAmount(new BigDecimal("1500.00"));
        trial.setOpeningCreditAmount(new BigDecimal("1400.00"));
        trial.setOpeningDifferenceAmount(new BigDecimal("100.00"));
        trial.setYearDebitAmount(new BigDecimal("200.00"));
        trial.setYearCreditAmount(new BigDecimal("200.00"));
        trial.setYearDifferenceAmount(BigDecimal.ZERO);
        trial.setBalanced(false);
        return trial;
    }
}
