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
import cn.iocoder.yudao.module.pay.dal.dataobject.order.PayOrderDO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 支付单切面的五件事：**工具路径上别人的行交回 null**（编号与支付单号两条重载都算）、**属主两列为 null 的历史行同样
 * 不算调用方的**、**同号会员那一行算别人**、**请求路径一字不动**、**分页与批量读在工具路径上被拒绝而不是事后过滤**。
 *
 * <p>Five things the payment-order aspect does: on the tool path another's row comes back as {@code null} (both the
 * id and the number overload), a legacy row with null owner columns is not the caller's either, the same number in the
 * member namespace is another person, the request path is left untouched, and the page and the bulk read are refused
 * on the tool path rather than post-filtered.
 */
class PayOrderGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;

    private PayOrderGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        aspect = new PayOrderGovernance();
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void anotherUsersOrderIsWithheldByIdAndByNumber() throws Throwable {
        PayOrderDO order = order(7L, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(order);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersOrder(call)),
                "the row answers the same way whether it belongs to someone else or does not exist");
    }

    @Test
    void theSameNumberInTheMemberNamespaceIsAnotherPerson() throws Throwable {
        PayOrderDO order = order(CALLER_ID, UserTypeEnum.MEMBER.getValue());
        when(call.proceed()).thenReturn(order);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersOrder(call)),
                "the two user-id namespaces collide; only the administrator one is the caller's");
    }

    @Test
    void aLegacyOrderWithoutAnOwnerIsWithheldFromTheToolPath() throws Throwable {
        PayOrderDO order = order(null, null);
        when(call.proceed()).thenReturn(order);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersOrder(call)),
                "a tool path may not hand out a row it cannot attribute");
    }

    @Test
    void theCallersOwnOrderIsHandedBack() throws Throwable {
        PayOrderDO order = order(CALLER_ID, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(order);

        assertSame(order, inCaller(CALLER, () -> aspect.withholdOthersOrder(call)));
    }

    @Test
    void theRequestPathReadsAnyOrderTheConsoleAskedFor() throws Throwable {
        PayOrderDO order = order(7L, UserTypeEnum.ADMIN.getValue());
        when(call.proceed()).thenReturn(order);

        assertSame(order, aspect.withholdOthersOrder(call),
                "with no acting caller this is the console path and the module's own permission decides");
    }

    @Test
    void thePageIsRefusedOnTheToolPathBecauseItHasNoOwnerSlot() throws Throwable {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getOrderPage");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseManyRowsOnTheToolPath(call)));
        verify(call, never()).proceed();
    }

    @Test
    void thePageIsLeftAloneOnTheRequestPath() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.refuseManyRowsOnTheToolPath(call));
        verify(call).proceed();
    }

    @Test
    void theBulkReadIsRefusedOnTheToolPath() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getOrderList");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseManyRowsOnTheToolPath(call)));
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getOrder");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.withholdOthersOrder(call)));
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

    private static PayOrderDO order(Long userId, Integer userType) {
        PayOrderDO order = new PayOrderDO();
        order.setId(1L);
        order.setNo("P-1");
        order.setUserId(userId);
        order.setUserType(userType);
        order.setStatus(10);
        order.setPrice(100);
        return order;
    }

    @FunctionalInterface
    private interface Thrower<T> {
        T run() throws Throwable;
    }
}
