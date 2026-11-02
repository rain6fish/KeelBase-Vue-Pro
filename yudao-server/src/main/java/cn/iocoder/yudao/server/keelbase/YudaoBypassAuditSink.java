// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

/**
 * 旁路留痕往哪儿放 —— 一处接口，两个理由。
 *
 * <p><b>一：过滤器不碰库。</b>{@link YudaoBypassAuditFilter} 在请求线程上跑，它只把一行交出去；写库是回收端
 * 的事，回收端慢或坏，请求也不知道。这正是「只记不改」的形状。
 *
 * <p><b>二：红绿都能量。</b>测试拿一个记账用的实现，就能断言「这一次请求交出去几行、行里是什么」，而不必为了
 * 一条断言起一个库。
 *
 * <p>实现**必须**自己吞掉失败：{@code record} 抛出去就等于让留痕影响请求，而这一层的全部承诺正是不影响。
 *
 * <p>Where a bypass trace goes — an interface for two reasons.
 *
 * <p><b>One: the filter does not touch the database.</b> {@link YudaoBypassAuditFilter} runs on the
 * request thread and only hands a row to someone else; writing is the drainer's business, and a slow or
 * broken drainer is invisible to the request. That is what "recorded, never altered" looks like.
 *
 * <p><b>Two: red and green are both measurable.</b> A test passes a counting implementation and asserts
 * which rows one request handed over — without standing up a database to do it.
 *
 * <p>An implementation **must** swallow its own failures: a {@code record} that throws would let the
 * trail affect the request, and not affecting it is the whole promise of this layer.
 */
public interface YudaoBypassAuditSink {

    /** 收下一行。实现不得抛出。 / Takes one row. An implementation must not throw. */
    void record(YudaoBypassAuditRow row);
}
