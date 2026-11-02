// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.enums.WebFilterOrderEnum;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 把旁路留痕挂在 `/admin-api/**` 的写请求上，并给它一个开关。
 *
 * <p><b>开关的语义是「不装」，不是「装了但不记」。</b>关掉时过滤器**不注册**：零行、零开销、请求路径上少
 * 一个过滤器 —— 于是「关掉之后行为不变」不是一句承诺，是它根本不在。{@code matchIfMissing = true}：不写
 * 这一项就是开着的，因为这一层存在的理由正是「今天没人记」。
 *
 * <p><b>顺序。</b>注册在芋道的租户过滤器（`-104`）与 Spring Security（`-100`）**之后**，于是旁路留痕读得到
 * 调用方与租户 —— 与宿主别处用的是同一套读数，而不是另开一条。它同时意味着**被鉴权挡在门外**的请求不经过
 * 本过滤器：那些请求什么都没写，故没有可留的写痕，而它们的拒绝由上游自己的访问日志（`ApiAccessLog`）记着。
 *
 * <p>Hangs the bypass trail on `/admin-api/**` writes, behind a switch.
 *
 * <p><b>The switch means "not installed", not "installed but silent".</b> Turned off, the filter is
 * **not registered**: zero rows, zero cost, one fewer filter on the request path — so "behaviour is
 * unchanged when it is off" is not a promise, it is an absence. {@code matchIfMissing = true}: leaving
 * the key out means on, because nothing being recorded today is exactly why this layer exists.
 *
 * <p><b>Order.</b> Registered **after** YuDao's tenant filter (`-104`) and Spring Security (`-100`), so
 * the trail can read the caller and the tenant — the same readings the rest of the host uses, not a
 * second opinion. It also means a request **refused by authorization** never reaches this filter: nothing
 * was written, so there is no write to trace, and its refusal is already recorded by upstream's own
 * access log (`ApiAccessLog`).
 */
@Configuration
@ConditionalOnProperty(prefix = "keelbase.bypass-audit", name = "enabled",
        havingValue = "true", matchIfMissing = true)
public class YudaoBypassAudit {

    /**
     * 排在租户（`-104`）与安全（`-100`）之后、Servlet 之前：晚于两者才读得到调用方与租户，早于 Servlet 才
     * 看得到每一次写出了什么结果。取值避开上游已占用的槽（`-99` 租户安全、`-98` Flowable）。
     *
     * <p>After the tenant (`-104`) and security (`-100`) filters and before the servlet: later than both
     * to read the caller and tenant, earlier than the servlet to see how each write came out. The value
     * avoids the slots upstream already occupies (`-99` tenant security, `-98` Flowable).
     */
    static final int ORDER = WebFilterOrderEnum.TENANT_SECURITY_FILTER + 2;

    @Bean
    FilterRegistrationBean<YudaoBypassAuditFilter> bypassAuditFilter(YudaoBypassAuditSink sink) {
        FilterRegistrationBean<YudaoBypassAuditFilter> registration =
                new FilterRegistrationBean<>(new YudaoBypassAuditFilter(sink));
        registration.setOrder(ORDER);
        return registration;
    }
}
