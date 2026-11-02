// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.transfer.PayTransferDO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 转账单切面的五件事：**工具路径上别人的行交回 null**、**属主两列为 null 的行不算调用方的**、**同号会员那一行算别人**、
 * **请求路径一字不动**、**分页在工具路径上被拒绝**。
 *
 * <p>Five things the transfer aspect does: on the tool path another's row comes back as {@code null}, a row with null
 * owner columns is not the caller's either, the same number in the member namespace is another person, the request path
 * is left untouched, and the page is refused on the tool path.
 */
class PayTransferGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayTransferGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new PayTransferGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void anotherUsersTransferIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(transfer(7L, UserTypeEnum.ADMIN.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransfer(call)),
                "the row answers the same way whether it belongs to someone else or does not exist");
    }

    @Test
    void theSameNumberInTheMemberNamespaceIsAnotherPerson() throws Throwable {
        when(call.proceed()).thenReturn(transfer(CALLER_ID, UserTypeEnum.MEMBER.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransfer(call)),
                "the two user-id namespaces collide; only the administrator one is the caller's");
    }

    @Test
    void aTransferWithoutAnOwnerIsWithheldFromTheToolPath() throws Throwable {
        when(call.proceed()).thenReturn(transfer(null, null));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersTransfer(call)),
                "a tool path may not hand out a row it cannot attribute");
    }

    @Test
    void theCallersOwnTransferIsHandedBack() throws Throwable {
        PayTransferDO own = transfer(CALLER_ID, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(own);

        assertSame(own, inCaller(CALLER, () -> aspect.withholdOthersTransfer(call)));
    }

    @Test
    void theRequestPathReadsAnyTransferTheConsoleAskedFor() throws Throwable {
        PayTransferDO other = transfer(7L, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(other);

        assertSame(other, aspect.withholdOthersTransfer(call),
                "with no acting caller this is the console path and the module's own permission decides");
    }

    @Test
    void thePageIsRefusedOnTheToolPathBecauseItHasNoOwnerSlot() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getTransferPage");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refusePageOnTheToolPath(call)));
        verify(call, never()).proceed();
    }

    @Test
    void thePageIsLeftAloneOnTheRequestPath() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.refusePageOnTheToolPath(call));
        verify(call).proceed();
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getTransfer");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.withholdOthersTransfer(call)));
    }

    @Test
    void theModuleDeclaresItselfAndTheOwnerPair() {
        assertEquals("pay", aspect.module());
        assertEquals("user_id", aspect.ownerField(),
                "the pair user_id + user_type; userName/userAccount are the payee, not the owner");
    }

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

    private static PayTransferDO transfer(Long userId, Integer userType) {
        PayTransferDO transfer = new PayTransferDO();
        transfer.setId(1L);
        transfer.setNo("T-1");
        transfer.setUserId(userId);
        transfer.setUserType(userType);
        transfer.setStatus(10);
        transfer.setPrice(100);
        return transfer;
    }

    @FunctionalInterface
    private interface Thrower<T> {
        T run() throws Throwable;
    }
}
