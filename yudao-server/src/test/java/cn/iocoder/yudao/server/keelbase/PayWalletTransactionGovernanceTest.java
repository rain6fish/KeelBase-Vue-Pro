// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletTransactionDO;
import cn.iocoder.yudao.module.pay.dal.mysql.wallet.PayWalletMapper;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 钱包流水切面的五件事：**工具路径上别人的流水交回 null**（属主沿 `wallet_id` 走一跳）、**同号会员也算别人**、
 * **钱包读不回来的行同样不交**、**分页与统计在工具路径上被拒绝**、**请求路径一字不动**，以及**指不出本地用户时拒绝**。
 *
 * <p>Five things the wallet-transaction aspect does: hand back {@code null} for another person's flow on the tool path
 * (the owner is one hop away through {@code wallet_id}), treat the same number in the member namespace as another
 * person, withhold a row whose wallet cannot be read back, refuse the page and the summary on the tool path, leave the
 * request path untouched, and refuse rather than guess when no local user id can be named.
 */
class PayWalletTransactionGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayWalletMapper wallets;
    private PayWalletTransactionGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        wallets = mock(PayWalletMapper.class);
        aspect = new PayWalletTransactionGovernance(wallets);
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void anotherUsersTransactionIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(transaction(9L));
        when(wallets.selectById(9L)).thenReturn(wallet(7L, UserTypeEnum.ADMIN.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransaction(call)));
    }

    @Test
    void theSameNumberInTheMemberNamespaceIsAnotherPerson() throws Throwable {
        when(call.proceed()).thenReturn(transaction(9L));
        when(wallets.selectById(9L)).thenReturn(wallet(CALLER_ID, UserTypeEnum.MEMBER.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransaction(call)),
                "the two user-id namespaces collide; only the administrator one is the caller's");
    }

    @Test
    void theCallersOwnTransactionIsHandedBack() throws Throwable {
        PayWalletTransactionDO mine = transaction(9L);
        when(call.proceed()).thenReturn(mine);
        when(wallets.selectById(9L)).thenReturn(wallet(CALLER_ID, UserTypeEnum.ADMIN.getValue()));

        assertSame(mine, inCaller(CALLER, () -> aspect.withholdOthersTransaction(call)));
    }

    @Test
    void aTransactionWhoseWalletCannotBeReadBackIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(transaction(9L));
        when(wallets.selectById(9L)).thenReturn(null);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransaction(call)),
                "a tool path may not hand out a row it cannot attribute");
    }

    @Test
    void aTransactionWithNoWalletIdIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(transaction(null));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransaction(call)));
        verify(wallets, never()).selectById(any());
    }

    @Test
    void theRequestPathReadsAnyTransactionTheConsoleAskedFor() throws Throwable {
        PayWalletTransactionDO other = transaction(9L);
        when(call.proceed()).thenReturn(other);
        when(wallets.selectById(9L)).thenReturn(wallet(7L, UserTypeEnum.MEMBER.getValue()));

        assertSame(other, aspect.withholdOthersTransaction(call),
                "with no acting caller this is the console path and the module's own permission decides");
    }

    @Test
    void thePageIsRefusedOnTheToolPath() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getWalletTransactionPage");
        when(call.getSignature()).thenReturn(signature);

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseManyRowsOnTheToolPath(call)));
        assertEquals("PayWalletTransaction", refused.subject());
        assertEquals("getWalletTransactionPage", refused.action());
        verifyNoProceed();
    }

    @Test
    void theSummaryIsRefusedOnTheToolPath() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getWalletTransactionSummary");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseManyRowsOnTheToolPath(call)));
        verifyNoProceed();
    }

    @Test
    void theRequestPathPageProceeds() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.refuseManyRowsOnTheToolPath(call));
        verify(call).proceed();
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getWalletTransactionByNo");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.withholdOthersTransaction(call)));
    }

    @Test
    void theModuleDeclaresItselfAndTheColumnThatLeadsToTheOwner() {
        assertEquals("pay", aspect.module());
        assertEquals("wallet_id", aspect.ownerField(),
                "the row carries wallet_id; the owner pair is one hop away on pay_wallet");
    }

    private void verifyNoProceed() {
        try {
            verify(call, never()).proceed();
        } catch (Throwable unexpected) {
            throw new IllegalStateException(unexpected);
        }
    }

    /** Runs an advice with a published acting caller, the way the tool path does. */
    private static <T> T inCaller(String caller, Thrower<T> advice) {
        return ActingCaller.as(caller, () -> {
            try {
                return advice.run();
            } catch (RuntimeException refused) {
                throw refused;
            } catch (Throwable other) {
                throw new RuntimeException(other);
            }
        });
    }

    private static PayWalletTransactionDO transaction(Long walletId) {
        PayWalletTransactionDO transaction = new PayWalletTransactionDO();
        transaction.setId(500L);
        transaction.setNo("W-500");
        transaction.setWalletId(walletId);
        transaction.setPrice(-20);
        transaction.setBalance(100);
        return transaction;
    }

    private static PayWalletDO wallet(long userId, int userType) {
        PayWalletDO wallet = new PayWalletDO();
        wallet.setId(9L);
        wallet.setUserId(userId);
        wallet.setUserType(userType);
        return wallet;
    }

    @FunctionalInterface
    private interface Thrower<T> {
        T run() throws Throwable;
    }
}
