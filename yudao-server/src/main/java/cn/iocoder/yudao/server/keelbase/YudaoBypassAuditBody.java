// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.util.servlet.ServletUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 一次写请求的正文，按旁路层**允许**记住的样子：长度、摘要、顶层字段名 —— **一个值都没有**。
 *
 * <p><b>为什么只记这三样。</b>计划要求记「请求体摘要（脱敏：不记口令 / token / 联系方式）」。要逐模块认出
 * 哪个字段是联系方式，得读遍每个模块的 VO —— 那是另一个量级的工作。反过来做：**值根本不进库**，于是
 * 没有「认漏了哪个字段」这件事。留下的三样各答一个问题：多长（有没有东西）、是不是同一份（摘要）、
 * 涉及哪几个字段（形状）。
 *
 * <p><b>摘要不是值，但它也不该被当成值来用。</b>只留前 12 位十六进制：够说「两次写是不是同一份正文」，
 * 不够从它反推正文。它是**同一个请求**在两种时刻的比对，不是内容检索。
 *
 * <p><b>字段名也可能带出值。</b>一个以手机号 / 邮箱为键的 map，键本身就是值。故只收**看起来像字段名**的
 * 键（ASCII 标识符：字母或下划线开头、其后字母数字下划线），其余**静默丢掉** —— 丢掉一个名字的代价是这一列
 * 少一项，记下一个手机号的代价是一次泄露。数量上限 {@value #MAX_FIELDS} 个，整串上限
 * {@value #MAX_FIELD_CHARS} 字符（与列宽一致）。
 *
 * <p><b>什么不读。</b>正文超过 {@value #MAX_BYTES} 字节的不读（长度照记，摘要与字段名留空）；声明长度未知
 * 的（分块传输）不读；非 JSON 不读；**流式答复的请求不读** —— 由调用方 {@link YudaoBypassAuditFilter} 判。
 * 「不读」体现为 null，与「读出来是空的」区分开。
 *
 * <p><b>它不碰响应。</b>本类在读侧只做一件事：把已经缓存的字节再包一层，好让后面对 {@code @RequestBody}
 * 仍然可读。响应一个字节都不经这里 —— 这是「不打断流式答复」靠的形状，不是靠事后小心。
 *
 * <p>A write request's body, as the trail is **allowed** to remember it: length, a digest and top-level
 * field names — **not one value**.
 *
 * <p><b>Why only these three.</b> The plan asked for a body summary, redacted: no passwords, no tokens, no
 * contact details. Telling which field of every module's VO is a contact detail means reading every VO —
 * a different order of work. So the design goes the other way: **no value enters the table**, and there is
 * then no "missed a field" to worry about. What is left answers three questions: how big (was there
 * anything at all), is it the same one (digest), which fields (shape).
 *
 * <p><b>A digest is not a value, but it is not to be used as one either.</b> Only the first 12 hex digits
 * are kept: enough to say "same body or not", not enough to walk back to the body. It compares one request
 * across two moments; it is not a content index.
 *
 * <p><b>A field name can carry a value too.</b> In a map keyed by phone number or e-mail, the key is the
 * value. So only keys shaped like a field name (an ASCII identifier) are kept and the rest are **dropped
 * silently** — losing a name costs one cell, recording a phone number costs a leak. At most
 * {@value #MAX_FIELDS} names and {@value #MAX_FIELD_CHARS} characters, matching the column.
 *
 * <p><b>What is not read.</b> A body over {@value #MAX_BYTES} bytes (the length is still recorded; digest
 * and names stay null), a body of unknown declared length (chunked), anything not JSON, and **the request
 * of a streaming answer** — the last decided by the caller. "Not read" is null, kept apart from "read and
 * empty".
 *
 * <p><b>It never touches the response.</b> The only thing this class does on the read side is put the
 * already-cached bytes back behind a wrapper so {@code @RequestBody} can still read them. Not a byte of
 * the response passes through here — that is why a streaming answer cannot be disturbed by it, by shape
 * rather than by care.
 */
final class YudaoBypassAuditBody {

    /** 正文的读取上限：超过就不读。够放一次管理端写，不让一个超大上传把留痕变成一次拷贝。 */
    /** The read cap: anything larger is not read. Room for a console write, no copy of a huge upload. */
    static final int MAX_BYTES = 64 * 1024;

    /** 字段名个数上限。 / The most field names kept. */
    static final int MAX_FIELDS = 40;

    /** 字段名整串的字符上限，与 `sql/keelbase-bypass-audit.sql` 的列宽一致。 */
    /** Character cap of the joined names, matching the column in `sql/keelbase-bypass-audit.sql`. */
    static final int MAX_FIELD_CHARS = 512;

    /**
     * 什么算「像字段名」：ASCII 标识符。中文键、带连字符的键、以数字开头的键都不收 —— 它们更像值。
     *
     * <p>What counts as a field name: an ASCII identifier. A CJK key, a dashed key or one starting with a
     * digit is not kept — those are more likely a value.
     */
    private static final Pattern FIELD_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,63}");

    private static final ObjectMapper JSON = new ObjectMapper();

    private final int length;
    private final String sha256;
    private final String fields;

    private YudaoBypassAuditBody(byte[] body) {
        this.length = body.length;
        this.sha256 = digest(body);
        this.fields = fieldNames(body);
    }

    int length() {
        return length;
    }

    /** 前 12 位十六进制；算不出摘要时为空。 / The first 12 hex digits; empty when no digest can be had. */
    String sha256() {
        return sha256;
    }

    /** 逗号分隔的顶层字段名；不是 JSON 对象、解析不出、或没有可收的名字时为空。 */
    /** Comma-separated top-level names; empty when the body is not a JSON object or names nothing. */
    String fields() {
        return fields;
    }

    /**
     * 把这个请求包成「正文可读两次」，并把字节留给 {@link #summaryOf} 取。**不读就不包**：超过上限或长度
     * 未知时原样返回请求 —— 一个没被我们读过的流，下游照旧能读。
     *
     * <p>Wraps the request so the body can be read twice and keeps the bytes for {@link #summaryOf}.
     * **Not read means not wrapped**: over the cap or of unknown length, the request goes through as it
     * is — a stream we never touched is still readable downstream.
     */
    static HttpServletRequest capture(HttpServletRequest request) {
        long declared = request.getContentLengthLong();
        if (declared < 0 || declared > MAX_BYTES) {
            return request;
        }
        // 只对 JSON：`getBodyBytes` 对别的类型返回 null，而那时流没被动过。
        // JSON only: `getBodyBytes` answers null for anything else, and the stream is then untouched.
        byte[] body = ServletUtils.getBodyBytes(request);
        if (body == null) {
            return request;
        }
        return new BodyRequest(request, body);
    }

    /**
     * 交给旁路行的摘要；这个请求没被包过（没读）时为 null。
     *
     * <p>The summary for the trail row; null when the request was never wrapped (never read).
     */
    static YudaoBypassAuditBody summaryOf(HttpServletRequest request) {
        if (!(request instanceof BodyRequest captured)) {
            return null;
        }
        return new YudaoBypassAuditBody(captured.body);
    }

    private static String digest(byte[] body) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(body);
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.substring(0, 12);
        } catch (NoSuchAlgorithmException impossible) {
            // 每台 JVM 都带 SHA-256；真没有也只是一列空着，不该让留痕失败。
            // Every JVM ships SHA-256; if one did not, one column stays empty — the trail still runs.
            return null;
        }
    }

    /**
     * 顶层字段名：只认 JSON 对象、只收像字段名的键、按文序、有上限。数组与标量给空 —— 它们没有「字段」。
     *
     * <p>Top-level names: JSON objects only, identifier-shaped keys only, in document order, capped. An
     * array or a scalar answers empty — neither has fields.
     */
    private static String fieldNames(byte[] body) {
        JsonNode root;
        try {
            root = JSON.readTree(body);
        } catch (Exception notJson) {
            return null;
        }
        if (root == null || !root.isObject()) {
            return null;
        }
        List<String> names = new ArrayList<>(MAX_FIELDS);
        Iterator<String> it = root.fieldNames();
        int used = 0;
        while (it.hasNext() && names.size() < MAX_FIELDS) {
            String name = it.next();
            if (!FIELD_NAME.matcher(name).matches()) {
                continue;
            }
            int next = used + (names.isEmpty() ? 0 : 1) + name.length();
            if (next > MAX_FIELD_CHARS) {
                break;
            }
            names.add(name);
            used = next;
        }
        return names.isEmpty() ? null : String.join(",", names);
    }

    /**
     * 原样回放的请求：`getInputStream` 每次给一条新流，故下游读一次、这里再读一次都不互相吃掉。
     *
     * <p>The replaying request: every `getInputStream` hands out a fresh stream, so a downstream read and
     * this class's own read never eat each other's bytes.
     */
    static final class BodyRequest extends HttpServletRequestWrapper {

        private final byte[] body;

        BodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return input.read();
                }

                @Override
                public int read(byte[] target, int offset, int length) {
                    return input.read(target, offset, length);
                }

                @Override
                public boolean isFinished() {
                    return input.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException("async read is not used on this path");
                }

                @Override
                public int available() {
                    return input.available();
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }
    }
}
