// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.server.ResponseStatusException;

/**
 * A query parameter the audit read face does not declare is refused with a 400 that names it.
 *
 * <p>Why this test exists: Spring drops an undeclared query parameter without an error, so
 * `GET /audit/logs?tenantId=121` used to answer the whole chain — a list that looks filtered and is
 * not. The guard turns that into a refusal; this test pins both directions: `tenantId` (and any other
 * name outside the read face) is refused and named, while every parameter the read face does declare
 * still passes untouched.
 *
 * <p>读面没有声明的查询参数一律 400、并点出字段名。
 *
 * <p>为什么这条测试存在：Spring 对没声明的查询参数不报错、直接丢弃，于是
 * `GET /audit/logs?tenantId=121` 曾答回整条链 —— 一份看着像筛过、其实没有的列表。本守卫把它变成拒绝；
 * 这条测试钉住正负两个方向：`tenantId`（以及读面之外的任何名字）被拒绝并点名，而读面声明过的参数一个
 * 都不受影响。
 */
class YudaoAuditReadParamsGuardTest {

    private final YudaoAuditReadParamsGuard guard = new YudaoAuditReadParamsGuard();

    @Test
    void anUndeclaredTenantIdIsRefusedAndNamed() {
        MockHttpServletRequest request = read("tenantId", "121");

        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> guard.preHandle(request, new MockHttpServletResponse(), new Object()),
                "the read face applies no tenant filter, so accepting the parameter would widen the answer");
        assertEquals(400, refused.getStatusCode().value(),
                "a filter that is accepted and not applied must arrive as a client error");
        assertTrue(refused.getReason().contains("\"tenantId\""),
                "the refusal has to name the field the caller guessed, was: " + refused.getReason());
    }

    @Test
    void anEmptyTenantIdIsRefusedToo() {
        // `?tenantId=` still asks for a filter; an empty value is not a reason to drop it silently.
        // `?tenantId=` 仍是在要一个筛选；空值不是静默丢弃它的理由。
        MockHttpServletRequest request = read("tenantId", "");

        assertThrows(ResponseStatusException.class,
                () -> guard.preHandle(request, new MockHttpServletResponse(), new Object()));
    }

    @Test
    void pageIsRefusedLikeAnyUndeclaredName() {
        // The read face pages by `limit`/`offset`; `page` was silently ignored before this guard.
        // 读面用 `limit`/`offset` 翻页；本守卫之前 `page` 是被静默忽略的。
        MockHttpServletRequest request = read("page", "1");

        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> guard.preHandle(request, new MockHttpServletResponse(), new Object()));
        assertTrue(refused.getReason().contains("\"page\""));
    }

    @Test
    void everyDeclaredParameterStillPasses() {
        for (String name : YudaoAuditReadParamsGuard.DECLARED_PARAMS) {
            MockHttpServletRequest request = read(name, "1");

            assertDoesNotThrow(() -> guard.preHandle(request, new MockHttpServletResponse(), new Object()),
                    "declared parameter " + name + " must keep its existing handling");
        }
    }

    @Test
    void anUnfilteredReadPasses() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/audit/logs");

        assertDoesNotThrow(() -> guard.preHandle(request, new MockHttpServletResponse(), new Object()));
    }

    @Test
    void theRefusalAlsoListsWhatIsDeclared() {
        MockHttpServletRequest request = read("tenantType", "121");

        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> guard.preHandle(request, new MockHttpServletResponse(), new Object()));
        assertTrue(refused.getReason().contains("userId, since, until, objectType, objectId"),
                "a caller needs the declared names to correct the request, was: " + refused.getReason());
    }

    private static MockHttpServletRequest read(String name, String value) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/audit/logs");
        request.addParameter(name, value);
        return request;
    }
}
