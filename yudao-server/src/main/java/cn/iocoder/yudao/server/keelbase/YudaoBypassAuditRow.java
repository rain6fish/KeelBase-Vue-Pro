// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.time.Instant;

/**
 * 一次上游写请求，按旁路层记下的样子。
 *
 * <p>它**不是**一条审计行：审计行说「这次提议走到了什么结局」，本条只说「这个请求发生过、答的是这两个码」。
 * 两类事实分开存（见 `sql/keelbase-bypass-audit.sql`），故读的人不会把一条留痕读成一次确认。
 *
 * <p><b>两个码，不是一个。</b>本宿主把**业务拒绝**包在 HTTP 200 里（信封的 `code` 是 403、HTTP 是 200），故
 * 只记 HTTP 状态会让一行 200 被读成「写成功了」。`resultCode` 是信封里的那个码，取自宿主自己的
 * `GlobalResponseBodyHandler` 留在请求上的 `CommonResult` —— 与访问日志读的是同一处，不另开口径；请求没有产出
 * 信封时（404、流式、未处理异常）它是 null，而 null 是「宿主没答业务码」，不是 0。
 *
 * <p>`module` 与 `object` 是从路径解析出来的，解析不出时为 null —— null 是「不知道」，不是「没有对象」。
 *
 * <p>One upstream write request, as the bypass layer records it.
 *
 * <p>This is **not** an audit row: an audit row says what became of a proposal, while this one says only
 * that a request happened and answered with these two codes. The two facts live apart (see
 * `sql/keelbase-bypass-audit.sql`), so a trail row cannot be read as a confirmation.
 *
 * <p><b>Two codes, not one.</b> This host wraps a **business refusal** in HTTP 200 (the envelope's `code`
 * is 403 while HTTP is 200), so recording the HTTP status alone would let a 200 row read as "the write
 * succeeded". `resultCode` is the envelope's code, taken from the `CommonResult` the host's own
 * `GlobalResponseBodyHandler` left on the request — the same place the access log reads, not a second
 * opinion; it is null when the request produced no envelope (404, streaming, an unhandled exception), and
 * null means "the host answered no business code", not 0.
 *
 * <p>`module` and `object` are parsed off the path; both are null when the path does not name them —
 * null means "not known", not "no object".
 */
public record YudaoBypassAuditRow(
        Instant occurredAt,
        String method,
        String path,
        String module,
        String object,
        Long callerId,
        Long tenantId,
        int httpStatus,
        Integer resultCode,
        long durationMs) {
}
