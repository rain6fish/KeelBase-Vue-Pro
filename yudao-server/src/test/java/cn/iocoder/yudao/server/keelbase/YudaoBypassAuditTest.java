// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import jakarta.servlet.FilterChain;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 旁路层的三组边界：路径分类、脱敏、失败上界。
 *
 * <p>测试不连库：过滤器只认 {@link YudaoBypassAudit.Sink} 这个窄接口，异步写入与 JDBC 都在实现里。
 *
 * The three boundaries of the bypass layer: path classification, masking, and the failure ceiling. No
 * database: the filter knows only the narrow {@link YudaoBypassAudit.Sink}, while the async JDBC writer
 * lives behind the implementation.
 */
class YudaoBypassAuditTest {

    private static final String PREFIX = "/admin-api";

    private final List<YudaoBypassAudit.BypassAuditRecord> records = new ArrayList<>();
    private final YudaoBypassAudit.Sink sink = records::add;

    private YudaoBypassAudit.BypassAuditFilter filter(boolean enabled) {
        return new YudaoBypassAudit.BypassAuditFilter(PREFIX, enabled, sink);
    }

    private static MockHttpServletRequest request(String method, String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setServletPath(uri);
        WebFrameworkUtils.setLoginUserId(request, 1L);
        WebFrameworkUtils.setLoginUserType(request, 0);
        return request;
    }

    private static FilterChain okChain(int status) {
        return (req, res) -> ((MockHttpServletResponse) res).setStatus(status);
    }

    // ── 1) 路径分类 / path classification ─────────────────────────────────────────────────────────

    @Test
    void classifiesWritesReadsAndExclusions() {
        assertTrue(YudaoBypassAudit.isAuditedWrite("POST", "/admin-api/crm/customer/create", "", PREFIX));
        assertTrue(YudaoBypassAudit.isAuditedWrite("PUT", "/admin-api/crm/customer/update", "", PREFIX));
        assertTrue(YudaoBypassAudit.isAuditedWrite("DELETE", "/admin-api/crm/customer/delete", "", PREFIX));
        assertTrue(YudaoBypassAudit.isAuditedWrite("PATCH", "/admin-api/crm/customer/lock", "", PREFIX));

        assertFalse(YudaoBypassAudit.isAuditedWrite("GET", "/admin-api/crm/customer/page", "", PREFIX));
        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/app-api/member/user/create", "", PREFIX));
        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/admin-api-other/crm/create", "", PREFIX));

        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/admin-api/system/auth/login", "", PREFIX));
        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/admin-api/system/auth/refresh-token", "", PREFIX));
        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/admin-api/system/auth/sms-login", "", PREFIX));
        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/admin-api/system/auth/logout", "", PREFIX));
        assertFalse(YudaoBypassAudit.isAuditedWrite("POST", "/actuator/health", "", PREFIX));

        // 比较前缀之前先剥掉 context path。
        // A context path is stripped before the prefix is compared.
        assertTrue(YudaoBypassAudit.isAuditedWrite("POST", "/host/admin-api/crm/customer/create", "/host", PREFIX));
    }

    @Test
    void namesTheBusinessObjectAndAction() {
        assertEquals("crm.customer",
                YudaoBypassAudit.businessObject("/admin-api/crm/customer/create", "", PREFIX));
        assertEquals("create", YudaoBypassAudit.action("/admin-api/crm/customer/create", "", PREFIX));
        assertEquals("system.user",
                YudaoBypassAudit.businessObject("/admin-api/system/user/create", "", PREFIX));
        // 末尾的数字路径段不算动作。
        // A trailing numeric segment is not an action.
        assertEquals("update",
                YudaoBypassAudit.action("/admin-api/crm/customer/update/42", "", PREFIX));
        assertNull(YudaoBypassAudit.businessObject("/admin-api", "", PREFIX));
    }

    // ── 2) 一次写恰一行；读、排除项、开关关闭都是零行 / one write, one row; reads/exclusions/off = zero ──

    @Test
    void recordsExactlyOneRowPerWriteAndNoneForReadsOrExclusions() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter(true).doFilter(request("POST", "/admin-api/crm/customer/create"), response,
                okChain(200));
        assertEquals(1, records.size());
        YudaoBypassAudit.BypassAuditRecord row = records.get(0);
        assertEquals("POST", row.requestMethod());
        assertEquals("/admin-api/crm/customer/create", row.requestUrl());
        assertEquals("crm.customer", row.businessObject());
        assertEquals("create", row.action());
        assertEquals(200, row.resultStatus());
        assertEquals(1L, row.userId());

        records.clear();
        MockHttpServletResponse read = new MockHttpServletResponse();
        filter(true).doFilter(request("GET", "/admin-api/crm/customer/page"), read, okChain(200));
        assertEquals(0, records.size(), "a read is not a write");

        MockHttpServletResponse login = new MockHttpServletResponse();
        filter(true).doFilter(request("POST", "/admin-api/system/auth/login"), login, okChain(200));
        assertEquals(0, records.size(), "login is excluded");

        records.clear();
        MockHttpServletResponse off = new MockHttpServletResponse();
        filter(false).doFilter(request("POST", "/admin-api/crm/customer/create"), off, okChain(200));
        assertEquals(0, records.size(), "the switch is off");
        assertEquals(200, off.getStatus(), "behaviour is unchanged when the switch is off");
    }

    // ── 3) 脱敏 / masking ────────────────────────────────────────────────────────────────────────

    @Test
    void masksCredentialsAndContactDetails() throws Exception {
        String body = "{\"name\":\"gate-marker\",\"password\":\"p@ss\",\"mobile\":\"13800000000\","
                + "\"email\":\"a@b.c\",\"contact\":{\"telephone\":\"010-1234\",\"qq\":\"12345\"},"
                + "\"items\":[{\"wechat\":\"wx-id\"}],\"remark\":\"keep me\"}";
        MockHttpServletRequest request = request("POST", "/admin-api/crm/customer/create");
        request.setContentType("application/json");
        request.setContent(body.getBytes(StandardCharsets.UTF_8));

        filter(true).doFilter(request, new MockHttpServletResponse(), okChain(200));

        String digest = records.get(0).requestDigest();
        assertNotNull(digest);
        assertTrue(digest.contains("gate-marker"), "the business marker stays");
        assertTrue(digest.contains("keep me"), "an ordinary field stays");
        assertTrue(digest.contains("***"));
        for (String secret : new String[]{"p@ss", "13800000000", "a@b.c", "010-1234", "12345", "wx-id"}) {
            assertFalse(digest.contains(secret), () -> "leaked " + secret + " in " + digest);
        }
    }

    @Test
    void capsTheDigestAndNeverKeepsUnparseableBodies() throws Exception {
        String longBody = "{\"name\":\"" + "x".repeat(4000) + "\"}";
        MockHttpServletRequest request = request("POST", "/admin-api/crm/customer/create");
        request.setContentType("application/json");
        request.setContent(longBody.getBytes(StandardCharsets.UTF_8));
        filter(true).doFilter(request, new MockHttpServletResponse(), okChain(200));
        assertTrue(records.get(0).requestDigest().length() <= YudaoBypassAudit.MAX_DIGEST);

        records.clear();
        MockHttpServletRequest broken = request("POST", "/admin-api/crm/customer/create");
        broken.setContentType("application/json");
        broken.setContent("{not json".getBytes(StandardCharsets.UTF_8));
        filter(true).doFilter(broken, new MockHttpServletResponse(), okChain(200));
        assertNull(records.get(0).requestDigest(), "an unparseable body is not kept at all");
    }

    // ── 4) 失败上界：记录失败不改请求；写失败仍留一行 / failure ceiling ───────────────────────────

    @Test
    void aFailingSinkNeverDisturbsTheRequest() throws Exception {
        YudaoBypassAudit.BypassAuditFilter failing = new YudaoBypassAudit.BypassAuditFilter(
                PREFIX, true, (record) -> {
                    throw new IllegalStateException("audit store is down");
                });
        MockHttpServletResponse response = new MockHttpServletResponse();
        failing.doFilter(request("POST", "/admin-api/crm/customer/create"), response, okChain(201));
        assertEquals(201, response.getStatus(), "the request's outcome is untouched");
    }

    @Test
    void aFailedWriteStillLeavesOneRowWithItsStatus() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter(true).doFilter(request("POST", "/admin-api/crm/customer/create"), response,
                okChain(500));
        assertEquals(1, records.size());
        assertEquals(500, records.get(0).resultStatus());
    }

    @Test
    void aThrownFailureIsRecordedAsFiveHundredAndRethrown() throws Exception {
        MockHttpServletRequest request = request("POST", "/admin-api/crm/customer/create");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain explodes = (req, res) -> {
            throw new IllegalStateException("controller failed");
        };
        try {
            filter(true).doFilter(request, response, explodes);
        } catch (Exception expected) {
            assertEquals("controller failed", expected.getMessage());
        }
        assertEquals(1, records.size());
        assertEquals(500, records.get(0).resultStatus(), "a thrown failure is a 500 even if the status says 200");
    }
}
