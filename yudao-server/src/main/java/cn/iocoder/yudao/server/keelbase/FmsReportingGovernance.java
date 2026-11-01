// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * FMS 读数面的接缝：三张财务报表（资产负债、利润、现金流量）与账簿的科目余额表。四个对象共用一条通知，
 * 因为它们回答的是同一个问题——**这一次，模块自己不持有可按人收窄的行，它按账套授权**。
 *
 * <p><b>四问的答案，逐对象读出来。** ① 三张报表**确实持有自己的行**：`fms_balance_sheet_config` /
 * `fms_balance_sheet_report`、`fms_income_statement_config` / `_report`、`fms_cash_flow_statement_config` /
 * `_report` 与 `fms_cash_flow_extend_*`，且一次「读」会在配置或期间快照缺失时惰性创建它们
 * （`FmsBalanceSheetServiceImpl:394-453`、`FmsIncomeStatementServiceImpl:228-288`）；但这些行是**按账套物化的
 * 报表配置与期间快照**，没有「某个人」这一列。账簿与报表共用服务 `FmsLedgerService` 同理不持有业务行，它从凭证、
 * 期初余额与科目实时计算。② 五个读入口都把 `accountSetId` 与 `userId` 收在入参里，并在方法体第一段调
 * `validateAccountSetReadPermission`（`FmsBalanceSheetServiceImpl:117`、`FmsIncomeStatementServiceImpl:90`、
 * `FmsCashFlowStatementServiceImpl:126`、`FmsLedgerServiceImpl:396` 与 `:1366`）；报表共用服务
 * `FmsReportCommonService` 不自己判权，它唯一的取数口 `getSubjectBalanceMap` 转调账簿
 * （`FmsReportCommonServiceImpl:94`），判权在账簿那一侧。③ 三张报表**有真写**：公式更新（`updateBalanceSheetFormula`
 * / `updateIncomeStatementFormula` / `updateCashFlowStatement` / `updateCashFlowAdjustment` /
 * `updateCashFlowAdjustmentFormula`），都先 `validateAccountSetWritePermission`，REST 上另叠 `fms:report:*:update`；
 * 账簿没有写。④ AI 需要的读是**报表与余额本身**——这是人问「这个月的资产负债表」时它该直接取到的业务事实。
 *
 * <p>**声明的收窄：切面与模块相等，不更严也不更宽。** 同一个账套判权、同一个 `userId`，只是这个 `userId` 由切面钉住；
 * 更窄的是**工具面**：它只解析调用方**默认（其次第一个）**账套，而模块本身答得出调用方所属的每一个账套——那句收窄
 * 写在 {@link FmsReportingTools} 的类注释里。三张报表的写与账簿的其它读法（明细账、总账、多栏账、辅助与数量账）
 * **不在点切里**：本面不为它们声明工具，写是会计在控制台里改公式与人工调整金额的事，别的读法也没有需要收的路径。
 *
 * <p>**为什么这只保证身份、不改结果。** 模块的读已经按账套收窄；报表行没有第二个人可冒充的属主字段，改写查询或
 * 过滤结果只会把模块自己的口径弄丢。与结账期间同一种判断：切面欠的只是「模块判权时问的是正在行动的那个人」。
 *
 * FMS's seam over the reading surfaces: the three statements (balance sheet, income statement, cash flow)
 * and the ledger's subject-balance table. Four objects share one advice because they answer the same
 * question — **here the module holds no row that can be narrowed per person; it authorises by account set**.
 *
 * <p><b>The four answers, read object by object.</b> (1) The statements **do** hold rows of their own
 * (`fms_balance_sheet_config` / `_report`, `fms_income_statement_config` / `_report`,
 * `fms_cash_flow_statement_config` / `_report` and `fms_cash_flow_extend_*`), and a "read" lazily creates
 * them when the configuration or a period snapshot is missing (`FmsBalanceSheetServiceImpl:394-453`,
 * `FmsIncomeStatementServiceImpl:228-288`); but those rows are **per-account-set report configuration and
 * period snapshots** with no "person" column. The ledger service holds no business row either: it computes
 * from vouchers, opening balances and subjects. (2) All five read entries take `accountSetId` and
 * `userId` as arguments and call `validateAccountSetReadPermission` in their first block
 * (`FmsBalanceSheetServiceImpl:117`, `FmsIncomeStatementServiceImpl:90`,
 * `FmsCashFlowStatementServiceImpl:126`, `FmsLedgerServiceImpl:396` and `:1366`); the shared report
 * service `FmsReportCommonService` does not check permission itself — its only data port,
 * `getSubjectBalanceMap`, delegates to the ledger (`FmsReportCommonServiceImpl:94`), where the check
 * lives. (3) The statements **do have real writes**: formula updates and cash-flow manual adjustments,
 * each guarded by `validateAccountSetWritePermission` and, on REST, by `fms:report:*:update`; the ledger
 * has none. (4) What the AI needs to read is **the statement and the balances themselves** — the business
 * fact behind "show me this month's balance sheet".
 *
 * <p><b>Declared narrowing: the advice is equal to the module — no stricter, no wider.</b> Same account-set
 * check, same `userId`; only the `userId` is pinned by the advice. The narrower half is the **tool face**:
 * it resolves only the caller's **default (else first)** account set, while the module itself answers for
 * every account set the caller belongs to — that sentence lives in {@link FmsReportingTools}'s class
 * comment. The statements' writes and the ledger's other reads (detail, general, multi-column, auxiliary
 * and quantity ledgers) are **not in the pointcuts**: this face declares no tools for them — editing
 * formulas and manual amounts belongs to an accountant in the console, and no path needs narrowing.
 *
 * <p><b>Why this guarantees identity and leaves the result alone.</b> The module's reads already narrow by
 * account set, and a report row has no second owner field anyone could forge; rewriting the query or
 * filtering the result would only lose the module's own semantics. The same judgement as the closing
 * period: what the advice owes is "the module checks the person who is acting".
 */
@Aspect
@Component
public class FmsReportingGovernance implements GovernedModule {

    /**
     * There is no owner column here: the module authorises by **account set**, through its own
     * {@code fms_account_user} table. Naming that is the answer rather than leaving the field blank.
     *
     * 这里没有属主列：模块按**账套**授权，凭它自己的 `fms_account_user` 表。把这一点说出来本身就是答案。
     */
    @Override
    public String ownerField() {
        return "none (the module's own account-set permission)";
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "fms";
    }

    /**
     * The five read entries this face's tools use, each held to the acting caller when a tool published
     * one. The {@code userId} is the **last** argument of every one of them. A report's own internal calls
     * go through these same beans, so on the tool path they see the same caller — which is the point;
     * on the request path {@code ActingCaller} is empty and they pass through untouched.
     *
     * 本面工具用到的五个读入口，在**有工具发布了调用方**时各自被钉到行动调用方上。五个的 `userId` 都是
     * **最后一个**实参。报表内部的取数也走同样的 bean，故工具路径上它们看到的是同一个人——这正是目的；
     * 请求路径上 `ActingCaller` 为空，原样放行。
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.report.FmsBalanceSheetService.getBalanceSheet(..))"
            + " || execution(* cn.iocoder.yudao.module.fms.service.report.FmsIncomeStatementService.getIncomeStatement(..))"
            + " || execution(* cn.iocoder.yudao.module.fms.service.report.FmsCashFlowStatementService.getCashFlowStatement(..))"
            + " || execution(* cn.iocoder.yudao.module.fms.service.ledger.FmsLedgerService.getSubjectBalanceList(..))")
    public Object pinCallerToTheModule(ProceedingJoinPoint call) throws Throwable {
        String caller = ActingCaller.current();
        if (caller == null) {
            // The host's own request path: the controller has already named the login user.
            // 宿主自己的请求路径：controller 已经点名了登录用户。
            return call.proceed();
        }
        Long acting = asId(caller);
        if (acting == null) {
            // 有行动调用方却指不出本地用户编号：拒绝。判据读不出来不放行——与 `YudaoToolPermissions` 同一条纪律。
            // An acting caller whose id is not a local user is refused: a check that cannot be read does not
            // become permission, the same discipline as `YudaoToolPermissions`.
            throw new RuleDeniedException(null,
                    "not permitted: the acting caller is not a local user id",
                    "FmsReporting", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
        Object[] args = call.getArgs();
        if (args.length == 0 || !(args[args.length - 1] instanceof Long)) {
            // 没有 userId 的重载不属于本面（今天五个入口都收 userId）；原样放行，绝不把内部调用弄坏。
            // An overload without a userId is not this face's; let it through rather than break an internal call.
            return call.proceed();
        }
        Object[] pinned = args.clone();
        pinned[pinned.length - 1] = acting;
        return call.proceed(pinned);
    }

    private static Long asId(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
