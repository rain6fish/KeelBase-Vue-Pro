// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 把旁路记录异步写进 `keelbase_bypass_audit`；写失败只写日志，请求不受影响。
 *
 * <p><b>为什么异步、为什么小池子。</b>这条层承诺「不阻断、不改变行为」。故写入跑在一条守护线程上，队列有界；
 * 队列满时就**丢弃并记一条日志**，而不是让请求等 —— 丢一条旁路行比拖慢一次业务写轻。
 *
 * <p><b>为什么不走 MyBatis。</b>旁路行不属于任何业务实体、也不该被租户拦截器或逻辑删除改写；用
 * {@link JdbcTemplate} 直写，列就是这里写下的这些列。写入线程里没有租户上下文，故 `tenant_id` 作为值从记录
 * 里显式带过来。
 *
 * <p><b>表缺了怎么办。</b>每一次写都会失败；这里只在**第一次**失败时打 WARN，之后降到 DEBUG，避免一次部署漏灌
 * 种子就把日志刷满。请求侧永远不受影响。
 *
 * Writes bypass records asynchronously into `keelbase_bypass_audit`; a failed write is only logged.
 *
 * <p>One daemon worker and a bounded queue keep the layer's "never block, never change behaviour" promise:
 * when the queue is full the row is dropped and logged, because a missing bypass row is lighter than a
 * slowed business write. `JdbcTemplate` is used directly — the row belongs to no entity and must not meet
 * the tenant interceptor or logical-delete rewriting. The first insert failure is logged at WARN and the
 * rest at DEBUG, so a deployment that missed the seed does not flood the log; requests are never affected.
 */
@Slf4j
public class YudaoBypassAuditWriter implements YudaoBypassAudit.Sink, AutoCloseable {

    private static final int QUEUE_CAPACITY = 512;

    private static final String INSERT = "insert into " + YudaoBypassAudit.TABLE
            + " (id, tenant_id, trace_id, user_id, user_type, request_method, request_url,"
            + " business_object, action, result_status, result_code, request_digest, duration_ms)"
            + " values (nextval('" + YudaoBypassAudit.TABLE + "_seq'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    private final JdbcTemplate jdbcTemplate;
    private final ThreadPoolExecutor executor;
    private final AtomicBoolean warned = new AtomicBoolean();

    public YudaoBypassAuditWriter(javax.sql.DataSource dataSource) {
        // 按 `YudaoCallerDirectory` 的做法从 DataSource 构建 —— 宿主不保留 `JdbcTemplate` bean，而这一行
        // 不属于任何实体。
        // Built from the DataSource, as `YudaoCallerDirectory` does — the host does not keep a
        // `JdbcTemplate` bean, and this row belongs to no entity.
        this.jdbcTemplate = new JdbcTemplate(dataSource);
        this.executor = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(QUEUE_CAPACITY),
                (task) -> {
                    Thread thread = new Thread(task, "keelbase-bypass-audit");
                    thread.setDaemon(true);
                    return thread;
                },
                (task, pool) -> log.warn("[bypassAudit][queue is full; dropping one record; requests are unaffected]"));
    }

    @Override
    public void record(YudaoBypassAudit.BypassAuditRecord record) {
        try {
            executor.execute(() -> insert(record));
        } catch (Throwable rejected) {
            log.warn("[bypassAudit][could not schedule a record; the request is unaffected]", rejected);
        }
    }

    private void insert(YudaoBypassAudit.BypassAuditRecord record) {
        try {
            jdbcTemplate.update(INSERT,
                    record.tenantId(),
                    record.traceId(),
                    record.userId(),
                    record.userType(),
                    record.requestMethod(),
                    record.requestUrl(),
                    record.businessObject(),
                    record.action(),
                    record.resultStatus(),
                    record.resultCode(),
                    record.requestDigest(),
                    record.durationMs());
        } catch (Throwable failed) {
            if (warned.compareAndSet(false, true)) {
                log.warn("[bypassAudit][insert into {} failed; bypass rows are being lost until this is fixed]",
                        YudaoBypassAudit.TABLE, failed);
            } else {
                log.debug("[bypassAudit][insert failed again]", failed);
            }
        }
    }

    @Override
    public void close() {
        // Give the one worker a moment to drain what is already queued; a ledger that loses its last rows on
        // every shutdown is not much of a ledger. The wait is bounded so shutdown is not held by a dead DB.
        // 给这条唯一的线程一点时间排空已经排队的行 —— 每次停机都丢掉最后几行的台账算不上台账。等待有上限，
        // 故一个连不上的库不会拖住停机。
        executor.shutdown();
        try {
            if (!executor.awaitTermination(2, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException interrupted) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
