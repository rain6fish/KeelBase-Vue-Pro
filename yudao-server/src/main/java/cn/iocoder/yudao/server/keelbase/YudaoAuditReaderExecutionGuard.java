// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.AuthenticatedSubject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 把审计读者挡在运行时那几条**会执行工具**的入口之外。
 *
 * <p>为什么宿主得自己挡：运行时的 `/ai/chat`、流式兄弟 `/ai/chat/stream`、管理员通道
 * `/admin/ai/chat/stream` 与多步 `/ai/task` **没有** {@code @PreAuthorize}，而引擎的闸门只按风险级与
 * 治理策略裁决，**不查权限规则源**。于是一个只被授予六个治理读面
 * {@code read} 的账户，仍能在这里让 R1 工具真实执行；R3 写则生成一条 `immediate` 确认，而该账户**自己**就能裁它
 * （`/ai/confirmations/{token}` 只拒绝别人的行）——「不能写、不能审批、不能执行」于是在运行时入口上被绕开。
 *
 * <p>本守卫只做一件事：持有启用的 `audit_reader` 角色 ⇒ 拒绝这些执行入口**与写入口**。读面不挡：
 * `GET /ai/confirmations`、`GET /ai/tool-effects` 等仍是该角色的正当射程。写入口里还有副作用台账的撤销
 * （`DELETE /ai/tool-effects/{id}`）：运行时的 `EffectController#revoke` 只判归属、**一次都不问规则源**，故一个
 * 先做过事、后来才被授予该角色的账号仍能撤销自己名下的旧台账行（2026-10-25 隔离栈实测：读者撤销成功、库
 * `executed → compensating`）。角色读不出来时 `YudaoAuditReaderRules` 按「不持有」处理，故守卫失败即放行给运行时
 * 自己的身份处理；这一取舍与规则源一致——缺一次角色读只会收窄规则，不会在这里凭空放大权限。
 *
 * <p>清单里还有宿主自己的 AI 执行形状：AI 模块的 `/admin-api/ai/chat/message/send`（及其流式兄弟）
 * **没有** {@code @PreAuthorize}，却把角色的工具回调交给模型；AI1 的
 * `/admin-api/ai1/session/message/send-stream` 会装配 MCP、SKILL 与受治理的本地工具；对抗展示的
 * `/ai/security-showcase/run/*` 会执行引擎动作，控制器虽有管理员闸，仍按同一清单再挡一次。它们出于同一个
 * 理由、由同一个开关拒绝。
 *
 * <p>英文：
 *
 * <p>Keeps the audit reader out of the runtime's <b>tool-executing</b> entries.
 *
 * <p>The list also carries the host's own AI execution shapes: the AI module's
 * `/admin-api/ai/chat/message/send` (and its stream) hands a role's tool callbacks to the model with no
 * `@PreAuthorize`, AI1's `/admin-api/ai1/session/message/send-stream` assembles MCP, SKILL and governed
 * local tools, and the showcase's `/ai/security-showcase/run/*` executes engine actions — its controller
 * carries an administrator gate, and it is refused here once more from the same list. They are refused
 * for the same reason and by the same switch.
 *
 * <p>Why the host must do it: the runtime's `/ai/chat`, its streaming sibling `/ai/chat/stream`, the
 * administrator channel `/admin/ai/chat/stream` and the multi-step `/ai/task` carry **no**
 * {@code @PreAuthorize}, and the engine's gate decides on risk level and governance policy only — it
 * **never consults the permission rule source**. An account
 * granted nothing but `read` on six governance faces could therefore still make an R1 tool run here;
 * an R3 write raises an `immediate` confirmation that the same account can decide itself
 * (`/ai/confirmations/{token}` refuses only somebody else's row). "Cannot write, cannot approve,
 * cannot execute" was thus bypassable at the runtime entry.
 *
 * <p>This guard does one thing: holding an enabled `audit_reader` role ⇒ refuse those execution
 * entries **and write entries**. Reads stay open — `GET /ai/confirmations`, `GET /ai/tool-effects` and
 * friends are the role's proper reach. The write entries include revoking a side effect
 * (`DELETE /ai/tool-effects/{id}`): the runtime's `EffectController#revoke` judges ownership only and
 * **never asks the rule source**, so an account that operated before it was granted the role can still
 * revoke an old ledger row of its own (measured 2026-10-25 on an isolated stack: the reader's revoke
 * succeeded, the row moved `executed → compensating`). An unreadable role is treated as "does not
 * hold" by `YudaoAuditReaderRules`, so the guard lets the request through to the runtime's own identity
 * handling; that matches the rule source's stance, where a missing role read narrows the rules and
 * never widens a permission here.
 */
@Component
public class YudaoAuditReaderExecutionGuard implements HandlerInterceptor {

    private final YudaoAuditReaderRules rules;
    private final YudaoCallerAuthenticator callerAuthenticator;
    private final YudaoAdministrator administrator;

    public YudaoAuditReaderExecutionGuard(YudaoAuditReaderRules rules,
                                          YudaoCallerAuthenticator callerAuthenticator,
                                          YudaoAdministrator administrator) {
        this.rules = rules;
        this.callerAuthenticator = callerAuthenticator;
        this.administrator = administrator;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 运行时的链只认自己的路径，芋道的 `TokenAuthenticationFilter` 在 KeelBase 路径上**可能从不运行**，
        // 故 `SecurityFrameworkUtils` 在这里读到的是空。改用宿主自己的认证接缝——运行时拿到调用方走的也是它。
        // The runtime's chain is scoped to its own paths, so Yudao's `TokenAuthenticationFilter` **may never
        // run** on a KeelBase path and `SecurityFrameworkUtils` reads nothing here. Ask the host's own
        // authenticator instead — the same seam the runtime uses to establish the caller.
        AuthenticatedSubject caller = callerAuthenticator.authenticate(request);
        // 未认证的请求交给运行时自己的身份处理；本守卫只回答「已认证的审计读者」这一问。
        // An unauthenticated request goes to the runtime's own identity handling; this guard answers one
        // question only — "an authenticated audit reader".
        if (caller == null || caller.subject() == null || !rules.isAuditReader(caller.subject())) {
            return true;
        }
        // 规则源对管理员不看 `audit_reader`（管理员拿通配）；守卫照同一口径：管理员即便挂着该角色，也仍是他自己。
        // The rule source ignores `audit_reader` for administrators (they get the wildcard); the guard keeps
        // the same reading: an administrator holding the role is still themselves.
        try {
            if (administrator.isAdmin(Long.valueOf(caller.subject()))) {
                return true;
            }
        } catch (NumberFormatException notAnId) {
            return true;
        }
        String path = pathOf(request);
        boolean executionEntry = isExecutionEntry(path);
        // 确认与台账的**写**入口：GET 是读面（队列、台账列表）、仍属该角色；非 GET 是裁决 / 再执行 / 撤销。
        // The **write** entries of confirmations and the ledger: GET is a read face (the queue, the
        // ledger list) and stays in the role; a non-GET decides, re-executes or revokes.
        boolean writeEntry = !"GET".equalsIgnoreCase(request.getMethod())
                && YudaoAuditReaderWebConfig.WRITE_PREFIXES.stream().anyMatch(path::startsWith);
        if (executionEntry) {
            throw new AccessDeniedException(
                    "the audit reader is a reader: it cannot reach the AI execution entries");
        }
        // 写侧的拒绝**带真 HTTP 403**，与这条删改入口本来答的拒绝同形（运行时对别人的台账行答的就是真 403）。
        // 一个改状态的 DELETE 被拒时若答 HTTP 200，只看状态码的客户端会读成「撤销成功」——而这一条要挡的正是
        // 一次已经发生的状态迁移。执行入口保持原有的 `AccessDeniedException` 形态（拦截器的拒绝在那里
        // 到达时是 HTTP 200 + 正文 `code:403`，2026-10-25 已记为 F2，本轮只核不改）；等 F2 收口时两处会合成一种。
        //
        // The write-side refusal carries a **real HTTP 403**, the shape this delete already answered
        // with (the runtime answers a real 403 for somebody else's ledger row). A refused
        // state-changing DELETE that answered HTTP 200 would be read as "revoked" by a status-only
        // client — and what this entry has to stop is a state transition that actually happened. The
        // execution entries keep their `AccessDeniedException` shape (an interceptor refusal
        // arrives there as HTTP 200 with `code:403` in the body — recorded as F2 on 2026-10-25 and
        // only examined this round); the two shapes merge when F2 is closed.
        if (writeEntry) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "the audit reader is a reader: it cannot write");
        }
        return true;
    }

    // `/*`-suffixed entries match by prefix: the request carries the concrete id, the ledger the pattern.
    // 以 `/*` 结尾的条目按前缀匹配：请求带具体 id，账本记的是模式。
    private static boolean isExecutionEntry(String path) {
        return YudaoAuditReaderWebConfig.EXECUTION_PATHS.stream().anyMatch(entry ->
                entry.endsWith("/*")
                        ? path.startsWith(entry.substring(0, entry.length() - 1))
                        : entry.equals(path));
    }

    /** 去掉上下文路径的请求路径，好让登记的模式与拦截器的匹配对上。 / The request path without its context path, so it matches the registered patterns. */
    private static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        return context != null && !context.isEmpty() && path.startsWith(context)
                ? path.substring(context.length())
                : path;
    }
}
