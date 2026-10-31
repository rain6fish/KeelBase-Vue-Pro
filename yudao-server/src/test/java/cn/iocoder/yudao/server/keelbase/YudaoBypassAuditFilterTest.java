// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import jakarta.servlet.ServletException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
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

    @Test
    void aJsonWriteRecordsTheBodyShapeAndNotOneValue() throws Exception {
        // 正文里的值一个都不该出现在行里：标记串、口令都不例外。留下的是长度、摘要前 12 位与顶层字段名。
        // Not one value from the body belongs in the row, markers and passwords included. What stays is the
        // length, the first 12 digits of a digest, and the top-level field names.
        String body = "{\"customerId\":9005,\"note\":\"body-marker-should-never-land\","
                + "\"password\":\"hunter2-should-never-land\"}";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        MockHttpServletRequest request = jsonRequest("PUT", "/admin-api/crm/customer/update", bytes);
        AtomicReference<String> seenDownstream = new AtomicReference<>();

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) ->
                seenDownstream.set(new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8)));

        assertEquals(1, rows.size());
        assertEquals(body, seenDownstream.get(), "the body still reaches the chain, byte for byte");
        YudaoBypassAuditRow row = rows.get(0);
        assertEquals(bytes.length, row.bodyLength(), "the length is measured on the bytes, not the characters");
        assertEquals(sha256Prefix(bytes), row.bodySha256(), "the digest is over the same bytes");
        assertEquals("customerId,note,password", row.bodyFields(), "top-level names, in document order");
        assertFalse(row.toString().contains("body-marker-should-never-land"),
                "a value from the body reached the row: " + row);
        assertFalse(row.toString().contains("hunter2-should-never-land"),
                "a password from the body reached the row: " + row);
    }

    @Test
    void aStreamingWriteKeepsItsRowButNoBody() throws Exception {
        // 流式答复的请求不读正文（用户的问题不该被当成「一次写的正文」记下来），但**行照留**。
        // A streaming answer's request is not body-read (the user's question is not "a write's body"), but
        // the row is still left.
        MockHttpServletRequest request = jsonRequest("POST",
                "/admin-api/ai1/session/message/send-stream",
                "{\"sessionId\":1,\"content\":\"hello\"}".getBytes(StandardCharsets.UTF_8));
        request.addHeader("Accept", "text/event-stream");
        AtomicReference<String> seenDownstream = new AtomicReference<>();

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) ->
                seenDownstream.set(new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8)));

        assertEquals(1, rows.size(), "one write, one row — streaming changes the body reading, not the trace");
        assertEquals("{\"sessionId\":1,\"content\":\"hello\"}", seenDownstream.get(),
                "the request body still arrives at the controller");
        assertNull(rows.get(0).bodyLength(), "no length: the body was not read");
        assertNull(rows.get(0).bodySha256(), "no digest: the body was not read");
        assertNull(rows.get(0).bodyFields(), "no field names: the body was not read");
    }

    @Test
    void aStreamPathIsNotBodyReadEvenWithoutAnAcceptHeader() throws Exception {
        MockHttpServletRequest request = jsonRequest("POST",
                "/admin-api/ai1/session/message/resume-stream",
                "{\"sessionId\":1}".getBytes(StandardCharsets.UTF_8));

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size());
        assertNull(rows.get(0).bodyLength(), "the path says streaming, so the body stays unread");
    }

    @Test
    void aNonJsonWriteHasNoBodySummary() throws Exception {
        MockHttpServletRequest request = request("POST", "/admin-api/crm/customer/update");
        request.setContentType("application/x-www-form-urlencoded");
        request.setContent("note=form-value".getBytes(StandardCharsets.UTF_8));

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size());
        assertNull(rows.get(0).bodyLength(), "a form body is not read: the summary is about JSON writes");
    }

    @Test
    void anOverlongBodyIsNotReadButTheRowStillSaysSomething() throws Exception {
        byte[] big = new byte[YudaoBypassAuditBody.MAX_BYTES + 1];
        java.util.Arrays.fill(big, (byte) 'x');
        MockHttpServletRequest request = jsonRequest("POST", "/admin-api/crm/customer/update", big);

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size(), "the row is never lost to a body that is too large to summarise");
        assertNull(rows.get(0).bodyLength(), "over the cap means not read — and that is said as null");
    }

    @Test
    void aKeyThatLooksLikeAValueIsNotRecordedAsAFieldName() throws Exception {
        // 以手机号为键的 map：键就是值。只收像字段名的键。
        // A map keyed by phone number: the key is the value. Only identifier-shaped keys are kept.
        MockHttpServletRequest request = jsonRequest("POST", "/admin-api/crm/customer/update",
                "{\"13800138000\":{\"x\":1},\"姓名\":2,\"okField\":3}".getBytes(StandardCharsets.UTF_8));

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> { });

        assertEquals(1, rows.size());
        assertEquals("okField", rows.get(0).bodyFields(),
                "a key shaped like a value is dropped rather than recorded as a field name");
    }

    private static MockHttpServletRequest jsonRequest(String method, String uri, byte[] body) {
        MockHttpServletRequest request = request(method, uri);
        request.setContentType("application/json");
        request.setContent(body);
        return request;
    }

    private static String sha256Prefix(byte[] body) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(body);
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            hex.append(String.format("%02x", b));
        }
        return hex.substring(0, 12);
    }

    private static MockHttpServletRequest request(String method, String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRequestURI(uri);
        return request;
    }
}
