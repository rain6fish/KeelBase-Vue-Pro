// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.web.config.WebProperties;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Closes the member module's client-facing endpoints on this host.
 *
 * <p><b>Why this is a filter and not an authorization customizer.</b> Yudao's security adapter registers
 * every {@code @PermitAll} endpoint it can see <em>before</em> it applies the module customizers, and
 * Spring Security honours the first matching rule. A customizer that denied {@code /app-api/member/**}
 * would therefore be registered too late and never match — the endpoint would stay open while the code
 * looked right. This filter runs ahead of the security chain and refuses the request itself.
 *
 * <p><b>Why the surface is closed at all.</b> The member module's app controllers are the first
 * token-issuing endpoints this host would carry: {@code /app-api/member/auth/login}, {@code sms-login},
 * {@code send-sms-code} and their siblings are all {@code @PermitAll}, so deploying the module without
 * this guard would publish a client login face — including an unauthenticated SMS-sending endpoint —
 * on a host that serves the console only. The tool face reads through the service layer and needs none
 * of them.
 *
 * <p><b>404, not 403.</b> From this host's point of view the client surface is not deployed; answering
 * "forbidden" would advertise a path that has nothing behind it. The console's own endpoints
 * ({@code /admin-api/member/**}) are untouched.
 *
 * 关掉本宿主上会员模块面向客户端的那组端点。
 *
 * <p><b>为什么是过滤器、不是授权定制器。</b>芋道的安全适配器会先登记它看得到的每一个 {@code @PermitAll}
 * 端点，**之后**才应用各模块的定制器，而 Spring Security 以**首个命中**为准。于是对
 * {@code /app-api/member/**} 说「拒绝」的定制器登记得太晚、永远不会命中——**代码看着对，端点照旧开着**。
 * 本过滤器跑在安全链之前，自己把请求拒掉。
 *
 * <p><b>为什么要关它。</b>会员模块的 app 控制器会是本宿主带上的**第一批发令牌端点**：
 * {@code /app-api/member/auth/login}、{@code sms-login}、{@code send-sms-code} 及其同类都带
 * {@code @PermitAll}。不关就部署，等于在一台只服务控制台的宿主上公开一个客户端登录面——**其中一个发短信码的
 * 端点还不需要登录**。工具面走服务层，一个都不需要。
 *
 * <p><b>答 404、不答 403。</b>从本宿主的角度看，客户端面**没有部署**；答「禁止」等于指出一条后面什么都没有的
 * 路径。控制台自己的端点（{@code /admin-api/member/**}）一字不动。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MemberAppSurfaceGuard implements Filter {

    /** The segment the member module mounts its app controllers under. / 会员模块挂 app 控制器的那一段。 */
    private static final String MEMBER_SEGMENT = "/member/";

    private final String closedPrefix;

    public MemberAppSurfaceGuard(WebProperties webProperties) {
        this.closedPrefix = webProperties.getAppApi().getPrefix() + MEMBER_SEGMENT;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        String path = pathOf(request);
        if (path.startsWith(closedPrefix)) {
            ((HttpServletResponse) response).sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        chain.doFilter(request, response);
    }

    /** The request path without the context path, so a deployment under one still matches. */
    private static String pathOf(ServletRequest request) {
        if (!(request instanceof jakarta.servlet.http.HttpServletRequest http)) {
            return "";
        }
        String uri = http.getRequestURI();
        String context = http.getContextPath();
        if (context != null && !context.isEmpty() && uri.startsWith(context)) {
            return uri.substring(context.length());
        }
        return uri;
    }
}
