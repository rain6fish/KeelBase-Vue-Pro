// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.refund.PayRefundDO;
import java.util.Objects;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pay 在退款单（`pay_refund`）上的接缝——与支付单同形的第二个对象：**分页没有属主过滤位，接按标识符读 + 事后判属主**。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>行上是一对：{@code user_id} + {@code user_type}，与支付单、钱包同一条理由（两个编号空间撞号）。
 *       本宿主的 AI 调用方是管理端用户，故属主对是「行动调用方 + 管理员」。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getRefundPage(PayRefundPageReqVO)} 交给
 *       {@code PayRefundMapper.selectPage}，条件全是 {@code eqIfPresent}，而 VO 只有 appId / channelCode /
 *       merchantOrderId / merchantRefundId / channelOrderNo / channelRefundNo / status / createTime——**没有属主位**。
 *       不给条件就是本租户每一行。</li>
 *   <li><b>按标识符读是否收窄。</b>不收窄。{@code getRefund(Long)} 是 {@code selectById}，
 *       {@code getRefundByNo(String)} 是 {@code selectByNo}，都返回整行。</li>
 *   <li><b>写查什么权限。</b>没有属主作用域的写：{@code createRefund} 收内部 DTO（其它业务模块发起退款）、
 *       {@code notifyRefund} 是渠道回调、{@code syncRefund} 是批处理。故本面**没有写工具**。</li>
 * </ol>
 *
 * <p><b>接法。</b>调用方以自己知道的标识（退款单号或编号）点名一行；本通知在工具路径上比对
 * {@code (user_id, user_type)}，不是调用方的就交回 {@code null}——与「这一行不存在」同一个答案。分页与导出列表
 * 在工具路径上**拒绝**（不是事后过滤）：分页的答案是 {@code total} 加本页若干行，删行会改变答案的结构。
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空说明调用来自工具；请求路径上它为空，
 * 本通知原样放行，控制台（管理员按 {@code pay:refund:query} 查任意退款单）与上游一致。这是**声明的收窄**：工具面
 * 只答调用方自己的退款单。
 *
 * <p>pay's seam over the refund ({@code pay_refund}) — the second object shaped like the payment order: **its page has
 * no owner slot, so the face reads by identifier and decides the owner afterwards**.
 *
 * <p><b>The four answers, from the module's own code.</b> (1) The owner is the pair {@code user_id} +
 * {@code user_type}, for the same reason as the wallet and the order. (2) A page with no filter returns **every row in
 * the tenant**: {@code getRefundPage} passes to {@code PayRefundMapper.selectPage}, all conditions are
 * {@code eqIfPresent}, and the VO carries appId / channelCode / the two merchant ids / the two channel numbers /
 * status / createTime — **no owner slot**. (3) The reads by identifier are bare mapper queries. (4) None of the writes
 * is owner-scoped: {@code createRefund} takes an internal DTO, {@code notifyRefund} is a channel callback and
 * {@code syncRefund} a batch. So this face has **no write tool**.
 *
 * <p><b>The form.</b> The caller names one row by a refund number or id; on the tool path this advice compares
 * {@code (user_id, user_type)} and hands back {@code null} for another's row — the same answer as "not found". The
 * page and the export list are **refused** on the tool path rather than post-filtered: a page's answer is
 * {@code total} plus its rows, and deleting rows changes that structure.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means a **tool** made the call; on
 * the request path it is null and the call passes through, so the console (where an administrator behind
 * {@code pay:refund:query} may look at any refund) behaves as upstream. This is a **declared narrowing**.
 */
@Aspect
@Component
public class PayRefundGovernance implements GovernedModule {

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "pay";
    }

    /**
     * The owner is the pair {@code user_id} + {@code user_type}; this name is the column a reader can look up, and the
     * class comment states the second half so the pair is not misread as one id space.
     *
     * 属主是 {@code user_id} + {@code user_type} 这一对；这里写的是读者能据此查表的列名，第二半写在类注释里，
     * 以免被读成一个编号空间。
     */
    @Override
    public String ownerField() {
        return "user_id";
    }

    /**
     * Every read by identifier: another person's refund comes back as nothing. A row whose owner columns are null is
     * not the caller's either — a tool path may not hand out a row it cannot attribute.
     *
     * 每一条按标识符的读：别人的退款单**什么都不交回**。属主两列为 null 的行同样不算调用方的——工具路径不交出无法归属的行。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.refund.PayRefundService.getRefund(..))"
            + " || execution(* cn.iocoder.yudao.module.pay.service.refund.PayRefundService.getRefundByNo(..))")
    public Object withholdOthersRefund(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof PayRefundDO refund)) {
            return row;
        }
        boolean mine = Objects.equals(refund.getUserId(), caller)
                && Objects.equals(refund.getUserType(), UserTypeEnum.ADMIN.getValue());
        return mine ? row : null;
    }

    /**
     * The page and the export list have no owner slot to pin, so on the tool path they are refused rather than
     * answered. The console path is untouched.
     *
     * 分页与导出列表没有可钉的属主位，故在工具路径上**拒绝**而不是作答。控制台路径一字不动。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.refund.PayRefundService.getRefundPage(..))"
            + " || execution(* cn.iocoder.yudao.module.pay.service.refund.PayRefundService.getRefundList(..))")
    public Object refuseManyRowsOnTheToolPath(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            return call.proceed();
        }
        throw new RuleDeniedException(null,
                "not permitted: the refund page is not on the tool face",
                "PayRefund", call.getSignature().getName(),
                "请改用退款单号或编号查一行；分页没有属主过滤位，AI 路径不提供它");
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
                    "PayRefund", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
