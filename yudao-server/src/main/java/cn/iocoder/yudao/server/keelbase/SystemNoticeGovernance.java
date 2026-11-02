// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 系统模块在公告（`system_notice`）上的接缝——M2 的第一个对象，也是本宿主上第一个**没有属主**的业务对象。
 *
 * <p><b>四问的答案，读出来之后归到 §4.3 的第三种。</b>
 * ① 分页不给任何条件时是**全表**（`selectPage` 只按 `title` 模糊、`status` 精确，两者都可空）；
 * ② 按 id 读是一句裸 `selectById`，**不收窄**；③ `NoticeSaveReqVO` 里**没有属主字段**，客户端无从指认别人，
 * `creator` 是持久层填的审计串、不在 VO 里；④ 按 id 改写只校验「存在」、**不查属主**——因为没有属主可查。
 * 这四条不是四个缺口，而是同一个事实：**公告是广播**。人人都该读得到，写只属于持有权限的人。故本切面**不是**
 * 一台行范围机器（`YudaoModuleScope` 的属主形状在这里没有落点，见接入清单 §4.1），而是那条「**模块已自窄，通知只欠
 * 身份/权限**」的第三种回答。
 *
 * <p><b>只欠的那一半，正好是模块留在 controller 上的那半。</b>读侧对所有人开放，故切面一个字都不改；写侧的授权在
 * `NoticeController` 的 `@PreAuthorize('system:notice:create' / ':update' / ':delete')` 上，而 **AI 工具路径不经过
 * controller**。于是这里问出**与 REST 相同的那一问**：`YudaoToolPermissions` 按同一张权限表、同四个权限码判，缺码即拒。
 * 不新增词表、不放宽 REST，也不另造一套「谁算管理员」——那句话已经由 `YudaoAdministrator` 回答过一次了。
 *
 * <p>**声明的收窄（或曰：它没有收窄）：** 写侧问的就是 REST 那一条权限码，故它**与模块相等、不更严也不更宽**；
 * 读侧它**什么都不做**，因为模块自己就不收窄。这不是遗漏——公告的读者是所有人，替它按人收窄会把广播变成私信。
 *
 * <p><b>只在工具路径上动手。</b>`ActingCaller` 只由持有运行时 `Principal` 的工具发布；宿主自己的请求路径上它是空的，
 * 而那条路径上 `@PreAuthorize` 已经问过同一句。故切面在 `ActingCaller` 为空时**原样放行**：REST 行为与上游一字不差，
 * 也不因为一次权限表读不出来而把一条本该成功的 REST 调用拒掉。
 *
 * <p><b>没有补偿器，是一个事实而不是欠账。</b>本面只开「新建」一条写；撤销一次公告靠模块自己的删除，而不是把一次
 * 已消失的创建「补回去」。切面没有可撤回的效果，故这里不声明 `SideEffectCompensator`。
 *
 * The system module's seam over notices ({@code system_notice}) — M2's first object, and the first
 * business object on this host with **no owner**.
 *
 * <p><b>The four answers put it in §4.3's third case.</b> (1) The page with no filter returns the whole
 * table — {@code selectPage} only narrows by a fuzzy {@code title} and an exact {@code status}, both
 * optional. (2) The by-id read is a bare {@code selectById}, unscoped. (3) {@code NoticeSaveReqVO} has
 * **no owner field**, so a client cannot name someone else; {@code creator} is an audit string the
 * persistence layer fills and is not in the VO. (4) An update or delete by id only checks existence —
 * there is no owner to check. Those four are not four holes but one fact: **a notice is a broadcast**.
 * Everyone should be able to read it; only permission holders may write. So this aspect is **not** an
 * owner-range machine (the machine's shape has no foothold here — see the onboarding checklist §4.1); it
 * is the third answer the checklist names: the module already narrows, and the advice owes it only
 * identity and permission.
 *
 * <p><b>The half it owes is exactly the half the module left on the controller.</b> Reads are open, so
 * the aspect changes nothing there; writes are authorised by {@code NoticeController}'s
 * {@code @PreAuthorize('system:notice:create' / ':update' / ':delete')}, and **the AI tool path does not
 * pass through the controller**. So this aspect asks **the same question REST asks**: {@code
 * YudaoToolPermissions} reads the same permission table and the same four codes, and a caller without
 * the code is refused. No second vocabulary, no widened REST, and no third answer to "who counts as an
 * administrator" — that question was already answered once by {@link YudaoAdministrator}.
 *
 * <p><b>Declared narrowing (or rather: it does not narrow).</b> On the write side it asks the very
 * permission code REST asks, so it is **equal to the module — no stricter, no wider**. On the read side
 * it **does nothing**, because the module itself narrows nothing. That is not an omission: a notice's
 * readers are everyone, and narrowing it per caller would turn a broadcast into a private message.
 *
 * <p><b>It acts on the tool path only.</b> {@code ActingCaller} is published only by a tool holding the
 * runtime's {@code Principal}; on the host's own request path it is empty, and there {@code
 * @PreAuthorize} has already asked the same question. So the advice **lets anything through when
 * {@code ActingCaller} is empty**: REST behaviour is exactly upstream's, and a transient permission-read
 * failure cannot refuse a REST call that would have succeeded.
 *
 * <p><b>No compensator, and that is a fact rather than a debt.</b> This face opens one write — create.
 * Withdrawing a notice is the module's own delete, not putting a vanished creation "back"; there is no
 * effect to revoke, so no {@code SideEffectCompensator} is declared here.
 */
@Aspect
@Component
public class SystemNoticeGovernance implements GovernedModule {

    private final YudaoToolPermissions permissions;

    public SystemNoticeGovernance(YudaoToolPermissions permissions) {
        this.permissions = permissions;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "system";
    }

    /**
     * There is no owner column here, and saying so is the answer rather than leaving it blank:
     * {@link GovernedModule#ownerField()} assumes one field, and a broadcast has none. Naming it keeps
     * the next reader from hunting for a column that was never meant to exist.
     *
     * 这里**没有**属主列，而把这一点说出来本身就是答案——{@link GovernedModule#ownerField()} 假定一个字段，而广播
     * 没有。点名它，好让下一个读者不去找一个本来就不该存在的列。
     */
    @Override
    public String ownerField() {
        return "none (a notice is a broadcast)";
    }

    /**
     * The four writes the module owns, each held to the permission code its own controller names. The
     * aspect asks that question only where a tool published a caller; on the request path the
     * annotation has already answered it.
     *
     * <p>One advice rather than four, because the question is one question — only the code differs, and
     * it is read off the method name the pointcut already names.
     *
     * 模块自己的四个写，各按它 controller 上那一条权限码收束。切面只在**有工具发布了调用方**的地方问这句话；请求
     * 路径上注解已经答过。
     *
     * <p>一条通知而不是四条，因为这是**同一个问题**——不同的只是权限码，而权限码从点切已经点名的那个方法名读出来。
     */
    @Around("execution(* cn.iocoder.yudao.module.system.service.notice.NoticeService.createNotice(..))"
            + " || execution(* cn.iocoder.yudao.module.system.service.notice.NoticeService.updateNotice(..))"
            + " || execution(* cn.iocoder.yudao.module.system.service.notice.NoticeService.deleteNotice(..))"
            + " || execution(* cn.iocoder.yudao.module.system.service.notice.NoticeService.deleteNoticeList(..))")
    public Object requireWritePermission(ProceedingJoinPoint call) throws Throwable {
        String caller = ActingCaller.current();
        if (caller == null) {
            // The host's own request path: @PreAuthorize on the controller has already asked this.
            // 宿主自己的请求路径：controller 上的 @PreAuthorize 已经问过这一句。
            return call.proceed();
        }
        String action = call.getSignature().getName();
        String permission = permissionFor(action);
        String refusal = permissions.refusal(caller, permission);
        if (refusal != null) {
            throw new RuleDeniedException(null, refusal, "Notice", action,
                    "该工具调用要求 '" + permission + "' 权限；请改用持有该权限的身份，或让管理员补齐授权");
        }
        return call.proceed();
    }

    /**
     * The permission code the module's own controller names for this write — one vocabulary, not two.
     * 本模块自己的 controller 为这个写点名的权限码——同一套词表，不是两套。
     */
    static String permissionFor(String method) {
        return switch (method) {
            case "createNotice" -> "system:notice:create";
            case "updateNotice" -> "system:notice:update";
            // deleteNotice / deleteNoticeList — the controller gates both on the same code.
            // deleteNotice 与 deleteNoticeList —— controller 对两者用的是同一个码。
            default -> "system:notice:delete";
        };
    }
}
