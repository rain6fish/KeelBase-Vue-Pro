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
import cn.iocoder.yudao.module.pay.dal.dataobject.refund.PayRefundDO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 退款单切面的五件事：**工具路径上别人的行交回 null**、**属主两列为 null 的行不算调用方的**、**同号会员那一行算别人**、
 * **请求路径一字不动**、**分页与导出列表在工具路径上被拒绝**。
 *
 * <p>Five things the refund aspect does: on the tool path another's row comes back as {@code null}, a row with null
 * owner columns is not the caller's either, the same number in the member namespace is another person, the request path
 * is left untouched, and the page and the export list are refused on the tool path.
 */
class PayRefundGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayRefundGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new PayRefundGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void anotherUsersRefundIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(refund(7L, UserTypeEnum.ADMIN.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRefund(call)),
                "the row answers the same way whether it belongs to someone else or does not exist");
    }

    @Test
    void theSameNumberInTheMemberNamespaceIsAnotherPerson() throws Throwable {
        when(call.proceed()).thenReturn(refund(CALLER_ID, UserTypeEnum.MEMBER.getValue()));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRefund(call)),
                "the two user-id namespaces collide; only the administrator one is the caller's");
    }

    @Test
    void aRefundWithoutAnOwnerIsWithheldFromTheToolPath() throws Throwable {
        when(call.proceed()).thenReturn(refund(null, null));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRefund(call)),
                "a tool path may not hand out a row it cannot attribute");
    }

    @Test
    void theCallersOwnRefundIsHandedBack() throws Throwable {
        PayRefundDO own = refund(CALLER_ID, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(own);

        assertSame(own, inCaller(CALLER, () -> aspect.withholdOthersRefund(call)));
    }

    @Test
    void theRequestPathReadsAnyRefundTheConsoleAskedFor() throws Throwable {
        PayRefundDO other = refund(7L, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(other);

        assertSame(other, aspect.withholdOthersRefund(call),
                "with no acting caller this is the console path and the module's own permission decides");
    }

    @Test
    void thePageIsRefusedOnTheToolPathBecauseItHasNoOwnerSlot() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getRefundPage");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseManyRowsOnTheToolPath(call)));
        verify(call, never()).proceed();
    }

    @Test
    void theExportListIsRefusedOnTheToolPath() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getRefundList");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseManyRowsOnTheToolPath(call)));
    }

    @Test
    void thePageIsLeftAloneOnTheRequestPath() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.refuseManyRowsOnTheToolPath(call));
        verify(call).proceed();
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getRefund");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.withholdOthersRefund(call)));
    }

    @Test
    void theModuleDeclaresItselfAndTheOwnerPair() {
        assertEquals("pay", aspect.module());
        assertEquals("user_id", aspect.ownerField(),
                "the first half of the pair; the second half (user_type) is stated in the class comment");
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

    private static PayRefundDO refund(Long userId, Integer userType) {
        PayRefundDO refund = new PayRefundDO();
        refund.setId(1L);
        refund.setNo("R-1");
        refund.setOrderNo("P-1");
        refund.setUserId(userId);
        refund.setUserType(userType);
        refund.setStatus(10);
        refund.setPayPrice(100);
        refund.setRefundPrice(20);
        return refund;
    }

    @FunctionalInterface
    private interface Thrower<T> {
        T run() throws Throwable;
    }
}
