// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import cn.iocoder.yudao.framework.web.config.WebProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletResponse;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * The client-facing member surface stays closed, and the console's does not.
 *
 * <p>The guard answers before anything else looks at the request, so these tests use a chain that
 * records whether it was reached at all: a refusal that still ran the rest of the chain would be the
 * failure this file exists to catch.
 *
 * 会员面向客户端的那一面保持关闭，控制台那一面不受影响。
 *
 * <p>本过滤器在任何别的组件看这个请求之前作答，故这些测试用一个会记录「有没有被走到」的链：**拒了却仍把链跑完**
 * 正是这个文件存在的理由。
 */
class MemberAppSurfaceGuardTest {

    private final MemberAppSurfaceGuard guard = new MemberAppSurfaceGuard(new WebProperties());

    @Test
    void aMemberAppEndpointIsNotThere() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean();

        guard.doFilter(request("/app-api/member/auth/login"), response, chain(reached));

        assertEquals(HttpServletResponse.SC_NOT_FOUND, response.getStatus());
        assertFalse(reached.get(), "the request must not travel any further");
    }

    @Test
    void theSmsCodeEndpointIsClosedToo() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean();

        guard.doFilter(request("/app-api/member/auth/send-sms-code"), response, chain(reached));

        assertEquals(HttpServletResponse.SC_NOT_FOUND, response.getStatus());
        assertFalse(reached.get());
    }

    @Test
    void theConsoleEndpointIsUntouched() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean();

        guard.doFilter(request("/admin-api/member/user/get"), response, chain(reached));

        assertTrue(reached.get());
        assertEquals(HttpServletResponse.SC_OK, response.getStatus());
    }

    @Test
    void aContextPathDoesNotHideThePrefix() throws Exception {
        MockHttpServletRequest request = request("/gateway/app-api/member/auth/login");
        request.setContextPath("/gateway");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reached = new AtomicBoolean();

        guard.doFilter(request, response, chain(reached));

        assertEquals(HttpServletResponse.SC_NOT_FOUND, response.getStatus());
        assertFalse(reached.get());
    }

    private static MockHttpServletRequest request(String uri) {
        return new MockHttpServletRequest("POST", uri);
    }

    private static FilterChain chain(AtomicBoolean reached) {
        return (request, response) -> reached.set(true);
    }
}
