// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.protocol.PermissionDecision;
import cn.com.keelbase.runtime.authz.GovernanceReadSubjects;
import cn.com.keelbase.runtime.authz.PermissionAuthorizer;
import cn.com.keelbase.runtime.identity.IdentityEvidence;
import cn.com.keelbase.runtime.identity.IdentityResolver;
import cn.com.keelbase.runtime.identity.Principal;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 上游 REST 写的旁路台账——**只读一页**，给审计链页的那个独立区块用。
 *
 * <p><b>闸与谁。</b>它要求 `read OperationAudit`，与运行时的操作审计同一条闸：持有启用 `audit_reader`
 * 角色的调用方拿到这一条（{@link YudaoAuditReaderRules} 的六条读规则之一），管理员拿通配，**普通角色
 * 拿不到**。这不是「默认全开」——一个治理读面不该发给不读治理记录的人。审计链页本身也没有发给
 * `common`（身份矩阵里 `20002` 只授予 `audit_reader`），故页面与接口的射程一致。
 *
 * <p><b>为什么调用方按宿主的方式读。</b>运行时的安全链只覆盖它自己包里的控制器（`cn.com.keelbase.runtime`）；
 * 本控制器住在宿主包里，故没有东西替它往运行时的安全上下文里放主体。请求仍然是宿主认证过的，于是这里经
 * {@link YudaoCallerId} 取 id、再走**同一个** {@link IdentityResolver}，与 {@code SecurityShowcaseController}
 * 同一条路。
 *
 * <p><b>只读。</b>本类只有一个 `@GetMapping`；旁路台账的写入仍然只有过滤器那条路，且本面连请求体摘要都不读
 * （见 {@link YudaoBypassAuditReader}）。
 *
 * <p>英文：
 *
 * <p>The bypass ledger for upstream REST writes — **one read-only page**, for the audit-chain page's own
 * section.
 *
 * <p><b>Which gate, and for whom.</b> It requires `read OperationAudit`, the same gate as the runtime's
 * operations audit: a caller holding an enabled `audit_reader` role gets it (one of
 * {@link YudaoAuditReaderRules}'s six read rules), an administrator gets the wildcard, and an ordinary
 * role does not. That is not "open to everybody" — a governance read face is not handed to people who do
 * not read governance records. The audit-chain page itself is not granted to `common` either (in the
 * identity matrix `20002` goes to `audit_reader` only), so the page and the endpoint agree on scope.
 *
 * <p><b>Why the caller is read the host's way.</b> The runtime's security chain covers only controllers in
 * its own package (`cn.com.keelbase.runtime`); this controller lives in the host's package, so nothing
 * puts a subject in the runtime's security context for it. The request is still host-authenticated, so the
 * id comes from {@link YudaoCallerId} and then through the **same** {@link IdentityResolver} — the same
 * road {@code SecurityShowcaseController} takes.
 *
 * <p><b>Read-only.</b> This class has a single `@GetMapping`; the ledger's writes still take only the
 * filter's road, and this face does not even read the request-body digest (see
 * {@link YudaoBypassAuditReader}).
 */
@RestController
public class YudaoBypassAuditController {

    private final YudaoBypassAuditReader reader;
    private final YudaoCallerId callers;
    private final IdentityResolver identities;
    private final PermissionAuthorizer authorizer;

    public YudaoBypassAuditController(YudaoBypassAuditReader reader, YudaoCallerId callers,
                                      IdentityResolver identities, PermissionAuthorizer authorizer) {
        this.reader = reader;
        this.callers = callers;
        this.identities = identities;
        this.authorizer = authorizer;
    }

    /**
     * `GET /admin-api/keelbase/bypass-audit/page?page=1&limit=20` → `{ total, page, limit, items }`。
     * 最新的在前；`limit` 由读取方夹到 `1..100`，返回的是实际生效的值。
     *
     * <p>`GET .../bypass-audit/page?page=1&limit=20` → `{ total, page, limit, items }`, newest first.
     * The reader clamps `limit` to `1..100` and returns the effective value.
     */
    @GetMapping("/admin-api/keelbase/bypass-audit/page")
    public CommonResult<YudaoBypassAuditReader.Page> page(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {
        requireReadOperationAudit();
        return CommonResult.success(reader.page(YudaoCallerTenant.current(), page, limit));
    }

    /**
     * 调用方必须能读操作审计；否则是宿主的 403 信封，而不是一条被悄悄收窄的答复。
     *
     * <p>The caller must be able to read the operations audit; otherwise the host's 403 envelope, never
     * a quietly narrowed answer.
     */
    private void requireReadOperationAudit() {
        Long userId = callers.current();
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "no authenticated caller");
        }
        Principal caller = identities.resolve(
                IdentityEvidence.ofAuthenticatedSubject(String.valueOf(userId), null));
        PermissionDecision decision = authorizer.decide(
                caller, PermissionAuthorizer.ACTION_READ, GovernanceReadSubjects.OPERATION_AUDIT);
        if (!decision.allowed()) {
            throw new AccessDeniedException(
                    "reading the bypass trail needs the operations-audit read grant");
        }
    }
}
