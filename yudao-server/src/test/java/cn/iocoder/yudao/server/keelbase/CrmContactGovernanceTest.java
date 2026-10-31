// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.contact.CrmContactDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 联系人切面的四条进门路径各收一次，外加联系人这一片**特有的**两条按客户判的路：分页补上「只看本人的」、按 id 读按
 * **联系人自己**的权限表交回、按 id 写只认负责人、创建时属主盖章且只挂在读得到的客户下。
 *
 * <p>为什么读要单列两条：模块自己有两条例外（公海＝没有任何权限行、孤儿＝有行却没有负责人），本切面**照抄**它们 ——
 * 不抄就是把「页面上看得到」变成「助手看不到」，而抄错方向就是把公海关起来。这里的用例把这三档分开钉住。
 *
 * <p>为什么另有两问按**客户**判：上游只有 `getContactPageByCustomerId` 与 `getContactListByCustomerId` 把权限行写在
 * 客户上，其余都写在联系人上。这个分叉是读上游代码读出来的，不是「联系人挂在客户下面」推出来的，故它必须有自己的一条
 * 断言，免得下一次改写把两边合成一边。
 *
 * <p>切面在这里直接调用，不经 Spring AOP；要证的是这段通知做了什么，注解有没有生效由上下文测试与真栈门禁管。
 *
 * Four doors into the contact rows, one test each, plus the two customer-scoped paths this object has and the
 * others do not. The read has two cases of its own because the module has two exceptions (public sea = no
 * permission rows, orphaned = rows without an owner) and this aspect copies them. Two more cases pin the
 * customer-level judgement: upstream writes the permission row on the customer for exactly
 * `getContactPageByCustomerId` and `getContactListByCustomerId`, and the create check reads the customer too — a
 * split read from upstream's code, not derived from "contacts hang under customers".
 */
class CrmContactGovernanceTest {

    private static final long CALLER = 42L;
    private static final long CONTACT = 7L;
    private static final long CUSTOMER = 5L;

    private YudaoModuleScope scope;
    private CrmPermissionService permissions;
    private CrmContactGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        permissions = mock(CrmPermissionService.class);
        aspect = new CrmContactGovernance(scope, permissions);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
        when(scope.creatingCaller()).thenReturn(CALLER);
    }

    @Test
    void thePageGetsOwnRowsOnlyWhenNoSceneWasNamed() throws Throwable {
        CrmContactPageReqVO query = new CrmContactPageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.narrowToCaller(call));
        assertEquals(CrmSceneTypeEnum.OWNER.getType(), query.getSceneType(),
                "upstream's default is every row, so the scene has to be supplied");
    }

    @Test
    void aSceneTheCallerNamedIsLeftAlone() throws Throwable {
        CrmContactPageReqVO query = new CrmContactPageReqVO();
        query.setSceneType(CrmSceneTypeEnum.INVOLVED.getType());
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");

        aspect.narrowToCaller(call);

        assertEquals(CrmSceneTypeEnum.INVOLVED.getType(), query.getSceneType(),
                "the participants' view was asked for explicitly and must survive the advice");
    }

    @Test
    void withNoCallerNothingIsTouched() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        when(scope.creatingCaller()).thenReturn(null);
        CrmContactPageReqVO query = new CrmContactPageReqVO();
        when(call.getArgs()).thenReturn(new Object[]{query, CALLER});
        when(call.proceed()).thenReturn("page");
        CrmContactDO row = contact(CONTACT);
        ProceedingJoinPoint read = mock(ProceedingJoinPoint.class);
        when(read.proceed()).thenReturn(row);

        aspect.narrowToCaller(call);
        assertNull(query.getSceneType(), "a REST request keeps the module's own handling");
        assertSame(row, aspect.withholdOthersRow(read), "a caller that needs no holding keeps the row");
    }

    @Test
    void anothersContactIsHandedBackAsNothing() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTACT.getType(), CONTACT))
                .thenReturn(List.of(ownerRow(99L)));
        CrmContactDO row = contact(CONTACT);
        when(call.proceed()).thenReturn(row);

        assertNull(aspect.withholdOthersRow(call), "not yours answers the way not-there answers");
    }

    @Test
    void aContactWithNoPermissionRowsStaysReadableLikeTheModulesPublicSea() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTACT.getType(), CONTACT))
                .thenReturn(List.of());
        CrmContactDO row = contact(CONTACT);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "public sea is the module's own READ rule");
    }

    @Test
    void aParticipantCanReadButAnOwnerIsRequiredToWriteEveryNamedRow() throws Throwable {
        CrmPermissionDO participant = permission(CALLER, CrmPermissionLevelEnum.READ);
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTACT.getType(), CONTACT))
                .thenReturn(List.of(ownerRow(99L), participant));
        CrmContactDO row = contact(CONTACT);
        when(call.proceed()).thenReturn(row);

        assertSame(row, aspect.withholdOthersRow(call), "a participant may read");

        CrmContactSaveReqVO update = new CrmContactSaveReqVO();
        update.setId(CONTACT);
        when(call.getArgs()).thenReturn(new Object[]{update});
        org.aspectj.lang.Signature updateSignature = signature("updateContact");
        when(call.getSignature()).thenReturn(updateSignature);

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "a write is owner-only, stricter than the module's WRITE level");

        // A bulk follow-up names several ids: one of them being someone else's is enough to refuse. The caller
        // owns the first one, so the refusal can only come from the second.
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTACT.getType(), CONTACT))
                .thenReturn(List.of(ownerRow(CALLER)));
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CONTACT.getType(), 8L))
                .thenReturn(List.of(ownerRow(99L)));
        when(call.getArgs()).thenReturn(new Object[]{List.of(CONTACT, 8L)});
        org.aspectj.lang.Signature bulkSignature = signature("updateContactContactNextTime");
        when(call.getSignature()).thenReturn(bulkSignature);

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call),
                "every id of a bulk write is asked the same question");
    }

    @Test
    void theOwnerIsStampedFromTheCallerBeforeValidation() throws Throwable {
        CrmContactSaveReqVO create = new CrmContactSaveReqVO();
        create.setOwnerUserId(99L);
        create.setCustomerId(CUSTOMER);
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CUSTOMER.getType(), CUSTOMER))
                .thenReturn(List.of());
        when(call.getArgs()).thenReturn(new Object[]{create, 99L});
        when(call.proceed()).thenReturn(1L);

        aspect.stampOwner(call);

        assertEquals(CALLER, create.getOwnerUserId(), "a client may not name someone else as owner");
    }

    @Test
    void contactsOfOneCustomerAreAnsweredFromThatCustomersRows() throws Throwable {
        // The customer's rows say 99 owns it — the caller is not on them, so the customer's contacts are nothing.
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CUSTOMER.getType(), CUSTOMER))
                .thenReturn(List.of(ownerRow(99L)));

        CrmContactPageReqVO query = new CrmContactPageReqVO();
        query.setCustomerId(CUSTOMER);
        when(call.getArgs()).thenReturn(new Object[]{query});
        Object page = aspect.withholdOtherCustomersContacts(call);
        assertTrue(page instanceof PageResult<?> empty && empty.getList().isEmpty(),
                "an unreadable customer answers with an empty page, the way a customer with no contacts would");

        when(call.getArgs()).thenReturn(new Object[]{CUSTOMER});
        assertEquals(List.of(), aspect.withholdOtherCustomersContacts(call));

        // The customer-scoped write is the customer's OWNER question, not the contact's.
        org.aspectj.lang.Signature reownSignature = signature("updateOwnerUserIdByCustomerId");
        when(call.getSignature()).thenReturn(reownSignature);
        when(call.getArgs()).thenReturn(new Object[]{CUSTOMER, 9L});
        assertThrows(RuleDeniedException.class, () -> aspect.requireCustomerOwnership(call),
                "re-owning a customer's contacts is the customer owner's call");
    }

    @Test
    void aContactMayOnlyHangFromACustomerTheCallerCanRead() throws Throwable {
        when(permissions.getPermissionListByBiz(CrmBizTypeEnum.CRM_CUSTOMER.getType(), CUSTOMER))
                .thenReturn(List.of(ownerRow(99L)));
        CrmContactSaveReqVO create = new CrmContactSaveReqVO();
        create.setName("张三");
        create.setCustomerId(CUSTOMER);
        when(call.getArgs()).thenReturn(new Object[]{create, CALLER});

        assertThrows(RuleDeniedException.class, () -> aspect.stampOwner(call),
                "upstream only checks that the customer exists; a contact may not hang from one the caller"
                        + " cannot see");
        assertEquals(CALLER, create.getOwnerUserId(), "the stamp happens before the refusal");
    }

    private static org.aspectj.lang.Signature signature(String name) {
        org.aspectj.lang.Signature signature = mock(org.aspectj.lang.Signature.class);
        when(signature.getName()).thenReturn(name);
        return signature;
    }

    private static CrmPermissionDO ownerRow(Long userId) {
        return permission(userId, CrmPermissionLevelEnum.OWNER);
    }

    private static CrmPermissionDO permission(Long userId, CrmPermissionLevelEnum level) {
        CrmPermissionDO row = new CrmPermissionDO();
        row.setUserId(userId);
        row.setLevel(level.getLevel());
        return row;
    }

    private static CrmContactDO contact(Long id) {
        CrmContactDO row = new CrmContactDO();
        row.setId(id);
        return row;
    }
}
