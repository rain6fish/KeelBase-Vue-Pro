// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.module.pay.dal.dataobject.order.PayOrderDO;
import java.util.Objects;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pay 在支付单（`pay_order`）上的接缝——M3 里**第一个分页不能收窄、改走按标识符读**的对象。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>行上是一对：{@code user_id} + {@code user_type}。两个编号空间会撞号（会员 42 与管理员 42
 *       是两个人），与钱包同一条理由。本宿主的 AI 调用方是管理端用户，故属主对是「行动调用方 + 管理员」。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getOrderPage(PayOrderPageReqVO)} 交给
 *       {@code PayOrderMapper.selectPage}，条件全是 {@code eqIfPresent}，而 {@code PayOrderPageReqVO} 只有
 *       appId / channelCode / merchantOrderId / channelOrderNo / no / status / createTime——**没有属主位**。
 *       不给条件就是本租户每一行；切面**没有**可以钉的字段。退款单、转账单的分页 VO 同样没有属主位。</li>
 *   <li><b>按 id 读是否收窄。</b>不收窄。{@code getOrder(Long)} / {@code getOrder(String no)} /
 *       {@code getOrder(Long, String)} 都是裸的 mapper 查询，返回整行。</li>
 *   <li><b>写查什么权限。</b>没有一个是「只改调用方自己那一行」的写：{@code createOrder} 收内部 DTO；
 *       {@code submitOrder} 提交支付并**调外部渠道**；{@code notifyOrder} 是渠道回调；{@code updateOrderRefundPrice} /
 *       {@code updatePayOrderPrice} 是退款与调价的内部账务；{@code syncOrderQuietly} **调外部渠道**；{@code expireOrder}
 *       是批处理。故本面**没有写工具**——「按 id 读 + R3 写」里的写那一半，不在这三类对象上。</li>
 * </ol>
 *
 * <p><b>为什么放弃分页，而不是事后过滤。</b>分页的答案是一个**结构**（{@code total} + 本页若干行）。事后删行改的是
 * 答案的结构：{@code total=1} 而列表 0 行，或第 1 页只剩 2 行而第 2 页从别处接上。这不是「更安全 / 更不安全」的
 * 判断，而是**同一个问题的答案变了**。故本面在工具路径上**不开分页**：不是收窄它，是不声明它；若将来有人加一条工具
 * 走 {@code getOrderPage}，这里的通知会**拒绝**，而不是让它把「没有过滤」重新变成「全部行」。
 *
 * <p><b>接法：按标识符读 + 事后属主判定。</b>调用方以自己知道的标识（支付单号或编号）点名一行；本通知在工具路径上
 * 比对该行的 {@code (user_id, user_type)}，不是调用方的就**交回 null**——与「这一行不存在」同一个答案。这正是模块
 * 自己在 APP 端已经做的事（{@code AppPayOrderController#getOrder} 比对 {@code order.getUserId()}），区别只是这里把
 * 管理员命名空间也一起钉上。**它可被证伪**：两个调用方各一行、加一个不存在的标识，A 问 B 的行与 A 问不存在的行必须
 * 得到逐字相同的答案，而 A 问自己的行必须拿到自己的业务事实；不接时第一条会拿到 B 的行。
 *
 * <p><b>与「豁免」的差别。</b>豁免意味着工具面上根本没有这条路；本接缝意味着有一条路，且它在跨属主时的答案与
 * 「不存在」无法区分。前者读不到任何东西，后者读得到**自己的**那一行——差别就在这条可观测的断言上。
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空说明调用来自工具：没有请求、没有登录用户，
 * 模块自己的 {@code @PreAuthorize} 一条都不经过。请求路径上它为空，本通知**原样放行**，控制台（管理员按
 * {@code pay:order:query} 查任意订单）的行为与上游一致。这是**声明的收窄**：工具面只答调用方自己的订单。
 *
 * <p><b>哪条路不在切点里。</b>{@code getOrderExtension} 返回的是订单的支付拓展行（含渠道 extras），本面没有工具读它；
 * {@code getOrderList(Collection)} 是模块内部的批量读，且同样没有属主位，故在工具路径上一并**拒绝**。将来加工具时，
 * 点切与本清单必须一起长。
 *
 * <p>pay's seam over the payment order ({@code pay_order}) — M3's **first object whose page cannot be narrowed**, and
 * which therefore goes through a read by identifier instead.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) The owner is a pair, {@code user_id} +
 * {@code user_type}, for the same reason as the wallet: the two id spaces collide. (2) A page with no filter returns
 * **every row in the tenant**: {@code getOrderPage} passes to {@code PayOrderMapper.selectPage}, all conditions are
 * {@code eqIfPresent}, and {@code PayOrderPageReqVO} carries appId / channelCode / merchantOrderId / channelOrderNo /
 * no / status / createTime — **no owner slot**. The refund and transfer page VOs are the same. There is no field for
 * the advice to pin. (3) The reads by id are bare mapper queries and return the whole row. (4) None of the writes is
 * "change only the caller's own row": {@code createOrder} takes an internal DTO, {@code submitOrder} calls an external
 * channel, {@code notifyOrder} is a channel callback, the two price updates are internal bookkeeping,
 * {@code syncOrderQuietly} calls an external channel, {@code expireOrder} is a batch. So this face has **no write
 * tool** — the write half of "read by id + R3 write" does not exist for these three objects.
 *
 * <p><b>Why the page is dropped rather than post-filtered.</b> A page's answer is a **structure** ({@code total} plus
 * the rows of one page). Deleting rows afterwards changes that structure: {@code total=1} with an empty list, or a
 * first page with two rows and a second page that continues elsewhere. That is not "safer or less safe"; it is a
 * different answer to the same question. So the page is **not offered** on the tool path — not narrowed, simply not
 * declared; if a tool ever calls {@code getOrderPage}, this advice refuses it rather than letting "no filter" mean
 * "every row" again.
 *
 * <p><b>The form: read by identifier, then decide the owner.</b> The caller names one row by an identifier it already
 * knows (order number or id); on the tool path this advice compares that row's {@code (user_id, user_type)} and hands
 * back {@code null} for another's row — the same answer as "this row does not exist". It is exactly what the module
 * already does on its app side ({@code AppPayOrderController#getOrder} compares {@code order.getUserId()}); the only
 * change is pinning the administrator namespace too. **It is falsifiable**: with one row per caller and one missing
 * identifier, asking for B's row and for the missing one must return byte-identical answers, while asking for one's
 * own returns one's own business fact; without the seam the first read returns B's row.
 *
 * <p><b>How it differs from an exemption.</b> An exemption means the tool face has no such path at all; this seam means
 * there is a path, and its answer across owners is indistinguishable from "not found". The first can read nothing; the
 * second reads **the caller's own row** — the difference is that observable assertion.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means a **tool** made the call: no
 * request, no login user, and none of the module's {@code @PreAuthorize} runs. On the request path it is null and the
 * call passes through, so the console (where an administrator behind {@code pay:order:query} may look at any order)
 * behaves exactly as upstream. This is a **declared narrowing**: the tool face answers the caller's own orders only.
 *
 * <p><b>What is not in the pointcuts.</b> {@code getOrderExtension} returns the order's payment-extension row (with
 * channel extras), and no tool here reads it; {@code getOrderList(Collection)} is the module's internal bulk read, has
 * no owner slot either, and is therefore also **refused** on the tool path. A future tool grows the pointcuts and this
 * list together.
 */
@Aspect
@Component
public class PayOrderGovernance implements GovernedModule {

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
     * Every read by identifier, whichever overload: another person's order comes back as nothing. A row whose owner
     * columns are null (legacy orders) is **not** the caller's either — a tool path may not hand out a row it cannot
     * attribute; legacy rows stay reachable from the console.
     *
     * 每一条按标识符的读，不论哪个重载：别人的支付单**什么都不交回**。属主两列为 null 的行（历史订单）同样不算调用方的
     * ——工具路径不交出无法归属的行；历史订单仍可从控制台读到。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.order.PayOrderService.getOrder(..))")
    public Object withholdOthersOrder(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof PayOrderDO order)) {
            return row;
        }
        return mine(order, caller) ? row : null;
    }

    /**
     * The page has no owner slot to pin, so on the tool path it is refused rather than answered. The console path is
     * untouched; the module's own controllers never come through here with an acting caller.
     *
     * 分页没有可钉的属主位，故在工具路径上**拒绝**而不是作答。控制台路径一字不动；模块自己的控制器不会带着行动
     * 调用方走到这里。
     */
    @Around("execution(* cn.iocoder.yudao.module.pay.service.order.PayOrderService.getOrderPage(..))"
            + " || execution(* cn.iocoder.yudao.module.pay.service.order.PayOrderService.getOrderList(..))")
    public Object refuseManyRowsOnTheToolPath(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            return call.proceed();
        }
        throw new RuleDeniedException(null,
                "not permitted: the payment-order page is not on the tool face",
                "PayOrder", call.getSignature().getName(),
                "请改用支付单号或编号查一行；分页没有属主过滤位，AI 路径不提供它");
    }

    private static boolean mine(PayOrderDO order, Long caller) {
        return Objects.equals(order.getUserId(), caller)
                && Objects.equals(order.getUserType(), UserTypeEnum.ADMIN.getValue());
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
                    "PayOrder", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
