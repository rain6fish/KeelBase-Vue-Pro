// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.audit.ExecutionTraceHolder;
import cn.iocoder.yudao.framework.common.enums.WebFilterOrderEnum;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.common.util.servlet.ServletUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.web.config.WebProperties;
import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * 上游自己的 REST 写的一条**只记不改**的旁路审计（D1「甲+丁」里的「丁」）。
 *
 * <p><b>它记什么。</b>`/admin-api/**` 的 POST/PUT/DELETE/PATCH 留一行：谁（`user_id`）、何时（`created_at`）、
 * 对哪个业务对象（`business_object`、`action`）、用哪个方法（`request_method`）、结果如何（HTTP 状态 +
 * 信封的 `result_code`）。**不改请求、不扣人、不弹确认**：这条记录不是受治理路径，也不把请求变慢多少。
 *
 * <p><b>它不写进哈希链。</b>落点是新表 `keelbase_bypass_audit`（只追加、不参与任何链），**绝不**写
 * `ai_audit_logs` —— 那是一条哈希链，掺一条不是治理引擎写下的行就是把链剪断。
 *
 * <p><b>与治理行怎么分开、怎么关联。</b>受治理的工具**不经过** `/admin-api`：`Crm*Tools` 拿到的是
 * `CrmContactService` 之类的服务 bean，直接调方法（见 {@code CrmContactTools} 的 `execute`）。所以一次
 * 工具写在这里是**零行**，不会与引擎写的治理行重复。两者靠 `trace_id` 关联：宿主
 * {@link YudaoExecutionTraceFilter} 已在请求期间把同一个 trace id 放进 {@link ExecutionTraceHolder}，治理行
 * 与旁路行都取它。
 *
 * <p><b>为什么是普通 {@link Filter}、不是 {@code OncePerRequestFilter}。</b>后者会短路 ERROR 派发与嵌套派发
 * —— 本仓已经踩过两次（见 {@code ServletErrorDispatchAndOncePerRequest} 那条记录）。这里按容器给的派发顺序
 * 跑一次，注册时又限定 `REQUEST`，于是 ERROR 派发**不会**再记一行。
 *
 * <p><b>与既有访问日志的关系（先说明，别默默并行两套）。</b>上游已有 `ApiAccessLogFilter` +
 * `infra_api_access_log`，它记**所有** `/admin-api` 与 `/app-api` 请求。本层**不复用它**，理由四条：
 * ① 它不是写台账 —— 读请求、登录、心跳都在里面，无法回答「这次写有没有没走 AI」；② 它的脱敏只认
 * `password`/`token`/`accessToken`/`refreshToken`，**联系方式**（手机、邮箱、地址）会原样落库，违反管理端红线；
 * ③ 它是 `OncePerRequestFilter`（`ApiRequestFilter`），带着上面那两处派发陷阱；④ `application-local.yaml`
 * 默认把它关着（`yudao.access-log.enable: false`），故它不能当「一定有」的记录。那份访问日志保持原样，
 * 继续做排错用；本层是部署的**写台账**。
 *
 * <p><b>复用的是什么。</b>trace id 来自 {@link YudaoExecutionTraceFilter}；JSON 请求体由上游
 * `CacheRequestBodyFilter` 缓存（`/admin-api` 不在它的排除名单里），故本过滤器在链结束后才读体，既不消费
 * 流、也不另造一个 wrapper。{@code YudaoAdminRequestBodyCache} 修的是 `/admin/` 那一段，与本层不重叠。
 *
 * A record-only bypass trail for upstream's own REST writes (the "丁" half of D1's "甲+丁").
 *
 * <p>It records one row per POST/PUT/DELETE/PATCH under `/admin-api/**`: who, when, which business object,
 * which method, what result. It changes no request, detains nobody, asks nobody. It is not a governed path.
 *
 * <p>It writes to a new append-only table, `keelbase_bypass_audit`, never to the hash-chained
 * `ai_audit_logs` — a row not written by the governance engine would cut that chain. Governed tools do
 * **not** pass through `/admin-api` (they call service beans directly), so a tool write leaves **zero**
 * bypass rows; the two paths are joined by the `trace_id` the host's trace filter already publishes.
 *
 * <p>It is a plain {@link Filter}, not a `OncePerRequestFilter`, because the latter short-circuits ERROR and
 * nested dispatches — two traps this repository has already paid for. It is registered for `REQUEST` only.
 *
 * <p>The upstream access log (`ApiAccessLogFilter` / `infra_api_access_log`) is deliberately not reused: it
 * is not write-only, its mask does not cover contact details, it is a `OncePerRequestFilter`, and the local
 * profile disables it by default. It stays untouched as diagnostics; this layer is the deployment's write
 * ledger. The JSON body is read after the chain from upstream's existing cached wrapper, so no second
 * wrapper is built and no stream is consumed before the controller.
 */
@Configuration
@EnableConfigurationProperties(YudaoBypassAudit.Properties.class)
@Slf4j
public class YudaoBypassAudit {

    static final String TABLE = "keelbase_bypass_audit";
    static final int MAX_URL = 512;
    static final int MAX_DIGEST = 1024;

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "DELETE", "PATCH");

    /** 不记的路径：健康检查，以及登录/刷新（它们不是业务写，且带口令）。 */
    /** Paths not recorded: health, plus login/refresh (not business writes, and they carry credentials). */
    private static final List<String> EXCLUDED_PREFIXES = List.of(
            "/actuator",
            "/admin-api/system/auth/logout");

    private static final List<String> EXCLUDED_MARKERS = List.of(
            "login",
            "refresh-token");

    /**
     * 键名里出现这些片段的，值一律换成 `***`：口令、令牌、联系方式、身份与账户字段。
     * Values of keys carrying any of these fragments become `***`: credentials, tokens, contact details,
     * identity and account fields.
     */
    private static final List<String> SENSITIVE_KEY_FRAGMENTS = List.of(
            "password", "passwd", "pwd", "token", "secret", "credential", "authorization",
            "mobile", "telephone", "phone", "email", "mail", "wechat", "qq",
            "idcard", "id-card", "address", "bank", "account");

    /**
     * 只用来解析请求体。它是**我们自己的**、不是 {@link JsonUtils#parseTree}：后者解析失败会把原文打进
     * 日志，而原文正是本层承诺不留的东西。
     *
     * Only for parsing request bodies. It is **ours**, not {@link JsonUtils#parseTree}: that one logs the raw
     * text when parsing fails, which is exactly the body this layer promises not to keep.
     */
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Bean(destroyMethod = "close")
    YudaoBypassAuditWriter yudaoBypassAuditWriter(javax.sql.DataSource dataSource) {
        return new YudaoBypassAuditWriter(dataSource);
    }

    @Bean
    FilterRegistrationBean<BypassAuditFilter> bypassAuditFilter(WebProperties webProperties,
                                                                Properties properties,
                                                                YudaoBypassAuditWriter writer) {
        FilterRegistrationBean<BypassAuditFilter> registration = new FilterRegistrationBean<>(
                new BypassAuditFilter(webProperties.getAdminApi().getPrefix(), properties.isEnabled(), writer));
        // 在请求体缓存与租户上下文之后、Spring Security 之前：401/404 的写也仍是我们想看见的写。
        // 用户编号在链结束后才读，那时 security 已经把它放好。
        // After the body cache and the tenant context, before Spring Security: a 401/404 write is still a
        // write we want to see. The user id is read after the chain, when security has populated it.
        registration.setOrder(WebFilterOrderEnum.XSS_FILTER - 1);
        registration.setDispatcherTypes(DispatcherType.REQUEST);
        return registration;
    }

    /** 一次旁路记录的全部内容；写入方拿到的是一份不可变快照。 */
    /** Everything one bypass row carries; the writer receives an immutable snapshot. */
    public record BypassAuditRecord(
            Long tenantId,
            String traceId,
            Long userId,
            Integer userType,
            String requestMethod,
            String requestUrl,
            String businessObject,
            String action,
            int resultStatus,
            Integer resultCode,
            String requestDigest,
            int durationMs) {
    }

    /** 写入处；过滤器只认这个窄接口，单测因此不需要数据库。 */
    /** The sink; the filter knows only this narrow interface, so unit tests need no database. */
    public interface Sink {

        void record(BypassAuditRecord record);
    }

    /** `keelbase.bypass-audit.enabled` —— 默认开；关掉时零行，行为不变。 */
    /** `keelbase.bypass-audit.enabled` — on by default; off means zero rows and unchanged behaviour. */
    @ConfigurationProperties(prefix = "keelbase.bypass-audit")
    public static class Properties {

        private boolean enabled = true;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
    }

    /**
     * 把一次上游 REST 写记成一行。**记录失败只写日志**，绝不改变请求的结果。
     *
     * Records one upstream REST write. **A failed record is only logged** and never changes the request's
     * outcome.
     */
    public static final class BypassAuditFilter implements Filter {

        private final String adminPrefix;
        private final boolean enabled;
        private final Sink sink;

        BypassAuditFilter(String adminPrefix, boolean enabled, Sink sink) {
            this.adminPrefix = adminPrefix;
            this.enabled = enabled;
            this.sink = sink;
        }

        @Override
        public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain chain)
                throws IOException, ServletException {
            if (!(servletRequest instanceof HttpServletRequest request)
                    || !(servletResponse instanceof HttpServletResponse response)
                    || !enabled
                    || !isAuditedWrite(request.getMethod(), request.getRequestURI(), request.getContextPath(),
                            adminPrefix)) {
                chain.doFilter(servletRequest, servletResponse);
                return;
            }
            long startedAt = System.nanoTime();
            Throwable failure = null;
            try {
                chain.doFilter(request, response);
            } catch (IOException | ServletException | RuntimeException failed) {
                failure = failed;
                throw failed;
            } finally {
                try {
                    sink.record(snapshot(request, response, failure, startedAt));
                } catch (Throwable ignored) {
                    log.warn("[bypassAudit][recording {} {} failed; the request is unaffected]",
                            request.getMethod(), request.getRequestURI(), ignored);
                }
            }
        }

        private BypassAuditRecord snapshot(HttpServletRequest request, HttpServletResponse response,
                                           Throwable failure, long startedAt) {
            int status = response.getStatus();
            if (failure != null && status < 400) {
                status = 500;
            }
            CommonResult<?> result = WebFrameworkUtils.getCommonResult(request);
            return new BypassAuditRecord(
                    TenantContextHolder.getTenantId(),
                    ExecutionTraceHolder.current(),
                    WebFrameworkUtils.getLoginUserId(request),
                    WebFrameworkUtils.getLoginUserType(request),
                    request.getMethod(),
                    truncate(request.getRequestURI(), MAX_URL),
                    businessObject(request.getRequestURI(), request.getContextPath(), adminPrefix),
                    action(request.getRequestURI(), request.getContextPath(), adminPrefix),
                    status,
                    result != null ? result.getCode() : null,
                    requestDigest(request),
                    (int) Math.min(Integer.MAX_VALUE, (System.nanoTime() - startedAt) / 1_000_000L));
        }

        /**
         * 请求体摘要：解析后按**键名**脱敏，再截断。解析不了就**不留**（绝不落原文）。
         *
         * The body digest: parsed, masked **by key**, then capped. If it cannot be parsed it is **not kept**
         * (the raw text never lands).
         */
        private static String requestDigest(HttpServletRequest request) {
            try {
                if (!ServletUtils.isJsonRequest(request)) {
                    return null;
                }
                String raw = ServletUtils.getBody(request);
                if (raw == null || raw.isBlank()) {
                    return null;
                }
                JsonNode root = MAPPER.readTree(raw);
                mask(root);
                return truncate(MAPPER.writeValueAsString(root), MAX_DIGEST);
            } catch (Throwable unreadable) {
                // 链结束后请求体可能已经不在（未缓存的流、已被提交）。那是「不留摘要」的理由，绝不是扰动请求的理由。
                // After the chain the body may be gone (an uncached stream, a commit in progress). That is a
                // reason to keep no digest, never a reason to disturb the request.
                return null;
            }
        }

        private static void mask(JsonNode node) {
            if (node == null) {
                return;
            }
            if (node.isArray()) {
                node.forEach(BypassAuditFilter::mask);
                return;
            }
            if (!node.isObject()) {
                return;
            }
            ObjectNode object = (ObjectNode) node;
            for (String name : new ArrayList<>(object.propertyNames())) {
                if (isSensitiveKey(name)) {
                    object.put(name, "***");
                } else {
                    mask(object.get(name));
                }
            }
        }

        private static boolean isSensitiveKey(String name) {
            String lower = name.toLowerCase(Locale.ROOT);
            for (String fragment : SENSITIVE_KEY_FRAGMENTS) {
                if (lower.contains(fragment)) {
                    return true;
                }
            }
            return false;
        }
    }

    /** 一次 /admin-api 的写？判定只看路径与方法，不看是否有登录用户。 */
    /** Is this an /admin-api write? Path and method only; a login user is not required. */
    static boolean isAuditedWrite(String method, String uri, String contextPath, String adminPrefix) {
        if (method == null || !WRITE_METHODS.contains(method.toUpperCase(Locale.ROOT))) {
            return false;
        }
        String path = stripContext(uri, contextPath);
        if (!isUnderPrefix(path, adminPrefix)) {
            return false;
        }
        for (String excluded : EXCLUDED_PREFIXES) {
            if (path.startsWith(excluded)) {
                return false;
            }
        }
        String lower = path.toLowerCase(Locale.ROOT);
        for (String marker : EXCLUDED_MARKERS) {
            if (lower.contains(marker)) {
                return false;
            }
        }
        return true;
    }

    /** `crm/customer/create` → `crm.customer`；没有足够路径段时退回可用部分。 */
    /** `crm/customer/create` → `crm.customer`; falls back to whatever segments exist. */
    static String businessObject(String uri, String contextPath, String adminPrefix) {
        String[] segments = tailSegments(uri, contextPath, adminPrefix);
        if (segments.length == 0) {
            return null;
        }
        return truncate(segments.length >= 2 ? segments[0] + "." + segments[1] : segments[0], 128);
    }

    /** 路径最后一段；最后一段是数字时取它前面那一段。 */
    /** The last path segment; when it is numeric, the segment before it. */
    static String action(String uri, String contextPath, String adminPrefix) {
        String[] segments = tailSegments(uri, contextPath, adminPrefix);
        for (int i = segments.length - 1; i >= 0; i -= 1) {
            if (!segments[i].matches("\\d+")) {
                return truncate(segments[i], 128);
            }
        }
        return null;
    }

    private static String[] tailSegments(String uri, String contextPath, String adminPrefix) {
        String path = stripContext(uri, contextPath);
        if (isUnderPrefix(path, adminPrefix)) {
            path = path.substring(adminPrefix.length());
        }
        return Arrays.stream(path.split("/"))
                .filter((segment) -> !segment.isEmpty())
                .toArray(String[]::new);
    }

    private static boolean isUnderPrefix(String path, String prefix) {
        String normalized = prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix;
        return path.equals(normalized) || path.startsWith(normalized + "/");
    }

    private static String stripContext(String uri, String contextPath) {
        String path = uri == null ? "" : uri;
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        return path;
    }

    static String truncate(String text, int max) {
        if (text == null) {
            return null;
        }
        return text.length() <= max ? text : text.substring(0, max);
    }
}
