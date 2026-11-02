// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * FMS 在期初余额（`fms_initial_balance`）上的接缝。它是本批六个对象里**唯一持真实业务行**、且**有面向人的读**
 * 的那一个：科目表、凭证模板、结账方案、结账模板是管理面维护的配置，结账凭证面只有内部端口与生成动作（各见账本理由）。
 *
 * <p><b>四问的答案，读出来之后归到 §4.3 的第三种。</b>
 * ① 这个 service **没有全表分页**：唯一的列表读 `getInitialBalanceList(accountSetId, subjectType, userId)` 必须带
 * {@code accountSetId}，答的是**一个账套**的期初余额，按科目层级平铺；传 null 不是在读全表，而是先在
 * `getSubjectList` 的账套读权限上被拒；
 * ② 没有按 id 的读 —— 期初余额按**科目**组织，行由科目编号定位，而所有入口都是账套级的；
 * ③ 写有两条：`saveInitialBalance` 与 `importInitialBalance`，都先走
 * `validateAccountSetWritePermission(accountSetId, userId)`，`saveInitialBalance` 再走 `validateAccountSetEditable`
 * （账套已初始化且期间未关账）；REST 上还叠着 `fms:config:initial-balance:update` / `:import` 两条权限码；
 * ④ 模块自己的 `getInitialBalanceList` 与 `getTrialBalance` **已经**在用传进来的 `userId` 判账套读权限。四条合起来
 * 是同一个事实：**模块已经自窄，切面欠的只是身份**。
 *
 * <p><b>只欠的那一半：让判权用的 `userId` 就是正在行动的那个人。**工具路径不经过 controller、也不经过宿主的安全上下文；
 * 模块的判权只看它收到的那个 `Long userId`。故本通知在**有工具发布了调用方**时，把两个读的最后一个实参（`userId`）
 * 钉成 `ActingCaller.current()` —— 模块照自己的判权跑，只是它问的那个人由切面保证。请求路径上 `ActingCaller` 为空，
 * 本通知**原样放行**，REST 行为与上游一字不差。
 *
 * <p>**声明的收窄：读侧它与模块相等，不更严也不更宽。**同一个账套判权、同一个 `userId`，只是这个 `userId` 由切面钉住。
 * 更窄的是**工具面**、不是切面：{@link FmsInitialBalanceTools} 只解析调用方**默认（其次第一个）**账套，而模块本身答得出
 * 调用方所属的每一个账套 —— 那句话写在该工具类的注释里。
 *
 * <p><b>哪些路不在切点里，以及为什么。</b>切点**就是**这份清单，故边界要写出来：`saveInitialBalance` /
 * `importInitialBalance` 是**写**，本面**不声明**写的工具（期初余额是建账时一次性录入的一批数，由人在控制台逐科目填或
 * 从 Excel 导入；把它交给对话去写，等于让 AI 改一本还没开张的账），故没有需要收的路径——若将来加了那条工具，点切与本
 * 清单必须一起长。`getInitialBalanceCountBySubjectIds` / `getInitialBalanceQuantityCountBySubjectIds` /
 * `updateInitialBalanceSubject` / `getInitialBalanceCountByAuxiliaryItemIds` /
 * `getInitialBalanceCountByAuxiliaryTypeId` 是**别的业务在用的内部口**（科目删除前的引用检查、科目迁移、辅助核算配置），
 * 它们没有 `userId`，把它们钉到行动调用方上会让一次正常的科目保存因为「没有行动调用方」而失败。
 *
 * <p><b>被别的业务借用的那个读。</b>`getTrialBalance(accountSetId, userId)` 同时被资产负债表检查与结账概况内部调用，
 * 两者都把它收到的那个 `userId` 原样传下去 —— 在工具路径上那就是行动调用方本人，故钉住它不改变那些内部调用的结果；
 * 它不改变的是**它们问的是谁**这一点，而那正是本切面要保证的。
 *
 * <p><b>没有补偿器，是一个事实而不是欠账。</b>本面无写，故没有可撤回的效果。这也是选择**只做读**的理由：AI 在这里需要的
 * 恰恰是读 —— 这本账的期初平不平、差多少。
 *
 * FMS's seam over the opening balances ({@code fms_initial_balance}). It is the one object of this batch of six
 * that **holds real business rows** and **has a person-facing read**: the chart of accounts, the voucher
 * templates, the closing schemes and the closing templates are configuration maintained in the console, and
 * the closing-voucher face has only internal ports and generation actions (each recorded in the ledger's own
 * words).
 *
 * <p><b>The four answers, read out of the code, put it in §4.3's third case.</b> (1) This service has **no
 * whole-table page**: its only list read, {@code getInitialBalanceList(accountSetId, subjectType, userId)},
 * requires an {@code accountSetId} and answers for **one account set**, flattened over the subject tree; a
 * null is not a full-table read — it is refused first by the subject read's account-set check. (2) There is
 * no read by id: opening balances are organised by **subject**, located by subject id, and every entry point
 * is account-set scoped. (3) There are two writes, {@code saveInitialBalance} and
 * {@code importInitialBalance}; both go through
 * {@code validateAccountSetWritePermission(accountSetId, userId)}, and the former then through
 * {@code validateAccountSetEditable} (initialised, period not closed); REST stacks
 * {@code fms:config:initial-balance:update} / {@code :import} on top. (4) The module's own
 * {@code getInitialBalanceList} and {@code getTrialBalance} **already** check account-set read permission with
 * the {@code userId} they were handed. Those four are one fact: **the module already narrows, and the advice
 * owes only identity**.
 *
 * <p><b>The half it owes: the {@code userId} the check uses is the person acting.</b> The tool path goes
 * through neither the controller nor the host's security context, and the module's check only reads the
 * {@code Long userId} it receives. So when a tool has published a caller, this advice pins the last argument
 * ({@code userId}) of both reads to {@code ActingCaller.current()} — the module still runs its own check; the
 * advice only guarantees it asks about the acting person. On the request path {@code ActingCaller} is empty
 * and the advice **lets the call through untouched**, so REST behaves exactly as upstream does.
 *
 * <p><b>Declared narrowing: on the read side it is equal to the module — no stricter, no wider.** Same
 * account-set check, same {@code userId}; only the {@code userId} is pinned. The narrower half is the **tool
 * face**, not the advice: {@link FmsInitialBalanceTools} resolves only the caller's **default (else first)**
 * account set, while the module itself can answer for every account set the caller belongs to. That sentence
 * lives in the tool class's own comment.
 *
 * <p><b>Which paths are not in the pointcuts, and why.</b> The pointcuts **are** that list, so the boundary is
 * written out: {@code saveInitialBalance} and {@code importInitialBalance} are **writes**, and this face
 * **declares no write tool** (opening balances are a batch entered once when the books are opened — filled per
 * subject in the console or imported from Excel; handing that to a conversation would let the AI edit a book
 * that has not opened yet), so there is no path to narrow; if that tool is added later, the pointcut and this
 * list have to grow together. {@code getInitialBalanceCountBySubjectIds},
 * {@code getInitialBalanceQuantityCountBySubjectIds}, {@code updateInitialBalanceSubject},
 * {@code getInitialBalanceCountByAuxiliaryItemIds} and {@code getInitialBalanceCountByAuxiliaryTypeId} are
 * **internal ports other business uses** (the reference check before deleting a subject, subject migration,
 * auxiliary-accounting configuration); they take no {@code userId}, and pinning them to the acting caller
 * would make a perfectly normal subject save fail for "no acting caller".
 *
 * <p><b>The read other business borrows.</b> {@code getTrialBalance(accountSetId, userId)} is also called
 * internally by the balance-sheet check and by the closing overview, and both pass the {@code userId} they
 * received straight down — on the tool path that is the acting caller, so pinning it changes none of those
 * results; what it does not change is **whom they ask**, and that is exactly what this advice guarantees.
 *
 * <p><b>No compensator, and that is a fact rather than a debt.</b> This face has no write, so there is no
 * effect to revoke. That is also why it is **read-only**: what the AI needs here is exactly the read — is
 * this book's opening balance square, and by how much is it off.
 */
@Aspect
@Component
public class FmsInitialBalanceGovernance implements GovernedModule {

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
     * The two reads that take a {@code userId}, each held to the acting caller when a tool published one. The
     * {@code userId} is the **last** argument of both.
     *
     * 两个带 `userId` 的读，在**有工具发布了调用方**时各自被钉到行动调用方上。两者的 `userId` 都是**最后一个**实参。
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.config.FmsInitialBalanceService.getTrialBalance(..))"
            + " || execution(* cn.iocoder.yudao.module.fms.service.config.FmsInitialBalanceService.getInitialBalanceList(..))")
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
                    "FmsInitialBalance", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
        Object[] args = call.getArgs();
        if (args.length == 0 || !(args[args.length - 1] instanceof Long)) {
            // 两个读的最后一个实参都是 `userId`；真遇到不是的，原样放行而不是猜。
            // Both reads end in a `userId`; anything else is let through rather than guessed at.
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
