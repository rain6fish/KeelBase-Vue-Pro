// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * FMS 在结账期间（`fms_closing_period`）上的接缝——M2 里**第一个属主既不是行上的列、也不是入参**的对象。
 * 它要验的形态就在这里：属主是**模块自己的账套判权**（`FmsAccountSetService.validateAccountSetReadPermission`
 * / `validateAccountSetWritePermission`，凭 `fms_account_user` 的 level）。CRM 的属主是行上的 `owner_user_id`，
 * BPM 的是入参里的用户 id，FMS 凭证的是模块查询里已有的筛选位——这三样这里都没有。
 *
 * <p><b>四问的答案，读出来之后归到 §4.3 的第三种。</b>
 * ① 这个 service **没有全表分页**；唯一的「列表式」读是 `getClosingOverview`，它**必须**带一个
 * {@code accountSetId}（VO 上是 `@NotNull`），且只答**一个账套的一个会计期间**——传 null 不会跨账套取全表，
 * 而是先在 `validateAccountSetExists` 上抛「账套不存在」；
 * ② 没有按 id 的读；按期的 `isPeriodClosed(accountSetId, month)` 是**内部校验口**，不收权限也不收 `userId`；
 * ③ `closePeriod` / `cancelClosePeriod` 都走 `validateAccountSetWritePermission(accountSetId, userId)` 并
 * `lockAccountSet`，`userId` 就在入参里；能结账的是该账套里 level 可写的成员，REST 上还叠着 controller 的
 * `@PreAuthorize('fms:closing:close' / ':cancel')`；
 * ④ 模块自己的 `getCurrentMonth(accountSetId, userId)` 与 `getClosingOverview(query, userId)` **已经**在用传进来的
 * `userId` 判账套读权限。这四条合起来是同一个事实：**模块已经自窄，切面欠的只是身份**。
 *
 * <p><b>只欠的那一半：让判权用的 `userId` 就是正在行动的那个人。</b>工具路径不经过 controller、也不经过宿主的
 * 安全上下文；模块的判权只看它收到的那个 `Long userId`。故本通知在**有工具发布了调用方**时，把两个读的最后一个
 * 实参（`userId`）钉成 `ActingCaller.current()`——模块照自己的判权跑，只是它问的那个人由切面保证。请求路径上
 * `ActingCaller` 为空，本通知**原样放行**，REST 行为与上游一字不差。
 *
 * <p>**声明的收窄：读侧它与模块相等，不更严也不更宽。** 同一个账套判权、同一个 `userId`，只是这个 `userId` 由切面
 * 钉住。更窄的是**工具面**、不是切面：工具只解析调用方**默认（其次第一个）**账套，于是 AI 只问得到一个账套的结账
 * 状态，而模块本身答得出调用方所属的每一个账套——那句收窄写在 {@link FmsClosingPeriodTools} 的类注释里。
 *
 * <p><b>哪些路不在切点里，以及为什么。</b>切点**就是**这份清单，故边界要写出来：
 * {@code validatePeriodOpen} / {@code isPeriodClosed(accountSetId, 时间或月)} / {@code getCurrentMonth(accountSetId,
 * startTime)} 是**别的业务在用的内部校验口**（凭证的新增、修改、整理、移动，结转凭证生成，报表与首页取当前期间）；
 * 它们没有 `userId`，把它们钉到行动调用方上会让一次正常的凭证保存因为「没有行动调用方」而失败，**收窄绝不能把这类
 * 内部调用弄坏**。其中只有 {@code getCurrentMonth(accountSetId, startTime)} 与 {@code getCurrentMonth(accountSetId,
 * userId)} 同名，故它落在点切里，但按最后一个实参的**运行时类型**（时间戳不是 `Long`）原样放行——前两个方法名不同，
 * 根本不在点切里。{@code getProfitLossBalance} 是资产负债表报表内部的取数口，不是端点、也没有工具，故同样不在切点里
 * （它自身不判权，判权在它的调用方）。{@code closePeriod} / {@code cancelClosePeriod} 也**不在**：本面**不声明**
 * 结账与反结账的工具，故没有需要收的路径；若将来加了那条工具，点切与本清单必须一起长。
 *
 * <p><b>没有补偿器，是一个事实而不是欠账。</b>本面无写：结账与反结账都没有工具，故没有可撤回的效果。这也是选择
 * **只做读**的理由——结账会锁住一个会计期间，反结账要对已经关账的账再来一次，两者都该由人在控制台里、看着结账
 * 概况做；AI 需要的恰恰是**读**：这个月差哪几项才能结。
 *
 * FMS's seam over the closing period ({@code fms_closing_period}) — M2's first object whose owner is
 * **neither a row column nor an argument**. The form it exists to test is this: the owner is the
 * **module's own account-set authorisation** ({@code FmsAccountSetService.validateAccountSetReadPermission}
 * / {@code validateAccountSetWritePermission}, against the level in {@code fms_account_user}). CRM's owner
 * is a row column, BPM's is a service argument, the FMS voucher's is a filter the module's query already
 * honours — none of those three is here.
 *
 * <p><b>The four answers, read out of the code, put it in §4.3's third case.</b> (1) This service has **no
 * whole-table page**; its only list-shaped read is {@code getClosingOverview}, which **requires** an
 * {@code accountSetId} (the VO marks it {@code @NotNull}) and answers for **one account set and one
 * period** — a null does not cross account sets, it fails first in {@code validateAccountSetExists}.
 * (2) There is no by-id read; {@code isPeriodClosed(accountSetId, month)} is an **internal validation
 * gate** that checks no permission and takes no {@code userId}. (3) {@code closePeriod} and
 * {@code cancelClosePeriod} both go through {@code validateAccountSetWritePermission(accountSetId, userId)}
 * and {@code lockAccountSet}, with {@code userId} an explicit argument; those who may close are members
 * with a writable level, and REST additionally carries the controller's
 * {@code @PreAuthorize('fms:closing:close' / ':cancel')}. (4) The module's own
 * {@code getCurrentMonth(accountSetId, userId)} and {@code getClosingOverview(query, userId)} **already**
 * check account-set read permission with the {@code userId} they were handed. Those four are one fact:
 * **the module already narrows, and the advice owes only identity**.
 *
 * <p><b>The half it owes: the {@code userId} the check uses is the person acting.</b> The tool path goes
 * through neither the controller nor the host's security context, and the module's check only reads the
 * {@code Long userId} it receives. So when a tool has published a caller, this advice pins the last
 * argument ({@code userId}) of both reads to {@code ActingCaller.current()} — the module still runs its
 * own check; the advice only guarantees it asks about the acting person. On the request path
 * {@code ActingCaller} is empty and the advice **lets the call through untouched**, so REST behaves
 * exactly as upstream does.
 *
 * <p><b>Declared narrowing: on the read side it is equal to the module — no stricter, no wider.** Same
 * account-set check, same {@code userId}; only the {@code userId} is pinned. The narrower half is the
 * **tool face**, not the advice: the tool resolves only the caller's **default (else first)** account
 * set, so the AI can ask about one account set while the module itself can answer for every account set
 * the caller belongs to. That sentence lives in {@link FmsClosingPeriodTools}'s class comment.
 *
 * <p><b>Which paths are not in the pointcuts, and why.</b> The pointcuts **are** that list, so the
 * boundary is written out: {@code validatePeriodOpen}, {@code isPeriodClosed(accountSetId, time or
 * month)} and {@code getCurrentMonth(accountSetId, startTime)} are **internal validation gates other
 * business uses** (voucher create / update / tidy / move, closing-voucher generation, and the home and
 * report faces asking for the current period); they take no {@code userId}, and pinning them to the
 * acting caller would make a perfectly normal voucher save fail for "no acting caller" — **a narrowing
 * must never break those internal calls**. Only {@code getCurrentMonth(accountSetId, startTime)} shares
 * its name with {@code getCurrentMonth(accountSetId, userId)}, so it is admitted by the pointcut and let
 * through by the **runtime type** of its last argument (a timestamp is not a {@code Long}); the other two
 * have different names and are not in the pointcut at all. {@code getProfitLossBalance} is the balance-sheet report's internal data
 * port, not an endpoint and not a tool, so it is out for the same reason (it does not check permission
 * itself; its callers do). {@code closePeriod} and {@code cancelClosePeriod} are out too: this face
 * **declares no tools** for closing or cancelling, so there is no path to narrow; if that tool is added
 * later, the pointcut and this list have to grow together.
 *
 * <p><b>No compensator, and that is a fact rather than a debt.</b> This face has no write: closing and
 * cancelling have no tools, so there is no effect to revoke. That is also why it is **read-only** —
 * closing locks an accounting period and cancelling opens an already-closed book; both belong to a person
 * in the console with the overview in front of them. What the AI needs is exactly the **read**: which
 * checks still block this month.
 */
@Aspect
@Component
public class FmsClosingPeriodGovernance implements GovernedModule {

    /**
     * There is no owner column here: the module authorises by **account set**, through its own
     * {@code fms_account_user} table. Saying so is the answer rather than leaving the field blank —
     * {@link GovernedModule#ownerField()} assumes one field, and this object has none.
     *
     * 这里没有属主列：模块按**账套**授权，凭它自己的 `fms_account_user` 表。把这一点说出来本身就是答案——
     * {@link GovernedModule#ownerField()} 假定一个字段，而这个对象没有。
     */
    @Override
    public String ownerField() {
        return "none (the module's own account-set permission)";
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "fms";
    }

    /**
     * The two reads that take a {@code userId}, each held to the acting caller when a tool published one.
     * The {@code userId} is the **last** argument of both. {@code getCurrentMonth} has a second overload
     * ({@code accountSetId, startTime}) that is an internal gate, not a person-facing read; the two are
     * told apart here by the **runtime type** of the last argument rather than by a parameter-type
     * pattern in the pointcut — a timestamp is left alone.
     *
     * 两个带 `userId` 的读，在**有工具发布了调用方**时各自被钉到行动调用方上。两者的 `userId` 都是**最后一个**
     * 实参。`getCurrentMonth` 还有另一个重载（`accountSetId, startTime`），那是内部校验口、不是面向人的读；
     * 两者在这里按**最后一个实参的运行时类型**区分，而不是靠点切里的参数类型模式——时间戳原样放行。
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService.getClosingOverview(..))"
            + " || execution(* cn.iocoder.yudao.module.fms.service.closing.FmsClosingPeriodService.getCurrentMonth(..))")
    public Object pinCallerToTheModule(ProceedingJoinPoint call) throws Throwable {
        String caller = ActingCaller.current();
        if (caller == null) {
            // The host's own request path: the controller has already named the login user.
            // 宿主自己的请求路径：controller 已经点名了登录用户。
            return call.proceed();
        }
        Long acting = asId(caller);
        if (acting == null) {
            // 有行动调用方却指不出本地用户编号：拒绝。判据读不出来不放行——与 `YudaoToolPermissions` 同一条纪律。
            // 没有行动调用方是另一回事（见上）：那是请求路径，controller 已经点过名。
            // An acting caller whose id is not a local user is refused: a check that cannot be read does not
            // become permission, the same discipline as `YudaoToolPermissions`. Having no acting caller at
            // all is the other case (above): the request path, where the controller has already named the user.
            throw new RuleDeniedException(null,
                    "not permitted: the acting caller is not a local user id",
                    "FmsClosingPeriod", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
        Object[] args = call.getArgs();
        if (args.length == 0 || !(args[args.length - 1] instanceof Long)) {
            // `getCurrentMonth(accountSetId, startTime)`：内部校验口，最后那个实参是时间戳而不是人。
            // `getCurrentMonth(accountSetId, startTime)`: an internal gate whose last argument is a timestamp, not a person.
            return call.proceed();
        }
        Object[] pinned = args.clone();
        pinned[pinned.length - 1] = acting;
        return call.proceed(pinned);
    }

    private static Long asId(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
