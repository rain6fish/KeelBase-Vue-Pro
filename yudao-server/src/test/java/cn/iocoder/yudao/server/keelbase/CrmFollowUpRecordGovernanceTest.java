// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.module.crm.controller.admin.followup.vo.CrmFollowUpRecordSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.followup.CrmFollowUpRecordDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmBizTypeEnum;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 跟进记录切面要做的事：**别人的记录交回 null**（属主沿 `biz_type + biz_id` 走一跳）、**公海与孤儿可读**、
 * **判不出业务行的行同样不交**、**分页在工具路径被拒绝**、**创建补上业务行的写权限**、**批量读逐行过滤**、
 * **请求路径一字不动**，以及**指不出本地用户时拒绝**。
 *
 * <p>What the follow-up-record aspect does: hand back {@code null} for another person's record (the owner is one hop
 * away through {@code biz_type + biz_id}), keep public-sea and orphaned business rows readable, withhold a row whose
 * business row cannot be named, refuse the page on the tool path, restore the business row's WRITE on create, filter
 * the bulk read row by row, leave the request path untouched, and refuse rather than guess when no local user id can
 * be named.
 */
class CrmFollowUpRecordGovernanceTest {

    private static final String CALLER = "42";
    private static final long CALLER_ID = 42L;
    private static final long OTHER_ID = 7L;
    private static final long BIZ_ID = 5564L;
    private static final int CUSTOMER = CrmBizTypeEnum.CRM_CUSTOMER.getType();

    private CrmPermissionService permissions;
    private CrmFollowUpRecordGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        permissions = mock(CrmPermissionService.class);
        aspect = new CrmFollowUpRecordGovernance(permissions);
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void anotherCallersRecordIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(record(BIZ_ID));
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(List.of(permission(OTHER_ID, CrmPermissionLevelEnum.OWNER)));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecord(call)));
    }

    @Test
    void aParticipantWithOnlyAReadRowMayReadTheRecord() throws Throwable {
        CrmFollowUpRecordDO mine = record(BIZ_ID);
        when(call.proceed()).thenReturn(mine);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(
                List.of(permission(OTHER_ID, CrmPermissionLevelEnum.OWNER), permission(CALLER_ID, CrmPermissionLevelEnum.READ)));

        assertSame(mine, inCaller(CALLER, () -> aspect.withholdOthersRecord(call)),
                "the module's READ rule lets any permission row read; the aspect copies it");
    }

    @Test
    void aPublicSeaBusinessRowIsReadable() throws Throwable {
        CrmFollowUpRecordDO mine = record(BIZ_ID);
        when(call.proceed()).thenReturn(mine);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(List.of());

        assertSame(mine, inCaller(CALLER, () -> aspect.withholdOthersRecord(call)),
                "the module lets everyone read a business row with no permission rows");
    }

    @Test
    void anOrphanedBusinessRowIsReadable() throws Throwable {
        CrmFollowUpRecordDO mine = record(BIZ_ID);
        when(call.proceed()).thenReturn(mine);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(
                List.of(permission(OTHER_ID, CrmPermissionLevelEnum.READ)));

        assertSame(mine, inCaller(CALLER, () -> aspect.withholdOthersRecord(call)),
                "no owner row means orphaned, which the module lets everyone read");
    }

    @Test
    void aRecordWithNoBusinessRowIsWithheld() throws Throwable {
        when(call.proceed()).thenReturn(record(null));

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecord(call)),
                "a tool path may not hand out a record it cannot attribute");
        verify(permissions, never()).getPermissionListByBiz(anyInt(), anyLong());
    }

    @Test
    void aMissingRecordStaysMissing() throws Throwable {
        when(call.proceed()).thenReturn(null);

        assertNull(inCaller(CALLER, () -> aspect.withholdOthersRecord(call)));
        verify(permissions, never()).getPermissionListByBiz(anyInt(), anyLong());
    }

    @Test
    void theRequestPathReadsAnyRecordTheConsoleAskedFor() throws Throwable {
        CrmFollowUpRecordDO other = record(BIZ_ID);
        when(call.proceed()).thenReturn(other);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(List.of(permission(OTHER_ID, CrmPermissionLevelEnum.OWNER)));

        assertSame(other, aspect.withholdOthersRecord(call),
                "with no acting caller this is the request path and the module's own permission decides");
    }

    @Test
    void thePageIsRefusedOnTheToolPath() {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn("getFollowUpRecordPage");
        when(call.getSignature()).thenReturn(signature);

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.refuseThePageOnTheToolPath(call)));
        assertEquals("CrmFollowUpRecord", refused.subject());
        assertEquals("getFollowUpRecordPage", refused.action());
        verifyNoProceed();
    }

    @Test
    void theRequestPathPageProceeds() throws Throwable {
        when(call.proceed()).thenReturn("page");

        assertEquals("page", aspect.refuseThePageOnTheToolPath(call));
        verify(call).proceed();
    }

    @Test
    void theBulkReadKeepsOnlyReadableRows() throws Throwable {
        CrmFollowUpRecordDO mine = record(BIZ_ID);
        CrmFollowUpRecordDO theirs = record(BIZ_ID);
        when(call.proceed()).thenReturn(List.of(mine, theirs));
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(List.of(permission(OTHER_ID, CrmPermissionLevelEnum.OWNER)));

        assertEquals(List.of(), inCaller(CALLER, () -> aspect.withholdOtherBizRecords(call)),
                "an unreadable business row's records are absent, the same shape as none at all");
    }

    @Test
    void theBulkReadPassesThroughOnTheRequestPath() throws Throwable {
        List<CrmFollowUpRecordDO> rows = List.of(record(BIZ_ID));
        when(call.proceed()).thenReturn(rows);

        assertSame(rows, aspect.withholdOtherBizRecords(call));
    }

    @Test
    void createIsRefusedWhenTheCallerOnlyHasAReadRow() {
        CrmFollowUpRecordSaveReqVO request = new CrmFollowUpRecordSaveReqVO();
        request.setBizType(CUSTOMER);
        request.setBizId(BIZ_ID);
        when(call.getArgs()).thenReturn(new Object[] {request});
        Signature signature = signatureNamed("createFollowUpRecord");
        when(call.getSignature()).thenReturn(signature);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(
                List.of(permission(OTHER_ID, CrmPermissionLevelEnum.OWNER), permission(CALLER_ID, CrmPermissionLevelEnum.READ)));

        RuleDeniedException refused = assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.requireWriteOnTheBiz(call)));
        assertEquals("CrmFollowUpRecord", refused.subject());
        verifyNoProceed();
    }

    @Test
    void createIsAllowedForTheOwnerAndForAWriter() throws Throwable {
        CrmFollowUpRecordSaveReqVO request = new CrmFollowUpRecordSaveReqVO();
        request.setBizType(CUSTOMER);
        request.setBizId(BIZ_ID);
        when(call.getArgs()).thenReturn(new Object[] {request});
        when(call.proceed()).thenReturn(9L);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(
                List.of(permission(CALLER_ID, CrmPermissionLevelEnum.OWNER)));

        assertEquals(9L, inCaller(CALLER, () -> aspect.requireWriteOnTheBiz(call)));

        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(
                List.of(permission(CALLER_ID, CrmPermissionLevelEnum.WRITE)));
        assertEquals(9L, inCaller(CALLER, () -> aspect.requireWriteOnTheBiz(call)));
    }

    @Test
    void createIsRefusedOnAPublicSeaBusinessRow() {
        CrmFollowUpRecordSaveReqVO request = new CrmFollowUpRecordSaveReqVO();
        request.setBizType(CUSTOMER);
        request.setBizId(BIZ_ID);
        when(call.getArgs()).thenReturn(new Object[] {request});
        Signature signature = signatureNamed("createFollowUpRecord");
        when(call.getSignature()).thenReturn(signature);
        when(permissions.getPermissionListByBiz(CUSTOMER, BIZ_ID)).thenReturn(List.of());

        assertThrows(RuleDeniedException.class,
                () -> inCaller(CALLER, () -> aspect.requireWriteOnTheBiz(call)),
                "the module denies any write above READ on a row with no permission rows");
    }

    @Test
    void anActingCallerThatIsNotALocalUserIdIsRefused() {
        Signature signature = signatureNamed("getFollowUpRecord");
        when(call.getSignature()).thenReturn(signature);

        assertThrows(RuleDeniedException.class,
                () -> inCaller("not-a-number", () -> aspect.withholdOthersRecord(call)));
    }

    @Test
    void theModuleDeclaresItselfAndTheColumnThatLeadsToTheOwner() {
        assertEquals("crm", aspect.module());
        assertEquals("biz_id", aspect.ownerField(),
                "the record carries no owner column; the owner is the row biz_id names");
    }

    private static Signature signatureNamed(String name) {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn(name);
        return signature;
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

    private static CrmFollowUpRecordDO record(Long bizId) {
        CrmFollowUpRecordDO record = new CrmFollowUpRecordDO();
        record.setId(600L);
        record.setBizType(bizId == null ? null : CUSTOMER);
        record.setBizId(bizId);
        record.setType(1);
        record.setContent("拜访");
        return record;
    }

    private static CrmPermissionDO permission(Long userId, CrmPermissionLevelEnum level) {
        CrmPermissionDO row = new CrmPermissionDO();
        row.setBizType(CUSTOMER);
        row.setBizId(BIZ_ID);
        row.setUserId(userId);
        row.setLevel(level.getLevel());
        return row;
    }

    @FunctionalInterface
    private interface Thrower<T> {
        T run() throws Throwable;
    }
}
