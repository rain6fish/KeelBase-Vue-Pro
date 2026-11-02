// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.controller.admin.wallet.vo.wallet.PayWalletPageReqVO;
import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletDO;
import java.util.Objects;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pay 在钱包（`pay_wallet`）上的接缝——M3 里**第一个把「属主」判成两列的对象**：`user_id` 配 `user_type`。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>{@code pay_wallet.user_id} 与 {@code user_type} 一起才是属主：{@code PayWalletDO} 的注释
 *       写明它分别关联 {@code MemberUserDO} 与 {@code AdminUserDO} 的 id，而**两套用户编号是两个命名空间、会撞号**
 *       （会员 42 与管理员 42 是两个人）。模块自己也这么认：唯一的按人取钱包的口是
 *       {@code selectByUserIdAndType(userId, userType)}。本宿主的 AI 调用方是管理端用户，故要钉的属主对是
 *       「行动调用方 + 管理员」。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getWalletPage(PayWalletPageReqVO)} 直接交给
 *       {@code PayWalletMapper.selectPage}，两个条件都是 {@code eqIfPresent}：都不给时**一个条件都不加**，
 *       「没有过滤」等于「本租户的每一行」，不是「没有行」。后者才是把人吓一跳的那一面。</li>
 *   <li><b>按 id 读是否收窄。</b>不收窄。{@code getWallet(Long walletId)} 就是一句
 *       {@code walletMapper.selectById(walletId)}，于是一个调用方可以点出别人的钱包。</li>
 *   <li><b>写查什么权限。</b>REST 上钱包唯一的写口是 {@code PUT /pay/wallet/update-balance}，叠着
 *       {@code pay:wallet:update-balance}；余额增减的另外两个服务口（{@code addWalletBalance} /
 *       {@code reduceWalletBalance}）由各业务模块在**自己的流程里**调用，不是端点。它们都不在切点里（见下）。</li>
 * </ol>
 *
 * <p><b>只欠的那一半：让「哪一行」由正在行动的人决定。</b>工具路径不经过 controller、也不经过宿主的安全上下文，
 * 模块的分页只会用它收到的两个字段。故本通知在**有工具发布了调用方**时，把分页请求的 {@code userId} 与
 * {@code userType} 钉成「行动调用方 + 管理员」，并把按 id 读到的别人的钱包**交回 null**——那正是「这一行不在这里」
 * 的答法。请求路径上 {@code ActingCaller} 为空，本通知**原样放行**，控制台的行为与上游一字不差。
 *
 * <p>**声明的收窄。** 模块自己的控制台读口给管理员按 {@code pay:wallet:query} 查**任意会员**的钱包——那是运营的
 * 工作；本切面在工具路径上只答**调用方自己在管理员命名空间里的那一个**。两者不是同一个问题，故这里更严、且更窄，
 * 写在 {@link PayWalletTools} 的类注释里，也写在控制台的边界页上。
 *
 * <p><b>哪些路不在切点里，以及为什么。</b>切点**就是**这份清单，故边界要写出来：
 * {@code getOrCreateWallet(userId, userType)} **看着像读、其实会建一行**（不存在时插入），把一个「读」变成没有审计的
 * 写——本面**不声明**调用它的工具，故它不在切点里；将来若加一条工具，那条工具不许走这个口，点切与本清单必须一起长。
 * 余额的六个写口（{@code orderPay} / {@code orderRefund} / {@code reduceWalletBalance} / {@code addWalletBalance} /
 * {@code freezePrice} / {@code unfreezePrice}）同理：本面没有写工具，它们属于模块自己的业务流程与控制台，不在这里收。
 *
 * <p>pay's seam over the wallet ({@code pay_wallet}) — M3's first object whose **owner is a pair of columns**:
 * {@code user_id} together with {@code user_type}.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) The owner is the pair: {@code PayWalletDO}'s
 * comment says {@code user_id} refers to a {@code MemberUserDO} id and to an {@code AdminUserDO} id, and those are
 * two namespaces that collide (member 42 and administrator 42 are different people). The module agrees: its only
 * person-shaped lookup is {@code selectByUserIdAndType(userId, userType)}. This host's AI callers are console
 * users, so the pair to pin is "the acting caller + administrator". (2) The page passes straight to
 * {@code PayWalletMapper.selectPage}, whose two conditions are {@code eqIfPresent}: with neither supplied, no
 * condition at all is added — "no filter" means **every row in this tenant**, not "no rows". (3) The read by id is
 * not narrowed: {@code getWallet(Long walletId)} is a bare {@code selectById}. (4) The only REST write is
 * {@code PUT /pay/wallet/update-balance} behind {@code pay:wallet:update-balance}; the two balance ports are called
 * by other business modules inside their own flows.
 *
 * <p><b>The half it owes: which row is decided by the person acting.</b> When a tool has published a caller, the
 * advice pins the page's {@code userId} and {@code userType} to "the acting caller + administrator", and hands back
 * {@code null} for another person's wallet read by id — which is exactly how a row that is not there answers. On the
 * request path {@code ActingCaller} is empty and the call passes through untouched, so the console behaves exactly
 * as upstream does.
 *
 * <p><b>Declared narrowing.</b> The module's console read lets an administrator behind {@code pay:wallet:query}
 * look up **any member's** wallet — operations work. On the tool path this advice answers only **the caller's own
 * wallet in the administrator namespace**. Different questions; this face is therefore stricter and narrower, and
 * both sentences are in {@link PayWalletTools} and on the console's boundary page.
 *
 * <p><b>Which paths are not in the pointcuts, and why.</b> {@code getOrCreateWallet(userId, userType)} **reads like
 * a read and inserts a row** when none exists — a read that writes with no audit. This face declares no tool that
 * calls it, so it is out; if such a tool is added later, it must not use that port, and the pointcut and this list
 * grow together. The six balance writes are out for the same reason: no write tool here, they belong to the
 * module's own flows and to the console.
 */
@Aspect
@Component
public class PayWalletGovernance implements GovernedModule {

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "pay";
    }

    /**
     * The owner is the pair {@code user_id} + {@code user_type}; this name is the column a reader can look up,
     * and the class comment states the second half so the pair is not misread as one id space.
     *
     * 属主是 {@code user_id} + {@code user_type} 这一对；这里写的是读者能据此查表的列名，第二半写在类注释里，
     * 以免被读成一个编号空间。
     */
    @Override
    public String ownerField() {
        return "user_id";
    }

    /**
     * The page, held to the caller's own wallet: both owner fields are overwritten, so a request that named someone
     * else cannot widen what the caller sees.
     *
     * 分页，收束到**调用方自己的钱包**：两个属主字段都被覆盖，故「传了别人的编号」也放宽不了调用方所见。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletService.getWalletPage(..))")
    public Object holdThePageToTheCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            // The host's own request path: the controller has already named the login user.
            // 宿主自己的请求路径：controller 已经点名了登录用户。
            return call.proceed();
        }
        Object[] args = call.getArgs();
        if (args.length >= 1 && args[0] instanceof PayWalletPageReqVO query) {
            query.setUserId(caller);
            query.setUserType(UserTypeEnum.ADMIN.getValue());
        }
        return call.proceed();
    }

    /**
     * The second way into the same rows: a read by id. Another person's wallet is handed back as nothing.
     *
     * 进入同一批行的**第二条路**：按 id 读。别人的钱包**什么都不交回**。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.wallet.PayWalletService.getWallet(..))")
    public Object withholdOthersWallet(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof PayWalletDO wallet)) {
            return row;
        }
        boolean mine = Objects.equals(wallet.getUserId(), caller)
                && Objects.equals(wallet.getUserType(), UserTypeEnum.ADMIN.getValue());
        return mine ? row : null;
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
                    "PayWallet", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
