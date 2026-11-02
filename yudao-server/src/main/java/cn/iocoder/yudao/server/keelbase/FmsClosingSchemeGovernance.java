// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * FMS 在结账方案（`fms_closing`）上的接缝。方案本身是**配置**（哪些科目怎么结转、按什么比例、用哪个凭证字），
 * 但它的那个**面向人的读**是运营性的：`getClosingSchemeList(queryReqVO, userId)` 按方案给出**本期的待结转金额**与
 * **本期已生成的凭证编号**——「这个月还有哪些方案没结转、各多少」正是结账前要问的那一句。
 *
 * <p><b>它与结账概况不是同一个问题，这一点有代码为证。</b>结账概况的 `canClose` 只查**结转损益**那一个方案有没有
 * 生成凭证（`FmsClosingPeriodServiceImpl` 取 `PROFIT_LOSS` 那行比对 `closingVouchers`），**常规结转方案**的生成状态
 * 根本不在那几项检查里。于是「哪些常规结转还没做、金额多少」今天没有任何别的面答得出——这条读补的就是它。
 *
 * <p><b>四问的答案，读出来之后归到 §4.3 的第三种。</b>
 * ① 没有全表分页：唯一的列表读必须带 {@code accountSetId} 与 {@code month}（VO 上都是必填），只答**一个账套的一个期间**；
 * ② 没有按 id 的读 —— 内部按 id 取方案的口（`validateClosingSchemeExists`）不收 `userId`、也不判权，判权在它的调用方；
 * ③ 五条写（`saveProfitLossSettings` / `createClosingScheme` / `updateClosingScheme` /
 * `updateSpecialClosingSettings` / `deleteClosingScheme`）都先走 `validateAccountSetWritePermission(accountSetId,
 * userId)`，REST 上再叠 `fms:closing:update`；
 * ④ 模块自己的 `getClosingSchemeList` **已经**在用传进来的 `userId` 判账套读权限。四条合起来是同一个事实：
 * **模块已经自窄，切面欠的只是身份**。
 *
 * <p><b>只欠的那一半：让判权用的 `userId` 就是正在行动的那个人。</b>工具路径不经过 controller、也不经过宿主的
 * 安全上下文；模块的判权只看它收到的那个 `Long userId`。故本通知在**有工具发布了调用方**时，把这条读的最后一个实参
 * （`userId`）钉成 `ActingCaller.current()`。请求路径上 `ActingCaller` 为空，本通知**原样放行**，REST 行为与上游一字不差。
 *
 * <p>**声明的收窄：读侧它与模块相等，不更严也不更宽。**同一个账套判权、同一个 `userId`，只是这个 `userId` 由切面钉住。
 * 更窄的是**工具面**、不是切面：{@link FmsClosingSchemeTools} 只解析调用方**默认（其次第一个）**账套，而模块本身答得出
 * 调用方所属的每一个账套 —— 那句话写在该工具类的注释里。
 *
 * <p><b>哪些路不在切点里，以及为什么。</b>切点**就是**这份清单，故边界要写出来：五条写**不在**——本面**不声明**写的工具
 * （改结转规则、改损益结转设置、删方案都是配置动作，由人在控制台做），故没有需要收的路径；若将来加了那条工具，点切与
 * 本清单必须一起长。`initializeDefaultClosingSchemes` / `getClosingSchemeByAccountSetIdAndType` /
 * `validateClosingSchemeExists` / `getClosingSchemeCountBySubjectIds` / `getClosingSchemeCountByVoucherWordId` 是
 * **别的业务在用的内部口**（账套初始化、结账概况取损益方案、生成结转凭证时的方案校验、科目与凭证字删除前的引用检查），
 * 它们没有 `userId`，把它们钉到行动调用方上会让一次正常的删除或生成因为「没有行动调用方」而失败。
 *
 * <p><b>没有补偿器，是一个事实而不是欠账。</b>本面无写，故没有可撤回的效果。
 *
 * FMS's seam over the closing schemes ({@code fms_closing}). The scheme itself is **configuration** (which
 * subjects transfer how, at what ratio, under which voucher word), but its one **person-facing read** is
 * operational: {@code getClosingSchemeList(queryReqVO, userId)} answers, per scheme, the **amount still to be
 * transferred this period** and the **voucher ids already generated for it** — "which schemes are still
 * outstanding this month, and for how much" is exactly the question asked before closing.
 *
 * <p><b>It is not the same question as the closing overview, and the code says so.</b> The overview's
 * {@code canClose} only checks whether the **profit-loss** scheme produced its voucher
 * ({@code FmsClosingPeriodServiceImpl} picks the {@code PROFIT_LOSS} row out of {@code closingVouchers}); the
 * generation state of the **regular** closing schemes is not among those checks at all. So "which regular
 * transfers are still outstanding, for how much" has no other face to answer it today — and this read supplies
 * precisely that.
 *
 * <p><b>The four answers, read out of the code, put it in §4.3's third case.</b> (1) No whole-table page: the
 * one list read requires both an {@code accountSetId} and a {@code month} (both required on the VO) and answers
 * for **one account set and one period**. (2) No read by id — the internal by-id port
 * ({@code validateClosingSchemeExists}) takes no {@code userId} and checks no permission; its callers do.
 * (3) All five writes ({@code saveProfitLossSettings}, {@code createClosingScheme},
 * {@code updateClosingScheme}, {@code updateSpecialClosingSettings}, {@code deleteClosingScheme}) go through
 * {@code validateAccountSetWritePermission(accountSetId, userId)} first, with REST stacking
 * {@code fms:closing:update} on top. (4) The module's own {@code getClosingSchemeList} **already** checks
 * account-set read permission with the {@code userId} it was handed. Those four are one fact: **the module
 * already narrows, and the advice owes only identity**.
 *
 * <p><b>The half it owes: the {@code userId} the check uses is the person acting.</b> The tool path goes
 * through neither the controller nor the host's security context, and the module's check only reads the
 * {@code Long userId} it receives. So when a tool has published a caller, this advice pins the last argument
 * ({@code userId}) of this read to {@code ActingCaller.current()}. On the request path {@code ActingCaller} is
 * empty and the advice **lets the call through untouched**, so REST behaves exactly as upstream does.
 *
 * <p><b>Declared narrowing: on the read side it is equal to the module — no stricter, no wider.** Same
 * account-set check, same {@code userId}; only the {@code userId} is pinned. The narrower half is the **tool
 * face**, not the advice: {@link FmsClosingSchemeTools} resolves only the caller's **default (else first)**
 * account set, while the module itself can answer for every account set the caller belongs to. That sentence
 * lives in the tool class's own comment.
 *
 * <p><b>Which paths are not in the pointcuts, and why.</b> The pointcuts **are** that list, so the boundary is
 * written out: the five writes are **out** — this face **declares no write tool** (editing the transfer rules,
 * the profit-loss settings or deleting a scheme are configuration actions a person performs in the console), so
 * there is no path to narrow; if that tool is added later, the pointcut and this list have to grow together.
 * {@code initializeDefaultClosingSchemes}, {@code getClosingSchemeByAccountSetIdAndType},
 * {@code validateClosingSchemeExists}, {@code getClosingSchemeCountBySubjectIds} and
 * {@code getClosingSchemeCountByVoucherWordId} are **internal ports other business uses** (account-set
 * initialisation, the overview picking the profit-loss scheme, scheme validation while generating closing
 * vouchers, the reference checks before deleting a subject or a voucher word); they take no {@code userId}, and
 * pinning them to the acting caller would make a perfectly normal delete or generate fail for "no acting
 * caller".
 *
 * <p><b>No compensator, and that is a fact rather than a debt.</b> This face has no write, so there is no
 * effect to revoke.
 */
@Aspect
@Component
public class FmsClosingSchemeGovernance implements GovernedModule {

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
     * The one read that takes a {@code userId}, held to the acting caller when a tool published one. Its
     * {@code userId} is the **last** argument; the query rides in argument 0 and is left alone.
     *
     * 唯一带 `userId` 的读，在**有工具发布了调用方**时被钉到行动调用方上。它的 `userId` 是**最后一个**实参；
     * 查询条件在第 0 槽，原样不动。
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.closing.FmsClosingSchemeService.getClosingSchemeList(..))")
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
                    "FmsClosingScheme", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
        Object[] args = call.getArgs();
        if (args.length == 0 || !(args[args.length - 1] instanceof Long)) {
            // 这个读的最后一个实参是 `userId`；真遇到不是的，原样放行而不是猜。
            // This read ends in a `userId`; anything else is let through rather than guessed at.
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
