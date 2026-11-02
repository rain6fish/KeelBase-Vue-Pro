// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import jakarta.servlet.ServletException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 旁路留痕的四条承诺，逐条量：**一次写恰一行**、**读与登录不留**、**失败也留**、**不改请求**（返回值与异常
 * 原样），以及「受治理的会话路由不重行」。
 *
 * <p>这里量的是过滤器**交出去的行**，不是库里的行：写库那一半（异步、有界、失败只记日志）在
 * {@link YudaoBypassAuditJdbcSink} 里，本测试不替它作答。
 *
 * <p>The four promises of the bypass trail, measured one by one: **one row per write**, **nothing for
 * reads or logins**, **a row even when it fails**, **the request untouched** (return value and exception
 * as they were), and **no second row for the governed conversation route**.
 *
 * <p>What is measured here is the rows the filter **hands over**, not the rows in the table: the writing
 * half (asynchronous, bounded, failures logged) lives in {@link YudaoBypassAuditJdbcSink} and this test
 * does not answer for it.
 */
class YudaoBypassAuditFilterTest {

    private final List<YudaoBypassAuditRow> rows = new ArrayList<>();
    private final YudaoBypassAuditFilter filter = new YudaoBypassAuditFilter(rows::add);

    @AfterEach
    void clearContexts() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    @Test
    void oneConsoleWriteHandsOverExactlyOneRow() throws Exception {
        MockHttpServletRequest request = request("POST", "/admin-api/crm/contract/create");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(200));

        assertEquals(1, rows.size(), "a console write is exactly one bypass row");
        YudaoBypassAuditRow row = rows.get(0);
        assertEquals("POST", row.method());
        assertEquals("/admin-api/crm/contract/create", row.path());
        assertEquals("crm", row.module(), "the module is the first segment under the admin prefix");
        assertEquals("contract", row.object(), "the object is the second segment");
        assertEquals(200, row.httpStatus());
        assertNull(row.resultCode(), "the mock chain produced no envelope, so the host answered no code");
        assertNotNull(row.occurredAt());
        assertTrue(row.durationMs() >= 0, "a recorded duration is a measurement, never negative");
    }

    @Test
    void aBusinessRefusalInsideHttp200IsRecordedAsItself() throws Exception {
        // 本宿主把业务拒绝包在 HTTP 200 里：信封 code 403、线缆 200。只记线缆会让这一行读成「写成功了」。
        // This host wraps a business refusal in HTTP 200: envelope code 403, wire 200. The wire alone would
        // make this row read as "the write succeeded".
        MockHttpServletRequest request = request("POST", "/admin-api/crm/contract/create");

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) ->
                WebFrameworkUtils.setCommonResult(req, CommonResult.error(403, "没有权限")));

        assertEquals(1, rows.size());
        assertEquals(200, rows.get(0).httpStatus(), "the wire carried a 200, and that is recorded as it is");
        assertEquals(403, rows.get(0).resultCode(), "the envelope's code is what actually happened");
    }

    @Test
    void aReadIsNotAWrite() throws Exception {
        filter.doFilter(request("GET", "/admin-api/crm/contract/page"),
                new MockHttpServletResponse(), (req, res) -> { });

        assertTrue(rows.isEmpty(), "only writes are traced — reads have their own access log");
    }

    @Test
    void credentialsNeverReachTheTrail() throws Exception {
        for (String path : List.of("/admin-api/system/auth/login",
                "/admin-api/system/auth/refresh-token",
                "/admin-api/system/oauth2/token")) {
            filter.doFilter(request("POST", path), new MockHttpServletResponse(), (req, res) -> { });
        }

        assertTrue(rows.isEmpty(),
                "a password or token endpoint writes a secret; a copy of it in a readable table is a leak");
    }

    @Test
    void theGovernedConversationRouteIsNotUnderTheAdminPrefix() throws Exception {
        // 受治理的那次写在本进程内直接调 service，不发 HTTP；与模型对话的路由是 `/admin/`，不是 `/admin-api/`。
        // 两条路不相交，故这里恰零行 —— 不是靠去重，是靠形状。
        // A governed write calls the service in-process and issues no HTTP; the model conversation route
        // is `/admin/`, not `/admin-api/`. The two never cross, so this is exactly zero rows — by shape,
        // not by de-duplication.
        filter.doFilter(request("POST", "/admin/ai/chat/stream"), new MockHttpServletResponse(),
                (req, res) -> ((MockHttpServletResponse) res).setStatus(200));

        assertTrue(rows.isEmpty(), "a governed tool path must not leave a second row");
    }

    @Test
    void aFailedWriteStillLeavesItsCodes() throws Exception {
        filter.doFilter(request("PUT", "/admin-api/crm/customer/update"),
                new MockHttpServletResponse(), (req, res) -> ((MockHttpServletResponse) res).setStatus(400));

        assertEquals(1, rows.size(), "a refused write is still an attempt and keeps its row");
        assertEquals(400, rows.get(0).httpStatus());
    }

    @Test
    void aThrownFailureLeavesARowAndTravelsOnAsItself() {
        MockHttpServletRequest request = request("DELETE", "/admin-api/crm/contract/delete");
        MockHttpServletResponse response = new MockHttpServletResponse();
        ServletException broken = new ServletException("boom");

        ServletException thrown = assertThrows(ServletException.class,
                () -> filter.doFilter(request, response, (req, res) -> {
                    throw broken;
                }));

        assertEquals(1, rows.size(), "the write was attempted, so it is traced");
        assertEquals(500, rows.get(0).httpStatus(), "no ordinary status reached us, so it is a 500");
        assertNull(rows.get(0).resultCode(), "an unhandled failure produced no envelope");
        assertTrue(thrown == broken, "the trail must never replace the exception the caller gets");
    }

    @Test
    void theRowCarriesTheCallerAndTheTenant() throws Exception {
        LoginUser caller = new LoginUser();
        caller.setId(100L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(caller, null, List.of()));
        TenantContextHolder.setTenantId(7L);

        filter.doFilter(request("POST", "/admin-api/crm/contract/create"),
                new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size());
        assertEquals(100L, rows.get(0).callerId(), "who wrote is the caller the host already resolved");
        assertEquals(7L, rows.get(0).tenantId(), "the tenant is read, not invented");
    }

    @Test
    void aRowWithoutIdentityStillExists() throws Exception {
        filter.doFilter(request("POST", "/admin-api/crm/contract/create"),
                new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size());
        assertNull(rows.get(0).callerId(), "nobody logged in is null, and the write is still traced");
    }

    @Test
    void aPathThatNamesNoObjectIsStillARow() throws Exception {
        filter.doFilter(request("POST", "/admin-api/crm"), new MockHttpServletResponse(),
                (req, res) -> { });

        assertEquals(1, rows.size());
        assertNull(rows.get(0).module(), "one segment names no module/object pair");
        assertNull(rows.get(0).object(), "null is 'not known', not 'no object'");
    }

    @Test
    void anOverlongPathIsCutRatherThanLosingTheRow() throws Exception {
        String path = "/admin-api/crm/contract/" + "x".repeat(1000);

        filter.doFilter(request("POST", path), new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size());
        assertEquals(YudaoBypassAuditFilter.PATH_MAX, rows.get(0).path().length(),
                "the column has a width; a row is cut to fit, never dropped");
    }

    @Test
    void aSinkThatThrowsDoesNotTouchTheRequest() throws Exception {
        YudaoBypassAuditFilter fragile = new YudaoBypassAuditFilter(row -> {
            throw new IllegalStateException("sink is down");
        });
        MockHttpServletResponse response = new MockHttpServletResponse();

        fragile.doFilter(request("POST", "/admin-api/crm/contract/create"), response,
                (req, res) -> ((MockHttpServletResponse) res).setStatus(201));

        assertEquals(201, response.getStatus(),
                "a failed trail is a missing record, not a failed write");
    }

    @Test
    void theSubjectIsParsedOffThePathWithoutAModuleInventory() {
        assertEquals("system", YudaoBypassAuditFilter.subjectOf("/admin-api/system/user/create")[0]);
        assertEquals("user", YudaoBypassAuditFilter.subjectOf("/admin-api/system/user/create")[1]);
        assertNull(YudaoBypassAuditFilter.subjectOf("/ai/chat/stream"),
                "the runtime's own surface is not the admin API");
    }

    private static MockHttpServletRequest request(String method, String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRequestURI(uri);
        return request;
    }
}
