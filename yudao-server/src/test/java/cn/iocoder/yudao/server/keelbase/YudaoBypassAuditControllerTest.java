// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.protocol.PermissionDecision;
import cn.com.keelbase.runtime.authz.GovernanceReadSubjects;
import cn.com.keelbase.runtime.authz.PermissionAuthorizer;
import cn.com.keelbase.runtime.identity.IdentityEvidence;
import cn.com.keelbase.runtime.identity.IdentityResolver;
import cn.com.keelbase.runtime.identity.Principal;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

/**
 * 旁路只读面的两道口：**读得到的人**拿到自己租户的那一页，**读不到的人**拿宿主的 403，而不是一份被悄悄
 * 收窄的空列表。闸的字符串也要钉住——`read OperationAudit` 是页面与接口同射程的那条线。
 *
 * <p>英文：
 *
 * <p>The two openings of the bypass read face: a caller who may read gets a page of **their own tenant**,
 * and one who may not gets the host's 403 rather than a quietly narrowed empty list. The gate's strings
 * are pinned too — `read OperationAudit` is the line that keeps page and endpoint on one scope.
 */
class YudaoBypassAuditControllerTest {

    private YudaoBypassAuditReader reader;
    private YudaoCallerId callers;
    private IdentityResolver identities;
    private PermissionAuthorizer authorizer;
    private YudaoBypassAuditController controller;

    @BeforeEach
    void setUp() {
        reader = mock(YudaoBypassAuditReader.class);
        callers = mock(YudaoCallerId.class);
        identities = mock(IdentityResolver.class);
        authorizer = mock(PermissionAuthorizer.class);
        controller = new YudaoBypassAuditController(reader, callers, identities, authorizer);
        TenantContextHolder.setTenantId(7L);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    @Test
    void anAuditReaderGetsAPageOfTheirOwnTenant() {
        YudaoBypassAuditReader.Page expected = new YudaoBypassAuditReader.Page(0L, 1, 20, List.of());
        when(callers.current()).thenReturn(9002L);
        when(identities.resolve(any(IdentityEvidence.class))).thenReturn(new Principal("9002", Principal.ROLE_USER));
        when(authorizer.decide(any(Principal.class), eq(PermissionAuthorizer.ACTION_READ),
                eq(GovernanceReadSubjects.OPERATION_AUDIT)))
                .thenReturn(new PermissionDecision(PermissionAuthorizer.ACTION_READ,
                        GovernanceReadSubjects.OPERATION_AUDIT, true,
                        PermissionDecision.REASON_ALLOWED_ALL, null));
        when(reader.page(7L, 2, 50)).thenReturn(expected);

        CommonResult<YudaoBypassAuditReader.Page> result = controller.page(2, 50);

        assertEquals(0, result.getCode());
        assertSame(expected, result.getData());
        verify(authorizer).decide(any(Principal.class), eq(PermissionAuthorizer.ACTION_READ),
                eq(GovernanceReadSubjects.OPERATION_AUDIT));
    }

    @Test
    void anOrdinaryCallerIsRefusedRatherThanShownAnEmptyList() {
        when(callers.current()).thenReturn(9001L);
        when(identities.resolve(any(IdentityEvidence.class))).thenReturn(new Principal("9001", Principal.ROLE_USER));
        when(authorizer.decide(any(Principal.class), any(String.class), any(String.class)))
                .thenReturn(new PermissionDecision(PermissionAuthorizer.ACTION_READ,
                        GovernanceReadSubjects.OPERATION_AUDIT, false,
                        PermissionDecision.REASON_DENIED_USER, PermissionDecision.DENIED_BY_CASL));

        assertThrows(AccessDeniedException.class, () -> controller.page(1, 20));
        verify(reader, never()).page(anyLong(), anyInt(), anyInt());
    }
}
