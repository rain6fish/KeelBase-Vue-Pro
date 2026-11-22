// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.AuthenticatedSubject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

/**
 * 审计读者的写面：台账的撤销对它关闭，读面与别人的写面不受影响。
 *
 * <p>为什么这条测试存在：运行时的 `EffectController#revoke` 只判归属、不查规则源，于是读者能撤销自己名下的
 * 台账行（2026-10-25 隔离栈实测）。宿主侧那道守卫是唯一会问规则源的地方，而「撤销也在它的射程里」此前只是
 * 一句没被钉住的意图 —— 这道测试把意图变成可跑的读数：读者 DELETE 被拒（自己的行、不存在的 id 都一样，因为
 * 拒绝发生在查行之前），读者 GET 台账仍放行，普通用户与管理员照旧。它也钉住守卫原有的入口，免得这次
 * 扩面把原来那道墙碰倒。
 *
 * <p>English:
 *
 * <p>The audit reader's write face: the ledger's revoke is closed to it, the read faces and everyone
 * else's writes are not.
 *
 * <p>Why this test exists: the runtime's `EffectController#revoke` judges ownership only and never asks
 * the rule source, so the reader could revoke a ledger row of its own (measured 2026-10-25 on an
 * isolated stack). The host-side guard is the only place that asks the rule source, and "the revoke is
 * inside its reach" was until now an intention nothing pinned — this test turns it into a reading: the
 * reader's DELETE is refused (its own row and an unknown id alike, because the refusal happens before
 * the row is looked up), its GET of the ledger still passes, and ordinary users and administrators are
 * unaffected. It also pins the guard's original entries so widening it cannot knock the old wall down.
 */
class YudaoAuditReaderExecutionGuardTest {

    private YudaoAuditReaderRules rules;
    private YudaoCallerAuthenticator authenticator;
    private YudaoAdministrator administrator;
    private YudaoAuditReaderExecutionGuard guard;

    @BeforeEach
    void setUp() {
        rules = mock(YudaoAuditReaderRules.class);
        authenticator = mock(YudaoCallerAuthenticator.class);
        administrator = mock(YudaoAdministrator.class);
        guard = new YudaoAuditReaderExecutionGuard(rules, authenticator, administrator);
    }

    @Test
    void theReaderCannotRevokeItsOwnLedgerRow() {
        beAnAuditReader("9201");

        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> handle("DELETE", "/ai/tool-effects/4"),
                "the reader's own row is still a write, and the reader has no write rules");
        assertEquals(403, refused.getStatusCode().value(),
                "a refused state-changing DELETE must not answer 200");
    }

    @Test
    void theReaderCannotRevokeAnUnknownIdEither() {
        beAnAuditReader("9201");

        assertThrows(ResponseStatusException.class,
                () -> handle("DELETE", "/ai/tool-effects/999999"),
                "the refusal precedes the lookup, so an unknown id is refused the same way");
    }

    @Test
    void theReaderStillListsTheLedger() {
        beAnAuditReader("9201");

        assertDoesNotThrow(() -> handle("GET", "/ai/tool-effects"),
                "the ledger list is granted to the role as a read");
    }

    @Test
    void theReaderStillReadsTheConfirmationQueue() {
        beAnAuditReader("9201");

        assertDoesNotThrow(() -> handle("GET", "/ai/confirmations"));
    }

    @Test
    void theReaderStillCannotChat() {
        beAnAuditReader("9201");

        assertThrows(AccessDeniedException.class, () -> handle("POST", "/ai/chat"));
    }

    @Test
    void theReaderCannotReachTheAdministratorStream() {
        beAnAuditReader("9201");

        assertThrows(AccessDeniedException.class, () -> handle("POST", "/admin/ai/chat/stream"),
                "the administrator channel runs the same turn and the same tools");
    }

    @Test
    void theReaderCannotRunAShowcaseScenario() {
        beAnAuditReader("9201");

        assertThrows(AccessDeniedException.class,
                () -> handle("POST", "/ai/security-showcase/run/scenario-1"),
                "the path variable must not let the entry slip past the ledger");
    }

    @Test
    void theShowcaseListStaysOutsideTheExecutionEntries() {
        beAnAuditReader("9201");

        assertDoesNotThrow(() -> handle("GET", "/ai/security-showcase/scenarios"),
                "listing scenarios runs no tool and stays a read");
    }

    @Test
    void anOrdinaryUserMayRevoke() {
        beAnOrdinaryCaller("9202");

        assertDoesNotThrow(() -> handle("DELETE", "/ai/tool-effects/2"),
                "closing the reader's door must not close the ordinary user's");
    }

    @Test
    void anAdministratorHoldingTheRoleStillActs() {
        beAnAuditReader("1");
        when(administrator.isAdmin(1L)).thenReturn(true);

        assertDoesNotThrow(() -> handle("DELETE", "/ai/tool-effects/2"),
                "an administrator is still themselves, whatever roles it also holds");
    }

    @Test
    void anUnauthenticatedCallerIsLeftToTheRuntime() {
        when(authenticator.authenticate(org.mockito.ArgumentMatchers.any())).thenReturn(null);

        assertDoesNotThrow(() -> handle("DELETE", "/ai/tool-effects/4"));
    }

    private void beAnAuditReader(String subject) {
        when(authenticator.authenticate(org.mockito.ArgumentMatchers.any()))
                .thenReturn(new AuthenticatedSubject(subject, null));
        when(rules.isAuditReader(subject)).thenReturn(true);
        when(administrator.isAdmin(Long.valueOf(subject))).thenReturn(false);
    }

    private void beAnOrdinaryCaller(String subject) {
        when(authenticator.authenticate(org.mockito.ArgumentMatchers.any()))
                .thenReturn(new AuthenticatedSubject(subject, null));
        when(rules.isAuditReader(subject)).thenReturn(false);
    }

    private boolean handle(String method, String path) {
        return guard.preHandle(new MockHttpServletRequest(method, path), new MockHttpServletResponse(),
                new Object());
    }
}
