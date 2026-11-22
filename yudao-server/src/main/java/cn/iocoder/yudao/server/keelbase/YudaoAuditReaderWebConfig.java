// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Hangs the audit reader's execution-entry guard on the runtime's paths.
 *
 * <p>The list is the same source the guard decides from — the guard reads these constants — so "which
 * paths are registered" and "which paths are refused" cannot drift apart.
 * `scripts/check-audit-reader-execution-guard.mjs` reconciles the three places (rule source, guard,
 * this registration) statically so the list cannot quietly change.
 *
 * <p>It also registers the audit read face's parameter guard (`YudaoAuditReadParamsGuard`) on
 * `/audit/logs`: a query parameter the read face does not declare is refused with a 400 that names it,
 * instead of being silently dropped by Spring and answering a wider list.
 *
 * <p>This class also registers the 404 guard for the deprecated AI module's HTTP surface
 * (`YudaoAiModuleSurfaceGuard`). It is registered **after** the audit-reader guard, so an audit reader
 * gets its own 403 first and only the remaining callers hear that the surface does not exist.
 *
 * <p>把审计读者的执行入口守卫挂到运行时的那几条路径上。
 *
 * <p>清单与校验器同源：`YudaoAuditReaderExecutionGuard` 用这里的常量裁决，故「挂上了哪些路径」与「挡了哪些
 * 路径」不会各说各话。`scripts/check-audit-reader-execution-guard.mjs` 对这三处（规则源、守卫、本注册）
 * 做静态对账，防止清单漂走。
 *
 * <p>它还注册了审计读面的参数守卫（`YudaoAuditReadParamsGuard`）到 `/audit/logs`：读面没有声明的查询参数
 * 一律 400 并点名，而不是被 Spring 静默丢弃、答回一份更宽的列表。
 *
 * <p>本类还注册了已弃用 AI 模块 HTTP 应用面的 404 守卫（`YudaoAiModuleSurfaceGuard`）。它的注册排在审计读者
 * 守卫**之后**：审计读者先拿到自己的 403，其余调用方才听到「这个面不存在」。
 */
@Configuration
public class YudaoAuditReaderWebConfig implements WebMvcConfigurer {

    /**
     * 放行工具执行的入口：运行时的四条（含管理员通道 `/admin/ai/chat/stream`）、宿主 AI 模块的两条、
     * AI1 会话流，以及对抗展示的单条运行入口。
     *
     * <p>宿主 AI 模块的 `/admin-api/ai/chat/message/send`（及其流式兄弟）**没有** {@code @PreAuthorize}，
     * 却把角色的工具回调交给模型；AI1 的 `/admin-api/ai1/session/message/send-stream` 会装配 MCP、SKILL 与
     * 受治理的本地工具。前者今天靠表缺失才没执行，后者靠 `ai1:session:my` 才没执行——两者都仍然是对审计读者
     * **可达的形状**，故一并挡在这里，而不是依赖一张可能被误授的权限串。对抗展示的
     * `/ai/security-showcase/run/*` 会真正执行引擎动作；控制器本身有管理员闸，这里仍按同一清单再挡一次。
     *
     * <p>英文：
     *
     * <p>The entries where a tool may execute: the runtime's four (including the administrator channel
     * `/admin/ai/chat/stream`), the host AI module's two, the AI1 session stream, and the anti-adversary
     * showcase's run entry. The host AI module's `/admin-api/ai/chat/message/send` (and its streaming
     * sibling) carries **no** {@code @PreAuthorize} yet hands a role's tool callbacks to the model; AI1's
     * `/admin-api/ai1/session/message/send-stream` assembles MCP, SKILL and governed local tools. The
     * former only avoids execution today because its tables are absent, the latter only because of
     * `ai1:session:my` — both remain **reachable shapes** for an audit reader, so they are refused here
     * rather than left to a permission string that could be granted by mistake. The showcase's
     * `/ai/security-showcase/run/*` executes engine actions; its controller carries an administrator
     * gate, and it is refused here once more from the same list.
     */
    static final List<String> EXECUTION_PATHS = List.of(
            "/ai/chat",
            "/ai/chat/stream",
            "/admin/ai/chat/stream",
            "/ai/task",
            "/ai/security-showcase/run/*",
            "/admin-api/ai/chat/message/send",
            "/admin-api/ai/chat/message/send-stream",
            "/admin-api/ai1/session/message/send-stream");

    /**
     * 写侧前缀：GET 之外的请求在这里写。确认的两条是裁决或再执行；台账那条是**撤销**
     * （`DELETE /ai/tool-effects/{id}`）。GET 一律放行 —— 确认队列与台账列表都是该角色的正当读面。
     *
     * <p>台账为什么也得在这里挡：运行时的 `EffectController#revoke` 只判归属
     * （`isManager() || userId == effect.userId`），**一次都不问权限规则源**。于是一个先做过事、后来才被
     * 授予 `audit_reader` 的账号，仍能撤销自己名下那条旧台账行（2026-10-25 隔离栈实测：HTTP 200、
     * `executed → compensating`、写了一条 `effect_revoke` 审计行）。规则源说它只有六条 `read`、
     * 一条写规则都没有 —— 而运行时那条路径根本不会去问它，所以这道墙只能由宿主砌。
     *
     * <p>英文：
     *
     * <p>The write-side prefixes: a non-GET request under one of these writes. The two confirmation
     * prefixes decide or re-execute; the ledger prefix **revokes** (`DELETE /ai/tool-effects/{id}`).
     * GET is always allowed — the confirmation queue and the ledger list are the role's proper reads.
     *
     * <p>Why the ledger has to be refused here too: the runtime's `EffectController#revoke` judges
     * ownership only (`isManager() || userId == effect.userId`) and **never asks the permission rule
     * source**. An account that operated before it was granted `audit_reader` can therefore still revoke
     * an old ledger row of its own (measured 2026-10-25 on an isolated stack: HTTP 200,
     * `executed → compensating`, an `effect_revoke` audit line written). The rule source says it holds
     * six `read` grants and not one write rule — and the runtime's path never asks it, so this wall can
     * only be built on the host.
     */
    static final List<String> WRITE_PREFIXES = List.of(
            "/ai/confirmations",
            "/ai/my/confirmations",
            "/ai/tool-effects");

    private final YudaoAuditReaderExecutionGuard guard;
    private final YudaoAuditReadParamsGuard readParams;
    private final YudaoAiModuleSurfaceGuard aiModuleSurface;

    public YudaoAuditReaderWebConfig(YudaoAuditReaderExecutionGuard guard,
                                     YudaoAuditReadParamsGuard readParams,
                                     YudaoAiModuleSurfaceGuard aiModuleSurface) {
        this.guard = guard;
        this.readParams = readParams;
        this.aiModuleSurface = aiModuleSurface;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(guard)
                .addPathPatterns(
                        "/ai/chat", "/ai/chat/stream", "/admin/ai/chat/stream", "/ai/task",
                        "/ai/security-showcase/run/*",
                        "/admin-api/ai/chat/message/send",
                        "/admin-api/ai/chat/message/send-stream",
                        "/admin-api/ai1/session/message/send-stream",
                        "/ai/confirmations/**", "/ai/my/confirmations/**",
                        "/ai/tool-effects", "/ai/tool-effects/**");
        // Registers after the guard above so the static reconciliation script still reads that one's
        // path list first; this guard answers a different question on a different path.
        // 注册排在上面的守卫之后，静态对账脚本仍先读到那份路径清单；本守卫在另一条路径上答另一件事。
        registry.addInterceptor(readParams)
                .addPathPatterns("/audit/logs");
        // 顺序有意义：审计读者先在上述注册里拿到自己的 403，其余调用方才在这里听到「这个面不存在」。
        // Order matters: an audit reader gets its own 403 from the registration above, and only the
        // remaining callers hear here that the surface does not exist.
        registry.addInterceptor(aiModuleSurface)
                .addPathPatterns("/admin-api/ai/**");
    }
}
