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
import cn.iocoder.yudao.module.fms.controller.admin.ledger.vo.FmsLedgerListReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.ledger.vo.subjectbalance.FmsLedgerSubjectBalanceRespVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.FmsReportItemRespVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.FmsReportListReqVO;
import cn.iocoder.yudao.module.fms.controller.admin.report.vo.balance.FmsBalanceSheetRowRespVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.config.FmsAccountUserDO;
import cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService;
import cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService;
import cn.iocoder.yudao.module.fms.service.ledger.FmsLedgerService;
import cn.iocoder.yudao.module.fms.service.report.FmsBalanceSheetService;
import cn.iocoder.yudao.module.fms.service.report.FmsCashFlowStatementService;
import cn.iocoder.yudao.module.fms.service.report.FmsIncomeStatementService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 读数面工具面的四件事：**账套由宿主自己解析**（默认优先、其次第一个），**期间缺省取模块的当前期间、只给一个就补成
 * 同一个期间**，**出口投影只留报表与余额本身**（不带编号、公式与账套），以及**科目余额表按 `limit` 截断并明说**。
 *
 * <p>Four things the reading face does: resolve the account set itself (default first, else the first
 * membership), default a missing period to the module's current one and complete a single period to a
 * monthly report, keep only the statement and balances in the projection (no ids, formulas or account set),
 * and truncate the subject-balance table at {@code limit} while saying so.
 */
class FmsReportingToolsTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private FmsBalanceSheetService balanceSheetService;
    private FmsIncomeStatementService incomeStatementService;
    private FmsCashFlowStatementService cashFlowService;
    private FmsLedgerService ledgerService;
    private FmsAccountUserService accountUsers;
    private FmsClosingPeriodService closing;

    private FmsReportingTools.BalanceSheetTool balanceSheet;
    private FmsReportingTools.IncomeStatementTool incomeStatement;
    private FmsReportingTools.CashFlowStatementTool cashFlow;
    private FmsReportingTools.SubjectBalancesTool subjectBalances;

    @BeforeEach
    void setUp() {
        balanceSheetService = mock(FmsBalanceSheetService.class);
        incomeStatementService = mock(FmsIncomeStatementService.class);
        cashFlowService = mock(FmsCashFlowStatementService.class);
        ledgerService = mock(FmsLedgerService.class);
        accountUsers = mock(FmsAccountUserService.class);
        closing = mock(FmsClosingPeriodService.class);
        balanceSheet = new FmsReportingTools.BalanceSheetTool(balanceSheetService, accountUsers, closing);
        incomeStatement = new FmsReportingTools.IncomeStatementTool(
                incomeStatementService, accountUsers, closing);
        cashFlow = new FmsReportingTools.CashFlowStatementTool(cashFlowService, accountUsers, closing);
        subjectBalances = new FmsReportingTools.SubjectBalancesTool(ledgerService, accountUsers, closing);
    }

    @Test
    void theBalanceSheetUsesTheCallersDefaultAccountSetAndTheGivenRange() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(
                membership(7L, false), membership(8L, true)));
        when(balanceSheetService.getBalanceSheet(any(), eq(CALLER_ID))).thenReturn(List.of());

        ToolResult result = balanceSheet.execute(
                Map.of("startMonth", "2026-01", "endMonth", "2026-06"), caller());

        assertTrue(result.success());
        FmsReportListReqVO query = reportQueryOf();
        assertEquals(8L, query.getAccountSetId(), "the default membership is the caller's account set");
        assertEquals("2026-01", query.getStartMonth());
        assertEquals("2026-06", query.getEndMonth());
    }

    @Test
    void aMissingPeriodBecomesTheModulesCurrentPeriod() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        when(closing.getCurrentMonth(8L, CALLER_ID)).thenReturn("2026-08");
        when(balanceSheetService.getBalanceSheet(any(), eq(CALLER_ID))).thenReturn(List.of());

        assertTrue(balanceSheet.execute(Map.of(), caller()).success());

        FmsReportListReqVO query = reportQueryOf();
        assertEquals("2026-08", query.getStartMonth());
        assertEquals("2026-08", query.getEndMonth(), "no period in the words means a monthly report");
    }

    @Test
    void onePeriodIsCompletedToAMonthlyReport() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        when(closing.getCurrentMonth(8L, CALLER_ID)).thenReturn("2026-08");
        when(balanceSheetService.getBalanceSheet(any(), eq(CALLER_ID))).thenReturn(List.of());

        balanceSheet.execute(Map.of("startMonth", "2026-02"), caller());

        FmsReportListReqVO query = reportQueryOf();
        assertEquals("2026-02", query.getStartMonth());
        assertEquals("2026-08", query.getEndMonth(),
                "the missing end is the module's current period, not a guess");
    }

    @Test
    void aCallerWithNoMembershipIsAnsweredRatherThanGuessed() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of());

        ToolResult result = balanceSheet.execute(Map.of(), caller());

        assertTrue(result.success());
        assertEquals(Map.of("accountSetMember", false), result.data());
        verifyNoInteractions(balanceSheetService, incomeStatementService, cashFlowService, ledgerService);
    }

    @Test
    void anIllFormedMonthIsRefusedBeforeTheModuleParsesIt() {
        ToolResult result = balanceSheet.execute(Map.of("startMonth", "2026-13"), caller());

        assertFalse(result.success());
        assertEquals("months must look like YYYY-MM", result.error());
        verifyNoInteractions(balanceSheetService);
    }

    @Test
    void aReversedRangeIsRefusedBeforeItReachesTheModule() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));

        ToolResult result = balanceSheet.execute(
                Map.of("startMonth", "2026-09", "endMonth", "2026-08"), caller());

        assertFalse(result.success());
        assertEquals("startMonth must not be after endMonth", result.error());
        verifyNoInteractions(balanceSheetService);
    }

    @Test
    void theBalanceSheetProjectionCarriesNeitherIdsNorFormulas() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        FmsBalanceSheetRowRespVO row = new FmsBalanceSheetRowRespVO();
        row.setRowId(1);
        row.setAssetId(11L);
        row.setAssetName("货币资金");
        row.setAssetRowNo(1);
        row.setAssetOpeningAmount(new BigDecimal("100.00"));
        row.setAssetClosingAmount(new BigDecimal("200.00"));
        row.setAssetFormula("[{\"secret\":true}]");
        row.setLiabilityName("短期借款");
        row.setLiabilityRowNo(31);
        when(balanceSheetService.getBalanceSheet(any(), eq(CALLER_ID))).thenReturn(List.of(row));

        ToolResult result = balanceSheet.execute(
                Map.of("startMonth", "2026-08", "endMonth", "2026-08"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) out.get("rows");
        assertEquals(List.of("assetName", "assetRowNo", "assetOpeningAmount", "assetClosingAmount",
                        "liabilityName", "liabilityRowNo", "liabilityOpeningAmount", "liabilityClosingAmount"),
                List.copyOf(rows.get(0).keySet()),
                "the projection is the whole allow-list — ids, formulas and levels stay behind");
        assertEquals("货币资金", rows.get(0).get("assetName"));
        assertEquals(new BigDecimal("200.00"), rows.get(0).get("assetClosingAmount"));
    }

    @Test
    void theIncomeStatementProjectsOnlyTheBusinessFact() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        FmsReportItemRespVO item = new FmsReportItemRespVO();
        item.setId(99L);
        item.setName("营业收入");
        item.setRowNo(1);
        item.setCurrentAmount(new BigDecimal("10.00"));
        item.setYearAmount(new BigDecimal("120.00"));
        item.setFormula("[{\"secret\":true}]");
        when(incomeStatementService.getIncomeStatement(any(), eq(CALLER_ID))).thenReturn(List.of(item));

        ToolResult result = incomeStatement.execute(
                Map.of("startMonth", "2026-08", "endMonth", "2026-08"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(List.of("name", "rowNo", "currentAmount", "yearAmount"),
                List.copyOf(items.get(0).keySet()));
        assertEquals("营业收入", items.get(0).get("name"));
    }

    @Test
    void theCashFlowStatementProjectsOnlyTheBusinessFact() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        FmsReportItemRespVO item = new FmsReportItemRespVO();
        item.setId(99L);
        item.setName("经营活动产生的现金流量净额");
        item.setRowNo(9);
        item.setCurrentAmount(new BigDecimal("50.00"));
        item.setYearAmount(new BigDecimal("500.00"));
        item.setFormula("[{\"secret\":true}]");
        when(cashFlowService.getCashFlowStatement(any(), eq(CALLER_ID))).thenReturn(List.of(item));

        ToolResult result = cashFlow.execute(
                Map.of("startMonth", "2026-08", "endMonth", "2026-08"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(List.of("name", "rowNo", "currentAmount", "yearAmount"),
                List.copyOf(items.get(0).keySet()));
    }

    @Test
    void theSubjectBalancesFlattenTheTreeAndTruncateAtTheLimit() {
        when(accountUsers.getAccountUserList(CALLER_ID)).thenReturn(List.of(membership(8L, true)));
        FmsLedgerSubjectBalanceRespVO child = balance("1002", "银行存款", 2, null);
        FmsLedgerSubjectBalanceRespVO root = balance("1001", "库存现金", 1, child);
        FmsLedgerSubjectBalanceRespVO other = balance("2202", "应付账款", 1, null);
        when(ledgerService.getSubjectBalanceList(any(), eq(CALLER_ID)))
                .thenReturn(List.of(root, other));

        ToolResult result = subjectBalances.execute(Map.of(
                "startMonth", "2026-08", "endMonth", "2026-08", "limit", 2), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(Boolean.TRUE, out.get("truncated"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) out.get("rows");
        assertEquals(2, rows.size());
        assertEquals("1001", rows.get(0).get("subjectCode"), "pre-order: the parent comes first");
        assertEquals("1002", rows.get(1).get("subjectCode"), "then its child");
        assertEquals(List.of("nodeType", "subjectCode", "subjectName", "level", "openingDebitAmount",
                        "openingCreditAmount", "periodDebitAmount", "periodCreditAmount", "yearDebitAmount",
                        "yearCreditAmount", "endingDebitAmount", "endingCreditAmount", "endingBalanceDirection"),
                List.copyOf(rows.get(0).keySet()),
                "the projection is the whole allow-list — ids, node keys and children stay behind");
    }

    @Test
    void anIllFormedLimitIsRefused() {
        ToolResult result = subjectBalances.execute(Map.of("limit", "many"), caller());

        assertFalse(result.success());
        assertEquals("limit must be a positive integer", result.error());
        verifyNoInteractions(ledgerService);
    }

    @Test
    void theRoutesReadMonthsOutOfTheText() {
        assertEquals(Map.of("startMonth", "2026-09", "endMonth", "2026-09"),
                new FmsReportingTools.BalanceSheetRoute().args(Map.of("message", "看看 2026-09 的资产负债表")));
        assertEquals(Map.of("startMonth", "2026-01", "endMonth", "2026-06"),
                new FmsReportingTools.IncomeStatementRoute().args(
                        Map.of("message", "2026-01 到 2026-06 的利润表")));
        assertEquals(Map.of("startMonth", "2026-10", "endMonth", "2026-10"),
                new FmsReportingTools.CashFlowStatementRoute().args(
                        Map.of("message", "2026年10月的现金流量表")));
        assertTrue(new FmsReportingTools.SubjectBalancesRoute().args(
                        Map.of("message", "科目余额表")).isEmpty(),
                "no period means the tool asks the module for its current one");
    }

    @Test
    void eachFaceDeclaresItsContract() {
        assertEquals("get_fms_balance_sheet", balanceSheet.name());
        assertEquals("get_fms_income_statement", incomeStatement.name());
        assertEquals("get_fms_cash_flow_statement", cashFlow.name());
        assertEquals("get_fms_subject_balances", subjectBalances.name());
        assertEquals("R1", balanceSheet.riskLevel());
        assertEquals("R1", incomeStatement.riskLevel());
        assertEquals("R1", cashFlow.riskLevel());
        assertEquals("R1", subjectBalances.riskLevel());
        assertEquals(2, balanceSheet.parameters().size());
        assertEquals(2, incomeStatement.parameters().size());
        assertEquals(2, cashFlow.parameters().size());
        assertEquals(3, subjectBalances.parameters().size(), "the balance table additionally takes a limit");
        assertEquals("get_fms_balance_sheet", new FmsReportingTools.BalanceSheetRoute().toolName());
        assertEquals("get_fms_income_statement", new FmsReportingTools.IncomeStatementRoute().toolName());
        assertEquals("get_fms_cash_flow_statement", new FmsReportingTools.CashFlowStatementRoute().toolName());
        assertEquals("get_fms_subject_balances", new FmsReportingTools.SubjectBalancesRoute().toolName());
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

    private static FmsLedgerSubjectBalanceRespVO balance(String code, String name, int level,
            FmsLedgerSubjectBalanceRespVO child) {
        FmsLedgerSubjectBalanceRespVO node = new FmsLedgerSubjectBalanceRespVO()
                .setNodeType(FmsLedgerSubjectBalanceRespVO.NODE_TYPE_SUBJECT)
                .setSubjectCode(code).setSubjectName(name).setLevel(level)
                .setEndingDebitAmount(BigDecimal.ZERO).setEndingCreditAmount(BigDecimal.ZERO);
        if (child != null) {
            node.getChildren().add(child);
        }
        return node;
    }

    private FmsReportListReqVO reportQueryOf() {
        ArgumentCaptor<FmsReportListReqVO> captor = ArgumentCaptor.forClass(FmsReportListReqVO.class);
        try {
            verify(balanceSheetService).getBalanceSheet(captor.capture(), eq(CALLER_ID));
        } catch (Throwable impossibleForAMock) {
            throw new AssertionError(impossibleForAMock);
        }
        return captor.getValue();
    }
}
