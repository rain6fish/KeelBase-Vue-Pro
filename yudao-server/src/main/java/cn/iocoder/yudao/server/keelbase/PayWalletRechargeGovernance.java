// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletRechargeDO;
import cn.iocoder.yudao.module.pay.dal.mysql.wallet.PayWalletMapper;
import java.util.Objects;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pay 在钱包充值单（`pay_wallet_recharge`）上的接缝——M3 里**属主不在这一行上**的对象：行里只有 `wallet_id`，
 * 属主对在 `pay_wallet` 那一行（`user_id` + `user_type`）。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>{@code PayWalletRechargeDO} 的列里没有 `user_id` / `user_type`，只有 `wallet_id`（注释写明
 *       关联 {@link PayWalletDO#getId()}）。属主因此要在**一跳之外**判：沿 `wallet_id` 读回钱包行，比它的
 *       `(user_id, user_type)`——两个编号空间会撞号，与钱包、支付单、钱包流水同一条理由。本宿主的 AI 调用方是
 *       管理端用户，故要钉的属主对是「行动调用方 + 管理员」。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getWalletRechargePackagePage(userId, userType, pageReqVO, payStatus)}
 *       先经 {@code getOrCreateWallet(userId, userType)} 换一个 `walletId`，再 `selectPage(walletId, …)`。
 *       属主位**不是查询条件**：它来自一次**可能插行**的读（钱包不存在时会建一个）。</li>
 *   <li><b>按标识符读是否收窄。</b>本件补上的 {@code getWalletRecharge(Long id)} 是裸的 {@code selectById}，
 *       返回整行、不判属主——这是**模块口**的语义，与钱包流水那两个口一致。属主判定留给本切面，只在工具路径上做。</li>
 *   <li><b>写查什么权限。</b>写口（创建充值、更新已支付、发起退款、更新已退款）都是内部流程或渠道回调，没有
 *       「只改调用方自己那一行」的语义，也没有面向 AI 的写工具。故本面**只读**，不发明一个写来把接缝凑完整。</li>
 * </ol>
 *
 * <p><b>为什么拒绝分页，而不是事后过滤。</b>分页的钱包编号由 `getOrCreateWallet` 解析——一次「读」在工具路径上
 * 可能插一行，且没有审计。故本面在工具路径上**不开分页**：不是收窄它，是不声明它；若将来有人加一条工具走分页，
 * 这里的通知会**拒绝**。
 *
 * <p><b>接法：按标识符读 + 事后属主判定。</b>调用方以它本来就知道的标识点名一行（充值单编号）；本通知把该行的
 * `wallet_id` 读回钱包行，比对 `(user_id, user_type)`，不是调用方的就**交回 null**——与「这一行不存在」同一个答案。
 * 钱包行读不回来（悬空的 `wallet_id`、已删）也算「不是调用方的」：工具路径不交出无法归属的行。**它可被证伪**：
 * 两个调用方各一行、加一个不存在的标识，A 问 B 的充值单与 A 问不存在的充值单必须得到同一答案，而 A 问自己的
 * 必须拿到自己的业务事实；不接时第一条会拿到 B 的充值单。
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空说明调用来自工具：没有请求、没有登录用户，
 * 模块自己的权限注解一条都不经过。请求路径上它为空，本通知**原样放行**，APP 端（按登录用户自己的钱包分页）的
 * 行为与上游一致。这是**声明的收窄**：工具面只答调用方自己的充值单。
 *
 * <p>pay's seam over the wallet recharge ({@code pay_wallet_recharge}) — M3's object whose **owner is not on the
 * row**: the row carries only {@code wallet_id}, and the owner pair lives on the {@code pay_wallet} row.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) The recharge DO has no {@code user_id} /
 * {@code user_type}; its {@code wallet_id} is documented to refer to {@link PayWalletDO#getId()}. The owner is
 * therefore decided **one hop away**: read the wallet back by {@code wallet_id} and compare its
 * {@code (user_id, user_type)} — two id spaces that collide, the same reason as the wallet and the order. (2) The
 * page resolves a wallet id through {@code getOrCreateWallet} and then {@code selectPage}s — the owner slot is not a
 * query condition but a read that may insert a row. (3) The read this item adds, {@code getWalletRecharge(Long id)},
 * is a bare {@code selectById} and returns the whole row; deciding the owner is left to this aspect, on the tool path
 * only. (4) The writes are internal flows or channel callbacks with no "change only the caller's own row" meaning and
 * no AI write tool. So this face is **read-only**.
 *
 * <p><b>Why the page is refused rather than post-filtered.</b> Its wallet id is produced by {@code getOrCreateWallet}
 * — a read that may insert a row on the tool path, with no audit. The page is therefore **not offered** on the tool
 * path, and if a tool ever calls it, this advice refuses it.
 *
 * <p><b>The form: read by identifier, then decide the owner.</b> The caller names one row by its recharge id; this
 * advice follows {@code wallet_id} to the wallet row and compares {@code (user_id, user_type)}, handing back
 * {@code null} for another's row — the same answer as "this row does not exist". A wallet that cannot be read back is
 * not the caller's either. **It is falsifiable** with one row per caller and one missing id.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means a **tool** made the call: no
 * request, no login user, and none of the module's permission annotations runs. On the request path it is null and the
 * call passes through, so the app endpoint behaves exactly as upstream. This is a **declared narrowing**: the tool
 * face answers the caller's own recharges only.
 */
@Aspect
@Component
public class PayWalletRechargeGovernance implements GovernedModule {

    private final PayWalletMapper wallets;

    public PayWalletRechargeGovernance(PayWalletMapper wallets) {
        this.wallets = wallets;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "pay";
    }

    /**
     * 读者能据此查表的列：充值单行带的是 `wallet_id`，属主对在**一跳之外**的 `pay_wallet` 上。
     *
     * The row column a reader can look up: the recharge carries {@code wallet_id}, and the owner pair is one hop
     * away on {@code pay_wallet}. Naming the pair here would name a column this table does not have.
     */
    @Override
    public String ownerField() {
        return "wallet_id";
    }

    /**
     * 按标识符读：把该行的钱包读回来、比属主对。别人的充值单——包括钱包读不回来的那些——**什么都不交回**。
     *
     * Every read by identifier: the row's wallet is read back and its owner pair compared. Another person's recharge
     * — including one whose wallet cannot be read back — comes back as nothing.
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletRechargeService.getWalletRecharge(..))")
    public Object withholdOthersRecharge(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof PayWalletRechargeDO recharge)) {
            return row;
        }
        return mine(recharge, caller) ? row : null;
    }

    /**
     * 分页没有可钉的属主位——它过滤用的钱包编号来自一次**可能插行**的读。故在工具路径上**拒绝**而不是作答。
     * 请求路径一字不动。
     *
     * The page has no owner slot to pin — the wallet id it filters on is produced by a read that may insert a row.
     * On the tool path it is refused rather than answered; the request path is untouched.
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletRechargeService.getWalletRechargePackagePage(..))")
    public Object refuseThePageOnTheToolPath(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            return call.proceed();
        }
        throw new RuleDeniedException(null,
                "not permitted: the wallet-recharge page is not on the tool face",
                "PayWalletRecharge", call.getSignature().getName(),
                "请改用充值单编号查一条；分页靠 getOrCreateWallet 解析钱包，那不是一次读");
    }

    private boolean mine(PayWalletRechargeDO recharge, Long caller) {
        if (recharge.getWalletId() == null) {
            return false;
        }
        PayWalletDO wallet = wallets.selectById(recharge.getWalletId());
        return wallet != null
                && Objects.equals(wallet.getUserId(), caller)
                && Objects.equals(wallet.getUserType(), UserTypeEnum.ADMIN.getValue());
    }

    /**
     * 行动调用方的本地用户编号；**没有**行动调用方（即请求路径）时为 {@code null}。有行动调用方却指不出本地编号时
     * **拒绝**而不是放行——读不出来的判据不会变成许可，与其它模块面同一条纪律。
     *
     * The acting caller as a local user id, or {@code null} when there is none — the request path. An acting caller
     * that is not a local user id is refused rather than passed through: a check that cannot be read does not become
     * permission, the same discipline the other module faces keep.
     */
    private static Long actingCaller(ProceedingJoinPoint call) {
        String caller = ActingCaller.current();
        if (caller == null) {
            return null;
        }
        try {
            return Long.valueOf(caller);
        } catch (NumberFormatException notAnId) {
            throw new RuleDeniedException(null,
                    "not permitted: the acting caller is not a local user id",
                    "PayWalletRecharge", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
