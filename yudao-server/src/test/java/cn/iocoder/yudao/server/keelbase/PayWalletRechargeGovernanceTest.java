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
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletRechargeDO;
import cn.iocoder.yudao.module.pay.dal.mysql.wallet.PayWalletMapper;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 充值单切面的五件事：**工具路径上别人的充值单交回 null**（属主沿 `wallet_id` 走一跳）、**同号会员也算别人**、
 * **钱包读不回来的行同样不交**、**分页在工具路径上被拒绝**、**请求路径一字不动**，以及**指不出本地用户时拒绝**。
 *
 * <p>Five things the recharge aspect does: hand back {@code null} for another person's recharge on the tool path
 * (the owner is one hop away through {@code wallet_id}), treat the same number in the member namespace as another
 * person, withhold a row whose wallet cannot be read back, refuse the page on the tool path, leave the request path
 * untouched, and refuse rather than guess when no local user id can be named.
 */
class PayWalletRechargeGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayWalletMapper wallets;
    private PayWalletRechargeGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        wallets = mock(PayWalletMapper.class);
        aspect = new PayWalletRechargeGovernance(wallets);
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void anotherUsersRechargeIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(recharge(9L));
        when(wallets.selectById(9L)).thenReturn(wallet(7L, UserTypeEnum.ADMIN.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecharge(call)));
    }

    @Test
    void theSameNumberInTheMemberNamespaceIsAnotherPerson() throws Throwable {
        when(call.proceed()).thenReturn(recharge(9L));
        when(wallets.selectById(9L)).thenReturn(wallet(CALLER_ID, UserTypeEnum.MEMBER.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecharge(call)),
                "the two user-id namespaces collide; only the administrator one is the caller's");
    }

    @Test
    void theCallersOwnRechargeIsHandedBack() throws Throwable {
        PayWalletRechargeDO mine = recharge(9L);
        when(call.proceed()).thenReturn(mine);
        when(wallets.selectById(9L)).thenReturn(wallet(CALLER_ID, UserTypeEnum.ADMIN.getValue()));

        assertSame(mine, inCaller(CALLER, () -> aspect.withholdOthersRecharge(call)));
    }

    @Test
    void aRechargeWhoseWalletCannotBeReadBackIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(recharge(9L));
        when(wallets.selectById(9L)).thenReturn(null);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecharge(call)),
                "a tool path may not hand out a row it cannot attribute");
    }

    @Test
    void aRechargeWithNoWalletIdIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(recharge(null));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecharge(call)));
        verify(wallets, never()).selectById(any());
    }

    @Test
    void theRequestPathReadsAnyRechargeTheConsoleAskedFor() throws Throwable {
        PayWalletRechargeDO other = recharge(9L);
        when(call.proceed()).thenReturn(other);
        when(wallets.selectById(9L)).thenReturn(wallet(7L, UserTypeEnum.MEMBER.getValue()));

        assertSame(other, aspect.withholdOthersRecharge(call),
                "with no acting caller this is the request path and the module's own permission decides");
    }

    @Test
    void thePageIsRefusedOnTheToolPath() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getWalletRechargePackagePage");
        when(call.getSignature()).thenReturn(signature);

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseThePageOnTheToolPath(call)));
        assertEquals("PayWalletRecharge", refused.subject());
        assertEquals("getWalletRechargePackagePage", refused.action());
        verifyNoProceed();
    }

    @Test
    void theRequestPathPageProceeds() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.refuseThePageOnTheToolPath(call));
        verify(call).proceed();
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getWalletRecharge");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.withholdOthersRecharge(call)));
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

    private static PayWalletRechargeDO recharge(Long walletId) {
        PayWalletRechargeDO recharge = new PayWalletRechargeDO();
        recharge.setId(600L);
        recharge.setWalletId(walletId);
        recharge.setTotalPrice(120);
        recharge.setPayPrice(100);
        recharge.setBonusPrice(20);
        return recharge;
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
