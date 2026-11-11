// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletTransactionDO;
import cn.iocoder.yudao.module.pay.dal.mysql.wallet.PayWalletMapper;
import java.util.Objects;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pay 在钱包流水（`pay_wallet_transaction`）上的接缝——M3 里**属主不在这一行上**的对象：行里只有 `wallet_id`，
 * 属主对在 `pay_wallet` 那一行（`user_id` + `user_type`）。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>{@code PayWalletTransactionDO} 的列里没有 `user_id` / `user_type`，只有
 *       {@code wallet_id}（注释写明关联 {@link PayWalletDO#getId()}）。属主因此要在**一跳之外**判：沿
 *       `wallet_id` 读回钱包行，比它的 `(user_id, user_type)`——两个编号空间会撞号，与钱包、支付单同一条理由。
 *       本宿主的 AI 调用方是管理端用户，故要钉的属主对是「行动调用方 + 管理员」。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getWalletTransactionPage(PayWalletTransactionPageReqVO)} 先看
 *       {@code walletId}：给定了就直接用——**不再判它是不是调用方的**；没给且 `userId` + `userType` 都有，才走
 *       {@code getOrCreateWallet} 换一个 `walletId`。mapper 的条件只有 {@code eqIfPresent(walletId)}，所以
 *       「没有过滤」等于「本租户的每一行」。另一个重载收 (userId, userType) 两参，同样先走
 *       {@code getOrCreateWallet}。**两个口都把「读」变成了可能插一行的动作**：钱包不存在时
 *       {@code getOrCreateWallet} 会建一个。</li>
 *   <li><b>按标识符读是否收窄。</b>不收窄。{@code getWalletTransactionByNo(String)} 与
 *       {@code getWalletTransaction(String, PayWalletBizTypeEnum)} 都是裸的 {@code selectOne}，返回整行。</li>
 *   <li><b>写查什么权限。</b>唯一的写口 {@code createWalletTransaction(WalletTransactionCreateReqBO)} 收内部 BO，
 *       由钱包余额的增减流程调用；它没有「只改调用方自己那一行」的语义，也没有 REST 口。故本面**只读**，
 *       不发明一个写来把接缝凑完整。</li>
 * </ol>
 *
 * <p><b>为什么拒绝分页，而不是事后过滤。</b>两条理由，都在这份代码里：其一，分页的属主位**不是查询条件**，而是经
 * {@code getOrCreateWallet} 换出来的钱包编号——一次「读」在工具路径上可能插一行，且没有审计；其二，{@code walletId}
 * 一旦给出就**优先**于属主两列，事后过滤等于对一条拿别人钱包编号进来的查询放行。故本面在工具路径上**不开分页**：
 * 不是收窄它，是不声明它；若将来有人加一条工具走分页或统计，这里的通知会**拒绝**。
 *
 * <p><b>接法：按标识符读 + 事后属主判定。</b>调用方以它本来就知道的标识点名一行（流水号，或业务编号 + 业务类型）；
 * 本通知把该行的 {@code wallet_id} 读回钱包行，比对 {@code (user_id, user_type)}，不是调用方的就**交回 null**——与
 * 「这一行不存在」同一个答案。钱包行读不回来（悬空的 `wallet_id`、已删）也算「不是调用方的」：工具路径不交出无法
 * 归属的行。**它可被证伪**：两个调用方各一行、加一个不存在的标识，A 问 B 的流水与 A 问不存在的流水必须得到同一答案，
 * 而 A 问自己的流水必须拿到自己的业务事实；不接时第一条会拿到 B 的流水。
 *
 * <p><b>与「豁免」的差别。</b>豁免意味着工具面上根本没有这条路；本接缝意味着有一条路，且它在跨属主时的答案与
 * 「不存在」无法区分。前者读不到任何东西，后者读得到**自己的**那一行。
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空说明调用来自工具：没有请求、没有登录用户，
 * 模块自己的权限注解一条都不经过。请求路径上它为空，本通知**原样放行**，控制台（管理员按 {@code pay:wallet:query}
 * 查任意钱包的流水）的行为与上游一致。这是**声明的收窄**：工具面只答调用方自己的流水。
 *
 * <p>pay's seam over the wallet transaction ({@code pay_wallet_transaction}) — M3's object whose **owner is not on
 * the row**: the row carries only {@code wallet_id}, and the owner pair lives on the {@code pay_wallet} row.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) The transaction DO has no {@code user_id} /
 * {@code user_type}; its {@code wallet_id} is documented to refer to {@link PayWalletDO#getId()}. The owner is
 * therefore decided **one hop away**: read the wallet back by {@code wallet_id} and compare its
 * {@code (user_id, user_type)} — two id spaces that collide, the same reason as the wallet and the order. (2) The page
 * checks {@code walletId} first: when given it is used **without asking whether it is the caller's**; only when absent,
 * and only when both {@code userId} and {@code userType} are present, does it resolve one through
 * {@code getOrCreateWallet}. The mapper's only condition is {@code eqIfPresent(walletId)}, so "no filter" means every
 * row in this tenant. The other overload takes (userId, userType) and resolves the same way. **Both turn a read into
 * something that may insert a row.** (3) The reads by identifier are bare {@code selectOne} calls and return the whole
 * row. (4) The only write takes an internal BO and is called by the balance flows; it has no "change only the caller's
 * own row" meaning and no REST endpoint. So this face is **read-only**, and it does not invent a write to make the seam
 * look complete.
 *
 * <p><b>Why the page is refused rather than post-filtered.</b> Both reasons are in this code: the page's owner slot is
 * not a query condition but a wallet id produced by {@code getOrCreateWallet} — a read that may insert a row on the
 * tool path, with no audit; and a supplied {@code walletId} wins over the owner fields, so post-filtering would let a
 * query that named someone else's wallet through. The page is therefore **not offered** on the tool path — and if a
 * tool ever calls the page or the summary, this advice refuses it.
 *
 * <p><b>The form: read by identifier, then decide the owner.</b> The caller names one row by an identifier it already
 * knows (the transaction number, or a business id plus its type); this advice follows {@code wallet_id} to the wallet
 * row and compares {@code (user_id, user_type)}, handing back {@code null} for another's row — the same answer as
 * "this row does not exist". A wallet that cannot be read back (a dangling {@code wallet_id}, a deleted one) is not
 * the caller's either: a tool path may not hand out a row it cannot attribute. **It is falsifiable**: with one row per
 * caller and one missing identifier, asking for B's row and for the missing one must be observably identical, while
 * asking for one's own returns one's own business fact; without the seam the first read returns B's row.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means a **tool** made the call: no
 * request, no login user, and none of the module's permission annotations runs. On the request path it is null and the
 * call passes through, so the console (where an administrator behind {@code pay:wallet:query} may look at any
 * wallet's flows) behaves exactly as upstream. This is a **declared narrowing**: the tool face answers the caller's
 * own flows only.
 *
 * <p><b>What is not in the pointcuts.</b> {@code createWalletTransaction} takes an internal BO and is called by the
 * balance flows; this face declares no write, so it stays out. A future tool grows the pointcuts and the tool face
 * together.
 */
@Aspect
@Component
public class PayWalletTransactionGovernance implements GovernedModule {

    private final PayWalletMapper wallets;

    public PayWalletTransactionGovernance(PayWalletMapper wallets) {
        this.wallets = wallets;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "pay";
    }

    /**
     * The row column a reader can look up: the transaction carries {@code wallet_id}, and the owner pair is one hop
     * away on {@code pay_wallet}. Naming the pair here would name a column this table does not have.
     *
     * 读者能据此查表的列：流水行带的是 {@code wallet_id}，属主对在**一跳之外**的 {@code pay_wallet} 上。在这里写属主对
     * 等于点名一张本表没有的列。
     */
    @Override
    public String ownerField() {
        return "wallet_id";
    }

    /**
     * Every read by identifier: the row's wallet is read back and its owner pair compared. Another person's flow —
     * including one whose wallet cannot be read back — comes back as nothing.
     *
     * 每一条按标识符的读：把该行的钱包读回来、比属主对。别人的流水——包括钱包读不回来的那些——**什么都不交回**。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletTransactionService.getWalletTransactionByNo(..))"
            + " || execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletTransactionService.getWalletTransaction(..))")
    public Object withholdOthersTransaction(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof PayWalletTransactionDO transaction)) {
            return row;
        }
        return mine(transaction, caller) ? row : null;
    }

    /**
     * The page and the summary have no owner slot to pin — the wallet id they filter on is produced by a read that may
     * insert a row. On the tool path they are refused rather than answered; the console path is untouched.
     *
     * 分页与统计没有可钉的属主位——它们过滤用的钱包编号来自一次**可能插行**的读。故在工具路径上**拒绝**而不是作答。
     * 控制台路径一字不动。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletTransactionService.getWalletTransactionPage(..))"
            + " || execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletTransactionService.getWalletTransactionSummary(..))")
    public Object refuseManyRowsOnTheToolPath(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            return call.proceed();
        }
        throw new RuleDeniedException(null,
                "not permitted: the wallet-transaction page and summary are not on the tool face",
                "PayWalletTransaction", call.getSignature().getName(),
                "请改用流水号查一条；分页与统计靠 getOrCreateWallet 解析钱包，那不是一次读");
    }

    private boolean mine(PayWalletTransactionDO transaction, Long caller) {
        if (transaction.getWalletId() == null) {
            return false;
        }
        PayWalletDO wallet = wallets.selectById(transaction.getWalletId());
        return wallet != null
                && Objects.equals(wallet.getUserId(), caller)
                && Objects.equals(wallet.getUserType(), UserTypeEnum.ADMIN.getValue());
    }

    /**
     * The acting caller as a local user id, or {@code null} when there is none — the request path. An acting caller
     * that is not a local user id is refused rather than passed through: a check that cannot be read does not become
     * permission, the same discipline the other module faces keep.
     *
     * 行动调用方的本地用户编号；**没有**行动调用方（即请求路径）时为 {@code null}。有行动调用方却指不出本地编号时
     * **拒绝**而不是放行——读不出来的判据不会变成许可，与其它模块面同一条纪律。
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
                    "PayWalletTransaction", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
