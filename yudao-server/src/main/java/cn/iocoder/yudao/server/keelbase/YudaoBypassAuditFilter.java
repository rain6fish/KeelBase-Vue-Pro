// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import cn.iocoder.yudao.framework.common.util.servlet.ServletUtils;
import cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 上游 REST 的每一次写，留一条痕 —— **只记，不改**。
 *
 * <p><b>它补的是哪一段。</b>AI 走的那条路（`GovernedExecutionEngine`）有策略、有确认、有审计链、有副作用
 * 台账，`YD-24` 把它数得清。剩下的那一大片没有：控制台直接点「保存」发的是 `POST /admin-api/...`，绕过
 * 一切治理而**不留任何痕迹** —— 本部署 7 个模块 435 个写端点，此前一个都不例外。这一层不改那些端点、
 * 不给它们加策略、不扣人，只让它们**留下可查的一行**。
 *
 * <p><b>它刻意不是治理。</b>一条旁路行**没有**确认、**没有**策略裁决、**没有**副作用台账。混进审计链会让
 * 一条留痕被读成一次「有人批过」，故它是**另一张表**、另一个读面（见 `sql/keelbase-bypass-audit.sql`）。
 * 页面与文案必须分开说这一点，否则外部读者会把「留痕」读成「受治理」。
 *
 * <p><b>两个码。</b>本宿主把业务拒绝包在 HTTP 200 里，故一行只记线缆状态会被读成「写成功了」；旁路行同时记
 * `http_status` 与信封的 `result_code`（取自 `WebFrameworkUtils.getCommonResult`，与访问日志同一处），
 * 前者说线缆上是什么，后者说实际发生了什么。
 *
 * <p><b>正文只记形状，不记内容。</b>非流式的 JSON 写，一行带 `{长度, sha256 前 12 位, 顶层字段名}`；值一个都
 * 不进库，故没有「哪个模块的哪个字段是口令」要逐个去认。包的是**请求**（把缓存字节回放给下游），响应不经这里
 * —— 流式答复因此不受影响，是形状上不受影响。细则在 {@link YudaoBypassAuditBody}。
 *
 * <p><b>Why a plain {@link Filter}, not {@code OncePerRequestFilter}.</b>那层基类会在**嵌套派发**上短路
 * （它按一次请求记过名就不再进），而这一层要的是**每个请求恰一行**、且不想被错误派发再记一遍：普通过滤器只
 * 按注册的派发类型跑（这里只有 `REQUEST`），错误页那次派发不会经过它 ⇒ 一次写就是一行，既不少也不重。
 * 同一条理由也解释了它为什么**不碰 controller**：过滤器在 MVC 之前，任何上游端点都不必知道它存在。
 *
 * <p><b>为什么与工具路径不重行。</b>受治理的工具在本进程里**直接调 service**，不发 HTTP；与模型对话的
 * `/admin/ai/chat/stream` 也不在 `/admin-api/` 之下。故「旁路层记录的那些请求」与「引擎已经记过的那些调用」
 * 是两个不相交的集合 —— 不是靠事后去重，是靠两条路根本不交叉。测试把这两条形状都钉住了。
 *
 * <p><b>慢与坏都不外溢。</b>留痕交出去之后的事（排队、写库、丢弃）都在 {@link YudaoBypassAuditSink} 里，
 * 本类只保证：写出去了、请求原样返回、异常原样抛出。
 *
 * <p>A trace for every upstream REST write — **recorded, never altered**.
 *
 * <p><b>The gap it fills.</b> The path AI takes (`GovernedExecutionEngine`) has policy, confirmation, the
 * audit chain and a side-effect ledger, and `YD-24` counts all of it. The rest does not: pressing "save" in
 * the console sends `POST /admin-api/...`, which bypasses every governance step and left **no trace at
 * all** — 435 write endpoints across this deployment's 7 modules, none of them an exception until now.
 * This layer changes none of those endpoints, adds no policy, holds nobody up; it only gives them a row
 * somebody can look up.
 *
 * <p><b>It is deliberately not governance.</b> A bypass row has no confirmation, no policy decision and
 * no side-effect ledger. Mixed into the audit chain, a trace would read as "a human approved this", so it
 * is **another table** with its own read face (see `sql/keelbase-bypass-audit.sql`). Pages and copy must
 * say so apart from the chain, or an outside reader will read "traced" as "governed".
 *
 * <p><b>The body keeps its shape, never its content.</b> A non-streaming JSON write carries
 * `{length, first 12 digits of a SHA-256, top-level field names}`; not one value enters the table, so there
 * is no per-module hunt for "which field is a password". What is wrapped is the **request** (cached bytes
 * replayed downstream); the response does not pass through here — so a streaming answer is undisturbed by
 * shape. Details in {@link YudaoBypassAuditBody}.
 *
 * <p><b>Why a plain {@link Filter} and not {@code OncePerRequestFilter}.</b> That base class short-circuits
 * nested dispatches (it marks a request as seen), and what this layer wants is **exactly one row per
 * request** with the error dispatch adding nothing. A plain filter runs for the dispatch types it is
 * registered with (only `REQUEST` here), so the error page's dispatch does not reach it — one write, one
 * row, neither short nor doubled. The same reasoning explains why it does not touch a controller: a filter
 * runs before MVC, so no upstream endpoint has to know it exists.
 *
 * <p><b>Why it never doubles a tool path.</b> A governed tool calls the service **in this process** and
 * issues no HTTP; the model conversation route `/admin/ai/chat/stream` is not under `/admin-api/` either.
 * So "the requests this layer records" and "the calls the engine already recorded" are disjoint sets —
 * not by de-duplicating afterwards, but because the two paths never cross. The tests pin both shapes.
 *
 * <p><b>Neither slowness nor failure escapes.</b> What happens after a row is handed over (queueing,
 * writing, dropping) lives in {@link YudaoBypassAuditSink}. This class guarantees three things only: the
 * row is handed over, the response is untouched, and an exception is rethrown as itself.
 */
public class YudaoBypassAuditFilter implements Filter {

    private static final Logger LOG = LoggerFactory.getLogger(YudaoBypassAuditFilter.class);

    /** 留痕管的那一段。上游控制台的写全在这里；运行时的 `/ai/**`、管理端会话 `/admin/` 都不在。 */
    /** The surface the trail covers. Every console write is under it; the runtime's `/ai/**` and the
     *  admin conversation route `/admin/` are not. */
    static final String ADMIN_API_PREFIX = "/admin-api/";

    /**
     * 不记的前缀：登录与刷新带口令，令牌端点带密钥 —— 一旦记进一张可读的表，就会是一个永远不该有的副本。
     * 这不是「不方便记」，是**记下来本身**就是一次泄露。
     *
     * <p>Prefixes never recorded: login and refresh carry a password, the token endpoints carry a secret,
     * and a copy of either in a readable table is a leak in itself — not merely inconvenient to record.
     */
    static final List<String> EXCLUDED_PREFIXES = List.of(
            "/admin-api/system/auth/",
            "/admin-api/system/oauth2/");

    /** 列的宽度上限，与 `sql/keelbase-bypass-audit.sql` 一致：超长截断，而不是让一行写不进去。 */
    /** The column caps, matching `sql/keelbase-bypass-audit.sql`: over-long values are cut, not dropped. */
    static final int PATH_MAX = 512;
    static final int SEGMENT_MAX = 64;

    /** 流式答复在 HTTP 上的那句表态：调用方要的是它，正文就不读。 / What a streaming answer asks for. */
    static final String TEXT_EVENT_STREAM = "text/event-stream";

    private final YudaoBypassAuditSink sink;

    public YudaoBypassAuditFilter(YudaoBypassAuditSink sink) {
        this.sink = sink;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest httpRequest)
                || !(response instanceof HttpServletResponse httpResponse)
                || !records(httpRequest)) {
            chain.doFilter(request, response);
            return;
        }
        // 正文摘要只包**非流式**的 JSON 写：包的是**请求**（把缓存的字节回放给下游），响应一个字节都不经
        // 这里 —— 故它按形状就不可能打断一条流式答复。
        // The body summary wraps **non-streaming** JSON writes only, and it wraps the **request** (replaying
        // cached bytes downstream); not a byte of the response passes through, so by shape it cannot disturb
        // a streaming answer.
        HttpServletRequest passing = capturesBody(httpRequest)
                ? YudaoBypassAuditBody.capture(httpRequest)
                : httpRequest;
        long started = System.nanoTime();
        YudaoBypassAuditBody body = YudaoBypassAuditBody.summaryOf(passing);
        int resultCode;
        try {
            chain.doFilter(passing, response);
            resultCode = httpResponse.getStatus();
        } catch (IOException | ServletException | RuntimeException failed) {
            // 一次失败的写也是一次尝试：先留一行（码取 500 —— 走到这里说明没有正常的结果码），再把失败
            // 原样抛出去。留痕**不得**替换掉那个异常，故这里只做交出、不做别的。
            // A failed write is still an attempt: leave the row (500 — reaching here means there was no
            // ordinary result code), then rethrow the failure as itself. The trail must never replace the
            // exception, so nothing but hand-over happens here.
            trace(httpRequest, httpResponse, 500, started, body);
            throw failed;
        }
        trace(httpRequest, httpResponse, resultCode, started, body);
    }

    /**
     * 这次请求的正文要不要读。四条同时成立才读：是一次要记的写、是 JSON、**不是**流式答复（调用方要的是
     * `text/event-stream`，或路径以 `-stream` 结尾）。后两条是「只包非流式」这句话的可执行形态。
     *
     * <p>为什么连路径也看：有的客户端发流式请求时不带 `Accept`，而 `/admin-api/ai1/session/message/send-stream`
     * 与 `.../resume-stream` 的响应由 `SseEmitter` 写，正文里的内容是用户的提问。读**请求**不会打断它，
     * 但一条流式请求的正文不该被当成「一次管理端写的正文」来记 —— 那会把「留痕读 WHAT」变成「留痕读对话」。
     *
     * <p>Whether to read this request's body. Four things must hold: it is a write the trail records, it is
     * JSON, and it is **not** a streaming answer (the caller asked for `text/event-stream`, or the path ends
     * in `-stream`). The last two are the executable form of "non-streaming only".
     *
     * <p>Why the path too: some clients send a streaming request without an `Accept` header, and
     * `/admin-api/ai1/session/message/send-stream` and `.../resume-stream` answer through an `SseEmitter`
     * whose body is the user's question. Reading the **request** does not disturb it, but a streaming
     * request's body should not be recorded as "the body of a console write" — that would turn "the trail
     * reads WHAT" into "the trail reads the conversation".
     */
    static boolean capturesBody(HttpServletRequest request) {
        if (!ServletUtils.isJsonRequest(request)) {
            return false;
        }
        String uri = request.getRequestURI();
        if (uri != null && uri.endsWith("-stream")) {
            return false;
        }
        String accept = request.getHeader("Accept");
        return accept == null || !accept.toLowerCase(Locale.ROOT).contains(TEXT_EVENT_STREAM);
    }

    /**
     * 交出一行。交出本身失败也只写日志：这一层不改变任何东西，包括「出错时该看见哪个异常」。
     *
     * <p><b>业务码从宿主自己的那一处读。</b>信封的 `code` 由 `GlobalResponseBodyHandler` 留在请求上
     * （`WebFrameworkUtils.getCommonResult`），访问日志读的也是它 —— 故这里不另开口径，也不包一层响应去把正文
     * 读出来（那会打断 `/admin-api/ai1/**` 的流式答复）。请求没产出信封时是 null。
     *
     * <p>Hands one row over. Even that hand-over failing is only logged: this layer changes nothing,
     * including which exception a caller sees.
     *
     * <p><b>The business code comes from the host's own place.</b> The envelope's `code` is left on the
     * request by `GlobalResponseBodyHandler` (`WebFrameworkUtils.getCommonResult`), which is what the
     * access log reads too — so this adds no second opinion, and it does not wrap the response to read the
     * body (that would break `/admin-api/ai1/**`'s streaming answers). Null when no envelope was produced.
     */
    private void trace(HttpServletRequest request, HttpServletResponse response, int httpStatus,
                       long started, YudaoBypassAuditBody body) {
        try {
            String[] subject = subjectOf(request.getRequestURI());
            CommonResult<?> answered = WebFrameworkUtils.getCommonResult(request);
            sink.record(new YudaoBypassAuditRow(
                    Instant.now(),
                    request.getMethod(),
                    cut(request.getRequestURI(), PATH_MAX),
                    subject == null ? null : subject[0],
                    subject == null ? null : subject[1],
                    SecurityFrameworkUtils.getLoginUserId(),
                    TenantContextHolder.getTenantId(),
                    httpStatus,
                    answered == null ? null : answered.getCode(),
                    (System.nanoTime() - started) / 1_000_000L,
                    body == null ? null : body.length(),
                    body == null ? null : body.sha256(),
                    body == null ? null : body.fields()));
        } catch (RuntimeException failed) {
            LOG.warn("bypass trail row not handed over ({} {}): {}", request.getMethod(),
                    request.getRequestURI(), failed.toString());
        }
    }

    /** 这个请求要不要记：写方法 + 管理端前缀 + 不在排除段内。 */
    /** Whether this request is recorded: a write method, the admin prefix, and not in an excluded slice. */
    static boolean records(HttpServletRequest request) {
        String method = request.getMethod();
        if (!"POST".equals(method) && !"PUT".equals(method)
                && !"DELETE".equals(method) && !"PATCH".equals(method)) {
            return false;
        }
        String uri = request.getRequestURI();
        if (uri == null || !uri.startsWith(ADMIN_API_PREFIX)) {
            return false;
        }
        for (String excluded : EXCLUDED_PREFIXES) {
            if (uri.startsWith(excluded)) {
                return false;
            }
        }
        return true;
    }

    /**
     * 从路径解析业务对象：`/admin-api/crm/contract/create` ⇒ `{crm, contract}`。不足两段时为 null。
     *
     * <p>**按形状解析、不查表**：解析出来的名字只是这一行「说的是哪一类东西」，而不是一次裁决；解析错了也
     * 只影响这一列的可用性，不影响「这个请求发生过」。故它不依赖任何模块清单 —— 新模块进来即生效。
     *
     * <p>Parses the business object off the path: `/admin-api/crm/contract/create` ⇒ `{crm, contract}`;
     * null when there are fewer than two segments.
     *
     * <p>**Parsed by shape, not looked up**: the names only say what kind of thing a row is about, not a
     * decision, and getting them wrong costs this column's usefulness and nothing else — the row still
     * says the request happened. So it needs no module inventory, and a new module works on arrival.
     */
    static String[] subjectOf(String requestUri) {
        if (requestUri == null || !requestUri.startsWith(ADMIN_API_PREFIX)) {
            return null;
        }
        String rest = requestUri.substring(ADMIN_API_PREFIX.length());
        int slash = rest.indexOf('/');
        if (slash <= 0) {
            return null;
        }
        String module = rest.substring(0, slash);
        int next = rest.indexOf('/', slash + 1);
        String object = next < 0 ? rest.substring(slash + 1) : rest.substring(slash + 1, next);
        if (object.isEmpty()) {
            return null;
        }
        return new String[] {cut(module, SEGMENT_MAX), cut(object, SEGMENT_MAX)};
    }

    private static String cut(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
