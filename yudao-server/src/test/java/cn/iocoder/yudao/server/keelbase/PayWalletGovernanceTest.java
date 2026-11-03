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
import cn.iocoder.yudao.module.pay.controller.admin.wallet.vo.wallet.PayWalletPageReqVO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 钱包切面的四件事：**工具路径上分页的两个属主字段被钉成「行动调用方 + 管理员」**、**请求路径一字不动**、
 * **按 id 读别人的钱包交回 null**（同号不同命名空间也算别人）、以及**指不出本地用户时拒绝而不是猜**。
 *
 * <p>Four things the wallet aspect does: pin both owner fields of the page to "the acting caller + administrator"
 * on the tool path, leave the request path untouched, hand back {@code null} for another person's wallet read by id
 * (the same number in the other namespace is another person too), and refuse rather than guess when no local user
 * id can be named.
 */
class PayWalletGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayWalletGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new PayWalletGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void thePageIsHeldToTheCallerEvenWhenItNamesSomeoneElse() throws Throwable {
        PayWalletPageReqVO query = new PayWalletPageReqVO();
        query.setUserId(7L);
        query.setUserType(UserTypeEnum.MEMBER.getValue());
        when(call.getArgs()).thenReturn(new Object[]{query});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", inCaller(CALLER,
                () -> aspect.holdThePageToTheCaller(call)));

        assertEquals(CALLER_ID, query.getUserId(),
                "a user id the path carried cannot widen what the caller sees");
        assertEquals(UserTypeEnum.ADMIN.getValue(), query.getUserType(),
                "the host's AI callers are console users; the member namespace is not theirs to read");
    }

    @Test
    void theRequestPathIsLeftAlone() throws Throwable {
        PayWalletPageReqVO query = new PayWalletPageReqVO();
        query.setUserId(7L);
        when(call.getArgs()).thenReturn(new Object[]{query});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.holdThePageToTheCaller(call));

        assertEquals(7L, query.getUserId(), "the console's own request keeps its filter");
        verify(call).proceed();
        verify(call, never()).proceed(any(Object[].class));
    }

    @Test
    void anotherUsersWalletIsWithheld() throws Throwable {
        PayWalletDO wallet = wallet(7L, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(wallet);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersWallet(call)));
    }

    @Test
    void theSameNumberInTheMemberNamespaceIsAnotherPerson() throws Throwable {
        PayWalletDO wallet = wallet(CALLER_ID, UserTypeEnum.MEMBER.getValue());
        when(call.proceed()).thenReturn(wallet);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersWallet(call)),
                "the two user-id namespaces collide; only the administrator one is the caller's");
    }

    @Test
    void theCallersOwnWalletIsHandedBack() throws Throwable {
        PayWalletDO wallet = wallet(CALLER_ID, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(wallet);

        assertSame(wallet, inCaller(CALLER, () -> aspect.withholdOthersWallet(call)));
    }

    @Test
    void theRequestPathReadsAnyWalletTheConsoleAskedFor() throws Throwable {
        PayWalletDO wallet = wallet(7L, UserTypeEnum.MEMBER.getValue());
        when(call.proceed()).thenReturn(wallet);

        assertSame(wallet, aspect.withholdOthersWallet(call),
                "with no acting caller this is the console path and the module's own permission decides");
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getWalletPage");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.holdThePageToTheCaller(call)));
    }

    @Test
    void theModuleDeclaresItselfAndTheOwnerPair() {
        assertEquals("pay", aspect.module());
        assertEquals("user_id", aspect.ownerField(),
                "the first half of the pair; the second half (user_type) is stated in the class comment");
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

    private static PayWalletDO wallet(long userId, int userType) {
        PayWalletDO wallet = new PayWalletDO();
        wallet.setId(1L);
        wallet.setUserId(userId);
        wallet.setUserType(userType);
        wallet.setBalance(100);
        return wallet;
    }

    @FunctionalInterface
    private interface Thrower<T> {
        T run() throws Throwable;
    }
}
