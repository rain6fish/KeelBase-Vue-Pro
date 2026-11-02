// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.transfer.PayTransferDO;
import java.util.Objects;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pay 在转账单（`pay_transfer`）上的接缝——与支付单、退款单同形的第三个对象：**分页没有属主过滤位，接按标识符读 +
 * 事后判属主**。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>行上唯一的用户列是一对：{@code user_id} + {@code user_type}。注意**不是** {@code userName} /
 *       {@code userAccount}——那两列是收款人姓名与收款账号（微信场景下是 openid），是渠道侧的收款信息，不是本宿主的
 *       身份；{@code user_id}/{@code user_type} 才是这行归属于谁的那一对。两个编号空间撞号，故工具路径钉「行动调用方
 *       + 管理员」。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getTransferPage(PayTransferPageReqVO)} 交给
 *       {@code PayTransferMapper.selectPage}，条件全是 {@code eqIfPresent}，而 VO 只有 no / appId / channelCode /
 *       merchantOrderId / status / userName / userAccount / channelTransferNo / createTime——**没有属主位**（后两个
 *       userName / userAccount 是收款人，不是属主）。不给条件就是本租户每一行。</li>
 *   <li><b>按标识符读是否收窄。</b>不收窄。{@code getTransfer(Long)} 是 {@code selectById}，
 *       {@code getTransferByNo(String)} 是 {@code selectByNo}。</li>
 *   <li><b>写查什么权限。</b>没有属主作用域的写：{@code createTransfer} 收内部 DTO、{@code notifyTransfer} 是渠道
 *       回调、{@code syncTransfer} 是批处理。故本面**没有写工具**。</li>
 * </ol>
 *
 * <p><b>接法。</b>调用方以自己知道的标识（转账单号或编号）点名一行；本通知在工具路径上比对
 * {@code (user_id, user_type)}，不是调用方的就交回 {@code null}——与「这一行不存在」同一个答案。分页在工具路径上
 * **拒绝**（不是事后过滤），理由与支付单 / 退款单相同：删行会改变 {@code total} 与页的结构。
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空说明调用来自工具；请求路径上它为空，
 * 本通知原样放行，控制台（管理员按 {@code pay:transfer:query} 查任意转账单）与上游一致。这是**声明的收窄**。
 *
 * <p>pay's seam over the transfer ({@code pay_transfer}) — the third object shaped like the payment order and the
 * refund: **its page has no owner slot, so the face reads by identifier and decides the owner afterwards**.
 *
 * <p><b>The four answers, from the module's own code.</b> (1) The only user columns on the row are the pair
 * {@code user_id} + {@code user_type}. They are **not** {@code userName} / {@code userAccount}: those are the payee's
 * name and account (an openid in the WeChat case), channel-side receipt information rather than this host's identity;
 * the pair is what the row belongs to, and the two id spaces collide. (2) A page with no filter returns **every row in
 * the tenant**: {@code getTransferPage} passes to {@code PayTransferMapper.selectPage}, all conditions are
 * {@code eqIfPresent}, and the VO carries no / appId / channelCode / merchantOrderId / status / userName / userAccount /
 * channelTransferNo / createTime — **no owner slot**. (3) The reads by identifier are bare mapper queries. (4) None of
 * the writes is owner-scoped: {@code createTransfer} takes an internal DTO, {@code notifyTransfer} is a channel
 * callback, {@code syncTransfer} a batch. So this face has **no write tool**.
 *
 * <p><b>The form.</b> The caller names one row by a transfer number or id; on the tool path this advice compares
 * {@code (user_id, user_type)} and hands back {@code null} for another's row — the same answer as "not found". The page
 * is **refused** on the tool path rather than post-filtered, for the same reason as the order and the refund: deleting
 * rows changes {@code total} and the page's structure.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means a **tool** made the call; on the
 * request path it is null and the call passes through, so the console behaves as upstream. A **declared narrowing**.
 */
@Aspect
@Component
public class PayTransferGovernance implements GovernedModule {

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "pay";
    }

    /**
     * The owner is the pair {@code user_id} + {@code user_type}; this name is the column a reader can look up, and the
     * class comment states the second half and why {@code userName} / {@code userAccount} are not it.
     *
     * 属主是 {@code user_id} + {@code user_type} 这一对；这里写的是读者能据此查表的列名，第二半、以及为什么
     * {@code userName} / {@code userAccount} 不是它，都写在类注释里。
     */
    @Override
    public String ownerField() {
        return "user_id";
    }

    /**
     * Every read by identifier: another person's transfer comes back as nothing. A row whose owner columns are null is
     * not the caller's either — a tool path may not hand out a row it cannot attribute.
     *
     * 每一条按标识符的读：别人的转账单**什么都不交回**。属主两列为 null 的行同样不算调用方的——工具路径不交出无法归属的行。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.transfer.PayTransferService.getTransfer(..))"
            + " || execution(* cn.iocoder.yudao.module.pay.service.transfer.PayTransferService.getTransferByNo(..))")
    public Object withholdOthersTransfer(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof PayTransferDO transfer)) {
            return row;
        }
        boolean mine = Objects.equals(transfer.getUserId(), caller)
                && Objects.equals(transfer.getUserType(), UserTypeEnum.ADMIN.getValue());
        return mine ? row : null;
    }

    /**
     * The page has no owner slot to pin, so on the tool path it is refused rather than answered. The console path is
     * untouched.
     *
     * 分页没有可钉的属主位，故在工具路径上**拒绝**而不是作答。控制台路径一字不动。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.transfer.PayTransferService.getTransferPage(..))")
    public Object refusePageOnTheToolPath(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            return call.proceed();
        }
        throw new RuleDeniedException(null,
                "not permitted: the transfer page is not on the tool face",
                "PayTransfer", call.getSignature().getName(),
                "请改用转账单号或编号查一行；分页没有属主过滤位，AI 路径不提供它");
    }

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
                    "PayTransfer", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
