// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.exception.enums.GlobalErrorCodeConstants;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 旁路留痕的只读端点：治理边界页上那张表的数据来源。
 *
 * <p><b>谁能读：管理员，或持有启用 `audit_reader` 的调用方。</b>与 `caller-names` / `record-names` 是同一对
 * 身份，不另开一份名单。别的人拿到的是**信封 403**（本宿主的惯例：线缆 200、`code` 403），不是一份空页 ——
 * 一张治理读面上，「空页」会被读成「没有任何写」，而那是这一页最不该给出的误读。
 *
 * <p><b>为什么不开 `@PreAuthorize`。</b>`audit_reader` 的授予来自宿主的规则源（`YudaoAuditReaderRules`），
 * 不是一个权限串；按串授予等于给这个角色补一条芋道权限，也就是把这面的准入改成另一套口径。这条端点问的正是
 * 规则源问的那一个问题。
 *
 * <p><b>掩码这一面没有可掩的东西。</b>行里是方法、路径、模块与对象名、调用方 id、两个结果码、耗时与正文的
 * **形状**；没有任何正文值（见 {@link YudaoBypassAuditBody}）。调用方 id → 姓名由 `caller-names` 那条端点
 * 另外补齐，其范围由 {@link YudaoCallerDirectory} 裁。
 *
 * <p>The read-only endpoint for the bypass trail: where the boundary page's table gets its rows.
 *
 * <p><b>Who may read: an administrator, or a caller holding an enabled `audit_reader`.</b> The same pair of
 * identities as `caller-names` / `record-names`, not a second list. Everyone else gets an **envelope 403**
 * (this host's convention: wire 200, `code` 403), not an empty page — on a governance read face an empty
 * page reads as "nothing was written", and that is the one misreading this page must never produce.
 *
 * <p><b>Why not {@code @PreAuthorize}.</b> The `audit_reader` grant comes from the host's rule source
 * (`YudaoAuditReaderRules`), not a permission string; granting by string would mean adding a YuDao
 * permission to the role, which is a different admission rule for the same face. This endpoint asks the
 * very question the rule source asks.
 *
 * <p><b>There is nothing to mask here.</b> A row carries the method, path, module and object name, the
 * caller id, the two result codes, the duration and the body's **shape**; no body value (see
 * {@link YudaoBypassAuditBody}). Caller id to name is filled in separately by `caller-names`, whose range
 * {@link YudaoCallerDirectory} decides.
 */
@RestController
public class YudaoBypassLogController {

    private final YudaoBypassLog trail;
    private final YudaoAdministrator administrators;
    private final YudaoAuditReaderRules auditReaders;
    private final YudaoCallerId callers;

    public YudaoBypassLogController(YudaoBypassLog trail, YudaoAdministrator administrators,
                                    YudaoAuditReaderRules auditReaders, YudaoCallerId callers) {
        this.trail = trail;
        this.administrators = administrators;
        this.auditReaders = auditReaders;
        this.callers = callers;
    }

    /**
     * `GET /admin-api/keelbase/bypass-log?page=1&limit=50` → `{total, page, limit, items}`，最新在前。
     *
     * <p>`GET .../bypass-log?page=1&limit=50` → `{total, page, limit, items}`, newest first.
     */
    @GetMapping("/admin-api/keelbase/bypass-log")
    public CommonResult<YudaoBypassLog.Page> page(
            @RequestParam(value = "page", defaultValue = "1") long page,
            @RequestParam(value = "limit", defaultValue = "" + YudaoBypassLog.DEFAULT_LIMIT) int limit) {
        Long caller = callers.current();
        if (caller == null || !mayRead(caller)) {
            throw new ServiceException(GlobalErrorCodeConstants.FORBIDDEN);
        }
        return CommonResult.success(trail.page(YudaoCallerTenant.current(), page, limit));
    }

    /** 管理员，或持有启用 `audit_reader` 的调用方 —— 与 `YudaoRecordNames#mayAsk` 同一个问题。 */
    /** An administrator, or an enabled audit-reader holder — the same question as `YudaoRecordNames#mayAsk`. */
    private boolean mayRead(long callerId) {
        return administrators.isAdmin(callerId)
                || auditReaders.isAuditReader(String.valueOf(callerId));
    }
}
